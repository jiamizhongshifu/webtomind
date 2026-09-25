export type DenoiseStrength = 'light' | 'standard' | 'strong';

export interface DenoisePixelChange {
  averageChannelDelta: number;
  changedPixelPercent: number;
  sampledPixels: number;
}

const DENOISE_BLEND_WEIGHTS: Record<DenoiseStrength, number> = {
  light: 0.35,
  standard: 0.6,
  strong: 0.85
};

export function blendDenoisedChannel(
  original: number,
  denoised: number,
  strength: DenoiseStrength
): number {
  const weight = DENOISE_BLEND_WEIGHTS[strength];
  return Math.round(original * (1 - weight) + denoised * weight);
}

export function blendDenoisedRgba(params: {
  source: Uint8ClampedArray;
  denoised: Uint8ClampedArray;
  rowWidth: number;
  validWidth: number;
  validHeight: number;
  strength: DenoiseStrength;
}): DenoisePixelChange {
  const { source, denoised, rowWidth, validWidth, validHeight, strength } =
    params;
  let absoluteDelta = 0;
  let changedPixels = 0;
  let sampledPixels = 0;

  for (let y = 0; y < validHeight; y += 1) {
    for (let x = 0; x < validWidth; x += 1) {
      const offset = (y * rowWidth + x) * 4;
      let pixelChanged = false;
      for (let channel = 0; channel < 3; channel += 1) {
        const original = source[offset + channel];
        const blended = blendDenoisedChannel(
          original,
          denoised[offset + channel],
          strength
        );
        denoised[offset + channel] = blended;
        const delta = Math.abs(blended - original);
        absoluteDelta += delta;
        if (delta > 0) pixelChanged = true;
      }
      denoised[offset + 3] = source[offset + 3];
      if (pixelChanged) changedPixels += 1;
      sampledPixels += 1;
    }
  }

  return {
    averageChannelDelta:
      sampledPixels > 0 ? absoluteDelta / (sampledPixels * 3) : 0,
    changedPixelPercent:
      sampledPixels > 0 ? (changedPixels / sampledPixels) * 100 : 0,
    sampledPixels
  };
}
