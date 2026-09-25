/**
 * Skill Options Injector
 * 从数据库获取 Skill 配置并注入到工具参数中
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * 工具到 Skill 的映射关系
 * 定义哪些工具需要从哪些 Skill 获取配置
 */
const TOOL_SKILL_MAPPING: Record<string, string[]> = {
  wechat_publish: ['wechat_publisher'],
  generate_image: ['cosmic_engraving'],
};

/**
 * 缓存的 Skill 配置
 */
interface SkillOptionsCache {
  options: Record<string, unknown>;
  loadedAt: number;
}

// 缓存 TTL: 5 分钟
const CACHE_TTL = 5 * 60 * 1000;

// 用户 Skill 配置缓存
const skillOptionsCache = new Map<string, SkillOptionsCache>();

// Supabase 客户端
let supabase: SupabaseClient | null = null;

/**
 * 获取 Supabase 客户端
 */
function getSupabase(): SupabaseClient | null {
  if (!supabase) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    if (url && key) {
      supabase = createClient(url, key);
    }
  }
  return supabase;
}

/**
 * 生成缓存 key
 */
function getCacheKey(userId: string, skillName: string): string {
  return `${userId}:${skillName}`;
}

/**
 * 从数据库获取 Skill 的 default_options
 */
async function getSkillOptions(
  userId: string,
  skillName: string
): Promise<Record<string, unknown> | null> {
  const cacheKey = getCacheKey(userId, skillName);
  const cached = skillOptionsCache.get(cacheKey);

  // 检查缓存是否有效
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL) {
    return cached.options;
  }

  const db = getSupabase();
  if (!db) {
    console.warn('[SkillOptionsInjector] Supabase not configured');
    return null;
  }

  try {
    const { data, error } = await db
      .from('skills')
      .select('default_options')
      .eq('user_id', userId)
      .eq('name', skillName)
      .eq('is_active', true)
      .single();

    if (error) {
      // 如果是没找到记录，不算错误
      if (error.code !== 'PGRST116') {
        console.error(`[SkillOptionsInjector] Failed to get options for ${skillName}:`, error);
      }
      return null;
    }

    const options = (data?.default_options as Record<string, unknown>) || {};

    // 更新缓存
    skillOptionsCache.set(cacheKey, {
      options,
      loadedAt: Date.now(),
    });

    return options;
  } catch (error) {
    console.error(`[SkillOptionsInjector] Error getting options for ${skillName}:`, error);
    return null;
  }
}

/**
 * 为工具调用注入 Skill 配置
 * @param toolName - 工具名称
 * @param params - 原始工具参数
 * @param userId - 用户 ID
 * @returns 注入配置后的参数
 */
export async function injectSkillOptions(
  toolName: string,
  params: Record<string, unknown>,
  userId?: string
): Promise<Record<string, unknown>> {
  // 如果没有 userId，直接返回原参数
  if (!userId) {
    return params;
  }

  // 检查该工具是否有关联的 Skill
  const relatedSkills = TOOL_SKILL_MAPPING[toolName];
  if (!relatedSkills || relatedSkills.length === 0) {
    return params;
  }

  // 从关联的 Skill 中获取配置
  const injectedParams = { ...params };

  for (const skillName of relatedSkills) {
    const options = await getSkillOptions(userId, skillName);
    if (options) {
      // 将 Skill 配置合并到参数中（不覆盖已有参数）
      for (const [key, value] of Object.entries(options)) {
        // 只注入非空值，且不覆盖已有值
        if (value !== undefined && value !== null && value !== '' && !(key in injectedParams)) {
          injectedParams[key] = value;
          console.log(`[SkillOptionsInjector] Injected ${key} from skill ${skillName}`);
        }
      }
    }
  }

  return injectedParams;
}

/**
 * 清除用户的 Skill 配置缓存
 */
export function clearSkillOptionsCache(userId?: string): void {
  if (userId) {
    // 清除特定用户的缓存
    for (const key of skillOptionsCache.keys()) {
      if (key.startsWith(`${userId}:`)) {
        skillOptionsCache.delete(key);
      }
    }
  } else {
    // 清除所有缓存
    skillOptionsCache.clear();
  }
}

/**
 * 获取工具关联的 Skill 名称
 */
export function getRelatedSkills(toolName: string): string[] {
  return TOOL_SKILL_MAPPING[toolName] || [];
}
