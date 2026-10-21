import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, relative, extname } from 'node:path';
import assert from 'node:assert/strict';
const root = resolve(import.meta.dirname, 'dist');
const walk = (p) =>
  readdirSync(p).flatMap((n) => {
    const f = resolve(p, n);
    return statSync(f).isDirectory() ? walk(f) : [f];
  });
const files = walk(root);
for (const f of files) {
  assert.ok(
    !/\.(zip|gz|tar|map|env|pem|key)$/i.test(f),
    `Private/source artifact: ${relative(root, f)}`
  );
  if (['.js', '.css', '.html', '.json', '.svg'].includes(extname(f))) {
    const text = readFileSync(f, 'utf8');
    assert.ok(
      !/\/Users\/|\/home\/|sk_live_[A-Za-z0-9]|sb_secret_[A-Za-z0-9]|SUPABASE_SERVICE_ROLE_KEY|BEGIN (?:RSA |OPENSSH )?PRIVATE KEY/.test(
        text
      ),
      `Sensitive pattern: ${relative(root, f)}`
    );
  }
}
const catalog = JSON.parse(
  readFileSync(new URL('./catalog.json', import.meta.url))
);
assert.equal(catalog.length, 10);
for (const s of catalog) {
  assert.equal(s.availability, 'coming-soon');
  for (const url of [s.coverUrl, s.previewVideoUrl])
    assert.ok(statSync(resolve(root, '.' + url)).size > 0);
}
console.log(
  `SiSkill public build checked: ${files.length} files, ${catalog.length} preview products, no private archives.`
);
