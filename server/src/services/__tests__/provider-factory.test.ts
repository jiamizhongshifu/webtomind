// @vitest-environment node
/**
 * ProviderFactory 单元测试
 * 覆盖提供商注册、PPT 请求强制路由与未知提供商错误。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// 隔离 agent 模块，避免 import 时触发真实 SDK 初始化。
const mocks = vi.hoisted(() => {
  const claudeAgent = { __kind: 'claude', getName: () => 'Claude', isAvailable: async () => false };
  const geminiAgent = { __kind: 'gemini', getName: () => 'Gemini', isAvailable: async () => false };
  const openaiAgent = { __kind: 'openai', getName: () => 'OpenAI', isAvailable: async () => false };
  const openAgentService = { __kind: 'openagent', getName: () => 'OpenAgent', isAvailable: async () => false };
  return {
    claudeAgent,
    geminiAgent,
    openaiAgent,
    openAgentService,
    isOpenAgentEnabled: vi.fn(() => false)
  };
});

vi.mock('../claude-agent.js', () => ({ claudeAgent: mocks.claudeAgent }));
vi.mock('../gemini-agent.js', () => ({ geminiAgent: mocks.geminiAgent }));
vi.mock('../openai-agent.js', () => ({ openaiAgent: mocks.openaiAgent }));
vi.mock('../open-agent-service.js', () => ({ openAgentService: mocks.openAgentService }));
vi.mock('../../config/feature-flags.js', () => ({ isOpenAgentEnabled: mocks.isOpenAgentEnabled }));

import { ProviderFactory } from '../provider-factory.js';

describe('ProviderFactory', () => {
  beforeEach(() => {
    mocks.isOpenAgentEnabled.mockReturnValue(false);
  });

  it('registers native providers in legacy mode', () => {
    const factory = new ProviderFactory();
    expect(factory.getProvider('claude')).toBe(mocks.claudeAgent);
    expect(factory.getProvider('gemini')).toBe(mocks.geminiAgent);
    expect(factory.getProvider('openai')).toBe(mocks.openaiAgent);
  });

  it('registers the unified open-agent service in openagent mode', () => {
    mocks.isOpenAgentEnabled.mockReturnValue(true);
    const factory = new ProviderFactory();
    expect(factory.getProvider('claude')).toBe(mocks.openAgentService);
    expect(factory.getProvider('gemini')).toBe(mocks.openAgentService);
    expect(factory.getProvider('openai')).toBe(mocks.openAgentService);
  });

  it('forces Gemini for PPT requests in legacy mode', () => {
    const factory = new ProviderFactory();
    const provider = factory.getProvider('auto', '帮我做一个演示文稿');
    expect(provider).toBe(mocks.geminiAgent);
  });

  it('routes PPT requests through open-agent service in openagent mode', () => {
    mocks.isOpenAgentEnabled.mockReturnValue(true);
    const factory = new ProviderFactory();
    const provider = factory.getProvider('auto', '生成一个幻灯片');
    expect(provider).toBe(mocks.openAgentService);
  });

  it('detects PPT keyword variants', () => {
    const factory = new ProviderFactory();
    for (const prompt of ['PPT', '做个PPT', 'slides', 'presentation', '制作幻灯片']) {
      expect(factory.getProvider('auto', prompt)).toBe(mocks.geminiAgent);
    }
  });

  it('throws for an unknown provider type', () => {
    const factory = new ProviderFactory();
    expect(() => factory.getProvider('unknown' as never)).toThrow(/Unknown provider/);
  });
});
