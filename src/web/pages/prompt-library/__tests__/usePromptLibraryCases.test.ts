import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  PromptLibraryQuery,
  PublicPromptLibraryResult
} from '@/services/agent-api';
import { getPromptLibraryQueryKey } from '../usePromptLibraryQuery';

const { getPublicPromptLibraryResultMock } = vi.hoisted(() => ({
  getPublicPromptLibraryResultMock: vi.fn()
}));

vi.mock('@/services/agent-api', () => ({
  getPublicPromptLibraryResult: getPublicPromptLibraryResultMock
}));

import { usePromptLibraryCases } from '../usePromptLibraryCases';

const query: PromptLibraryQuery = {
  locale: 'zh-CN',
  sort: 'latest',
  limit: 48
};

const bootstrap: PublicPromptLibraryResult = {
  items: [
    {
      id: 'case-1',
      title: 'Case one',
      prompt: '',
      imageUrl: 'https://images.example.test/case-1.jpg',
      imageUrls: ['https://images.example.test/case-1.jpg']
    }
  ],
  total: 1,
  pageInfo: { nextCursor: null, hasMore: false },
  facets: { models: [], labels: [], sorts: [] },
  queryEcho: query,
  version: 'prompt-library-v2',
  source: 'database'
};

function getClientCacheKey(query: PromptLibraryQuery, requireImage = true) {
  return `webtomind:prompt-library-v2:${getPromptLibraryQueryKey(query)}:${
    requireImage ? 'with-image' : 'all-images'
  }`;
}

describe('usePromptLibraryCases bootstrap', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    getPublicPromptLibraryResultMock.mockReset();
  });

  it('uses matching server data without issuing a duplicate initial request', async () => {
    const { result } = renderHook(() =>
      usePromptLibraryCases(query, {
        requireImage: true,
        initialData: bootstrap
      })
    );

    await act(async () => undefined);

    expect(result.current.loadState).toBe('ready');
    expect(result.current.data?.items[0]?.id).toBe('case-1');
    expect(result.current.isRefreshing).toBe(false);
    expect(getPublicPromptLibraryResultMock).not.toHaveBeenCalled();
  });

  it('shows a refreshing state while stale cached data is being replaced', async () => {
    const cachedResult: PublicPromptLibraryResult = {
      items: [
        {
          id: 'cached-case',
          title: 'Cached case',
          prompt: '',
          imageUrl: 'https://images.example.test/cached.jpg',
          imageUrls: ['https://images.example.test/cached.jpg']
        }
      ],
      total: 1,
      pageInfo: { nextCursor: null, hasMore: false },
      facets: { models: [], labels: [], sorts: [] },
      queryEcho: query,
      version: 'prompt-library-v2',
      source: 'database'
    };
    window.sessionStorage.setItem(
      getClientCacheKey(query),
      JSON.stringify({ expiresAt: Date.now() + 60_000, result: cachedResult })
    );

    let resolveFetch!: (result: PublicPromptLibraryResult) => void;
    getPublicPromptLibraryResultMock.mockReturnValue(
      new Promise<PublicPromptLibraryResult>((resolve) => {
        resolveFetch = resolve;
      })
    );

    const { result } = renderHook(() =>
      usePromptLibraryCases(query, { requireImage: true })
    );

    expect(result.current.loadState).toBe('ready');
    expect(result.current.isStale).toBe(true);
    expect(result.current.isRefreshing).toBe(true);

    const freshResult: PublicPromptLibraryResult = {
      ...cachedResult,
      total: 2,
      items: [
        ...cachedResult.items,
        {
          id: 'fresh-case',
          title: 'Fresh case',
          prompt: '',
          imageUrl: 'https://images.example.test/fresh.jpg',
          imageUrls: ['https://images.example.test/fresh.jpg']
        }
      ]
    };
    await act(async () => {
      resolveFetch(freshResult);
    });

    expect(result.current.isRefreshing).toBe(false);
    expect(result.current.isStale).toBe(false);
    expect(result.current.data?.total).toBe(2);
    expect(result.current.data?.items.map((item) => item.id)).toEqual([
      'cached-case',
      'fresh-case'
    ]);
  });

  it('stops refreshing and keeps cached data when the background refresh fails', async () => {
    const cachedResult: PublicPromptLibraryResult = {
      items: [
        {
          id: 'cached-case',
          title: 'Cached case',
          prompt: '',
          imageUrl: 'https://images.example.test/cached.jpg',
          imageUrls: ['https://images.example.test/cached.jpg']
        }
      ],
      total: 1,
      pageInfo: { nextCursor: null, hasMore: false },
      facets: { models: [], labels: [], sorts: [] },
      queryEcho: query,
      version: 'prompt-library-v2',
      source: 'database'
    };
    window.sessionStorage.setItem(
      getClientCacheKey(query),
      JSON.stringify({ expiresAt: Date.now() + 60_000, result: cachedResult })
    );

    let rejectFetch!: (error: Error) => void;
    getPublicPromptLibraryResultMock.mockReturnValue(
      new Promise<PublicPromptLibraryResult>((_resolve, reject) => {
        rejectFetch = reject;
      })
    );

    const { result } = renderHook(() =>
      usePromptLibraryCases(query, { requireImage: true })
    );

    expect(result.current.isRefreshing).toBe(true);

    await act(async () => {
      rejectFetch(new Error('案例库加载失败。'));
    });

    expect(result.current.isRefreshing).toBe(false);
    expect(result.current.isStale).toBe(true);
    expect(result.current.loadState).toBe('ready');
    expect(result.current.data?.items[0]?.id).toBe('cached-case');
  });
});
