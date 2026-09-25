/**
 * 统一日志记录工具
 * 提供结构化日志和性能追踪
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  [key: string]: unknown;
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
  duration?: number;
  requestId?: string;
}

/**
 * 日志配置
 */
const LOG_CONFIG = {
  minLevel: (process.env.LOG_LEVEL || 'info') as LogLevel,
  enableConsole: true,
  enableStructured: process.env.NODE_ENV === 'production',
};

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * 检查是否应该记录该级别的日志
 */
function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[LOG_CONFIG.minLevel];
}

/**
 * 格式化日志输出
 */
function formatLog(entry: LogEntry): string {
  if (LOG_CONFIG.enableStructured) {
    return JSON.stringify(entry);
  }
  
  const parts = [
    `[${entry.timestamp}]`,
    `[${entry.level.toUpperCase()}]`,
    entry.requestId ? `[${entry.requestId}]` : '',
    entry.message,
    entry.duration !== undefined ? `(${entry.duration}ms)` : '',
  ].filter(Boolean);
  
  if (entry.context && Object.keys(entry.context).length > 0) {
    parts.push(JSON.stringify(entry.context));
  }
  
  return parts.join(' ');
}

/**
 * 记录日志
 */
function log(level: LogLevel, message: string, context?: LogContext): void {
  if (!shouldLog(level)) return;
  
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    context,
  };
  
  const formatted = formatLog(entry);
  
  switch (level) {
    case 'debug':
      console.debug(formatted);
      break;
    case 'info':
      console.info(formatted);
      break;
    case 'warn':
      console.warn(formatted);
      break;
    case 'error':
      console.error(formatted);
      break;
  }
}

/**
 * Logger 类 - 支持请求级别的日志追踪
 */
export class Logger {
  private requestId?: string;
  private context: LogContext;

  constructor(context: LogContext = {}, requestId?: string) {
    this.context = context;
    this.requestId = requestId;
  }

  /**
   * 创建子 Logger
   */
  child(additionalContext: LogContext): Logger {
    return new Logger(
      { ...this.context, ...additionalContext },
      this.requestId
    );
  }

  /**
   * 设置请求 ID
   */
  setRequestId(requestId: string): void {
    this.requestId = requestId;
  }

  private logWithContext(level: LogLevel, message: string, context?: LogContext): void {
    const fullContext = { ...this.context, ...context };
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: Object.keys(fullContext).length > 0 ? fullContext : undefined,
      requestId: this.requestId,
    };
    
    if (!shouldLog(level)) return;
    
    const formatted = formatLog(entry);
    
    switch (level) {
      case 'debug':
        console.debug(formatted);
        break;
      case 'info':
        console.info(formatted);
        break;
      case 'warn':
        console.warn(formatted);
        break;
      case 'error':
        console.error(formatted);
        break;
    }
  }

  debug(message: string, context?: LogContext): void {
    this.logWithContext('debug', message, context);
  }

  info(message: string, context?: LogContext): void {
    this.logWithContext('info', message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.logWithContext('warn', message, context);
  }

  error(message: string, context?: LogContext): void {
    this.logWithContext('error', message, context);
  }

  /**
   * 计时器 - 用于性能追踪
   */
  time(label: string): () => void {
    const start = performance.now();
    return () => {
      const duration = Math.round(performance.now() - start);
      this.info(`${label} completed`, { duration });
    };
  }

  /**
   * 异步操作计时
   */
  async timeAsync<T>(label: string, fn: () => Promise<T>): Promise<T> {
    const start = performance.now();
    try {
      const result = await fn();
      const duration = Math.round(performance.now() - start);
      this.info(`${label} completed`, { duration });
      return result;
    } catch (error) {
      const duration = Math.round(performance.now() - start);
      this.error(`${label} failed`, { 
        duration, 
        error: error instanceof Error ? error.message : String(error) 
      });
      throw error;
    }
  }
}

/**
 * 全局 Logger 实例
 */
export const logger = new Logger();

/**
 * 创建模块级 Logger
 */
export function createLogger(module: string): Logger {
  return new Logger({ module });
}

/**
 * 快捷日志函数
 */
export const debug = (message: string, context?: LogContext) => log('debug', message, context);
export const info = (message: string, context?: LogContext) => log('info', message, context);
export const warn = (message: string, context?: LogContext) => log('warn', message, context);
export const error = (message: string, context?: LogContext) => log('error', message, context);
