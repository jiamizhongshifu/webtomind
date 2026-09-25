/**
 * Gemini 模型别名 + 兜底逻辑。
 *
 * 主对话模型切到 `gemini-3.5-flash`(实测 9s 反推质量顶级 / 16s 文本对话稳)。
 * 所有用 3.5-flash 做生成的调用点必须在 generationConfig 里加
 * `thinkingConfig: { thinkingBudget: 0 }`,否则默认 thinking 会吞掉输出预算
 * (实测 191/200 输出预算被 thinking 吞)。统一通过
 * `api/utils/gemini-helpers.ts:withNoThinking()` 注入。
 */
export const GEMINI_MODEL_ALIAS_MAP: Record<string, string> = {
  // 历史别名升级到新主对话模型
  'gemini-3-flash': 'gemini-3.5-flash',
  'gemini-3-flash-preview': 'gemini-3.5-flash',
  'gemini-3.1-flash-lite-preview': 'gemini-3.5-flash'
};

export const SUPPORTED_GEMINI_MODELS = new Set([
  // 对话/反推
  'gemini-3.5-flash',
  'gemini-3.1-pro-preview',
  // 过渡期保留(若 caller 强制指定,不被替换)
  'gemini-3.1-flash-lite-preview',
  // 生图
  'gemini-3-pro-image-preview',
  'gemini-3.1-flash-image-preview',
  'gemini-2.5-flash-image'
]);

/**
 * DeepSeek's 2026-07-31 release is branded DeepSeek-V4-Flash-0731, while the
 * public API intentionally keeps the stable model id `deepseek-v4-flash`.
 * DeepSeek-backed product features must use this constant instead of accepting
 * per-route model overrides, otherwise OPENAI_MODEL/ANTHROPIC_MODEL can drift
 * different business paths onto older or incompatible models.
 */
export const DEEPSEEK_V4_FLASH_0731_MODEL = 'deepseek-v4-flash';
export const DEEPSEEK_V4_FLASH_0731_VERSION = 'DeepSeek-V4-Flash-0731';

export const DEFAULT_TEXT_AGENT_MODEL = DEEPSEEK_V4_FLASH_0731_MODEL;
export const DEFAULT_WEAVING_MODEL = DEEPSEEK_V4_FLASH_0731_MODEL;
export const DEFAULT_WEAVING_FALLBACK_MODEL = 'gemini-3.5-flash';
export const DEFAULT_ASK_GROUNDING_MODEL = 'gemini-3.5-flash';
export const DEFAULT_THINKING_MODEL = 'gemini-3.5-flash';
export const DEFAULT_SMARTCHAT_TEXT_MODEL = 'gemini-3.5-flash';
// 生图主路径走 gpt-image,这只是 Gemini fallback 默认;线上由 env GEMINI_IMAGE_MODEL 覆盖
export const DEFAULT_IMAGE_GENERATION_MODEL = 'gemini-3-pro-image-preview';
export const DEFAULT_SKILL_AGENT_MODEL = DEEPSEEK_V4_FLASH_0731_MODEL;
export const DEFAULT_OPENAI_MODEL = DEEPSEEK_V4_FLASH_0731_MODEL;

export function normalizeGeminiModel(model?: string): string {
  if (!model) {
    return 'gemini-3.5-flash';
  }

  const aliasedModel = GEMINI_MODEL_ALIAS_MAP[model] || model;
  if (SUPPORTED_GEMINI_MODELS.has(aliasedModel)) {
    return aliasedModel;
  }

  return 'gemini-3.5-flash';
}
