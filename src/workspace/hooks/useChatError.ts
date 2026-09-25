/**
 * 统一聊天错误处理 Hook
 * 将各种 API 错误转换为统一的 ChatError 格式
 */

import { useState, useCallback } from 'react';
import {
  InsufficientCreditsError,
  QuotaExceededError
} from '@/services/credits-api';

/** 错误类型枚举 */
export type ChatErrorType =
  | 'network'
  | 'auth'
  | 'credits'
  | 'quota'
  | 'unknown';

/** 统一错误格式 */
export interface ChatError {
  /** 错误类型 */
  type: ChatErrorType;
  /** 用户可读的错误信息 */
  message: string;
  /** 是否可重试 */
  retryable: boolean;
  /** 详细错误信息（可选） */
  details?: string;
  /** 额外数据（如积分不足时的所需积分数） */
  data?: {
    required?: number;
    current?: number;
    feature?: string;
    used?: number;
    max?: number;
    resetAt?: string;
  };
}

export interface UseChatErrorReturn {
  /** 当前错误 */
  error: ChatError | null;
  /** 设置错误 */
  setError: (error: ChatError | null) => void;
  /** 清除错误 */
  clearError: () => void;
  /** 处理 API 错误，转换为统一格式 */
  handleApiError: (err: unknown) => ChatError;
}

/**
 * 判断是否为网络错误
 */
function isNetworkError(err: unknown): boolean {
  if (err instanceof TypeError && err.message.includes('fetch')) {
    return true;
  }
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return (
      msg.includes('network') ||
      msg.includes('timeout') ||
      msg.includes('connection') ||
      msg.includes('failed to fetch')
    );
  }
  return false;
}

/**
 * 判断是否为认证错误
 */
function isAuthError(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return (
      msg.includes('unauthorized') ||
      msg.includes('401') ||
      msg.includes('token') ||
      msg.includes('authentication') ||
      msg.includes('login')
    );
  }
  return false;
}

export function useChatError(): UseChatErrorReturn {
  const [error, setError] = useState<ChatError | null>(null);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  /**
   * 将各种 API 错误转换为统一的 ChatError 格式
   */
  const handleApiError = useCallback((err: unknown): ChatError => {
    // 积分不足错误
    if (err instanceof InsufficientCreditsError) {
      const chatError: ChatError = {
        type: 'credits',
        message: err.message,
        retryable: false,
        data: {
          required: err.required,
          current: err.current
        }
      };
      setError(chatError);
      return chatError;
    }

    // 配额超限错误
    if (err instanceof QuotaExceededError) {
      const chatError: ChatError = {
        type: 'quota',
        message: err.message,
        retryable: false,
        data: {
          feature: err.feature,
          used: err.used,
          max: err.max,
          resetAt: err.resetAt
        }
      };
      setError(chatError);
      return chatError;
    }

    // 网络错误
    if (isNetworkError(err)) {
      const chatError: ChatError = {
        type: 'network',
        message: '网络连接失败，请检查网络后重试',
        retryable: true,
        details: err instanceof Error ? err.message : undefined
      };
      setError(chatError);
      return chatError;
    }

    // 认证错误
    if (isAuthError(err)) {
      const chatError: ChatError = {
        type: 'auth',
        message: '登录已过期，请重新登录',
        retryable: false,
        details: err instanceof Error ? err.message : undefined
      };
      setError(chatError);
      return chatError;
    }

    // 未知错误
    const chatError: ChatError = {
      type: 'unknown',
      message: err instanceof Error ? err.message : '发生未知错误',
      retryable: true,
      details: err instanceof Error ? err.stack : undefined
    };
    setError(chatError);
    return chatError;
  }, []);

  return {
    error,
    setError,
    clearError,
    handleApiError
  };
}
