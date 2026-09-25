import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSupabaseAdmin: vi.fn(),
  getUserIdFromRequest: vi.fn()
}));

vi.mock('../../api/utils/auth.js', () => ({
  getCorsHeadersForRequest: () => ({
    'Access-Control-Allow-Origin': 'https://webtomind.com'
  }),
  getSupabaseAdmin: mocks.getSupabaseAdmin,
  getUserIdFromRequest: mocks.getUserIdFromRequest
}));

vi.mock('../../api/utils/media-storage/index.js', () => ({
  createMediaStorageAdapters: () => ({}),
  buildClientMediaUrls: async (
    _adapters: unknown,
    _metadata: unknown,
    expiresIn: number,
    fallback: { videoUrl?: string; posterUrl?: string }
  ) => ({
    ...fallback,
    videoUrlExpiresIn: expiresIn
  })
}));

import handler from '../../api/video/history';

function createThenableQuery<T>(result: T) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    in: vi.fn(() => query),
    lt: vi.fn(() => query),
    filter: vi.fn(() => query),
    maybeSingle: vi.fn(async () => result),
    then: (
      resolve: (value: T) => unknown,
      reject?: (reason: unknown) => unknown
    ) => Promise.resolve(result).then(resolve, reject)
  };
  return query;
}

describe('video history asset favorites', () => {
  beforeEach(() => {
    mocks.getUserIdFromRequest.mockResolvedValue('user-1');
    vi.clearAllMocks();
  });

  it('returns favorite metadata and applies the favorite-only filter', async () => {
    const query = createThenableQuery({
      data: [
        {
          id: 'video-1',
          task_id: 'task-1',
          video_url: 'https://cdn.example.com/video-1.mp4',
          poster_url: null,
          prompt: 'favorite video',
          model_label: 'Seedance 2.0',
          provider: 'volcengine',
          provider_model: 'doubao-seedance-2-0',
          provider_task_id: 'provider-task-1',
          aspect_ratio: '16:9',
          duration: 5,
          storage_bucket: null,
          storage_path: null,
          byte_size: null,
          metadata: { isFavorite: true },
          created_at: '2026-07-23T00:00:00.000Z'
        }
      ],
      error: null
    });
    mocks.getSupabaseAdmin.mockReturnValue({
      from: vi.fn(() => query)
    });

    const response = await handler(
      new Request(
        'https://webtomind.com/api/video/history?favorite=true&limit=30'
      )
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(query.filter).toHaveBeenCalledWith(
      'metadata->>isFavorite',
      'eq',
      'true'
    );
    expect(body.items[0]).toMatchObject({
      generationId: 'video-1',
      isFavorite: true
    });
  });

  it('persists video favorite state without discarding existing metadata', async () => {
    const loadQuery = createThenableQuery({
      data: { metadata: { storageProvider: 'r2' } },
      error: null
    });
    const updateQuery = createThenableQuery({ error: null });
    const update = vi.fn(() => updateQuery);
    mocks.getSupabaseAdmin.mockReturnValue({
      from: vi
        .fn()
        .mockReturnValueOnce(loadQuery)
        .mockReturnValueOnce({ update })
    });

    const response = await handler(
      new Request('https://webtomind.com/api/video/history?id=video-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isFavorite: true })
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalledWith({
      metadata: { storageProvider: 'r2', isFavorite: true }
    });
    expect(body).toMatchObject({
      success: true,
      id: 'video-1',
      isFavorite: true
    });
  });
});
