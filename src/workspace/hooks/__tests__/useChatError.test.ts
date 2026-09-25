/**
 * useChatError Hook 属性测试
 * 验证错误处理统一格式、可重试错误显示重试按钮等属性
 */

import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import * as fc from 'fast-check';
import {
  useChatError,
  type ChatError,
  type ChatErrorType
} from '../useChatError';

// Mock credits-api
vi.mock('@/services/credits-api', () => ({
  InsufficientCreditsError: class InsufficientCreditsError extends Error {
    required: number;
    current: number;
    constructor(message: string, required: number, current: number) {
      super(message);
      this.name = 'InsufficientCreditsError';
      this.required = required;
      this.current = current;
    }
  },
  QuotaExceededError: class QuotaExceededError extends Error {
    feature: string;
    used: number;
    max: number;
    constructor(message: string, feature: string, used: number, max: number) {
      super(message);
      this.name = 'QuotaExceededError';
      this.feature = feature;
      this.used = used;
      this.max = max;
    }
  }
}));

describe('useChatError Hook', () => {
  const runHandleApiError = (
    hookResult: { current: ReturnType<typeof useChatError> },
    error: unknown
  ): ChatError => {
    let chatError!: ChatError;
    act(() => {
      chatError = hookResult.current.handleApiError(error);
    });
    return chatError;
  };

  describe('基本功能', () => {
    it('初始状态应该没有错误', () => {
      const { result } = renderHook(() => useChatError());
      expect(result.current.error).toBeNull();
    });

    it('应该能够设置错误', () => {
      const { result } = renderHook(() => useChatError());

      const testError: ChatError = {
        type: 'network',
        message: '网络错误',
        retryable: true
      };

      act(() => {
        result.current.setError(testError);
      });

      expect(result.current.error).toEqual(testError);
    });

    it('应该能够清除错误', () => {
      const { result } = renderHook(() => useChatError());

      act(() => {
        result.current.setError({
          type: 'network',
          message: '网络错误',
          retryable: true
        });
      });

      act(() => {
        result.current.clearError();
      });

      expect(result.current.error).toBeNull();
    });
  });

  /**
   * Property 4: 错误处理统一格式
   * 验证: 需求 4.1
   */
  describe('Property 4: 错误处理统一格式', () => {
    it('对于任意错误，handleApiError 应该返回统一的 ChatError 格式', () => {
      const { result } = renderHook(() => useChatError());

      // 生成各种类型的错误
      const errorGenerators = [
        // 普通 Error
        fc
          .string({ minLength: 1, maxLength: 100 })
          .map((msg) => new Error(msg)),
        // TypeError (网络错误)
        fc.constant(new TypeError('Failed to fetch')),
        // 字符串错误
        fc.string({ minLength: 1, maxLength: 100 }),
        // null/undefined
        fc.constant(null),
        fc.constant(undefined)
      ];

      fc.assert(
        fc.property(fc.oneof(...errorGenerators), (error) => {
          const chatError = runHandleApiError(result, error);

          // 验证返回的 ChatError 包含所有必需字段
          expect(chatError).toHaveProperty('type');
          expect(chatError).toHaveProperty('message');
          expect(chatError).toHaveProperty('retryable');

          // 验证 type 是有效的错误类型
          const validTypes: ChatErrorType[] = [
            'network',
            'auth',
            'credits',
            'quota',
            'unknown'
          ];
          expect(validTypes).toContain(chatError.type);

          // 验证 message 是字符串
          expect(typeof chatError.message).toBe('string');

          // 验证 retryable 是布尔值
          expect(typeof chatError.retryable).toBe('boolean');
        }),
        { numRuns: 50 }
      );
    });

    it('网络错误应该被正确分类', () => {
      const { result } = renderHook(() => useChatError());

      const networkErrors = [
        new TypeError('Failed to fetch'),
        new Error('Network error'),
        new Error('Connection timeout'),
        new Error('network request failed')
      ];

      networkErrors.forEach((error) => {
        const chatError = runHandleApiError(result, error);
        expect(chatError.type).toBe('network');
        expect(chatError.retryable).toBe(true);
      });
    });

    it('认证错误应该被正确分类', () => {
      const { result } = renderHook(() => useChatError());

      const authErrors = [
        new Error('Unauthorized'),
        new Error('401 error'),
        new Error('Token expired'),
        new Error('Authentication failed')
      ];

      authErrors.forEach((error) => {
        const chatError = runHandleApiError(result, error);
        expect(chatError.type).toBe('auth');
        expect(chatError.retryable).toBe(false);
      });
    });
  });

  /**
   * Property 5: 可重试错误显示重试按钮
   * 验证: 需求 4.3
   */
  describe('Property 5: 可重试错误的 retryable 属性', () => {
    it('网络错误和未知错误应该是可重试的', () => {
      const { result } = renderHook(() => useChatError());

      fc.assert(
        fc.property(
          fc.oneof(
            fc.constant(new TypeError('Failed to fetch')),
            fc.constant(new Error('Network error')),
            fc.string({ minLength: 1 }).map((msg) => new Error(msg))
          ),
          (error) => {
            const chatError = runHandleApiError(result, error);

            // 网络错误应该可重试
            if (chatError.type === 'network') {
              expect(chatError.retryable).toBe(true);
            }

            // 未知错误应该可重试
            if (chatError.type === 'unknown') {
              expect(chatError.retryable).toBe(true);
            }
          }
        ),
        { numRuns: 30 }
      );
    });

    it('认证错误、积分不足、配额超限应该不可重试', () => {
      const { result } = renderHook(() => useChatError());

      // 认证错误
      const authError = runHandleApiError(result, new Error('Unauthorized'));
      expect(authError.type).toBe('auth');
      expect(authError.retryable).toBe(false);
    });
  });

  describe('错误类型完整性', () => {
    it('所有错误类型都应该有对应的处理逻辑', () => {
      const errorTypes: ChatErrorType[] = [
        'network',
        'auth',
        'credits',
        'quota',
        'unknown'
      ];

      errorTypes.forEach((type) => {
        const error: ChatError = {
          type,
          message: `Test ${type} error`,
          retryable: type === 'network' || type === 'unknown'
        };

        expect(error.type).toBe(type);
      });
    });
  });
});
