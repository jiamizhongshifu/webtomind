/**
 * 速率限制器
 */

/**
 * 速率限制配置
 */
interface RateLimiterConfig {
  /** 最大并发请求数 */
  maxConcurrent: number;
  /** 时间窗口（毫秒） */
  windowMs: number;
  /** 时间窗口内最大请求数 */
  maxRequests: number;
}

/**
 * 请求队列项
 */
interface QueueItem<T> {
  fn: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
  timestamp: number;
}

/**
 * 速率限制器类
 */
export class RateLimiter {
  private config: RateLimiterConfig;
  private queue: QueueItem<unknown>[] = [];
  private running = 0;
  private requestTimestamps: number[] = [];

  constructor(config: Partial<RateLimiterConfig> = {}) {
    this.config = {
      maxConcurrent: config.maxConcurrent || 5,
      windowMs: config.windowMs || 60000, // 1分钟
      maxRequests: config.maxRequests || 50
    };
  }

  /**
   * 执行请求（带速率限制）
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push({
        fn: fn as () => Promise<unknown>,
        resolve: resolve as (value: unknown) => void,
        reject,
        timestamp: Date.now()
      });

      this.processQueue();
    });
  }

  /**
   * 处理队列
   */
  private async processQueue(): Promise<void> {
    // 检查并发数限制
    if (this.running >= this.config.maxConcurrent) {
      return;
    }

    // 检查队列是否为空
    if (this.queue.length === 0) {
      return;
    }

    // 清理过期的时间戳
    this.cleanupTimestamps();

    // 检查速率限制
    if (this.requestTimestamps.length >= this.config.maxRequests) {
      // 等待一段时间后重试
      const oldestRequest = this.requestTimestamps[0];
      const waitTime = this.config.windowMs - (Date.now() - oldestRequest);

      if (waitTime > 0) {
        setTimeout(() => this.processQueue(), waitTime);
        return;
      }
    }

    // 从队列中取出下一个请求
    const item = this.queue.shift();
    if (!item) return;

    // 增加运行计数
    this.running++;
    this.requestTimestamps.push(Date.now());

    try {
      const result = await item.fn();
      item.resolve(result);
    } catch (error) {
      item.reject(error);
    } finally {
      // 减少运行计数
      this.running--;

      // 继续处理队列
      this.processQueue();
    }
  }

  /**
   * 清理过期的时间戳
   */
  private cleanupTimestamps(): void {
    const now = Date.now();
    this.requestTimestamps = this.requestTimestamps.filter(
      (timestamp) => now - timestamp < this.config.windowMs
    );
  }

  /**
   * 获取队列状态
   */
  getStatus() {
    return {
      queueLength: this.queue.length,
      running: this.running,
      requestsInWindow: this.requestTimestamps.length,
      maxConcurrent: this.config.maxConcurrent,
      maxRequests: this.config.maxRequests
    };
  }

  /**
   * 清空队列
   */
  clear(): void {
    this.queue.forEach((item) => {
      item.reject(new Error('队列已清空'));
    });
    this.queue = [];
  }
}

/**
 * 全局速率限制器实例
 * 优化: 提高并发数从5到10,充分利用Gemini API性能
 */
export const globalRateLimiter = new RateLimiter({
  maxConcurrent: 10, // 从5提升到10,支持更多并发请求
  windowMs: 60000, // 1分钟
  maxRequests: 50 // Gemini 的实际限制可能不同，需要根据实际情况调整
});
