import { describe, expect, it } from 'vitest';
import {
  DEEPSEEK_V4_FLASH_0731_MODEL,
  DEEPSEEK_V4_FLASH_0731_VERSION,
  DEFAULT_OPENAI_MODEL,
  DEFAULT_SKILL_AGENT_MODEL,
  DEFAULT_TEXT_AGENT_MODEL,
  DEFAULT_WEAVING_MODEL
} from '../../api/utils/model-registry';

describe('DeepSeek model policy', () => {
  it('maps every DeepSeek-backed text role to the 0731 release API id', () => {
    expect(DEEPSEEK_V4_FLASH_0731_VERSION).toBe('DeepSeek-V4-Flash-0731');
    expect(DEEPSEEK_V4_FLASH_0731_MODEL).toBe('deepseek-v4-flash');
    expect([
      DEFAULT_OPENAI_MODEL,
      DEFAULT_SKILL_AGENT_MODEL,
      DEFAULT_TEXT_AGENT_MODEL,
      DEFAULT_WEAVING_MODEL
    ]).toEqual(Array(4).fill(DEEPSEEK_V4_FLASH_0731_MODEL));
  });
});
