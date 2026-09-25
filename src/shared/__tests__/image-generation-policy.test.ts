import { describe, expect, it } from 'vitest';
import { evaluateImageGenerationPolicy } from '../../../api/image/generate/policy';
import type { SanitizedImageGenerateRequest } from '../../../api/image/generate/types';

function buildInput(
  prompt: string,
  overrides: Partial<SanitizedImageGenerateRequest> = {}
): Pick<
  SanitizedImageGenerateRequest,
  'prompt' | 'negativePrompt' | 'referenceMode' | 'imageCount' | 'model'
> {
  return {
    prompt,
    negativePrompt: overrides.negativePrompt,
    referenceMode: overrides.referenceMode || 'none',
    imageCount: overrides.imageCount || 1,
    model: overrides.model || 'gpt-image-2'
  };
}

describe('image generation policy preflight', () => {
  it('blocks minor sexualized prompts before provider calls', () => {
    const result = evaluateImageGenerationPolicy(
      buildInput('高中生，性感比基尼，湿身写真')
    );

    expect(result.ok).toBe(false);
    expect(result.code).toBe('image_generation_policy_minor_sexualized');
    expect(result.tags).toContain('minor_context');
    expect(result.tags).toContain('sexualized_context');
    expect(result.version).toBe('2026-07-23.1');
  });

  it('blocks explicit sexual content', () => {
    const result = evaluateImageGenerationPolicy(
      buildInput('生成一张 full nude explicit sexual portrait')
    );

    expect(result.ok).toBe(false);
    expect(result.code).toBe('image_generation_policy_explicit_sexual');
  });

  it('does not block safety terms used only in negative prompts', () => {
    const result = evaluateImageGenerationPolicy(
      buildInput(
        '一位明确成年的女性，公共街头活动现场，完整衣着的高概念时装街拍',
        {
          negativePrompt:
            '未成年感、幼态脸、裸体、关键部位暴露、色情构图、身体局部特写'
        }
      )
    );

    expect(result.ok).toBe(true);
    expect(result.tags).toContain('negative_prompt_safety_terms');
    expect(result.tags).not.toContain('minor_context');
    expect(result.tags).not.toContain('explicit_sexual_content');
  });

  it('does not block inline plain negative sections as positive policy intent', () => {
    const result = evaluateImageGenerationPolicy(
      buildInput(`明确成年女性角色，现代舞训练造型，完整不透明训练服。
身体靠近地面，髋部抬高，动作像训练瞬间，不是挑逗摆拍。

负面：
未成年感、裸体、露骨色情、身体局部特写、错误肢体`)
    );

    expect(result.ok).toBe(true);
    expect(result.tags).toContain('negative_prompt_safety_terms');
    expect(result.tags).not.toContain('minor_context');
    expect(result.tags).not.toContain('explicit_sexual_content');
  });

  it('allows adult fashion and swimsuit prompts while tagging medium risk', () => {
    const result = evaluateImageGenerationPolicy(
      buildInput('两个成年女性，海边泳装时尚大片，非色情，商业海报')
    );

    expect(result.ok).toBe(true);
    expect(result.riskLevel).toBe('medium');
    expect(result.tags).toContain('sexualized_context');
  });

  it('tags celebrity likeness without blocking generic preflight', () => {
    const result = evaluateImageGenerationPolicy(
      buildInput('商业海报，人物像某个 celebrity likeness，但不要使用真实姓名')
    );

    expect(result.ok).toBe(true);
    expect(result.riskLevel).toBe('medium');
    expect(result.tags).toContain('celebrity_likeness');
  });
});
