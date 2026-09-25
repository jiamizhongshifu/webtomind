import { createRef } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { PromptCase } from '@/services/agent-api';
import { PromptLibraryMasonry } from '../PromptLibraryMasonry';

const cases: PromptCase[] = [
  {
    id: 'case-a',
    slug: 'case-a',
    title: 'Editorial portrait',
    imageUrl: 'https://example.com/a.png',
    prompt: 'Portrait prompt',
    promptPreview: 'Portrait prompt',
    model: 'GPT Image 2',
    locale: 'zh-CN',
    category: 'portrait-photography',
    createdAt: '2026-07-02T08:00:00.000Z'
  },
  {
    id: 'case-b',
    slug: 'case-b',
    title: 'Product visual',
    imageUrl: 'https://example.com/b.png',
    prompt: 'Product prompt',
    promptPreview: 'Product prompt',
    model: 'Nano Banana',
    locale: 'zh-CN',
    category: 'product-commercial',
    createdAt: '2026-07-02T08:10:00.000Z'
  }
];

function renderMasonry(
  overrides: Partial<React.ComponentProps<typeof PromptLibraryMasonry>> = {}
) {
  const onOpenCase = vi.fn((event: React.MouseEvent<HTMLElement>) => {
    event.preventDefault();
  });
  const onToggleFavorite = vi.fn();
  const onLoadMore = vi.fn();
  const loadMoreRef = createRef<HTMLDivElement>();
  const result = render(
    <MemoryRouter>
      <PromptLibraryMasonry
        isZh
        locale="zh-CN"
        columns={[
          [{ caseItem: cases[0], index: 0 }],
          [{ caseItem: cases[1], index: 1 }]
        ]}
        activeColumnCount={2}
        loadState="ready"
        statusState={null}
        allCasesHref="/zh-CN/prompts"
        getCaseHref={(caseItem) => `/zh-CN/prompts/${caseItem.slug}`}
        getCreateHref={(caseItem) =>
          `/zh-CN/create/image?caseId=${caseItem.id}`
        }
        aspectRatios={{}}
        onAspectRatioChange={vi.fn()}
        isFavorited={(caseId) => caseId === 'case-b'}
        onOpenCase={onOpenCase}
        onToggleFavorite={onToggleFavorite}
        hasMore={false}
        isLoadingMore={false}
        onLoadMore={onLoadMore}
        loadMoreRef={loadMoreRef}
        visibleCount={2}
        totalCount={2}
        hasAnyCases
        {...overrides}
      />
    </MemoryRouter>
  );
  return { ...result, onOpenCase, onToggleFavorite, onLoadMore };
}

describe('PromptLibraryMasonry', () => {
  it('renders prompt cards in masonry columns and keeps favorite clicks isolated', () => {
    const { onOpenCase, onToggleFavorite } = renderMasonry();

    const grid = screen.getByLabelText('Prompt 案例');
    expect(
      within(grid).getByRole('link', {
        name: '预览 Prompt 案例：Editorial portrait'
      })
    ).toHaveAttribute('href', '/zh-CN/prompts/case-a');
    expect(within(grid).getAllByRole('img')).toHaveLength(2);

    fireEvent.click(
      screen.getByRole('button', { name: '取消收藏案例：Product visual' })
    );
    expect(onToggleFavorite).toHaveBeenCalledWith('case-b');
    expect(onOpenCase).not.toHaveBeenCalled();
  });

  // Initial-viewport cards keep their reserved ratio (CLS guard); cards beyond
  // the stable window may still adopt their natural ratio.
  it('updates aspect ratios from natural dimensions beyond the stable first screen', () => {
    const onAspectRatioChange = vi.fn();
    renderMasonry({
      columns: [[{ caseItem: cases[0], index: 12 }]],
      activeColumnCount: 1,
      onAspectRatioChange
    });

    const image = screen.getByRole('img', { name: 'Editorial portrait' });
    Object.defineProperty(image, 'naturalWidth', {
      configurable: true,
      value: 900
    });
    Object.defineProperty(image, 'naturalHeight', {
      configurable: true,
      value: 1200
    });

    fireEvent.load(image);

    expect(onAspectRatioChange).toHaveBeenCalledWith('case-a', '900 / 1200');
  });

  it('keeps image aspect ratios stable when natural dimensions only differ slightly', () => {
    const onAspectRatioChange = vi.fn();
    renderMasonry({
      aspectRatios: { 'case-a': '901 / 1200' },
      onAspectRatioChange
    });

    const image = screen.getByRole('img', { name: 'Editorial portrait' });
    Object.defineProperty(image, 'naturalWidth', {
      configurable: true,
      value: 900
    });
    Object.defineProperty(image, 'naturalHeight', {
      configurable: true,
      value: 1200
    });

    fireEvent.load(image);

    expect(onAspectRatioChange).not.toHaveBeenCalled();
  });

  it('keeps the initial media loading budget tight', () => {
    const mediaCases = Array.from({ length: 5 }, (_, index) => ({
      ...cases[index % cases.length],
      id: `media-case-${index}`,
      slug: `media-case-${index}`,
      title: `Media case ${index}`,
      imageUrl: `https://example.com/media-${index}.png`
    }));

    renderMasonry({
      columns: [
        mediaCases.map((caseItem, index) => ({
          caseItem,
          index
        }))
      ],
      activeColumnCount: 1,
      visibleCount: mediaCases.length,
      totalCount: mediaCases.length
    });

    const images = screen.getAllByRole('img');
    expect(images.map((image) => image.getAttribute('loading'))).toEqual([
      'eager',
      'eager',
      'lazy',
      'lazy',
      'lazy'
    ]);
    expect(images.map((image) => image.getAttribute('fetchpriority'))).toEqual([
      'high',
      'high',
      'auto',
      'auto',
      'auto'
    ]);
  });

  it.each([2, 5])(
    'loads all %i column tops eagerly without loading lower rows eagerly',
    (columnCount) => {
      const columns = Array.from({ length: columnCount }, (_, column) =>
        [column, column + columnCount].map((index) => ({
          index,
          caseItem: {
            ...cases[0],
            id: `row-case-${index}`,
            title: `Row case ${index}`,
            imageUrl: `https://example.com/row-${index}.png`
          }
        }))
      );
      renderMasonry({
        columns,
        activeColumnCount: columnCount,
        visibleCount: columnCount * 2,
        totalCount: columnCount * 2
      });
      for (let index = 0; index < columnCount * 2; index++) {
        const image = screen.getByRole('img', { name: `Row case ${index}` });
        expect(image.getAttribute('loading')).toBe(
          index < columnCount ? 'eager' : 'lazy'
        );
        expect(image.getAttribute('fetchpriority')).toBe(
          index < columnCount ? 'high' : 'auto'
        );
      }
    }
  );

  it('shows video cases as thumbnails and only plays them on mouse hover', () => {
    const playSpy = vi
      .spyOn(HTMLMediaElement.prototype, 'play')
      .mockResolvedValue(undefined);
    const pauseSpy = vi
      .spyOn(HTMLMediaElement.prototype, 'pause')
      .mockImplementation(() => {});
    const videoCase: PromptCase = {
      ...cases[0],
      id: 'video-case',
      slug: 'video-case',
      title: 'Runway motion case',
      imageUrl: 'https://example.com/video-poster.png',
      mediaType: 'video',
      videoUrl: 'https://example.com/video.mp4'
    };

    const { container } = renderMasonry({
      columns: [[{ caseItem: videoCase, index: 0 }]],
      activeColumnCount: 1,
      visibleCount: 1,
      totalCount: 1
    });

    const poster = screen.getByRole('img', { name: 'Runway motion case' });
    const video = container.querySelector('video');
    const mediaWrap = container.querySelector(
      '.prompt-browser-case-image-wrap'
    );
    expect(poster).toHaveAttribute('src');
    expect(screen.getByText('视频')).toBeInTheDocument();
    expect(video).toBeTruthy();
    expect(video).toHaveAttribute('preload', 'none');
    expect(video).not.toHaveAttribute('src');
    expect(video).not.toHaveAttribute('autoplay');
    expect(video).not.toHaveClass('active');
    expect(playSpy).not.toHaveBeenCalled();
    pauseSpy.mockClear();

    fireEvent.mouseEnter(mediaWrap as Element);
    expect(playSpy).toHaveBeenCalledTimes(1);
    expect(video).toHaveAttribute('src', 'https://example.com/video.mp4');
    expect(video).toHaveClass('active');

    fireEvent.mouseLeave(mediaWrap as Element);
    expect(pauseSpy).toHaveBeenCalledTimes(1);
    expect(video).not.toHaveClass('active');

    playSpy.mockRestore();
    pauseSpy.mockRestore();
  });

  it('renders automatic load-more and loading-more states', () => {
    const { onLoadMore, rerender } = renderMasonry({
      hasMore: true,
      totalCount: 12
    });

    expect(
      screen.queryByRole('button', {
        name: '继续向下浏览，更多案例会自动加载（2/12）'
      })
    ).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      '继续向下浏览，更多案例会自动加载（2/12）'
    );
    expect(onLoadMore).not.toHaveBeenCalled();

    rerender(
      <MemoryRouter>
        <PromptLibraryMasonry
          isZh
          locale="zh-CN"
          columns={[[{ caseItem: cases[0], index: 0 }]]}
          activeColumnCount={1}
          loadState="ready"
          statusState={null}
          allCasesHref="/zh-CN/prompts"
          getCaseHref={(caseItem) => `/zh-CN/prompts/${caseItem.slug}`}
          getCreateHref={(caseItem) =>
            `/zh-CN/create/image?caseId=${caseItem.id}`
          }
          aspectRatios={{}}
          onAspectRatioChange={vi.fn()}
          isFavorited={() => false}
          onOpenCase={vi.fn()}
          onToggleFavorite={vi.fn()}
          hasMore
          isLoadingMore
          onLoadMore={onLoadMore}
          loadMoreRef={createRef<HTMLDivElement>()}
          visibleCount={2}
          totalCount={12}
          hasAnyCases
        />
      </MemoryRouter>
    );
    expect(screen.getByRole('status')).toHaveTextContent('正在加载更多案例...');
  });

  it('offers a manual load-more button as a fallback trigger', () => {
    const onLoadMore = vi.fn();
    renderMasonry({
      hasMore: true,
      totalCount: 12,
      onLoadMore
    });

    const button = screen.getByRole('button', { name: '加载更多案例' });
    expect(button).toBeInTheDocument();
    fireEvent.click(button);
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('renders no-result action state', () => {
    renderMasonry({
      columns: [],
      statusState: 'no-result',
      hasAnyCases: false,
      visibleCount: 0,
      totalCount: 0
    });

    expect(
      screen.getByRole('heading', { name: '当前筛选没有匹配案例' })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '查看全部案例' })).toHaveAttribute(
      'href',
      '/zh-CN/prompts'
    );
  });

  it('offers an in-place retry when the case request fails', () => {
    const onRetry = vi.fn();
    renderMasonry({
      columns: [],
      loadState: 'error',
      statusState: 'error',
      hasAnyCases: false,
      visibleCount: 0,
      totalCount: 0,
      onRetry
    });

    fireEvent.click(screen.getByRole('button', { name: '重新加载' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('keeps stale cards in place during the refresh grace period', () => {
    renderMasonry({ loadState: 'ready', hasMore: true, isRefreshing: true });

    expect(
      screen.queryByLabelText('正在加载 Prompt 案例')
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', {
        name: '预览 Prompt 案例：Editorial portrait'
      })
    ).toBeInTheDocument();
    expect(screen.queryByText(/继续向下浏览/)).not.toBeInTheDocument();
  });

  it('swaps to a height-matched loading grid when refresh is slow', () => {
    vi.useFakeTimers();
    try {
      renderMasonry({
        loadState: 'ready',
        hasMore: true,
        isRefreshing: true,
        visibleCount: 12,
        totalCount: 12
      });

      act(() => {
        vi.advanceTimersByTime(400);
      });

      expect(screen.getByLabelText('正在加载 Prompt 案例')).toBeInTheDocument();
      expect(
        document.querySelectorAll('.prompt-browser-case-card-loading').length
      ).toBe(12);
      expect(
        screen.queryByRole('link', {
          name: '预览 Prompt 案例：Editorial portrait'
        })
      ).not.toBeInTheDocument();
      expect(screen.queryByText(/继续向下浏览/)).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('renders cached cards again once the background refresh completes', () => {
    renderMasonry({ loadState: 'ready', isRefreshing: false });

    expect(
      screen.getByRole('link', {
        name: '预览 Prompt 案例：Editorial portrait'
      })
    ).toHaveAttribute('href', '/zh-CN/prompts/case-a');
    expect(
      screen.queryByLabelText('正在加载 Prompt 案例')
    ).not.toBeInTheDocument();
  });
});
