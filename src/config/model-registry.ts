import type { ClaudeModel, GeminiModel } from '@/types/ai';

export const GEMINI_MODEL_ALIAS_MAP: Record<string, GeminiModel> = {
  'gemini-3-flash': 'gemini-3.1-flash-lite-preview',
  'gemini-3-flash-preview': 'gemini-3.1-flash-lite-preview',
  'gemini-3-pro-image-preview': 'gemini-3.1-flash-image-preview'
};

export const SUPPORTED_GEMINI_MODELS: readonly GeminiModel[] = [
  'gemini-3.1-flash-lite-preview',
  'gemini-3.1-flash-image-preview'
] as const;

const SUPPORTED_GEMINI_MODEL_SET = new Set<string>(SUPPORTED_GEMINI_MODELS);

export function normalizeGeminiModel(model?: string): GeminiModel {
  if (!model) {
    return 'gemini-3.1-flash-lite-preview';
  }

  const aliasedModel = GEMINI_MODEL_ALIAS_MAP[model] || (model as GeminiModel);
  if (SUPPORTED_GEMINI_MODEL_SET.has(aliasedModel)) {
    return aliasedModel;
  }

  return 'gemini-3.1-flash-lite-preview';
}

export const DEFAULT_TEXT_AGENT_MODEL: ClaudeModel = 'claude-sonnet-4-20250514';

export const DEFAULT_WEAVING_MODEL: ClaudeModel = 'claude-sonnet-4-20250514';

export const DEFAULT_WEAVING_FALLBACK_MODEL: GeminiModel =
  'gemini-3.1-flash-lite-preview';

export const DEFAULT_ASK_GROUNDING_MODEL: GeminiModel =
  'gemini-3.1-flash-lite-preview';

export const DEFAULT_THINKING_MODEL: GeminiModel =
  'gemini-3.1-flash-lite-preview';

export const DEFAULT_IMAGE_GENERATION_MODEL: GeminiModel =
  'gemini-3.1-flash-image-preview';

export const DEFAULT_SMARTCHAT_TEXT_MODEL: GeminiModel =
  'gemini-3.1-flash-lite-preview';
