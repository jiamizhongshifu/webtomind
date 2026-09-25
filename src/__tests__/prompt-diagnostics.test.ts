import { describe, expect, it } from 'vitest';
import { analyzeImagePromptStructure } from '../web/components/image-create/promptDiagnostics';
import type { ImagePromptAsset } from '../web/data/image-prompt-assets';

function asset(slot: ImagePromptAsset['slot']): ImagePromptAsset {
  return {
    id: `${slot}-test`,
    slot,
    title: slot,
    subtitle: '',
    prompt: `${slot} prompt`,
    tags: [],
    visual: { tone: '#fff', accent: '#000', shape: 'style' }
  };
}

describe('analyzeImagePromptStructure', () => {
  it('reports missing structure when the prompt is thin', () => {
    const result = analyzeImagePromptStructure({
      prompt: '生成一张高级感人像',
      negativePrompt: '',
      promptMode: 'custom',
      selectedAssets: [],
      locale: 'zh-CN'
    });

    expect(result.score).toBeLessThan(80);
    expect(result.missingSlots).toContain('character');
    expect(result.items.some((item) => item.severity === 'warning')).toBe(true);
  });

  it('flags generic aesthetic prompts as high AI-taste risk', () => {
    const result = analyzeImagePromptStructure({
      prompt:
        '生成一张高级感、电影感、氛围感十足的梦幻大片，masterpiece，ultra detailed',
      negativePrompt: '低质量',
      promptMode: 'custom',
      selectedAssets: [],
      locale: 'zh-CN'
    });

    expect(result.aiTasteLevel).toBe('high');
    expect(
      result.items.some((item) => item.id === 'ai-taste-abstract-style')
    ).toBe(true);
    expect(
      result.items.some((item) => item.id === 'missing-commercial-deliverable')
    ).toBe(true);
  });

  it('accepts a complete composed prompt', () => {
    const result = analyzeImagePromptStructure({
      prompt:
        '生成一张 3:4 品牌人物封面海报，用于美妆品牌提案和社媒主视觉。成年女性人物主体清晰，五官自然，穿干净浅色上装，自然站姿，视线看向镜头。城市街角背景有柔和空间层次，半身景别，主体位于画面中央偏上作为第一视觉中心，右侧留白承载主标题和一句卖点，阅读路径从人物面部到标题再到下方注释。使用 85mm 人像镜头，浅景深虚化，柔光箱照明，肤色通透，轻微胶片颗粒，高质量商业摄影质感。',
      negativePrompt: '水印，乱码，肢体异常，构图杂乱',
      promptMode: 'composed',
      selectedAssets: [
        asset('character'),
        asset('pose'),
        asset('background'),
        asset('shot'),
        asset('lens'),
        asset('lighting')
      ],
      locale: 'zh-CN'
    });

    expect(result.missingSlots).toHaveLength(0);
    expect(result.items[0]?.id).toBe('structure-ok');
    expect(result.aiTasteLevel).toBe('low');
    expect(result.score).toBeGreaterThanOrEqual(90);
  });
});
