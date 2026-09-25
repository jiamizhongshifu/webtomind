import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getVisualImageHistoryByIds,
  getVisualVideoHistoryByIds
} from '@/services/agent-api';
import type { ImageCreationTurn } from '@/shared/create-workspace-v2';
import type {
  VisualImageHistoryItem,
  VisualVideoGenerationItem
} from '@/services/agent-api';

export type CreationSessionHistoryItem =
  | VisualImageHistoryItem
  | VisualVideoGenerationItem;

export function useImageSessionConversation(
  turns: ImageCreationTurn[],
  mediaType: 'image' | 'video' = 'image'
) {
  const generationIds = useMemo(
    () => Array.from(new Set(turns.flatMap((turn) => turn.generationIds))),
    [turns]
  );
  const generationKey = generationIds.join(',');
  const [historyById, setHistoryById] = useState<
    Record<string, CreationSessionHistoryItem>
  >({});
  const [missingIds, setMissingIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!generationKey) {
      setHistoryById({});
      setMissingIds([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const batches = Array.from(
      { length: Math.ceil(generationIds.length / 60) },
      (_, index) => generationIds.slice(index * 60, index * 60 + 60)
    );
    const requests: Array<
      Promise<{ items: CreationSessionHistoryItem[]; missingIds: string[] }>
    > = batches.map(async (ids) => {
      if (mediaType === 'video') return getVisualVideoHistoryByIds(ids);
      return getVisualImageHistoryByIds(ids);
    });
    void Promise.all(requests)
      .then((results) => {
        if (cancelled) return;
        const items = results.flatMap((result) => result.items);
        setHistoryById(
          Object.fromEntries(
            items.map((item) => [
              'generationId' in item ? item.generationId : item.id,
              item
            ])
          )
        );
        setMissingIds(results.flatMap((result) => result.missingIds));
      })
      .catch(() => {
        if (!cancelled) {
          setHistoryById({});
          setMissingIds(generationIds);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [generationIds, generationKey, mediaType]);

  const removeHistoryItems = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    const removed = new Set(ids);
    setHistoryById((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([id]) => !removed.has(id))
      )
    );
    setMissingIds((current) => Array.from(new Set([...current, ...ids])));
  }, []);

  const updateHistoryItem = useCallback((item: CreationSessionHistoryItem) => {
    const id = 'generationId' in item ? item.generationId : item.id;
    setHistoryById((current) => ({
      ...current,
      [id]: { ...current[id], ...item } as CreationSessionHistoryItem
    }));
  }, []);

  return {
    historyById,
    missingIds,
    loading,
    removeHistoryItems,
    updateHistoryItem
  };
}
