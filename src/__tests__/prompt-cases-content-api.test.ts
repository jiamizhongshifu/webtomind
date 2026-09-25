import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  authGetUserMock,
  createClientMock,
  inMock,
  limitMock,
  rpcMock,
  rangeMock
} = vi.hoisted(() => ({
  authGetUserMock: vi.fn(),
  createClientMock: vi.fn(),
  inMock: vi.fn(),
  limitMock: vi.fn(),
  rpcMock: vi.fn(),
  rangeMock: vi.fn()
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: createClientMock
}));

function createQueryMock() {
  const query: Record<string, unknown> = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    is: vi.fn(() => query),
    or: vi.fn(() => query),
    order: vi.fn(() => query),
    range: rangeMock,
    in: inMock,
    limit: limitMock,
    not: vi.fn(() => query)
  };
  return query;
}

function createPromptCaseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'case-1',
    slug: 'case-1',
    title: 'GPT Image 2 韩系写真案例',
    title_zh: 'GPT Image 2 韩系写真案例',
    prompt_preview_zh: '韩系人像写真，街拍，真实摄影',
    prompt: 'portrait prompt',
    image_url: 'https://example.com/case-1.webp',
    image_urls: ['https://example.com/case-1.webp'],
    model: 'GPT Image 2',
    category: 'portrait',
    tags: ['ai-portrait'],
    locale: 'zh-CN',
    featured: true,
    is_published: true,
    deleted_at: null,
    source_case_id: null,
    created_at: '2026-06-18T10:00:00.000Z',
    ...overrides
  };
}

describe('/api/content/prompt-cases', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    authGetUserMock.mockReset();
    createClientMock.mockReset();
    inMock.mockReset();
    limitMock.mockReset();
    rpcMock.mockReset();
    rangeMock.mockReset();
    process.env = {
      ...originalEnv,
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_ANON_KEY: 'anon-key',
      PROMPT_CASE_STATS_CACHE_DISABLED: 'true',
      WEBTOMIND_RUNTIME: 'node'
    };

    rangeMock.mockResolvedValue({ data: [], error: null });
    inMock.mockResolvedValue({ data: [], error: null });
    limitMock.mockResolvedValue({ data: [], error: null });
    rpcMock.mockResolvedValue({
      data: {
        cases: [createPromptCaseRow()],
        total: 1,
        navigationTotal: 1,
        modelCounts: { 'gpt-image-2': 1 },
        categoryCounts: { 'portrait-photography': 1 }
      },
      error: null
    });
    createClientMock.mockReturnValue({
      auth: {
        getUser: authGetUserMock
      },
      from: vi.fn(() => createQueryMock()),
      rpc: rpcMock,
      storage: {
        from: vi.fn()
      }
    });
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.unstubAllGlobals();
  });

  it('falls back to public search RPC when SEO category rows are not directly selectable', async () => {
    const { default: handler } = await import('../../api/content/prompt-cases');

    const response = await handler(
      new Request(
        'https://webtomind.test/api/content/prompt-cases?limit=5&locale=zh-CN&requireImage=1&category=portrait-photography'
      )
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledWith(
      'search_prompt_cases_public',
      expect.objectContaining({
        p_category: null,
        p_model: null,
        p_limit: 1000
      })
    );
    expect(body.cases).toHaveLength(1);
    expect(body.cases[0].title).toBe('GPT Image 2 韩系写真案例');
    expect(body.categoryCounts['portrait-photography']).toBe(1);
  });

  it('treats authorized list requests as public cacheable reads', async () => {
    const { default: handler } = await import('../../api/content/prompt-cases');

    const response = await handler(
      new Request(
        'https://webtomind.test/api/content/prompt-cases?limit=5&locale=zh-CN&requireImage=1',
        {
          headers: {
            Authorization: 'Bearer signed-in-user-token'
          }
        }
      )
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.cases).toHaveLength(1);
    expect(authGetUserMock).not.toHaveBeenCalled();
    expect(response.headers.get('Cache-Control')).toContain('public');
  });

  it('surfaces a 502 no-store when the public search RPC is unavailable', async () => {
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'upstream connect error' }
    });
    const { default: handler } = await import('../../api/content/prompt-cases');

    const response = await handler(
      new Request(
        'https://webtomind.test/api/content/prompt-cases?limit=5&locale=zh-CN'
      )
    );
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(body.cases).toEqual([]);
    expect(body.error).toContain('不可用');
  });

  it('keeps anonymous single-case prompts locked unless full prompt is requested', async () => {
    limitMock.mockResolvedValueOnce({
      data: [
        createPromptCaseRow({
          id: 'single-case',
          slug: 'single-case',
          prompt_zh: '这是一段完整中文 Prompt，应当只在 includePrompt=1 时返回。',
          prompt_preview_zh: '公开预览'
        })
      ],
      error: null
    });
    const { default: handler } = await import('../../api/content/prompt-cases');

    const response = await handler(
      new Request(
        'https://webtomind.test/api/content/prompt-cases?id=single-case&locale=zh-CN'
      )
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.cases[0]).toMatchObject({
      prompt: '',
      promptLocked: true,
      promptPreview: '公开预览'
    });
  });

  it('returns full public single-case prompts for create/remix imports', async () => {
    limitMock.mockResolvedValueOnce({
      data: [
        createPromptCaseRow({
          id: 'single-case',
          slug: 'single-case',
          prompt_zh: '这是一段完整中文 Prompt，会用于图像创作页复现案例。',
          prompt_preview_zh: '公开预览'
        })
      ],
      error: null
    });
    const { default: handler } = await import('../../api/content/prompt-cases');

    const response = await handler(
      new Request(
        'https://webtomind.test/api/content/prompt-cases?id=single-case&locale=zh-CN&includePrompt=1'
      )
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.cases[0]).toMatchObject({
      prompt: '这是一段完整中文 Prompt，会用于图像创作页复现案例。',
      promptZh: '这是一段完整中文 Prompt，会用于图像创作页复现案例。',
      promptLocked: false
    });
  });

  it('prefers the English mirror when a source case is requested in English', async () => {
    limitMock.mockResolvedValueOnce({
      data: [
        createPromptCaseRow({
          id: 'source-case',
          slug: 'source-case',
          locale: 'zh-CN',
          prompt_zh: '中文源 Prompt',
          prompt: '中文源 Prompt',
          title_zh: '中文源案例'
        }),
        createPromptCaseRow({
          id: 'english-case',
          slug: 'english-case',
          locale: 'en-US',
          source_case_id: 'source-case',
          prompt_en: 'English mirror prompt',
          prompt: 'English mirror prompt',
          title_en: 'English mirror case'
        })
      ],
      error: null
    });
    const { default: handler } = await import('../../api/content/prompt-cases');

    const response = await handler(
      new Request(
        'https://webtomind.test/api/content/prompt-cases?id=source-case&locale=en-US&includePrompt=1'
      )
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.cases[0]).toMatchObject({
      id: 'english-case',
      sourceCaseId: 'source-case',
      title: 'English mirror case',
      prompt: 'English mirror prompt',
      promptEn: 'English mirror prompt',
      promptLocked: false
    });
  });

  it('keeps member-only single-case prompts locked for public create imports', async () => {
    limitMock.mockResolvedValueOnce({
      data: [
        createPromptCaseRow({
          id: 'member-case',
          slug: 'member-case',
          members_only: true,
          prompt_zh: '会员专属完整 Prompt',
          prompt_preview_zh: '会员专属预览'
        })
      ],
      error: null
    });
    const { default: handler } = await import('../../api/content/prompt-cases');

    const response = await handler(
      new Request(
        'https://webtomind.test/api/content/prompt-cases?id=member-case&locale=zh-CN&includePrompt=1'
      )
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.cases[0]).toMatchObject({
      prompt: '',
      promptLocked: true,
      promptPreview: '会员专属预览'
    });
  });

  it('falls back to public search RPC when SEO model rows are not directly selectable', async () => {
    const { default: handler } = await import('../../api/content/prompt-cases');

    const response = await handler(
      new Request(
        'https://webtomind.test/api/content/prompt-cases?limit=5&locale=zh-CN&requireImage=1&model=gpt-image-2'
      )
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.cases).toHaveLength(1);
    expect(body.modelCounts['gpt-image-2']).toBe(1);
  });

  it('keeps SEO model navigation counts global instead of current-page filtered counts', async () => {
    rpcMock.mockResolvedValueOnce({
      data: {
        cases: [
          createPromptCaseRow({ id: 'case-1', slug: 'case-1' }),
          createPromptCaseRow({ id: 'case-2', slug: 'case-2' })
        ],
        total: 42,
        navigationTotal: 42,
        modelCounts: { 'gpt-image-2': 37, 'nano-banana': 5 },
        categoryCounts: { 'portrait-photography': 12 }
      },
      error: null
    });
    const { default: handler } = await import('../../api/content/prompt-cases');

    const response = await handler(
      new Request(
        'https://webtomind.test/api/content/prompt-cases?limit=5&locale=zh-CN&requireImage=1&model=gpt-image-2'
      )
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.cases).toHaveLength(2);
    expect(body.total).toBe(2);
    expect(body.navigationTotal).toBe(42);
    expect(body.modelCounts['gpt-image-2']).toBe(37);
    expect(body.modelCounts['nano-banana']).toBe(5);
  });

  it('normalizes raw model stats and SEO matches into stable navigation counts', async () => {
    rpcMock.mockResolvedValueOnce({
      data: {
        cases: [
          createPromptCaseRow({
            id: 'midjourney-1',
            slug: 'midjourney-1',
            title: 'Midjourney 风格参考案例',
            model: 'gpt-image-2',
            tags: ['midjourney']
          }),
          createPromptCaseRow({
            id: 'midjourney-2',
            slug: 'midjourney-2',
            title: 'SREF 风格参考案例',
            model: 'gpt-image-2',
            tags: ['sref']
          }),
          createPromptCaseRow({
            id: 'seedream-1',
            slug: 'seedream-1',
            title: 'Seedream 商品案例',
            model: 'seedream-5-lite',
            tags: ['seedream']
          })
        ],
        total: 1191,
        navigationTotal: 1191,
        modelCounts: {
          'gpt-image-2': 1158,
          'seedream-5-lite': 4
        },
        categoryCounts: {}
      },
      error: null
    });
    const { default: handler } = await import('../../api/content/prompt-cases');

    const response = await handler(
      new Request(
        'https://webtomind.test/api/content/prompt-cases?limit=5&locale=zh-CN&requireImage=1'
      )
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(body.modelCounts.seedream).toBe(4);
    expect(body.modelCounts['midjourney-alternative']).toBe(1);
    expect(body.modelCounts['gpt-image-2']).toBe(1158);
  });

  it('returns prompt library v2 facets from canonical model and label filters', async () => {
    rangeMock.mockResolvedValueOnce({
      data: [
        createPromptCaseRow({
          id: 'portrait-gpt',
          slug: 'portrait-gpt',
          model: 'GPT Image 2',
          category: 'portrait',
          created_at: '2026-06-20T10:00:00.000Z'
        }),
        createPromptCaseRow({
          id: 'product-gpt',
          slug: 'product-gpt',
          model: 'GPT Image 2',
          category: 'ecommerce',
          tags: [],
          created_at: '2026-06-21T10:00:00.000Z'
        }),
        createPromptCaseRow({
          id: 'portrait-nano',
          slug: 'portrait-nano',
          model: 'Nano Banana',
          category: 'portrait',
          created_at: '2026-06-22T10:00:00.000Z'
        })
      ],
      error: null
    });
    const { default: handler } = await import('../../api/content/prompt-cases');

    const response = await handler(
      new Request(
        'https://webtomind.test/api/content/prompt-cases?library=1&limit=5&locale=zh-CN&requireImage=1&model=gpt-image-2&label=portrait-photography&sort=latest'
      )
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.version).toBe('prompt-library-v2');
    expect(body.items).toHaveLength(1);
    expect(body.items[0].id).toBe('portrait-gpt');
    expect(body.total).toBe(1);
    expect(body.pageInfo).toEqual({ nextCursor: null, hasMore: false });
    expect(body.queryEcho).toMatchObject({
      locale: 'zh-CN',
      model: 'gpt-image-2',
      label: 'portrait-photography',
      sort: 'latest',
      limit: 5
    });
    expect(
      body.facets.models.find(
        (item: Record<string, unknown>) => item.slug === 'gpt-image-2'
      )
    ).toMatchObject({ count: 1, active: true });
    expect(
      body.facets.models.find(
        (item: Record<string, unknown>) => item.slug === 'nano-banana'
      )
    ).toMatchObject({ count: 1, active: false });
    expect(
      body.facets.labels.find(
        (item: Record<string, unknown>) =>
          item.slug === 'portrait-photography'
      )
    ).toMatchObject({ count: 1, active: true });
    expect(
      body.facets.labels.find(
        (item: Record<string, unknown>) =>
          item.slug === 'product-commercial'
      )
    ).toMatchObject({ count: 1, active: false });
  });

  it('orders prompt library v2 hot results by stable engagement score', async () => {
    rangeMock.mockResolvedValueOnce({
      data: [
        createPromptCaseRow({
          id: 'low-hot',
          slug: 'low-hot',
          category: 'poster',
          view_count: 1,
          copy_count: 0,
          generate_count: 0,
          created_at: '2026-06-22T10:00:00.000Z'
        }),
        createPromptCaseRow({
          id: 'high-hot',
          slug: 'high-hot',
          category: 'poster',
          view_count: 100,
          copy_count: 12,
          generate_count: 8,
          created_at: '2026-06-20T10:00:00.000Z'
        })
      ],
      error: null
    });
    const { default: handler } = await import('../../api/content/prompt-cases');

    const response = await handler(
      new Request(
        'https://webtomind.test/api/content/prompt-cases?library=1&limit=1&locale=zh-CN&requireImage=1&label=poster-key-visual&sort=hot'
      )
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.items).toHaveLength(1);
    expect(body.items[0].id).toBe('high-hot');
    expect(body.pageInfo).toMatchObject({ hasMore: true });
    expect(body.pageInfo.nextCursor).toMatch(/^cursor:v1:hot:/);

    rangeMock.mockResolvedValueOnce({
      data: [
        createPromptCaseRow({
          id: 'low-hot',
          slug: 'low-hot',
          category: 'poster',
          view_count: 1,
          copy_count: 0,
          generate_count: 0,
          created_at: '2026-06-22T10:00:00.000Z'
        }),
        createPromptCaseRow({
          id: 'high-hot',
          slug: 'high-hot',
          category: 'poster',
          view_count: 100,
          copy_count: 12,
          generate_count: 8,
          created_at: '2026-06-20T10:00:00.000Z'
        })
      ],
      error: null
    });
    const nextResponse = await handler(
      new Request(
        `https://webtomind.test/api/content/prompt-cases?library=1&limit=1&locale=zh-CN&requireImage=1&label=poster-key-visual&sort=hot&cursor=${encodeURIComponent(
          body.pageInfo.nextCursor
        )}`
      )
    );
    const nextBody = await nextResponse.json();

    expect(nextResponse.status).toBe(200);
    expect(nextBody.items).toHaveLength(1);
    expect(nextBody.items[0].id).toBe('low-hot');
    expect(nextBody.pageInfo).toEqual({ nextCursor: null, hasMore: false });
  });

  it('uses prompt library v2 RPC payload before the full-table fallback', async () => {
    rpcMock.mockResolvedValueOnce({
      data: {
        items: [
          createPromptCaseRow({
            id: 'rpc-library-case',
            slug: 'rpc-library-case',
            canonical_model_slug: 'gpt-image-2',
            canonical_label_slugs: ['portrait-photography']
          })
        ],
        total: 1,
        pageInfo: { nextCursor: null, hasMore: false },
        facets: {
          models: [
            { slug: 'gpt-image-2', label: 'GPT Image 2', count: 1, active: true }
          ],
          labels: [
            {
              slug: 'portrait-photography',
              label: '人像摄影',
              count: 1,
              active: true
            }
          ],
          sorts: [{ slug: 'featured', label: '精选', active: true }]
        },
        queryEcho: {
          locale: 'zh-CN',
          model: 'gpt-image-2',
          label: 'portrait-photography',
          sort: 'featured',
          limit: 12
        },
        version: 'prompt-library-v2',
        source: 'database'
      },
      error: null
    });
    const { default: handler } = await import('../../api/content/prompt-cases');

    const response = await handler(
      new Request(
        'https://webtomind.test/api/content/prompt-cases?library=1&limit=12&locale=zh-CN&requireImage=1&model=gpt-image-2&label=portrait-photography'
      )
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledWith(
      'search_prompt_library_public',
      expect.objectContaining({
        p_model: 'gpt-image-2',
        p_label: 'portrait-photography',
        p_limit: 12
      })
    );
    expect(rangeMock).not.toHaveBeenCalled();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].id).toBe('rpc-library-case');
    expect(body.total).toBe(1);
    expect(body.source).toBe('rpc');
    expect(body.facets.models[0]).toMatchObject({
      slug: 'gpt-image-2',
      count: 1,
      active: true
    });
  });

  it('falls back to in-memory prompt library v2 when the RPC is unavailable', async () => {
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'function search_prompt_library_public does not exist' }
    });
    rangeMock.mockResolvedValueOnce({
      data: [
        createPromptCaseRow({
          id: 'fallback-library-case',
          slug: 'fallback-library-case',
          model: 'GPT Image 2',
          category: 'portrait'
        })
      ],
      error: null
    });
    const { default: handler } = await import('../../api/content/prompt-cases');

    const response = await handler(
      new Request(
        'https://webtomind.test/api/content/prompt-cases?library=1&limit=12&locale=zh-CN&requireImage=1&model=gpt-image-2&label=portrait-photography'
      )
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledWith(
      'search_prompt_library_public',
      expect.any(Object)
    );
    expect(rangeMock).toHaveBeenCalled();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].id).toBe('fallback-library-case');
    expect(body.source).toBe('fallback');
  });

  it('returns 502 no-store when the library RPC and the stats fallback are both unavailable', async () => {
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'upstream connect error' }
    });
    // Stats fallback (range query) also returns no rows.
    rangeMock.mockResolvedValueOnce({ data: [], error: null });
    const { default: handler } = await import('../../api/content/prompt-cases');

    const response = await handler(
      new Request(
        'https://webtomind.test/api/content/prompt-cases?library=1&limit=12&locale=zh-CN&requireImage=1'
      )
    );
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(body.items).toEqual([]);
    expect(body.error).toContain('不可用');
  });

  it('enriches the RPC result for seoOnly video requests through SEO rows', async () => {
    const videoRow = createPromptCaseRow({
      id: 'video-case-1',
      slug: 'video-case-1',
      title_zh: '已验证视频案例',
      prompt_zh: '运镜、动作节奏与灯光完整的视频 Prompt。',
      prompt_preview_zh: '真实视频生成案例。',
      model: 'seedance-2-0',
      category: 'fashion',
      media_type: 'video',
      image_url: 'https://example.com/poster.webp',
      video_url: 'https://example.com/video.mp4',
      video_duration_seconds: 12,
      video_upload_date: '2026-08-06T00:00:00.000Z',
      commercial_intent: '时尚视频案例',
      seo_status: 'indexable',
      seo_reviewed_at: '2026-08-08T00:00:00.000Z',
      members_only: false,
      seo_evidence: {
        source_verified: true,
        media_verified: true
      }
    });
    rpcMock.mockResolvedValueOnce({
      data: {
        items: [videoRow],
        total: 1,
        navigationTotal: 1,
        modelCounts: { 'seedance-2-0': 1 },
        categoryCounts: { 'fashion': 1 }
      },
      error: null
    });
    inMock.mockResolvedValueOnce({
      data: [videoRow],
      error: null
    });

    const { default: handler } = await import('../../api/content/prompt-cases');
    const response = await handler(
      new Request(
        'https://webtomind.test/api/content/prompt-cases?library=1&limit=12&locale=zh-CN&requireImage=1&seoOnly=1&mediaType=video&label=video-motion'
      )
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledWith(
      'search_prompt_library_public',
      expect.objectContaining({ p_label: 'video-motion' })
    );
    expect(inMock).toHaveBeenCalled();
    expect(body.source).toBe('rpc');
    expect(body.items).toHaveLength(1);
    expect(body.items[0].id).toBe('video-case-1');
    expect(body.items[0].mediaType).toBe('video');
    expect(body.items[0].durationSeconds).toBe(12);
  });
});
