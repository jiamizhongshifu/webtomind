/**
 * Topic Decision Skill
 * One-time execution skill that searches trending topics and recommends
 * high-potential content ideas via Grok X Search + Web Search
 */

import type { AgentSkillDefinition, SkillCategory } from './types.js';

export const topicDecisionSkill: AgentSkillDefinition = {
  metadata: {
    name: 'topic-decision',
    description: '搜索热门趋势，为你推荐高潜力选题方向',
    triggers: [
      '选题',
      'topic',
      '热门',
      '趋势',
      '话题',
      '灵感',
      '爆款',
      '选题方向'
    ],
    version: '1.0.0',
    category: 'analysis' as SkillCategory,
    priority: 72,
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
name: topic-decision
description: 搜索热门趋势，推荐高潜力选题方向
allowed-tools: grok_x_search web_search
---

## 一键选题

搜索 X/Twitter 和网络热门话题，推荐适合内容创作的选题方向。

### 支持的赛道分类
- **ai_tech**: AI/科技（大模型、AI 工具、技术突破）
- **side_hustle**: 副业/搞钱（变现策略、独立开发、增长案例）
- **product**: 产品/设计（用户体验、产品趋势、设计案例）
- **all**: 综合选题（跨领域热门话题）

### 工作流程
1. 根据赛道分类和自定义关键词构建搜索查询
2. 并行搜索 X/Twitter 热门话题和网络热门选题
3. 汇总结果生成选题推荐
4. 输出保存为笔记

### 输出
结构化的 Markdown 选题推荐，包含 X/Twitter 和网络两个板块。
`,

  associatedTools: ['grok_x_search', 'web_search']
};
