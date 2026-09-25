import { describe, expect, it } from 'vitest';
import {
  calculateLongEdgeSize,
  calculateSplitRects,
  calculateTileStarts,
  createImageToolResultIdentity,
  hasSupportedImageSignature,
  isCompressedResultSmaller,
  mixDenoisedChannel
} from '../image-tools';

describe('image tool geometry', () => {
  it('calculates exact 2K and 4K long edges without changing aspect ratio', () => {
    expect(calculateLongEdgeSize(1200, 800, 2048)).toEqual({
      width: 2048,
      height: 1365
    });
    expect(calculateLongEdgeSize(800, 1200, 4096)).toEqual({
      width: 2731,
      height: 4096
    });
  });

  it('covers a tiled dimension with overlap and no duplicate tail tile', () => {
    expect(calculateTileStarts(300, 128, 16)).toEqual([0, 112, 172]);
    expect(calculateTileStarts(80, 128, 16)).toEqual([0]);
  });

  it('splits every source pixel exactly once for an uncropped grid', () => {
    const rects = calculateSplitRects({
      sourceWidth: 1001,
      sourceHeight: 701,
      rows: 3,
      columns: 4,
      aspectRatio: null,
      zoom: 1,
      focusX: 0.5,
      focusY: 0.5
    });
    expect(rects).toHaveLength(12);
    expect(rects.reduce((sum, rect) => sum + rect.width * rect.height, 0)).toBe(
      1001 * 701
    );
  });
});

describe('image tool data rules', () => {
  it('validates JPEG, PNG, and WebP signatures', () => {
    expect(
      hasSupportedImageSignature(
        new Uint8Array([0xff, 0xd8, 0xff]),
        'image/jpeg'
      )
    ).toBe(true);
    expect(
      hasSupportedImageSignature(
        new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10]),
        'image/png'
      )
    ).toBe(true);
    expect(
      hasSupportedImageSignature(
        new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80]),
        'image/webp'
      )
    ).toBe(true);
  });

  it('uses the approved denoise blending strengths', () => {
    expect(mixDenoisedChannel(100, 200, 'light')).toBe(135);
    expect(mixDenoisedChannel(100, 200, 'standard')).toBe(160);
    expect(mixDenoisedChannel(100, 200, 'strong')).toBe(185);
  });

  it('does not call an equal or larger file compressed', () => {
    expect(isCompressedResultSmaller(1_000, 999)).toBe(true);
    expect(isCompressedResultSmaller(1_000, 1_000)).toBe(false);
    expect(isCompressedResultSmaller(1_000, 1_200)).toBe(false);
  });

  it('binds output identity to the exact source and processing settings', () => {
    const firstSource = { id: 'source-a' } as Parameters<
      typeof createImageToolResultIdentity
    >[0];
    const secondSource = { id: 'source-b' } as Parameters<
      typeof createImageToolResultIdentity
    >[0];
    const first = createImageToolResultIdentity(firstSource, [
      'image/png',
      3,
      3
    ]);
    expect(
      createImageToolResultIdentity(firstSource, ['image/png', 3, 3])
    ).toBe(first);
    expect(
      createImageToolResultIdentity(secondSource, ['image/png', 3, 3])
    ).not.toBe(first);
    expect(
      createImageToolResultIdentity(firstSource, ['image/webp', 3, 3])
    ).not.toBe(first);
    expect(
      createImageToolResultIdentity(firstSource, ['image/png', 2, 2])
    ).not.toBe(first);
  });
});
