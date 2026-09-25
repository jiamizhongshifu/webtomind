/**
 * 内置技能定义
 * 基于 Anthropic Agent Skills 的渐进式披露设计
 * 与后端工具 (web_search, extract_url, save_note, notebooklm_*) 对齐
 * 
 * V2: 添加 YAML Frontmatter 配置支持
 */

import type { AgentSkillDefinition } from './types.js';
import { notebookLMSkill } from './notebooklm-skill.js';
import { slideDeckSkill } from './slide-deck-skill.js';
import { webSearchSkill } from './web-search-skill.js';
import { infographicSkill } from './infographic-skill.js';
import { buildersDailyBriefSkill } from './builders-daily-brief-skill.js';
import { topicDecisionSkill } from './topic-decision-skill.js';
import { cosmicEngravingSkill } from './cosmic-engraving-skill.js';
import { wechatPublisherSkill } from './wechat-publisher-skill.js';
import { imageCreationSkill } from './image-creation-skill.js';
import { zhongFemalePortraitDirectorSkill } from './zhong-female-portrait-director-skill.js';

// ============================================
// 内容理解技能
// ============================================

export const contentUnderstandingSkill: AgentSkillDefinition = {
  metadata: {
    name: 'content_understanding',
    description: '提取、阅读和理解网页内容',
    triggers: [
      '阅读',
      '提取',
      '总结',
      '理解',
      '分析',
      '网页',
      '文章',
      '内容',
      'url',
      '链接',
      '看看',
      '读一下'
    ],
    category: 'content',
    priority: 90,
    source: 'system',
    status: 'active',
    runtime: { mode: 'sync', planner: 'direct', timeoutMs: 120000, maxSteps: 10 },
    capabilities: { allowedTools: ['extract_url'], artifactTypes: ['summary'] },
    permissions: { confirmationMode: 'never', sideEffects: [] },
    output: { primaryType: 'summary' }
  },

  coreInstructions: `---
name: content-understanding
description: 提取、阅读和理解网页内容
allowed-tools: extract_url
---

## 内容理解技能

你可以提取和理解各种网页内容。

### 工具使用
- **extract_url**: 提取指定 URL 的网页内容
  - url: 要提取的网页地址（必需）
  - maxLength: 内容最大长度（可选，默认 10000）

### 使用流程
1. 用户提供 URL → 调用 extract_url(url=xxx)
2. 获取内容后 → 进行深度分析和总结

### 重要：内容加工要求
提取内容后，**必须进行深度加工**，不要只是原样展示：
1. **提炼核心观点**: 找出文章的主要论点和关键信息
2. **结构化总结**: 用清晰的层次结构组织内容
3. **价值分析**: 指出内容的价值、适用场景或局限性
4. **关键词提取**: 便于后续检索和知识管理

### 输出格式
**标题**: [内容标题]

**核心观点**:
1. [第一个核心观点]
2. [第二个核心观点]
3. [第三个核心观点]

**详细分析**:
[按逻辑分段的深度分析]

**关键词**: [关键词1], [关键词2], [关键词3]
`,

  supplementaryContent: {
    examples: [
      '用户: "帮我看看这个链接 https://example.com"\nAI: 调用 extract_url(url="https://example.com")，然后总结要点',
      '用户: "分析这篇文章"\nAI: 询问用户提供 URL，或使用已有的引用内容'
    ],
    edgeCases: `
- 如果页面内容过长（超过10000字符），会自动截断
- 某些网站可能有反爬虫机制，导致提取失败
- 动态加载的内容可能无法完全提取
`
  },

  associatedTools: ['extract_url']
};

// ============================================
// 知识管理技能
// ============================================

export const knowledgeManagementSkill: AgentSkillDefinition = {
  metadata: {
    name: 'knowledge_management',
    description: '保存笔记和知识管理',
    triggers: ['保存', '记录', '笔记', '记下', '存储', '收藏'],
    category: 'history',
    priority: 80,
    source: 'system',
    status: 'active',
    runtime: { mode: 'sync', planner: 'direct', timeoutMs: 120000, maxSteps: 10 },
    capabilities: { allowedTools: ['save_note'], artifactTypes: ['text'] },
    permissions: { confirmationMode: 'on_write', sideEffects: ['write_db'] },
    output: { primaryType: 'text' }
  },

  coreInstructions: `---
name: knowledge-management
description: 保存笔记和知识管理
allowed-tools: save_note
---

## 知识管理技能

帮助用户保存和管理知识笔记。

### 工具使用
- **save_note**: 保存笔记
  - title: 标题（必需，简洁有意义）
  - content: 内容（必需，支持 Markdown）
  - tags: 标签列表（可选，便于分类）
  - sourceUrl: 来源链接（可选）

### 使用场景
1. 用户说"帮我保存这个" → 整理内容后调用 save_note
2. 用户要求记录要点 → 提炼要点后调用 save_note
3. 总结完成后 → 询问是否需要保存

### 保存最佳实践
- 标题要简洁有意义，便于检索
- 使用 Markdown 格式化内容
- 添加合适的标签便于分类
- 记录来源 URL（如果有）
`,

  associatedTools: ['save_note']
};

// ============================================
// 信息搜索技能
// ============================================

export const informationSearchSkill: AgentSkillDefinition = {
  metadata: {
    name: 'information_search',
    description: '网络搜索和信息查询',
    triggers: [
      '搜索',
      '查询',
      '查找',
      '找一下',
      '搜一下',
      '最新',
      '新闻',
      '了解',
      '什么是'
    ],
    category: 'search',
    priority: 85,
    source: 'system',
    status: 'active',
    runtime: { mode: 'sync', planner: 'direct', timeoutMs: 120000, maxSteps: 10 },
    capabilities: { allowedTools: ['web_search'], artifactTypes: ['report'] },
    permissions: { confirmationMode: 'never', sideEffects: [] },
    output: { primaryType: 'report' }
  },

  coreInstructions: `---
name: information-search
description: 网络搜索和信息查询
allowed-tools: web_search
---

## 信息搜索技能

帮助用户在网络上搜索最新信息。

### 工具使用
- **web_search**: 网络搜索
  - query: 搜索关键词（必需，简洁明确）
  - maxResults: 结果数量（可选，默认 5）

### 使用建议
1. **优化搜索词**: 将用户问题转化为有效的搜索关键词
2. **整合结果**: 将多个搜索结果综合分析
3. **标注来源**: 回答时注明信息来源

### 搜索策略
- 事实性问题：使用精确关键词
- 概念性问题：使用相关术语组合
- 时效性问题：添加时间限定词（如"2024"、"最新"）

### 何时主动搜索
- 用户询问最新事件或新闻
- 用户询问你不确定的事实
- 用户明确要求搜索
- 需要验证信息的准确性
`,

  supplementaryContent: {
    examples: [
      '用户: "最近有什么AI新闻"\nAI: 调用 web_search(query="AI 人工智能 最新新闻 2024")',
      '用户: "Claude 是什么"\nAI: 调用 web_search(query="Claude AI Anthropic")'
    ]
  },

  associatedTools: ['web_search']
};

// ============================================
// 综合分析技能
// ============================================

export const comprehensiveAnalysisSkill: AgentSkillDefinition = {
  metadata: {
    name: 'comprehensive_analysis',
    description: '综合多种工具进行深度分析',
    triggers: ['深入分析', '全面了解', '详细研究', '调研', '研究一下'],
    category: 'analysis',
    priority: 75,
    source: 'system',
    status: 'active',
    runtime: { mode: 'sync', planner: 'workflow', timeoutMs: 120000, maxSteps: 10 },
    capabilities: { allowedTools: ['web_search', 'extract_url', 'save_note'], artifactTypes: ['report', 'summary'] },
    permissions: { confirmationMode: 'on_write', sideEffects: ['write_db'] },
    output: { primaryType: 'report' }
  },

  coreInstructions: `---
name: comprehensive-analysis
description: 综合多种工具进行深度分析
allowed-tools: web_search extract_url save_note
---

## 综合分析技能

结合多种工具进行深度分析和研究。

### 工作流程
1. **理解需求**: 明确用户想要了解的主题
2. **信息收集**:
   - 使用 web_search 搜索相关信息
   - 使用 extract_url 提取重要链接内容
3. **整合分析**: 综合所有信息进行深度分析
4. **输出成果**: 结构化呈现分析结果
5. **保存记录**: 询问是否需要使用 save_note 保存

### 分析输出格式
**主题**: [研究主题]

**背景概述**:
[简要背景介绍]

**核心发现**:
1. [发现1]
2. [发现2]
3. [发现3]

**详细分析**:
[分段详细分析]

**结论与建议**:
[总结性结论]

**信息来源**:
- [来源1]
- [来源2]
`,

  associatedTools: ['web_search', 'extract_url', 'save_note']
};

// ============================================
// 导出所有内置技能
// ============================================

export const BUILT_IN_SKILLS: AgentSkillDefinition[] = [
  contentUnderstandingSkill,
  knowledgeManagementSkill,
  informationSearchSkill,
  comprehensiveAnalysisSkill,
  notebookLMSkill, // NotebookLM 学习内容生成技能
  slideDeckSkill, // PPT/幻灯片生成技能 (Gemini + pptxgenjs)
  webSearchSkill, // 全网搜索来源发现技能
  infographicSkill, // 信息图生成技能 (NotebookLM pipeline)
  buildersDailyBriefSkill, // Builders 简报
  topicDecisionSkill, // 一键选题
  cosmicEngravingSkill, // 品牌配图
  imageCreationSkill, // 官方图像创作技能
  zhongFemalePortraitDirectorSkill, // 官方女性写真视觉导演技能
  wechatPublisherSkill // 公众号发布
];

/**
 * 获取技能名称到技能定义的映射
 */
export function getSkillMap(): Map<string, AgentSkillDefinition> {
  const map = new Map<string, AgentSkillDefinition>();
  for (const skill of BUILT_IN_SKILLS) {
    map.set(skill.metadata.name, skill);
  }
  return map;
}

/**
 * 获取所有触发词到技能的映射
 */
export function getTriggerMap(): Map<string, AgentSkillDefinition[]> {
  const map = new Map<string, AgentSkillDefinition[]>();
  for (const skill of BUILT_IN_SKILLS) {
    for (const trigger of skill.metadata.triggers) {
      const existing = map.get(trigger) || [];
      existing.push(skill);
      map.set(trigger, existing);
    }
  }
  return map;
}
