import { describe, expect, it } from 'vitest';
import {
  fallbackDiscoveryImageTone,
  shuffleDiscoveryImages
} from '../discovery-image-presentation';

describe('discovery image presentation', () => {
  it('returns a stable colored fallback for the same image', () => {
    expect(fallbackDiscoveryImageTone('/images/example.webp')).toBe(
      fallbackDiscoveryImageTone('/images/example.webp')
    );
    expect(fallbackDiscoveryImageTone('/images/example.webp')).toMatch(
      /^#[0-9a-f]{6}$/i
    );
  });

  it('randomizes the waterfall without mutating the API result', () => {
    const source = ['a', 'b', 'c', 'd'];
    const shuffled = shuffleDiscoveryImages(source, () => 0);

    expect(source).toEqual(['a', 'b', 'c', 'd']);
    expect(shuffled).toEqual(['b', 'c', 'd', 'a']);
  });
});
