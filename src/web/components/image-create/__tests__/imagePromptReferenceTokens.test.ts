import { describe, expect, it } from 'vitest';
import type { PromptReferenceMention } from '../PromptCompilerPanel';
import { removeAndReindexPromptReferenceMention } from '../imagePromptReferenceTokens';

const mentions: PromptReferenceMention[] = [
  {
    id: 'reference-one',
    token: 'image1',
    label: '图片 1',
    kind: 'image'
  },
  {
    id: 'reference-two',
    token: 'image2',
    label: '图片 2',
    kind: 'gallery'
  },
  {
    id: 'character-one',
    token: 'character1',
    label: '角色 1',
    kind: 'character'
  }
];

describe('image prompt reference tokens', () => {
  it('removes the selected token and reindexes the remaining image tokens', () => {
    expect(
      removeAndReindexPromptReferenceMention(
        '沿用 @image1 的主体，参考 @image2 的光线，保持 @character1。',
        mentions,
        mentions[0]
      )
    ).toBe('沿用 的主体，参考 @image1 的光线，保持 @character1。');
  });

  it('does not alter ordinary prompt text that only resembles a token', () => {
    expect(
      removeAndReindexPromptReferenceMention(
        '保留 @image1x，同时使用 @image1。',
        mentions,
        mentions[1]
      )
    ).toBe('保留 @image1x，同时使用 @image1。');
  });
});
