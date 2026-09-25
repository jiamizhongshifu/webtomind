/**
 * Enhanced Skill Manager
 * 扩展 SkillManager 以支持数据库用户技能
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { SkillManager } from './skill-manager.js';
import type {
  AgentSkillDefinition,
  SkillMatchResult,
  SkillManagerConfig,
  SkillOutputType
} from './types.js';

/**
 * 数据库中的 Skill 数据
 */
interface DBSkillData {
  id: string;
  name: string;
  display_name: string | null;
  description: string | null;
  icon: string | null;
  triggers: string[];
  core_instructions: string;
  output_type: string | null;
  associated_tools: string[];
  default_options: Record<string, unknown>;
  category: string | null;
  priority: number | null;
  is_active: boolean;
}

/**
 * 用户 Skill 数据（转换后）
 */
export interface UserSkillData {
  id: string;
  source?: 'user' | 'system' | 'market';
  name: string;
  displayName: string;
  description: string | null;
  icon: string;
  triggers: string[];
  coreInstructions: string;
  outputType: string | null;
  associatedTools: string[];
  defaultOptions: Record<string, unknown>;
  category: string;
  priority: number;
  isActive: boolean;
}

/**
 * Enhanced Skill Manager 配置
 */
export interface EnhancedSkillManagerConfig extends SkillManagerConfig {
  /** Supabase URL */
  supabaseUrl?: string;
  /** Supabase Key */
  supabaseKey?: string;
}

/**
 * 扩展的技能管理器
 * 支持从数据库加载用户自定义技能
 */
export class EnhancedSkillManager extends SkillManager {
  private supabase: SupabaseClient | null = null;
  private userSkills: Map<string, UserSkillData> = new Map();
  private userSkillsLoaded: boolean = false;
  private enhancedConfig: EnhancedSkillManagerConfig;

  constructor(config: EnhancedSkillManagerConfig = {}) {
    super(config);
    this.enhancedConfig = {
      supabaseUrl: config.supabaseUrl || process.env.SUPABASE_URL,
      supabaseKey: config.supabaseKey || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY,
      ...config,
    };
  }

  /**
   * 获取 Supabase 客户端
   */
  private getSupabase(): SupabaseClient | null {
    if (!this.supabase && this.enhancedConfig.supabaseUrl && this.enhancedConfig.supabaseKey) {
      this.supabase = createClient(
        this.enhancedConfig.supabaseUrl,
        this.enhancedConfig.supabaseKey
      );
    }
    return this.supabase;
  }

  /**
   * 从数据库加载用户技能
   * @param userId - 用户 ID
   */
  async loadUserSkills(userId: string): Promise<void> {
    const supabase = this.getSupabase();
    if (!supabase) {
      console.warn('[EnhancedSkillManager] Supabase not configured, skipping user skills');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('skills')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('priority', { ascending: false });

      if (error) {
        console.error('[EnhancedSkillManager] Failed to load user skills:', error);
        return;
      }

      // 清空现有用户技能
      this.userSkills.clear();

      // 转换并存储用户技能
      for (const skill of (data || []) as DBSkillData[]) {
        const userSkill: UserSkillData = {
          id: skill.id,
          source: 'user',
          name: skill.name,
          displayName: skill.display_name || skill.name,
          description: skill.description,
          icon: skill.icon || '🔧',
          triggers: skill.triggers || [],
          coreInstructions: skill.core_instructions,
          outputType: skill.output_type,
          associatedTools: skill.associated_tools || [],
          defaultOptions: skill.default_options || {},
          category: skill.category || 'custom',
          priority: skill.priority || 50,
          isActive: skill.is_active,
        };

        this.userSkills.set(skill.id, userSkill);

        // 将用户技能转换为 AgentSkillDefinition 并注册
        const skillDefinition: AgentSkillDefinition = {
          metadata: {
            name: `user_${skill.id}`,
            description: skill.description || skill.display_name || skill.name,
            displayName: skill.display_name || skill.name,
            icon: skill.icon || '🔧',
            triggers: skill.triggers || [],
            category: (skill.category as AgentSkillDefinition['metadata']['category']) || 'utility',
            priority: skill.priority || 50,
            source: 'user',
            status: skill.is_active ? 'active' : 'disabled',
            runtime: { mode: 'sync', planner: 'direct', timeoutMs: 120000, maxSteps: 8 },
            capabilities: {
              allowedTools: skill.associated_tools || [],
              artifactTypes: skill.output_type ? [skill.output_type] : ['text']
            },
            permissions: {
              confirmationMode:
                (skill.associated_tools || []).length > 0 ? 'on_side_effect' : 'never',
              sideEffects: (skill.associated_tools || []).includes('save_note') ? ['write_db'] : []
            },
            output: {
              primaryType: (skill.output_type as SkillOutputType | null) || 'text'
            }
          },
          coreInstructions: skill.core_instructions,
          associatedTools: skill.associated_tools || [],
        };

        this.registerSkill(skillDefinition);
      }

      this.userSkillsLoaded = true;
      console.log('[EnhancedSkillManager] Loaded', this.userSkills.size, 'user skills');
    } catch (error) {
      console.error('[EnhancedSkillManager] Error loading user skills:', error);
    }
  }

  /**
   * 根据 skill 名称查找已注册技能定义
   */
  private findRegisteredSkillByName(skillName: string): AgentSkillDefinition | undefined {
    return this.getAllSkills().find((skill) => skill.metadata.name === skillName);
  }

  /**
   * 将已注册技能定义转换为统一 skill 数据结构
   */
  private mapRegisteredSkillToUnifiedData(
    skill: AgentSkillDefinition
  ): UserSkillData {
    return {
      id: skill.metadata.name,
      source: skill.metadata.source || 'system',
      name: skill.metadata.name,
      displayName: skill.metadata.displayName || skill.metadata.name,
      description: skill.metadata.description || null,
      icon: skill.metadata.icon || '🔧',
      triggers: skill.metadata.triggers || [],
      coreInstructions: skill.coreInstructions,
      outputType: skill.metadata.output?.primaryType || null,
      associatedTools:
        skill.associatedTools || skill.metadata.capabilities?.allowedTools || [],
      defaultOptions: {},
      category: skill.metadata.category || 'utility',
      priority: skill.metadata.priority || 50,
      isActive: skill.metadata.status !== 'disabled'
    };
  }

  /**
   * 获取统一技能列表
   */
  listSkills(): UserSkillData[] {
    const unifiedSkills = new Map<string, UserSkillData>();

    for (const skill of this.getAllSkills()) {
      const mapped = this.mapRegisteredSkillToUnifiedData(skill);
      unifiedSkills.set(mapped.id, mapped);
    }

    for (const skill of this.userSkills.values()) {
      unifiedSkills.set(skill.id, skill);
    }

    return Array.from(unifiedSkills.values());
  }

  /**
   * 获取激活技能列表
   */
  listActiveSkills(): UserSkillData[] {
    return this.listSkills().filter((skill) => skill.isActive);
  }

  /**
   * 根据 ID 获取统一技能
   */
  getSkillById(id: string): UserSkillData | undefined {
    const userSkill = this.userSkills.get(id);
    if (userSkill) return userSkill;

    const registeredSkill = this.findRegisteredSkillByName(id);
    if (registeredSkill) {
      return this.mapRegisteredSkillToUnifiedData(registeredSkill);
    }

    return undefined;
  }

  /**
   * 获取匹配的统一技能数据
   */
  matchSkillsData(userInput: string): UserSkillData[] {
    return this.matchSkills(userInput)
      .map((match) => {
        const registeredName = match.skill.metadata.name;
        const userSkill = Array.from(this.userSkills.values()).find(
          (skill) => skill.name === registeredName || `user_${skill.id}` === registeredName
        );
        if (userSkill) {
          return userSkill;
        }
        return this.mapRegisteredSkillToUnifiedData(match.skill);
      })
      .filter((skill): skill is UserSkillData => Boolean(skill))
      .slice(0, 3);
  }

  /**
   * 获取用户技能列表
   */
  getUserSkills(): UserSkillData[] {
    return Array.from(this.userSkills.values());
  }

  /**
   * 根据 ID 获取用户技能
   */
  getUserSkillById(id: string): UserSkillData | undefined {
    return this.getSkillById(id);
  }

  /**
   * 合并内置技能和用户技能进行匹配
   * @param userInput - 用户输入
   * @returns 匹配结果（包含内置和用户技能）
   */
  matchSkillsWithUserSkills(userInput: string): SkillMatchResult[] {
    // 使用父类的匹配方法（已包含注册的用户技能）
    return this.matchSkills(userInput);
  }

  /**
   * 获取匹配的用户技能数据
   * @param userInput - 用户输入
   * @returns 匹配的用户技能数据列表
   */
  matchUserSkillsData(userInput: string): UserSkillData[] {
    return this.matchSkillsData(userInput);
  }

  /**
   * 检查用户技能是否已加载
   */
  isUserSkillsLoaded(): boolean {
    return this.userSkillsLoaded;
  }

  /**
   * 重置用户技能
   */
  resetUserSkills(): void {
    // 从注册的技能中移除用户技能
    for (const skill of this.userSkills.values()) {
      this.unregisterSkill(`user_${skill.id}`);
    }
    this.userSkills.clear();
    this.userSkillsLoaded = false;
  }
}

/**
 * 创建增强型技能管理器实例
 */
export function createEnhancedSkillManager(
  config?: EnhancedSkillManagerConfig
): EnhancedSkillManager {
  return new EnhancedSkillManager(config);
}
