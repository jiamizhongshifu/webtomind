import { describe, expect, it } from 'vitest';
import {
  compositeMaskedPixels,
  createInnerFeatherMask,
  expandMaskContext,
  fillMaskedPixelsFromBoundary,
  findMaskBounds
} from '../image-inpaint';

describe('image inpaint geometry', () => {
  it('finds and expands the smallest mask bounds without leaving the image', () => {
    const mask = new Uint8Array(10 * 8);
    mask[2 * 10 + 3] = 255;
    mask[5 * 10 + 7] = 255;
    const bounds = findMaskBounds(mask, 10, 8);
    expect(bounds).toEqual({ x: 3, y: 2, width: 5, height: 4 });
    expect(expandMaskContext(bounds!, 10, 8, 2, 4)).toEqual({
      x: 1,
      y: 0,
      width: 9,
      height: 8
    });
  });

  it('feathers only inside the selected mask', () => {
    const mask = new Uint8Array(25);
    for (let y = 1; y <= 3; y += 1) {
      for (let x = 1; x <= 3; x += 1) mask[y * 5 + x] = 255;
    }
    const feathered = createInnerFeatherMask(mask, 5, 5, 1);
    expect(feathered[0]).toBe(0);
    expect(feathered[2 * 5 + 2]).toBe(255);
    expect(feathered[1 * 5 + 1]).toBeGreaterThan(0);
    expect(feathered[1 * 5 + 1]).toBeLessThan(255);
  });
});

describe('image inpaint compositing', () => {
  it('keeps every unmasked byte and the original alpha channel unchanged', () => {
    const original = new Uint8ClampedArray([10, 20, 30, 40, 50, 60, 70, 80]);
    const repaired = new Uint8ClampedArray([
      200, 210, 220, 230, 100, 110, 120, 130
    ]);
    const result = compositeMaskedPixels(
      original,
      repaired,
      new Uint8Array([0, 255])
    );
    expect(Array.from(result)).toEqual([10, 20, 30, 40, 100, 110, 120, 80]);
  });

  it('replaces every masked pixel from the surrounding boundary', () => {
    const width = 5;
    const height = 5;
    const original = new Uint8ClampedArray(width * height * 4);
    const mask = new Uint8Array(width * height);
    for (let pixel = 0; pixel < width * height; pixel += 1) {
      const offset = pixel * 4;
      original[offset] = 40;
      original[offset + 1] = 80;
      original[offset + 2] = 120;
      original[offset + 3] = 255;
    }
    for (let y = 1; y <= 3; y += 1) {
      for (let x = 1; x <= 3; x += 1) {
        const pixel = y * width + x;
        mask[pixel] = 255;
        original[pixel * 4] = 250;
      }
    }
    const result = fillMaskedPixelsFromBoundary(original, mask, width, height);
    expect(Array.from(result.slice(0, 4))).toEqual([40, 80, 120, 255]);
    for (let y = 1; y <= 3; y += 1) {
      for (let x = 1; x <= 3; x += 1) {
        expect(
          Array.from(result.slice((y * width + x) * 4, (y * width + x) * 4 + 4))
        ).toEqual([40, 80, 120, 255]);
      }
    }
  });

  it('rejects a mask that leaves no surrounding texture', () => {
    expect(() =>
      fillMaskedPixelsFromBoundary(
        new Uint8ClampedArray(4 * 4 * 4),
        new Uint8Array(4 * 4).fill(255),
        4,
        4
      )
    ).toThrow('周围没有可用于修复的纹理');
  });
});
