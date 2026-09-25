/**
 * 配置管理服务
 *
 * 安全说明：
 * - 生产环境应始终使用代理模式 (proxyUrl)，避免在前端暴露 API Key
 * - VITE_GEMINI_API_KEY 仅用于本地开发，生产构建时不应设置此变量
 * - 代理服务器应验证请求来源并实施速率限制
 */

import type { AIConfig } from '@/types/ai';
import { normalizeGeminiModel } from '@/config/model-registry';
import { createLogger } from '@/utils/logger';

const log = createLogger('ConfigManager');

/**
 * 从环境变量获取 API Key
 * 警告：此 API Key 会被打包到前端代码中，仅用于开发环境
 */
const getEnvApiKey = (): string => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || '';

  // 生产环境警告
  if (apiKey && import.meta.env.PROD) {
    log.warn(
      '[ConfigManager] 安全警告: 检测到生产环境中使用环境变量 API Key。' +
        '请改用代理模式 (proxyUrl) 以保护您的 API 密钥。'
    );
  }

  return apiKey;
};

/**
 * 从环境变量获取代理 URL
 * 默认使用生产环境 URL（不带 www，避免重定向导致 Authorization 头丢失）
 */
const getEnvProxyUrl = (): string => {
  return (
    import.meta.env.VITE_GEMINI_PROXY_URL ||
    'https://webtomind.com/api/ai/gemini'
  );
};

/**
 * 检查是否配置了安全的代理模式
 */
const isProxyModeConfigured = (): boolean => {
  return !!getEnvProxyUrl();
};

/**
 * 默认配置
 * 优先使用代理模式，仅在开发环境允许直接使用 API Key
 */
const DEFAULT_CONFIG: AIConfig = {
  provider: 'gemini',
  gemini: {
    // 如果配置了代理，不使用环境变量中的 API Key（更安全）
    apiKey: isProxyModeConfigured() ? '' : getEnvApiKey(),
    proxyUrl: getEnvProxyUrl(),
    model: 'gemini-3.1-flash-lite-preview',
    maxOutputTokens: 8192,
    temperature: 0.7
  },
  fallback: false,
  cache: true,
  cacheTTL: 7 * 24 * 60 * 60 // 7天
};

/**
 * 配置管理类
 */
export class ConfigManager {
  private static readonly STORAGE_KEY = 'ai-mind-mapper-config';
  private static readonly CACHE_TTL = 5 * 60 * 1000; // 5分钟缓存

  // 配置缓存
  private static configCache: AIConfig | null = null;
  private static cacheTimestamp = 0;

  /**
   * 获取配置（带缓存）
   */
  static async getConfig(): Promise<AIConfig> {
    // 检查缓存是否有效
    if (this.configCache && Date.now() - this.cacheTimestamp < this.CACHE_TTL) {
      return this.configCache;
    }
    try {
      // 只有在扩展环境下才尝试访问 chrome.storage
      if (
        typeof chrome !== 'undefined' &&
        chrome.storage &&
        chrome.storage.sync
      ) {
        const result = await chrome.storage.sync.get(this.STORAGE_KEY);
        const savedConfig = result[this.STORAGE_KEY];

        // 环境变量中的 API Key 和代理 URL（构建时注入）
        const envApiKey = getEnvApiKey();
        const envProxyUrl = getEnvProxyUrl();

        if (savedConfig) {
          // 合并保存的配置和默认配置
          const config = {
            ...DEFAULT_CONFIG,
            ...savedConfig,
            gemini: {
              ...DEFAULT_CONFIG.gemini,
              ...savedConfig.gemini
            }
          };

          // 如果用户没有保存 API Key，但环境变量中有，则使用环境变量
          if (!config.gemini?.apiKey && envApiKey) {
            config.gemini = {
              ...config.gemini!,
              apiKey: envApiKey
            };
          }

          // 如果用户没有保存 proxyUrl，但环境变量中有，则使用环境变量
          if (!config.gemini?.proxyUrl && envProxyUrl) {
            config.gemini = {
              ...config.gemini!,
              proxyUrl: envProxyUrl
            };
          }

          // 模型迁移：统一归一化到当前支持模型
          if (config.gemini?.model) {
            config.gemini = {
              ...config.gemini,
              model: normalizeGeminiModel(config.gemini.model)
            };
          }

          // 更新缓存
          this.configCache = config;
          this.cacheTimestamp = Date.now();
          return config;
        }
      }

      // 更新缓存
      this.configCache = DEFAULT_CONFIG;
      this.cacheTimestamp = Date.now();
      return DEFAULT_CONFIG;
    } catch (error) {
      log.error('[ConfigManager] 获取配置失败:', error);
      return DEFAULT_CONFIG;
    }
  }

  /**
   * 使缓存失效
   */
  static invalidateCache(): void {
    this.configCache = null;
    this.cacheTimestamp = 0;
  }

  /**
   * 保存配置
   */
  static async saveConfig(config: Partial<AIConfig>): Promise<void> {
    try {
      const currentConfig = await this.getConfig();
      const newConfig = {
        ...currentConfig,
        ...config,
        gemini: {
          ...currentConfig.gemini,
          ...config.gemini
        }
      };

      if (
        typeof chrome !== 'undefined' &&
        chrome.storage &&
        chrome.storage.sync
      ) {
        await chrome.storage.sync.set({
          [this.STORAGE_KEY]: newConfig
        });
        // 保存后使缓存失效
        this.invalidateCache();
      }
    } catch (error) {
      log.error('[ConfigManager] 保存配置失败:', error);
      throw error;
    }
  }

  /**
   * 更新 Gemini API Key
   */
  static async setGeminiApiKey(apiKey: string): Promise<void> {
    await this.saveConfig({
      gemini: { apiKey }
    });
  }

  /**
   * 验证配置是否完整
   */
  static async validateConfig(): Promise<{
    valid: boolean;
    errors: string[];
  }> {
    const config = await this.getConfig();
    const errors: string[] = [];

    if (config.provider === 'gemini') {
      // 如果没有 API Key 也没有 proxyUrl，则配置无效
      if (!config.gemini?.apiKey && !config.gemini?.proxyUrl) {
        errors.push('未配置 Gemini API Key 或代理 URL');
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * 重置配置
   */
  static async resetConfig(): Promise<void> {
    if (
      typeof chrome !== 'undefined' &&
      chrome.storage &&
      chrome.storage.sync
    ) {
      await chrome.storage.sync.remove(this.STORAGE_KEY);
    }
  }
}
