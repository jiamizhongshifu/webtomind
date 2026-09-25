/**
 * NotebookLM Agent Skill Definition
 * Enables AI-powered learning content generation through NotebookLM
 * 
 * Requirements covered:
 * - 10.1: Register to Agent skill system
 * - 10.2: Trigger word recognition
 * - 10.5: Clear core instructions
 */

import { AgentSkillDefinition, SkillCategory } from './types';

/**
 * NotebookLM Learning Skill
 * Generates structured learning content from various sources
 */
export const notebookLMSkill: AgentSkillDefinition = {
  metadata: {
    name: 'notebooklm_learning',
    description: '使用 NotebookLM 从各种来源生成学习内容（闪卡、脑图、测验、报告、摘要、音频概览、视频概览、信息图、演示文稿、数据表格）',
    triggers: [
      // Chinese triggers
      '闪卡', '学习卡片', '记忆卡',
      '脑图', '思维导图', '知识图谱',
      '测验', '考试题', '练习题', '题目',
      '报告', '学习报告', '内容报告',
      '摘要', '总结', '要点',
      '学习材料', '学习内容',
      // New output types - Chinese
      '音频', '音频概览', '播客', '语音',
      '视频', '视频概览', '视频摘要',
      '信息图', '图表', '可视化',
      '演示文稿', 'PPT', '幻灯片', '演示',
      '数据表格', '表格', '数据',
      // English triggers
      'flashcard', 'flashcards', 'flash card',
      'mindmap', 'mind map', 'mind-map',
      'quiz', 'quizzes', 'test questions',
      'report', 'summary', 'summarize',
      'learning material', 'study guide',
      // New output types - English
      'audio', 'audio overview', 'podcast',
      'video', 'video overview',
      'infographic', 'chart', 'visualization',
      'presentation', 'slide deck', 'slides', 'ppt',
      'data table', 'table', 'spreadsheet',
      // Action triggers
      '生成闪卡', '制作脑图', '创建测验',
      '生成报告', '生成摘要',
      '生成音频', '生成视频', '生成信息图', '生成PPT', '生成表格',
      'generate flashcards', 'create mindmap',
      'make quiz', 'create summary',
      'generate audio', 'generate video', 'create infographic', 'create presentation',
    ],
    version: '1.1.0',
    category: 'content' as SkillCategory,
    priority: 85,
    dependencies: [],
    source: 'system',
    status: 'active',
    runtime: { mode: 'async', planner: 'workflow', timeoutMs: 600000, maxSteps: 12 },
    capabilities: {
      allowedTools: ['notebooklm_process', 'notebooklm_status', 'notebooklm_health'],
      artifactTypes: ['flashcards', 'mindmap', 'quiz', 'report', 'summary', 'audio', 'video', 'slide_deck', 'data_table']
    },
    permissions: { confirmationMode: 'never', sideEffects: [] },
    output: { primaryType: 'report' }
  },

  coreInstructions: `---
name: notebooklm-learning
description: 使用 NotebookLM 从各种来源生成学习内容
allowed-tools: notebooklm_process notebooklm_status notebooklm_health
---

## NotebookLM 学习内容生成技能

你可以使用 NotebookLM 从用户提供的内容来源生成结构化的学习材料。

### 支持的来源类型
- **网页 URL**: 任何可访问的网页链接
- **YouTube 视频**: YouTube 视频链接（会自动提取字幕）
- **PDF 文件**: 用户上传的 PDF 文档
- **纯文本**: 用户直接输入的文本内容

### 支持的输出类型
1. **闪卡 (flashcards)**: 问答形式的学习卡片，适合记忆和复习
2. **脑图 (mindmap)**: 树形结构的知识图谱，展示概念关系
3. **测验 (quiz)**: 选择题形式的测验，包含答案和解释
4. **报告 (report)**: 结构化的内容摘要报告，包含章节和要点
5. **摘要 (summary)**: 简洁的内容总结和核心要点
6. **音频概览 (audio)**: AI 生成的播客式音频讨论，两位主持人深入探讨内容
7. **视频概览 (video)**: AI 生成的视频摘要，包含幻灯片和讲解
8. **信息图 (infographic)**: 可视化的信息图表，展示关键数据和概念
9. **演示文稿 (slide_deck)**: PPT 格式的演示文稿，可直接下载使用
10. **数据表格 (data_table)**: CSV 格式的结构化数据表格

### 使用流程
1. 识别用户想要的输出类型
2. 获取用户的内容来源（URL/视频链接/文本）
3. 调用 notebooklm_process 工具提交处理任务
4. 使用 notebooklm_status 工具查询处理状态
5. 处理完成后，以用户友好的方式展示结果

### 工具使用指南
- 当用户提供来源并请求生成学习内容时，使用 \`notebooklm_process\` 工具
- 当需要查询任务进度或获取结果时，使用 \`notebooklm_status\` 工具
- 当处理失败或用户询问服务状态时，使用 \`notebooklm_health\` 工具
- 处理时间因类型而异：
  - 闪卡/测验/摘要：约 30-60 秒
  - 脑图/报告/信息图/演示文稿：约 60-120 秒
  - 音频概览：约 2-5 分钟
  - 视频概览：约 5-10 分钟

### 多账号和故障转移
- 系统配置了多个 NotebookLM 账号，会自动进行负载均衡
- 如果一个账号失败，系统会自动切换到其他可用账号
- 可以使用 notebooklm_health 工具查看当前账号状态

### 响应格式建议
- 闪卡：以卡片形式展示，问题在前，答案在后
- 脑图：描述层级结构，或提供可视化建议
- 测验：逐题展示，隐藏答案直到用户请求
- 报告：按章节展示，突出关键要点
- 摘要：简洁明了，列出核心观点
- 音频/视频：提供播放链接或下载选项
- 信息图：直接展示图片
- 演示文稿：提供下载链接
- 数据表格：以表格形式展示或提供下载
`,

  supplementaryContent: {
    examples: [
      '用户: "帮我把这个链接生成闪卡 https://example.com/article"\n助手: 好的，我来为您生成闪卡。[调用 notebooklm_process]',
      '用户: "用这个视频做个脑图 https://youtube.com/watch?v=xxx"\n助手: 正在处理您的 YouTube 视频，生成脑图大约需要 30 秒...',
      '用户: "把这段文字做成测验题"\n助手: 请提供您想要生成测验的文字内容。',
    ],
    edgeCases: `
- 如果用户没有提供来源，询问他们想要处理什么内容
- 如果来源无法访问，告知用户并建议检查链接
- 如果处理失败，解释可能的原因并建议重试
- 对于很长的内容，提醒用户处理可能需要更长时间
`,
    bestPractices: `
- 在开始处理前确认用户的需求
- 提供预估的处理时间
- 处理完成后询问是否需要其他格式
- 对于闪卡和测验，询问是否需要调整数量
`,
    commonMistakes: `
- 不要在没有来源的情况下尝试生成内容
- 不要假设用户想要的输出类型，如果不确定就询问
- 不要忘记告知用户处理状态
`,
  },

  associatedTools: ['notebooklm_process', 'notebooklm_status', 'notebooklm_health'],

  toolGuidelines: `
### notebooklm_process
用于提交内容处理任务。参数：
- source.type: 'url' | 'youtube' | 'pdf' | 'text'
- source.content: URL 或文本内容
- outputType: 'flashcards' | 'mindmap' | 'report' | 'quiz' | 'summary' | 'audio' | 'video' | 'infographic' | 'slide_deck' | 'data_table'
- options.language: 'zh-CN' | 'en-US' (可选)
- options.maxItems: 数量限制 (可选，用于闪卡/测验)
- options.instructions: 自定义指令 (可选，用于音频/视频/信息图/演示文稿)
- options.timeout: 超时时间秒数 (可选，默认 120 秒，音频/视频建议 300-600 秒)

### notebooklm_status
用于查询任务状态。参数：
- taskId: 任务 ID（从 notebooklm_process 返回）

返回状态：
- queued: 排队中
- processing: 处理中
- completed: 已完成（包含结果）
- failed: 失败（包含错误信息）

### notebooklm_health
用于检查服务健康状态和账号可用性。无需参数。

返回信息：
- status: 服务状态 (ok/degraded/error)
- accountsAvailable: 可用账号数量
- accountsTotal: 总账号数量
- stats: 处理统计（请求数、成功率、平均处理时间）

使用场景：
- 在处理失败时检查服务状态
- 用户询问服务是否可用时
- 需要了解当前系统负载时
`,
};

/**
 * Get NotebookLM skill definition
 */
export function getNotebookLMSkill(): AgentSkillDefinition {
  return notebookLMSkill;
}

/**
 * Check if input matches NotebookLM skill triggers
 */
export function matchesNotebookLMTriggers(input: string): boolean {
  const normalizedInput = input.toLowerCase();
  return notebookLMSkill.metadata.triggers.some(trigger =>
    normalizedInput.includes(trigger.toLowerCase())
  );
}

/**
 * Get matched triggers from input
 */
export function getMatchedTriggers(input: string): string[] {
  const normalizedInput = input.toLowerCase();
  return notebookLMSkill.metadata.triggers.filter(trigger =>
    normalizedInput.includes(trigger.toLowerCase())
  );
}
