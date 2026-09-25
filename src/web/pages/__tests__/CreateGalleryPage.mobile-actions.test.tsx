import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  VisualImageHistoryItem,
  VisualVideoGenerationItem
} from '@/services/agent-api';
import { imagePromptAssets } from '../../data/image-prompt-core';
import { CreateGalleryPage } from '../CreateGalleryPage';

const testState = vi.hoisted(() => ({
  getVisualImageHistoryResult: vi.fn(),
  getVisualVideoHistoryResult: vi.fn(),
  importGenerationAsReference: vi.fn(),
  loadVisualImageHistoryBlobUrl: vi.fn(),
  refreshVisualImageHistoryItem: vi.fn(),
  setVisualImageFavorite: vi.fn(),
  setVisualVideoFavorite: vi.fn(),
  getProjects: vi.fn(),
  saveSummary: vi.fn(),
  completeRewardTaskOnce: vi.fn()
}));

vi.mock('../lib/seo', () => ({
  applySeo: () => () => {}
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    isAuthenticated: true,
    isLoading: false,
    getAccessToken: () => 'test-token',
    user: { email: 'creator@example.com' }
  })
}));

vi.mock('../../components/image-create/useMembershipStatus', () => ({
  useMembershipStatus: () => ({
    loading: false,
    isMember: true,
    isFree: false,
    planId: 'pro'
  })
}));

vi.mock('../../components/image-create/CreateWorkspaceFrame', () => ({
  CreateWorkspaceFrame: ({
    className = '',
    children
  }: {
    className?: string;
    children: ReactNode;
  }) => <main className={`image-create-page ${className}`}>{children}</main>
}));

vi.mock('../../components/image-create/DeepFeaturePaywallModal', () => ({
  DeepFeaturePaywallModal: () => null
}));

vi.mock('../../components/image-create/ImageLightbox', () => ({
  ImageLightbox: () => null
}));

vi.mock('@/services/agent-api', () => ({
  getVisualImageHistoryResult: testState.getVisualImageHistoryResult,
  getVisualVideoHistoryResult: testState.getVisualVideoHistoryResult,
  importGenerationAsReference: testState.importGenerationAsReference,
  loadVisualImageHistoryBlobUrl: testState.loadVisualImageHistoryBlobUrl,
  refreshVisualImageHistoryItem: testState.refreshVisualImageHistoryItem,
  setVisualImageFavorite: testState.setVisualImageFavorite,
  setVisualVideoFavorite: testState.setVisualVideoFavorite
}));

vi.mock('@/services/workspace-api', () => ({
  getProjects: testState.getProjects,
  saveSummary: testState.saveSummary
}));

vi.mock('@/services/reward-task-events', () => ({
  REWARD_TASK_IDENTIFIERS: {
    createOrOpenBoard: 'create-or-open-board',
    reuseGalleryGeneration: 'reuse-gallery-generation'
  },
  completeRewardTaskOnce: testState.completeRewardTaskOnce
}));

const galleryItem: VisualImageHistoryItem = {
  id: 'gallery-1',
  imageUrl: 'https://cdn.example.com/gallery-1.png',
  thumbnailUrl: 'https://cdn.example.com/gallery-1-thumb.png',
  previewUrl: 'https://cdn.example.com/gallery-1-preview.png',
  prompt: '一张适合创作者继续复用的历史图片',
  negativePrompt: '',
  provider: 'tuzi',
  model: 'gpt-image-2',
  modelLabel: 'GPT Image',
  aspectRatio: '4:5',
  imageSize: '1024x1280',
  quality: 'high',
  outputFormat: 'png',
  assetIds: [imagePromptAssets[0].id],
  createdAt: '2026-06-18T10:00:00.000Z'
};

const videoItem: VisualVideoGenerationItem = {
  generationId: 'video-asset-1',
  videoUrl: 'https://cdn.example.com/video-asset-1.mp4',
  posterUrl: 'https://cdn.example.com/video-asset-1.jpg',
  prompt: '一段保存在资产库里的晨雾电影镜头',
  model: 'doubao-seedance-2-0-fast',
  modelLabel: 'Seedance 2.0 Fast',
  aspectRatio: '16:9',
  duration: 5,
  isFavorite: false,
  createdAt: '2026-06-19T10:00:00.000Z'
};

function renderGalleryPage() {
  return render(
    <MemoryRouter initialEntries={['/create/gallery']}>
      <Routes>
        <Route path="/create/gallery" element={<CreateGalleryPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('CreateGalleryPage mobile action hierarchy', () => {
  beforeEach(() => {
    testState.getVisualImageHistoryResult.mockResolvedValue({
      items: [galleryItem],
      total: 1
    });
    testState.getVisualVideoHistoryResult.mockResolvedValue({
      items: [],
      hasMore: false
    });
    testState.getProjects.mockResolvedValue([]);
    testState.importGenerationAsReference.mockResolvedValue({ id: 'ref-1' });
    testState.loadVisualImageHistoryBlobUrl.mockResolvedValue(
      'blob:gallery-history-image'
    );
    testState.refreshVisualImageHistoryItem.mockResolvedValue(null);
    testState.setVisualImageFavorite.mockResolvedValue({
      id: galleryItem.id,
      isFavorite: true
    });
    testState.setVisualVideoFavorite.mockResolvedValue({
      id: videoItem.generationId,
      isFavorite: true
    });
    class MockIntersectionObserver {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    }
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('keeps mobile low-frequency gallery actions behind the more sheet', async () => {
    const view = renderGalleryPage();

    expect(
      await screen.findByText(/2026\/6\/18 \d{2}:00:00/)
    ).toBeInTheDocument();

    const moreButton = await screen.findByRole('button', {
      name: '更多操作'
    });
    expect(moreButton).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: '图片资产操作' })).toBeNull();

    fireEvent.click(moreButton);

    const actionSheet = screen.getByRole('dialog', { name: '图片资产操作' });
    expect(actionSheet.closest('.create-gallery-card')).toBeNull();
    const sheetActions = within(actionSheet)
      .getAllByRole('button')
      .filter((button) => button.getAttribute('aria-label') !== '关闭');

    expect(sheetActions.map((button) => button.textContent?.trim())).toEqual([
      '作为参考图',
      '继续编辑',
      '加入收藏'
    ]);

    const card = view.container.querySelector('.create-gallery-card');
    expect(
      card?.querySelectorAll('.create-gallery-actions button')
    ).toHaveLength(3);
    expect(card?.querySelectorAll('.create-gallery-more-button')).toHaveLength(
      1
    );
  });

  it('loads the Gallery favorites category from image history metadata', async () => {
    renderGalleryPage();
    await screen.findByText(/2026\/6\/18 \d{2}:00:00/);

    fireEvent.click(screen.getByRole('tab', { name: '收藏' }));

    await waitFor(() =>
      expect(testState.getVisualImageHistoryResult).toHaveBeenLastCalledWith(
        30,
        0,
        { favorite: true }
      )
    );
    expect(testState.getVisualVideoHistoryResult).toHaveBeenLastCalledWith({
      limit: 30,
      favorite: true
    });
  });

  it('moves model filtering and refresh into a mobile action sheet', async () => {
    renderGalleryPage();
    await screen.findByText(/2026\/6\/18 \d{2}:00:00/);

    fireEvent.click(
      screen.getByRole('button', {
        name: '筛选资产库'
      })
    );

    const filterSheet = screen.getByRole('dialog', { name: '资产库筛选' });
    expect(
      within(filterSheet).getByRole('button', { name: '全部模型' })
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      within(filterSheet).getByRole('button', { name: 'GPT Image' })
    ).toBeInTheDocument();
    expect(
      within(filterSheet).getByRole('button', { name: '刷新资产库' })
    ).toBeInTheDocument();

    fireEvent.click(
      within(filterSheet).getByRole('button', { name: 'GPT Image' })
    );

    expect(screen.queryByRole('dialog', { name: '资产库筛选' })).toBeNull();
    expect(
      screen.getByRole('button', {
        name: '筛选资产库，当前模型 GPT Image'
      })
    ).toBeInTheDocument();
  });

  it('skips expired R2 URLs and reads the authenticated history content directly', async () => {
    const expiredUrl =
      'https://example.r2.cloudflarestorage.com/image.png?X-Amz-Date=20260716T000000Z&X-Amz-Expires=86400';
    testState.getVisualImageHistoryResult.mockResolvedValue({
      items: [
        {
          ...galleryItem,
          imageUrl: expiredUrl,
          thumbnailUrl: expiredUrl,
          previewUrl: expiredUrl
        }
      ],
      total: 1
    });

    renderGalleryPage();

    await waitFor(() =>
      expect(testState.loadVisualImageHistoryBlobUrl).toHaveBeenCalledWith(
        galleryItem.id,
        'thumbnail'
      )
    );
  });

  it('does not mount an entry paywall before the user chooses a gated action', async () => {
    renderGalleryPage();

    expect(
      await screen.findByText(/2026\/6\/18 \d{2}:00:00/)
    ).toBeInTheDocument();
    expect(document.querySelector('.deep-feature-paywall-backdrop')).toBeNull();
  });

  it('reuses the visual recipe summary above the preview prompt', async () => {
    const view = renderGalleryPage();
    await screen.findByText(/2026\/6\/18 \d{2}:00:00/);

    const card = view.container.querySelector('.create-gallery-card');
    expect(card).not.toBeNull();
    fireEvent.click(card as HTMLElement);

    const dialog = screen.getByRole('dialog', { name: '图片资产预览' });
    const recipe = within(dialog).getByRole('region', {
      name: '可视化配方'
    });
    const prompt = dialog.querySelector('.creator-preview-prompt');
    expect(recipe).toBeInTheDocument();
    expect(recipe.textContent).toContain(imagePromptAssets[0].title);
    expect(
      recipe.compareDocumentPosition(prompt as Node) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      within(recipe).getByRole('button', { name: '按配方创作' })
    ).toBeInTheDocument();
  });

  it('merges persisted video history into the asset library and reuses the video preview', async () => {
    testState.getVisualVideoHistoryResult.mockResolvedValue({
      items: [videoItem],
      hasMore: false
    });

    const view = renderGalleryPage();

    expect(
      await screen.findByRole('heading', { name: '资产库' })
    ).toBeInTheDocument();
    expect(await screen.findByText('Seedance 2.0 Fast')).toBeInTheDocument();
    const videoCard = view.container.querySelector(
      '.create-gallery-card.is-video'
    );
    expect(videoCard).not.toBeNull();
    fireEvent.click(
      within(videoCard as HTMLElement).getByRole('button', {
        name: '更多操作'
      })
    );
    const videoSheet = screen.getByRole('dialog', { name: '视频资产操作' });
    expect(
      within(videoSheet).getByRole('button', { name: '预览视频' })
    ).toBeInTheDocument();
    expect(
      within(videoSheet).getByRole('button', { name: '再次创作' })
    ).toBeInTheDocument();
    expect(
      within(videoSheet).getByRole('button', { name: '加入收藏' })
    ).toBeInTheDocument();
    expect(
      within(videoSheet).getByRole('button', { name: '下载视频' })
    ).toBeInTheDocument();
    fireEvent.click(within(videoSheet).getByRole('button', { name: '关闭' }));
    fireEvent.click(videoCard as HTMLElement);
    const videoDialog = screen.getByRole('dialog', {
      name: /Video detail|视频详情/
    });
    expect(videoDialog).toBeInTheDocument();
    expect(
      within(videoDialog).getByRole('button', {
        name: /Re-edit|重新编辑/
      })
    ).toBeInTheDocument();
    fireEvent.click(
      within(videoDialog).getByRole('button', {
        name: /加入收藏|Add to favorites/
      })
    );
    await waitFor(() =>
      expect(testState.setVisualVideoFavorite).toHaveBeenCalledWith(
        videoItem.generationId,
        true
      )
    );
  });

  it('opens the video in a new tab when downloading from the asset library', async () => {
    testState.getVisualVideoHistoryResult.mockResolvedValue({
      items: [videoItem],
      hasMore: false
    });
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    const view = renderGalleryPage();

    expect(
      await screen.findByRole('heading', { name: '资产库' })
    ).toBeInTheDocument();
    const videoCard = view.container.querySelector(
      '.create-gallery-card.is-video'
    );
    expect(videoCard).not.toBeNull();
    fireEvent.click(
      within(videoCard as HTMLElement).getByRole('button', {
        name: '更多操作'
      })
    );
    const videoSheet = screen.getByRole('dialog', { name: '视频资产操作' });
    fireEvent.click(
      within(videoSheet).getByRole('button', { name: '下载视频' })
    );

    expect(openSpy).toHaveBeenCalledWith(
      videoItem.videoUrl,
      '_blank',
      'noopener,noreferrer'
    );
    openSpy.mockRestore();
  });

  it('keeps image assets visible when video history is temporarily unavailable', async () => {
    testState.getVisualVideoHistoryResult.mockRejectedValue(
      new Error('video history unavailable')
    );

    renderGalleryPage();

    expect(
      await screen.findByText(/2026\/6\/18 \d{2}:00:00/)
    ).toBeInTheDocument();
    expect(
      await screen.findByText('视频资产加载失败：video history unavailable')
    ).toBeInTheDocument();
  });

  it('loads the next gallery page from the visible sentinel', async () => {
    const nextGalleryItem: VisualImageHistoryItem = {
      ...galleryItem,
      id: 'gallery-2',
      imageUrl: 'https://cdn.example.com/gallery-2.png',
      thumbnailUrl: 'https://cdn.example.com/gallery-2-thumb.png',
      prompt: '第二张可复用历史图片',
      createdAt: '2026-06-18T15:34:47'
    };
    testState.getVisualImageHistoryResult
      .mockResolvedValueOnce({ items: [galleryItem], total: 2 })
      .mockResolvedValueOnce({ items: [nextGalleryItem], total: 2 });

    renderGalleryPage();

    fireEvent.click(
      await screen.findByRole('button', {
        name: '继续下滑加载更多'
      })
    );

    await waitFor(() =>
      expect(testState.getVisualImageHistoryResult).toHaveBeenLastCalledWith(
        30,
        1,
        { favorite: false }
      )
    );
    expect(await screen.findByText('第二张可复用历史图片')).toBeInTheDocument();
    expect(await screen.findByText(/2026\/6\/18 15:34:47/)).toBeInTheDocument();
  });

  it('keeps the mobile stylesheet hiding the direct action group and showing more', () => {
    const pageSource = readFileSync(
      join(process.cwd(), 'src/web/pages/CreateGalleryPage.tsx'),
      'utf8'
    );
    const mobileCss = readFileSync(
      join(process.cwd(), 'src/web/styles/image-create-mobile.css'),
      'utf8'
    );
    const desktopCss = readFileSync(
      join(process.cwd(), 'src/web/styles/image-create.css'),
      'utf8'
    );
    const galleryActionCss = readFileSync(
      join(process.cwd(), 'src/web/styles/create-gallery-actions.css'),
      'utf8'
    );
    const galleryActionSource = readFileSync(
      join(
        process.cwd(),
        'src/web/components/image-create/GalleryActionControls.tsx'
      ),
      'utf8'
    );
    const primitiveCss = readFileSync(
      join(process.cwd(), 'src/design/ui-primitives.css'),
      'utf8'
    );

    expect(mobileCss).toMatch(
      /\.create-gallery-route\s+\.create-gallery-actions\s*\{[^}]*display:\s*none;/s
    );
    expect(mobileCss).toMatch(
      /\.create-gallery-route\s+\.create-gallery-more-button\s*\{[^}]*display:\s*inline-flex;/s
    );
    expect(mobileCss).toMatch(
      /\.create-gallery-route\s+\.create-gallery-more-button\s*\{[^}]*min-width:\s*44px;[^}]*min-height:\s*44px;/s
    );
    expect(galleryActionCss).toMatch(
      /@media\s*\(max-width:\s*1024px\),\s*\(hover:\s*none\),\s*\(pointer:\s*coarse\)\s*\{[\s\S]*?\.create-gallery-route\s+\.create-gallery-actions,[\s\S]*?display:\s*none;[\s\S]*?\.create-gallery-route\s+\.create-gallery-more-button\s*\{[\s\S]*?display:\s*inline-flex;[\s\S]*?min-width:\s*44px;[\s\S]*?min-height:\s*44px;/s
    );
    expect(desktopCss).toMatch(
      /@media\s*\(max-width:\s*1024px\),\s*\(hover:\s*none\),\s*\(pointer:\s*coarse\)\s*\{[\s\S]*?\.creator-preview-head\s+button\s*\{[\s\S]*?min-width:\s*46px;[\s\S]*?min-height:\s*46px;/s
    );
    expect(desktopCss).toMatch(
      /@media\s*\(max-width:\s*520px\),\s*\(max-height:\s*760px\)\s+and\s+\(pointer:\s*coarse\)\s*\{[\s\S]*?\.create-gallery-preview-modal\s+\.creator-preview-head,[\s\S]*?\.creator-history-preview-modal\s+\.creator-preview-head\s*\{[\s\S]*?grid-template-areas:[\s\S]*?['"]title close['"][\s\S]*?['"]actions actions['"];/s
    );
    expect(desktopCss).toMatch(
      /@media\s*\(max-width:\s*520px\),\s*\(max-height:\s*760px\)\s+and\s+\(pointer:\s*coarse\)\s*\{[\s\S]*?\.creator-preview-head\s+\.creator-preview-head-action-row\s*\{[\s\S]*?display:\s*flex\s*!important;[\s\S]*?overflow-x:\s*auto;/s
    );
    expect(desktopCss).toMatch(
      /@media\s*\(max-width:\s*520px\),\s*\(max-height:\s*760px\)\s+and\s+\(pointer:\s*coarse\)\s*\{[\s\S]*?\.creator-preview-head\s+\.creator-preview-head-action-row[\s\S]*?button,[\s\S]*?\.creator-preview-head\s+\.creator-preview-head-action-row[\s\S]*?a\s*\{[\s\S]*?width:\s*auto\s*!important;[\s\S]*?min-width:\s*112px\s*!important;/s
    );
    expect(desktopCss).toMatch(
      /@media\s*\(max-width:\s*360px\)\s+and\s+\(pointer:\s*coarse\)\s*\{[\s\S]*?\.create-gallery-preview-modal[\s\S]*?\.creator-preview-head-action-row[\s\S]*?min-width:\s*104px\s*!important;/s
    );
    expect(desktopCss).toMatch(
      /\.creator-preview-head:has\(\.creator-preview-share-button\)[\s\S]*?grid-template-areas:[\s\S]*?['"]title share close['"][\s\S]*?['"]actions actions actions['"];/s
    );
    expect(mobileCss).not.toMatch(
      /grid-template-areas:[\s\S]*?"title close"[\s\S]*?"actions actions";/s
    );
    expect(desktopCss).toMatch(
      /@media\s*\(pointer:\s*coarse\)\s+and\s+\(max-width:\s*1024px\)\s*\{[\s\S]*?\.create-side-nav\s*\{[\s\S]*?display:\s*none;[\s\S]*?\.create-mobile-nav\s*\{[\s\S]*?display:\s*grid;/s
    );
    expect(desktopCss).toMatch(
      /@media\s*\(pointer:\s*coarse\)\s+and\s+\(min-width:\s*700px\)\s+and\s+\(max-width:\s*1024px\)\s*\{[\s\S]*?\.create-gallery-route\s+\.create-gallery-grid\s*\{[\s\S]*?gap:\s*14px;/s
    );
    expect(primitiveCss).toMatch(
      /\.ui-dialog-layer,\s*[\s\S]*?\.ui-action-sheet-layer\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?z-index:\s*var\(--z-modal,\s*1000\);/s
    );
    expect(galleryActionCss).toMatch(
      /\.create-gallery-action-sheet\s+\.ui-action-sheet__body\s*>\s*button\s*\{[\s\S]*?min-height:\s*44px;/s
    );
    expect(pageSource).toMatch(
      /import\s*\{[\s\S]*\bCard\b[\s\S]*\buseOverlayBehavior\b[\s\S]*\}\s*from\s*['"]@\/shared\/ui['"]/
    );
    expect(pageSource).toContain('GalleryCardActionControls');
    expect(pageSource).toContain('GalleryActionSheet');
    expect(galleryActionSource).toMatch(
      /import\s*\{\s*ActionSheet,\s*Button,\s*IconButton\s*\}\s*from\s*['"]@\/shared\/ui['"]/
    );
    expect(pageSource).toContain(
      'const previewDialogRef = useOverlayBehavior<HTMLElement>({'
    );
    expect(pageSource).toContain('open: Boolean(previewItem)');
    expect(pageSource).toContain('closeDisabled: Boolean(lightboxItem)');
    expect(pageSource).toContain('ref={previewDialogRef}');
    expect(desktopCss).not.toMatch(
      /\.creator-preview-actions\s*\{[^}]*position:\s*(fixed|absolute|sticky)/s
    );
  });
});

describe('CreateGalleryPage shadcn toolbar and feedback contracts', () => {
  it('uses shadcn primitives for the gallery toolbar, empty states, and feedback alerts', () => {
    const pageSource = readFileSync(
      join(process.cwd(), 'src/web/pages/CreateGalleryPage.tsx'),
      'utf8'
    );
    const toolbarStart = pageSource.indexOf(
      '<div className="create-gallery-toolbar">'
    );
    const toolbarSource = pageSource.slice(
      toolbarStart,
      pageSource.indexOf('</div>\n        </div>\n        <p>', toolbarStart)
    );

    expect(pageSource).toMatch(
      /import\s*\{[\s\S]*\bAlert\b[\s\S]*\bButton\b[\s\S]*\bEmpty\b[\s\S]*\bInput\b[\s\S]*\bSelectRoot\b[\s\S]*\}\s*from\s*['"]@\/shared\/ui['"]/
    );
    expect(pageSource).not.toContain('@/shared/ui/radix/');

    expect(toolbarSource).toContain('<Input');
    expect(toolbarSource).toContain('<SelectRoot');
    expect(toolbarSource).toContain('<SelectTrigger');
    expect(toolbarSource).toContain(
      '<SelectItem value="all">全部模型</SelectItem>'
    );
    expect(toolbarSource).toContain('<Button');
    expect(toolbarSource).not.toContain('<input');
    expect(toolbarSource).not.toContain('<select');
    expect(toolbarSource).not.toContain('<option');

    expect(pageSource).toContain('<Empty className="create-empty-state">');
    expect(pageSource).toContain(
      '<SupportErrorNotice\n          className="create-inline-error"'
    );
    expect(pageSource).toContain('<Alert className="create-inline-status">');
    expect(pageSource).not.toContain(
      '{error && <div className="create-inline-error">{error}</div>}'
    );
    expect(pageSource).not.toContain(
      '{status && <div className="create-inline-status">{status}</div>}'
    );
  });
});
