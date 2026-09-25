/**
 * 前端重试工具
 * 实现指数退避重试机制
 */

// ============================================
// 配置
// ============================================

export interface RetryConfig {
  /** 最大重试次数 */
  maxRetries: number;
  /** 基础延迟时间（毫秒） */
  baseDelay: number;
  /** 最大延迟时间（毫秒） */
  maxDelay: number;
  /** 重试回调 */
  onRetry?: (attempt: number, error: Error, delay: number) => void;
}

const DEFAULT_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 10000
};

// ============================================
// 核心函数
// ============================================

/**
 * 判断错误是否可重试
 */
export function isRetryableError(error: Error): boolean {
  const errorString = `${error.name} ${error.message}`.toLowerCase();

  const retryablePatterns = [
    // 网络错误
    'network',
    'fetch',
    'failed to fetch',
    'networkerror',
    'timeout',
    'aborted',
    // HTTP 错误码
    '429', // Too Many Requests
    '500', // Internal Server Error
    '502', // Bad Gateway
    '503', // Service Unavailable
    '504', // Gateway Timeout
    'overloaded',
    'rate limit',
    'capacity'
  ];

  return retryablePatterns.some((pattern) => errorString.includes(pattern));
}

/**
 * 计算指数退避延迟
 */
export function calculateBackoff(
  attempt: number,
  baseDelay: number,
  maxDelay: number
): number {
  // 指数退避 + 随机抖动
  const exponentialDelay = baseDelay * Math.pow(2, attempt - 1);
  const jitter = Math.random() * 0.3 * exponentialDelay;
  const delay = Math.min(exponentialDelay + jitter, maxDelay);

  return Math.round(delay);
}

/**
 * 延迟执行
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 带重试的异步函数执行
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const mergedConfig: RetryConfig = { ...DEFAULT_CONFIG, ...config };
  let lastError: Error;

  for (let attempt = 1; attempt <= mergedConfig.maxRetries + 1; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // 最后一次尝试或不可重试的错误
      if (attempt > mergedConfig.maxRetries || !isRetryableError(lastError)) {
        throw lastError;
      }

      // 计算延迟
      const backoffDelay = calculateBackoff(
        attempt,
        mergedConfig.baseDelay,
        mergedConfig.maxDelay
      );

      // 回调通知
      if (mergedConfig.onRetry) {
        mergedConfig.onRetry(attempt, lastError, backoffDelay);
      }

      console.log(
        `[Retry] Attempt ${attempt}/${mergedConfig.maxRetries} failed: ${lastError.message}. ` +
          `Retrying in ${backoffDelay}ms...`
      );

      // 等待后重试
      await delay(backoffDelay);
    }
  }

  throw lastError!;
}

// ============================================
// 错误分类
// ============================================

export interface ClassifiedError {
  /** 原始错误 */
  original: Error;
  /** 错误类型 */
  type: 'network' | 'auth' | 'rate_limit' | 'server' | 'client' | 'unknown';
  /** 用户友好的错误消息 */
  message: string;
  /** 是否可重试 */
  retryable: boolean;
  /** HTTP 状态码（如果有） */
  statusCode?: number;
}

/**
 * 分类错误以便更好地处理
 */
export function classifyError(
  error: Error,
  statusCode?: number
): ClassifiedError {
  const errorString = `${error.name} ${error.message}`.toLowerCase();

  if (statusCode === 413 || errorString.includes('413')) {
    return {
      original: error,
      type: 'client',
      message: '????????????????????????',
      retryable: false,
      statusCode: 413
    };
  }

  // 网络错误
  if (
    errorString.includes('network') ||
    errorString.includes('failed to fetch') ||
    errorString.includes('timeout') ||
    errorString.includes('aborted')
  ) {
    return {
      original: error,
      type: 'network',
      message: '网络连接失败，请检查网络后重试',
      retryable: true
    };
  }

  // 认证错误
  if (
    statusCode === 401 ||
    errorString.includes('unauthorized') ||
    errorString.includes('认证')
  ) {
    return {
      original: error,
      type: 'auth',
      message: '登录已过期，请重新登录',
      retryable: false,
      statusCode: 401
    };
  }

  // 速率限制
  if (
    statusCode === 429 ||
    errorString.includes('rate') ||
    errorString.includes('limit')
  ) {
    return {
      original: error,
      type: 'rate_limit',
      message: '请求过于频繁，请稍后再试',
      retryable: true,
      statusCode: 429
    };
  }

  // 服务器错误
  if (statusCode && statusCode >= 500) {
    return {
      original: error,
      type: 'server',
      message: '服务器繁忙，正在重试...',
      retryable: true,
      statusCode
    };
  }

  // 客户端错误
  if (statusCode && statusCode >= 400 && statusCode < 500) {
    return {
      original: error,
      type: 'client',
      message: error.message || '请求失败',
      retryable: false,
      statusCode
    };
  }

  // 未知错误
  return {
    original: error,
    type: 'unknown',
    message: error.message || '发生未知错误',
    retryable: isRetryableError(error)
  };
}
