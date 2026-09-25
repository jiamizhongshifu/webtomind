import { useEffect, useMemo, useState } from 'react';

export type VisualImageCacheVariant = 'thumbnail' | 'preview' | 'original';
export type VisualImageCacheStrategy = 'cache-first' | 'network-immediate';

const VISUAL_IMAGE_CACHE_NAME = 'webtomind-visual-images-v1';
const objectUrlMemory = new Map<string, string>();
const inFlight = new Map<string, Promise<string | null>>();

function hashCacheKey(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function canUseImageCache(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.caches !== 'undefined' &&
    typeof window.URL?.createObjectURL === 'function'
  );
}

function buildCacheRequest(
  id: string,
  variant: VisualImageCacheVariant,
  sourceUrl: string
) {
  const safeId = encodeURIComponent(id);
  const sourceVersion = hashCacheKey(sourceUrl);
  return new Request(
    `${window.location.origin}/__webtomind_visual_image_cache__/${variant}/${safeId}/${sourceVersion}`
  );
}

function canFetchImageForCache(sourceUrl: string): boolean {
  try {
    const url = new URL(sourceUrl, window.location.href);
    return url.origin === window.location.origin;
  } catch {
    return false;
  }
}

async function responseToObjectUrl(response: Response): Promise<string | null> {
  const blob = await response.blob();
  if (!blob.type.startsWith('image/')) return null;
  return URL.createObjectURL(blob);
}

async function loadCachedVisualImage(
  memoryKey: string,
  id: string,
  variant: VisualImageCacheVariant,
  sourceUrl: string
): Promise<string | null> {
  const existingObjectUrl = objectUrlMemory.get(memoryKey);
  if (existingObjectUrl) return existingObjectUrl;

  const existingRequest = inFlight.get(memoryKey);
  if (existingRequest) return existingRequest;

  if (!canFetchImageForCache(sourceUrl)) return null;

  const request = buildCacheRequest(id, variant, sourceUrl);
  const pending = (async () => {
    const cache = await caches.open(VISUAL_IMAGE_CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) {
      const objectUrl = await responseToObjectUrl(cached);
      if (objectUrl) {
        objectUrlMemory.set(memoryKey, objectUrl);
        return objectUrl;
      }
    }

    const response = await fetch(sourceUrl, {
      credentials: 'omit',
      mode: 'cors'
    });
    if (!response.ok) return null;
    await cache.put(request, response.clone());
    const objectUrl = await responseToObjectUrl(response);
    if (objectUrl) objectUrlMemory.set(memoryKey, objectUrl);
    return objectUrl;
  })()
    .catch(() => null)
    .finally(() => {
      inFlight.delete(memoryKey);
    });

  inFlight.set(memoryKey, pending);
  return pending;
}

export function useVisualImageCache({
  id,
  sourceUrl,
  variant,
  strategy = 'cache-first'
}: {
  id?: string | null;
  sourceUrl?: string | null;
  variant: VisualImageCacheVariant;
  strategy?: VisualImageCacheStrategy;
}): string {
  const cleanSourceUrl = sourceUrl?.trim() || '';
  const memoryKey = useMemo(
    () =>
      id && cleanSourceUrl
        ? `${variant}:${id}:${hashCacheKey(cleanSourceUrl)}`
        : '',
    [cleanSourceUrl, id, variant]
  );
  const [displayUrl, setDisplayUrl] = useState(() => {
    if (!memoryKey) return cleanSourceUrl;
    return objectUrlMemory.get(memoryKey) || cleanSourceUrl;
  });

  useEffect(() => {
    let cancelled = false;
    if (!cleanSourceUrl) {
      setDisplayUrl('');
      return () => {
        cancelled = true;
      };
    }

    if (!id || !canUseImageCache()) {
      setDisplayUrl(cleanSourceUrl);
      return () => {
        cancelled = true;
      };
    }

    const cachedObjectUrl = objectUrlMemory.get(memoryKey);
    if (cachedObjectUrl) {
      setDisplayUrl(cachedObjectUrl);
      return () => {
        cancelled = true;
      };
    }

    setDisplayUrl(cleanSourceUrl);

    if (strategy === 'network-immediate') {
      return () => {
        cancelled = true;
      };
    }

    void loadCachedVisualImage(memoryKey, id, variant, cleanSourceUrl).then(
      (cachedUrl) => {
        if (cancelled) return;
        if (!cachedUrl) {
          setDisplayUrl(cleanSourceUrl);
          return;
        }
        setDisplayUrl(cachedUrl);
      }
    );

    return () => {
      cancelled = true;
    };
  }, [cleanSourceUrl, id, memoryKey, strategy, variant]);

  return displayUrl;
}
