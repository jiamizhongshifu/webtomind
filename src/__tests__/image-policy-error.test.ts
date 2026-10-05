import { describe, expect, it } from 'vitest';
import { describeImagePolicyFailure, isLikelyImagePolicyError } from '../../api/image/providers/policy-error';

describe('provider policy failure explanation', () => {
  it('does not invent sexual content for a generic input rejection', () => {
    const message = describeImagePolicyFailure('该提示可能违反了我们的内容政策');
    expect(message).toContain('未说明具体违规类别');
    expect(message).not.toMatch(/色情|裸露/);
  });
  it('distinguishes output moderation from input content and refund outcome', () => {
    const message = describeImagePolicyFailure('生成的图片可能违反了我们的内容政策');
    expect(message).toContain('生成结果');
    expect(message).not.toMatch(/退款|退回|色情|裸露/);
  });
  it('preserves the provider category without assigning it to a specific input', () => {
    expect(describeImagePolicyFailure('潜在欺诈或诈骗活动的防护限制')).toContain('欺诈或诈骗');
    expect(describeImagePolicyFailure('违反裸露、色情内容的防护限制')).toContain('裸露或色情');
  });
  it('does not classify capacity and unpriced-model failures as policy rejections', () => {
    expect(isLikelyImagePolicyError('模型尚未由管理员配置价格')).toBe(false);
    expect(isLikelyImagePolicyError('insufficient resources, try again later')).toBe(false);
  });
});
