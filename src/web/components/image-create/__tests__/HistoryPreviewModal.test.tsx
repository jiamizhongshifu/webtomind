import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { VisualImageHistoryItem } from '@/services/agent-api';
import { useVisualImageCache } from '@/shared/useVisualImageCache';
import {
  HistoryPreviewModal,
  type HistoryPreviewModalProps
} from '../HistoryPreviewModal';
import { imagePromptAssetCatalog as imagePromptAssets } from '@/web/data/image-prompt-asset-catalog';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) =>
      options?.defaultValue || key
  })
}));

vi.mock('@/shared/useVisualImageCache', () => ({
  useVisualImageCache: vi.fn(
    ({ sourceUrl }: { sourceUrl?: string | null }) => sourceUrl || ''
  )
}));

const historyItem: VisualImageHistoryItem = {
  id: 'generation-1',
  imageUrl: 'https://cdn.example.com/original.png',
  previewUrl: 'https://cdn.example.com/preview.png',
  thumbnailUrl: 'https://cdn.example.com/thumb.png',
  prompt: 'A close portrait',
  provider: 'openai',
  model: 'gpt-image-2',
  modelLabel: 'GPT Image 2',
  aspectRatio: '9:16',
  actualImageSize: '941x1672',
  requestedImageSize: '1152x2048',
  quality: 'auto',
  outputFormat: 'png',
  assetIds: [],
  createdAt: '2026-06-23T08:31:00.000Z'
};

function renderModal(overrides: Partial<HistoryPreviewModalProps> = {}) {
  const props: HistoryPreviewModalProps = {
    item: historyItem,
    dateLocale: 'zh-CN',
    onClose: vi.fn(),
    onReedit: vi.fn(),
    onDelete: vi.fn(),
    onCopyPrompt: vi.fn(),
    ...overrides
  };
  return {
    ...render(<HistoryPreviewModal {...props} />),
    props
  };
}

describe('HistoryPreviewModal', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('shows the thumbnail first and defers the preview image request', () => {
    vi.useFakeTimers();

    const { container } = renderModal();

    expect(
      container.querySelector<HTMLImageElement>('.creator-preview-image-thumb')
        ?.src
    ).toBe('https://cdn.example.com/thumb.png');
    expect(
      container.querySelector('.creator-preview-image-main')
    ).not.toBeInTheDocument();
    expect(useVisualImageCache).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceUrl: 'https://cdn.example.com/thumb.png',
        variant: 'thumbnail',
        strategy: 'cache-first'
      })
    );
    expect(useVisualImageCache).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceUrl: null,
        variant: 'preview',
        strategy: 'network-immediate'
      })
    );

    act(() => {
      vi.advanceTimersByTime(80);
    });

    expect(
      container.querySelector<HTMLImageElement>('.creator-preview-image-main')
        ?.src
    ).toBe('https://cdn.example.com/preview.png');
    expect(useVisualImageCache).toHaveBeenLastCalledWith(
      expect.objectContaining({
        sourceUrl: 'https://cdn.example.com/preview.png',
        variant: 'preview',
        strategy: 'network-immediate'
      })
    );
  });

  it('uses the case-preview image stage without inheriting chrome button clipping', () => {
    const onOpenImage = vi.fn();
    const { container } = renderModal({ onOpenImage });
    const imageStage = container.querySelector<HTMLButtonElement>(
      '.creator-preview-image-zoom'
    );

    expect(imageStage).toHaveClass('create-gallery-preview-image-button');
    expect(imageStage).not.toHaveClass('ui-button');

    fireEvent.click(imageStage as HTMLButtonElement);
    expect(onOpenImage).toHaveBeenCalledWith(historyItem);
  });

  it('shows the generation visual recipe above the prompt', () => {
    const asset = imagePromptAssets[0];
    const { container } = renderModal({
      recipeAssets: [{ slot: asset.slot, asset }],
      getRecipeSlotLabel: () => 'Character'
    });

    const recipe = screen.getByRole('region', { name: '可视化配方' });
    expect(recipe).toHaveTextContent('Character');
    expect(recipe).toHaveTextContent(asset.title);
    expect(
      container.querySelector('.creator-preview-side')?.firstElementChild
    ).toBe(recipe);
  });

  it('creates from the resolved recipe and supports horizontal drag browsing', () => {
    const asset = imagePromptAssets[0];
    const recipeAssets = [{ slot: asset.slot, asset }];
    const onCreateFromRecipe = vi.fn();
    const { container } = renderModal({
      recipeAssets,
      getRecipeSlotLabel: () => 'Character',
      onCreateFromRecipe
    });

    fireEvent.click(screen.getByRole('button', { name: '按配方创作' }));
    expect(onCreateFromRecipe).toHaveBeenCalledWith(historyItem, recipeAssets);

    const recipeRow = container.querySelector<HTMLDivElement>(
      '.creator-preview-recipe-row'
    );
    expect(recipeRow).toBeTruthy();
    Object.defineProperty(recipeRow, 'scrollWidth', {
      configurable: true,
      value: 500
    });
    Object.defineProperty(recipeRow, 'clientWidth', {
      configurable: true,
      value: 200
    });
    recipeRow!.scrollLeft = 0;

    fireEvent.pointerDown(recipeRow!, {
      button: 0,
      isPrimary: true,
      pointerId: 1,
      clientX: 160
    });
    fireEvent.pointerMove(recipeRow!, { pointerId: 1, clientX: 80 });
    expect(recipeRow).toHaveAttribute('data-dragging', 'true');
    expect(recipeRow!.scrollLeft).toBe(80);
    fireEvent.pointerUp(recipeRow!, { pointerId: 1, clientX: 80 });
    expect(recipeRow).toHaveAttribute('data-dragging', 'false');
  });

  it('uses the shared overlay behavior for Escape and scroll lock', () => {
    const previousOverflow = document.body.style.overflow;
    const onClose = vi.fn();

    const { container, unmount } = renderModal({ onClose });

    expect(
      container.querySelector('.creator-history-preview-modal')
    ).toHaveAttribute('tabindex', '-1');
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);

    unmount();
    expect(document.body.style.overflow).toBe(previousOverflow);
  });

  it('keeps the history image re-edit entry visible and wired', () => {
    const onReedit = vi.fn();

    renderModal({ onReedit });

    const reeditButton = screen.getByRole('button', {
      name: 'preview.reedit'
    });
    expect(reeditButton).toBeInTheDocument();

    fireEvent.click(reeditButton);

    expect(onReedit).toHaveBeenCalledWith(historyItem);
  });

  it('keeps same-again generation reachable after opening a compact card', () => {
    const onRegenerate = vi.fn();

    renderModal({ onRegenerate });
    fireEvent.click(
      screen.getByRole('button', { name: 'historyRail.regenerateSame' })
    );

    expect(onRegenerate).toHaveBeenCalledWith(historyItem);
  });

  it('does not copy legacy auto-compiled negative prompts', () => {
    const onCopyPrompt = vi.fn(async () => true);

    renderModal({
      onCopyPrompt,
      item: {
        ...historyItem,
        negativePrompt: '画质低，多余手指，手部变形，解剖错误，水印文字'
      }
    });

    fireEvent.click(
      screen.getByRole('button', {
        name: 'preview.copyPrompt'
      })
    );

    expect(onCopyPrompt).toHaveBeenCalledWith('A close portrait');
    expect(screen.queryByText('preview.negativeLabel')).not.toBeInTheDocument();
  });
});
