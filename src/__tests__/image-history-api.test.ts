import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createImageHistoryHandler } from '../../api/image/history';

const mockState = vi.hoisted(() => ({
  userId: 'user-1' as string | null,
  rows: [] as Array<Record<string, unknown>>,
  count: null as number | null,
  range: null as [number, number] | null,
  requestedIds: [] as string[],
  favoriteOnly: false
}));

async function readJson(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

function corsHeaders() {
  return { 'Access-Control-Allow-Origin': '*' };
}

function createSupabaseMock() {
  return {
    from: vi.fn(() => {
      let selectedId = '';
      let updatePayload: Record<string, unknown> | null = null;
      const chain = {
        select() {
          return chain;
        },
        eq(column: string, value: unknown) {
          if (column === 'id') selectedId = String(value);
          return chain;
        },
        filter(column: string, operator: string, value: string) {
          if (
            column === 'metadata->>isFavorite' &&
            operator === 'eq' &&
            value === 'true'
          ) {
            mockState.favoriteOnly = true;
          }
          return chain;
        },
        update(payload: Record<string, unknown>) {
          updatePayload = payload;
          return chain;
        },
        async maybeSingle() {
          return {
            data:
              mockState.rows.find((row) => String(row.id) === selectedId) ||
              null,
            error: null
          };
        },
        in(_column: string, ids: string[]) {
          mockState.requestedIds = ids;
          return chain;
        },
        order() {
          return chain;
        },
        range(from: number, to: number) {
          mockState.range = [from, to];
          return chain;
        },
        then(
          resolve: (value: {
            data: Array<Record<string, unknown>>;
            error: null;
            count: number;
          }) => void
        ) {
          if (updatePayload) {
            const row = mockState.rows.find(
              (candidate) => String(candidate.id) === selectedId
            );
            if (row) Object.assign(row, updatePayload);
            resolve({ data: [], error: null, count: 0 });
            return;
          }
          const matchingRows = mockState.favoriteOnly
            ? mockState.rows.filter(
                (row) =>
                  Boolean(row.metadata) &&
                  (row.metadata as { isFavorite?: boolean }).isFavorite === true
              )
            : mockState.rows;
          resolve({
            data:
              mockState.requestedIds.length > 0
                ? matchingRows.filter((row) =>
                    mockState.requestedIds.includes(String(row.id))
                  )
                : matchingRows,
            error: null,
            count: mockState.count ?? matchingRows.length
          });
        }
      };
      return chain;
    }),
    storage: {
      from: vi.fn(() => ({
        createSignedUrl: vi.fn(async (path: string) => ({
          data: { signedUrl: `https://signed.test/${path}` },
          error: null
        }))
      }))
    }
  };
}

describe('image history API metadata compatibility', () => {
  beforeEach(() => {
    mockState.userId = 'user-1';
    mockState.rows = [];
    mockState.count = null;
    mockState.range = null;
    mockState.requestedIds = [];
    mockState.favoriteOnly = false;
    process.env.SUPABASE_URL = 'https://supabase.test';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role';
    delete (
      globalThis as typeof globalThis & {
        __WEBTOMIND_MEDIA_BUCKET?: unknown;
      }
    ).__WEBTOMIND_MEDIA_BUCKET;
  });

  it('streams an owner-scoped R2 image when a stored signed URL has expired', async () => {
    const imageBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const getObject = vi.fn(async (key: string) =>
      key === 'user-1/generation-r2.png'
        ? { arrayBuffer: async () => imageBytes.buffer }
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
    mockState.rows = [
      {
        id: 'generation-r2',
        image_url: 'https://expired-r2.test/generation-r2.png',
        prompt: 'R2 历史图片',
        negative_prompt: null,
        model_label: 'GPT Image 2',
        provider: 'tuzi',
        provider_model: 'gpt-image-2',
        aspect_ratio: '1:1',
        quality: 'high',
        asset_ids: [],
        metadata: {
          storageProvider: 'r2',
          storageBucket: 'webtomind-media-prod',
          storagePath: 'user-1/generation-r2.png',
          outputFormat: 'png'
        },
        created_at: '2026-07-18T01:00:00.000Z'
      }
    ];
    const handler = createImageHistoryHandler({
      getCorsHeadersForRequest: corsHeaders,
      getUserIdFromRequest: async () => mockState.userId,
      createSupabaseClient: () => createSupabaseMock() as never
    });

    const response = await handler(
      new Request(
        'https://webtomind.test/api/image/history?id=generation-r2&content=original'
      )
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/png');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(imageBytes);
    expect(getObject).toHaveBeenCalledWith('user-1/generation-r2.png');
  });

  it('maps retention metadata and ignores malformed legacy metadata fields', async () => {
    mockState.rows = [
      {
        id: 'generation-1',
        image_url: 'https://cdn.test/generation-1.png',
        prompt: '生成一张角色海报',
        negative_prompt: null,
        model_label: 'GPT Image 2',
        provider: 'tuzi',
        provider_model: 'gpt-image-2',
        aspect_ratio: '2:3',
        quality: 'high',
        asset_ids: ['asset-1'],
        metadata: {
          storageBucket: 'user-generated-images',
          storagePath: 'user-1/generation-1.png',
          thumbnailStoragePath: 'user-1/generation-1-thumb.webp',
          previewStoragePath: 'user-1/generation-1-preview.webp',
          width: 1024,
          height: 1536,
          resultImageSize: '1024x1536',
          controlImageSize: '2048x3072',
          outputFormat: 'webp',
          referenceImageIds: ['ref-1', 'ref-2'],
          referenceMode: 'character_consistency',
          characterCardIds: ['card-1'],
          characterReferenceGroups: [
            {
              characterCardId: 'card-1',
              label: '角色 A',
              referenceImageIds: ['ref-1']
            }
          ],
          sourceGenerationId: 'source-generation',
          editInstruction: '保持角色不变，换背景',
          editMode: 'context_locked',
          appSlug: 'image-create',
          appOperation: 'retention-edit',
          sourceApp: 'webtomind',
          recipeAudit: {
            schemaVersion: 1,
            compilerVersion: 'portrait-recipe-2026-07-13',
            selectionSource: 'random_recipe',
            selectedAssetIds: ['asset-1'],
            profile: 'fashion-editorial',
            seed: 42
          },
          visualQualityAudit: {
            schemaVersion: 1,
            evaluatorVersion: 'image-recipe-visual-v1',
            overallScore: 88,
            summary: 'Internal QA only'
          }
        },
        created_at: '2026-06-18T08:00:00.000Z'
      },
      {
        id: 'generation-legacy',
        image_url: 'https://cdn.test/legacy.png',
        prompt: '旧记录',
        negative_prompt: '画质低，多余手指，手部变形，解剖错误，水印文字',
        model_label: null,
        provider: 'tuzi',
        provider_model: 'gpt-image-2',
        aspect_ratio: null,
        quality: null,
        asset_ids: null,
        metadata: {
          referenceImageIds: 'ref-legacy',
          characterCardIds: 'card-legacy',
          characterReferenceGroups: { bad: true },
          editMode: 'free_edit'
        },
        created_at: '2026-06-18T07:00:00.000Z'
      },
      {
        id: 'generation-user-negative',
        image_url: 'https://cdn.test/user-negative.png',
        prompt: '用户负向记录',
        negative_prompt: '低清晰度，坏手',
        model_label: null,
        provider: 'tuzi',
        provider_model: 'gpt-image-2',
        aspect_ratio: null,
        quality: null,
        asset_ids: null,
        metadata: {
          negativePromptSource: 'user'
        },
        created_at: '2026-06-18T06:00:00.000Z'
      }
    ];

    const handler = createImageHistoryHandler({
      getCorsHeadersForRequest: corsHeaders,
      getUserIdFromRequest: async () => mockState.userId,
      createSupabaseClient: () => createSupabaseMock() as never
    });

    const response = await handler(
      new Request('https://webtomind.test/api/image/history?limit=2&offset=3')
    );
    const body = await readJson(response);
    const items = body.items as Array<Record<string, unknown>>;

    expect(response.status).toBe(200);
    expect(mockState.range).toEqual([3, 4]);
    expect(items[0]).toMatchObject({
      id: 'generation-1',
      imageUrl: 'https://signed.test/user-1/generation-1.png',
      thumbnailUrl: 'https://signed.test/user-1/generation-1-thumb.webp',
      previewUrl: 'https://signed.test/user-1/generation-1-preview.webp',
      width: 1024,
      height: 1536,
      imageSize: '1024x1536',
      actualImageSize: '1024x1536',
      requestedImageSize: '2048x3072',
      referenceImageIds: ['ref-1', 'ref-2'],
      referenceMode: 'character_consistency',
      characterCardIds: ['card-1'],
      sourceGenerationId: 'source-generation',
      editInstruction: '保持角色不变，换背景',
      editMode: 'context_locked',
      appSlug: 'image-create',
      appOperation: 'retention-edit',
      sourceApp: 'webtomind',
      recipeAudit: {
        schemaVersion: 1,
        selectionSource: 'random_recipe',
        selectedAssetIds: ['asset-1'],
        seed: 42
      }
    });
    expect(items[0]).not.toHaveProperty('visualQualityAudit');
    expect(items[1]).toMatchObject({
      id: 'generation-legacy',
      assetIds: [],
      referenceImageIds: [],
      characterCardIds: [],
      characterReferenceGroups: []
    });
    expect(items[1].negativePrompt).toBeUndefined();
    expect(items[1].editMode).toBeUndefined();
    expect(items[2]).toMatchObject({
      id: 'generation-user-negative',
      negativePrompt: '低清晰度，坏手'
    });
  });

  it('loads owner-scoped batch history in request order and reports missing ids', async () => {
    mockState.rows = [
      {
        id: 'generation-1',
        image_url: 'https://cdn.test/generation-1.png',
        prompt: '第一张',
        negative_prompt: null,
        model_label: 'GPT Image 2',
        provider: 'tuzi',
        provider_model: 'gpt-image-2',
        aspect_ratio: '1:1',
        quality: 'high',
        asset_ids: [],
        metadata: null,
        created_at: '2026-07-17T01:00:00.000Z'
      },
      {
        id: 'generation-2',
        image_url: 'https://cdn.test/generation-2.png',
        prompt: '第二张',
        negative_prompt: null,
        model_label: 'Krea',
        provider: 'krea',
        provider_model: 'krea-2',
        aspect_ratio: '1:1',
        quality: 'medium',
        asset_ids: [],
        metadata: null,
        created_at: '2026-07-17T02:00:00.000Z'
      }
    ];
    const handler = createImageHistoryHandler({
      getCorsHeadersForRequest: corsHeaders,
      getUserIdFromRequest: async () => mockState.userId,
      createSupabaseClient: () => createSupabaseMock() as never
    });

    const response = await handler(
      new Request(
        'https://webtomind.test/api/image/history?ids=generation-2,missing,generation-1'
      )
    );
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(mockState.requestedIds).toEqual([
      'generation-2',
      'missing',
      'generation-1'
    ]);
    expect(
      (body.items as Array<Record<string, unknown>>).map((item) => item.id)
    ).toEqual(['generation-2', 'generation-1']);
    expect(body.missingIds).toEqual(['missing']);
  });

  it('rejects unauthenticated and oversized batch history requests', async () => {
    const handler = createImageHistoryHandler({
      getCorsHeadersForRequest: corsHeaders,
      getUserIdFromRequest: async () => mockState.userId,
      createSupabaseClient: () => createSupabaseMock() as never
    });
    mockState.userId = null;
    const unauthorized = await handler(
      new Request('https://webtomind.test/api/image/history?ids=one')
    );
    expect(unauthorized.status).toBe(401);

    mockState.userId = 'user-1';
    const oversized = Array.from({ length: 61 }, (_, index) => `id-${index}`);
    const tooMany = await handler(
      new Request(
        `https://webtomind.test/api/image/history?ids=${oversized.join(',')}`
      )
    );
    expect(tooMany.status).toBe(400);
  });

  it('updates favorite metadata and filters the gallery favorites category', async () => {
    mockState.rows = [
      {
        id: 'generation-favorite',
        image_url: 'https://cdn.test/favorite.png',
        prompt: '收藏图像',
        negative_prompt: null,
        model_label: 'GPT Image 2',
        provider: 'tuzi',
        provider_model: 'gpt-image-2',
        aspect_ratio: '1:1',
        quality: 'high',
        asset_ids: [],
        metadata: { storagePath: 'user-1/favorite.png' },
        created_at: '2026-07-18T01:00:00.000Z'
      },
      {
        id: 'generation-other',
        image_url: 'https://cdn.test/other.png',
        prompt: '普通图像',
        negative_prompt: null,
        model_label: 'GPT Image 2',
        provider: 'tuzi',
        provider_model: 'gpt-image-2',
        aspect_ratio: '1:1',
        quality: 'high',
        asset_ids: [],
        metadata: {},
        created_at: '2026-07-18T00:00:00.000Z'
      }
    ];
    const handler = createImageHistoryHandler({
      getCorsHeadersForRequest: corsHeaders,
      getUserIdFromRequest: async () => mockState.userId,
      createSupabaseClient: () => createSupabaseMock() as never
    });

    const updateResponse = await handler(
      new Request(
        'https://webtomind.test/api/image/history?id=generation-favorite',
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isFavorite: true })
        }
      )
    );
    expect(updateResponse.status).toBe(200);
    expect(mockState.rows[0].metadata).toMatchObject({
      storagePath: 'user-1/favorite.png',
      isFavorite: true
    });

    mockState.favoriteOnly = false;
    const favoritesResponse = await handler(
      new Request(
        'https://webtomind.test/api/image/history?favorite=true&limit=12'
      )
    );
    const favoritesBody = await readJson(favoritesResponse);
    expect(
      (favoritesBody.items as Array<Record<string, unknown>>).map(
        (item) => item.id
      )
    ).toEqual(['generation-favorite']);
    expect(
      (favoritesBody.items as Array<Record<string, unknown>>)[0].isFavorite
    ).toBe(true);
  });
});
