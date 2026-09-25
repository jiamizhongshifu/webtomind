const SUPABASE_PUBLIC_OBJECT_PATH = '/storage/v1/object/public/';

export const PROMPT_LIBRARY_CARD_IMAGE_SIZES =
  '(max-width: 520px) calc((100vw - 40px) / 2), (max-width: 820px) calc((100vw - 60px) / 2), (max-width: 1120px) calc((100vw - 260px) / 2), 260px';
export const PROMPT_LIBRARY_CARD_IMAGE_WIDTHS = [320, 480, 640];

function getTwitterImageVariant(width: number): 'small' | 'medium' | 'large' {
  if (width <= 680) return 'small';
  if (width <= 1200) return 'medium';
  return 'large';
}

export function getOptimizedPromptCaseImageUrl(
  imageUrl: string,
  options: { width?: number; quality?: number } = {}
): string {
  const sourceUrl = imageUrl.trim();
  if (!sourceUrl) return '';

  try {
    const url = new URL(sourceUrl);
    const width = options.width || 640;
    const markerIndex = url.pathname.indexOf(SUPABASE_PUBLIC_OBJECT_PATH);

    if (markerIndex >= 0) {
      const bucketAndPath = url.pathname.slice(
        markerIndex + SUPABASE_PUBLIC_OBJECT_PATH.length
      );
      if (!bucketAndPath) return sourceUrl;

      url.pathname = `${url.pathname.slice(
        0,
        markerIndex
      )}/storage/v1/render/image/public/${bucketAndPath}`;
      url.searchParams.set('width', String(width));
      url.searchParams.set('quality', String(options.quality || 72));
      url.searchParams.set('resize', 'contain');
      // Supabase render endpoint re-encodes server-side: webp 对 PNG/JPG 封面
      // 平均可减 90%+ 体积（实测 594KB PNG → 21KB WebP），是移动端 LCP 的关键。
      url.searchParams.set('format', 'webp');
      return url.toString();
    }

    if (
      url.hostname === 'pbs.twimg.com' &&
      url.pathname.startsWith('/media/')
    ) {
      const extension = url.pathname.match(/\.([a-z0-9]+)$/i)?.[1];
      if (extension) url.searchParams.set('format', extension.toLowerCase());
      url.searchParams.set('name', getTwitterImageVariant(width));
      return url.toString();
    }

    return sourceUrl;
  } catch {
    return sourceUrl;
  }
}

export function getPromptCaseResponsiveImageSet(
  imageUrl: string,
  widths: readonly number[] = [320, 640, 960]
): string {
  const sourceUrl = imageUrl.trim();
  if (!sourceUrl) return '';
  return widths
    .map(
      (width) =>
        `${getOptimizedPromptCaseImageUrl(sourceUrl, { width })} ${width}w`
    )
    .join(', ');
}
