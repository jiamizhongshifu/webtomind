export interface AvatarUserLike {
  id?: string;
  email?: string | null;
  user_metadata?: {
    full_name?: string | null;
    name?: string | null;
    picture?: string | null;
    avatar_url?: string | null;
  } | null;
}

const AVATAR_CACHE_PREFIX = 'webtomind:avatar-url:';
const avatarPreloadPromises = new Map<string, Promise<boolean>>();

function canUseSessionStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined';
}

export function getUserAvatarUrl(user?: AvatarUserLike | null): string | null {
  return (
    user?.user_metadata?.picture?.trim() ||
    user?.user_metadata?.avatar_url?.trim() ||
    null
  );
}

export function getUserDisplayName(
  user?: AvatarUserLike | null,
  fallback = 'WebToMind User'
): string {
  return (
    user?.user_metadata?.full_name?.trim() ||
    user?.user_metadata?.name?.trim() ||
    user?.email?.split('@')[0]?.trim() ||
    fallback
  );
}

export function getAvatarInitial(
  user?: AvatarUserLike | null,
  fallback = 'W'
): string {
  const name = getUserDisplayName(user, '');
  const initial = name || user?.email || fallback;
  return (initial.slice(0, 1) || fallback).toUpperCase();
}

export function getAvatarCacheKey(user?: AvatarUserLike | null): string | null {
  if (!user?.id) return null;
  return `${AVATAR_CACHE_PREFIX}${user.id}`;
}

export function readCachedAvatarUrl(cacheKey?: string | null): string | null {
  if (!cacheKey || !canUseSessionStorage()) return null;

  try {
    return window.sessionStorage.getItem(cacheKey);
  } catch {
    return null;
  }
}

export function writeCachedAvatarUrl(
  cacheKey: string | null | undefined,
  url: string | null | undefined
): void {
  if (!cacheKey || !url || !canUseSessionStorage()) return;

  try {
    window.sessionStorage.setItem(cacheKey, url);
  } catch {
    // Storage can be unavailable in private browsing or strict WebViews.
  }
}

export function removeCachedAvatarUrl(cacheKey?: string | null): void {
  if (!cacheKey || !canUseSessionStorage()) return;

  try {
    window.sessionStorage.removeItem(cacheKey);
  } catch {
    // Storage can be unavailable in private browsing or strict WebViews.
  }
}

export function preloadAvatarUrl(
  url?: string | null,
  options: {
    cacheKey?: string | null;
    fetchPriority?: 'high' | 'low' | 'auto';
  } = {}
): Promise<boolean> {
  if (!url || typeof window === 'undefined') return Promise.resolve(false);

  const existing = avatarPreloadPromises.get(url);
  if (existing) return existing;

  const promise = new Promise<boolean>((resolve) => {
    const image = new Image();
    image.decoding = 'async';
    image.referrerPolicy = 'no-referrer';
    if (options.fetchPriority) {
      (image as HTMLImageElement & { fetchPriority?: string }).fetchPriority =
        options.fetchPriority;
    }
    image.onload = () => {
      writeCachedAvatarUrl(options.cacheKey, url);
      resolve(true);
    };
    image.onerror = () => {
      removeCachedAvatarUrl(options.cacheKey);
      resolve(false);
    };
    image.src = url;

    if (typeof image.decode === 'function') {
      image
        .decode()
        .then(() => {
          writeCachedAvatarUrl(options.cacheKey, url);
          resolve(true);
        })
        .catch(() => {
          // onerror will handle real failures; decode can reject for cached images.
        });
    }
  }).finally(() => {
    avatarPreloadPromises.delete(url);
  });

  avatarPreloadPromises.set(url, promise);
  return promise;
}

export function preloadUserAvatar(
  user?: AvatarUserLike | null,
  options: {
    fetchPriority?: 'high' | 'low' | 'auto';
  } = {}
): Promise<boolean> {
  const url = getUserAvatarUrl(user);
  return preloadAvatarUrl(url, {
    cacheKey: getAvatarCacheKey(user),
    fetchPriority: options.fetchPriority || 'low'
  });
}
