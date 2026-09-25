/**
 * Slide Deck Generation Skill
 * Enables AI-powered slide deck generation using Gemini
 *
 * Different from NotebookLM slide_deck:
 * - Uses Gemini to generate slide content
 * - Uses pptxgenjs to create PPTX files
 * - Supports multiple visual styles
 */

import { AgentSkillDefinition, SkillCategory } from './types';

/**
 * Slide Deck Generation Skill
 * Creates professional presentations from content
 */
export const slideDeckSkill: AgentSkillDefinition = {
  metadata: {
    name: 'slide_deck_generation',
    description: '使用 AI 生成专业的 PPT 演示文稿，支持多种视觉风格',
    triggers: [
      // Chinese triggers
      'PPT',
      'ppt',
      '幻灯片',
      '演示文稿',
      '演示',
      'slides',
      '生成PPT',
      '制作PPT',
      '创建演示文稿',
      '做个PPT',
      '转成PPT',
      '变成幻灯片',
      // English triggers
      'slide deck',
      'slides',
      'presentation',
      'powerpoint',
      'create slides',
      'generate slides',
      'make presentation',
      'convert to slides',
      'turn into presentation'
    ],
    version: '1.0.0',
    category: 'creative' as SkillCategory,
    priority: 88, // Higher than notebooklm (85) for PPT-specific requests
    dependencies: [],
    source: 'system',
    status: 'active',
    runtime: { mode: 'async', planner: 'workflow', timeoutMs: 300000, maxSteps: 8 },
    capabilities: { allowedTools: ['slide_deck_generate'], artifactTypes: ['slide_deck'] },
    permissions: { confirmationMode: 'never', sideEffects: [] },
    output: { primaryType: 'slide_deck' }
  },

  coreInstructions: `---
name: slide-deck-generation
description: 使用 AI 生成专业的 PPT 演示文稿
allowed-tools: slide_deck_generate
---

## PPT/幻灯片生成技能

**重要：当用户要求生成 PPT/幻灯片/演示文稿时，你必须调用 slide_deck_generate 工具。不要自己生成文案或大纲，直接调用工具让系统生成真正的 PPTX 文件。**

### 何时调用工具
当用户消息中包含以下关键词时，**必须**调用 slide_deck_generate 工具：
- PPT、ppt、幻灯片、演示文稿、slides、presentation、powerpoint
- 制作PPT、生成PPT、做个PPT、转成PPT
- [PPT 生成设置] 标记（前端自动添加）

### 工具调用方式
直接调用 slide_deck_generate 工具，参数：
- content: 用户提供的内容或引用素材（必需）
- style: 风格，如 blueprint/minimal/corporate 等（可选，默认 blueprint）
- slideCount: 幻灯片数量 5-20（可选，默认 10）
- language: 语言 auto/zh/en（可选，默认 auto）

### 支持的视觉风格
blueprint, notion, corporate, minimal, sketch-notes, chalkboard, bold-editorial, dark-atmospheric, watercolor, pixel-art, scientific, vintage

### 正确行为示例
用户: "帮我把这篇文章做成PPT"
正确: 调用 slide_deck_generate(content="文章内容", style="blueprint", slideCount=10)
错误: 自己写出 PPT 大纲或文案

### 响应格式
1. 简短说明正在生成 PPT
2. 调用 slide_deck_generate 工具
3. 工具返回后，展示下载链接（24小时有效）
`,

  supplementaryContent: {
    examples: [
      '用户: "帮我把这篇文章做成PPT"\\n助手: 好的，我来为您生成 PPT。请问您希望使用什么风格？默认是技术蓝图风格，生成 10 页幻灯片。',
      '用户: "用极简风格生成一个关于AI的演示文稿，8页"\\n助手: 正在生成极简风格的 8 页 AI 主题演示文稿...',
      '用户: "把我的笔记转成商务风格的PPT"\\n助手: [调用 slide_deck_generate] 正在处理您的内容...'
    ],
    edgeCases: `
- 如果内容太短，建议用户补充更多信息或减少幻灯片数量
- 如果内容太长，自动精简并突出重点
- 如果用户没有指定风格，使用 blueprint 作为默认
- 如果生成失败，提供错误信息并建议重试
`,
    bestPractices: `
- 在开始前确认用户的风格偏好
- 提供预估的处理时间（通常 30-60 秒）
- 完成后简要说明生成的内容结构
- 提醒用户下载链接的有效期（24小时）
`,
    commonMistakes: `
- 不要在没有内容的情况下尝试生成 PPT
- 不要忽视用户指定的风格或数量偏好
- 不要忘记提供下载链接
`
  },

  associatedTools: ['slide_deck_generate'],

  toolGuidelines: `
### slide_deck_generate
用于生成 PPT 演示文稿。参数：
- content: 要转换为 PPT 的内容（必需）
- style: 视觉风格（可选，默认 'blueprint'）
  - 可选值: 'blueprint' | 'notion' | 'corporate' | 'minimal' | 'sketch-notes' | 
            'chalkboard' | 'bold-editorial' | 'dark-atmospheric' | 'watercolor' | 
            'pixel-art' | 'scientific' | 'vintage'
- slideCount: 幻灯片数量（可选，默认 10，范围 5-20）
- language: 输出语言（可选，'auto' | 'zh' | 'en'，默认 'auto'）
- title: PPT 标题（可选，自动从内容推断）

返回：
- success: 是否成功
- downloadUrl: PPT 下载链接（24小时有效）
- slideCount: 实际生成的幻灯片数量
- outline: 生成的大纲结构
`
};

/**
 * Get Slide Deck skill definition
 */
export function getSlideDeckSkill(): AgentSkillDefinition {
  return slideDeckSkill;
}

/**
 * Check if input matches Slide Deck skill triggers
 */
export function matchesSlideDeckTriggers(input: string): boolean {
  const normalizedInput = input.toLowerCase();
  return slideDeckSkill.metadata.triggers.some((trigger) =>
    normalizedInput.includes(trigger.toLowerCase())
  );
}

/**
 * Get matched triggers from input
 */
export function getSlideDeckMatchedTriggers(input: string): string[] {
  const normalizedInput = input.toLowerCase();
  return slideDeckSkill.metadata.triggers.filter((trigger) =>
    normalizedInput.includes(trigger.toLowerCase())
  );
}
