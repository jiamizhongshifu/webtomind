import { describe, expect, it } from 'vitest';
const { configureLocalMediaStorageEnv } = await import(
  // @ts-expect-error The local Worker helper is an executable JavaScript module.
  '../../scripts/lib/local-worker-env.mjs'
);

describe('local Worker media storage environment', () => {
  it('uses Supabase when local R2 cannot produce a readable URL', () => {
    const env: Record<string, string> = {};

    expect(configureLocalMediaStorageEnv(env)).toEqual({
      provider: 'supabase',
      source: 'local-signed-url-fallback'
    });
    expect(env.MEDIA_STORAGE_PROVIDER).toBe('supabase');
  });

  it('keeps an explicit provider and permits fully signed R2 config', () => {
    const explicitEnv = { MEDIA_STORAGE_PROVIDER: 'r2' };
    expect(configureLocalMediaStorageEnv(explicitEnv)).toEqual({
      provider: 'r2',
      source: 'explicit'
    });

    const r2Env: Record<string, string> = {
      R2_S3_ENDPOINT: 'https://example.r2.cloudflarestorage.com',
      R2_ACCESS_KEY_ID: 'access',
      R2_SECRET_ACCESS_KEY: 'secret',
      MEDIA_R2_BUCKET: 'media'
    };
    expect(configureLocalMediaStorageEnv(r2Env)).toEqual({
      provider: 'dual',
      source: 'r2-config'
    });
  });
});
