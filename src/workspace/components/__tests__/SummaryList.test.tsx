import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SavedSummary } from '@/services/database';
import { SummaryList } from '../SummaryList';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback || _key,
    i18n: {
      language: 'zh-CN'
    }
  })
}));

vi.mock('@/services/workspace-api', () => ({
  getSummaryById: vi.fn().mockResolvedValue(null)
}));

vi.mock('@/services/agent-api', () => ({
  refreshVisualImageHistoryItem: vi.fn().mockResolvedValue(null)
}));

const summary: SavedSummary = {
  id: 'summary-1',
  title: 'Source Card',
  url: 'https://example.com/source',
  markdown: '# Source Card\n\nBody',
  createdAt: Date.UTC(2026, 5, 23)
};

type IntersectionEntry = Pick<IntersectionObserverEntry, 'isIntersecting'>;

describe('SummaryList', () => {
  const originalIntersectionObserver = globalThis.IntersectionObserver;
  const originalResizeObserver = globalThis.ResizeObserver;
  let observerCallback: ((entries: IntersectionEntry[]) => void) | undefined;
  let observeMock: ReturnType<typeof vi.fn>;
  let disconnectMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    observeMock = vi.fn();
    disconnectMock = vi.fn();
    observerCallback = undefined;

    class MockIntersectionObserver {
      constructor(callback: (entries: IntersectionObserverEntry[]) => void) {
        observerCallback = (entries: IntersectionEntry[]) => {
          callback(entries as IntersectionObserverEntry[]);
        };
      }

      observe = observeMock;
      disconnect = disconnectMock;
      unobserve = vi.fn();
      takeRecords = vi.fn(() => []);
      root = null;
      rootMargin = '';
      thresholds = [];
    }

    class MockResizeObserver {
      observe = vi.fn();
      disconnect = vi.fn();
      unobserve = vi.fn();
    }

    globalThis.IntersectionObserver =
      MockIntersectionObserver as unknown as typeof IntersectionObserver;
    globalThis.ResizeObserver =
      MockResizeObserver as unknown as typeof ResizeObserver;
  });

  afterEach(() => {
    globalThis.IntersectionObserver = originalIntersectionObserver;
    globalThis.ResizeObserver = originalResizeObserver;
    vi.clearAllMocks();
  });

  it('attaches load-more observer after initial loading finishes', () => {
    const onLoadMore = vi.fn();

    const { rerender } = render(
      <SummaryList
        summaries={[summary]}
        loading
        displayMode="list"
        hasMore
        loadingMore={false}
        onLoadMore={onLoadMore}
        onEnterDetail={() => {}}
        onRefresh={() => {}}
      />
    );

    expect(observeMock).not.toHaveBeenCalled();

    rerender(
      <SummaryList
        summaries={[summary]}
        loading={false}
        displayMode="list"
        hasMore
        loadingMore={false}
        onLoadMore={onLoadMore}
        onEnterDetail={() => {}}
        onRefresh={() => {}}
      />
    );

    expect(observeMock).toHaveBeenCalledTimes(1);

    observerCallback?.([{ isIntersecting: true }]);

    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('keeps card click navigation available when selection controls are shown', () => {
    const onEnterDetail = vi.fn();
    const onToggleSelect = vi.fn();

    render(
      <SummaryList
        summaries={[summary]}
        loading={false}
        displayMode="list"
        selectedIds={[]}
        onToggleSelect={onToggleSelect}
        dragToCanvasEnabled
        onEnterDetail={onEnterDetail}
        onRefresh={() => {}}
      />
    );

    fireEvent.click(screen.getByText('Source Card'));

    expect(onEnterDetail).toHaveBeenCalledWith(summary);
    expect(onToggleSelect).not.toHaveBeenCalled();
    expect(
      screen.getByText('Source Card').closest('[draggable="true"]')
    ).not.toBeNull();
  });

  it('mounts initial visual thumbnails without waiting for intersection callbacks', async () => {
    const visualSummary: SavedSummary = {
      ...summary,
      id: 'visual-summary-1',
      title: 'Visual Source',
      contentType: 'image',
      metadata: {
        thumbnailUrl: 'https://example.com/visual-thumb.jpg',
        imageUrl: 'https://example.com/visual-full.jpg',
        width: 941,
        height: 1672,
        modelLabel: 'GPT Image 2'
      }
    };

    render(
      <SummaryList
        summaries={[visualSummary]}
        loading={false}
        displayMode="cards"
        containerWidth={360}
        onEnterDetail={() => {}}
        onRefresh={() => {}}
      />
    );

    const image = await waitFor(
      () => screen.getByAltText('Visual Source') as HTMLImageElement
    );

    expect(image.src).toMatch(/^https:\/\/example\.com\/visual-/);
    expect(image).toHaveClass('object-cover');
    expect(observeMock).not.toHaveBeenCalledWith(
      expect.objectContaining({
        dataset: expect.objectContaining({ visualSummaryId: visualSummary.id })
      })
    );
  });

  it('keeps lazy visual cards wired to a real image src outside the warm window', async () => {
    const visualSummaries: SavedSummary[] = Array.from(
      { length: 30 },
      (_, index) => ({
        ...summary,
        id: `visual-summary-${index}`,
        title: `Visual Source ${index}`,
        contentType: 'image',
        metadata: {
          thumbnailUrl: `https://example.com/visual-thumb-${index}.jpg`,
          imageUrl: `https://example.com/visual-full-${index}.jpg`,
          width: 941,
          height: 1672,
          modelLabel: 'GPT Image 2'
        }
      })
    );

    render(
      <SummaryList
        summaries={visualSummaries}
        loading={false}
        displayMode="cards"
        containerWidth={360}
        onEnterDetail={() => {}}
        onRefresh={() => {}}
      />
    );

    const lazyImage = await waitFor(
      () => screen.getByAltText('Visual Source 29') as HTMLImageElement
    );

    expect(lazyImage.src).toMatch(/^https:\/\/example\.com\/visual-/);
    expect(lazyImage.getAttribute('loading')).toBe('lazy');
  });
});
