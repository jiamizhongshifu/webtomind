import { createRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { PromptCase } from '@/services/agent-api';
import { imagePromptAssetCatalog as imagePromptAssets } from '@/web/data/image-prompt-asset-catalog';
import { PromptCasePreviewDialog } from '../PromptCasePreviewDialog';

vi.mock('@/web/components/image-create/PhotoSwipeViewer', () => ({
  PhotoSwipeViewer: () => null
}));

const previewCase: PromptCase = {
  id: 'preview-case',
  slug: 'preview-case',
  title: 'Preview case',
  imageUrl: 'https://example.com/preview-a.png',
  imageUrls: [
    'https://example.com/preview-a.png',
    'https://example.com/preview-b.png'
  ],
  prompt: 'A useful prompt',
  promptZh: '中文提示词',
  promptEn: 'English prompt',
  model: 'GPT Image 2',
  locale: 'zh-CN',
  category: 'portrait-photography',
  commercialIntent: 'Social cover',
  createdAt: '2026-07-02T08:00:00.000Z'
};

function renderDialog(
  overrides: Partial<React.ComponentProps<typeof PromptCasePreviewDialog>> = {}
) {
  const closePreviewCase = vi.fn();
  const setPreviewImageIndex = vi.fn();
  const setPreviewLightboxOpen = vi.fn();
  const toggleFavorite = vi.fn();
  const goToPreviewImage = vi.fn();
  const handleCopyPreviewPrompt = vi.fn(async () => undefined);
  const handleCopyPreviewShareUrl = vi.fn(async () => undefined);
  const handleUsePreviewPrompt = vi.fn();

  const props: React.ComponentProps<typeof PromptCasePreviewDialog> = {
    previewCase,
    locale: 'zh-CN',
    isZh: true,
    locationSearch: '?source=test',
    dialogRef: createRef<HTMLElement>(),
    activePreviewImage: previewCase.imageUrls?.[0] || '',
    activePreviewVideo: '',
    isActivePreviewVideo: false,
    previewCaseImages: previewCase.imageUrls || [],
    activePreviewImageIndex: 0,
    canNavigatePreviewImages: true,
    canNavigatePreviewCases: false,
    previewLightboxOpen: false,
    copyToastText: '',
    copiedShareUrl: false,
    previewVisualRecipeSelection: null,
    previewVisualRecipeCards: [],
    previewActiveRecipeAssetId: null,
    previewActiveRecipeAsset: null,
    previewRelatedRecipeCases: [],
    previewRecipeFallbackCases: [],
    previewMorePromptCases: [],
    isFavorited: (caseId) => caseId === 'preview-case',
    toggleFavorite,
    closePreviewCase,
    setPreviewImageIndex,
    setPreviewLightboxOpen,
    setPreviewActiveRecipeAssetId: vi.fn(),
    goToPreviewImage,
    goToPreviewCase: vi.fn(),
    handleCopyPreviewPrompt,
    handleCopyPreviewShareUrl,
    handleUsePreviewPrompt,
    getPromptCaseDetailPath: (caseItem) => `/zh-CN/prompts/${caseItem.slug}`,
    getPromptCaseCreatePath: (caseItem) =>
      `/create/image?caseId=${caseItem.id}`,
    getVisualRecipeSlotLabel: (slot) => slot,
    ...overrides
  };

  const result = render(
    <MemoryRouter>
      <PromptCasePreviewDialog {...props} />
    </MemoryRouter>
  );
  return {
    ...result,
    closePreviewCase,
    setPreviewImageIndex,
    setPreviewLightboxOpen,
    toggleFavorite,
    goToPreviewImage,
    handleCopyPreviewPrompt,
    handleCopyPreviewShareUrl,
    handleUsePreviewPrompt
  };
}

describe('PromptCasePreviewDialog', () => {
  it('renders nothing without an active preview case', () => {
    const { container } = renderDialog({ previewCase: null });
    expect(container).toBeEmptyDOMElement();
  });

  it('renders preview actions and delegates state changes', () => {
    const {
      closePreviewCase,
      setPreviewImageIndex,
      setPreviewLightboxOpen,
      toggleFavorite,
      goToPreviewImage,
      handleCopyPreviewPrompt,
      handleCopyPreviewShareUrl,
      handleUsePreviewPrompt
    } = renderDialog();

    expect(
      screen.getByRole('dialog', { name: 'Preview case' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: '查看详情页' })
    ).not.toBeInTheDocument();

    expect(screen.getByText('中文提示词')).toBeInTheDocument();
    expect(screen.queryByText('English prompt')).not.toBeInTheDocument();
    expect(screen.queryByText('Social cover')).not.toBeInTheDocument();

    expect(screen.getByText('免费用户每日 1 张')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: '去创作' }));
    expect(handleUsePreviewPrompt).toHaveBeenCalledWith(previewCase);

    fireEvent.click(screen.getByRole('button', { name: '取消收藏案例' }));
    expect(toggleFavorite).toHaveBeenCalledWith('preview-case');

    fireEvent.click(screen.getByRole('button', { name: '复制分享链接' }));
    expect(handleCopyPreviewShareUrl).toHaveBeenCalledWith(previewCase);

    fireEvent.click(screen.getByRole('button', { name: '复制 Prompt' }));
    expect(handleCopyPreviewPrompt).toHaveBeenCalledWith(previewCase, 'zh-CN');

    fireEvent.click(screen.getByRole('tab', { name: 'English' }));
    expect(screen.getByText('English prompt')).toBeInTheDocument();
    expect(screen.queryByText('中文提示词')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '复制 Prompt' }));
    expect(handleCopyPreviewPrompt).toHaveBeenLastCalledWith(
      previewCase,
      'en-US'
    );

    fireEvent.click(screen.getByRole('button', { name: '全屏查看图片' }));
    expect(setPreviewLightboxOpen).toHaveBeenCalledWith(true);

    fireEvent.click(
      screen.getByRole('button', { name: '查看第 2 张案例图片' })
    );
    expect(setPreviewImageIndex).toHaveBeenCalledWith(1);

    fireEvent.click(screen.getByRole('button', { name: '下一张图片' }));
    expect(goToPreviewImage).toHaveBeenCalledWith(1);

    fireEvent.click(screen.getByRole('button', { name: '关闭预览' }));
    expect(closePreviewCase).toHaveBeenCalled();
  });

  it('does not show a Chinese prompt inside the English prompt tab', () => {
    renderDialog({
      previewCase: {
        ...previewCase,
        prompt: '中文兜底 Prompt',
        promptZh: '中文兜底 Prompt',
        promptEn: '中文污染 English Prompt 字段',
        promptPreviewEn: '中文污染 English Preview 字段'
      }
    });

    fireEvent.click(screen.getByRole('tab', { name: 'English' }));

    expect(screen.queryByText('中文兜底 Prompt')).not.toBeInTheDocument();
    expect(
      screen.queryByText('中文污染 English Prompt 字段')
    ).not.toBeInTheDocument();
    expect(screen.getByText('英文 Prompt 暂未翻译')).toBeInTheDocument();
  });

  it('opens the PhotoSwipe fullscreen viewer when requested', () => {
    renderDialog({ previewLightboxOpen: true });
    expect(
      screen.getAllByRole('dialog', { name: 'Preview case' })
    ).toHaveLength(1);
    expect(
      screen.getByRole('button', { name: '关闭预览' })
    ).toBeInTheDocument();
  });

  it('uses the shared visual recipe link contract', () => {
    const asset = imagePromptAssets[0];
    const handleUsePreviewPrompt = vi.fn();

    renderDialog({
      previewVisualRecipeCards: [{ slot: asset.slot, asset }],
      handleUsePreviewPrompt
    });

    const createLink = screen.getByRole('link', { name: '按配方创作' });
    expect(createLink).toHaveAttribute(
      'href',
      '/create/image?caseId=preview-case'
    );
    expect(createLink).not.toHaveAttribute('aschild');

    fireEvent.click(createLink);
    expect(handleUsePreviewPrompt).toHaveBeenCalledWith(previewCase);
  });
});
