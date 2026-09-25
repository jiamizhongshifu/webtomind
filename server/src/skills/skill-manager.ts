/**
 * 技能管理器
 * 实现渐进式披露和动态技能匹配
 */

import type {
  AgentSkillDefinition,
  SkillMatchResult,
  SkillManagerConfig,
} from './types.js';
import { getSkillMap, getTriggerMap } from './built-in-skills.js';

/**
 * 技能管理器
 * 负责技能注册、匹配和渐进式加载
 */
export class SkillManager {
  private skills: Map<string, AgentSkillDefinition> = new Map();
  private triggerIndex: Map<string, AgentSkillDefinition[]> = new Map();
  private activeSkills: Set<string> = new Set();
  private config: Required<SkillManagerConfig>;

  constructor(config: SkillManagerConfig = {}) {
    this.config = {
      selectionStrategy: config.selectionStrategy || 'highest_score',
      minMatchScore: config.minMatchScore || 0.3,
      maxActiveSkills: config.maxActiveSkills || 3,
      enableProgressiveDisclosure: config.enableProgressiveDisclosure ?? true,
      defaultSkills: config.defaultSkills || ['content_understanding', 'information_search'],
    };

    // 注册内置技能
    this.registerBuiltInSkills();
  }

  // ============================================
  // 技能注册
  // ============================================

  /**
   * 注册内置技能
   */
  private registerBuiltInSkills(): void {
    this.skills = getSkillMap();
    this.triggerIndex = getTriggerMap();

    // 激活默认技能
    for (const skillName of this.config.defaultSkills) {
      if (this.skills.has(skillName)) {
        this.activeSkills.add(skillName);
      }
    }

    console.log('[SkillManager] Registered', this.skills.size, 'skills');
    console.log('[SkillManager] Default active:', Array.from(this.activeSkills));
  }

  /**
   * 注册自定义技能
   */
  registerSkill(skill: AgentSkillDefinition): void {
    this.unregisterSkill(skill.metadata.name);
    this.skills.set(skill.metadata.name, skill);

    // 更新触发词索引
    for (const trigger of skill.metadata.triggers) {
      const existing = this.triggerIndex.get(trigger) || [];
      existing.push(skill);
      this.triggerIndex.set(trigger, existing);
    }

    console.log('[SkillManager] Registered skill:', skill.metadata.name);
  }

  /**
   * 注销自定义技能
   */
  unregisterSkill(skillName: string): boolean {
    const skill = this.skills.get(skillName);
    if (!skill) {
      return false;
    }

    this.skills.delete(skillName);
    this.activeSkills.delete(skillName);

    for (const trigger of skill.metadata.triggers) {
      const existing = this.triggerIndex.get(trigger);
      if (!existing) continue;
      const filtered = existing.filter(
        (registeredSkill) => registeredSkill.metadata.name !== skillName
      );
      if (filtered.length === 0) {
        this.triggerIndex.delete(trigger);
      } else {
        this.triggerIndex.set(trigger, filtered);
      }
    }

    return true;
  }

  // ============================================
  // 技能匹配 (渐进式披露第一层)
  // ============================================

  /**
   * 根据用户输入匹配相关技能
   */
  matchSkills(userInput: string): SkillMatchResult[] {
    const results: SkillMatchResult[] = [];
    const normalizedInput = userInput.toLowerCase();

    for (const skill of this.skills.values()) {
      const matchResult = this.calculateMatchScore(normalizedInput, skill);
      if (matchResult.score >= this.config.minMatchScore) {
        results.push(matchResult);
      }
    }

    // 按得分排序
    results.sort((a, b) => b.score - a.score);

    // 根据策略选择
    return this.applySelectionStrategy(results);
  }

  /**
   * 计算技能匹配得分
   */
  private calculateMatchScore(
    input: string,
    skill: AgentSkillDefinition
  ): SkillMatchResult {
    const matchedTriggers: string[] = [];
    let score = 0;

    // 检查触发词匹配
    for (const trigger of skill.metadata.triggers) {
      if (input.includes(trigger.toLowerCase())) {
        matchedTriggers.push(trigger);
        // 精确匹配得分更高
        if (input === trigger.toLowerCase()) {
          score += 1.0;
        } else {
          score += 0.5;
        }
      }
    }

    // 归一化得分
    if (matchedTriggers.length > 0) {
      score = Math.min(score / matchedTriggers.length, 1.0);
    }

    // 优先级加成
    const priorityBonus = (skill.metadata.priority || 50) / 1000;
    score += priorityBonus;

    // 已激活的技能有额外加成
    if (this.activeSkills.has(skill.metadata.name)) {
      score += 0.1;
    }

    return {
      skill,
      score: Math.min(score, 1.0),
      matchedTriggers,
      matchType: matchedTriggers.length > 0 ? 'exact' : 'partial',
    };
  }

  /**
   * 应用选择策略
   */
  private applySelectionStrategy(
    results: SkillMatchResult[]
  ): SkillMatchResult[] {
    switch (this.config.selectionStrategy) {
      case 'first_match':
        return results.slice(0, 1);

      case 'highest_score':
        return results.slice(0, this.config.maxActiveSkills);

      case 'combine_all':
        return results;

      default:
        return results.slice(0, this.config.maxActiveSkills);
    }
  }

  // ============================================
  // 技能激活管理
  // ============================================

  /**
   * 激活技能
   */
  activateSkill(skillName: string): boolean {
    if (!this.skills.has(skillName)) {
      console.warn('[SkillManager] Skill not found:', skillName);
      return false;
    }

    this.activeSkills.add(skillName);
    return true;
  }

  /**
   * 停用技能
   */
  deactivateSkill(skillName: string): boolean {
    return this.activeSkills.delete(skillName);
  }

  /**
   * 获取当前激活的技能
   */
  getActiveSkills(): AgentSkillDefinition[] {
    return Array.from(this.activeSkills)
      .map((name) => this.skills.get(name))
      .filter((skill): skill is AgentSkillDefinition => skill !== undefined);
  }

  // ============================================
  // 渐进式披露 - 内容获取
  // ============================================

  /**
   * 获取技能的核心指令（第二层）
   */
  getCoreInstructions(skillName: string): string | undefined {
    return this.skills.get(skillName)?.coreInstructions;
  }

  /**
   * 获取技能的补充内容（第三层，按需加载）
   */
  getSupplementaryContent(
    skillName: string,
    contentType: 'examples' | 'edgeCases' | 'bestPractices' | 'commonMistakes'
  ): string | string[] | undefined {
    const skill = this.skills.get(skillName);
    if (!skill?.supplementaryContent) return undefined;

    return skill.supplementaryContent[contentType];
  }

  /**
   * 获取技能关联的工具列表
   */
  getAssociatedTools(skillName: string): string[] {
    return this.skills.get(skillName)?.associatedTools || [];
  }

  /**
   * 获取所有激活技能关联的工具
   */
  getAllActiveTools(): string[] {
    const tools = new Set<string>();
    for (const skillName of this.activeSkills) {
      const skill = this.skills.get(skillName);
      if (skill?.associatedTools) {
        for (const tool of skill.associatedTools) {
          tools.add(tool);
        }
      }
    }
    return Array.from(tools);
  }

  // ============================================
  // 工具方法
  // ============================================

  /**
   * 获取所有技能列表
   */
  getAllSkills(): AgentSkillDefinition[] {
    return Array.from(this.skills.values());
  }

  /**
   * 获取技能摘要（用于系统提示的第一层）
   */
  getSkillSummaries(): string[] {
    return Array.from(this.skills.values()).map(
      (skill) => `- ${skill.metadata.name}: ${skill.metadata.description}`
    );
  }

  /**
   * 重置到默认状态
   */
  reset(): void {
    this.activeSkills.clear();
    for (const skillName of this.config.defaultSkills) {
      if (this.skills.has(skillName)) {
        this.activeSkills.add(skillName);
      }
    }
  }
}

/**
 * 创建技能管理器实例
 */
export function createSkillManager(
  config?: SkillManagerConfig
): SkillManager {
  return new SkillManager(config);
}
