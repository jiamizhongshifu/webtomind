/**
 * Web Search Discovery Skill Definition
 * 全网搜索来源发现技能
 * 通过 Agent-Reach 的搜索能力发现互联网内容
 */

import type { AgentSkillDefinition, SkillCategory } from './types.js';

/**
 * Web Search Discovery Skill
 * 搜索互联网内容并返回结构化结果
 */
export const webSearchSkill: AgentSkillDefinition = {
  metadata: {
    name: 'web_search_discovery',
    description: '全网搜索并发现新的内容来源，支持通过 Exa 语义搜索和 Jina Reader 提取网页全文',
    triggers: [
      // 中文触发词
      '搜索', '全网搜索', '找资料', '查找', '搜一下',
      '来源搜索', '搜索来源', '发现来源',
      '网上找', '互联网搜索', '在线搜索',
      // 英文触发词
      'search', 'web search', 'find sources',
      'discover', 'research', 'look up',
      'search the web', 'find information'
    ],
    version: '1.0.0',
    category: 'search' as SkillCategory,
    priority: 90,
    dependencies: [],
    source: 'system',
    status: 'active',
    runtime: { mode: 'sync', planner: 'direct', timeoutMs: 60000, maxSteps: 5 },
    capabilities: {
      allowedTools: ['web_search', 'extract_url'],
      artifactTypes: ['search_results']
    },
    permissions: { confirmationMode: 'never', sideEffects: [] },
    output: { primaryType: 'text' }
  },

  coreInstructions: `---
name: web-search-discovery
description: 全网搜索并发现新的内容来源
allowed-tools: web_search extract_url
---

## 全网搜索来源发现技能

你可以帮助用户在互联网上搜索和发现新的内容来源。

### 能力

1. **全网搜索**: 使用 web_search 工具搜索互联网内容
2. **内容提取**: 使用 extract_url 工具提取网页全文

### 工作流程

1. 接收用户的搜索关键词
2. 调用 web_search 进行搜索
3. 返回结构化的搜索结果（标题、摘要、URL、来源）
4. 如果用户需要，可以进一步提取某个 URL 的完整内容

### 输出格式

搜索结果应包含：
- 标题
- 内容摘要（200字以内）
- 来源 URL
- 来源网站名称

### 注意事项

- 优先返回高质量、权威的来源
- 结果应覆盖多个角度和来源
- 如果搜索结果不理想，尝试调整关键词重新搜索
`,

  supplementaryContent: undefined
};
