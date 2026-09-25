const VISUAL_SUMMARY_ASPECT_CACHE_KEY =
  'workspace:visual-summary-aspect-ratios:v1';
const VISUAL_SUMMARY_ASPECT_CACHE_LIMIT = 800;

type AspectCacheEntry = {
  ratio: string;
  updatedAt: number;
};

type AspectCacheMap = Record<string, AspectCacheEntry>;

function isBrowser(): boolean {
  return typeof window !== 'undefined' && Boolean(window.localStorage);
}

function isValidAspectRatio(ratio: string | null | undefined): ratio is string {
  if (!ratio) return false;
  return /^\d+(?:\.\d+)?\s*\/\s*\d+(?:\.\d+)?$/.test(ratio.trim());
}

function hashSource(src: string): string {
  let hash = 0;
  for (let index = 0; index < src.length; index += 1) {
    hash = (hash * 31 + src.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function getCacheId(summaryId: string, src: string): string {
  return `${summaryId}:${hashSource(src)}`;
}

function readCache(): AspectCacheMap {
  if (!isBrowser()) return {};

  try {
    const raw = window.localStorage.getItem(VISUAL_SUMMARY_ASPECT_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as AspectCacheMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeCache(cache: AspectCacheMap): void {
  if (!isBrowser()) return;

  try {
    const entries = Object.entries(cache);
    const limited =
      entries.length > VISUAL_SUMMARY_ASPECT_CACHE_LIMIT
        ? Object.fromEntries(
            entries
              .sort(([, a], [, b]) => b.updatedAt - a.updatedAt)
              .slice(0, VISUAL_SUMMARY_ASPECT_CACHE_LIMIT)
          )
        : cache;

    window.localStorage.setItem(
      VISUAL_SUMMARY_ASPECT_CACHE_KEY,
      JSON.stringify(limited)
    );
  } catch {
    // localStorage can be unavailable in private mode or under quota pressure.
  }
}

export function readVisualSummaryAspectRatioCache(
  summaryId: string,
  src: string | null | undefined
): string | null {
  if (!summaryId || !src) return null;
  const entry = readCache()[getCacheId(summaryId, src)];
  return isValidAspectRatio(entry?.ratio) ? entry.ratio.trim() : null;
}

export function writeVisualSummaryAspectRatioCache(
  summaryId: string,
  src: string | null | undefined,
  ratio: string
): void {
  if (!summaryId || !src || !isValidAspectRatio(ratio)) return;
  const cache = readCache();
  cache[getCacheId(summaryId, src)] = {
    ratio: ratio.trim(),
    updatedAt: Date.now()
  };
  writeCache(cache);
}
