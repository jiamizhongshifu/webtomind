/**
 * 统一日志服务
 * 提供日志级别控制，减少生产环境的控制台输出
 */

/**
 * 日志级别枚举
 * 数值越小，级别越高
 */
export enum LogLevel {
  /** 静默模式，不输出任何日志 */
  SILENT = 0,
  /** 仅错误 */
  ERROR = 1,
  /** 错误和警告 */
  WARN = 2,
  /** 错误、警告和信息 */
  INFO = 3,
  /** 所有日志（包括调试） */
  DEBUG = 4
}

/**
 * 日志级别名称映射
 */
const LOG_LEVEL_NAMES: Record<LogLevel, string> = {
  [LogLevel.SILENT]: 'SILENT',
  [LogLevel.ERROR]: 'ERROR',
  [LogLevel.WARN]: 'WARN',
  [LogLevel.INFO]: 'INFO',
  [LogLevel.DEBUG]: 'DEBUG'
};

/**
 * 获取当前日志级别
 * 优先级：环境变量 > 开发/生产默认值
 */
function getCurrentLogLevel(): LogLevel {
  const env = import.meta.env as Record<string, unknown>;

  // 从环境变量获取
  const envLevel = env.VITE_LOG_LEVEL;
  if (envLevel) {
    const level = parseInt(String(envLevel), 10);
    if (!isNaN(level) && level >= LogLevel.SILENT && level <= LogLevel.DEBUG) {
      return level;
    }
    // 尝试按名称匹配
    const upperLevel = String(envLevel).toUpperCase();
    for (const [key, name] of Object.entries(LOG_LEVEL_NAMES)) {
      if (name === upperLevel) {
        return parseInt(key, 10) as LogLevel;
      }
    }
  }

  const mode = String(env.MODE || '');
  const isProd = env.PROD === true || mode === 'production';
  if (isProd) {
    return LogLevel.WARN;
  }

  const isTest = env.VITEST === true || mode === 'test';
  if (isTest) {
    return LogLevel.WARN;
  }

  return LogLevel.DEBUG;
}

// 当前日志级别（可在运行时修改）
let currentLevel = getCurrentLogLevel();

/**
 * 日志颜色配置
 */
const LOG_COLORS = {
  debug: 'color: #9CA3AF', // 灰色
  info: 'color: #3B82F6', // 蓝色
  warn: 'color: #F59E0B', // 橙色
  error: 'color: #EF4444', // 红色
  tag: 'color: #8B5CF6' // 紫色（用于标签）
};

/**
 * 格式化日志消息
 */
function formatMessage(tag: string, level: string): string {
  const timestamp = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  return `[${timestamp}] [${tag}] [${level}]`;
}

/**
 * 创建带标签的日志器
 * @param tag 日志标签（如模块名）
 */
export function createLogger(tag: string) {
  return {
    /**
     * 调试日志（仅开发环境显示）
     */
    debug: (...args: unknown[]) => {
      if (currentLevel >= LogLevel.DEBUG) {
        console.log(
          `%c${formatMessage(tag, 'DEBUG')}`,
          LOG_COLORS.debug,
          ...args
        );
      }
    },

    /**
     * 信息日志
     */
    info: (...args: unknown[]) => {
      if (currentLevel >= LogLevel.INFO) {
        console.log(
          `%c${formatMessage(tag, 'INFO')}`,
          LOG_COLORS.info,
          ...args
        );
      }
    },

    /**
     * 警告日志
     */
    warn: (...args: unknown[]) => {
      if (currentLevel >= LogLevel.WARN) {
        console.warn(
          `%c${formatMessage(tag, 'WARN')}`,
          LOG_COLORS.warn,
          ...args
        );
      }
    },

    /**
     * 错误日志（始终显示，除非静默模式）
     */
    error: (...args: unknown[]) => {
      if (currentLevel >= LogLevel.ERROR) {
        console.error(
          `%c${formatMessage(tag, 'ERROR')}`,
          LOG_COLORS.error,
          ...args
        );
      }
    },

    /**
     * 分组日志开始
     */
    group: (label: string) => {
      if (currentLevel >= LogLevel.DEBUG) {
        console.group(`%c[${tag}] ${label}`, LOG_COLORS.tag);
      }
    },

    /**
     * 折叠分组日志开始
     */
    groupCollapsed: (label: string) => {
      if (currentLevel >= LogLevel.DEBUG) {
        console.groupCollapsed(`%c[${tag}] ${label}`, LOG_COLORS.tag);
      }
    },

    /**
     * 分组日志结束
     */
    groupEnd: () => {
      if (currentLevel >= LogLevel.DEBUG) {
        console.groupEnd();
      }
    },

    /**
     * 表格日志
     */
    table: (data: unknown) => {
      if (currentLevel >= LogLevel.DEBUG) {
        console.log(`%c[${tag}] Table:`, LOG_COLORS.tag);
        console.table(data);
      }
    },

    /**
     * 计时开始
     */
    time: (label: string) => {
      if (currentLevel >= LogLevel.DEBUG) {
        console.time(`[${tag}] ${label}`);
      }
    },

    /**
     * 计时结束
     */
    timeEnd: (label: string) => {
      if (currentLevel >= LogLevel.DEBUG) {
        console.timeEnd(`[${tag}] ${label}`);
      }
    }
  };
}

/**
 * 全局日志工具
 */
export const logger = {
  /**
   * 设置日志级别
   */
  setLevel: (level: LogLevel) => {
    currentLevel = level;
    console.log(
      `%c[Logger] Level set to: ${LOG_LEVEL_NAMES[level]}`,
      LOG_COLORS.info
    );
  },

  /**
   * 获取当前日志级别
   */
  getLevel: (): LogLevel => currentLevel,

  /**
   * 获取日志级别名称
   */
  getLevelName: (): string => LOG_LEVEL_NAMES[currentLevel],

  /**
   * 检查是否为开发模式
   */
  isDev: (): boolean => import.meta.env.DEV,

  /**
   * 创建带标签的日志器
   */
  create: createLogger
};

// 导出默认日志器
export default logger;

// ==================== 敏感信息脱敏工具 ====================

/**
 * 脱敏邮箱地址
 * 例如: test@example.com -> te***@example.com
 */
export function maskEmail(email: string): string {
  if (!email || typeof email !== 'string') return '***';
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  const maskedLocal =
    local.length > 2 ? `${local.slice(0, 2)}***` : `${local[0] || ''}***`;
  return `${maskedLocal}@${domain}`;
}

/**
 * 脱敏 Token
 * 例如: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... -> eyJhbG...J9
 */
export function maskToken(token: string): string {
  if (!token || typeof token !== 'string') return '***';
  if (token.length < 10) return '***';
  return `${token.slice(0, 6)}...${token.slice(-4)}`;
}

/**
 * 脱敏用户 ID
 * 例如: 550e8400-e29b-41d4-a716-446655440000 -> 550e84...440000
 */
export function maskUserId(userId: string): string {
  if (!userId || typeof userId !== 'string') return '***';
  if (userId.length < 12) return '***';
  return `${userId.slice(0, 6)}...${userId.slice(-6)}`;
}

/**
 * 检查是否为生产环境
 */
export function isProduction(): boolean {
  return import.meta.env.PROD;
}

/**
 * 安全日志 - 在生产环境自动脱敏敏感信息
 * @param value 原始值
 * @param maskFn 脱敏函数
 * @returns 生产环境返回脱敏值，开发环境返回原值
 */
export function safeLog<T extends string>(
  value: T,
  maskFn: (v: T) => string
): string {
  if (isProduction()) {
    return maskFn(value);
  }
  return value;
}

// 预创建常用模块的日志器
export const loggers = {
  background: createLogger('Background'),
  content: createLogger('Content'),
  popup: createLogger('Popup'),
  workspace: createLogger('Workspace'),
  auth: createLogger('Auth'),
  storage: createLogger('Storage'),
  ai: createLogger('AI'),
  database: createLogger('Database'),
  cloudStorage: createLogger('CloudStorage'),
  messageHandler: createLogger('MessageHandler')
};
