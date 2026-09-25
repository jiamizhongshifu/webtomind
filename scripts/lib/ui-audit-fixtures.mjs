const DEFAULT_BASE_URL = 'http://127.0.0.1:4173';

export function mockImageSvg(label, width = 1200, height = 1600) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs>
      <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
        <stop offset="0%" stop-color="#151515"/>
        <stop offset="48%" stop-color="#5f3b33"/>
        <stop offset="100%" stop-color="#d69b62"/>
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
    <circle cx="${width * 0.58}" cy="${height * 0.34}" r="${width * 0.18}" fill="#f5c7a0" opacity="0.9"/>
    <rect x="${width * 0.24}" y="${height * 0.46}" width="${width * 0.52}" height="${height * 0.32}" rx="80" fill="#1f2937" opacity="0.74"/>
    <text x="80" y="${height - 180}" fill="#fff7ed" font-size="92" font-family="Arial, sans-serif" font-weight="700">${label}</text>
    <text x="82" y="${height - 92}" fill="#fff7ed" font-size="36" font-family="Arial, sans-serif" opacity="0.72">WebToMind UI audit fixture</text>
  </svg>`;
}

export function buildMockHistoryItems({ baseUrl = DEFAULT_BASE_URL } = {}) {
  const now = Date.now();
  return Array.from({ length: 8 }, (_, index) => {
    const groupIndex = Math.floor(index / 2);
    const itemIndex = index % 2;
    const id = `mobile-audit-history-${index + 1}`;
    const imageUrl = `${baseUrl}/__mobile-audit/history-${index + 1}.svg`;
    return {
      id,
      imageUrl,
      thumbnailUrl: imageUrl,
      previewUrl: imageUrl,
      width: 941,
      height: 1672,
      prompt:
        '9:16 竖版真人写真海报，端午节主题，双人女性写真，高级写实摄影质感，大透视动态构图，电影级节日 editorial。',
      provider: 'openai-compatible',
      model: 'gpt-image-2',
      modelLabel: 'GPT Image 2',
      aspectRatio: '9:16',
      imageSize: '941x1672',
      actualImageSize: '941x1672',
      requestedImageCount: 2,
      imageCount: 2,
      quality: 'high',
      outputFormat: 'png',
      assetIds: [],
      createdAt: new Date(
        now - groupIndex * 11 * 60_000 - itemIndex * 45_000
      ).toISOString()
    };
  });
}

export function buildMockWorkspaceProjects() {
  const now = Date.now();
  return [
    {
      id: 'mobile-audit-project-mind',
      name: 'Mind',
      description: 'UI audit fixture project',
      icon: '☂',
      color: '#0f172a',
      isDefault: false,
      sortOrder: 0,
      summaryCount: 3,
      conversationCount: 2,
      createdAt: now - 4 * 24 * 60 * 60_000,
      updatedAt: now - 20 * 60_000,
      archivedAt: null,
      favoritedAt: now - 5 * 60_000,
      instructions: null
    },
    {
      id: 'mobile-audit-project-visual',
      name: '视觉案例库',
      description: 'Dense project grid fixture',
      icon: '🎨',
      color: '#2563eb',
      isDefault: false,
      sortOrder: 1,
      summaryCount: 3,
      conversationCount: 1,
      createdAt: now - 9 * 24 * 60 * 60_000,
      updatedAt: now - 2 * 60 * 60_000,
      archivedAt: null,
      favoritedAt: null,
      instructions: null
    },
    {
      id: 'mobile-audit-project-inbox',
      name: 'Inbox',
      description: 'Default project fixture',
      icon: '',
      color: '#64748b',
      isDefault: true,
      sortOrder: 2,
      summaryCount: 2,
      conversationCount: 0,
      createdAt: now - 14 * 24 * 60 * 60_000,
      updatedAt: now - 6 * 60 * 60_000,
      archivedAt: null,
      favoritedAt: null,
      instructions: null
    },
    {
      id: 'mobile-audit-project-archive',
      name: '已归档视觉实验',
      description: 'Archived project fixture',
      icon: '🗂',
      color: '#475569',
      isDefault: false,
      sortOrder: 3,
      summaryCount: 1,
      conversationCount: 0,
      createdAt: now - 20 * 24 * 60 * 60_000,
      updatedAt: now - 10 * 24 * 60 * 60_000,
      archivedAt: now - 24 * 60 * 60_000,
      favoritedAt: null,
      instructions: null
    }
  ];
}

export function buildMockWorkspaceSummaries({
  baseUrl = DEFAULT_BASE_URL
} = {}) {
  const now = Date.now();
  const projectIds = [
    'mobile-audit-project-mind',
    'mobile-audit-project-visual',
    'mobile-audit-project-inbox',
    'mobile-audit-project-archive'
  ];
  return projectIds.flatMap((projectId, projectIndex) => {
    const count = projectId === 'mobile-audit-project-archive' ? 1 : 3;
    return Array.from({ length: count }, (_, index) => {
      const order = projectIndex * 3 + index + 1;
      const imageUrl = `${baseUrl}/__mobile-audit/workspace-${order}.svg`;
      return {
        id: `mobile-audit-summary-${order}`,
        title:
          index === 0
            ? '品牌宣发海报大片'
            : index === 1
              ? '图像任务拆解卡'
              : '可复现提示词笔记',
        url: imageUrl,
        markdown: `![视觉缩略图](${imageUrl})\n\nWebToMind UI audit fixture summary ${order}.`,
        createdAt: now - order * 8 * 60_000,
        tags: ['mobile-audit', 'workspace'],
        starred: index === 0,
        projectId,
        contentType: 'image',
        metadata: {
          thumbnailUrl: imageUrl,
          previewUrl: imageUrl,
          imageUrl,
          width: 941,
          height: 1672,
          aspectRatio: '9:16',
          imageSize: '941x1672',
          modelLabel: 'GPT Image 2'
        }
      };
    });
  });
}

export function buildMockPromptCases({ baseUrl = DEFAULT_BASE_URL } = {}) {
  const caseSeeds = [
    ['portrait', '品牌宣发海报大片', '可复现商业海报案例', 108],
    ['character', '电竞少女', '角色设定案例', 14],
    ['character', '冒险岛枫之谷Q版风格提示词', 'Q版角色案例', 9],
    ['poster', '高达风原创巨型机甲 × 世界杯国家对决', '海报设计案例', 11],
    ['cover', '高端肚皮舞主题时尚杂志封面', '封面设计案例', 119],
    ['portrait', '浴室写真', '人像写真案例', 173],
    ['ui', '限时登录奖励游戏UI', '界面视觉案例', 4],
    ['social', '夏日海滨约会', '社媒视觉案例', 138]
  ];
  return caseSeeds.map(([category, title, commercialIntent, runs], index) => {
    const imageUrl = `${baseUrl}/__mobile-audit/prompt-case-${index + 1}.svg`;
    return {
      id: `mobile-audit-prompt-case-${index + 1}`,
      slug: `mobile-audit-prompt-case-${index + 1}`,
      title,
      imageUrl,
      imageUrls: [
        imageUrl,
        `${baseUrl}/__mobile-audit/prompt-case-${index + 1}-alt-1.svg`,
        `${baseUrl}/__mobile-audit/prompt-case-${index + 1}-alt-2.svg`
      ],
      category,
      tags: ['mobile-audit', category],
      model: 'GPT Image 2',
      locale: 'zh-CN',
      featured: true,
      prompt:
        '品牌宣发海报大片。凌晨两点，雨夜室内港口场景，人物主体靠近玻璃，湿发、凝露、暖色灯光和高端电影海报排版。',
      promptPreview:
        '品牌宣发海报大片。凌晨两点，雨夜室内港口场景，人物主体靠近玻璃，湿发、凝露、暖色灯光和高端电影海报排版。',
      commercialIntent,
      generateCount: runs,
      createdAt: new Date(Date.now() - index * 60_000).toISOString(),
      updatedAt: new Date(Date.now() - index * 60_000).toISOString()
    };
  });
}

export async function installUiAuditMockRoutes(
  context,
  { baseUrl = DEFAULT_BASE_URL, enabled = true, seedAuthSession = false } = {}
) {
  if (!enabled) return;
  const historyItems = buildMockHistoryItems({ baseUrl });
  const promptCases = buildMockPromptCases({ baseUrl });
  const workspaceProjects = buildMockWorkspaceProjects();
  const workspaceSummaries = buildMockWorkspaceSummaries({ baseUrl });
  const credits = {
    daily: 300,
    dailyMax: 300,
    subscription: 0,
    subscriptionMax: 0,
    bonus: 500,
    referral: 0,
    total: 800
  };
  const avatarUrl = `${baseUrl}/__mobile-audit/avatar.svg`;

  if (seedAuthSession) {
    await context.addInitScript((avatarUrlForSession) => {
      try {
        const fakeUser = {
          id: 'e2e-user',
          aud: 'authenticated',
          role: 'authenticated',
          email: 'e2e@webtomind.test',
          email_confirmed_at: new Date().toISOString(),
          phone: '',
          app_metadata: { provider: 'email', providers: ['email'] },
          user_metadata: {
            name: 'E2E User',
            picture: avatarUrlForSession,
            avatar_url: avatarUrlForSession
          },
          identities: [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        const fakeSession = {
          access_token: 'e2e-access-token',
          refresh_token: 'e2e-refresh-token',
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          token_type: 'bearer',
          user: fakeUser
        };
        window.localStorage.setItem(
          'webtomind-auth-token',
          JSON.stringify(fakeSession)
        );
      } catch {
        // The auth fixture assertion will report if the session cannot be read.
      }
    }, avatarUrl);
  }

  await context.route('**/__mobile-audit/*.svg', async (route) => {
    const url = route.request().url();
    const label = url.includes('prompt-case')
      ? 'PROMPT CASE'
      : url.includes('avatar')
        ? 'AVATAR'
        : url.includes('workspace')
          ? 'WORKSPACE'
          : 'HISTORY';
    await route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: mockImageSvg(label)
    });
  });

  await context.route('**/api/content/prompt-cases**', async (route) => {
    const requestUrl = new URL(route.request().url());
    const isPromptLibraryRequest =
      requestUrl.searchParams.get('library') === '1';
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        isPromptLibraryRequest
          ? {
              items: promptCases,
              total: promptCases.length,
              pageInfo: { nextCursor: null, hasMore: false },
              facets: {
                models: [
                  {
                    slug: 'gpt-image-2',
                    label: 'GPT Image 2',
                    count: promptCases.length,
                    active: false
                  }
                ],
                labels: [],
                sorts: [
                  { slug: 'featured', label: '精选', active: true },
                  { slug: 'latest', label: '最新', active: false },
                  { slug: 'hot', label: '最热', active: false }
                ]
              },
              queryEcho: {
                locale: requestUrl.searchParams.get('locale') || 'zh-CN',
                sort: requestUrl.searchParams.get('sort') || 'featured',
                limit: Number(requestUrl.searchParams.get('limit')) || 36
              },
              version: 'prompt-library-v2',
              source: 'database'
            }
          : { cases: promptCases, total: promptCases.length }
      )
    });
  });

  await context.route('**/api/discovery/search**', async (route) => {
    const requestUrl = new URL(route.request().url());
    const query = requestUrl.searchParams.get('q') || '';
    const promptImages = promptCases.slice(0, 6).map((item) => ({
      id: item.id,
      kind: 'prompt_case',
      title: item.title,
      prompt: item.prompt,
      imageUrl: item.imageUrl,
      model: item.model,
      href: `/prompts/${item.slug}`
    }));
    const galleryImages = historyItems.slice(0, 4).map((item, index) => ({
      id: item.id,
      kind: 'gallery',
      title: `历史生成 ${index + 1}`,
      prompt: item.prompt,
      imageUrl: item.imageUrl,
      model: item.modelLabel,
      href: `/create/gallery?generation=${item.id}`
    }));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        query,
        images: [...promptImages, ...galleryImages],
        moodboards: []
      })
    });
  });

  await context.route('**/api/image/history**', async (route) => {
    const requestUrl = new URL(route.request().url());
    const id = requestUrl.searchParams.get('id');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        id
          ? {
              item:
                historyItems.find((item) => item.id === id) || historyItems[0]
            }
          : { items: historyItems, total: historyItems.length }
      )
    });
  });

  await context.route('**/api/video/history**', async (route) => {
    const request = route.request();
    if (request.method() === 'PATCH') {
      const requestUrl = new URL(request.url());
      const body = request.postDataJSON() || {};
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          id: requestUrl.searchParams.get('id'),
          isFavorite: body.isFavorite === true
        })
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [
          {
            generationId: 'mobile-audit-video-1',
            videoUrl: 'data:video/mp4;base64,AAAA',
            posterUrl: `${baseUrl}/__mobile-audit/history-1.svg`,
            prompt: '晨雾中的电影感运镜，镜头缓慢推进。',
            provider: 'official',
            model: 'doubao-seedance-2-0-fast',
            modelLabel: 'Seedance 2.0 Fast',
            aspectRatio: '16:9',
            duration: 5,
            isFavorite: true,
            createdAt: new Date(Date.now() + 60_000).toISOString()
          }
        ],
        hasMore: false
      })
    });
  });

  await context.route('**/api/image/user-library**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        presets: [],
        promptLibrary: [],
        updatedAt: new Date().toISOString()
      })
    });
  });

  await context.route('**/api/image/references', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ references: [] })
    });
  });

  await context.route('**/api/image/characters', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ characters: [] })
    });
  });

  await context.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: {
          id: 'e2e-user',
          email: 'e2e@webtomind.test',
          name: 'E2E User',
          avatarUrl,
          avatar_url: avatarUrl,
          user_metadata: {
            name: 'E2E User',
            picture: avatarUrl,
            avatar_url: avatarUrl
          }
        },
        credits,
        membership: {
          isMember: false,
          isFree: true,
          planId: 'free',
          plan: { id: 'free', name: 'Free' }
        }
      })
    });
  });

  await context.route('**/api/credits/balance', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        credits,
        checkin: {
          canCheckin: false,
          streak: 1
        }
      })
    });
  });

  await context.route('**/api/credits/transactions**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [], total: 0 })
    });
  });

  await context.route('**/api/credits/image-cost**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ cost: 20 })
    });
  });

  await context.route('**/api/credits/packages', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        packages: [
          {
            id: 'pack_1k',
            name: '1,000 Media Credits',
            credits: 1000,
            price: 999,
            bonusCredits: 0,
            isActive: true,
            sortOrder: 0
          },
          {
            id: 'pack_5k',
            name: '5,000 Media Credits',
            credits: 5000,
            price: 4900,
            bonusCredits: 250,
            isActive: true,
            sortOrder: 1
          },
          {
            id: 'pack_20k',
            name: '20,000 Media Credits',
            credits: 20000,
            price: 19900,
            bonusCredits: 2000,
            isActive: true,
            sortOrder: 2
          }
        ]
      })
    });
  });

  await context.route('**/api/credits/daily-login-reward', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        alreadyClaimed: true,
        reward: 0,
        monthlyCap: 300,
        monthlyClaimed: 0,
        consecutiveDays: 1,
        balance: credits
      })
    });
  });

  await context.route('**/api/membership/subscription**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        tier: 'free',
        status: 'active',
        isActive: false,
        isMember: false,
        isFree: true,
        planId: 'free',
        plan: { id: 'free', name: 'Free' },
        features: []
      })
    });
  });

  await context.route('**/api/workspace/projects**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        projects: workspaceProjects,
        total: workspaceProjects.length
      })
    });
  });

  await context.route('**/api/workspace/summaries**', async (route) => {
    const requestUrl = new URL(route.request().url());
    const projectId = requestUrl.searchParams.get('project_id');
    const limit = Number(requestUrl.searchParams.get('limit') || 50);
    const offset = Number(requestUrl.searchParams.get('offset') || 0);
    const filtered = projectId
      ? workspaceSummaries.filter((summary) => summary.projectId === projectId)
      : workspaceSummaries;
    const page = filtered.slice(offset, offset + limit);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        summaries: page,
        hasMore: offset + limit < filtered.length
      })
    });
  });
}
