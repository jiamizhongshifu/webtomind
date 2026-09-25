// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  imageCreationSkill,
  IMAGE_CREATION_MODES,
  resolveImageCreationMode,
  buildImageCreationSystemPrompt
} from '../image-creation-skill';

describe('image_creation skill (official)', () => {
  it('exposes valid metadata and registers generate_image tool', () => {
    expect(imageCreationSkill.metadata.name).toBe('image_creation');
    expect(imageCreationSkill.metadata.source).toBe('system');
    expect(imageCreationSkill.metadata.category).toBe('creative');
    expect(imageCreationSkill.metadata.output?.primaryType).toBe('image');
    expect(imageCreationSkill.metadata.capabilities?.allowedTools).toContain(
      'generate_image'
    );
    expect(imageCreationSkill.associatedTools).toContain('generate_image');
  });

  it('defines the seven official creation modes', () => {
    const ids = IMAGE_CREATION_MODES.map((m) => m.id);
    expect(ids).toEqual([
      'portrait',
      'poster',
      'product',
      'infographic',
      'sticker',
      'character_sheet',
      'illustration'
    ]);
    for (const mode of IMAGE_CREATION_MODES) {
      expect(mode.name).toBeTruthy();
      expect(mode.triggers.length).toBeGreaterThan(0);
      expect(['1k', '2k', '4k']).toContain(mode.defaultImageSize);
      expect(mode.promptGuidance.length).toBeGreaterThan(10);
    }
  });

  it('resolves mode from Chinese and English intent', () => {
    expect(resolveImageCreationMode('给我做一张写真')?.id).toBe('portrait');
    expect(resolveImageCreationMode('做一张电商白底商品图')?.id).toBe('product');
    expect(resolveImageCreationMode('生成 4x4 表情包')?.id).toBe('sticker');
    expect(resolveImageCreationMode('make a poster for my event')?.id).toBe('poster');
    expect(resolveImageCreationMode('画一张插画')?.id).toBe('illustration');
  });

  it('returns undefined for unrelated intent', () => {
    expect(resolveImageCreationMode('帮我总结这篇文章')).toBeUndefined();
  });

  it('builds a system prompt that mentions the skill workflow and mode guidance', () => {
    const base = buildImageCreationSystemPrompt();
    expect(base).toContain('图像创作 Agent');
    expect(base).toContain('generate_image');
    expect(base).toContain('人像写真');
    expect(base).toContain('负面');

    const withMode = buildImageCreationSystemPrompt('poster');
    expect(withMode).toContain('当前创作模式：海报/封面');
    expect(withMode).toContain('3:4');
  });
});
