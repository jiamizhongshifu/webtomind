/**
 * Gemini 调用 helper。
 *
 * 主对话模型 `gemini-3.5-flash` 默认会开 thinking,实测会把
 * `maxOutputTokens` 几乎吃光(测 200 budget 时 191 给了 thinking)。
 * 所有用 flash 做生成的调用点都要在 generationConfig 上 merge
 * `thinkingConfig: { thinkingBudget: 0 }`。
 *
 * 注意:`gemini-3.1-pro-preview` 不允许 thinkingBudget=0,只能默认开
 * thinking。pro 模型不要走这个 helper。
 */

export interface ThinkingConfig {
  thinkingBudget?: number;
}

export interface GeminiGenerationConfig {
  temperature?: number;
  topP?: number;
  topK?: number;
  maxOutputTokens?: number;
  responseMimeType?: string;
  responseSchema?: unknown;
  responseModalities?: string[];
  thinkingConfig?: ThinkingConfig;
  // Gemini 还有其他字段,这里只列常用的
  [key: string]: unknown;
}

/**
 * 给 generationConfig 注入 `thinkingConfig: { thinkingBudget: 0 }`,禁用
 * gemini-3.5-flash 的 thinking。
 *
 * 调用方已经显式传了 thinkingConfig 时不覆盖(让 caller 显式声明优先)。
 */
export function withNoThinking<T extends GeminiGenerationConfig | undefined>(
  config: T
): T extends undefined ? GeminiGenerationConfig : T {
  const base = (config ?? {}) as GeminiGenerationConfig;
  if (base.thinkingConfig) return base as never;
  return { ...base, thinkingConfig: { thinkingBudget: 0 } } as never;
}
