import { describe, expect, it } from 'vitest';
import { detectPromptImageCount } from '../image-prompt-count';

describe('detectPromptImageCount', () => {
  it('detects explicit Chinese and English image counts', () => {
    expect(detectPromptImageCount('生成四张不同构图的商品图')).toBe(4);
    expect(detectPromptImageCount('create 3 images for a campaign')).toBe(3);
  });

  it('falls back to two for vague multi-image prompts', () => {
    expect(detectPromptImageCount('输出多个版本，方便对比')).toBe(2);
    expect(
      detectPromptImageCount('make several images with different crops')
    ).toBe(2);
  });

  it('defaults to one when no count is requested', () => {
    expect(detectPromptImageCount('a cinematic product portrait')).toBe(1);
  });
});
