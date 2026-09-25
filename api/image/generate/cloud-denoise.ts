import type { SanitizedImageGenerateRequest } from './types.js';

export const CLOUD_DENOISE_APP_SLUG = 'gpt-image-2-denoiser';
export const CLOUD_DENOISE_APP_OPERATION = 'gpt-image-2-denoise';
export const CLOUD_DENOISE_MODEL = 'nano-banana-2' as const;
export const CLOUD_DENOISE_API_MODEL =
  'gemini-3.1-flash-image-preview' as const;

export const CLOUD_DENOISE_GUIDE_TRANSFORM = {
  saturation: 0,
  blur: 2,
  contrast: 1.08,
  brightness: 1.03
} as const;

export const CLOUD_DENOISE_GUIDE_OUTPUT = {
  format: 'image/webp',
  quality: 72
} as const;

const CLOUD_DENOISE_BASE_PROMPT =
  'Generate one clean restored image from the two uploaded references in their exact upload order. The FIRST uploaded image is ORIGINAL_REFERENCE and is the sole authoritative source for every visible appearance and semantic decision: strictly preserve its art style, full color palette, saturation, white balance, skin tone, materials, fabric colors, lighting, composition, camera, crop, perspective, subject identity, facial expression, anatomy, pose, garment design and coverage, object positions, background relationships, atmosphere, text, logos, and aspect ratio. The SECOND uploaded image is STRUCTURE_GUIDE, a deterministic grayscale-and-softened copy of that same original. Use it only to confirm large contours, overlap, occlusion, and local geometry after ignoring its grayscale values and softened texture. If the two references appear to disagree for any reason, always follow the FIRST image, ORIGINAL_REFERENCE, and ignore the conflicting guide detail. Never copy grayscale, pale clay material, matte white surfaces, neutralized colors, simplified lighting, 3D-rendered appearance, altered clothing, altered anatomy, or softened background treatment from STRUCTURE_GUIDE. Remove from ORIGINAL_REFERENCE only isolated randomly distributed speckles, tiny black dots, short black marks, scan dirt, compression noise, chroma noise, abnormal dirty lines, and grain that does not connect to a major contour, form a shadow, belong to a material texture, or contribute to structural description. Preserve meaningful lines, intentional texture, material detail, wear, shadows, brushwork, and original style traits. The result must look like the same original image after conservative noise restoration, never a redraw or redesign. Do not add elements, text, logos, watermarks, or borders. FINAL OUTPUT CHECK: return a full-color restoration matching the FIRST image. Reject any draft in which skin, clothes, hair, bedding, background, props, or other large surfaces become gray, white-clay, desaturated, matte, simplified, or redesigned.';

const CLOUD_DENOISE_STRENGTH_INSTRUCTIONS = {
  light:
    'Cleanup strength is light: remove only unmistakable isolated noise and preserve nearly all original texture.',
  standard:
    'Cleanup strength is standard: remove clear random noise while preserving intentional texture and sharp edges.',
  strong:
    'Cleanup strength is strong: remove persistent random speckles and dirty lines while keeping all semantic, material, edge, and typographic details unchanged.'
} as const;

export function buildCloudDenoiseRestorationPrompt(
  strength: keyof typeof CLOUD_DENOISE_STRENGTH_INSTRUCTIONS
): string {
  return `${CLOUD_DENOISE_BASE_PROMPT} ${CLOUD_DENOISE_STRENGTH_INSTRUCTIONS[strength]}`;
}

export function isCloudDenoiseInput(
  input: SanitizedImageGenerateRequest
): boolean {
  return (
    input.model === CLOUD_DENOISE_MODEL &&
    input.provider === 'tuzi' &&
    input.appSlug === CLOUD_DENOISE_APP_SLUG &&
    input.appOperation === CLOUD_DENOISE_APP_OPERATION &&
    input.sourceApp === CLOUD_DENOISE_APP_SLUG
  );
}
