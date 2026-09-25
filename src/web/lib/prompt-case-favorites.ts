import { useCallback, useEffect, useMemo, useState } from 'react';

const PROMPT_CASE_FAVORITES_STORAGE_KEY = 'webtomind:prompt-case-favorites:v1';

export const PROMPT_CASE_FAVORITES_CHANGED_EVENT =
  'webtomind:prompt-case-favorites-changed';

function canUseBrowserStorage(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return Boolean(window.localStorage);
  } catch {
    return false;
  }
}

function readPromptCaseFavoriteIds(): string[] {
  if (!canUseBrowserStorage()) return [];
  try {
    const rawValue = window.localStorage.getItem(
      PROMPT_CASE_FAVORITES_STORAGE_KEY
    );
    const parsed = rawValue ? JSON.parse(rawValue) : [];
    if (!Array.isArray(parsed)) return [];
    return Array.from(
      new Set(
        parsed
          .filter((item): item is string => typeof item === 'string')
          .map((item) => item.trim())
          .filter(Boolean)
      )
    );
  } catch {
    return [];
  }
}

function writePromptCaseFavoriteIds(ids: string[]): string[] {
  const normalizedIds = Array.from(new Set(ids.map((id) => id.trim()))).filter(
    Boolean
  );
  if (!canUseBrowserStorage()) return normalizedIds;
  try {
    window.localStorage.setItem(
      PROMPT_CASE_FAVORITES_STORAGE_KEY,
      JSON.stringify(normalizedIds)
    );
    window.dispatchEvent(new Event(PROMPT_CASE_FAVORITES_CHANGED_EVENT));
  } catch {
    // Keep the current tab responsive even when storage is blocked or full.
  }
  return normalizedIds;
}

export function usePromptCaseFavorites() {
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() =>
    readPromptCaseFavoriteIds()
  );

  useEffect(() => {
    const syncFavorites = () => setFavoriteIds(readPromptCaseFavoriteIds());
    window.addEventListener('storage', syncFavorites);
    window.addEventListener(PROMPT_CASE_FAVORITES_CHANGED_EVENT, syncFavorites);
    return () => {
      window.removeEventListener('storage', syncFavorites);
      window.removeEventListener(
        PROMPT_CASE_FAVORITES_CHANGED_EVENT,
        syncFavorites
      );
    };
  }, []);

  const favoriteIdSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);

  const isFavorited = useCallback(
    (caseId?: string | null) => Boolean(caseId && favoriteIdSet.has(caseId)),
    [favoriteIdSet]
  );

  const toggleFavorite = useCallback((caseId?: string | null) => {
    if (!caseId) return;
    setFavoriteIds((currentIds) => {
      const nextIds = currentIds.includes(caseId)
        ? currentIds.filter((id) => id !== caseId)
        : [caseId, ...currentIds];
      return writePromptCaseFavoriteIds(nextIds);
    });
  }, []);

  return { favoriteIds, favoriteIdSet, isFavorited, toggleFavorite };
}
