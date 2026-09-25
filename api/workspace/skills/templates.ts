/**
 * Skill Templates API
 * GET: 获取预设模板列表
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getCorsHeadersForRequest } from '../../utils/auth';

export const config = {
  runtime: 'edge'
};

let supabase: SupabaseClient | null = null;

function getSupabase(): SupabaseClient | null {
  if (!supabase) {
    const url = process.env.SUPABASE_URL;
    const key =
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    if (!url || !key) return null;
    supabase = createClient(url, key);
  }
  return supabase;
}

export interface SkillTemplate {
  id: string;
  name: string;
  displayName: string;
  description: string | null;
  icon: string;
  triggers: string[];
  coreInstructions: string;
  outputType: string | null;
  associatedTools: string[];
  defaultOptions: Record<string, unknown>;
  category: string;
}

interface SkillTemplateRow {
  id: string;
  name: string;
  display_name: string;
  description: string | null;
  icon: string | null;
  triggers: string[] | null;
  core_instructions: string;
  output_type: string | null;
  associated_tools: string[] | null;
  default_options: Record<string, unknown> | null;
  category: string | null;
}

export default async function handler(request: Request) {
  const corsHeaders = getCorsHeadersForRequest(request);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const sb = getSupabase();
  if (!sb) {
    // 返回内置模板（数据库不可用时的降级方案）
    return new Response(JSON.stringify({ templates: getBuiltInTemplates() }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const { data, error } = await sb
      .from('skill_templates')
      .select('*')
      .order('sort_order', { ascending: true });

    if (error) throw error;

    const rows = (data || []) as SkillTemplateRow[];
    const templates: SkillTemplate[] = rows.map((t) => ({
      id: t.id,
      name: t.name,
      displayName: t.display_name,
      description: t.description,
      icon: t.icon || '📋',
      triggers: t.triggers || [],
      coreInstructions: t.core_instructions,
      outputType: t.output_type,
      associatedTools: t.associated_tools || [],
      defaultOptions: t.default_options || {},
      category: t.category || 'template'
    }));

    // 如果数据库没有模板，返回内置模板
    if (templates.length === 0) {
      return new Response(
        JSON.stringify({ templates: getBuiltInTemplates() }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    return new Response(JSON.stringify({ templates }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('[API] Get skill templates error:', error);
    // 降级返回内置模板
    return new Response(JSON.stringify({ templates: getBuiltInTemplates() }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

/**
 * 内置模板（数据库不可用时的降级方案）
 */
function getBuiltInTemplates(): SkillTemplate[] {
  return [
    {
      id: 'builtin-tech-flashcards',
      name: 'tech_flashcards',
      displayName: '技术文章闪卡',
      description: '将技术文章转换为便于记忆的闪卡',
      icon: '💻',
      triggers: ['技术闪卡', '代码闪卡', '编程闪卡', 'tech flashcards'],
      coreInstructions: `## 技术文章闪卡生成

### 处理流程
1. 提取文章中的核心技术概念
2. 识别代码示例和最佳实践
3. 生成问答形式的闪卡

### 闪卡格式要求
- 问题：简洁明了，聚焦单一概念
- 答案：包含代码示例（如适用）
- 每张卡片聚焦一个知识点

### 特殊处理
- 代码块保持格式
- 术语使用中英对照`,
      outputType: 'flashcards',
      associatedTools: ['notebooklm_process', 'extract_url'],
      defaultOptions: {},
      category: 'content'
    },
    {
      id: 'builtin-paper-report',
      name: 'paper_report',
      displayName: '论文研究报告',
      description: '将学术论文转换为结构化研究报告',
      icon: '📚',
      triggers: ['论文报告', '研究报告', '学术报告', 'paper report'],
      coreInstructions: `## 论文研究报告生成

### 处理流程
1. 提取论文摘要和核心论点
2. 分析研究方法和数据
3. 总结结论和贡献

### 报告结构
- 研究背景
- 核心问题
- 方法论
- 主要发现
- 结论与启示

### 注意事项
- 保持学术严谨性
- 标注关键引用`,
      outputType: 'report',
      associatedTools: ['notebooklm_process', 'extract_url'],
      defaultOptions: {},
      category: 'analysis'
    },
    {
      id: 'builtin-video-mindmap',
      name: 'video_mindmap',
      displayName: '视频笔记脑图',
      description: '将 YouTube 视频转换为思维导图',
      icon: '🎬',
      triggers: ['视频脑图', '视频笔记', 'YouTube脑图', 'video mindmap'],
      coreInstructions: `## 视频笔记脑图生成

### 处理流程
1. 提取视频字幕/内容
2. 识别主要话题和子话题
3. 构建层级结构的思维导图

### 脑图结构
- 根节点：视频主题
- 一级节点：主要章节/话题
- 二级节点：关键要点
- 三级节点：细节/示例

### 特殊处理
- 标注时间戳（如可用）
- 提取关键引用`,
      outputType: 'mindmap',
      associatedTools: ['notebooklm_process'],
      defaultOptions: {},
      category: 'content'
    },
    {
      id: 'builtin-exam-quiz',
      name: 'exam_quiz',
      displayName: '考试复习测验',
      description: '将学习材料转换为测验题',
      icon: '📝',
      triggers: ['考试测验', '复习题', '练习题', 'exam quiz'],
      coreInstructions: `## 考试复习测验生成

### 处理流程
1. 识别核心知识点
2. 生成多种题型
3. 提供详细解析

### 题目类型
- 选择题（单选/多选）
- 判断题
- 填空题

### 质量要求
- 覆盖主要知识点
- 难度适中
- 解析清晰`,
      outputType: 'quiz',
      associatedTools: ['notebooklm_process', 'extract_url'],
      defaultOptions: {},
      category: 'content'
    },
    {
      id: 'builtin-meeting-summary',
      name: 'meeting_summary',
      displayName: '会议纪要摘要',
      description: '将会议内容转换为结构化摘要',
      icon: '📋',
      triggers: ['会议摘要', '会议纪要', '会议总结', 'meeting summary'],
      coreInstructions: `## 会议纪要摘要生成

### 处理流程
1. 识别会议主题和参与者
2. 提取讨论要点
3. 整理决议和待办事项

### 摘要结构
- 会议主题
- 主要讨论点
- 决议事项
- 待办任务（含负责人）
- 下次会议安排

### 注意事项
- 保持客观中立
- 突出行动项`,
      outputType: 'summary',
      associatedTools: ['notebooklm_process'],
      defaultOptions: {},
      category: 'analysis'
    }
  ];
}
