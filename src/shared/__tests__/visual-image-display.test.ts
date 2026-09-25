import { describe, expect, it } from 'vitest';
import {
  getVisualImageAspectRatio,
  getVisualImageDisplayCandidates,
  getVisualImageDisplayUrl
} from '../visual-image-display';

describe('visual image display helpers', () => {
  it('uses preview priority for normal displays and original for full size', () => {
    const source = {
      thumbnailUrl: 'thumb.png',
      previewUrl: 'preview.png',
      imageUrl: 'original.png'
    };

    expect(getVisualImageDisplayUrl(source, 'thumbnail')).toBe('thumb.png');
    expect(getVisualImageDisplayUrl(source, 'preview')).toBe('preview.png');
    expect(getVisualImageDisplayUrl(source, 'original')).toBe('original.png');
  });

  it('falls back when derived images are not ready', () => {
    const source = {
      previewUrl: '',
      imageUrl: 'original.png'
    };

    expect(getVisualImageDisplayUrl(source, 'thumbnail')).toBe('original.png');
    expect(getVisualImageDisplayUrl(source, 'preview')).toBe('original.png');
  });

  it('dedupes URL candidates while preserving preview-first order', () => {
    expect(
      getVisualImageDisplayCandidates({
        thumbnailUrl: 'thumb.png',
        previewUrl: 'thumb.png',
        imageUrl: 'original.png'
      })
    ).toEqual(['thumb.png', 'original.png']);

    expect(
      getVisualImageDisplayCandidates({
        thumbnailUrl: 'thumb.png',
        previewUrl: 'preview.png',
        imageUrl: 'original.png'
      })
    ).toEqual(['preview.png', 'original.png', 'thumb.png']);
  });

  it('formats aspect ratio only when dimensions are valid', () => {
    expect(getVisualImageAspectRatio({ width: 2160, height: 3840 })).toBe(
      '2160 / 3840'
    );
    expect(getVisualImageAspectRatio({ width: 0, height: 3840 })).toBe('1 / 1');
  });
});
