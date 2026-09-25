import { estimateImageGenerationCreditCost } from './image-generation-pricing';

const CLOUD_DENOISE_PRICING_INPUT = {
  model: 'nano-banana-2',
  imageSize: 'auto',
  quality: 'auto',
  referenceMode: 'image_reference'
} as const;

/** The guide is now a deterministic Cloudflare Images transform, not an AI call. */
export const GPT_IMAGE_2_DENOISE_STRUCTURE_CREDIT_COST = 0;

export const GPT_IMAGE_2_DENOISE_RESTORATION_CREDIT_COST =
  estimateImageGenerationCreditCost({
    ...CLOUD_DENOISE_PRICING_INPUT,
    referenceImageCount: 2
  }).cost;

/** One structure-guide generation plus one dual-reference restoration. */
export const GPT_IMAGE_2_DENOISE_CREDIT_COST =
  GPT_IMAGE_2_DENOISE_STRUCTURE_CREDIT_COST +
  GPT_IMAGE_2_DENOISE_RESTORATION_CREDIT_COST;
