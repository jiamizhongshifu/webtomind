import type { SanitizedImageGenerateRequest } from './types.js';

export const IMAGE_GENERATION_POLICY_VERSION = '2026-07-23.1';

export type ImageGenerationPolicyRiskLevel =
  | 'low'
  | 'medium'
  | 'high'
  | 'blocked';

export interface ImageGenerationPolicyResult {
  ok: boolean;
  status?: number;
  code?: string;
  message?: string;
  riskLevel: ImageGenerationPolicyRiskLevel;
  tags: string[];
  version: string;
}

type ImageGenerationPolicyInput = Pick<
  SanitizedImageGenerateRequest,
  'prompt' | 'negativePrompt' | 'referenceMode' | 'imageCount' | 'model'
>;

const MINOR_CONTEXT_PATTERNS = [
  /未成年|儿童|小学生|初中生|中学生|高中生|幼女|萝莉|正太|童颜|学生妹/i,
  /minor|underage|child|kid|teen|teenage|schoolgirl|school boy|high school/i
];

const SEXUALIZED_CONTEXT_PATTERNS = [
  /性感|诱惑|色情|情色|裸|裸露|内衣|比基尼|泳装|擦边|湿身|透视|乳沟/i,
  /lingerie|bikini|swimsuit|underwear|nude|nudity|erotic|sexual|sensual|cleavage|see[-\s]?through/i
];

const EXPLICIT_SEXUAL_PATTERNS = [
  /性爱|性交|性行为|做爱|裸照|全裸|露点|色情片/i,
  /porn|hardcore|explicit sexual|sex act|intercourse|full nude|naked photo/i
];

const CELEBRITY_LIKENESS_PATTERNS = [
  /明星同款|名人同款|像.+明星|真人同款|本人肖像/i,
  /celebrity likeness|look like a celebrity|exact likeness|public figure/i
];

const TRADEMARK_FINAL_USE_PATTERNS = [
  /商标|品牌\s*logo|注册\s*logo|可商用\s*logo|最终\s*logo/i,
  /trademark|registered logo|final logo|commercial logo/i
];

function normalizePolicyText(value: string | undefined): string {
  return (value || '').replace(/\s+/g, ' ').trim();
}

function splitInlineNegativePromptForPolicy(prompt: string): {
  prompt: string;
  negativePrompt?: string;
} {
  const match =
    /(^|[\n\r]|[，。；;]\s*)(?:负面(?:提示词?)?|负向(?:提示词|\s*prompt)?|negative\s*prompt|negative)\s*[：:]\s*/i.exec(
      prompt
    );
  if (!match || match.index < 0) return { prompt };

  const positive = prompt.slice(0, match.index + match[1].length).trim();
  const negative = prompt.slice(match.index + match[0].length).trim();
  return {
    prompt: positive || prompt,
    negativePrompt: negative || undefined
  };
}

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function blockedResult(
  code: string,
  message: string,
  tags: string[]
): ImageGenerationPolicyResult {
  return {
    ok: false,
    status: 400,
    code,
    message,
    riskLevel: 'blocked',
    tags,
    version: IMAGE_GENERATION_POLICY_VERSION
  };
}

export function evaluateImageGenerationPolicy(
  input: ImageGenerationPolicyInput
): ImageGenerationPolicyResult {
  const splitPrompt = splitInlineNegativePromptForPolicy(input.prompt);
  const prompt = normalizePolicyText(splitPrompt.prompt);
  const negativePrompt = normalizePolicyText(
    [input.negativePrompt, splitPrompt.negativePrompt]
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value))
      .join('，')
  );
  const tags: string[] = [];

  const hasMinorContext = matchesAny(prompt, MINOR_CONTEXT_PATTERNS);
  const hasSexualizedContext = matchesAny(prompt, SEXUALIZED_CONTEXT_PATTERNS);
  const hasExplicitSexualContent = matchesAny(prompt, EXPLICIT_SEXUAL_PATTERNS);
  const hasCelebrityLikeness = matchesAny(prompt, CELEBRITY_LIKENESS_PATTERNS);
  const hasTrademarkFinalUse = matchesAny(prompt, TRADEMARK_FINAL_USE_PATTERNS);
  const negativePromptHasSafetyTerms =
    Boolean(negativePrompt) &&
    (matchesAny(negativePrompt, MINOR_CONTEXT_PATTERNS) ||
      matchesAny(negativePrompt, SEXUALIZED_CONTEXT_PATTERNS) ||
      matchesAny(negativePrompt, EXPLICIT_SEXUAL_PATTERNS));

  if (hasMinorContext) tags.push('minor_context');
  if (hasSexualizedContext) tags.push('sexualized_context');
  if (hasExplicitSexualContent) tags.push('explicit_sexual_content');
  if (hasCelebrityLikeness) tags.push('celebrity_likeness');
  if (hasTrademarkFinalUse) tags.push('trademark_final_use');
  if (negativePromptHasSafetyTerms) tags.push('negative_prompt_safety_terms');

  if (hasMinorContext && hasSexualizedContext) {
    return blockedResult(
      'image_generation_policy_minor_sexualized',
      '该请求同时包含未成年/学生语境和性感、裸露或擦边描述，无法生成。请改为明确成年主体、完整衣着和非性化场景后重试。',
      tags
    );
  }

  if (hasExplicitSexualContent) {
    return blockedResult(
      'image_generation_policy_explicit_sexual',
      '该请求包含明确色情或裸露内容，无法生成。请改为非露骨、非色情的创作描述后重试。',
      tags
    );
  }

  const riskLevel: ImageGenerationPolicyRiskLevel =
    hasCelebrityLikeness || hasTrademarkFinalUse || hasSexualizedContext
      ? 'medium'
      : 'low';

  return {
    ok: true,
    riskLevel,
    tags,
    version: IMAGE_GENERATION_POLICY_VERSION
  };
}
