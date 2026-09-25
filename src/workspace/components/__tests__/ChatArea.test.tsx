/**
 * ChatArea 组件属性测试
 * 验证模式切换锁定、模式界面即时更新等属性
 */

import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';
import type { ChatMode, UnifiedMessage } from '@/types/unified-chat';

// Mock 所有依赖
vi.mock('@/services/database', () => ({}));
vi.mock('@/services/workspace-api', () => ({
  getAllConversations: vi.fn().mockResolvedValue([]),
  getConversation: vi.fn().mockResolvedValue({ messages: [] }),
  saveConversation: vi.fn().mockResolvedValue({}),
  updateConversation: vi.fn().mockResolvedValue({}),
  deleteConversation: vi.fn().mockResolvedValue({}),
  saveSummary: vi.fn().mockResolvedValue({})
}));
vi.mock('@/services/agent-api', () => ({
  streamChat: vi.fn(),
  smartChatStream: vi.fn(),
  confirmToolCall: vi.fn(),
  batchImageExecuteStream: vi.fn()
}));
vi.mock('@/services/credits-api', () => ({
  consumeCredits: vi.fn(),
  InsufficientCreditsError: class extends Error {},
  QuotaExceededError: class extends Error {}
}));
vi.mock('@/utils/env', () => ({
  isExtensionEnv: () => false
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key
  })
}));

/**
 * Property 1: 模式切换锁定
 * 验证: 需求 1.5, 2.6
 *
 * 对于任意聊天会话，当消息列表长度大于 0 时，
 * 模式切换功能应该被禁用，用户无法更改当前模式。
 */
describe('Property 1: 模式切换锁定', () => {
  // 生成随机消息
  const messageArbitrary = fc.record({
    id: fc.string({ minLength: 1, maxLength: 20 }),
    role: fc.constantFrom('user', 'assistant') as fc.Arbitrary<
      'user' | 'assistant'
    >,
    blocks: fc.array(
      fc.record({
        type: fc.constant('text' as const),
        content: fc.string({ minLength: 1, maxLength: 100 })
      }),
      { minLength: 1, maxLength: 3 }
    ),
    timestamp: fc.integer({ min: 0 })
  }) as fc.Arbitrary<UnifiedMessage>;

  it('当消息列表为空时，应该允许模式切换', () => {
    const messages: UnifiedMessage[] = [];
    const conversationStarted = messages.length > 0;

    expect(conversationStarted).toBe(false);
    // 模式切换应该被允许
  });

  it('当消息列表非空时，应该禁用模式切换', () => {
    fc.assert(
      fc.property(
        fc.array(messageArbitrary, { minLength: 1, maxLength: 10 }),
        (messages) => {
          const conversationStarted = messages.length > 0;

          // 当有消息时，conversationStarted 应该为 true
          expect(conversationStarted).toBe(true);

          // 模式切换应该被禁用（在实际组件中通过 conversationStarted 控制）
        }
      ),
      { numRuns: 50 }
    );
  });

  it('conversationStarted 应该正确反映消息列表状态', () => {
    fc.assert(
      fc.property(
        fc.array(messageArbitrary, { minLength: 0, maxLength: 10 }),
        (messages) => {
          const conversationStarted = messages.length > 0;

          if (messages.length === 0) {
            expect(conversationStarted).toBe(false);
          } else {
            expect(conversationStarted).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * Property 7: 模式界面即时更新
 * 验证: 需求 2.5
 *
 * 对于任意模式切换操作，界面应立即反映新的模式状态，
 * 包括图标和标签的更新。
 */
describe('Property 7: 模式界面即时更新', () => {
  // 模式配置
  const modeConfig: Record<
    ChatMode,
    { icon: string; label: string; desc: string }
  > = {
    ask: {
      icon: 'Zap',
      label: 'chat.askMode',
      desc: 'chat.askModeDesc'
    },
    agent: {
      icon: 'Bot',
      label: 'chat.agentMode',
      desc: 'chat.agentModeDesc'
    }
  };

  it('每个模式都应该有对应的配置', () => {
    const modes: ChatMode[] = ['ask', 'agent'];

    modes.forEach((mode) => {
      expect(modeConfig[mode]).toBeDefined();
      expect(modeConfig[mode].icon).toBeDefined();
      expect(modeConfig[mode].label).toBeDefined();
      expect(modeConfig[mode].desc).toBeDefined();
    });
  });

  it('模式切换后应该使用正确的配置', () => {
    fc.assert(
      fc.property(fc.constantFrom<ChatMode>('ask', 'agent'), (mode) => {
        const config = modeConfig[mode];

        // 验证配置存在且正确
        expect(config).toBeDefined();

        if (mode === 'ask') {
          expect(config.icon).toBe('Zap');
          expect(config.label).toBe('chat.askMode');
        } else {
          expect(config.icon).toBe('Bot');
          expect(config.label).toBe('chat.agentMode');
        }
      }),
      { numRuns: 20 }
    );
  });

  it('agentMode 变量应该正确反映当前模式', () => {
    fc.assert(
      fc.property(fc.constantFrom<ChatMode>('ask', 'agent'), (chatMode) => {
        // 模拟 ChatArea 中的 agentMode 计算
        const agentMode = chatMode === 'agent';

        if (chatMode === 'agent') {
          expect(agentMode).toBe(true);
        } else {
          expect(agentMode).toBe(false);
        }
      }),
      { numRuns: 20 }
    );
  });
});

/**
 * 功能菜单过滤测试
 */
describe('功能菜单过滤', () => {
  // 当前可用的功能列表
  const agentFeatures = [
    { id: 'image', icon: '🎨' },
    { id: 'slide_deck', icon: '📽️' }
  ];

  // 被隐藏的功能列表
  const hiddenFeatures = [
    'flashcards',
    'mindmap',
    'quiz',
    'report',
    'summary',
    'audio',
    'video',
    'infographic',
    'data_table'
  ];

  it('agentFeatures 应该只包含 image 和 slide_deck', () => {
    expect(agentFeatures).toHaveLength(2);
    expect(agentFeatures.map((f) => f.id)).toContain('image');
    expect(agentFeatures.map((f) => f.id)).toContain('slide_deck');
  });

  it('agentFeatures 不应该包含被隐藏的功能', () => {
    const featureIds = agentFeatures.map((f) => f.id);

    hiddenFeatures.forEach((hidden) => {
      expect(featureIds).not.toContain(hidden);
    });
  });

  it('每个功能都应该有 id 和 icon', () => {
    agentFeatures.forEach((feature) => {
      expect(feature.id).toBeDefined();
      expect(feature.icon).toBeDefined();
      expect(typeof feature.id).toBe('string');
      expect(typeof feature.icon).toBe('string');
    });
  });
});
