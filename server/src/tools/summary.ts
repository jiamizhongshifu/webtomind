/**
 * Summary (卡片) 工具模块
 * 提供 Agent 读取、创建、更新、删除用户卡片的能力
 *
 * 核心约束：
 * - 项目隔离：只能操作当前项目中的卡片
 * - 写操作需用户确认（通过 SSE 事件）
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { ToolResult } from '../types/api.js';
import type { ToolContext } from './save-note.js';

// ============================================
// 类型定义
// ============================================

interface SummaryRecord {
  id: string;
  title: string;
  url: string | null;
  markdown: string;
  tags: string[];
  project_id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
}

export interface SummaryListParams {
  limit?: number;
  offset?: number;
  tags?: string[];
}

export interface SummarySearchParams {
  query: string;
  limit?: number;
}

export interface SummaryGetParams {
  id: string;
}

// 部分查询结果类型
interface SummaryListItem {
  id: string;
  title: string;
  url: string | null;
  tags: string[];
  created_at: string;
}

interface SummarySearchItem extends SummaryListItem {
  markdown: string;
}

// SSE 事件发送函数类型
type SendEventFn = (event: string, data: unknown) => void;

// ============================================
// Supabase 客户端
// ============================================

let supabase: SupabaseClient | null = null;

function getSupabase(): SupabaseClient | null {
  if (!supabase) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    if (!url || !key) return null;
    supabase = createClient(url, key);
  }
  return supabase;
}

// ============================================
// 工具定义 (Anthropic 格式)
// ============================================

export const summaryListDefinition = {
  name: 'summary_list',
  description: '列出当前项目的卡片列表。只能查看当前项目中的卡片。',
  input_schema: {
    type: 'object' as const,
    properties: {
      limit: {
        type: 'number',
        description: '返回数量（默认 10，最大 50）',
      },
      offset: {
        type: 'number',
        description: '偏移量（用于分页）',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: '按标签筛选（可选）',
      },
    },
    required: [],
  },
};

export const summarySearchDefinition = {
  name: 'summary_search',
  description: '在当前项目中搜索卡片。支持标题和内容关键词匹配。',
  input_schema: {
    type: 'object' as const,
    properties: {
      query: {
        type: 'string',
        description: '搜索关键词（必填）',
      },
      limit: {
        type: 'number',
        description: '返回数量（默认 10）',
      },
    },
    required: ['query'],
  },
};

export const summaryGetDefinition = {
  name: 'summary_get',
  description: '获取卡片详情。只能获取当前项目中的卡片。',
  input_schema: {
    type: 'object' as const,
    properties: {
      id: {
        type: 'string',
        description: '卡片 ID（必填）',
      },
    },
    required: ['id'],
  },
};

// ============================================
// 读取工具实现
// ============================================

/**
 * 列出当前项目的卡片
 */
export async function executeSummaryList(
  params: SummaryListParams,
  context: ToolContext
): Promise<ToolResult> {
  const { userId, projectId } = context;

  if (!userId) {
    return { success: false, error: '请先登录' };
  }

  if (!projectId) {
    return { success: false, error: '请先选择一个项目' };
  }

  const sb = getSupabase();
  if (!sb) {
    return { success: false, error: '数据库未配置' };
  }

  try {
    const limit = Math.min(Math.max(params.limit || 10, 1), 50);
    const offset = params.offset || 0;

    let query = sb
      .from('summaries')
      .select('id, title, url, tags, created_at', { count: 'exact' })
      .eq('user_id', userId)
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // 标签筛选
    if (params.tags && params.tags.length > 0) {
      query = query.contains('tags', params.tags);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('[SummaryList] Database error:', error);
      return { success: false, error: '查询失败' };
    }

    const summaries = (data || []).map((s: SummaryListItem) => ({
      id: s.id,
      title: s.title,
      url: s.url,
      tags: s.tags || [],
      createdAt: new Date(s.created_at).getTime(),
    }));

    return {
      success: true,
      data: {
        summaries,
        total: count || 0,
        hasMore: (count || 0) > offset + limit,
        projectId,
      },
    };
  } catch (error) {
    console.error('[SummaryList] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '查询失败',
    };
  }
}

/**
 * 搜索当前项目的卡片
 */
export async function executeSummarySearch(
  params: SummarySearchParams,
  context: ToolContext
): Promise<ToolResult> {
  const { userId, projectId } = context;

  if (!userId) {
    return { success: false, error: '请先登录' };
  }

  if (!projectId) {
    return { success: false, error: '请先选择一个项目' };
  }

  if (!params.query || params.query.trim().length === 0) {
    return { success: false, error: '搜索关键词不能为空' };
  }

  const sb = getSupabase();
  if (!sb) {
    return { success: false, error: '数据库未配置' };
  }

  try {
    const limit = Math.min(params.limit || 10, 50);
    const searchQuery = params.query.trim();

    // 转义 SQL LIKE 特殊字符，防止 SQL 注入
    const escapedQuery = searchQuery.replace(/[%_\\]/g, '\\$&');

    // 使用 ilike 进行模糊搜索（标题和内容）
    const { data, error } = await sb
      .from('summaries')
      .select('id, title, url, tags, markdown, created_at')
      .eq('user_id', userId)
      .eq('project_id', projectId)
      .or(`title.ilike.%${escapedQuery}%,markdown.ilike.%${escapedQuery}%`)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[SummarySearch] Database error:', error);
      return { success: false, error: '搜索失败' };
    }

    const summaries = (data || []).map((s: SummarySearchItem) => ({
      id: s.id,
      title: s.title,
      url: s.url,
      tags: s.tags || [],
      // 返回内容摘要（前 200 字符）
      excerpt: s.markdown ? s.markdown.substring(0, 200) + (s.markdown.length > 200 ? '...' : '') : '',
      createdAt: new Date(s.created_at).getTime(),
    }));

    return {
      success: true,
      data: {
        summaries,
        query: searchQuery,
        count: summaries.length,
        projectId,
      },
    };
  } catch (error) {
    console.error('[SummarySearch] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '搜索失败',
    };
  }
}

/**
 * 获取卡片详情
 */
export async function executeSummaryGet(
  params: SummaryGetParams,
  context: ToolContext
): Promise<ToolResult> {
  const { userId, projectId } = context;

  if (!userId) {
    return { success: false, error: '请先登录' };
  }

  if (!projectId) {
    return { success: false, error: '请先选择一个项目' };
  }

  if (!params.id) {
    return { success: false, error: '卡片 ID 不能为空' };
  }

  const sb = getSupabase();
  if (!sb) {
    return { success: false, error: '数据库未配置' };
  }

  try {
    const { data, error } = await sb
      .from('summaries')
      .select('*')
      .eq('id', params.id)
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      return { success: false, error: '卡片不存在' };
    }

    // 验证项目归属
    if (data.project_id !== projectId) {
      return { success: false, error: '该卡片不在当前项目中，无法访问' };
    }

    const summary = data as SummaryRecord;

    return {
      success: true,
      data: {
        summary: {
          id: summary.id,
          title: summary.title,
          url: summary.url,
          markdown: summary.markdown,
          tags: summary.tags || [],
          projectId: summary.project_id,
          createdAt: new Date(summary.created_at).getTime(),
          updatedAt: new Date(summary.updated_at).getTime(),
        },
      },
    };
  } catch (error) {
    console.error('[SummaryGet] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '获取失败',
    };
  }
}

// ============================================
// 写入工具定义 (需用户确认)
// ============================================

export interface SummaryCreateParams {
  title: string;
  content: string;
  url?: string;
  tags?: string[];
}

export interface SummaryUpdateParams {
  id: string;
  title?: string;
  content?: string;
  tags?: string[];
}

export interface SummaryDeleteParams {
  id: string;
}

export const summaryCreateDefinition = {
  name: 'summary_create',
  description: '在当前项目中创建新卡片。需要用户确认后才会执行。',
  input_schema: {
    type: 'object' as const,
    properties: {
      title: {
        type: 'string',
        description: '卡片标题（必填）',
      },
      content: {
        type: 'string',
        description: '卡片内容，Markdown 格式（必填）',
      },
      url: {
        type: 'string',
        description: '来源 URL（可选）',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: '标签列表（可选）',
      },
    },
    required: ['title', 'content'],
  },
};

export const summaryUpdateDefinition = {
  name: 'summary_update',
  description: '更新当前项目中的卡片。需要用户确认后才会执行。',
  input_schema: {
    type: 'object' as const,
    properties: {
      id: {
        type: 'string',
        description: '卡片 ID（必填）',
      },
      title: {
        type: 'string',
        description: '新标题（可选）',
      },
      content: {
        type: 'string',
        description: '新内容（可选）',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: '新标签（可选）',
      },
    },
    required: ['id'],
  },
};

export const summaryDeleteDefinition = {
  name: 'summary_delete',
  description: '删除当前项目中的卡片。需要用户确认后才会执行。',
  input_schema: {
    type: 'object' as const,
    properties: {
      id: {
        type: 'string',
        description: '卡片 ID（必填）',
      },
    },
    required: ['id'],
  },
};

// ============================================
// 写入工具实现 (发送预览事件，等待用户确认)
// ============================================

/**
 * 创建卡片（发送预览事件）
 */
export async function executeSummaryCreate(
  params: SummaryCreateParams,
  context: ToolContext,
  sendEvent?: SendEventFn
): Promise<ToolResult> {
  const { userId, projectId } = context;

  if (!userId) {
    return { success: false, error: '请先登录' };
  }

  if (!projectId) {
    return { success: false, error: '请先选择一个项目' };
  }

  if (!params.title || params.title.trim().length === 0) {
    return { success: false, error: '标题不能为空' };
  }

  if (!params.content || params.content.trim().length === 0) {
    return { success: false, error: '内容不能为空' };
  }

  // 构建预览数据
  const summaryPreview = {
    title: params.title.trim(),
    content: params.content.trim(),
    url: params.url || null,
    tags: (params.tags || []).map(t => t.trim()).filter(t => t.length > 0),
    projectId,
  };

  // 发送预览事件到前端，等待用户确认
  if (sendEvent) {
    sendEvent('summary_create_preview', { summaryPreview });
  }

  return {
    success: true,
    data: {
      message: '已发送创建预览到前端，等待用户确认',
      summaryPreview,
      requiresConfirmation: true,
    },
  };
}

/**
 * 更新卡片（发送预览事件）
 */
export async function executeSummaryUpdate(
  params: SummaryUpdateParams,
  context: ToolContext,
  sendEvent?: SendEventFn
): Promise<ToolResult> {
  const { userId, projectId } = context;

  if (!userId) {
    return { success: false, error: '请先登录' };
  }

  if (!projectId) {
    return { success: false, error: '请先选择一个项目' };
  }

  if (!params.id) {
    return { success: false, error: '卡片 ID 不能为空' };
  }

  // 检查是否有更新内容
  if (!params.title && !params.content && !params.tags) {
    return { success: false, error: '请提供要更新的内容' };
  }

  const sb = getSupabase();
  if (!sb) {
    return { success: false, error: '数据库未配置' };
  }

  try {
    // 获取原始卡片
    const { data: original, error } = await sb
      .from('summaries')
      .select('*')
      .eq('id', params.id)
      .eq('user_id', userId)
      .single();

    if (error || !original) {
      return { success: false, error: '卡片不存在' };
    }

    // 验证项目归属
    if (original.project_id !== projectId) {
      return { success: false, error: '该卡片不在当前项目中，无法修改' };
    }

    // 构建更新数据
    const updated = {
      title: params.title?.trim() || original.title,
      content: params.content?.trim() || original.markdown,
      tags: params.tags || original.tags,
    };

    // 发送更新预览事件
    if (sendEvent) {
      sendEvent('summary_update_preview', {
        id: params.id,
        original: {
          title: original.title,
          content: original.markdown,
          tags: original.tags || [],
        },
        updated,
        projectId,
      });
    }

    return {
      success: true,
      data: {
        message: '已发送更新预览到前端，等待用户确认',
        id: params.id,
        requiresConfirmation: true,
      },
    };
  } catch (error) {
    console.error('[SummaryUpdate] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '获取卡片失败',
    };
  }
}

/**
 * 删除卡片（发送确认事件）
 */
export async function executeSummaryDelete(
  params: SummaryDeleteParams,
  context: ToolContext,
  sendEvent?: SendEventFn
): Promise<ToolResult> {
  const { userId, projectId } = context;

  if (!userId) {
    return { success: false, error: '请先登录' };
  }

  if (!projectId) {
    return { success: false, error: '请先选择一个项目' };
  }

  if (!params.id) {
    return { success: false, error: '卡片 ID 不能为空' };
  }

  const sb = getSupabase();
  if (!sb) {
    return { success: false, error: '数据库未配置' };
  }

  try {
    // 获取卡片信息
    const { data: summary, error } = await sb
      .from('summaries')
      .select('id, title, url, tags, project_id')
      .eq('id', params.id)
      .eq('user_id', userId)
      .single();

    if (error || !summary) {
      return { success: false, error: '卡片不存在' };
    }

    // 验证项目归属
    if (summary.project_id !== projectId) {
      return { success: false, error: '该卡片不在当前项目中，无法删除' };
    }

    // 发送删除确认事件
    if (sendEvent) {
      sendEvent('summary_delete_confirm', {
        summary: {
          id: summary.id,
          title: summary.title,
          url: summary.url,
          tags: summary.tags || [],
        },
        projectId,
      });
    }

    return {
      success: true,
      data: {
        message: '已发送删除确认到前端，等待用户确认',
        id: params.id,
        requiresConfirmation: true,
      },
    };
  } catch (error) {
    console.error('[SummaryDelete] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '获取卡片失败',
    };
  }
}

// ============================================
// 实际执行函数（用户确认后调用）
// ============================================

/**
 * 实际创建卡片（用户确认后调用）
 */
export async function confirmSummaryCreate(
  params: SummaryCreateParams,
  context: ToolContext
): Promise<ToolResult> {
  const { userId, projectId } = context;

  if (!userId || !projectId) {
    return { success: false, error: '缺少用户或项目信息' };
  }

  const sb = getSupabase();
  if (!sb) {
    return { success: false, error: '数据库未配置' };
  }

  try {
    const { data, error } = await sb
      .from('summaries')
      .insert({
        user_id: userId,
        project_id: projectId,
        title: params.title.trim(),
        markdown: params.content.trim(),
        url: params.url || null,
        tags: (params.tags || []).map(t => t.trim()).filter(t => t.length > 0),
      })
      .select('id, title')
      .single();

    if (error) {
      console.error('[SummaryCreate] Database error:', error);
      return { success: false, error: '创建失败' };
    }

    console.log(`[Summary] CREATE by user ${userId} in project ${projectId}: ${data.id}`);

    return {
      success: true,
      data: {
        id: data.id,
        title: data.title,
        message: `卡片「${data.title}」已创建`,
      },
    };
  } catch (error) {
    console.error('[SummaryCreate] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '创建失败',
    };
  }
}

/**
 * 实际更新卡片（用户确认后调用）
 */
export async function confirmSummaryUpdate(
  id: string,
  updates: { title?: string; content?: string; tags?: string[] },
  context: ToolContext
): Promise<ToolResult> {
  const { userId, projectId } = context;

  if (!userId || !projectId) {
    return { success: false, error: '缺少用户或项目信息' };
  }

  const sb = getSupabase();
  if (!sb) {
    return { success: false, error: '数据库未配置' };
  }

  try {
    const updateData: Record<string, unknown> = {};
    if (updates.title) updateData.title = updates.title.trim();
    if (updates.content) updateData.markdown = updates.content.trim();
    if (updates.tags) updateData.tags = updates.tags;

    const { data, error } = await sb
      .from('summaries')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', userId)
      .eq('project_id', projectId)
      .select('id, title')
      .single();

    if (error) {
      console.error('[SummaryUpdate] Database error:', error);
      return { success: false, error: '更新失败' };
    }

    console.log(`[Summary] UPDATE by user ${userId} in project ${projectId}: ${data.id}`);

    return {
      success: true,
      data: {
        id: data.id,
        title: data.title,
        message: `卡片「${data.title}」已更新`,
      },
    };
  } catch (error) {
    console.error('[SummaryUpdate] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '更新失败',
    };
  }
}

/**
 * 实际删除卡片（用户确认后调用）
 */
export async function confirmSummaryDelete(
  id: string,
  context: ToolContext
): Promise<ToolResult> {
  const { userId, projectId } = context;

  if (!userId || !projectId) {
    return { success: false, error: '缺少用户或项目信息' };
  }

  const sb = getSupabase();
  if (!sb) {
    return { success: false, error: '数据库未配置' };
  }

  try {
    const { error } = await sb
      .from('summaries')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
      .eq('project_id', projectId);

    if (error) {
      console.error('[SummaryDelete] Database error:', error);
      return { success: false, error: '删除失败' };
    }

    console.log(`[Summary] DELETE by user ${userId} in project ${projectId}: ${id}`);

    return {
      success: true,
      data: {
        id,
        message: '卡片已删除',
      },
    };
  } catch (error) {
    console.error('[SummaryDelete] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '删除失败',
    };
  }
}

// ============================================
// 导出所有工具定义
// ============================================

export const summaryToolDefinitions = [
  summaryListDefinition,
  summarySearchDefinition,
  summaryGetDefinition,
  summaryCreateDefinition,
  summaryUpdateDefinition,
  summaryDeleteDefinition,
];
