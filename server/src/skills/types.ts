/**
 * Agent Skills 类型定义
 * 基于 Anthropic 的 Agent Skills 设计理念
 * 参考: https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills
 */

// ============================================
// 技能元数据 (类似 SKILL.md 的 YAML frontmatter)
// ============================================

/** 技能来源 */
export type SkillSource = 'system' | 'market' | 'user';

/** 技能状态 */
export type SkillStatus = 'active' | 'disabled' | 'draft' | 'deprecated';

/** 运行模式 */
export type SkillRuntimeMode = 'sync' | 'async' | 'hybrid';

/** 规划策略 */
export type SkillPlannerType = 'direct' | 'llm' | 'workflow';

/** 确认模式 */
export type SkillConfirmationMode =
  | 'never'
  | 'on_write'
  | 'on_side_effect'
  | 'always';

/** 副作用类型 */
export type SkillSideEffect =
  | 'write_db'
  | 'publish_external'
  | 'browser_act'
  | 'execute_script';

/** 输出主类型 */
export type SkillOutputType =
  | 'text'
  | 'summary'
  | 'mindmap'
  | 'flashcards'
  | 'slide_deck'
  | 'image'
  | 'report'
  | 'external_action'
  | 'browser_result'
  | 'data_table'
  | 'audio'
  | 'video'
  | 'quiz';

/** 技能运行时元数据 */
export interface SkillRuntimeMetadata {
  source?: SkillSource;
  status?: SkillStatus;
  displayName?: string;
  icon?: string;
  runtime?: {
    mode?: SkillRuntimeMode;
    planner?: SkillPlannerType;
    timeoutMs?: number;
    maxSteps?: number;
  };
  capabilities?: {
    allowedTools?: string[];
    requiredCapabilities?: string[];
    extensionCapabilities?: string[];
    artifactTypes?: string[];
  };
  permissions?: {
    confirmationMode?: SkillConfirmationMode;
    sideEffects?: SkillSideEffect[];
  };
  output?: {
    primaryType?: SkillOutputType;
  };
}

/** 技能元数据 */
export interface SkillMetadata extends SkillRuntimeMetadata {
  /** 技能唯一标识 */
  name: string;
  /** 简短描述（用于快速判断） */
  description: string;
  /** 触发关键词列表（渐进式披露的第一层） */
  triggers: string[];
  /** 版本号 */
  version?: string;
  /** 技能类别 */
  category?: SkillCategory;
  /** 优先级（0-100，用于同时匹配多个技能时排序） */
  priority?: number;
  /** 依赖的其他技能 */
  dependencies?: string[];
}

/** 技能类别 */
export type SkillCategory =
  | 'content'     // 内容处理
  | 'search'      // 搜索查询
  | 'history'     // 历史记录
  | 'export'      // 导出生成
  | 'analysis'    // 分析总结
  | 'creative'    // 创意生成
  | 'utility';    // 工具辅助

// ============================================
// 技能定义 (三层结构)
// ============================================

/**
 * 完整的技能定义
 * 采用渐进式披露结构：
 * 1. metadata - 元数据（始终加载）
 * 2. coreInstructions - 核心指令（触发时加载）
 * 3. supplementaryContent - 补充内容（按需加载）
 */
export interface AgentSkillDefinition {
  /** 第一层：元数据 */
  metadata: SkillMetadata;

  /** 第二层：核心指令 */
  coreInstructions: string;

  /** 第三层：补充内容（按需加载） */
  supplementaryContent?: {
    /** 详细示例 */
    examples?: string[];
    /** 边缘情况处理 */
    edgeCases?: string;
    /** 最佳实践 */
    bestPractices?: string;
    /** 常见错误 */
    commonMistakes?: string;
  };

  /** 关联的工具名称列表 */
  associatedTools?: string[];

  /** 工具使用指南（何时使用哪个工具） */
  toolGuidelines?: string;
}

// ============================================
// 技能匹配与选择
// ============================================

/** 技能匹配结果 */
export interface SkillMatchResult {
  /** 匹配的技能 */
  skill: AgentSkillDefinition;
  /** 匹配得分 (0-1) */
  score: number;
  /** 匹配的关键词 */
  matchedTriggers: string[];
  /** 匹配类型 */
  matchType: 'exact' | 'partial' | 'semantic';
}

/** 技能选择策略 */
export type SkillSelectionStrategy =
  | 'first_match'      // 第一个匹配
  | 'highest_score'    // 最高得分
  | 'combine_all';     // 组合所有匹配

// ============================================
// 技能管理器配置
// ============================================

/** 技能管理器配置 */
export interface SkillManagerConfig {
  /** 技能选择策略 */
  selectionStrategy?: SkillSelectionStrategy;
  /** 最小匹配得分阈值 */
  minMatchScore?: number;
  /** 最大同时激活的技能数 */
  maxActiveSkills?: number;
  /** 是否启用渐进式披露 */
  enableProgressiveDisclosure?: boolean;
  /** 默认激活的技能 */
  defaultSkills?: string[];
}

// ============================================
// 提示构建
// ============================================

/** 系统提示组件 */
export interface SystemPromptComponents {
  /** 基础角色定义 */
  roleDefinition: string;
  /** 通用行为准则 */
  generalGuidelines: string;
  /** 当前激活的技能指令 */
  skillInstructions: string[];
  /** 工具使用指南 */
  toolGuidelines: string;
  /** 上下文信息 */
  contextInfo?: string;
}

/** 提示构建选项 */
export interface PromptBuildOptions {
  /** 是否包含详细示例 */
  includeExamples?: boolean;
  /** 是否包含边缘情况 */
  includeEdgeCases?: boolean;
  /** 用户语言偏好 */
  language?: 'zh-CN' | 'en-US';
  /** 最大提示长度（字符） */
  maxLength?: number;
}
