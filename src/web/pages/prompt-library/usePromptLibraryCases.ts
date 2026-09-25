import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getPublicPromptLibraryResult,
  type PromptLibraryQuery,
  type PublicPromptLibraryResult
} from '@/services/agent-api';
import { getPromptLibraryQueryKey } from './usePromptLibraryQuery';

export type PromptLibraryLoadState = 'loading' | 'ready' | 'error';

export interface PromptLibraryCasesState {
  data: PublicPromptLibraryResult | null;
  loadState: PromptLibraryLoadState;
  error: Error | null;
  isStale: boolean;
  isRefreshing: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  loadMore: () => void;
  retry: () => void;
}

type PromptLibraryCasesStore = Omit<
  PromptLibraryCasesState,
  'loadMore' | 'retry'
>;

const PROMPT_LIBRARY_CLIENT_CACHE_PREFIX = 'webtomind:prompt-library-v2:';
const PROMPT_LIBRARY_CLIENT_CACHE_TTL_MS = 5 * 60 * 1000;

function getPromptLibraryClientCacheKey(
  queryKey: string,
  requireImage?: boolean
): string {
  return `${PROMPT_LIBRARY_CLIENT_CACHE_PREFIX}${queryKey}:${
    requireImage ? 'with-image' : 'all-images'
  }`;
}

function readPromptLibraryClientCache(
  queryKey: string,
  requireImage?: boolean
): PublicPromptLibraryResult | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(
      getPromptLibraryClientCacheKey(queryKey, requireImage)
    );
    if (!raw) return null;
    const cached = JSON.parse(raw) as {
      expiresAt?: unknown;
      result?: PublicPromptLibraryResult;
    };
    if (Number(cached.expiresAt) <= Date.now()) return null;
    return cached.result || null;
  } catch {
    return null;
  }
}

function writePromptLibraryClientCache(
  queryKey: string,
  requireImage: boolean | undefined,
  result: PublicPromptLibraryResult
): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(
      getPromptLibraryClientCacheKey(queryKey, requireImage),
      JSON.stringify({
        expiresAt: Date.now() + PROMPT_LIBRARY_CLIENT_CACHE_TTL_MS,
        result
      })
    );
  } catch {
    // Storage can be unavailable in private mode; cache is an enhancement only.
  }
}

function mergePromptLibraryResults(
  current: PublicPromptLibraryResult,
  next: PublicPromptLibraryResult
): PublicPromptLibraryResult {
  const seen = new Set(current.items.map((item) => item.id));
  const appendedItems = next.items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });

  return {
    ...next,
    items: [...current.items, ...appendedItems],
    total: next.total || current.total,
    facets: current.facets,
    source: next.source || current.source
  };
}

export function usePromptLibraryCases(
  query: PromptLibraryQuery,
  options: {
    requireImage?: boolean;
    enabled?: boolean;
    initialData?: PublicPromptLibraryResult | null;
  } = {}
): PromptLibraryCasesState {
  const enabled = options.enabled !== false;
  const queryKey = useMemo(() => getPromptLibraryQueryKey(query), [query]);
  const bootstrapData = useMemo(
    () =>
      options.initialData &&
      getPromptLibraryQueryKey(options.initialData.queryEcho) === queryKey
        ? options.initialData
        : null,
    [options.initialData, queryKey]
  );
  const activeQueryKeyRef = useRef(queryKey);
  const [retryNonce, setRetryNonce] = useState(0);
  const [state, setState] = useState<PromptLibraryCasesStore>(() => {
    const cachedData = enabled
      ? bootstrapData ||
        readPromptLibraryClientCache(queryKey, options.requireImage)
      : null;
    return {
      data: cachedData,
      loadState: enabled && !cachedData ? 'loading' : 'ready',
      error: null,
      isStale: Boolean(cachedData),
      isRefreshing: enabled && Boolean(cachedData) && !bootstrapData,
      isLoadingMore: false,
      hasMore: cachedData?.pageInfo.hasMore === true
    };
  });

  useEffect(() => {
    activeQueryKeyRef.current = queryKey;

    if (!enabled) {
      setState((current) => ({
        ...current,
        loadState: current.data ? 'ready' : 'ready',
        isStale: false,
        isRefreshing: false,
        isLoadingMore: false,
        hasMore: false
      }));
      return;
    }

    let cancelled = false;
    const activeBootstrapData = retryNonce === 0 ? bootstrapData : null;
    const cachedResult =
      activeBootstrapData ||
      readPromptLibraryClientCache(queryKey, options.requireImage);
    setState((current) => {
      const nextData = cachedResult || current.data;
      return {
        ...current,
        data: nextData,
        loadState: nextData ? 'ready' : 'loading',
        error: null,
        isStale: Boolean(nextData),
        isRefreshing: Boolean(nextData) && !activeBootstrapData,
        isLoadingMore: false,
        hasMore: nextData?.pageInfo.hasMore === true
      };
    });

    if (activeBootstrapData) {
      writePromptLibraryClientCache(
        queryKey,
        options.requireImage,
        activeBootstrapData
      );
      return;
    }

    getPublicPromptLibraryResult({
      locale: query.locale,
      model: query.model,
      label: query.label,
      mediaType: query.mediaType,
      seoOnly: query.seoOnly,
      sort: query.sort,
      search: query.q,
      cursor: query.cursor,
      limit: query.limit,
      requireImage: options.requireImage
    })
      .then((result) => {
        if (cancelled) return;
        writePromptLibraryClientCache(queryKey, options.requireImage, result);
        setState({
          data: result,
          loadState: 'ready',
          error: null,
          isStale: false,
          isRefreshing: false,
          isLoadingMore: false,
          hasMore: result.pageInfo.hasMore
        });
      })
      .catch((error) => {
        if (cancelled) return;
        const normalizedError =
          error instanceof Error ? error : new Error(String(error));
        setState((current) => ({
          data: current.data,
          loadState: current.data ? 'ready' : 'error',
          error: normalizedError,
          isStale: Boolean(current.data),
          isRefreshing: false,
          isLoadingMore: false,
          hasMore: current.data?.pageInfo.hasMore === true
        }));
      });

    return () => {
      cancelled = true;
    };
  }, [
    bootstrapData,
    enabled,
    options.requireImage,
    query.cursor,
    query.label,
    query.limit,
    query.locale,
    query.mediaType,
    query.model,
    query.q,
    query.seoOnly,
    query.sort,
    queryKey,
    retryNonce
  ]);

  const retry = useCallback(() => {
    setRetryNonce((current) => current + 1);
  }, []);

  const loadMore = useCallback(() => {
    if (!enabled) return;
    const currentData = state.data;
    const nextCursor = currentData?.pageInfo.nextCursor;
    if (!currentData || !nextCursor || state.isLoadingMore) return;

    const requestKey = activeQueryKeyRef.current;
    setState((current) => ({
      ...current,
      error: null,
      isLoadingMore: true
    }));

    getPublicPromptLibraryResult({
      locale: query.locale,
      model: query.model,
      label: query.label,
      mediaType: query.mediaType,
      seoOnly: query.seoOnly,
      sort: query.sort,
      search: query.q,
      cursor: nextCursor,
      limit: query.limit,
      requireImage: options.requireImage
    })
      .then((result) => {
        if (activeQueryKeyRef.current !== requestKey) return;
        setState((current) => {
          if (!current.data) {
            writePromptLibraryClientCache(
              requestKey,
              options.requireImage,
              result
            );
            return {
              ...current,
              data: result,
              loadState: 'ready',
              error: null,
              isStale: false,
              isLoadingMore: false,
              hasMore: result.pageInfo.hasMore
            };
          }
          const merged = mergePromptLibraryResults(current.data, result);
          writePromptLibraryClientCache(
            requestKey,
            options.requireImage,
            merged
          );
          return {
            ...current,
            data: merged,
            loadState: 'ready',
            error: null,
            isStale: false,
            isLoadingMore: false,
            hasMore: merged.pageInfo.hasMore
          };
        });
      })
      .catch((error) => {
        if (activeQueryKeyRef.current !== requestKey) return;
        const normalizedError =
          error instanceof Error ? error : new Error(String(error));
        setState((current) => ({
          ...current,
          error: normalizedError,
          isStale: Boolean(current.data),
          isLoadingMore: false,
          hasMore: current.data?.pageInfo.hasMore === true
        }));
      });
  }, [
    enabled,
    options.requireImage,
    query.label,
    query.limit,
    query.locale,
    query.mediaType,
    query.model,
    query.q,
    query.seoOnly,
    query.sort,
    state.data,
    state.isLoadingMore
  ]);

  return {
    ...state,
    hasMore: state.data?.pageInfo.hasMore === true || state.hasMore,
    loadMore,
    retry
  };
}
