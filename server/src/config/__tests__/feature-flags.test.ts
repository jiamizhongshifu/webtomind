// @vitest-environment node
/**
 * Feature Flags 单元测试
 * 覆盖引擎切换（AGENT_ENGINE）与 open-agent provider 路由逻辑。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const ENV_KEYS = [
  'AGENT_ENGINE',
  'OPENAGENT_PROVIDER',
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_MODEL',
  'GOOGLE_API_KEY',
  'OPENAI_API_KEY'
] as const;

describe('feature-flags getOpenAgentProvider', () => {
  beforeEach(() => {
    vi.resetModules();
    for (const key of ENV_KEYS) {
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      delete process.env[key];
    }
  });

  it('returns an explicit OPENAGENT_PROVIDER when valid', async () => {
    for (const value of ['openai', 'google', 'anthropic'] as const) {
      process.env.OPENAGENT_PROVIDER = value;
      const { getOpenAgentProvider } = await import('../feature-flags.js');
      expect(getOpenAgentProvider()).toBe(value);
    }
  });

  it('ignores an invalid OPENAGENT_PROVIDER and falls through to inference', async () => {
    process.env.OPENAGENT_PROVIDER = 'unknown-provider';
    const { getOpenAgentProvider } = await import('../feature-flags.js');
    // 无任何其他配置时默认 anthropic
    expect(getOpenAgentProvider()).toBe('anthropic');
  });

  it('routes third-party proxy through anthropic protocol', async () => {
    process.env.ANTHROPIC_BASE_URL = 'https://proxy.example.com';
    process.env.ANTHROPIC_AUTH_TOKEN = 'proxy-token';
    const { getOpenAgentProvider } = await import('../feature-flags.js');
    expect(getOpenAgentProvider()).toBe('anthropic');
  });

  it('infers google when the model name contains gemini and a Google key exists', async () => {
    process.env.ANTHROPIC_MODEL = 'gemini-2.5-pro';
    process.env.GOOGLE_API_KEY = 'google-key';
    const { getOpenAgentProvider } = await import('../feature-flags.js');
    expect(getOpenAgentProvider()).toBe('google');
  });

  it('infers openai when the model name contains gpt/o1/o3 and an OpenAI key exists', async () => {
    for (const model of ['gpt-5.4', 'o1-preview', 'o3-mini']) {
      vi.resetModules();
      delete process.env.ANTHROPIC_MODEL;
      delete process.env.OPENAI_API_KEY;
      process.env.ANTHROPIC_MODEL = model;
      process.env.OPENAI_API_KEY = 'openai-key';
      const { getOpenAgentProvider } = await import('../feature-flags.js');
      expect(getOpenAgentProvider()).toBe('openai');
    }
  });

  it('does not infer openai without an OpenAI key', async () => {
    process.env.ANTHROPIC_MODEL = 'gpt-5.4';
    // 无 OPENAI_API_KEY
    const { getOpenAgentProvider } = await import('../feature-flags.js');
    expect(getOpenAgentProvider()).toBe('anthropic');
  });

  it('defaults to anthropic with no configuration', async () => {
    const { getOpenAgentProvider } = await import('../feature-flags.js');
    expect(getOpenAgentProvider()).toBe('anthropic');
  });
});

describe('feature-flags isOpenAgentEnabled', () => {
  afterEach(() => {
    delete process.env.AGENT_ENGINE;
    vi.resetModules();
  });

  it('is false by default (legacy engine)', async () => {
    delete process.env.AGENT_ENGINE;
    const { isOpenAgentEnabled } = await import('../feature-flags.js');
    expect(isOpenAgentEnabled()).toBe(false);
  });

  it('is false for explicit legacy', async () => {
    process.env.AGENT_ENGINE = 'legacy';
    const { isOpenAgentEnabled } = await import('../feature-flags.js');
    expect(isOpenAgentEnabled()).toBe(false);
  });

  it('is true for openagent', async () => {
    process.env.AGENT_ENGINE = 'openagent';
    const { isOpenAgentEnabled } = await import('../feature-flags.js');
    expect(isOpenAgentEnabled()).toBe(true);
  });
});
