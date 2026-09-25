import { describe, expect, it } from 'vitest';
import { blendDenoisedChannel, blendDenoisedRgba } from '../image-denoise';

describe('blendDenoisedRgba', () => {
  it('keeps the published strength weights stable', () => {
    expect(blendDenoisedChannel(100, 200, 'light')).toBe(135);
    expect(blendDenoisedChannel(100, 200, 'standard')).toBe(160);
    expect(blendDenoisedChannel(100, 200, 'strong')).toBe(185);
  });

  it('writes the selected blend into the downloaded pixel buffer', () => {
    const source = new Uint8ClampedArray([100, 120, 140, 77]);
    const denoised = new Uint8ClampedArray([80, 100, 120, 255]);

    const change = blendDenoisedRgba({
      source,
      denoised,
      rowWidth: 1,
      validWidth: 1,
      validHeight: 1,
      strength: 'standard'
    });

    expect(Array.from(denoised)).toEqual([88, 108, 128, 77]);
    expect(change.averageChannelDelta).toBe(12);
    expect(change.changedPixelPercent).toBe(100);
  });

  it('does not count padded pixels outside the valid tile bounds', () => {
    const source = new Uint8ClampedArray([
      10, 20, 30, 255, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    ]);
    const denoised = new Uint8ClampedArray([
      20, 30, 40, 255, 200, 200, 200, 255, 200, 200, 200, 255, 200, 200, 200,
      255
    ]);

    const change = blendDenoisedRgba({
      source,
      denoised,
      rowWidth: 2,
      validWidth: 1,
      validHeight: 1,
      strength: 'strong'
    });

    expect(change.sampledPixels).toBe(1);
    expect(change.changedPixelPercent).toBe(100);
    expect(Array.from(denoised.slice(4))).toEqual([
      200, 200, 200, 255, 200, 200, 200, 255, 200, 200, 200, 255
    ]);
  });
});
