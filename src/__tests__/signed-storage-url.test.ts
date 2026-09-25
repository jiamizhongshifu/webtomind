import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  parseSupabaseSignedStorageUrl,
  refreshSupabaseSignedStorageUrl,
  refreshSupabaseSignedStorageUrls
} from '../../api/utils/signed-storage-url';
import type { SupabaseClient } from '@supabase/supabase-js';

describe('R2 imported media URL renewal', () => {
  afterEach(() => vi.unstubAllEnvs());
  const expired =
    'https://account.r2.cloudflarestorage.com/media/prompt-case-imports/a%20b.mp4?X-Amz-Date=20200101T000000Z&X-Amz-Expires=604800&X-Amz-Signature=old';
  function configure() {
    vi.stubEnv('R2_S3_ENDPOINT', 'https://account.r2.cloudflarestorage.com');
    vi.stubEnv('MEDIA_R2_BUCKET', 'media');
    vi.stubEnv('R2_ACCESS_KEY_ID', 'test-access');
    vi.stubEnv('R2_SECRET_ACCESS_KEY', 'test-secret');
  }
  it('renews expired video signatures in single and deduplicated batch reads', async () => {
    configure();
    const client = {} as SupabaseClient;
    const single = await refreshSupabaseSignedStorageUrl(client, expired);
    const batch = await refreshSupabaseSignedStorageUrls(client, [
      expired,
      expired
    ]);
    expect(single).not.toBe(expired);
    expect(new URL(single).pathname).toBe(
      '/media/prompt-case-imports/a%20b.mp4'
    );
    expect(new URL(single).searchParams.get('X-Amz-Signature')).toMatch(
      /^[a-f0-9]{64}$/
    );
    expect(batch[0]).not.toBe(expired);
    expect(batch[1]).toBe(batch[0]);
    expect(await refreshSupabaseSignedStorageUrl(client, single)).toBe(single);
  });
  it('never signs other origins or buckets', async () => {
    configure();
    for (const url of [
      expired.replace('account.', 'foreign.'),
      expired.replace('/media/', '/private/'),
      'https://video.twimg.com/example.mp4'
    ]) {
      expect(
        await refreshSupabaseSignedStorageUrl({} as SupabaseClient, url)
      ).toBe(url);
    }
  });
});

describe('signed storage URL helpers', () => {
  it('extracts bucket and object path from Supabase signed object URLs', () => {
    const parsed = parseSupabaseSignedStorageUrl(
      'https://example.supabase.co/storage/v1/object/sign/user-generated-images/user-1/202606/cover%20image.webp?token=abc'
    );

    expect(parsed).toEqual({
      bucket: 'user-generated-images',
      path: 'user-1/202606/cover image.webp'
    });
  });

  it('ignores public storage URLs', () => {
    expect(
      parseSupabaseSignedStorageUrl(
        'https://example.supabase.co/storage/v1/object/public/generated-images/prompt-case.webp'
      )
    ).toBeNull();
  });
});
