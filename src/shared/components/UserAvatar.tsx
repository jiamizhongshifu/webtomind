import React, { useEffect, useMemo, useState } from 'react';
import { clsx } from 'clsx';
import {
  getAvatarCacheKey,
  getAvatarInitial,
  getUserAvatarUrl,
  preloadAvatarUrl,
  readCachedAvatarUrl,
  removeCachedAvatarUrl,
  writeCachedAvatarUrl,
  type AvatarUserLike
} from '../avatar-utils';
import { imageFetchPriority, type ImageFetchPriority } from '../ui';

interface UserAvatarProps
  extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'children'> {
  user?: AvatarUserLike | null;
  src?: string | null;
  name?: string | null;
  email?: string | null;
  alt?: string;
  size?: number;
  imageClassName?: string;
  fallbackClassName?: string;
  loading?: 'eager' | 'lazy';
  fetchPriority?: ImageFetchPriority;
  cache?: 'session' | 'none';
  preload?: boolean;
  fallbackIcon?: React.ReactNode;
}

export function UserAvatar({
  user,
  src,
  name,
  email,
  alt = '',
  size,
  className = '',
  imageClassName = '',
  fallbackClassName = '',
  loading = 'lazy',
  fetchPriority,
  cache = 'session',
  preload = false,
  fallbackIcon,
  style,
  ...spanProps
}: UserAvatarProps) {
  const cacheKey = cache === 'session' ? getAvatarCacheKey(user) : null;
  const sourceUrl = src?.trim() || getUserAvatarUrl(user);
  const fallbackText = useMemo(() => {
    if (fallbackIcon) return null;
    if (name?.trim()) return name.trim().slice(0, 1).toUpperCase();
    if (email?.trim()) return email.trim().slice(0, 1).toUpperCase();
    return getAvatarInitial(user);
  }, [email, fallbackIcon, name, user]);
  const [displaySrc, setDisplaySrc] = useState<string | null>(() => {
    if (sourceUrl) return sourceUrl;
    return cache === 'session' ? readCachedAvatarUrl(cacheKey) : null;
  });
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  useEffect(() => {
    const cachedUrl = cache === 'session' ? readCachedAvatarUrl(cacheKey) : null;
    const nextUrl = sourceUrl || cachedUrl;
    setFailedSrc(null);
    setDisplaySrc(nextUrl);

    if (nextUrl && (preload || loading === 'eager')) {
      void preloadAvatarUrl(nextUrl, {
        cacheKey,
        fetchPriority: fetchPriority || (loading === 'eager' ? 'high' : 'low')
      });
    }
  }, [cache, cacheKey, fetchPriority, loading, preload, sourceUrl]);

  const shouldRenderImage = Boolean(displaySrc && displaySrc !== failedSrc);
  const avatarStyle = size
    ? { width: size, height: size, ...style }
    : style;

  return (
    <span
      {...spanProps}
      className={clsx('user-avatar', className)}
      style={avatarStyle}
      data-avatar-loaded={shouldRenderImage ? 'true' : 'false'}
    >
      {shouldRenderImage && displaySrc ? (
        <img
          src={displaySrc}
          alt={alt}
          className={clsx('user-avatar__image', imageClassName)}
          loading={loading}
          decoding="async"
          {...imageFetchPriority(fetchPriority || 'auto')}
          referrerPolicy="no-referrer"
          draggable={false}
          onLoad={() => writeCachedAvatarUrl(cacheKey, displaySrc)}
          onError={() => {
            setFailedSrc(displaySrc);
            setDisplaySrc(null);
            removeCachedAvatarUrl(cacheKey);
          }}
        />
      ) : (
        <span
          className={clsx('user-avatar__fallback', fallbackClassName)}
          aria-hidden="true"
        >
          {fallbackIcon || fallbackText}
        </span>
      )}
    </span>
  );
}
