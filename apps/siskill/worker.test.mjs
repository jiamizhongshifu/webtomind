import { test } from 'vitest';
import assert from 'node:assert/strict';
import worker, { route, metadata } from './worker.mjs';
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

test('commerce namespace reaches the real handler and fails closed without configuration', async () => {
  const env = {
    ASSETS: {
      fetch() {
        throw Error('API must not fall through to assets');
      }
    }
  };
  const status = await worker.fetch(
    new Request('https://siskill.dev/api/siskill/status'),
    env
  );
  assert.equal(status.status, 200);
  assert.deepEqual(await status.json(), {
    product: 'siskill',
    checkoutOpen: false,
    membershipOpen: false
  });
  assert.equal(status.headers.get('Cache-Control'), 'no-store');
  for (const [path, method] of [
    ['checkout', 'POST'],
    ['stripe-webhook', 'POST'],
    ['me', 'GET']
  ]) {
    const response = await worker.fetch(
      new Request(`https://siskill.dev/api/siskill/${path}`, { method }),
      env
    );
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      error: 'COMMERCE_NOT_CONFIGURED'
    });
  }
});
test('API credentials are not redirected across origins', async () => {
  assert.equal(
    (
      await worker.fetch(
        new Request('https://www.siskill.dev/api/siskill/checkout', {
          method: 'POST'
        }),
        {}
      )
    ).status,
    403
  );
});

test('account is a valid private route and is omitted from the public sitemap', async () => {
  assert.equal(
    route('https://siskill.dev/en-US/account?order=spoofed').status,
    200
  );
  assert.equal(
    metadata(route('https://siskill.dev/en-US/account')).title,
    'Your library | SiSkill'
  );
  const map = await (
    await worker.fetch(new Request('https://siskill.dev/sitemap.xml'), {})
  ).text();
  assert.ok(!map.includes('/account'));
});
