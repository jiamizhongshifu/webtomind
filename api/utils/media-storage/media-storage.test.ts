// @vitest-environment node
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  buildMediaObjectUpsertPayload,
  buildClientMediaUrls,
  createMediaStorageAdapter,
  createMediaStorageAdapters,
  getVariantLocators,
  getVariantRecord,
  safeUpsertMediaObjectRecords,
  signMediaVariant,
  upsertMediaObjectRecords,
  type MediaStorageAdapter
} from './index.js';
import { createSupabaseMediaStorageAdapter } from './supabase-storage.js';
import { createR2S3MediaStorageAdapter } from './r2-s3-storage.js';
import { createR2BindingMediaStorageAdapter } from './r2-binding-storage.js';

const MEDIA_ENV_KEYS = [
  'MEDIA_STORAGE_PROVIDER',
  'MEDIA_R2_BUCKET',
  'R2_BUCKET_NAME',
  'MEDIA_BUCKET_NAME',
  'R2_ACCESS_KEY_ID',
  'MEDIA_R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'MEDIA_R2_SECRET_ACCESS_KEY',
  'R2_S3_ENDPOINT',
  'MEDIA_R2_ENDPOINT',
  'CLOUDFLARE_ACCOUNT_ID',
  'MEDIA_PUBLIC_BASE_URL'
] as const;

function clearMediaEnv() {
  for (const key of MEDIA_ENV_KEYS) {
    delete process.env[key];
  }
}

function createSupabaseMock() {
  const removeCalls: Array<{ bucket: string; paths: string[] }> = [];
  const downloadCalls: Array<{ bucket: string; key: string }> = [];
  const buckets = new Map<string, unknown>();
  const from = vi.fn((bucket: string) => {
    if (!buckets.has(bucket)) {
      buckets.set(bucket, {
        upload: vi.fn(async () => ({ error: null })),
        createSignedUrl: vi.fn(async (key: string, expiresIn: number) => ({
          data: { signedUrl: `signed://${bucket}/${key}?expires=${expiresIn}` },
          error: null
        })),
        remove: vi.fn(async (paths: string[]) => {
          removeCalls.push({ bucket, paths });
          return { error: null };
        }),
        download: vi.fn(async (key: string) => {
          downloadCalls.push({ bucket, key });
          return {
            data: new Blob([`body:${bucket}/${key}`]),
            error: null
          };
        })
      });
    }
    return buckets.get(bucket);
  });

  return {
    supabase: { storage: { from } },
    removeCalls,
    downloadCalls
  };
}

describe('media storage metadata parsing', () => {
  it('reads legacy Supabase metadata for original and derived variants', () => {
    const metadata = {
      storageBucket: 'user-generated-images',
      storagePath: 'user-1/original.png',
      thumbnailStoragePath: 'user-1/thumb.webp',
      previewStoragePath: 'user-1/preview.webp',
      width: 1024,
      height: 1536,
      byteSize: 42
    };

    expect(getVariantRecord(metadata, 'original')).toEqual({
      provider: 'supabase',
      bucket: 'user-generated-images',
      key: 'user-1/original.png',
      width: 1024,
      height: 1536,
      byteSize: 42
    });
    expect(getVariantRecord(metadata, 'thumbnail')).toEqual({
      provider: 'supabase',
      bucket: 'user-generated-images',
      key: 'user-1/thumb.webp'
    });
    expect(getVariantRecord(metadata, 'preview')).toEqual({
      provider: 'supabase',
      bucket: 'user-generated-images',
      key: 'user-1/preview.webp'
    });
  });

  it('prefers new metadata.media records over legacy storage fields', () => {
    const metadata = {
      storageBucket: 'legacy-bucket',
      storagePath: 'legacy/original.png',
      media: {
        original: {
          provider: 'r2',
          bucket: 'r2-images',
          key: 'new/original.png',
          publicUrl: 'https://cdn.example.com/new/original.png'
        },
        thumbnail: {
          provider: 'supabase',
          bucket: 'thumbs',
          key: 'new/thumb.webp'
        }
      }
    };

    expect(getVariantRecord(metadata, 'original')).toMatchObject({
      provider: 'r2',
      bucket: 'r2-images',
      key: 'new/original.png'
    });
    expect(getVariantRecord(metadata, 'thumbnail')).toEqual({
      provider: 'supabase',
      bucket: 'thumbs',
      key: 'new/thumb.webp'
    });
  });

  it('supports legacy R2 bucket and key metadata', () => {
    const metadata = {
      r2Bucket: 'r2-images',
      r2Key: 'legacy-r2/original.png',
      width: 800,
      height: 600
    };

    expect(getVariantRecord(metadata, 'original')).toEqual({
      provider: 'r2',
      bucket: 'r2-images',
      key: 'legacy-r2/original.png',
      width: 800,
      height: 600,
      byteSize: undefined
    });
    expect(getVariantLocators(metadata)).toEqual([
      { provider: 'r2', bucket: 'r2-images', key: 'legacy-r2/original.png' }
    ]);
  });
});

describe('media storage provider selection and URL fallback', () => {
  beforeEach(() => {
    clearMediaEnv();
  });

  afterEach(() => {
    clearMediaEnv();
    vi.unstubAllGlobals();
  });

  it('falls back to Supabase when R2 is preferred but config is missing', () => {
    process.env.MEDIA_STORAGE_PROVIDER = 'r2';
    const { supabase } = createSupabaseMock();

    const selected = createMediaStorageAdapter({
      supabase: supabase as never,
      defaultBucket: 'fallback-bucket'
    });
    const adapters = createMediaStorageAdapters({
      supabase: supabase as never,
      defaultBucket: 'fallback-bucket'
    });

    expect(selected.provider).toBe('supabase');
    expect(adapters.supabase?.provider).toBe('supabase');
    expect(adapters.r2).toBeNull();
  });

  it('keeps fallback candidates when signing returns null', async () => {
    const adapter: MediaStorageAdapter = {
      provider: 'r2',
      putObject: vi.fn(),
      signReadUrl: vi.fn(async () => null),
      deleteObjects: vi.fn(),
      downloadObject: vi.fn()
    } as unknown as MediaStorageAdapter;
    const metadata = {
      media: {
        original: {
          provider: 'r2',
          bucket: 'r2-images',
          key: 'image.png',
          publicUrl: 'https://cdn.example.com/image.png'
        }
      }
    };

    await expect(
      signMediaVariant(
        { supabase: null, r2: adapter },
        metadata,
        'original',
        3600,
        'https://legacy.example.com/image.png'
      )
    ).resolves.toBe('https://legacy.example.com/image.png');
  });

  it('uses record publicUrl when no adapter can sign the variant', async () => {
    const metadata = {
      media: {
        original: {
          provider: 'r2',
          bucket: 'r2-images',
          key: 'image.png',
          publicUrl: 'https://cdn.example.com/image.png'
        }
      }
    };

    await expect(
      buildClientMediaUrls(
        { supabase: null, r2: null },
        metadata,
        3600
      )
    ).resolves.toMatchObject({
      imageUrl: 'https://cdn.example.com/image.png',
      videoUrl: 'https://cdn.example.com/image.png',
      imageUrlExpiresIn: 3600,
      videoUrlExpiresIn: 3600
    });
  });
});

describe('media storage adapter provider boundaries', () => {
  it('groups Supabase deletes by bucket and ignores non-Supabase locators', async () => {
    const { supabase, removeCalls } = createSupabaseMock();
    const adapter = createSupabaseMediaStorageAdapter(
      supabase as never,
      'default-bucket'
    );

    await adapter.deleteObjects([
      { provider: 'supabase', bucket: 'a', key: 'one.png' },
      { provider: 'r2', bucket: 'r2', key: 'ignored.png' },
      { provider: 'supabase', bucket: 'a', key: 'two.png' },
      { provider: 'supabase', bucket: 'b', key: 'three.png' }
    ]);

    expect(removeCalls).toEqual([
      { bucket: 'a', paths: ['one.png', 'two.png'] },
      { bucket: 'b', paths: ['three.png'] }
    ]);
  });

  it('downloads Supabase objects and ignores other providers', async () => {
    const { supabase, downloadCalls } = createSupabaseMock();
    const adapter = createSupabaseMediaStorageAdapter(
      supabase as never,
      'default-bucket'
    );

    await expect(
      adapter.downloadObject({ provider: 'r2', bucket: 'a', key: 'one.png' })
    ).resolves.toBeNull();

    const body = await adapter.downloadObject({
      provider: 'supabase',
      bucket: 'a',
      key: 'one.png'
    });

    expect(new TextDecoder().decode(body || new ArrayBuffer(0))).toBe(
      'body:a/one.png'
    );
    expect(downloadCalls).toEqual([{ bucket: 'a', key: 'one.png' }]);
  });

  it('treats R2 delete 404 and download misses as non-fatal', async () => {
    process.env.MEDIA_R2_BUCKET = 'r2-images';
    process.env.MEDIA_R2_ACCESS_KEY_ID = 'access-key';
    process.env.MEDIA_R2_SECRET_ACCESS_KEY = 'secret-key';
    process.env.MEDIA_R2_ENDPOINT = 'https://account.r2.cloudflarestorage.com';
    const fetchMock = vi.fn(async () => new Response(null, { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);

    const adapter = createR2S3MediaStorageAdapter();
    expect(adapter?.provider).toBe('r2');

    await expect(
      adapter?.deleteObjects([
        { provider: 'supabase', bucket: 'ignored', key: 'ignored.png' },
        { provider: 'r2', bucket: 'r2-images', key: 'missing.png' }
      ])
    ).resolves.toBeUndefined();
    await expect(
      adapter?.downloadObject({
        provider: 'r2',
        bucket: 'r2-images',
        key: 'missing.png'
      })
    ).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('prefers the Worker R2 binding while keeping S3 URL signing as fallback', async () => {
    const put = vi.fn(async () => ({
      httpEtag: '"etag-1"',
      size: 4,
      arrayBuffer: async () => new ArrayBuffer(0)
    }));
    const get = vi.fn(async () => ({
      arrayBuffer: async () => new TextEncoder().encode('body').buffer
    }));
    const remove = vi.fn(async () => undefined);
    const signer: MediaStorageAdapter = {
      provider: 'r2',
      putObject: vi.fn(),
      signReadUrl: vi.fn(async () => 'signed://fallback'),
      deleteObjects: vi.fn(),
      downloadObject: vi.fn()
    } as unknown as MediaStorageAdapter;

    const adapter = createR2BindingMediaStorageAdapter({
      bucket: { put, get, delete: remove },
      defaultBucket: 'webtomind-media-prod',
      publicBaseUrl: '',
      signReadUrlFallback: signer
    });

    await expect(
      adapter?.putObject({
        key: 'user/image.png',
        body: new Uint8Array([1, 2, 3, 4]),
        contentType: 'image/png'
      })
    ).resolves.toMatchObject({
      provider: 'r2',
      bucket: 'webtomind-media-prod',
      key: 'user/image.png',
      etag: '"etag-1"',
      byteSize: 4
    });
    await expect(
      adapter?.signReadUrl({
        locator: {
          provider: 'r2',
          bucket: 'webtomind-media-prod',
          key: 'user/image.png'
        },
        expiresIn: 600
      })
    ).resolves.toBe('signed://fallback');
    await expect(
      adapter?.downloadObject({
        provider: 'r2',
        bucket: 'webtomind-media-prod',
        key: 'user/image.png'
      })
    ).resolves.toBeInstanceOf(ArrayBuffer);
    await expect(
      adapter?.deleteObjects([
        {
          provider: 'r2',
          bucket: 'webtomind-media-prod',
          key: 'user/image.png'
        }
      ])
    ).resolves.toBeUndefined();

    expect(put).toHaveBeenCalledWith(
      'user/image.png',
      expect.any(Uint8Array),
      {
        httpMetadata: {
          cacheControl: '31536000',
          contentType: 'image/png'
        }
      }
    );
    expect(signer.signReadUrl).toHaveBeenCalledOnce();
    expect(get).toHaveBeenCalledWith('user/image.png');
    expect(remove).toHaveBeenCalledWith('user/image.png');
  });
});

describe('media object registry', () => {
  function createRegistrySupabaseMock(options: { upsertError?: Error } = {}) {
    const upsert = vi.fn(async () => ({
      error: options.upsertError
        ? { message: options.upsertError.message }
        : null
    }));
    const from = vi.fn(() => ({ upsert }));
    return {
      supabase: { from },
      from,
      upsert
    };
  }

  const registryInput = {
    userId: '00000000-0000-0000-0000-000000000001',
    ownerType: 'image_generation',
    ownerId: '00000000-0000-0000-0000-000000000002',
    kind: 'original' as const,
    record: {
      provider: 'supabase' as const,
      bucket: 'user-generated-images',
      key: 'user/month/image.png',
      contentType: 'image/png',
      byteSize: 12345,
      width: 1024,
      height: 1536,
      duration: undefined,
      etag: 'etag-1',
      checksumSha256: 'sha-1'
    },
    metadata: {
      source: 'image_create_page',
      variant: 'original'
    }
  };

  it('builds the media_objects upsert payload with database column names', () => {
    expect(buildMediaObjectUpsertPayload(registryInput)).toEqual(
      expect.objectContaining({
        user_id: registryInput.userId,
        owner_type: 'image_generation',
        owner_id: registryInput.ownerId,
        kind: 'original',
        provider: 'supabase',
        bucket: 'user-generated-images',
        object_key: 'user/month/image.png',
        content_type: 'image/png',
        byte_size: 12345,
        width: 1024,
        height: 1536,
        duration: null,
        checksum_sha256: 'sha-1',
        etag: 'etag-1',
        status: 'ready',
        metadata: {
          source: 'image_create_page',
          variant: 'original'
        },
        updated_at: expect.any(String)
      })
    );
  });

  it('upserts media_objects by provider bucket and object key', async () => {
    const { supabase, from, upsert } = createRegistrySupabaseMock();

    await upsertMediaObjectRecords(supabase as never, [registryInput]);

    expect(from).toHaveBeenCalledWith('media_objects');
    expect(upsert).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          provider: 'supabase',
          bucket: 'user-generated-images',
          object_key: 'user/month/image.png'
        })
      ],
      { onConflict: 'provider,bucket,object_key' }
    );
  });

  it('keeps registry write failures non-blocking when using the safe helper', async () => {
    const { supabase } = createRegistrySupabaseMock({
      upsertError: new Error('registry unavailable')
    });
    const warn = vi.fn();

    await expect(
      safeUpsertMediaObjectRecords(supabase as never, [registryInput], {
        logger: { warn }
      })
    ).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledWith(
      '[MediaStorage] media_objects upsert failed',
      expect.any(Error)
    );
  });
});
