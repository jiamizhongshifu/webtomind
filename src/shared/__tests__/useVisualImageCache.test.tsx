import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useVisualImageCache } from '../useVisualImageCache';

describe('useVisualImageCache', () => {
  const originalCaches = window.caches;
  const originalCreateObjectUrl = window.URL.createObjectURL;
  let cacheMatch: ReturnType<typeof vi.fn>;
  let cachePut: ReturnType<typeof vi.fn>;
  let cachesOpen: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    cacheMatch = vi.fn().mockResolvedValue(undefined);
    cachePut = vi.fn().mockResolvedValue(undefined);
    cachesOpen = vi.fn().mockResolvedValue({
      match: cacheMatch,
      put: cachePut
    });
    Object.defineProperty(window, 'caches', {
      configurable: true,
      value: {
        open: cachesOpen
      }
    });
    Object.defineProperty(window.URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:cached-image')
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('png', {
          status: 200,
          headers: { 'content-type': 'image/png' }
        })
      )
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Object.defineProperty(window, 'caches', {
      configurable: true,
      value: originalCaches
    });
    Object.defineProperty(window.URL, 'createObjectURL', {
      configurable: true,
      value: originalCreateObjectUrl
    });
  });

  it('uses the network URL directly without background fetch for network-immediate', async () => {
    const sourceUrl = 'https://cdn.example.com/preview.png';

    const { result } = renderHook(() =>
      useVisualImageCache({
        id: 'generation-1',
        sourceUrl,
        variant: 'preview',
        strategy: 'network-immediate'
      })
    );

    expect(result.current).toBe(sourceUrl);
    await Promise.resolve();
    expect(fetch).not.toHaveBeenCalled();
    expect(cachesOpen).not.toHaveBeenCalled();
  });

  it('keeps cache-first behavior for same-origin reusable thumbnails', async () => {
    const sourceUrl = `${window.location.origin}/thumb.png`;

    const { result } = renderHook(() =>
      useVisualImageCache({
        id: 'generation-2',
        sourceUrl,
        variant: 'thumbnail',
        strategy: 'cache-first'
      })
    );

    expect(result.current).toBe(sourceUrl);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(sourceUrl, {
        credentials: 'omit',
        mode: 'cors'
      });
    });
    expect(cachePut).toHaveBeenCalled();
  });

  it('does not background fetch cross-origin thumbnails that can render as images', async () => {
    const sourceUrl = 'https://cdn.example.com/thumb.png';

    const { result } = renderHook(() =>
      useVisualImageCache({
        id: 'generation-3',
        sourceUrl,
        variant: 'thumbnail',
        strategy: 'cache-first'
      })
    );

    expect(result.current).toBe(sourceUrl);
    await Promise.resolve();
    expect(fetch).not.toHaveBeenCalled();
    expect(cachesOpen).not.toHaveBeenCalled();
  });
});
