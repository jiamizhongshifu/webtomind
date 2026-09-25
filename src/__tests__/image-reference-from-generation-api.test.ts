import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createImageReferenceFromGenerationHandler } from '../../api/image/references/from-generation';

const mockState = vi.hoisted(() => ({
  generation: null as Record<string, unknown> | null,
  insertedReference: null as Record<string, unknown> | null,
  uploadedBytes: null as Uint8Array | null,
  uploadedPath: '',
  sourceSignedUrlCalls: 0
}));

function corsHeaders() {
  return { 'Access-Control-Allow-Origin': '*' };
}

function createSupabaseMock() {
  return {
    from: vi.fn((table: string) => {
      if (table === 'image_generations') {
        const chain = {
          select: vi.fn(() => chain),
          eq: vi.fn(() => chain),
          maybeSingle: vi.fn(async () => ({
            data: mockState.generation,
            error: null
          }))
        };
        return chain;
      }

      const chain = {
        insert: vi.fn((payload: Record<string, unknown>) => {
          mockState.insertedReference = payload;
          return chain;
        }),
        select: vi.fn(() => chain),
        single: vi.fn(async () => ({
          data: {
            id: 'reference-1',
            role: mockState.insertedReference?.role || 'style',
            label: mockState.insertedReference?.label || null,
            description: mockState.insertedReference?.description || null,
            storage_bucket:
              mockState.insertedReference?.storage_bucket ||
              'user-generated-images',
            storage_path: mockState.insertedReference?.storage_path || '',
            mime_type: mockState.insertedReference?.mime_type || 'image/png',
            file_size_bytes:
              mockState.insertedReference?.file_size_bytes || null,
            width: mockState.insertedReference?.width || null,
            height: mockState.insertedReference?.height || null,
            created_at: '2026-07-25T00:00:00.000Z'
          },
          error: null
        }))
      };
      return chain;
    }),
    storage: {
      from: vi.fn((bucket: string) => ({
        upload: vi.fn(
          async (
            path: string,
            bytes: Uint8Array,
            _options: Record<string, unknown>
          ) => {
            mockState.uploadedPath = path;
            mockState.uploadedBytes = bytes;
            return { error: null };
          }
        ),
        createSignedUrl: vi.fn(async (path: string) => {
          if (!path.startsWith('image-references/')) {
            mockState.sourceSignedUrlCalls += 1;
          }
          return {
            data: { signedUrl: `https://signed.test/${bucket}/${path}` },
            error: null
          };
        }),
        remove: vi.fn(async () => ({ error: null })),
        download: vi.fn(async () => ({ data: null, error: null }))
      }))
    }
  };
}

describe('image reference import from generation', () => {
  beforeEach(() => {
    mockState.generation = null;
    mockState.insertedReference = null;
    mockState.uploadedBytes = null;
    mockState.uploadedPath = '';
    mockState.sourceSignedUrlCalls = 0;
    process.env.SUPABASE_URL = 'https://supabase.test';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role';
    delete process.env.IMAGE_REFERENCE_BUCKET;
    delete process.env.GENERATED_IMAGE_BUCKET;
  });

  afterEach(() => {
    delete (
      globalThis as typeof globalThis & {
        __WEBTOMIND_MEDIA_BUCKET?: unknown;
      }
    ).__WEBTOMIND_MEDIA_BUCKET;
    vi.unstubAllGlobals();
  });

  it('reads R2-backed history directly instead of signing it as Supabase storage', async () => {
    const sourceBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const getObject = vi.fn(async (key: string) =>
      key === 'user-1/202607/source.png'
        ? { arrayBuffer: async () => sourceBytes.buffer }
        : null
    );
    (
      globalThis as typeof globalThis & {
        __WEBTOMIND_MEDIA_BUCKET?: unknown;
      }
    ).__WEBTOMIND_MEDIA_BUCKET = {
      get: getObject,
      put: vi.fn(),
      delete: vi.fn()
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('stale image_url must not be fetched');
      })
    );
    mockState.generation = {
      id: 'generation-r2',
      prompt: 'R2 历史图片',
      image_url: 'https://expired.test/source.png',
      metadata: {
        storageProvider: 'r2',
        storageBucket: 'webtomind-media-prod',
        storagePath: 'user-1/202607/source.png',
        outputFormat: 'png',
        width: 1024,
        height: 1536,
        media: {
          original: {
            provider: 'r2',
            bucket: 'webtomind-media-prod',
            key: 'user-1/202607/source.png',
            contentType: 'image/png'
          }
        }
      },
      created_at: '2026-07-24T17:40:43.370Z'
    };
    const handler = createImageReferenceFromGenerationHandler({
      getCorsHeadersForRequest: corsHeaders,
      getUserIdFromRequest: async () => 'user-1',
      createSupabaseClient: () => createSupabaseMock() as never
    });

    const response = await handler(
      new Request(
        'https://webtomind.test/api/image/references/from-generation',
        {
          method: 'POST',
          body: JSON.stringify({
            generationId: 'generation-r2',
            role: 'style',
            label: '图库参考图'
          })
        }
      )
    );
    const body = (await response.json()) as {
      reference?: { id?: string; thumbnailUrl?: string };
    };

    expect(response.status).toBe(200);
    expect(body.reference?.id).toBe('reference-1');
    expect(body.reference?.thumbnailUrl).toContain(
      'user-generated-images/image-references/'
    );
    expect(getObject).toHaveBeenCalledWith('user-1/202607/source.png');
    expect(mockState.sourceSignedUrlCalls).toBe(0);
    expect(mockState.uploadedBytes).toEqual(sourceBytes);
    expect(mockState.uploadedPath).toMatch(
      /^image-references\/user-1\/\d{6}\/from-history-.*\.png$/
    );
    expect(mockState.insertedReference).toMatchObject({
      user_id: 'user-1',
      storage_bucket: 'user-generated-images',
      mime_type: 'image/png',
      file_size_bytes: sourceBytes.byteLength,
      width: 1024,
      height: 1536,
      role: 'style',
      metadata: {
        source: 'generation_history',
        sourceGenerationId: 'generation-r2'
      }
    });
  });
});
