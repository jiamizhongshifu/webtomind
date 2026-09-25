/**
 * 系统提示构建器
 * 基于渐进式披露动态构建系统提示
 * 支持内置技能和用户自定义技能
 * 
 * V2: 严格遵循官方 Agent Skills 标准
 */

import type { AgentSkillDefinition, PromptBuildOptions, SystemPromptComponents } from './types.js';
import type { SkillManager } from './skill-manager.js';
import type { UserSkillData } from './enhanced-skill-manager.js';

// ============================================
// 基础提示模板
// ============================================

const BASE_ROLE_DEFINITION = `你是一个智能助手，专注于帮助用户理解网页内容、搜索信息和管理知识。

## 核心原则
1. **主动使用工具**: 不要只是描述能做什么，要实际调用工具完成任务
2. **深度加工**: 提取内容后必须进行分析、总结和结构化呈现
3. **结构化输出**: 使用清晰的标题、列表、重点标注来组织信息
4. **简体中文**: 使用简体中文回复用户`;

const GENERAL_GUIDELINES = `
## 交互流程
1. **理解意图**: 仔细理解用户的真实需求
2. **选择工具**: 根据需求选择最合适的工具
3. **执行操作**: 调用工具获取信息
4. **整合输出**: 将结果整理成易于理解的格式

## 输出格式
- 使用 Markdown 格式化输出
- 重要信息用 **粗体** 标注
- 使用列表组织多项内容
- 代码或技术内容用代码块包裹`;

const TOOL_GUIDELINES = `
## 可用工具
- **extract_url**: 提取网页内容
- **web_search**: 网络搜索
- **save_note**: 保存笔记
- **notebooklm_process**: 生成学习内容（闪卡、脑图、测验、报告、摘要等）
- **notebooklm_status**: 查询任务状态
- **notebooklm_health**: 检查 NotebookLM 服务状态
- **slide_deck_generate**: 生成 PPT 演示文稿
- **create_skill**: 创建新的 Skill（快捷指令）`;

const CREATE_SKILL_GUIDELINES = `
---
## 创建 Skill

当用户明确表示想要创建、新建、添加一个 Skill 或技能时，使用 create_skill 工具。

### 识别创建意图的关键词
- "创建 Skill"、"新建 Skill"、"添加 Skill"
- "创建技能"、"新建技能"、"添加技能"
- "帮我做一个 Skill"、"我想要一个 Skill"

### 提取字段规则
1. **name**: 从显示名称生成，使用小写字母和下划线
2. **displayName**: 用户描述的名称
3. **triggers**: 从用户描述中提取触发词
4. **coreInstructions**: 根据用户描述生成详细的执行指令
5. **icon**: 根据功能选择合适的 emoji
6. **category**: 根据功能类型选择分类`;

// ============================================
// 上下文信息接口
// ============================================

export interface ContextInfo {
  references?: string;
  history?: string;
  pageInfo?: { url: string; title: string };
}

/**
 * Layer 3 元数据 - 可用的参考文档和脚本
 */
export interface Layer3Metadata {
  references?: Array<{ name: string; description?: string; wordCount?: number }>;
  scripts?: Array<{ name: string; description?: string; parameters?: Record<string, unknown> }>;
}

export interface ResolutionPromptContext {
  explicitSkillId?: string;
  selectedToolNames?: string[];
  localHint?: {
    id: string;
    name: string;
    source?: 'user' | 'system' | 'market';
    explicit?: boolean;
    matchedTriggers?: string[];
  } | null;
}


// ============================================
// 提示构建器类
// ============================================

export class PromptBuilder {
  private skillManager?: SkillManager;
  private options: Required<PromptBuildOptions>;

  constructor(skillManager?: SkillManager, options: PromptBuildOptions = {}) {
    this.skillManager = skillManager;
    this.options = {
      includeExamples: options.includeExamples ?? false,
      includeEdgeCases: options.includeEdgeCases ?? false,
      language: options.language || 'zh-CN',
      maxLength: options.maxLength || 8000,
    };
  }

  /**
   * 使用 UserSkillData 构建系统提示（推荐方式）
   * 严格遵循官方 Agent Skills 标准
   * 
   * @param skills 激活的技能列表
   * @param context 上下文信息
   * @param layer3Metadata Layer 3 元数据 (可选)
   */
  buildSystemPromptWithSkills(
    skills: UserSkillData[],
    context?: ContextInfo,
    layer3Metadata?: Map<string, Layer3Metadata>,
    resolutionContext?: ResolutionPromptContext
  ): string {
    const parts: string[] = [
      BASE_ROLE_DEFINITION,
      GENERAL_GUIDELINES,
      TOOL_GUIDELINES,
      CREATE_SKILL_GUIDELINES,
    ];

    // 添加激活的技能指令
    if (skills.length > 0) {
      parts.push('\n---\n# 当前激活的技能\n');
      for (const skill of skills) {
        parts.push(`## ${skill.icon} ${skill.displayName}`);
        if (skill.description && skill.description !== skill.displayName) {
          parts.push(`> ${skill.description}`);
        }
        
        // 核心指令
        parts.push(skill.coreInstructions);
        
        // 关联工具
        if (skill.associatedTools.length > 0) {
          parts.push(`\n**关联工具**: ${skill.associatedTools.join(', ')}`);
        }
        
        // Layer 3 元数据: 显示可用的参考文档和脚本
        const skillLayer3 = layer3Metadata?.get(skill.id);
        if (skillLayer3) {
          if (skillLayer3.references && skillLayer3.references.length > 0) {
            parts.push('\n**可用参考文档** (使用 `read_skill_reference` 工具加载):');
            for (const ref of skillLayer3.references) {
              const wordInfo = ref.wordCount ? ` (~${ref.wordCount} 字)` : '';
              parts.push(`  - \`${ref.name}\`${wordInfo}${ref.description ? `: ${ref.description}` : ''}`);
            }
          }
          
          if (skillLayer3.scripts && skillLayer3.scripts.length > 0) {
            parts.push('\n**可用脚本** (使用 `execute_script` 工具执行):');
            for (const script of skillLayer3.scripts) {
              parts.push(`  - \`${script.name}\`${script.description ? `: ${script.description}` : ''}`);
              if (script.parameters && Object.keys(script.parameters).length > 0) {
                parts.push(`    参数: ${Object.keys(script.parameters).join(', ')}`);
              }
            }
          }
        }
        
        parts.push('');
      }
    }

    // 添加 resolution 上下文
    if (resolutionContext) {
      parts.push('\n---\n## Resolution Context');
      if (resolutionContext.explicitSkillId) {
        parts.push(`- explicitSkillId: ${resolutionContext.explicitSkillId}`);
      }
      if (resolutionContext.selectedToolNames && resolutionContext.selectedToolNames.length > 0) {
        parts.push(`- selectedTools: ${resolutionContext.selectedToolNames.join(', ')}`);
      }
      if (resolutionContext.localHint) {
        parts.push(`- localHint: ${resolutionContext.localHint.name}${resolutionContext.localHint.source ? ` (${resolutionContext.localHint.source})` : ''}`);
      }
    }

    // 添加上下文信息
    if (context) {
      if (context.references) {
        parts.push(`\n---\n## 用户提供的参考内容\n${context.references}`);
      }
      if (context.pageInfo) {
        parts.push(`\n---\n## 当前页面信息\n- URL: ${context.pageInfo.url}\n- 标题: ${context.pageInfo.title}`);
      }
    }

    let prompt = parts.join('\n');

    // 检查长度限制
    if (prompt.length > this.options.maxLength) {
      prompt = this.truncatePrompt(prompt, this.options.maxLength);
    }

    return prompt;
  }

  /**
   * 构建完整的系统提示（使用 SkillManager）
   * @deprecated 使用 buildSystemPromptWithSkills 代替
   */
  buildSystemPrompt(userInput?: string): string {
    const components = this.buildComponents(userInput);
    return this.assemblePrompt(components);
  }

  /**
   * 构建提示组件
   */
  buildComponents(userInput?: string): SystemPromptComponents {
    let activeSkills: AgentSkillDefinition[] = [];

    if (this.skillManager) {
      activeSkills = this.skillManager.getActiveSkills();

      if (userInput) {
        const matches = this.skillManager.matchSkills(userInput);
        if (matches.length > 0) {
          for (const match of matches) {
            this.skillManager.activateSkill(match.skill.metadata.name);
          }
          activeSkills = this.skillManager.getActiveSkills();
        }
      }
    }

    const skillInstructions = activeSkills.map((skill) =>
      this.buildSkillInstructions(skill)
    );

    const toolGuidelines = this.buildToolGuidelines(activeSkills);

    return {
      roleDefinition: BASE_ROLE_DEFINITION,
      generalGuidelines: GENERAL_GUIDELINES,
      skillInstructions,
      toolGuidelines,
    };
  }

  private assemblePrompt(components: SystemPromptComponents): string {
    const parts: string[] = [
      components.roleDefinition,
      components.generalGuidelines,
    ];

    if (components.skillInstructions.length > 0) {
      parts.push('\n---\n# 当前激活的技能\n');
      parts.push(components.skillInstructions.join('\n\n---\n'));
    }

    if (components.toolGuidelines) {
      parts.push('\n---\n' + components.toolGuidelines);
    }

    if (components.contextInfo) {
      parts.push('\n---\n# 上下文信息\n' + components.contextInfo);
    }

    let prompt = parts.join('\n');

    if (prompt.length > this.options.maxLength) {
      prompt = this.truncatePrompt(prompt, this.options.maxLength);
    }

    return prompt;
  }


  private buildSkillInstructions(skill: AgentSkillDefinition): string {
    const parts: string[] = [];
    parts.push(skill.coreInstructions);

    if (this.options.includeExamples && skill.supplementaryContent?.examples) {
      parts.push('\n### 示例');
      parts.push(skill.supplementaryContent.examples.join('\n\n'));
    }

    if (this.options.includeEdgeCases && skill.supplementaryContent?.edgeCases) {
      parts.push('\n### 特殊情况');
      parts.push(skill.supplementaryContent.edgeCases);
    }

    return parts.join('\n');
  }

  private buildToolGuidelines(activeSkills: AgentSkillDefinition[]): string {
    const allTools = new Set<string>();
    const guidelines: string[] = ['# 可用工具'];

    for (const skill of activeSkills) {
      if (skill.associatedTools) {
        for (const tool of skill.associatedTools) {
          allTools.add(tool);
        }
      }
      if (skill.toolGuidelines) {
        guidelines.push(skill.toolGuidelines);
      }
    }

    if (allTools.size > 0) {
      guidelines.unshift(`当前可用工具: ${Array.from(allTools).join(', ')}`);
    }

    return guidelines.join('\n\n');
  }

  private truncatePrompt(prompt: string, maxLength: number): string {
    if (prompt.length <= maxLength) return prompt;

    const truncated = prompt.substring(0, maxLength - 100);
    const lastNewline = truncated.lastIndexOf('\n');

    return truncated.substring(0, lastNewline) + '\n\n...(内容已截断)';
  }

  updateOptions(options: Partial<PromptBuildOptions>): void {
    this.options = { ...this.options, ...options };
  }

  getEnhancedInstructions(
    skillName: string,
    contentType: 'examples' | 'edgeCases' | 'bestPractices'
  ): string | undefined {
    if (!this.skillManager) return undefined;
    const content = this.skillManager.getSupplementaryContent(skillName, contentType);
    if (!content) return undefined;
    return Array.isArray(content) ? content.join('\n\n') : content;
  }
}

/**
 * 创建提示构建器
 */
export function createPromptBuilder(
  skillManager?: SkillManager,
  options?: PromptBuildOptions
): PromptBuilder {
  return new PromptBuilder(skillManager, options);
}

/**
 * 构建默认系统提示
 */
export function buildDefaultSystemPrompt(): string {
  return BASE_ROLE_DEFINITION + GENERAL_GUIDELINES + TOOL_GUIDELINES;
}
