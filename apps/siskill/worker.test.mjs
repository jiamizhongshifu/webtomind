import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
// Node's JSON import attributes differ from Wrangler's bundler; load worker with an inline catalog.
const source = readFileSync(
  new URL('./worker.mjs', import.meta.url),
  'utf8'
).replace(
  "import catalog from './catalog.json';",
  `const catalog=${readFileSync(new URL('./catalog.json', import.meta.url), 'utf8')};`
);
const {
  route,
  metadata,
  default: worker
} = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
);
test('new brand preserves acquisition parameters across root, locale and www redirects', () => {
  assert.equal(
    route('https://siskill.dev/?utm_source=webtomind').redirect,
    'https://siskill.dev/en-US/overview?utm_source=webtomind'
  );
  assert.equal(
    route('https://siskill.dev/zh-CN?ref=partner').redirect,
    'https://siskill.dev/zh-CN/overview?ref=partner'
  );
  assert.equal(
    route('https://www.siskill.dev/skills?tier=free').redirect,
    'https://siskill.dev/skills?tier=free'
  );
  assert.equal(
    route('https://siskill.dev/skills?tier=free').redirect,
    'https://siskill.dev/en-US/skills?tier=free'
  );
});
test('only catalogued products resolve; details get their own canonical and translated metadata', () => {
  const page = route(
    'https://siskill.dev/zh-CN/skills/case-study-deck?utm_source=test'
  );
  assert.equal(page.status, 200);
  assert.match(metadata(page).title, /SiSkill$/);
  assert.equal(
    metadata(page).canonical,
    'https://siskill.dev/zh-CN/skills/case-study-deck'
  );
  for (const p of [
    '/en-US/skills/missing',
    '/en-US/skills/case-study-deck/extra',
    '/admin',
    '/api/checkout'
  ])
    assert.equal(route('https://siskill.dev' + p).status, 404);
});
test('preview site never accepts checkout writes or proxies APIs to WebToMind', async () => {
  const env = {
    ASSETS: {
      fetch: () => {
        throw Error('Unexpected assets access');
      }
    }
  };
  assert.equal(
    (
      await worker.fetch(
        new Request('https://siskill.dev/api/checkout', { method: 'POST' }),
        env
      )
    ).status,
    405
  );
  assert.equal(
    (await worker.fetch(new Request('https://siskill.dev/api/checkout'), env))
      .status,
    404
  );
});
test('sitemap owns the new domain and robots advertises it', async () => {
  const map = await (
    await worker.fetch(new Request('https://siskill.dev/sitemap.xml'), {})
  ).text();
  assert.equal((map.match(/<loc>/g) || []).length, 26);
  assert.ok(!map.includes('webtomind.com'));
  assert.match(
    await (
      await worker.fetch(new Request('https://siskill.dev/robots.txt'), {})
    ).text(),
    /Sitemap: https:\/\/siskill.dev\/sitemap.xml/
  );
});
