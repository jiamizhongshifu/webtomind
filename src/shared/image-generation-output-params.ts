export const DEFAULT_IMAGE_GENERATION_SIZE = '1024x1536';
export const DEFAULT_IMAGE_GENERATION_ASPECT_RATIO = '2:3';
export const MIN_IMAGE_GENERATION_PIXELS = 655_360;
export const MAX_IMAGE_GENERATION_PIXELS = 8_294_400;
export const MAX_IMAGE_GENERATION_SIDE = 3840;

export type ImageGenerationSizeValidation =
  | { ok: true; size: string }
  | { ok: false; reason: string };

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

function formatAspectRatio(width: number, height: number): string {
  const divisor = gcd(width, height);
  const normalized = `${width / divisor}:${height / divisor}`;
  return normalized === '7:3' ? '21:9' : normalized;
}

export function normalizeImageGenerationAspectRatio(
  value: string | undefined
): string | null {
  const normalized = (value || '').trim().replace(/[：∶]/g, ':').toLowerCase();
  if (!normalized) return null;
  if (normalized === 'auto') return 'auto';
  const match = normalized.match(/^(\d{1,2}):(\d{1,2})$/);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!width || !height) return null;
  const longShortRatio = Math.max(width, height) / Math.min(width, height);
  if (longShortRatio > 3) return null;
  return formatAspectRatio(width, height);
}

export function validateImageGenerationSize(
  value: string
): ImageGenerationSizeValidation {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[×＊*]/g, 'x');
  if (normalized === 'auto') return { ok: true, size: 'auto' };
  const match = normalized.match(/^(\d{2,4})x(\d{2,4})$/);
  if (!match) return { ok: false, reason: 'invalid imageSize format' };

  const width = Number(match[1]);
  const height = Number(match[2]);
  const pixels = width * height;
  const longSide = Math.max(width, height);
  const shortSide = Math.min(width, height);

  if (longSide > MAX_IMAGE_GENERATION_SIDE) {
    return { ok: false, reason: 'imageSize side exceeds 3840px' };
  }
  if (width % 16 !== 0 || height % 16 !== 0) {
    return { ok: false, reason: 'imageSize must use 16px increments' };
  }
  if (longSide / shortSide > 3) {
    return { ok: false, reason: 'imageSize aspect ratio exceeds 3:1' };
  }
  if (
    pixels < MIN_IMAGE_GENERATION_PIXELS ||
    pixels > MAX_IMAGE_GENERATION_PIXELS
  ) {
    return {
      ok: false,
      reason: 'imageSize pixel count is outside GPT Image 2 limits'
    };
  }

  return { ok: true, size: `${width}x${height}` };
}

export function deriveImageGenerationAspectRatio(
  size: string
): string | undefined {
  const match = size.match(/^(\d+)x(\d+)$/);
  if (!match) return undefined;
  return formatAspectRatio(Number(match[1]), Number(match[2]));
}

export function getDefaultImageGenerationSizeForAspectRatio(
  aspectRatio: string
): string {
  const normalized = normalizeImageGenerationAspectRatio(aspectRatio);
  const common: Record<string, string> = {
    '1:1': '1024x1024',
    '2:3': '1024x1536',
    '3:2': '1536x1024',
    '3:4': '1152x1536',
    '4:3': '1536x1152',
    '4:5': '1280x1600',
    '9:16': '1152x2048',
    '16:9': '2048x1152',
    '21:9': '2688x1152'
  };
  if (normalized && common[normalized]) return common[normalized];
  if (!normalized || normalized === 'auto') {
    return DEFAULT_IMAGE_GENERATION_SIZE;
  }

  const [ratioWidth, ratioHeight] = normalized.split(':').map(Number);
  const maxRatioSide = Math.max(ratioWidth, ratioHeight);
  let scale = Math.max(1, Math.floor(1536 / (maxRatioSide * 16)));
  while (
    ratioWidth * 16 * scale * (ratioHeight * 16 * scale) <
      MIN_IMAGE_GENERATION_PIXELS &&
    Math.max(ratioWidth, ratioHeight) * 16 * (scale + 1) <=
      MAX_IMAGE_GENERATION_SIDE
  ) {
    scale += 1;
  }

  const width = ratioWidth * 16 * scale;
  const height = ratioHeight * 16 * scale;
  const validated = validateImageGenerationSize(`${width}x${height}`);
  return validated.ok ? validated.size : DEFAULT_IMAGE_GENERATION_SIZE;
}

export function getImageGenerationSizeForSourceDimensions(
  width: number,
  height: number
): string {
  const normalizedWidth = Math.floor(Number(width));
  const normalizedHeight = Math.floor(Number(height));
  if (normalizedWidth <= 0 || normalizedHeight <= 0) {
    return DEFAULT_IMAGE_GENERATION_SIZE;
  }

  const exact = validateImageGenerationSize(
    `${normalizedWidth}x${normalizedHeight}`
  );
  if (exact.ok) return exact.size;

  return getDefaultImageGenerationSizeForAspectRatio(
    formatAspectRatio(normalizedWidth, normalizedHeight)
  );
}

export function detectPromptImageSize(prompt: string): string | undefined {
  const match = prompt.match(
    /(?:^|[^0-9])(\d{3,4})\s*[x×＊*]\s*(\d{3,4})(?:[^0-9]|$)/i
  );
  if (!match) return undefined;
  const validated = validateImageGenerationSize(`${match[1]}x${match[2]}`);
  return validated.ok ? validated.size : undefined;
}

const ORIENTATION_ASPECT_RATIO_HINTS: Array<[RegExp, string]> = [
  [/(?:竖版|竖屏|纵向|竖向|portrait)/i, '3:4'],
  [/(?:横版|横屏|横向|landscape)/i, '4:3'],
  // 「方形脸」是人像五官描述，不能误判为方形画幅。
  [/(?:正方形|方形(?!脸)|square)/i, '1:1']
];

export function detectPromptAspectRatio(prompt: string): string | undefined {
  const normalized = prompt
    .replace(/[：∶]/g, ':')
    .replace(/\s+/g, '')
    .toLowerCase();
  const match = normalized.match(/(?:^|[^0-9])(\d{1,2}:\d{1,2})(?:[^0-9]|$)/);
  if (match) {
    return normalizeImageGenerationAspectRatio(match[1]) || undefined;
  }
  // 提示词里只写了方向词（竖版/横版/方形）时，映射到常用的默认比例。
  for (const [pattern, ratio] of ORIENTATION_ASPECT_RATIO_HINTS) {
    if (pattern.test(normalized)) return ratio;
  }
  return undefined;
}

export function resolveImageGenerationPricingSize(input: {
  imageSize?: string;
  prompt?: string;
  promptMode?: string;
}): string {
  const configured = validateImageGenerationSize(input.imageSize || 'auto');
  const configuredSize = configured.ok ? configured.size : 'auto';
  if (configuredSize !== 'auto' || input.promptMode === 'composed') {
    return configuredSize;
  }

  const prompt = input.prompt || '';
  const promptSize = detectPromptImageSize(prompt);
  if (promptSize) return promptSize;
  const promptAspectRatio = detectPromptAspectRatio(prompt);
  return promptAspectRatio
    ? getDefaultImageGenerationSizeForAspectRatio(promptAspectRatio)
    : configuredSize;
}
