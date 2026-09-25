import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  PromptCase,
  PublicPromptLibraryResult
} from '@/services/agent-api';
import { getPromptSeoPage } from '@/shared/prompt-seo-content';
import { getPromptSeoPublicCases } from '@/shared/prompt-seo-match';
import { getPromptLibraryQueryKey } from '../prompt-library/usePromptLibraryQuery';
import {
  PromptSeoLandingPage,
  getPromptBrowserMasonryColumnOptions,
  getPromptCaseCreatePath
} from '../PromptSeoLandingPage';
import { getResponsiveMasonryColumnCount } from '../../lib/masonry';

const {
  applySeoMock,
  getPublicImagePromptAssetsMock,
  getPublicPromptCaseMock,
  getPublicPromptCasesMock,
  getPublicPromptLibraryResultMock
} = vi.hoisted(() => ({
  applySeoMock: vi.fn(() => () => {}),
  getPublicImagePromptAssetsMock: vi.fn(),
  getPublicPromptCaseMock: vi.fn(),
  getPublicPromptCasesMock: vi.fn(),
  getPublicPromptLibraryResultMock: vi.fn()
}));

vi.mock('@/services/agent-api', () => ({
  getPublicPromptCase: getPublicPromptCaseMock,
  getPublicPromptCases: (...args: unknown[]) =>
    Promise.resolve(getPublicPromptCasesMock(...args)).then((result) => {
      if (
        result &&
        typeof result === 'object' &&
        !Array.isArray(result) &&
        Array.isArray((result as { cases?: unknown }).cases)
      ) {
        return (result as { cases: unknown[] }).cases;
      }
      return Array.isArray(result) ? result : [];
    }),
  getPublicPromptCasesResult: (...args: unknown[]) =>
    Promise.resolve(getPublicPromptCasesMock(...args)).then((result) => {
      if (
        result &&
        typeof result === 'object' &&
        !Array.isArray(result) &&
        Array.isArray((result as { cases?: unknown }).cases)
      ) {
        return result;
      }
      const cases = Array.isArray(result) ? result : [];
      return {
        cases,
        total: cases.length,
        navigationTotal: cases.length,
        modelCounts: {},
        categoryCounts: {}
      };
    }),
  getPublicPromptLibraryResult: getPublicPromptLibraryResultMock,
  trackPromptCaseEvent: vi.fn()
}));

vi.mock('@/services/marketing-api', () => ({
  getPublicImagePromptAssets: getPublicImagePromptAssetsMock
}));

vi.mock('../../data/image-prompt-asset-catalog-loader', async () => {
  const { imagePromptAssetCatalog } =
    await import('../../data/image-prompt-asset-catalog');
  return {
    loadImagePromptAssetCatalog: () => Promise.resolve(imagePromptAssetCatalog)
  };
});

vi.mock('../MarketingPageShell', () => ({
  useMarketingLocale: () => ({ locale: 'zh-CN' })
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    getAccessToken: () => '',
    isAuthenticated: false,
    user: null
  })
}));

vi.mock('../../lib/analytics', () => ({
  trackPromptCaseCta: vi.fn(),
  trackPromptPreviewCopy: vi.fn(),
  trackPromptPreviewUse: vi.fn(),
  trackPromptPreviewView: vi.fn()
}));

vi.mock('../../lib/client-conversion-events', () => ({
  recordClientConversionEvent: vi.fn()
}));

vi.mock('../../lib/seo', () => ({
  applySeo: applySeoMock
}));

vi.mock('../../components/image-create/ImageLightbox', () => ({
  ImageLightbox: () => null
}));

const promptCase: PromptCase = {
  id: 'case-1',
  slug: 'case-one',
  title: '案例一',
  imageUrl:
    'https://example.supabase.co/storage/v1/object/public/generated-images/case-1.webp',
  prompt: '生成一张高级商业海报',
  promptPreview: '生成一张高级商业海报',
  model: 'GPT Image 2',
  locale: 'zh-CN',
  category: 'poster',
  createdAt: '2026-06-18T10:00:00.000Z'
};

const promptCaseTwo: PromptCase = {
  ...promptCase,
  id: 'case-2',
  slug: 'case-two',
  title: '案例二',
  imageUrl:
    'https://example.supabase.co/storage/v1/object/public/generated-images/case-2.webp',
  createdAt: '2026-06-17T10:00:00.000Z'
};
const pageSource = readFileSync(
  join(process.cwd(), 'src/web/pages/PromptSeoLandingPage.tsx'),
  'utf8'
);
const previewDialogSource = readFileSync(
  join(
    process.cwd(),
    'src/web/pages/prompt-library/PromptCasePreviewDialog.tsx'
  ),
  'utf8'
);
const imageCreateStyleSource = readFileSync(
  join(process.cwd(), 'src/web/styles/image-create.css'),
  'utf8'
);
const marketingStyleSource = readFileSync(
  join(process.cwd(), 'src/web/styles/marketing-pages.css'),
  'utf8'
);

function makePromptCases(count: number): PromptCase[] {
  return Array.from({ length: count }, (_, index) => ({
    ...promptCase,
    id: `case-${String(index + 1).padStart(2, '0')}`,
    slug: `case-${String(index + 1).padStart(2, '0')}`,
    title: `案例 ${index + 1}`,
    imageUrl: `https://example.supabase.co/storage/v1/object/public/generated-images/case-${index + 1}.webp`,
    createdAt: `2026-06-${String(24 - (index % 20)).padStart(2, '0')}T10:00:00.000Z`
  }));
}

function makePromptCase(
  id: string,
  overrides: Partial<PromptCase>
): PromptCase {
  return {
    ...promptCase,
    id,
    slug: id,
    title: overrides.title || `案例 ${id}`,
    imageUrl: `https://example.supabase.co/storage/v1/object/public/generated-images/${id}.webp`,
    createdAt: overrides.createdAt || '2026-06-18T10:00:00.000Z',
    ...overrides
  };
}

function LocationDump() {
  const location = useLocation();
  return (
    <div data-testid="location-dump">
      <span>{location.pathname}</span>
      <pre>{JSON.stringify(location.state || {})}</pre>
    </div>
  );
}

function renderPage(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/zh-CN/prompts" element={<PromptSeoLandingPage />} />
        <Route
          path="/zh-CN/prompts-workspace-test"
          element={<PromptSeoLandingPage workspaceMode />}
        />
        <Route path="/zh-CN/video-prompts" element={<PromptSeoLandingPage />} />
        <Route
          path="/zh-CN/prompts/model/:slug"
          element={<PromptSeoLandingPage />}
        />
        <Route
          path="/zh-CN/prompts/category/:slug"
          element={<PromptSeoLandingPage />}
        />
        <Route
          path="/zh-CN/prompts/package/:slug"
          element={<PromptSeoLandingPage />}
        />
        <Route path="/zh-CN/prompts/:slug" element={<LocationDump />} />
        <Route
          path="/zh-CN/create/prompts/share/:caseId"
          element={<LocationDump />}
        />
        <Route path="/image" element={<LocationDump />} />
        <Route path="/zh-CN/image" element={<LocationDump />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('PromptSeoLandingPage', () => {
  it('adds columns as the prompt library gains usable desktop width', () => {
    expect(
      getResponsiveMasonryColumnCount(
        2260,
        getPromptBrowserMasonryColumnOptions(2260)
      )
    ).toBe(9);
    expect(
      getResponsiveMasonryColumnCount(
        1620,
        getPromptBrowserMasonryColumnOptions(1620)
      )
    ).toBe(8);
    expect(
      getResponsiveMasonryColumnCount(
        1148,
        getPromptBrowserMasonryColumnOptions(1148)
      )
    ).toBe(5);
    expect(
      getResponsiveMasonryColumnCount(
        358,
        getPromptBrowserMasonryColumnOptions(358)
      )
    ).toBe(2);
  });

  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    getPublicPromptCaseMock.mockReset();
    getPublicPromptCasesMock.mockReset();
    getPublicPromptLibraryResultMock.mockReset();
    getPublicImagePromptAssetsMock.mockReset();
    getPublicImagePromptAssetsMock.mockResolvedValue([]);
    applySeoMock.mockClear();
    document.head.innerHTML = '';
    getPublicPromptCasesMock.mockResolvedValue([promptCase]);
    getPublicPromptLibraryResultMock.mockResolvedValue({
      items: [promptCase],
      total: 1,
      pageInfo: { nextCursor: null, hasMore: false },
      facets: {
        models: [
          {
            slug: 'gpt-image-2',
            label: 'GPT Image 2',
            count: 1,
            active: false
          }
        ],
        labels: [
          {
            slug: 'portrait-photography',
            label: '人像摄影',
            count: 1,
            active: false
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
        sort: 'latest',
        limit: 48
      },
      version: 'prompt-library-v2',
      source: 'database'
    });
    getPublicPromptCaseMock.mockResolvedValue(promptCase);
  });

  it('keeps mobile prompt controls at the project touch-target minimum', () => {
    const mobileBlock = marketingStyleSource.match(
      /@media \(max-width: 820px\) \{[\s\S]*?(?=\n@media \(max-width: 640px\)|$)/
    )?.[0];
    expect(mobileBlock).toContain('.prompt-browser-sort-tab,');
    expect(mobileBlock).toContain('.prompt-browser-subnav-pill');
    expect(mobileBlock).toContain('min-height: 44px;');
    expect(mobileBlock).toContain('.prompt-browser-search-form input,');
    expect(mobileBlock).toContain('height: 44px;');
  });

  it('does not apply the standalone prompt sidebar offset inside the create workspace', () => {
    expect(imageCreateStyleSource).toMatch(
      /\.image-create-page-with-side-nav\.create-prompts-route[\s\S]*?\.prompt-browser-page\.is-create-workspace[\s\S]*?\.prompt-browser-main\s*\{[\s\S]*?width:\s*100%;[\s\S]*?max-width:\s*none;[\s\S]*?margin-inline:\s*0;/s
    );
  });

  it('uses the prompt library as the workspace canonical', async () => {
    renderPage('/zh-CN/prompts-workspace-test');

    await waitFor(() => {
      expect(applySeoMock).toHaveBeenCalledWith(
        expect.objectContaining({
          canonical: 'http://localhost:3000/zh-CN/prompts'
        })
      );
    });
  });

  it('keeps the case preview modal on shared overlay behavior', () => {
    expect(pageSource).toMatch(
      /import\s+\{[\s\S]*\buseOverlayBehavior\b[\s\S]*\}\s+from '@\/shared\/ui'/
    );
    expect(previewDialogSource).toContain(
      "import { Button } from '@/shared/ui/radix/button';"
    );
    expect(previewDialogSource).not.toContain('ButtonLink');
    expect(pageSource).toContain(
      'const previewDialogRef = useOverlayBehavior<HTMLElement>'
    );
    expect(pageSource).toContain('closeDisabled: previewLightboxOpen');
    expect(pageSource).toContain('dialogRef={previewDialogRef}');
    expect(previewDialogSource).toContain('ref={dialogRef}');
    expect(previewDialogSource).toContain('tabIndex={-1}');
    expect(previewDialogSource).toContain(
      'className="creator-preview-share-button"'
    );
    expect(previewDialogSource).toContain(
      'className="creator-preview-close-button"'
    );
    expect(pageSource).not.toContain('document.body.style.overflow');
    expect(pageSource).not.toMatch(/event\.key === 'Escape'/);
  });

  it('keeps the visual recipe create CTA compact inside the preview modal', () => {
    expect(imageCreateStyleSource).toMatch(
      /\.creator-preview-recipe-cta\s*\{[\s\S]*?min-height:\s*28px\s*!important;[\s\S]*?height:\s*28px\s*!important;[\s\S]*?padding:\s*0 10px\s*!important;[\s\S]*?box-shadow:\s*none;/s
    );
    expect(imageCreateStyleSource).toMatch(
      /\.creator-preview-recipe-cta\s*>\s*span\s*\{[\s\S]*?text-overflow:\s*ellipsis;/s
    );
  });

  it('does not hydrate the recipe catalog before a preview needs it', async () => {
    renderPage('/zh-CN/prompts');

    await waitFor(() => {
      expect(getPublicPromptLibraryResultMock).toHaveBeenCalled();
    });
    expect(getPublicImagePromptAssetsMock).not.toHaveBeenCalled();
  });

  it('keeps an ineligible video hub noindex after hydration', async () => {
    getPublicPromptLibraryResultMock.mockResolvedValue({
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
      source: 'database'
    });

    renderPage('/zh-CN/video-prompts?utm_source=proof');

    await waitFor(() => {
      expect(applySeoMock).toHaveBeenCalledWith(
        expect.objectContaining({
          canonical: 'http://localhost:3000/zh-CN/video-prompts',
          robots: 'noindex,follow',
          alternates: []
        })
      );
    });
  });

  it('preserves server-rendered prompt case SEO for preview query URLs', async () => {
    document.head.innerHTML = `
      <link rel="canonical" href="https://webtomind.com/zh-CN/create/prompts/share/case-1" />
      <link rel="alternate" hreflang="zh-CN" href="https://webtomind.com/zh-CN/create/prompts/share/case-1" />
      <link rel="alternate" hreflang="en-US" href="https://webtomind.com/en-US/prompts/case-one" />
    `;

    renderPage('/zh-CN/prompts?caseId=case-1');

    await waitFor(() => {
      expect(getPublicPromptLibraryResultMock).toHaveBeenCalled();
    });
    expect(applySeoMock).not.toHaveBeenCalled();
  });

  it('canonicalizes direct preview query URLs to the prompt case once loaded', async () => {
    renderPage('/zh-CN/prompts?caseId=case-1');

    await waitFor(() => {
      expect(applySeoMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '案例一 | WebToMind Prompts',
          canonical: 'http://localhost:3000/zh-CN/prompts/case-one',
          alternates: [
            {
              hreflang: 'zh-CN',
              href: 'http://localhost:3000/zh-CN/prompts/case-one'
            }
          ],
          ogType: 'article'
        })
      );
    });
  });

  it('canonicalizes direct preview query URLs without slugs to share URLs', async () => {
    const shareOnlyCase = makePromptCase('share-only-case', {
      slug: '',
      title: '无 Slug 案例'
    });
    getPublicPromptLibraryResultMock.mockResolvedValue({
      items: [shareOnlyCase],
      total: 1,
      pageInfo: { nextCursor: null, hasMore: false },
      facets: {
        models: [],
        labels: [],
        sorts: []
      },
      queryEcho: {
        locale: 'zh-CN',
        sort: 'latest',
        limit: 48
      },
      version: 'prompt-library-v2',
      source: 'database'
    });

    renderPage('/zh-CN/prompts?caseId=share-only-case');

    await waitFor(() => {
      expect(applySeoMock).toHaveBeenCalledWith(
        expect.objectContaining({
          canonical:
            'http://localhost:3000/zh-CN/create/prompts/share/share-only-case'
        })
      );
    });
  });

  it('shows a loading state while prompt cases are pending', async () => {
    let resolveCases: (cases: PromptCase[]) => void = () => {};
    getPublicPromptCasesMock.mockReturnValue(
      new Promise<PromptCase[]>((resolve) => {
        resolveCases = resolve;
      })
    );

    renderPage('/zh-CN/prompts?promptLibraryLegacy=1');

    expect(
      screen.getByLabelText('正在加载 Prompt 案例')
    ).toBeInTheDocument();
    expect(
      document.querySelectorAll('.prompt-browser-case-card-loading').length
    ).toBeGreaterThan(0);

    resolveCases([promptCase]);

    await waitFor(() => {
      expect(
        screen.getByLabelText('预览 Prompt 案例：案例一')
      ).toBeInTheDocument();
    });
  });

  it('loads the initial prompt case page without truncating visible counts', async () => {
    const rectSpy = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(
        () =>
          ({
            top: 5000,
            right: 0,
            bottom: 5040,
            left: 0,
            width: 0,
            height: 40,
            x: 0,
            y: 5000,
            toJSON: () => ({})
          }) as DOMRect
      );
    getPublicPromptCasesMock.mockResolvedValue(makePromptCases(120));

    renderPage('/zh-CN/prompts?promptLibraryLegacy=1');

    await waitFor(() => {
      expect(getPublicPromptCasesMock).toHaveBeenCalledWith(
        160,
        expect.objectContaining({
          locale: 'zh-CN',
          requireImage: true,
          force: false
        })
      );
    });
    expect(
      await screen.findByText('继续向下浏览，更多案例会自动加载（36/120）')
    ).toBeInTheDocument();
    rectSpy.mockRestore();
  });

  it('uses API model counts for the prompt model navigation', async () => {
    getPublicPromptCasesMock.mockResolvedValue({
      cases: [promptCase],
      total: 42,
      navigationTotal: 42,
      modelCounts: {
        'gpt-image-2': 37,
        'nano-banana': 5,
        seedream: 4,
        'seedream-5-lite': 4,
        'midjourney-v7': 6
      },
      categoryCounts: {}
    });

    renderPage('/zh-CN/prompts?promptLibraryLegacy=1');

    const modelNav = await screen.findByLabelText('Prompt 模型分类');
    expect(
      within(modelNav).getByRole('link', { name: 'ALL' })
    ).toBeInTheDocument();
    expect(
      within(modelNav).getByRole('link', { name: 'GPT Image 2' })
    ).toBeInTheDocument();
    expect(
      within(modelNav).getByRole('link', { name: 'Nano Banana' })
    ).toBeInTheDocument();
    expect(
      within(modelNav).getByRole('link', { name: 'Midjourney' })
    ).toBeInTheDocument();
    expect(
      within(modelNav).getByRole('link', { name: 'Seedream' })
    ).toBeInTheDocument();
  });

  it('falls back to loaded prompt cases when API stats are empty', async () => {
    getPublicPromptCasesMock.mockResolvedValue({
      cases: [
        makePromptCase('gpt-portrait-case', {
          title: 'GPT Image 2 韩系写真案例',
          model: 'GPT Image 2',
          category: 'portrait',
          tags: ['ai-portrait']
        })
      ],
      total: 0,
      navigationTotal: 0,
      modelCounts: {
        'gpt-image-2': 0
      },
      categoryCounts: {
        'portrait-photography': 0
      }
    });

    renderPage('/zh-CN/prompts?promptLibraryLegacy=1');

    const modelNav = await screen.findByLabelText('Prompt 模型分类');
    expect(
      within(modelNav).getByRole('link', { name: 'ALL' })
    ).toBeInTheDocument();
    expect(
      within(modelNav).getByRole('link', { name: 'GPT Image 2' })
    ).toBeInTheDocument();

    const subnav = await screen.findByLabelText('Prompt 标签');
    expect(
      within(subnav).getByRole('link', { name: '人像摄影' })
    ).toHaveAttribute('href', '/zh-CN/prompts?category=portrait-photography');
    expect(screen.getByText('GPT Image 2 韩系写真案例')).toBeInTheDocument();
  });

  it('uses API category counts to keep populated prompt tags visible', async () => {
    getPublicPromptCasesMock.mockResolvedValue({
      cases: [
        makePromptCase('portrait-only-case', {
          title: '韩系人像写真',
          model: 'Nano Banana',
          category: 'portrait',
          tags: ['ai-portrait']
        })
      ],
      total: 6,
      navigationTotal: 12,
      modelCounts: {
        'nano-banana': 12
      },
      categoryCounts: {
        'product-commercial': 4
      }
    });

    renderPage('/zh-CN/prompts/model/nano-banana?promptLibraryLegacy=1');

    const subnav = await screen.findByLabelText('Prompt 标签');
    expect(
      within(subnav).getByRole('link', { name: '商品广告' })
    ).toHaveAttribute(
      'href',
      '/zh-CN/prompts/model/nano-banana?category=product-commercial'
    );
  });

  it('uses the prompt library v2 contract by default', async () => {
    const v2Case = makePromptCase('v2-case', {
      title: 'V2 标签案例',
      model: 'gpt-image-2',
      category: 'portrait-photography',
      tags: []
    });
    getPublicPromptLibraryResultMock.mockResolvedValue({
      items: [v2Case],
      total: 9,
      pageInfo: { nextCursor: null, hasMore: false },
      facets: {
        models: [
          {
            slug: 'gpt-image-2',
            label: 'GPT Image 2',
            count: 9,
            active: true
          },
          {
            slug: 'nano-banana',
            label: 'Nano Banana',
            count: 4,
            active: false
          }
        ],
        labels: [
          {
            slug: 'portrait-photography',
            label: '人像摄影',
            count: 5,
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
        limit: 48
      },
      version: 'prompt-library-v2',
      source: 'database'
    });

    renderPage('/zh-CN/prompts/model/gpt-image-2?label=portrait-photography');

    expect(getPublicPromptLibraryResultMock).toHaveBeenCalledWith(
      expect.objectContaining({
        locale: 'zh-CN',
        model: 'gpt-image-2',
        label: 'portrait-photography',
        sort: 'latest',
        limit: 48,
        requireImage: true
      })
    );
    expect(
      await screen.findByRole('link', {
        name: '预览 Prompt 案例：V2 标签案例'
      })
    ).toBeInTheDocument();
    expect(getPublicPromptCasesMock).not.toHaveBeenCalled();
    const modelNav = await screen.findByLabelText('Prompt 模型分类');
    expect(within(modelNav).getByRole('link', { name: 'ALL' })).toHaveAttribute(
      'href',
      '/zh-CN/prompts?label=portrait-photography'
    );
    expect(
      within(modelNav).getByRole('link', { name: 'GPT Image 2' })
    ).toBeInTheDocument();
    const sortNav = await screen.findByLabelText('Prompt 排序（标签行）');
    expect(within(sortNav).getByRole('link', { name: '精选' })).toHaveAttribute(
      'href',
      '/zh-CN/prompts/model/gpt-image-2?sort=featured'
    );
    const subnav = await screen.findByLabelText('Prompt 标签');
    const portraitLink = within(subnav).getByRole('link', {
      name: '人像摄影'
    });
    expect(portraitLink).toHaveAttribute(
      'href',
      '/zh-CN/prompts/model/gpt-image-2?label=portrait-photography'
    );
    expect(portraitLink).toHaveClass('active');
  });

  it('does not show static prompt cards while v2 cases are loading', async () => {
    let resolveLibrary: (result: PublicPromptLibraryResult) => void = () => {};
    const v2Case = makePromptCase('v2-loaded-case', {
      title: '真实加载案例'
    });
    getPublicPromptLibraryResultMock.mockReturnValue(
      new Promise<PublicPromptLibraryResult>((resolve) => {
        resolveLibrary = resolve;
      })
    );

    renderPage('/zh-CN/prompts');

    expect(
      screen.getByLabelText('正在加载 Prompt 案例')
    ).toBeInTheDocument();
    expect(
      document.querySelectorAll('.prompt-browser-case-card-loading').length
    ).toBeGreaterThan(0);
    expect(
      screen.queryByRole('link', {
        name: /预览 Prompt 案例/
      })
    ).not.toBeInTheDocument();
    expect(getPublicPromptCasesMock).not.toHaveBeenCalled();

    resolveLibrary({
      items: [v2Case],
      total: 1,
      pageInfo: { nextCursor: null, hasMore: false },
      facets: {
        models: [],
        labels: [],
        sorts: []
      },
      queryEcho: {
        locale: 'zh-CN',
        sort: 'featured',
        limit: 48
      },
      version: 'prompt-library-v2',
      source: 'database'
    });

    expect(
      await screen.findByRole('link', {
        name: '预览 Prompt 案例：真实加载案例'
      })
    ).toBeInTheDocument();
  });

  it('renders v2 API items without applying legacy model or category filters', async () => {
    const v2Case = makePromptCase('v2-canonical-case', {
      title: 'RPC 已归一化案例',
      model: 'raw-provider-name',
      category: 'raw-import-category',
      tags: []
    });
    getPublicPromptLibraryResultMock.mockResolvedValue({
      items: [v2Case],
      total: 1,
      pageInfo: { nextCursor: null, hasMore: false },
      facets: {
        models: [
          {
            slug: 'gpt-image-2',
            label: 'GPT Image 2',
            count: 1,
            active: true
          }
        ],
        labels: [
          {
            slug: 'portrait-photography',
            label: '人像摄影',
            count: 1,
            active: true
          }
        ],
        sorts: [
          {
            slug: 'featured',
            label: '精选',
            active: true
          }
        ]
      },
      queryEcho: {
        locale: 'zh-CN',
        model: 'gpt-image-2',
        label: 'portrait-photography',
        sort: 'featured',
        limit: 48
      },
      version: 'prompt-library-v2',
      source: 'database'
    });

    renderPage('/zh-CN/prompts/model/gpt-image-2?label=portrait-photography');

    expect(
      await screen.findByRole('link', {
        name: '预览 Prompt 案例：RPC 已归一化案例'
      })
    ).toBeInTheDocument();
    expect(getPublicPromptCasesMock).not.toHaveBeenCalled();
  });

  it('uses label and sort params for root v2 prompt tag links', async () => {
    renderPage('/zh-CN/prompts');

    expect(
      await screen.findByRole('link', {
        name: '预览 Prompt 案例：案例一'
      })
    ).toBeInTheDocument();

    const sortNav = await screen.findByLabelText('Prompt 排序（标签行）');
    expect(within(sortNav).getByRole('link', { name: '精选' })).toHaveAttribute(
      'href',
      '/zh-CN/prompts?sort=featured'
    );
    expect(within(sortNav).getByRole('link', { name: '最新' })).toHaveAttribute(
      'href',
      '/zh-CN/prompts?sort=latest'
    );
    expect(within(sortNav).getByRole('link', { name: '最热' })).toHaveAttribute(
      'href',
      '/zh-CN/prompts?sort=hot'
    );
    const subnav = await screen.findByLabelText('Prompt 标签');
    expect(
      within(subnav).getByRole('link', { name: '人像摄影' })
    ).toHaveAttribute('href', '/zh-CN/prompts?label=portrait-photography');
    expect(getPublicPromptCasesMock).not.toHaveBeenCalled();
  });

  it('passes latest and hot sort choices through the v2 query', async () => {
    renderPage('/zh-CN/prompts?sort=hot');

    expect(
      await screen.findByRole('link', {
        name: '预览 Prompt 案例：案例一'
      })
    ).toBeInTheDocument();

    expect(getPublicPromptLibraryResultMock).toHaveBeenCalledWith(
      expect.objectContaining({
        locale: 'zh-CN',
        sort: 'hot',
        limit: 48,
        requireImage: true
      })
    );
    const sortNav = await screen.findByLabelText('Prompt 排序（标签行）');
    expect(within(sortNav).getByRole('link', { name: '最热' })).toHaveClass(
      'active'
    );
    expect(within(sortNav).getByRole('link', { name: '最新' })).toHaveAttribute(
      'href',
      '/zh-CN/prompts?sort=latest'
    );
    expect(getPublicPromptCasesMock).not.toHaveBeenCalled();
  });

  it('loads the next v2 cursor page after scrolling without falling back to the legacy list API', async () => {
    const firstCase = makePromptCase('v2-page-one', {
      title: '第一页案例'
    });
    const secondCase = makePromptCase('v2-page-two', {
      title: '第二页案例'
    });
    const facets = {
      models: [
        {
          slug: 'gpt-image-2',
          label: 'GPT Image 2',
          count: 2,
          active: false
        }
      ],
      labels: [
        {
          slug: 'portrait-photography',
          label: '人像摄影',
          count: 2,
          active: false
        }
      ],
      sorts: [
        {
          slug: 'latest',
          label: '最新',
          active: true
        }
      ]
    };
    getPublicPromptLibraryResultMock
      .mockResolvedValueOnce({
        items: [firstCase],
        total: 2,
        pageInfo: { nextCursor: 'offset:1', hasMore: true },
        facets,
        queryEcho: {
          locale: 'zh-CN',
          sort: 'latest',
          limit: 48
        },
        version: 'prompt-library-v2',
        source: 'database'
      })
      .mockResolvedValueOnce({
        items: [secondCase],
        total: 2,
        pageInfo: { nextCursor: null, hasMore: false },
        facets,
        queryEcho: {
          locale: 'zh-CN',
          sort: 'latest',
          cursor: 'offset:1',
          limit: 48
        },
        version: 'prompt-library-v2',
        source: 'database'
      });

    renderPage('/zh-CN/prompts');

    expect(
      await screen.findByRole('link', {
        name: '预览 Prompt 案例：第一页案例'
      })
    ).toBeInTheDocument();
    expect(getPublicPromptLibraryResultMock).toHaveBeenCalledTimes(1);

    fireEvent.scroll(window);

    expect(
      await screen.findByRole(
        'link',
        {
          name: '预览 Prompt 案例：第二页案例'
        },
        {
          timeout: 5_000
        }
      )
    ).toBeInTheDocument();
    expect(getPublicPromptLibraryResultMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        cursor: 'offset:1',
        sort: 'latest',
        limit: 48,
        requireImage: true
      })
    );
    expect(getPublicPromptCasesMock).not.toHaveBeenCalled();
  });

  it('uses the lightweight public-library navigation without duplicating model filters', async () => {
    const { container } = renderPage('/zh-CN/prompts?promptLibraryLegacy=1');

    await waitFor(() => {
      expect(
        screen.getByLabelText('预览 Prompt 案例：案例一')
      ).toBeInTheDocument();
    });

    const sideNav = container.querySelector('.prompt-library-shell-nav');
    expect(sideNav).toBeTruthy();
    const sideNavLabels = Array.from(
      sideNav?.querySelectorAll('nav a') || []
    ).map((item) => item.textContent?.replace(/\s+/g, ' ').trim());
    expect(sideNavLabels).toContain('提示词库');
    expect(sideNav?.querySelector('nav a.active')?.textContent).toContain(
      '提示词库'
    );
    expect(container.querySelector('.create-side-nav')).toBeNull();
    expect(
      container.querySelectorAll('.prompt-library-mobile-nav a')
    ).toHaveLength(6);
    expect(container.querySelector('.prompt-browser-sidebar')).toBeNull();

    const modelNav = screen.getByLabelText('Prompt 模型分类');
    const subnav = screen.getByLabelText('Prompt 标签');
    expect(within(modelNav).getByText('ALL')).toBeInTheDocument();
    expect(
      modelNav.compareDocumentPosition(subnav) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(screen.getByRole('search')).toBeInTheDocument();
  });

  it('scrolls clicked prompt filters into view for desktop overflow navigation', async () => {
    const scrollIntoView = vi.fn();
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView
    });

    try {
      renderPage('/zh-CN/prompts?promptLibraryLegacy=1');

      const subnav = await screen.findByLabelText('Prompt 标签');
      const posterFilter = within(subnav).getByRole('link', {
        name: '海报 KV'
      });
      posterFilter.addEventListener(
        'click',
        (event) => event.preventDefault(),
        { once: true }
      );
      fireEvent.click(posterFilter);

      expect(scrollIntoView).toHaveBeenCalledWith(
        expect.objectContaining({
          block: 'nearest',
          inline: 'center'
        })
      );
    } finally {
      if (originalScrollIntoView) {
        Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
          configurable: true,
          value: originalScrollIntoView
        });
      } else {
        Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
      }
    }
  });

  it('filters prompt cases by the search query', async () => {
    getPublicPromptCasesMock.mockResolvedValue([
      makePromptCase('portrait-case', {
        title: '创始人肖像',
        promptPreview: 'A founder portrait with clean studio lighting.'
      }),
      makePromptCase('headphone-case', {
        title: '耳机商品主图',
        promptPreview: '高端蓝牙耳机电商主图，白底，卖点清晰。'
      })
    ]);

    renderPage('/zh-CN/prompts?q=耳机&promptLibraryLegacy=1');

    expect(await screen.findByText('耳机商品主图')).toBeInTheDocument();
    expect(screen.queryByText('创始人肖像')).not.toBeInTheDocument();
    expect(screen.getByLabelText('搜索提示词案例')).toHaveValue('耳机');
    expect(getPublicPromptCasesMock).toHaveBeenCalledWith(
      900,
      expect.objectContaining({
        locale: 'zh-CN',
        requireImage: true,
        search: '耳机',
        force: true
      })
    );
  });

  it('shows an empty state when no prompt cases are returned', async () => {
    getPublicPromptCasesMock.mockResolvedValue([]);

    renderPage('/zh-CN/prompts?promptLibraryLegacy=1');

    expect(
      await screen.findByText('暂无可展示的 Prompt 案例')
    ).toBeInTheDocument();
  });

  it('shows a no-result state when the active filter has no cases', async () => {
    getPublicPromptCasesMock.mockResolvedValue([promptCase]);

    renderPage('/zh-CN/prompts?filter=featured&promptLibraryLegacy=1');

    expect(await screen.findByText('当前筛选没有匹配案例')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '查看全部案例' })).toHaveAttribute(
      'href',
      '/zh-CN/prompts'
    );
  });

  it('only marks the actual prompt subcategory as active', async () => {
    getPublicPromptCasesMock.mockResolvedValue([
      makePromptCase('portrait-case', {
        title: '创始人肖像',
        model: 'GPT Image 2',
        category: 'portrait',
        promptPreview: 'A studio portrait for a founder profile photo.'
      }),
      makePromptCase('product-case', {
        title: '耳机商品主图',
        model: 'GPT Image 2',
        category: 'ecommerce',
        promptPreview: 'A product hero image for ecommerce product ads.'
      }),
      makePromptCase('ui-case', {
        title: '移动端数据看板 UI',
        model: 'GPT Image 2',
        category: 'featured',
        promptPreview: 'An app UI dashboard mockup with icon grid and charts.'
      })
    ]);

    const { container } = renderPage('/zh-CN/prompts?promptLibraryLegacy=1');

    await screen.findByLabelText('Prompt 标签');
    await waitFor(() => {
      expect(screen.getByText('移动端数据看板 UI')).toBeInTheDocument();
    });

    expect(
      Array.from(
        container.querySelectorAll('.prompt-browser-subnav-pill.active')
      ).map((item) => item.textContent)
    ).toEqual(['ALL']);
  });

  it('shows an error state when primary and fallback case loading fail', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    getPublicPromptCasesMock.mockRejectedValue(new Error('offline'));

    renderPage('/zh-CN/prompts?promptLibraryLegacy=1');

    expect(await screen.findByText('案例暂时不可用')).toBeInTheDocument();
    expect(getPublicPromptCasesMock).toHaveBeenCalledTimes(2);

    warnSpy.mockRestore();
  });

  it('opens the case preview modal from a shared case query', async () => {
    renderPage('/zh-CN/prompts?caseId=case-1&promptLibraryLegacy=1');

    await waitFor(() => {
      expect(screen.getByText('案例预览')).toBeInTheDocument();
    });
    const modal = screen.getByRole('dialog', { name: '案例一' });
    expect(within(modal).getAllByText('案例一').length).toBeGreaterThan(0);
  });

  it('shows a one-line visual recipe in the case preview modal', async () => {
    const beachCase = makePromptCase('beach-case', {
      title: '夏日海边的假期',
      prompt:
        '两个不同气质的韩国瓜子脸美女，青春款比基尼，瓷白肌，低角度仰拍。',
      promptZh:
        '两个不同气质的韩国瓜子脸美女，青春款比基尼，瓷白肌，低角度仰拍。',
      visualRecipe: {
        selection: {
          top: 'top-youthful-bikini-top'
        }
      } as PromptCase['visualRecipe']
    });
    getPublicPromptCaseMock.mockResolvedValue(beachCase);
    getPublicPromptCasesMock.mockResolvedValue([beachCase]);

    renderPage('/zh-CN/prompts?caseId=beach-case&promptLibraryLegacy=1');

    const modal = await screen.findByRole('dialog', {
      name: '夏日海边的假期'
    });
    expect(within(modal).getByLabelText('可视化配方')).toBeInTheDocument();
    expect(within(modal).getByText('韩系瓜子脸辣妹')).toBeInTheDocument();
    expect(within(modal).getByText('青春比基尼上装')).toBeInTheDocument();
    expect(within(modal).getByText('青春比基尼下装')).toBeInTheDocument();

    const recipeRow = modal.querySelector(
      '.creator-preview-recipe-row'
    ) as HTMLDivElement;
    expect(recipeRow).toBeTruthy();
    Object.defineProperty(recipeRow, 'scrollWidth', {
      configurable: true,
      value: 1000
    });
    Object.defineProperty(recipeRow, 'clientWidth', {
      configurable: true,
      value: 260
    });
    recipeRow.scrollLeft = 0;

    const dispatchPointer = (
      type: string,
      init: { clientX: number; button?: number }
    ) => {
      const event = new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        button: init.button ?? 0,
        clientX: init.clientX
      });
      Object.defineProperties(event, {
        isPrimary: { value: true },
        pointerId: { value: 1 }
      });
      fireEvent(recipeRow, event);
    };

    dispatchPointer('pointerdown', { button: 0, clientX: 260 });
    expect(recipeRow.dataset.dragIntent).toBe('pending');
    dispatchPointer('pointermove', { clientX: 120 });
    expect(recipeRow.dataset.dragIntent).toBe('active');
    expect(recipeRow.scrollLeft).toBe(140);

    dispatchPointer('pointerup', { clientX: 120 });
    expect(recipeRow.dataset.dragging).toBe('false');

    recipeRow.scrollLeft = 0;
    dispatchPointer('pointerdown', { button: 0, clientX: 260 });
    dispatchPointer('pointermove', { clientX: 255 });
    expect(recipeRow.dataset.dragging).not.toBe('true');
    expect(recipeRow.scrollLeft).toBe(0);
    dispatchPointer('pointerup', { clientX: 255 });

    dispatchPointer('pointerdown', { button: 0, clientX: 260 });
    dispatchPointer('pointerleave', { clientX: 200 });
    dispatchPointer('pointermove', { clientX: 120 });
    expect(recipeRow.scrollLeft).toBe(140);
    dispatchPointer('pointercancel', { clientX: 120 });
    expect(recipeRow.dataset.dragging).toBe('false');
  });

  it('reveals same-asset cases and more popular cases in the preview modal', async () => {
    const beachCase = makePromptCase('beach-case', {
      title: '夏日海边的假期',
      prompt: '韩国瓜子脸美女，青春款比基尼，低角度仰拍。',
      promptZh: '韩国瓜子脸美女，青春款比基尼，低角度仰拍。',
      visualRecipe: {
        selection: {
          top: 'top-youthful-bikini-top'
        }
      } as PromptCase['visualRecipe']
    });
    const relatedCase = makePromptCase('related-beach', {
      title: '同款海边模板',
      slug: 'related-beach',
      featured: true,
      generateCount: 12,
      visualRecipe: {
        selection: {
          top: 'top-youthful-bikini-top'
        }
      } as PromptCase['visualRecipe']
    });
    const moreCase = makePromptCase('popular-poster', {
      title: '更多海报案例',
      slug: 'popular-poster',
      featured: true,
      generateCount: 8
    });
    getPublicPromptCaseMock.mockResolvedValue(beachCase);
    getPublicPromptCasesMock.mockResolvedValue([
      beachCase,
      relatedCase,
      moreCase
    ]);

    renderPage('/zh-CN/prompts?caseId=beach-case&promptLibraryLegacy=1');

    const modal = await screen.findByRole('dialog', {
      name: '夏日海边的假期'
    });
    expect(within(modal).getByText('按配方创作')).toBeInTheDocument();
    expect(within(modal).getByText('更多热门案例')).toBeInTheDocument();
    expect(within(modal).getByText('更多海报案例')).toBeInTheDocument();

    const topRecipeChip = within(modal)
      .getByText('青春比基尼上装')
      .closest('button');
    expect(topRecipeChip).toBeTruthy();
    fireEvent.click(topRecipeChip!);

    expect(
      within(modal).getByText('使用同款素材的热门案例')
    ).toBeInTheDocument();
    const relatedLink = within(modal).getByRole('link', {
      name: /同款海边模板/
    });
    expect(relatedLink).toHaveAttribute('href', '/zh-CN/prompts/related-beach');
  });

  it('persists prompt case favorites from the prompt case grid', async () => {
    renderPage('/zh-CN/prompts?promptLibraryLegacy=1');

    const favoriteButton = await screen.findByRole('button', {
      name: '收藏案例：案例一'
    });
    expect(favoriteButton).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(favoriteButton);

    expect(favoriteButton).toHaveAttribute('aria-pressed', 'true');
    expect(
      window.localStorage.getItem('webtomind:prompt-case-favorites:v1')
    ).toContain('case-1');
  });

  it('shows saved prompt cases without restoring a separate favorites entry', async () => {
    window.localStorage.setItem(
      'webtomind:prompt-case-favorites:v1',
      JSON.stringify(['case-1'])
    );
    getPublicPromptCaseMock.mockResolvedValue(promptCase);

    renderPage('/zh-CN/prompts?view=favorites');

    expect(
      screen.queryByRole('link', { name: '收藏' })
    ).not.toBeInTheDocument();
    expect(
      await screen.findByLabelText('预览 Prompt 案例：案例一')
    ).toBeInTheDocument();
    expect(getPublicPromptCaseMock).toHaveBeenCalledWith('case-1', {
      locale: 'zh-CN',
      by: 'id'
    });
  });

  it('filters saved prompt cases by the search query', async () => {
    window.localStorage.setItem(
      'webtomind:prompt-case-favorites:v1',
      JSON.stringify(['portrait-case', 'headphone-case'])
    );
    getPublicPromptCaseMock.mockImplementation((caseId: string) =>
      Promise.resolve(
        caseId === 'headphone-case'
          ? makePromptCase('headphone-case', {
              title: '耳机商品主图',
              promptPreview: '高端蓝牙耳机电商主图'
            })
          : makePromptCase('portrait-case', {
              title: '创始人肖像',
              promptPreview: 'A founder portrait.'
            })
      )
    );

    renderPage('/zh-CN/prompts?view=favorites&q=耳机');

    expect(await screen.findByText('耳机商品主图')).toBeInTheDocument();
    expect(screen.queryByText('创始人肖像')).not.toBeInTheDocument();
    expect(screen.getByLabelText('搜索提示词案例')).toHaveValue('耳机');
  });

  it('limits concurrent favorite detail requests', async () => {
    const favoriteIds = Array.from({ length: 8 }, (_, index) => {
      return `favorite-${index + 1}`;
    });
    window.localStorage.setItem(
      'webtomind:prompt-case-favorites:v1',
      JSON.stringify(favoriteIds)
    );
    let activeRequests = 0;
    let maxActiveRequests = 0;
    getPublicPromptCaseMock.mockImplementation(async (caseId: string) => {
      activeRequests += 1;
      maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
      await new Promise((resolve) => window.setTimeout(resolve, 10));
      activeRequests -= 1;
      return makePromptCase(caseId, { title: `收藏 ${caseId}` });
    });

    renderPage('/zh-CN/prompts?view=favorites');

    expect(await screen.findByText('收藏 favorite-8')).toBeInTheDocument();
    expect(maxActiveRequests).toBeLessThanOrEqual(4);
    expect(getPublicPromptCaseMock).toHaveBeenCalledTimes(8);
  });

  it('switches preview images from a shared case query', async () => {
    const multiImageCase = {
      ...promptCase,
      imageUrl:
        'https://example.supabase.co/storage/v1/object/public/generated-images/case-1-a.webp',
      imageUrls: [
        'https://example.supabase.co/storage/v1/object/public/generated-images/case-1-a.webp',
        'https://example.supabase.co/storage/v1/object/public/generated-images/case-1-b.webp'
      ]
    };
    getPublicPromptCaseMock.mockResolvedValue(multiImageCase);
    getPublicPromptCasesMock.mockResolvedValue([multiImageCase, promptCaseTwo]);

    renderPage('/zh-CN/prompts?caseId=case-1&promptLibraryLegacy=1');

    const modal = await screen.findByRole('dialog', { name: '案例一' });
    const activeImage = within(modal).getByAltText(
      '案例一'
    ) as HTMLImageElement;
    expect(activeImage.src).toContain('case-1-a.webp');

    fireEvent.click(within(modal).getByLabelText('下一张图片'));

    await waitFor(() => {
      expect(activeImage.src).toContain('case-1-b.webp');
    });
  });

  it('closes a shared preview after navigating to another case without reopening the stale query case', async () => {
    getPublicPromptCaseMock.mockResolvedValue(promptCase);
    getPublicPromptCasesMock.mockResolvedValue([promptCase, promptCaseTwo]);

    renderPage('/zh-CN/prompts?caseId=case-1&promptLibraryLegacy=1');

    const firstModal = await screen.findByRole('dialog', { name: '案例一' });
    fireEvent.click(within(firstModal).getByLabelText('下一个作品'));

    const secondModal = await screen.findByRole('dialog', { name: '案例二' });
    fireEvent.click(within(secondModal).getByLabelText('关闭预览'));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('copies the canonical prompt detail URL for social sharing', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText }
    });

    renderPage('/zh-CN/prompts?caseId=case-1&promptLibraryLegacy=1');

    const modal = await screen.findByRole('dialog', { name: '案例一' });
    fireEvent.click(within(modal).getByLabelText('复制分享链接'));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(
        'http://localhost:3000/zh-CN/prompts/case-one'
      );
    });
  });

  it('leaves the preview dialog when opening the create CTA', async () => {
    getPublicPromptCaseMock.mockResolvedValue(promptCase);
    getPublicPromptCasesMock.mockResolvedValue([promptCase, promptCaseTwo]);

    renderPage('/zh-CN/prompts?caseId=case-1&promptLibraryLegacy=1');

    const modal = await screen.findByRole('dialog', { name: '案例一' });
    fireEvent.click(within(modal).getByRole('link', { name: '去创作' }));

    const locationDump = await screen.findByTestId('location-dump');
    expect(locationDump).toHaveTextContent('/image');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('fetches full prompt details before copying when the preview case is truncated', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText }
    });
    const previewOnlyCase = makePromptCase('preview-only', {
      title: '截断案例',
      prompt: '',
      promptPreview: '这是一段截断预览...'
    });
    const detailedCase = {
      ...previewOnlyCase,
      promptZh: '这是一段完整中文 Prompt，需要被完整复制。'
    };
    getPublicPromptCasesMock.mockResolvedValue([previewOnlyCase]);
    getPublicPromptCaseMock.mockResolvedValue(detailedCase);

    renderPage('/zh-CN/prompts?promptLibraryLegacy=1');

    fireEvent.click(await screen.findByLabelText('预览 Prompt 案例：截断案例'));
    const modal = await screen.findByRole('dialog', { name: '截断案例' });
    await waitFor(() => {
      expect(
        within(modal).getByText('这是一段完整中文 Prompt，需要被完整复制。')
      ).toBeInTheDocument();
    });
    expect(
      within(modal).queryByText('这是一段截断预览...')
    ).not.toBeInTheDocument();

    fireEvent.click(within(modal).getByRole('button', { name: '复制 Prompt' }));

    await waitFor(() => {
      expect(getPublicPromptCaseMock).toHaveBeenCalledWith('preview-only', {
        by: 'id',
        force: true,
        locale: 'zh-CN'
      });
      expect(writeText).toHaveBeenCalledWith(
        '这是一段完整中文 Prompt，需要被完整复制。'
      );
    });
    expect(writeText).not.toHaveBeenCalledWith('这是一段截断预览...');
  });

  it('retries full prompt loading after a failed preview is closed and reopened', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const previewOnlyCase = makePromptCase('retry-preview', {
      title: '可重试案例',
      prompt: '',
      promptZh: '',
      promptEn: '',
      promptPreview: '暂时只能看到预览...'
    });
    const detailedCase = {
      ...previewOnlyCase,
      promptZh: '重新打开后加载到的完整 Prompt。',
      prompt: '重新打开后加载到的完整 Prompt。'
    };
    getPublicPromptCasesMock.mockResolvedValue([previewOnlyCase]);
    getPublicPromptCaseMock
      .mockRejectedValueOnce(new Error('temporary zh failure'))
      .mockRejectedValueOnce(new Error('temporary en failure'))
      .mockResolvedValue(detailedCase);

    renderPage('/zh-CN/prompts?promptLibraryLegacy=1');

    fireEvent.click(
      await screen.findByLabelText('预览 Prompt 案例：可重试案例')
    );
    const failedModal = await screen.findByRole('dialog', {
      name: '可重试案例'
    });
    await waitFor(() =>
      expect(getPublicPromptCaseMock).toHaveBeenCalledTimes(2)
    );
    fireEvent.click(within(failedModal).getByLabelText('关闭预览'));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('预览 Prompt 案例：可重试案例'));
    const retriedModal = await screen.findByRole('dialog', {
      name: '可重试案例'
    });
    expect(
      await within(retriedModal).findByText('重新打开后加载到的完整 Prompt。')
    ).toBeInTheDocument();
    expect(getPublicPromptCaseMock.mock.calls.length).toBeGreaterThan(2);

    warnSpy.mockRestore();
  });

  it('does not pass truncated preview text to create when full prompt is not loaded yet', async () => {
    const previewOnlyCase = makePromptCase('preview-only-create', {
      title: '截断创作案例',
      prompt: '',
      promptZh: '',
      promptEn: '',
      promptPreview: '这是一段截断预览...'
    });
    getPublicPromptCasesMock.mockResolvedValue([previewOnlyCase]);
    getPublicPromptCaseMock.mockImplementation(
      () => new Promise<PromptCase | null>(() => {})
    );

    renderPage('/zh-CN/prompts?promptLibraryLegacy=1');

    fireEvent.click(
      await screen.findByLabelText('预览 Prompt 案例：截断创作案例')
    );
    const modal = await screen.findByRole('dialog', { name: '截断创作案例' });
    fireEvent.click(within(modal).getByRole('link', { name: '去创作' }));

    const locationDump = await screen.findByTestId('location-dump');
    expect(locationDump).toHaveTextContent('/image');
    expect(locationDump).not.toHaveTextContent('这是一段截断预览...');
    expect(locationDump).not.toHaveTextContent('promptCasePrompt');
  });

  it('keeps first-screen prompt case images eager and responsive', async () => {
    getPublicPromptCasesMock.mockResolvedValue([promptCase, promptCaseTwo]);

    const { container } = renderPage('/zh-CN/prompts?promptLibraryLegacy=1');

    await waitFor(() => {
      expect(
        screen.getByLabelText('预览 Prompt 案例：案例一')
      ).toBeInTheDocument();
    });

    const images = Array.from(
      container.querySelectorAll<HTMLImageElement>(
        '.prompt-browser-case-card img'
      )
    );
    expect(images).toHaveLength(2);
    expect(images[0].getAttribute('loading')).toBe('eager');
    expect(images[0].getAttribute('fetchpriority')).toBe('high');
    expect(images[0].getAttribute('src')).toContain('width=520');
    expect(images[0].getAttribute('src')).toContain('quality=72');
    expect(images[0].getAttribute('srcset')).toContain('width=320');
    expect(images[0].getAttribute('sizes')).toContain('max-width: 520px');

    expect(images[1].getAttribute('loading')).toBe('eager');
    expect(images[1].getAttribute('fetchpriority')).toBe('high');
  });

  it('automatically loads more prompt cases when the user scrolls near the end', async () => {
    const rectSpy = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(
        () =>
          ({
            top: 420,
            right: 0,
            bottom: 460,
            left: 0,
            width: 0,
            height: 40,
            x: 0,
            y: 420,
            toJSON: () => ({})
          }) as DOMRect
      );
    getPublicPromptCasesMock.mockResolvedValue(makePromptCases(60));

    const { container } = renderPage('/zh-CN/prompts?promptLibraryLegacy=1');

    await screen.findByText('继续向下浏览，更多案例会自动加载（36/60）');
    fireEvent.scroll(window);

    await waitFor(() => {
      expect(
        container.querySelectorAll('.prompt-browser-case-card')
      ).toHaveLength(60);
    });
    expect(screen.getByText('已显示全部 60 个案例')).toBeInTheDocument();

    rectSpy.mockRestore();
  });

  it('keeps model sidebar counts global on package pages', async () => {
    const ecommerceCase = makePromptCase('ecommerce-case', {
      title: 'GPT Image 2 商品主图 Prompt',
      model: 'GPT Image 2',
      category: 'ecommerce',
      packageSlug: 'ecommerce-product-photo',
      tags: ['gpt-image-2', 'product-images']
    });
    const seedreamCase = makePromptCase('seedream-case', {
      title: 'Seedream 护肤品主图 Prompt 案例',
      model: 'seedream-5-lite',
      category: 'ecommerce',
      packageSlug: 'ecommerce-product-photo',
      tags: ['seedream', 'product-images']
    });
    const nanoCase = makePromptCase('nano-case', {
      title: 'Nano Banana 图库封面 GPT Image 2 Prompt',
      model: 'GPT Image 2',
      category: 'poster',
      packageSlug: 'nano-banana-prompts',
      tags: ['nano-banana-prompts']
    });
    const xiaohongshuCase = makePromptCase('xiaohongshu-case', {
      title: '小红书封面视觉导演 Prompt',
      model: 'GPT Image 2',
      category: 'poster',
      packageSlug: 'xiaohongshu-cover',
      tags: ['gpt-image-2', 'xiaohongshu-cover']
    });
    const allCases = [ecommerceCase, seedreamCase, nanoCase, xiaohongshuCase];
    getPublicPromptCasesMock.mockImplementation((_, options = {}) => {
      if (options.packageSlug === 'ecommerce-product-photo') {
        return Promise.resolve([ecommerceCase, seedreamCase]);
      }
      return Promise.resolve(allCases);
    });

    renderPage(
      '/zh-CN/prompts/package/ecommerce-product-photo?promptLibraryLegacy=1'
    );

    const sidebar = screen.getByLabelText('Prompt 模型分类');
    await waitFor(() => {
      expect(
        within(sidebar).getByRole('link', { name: 'ALL' })
      ).toBeInTheDocument();
    });
    expect(
      within(sidebar).getByRole('link', { name: 'GPT Image 2' })
    ).toBeInTheDocument();
    expect(
      within(sidebar).getByRole('link', { name: 'Nano Banana' })
    ).toBeInTheDocument();
    expect(
      within(sidebar).getByRole('link', { name: 'Seedream' })
    ).toBeInTheDocument();
    expect(screen.getByText('已显示全部 2 个案例')).toBeInTheDocument();
  });

  it('hides subcategory links that have no cases for the active model', async () => {
    const nanoCase = makePromptCase('nano-case', {
      title: 'Nano Banana 图库封面 GPT Image 2 Prompt',
      model: 'Nano Banana',
      category: 'poster',
      packageSlug: 'nano-banana-prompts',
      tags: ['nano-banana-prompts']
    });
    const nanoCoverCase = makePromptCase('nano-cover-case', {
      title: 'Nano Banana 视频封面 Prompt',
      model: 'Nano Banana',
      category: 'cover',
      packageSlug: 'nano-banana-prompts',
      tags: ['nano-banana-prompts', 'social-cover']
    });
    const ecommerceCase = makePromptCase('ecommerce-case', {
      title: 'GPT Image 2 商品主图 Prompt',
      model: 'GPT Image 2',
      category: 'ecommerce',
      packageSlug: 'ecommerce-product-photo',
      tags: ['gpt-image-2', 'product-images']
    });
    const srefCase = makePromptCase('sref-case', {
      title: 'SREF 时装肖像风格参考 GPT Image 2 Prompt',
      model: 'GPT Image 2',
      category: 'background',
      packageSlug: 'sref-prompts',
      tags: ['gpt-image-2', 'sref']
    });
    getPublicPromptCasesMock.mockResolvedValue([
      nanoCase,
      nanoCoverCase,
      ecommerceCase,
      srefCase
    ]);

    renderPage('/zh-CN/prompts/model/nano-banana?promptLibraryLegacy=1');

    const subnav = await screen.findByLabelText('Prompt 标签');
    await waitFor(() => {
      expect(
        within(subnav).queryByRole('link', { name: '商品广告' })
      ).not.toBeInTheDocument();
    });
    expect(
      within(subnav).queryByRole('link', { name: '风格改写' })
    ).not.toBeInTheDocument();
    expect(
      within(subnav).getByRole('link', { name: '封面缩略图' })
    ).toHaveAttribute(
      'href',
      '/zh-CN/prompts/model/nano-banana?category=social-cover-thumbnail'
    );
  });

  it('filters subcategory pills inside the active model URL', async () => {
    const nanoPortraitCase = makePromptCase('nano-portrait-case', {
      title: 'Nano Banana 编辑肖像 GPT Image 2 Prompt',
      model: 'Nano Banana',
      category: 'portrait',
      packageSlug: 'nano-banana-prompts',
      tags: ['nano-banana-prompts', 'ai-portrait', '个人品牌摄影']
    });
    const nanoProductCase = makePromptCase('nano-product-case', {
      title: 'Nano Banana 商品组合 GPT Image 2 Prompt',
      model: 'Nano Banana',
      category: 'ecommerce',
      packageSlug: 'nano-banana-prompts',
      tags: ['nano-banana-prompts', 'product-images']
    });
    const nanoSocialCase = makePromptCase('nano-social-case', {
      title: 'Nano Banana 图库封面 GPT Image 2 Prompt',
      model: 'Nano Banana',
      category: 'poster',
      packageSlug: 'nano-banana-prompts',
      tags: ['nano-banana-prompts', 'xiaohongshu-cover']
    });
    const nanoCharacterCase = makePromptCase('nano-character-case', {
      title: 'Nano Banana 角色设定 Prompt',
      model: 'Nano Banana',
      category: 'character',
      packageSlug: 'nano-banana-prompts',
      tags: ['nano-banana-prompts', 'character']
    });
    getPublicPromptCasesMock.mockResolvedValue([
      nanoPortraitCase,
      nanoProductCase,
      nanoSocialCase,
      nanoCharacterCase
    ]);

    renderPage(
      '/zh-CN/prompts/model/nano-banana?category=product-commercial&promptLibraryLegacy=1'
    );

    const subnav = await screen.findByLabelText('Prompt 标签');
    expect(
      within(subnav).getByRole('link', { name: '商品广告' })
    ).toHaveAttribute(
      'href',
      '/zh-CN/prompts/model/nano-banana?category=product-commercial'
    );
    await waitFor(() => {
      expect(
        screen.getByText('Nano Banana 商品组合 GPT Image 2 Prompt')
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByText('Nano Banana 编辑肖像 GPT Image 2 Prompt')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('Nano Banana 图库封面 GPT Image 2 Prompt')
    ).not.toBeInTheDocument();
  });

  it('links GPT Image 2 pages to portrait, SREF and product prompt support pages', async () => {
    getPublicPromptCasesMock.mockResolvedValue([
      makePromptCase('gpt-portrait-case', {
        title: 'GPT Image 2 创始人肖像 Prompt',
        model: 'GPT Image 2',
        category: 'portrait',
        tags: ['gpt-image-2', 'ai-portrait']
      }),
      makePromptCase('gpt-sref-case', {
        title: 'SREF 时装肖像风格参考 GPT Image 2 Prompt',
        model: 'GPT Image 2',
        category: 'background',
        tags: ['gpt-image-2', 'sref']
      }),
      makePromptCase('gpt-product-case', {
        title: 'GPT Image 2 电商耳机主图 Prompt',
        model: 'GPT Image 2',
        category: 'ecommerce',
        tags: ['gpt-image-2', 'product-images']
      }),
      makePromptCase('gpt-poster-case', {
        title: 'GPT Image 2 电影海报 Prompt',
        model: 'GPT Image 2',
        category: 'poster',
        tags: ['gpt-image-2', 'poster']
      })
    ]);

    renderPage('/zh-CN/prompts/model/gpt-image-2?promptLibraryLegacy=1');

    await waitFor(() => {
      expect(
        screen.getByText('GPT Image 2 提示词案例与生成器')
      ).toBeInTheDocument();
    });

    expect(
      screen
        .getAllByRole('link', { name: '人像摄影' })
        .some(
          (item) =>
            item.getAttribute('href') ===
            '/zh-CN/prompts/model/gpt-image-2?category=portrait-photography'
        )
    ).toBe(true);
    expect(screen.getByRole('link', { name: 'SREF 风格参考' })).toHaveAttribute(
      'href',
      '/zh-CN/prompts/category/sref-prompts'
    );
    expect(screen.getByRole('link', { name: '商品摄影' })).toHaveAttribute(
      'href',
      '/zh-CN/prompts/category/product-images'
    );
  });

  it('keeps validated SEO long-tail copy in shared prompt topic content', () => {
    const gptImage2 = getPromptSeoPage('model', 'gpt-image-2');
    const nanoBanana = getPromptSeoPage('model', 'nano-banana');
    const portrait = getPromptSeoPage('category', 'ai-portrait');

    expect(gptImage2?.keywords.en).toEqual(
      expect.arrayContaining([
        'free GPT Image 2 prompts',
        'GPT Image 2 prompt examples',
        'AI portrait prompts',
        'portrait prompt examples'
      ])
    );
    expect(gptImage2?.sections?.map((section) => section.title.zh)).toContain(
      '已验证长尾词的承接方式'
    );
    expect(gptImage2?.faq.map((item) => item.question.zh)).toContain(
      'GPT Image 2 prompt examples、AI portrait prompts 和 portrait prompt examples 应该分开建页吗？'
    );

    expect(nanoBanana?.keywords.en).toEqual(
      expect.arrayContaining([
        'Nano Banana prompts gallery',
        'Nano Banana prompt examples'
      ])
    );
    expect(nanoBanana?.sections?.map((section) => section.title.zh)).toContain(
      'Nano Banana prompts gallery 承接策略'
    );
    expect(nanoBanana?.faq.map((item) => item.question.zh)).toContain(
      'Nano Banana prompts gallery 应该放哪些案例？'
    );

    expect(portrait?.keywords.en).toEqual(
      expect.arrayContaining([
        'AI portrait prompts',
        'portrait prompt examples',
        'free AI portrait prompts'
      ])
    );
    expect(portrait?.sections?.map((section) => section.title.en)).toContain(
      'Free AI portrait prompt examples'
    );

    expect(
      getPromptSeoPublicCases({
        kind: 'model',
        slug: 'gpt-image-2',
        locale: 'en-US',
        limit: 8
      }).some((caseItem) => caseItem.tags.includes('portrait prompt examples'))
    ).toBe(true);
    expect(
      getPromptSeoPublicCases({
        kind: 'model',
        slug: 'nano-banana',
        locale: 'en-US',
        limit: 8
      }).some((caseItem) =>
        caseItem.tags.includes('Nano Banana prompts gallery')
      )
    ).toBe(true);
  });

  it('uses case metadata in create URLs instead of embedding full prompt text', () => {
    const createPath = getPromptCaseCreatePath(
      {
        ...promptCase,
        prompt: 'a'.repeat(900)
      },
      '?source=x_launch&utm_source=x&utm_medium=social'
    );
    const url = new URL(createPath, 'https://webtomind.com');

    expect(url.pathname).toBe('/image');
    expect(url.searchParams.get('source')).toBe('prompt_preview_cta');
    expect(url.searchParams.get('refSource')).toBe('x_launch');
    expect(url.searchParams.get('utm_source')).toBe('x');
    expect(url.searchParams.get('caseId')).toBe('case-1');
    expect(url.searchParams.get('caseSlug')).toBe('case-one');
    expect(url.searchParams.has('promptCasePrompt')).toBe(false);
  });

  it('routes video prompt cases to the video creator', () => {
    const createPath = getPromptCaseCreatePath({
      ...promptCase,
      id: 'video-case',
      slug: 'video-case',
      mediaType: 'video',
      videoUrl: 'https://example.com/video.mp4'
    });
    const url = new URL(createPath, 'https://webtomind.com');

    expect(url.pathname).toBe('/video');
    expect(url.searchParams.get('caseId')).toBe('video-case');
    expect(url.searchParams.get('source')).toBe('prompt_preview_cta');
  });

  it('shows a refresh-failure notice with retry when cached data cannot refresh', async () => {
    const cacheKey = `webtomind:prompt-library-v2:${getPromptLibraryQueryKey({
      locale: 'zh-CN',
      sort: 'latest',
      limit: 48
    })}:with-image`;
    window.sessionStorage.setItem(
      cacheKey,
      JSON.stringify({
        expiresAt: Date.now() + 60_000,
        result: {
          items: [promptCase],
          total: 1,
          pageInfo: { nextCursor: null, hasMore: false },
          facets: { models: [], labels: [], sorts: [] },
          queryEcho: { locale: 'zh-CN', sort: 'latest', limit: 48 },
          version: 'prompt-library-v2',
          source: 'database'
        }
      })
    );

    let rejectFetch!: (error: Error) => void;
    getPublicPromptLibraryResultMock.mockReturnValue(
      new Promise<PublicPromptLibraryResult>((_resolve, reject) => {
        rejectFetch = reject;
      })
    );

    renderPage('/zh-CN/prompts');

    await act(async () => {
      rejectFetch(new Error('案例库加载失败。'));
    });

    expect(
      screen.getByText('后台刷新失败，当前展示缓存内容。')
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    expect(getPublicPromptLibraryResultMock).toHaveBeenCalledTimes(2);
  });
});
