import { afterEach, describe, expect, it } from 'vitest';
import {
  classifyModelProvider,
  getDeepSeekTextConnection,
  isOfficialGeminiEnabled
} from '../../api/utils/model-provider-routing';

const originalEnv = { ...process.env };

describe('model provider routing', () => {
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('classifies the provider from the actual upstream host', () => {
    expect(classifyModelProvider('https://api.deepseek.com/v1')).toBe('deepseek');
    expect(classifyModelProvider('https://api.tu-zi.com')).toBe('tuzi');
    expect(classifyModelProvider('https://api.chaojitudou.com/v1')).toBe(
      'chaojitudou'
    );
  });

  it('uses the unified DeepSeek model with generic OpenAI env names', () => {
    process.env.OPENAI_API_KEY = 'key';
    process.env.OPENAI_BASE_URL = 'https://api.deepseek.com/v1';
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.DEEPSEEK_BASE_URL;
    expect(getDeepSeekTextConnection()).toMatchObject({
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      baseURL: 'https://api.deepseek.com/v1'
    });
  });

  it('allows production to disable unsupported official Gemini egress', () => {
    process.env.GEMINI_OFFICIAL_ENABLED = 'false';
    expect(isOfficialGeminiEnabled()).toBe(false);
    delete process.env.GEMINI_OFFICIAL_ENABLED;
    expect(isOfficialGeminiEnabled()).toBe(true);
  });
});
