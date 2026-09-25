import { describe, expect, it } from 'vitest';
import { extractFirstImageUrl, normalizeMediaUrl } from '../media-url';

describe('media-url', () => {
  it('normalizes legacy data URLs with spaces around base64 metadata', () => {
    expect(normalizeMediaUrl(' data:image/png; base64, AAA= ')).toBe(
      'data:image/png;base64,AAA='
    );
  });

  it('extracts markdown images regardless of alt text', () => {
    expect(
      extractFirstImageUrl('![HIP7a5AaYAALBV7](data:image/jpeg; base64, BBB=)')
    ).toBe('data:image/jpeg;base64,BBB=');
  });
});
