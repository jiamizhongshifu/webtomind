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
assert.equal(catalog.length, 12);
assert.equal(new Set(catalog.map((s) => s.slug)).size, catalog.length);
const releases = JSON.parse(
  readFileSync(new URL('./free-releases.json', import.meta.url))
);
assert.equal(new Set(releases.map((r) => r.slug)).size, releases.length);
for (const r of releases) {
  assert.ok(catalog.some((s) => s.slug === r.slug && s.tier === 'free'));
  assert.match(r.sha256, /^[a-f0-9]{64}$/);
  assert.ok(r.bytes > 0 && r.bytes <= 8 * 1024 * 1024);
  assert.equal(r.objectKey, `free/${r.slug}/${r.version}/${r.sha256}.tar.gz`);
}
const paid = JSON.parse(
  readFileSync(new URL('./paid-releases.json', import.meta.url))
);
for (const p of paid) {
  assert.ok(catalog.some((s) => s.slug === p.slug && s.tier === 'premium'));
  assert.match(p.sha256, /^[a-f0-9]{64}$/);
  assert.ok(p.bytes > 0 && p.bytes <= 32 * 1024 * 1024);
}
for (const s of catalog) {
  const release = [...releases, ...paid].find((r) => r.slug === s.slug);
  assert.equal(s.availability, release ? 'available' : 'coming-soon');
  if (release) {
    assert.equal(
      s.tier,
      releases.some((r) => r.slug === s.slug) ? 'free' : 'premium'
    );
    assert.equal(s.latestVersion, release.version);
  }
  for (const url of [s.coverUrl, s.previewVideoUrl])
    assert.ok(statSync(resolve(root, '.' + url)).size > 0);
}
console.log(
  `SiSkill public build checked: ${files.length} files, ${catalog.length} preview products, no private archives.`
);
