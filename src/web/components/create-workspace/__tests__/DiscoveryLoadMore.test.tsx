import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DiscoveryLoadMore } from '../DiscoveryGallery';

describe('DiscoveryLoadMore', () => {
  let intersectionCallback: IntersectionObserverCallback | undefined;

  class FakeIntersectionObserver {
    constructor(callback: IntersectionObserverCallback) {
      intersectionCallback = callback;
    }

    observe = vi.fn();
    disconnect = vi.fn();
    unobserve = vi.fn();
    takeRecords = vi.fn(() => []);
    root = null;
    rootMargin = '520px 0px';
    thresholds = [0];
  }

  beforeEach(() => {
    intersectionCallback = undefined;
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads the next page when the sentinel enters the viewport', () => {
    const onLoadMore = vi.fn();

    render(
      <DiscoveryLoadMore
        hasMore
        loading={false}
        isEnglish={false}
        onLoadMore={onLoadMore}
      />
    );

    const sentinel = document.querySelector('.discovery-load-more') as Element;
    act(() => {
      intersectionCallback?.(
        [
          {
            target: sentinel,
            isIntersecting: true,
            intersectionRatio: 1
          } as unknown as IntersectionObserverEntry
        ],
        {} as IntersectionObserver
      );
    });

    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('does not load while loading', () => {
    const onLoadMore = vi.fn();

    render(
      <DiscoveryLoadMore
        hasMore
        loading
        isEnglish={false}
        onLoadMore={onLoadMore}
      />
    );

    act(() => {
      intersectionCallback?.(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver
      );
    });

    expect(onLoadMore).not.toHaveBeenCalled();
  });

  it('keeps a clickable fallback and exposes the loading state', () => {
    const onLoadMore = vi.fn();
    const { rerender } = render(
      <DiscoveryLoadMore
        hasMore
        loading={false}
        isEnglish
        onLoadMore={onLoadMore}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    expect(onLoadMore).toHaveBeenCalledTimes(1);

    rerender(
      <DiscoveryLoadMore hasMore loading isEnglish onLoadMore={onLoadMore} />
    );
    expect(screen.getByText('Loading more…')).toBeInTheDocument();
  });
});
