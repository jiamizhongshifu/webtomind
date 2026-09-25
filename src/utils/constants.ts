/**
 * 全局常量配置
 * 集中管理 URL、配置项等常量，避免硬编�?
 */

// ==================== 环境配置 ====================

/**
 * 获取基础 URL
 * 优先使用环境变量，否则使用默认�?
 * 重要：必须使�?webtomind.com（不�?www），因为 Vercel 会将 www 重定向到�?www�?
 * 重定向时浏览器会剥离 Authorization 头，导致 API 认证失败
 */
const getBaseUrl = (): string => {
  return import.meta.env.VITE_APP_BASE_URL || 'https://webtomind.com';
};

// ==================== URL 常量 ====================

/**
 * 应用 URL 配置
 */
export const APP_URLS = {
  /** 基础 URL */
  BASE: getBaseUrl(),

  /** 登录页面 */
  LOGIN: `${getBaseUrl()}/login?from=extension`,

  /** 工作台页�?*/
  WORKSPACE: `${getBaseUrl()}/boards`,

  /** API 基础 URL */
  API: getBaseUrl(),

  /**
   * 获取总结详情�?URL
   * @param summaryId 总结 ID
   * @param projectId 项目 ID（可选）
   * @param isNew 是否是新创建�?
   */
  getSummaryDetail: (
    summaryId: string,
    projectId: string | null = null,
    isNew = false
  ): string => {
    const base = projectId
      ? `${getBaseUrl()}/boards/${projectId}`
      : `${getBaseUrl()}/boards`;
    const params = new URLSearchParams({ 'summary-id': summaryId });
    if (isNew) {
      params.set('new', 'true');
    }
    return `${base}?${params.toString()}`;
  }
} as const;

/**
 * URL 匹配模式（用�?Chrome API�?
 */
export const URL_PATTERNS = {
  /** 工作台域名模�?*/
  WORKSPACE: 'webtomind.com',

  /** Chrome tabs.query 匹配模式 */
  WORKSPACE_MATCH: [
    '*://webtomind.com/*',
    '*://*.webtomind.com/*',
    'http://localhost:3000/*',
    'http://localhost:5173/*'
  ] as string[],

  /** 允许的域名列�?*/
  ALLOWED_ORIGINS: [
    'https://webtomind.com',
    'https://www.webtomind.com',
    'http://localhost:3000',
    'http://localhost:5173'
  ] as string[]
} as const;

const GRAY_PREVIEW_ORIGIN_REGEX =
  /^https:\/\/zongjie-[a-z0-9-]+\.vercel\.app$/i;

export function isAllowedWebOrigin(origin: string): boolean {
  if (!origin) return false;

  const normalizedOrigin = origin.replace(/\/+$/, '');
  const allowedOrigins = URL_PATTERNS.ALLOWED_ORIGINS as readonly string[];

  if (allowedOrigins.includes(normalizedOrigin)) {
    return true;
  }

  if (GRAY_PREVIEW_ORIGIN_REGEX.test(normalizedOrigin)) {
    return true;
  }

  return false;
}

// ==================== 存储 Key 常量 ====================

/**
 * Chrome Storage Key
 */
export const STORAGE_KEYS = {
  /** AI 配置 */
  AI_CONFIG: 'ai-mind-mapper-config',

  /** 认证信息 */
  AUTH: 'webtomind-auth',

  /** 用户信息 */
  USER: 'webtomind-user'
} as const;

// ==================== 其他常量 ====================

/**
 * Supabase 配置
 * 优先从服务器获取，本地环境变量作为开发时的备�?
 */
export const SUPABASE_CONFIG = {
  URL: import.meta.env.VITE_SUPABASE_URL || '',
  ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY || ''
} as const;

// 用于缓存从服务器获取的配�?
let cachedSupabaseConfig: { url: string; anonKey: string } | null = null;
let configFetchPromise: Promise<{
  url: string;
  anonKey: string;
} | null> | null = null;

/**
 * 从服务器获取 Supabase 配置
 * 带有缓存和并发请求去�?
 */
export async function getSupabaseConfig(): Promise<{
  url: string;
  anonKey: string;
} | null> {
  // 如果已有缓存，直接返�?
  if (cachedSupabaseConfig) {
    return cachedSupabaseConfig;
  }

  // 如果本地环境变量已配置，使用本地配置
  if (SUPABASE_CONFIG.URL && SUPABASE_CONFIG.ANON_KEY) {
    cachedSupabaseConfig = {
      url: SUPABASE_CONFIG.URL,
      anonKey: SUPABASE_CONFIG.ANON_KEY
    };
    return cachedSupabaseConfig;
  }

  // 如果已有进行中的请求，等待它完成
  if (configFetchPromise) {
    return configFetchPromise;
  }

  // 从服务器获取配置
  configFetchPromise = (async () => {
    try {
      const response = await fetch(`${APP_URLS.API}/api/config`, {
        method: 'GET',
        headers: {
          Accept: 'application/json'
        }
      });

      if (!response.ok) {
        console.warn(
          '[Config] Failed to fetch config from server:',
          response.status
        );
        return null;
      }

      const data = await response.json();
      if (data.supabase?.url && data.supabase?.anonKey) {
        cachedSupabaseConfig = {
          url: data.supabase.url,
          anonKey: data.supabase.anonKey
        };
        console.info('[Config] Supabase config loaded from server');
        return cachedSupabaseConfig;
      }

      return null;
    } catch (error) {
      console.warn('[Config] Error fetching config:', error);
      return null;
    } finally {
      configFetchPromise = null;
    }
  })();

  return configFetchPromise;
}

/**
 * 缓存配置
 */
export const CACHE_CONFIG = {
  /** 默认缓存 TTL (7天，单位：秒) */
  DEFAULT_TTL: 7 * 24 * 60 * 60,

  /** 工作台缓�?TTL (5分钟，单位：毫秒) */
  WORKSPACE_TTL: 5 * 60 * 1000
} as const;

/**
 * 限流配置
 */
export const RATE_LIMIT_CONFIG = {
  /** 每分钟最大请求数 */
  MAX_REQUESTS_PER_MINUTE: 50,

  /** 请求间隔 (毫秒) */
  MIN_INTERVAL: 1000
} as const;

