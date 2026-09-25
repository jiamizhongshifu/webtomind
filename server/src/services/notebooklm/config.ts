/**
 * NotebookLM Online Configuration Manager
 * 
 * Configuration Priority:
 * 1. Environment variables (Vercel/Production) - HIGHEST
 * 2. Supabase app_config table
 * 3. Default values - LOWEST
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

interface NotebookLMConfig {
  host: string;
  port: number;
  debug: boolean;
  allowed_origins: string[];
  encryption_key: string;
  notebook_prefix: string;
  notebook_cleanup_hours: number;
  max_concurrent_per_account: number;
  cooldown_seconds: number;
  cookie_storage_path: string;
  cookie_refresh_hours: number;
  max_retries: number;
  retry_delay_seconds: number;
  worker_url: string;
  config_source: string;
}

interface ConfigCacheEntry {
  config: NotebookLMConfig;
  fetchedAt: number;
}

const DEFAULT_CONFIG: NotebookLMConfig = {
  host: '0.0.0.0',
  port: 8000,
  debug: false,
  allowed_origins: ['http://localhost:3000', 'http://localhost:5173'],
  encryption_key: '',
  notebook_prefix: 'webtomind_temp_',
  notebook_cleanup_hours: 24,
  max_concurrent_per_account: 2,
  cooldown_seconds: 300,
  cookie_storage_path: './data/cookies',
  cookie_refresh_hours: 24,
  max_retries: 3,
  retry_delay_seconds: 5,
  worker_url: 'http://localhost:8000',
  config_source: 'default',
};

// Environment variable mappings (NLM_* prefix)
const ENV_MAPPINGS: Record<string, { key: keyof NotebookLMConfig; parser: (v: string) => unknown }> = {
  NLM_HOST: { key: 'host', parser: (v) => v },
  NLM_PORT: { key: 'port', parser: (v) => parseInt(v, 10) },
  NLM_DEBUG: { key: 'debug', parser: (v) => v.toLowerCase() === 'true' },
  NLM_ALLOWED_ORIGINS: { key: 'allowed_origins', parser: (v) => JSON.parse(v) },
  NLM_ENCRYPTION_KEY: { key: 'encryption_key', parser: (v) => v },
  NLM_NOTEBOOK_PREFIX: { key: 'notebook_prefix', parser: (v) => v },
  NLM_NOTEBOOK_CLEANUP_HOURS: { key: 'notebook_cleanup_hours', parser: (v) => parseInt(v, 10) },
  NLM_MAX_CONCURRENT_PER_ACCOUNT: { key: 'max_concurrent_per_account', parser: (v) => parseInt(v, 10) },
  NLM_COOLDOWN_SECONDS: { key: 'cooldown_seconds', parser: (v) => parseInt(v, 10) },
  NLM_COOKIE_STORAGE_PATH: { key: 'cookie_storage_path', parser: (v) => v },
  NLM_COOKIE_REFRESH_HOURS: { key: 'cookie_refresh_hours', parser: (v) => parseInt(v, 10) },
  NLM_MAX_RETRIES: { key: 'max_retries', parser: (v) => parseInt(v, 10) },
  NLM_RETRY_DELAY_SECONDS: { key: 'retry_delay_seconds', parser: (v) => parseInt(v, 10) },
  NLM_WORKER_URL: { key: 'worker_url', parser: (v) => v },
};

class ConfigManager {
  private supabase: SupabaseClient | null = null;
  private cache: ConfigCacheEntry | null = null;
  private cacheTTL = 300000; // 5 minutes in ms

  constructor() {
    this.initSupabase();
  }

  private initSupabase(): void {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

    if (supabaseUrl && supabaseKey) {
      this.supabase = createClient(supabaseUrl, supabaseKey);
      console.log('[Config] Supabase client initialized');
    }
  }

  /**
   * Get configuration from environment variables (NLM_* prefix)
   */
  private getEnvConfig(): Partial<NotebookLMConfig> {
    const config: Partial<NotebookLMConfig> = {};

    for (const [envKey, { key, parser }] of Object.entries(ENV_MAPPINGS)) {
      const value = process.env[envKey];
      if (value !== undefined) {
        try {
          (config as Record<string, unknown>)[key] = parser(value);
        } catch (error) {
          console.warn(`[Config] Failed to parse ${envKey}:`, error);
        }
      }
    }

    return config;
  }

  /**
   * Fetch configuration from Supabase
   */
  async fetchFromSupabase(): Promise<Partial<NotebookLMConfig>> {
    if (!this.supabase) {
      throw new Error('Supabase not configured');
    }

    const { data, error } = await this.supabase
      .from('app_config')
      .select('key, value')
      .eq('category', 'notebooklm');

    if (error) {
      throw error;
    }

    const config: Record<string, unknown> = {};
    for (const row of data || []) {
      config[row.key] = typeof row.value === 'string' 
        ? JSON.parse(row.value) 
        : row.value;
    }

    return config as Partial<NotebookLMConfig>;
  }

  /**
   * Get configuration with priority:
   * 1. Environment variables (highest)
   * 2. Supabase
   * 3. Defaults (lowest)
   */
  async getConfig(forceRefresh = false): Promise<NotebookLMConfig> {
    // Check cache
    if (!forceRefresh && this.cache) {
      if (Date.now() - this.cache.fetchedAt < this.cacheTTL) {
        return this.cache.config;
      }
    }

    let config = { ...DEFAULT_CONFIG };
    let source = 'default';

    // Layer 1: Supabase (medium priority)
    if (this.supabase) {
      try {
        const onlineConfig = await this.fetchFromSupabase();
        if (Object.keys(onlineConfig).length > 0) {
          config = { ...config, ...onlineConfig };
          source = 'supabase';
          console.log('[Config] Loaded from Supabase');
        }
      } catch (error) {
        console.warn('[Config] Failed to fetch from Supabase:', error);
      }
    }

    // Layer 2: Environment variables (highest priority, always override)
    const envConfig = this.getEnvConfig();
    if (Object.keys(envConfig).length > 0) {
      config = { ...config, ...envConfig };
      source = Object.keys(envConfig).length > 2 ? 'environment' : source;
      console.log('[Config] Applied env overrides:', Object.keys(envConfig));
    }

    config.config_source = source;

    // Update cache
    this.cache = {
      config,
      fetchedAt: Date.now(),
    };

    return config;
  }

  /**
   * Get configuration synchronously (uses cache or defaults)
   */
  getConfigSync(): NotebookLMConfig {
    if (this.cache) {
      return this.cache.config;
    }
    return DEFAULT_CONFIG;
  }

  /**
   * Update a configuration value
   */
  async updateConfig(key: keyof NotebookLMConfig, value: unknown): Promise<boolean> {
    if (!this.supabase) {
      console.warn('[Config] Cannot update: Supabase not configured');
      return false;
    }

    try {
      const { error } = await this.supabase
        .from('app_config')
        .upsert({
          category: 'notebooklm',
          key,
          value: JSON.stringify(value),
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'category,key',
        });

      if (error) {
        throw error;
      }

      // Invalidate cache
      this.cache = null;

      console.log(`[Config] Updated ${key}`);
      return true;
    } catch (error) {
      console.error(`[Config] Failed to update ${key}:`, error);
      return false;
    }
  }

  /**
   * Get worker URL
   */
  async getWorkerUrl(): Promise<string> {
    const config = await this.getConfig();
    return config.worker_url;
  }

  /**
   * Invalidate cache
   */
  invalidateCache(): void {
    this.cache = null;
  }
}

// Singleton instance
let configManagerInstance: ConfigManager | null = null;

export function getConfigManager(): ConfigManager {
  if (!configManagerInstance) {
    configManagerInstance = new ConfigManager();
  }
  return configManagerInstance;
}

export async function getNotebookLMConfig(): Promise<NotebookLMConfig> {
  return getConfigManager().getConfig();
}

export function getNotebookLMConfigSync(): NotebookLMConfig {
  return getConfigManager().getConfigSync();
}

export type { NotebookLMConfig };
