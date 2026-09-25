import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ReactNode } from 'react';
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation as useRouterLocation
} from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateHomePage } from '../CreateHomePage';

const testState = vi.hoisted(() => ({
  getPublicPromptLibraryResult: vi.fn(),
  getVisualImageHistoryResult: vi.fn(),
  getVisualImageModels: vi.fn(),
  uploadImageReference: vi.fn(),
  isAuthenticated: false,
  trackEvent: vi.fn()
}));

vi.mock('@/services/agent-api', () => ({
  getPublicPromptLibraryResult: testState.getPublicPromptLibraryResult,
  getVisualImageHistoryResult: testState.getVisualImageHistoryResult,
  getVisualImageModels: testState.getVisualImageModels,
  uploadImageReference: testState.uploadImageReference
}));

vi.mock('../../components/image-create/CreateWorkspaceFrame', () => ({
  CreateWorkspaceFrame: ({
    children,
    className
  }: {
    children: ReactNode;
    className?: string;
  }) => <main className={className}>{children}</main>
}));

vi.mock('../../components/image-create/CreateOnboardingModal', () => ({
  CreateOnboardingModal: () => null,
  hasSeenCreateOnboarding: () => true
}));

vi.mock('../../components/image-create/DeepFeaturePaywallModal', () => ({
  DeepFeaturePaywallModal: () => null
}));

vi.mock('../../components/image-create/useMembershipStatus', () => ({
  useMembershipStatus: () => ({
    loading: false,
    isMember: true
  })
}));

vi.mock('../../components/image-create/ImageLightbox', () => ({
  ImageLightbox: () => null
}));

vi.mock('../../components/AuthModal', () => ({
  useAuthModal: () => ({ openAuthModal: vi.fn() })
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    isAuthenticated: testState.isAuthenticated,
    isLoading: false
  })
}));

vi.mock('../../lib/analytics', () => ({
  trackEvent: testState.trackEvent
}));

vi.mock('../../lib/seo', () => ({
  applySeo: () => () => {}
}));

vi.mock('../../hooks/useImagePromptAssetCatalog', async () => {
  const { imagePromptAssetCatalog } =
    await import('../../data/image-prompt-asset-catalog');
  return {
    useImagePromptAssetCatalog: () => imagePromptAssetCatalog
  };
});

function renderHome(initialPath = '/en-US/create') {
  function LocationDump() {
    const routeLocation = useRouterLocation();
    return (
      <div data-testid="location-dump">
        {JSON.stringify({
          pathname: routeLocation.pathname,
          search: routeLocation.search,
          state: routeLocation.state
        })}
      </div>
    );
  }

  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/en-US/create" element={<CreateHomePage />} />
        <Route path="/zh-CN/create" element={<CreateHomePage />} />
        <Route path="/zh-CN/image" element={<LocationDump />} />
        <Route path="/en-US/image" element={<LocationDump />} />
        <Route path="/zh-CN/prompts/:slug" element={<div>Prompt Detail</div>} />
        <Route path="/en-US/prompts/:slug" element={<div>Prompt Detail</div>} />
      </Routes>
    </MemoryRouter>
  );
}

function makePromptLibraryResult(items: Array<Record<string, unknown>>) {
  return {
    version: 'prompt-library-v2',
    source: 'test',
    total: items.length,
    items,
    facets: {
      models: [],
      labels: []
    },
    pageInfo: {
      nextCursor: null,
      hasMore: false
    }
  };
}

describe('CreateHomePage inspiration modules', () => {
  beforeEach(() => {
    testState.getPublicPromptLibraryResult.mockReset();
    testState.getVisualImageHistoryResult.mockReset();
    testState.getVisualImageModels.mockReset();
    testState.uploadImageReference.mockReset();
    testState.trackEvent.mockReset();
    testState.isAuthenticated = false;
    window.localStorage.clear();
    window.sessionStorage.clear();
    testState.getPublicPromptLibraryResult.mockReturnValue(
      new Promise(() => {})
    );
    testState.getVisualImageModels.mockResolvedValue({
      enabled: true,
      models: []
    });
    testState.getVisualImageHistoryResult.mockResolvedValue({
      items: [],
      total: 0
    });
    vi.stubGlobal(
      'IntersectionObserver',
      vi.fn(function IntersectionObserverMock(
        this: unknown,
        callback: IntersectionObserverCallback
      ) {
        return {
          observe: (target: Element) => {
            callback(
              [
                {
                  target,
                  isIntersecting: true,
                  intersectionRatio: 1
                } as IntersectionObserverEntry
              ],
              this as IntersectionObserver
            );
          },
          unobserve: vi.fn(),
          disconnect: vi.fn(),
          takeRecords: vi.fn(() => []),
          root: null,
          rootMargin: '',
          thresholds: [0]
        };
      })
    );
  });

  it('omits theme cards and apps from the English inspiration page', () => {
    renderHome();

    expect(
      screen.queryByRole('heading', { name: 'Theme cards', level: 2 })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', {
        name: 'What image do you need today?',
        level: 2
      })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'All apps' })
    ).not.toBeInTheDocument();
  });

  it('omits theme cards and apps from the Chinese inspiration page', () => {
    renderHome('/zh-CN/create');

    expect(
      screen.queryByRole('heading', { name: '主题卡片', level: 2 })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', {
        name: '今天要完成什么画面？',
        level: 2
      })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: '全部应用' })
    ).not.toBeInTheDocument();
  });

  it('keeps composer rewards out of the input box and moves cost into start CTA', () => {
    renderHome('/zh-CN/create');

    expect(screen.queryByText(/新手任务/)).not.toBeInTheDocument();
    expect(screen.queryByText(/积分奖励上限/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^预计 \d+ 积分$/)).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /进入创作 · \d+积分/ })
    ).toBeInTheDocument();
  });

  it('renders the activity banner after the image composer', () => {
    renderHome();

    const composer = screen
      .getByRole('textbox', { name: /Example:/ })
      .closest('.create-home-hero');
    const banner = screen.getByLabelText('Creation highlights');

    expect(composer).not.toBeNull();
    expect(
      composer!.compareDocumentPosition(banner) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it('uploads references on the home page and carries them into image creation', async () => {
    testState.isAuthenticated = true;
    testState.uploadImageReference.mockResolvedValue({
      id: 'reference-home-1',
      label: 'cover',
      role: 'style',
      thumbnailUrl: 'https://example.com/reference.webp',
      imageUrl: 'https://example.com/reference.webp',
      createdAt: new Date().toISOString()
    });
    renderHome('/zh-CN/create');

    const fileInput = document.querySelector<HTMLInputElement>(
      '.create-home-reference-upload-panel input[type="file"]'
    );
    expect(fileInput).not.toBeNull();

    fireEvent.change(fileInput!, {
      target: {
        files: [
          new File(['fake-image'], 'cover.png', {
            type: 'image/png'
          })
        ]
      }
    });

    await waitFor(() => {
      expect(testState.uploadImageReference).toHaveBeenCalledWith(
        expect.objectContaining({
          mimeType: 'image/png',
          role: 'style',
          label: 'cover'
        })
      );
    });

    expect(await screen.findByText('已上传 1 张参考图')).toBeInTheDocument();

    fireEvent.change(
      screen.getByRole('textbox', {
        name: /例如：为 AI 工具教程生成/
      }),
      {
        target: {
          value: '用 @image1 的角色做一张夏日海报'
        }
      }
    );
    fireEvent.click(screen.getByRole('button', { name: /进入创作 · \d+积分/ }));

    const locationDump = JSON.parse(
      screen.getByTestId('location-dump').textContent || '{}'
    );
    expect(locationDump.pathname).toBe('/zh-CN/image');
    expect(locationDump.search).toContain('referenceImageIds=reference-home-1');
    expect(locationDump.state.referenceImageIds).toEqual(['reference-home-1']);
    expect(locationDump.state.promptCasePrompt).toBe(
      '用 @image1 的角色做一张夏日海报'
    );
  });

  it('shows a local thumbnail while uploading, then renders a removable prompt tag', async () => {
    testState.isAuthenticated = true;
    let resolveUpload:
      | ((reference: {
          id: string;
          label: string;
          role: string;
          thumbnailUrl: string;
          createdAt: string;
        }) => void)
      | undefined;
    testState.uploadImageReference.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveUpload = resolve;
        })
    );
    renderHome('/zh-CN/create');

    const fileInput = document.querySelector<HTMLInputElement>(
      '.create-home-reference-upload-panel input[type="file"]'
    );
    fireEvent.change(fileInput!, {
      target: {
        files: [
          new File(['fake-image'], 'portrait.png', {
            type: 'image/png'
          })
        ]
      }
    });

    await waitFor(() => {
      const pendingImage = document.querySelector<HTMLImageElement>(
        '.create-home-prompt-reference-item.is-uploading img'
      );
      expect(pendingImage?.alt).toBe('portrait.png');
      expect(pendingImage?.src).toContain('data:image/png');
      expect(
        document.querySelector(
          '.create-home-prompt-reference-loading [class*="lucide-loader"]'
        )
      ).not.toBeNull();
    });

    resolveUpload?.({
      id: 'reference-home-loading-1',
      label: 'portrait',
      role: 'style',
      thumbnailUrl: 'https://example.com/portrait.webp',
      createdAt: new Date().toISOString()
    });

    const removeButton = await screen.findByRole('button', {
      name: '移除图片 1'
    });
    expect(screen.getByText('图片 1')).toBeInTheDocument();
    expect(screen.getByText('@image1')).toBeInTheDocument();
    fireEvent.click(removeButton);
    await waitFor(() => {
      expect(screen.queryByText('@image1')).not.toBeInTheDocument();
    });
  });

  it('keeps prompt case preview overlay behavior on the shared contract', () => {
    const pageSource = readFileSync(
      join(process.cwd(), 'src/web/pages/CreateHomePage.tsx'),
      'utf8'
    );

    expect(pageSource).toContain('useOverlayBehavior<HTMLElement>');
    expect(pageSource).toContain('closeDisabled: caseLightboxOpen');
    expect(pageSource).toContain('ref={casePreviewModalRef}');
    expect(pageSource).toContain('tabIndex={-1}');
    expect(pageSource).not.toContain('document.body.style.overflow');
  });

  it('reuses prompt library sort tabs for the home prompt cases module', async () => {
    testState.getPublicPromptLibraryResult.mockResolvedValue(
      makePromptLibraryResult([
        {
          id: 'featured-case',
          slug: 'featured-case',
          title: '精选案例',
          imageUrl: 'https://example.com/featured.webp',
          prompt: 'featured prompt',
          model: 'gpt-image-2',
          locale: 'zh-CN',
          category: 'portrait',
          createdAt: '2026-07-01T00:00:00.000Z'
        }
      ])
    );

    renderHome('/zh-CN/create');

    const sortNav = await screen.findByLabelText('推荐案例排序');
    expect(sortNav).toHaveClass('prompt-browser-sort-tabs');
    expect(screen.getByRole('link', { name: '精选' })).toHaveClass('active');

    fireEvent.click(screen.getByRole('link', { name: '最热' }));

    await waitFor(() => {
      expect(testState.getPublicPromptLibraryResult).toHaveBeenLastCalledWith(
        expect.objectContaining({
          locale: 'zh-CN',
          sort: 'hot',
          limit: 24,
          requireImage: true
        })
      );
    });
    expect(screen.getByRole('link', { name: '最热' })).toHaveClass('active');
  });

  it('keeps prompt library favorite behavior on the home masonry cards', async () => {
    testState.getPublicPromptLibraryResult.mockResolvedValue(
      makePromptLibraryResult([
        {
          id: 'favorite-case',
          slug: 'favorite-case',
          title: '可收藏案例',
          imageUrl: 'https://example.com/favorite.webp',
          prompt: 'favorite prompt',
          model: 'gpt-image-2',
          locale: 'zh-CN',
          category: 'portrait',
          createdAt: '2026-07-01T00:00:00.000Z'
        }
      ])
    );

    renderHome('/zh-CN/create');

    const favoriteButton = await screen.findByRole('button', {
      name: '收藏案例：可收藏案例'
    });
    expect(favoriteButton).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(favoriteButton);

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: '取消收藏案例：可收藏案例' })
      ).toHaveAttribute('aria-pressed', 'true');
    });
  });

  it('shows visual recipe and more cases inside prompt case preview', async () => {
    testState.getPublicPromptLibraryResult.mockResolvedValue(
      makePromptLibraryResult([
        {
          id: 'case-recipe',
          slug: 'case-recipe',
          title: '海边写真案例',
          imageUrl: 'https://example.com/case-recipe.webp',
          imageUrls: ['https://example.com/case-recipe.webp'],
          prompt: '海边写真，年轻角色，城市转角',
          promptPreview: '海边写真，年轻角色',
          model: 'gpt-image-2',
          locale: 'zh-CN',
          category: 'portrait',
          visualRecipe: {
            selection: {
              character: 'character-arcane-apprentice',
              background: 'background-city-corner'
            }
          }
        },
        {
          id: 'case-related',
          slug: 'case-related',
          title: '同款人设案例',
          imageUrl: 'https://example.com/case-related.webp',
          prompt: '同款人设街拍',
          model: 'gpt-image-2',
          locale: 'zh-CN',
          category: 'portrait',
          featured: true,
          visualRecipe: {
            selection: {
              character: 'character-arcane-apprentice'
            }
          }
        },
        {
          id: 'case-more',
          slug: 'case-more',
          title: '更多热门案例样张',
          imageUrl: 'https://example.com/case-more.webp',
          prompt: '更多热门案例',
          model: 'gpt-image-2',
          locale: 'zh-CN',
          category: 'poster'
        }
      ])
    );

    renderHome('/zh-CN/create');

    fireEvent.click(
      await screen.findByRole('link', {
        name: /预览 Prompt 案例：海边写真案例/
      })
    );

    expect(await screen.findByLabelText('可视化配方')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /按配方创作/ })
    ).toBeInTheDocument();
    expect(screen.getByText('使用同款素材的热门案例')).toBeInTheDocument();
    expect(screen.getAllByText('同款人设案例').length).toBeGreaterThan(0);
    expect(screen.getByText('更多热门案例')).toBeInTheDocument();
    expect(screen.getAllByText('更多热门案例样张').length).toBeGreaterThan(0);
  });

  it('keeps the create composer usable on narrow screens', () => {
    const imageCreateCss = readFileSync(
      join(process.cwd(), 'src/web/styles/image-create.css'),
      'utf8'
    );

    expect(imageCreateCss).toMatch(
      /\.create-home-promptbox\s*\{[\s\S]*?container-type:\s*inline-size;[\s\S]*?\}/
    );
    expect(imageCreateCss).toMatch(
      /\.create-home-promptbox-body\s*\{[\s\S]*?grid-template-columns:\s*100px\s+minmax\(0,\s*1fr\);[\s\S]*?align-items:\s*start;[\s\S]*?\}/
    );
    expect(imageCreateCss).toMatch(
      /\.create-home-reference-upload\s*\{[\s\S]*?align-items:\s*center;[\s\S]*?min-height:\s*118px;[\s\S]*?border:\s*1px\s+dashed[\s\S]*?text-align:\s*center;[\s\S]*?\}/
    );
    expect(imageCreateCss).toMatch(
      /\.create-home-prompt-editor\s*\{[\s\S]*?min-height:\s*148px;[\s\S]*?border:\s*1px\s+solid[\s\S]*?border-radius:\s*10px;[\s\S]*?\}/
    );
    expect(imageCreateCss).toMatch(
      /\.create-home-prompt-reference-loading\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?backdrop-filter:\s*blur\(1px\);[\s\S]*?\}/
    );
    expect(imageCreateCss).toMatch(
      /\.create-home-prompt-reference-remove\s*\{[\s\S]*?width:\s*44px;[\s\S]*?opacity:\s*0;[\s\S]*?pointer-events:\s*none;[\s\S]*?\}/
    );
    expect(imageCreateCss).toMatch(
      /\.create-home-prompt-reference-item:hover[\s\S]*?\.create-home-prompt-reference-remove,[\s\S]*?\.create-home-prompt-reference-item:focus-within[\s\S]*?\.create-home-prompt-reference-remove\s*\{[\s\S]*?opacity:\s*1;[\s\S]*?pointer-events:\s*auto;[\s\S]*?\}/
    );
    expect(imageCreateCss).toMatch(
      /\.create-home-promptbox-foot\s*\{[\s\S]*?flex-wrap:\s*wrap;[\s\S]*?overflow:\s*visible;[\s\S]*?\}/
    );
    expect(imageCreateCss).toMatch(
      /\.create-home-promptbox-foot button,[\s\S]*?\.create-home-promptbox-foot a,[\s\S]*?\{[\s\S]*?flex:\s*0\s+0\s+auto;[\s\S]*?white-space:\s*nowrap;[\s\S]*?\}/
    );
    expect(imageCreateCss).toMatch(
      /@container\s*\(max-width:\s*420px\)\s*\{[\s\S]*?\.create-home-promptbox-body\s*\{[\s\S]*?grid-template-columns:\s*88px\s+minmax\(0,\s*1fr\);[\s\S]*?\}/
    );
    expect(imageCreateCss).toMatch(
      /@media\s*\(max-width:\s*840px\)\s*\{[\s\S]*?\.create-home-promptbox-foot\s*\{[\s\S]*?flex-direction:\s*row;[\s\S]*?flex-wrap:\s*wrap;[\s\S]*?overflow:\s*visible;[\s\S]*?\}/
    );
    expect(imageCreateCss).toContain(
      '.image-create-page-with-side-nav.create-home-route .create-workspace-page'
    );
    expect(imageCreateCss).toMatch(
      /@media\s*\(min-width:\s*761px\)\s*and\s*\(max-width:\s*920px\)\s*\{[\s\S]*?\.image-create-page-with-side-nav\.create-home-route \.create-workspace-page[\s\S]*?max-width:\s*calc\(100vw\s*-\s*var\(--create-side-nav-offset\)\s*-\s*20px\);/
    );
  });
});
