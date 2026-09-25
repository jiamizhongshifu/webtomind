/**
 * Workspace Projects API - List & Create
 * GET: 获取用户所有项目列表
 * POST: 创建新项目
 */

import { SupabaseClient } from '@supabase/supabase-js';
import {
  getUserIdFromRequest,
  getCorsHeadersForRequest,
  getSupabaseAdmin
} from '../../utils/auth';

export const config = {
  runtime: 'edge'
};

const DEBUG_LOG =
  typeof process !== 'undefined' && process.env.NODE_ENV !== 'production';

const debugLog = (...args: unknown[]): void => {
  if (DEBUG_LOG) {
    console.log(...args);
  }
};

// 使用共享的 Supabase Admin 客户端
function getSupabase(): SupabaseClient | null {
  return getSupabaseAdmin();
}

// 项目类型定义
interface ProjectInput {
  name: string;
  description?: string;
  icon?: string;
  color?: string;
}

interface ProjectResponse {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  color: string;
  isDefault: boolean;
  sortOrder: number;
  summaryCount: number;
  conversationCount: number;
  createdAt: number;
  updatedAt: number;
  archivedAt: number | null;
  favoritedAt: number | null;
}

interface WorkspaceProjectRow {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  is_default: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  favorited_at: string | null;
}

function getErrorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const maybeError = error as { message?: string };
    return maybeError.message || 'Unknown error';
  }
  return 'Unknown error';
}

export default async function handler(request: Request) {
  const corsHeaders = getCorsHeadersForRequest(request);

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return new Response(JSON.stringify({ error: '请先登录' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const sb = getSupabase();
  if (!sb) {
    return new Response(JSON.stringify({ error: '数据库未配置' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // GET: 获取所有项目
  if (request.method === 'GET') {
    try {
      // 获取项目列表
      const { data: projects, error: projectsError } = await sb
        .from('workspace_projects')
        .select('*')
        .eq('user_id', userId)
        .order('sort_order', { ascending: true });

      if (projectsError) throw projectsError;

      if (!projects || projects.length === 0) {
        // 用户没有项目，返回空（不应该发生，因为有注册触发器）
        return new Response(JSON.stringify({ projects: [] }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // 获取每个项目的统计数据
      const projectIds = projects.map((p) => p.id);

      // 统计素材数量
      const { data: summaryCounts } = await sb
        .from('summaries')
        .select('project_id')
        .eq('user_id', userId)
        .in('project_id', projectIds);

      // 统计对话数量
      const { data: conversationCounts } = await sb
        .from('conversations')
        .select('project_id')
        .eq('user_id', userId)
        .in('project_id', projectIds);

      // 计算每个项目的数量
      const summaryCountMap = new Map<string, number>();
      const conversationCountMap = new Map<string, number>();

      (summaryCounts || []).forEach((s: { project_id: string }) => {
        const count = summaryCountMap.get(s.project_id) || 0;
        summaryCountMap.set(s.project_id, count + 1);
      });

      (conversationCounts || []).forEach((c: { project_id: string }) => {
        const count = conversationCountMap.get(c.project_id) || 0;
        conversationCountMap.set(c.project_id, count + 1);
      });

      // 格式化响应
      const rows = projects as WorkspaceProjectRow[];
      const formatted: ProjectResponse[] = rows.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        icon: p.icon || '📁',
        color: p.color || '#6366f1',
        isDefault: p.is_default,
        sortOrder: p.sort_order,
        summaryCount: summaryCountMap.get(p.id) || 0,
        conversationCount: conversationCountMap.get(p.id) || 0,
        createdAt: new Date(p.created_at).getTime(),
        updatedAt: new Date(p.updated_at).getTime(),
        archivedAt: p.archived_at ? new Date(p.archived_at).getTime() : null,
        favoritedAt: p.favorited_at ? new Date(p.favorited_at).getTime() : null
      }));

      return new Response(JSON.stringify({ projects: formatted }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } catch (error: unknown) {
      console.error('[API] Get projects error:', error);
      return new Response(
        JSON.stringify({
          error: '获取项目列表失败',
          details: getErrorMessage(error)
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }
  }

  // POST: 创建新项目
  if (request.method === 'POST') {
    try {
      const body = (await request.json()) as ProjectInput;
      const { name, description, icon, color } = body;

      if (!name || name.trim().length === 0) {
        return new Response(JSON.stringify({ error: '项目名称不能为空' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      if (name.length > 100) {
        return new Response(
          JSON.stringify({ error: '项目名称不能超过100个字符' }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }

      // 获取当前最大排序值
      const { data: maxOrder } = await sb
        .from('workspace_projects')
        .select('sort_order')
        .eq('user_id', userId)
        .order('sort_order', { ascending: false })
        .limit(1)
        .single();

      const newSortOrder = (maxOrder?.sort_order ?? -1) + 1;

      // 创建项目
      const { data, error } = await sb
        .from('workspace_projects')
        .insert({
          user_id: userId,
          name: name.trim(),
          description: description?.trim() || null,
          icon: icon || '📁',
          color: color || '#6366f1',
          is_default: false,
          sort_order: newSortOrder
        })
        .select()
        .single();

      if (error) throw error;

      debugLog('[API] Project created:', data.id);

      const response: ProjectResponse = {
        id: data.id,
        name: data.name,
        description: data.description,
        icon: data.icon,
        color: data.color,
        isDefault: data.is_default,
        sortOrder: data.sort_order,
        summaryCount: 0,
        conversationCount: 0,
        createdAt: new Date(data.created_at).getTime(),
        updatedAt: new Date(data.updated_at).getTime(),
        archivedAt: data.archived_at
          ? new Date(data.archived_at).getTime()
          : null,
        favoritedAt: data.favorited_at
          ? new Date(data.favorited_at).getTime()
          : null
      };

      return new Response(
        JSON.stringify({ project: response, success: true }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    } catch (error: unknown) {
      console.error('[API] Create project error:', error);
      return new Response(
        JSON.stringify({
          error: '创建项目失败',
          details: getErrorMessage(error)
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}
