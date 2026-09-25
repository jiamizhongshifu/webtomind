const DISCOVERY_IMAGE_TONES = [
  '#536863',
  '#8a745e',
  '#4e6079',
  '#7d4b55',
  '#80633e',
  '#53506d',
  '#3e665c',
  '#87513b',
  '#64615b',
  '#6f3555'
] as const;

export function fallbackDiscoveryImageTone(imageUrl: string): string {
  let hash = 2166136261;
  for (let index = 0; index < imageUrl.length; index += 1) {
    hash ^= imageUrl.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return DISCOVERY_IMAGE_TONES[Math.abs(hash) % DISCOVERY_IMAGE_TONES.length];
}

export function shuffleDiscoveryImages<T>(
  images: readonly T[],
  random: () => number = Math.random
): T[] {
  const shuffled = [...images];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = Math.min(
      index,
      Math.max(0, Math.floor(random() * (index + 1)))
    );
    [shuffled[index], shuffled[target]] = [
      shuffled[target],
      shuffled[index]
    ];
  }

  // A valid shuffle can occasionally preserve the source order. Rotate once
  // so every newly loaded multi-image waterfall visibly changes its ordering.
  if (
    shuffled.length > 1 &&
    shuffled.every((item, index) => item === images[index])
  ) {
    shuffled.push(shuffled.shift() as T);
  }
  return shuffled;
}

function colorSaturation(red: number, green: number, blue: number): number {
  return Math.max(red, green, blue) - Math.min(red, green, blue);
}

/**
 * Samples an already loaded image at low resolution and returns its dominant
 * visible color. Cross-origin images can make canvas pixels unreadable; the
 * caller should retain its deterministic fallback tone in that case.
 */
export function extractDominantImageColor(
  image: HTMLImageElement
): string | null {
  if (!image.naturalWidth || !image.naturalHeight) return null;
  const canvas = document.createElement('canvas');
  const size = 24;
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;

  try {
    context.drawImage(image, 0, 0, size, size);
    const pixels = context.getImageData(0, 0, size, size).data;
    const buckets = new Map<
      string,
      { count: number; red: number; green: number; blue: number; weight: number }
    >();
    for (let index = 0; index < pixels.length; index += 4) {
      const alpha = pixels[index + 3];
      if (alpha < 160) continue;
      const red = pixels[index];
      const green = pixels[index + 1];
      const blue = pixels[index + 2];
      const luminance = (red * 299 + green * 587 + blue * 114) / 1000;
      if (luminance < 10 || luminance > 247) continue;
      const key = `${red >> 5}-${green >> 5}-${blue >> 5}`;
      const saturation = colorSaturation(red, green, blue);
      const weight = 1 + saturation / 255;
      const bucket = buckets.get(key) || {
        count: 0,
        red: 0,
        green: 0,
        blue: 0,
        weight: 0
      };
      bucket.count += 1;
      bucket.red += red;
      bucket.green += green;
      bucket.blue += blue;
      bucket.weight += weight;
      buckets.set(key, bucket);
    }

    const winner = [...buckets.values()].sort(
      (left, right) => right.count * right.weight - left.count * left.weight
    )[0];
    if (!winner?.count) return null;
    return `rgb(${Math.round(winner.red / winner.count)} ${Math.round(
      winner.green / winner.count
    )} ${Math.round(winner.blue / winner.count)})`;
  } catch {
    return null;
  }
}

