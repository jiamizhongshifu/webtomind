export const IMAGE_GENERATION_BASE_CREDIT_COST = 60;
export const IMAGE_GENERATION_LARGE_2K_CREDIT_COST = 100;
export const IMAGE_GENERATION_4K_CREDIT_COST = 300;
export const IMAGE_GENERATION_DRAFT_CREDIT_COST = 40;
// Quality is a cost floor, not a surcharge stacked on top of resolution.
// This keeps the quote tied to the more expensive dimension and avoids
// charging twice when a high-quality request also uses a large output size.
export const IMAGE_GENERATION_MEDIUM_QUALITY_CREDIT_FLOOR = 150;
export const IMAGE_GENERATION_HIGH_QUALITY_CREDIT_FLOOR = 600;
// 参考图按输入图 token 计费（官方 GPT Image 2：1 token/32×32 patch，每张上限 1536
// token）。以 1024×1024（1024 token）≈ 20 积分作为锚点保持连续性，按实际像素缩放：
// 512² ≈ 5 积分、1K ≈ 20、2K/4K 封顶 ≈ 30。未提供尺寸时回退按张固定计费。
export const IMAGE_GENERATION_REFERENCE_IMAGE_SURCHARGE = 20;
export const IMAGE_GENERATION_REFERENCE_TOKEN_RATE = 20 / 1024;
export const IMAGE_GENERATION_REFERENCE_MAX_TOKENS_PER_IMAGE = 1536;
// 角色一致性不再单独收取模式费：官方没有「角色一致性」收费项，它只是 N 张输入图 +
// 提示词，费用已由参考图（按像素）覆盖，避免「模式费 + 图费」双收。
export const IMAGE_GENERATION_CHARACTER_MODE_SURCHARGE = 0;
export const IMAGE_GENERATION_DEFAULT_MODEL_MULTIPLIER = 1;

const IMAGE_GENERATION_MODEL_MULTIPLIERS: Record<string, number> = {
  'gpt-image-2': 1,
  'gpt-image-2.5': 1,
  'nano-banana': 1,
  // 与 nano-banana 同一后端模型（gemini-3.1-flash-image-preview），成本一致。
  'nano-banana-2': 1,
  'nano-banana-pro': 1.8,
  'midjourney-v7': 2.2,
  'midjourney-niji-v7': 2.2,
  // Seedream 5.0 Pro 官方按张计费：≤236 万像素 ¥0.3/张，>236 万像素 ¥0.6/张；
  // 高于 5.0 Lite（1.5），与 Pro 级旗舰定位一致。
  'seedream-5-pro': 2,
  'seedream-5-lite': 1.5,
  'wan-image-2-7-pro': 1.6
};

export type ImageGenerationCreditTier = 'base' | 'large-2k' | '4k';
export type ImageGenerationQualityProfile = 'auto' | 'low' | 'medium' | 'high';
export type ImageGenerationReferenceMode =
  | 'none'
  | 'image_reference'
  | 'character_consistency';

export interface ImageGenerationReferenceSize {
  width: number;
  height: number;
}

export interface ImageGenerationCreditInput {
  imageSize?: string;
  quality?: string;
  model?: string;
  referenceImageCount?: number;
  referenceMode?: string;
  /** 参考图宽高；有值时按官方输入图 token（32×32 patch，每张 ≤1536 token）计费。 */
  referenceImageSizes?: ImageGenerationReferenceSize[];
}

export interface ImageGenerationCreditEstimate {
  cost: number;
  tier: ImageGenerationCreditTier;
  imageSize: string;
  megapixels: number | null;
  baseCost: number;
  qualityAdjustment: number;
  referenceAdjustment: number;
  modeAdjustment: number;
  modelMultiplier: number;
  modelAdjustment: number;
}

function parseImageSize(imageSize?: string): {
  width: number;
  height: number;
} | null {
  const normalized = (imageSize || '').trim().toLowerCase();
  const match = normalized.match(/^(\d{2,4})x(\d{2,4})$/);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!width || !height) return null;
  return { width, height };
}

const IMAGE_GENERATION_1K_PRESET_SIZES = new Set([
  '1792x768',
  '1536x864',
  '864x1536'
]);
const IMAGE_GENERATION_4K_PRESET_SIZES = new Set([
  '2880x2880',
  '2304x3456',
  '3456x2304',
  '2304x3072',
  '3072x2304',
  '2560x3200',
  '3200x2560',
  '3840x2160',
  '2160x3840',
  '3808x1632'
]);

export function getImageGenerationResolutionTier(
  imageSize?: string
): ImageGenerationCreditTier {
  const parsed = parseImageSize(imageSize);
  if (!parsed) return 'base';
  const normalized = `${parsed.width}x${parsed.height}`;
  if (IMAGE_GENERATION_4K_PRESET_SIZES.has(normalized)) return '4k';
  if (IMAGE_GENERATION_1K_PRESET_SIZES.has(normalized)) return 'base';

  const pixels = parsed.width * parsed.height;
  const longSide = Math.max(parsed.width, parsed.height);
  if (pixels >= 8_000_000 || longSide >= 3840) return '4k';
  if (pixels >= 2_800_000 || longSide > 1792) return 'large-2k';
  return 'base';
}

function normalizeQuality(quality?: string): ImageGenerationQualityProfile {
  const normalized = (quality || 'auto').trim().toLowerCase();
  if (normalized === 'low' || normalized === 'fast' || normalized === 'draft') {
    return 'low';
  }
  if (normalized === 'medium' || normalized === 'standard') return 'medium';
  if (
    normalized === 'high' ||
    normalized === 'high-detail' ||
    normalized === '2k' ||
    normalized === '4k'
  ) {
    return 'high';
  }
  return 'auto';
}

function normalizeModelKey(model?: string): string {
  return (model || 'gpt-image-2.5').trim().toLowerCase();
}

export function getImageGenerationModelMultiplier(model?: string): number {
  const normalized = normalizeModelKey(model);
  return (
    IMAGE_GENERATION_MODEL_MULTIPLIERS[normalized] ||
    IMAGE_GENERATION_DEFAULT_MODEL_MULTIPLIER
  );
}

export function isImageGeneration4KSize(imageSize?: string): boolean {
  return getImageGenerationResolutionTier(imageSize) === '4k';
}

export function getStableImageGenerationQuality(input: {
  model?: string;
  imageSize?: string;
  quality?: string;
}): ImageGenerationQualityProfile {
  return normalizeQuality(input.quality);
}

function normalizeReferenceMode(
  referenceMode?: string
): ImageGenerationReferenceMode {
  const normalized = (referenceMode || 'none').trim().toLowerCase();
  if (normalized === 'character_consistency') return 'character_consistency';
  if (normalized === 'image_reference') return 'image_reference';
  return 'none';
}

function getQualityFloor(quality?: string): number | null {
  const normalized = normalizeQuality(quality);
  if (normalized === 'low') return IMAGE_GENERATION_DRAFT_CREDIT_COST;
  if (normalized === 'medium') {
    return IMAGE_GENERATION_MEDIUM_QUALITY_CREDIT_FLOOR;
  }
  if (normalized === 'high') {
    return IMAGE_GENERATION_HIGH_QUALITY_CREDIT_FLOOR;
  }
  return null;
}

function getQualityAdjustedBase(baseCost: number, quality?: string): number {
  const normalized = normalizeQuality(quality);
  if (normalized === 'low') {
    return baseCost === IMAGE_GENERATION_BASE_CREDIT_COST
      ? IMAGE_GENERATION_DRAFT_CREDIT_COST
      : baseCost;
  }
  const qualityFloor = getQualityFloor(normalized);
  return qualityFloor === null ? baseCost : Math.max(baseCost, qualityFloor);
}

function getReferenceImageInputTokens(
  size: ImageGenerationReferenceSize
): number {
  const width = Math.max(1, Math.floor(Number(size?.width) || 0));
  const height = Math.max(1, Math.floor(Number(size?.height) || 0));
  if (!width || !height) return 0;
  const patches = Math.ceil(width / 32) * Math.ceil(height / 32);
  return Math.min(IMAGE_GENERATION_REFERENCE_MAX_TOKENS_PER_IMAGE, patches);
}

function getReferenceAdjustment(
  referenceImageCount?: number,
  referenceImageSizes?: ImageGenerationReferenceSize[]
): number {
  const count = Math.max(0, Math.min(16, Math.floor(referenceImageCount || 0)));
  if (!Array.isArray(referenceImageSizes) || referenceImageSizes.length === 0) {
    return count * IMAGE_GENERATION_REFERENCE_IMAGE_SURCHARGE;
  }
  const known = referenceImageSizes
    .slice(0, count)
    .filter(
      (size): size is ImageGenerationReferenceSize =>
        Number.isFinite(Number(size?.width)) &&
        Number.isFinite(Number(size?.height)) &&
        Number(size.width) > 0 &&
        Number(size.height) > 0
    );
  const tokens = known.reduce(
    (sum, size) => sum + getReferenceImageInputTokens(size),
    0
  );
  const unknownCount = count - known.length;
  return (
    Math.round(tokens * IMAGE_GENERATION_REFERENCE_TOKEN_RATE) +
    unknownCount * IMAGE_GENERATION_REFERENCE_IMAGE_SURCHARGE
  );
}

function getModeAdjustment(referenceMode?: string): number {
  return normalizeReferenceMode(referenceMode) === 'character_consistency'
    ? IMAGE_GENERATION_CHARACTER_MODE_SURCHARGE
    : 0;
}

function getPricingInput(
  input?: string | ImageGenerationCreditInput
): ImageGenerationCreditInput {
  return typeof input === 'string' || input === undefined
    ? { imageSize: input }
    : input;
}

function buildEstimate(
  baseCost: number,
  tier: ImageGenerationCreditTier,
  imageSize: string,
  megapixels: number | null,
  input: ImageGenerationCreditInput
): ImageGenerationCreditEstimate {
  const qualityAdjustedBase = getQualityAdjustedBase(baseCost, input.quality);
  const qualityAdjustment = qualityAdjustedBase - baseCost;
  const referenceAdjustment = getReferenceAdjustment(
    input.referenceImageCount,
    input.referenceImageSizes
  );
  const modeAdjustment = getModeAdjustment(input.referenceMode);
  const subtotal = Math.max(
    IMAGE_GENERATION_DRAFT_CREDIT_COST,
    qualityAdjustedBase + referenceAdjustment + modeAdjustment
  );
  const modelMultiplier = getImageGenerationModelMultiplier(input.model);
  const multipliedSubtotal = Number((subtotal * modelMultiplier).toFixed(4));
  const cost = Math.max(
    IMAGE_GENERATION_DRAFT_CREDIT_COST,
    Math.ceil(multipliedSubtotal)
  );
  const modelAdjustment = cost - subtotal;

  return {
    cost,
    tier,
    imageSize,
    megapixels,
    baseCost,
    qualityAdjustment,
    referenceAdjustment,
    modeAdjustment,
    modelMultiplier,
    modelAdjustment
  };
}

export function estimateImageGenerationCreditCost(
  input?: string | ImageGenerationCreditInput
): ImageGenerationCreditEstimate {
  const pricingInput = getPricingInput(input);
  const parsed = parseImageSize(pricingInput.imageSize);
  if (!parsed) {
    return buildEstimate(
      IMAGE_GENERATION_BASE_CREDIT_COST,
      'base',
      pricingInput.imageSize || 'auto',
      null,
      pricingInput
    );
  }

  const pixels = parsed.width * parsed.height;
  const megapixels = Number((pixels / 1_000_000).toFixed(2));
  const normalizedImageSize = `${parsed.width}x${parsed.height}`;
  const tier = getImageGenerationResolutionTier(normalizedImageSize);

  if (tier === '4k') {
    return buildEstimate(
      IMAGE_GENERATION_4K_CREDIT_COST,
      '4k',
      normalizedImageSize,
      megapixels,
      pricingInput
    );
  }

  if (tier === 'large-2k') {
    return buildEstimate(
      IMAGE_GENERATION_LARGE_2K_CREDIT_COST,
      'large-2k',
      normalizedImageSize,
      megapixels,
      pricingInput
    );
  }

  return buildEstimate(
    IMAGE_GENERATION_BASE_CREDIT_COST,
    'base',
    normalizedImageSize,
    megapixels,
    pricingInput
  );
}
