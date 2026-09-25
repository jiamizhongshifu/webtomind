import { useState, useCallback, useEffect, useRef } from 'react';
import { createLogger } from '@/utils/logger';
import { startTimer, endTimer } from '@/utils/perf-monitor';
import { getAllSummaries } from '@/services/workspace-api';
import type { SavedSummary } from '@/services/database';
import {
  getCachedSummaries,
  filterDeletedItems
} from '@/services/workspace-cache';

const log = createLogger('useWorkspaceSummaries');

export function useWorkspaceSummaries() {
  const [summaries, setSummaries] = useState<SavedSummary[]>([]);
  const [selectedSummary, setSelectedSummary] = useState<SavedSummary | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [hasMoreSummaries, setHasMoreSummaries] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const hasInitialLoadRef = useRef(false);

  /**
   * summaries 的 ref 镜像 — 给 loadMoreSummaries 内的 offset 计算用,避免
   * setSummaries 回调当 sync read 的反模式(React 18 strict mode 下会双执行)。
   */
  const summariesRef = useRef<SavedSummary[]>([]);
  useEffect(() => {
    summariesRef.current = summaries;
  }, [summaries]);

  /**
   * 加载更多的并发锁 — loadingMore state 异步,IntersectionObserver 在 fetch 进行中
   * 重复触发时,state 的 if-guard 来不及生效,会发出多个并发请求导致重复数据 / 无限加载。
   */
  const loadingMoreRef = useRef(false);

  // 智能合并函数：保留本地新增的卡片，并保留更完整的 markdown
  const mergeWithLocalItems = useCallback(
    (
      newData: SavedSummary[],
      source: string,
      currentState: SavedSummary[],
      projectId: string | null = null
    ): SavedSummary[] => {
      const filteredNewData = filterDeletedItems(newData);
      const newIds = new Set(filteredNewData.map((s) => s.id));
      const RECENT_THRESHOLD = 30 * 1000; // 30秒
      const now = Date.now();

      const localOnlyItems = filterDeletedItems(currentState).filter(
        (s) =>
          !newIds.has(s.id) &&
          (s.isSaving === true ||
            (s.createdAt && now - s.createdAt < RECENT_THRESHOLD)) &&
          (projectId === null ? true : s.projectId === projectId)
      );

      if (localOnlyItems.length > 0) {
        log.info(
          `[Workspace] Preserving ${localOnlyItems.length} local items from ${source}`
        );
      }

      const currentMap = new Map(currentState.map((s) => [s.id, s]));
      const mergedData = filteredNewData.map((newItem) => {
        const currentItem = currentMap.get(newItem.id);
        if (
          currentItem &&
          currentItem.markdown.length > newItem.markdown.length
        ) {
          log.info(
            `[Workspace] Preserving full local data for ${newItem.id}:`,
            'markdown:',
            currentItem.markdown.length,
            'vs',
            newItem.markdown.length,
            'title:',
            currentItem.title
          );
          return currentItem;
        }
        return newItem;
      });

      return [...localOnlyItems, ...mergedData];
    },
    []
  );

  const loadSummaries = useCallback(
    async (forceRefresh = false, projectId: string | null = null) => {
      const perfLabel = projectId
        ? `loadSummaries:${projectId}`
        : 'loadSummaries:all';
      startTimer(perfLabel, { forceRefresh, projectId });

      const showLoading = !forceRefresh;
      if (showLoading) setLoading(true);

      let hasAppliedUpdate = false;
      const isProjectLoad = projectId !== null;
      const loadLimit = isProjectLoad ? 20 : 100;

      try {
        const data = await getCachedSummaries(
          async () => {
            const result = await getAllSummaries(projectId || undefined, {
              limit: loadLimit,
              offset: 0
            });
            setHasMoreSummaries(result.hasMore);
            return result.summaries;
          },
          {
            projectId: projectId || undefined,
            forceRefresh,
            onCacheHit: (cached) => {
              log.info('[Workspace] Summaries from cache:', cached.length);
              hasAppliedUpdate = true;
              const cacheLimit = isProjectLoad ? 20 : 100;
              if (cached.length >= cacheLimit) {
                setHasMoreSummaries(true);
              }
              setSummaries((prev) => {
                if (projectId !== null) {
                  if (cached.length > 0) setLoading(false);
                  const otherProjectData = prev.filter(
                    (s) => s.projectId !== projectId
                  );
                  const filteredCached = filterDeletedItems(cached);
                  return [...filteredCached, ...otherProjectData];
                }
                const nonSavingLocal = prev.filter((s) => !s.isSaving);
                if (cached.length === 0 && nonSavingLocal.length > 0) {
                  return prev;
                }
                const merged = mergeWithLocalItems(
                  cached,
                  'cache',
                  prev,
                  projectId
                );
                if (cached.length > 0) setLoading(false);
                return merged;
              });
            },
            onFreshData: (fresh) => {
              setLoading(false);
              log.info('[Workspace] Summaries from server:', fresh.length);
              hasAppliedUpdate = true;

              setSummaries((prev) => {
                if (projectId !== null) {
                  const otherProjectData = prev.filter(
                    (s) => s.projectId !== projectId
                  );
                  const filteredFresh = filterDeletedItems(fresh);
                  return [...filteredFresh, ...otherProjectData];
                }

                const nonSavingLocal = prev.filter((s) => !s.isSaving);
                if (fresh.length === 0 && nonSavingLocal.length > 0) {
                  return prev;
                }
                if (
                  nonSavingLocal.length > 0 &&
                  fresh.length < nonSavingLocal.length * 0.3
                ) {
                  return prev;
                }
                return mergeWithLocalItems(fresh, 'server', prev, projectId);
              });
            }
          }
        );

        log.info('[Workspace] Loaded summaries:', data.length);

        if (!hasAppliedUpdate) {
          hasAppliedUpdate = true;
          setSummaries((prev) =>
            mergeWithLocalItems(data, 'deduplicated', prev, projectId)
          );
        }
      } catch (error) {
        log.error('[Workspace] Load summaries failed:', error);
      } finally {
        setLoading(false);
        endTimer(perfLabel, { count: summaries.length });
      }
    },
    [mergeWithLocalItems, summaries.length]
  );

  const loadMoreSummaries = useCallback(
    async (currentProjectId: string | null) => {
      // 同步锁 — IntersectionObserver 在 fetch 中重复触发时,state 的 loadingMore
      // 还没异步刷新,这里靠 ref 立刻阻断
      if (loadingMoreRef.current || !hasMoreSummaries) return;
      loadingMoreRef.current = true;
      setLoadingMore(true);

      // 直接读 ref 镜像,不再依赖 setSummaries 回调
      const currentOffset = currentProjectId
        ? summariesRef.current.filter(
            (s) => s.projectId === currentProjectId
          ).length
        : summariesRef.current.length;

      const limit = 20;

      try {
        const result = await getAllSummaries(currentProjectId || undefined, {
          limit,
          offset: currentOffset
        });

        const { summaries: newSummaries, hasMore } = result;
        const filteredNew = filterDeletedItems(newSummaries);

        setSummaries((prev) => {
          const existingIds = new Set(prev.map((s) => s.id));
          const uniqueNew = filteredNew.filter((s) => !existingIds.has(s.id));
          return [...prev, ...uniqueNew];
        });

        setHasMoreSummaries(hasMore);
      } catch (error) {
        log.error('[Workspace] Load more summaries failed:', error);
      } finally {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
    },
    [hasMoreSummaries]
  );

  return {
    summaries,
    setSummaries,
    selectedSummary,
    setSelectedSummary,
    loading,
    setLoading,
    isDetailLoading,
    setIsDetailLoading,
    hasMoreSummaries,
    setHasMoreSummaries,
    loadingMore,
    setLoadingMore,
    hasInitialLoadRef,
    loadSummaries,
    loadMoreSummaries,
    mergeWithLocalItems
  };
}
