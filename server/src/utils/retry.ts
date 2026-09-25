/**
 * 重试工具函数
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
  /** 可重试的错误码/消息 */
  retryableErrors: string[];
  /** 重试回调（用于日志记录） */
  onRetry?: (attempt: number, error: Error, delay: number) => void;
}

const DEFAULT_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 10000,
  retryableErrors: [
    // 网络错误
    'ECONNRESET',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'ENOTFOUND',
    'EAI_AGAIN',
    'ENETUNREACH',
    'fetch failed',
    'network error',
    // HTTP 错误
    '429',  // Too Many Requests
    '500',  // Internal Server Error
    '502',  // Bad Gateway
    '503',  // Service Unavailable
    '504',  // Gateway Timeout
    'overloaded',
    'rate_limit',
    'capacity',
  ],
};

// ============================================
// 核心函数
// ============================================

/**
 * 判断错误是否可重试
 */
export function isRetryableError(error: Error, config: RetryConfig = DEFAULT_CONFIG): boolean {
  const errorString = `${error.name} ${error.message}`.toLowerCase();

  return config.retryableErrors.some(pattern =>
    errorString.includes(pattern.toLowerCase())
  );
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
  const jitter = Math.random() * 0.3 * exponentialDelay; // 0-30% 抖动
  const delay = Math.min(exponentialDelay + jitter, maxDelay);

  return Math.round(delay);
}

/**
 * 延迟执行
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
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
      if (attempt > mergedConfig.maxRetries || !isRetryableError(lastError, mergedConfig)) {
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
// 流式请求重试（特殊处理）
// ============================================

/**
 * 流式请求的重试包装器
 * 注意：流式请求只能在开始前重试，一旦开始流就不能重试
 */
export async function withStreamRetry<T>(
  createStream: () => T,
  validateStream: (stream: T) => Promise<void>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const mergedConfig: RetryConfig = { ...DEFAULT_CONFIG, ...config };
  let lastError: Error;

  for (let attempt = 1; attempt <= mergedConfig.maxRetries + 1; attempt++) {
    try {
      const stream = createStream();
      // 验证流是否正常（例如检查连接）
      await validateStream(stream);
      return stream;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt > mergedConfig.maxRetries || !isRetryableError(lastError, mergedConfig)) {
        throw lastError;
      }

      const backoffDelay = calculateBackoff(
        attempt,
        mergedConfig.baseDelay,
        mergedConfig.maxDelay
      );

      if (mergedConfig.onRetry) {
        mergedConfig.onRetry(attempt, lastError, backoffDelay);
      }

      console.log(
        `[StreamRetry] Attempt ${attempt}/${mergedConfig.maxRetries} failed. ` +
        `Retrying in ${backoffDelay}ms...`
      );

      await delay(backoffDelay);
    }
  }

  throw lastError!;
}

// ============================================
// 专用重试配置
// ============================================

/** Claude API 重试配置 */
export const CLAUDE_RETRY_CONFIG: Partial<RetryConfig> = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 15000,
  retryableErrors: [
    ...DEFAULT_CONFIG.retryableErrors,
    'overloaded_error',
    'api_error',
  ],
};

/** Gemini API 重试配置 */
export const GEMINI_RETRY_CONFIG: Partial<RetryConfig> = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 15000,
  retryableErrors: [
    ...DEFAULT_CONFIG.retryableErrors,
    'RESOURCE_EXHAUSTED',
    'UNAVAILABLE',
  ],
};

/** 工具执行重试配置（更宽松） */
export const TOOL_RETRY_CONFIG: Partial<RetryConfig> = {
  maxRetries: 2,
  baseDelay: 500,
  maxDelay: 5000,
};
