/**
 * Builders Daily Brief Skill
 * One-time execution skill that fetches and compiles the latest updates
 * from top AI builders via Grok X Search + Web Search
 */

import type { AgentSkillDefinition, SkillCategory } from './types.js';

export const buildersDailyBriefSkill: AgentSkillDefinition = {
  metadata: {
    name: 'builders-daily-brief',
    description: '搜索并汇总 AI 行业顶尖 Builder 的最新动态，生成简报',
    triggers: [
      'Builder',
      'builder',
      '简报',
      'daily brief',
      'AI 动态',
      'Builder 动态',
      '独立开发者',
      'indie hacker'
    ],
    version: '1.0.0',
    category: 'analysis' as SkillCategory,
    priority: 70,
    dependencies: [],
    source: 'system',
    status: 'active',
    runtime: { mode: 'async', planner: 'workflow', timeoutMs: 120000, maxSteps: 6 },
    capabilities: {
      allowedTools: ['grok_x_search', 'web_search'],
      artifactTypes: ['report']
    },
    permissions: { confirmationMode: 'never', sideEffects: [] },
    output: { primaryType: 'report' }
  },

  coreInstructions: `---
name: builders-daily-brief
description: 搜索并汇总 AI 行业顶尖 Builder 的最新动态
allowed-tools: grok_x_search web_search
---

## Builders 简报

搜索 X/Twitter 和网络资讯，汇总 AI 行业 Builder 的最新动态。

### 支持的焦点分类
- **ai_tools**: AI 工具动态（产品发布、功能更新、技术突破）
- **indie_hacker**: 独立开发者（产品发布、增长策略、经验分享）
- **all**: 综合简报（全面覆盖）

### 工作流程
1. 根据焦点分类和自定义关键词构建搜索查询
2. 并行搜索 X/Twitter 热帖和网络资讯
3. 汇总搜索结果生成结构化简报
4. 输出保存为笔记

### 输出
结构化的 Markdown 简报，包含 X/Twitter 动态和网络资讯两个板块。
`,

  associatedTools: ['grok_x_search', 'web_search']
};
