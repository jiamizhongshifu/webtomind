import { DEEPSEEK_V4_FLASH_0731_MODEL } from './model-registry.js';

export type ModelProviderId =
  | 'deepseek'
  | 'tuzi'
  | 'chaojitudou'
  | 'openai'
  | 'anthropic'
  | 'openai_compatible';

function readBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === '') return fallback;
  return !['0', 'false', 'off', 'disabled', 'no'].includes(
    value.trim().toLowerCase()
  );
}

/** Official Gemini remains enabled unless a runtime explicitly disables it. */
export function isOfficialGeminiEnabled(): boolean {
  return readBoolean(process.env.GEMINI_OFFICIAL_ENABLED, true);
}

export function classifyModelProvider(baseURL: string): ModelProviderId {
  let hostname = '';
  try {
    hostname = new URL(baseURL).hostname.toLowerCase();
  } catch {
    hostname = baseURL.toLowerCase();
  }
  if (hostname.includes('deepseek')) return 'deepseek';
  if (hostname.includes('tu-zi') || hostname.includes('tuzi')) return 'tuzi';
  if (hostname.includes('chaojitudou')) return 'chaojitudou';
  if (hostname.includes('anthropic')) return 'anthropic';
  if (hostname.includes('openai')) return 'openai';
  return 'openai_compatible';
}

export function normalizeChatCompletionsBaseURL(baseURL: string): string {
  const trimmed = baseURL.replace(/\/+$/, '');
  return /\/v\d+$/i.test(trimmed) ? trimmed : `${trimmed}/v1`;
}

export function getDeepSeekTextConnection(): {
  apiKey: string;
  baseURL: string;
  model: string;
  provider: ModelProviderId;
} {
  const apiKey = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY || '';
  const baseURL =
    process.env.DEEPSEEK_BASE_URL ||
    process.env.OPENAI_BASE_URL ||
    'https://api.deepseek.com';
  return {
    apiKey,
    baseURL: normalizeChatCompletionsBaseURL(baseURL),
    model: DEEPSEEK_V4_FLASH_0731_MODEL,
    provider: classifyModelProvider(baseURL)
  };
}
