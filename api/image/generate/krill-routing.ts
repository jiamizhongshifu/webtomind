import { getImageGenerationResolutionTier } from '../../../src/shared/image-generation-pricing.js';
import type { SanitizedImageGenerateRequest } from './types.js';

export type KrillImageResolutionTier = '1k' | '2k' | '4k';

/**
 * Krill exposes image models through its drawing channel. Keep this value
 * distinct from generic provider routes so health records cannot accidentally
 * suppress (or re-enable) image traffic based on text-model failures.
 */
export const KRILL_IMAGE_CHANNEL = 'drawing';

function readCapabilityFlag(
  value: string | undefined,
  defaultValue: boolean
): boolean {
  if (value === undefined || value.trim() === '') return defaultValue;
  return /^(1|true|yes|on)$/i.test(value.trim());
}

export function getKrillImageResolutionTier(
  imageSize?: string
): KrillImageResolutionTier {
  const tier = getImageGenerationResolutionTier(imageSize);
  return tier === '4k' ? '4k' : tier === 'large-2k' ? '2k' : '1k';
}

export function getKrillImageModel(
  input?: Pick<SanitizedImageGenerateRequest, 'imageSize' | 'promptImageSize'>
): string {
  const imageSize = input?.promptImageSize || input?.imageSize;
  const tier = getKrillImageResolutionTier(imageSize);
  if (tier === '4k') {
    return process.env.KRILL_IMAGE_MODEL_4K || 'gpt-image-2-4k';
  }
  if (tier === '2k') {
    return process.env.KRILL_IMAGE_MODEL_2K || 'gpt-image-2-2k';
  }
  return process.env.KRILL_IMAGE_MODEL || 'gpt-image-2';
}

/**
 * A marketplace model being listed does not guarantee that the production API
 * key has an active route for it. Keep higher-resolution routes opt-in until a
 * live request with the deployed key succeeds.
 */
export function isKrillImageResolutionEnabled(
  input?: Pick<SanitizedImageGenerateRequest, 'imageSize' | 'promptImageSize'>
): boolean {
  const imageSize = input?.promptImageSize || input?.imageSize;
  const tier = getKrillImageResolutionTier(imageSize);
  if (tier === '4k') {
    return readCapabilityFlag(process.env.KRILL_IMAGE_4K_ENABLED, false);
  }
  if (tier === '2k') {
    return readCapabilityFlag(process.env.KRILL_IMAGE_2K_ENABLED, false);
  }
  return readCapabilityFlag(process.env.KRILL_IMAGE_1K_ENABLED, true);
}

export function getConfiguredKrillImageModels(): string[] {
  return Array.from(
    new Set([
      process.env.KRILL_IMAGE_MODEL || 'gpt-image-2',
      process.env.KRILL_IMAGE_MODEL_2K || 'gpt-image-2-2k',
      process.env.KRILL_IMAGE_MODEL_4K || 'gpt-image-2-4k'
    ])
  );
}

export function getEnabledKrillImageModels(): string[] {
  const inputs = [
    { imageSize: '1024x1024' },
    { imageSize: '2048x2048' },
    { imageSize: '2160x3840' }
  ];
  return Array.from(
    new Set(
      inputs
        .filter((input) => isKrillImageResolutionEnabled(input))
        .map((input) => getKrillImageModel(input))
    )
  );
}
