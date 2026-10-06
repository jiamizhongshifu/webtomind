/** Provider error text only; never infer a policy rejection from the user's prompt. */
export function isLikelyImagePolicyError(message: string): boolean {
  return /policy|safety|moderation|blocked|unsafe|sexual|nudity|erotic|adult|违规|安全|审核|拒绝|色情|情色|成人|裸露|擦边|内容政策|防护限制/i.test(
    message
  );
}

export function describeImagePolicyFailure(message: string): string {
  if (/裸露|裸体|色情|情色|nudity|nude|sexual|erotic|porn/i.test(message)) {
    return '上游模型因裸露或色情相关内容限制拒绝了本次生成。请检查提示词与参考图，修改相关内容后再试。';
  }
  if (/欺诈|诈骗|fraud|scam/i.test(message)) {
    return '上游模型因潜在欺诈或诈骗相关内容限制拒绝了本次生成。请检查提示词与参考图，修改相关内容后再试。';
  }
  if (/生成的图片|generated images?|output/i.test(message)) {
    return '上游模型判定生成结果不符合内容政策。请调整提示词或参考图后再试。';
  }
  return '上游模型因内容政策拒绝了本次生成，未说明具体违规类别。请检查提示词与参考图，修改后再试。';
}

export function isImageModelConfigurationError(message: string): boolean {
  return /not been priced|model[^\n]*not priced|价格尚未.*配置|模型[^\n]*未配置价格/i.test(
    message
  );
}
