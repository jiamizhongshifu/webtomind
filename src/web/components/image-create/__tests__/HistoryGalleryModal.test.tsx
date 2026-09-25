import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { VisualImageHistoryItem } from '@/services/agent-api';
import { HistoryGalleryModal } from '../HistoryGalleryModal';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, number>) => {
      const messages: Record<string, string> = {
        'history.modalTitle': '历史生成记录',
        'history.modalCount': `${options?.count ?? 0} 张图片`,
        'history.modalCountLoaded': `已加载 ${options?.loaded ?? 0} / ${
          options?.total ?? 0
        } 张图片`,
        'history.loading': '加载中',
        'history.loadingMore': '加载更多中',
        'history.loadMore': '加载更多',
        'history.empty': '暂无历史',
        'preview.close': '关闭'
      };
      return messages[key] || key;
    }
  })
}));

vi.mock('@/shared/useVisualImageCache', () => ({
  useVisualImageCache: ({ sourceUrl }: { sourceUrl: string }) => sourceUrl
}));

function makeHistoryItem(id: string): VisualImageHistoryItem {
  return {
    id,
    imageUrl: `https://example.com/${id}.png`,
    prompt: `prompt ${id}`,
    provider: 'openai',
    model: 'gpt-image-2',
    modelLabel: 'GPT Image 2',
    assetIds: [],
    createdAt: '2026-06-18T10:00:00.000Z'
  };
}

describe('HistoryGalleryModal', () => {
  it('uses shared overlay behavior for Escape and scroll lock', () => {
    const onClose = vi.fn();
    const { container, unmount } = render(
      <HistoryGalleryModal
        items={[makeHistoryItem('generation-1')]}
        total={1}
        loading={false}
        loadingMore={false}
        error=""
        dateLocale="zh-CN"
        onClose={onClose}
        onSelect={vi.fn()}
        onLoadMore={vi.fn()}
      />
    );

    expect(container.querySelector('.creator-history-modal')).toHaveAttribute(
      'tabindex',
      '-1'
    );
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);

    unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('toggles reference selection by gallery item id', () => {
    const onToggleReference = vi.fn();
    render(
      <HistoryGalleryModal
        mode="reference-picker"
        items={[makeHistoryItem('generation-1')]}
        total={1}
        loading={false}
        loadingMore={false}
        error=""
        dateLocale="zh-CN"
        onClose={vi.fn()}
        onSelect={vi.fn()}
        selectedIds={[]}
        onToggleReference={onToggleReference}
        onConfirmReferences={vi.fn()}
        onLoadMore={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /GPT Image 2/ }));

    expect(onToggleReference).toHaveBeenCalledWith('generation-1');
  });

  it('shows selected and importing states in reference picker mode', () => {
    const { rerender } = render(
      <HistoryGalleryModal
        mode="reference-picker"
        items={[makeHistoryItem('generation-1')]}
        total={1}
        loading={false}
        loadingMore={false}
        error=""
        dateLocale="zh-CN"
        onClose={vi.fn()}
        onSelect={vi.fn()}
        selectedIds={['generation-1']}
        onToggleReference={vi.fn()}
        onConfirmReferences={vi.fn()}
        onLoadMore={vi.fn()}
      />
    );

    expect(screen.getByText('已选')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /GPT Image 2/ })).toHaveClass(
      'selected'
    );

    rerender(
      <HistoryGalleryModal
        mode="reference-picker"
        items={[makeHistoryItem('generation-1')]}
        total={1}
        loading={false}
        loadingMore={false}
        error=""
        dateLocale="zh-CN"
        onClose={vi.fn()}
        onSelect={vi.fn()}
        selectedIds={[]}
        importingId="generation-1"
        onToggleReference={vi.fn()}
        onConfirmReferences={vi.fn()}
        onLoadMore={vi.fn()}
      />
    );

    expect(screen.getByText('导入中')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /GPT Image 2/ })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: /使用 0 张/ })
    ).not.toBeDisabled();
  });

  it('keeps cached items visible while refreshing and disables confirm while importing references', () => {
    render(
      <HistoryGalleryModal
        mode="reference-picker"
        items={[makeHistoryItem('generation-1')]}
        total={2}
        loading={true}
        loadingMore={false}
        error=""
        dateLocale="zh-CN"
        onClose={vi.fn()}
        onSelect={vi.fn()}
        selectedIds={['generation-1']}
        confirmingReferences={true}
        onToggleReference={vi.fn()}
        onConfirmReferences={vi.fn()}
        onLoadMore={vi.fn()}
      />
    );

    expect(screen.getByText('已选')).toBeInTheDocument();
    expect(screen.getByText('加载中')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /正在导入/ })).toBeDisabled();
  });
});
