/**
 * SkillToAgent 桥接层
 * 将现有 Skills 系统的匹配结果转换为 Agent 系统提示配置
 */

import { createSkillManager, createPromptBuilder } from '../skills/index.js';
import type { SkillManager } from '../skills/skill-manager.js';
import type { PromptBuilder } from '../skills/prompt-builder.js';
import type { ChatContext } from '../types/api.js';

/** 由 SkillToAgent 产出的 Agent 配置片段 */
export interface AgentConfigFragment {
  /** 合并后的系统提示 */
  systemPrompt: string;
  /** 当前请求应激活的工具名称白名单（留空 = 全部可用） */
  allowedTools?: string[];
}

export class SkillToAgentBridge {
  private skillManager: SkillManager;
  private promptBuilder: PromptBuilder;

  constructor() {
    this.skillManager = createSkillManager({
      selectionStrategy: 'highest_score',
      minMatchScore: 0.3,
      maxActiveSkills: 3,
      enableProgressiveDisclosure: true,
      defaultSkills: ['content_understanding', 'information_search']
    });

    this.promptBuilder = createPromptBuilder(this.skillManager, {
      includeExamples: false,
      includeEdgeCases: false,
      language: 'zh-CN',
      maxLength: 8000
    });
  }

  buildAgentConfig(
    prompt: string,
    context?: ChatContext,
    /** 项目级自定义指令(ChatGPT-style),由 caller 预先从 DB 加载注入 */
    projectInstructions?: string
  ): AgentConfigFragment {
    let systemPrompt = this.promptBuilder.buildSystemPrompt(prompt);

    // 项目自定义指令 — prepend 到 system prompt 顶部(优先级最高)
    if (projectInstructions && projectInstructions.trim()) {
      systemPrompt = `${projectInstructions.trim()}\n\n---\n\n${systemPrompt}`;
    }

    if (context?.references) {
      systemPrompt += `\n\n---\n## 用户提供的参考内容\n${context.references}\n`;
    }

    if (context?.pageInfo) {
      systemPrompt += `\n\n---\n## 当前页面信息\n- URL: ${context.pageInfo.url}\n- 标题: ${context.pageInfo.title}\n`;
    }

    if (context?.retryStep?.stepId !== undefined) {
      const completedTools =
        context.retryStep.completedToolsBeforeStep?.length
          ? context.retryStep.completedToolsBeforeStep.join('、')
          : '无';
      systemPrompt += `\n\n---\n## 步骤级重试上下文\n- 目标步骤: Step ${context.retryStep.stepId}\n- 步骤类型: ${context.retryStep.stepType || 'unknown'}\n- 步骤描述: ${context.retryStep.stepLabel || '未提供'}\n- 已完成工具步骤: ${completedTools}\n\n请优先从目标步骤继续执行，避免重复已完成步骤。`;
    }

    return {
      systemPrompt,
      allowedTools: undefined
    };
  }
}

let _bridge: SkillToAgentBridge | null = null;

export function getSkillToAgentBridge(): SkillToAgentBridge {
  if (!_bridge) {
    _bridge = new SkillToAgentBridge();
  }
  return _bridge;
}
