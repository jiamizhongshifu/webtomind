import { describe, expect, it } from 'vitest';
import {
  defaultImagePromptSelection,
  normalizeImagePromptSelection,
  type ImagePromptAsset
} from '../../../data/image-prompt-core';
import {
  buildRecipeConditionedPrompt,
  shouldDetachRecipeForPromptEdit
} from '../imageStudioConditioning';

const assets: ImagePromptAsset[] = [
  {
    id: 'lighting-test-softbox',
    slot: 'lighting',
    title: '柔和棚拍光',
    subtitle: '测试素材',
    prompt: 'large softbox lighting',
    promptZh: '大型柔光箱光影',
    tags: ['光影'],
    visual: { tone: '#eee', accent: '#333', shape: 'style' }
  }
];

const getSlotLabel = (slot: string) => (slot === 'lighting' ? '光影' : slot);

describe('buildRecipeConditionedPrompt', () => {
  it('replaces a stale recipe line with the current selection', () => {
    const result = buildRecipeConditionedPrompt({
      prompt: '保留用户主题\n光影：旧配方内容',
      selection: normalizeImagePromptSelection({
        lighting: 'lighting-test-softbox'
      }),
      assets,
      locale: 'zh-CN',
      getSlotLabel
    });

    expect(result).toContain('保留用户主题');
    expect(result).toContain('光影：大型柔光箱光影');
    expect(result).not.toContain('旧配方内容');
  });

  it('removes stale recipe text after the category is cleared', () => {
    const result = buildRecipeConditionedPrompt({
      prompt: '保留用户主题\n光影：旧配方内容',
      selection: defaultImagePromptSelection,
      assets,
      locale: 'zh-CN',
      getSlotLabel
    });

    expect(result).toBe('保留用户主题');
  });

  it('returns the selected recipe text immediately for the controlled composer value', () => {
    const result = buildRecipeConditionedPrompt({
      prompt: '一位站在窗边的人像',
      selection: normalizeImagePromptSelection({
        lighting: 'lighting-test-softbox'
      }),
      assets,
      locale: 'zh-CN',
      getSlotLabel
    });

    expect(result).toBe('一位站在窗边的人像\n光影：大型柔光箱光影');
  });
});

describe('shouldDetachRecipeForPromptEdit', () => {
  it('detaches recipe conditioning as soon as the user edits the compiled prompt', () => {
    expect(shouldDetachRecipeForPromptEdit('recipe')).toBe(true);
    expect(shouldDetachRecipeForPromptEdit('moodboard')).toBe(false);
    expect(shouldDetachRecipeForPromptEdit('none')).toBe(false);
  });
});
