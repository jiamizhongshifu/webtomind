import assert from 'node:assert/strict';
import test from 'node:test';
import { assertWatermarksRuntimeEnv } from './lib/watermarks-runtime.mjs';

const key = 'production-key-123456789012345678901234567890';

test('accepts a valid production runtime configuration', () => {
  const result = assertWatermarksRuntimeEnv(
    {
      WATERMARKS_SERVICE_URL: 'https://marks.internal.example',
      WATERMARKS_SERVICE_API_KEY: key
    },
    { production: true }
  );
  assert.equal(result.url, 'https://marks.internal.example');
  assert.equal(result.apiKey, key);
  assert.equal(result.mode, 'http');
});

test('accepts a Cloudflare Container runtime without a public service URL', () => {
  const result = assertWatermarksRuntimeEnv(
    {
      WATERMARKS_SERVICE_MODE: 'container',
      WATERMARKS_SERVICE_API_KEY: key
    },
    { production: true }
  );
  assert.equal(result.mode, 'container');
  assert.equal(result.url, 'cloudflare-container://watermarks-remover');
  assert.equal(result.apiKey, key);
});

test('normalizes the service mode case consistently', () => {
  const result = assertWatermarksRuntimeEnv(
    {
      WATERMARKS_SERVICE_MODE: ' CONTAINER ',
      WATERMARKS_SERVICE_API_KEY: key
    },
    { production: true }
  );
  assert.equal(result.mode, 'container');
});

test('rejects missing, insecure, and local production configurations', () => {
  assert.throws(
    () => assertWatermarksRuntimeEnv({}, { production: true }),
    /requires WATERMARKS_SERVICE_URL/
  );
  assert.throws(
    () =>
      assertWatermarksRuntimeEnv(
        { WATERMARKS_SERVICE_MODE: 'container' },
        { production: true }
      ),
    /container runtime requires WATERMARKS_SERVICE_API_KEY/
  );
  assert.throws(
    () =>
      assertWatermarksRuntimeEnv(
        {
          WATERMARKS_SERVICE_URL: 'http://marks.internal',
          WATERMARKS_SERVICE_API_KEY: key
        },
        { production: true }
      ),
    /must use HTTPS/
  );
  assert.throws(
    () =>
      assertWatermarksRuntimeEnv(
        {
          WATERMARKS_SERVICE_URL: 'https://marks.internal',
          WATERMARKS_SERVICE_API_KEY: `local-${key}`
        },
        { production: true }
      ),
    /local watermarks API key/
  );
});
