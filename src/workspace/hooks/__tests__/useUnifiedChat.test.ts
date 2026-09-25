/**
 * useUnifiedChat Hook 属性测试
 * 验证模式与 API 端点映射、工具调用关联等属性
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import * as fc from 'fast-check';
import { useUnifiedChat } from '../useUnifiedChat';
import type { ChatMode } from '@/types/unified-chat';

// Mock agent-api
vi.mock('@/services/agent-api', () => ({
  streamChat: vi.fn().mockImplementation(async function* () {
    yield { type: 'text', data: { content: 'test response' } };
    yield { type: 'done', data: {} };
  }),
  smartChatStream: vi.fn().mockImplementation(async function* () {
    yield { type: 'text', data: { content: 'test response' } };
    yield { type: 'done', data: {} };
  })
}));

// Mock i18n
vi.mock('@/i18n', () => ({
  default: {
    t: (key: string) => key
  }
}));

describe('useUnifiedChat Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('默认模式', () => {
    it('默认模式应该是 "ask"', () => {
      const { result } = renderHook(() => useUnifiedChat());
      expect(result.current.mode).toBe('ask');
    });

    it('应该能够通过 defaultMode 选项设置初始模式', () => {
      const { result } = renderHook(() =>
        useUnifiedChat({ defaultMode: 'agent' })
      );
      expect(result.current.mode).toBe('agent');
    });
  });

  describe('模式切换', () => {
    it('应该能够切换到 agent 模式', () => {
      const { result } = renderHook(() => useUnifiedChat());

      act(() => {
        result.current.setMode('agent');
      });

      expect(result.current.mode).toBe('agent');
    });

    it('应该能够切换到 ask 模式', () => {
      const { result } = renderHook(() =>
        useUnifiedChat({ defaultMode: 'agent' })
      );

      act(() => {
        result.current.setMode('ask');
      });

      expect(result.current.mode).toBe('ask');
    });
  });

  /**
   * Property 2: 模式与 API 端点映射
   * 验证: 需求 5.1, 5.2
   */
  describe('Property 2: 模式与 API 端点映射', () => {
    it('对于任意模式，应该调用正确的 API 端点', async () => {
      const { streamChat, smartChatStream } =
        await import('@/services/agent-api');

      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom<ChatMode>('ask', 'agent'),
          fc.string({ minLength: 1, maxLength: 100 }).filter((message) => {
            return message.trim().length > 0;
          }),
          async (mode, message) => {
            vi.clearAllMocks();

            const { result } = renderHook(() =>
              useUnifiedChat({ defaultMode: mode })
            );

            // 发送消息
            await act(async () => {
              await result.current.sendMessage(message);
            });

            // 验证调用了正确的 API
            if (mode === 'ask') {
              expect(smartChatStream).toHaveBeenCalled();
              expect(streamChat).not.toHaveBeenCalled();
            } else {
              expect(streamChat).toHaveBeenCalled();
              expect(smartChatStream).not.toHaveBeenCalled();
            }
          }
        ),
        { numRuns: 20 } // 减少运行次数以加快测试
      );
    });
  });

  /**
   * Property 3: 模式与工具调用关联
   * 验证: 需求 5.3, 5.4
   */
  describe('Property 3: 模式与工具调用关联', () => {
    it('ask 模式下应该使用 smartChatStream（不支持工具调用）', async () => {
      const { smartChatStream } = await import('@/services/agent-api');

      const { result } = renderHook(() =>
        useUnifiedChat({ defaultMode: 'ask' })
      );

      await act(async () => {
        await result.current.sendMessage('test message');
      });

      // ask 模式使用 smartChatStream，不支持工具调用
      expect(smartChatStream).toHaveBeenCalled();
    });

    it('agent 模式下应该使用 streamChat（支持工具调用）', async () => {
      const { streamChat } = await import('@/services/agent-api');

      const { result } = renderHook(() =>
        useUnifiedChat({ defaultMode: 'agent' })
      );

      await act(async () => {
        await result.current.sendMessage('test message');
      });

      // agent 模式使用 streamChat，支持工具调用
      expect(streamChat).toHaveBeenCalled();
    });
  });
});
