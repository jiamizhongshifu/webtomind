/**
 * 速率限制器
 * 基于滑动窗口算法的 API 请求限制
 * 
 * 使用内存存储（适用于单实例部署）
 * 生产环境建议使用 Redis 或 Upstash
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// 内存存储（单实例）
const rateLimitStore = new Map<string, RateLimitEntry>();

// 定期清理过期条目
const CLEANUP_INTERVAL = 60 * 1000; // 1 分钟
let lastCleanup = Date.now();

function cleanupExpiredEntries(): void {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  
  lastCleanup = now;
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetAt < now) {
      rateLimitStore.delete(key);
    }
  }
}

/**
 * 速率限制配置
 */
export interface RateLimitConfig {
  /** 时间窗口（毫秒） */
  windowMs: number;
  /** 窗口内最大请求数 */
  maxRequests: number;
  /** 限制键前缀 */
  keyPrefix?: string;
}

/**
 * 速率限制结果
 */
export interface RateLimitResult {
  /** 是否允许请求 */
  allowed: boolean;
  /** 剩余请求数 */
  remaining: number;
  /** 重置时间（Unix 时间戳） */
  resetAt: number;
  /** 重试等待时间（秒） */
  retryAfter?: number;
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: RateLimitConfig = {
  windowMs: 60 * 1000, // 1 分钟
  maxRequests: 60,     // 每分钟 60 次
  keyPrefix: 'rl',
};

/**
 * Skills API 专用配置
 */
export const SKILLS_RATE_LIMIT: RateLimitConfig = {
  windowMs: 60 * 1000,  // 1 分钟
  maxRequests: 30,      // 每分钟 30 次（读写操作）
  keyPrefix: 'skills',
};

/**
 * Skills 创建专用配置（更严格）
 */
export const SKILLS_CREATE_RATE_LIMIT: RateLimitConfig = {
  windowMs: 60 * 1000,  // 1 分钟
  maxRequests: 10,      // 每分钟 10 次创建
  keyPrefix: 'skills_create',
};

/** Costly multimodal inference should be much stricter than ordinary APIs. */
export const DISCOVERY_IMAGE_ANALYSIS_RATE_LIMIT: RateLimitConfig = {
  windowMs: 60 * 1000,
  maxRequests: 6,
  keyPrefix: 'discovery_image_analysis',
};

/**
 * 检查速率限制
 * 
 * @param identifier 用户标识（通常是 userId）
 * @param config 速率限制配置
 * @returns 速率限制结果
 */
export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig = DEFAULT_CONFIG
): RateLimitResult {
  cleanupExpiredEntries();
  
  const now = Date.now();
  const key = `${config.keyPrefix}:${identifier}`;
  const entry = rateLimitStore.get(key);
  
  // 新用户或窗口已过期
  if (!entry || entry.resetAt < now) {
    const resetAt = now + config.windowMs;
    rateLimitStore.set(key, { count: 1, resetAt });
    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetAt,
    };
  }
  
  // 检查是否超限
  if (entry.count >= config.maxRequests) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.resetAt,
      retryAfter,
    };
  }
  
  // 递增计数
  entry.count++;
  return {
    allowed: true,
    remaining: config.maxRequests - entry.count,
    resetAt: entry.resetAt,
  };
}

/**
 * 创建速率限制响应头
 */
export function createRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  const headers: Record<string, string> = {
    'X-RateLimit-Remaining': result.remaining.toString(),
    'X-RateLimit-Reset': Math.ceil(result.resetAt / 1000).toString(),
  };
  
  if (!result.allowed && result.retryAfter) {
    headers['Retry-After'] = result.retryAfter.toString();
  }
  
  return headers;
}

/**
 * 速率限制错误响应
 */
export function rateLimitExceededResponse(result: RateLimitResult): Response {
  return new Response(
    JSON.stringify({
      error: '请求过于频繁，请稍后再试',
      retryAfter: result.retryAfter,
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        ...createRateLimitHeaders(result),
      },
    }
  );
}
