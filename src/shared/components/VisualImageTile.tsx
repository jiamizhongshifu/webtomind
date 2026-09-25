import type { ReactNode } from 'react';
import {
  useVisualImageCache,
  type VisualImageCacheStrategy,
  type VisualImageCacheVariant
} from '../useVisualImageCache';
import { imageFetchPriority, type ImageFetchPriority } from '../ui';

export interface VisualImageTileProps {
  imageUrl?: string | null;
  cacheId?: string | null;
  cacheVariant?: VisualImageCacheVariant;
  cacheStrategy?: VisualImageCacheStrategy;
  alt: string;
  active?: boolean;
  loaded?: boolean;
  loading?: 'eager' | 'lazy';
  fetchPriority?: ImageFetchPriority;
  placeholder: ReactNode;
  className?: string;
  onClick?: () => void;
  onImageLoad?: () => void;
}

export function VisualImageTile({
  imageUrl,
  cacheId,
  cacheVariant = 'thumbnail',
  cacheStrategy = 'cache-first',
  alt,
  active = false,
  loaded = false,
  loading = 'lazy',
  fetchPriority = 'auto',
  placeholder,
  className = '',
  onClick,
  onImageLoad
}: VisualImageTileProps) {
  const cachedImageUrl = useVisualImageCache({
    id: cacheId,
    sourceUrl: imageUrl,
    variant: cacheVariant,
    strategy: cacheStrategy
  });
  const hasImage = Boolean(cachedImageUrl);
  const isLoaded = hasImage && loaded;

  return (
    <button
      type="button"
      className={`visual-image-tile ${active ? 'active' : ''} ${
        isLoaded ? 'is-loaded' : 'is-loading'
      } ${className}`.trim()}
      onClick={onClick}
    >
      {hasImage && (
        <img
          src={cachedImageUrl || undefined}
          alt={alt}
          loading={loading}
          decoding="async"
          {...imageFetchPriority(fetchPriority)}
          onLoad={onImageLoad}
        />
      )}
      {(!hasImage || !isLoaded) && placeholder}
    </button>
  );
}
