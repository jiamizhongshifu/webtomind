import { describe, expect, it } from 'vitest';
import {
  detectPromptAspectRatio,
  detectPromptImageSize,
  resolveImageGenerationPricingSize,
  validateImageGenerationSize
} from '../image-generation-output-params';

describe('image generation output parameters', () => {
  it('shares the backend image-size validation contract', () => {
    expect(validateImageGenerationSize('3840×2160')).toEqual({
      ok: true,
      size: '3840x2160'
    });
    expect(validateImageGenerationSize('4096x4096').ok).toBe(false);
    expect(detectPromptImageSize('输出 3840x2160 成图')).toBe('3840x2160');
  });

  it('normalizes prompt aspect ratios through the same constraints', () => {
    expect(detectPromptAspectRatio('海报比例 16：9')).toBe('16:9');
    expect(detectPromptAspectRatio('超宽比例 8:1')).toBeUndefined();
  });

  it('maps orientation words in the prompt to default ratios', () => {
    expect(detectPromptAspectRatio('生成一张竖版海报')).toBe('3:4');
    expect(detectPromptAspectRatio('竖屏短视频封面')).toBe('3:4');
    expect(detectPromptAspectRatio('做一张横版封面')).toBe('4:3');
    expect(detectPromptAspectRatio('方形头像')).toBe('1:1');
    expect(detectPromptAspectRatio('a portrait painting')).toBe('3:4');
    expect(detectPromptAspectRatio('landscape scenery')).toBe('4:3');
    // 「方形脸」是人像五官描述，不能误判为方形画幅
    expect(detectPromptAspectRatio('方形脸男生写真')).toBeUndefined();
    // 显式数字比例优先于方向词
    expect(detectPromptAspectRatio('竖版 21:9 超宽')).toBe('21:9');
  });

  it('resolves the pricing size from an automatic control and custom prompt', () => {
    expect(
      resolveImageGenerationPricingSize({
        imageSize: 'auto',
        prompt: '输出 3840x2160 成图',
        promptMode: 'custom'
      })
    ).toBe('3840x2160');
    expect(
      resolveImageGenerationPricingSize({
        imageSize: '1024x1024',
        prompt: '输出 3840x2160 成图',
        promptMode: 'custom'
      })
    ).toBe('1024x1024');
  });
});
