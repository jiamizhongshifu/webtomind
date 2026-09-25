import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../agent-api', () => ({
  getAuthToken: vi.fn(() => null)
}));

vi.mock('@/utils/env', () => ({
  getApiBaseUrl: vi.fn(() => '')
}));

describe('create workspace discovery API', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('passes the explicit locale to discovery search', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ query: 'horse', images: [], moodboards: [] })
    });
    vi.stubGlobal('fetch', fetchMock);
    const { searchVisualDiscovery } =
      await import('../create-workspace-v2-api');

    await searchVisualDiscovery('horse', 'en-US');

    expect(String(fetchMock.mock.calls[0][0])).toBe(
      '/api/discovery/search?q=horse&locale=en-US'
    );
  });

  it('adds category pagination only when a later discovery page is requested', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ query: '', images: [], moodboards: [] })
    });
    vi.stubGlobal('fetch', fetchMock);
    const { searchVisualDiscovery } =
      await import('../create-workspace-v2-api');

    await searchVisualDiscovery('', 'zh-CN', {
      kind: 'images',
      offset: 18,
      limit: 12
    });

    expect(String(fetchMock.mock.calls[0][0])).toBe(
      '/api/discovery/search?locale=zh-CN&kind=images&offset=18&limit=12'
    );
  });

  it('returns visual-model keywords and forwards cancellation to image analysis', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        description: '薄雾草地中的白马，自然光摄影',
        keywords: ['白马', '薄雾', '自然光摄影'],
        searchQuery: '白马 薄雾 自然光摄影'
      })
    });
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    const { describeDiscoveryImage } =
      await import('../create-workspace-v2-api');

    await expect(
      describeDiscoveryImage(
        {
          imageBase64: 'data:image/png;base64,AAAA',
          mimeType: 'image/png',
          locale: 'zh-CN'
        },
        { signal: controller.signal }
      )
    ).resolves.toMatchObject({
      keywords: ['白马', '薄雾', '自然光摄影'],
      searchQuery: '白马 薄雾 自然光摄影'
    });
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: 'POST',
      signal: controller.signal
    });
  });

  it('only adds preset images missing from an existing copied moodboard', async () => {
    const { buildMissingMoodboardPresetItems } =
      await import('../create-workspace-v2-api');
    const source = {
      id: 'official-board',
      items: [
        {
          id: 'source-1',
          moodboardId: 'official-board',
          source: 'preset',
          imageUrl: 'https://example.com/source-signed.webp',
          title: '暮色灯塔',
          prompt: 'twilight lighthouse',
          sortOrder: 0,
          isRepresentative: true,
          createdAt: '2026-07-18T00:00:00.000Z'
        },
        {
          id: 'source-2',
          moodboardId: 'official-board',
          source: 'prompt_case',
          imageUrl: 'https://example.com/second.webp',
          title: '雾中人影',
          prompt: 'silhouette in fog',
          promptCaseId: 'case-2',
          sortOrder: 1,
          isRepresentative: false,
          createdAt: '2026-07-18T00:00:00.000Z'
        }
      ]
    } as never;
    const target = {
      id: 'personal-copy',
      sourceMoodboardId: 'official-board',
      items: [
        {
          id: 'copy-1',
          moodboardId: 'personal-copy',
          source: 'preset',
          imageUrl: 'https://example.com/copy-refreshed.webp',
          title: '暮色灯塔',
          prompt: 'twilight lighthouse',
          sortOrder: 0,
          isRepresentative: true,
          createdAt: '2026-07-18T00:00:00.000Z'
        }
      ]
    } as never;

    expect(buildMissingMoodboardPresetItems(target, source)).toEqual([
      expect.objectContaining({
        imageUrl: 'https://example.com/second.webp',
        promptCaseId: 'case-2'
      })
    ]);
  });

  it('refuses to sync a preset into a personal board from another source', async () => {
    const { syncMoodboardPresetItems } =
      await import('../create-workspace-v2-api');

    await expect(
      syncMoodboardPresetItems(
        {
          id: 'personal-board',
          sourceMoodboardId: 'preset-a'
        } as never,
        { id: 'preset-b', items: [] } as never
      )
    ).rejects.toThrow('副本来源不匹配');
  });

  it('refuses to sync a demo preset into a differently named personal board', async () => {
    const { syncMoodboardPresetItems } =
      await import('../create-workspace-v2-api');

    await expect(
      syncMoodboardPresetItems(
        { id: 'personal-board', name: '海报与封面' } as never,
        { id: 'demo-film-noir', name: '黑色电影', items: [] } as never
      )
    ).rejects.toThrow('副本来源不匹配');
  });

  it('copies a curated preset atomically with its reusable visual analysis', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        moodboard: { id: '13276255-f986-4f65-98aa-c95d3d98b79d' }
      })
    });
    vi.stubGlobal('fetch', fetchMock);
    const { copyMoodboardToLibrary } =
      await import('../create-workspace-v2-api');

    await copyMoodboardToLibrary({
      id: 'demo-coquette',
      name: 'Coquette 花园',
      description: '柔和花园参考',
      tasteProfile: '浅粉、奶油白与柔和逆光构成浪漫的收藏感。',
      keywords: ['浅粉蕾丝', '柔和逆光'],
      avoids: ['荧光色'],
      guidelines: ['官方建议不应写入用户 Guidelines'],
      items: [
        {
          imageUrl: '/moodboards/coquette-1.webp',
          title: '蕾丝花园'
        }
      ]
    } as never);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({
      presetSnapshot: {
        presetKey: 'demo-coquette',
        tasteProfile: '浅粉、奶油白与柔和逆光构成浪漫的收藏感。',
        keywords: ['浅粉蕾丝', '柔和逆光'],
        items: [
          {
            imageUrl: '/moodboards/coquette-1.webp',
            title: '蕾丝花园'
          }
        ]
      }
    });
  });

  it('only sends persisted owned moodboards directly to generation', async () => {
    const { isPersistedMoodboardId, materializeMoodboardForUse } =
      await import('../create-workspace-v2-api');
    const boardId = '13276255-f986-4f65-98aa-c95d3d98b79d';
    const board = {
      id: boardId,
      isOwner: true,
      isOfficial: false
    } as never;

    expect(isPersistedMoodboardId(boardId)).toBe(true);
    expect(isPersistedMoodboardId('demo-personal-film')).toBe(false);
    await expect(materializeMoodboardForUse(board)).resolves.toBe(board);
  });

  it('deletes a persisted moodboard through the owner-scoped endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ deleted: true })
    });
    vi.stubGlobal('fetch', fetchMock);
    const { deleteMoodboard } = await import('../create-workspace-v2-api');
    const boardId = '13276255-f986-4f65-98aa-c95d3d98b79d';

    await deleteMoodboard(boardId);

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/moodboards/${boardId}`,
      expect.objectContaining({ method: 'DELETE' })
    );
  });
});
