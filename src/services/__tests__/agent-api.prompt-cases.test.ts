import { afterEach, describe, expect, it, vi } from 'vitest';

function makeApiCase(id: string) {
  return {
    id,
    slug: id,
    title: `Case ${id}`,
    imageUrl: `https://example.com/${id}.webp`,
    imageUrls: [`https://example.com/${id}.webp`],
    prompt: '',
    promptPreview: 'Prompt preview',
    model: 'gpt-image-2',
    locale: 'zh-CN',
    category: 'poster',
    createdAt: '2026-06-18T10:00:00.000Z'
  };
}

describe('agent-api prompt case cache', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('preserves prompt case count metadata when serving list cache hits', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        cases: [makeApiCase('case-1'), makeApiCase('case-2')],
        total: 25,
        navigationTotal: 30,
        modelCounts: {
          'gpt-image-2': 18,
          'nano-banana': 7
        },
        categoryCounts: {
          'product-images': 9,
          'social-cover-thumbnail': 4
        }
      })
    });
    vi.stubGlobal('fetch', fetchMock);

    const { getPublicPromptCasesResult, setAuthToken } =
      await import('../agent-api');
    setAuthToken(null);

    const first = await getPublicPromptCasesResult(2, {
      locale: 'zh-CN',
      requireImage: true
    });
    const second = await getPublicPromptCasesResult(1, {
      locale: 'zh-CN',
      requireImage: true
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(first.navigationTotal).toBe(30);
    expect(second.cases).toHaveLength(1);
    expect(second.total).toBe(25);
    expect(second.navigationTotal).toBe(30);
    expect(second.modelCounts['gpt-image-2']).toBe(18);
    expect(second.categoryCounts['product-images']).toBe(9);
  });

  it('loads public prompt case lists without auth headers when signed in', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        cases: [makeApiCase('case-1')],
        total: 1,
        navigationTotal: 1,
        modelCounts: {
          'gpt-image-2': 1
        },
        categoryCounts: {}
      })
    });
    vi.stubGlobal('fetch', fetchMock);

    const { getPublicPromptCasesResult, setAuthToken } =
      await import('../agent-api');
    setAuthToken('signed-in-user-token');

    await getPublicPromptCasesResult(1, {
      locale: 'zh-CN',
      requireImage: true
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.headers?.Authorization).toBeUndefined();
    expect(init?.cache).toBe('default');
  });

  it('fetches full single prompt cases even when a preview list cache exists', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          cases: [
            {
              ...makeApiCase('case-1'),
              prompt: '',
              promptPreview: '短预览',
              promptLocked: true
            }
          ],
          total: 1,
          navigationTotal: 1,
          modelCounts: {},
          categoryCounts: {}
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          cases: [
            {
              ...makeApiCase('case-1'),
              prompt: '完整中文 Prompt，用于复现图像创作案例。',
              promptZh: '完整中文 Prompt，用于复现图像创作案例。',
              promptPreview: '短预览',
              promptLocked: false
            }
          ]
        })
      });
    vi.stubGlobal('fetch', fetchMock);

    const { getPublicPromptCase, getPublicPromptCasesResult, setAuthToken } =
      await import('../agent-api');
    setAuthToken(null);

    await getPublicPromptCasesResult(1, {
      locale: 'zh-CN',
      requireImage: true
    });
    const caseItem = await getPublicPromptCase('case-1', {
      locale: 'zh-CN',
      by: 'id'
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toContain('id=case-1');
    expect(String(fetchMock.mock.calls[1][0])).toContain('includePrompt=1');
    expect(caseItem?.prompt).toBe('完整中文 Prompt，用于复现图像创作案例。');
  });

  it('loads and caches prompt library v2 queries with focused facets', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [makeApiCase('case-z'), makeApiCase('case-a')],
        total: 12,
        pageInfo: {
          nextCursor: 'offset:1',
          hasMore: true
        },
        facets: {
          models: [
            {
              slug: 'gpt-image-2',
              label: 'GPT Image 2',
              count: 8,
              active: true
            }
          ],
          labels: [
            {
              slug: 'portrait-photography',
              label: '人像摄影',
              count: 6,
              active: true
            }
          ],
          sorts: [
            {
              slug: 'latest',
              label: '最新',
              active: true
            }
          ]
        },
        queryEcho: {
          locale: 'zh-CN',
          model: 'gpt-image-2',
          label: 'portrait-photography',
          sort: 'latest',
          q: '写真',
          cursor: 'offset:0',
          limit: 2
        },
        version: 'prompt-library-v2',
        source: 'database'
      })
    });
    vi.stubGlobal('fetch', fetchMock);

    const { getPublicPromptLibraryResult, setAuthToken } =
      await import('../agent-api');
    setAuthToken(null);

    const first = await getPublicPromptLibraryResult({
      locale: 'zh-CN',
      model: 'gpt-image-2',
      label: 'portrait-photography',
      sort: 'latest',
      search: '写真',
      cursor: 'offset:0',
      limit: 2,
      requireImage: true
    });
    const second = await getPublicPromptLibraryResult({
      locale: 'zh-CN',
      model: 'gpt-image-2',
      label: 'portrait-photography',
      sort: 'latest',
      search: '写真',
      cursor: 'offset:0',
      limit: 2,
      requireImage: true
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('library=1');
    expect(String(url)).toContain('model=gpt-image-2');
    expect(String(url)).toContain('label=portrait-photography');
    expect(String(url)).toContain('sort=latest');
    expect(String(url)).toContain('q=%E5%86%99%E7%9C%9F');
    expect(init?.headers?.Authorization).toBeUndefined();
    expect(first.items.map((item) => item.id)).toEqual(['case-z', 'case-a']);
    expect(second.items.map((item) => item.id)).toEqual(['case-z', 'case-a']);
    expect(second.total).toBe(12);
    expect(second.pageInfo.nextCursor).toBe('offset:1');
    expect(second.facets.models[0]).toMatchObject({
      slug: 'gpt-image-2',
      count: 8,
      active: true
    });
    expect(second.queryEcho).toMatchObject({
      model: 'gpt-image-2',
      label: 'portrait-photography',
      sort: 'latest',
      q: '写真'
    });
  });

  it('sends isolated media and SEO quality filters for video library queries', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [],
        total: 0,
        pageInfo: { nextCursor: null, hasMore: false },
        facets: { models: [], labels: [], sorts: [] },
        queryEcho: {
          locale: 'zh-CN',
          label: 'video-motion',
          mediaType: 'video',
          seoOnly: true,
          sort: 'latest',
          limit: 100
        },
        version: 'prompt-library-v2',
        source: 'fallback'
      })
    });
    vi.stubGlobal('fetch', fetchMock);

    const { getPublicPromptLibraryResult, setAuthToken } =
      await import('../agent-api');
    setAuthToken(null);

    const result = await getPublicPromptLibraryResult({
      locale: 'zh-CN',
      label: 'video-motion',
      mediaType: 'video',
      seoOnly: true,
      sort: 'latest',
      limit: 100,
      requireImage: true
    });

    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('mediaType=video');
    expect(String(url)).toContain('seoOnly=1');
    expect(result.queryEcho).toMatchObject({
      mediaType: 'video',
      seoOnly: true
    });
  });
});
