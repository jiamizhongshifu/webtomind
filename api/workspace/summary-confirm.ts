/**
 * Summary 确认执行 API
 * 用户确认后调用此 API 执行实际的创建/更新/删除操作
 */

import { SupabaseClient } from '@supabase/supabase-js';
import {
  getCorsHeadersForRequest,
  getSupabaseAdmin,
  verifyTokenAndGetUserId,
} from '../utils/auth';
import { debugLog, safeErrorLog } from '../utils/logging';

export const config = {
  runtime: 'edge',
};

// ============================================
// 内联工具函数 (Edge Function 不能引用 server 目录)
// ============================================

function handleCorsPreflightRequest(corsHeaders: Record<string, string>): Response {
  return new Response(null, { status: 204, headers: corsHeaders });
}

function jsonResponse(
  data: unknown,
  corsHeaders: Record<string, string>,
  status: number = 200
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function errorResponse(
  error: string,
  corsHeaders: Record<string, string>,
  status: number = 500
): Response {
  return jsonResponse({ error }, corsHeaders, status);
}

function createErrors(corsHeaders: Record<string, string>) {
  return {
    unauthorized: (message: string = '请先登录') =>
      errorResponse(message, corsHeaders, 401),
    badRequest: (message: string = '请求参数错误') =>
      errorResponse(message, corsHeaders, 400),
    methodNotAllowed: () => errorResponse('Method not allowed', corsHeaders, 405),
    serverError: (message: string = '服务器内部错误') =>
      errorResponse(message, corsHeaders, 500),
  };
}

async function getVerifiedUserIdFromRequest(request: Request): Promise<string | null> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;
  return verifyTokenAndGetUserId(token);
}

// ============================================
// Supabase 客户端
// ============================================

let supabase: SupabaseClient | null = null;

function getSupabase(): SupabaseClient | null {
  if (!supabase) supabase = getSupabaseAdmin();
  return supabase;
}

// ============================================
// Summary 确认操作
// ============================================

interface ToolContext {
  userId: string;
  projectId: string;
}

interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

async function confirmSummaryCreate(
  params: { title: string; content: string; url?: string; tags?: string[] },
  context: ToolContext
): Promise<ToolResult> {
  const { userId, projectId } = context;
  const sb = getSupabase();
  if (!sb) return { success: false, error: '数据库未配置' };

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
      safeErrorLog('[SummaryCreate] Database error', error);
      return { success: false, error: '创建失败' };
    }

    debugLog('[Summary] CREATE completed', {
      hasId: !!data.id,
      titleLength: data.title.length,
    });

    return {
      success: true,
      data: { id: data.id, title: data.title, message: `卡片「${data.title}」已创建` },
    };
  } catch (error) {
    safeErrorLog('[SummaryCreate] Error', error);
    return { success: false, error: error instanceof Error ? error.message : '创建失败' };
  }
}

async function confirmSummaryUpdate(
  id: string,
  updates: { title?: string; content?: string; tags?: string[] },
  context: ToolContext
): Promise<ToolResult> {
  const { userId, projectId } = context;
  const sb = getSupabase();
  if (!sb) return { success: false, error: '数据库未配置' };

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
      safeErrorLog('[SummaryUpdate] Database error', error);
      return { success: false, error: '更新失败' };
    }

    debugLog('[Summary] UPDATE completed', {
      hasId: !!data.id,
      titleLength: data.title.length,
    });

    return {
      success: true,
      data: { id: data.id, title: data.title, message: `卡片「${data.title}」已更新` },
    };
  } catch (error) {
    safeErrorLog('[SummaryUpdate] Error', error);
    return { success: false, error: error instanceof Error ? error.message : '更新失败' };
  }
}

async function confirmSummaryDelete(id: string, context: ToolContext): Promise<ToolResult> {
  const { userId, projectId } = context;
  const sb = getSupabase();
  if (!sb) return { success: false, error: '数据库未配置' };

  try {
    const { error } = await sb
      .from('summaries')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
      .eq('project_id', projectId);

    if (error) {
      safeErrorLog('[SummaryDelete] Database error', error);
      return { success: false, error: '删除失败' };
    }

    debugLog('[Summary] DELETE completed');

    return { success: true, data: { id, message: '卡片已删除' } };
  } catch (error) {
    safeErrorLog('[SummaryDelete] Error', error);
    return { success: false, error: error instanceof Error ? error.message : '删除失败' };
  }
}

// ============================================
// API Handler
// ============================================

interface ConfirmRequestBody {
  action: 'create' | 'update' | 'delete';
  projectId: string;
  data: {
    title?: string;
    content?: string;
    url?: string;
    tags?: string[];
    id?: string;
  };
}

async function ensureProjectOwnedByUser(
  userId: string,
  projectId: string
): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;

  const { data, error } = await sb
    .from('workspace_projects')
    .select('id')
    .eq('id', projectId)
    .eq('user_id', userId)
    .maybeSingle();

  return !error && !!data;
}

export default async function handler(request: Request) {
  const corsHeaders = getCorsHeadersForRequest(request);
  const errors = createErrors(corsHeaders);

  if (request.method === 'OPTIONS') {
    return handleCorsPreflightRequest(corsHeaders);
  }

  if (request.method !== 'POST') {
    return errors.methodNotAllowed();
  }

  const userId = await getVerifiedUserIdFromRequest(request);
  if (!userId) {
    return errors.unauthorized();
  }

  const sb = getSupabase();
  if (!sb) {
    return errors.serverError('数据库未配置');
  }

  try {
    const body = await request.json() as ConfirmRequestBody;
    const { action, projectId, data } = body;

    if (!action || !projectId) {
      return errors.badRequest('缺少必要参数');
    }

    const hasProjectAccess = await ensureProjectOwnedByUser(userId, projectId);
    if (!hasProjectAccess) {
      return errors.badRequest('项目不存在或无权限访问');
    }

    const context = { userId, projectId };

    switch (action) {
      case 'create': {
        if (!data.title || !data.content) {
          return errors.badRequest('创建卡片需要标题和内容');
        }
        const result = await confirmSummaryCreate(
          { title: data.title, content: data.content, url: data.url, tags: data.tags },
          context
        );
        if (!result.success) {
          return errors.badRequest(result.error || '创建失败');
        }
        return jsonResponse(result.data, corsHeaders);
      }

      case 'update': {
        if (!data.id) {
          return errors.badRequest('更新卡片需要 ID');
        }
        const updates: { title?: string; content?: string; tags?: string[] } = {};
        if (data.title) updates.title = data.title;
        if (data.content) updates.content = data.content;
        if (data.tags) updates.tags = data.tags;

        const result = await confirmSummaryUpdate(data.id, updates, context);
        if (!result.success) {
          return errors.badRequest(result.error || '更新失败');
        }
        return jsonResponse(result.data, corsHeaders);
      }

      case 'delete': {
        if (!data.id) {
          return errors.badRequest('删除卡片需要 ID');
        }
        const result = await confirmSummaryDelete(data.id, context);
        if (!result.success) {
          return errors.badRequest(result.error || '删除失败');
        }
        return jsonResponse(result.data, corsHeaders);
      }

      default:
        return errors.badRequest('无效的操作类型');
    }
  } catch (error) {
    safeErrorLog('[API] Summary confirm error', error);
    return errors.serverError('操作失败');
  }
}
