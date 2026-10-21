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

// Test the byte-integrity boundary, not just the happy-path response shape.
import { freeDownload as authenticatedFreeDownload } from './server/free-download.ts';
import { createHash } from 'node:crypto';
const freeDownload = (request, env, releases) =>
  authenticatedFreeDownload(
    request,
    env,
    releases,
    async (token) => token === 'verified-test-user'
  );
const sample = new TextEncoder().encode('reviewed archive fixture');
const release = {
  slug: 'sample',
  version: '1.0.0',
  bytes: sample.length,
  sha256: createHash('sha256').update(sample).digest('hex'),
  objectKey: 'free/sample/1.0.0/archive.tar.gz',
  license: 'fixture'
};
const request = (path = '/sample/1.0.0', method = 'GET') =>
  new Request('https://siskill.dev/api/siskill/free' + path, {
    method,
    headers: { Authorization: 'Bearer verified-test-user' }
  });
const bucket = (bytes = sample) => ({
  SISKILL_FREE_PACKAGES: {
    get: async () => ({
      size: bytes.length,
      arrayBuffer: async () => bytes.buffer
    })
  }
});
test('free download requires an exact reviewed release and never looks up arbitrary or paid keys', async () => {
  const forbidden = {
    SISKILL_FREE_PACKAGES: {
      get() {
        throw Error('Unexpected storage access');
      }
    }
  };
  for (const path of ['/paid/1.0.0', '/sample/latest', '/sample/1.0.0/extra'])
    assert.equal(
      (await freeDownload(request(path), forbidden, [release])).status,
      404
    );
  assert.equal(
    (await freeDownload(request('/sample/1.0.0', 'POST'), bucket(), [release]))
      .status,
    405
  );
  assert.equal((await freeDownload(request(), {}, [release])).status, 503);
});
test('free downloads verify actual bytes and fail closed for same-size corruption or storage errors', async () => {
  const response = await freeDownload(request(), bucket(), [release]);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('X-Content-SHA256'), release.sha256);
  assert.equal(await response.text(), 'reviewed archive fixture');
  const tampered = new Uint8Array(sample);
  tampered[0] ^= 1;
  assert.equal(
    (await freeDownload(request(), bucket(tampered), [release])).status,
    503
  );
  assert.equal(
    (await freeDownload(request(), bucket(new Uint8Array(1)), [release]))
      .status,
    503
  );
  assert.equal(
    (
      await freeDownload(
        request(),
        { SISKILL_FREE_PACKAGES: { get: async () => null } },
        [release]
      )
    ).status,
    503
  );
  assert.equal(
    (
      await freeDownload(
        request(),
        {
          SISKILL_FREE_PACKAGES: {
            get: async () => {
              throw Error('offline');
            }
          }
        },
        [release]
      )
    ).status,
    503
  );
  const head = await freeDownload(request('/sample/1.0.0', 'HEAD'), bucket(), [
    release
  ]);
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
});

test('all free downloads, including HEAD, reject missing and invalid auth before storage', async () => {
  const env = {
    SISKILL_FREE_PACKAGES: {
      get() {
        throw Error('Unauthorized storage read');
      }
    }
  };
  for (const method of ['GET', 'HEAD']) {
    const anonymous = new Request(
      'https://siskill.dev/api/siskill/free/sample/1.0.0',
      { method }
    );
    assert.equal((await freeDownload(anonymous, env, [release])).status, 401);
    const invalid = new Request(anonymous, {
      headers: { Authorization: 'Bearer invalid' }
    });
    assert.equal((await freeDownload(invalid, env, [release])).status, 401);
  }
  const valid = await freeDownload(request(), bucket(), [release]);
  assert.equal(valid.headers.get('Cache-Control'), 'private, no-store');
  assert.equal(valid.headers.get('Vary'), 'Authorization');
});
