export interface VisualImageDisplaySource {
  thumbnailUrl?: string | null;
  previewUrl?: string | null;
  imageUrl?: string | null;
  width?: number | null;
  height?: number | null;
}

export type VisualImageDisplayVariant = 'thumbnail' | 'preview' | 'original';

function cleanUrl(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function getVisualImageDisplayUrl(
  source: VisualImageDisplaySource,
  variant: VisualImageDisplayVariant = 'preview'
): string | null {
  if (variant === 'thumbnail') {
    return (
      cleanUrl(source.thumbnailUrl) ||
      cleanUrl(source.previewUrl) ||
      cleanUrl(source.imageUrl)
    );
  }

  if (variant === 'original') {
    return (
      cleanUrl(source.imageUrl) ||
      cleanUrl(source.previewUrl) ||
      cleanUrl(source.thumbnailUrl)
    );
  }

  return (
    cleanUrl(source.previewUrl) ||
    cleanUrl(source.imageUrl) ||
    cleanUrl(source.thumbnailUrl)
  );
}

export function getVisualImageDisplayCandidates(
  source: VisualImageDisplaySource
): string[] {
  return Array.from(
    new Set(
      [
        cleanUrl(source.previewUrl),
        cleanUrl(source.imageUrl),
        cleanUrl(source.thumbnailUrl)
      ].filter((url): url is string => Boolean(url))
    )
  );
}

export function getVisualImageAspectRatio(
  source: Pick<VisualImageDisplaySource, 'width' | 'height'>,
  fallback = '1 / 1'
): string {
  const width = Number(source.width);
  const height = Number(source.height);
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return fallback;
  }
  return `${Math.round(width)} / ${Math.round(height)}`;
}
