/**
 * Infographic Generation Skill
 * Generates visual infographics from content via NotebookLM pipeline
 *
 * Routes to NotebookLM with outputType='infographic',
 * supporting visual style, orientation, and detail level parameters
 */

import type { AgentSkillDefinition, SkillCategory } from './types.js';

export const infographicSkill: AgentSkillDefinition = {
  metadata: {
    name: 'infographic',
    description: '将内容转化为可视化信息图，支持多种风格和布局',
    triggers: [
      '信息图',
      '图表',
      '可视化',
      '数据图',
      '流程图',
      'infographic',
      'visualization',
      'chart',
      '做个信息图',
      '转成信息图',
      '生成图表'
    ],
    version: '1.0.0',
    category: 'creative' as SkillCategory,
    priority: 82,
    dependencies: [],
    source: 'system',
    status: 'active',
    runtime: { mode: 'async', planner: 'workflow', timeoutMs: 120000, maxSteps: 6 },
    capabilities: { allowedTools: ['notebooklm_process'], artifactTypes: ['image'] },
    permissions: { confirmationMode: 'never', sideEffects: [] },
    output: { primaryType: 'image' }
  },

  coreInstructions: `---
name: infographic
description: 将内容转化为可视化信息图
allowed-tools: notebooklm_process
---

## 信息图生成技能

将用户提供的内容或选中的素材转化为可视化信息图。

### 支持的参数
- **language**: 输出语言（zh-CN / en-US）
- **orientation**: 布局方向（landscape / portrait / square）
- **visual_style**: 视觉风格（auto / sketch-notes / cute / professional / scientific / anime / minimal / vintage）
- **detail_level**: 详细程度（brief / standard / detailed）

### 工作流程
1. 解析用户选中的素材内容
2. 根据视觉参数生成定制化信息图
3. 返回可下载的信息图图片

### 输出
生成的信息图将作为图片返回，可直接用于文档、演示或社交媒体发布。
`,

  associatedTools: ['notebooklm_process']
};
