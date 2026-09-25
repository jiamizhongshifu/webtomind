import { describe, expect, it } from 'vitest';
import {
  buildHeuristicPromptImportItems,
  buildImagePromptAssetReverseSystemPrompt,
  buildPromptImportSystemPrompt,
  SUPPORTED_SLOTS
} from '../../api/utils/prompt-asset-reverse';

describe('prompt asset API slot contract', () => {
  it('keeps the dedicated viewpoint axis in the shared API contract', () => {
    expect(SUPPORTED_SLOTS).toContain('viewpoint');
    expect(SUPPORTED_SLOTS).toContain('outfit');
    expect(SUPPORTED_SLOTS).toContain('onePiece');
    expect(SUPPORTED_SLOTS).toContain('hairstyle');
    expect(new Set(SUPPORTED_SLOTS).size).toBe(SUPPORTED_SLOTS.length);
  });

  it('documents every supported slot in both reverse prompts', () => {
    const imagePrompt = buildImagePromptAssetReverseSystemPrompt('zh-CN');
    const textPrompt = buildPromptImportSystemPrompt();

    for (const slot of SUPPORTED_SLOTS) {
      expect(imagePrompt).toContain(`- ${slot} →`);
      expect(textPrompt).toContain(`- ${slot} →`);
    }
  });

  it('keeps lens, shot, viewpoint and composition orthogonal', () => {
    const prompts = [
      buildImagePromptAssetReverseSystemPrompt('zh-CN'),
      buildPromptImportSystemPrompt()
    ];

    for (const prompt of prompts) {
      expect(prompt).toContain('lens →');
      expect(prompt).toContain('不得混入景别');
      expect(prompt).toContain('shot →');
      expect(prompt).toContain('裁切边界与主体占比');
      expect(prompt).toContain('viewpoint →');
      expect(prompt).toContain('composition →');
    }
    expect(prompts.join('\n')).not.toContain('手机自拍质感');
    expect(prompts.join('\n')).not.toContain('侧身构图 / 行走抓拍');
  });

  it('preserves legal adult SFW fashion instead of applying a scale filter', () => {
    const imagePrompt = buildImagePromptAssetReverseSystemPrompt('zh-CN');
    const textPrompt = buildPromptImportSystemPrompt();

    expect(imagePrompt).toContain('不得因为露肤程度而省略、降级或改写服装类别');
    expect(imagePrompt).toContain('合法 SFW');
    expect(textPrompt).toContain('合法 SFW');
    expect(imagePrompt).not.toContain('20-26 岁');
    expect(imagePrompt).not.toContain('过度暴露');
  });

  it('keeps hairstyle and coordinated outfit out of character in fallback import', () => {
    const items = buildHeuristicPromptImportItems(`
明确成年女性，清冷方脸与狭长眼型。
湿发光泽后梳，发丝全部离开额头。
黑色镂空上衣与配套高腰半裙套装，明确上下装边界。
腰上中景，轻低机位，现代数码成像。
自然裸妆，冷静凝视。
`);
    const bySlot = new Map(items.map((item) => [item.slot, item]));

    expect(bySlot.get('character')?.prompt).not.toMatch(/湿发|套装|裸妆/);
    expect(bySlot.get('hairstyle')?.prompt).toContain('湿发');
    expect(bySlot.get('outfit')?.prompt).toContain('套装');
    expect(bySlot.has('top')).toBe(false);
    expect(bySlot.has('bottom')).toBe(false);
    expect(bySlot.has('onePiece')).toBe(false);
    expect(bySlot.get('shot')?.tags).toEqual(['腰上中景']);
    expect(bySlot.get('viewpoint')?.tags).toEqual(['低机位']);
    expect(bySlot.get('lens')?.tags).toEqual(['现代数码']);
    expect(bySlot.get('makeup')?.prompt).toContain('裸妆');
  });

  it('keeps one-piece garments mutually exclusive in fallback import', () => {
    const items = buildHeuristicPromptImportItems(
      '明确成年女性。黑色露背连衣裙，修身剪裁。全身景，平视机位。'
    );
    const slots = items.map((item) => item.slot);

    expect(slots).toContain('onePiece');
    expect(slots).not.toContain('outfit');
    expect(slots).not.toContain('top');
    expect(slots).not.toContain('bottom');
  });
});
