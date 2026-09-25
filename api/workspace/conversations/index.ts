/**
 * Workspace Conversations API - List & Create
 * GET: List all conversations
 * POST: Create a new conversation
 */

import { SupabaseClient } from '@supabase/supabase-js';
import {
  getUserIdFromRequest,
  getSessionIdFromRequest,
  getCorsHeadersForRequest,
  getSupabaseAdmin
} from '../../utils/auth';

export const config = {
  runtime: 'edge'
};

const CONVERSATION_RETENTION_DAYS = 7;
const MAX_CONVERSATION_LIST = 50;
const DEBUG_LOG =
  typeof process !== 'undefined' && process.env.NODE_ENV !== 'production';

const debugLog = (...args: unknown[]): void => {
  if (DEBUG_LOG) {
    console.log(...args);
  }
};

interface ConversationListRow {
  id: string;
  title: string;
  message_count: number | null;
  project_id: string | null;
  created_at: string;
  updated_at: string;
}

function getErrorDetails(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const maybeError = error as {
      message?: string;
      code?: string;
    };
    return maybeError.message || maybeError.code || 'Unknown error';
  }
  return 'Unknown error';
}

async function cleanupOldConversations(
  sb: SupabaseClient,
  userId: string | null,
  sessionId: string | null
): Promise<void> {
  const cutoff = new Date(
    Date.now() - CONVERSATION_RETENTION_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  let cleanupQuery = sb.from('conversations').delete().lt('updated_at', cutoff);

  if (userId) {
    cleanupQuery = cleanupQuery.eq('user_id', userId);
  } else if (sessionId) {
    cleanupQuery = cleanupQuery.eq('session_id', sessionId);
  } else {
    return;
  }

  const { error } = await cleanupQuery;
  if (error) {
    console.warn('[API] Cleanup old conversations failed:', error.message);
  }
}

// 使用共享的 Supabase Admin 客户端
function getSupabase(): SupabaseClient | null {
  return getSupabaseAdmin();
}

export default async function handler(request: Request) {
  const corsHeaders = getCorsHeadersForRequest(request);

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // GET: List all conversations
  if (request.method === 'GET') {
    try {
      const sb = getSupabase();
      if (!sb) {
        return new Response(JSON.stringify({ conversations: [] }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const userId = await getUserIdFromRequest(request);
      const sessionId = getSessionIdFromRequest(request);

      // 解析查询参数
      const url = new URL(request.url);
      const projectId = url.searchParams.get('project_id');

      debugLog('[API] Conversations GET - projectId:', projectId);

      const cutoff = new Date(
        Date.now() - CONVERSATION_RETENTION_DAYS * 24 * 60 * 60 * 1000
      ).toISOString();

      // 性能优化：列表只读派生计数，不返回完整 messages JSON。
      let query = sb
        .from('conversations')
        .select('id, title, created_at, updated_at, project_id, message_count')
        .gte('updated_at', cutoff)
        .order('updated_at', { ascending: false })
        .limit(MAX_CONVERSATION_LIST); // 限制返回数量，避免一次加载过多

      if (projectId) {
        query = query.eq('project_id', projectId);
      }

      if (userId) {
        // 登录用户：只返回该用户的数据
        query = query.eq('user_id', userId);
      } else if (sessionId) {
        // 未登录用户：返回该会话的数据
        query = query.eq('session_id', sessionId);
      } else {
        // 无身份标识：返回空
        return new Response(JSON.stringify({ conversations: [] }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { data, error } = await query;

      if (error) throw error;

      // 懒清理旧对话（7天前），不阻塞列表响应
      void cleanupOldConversations(sb, userId, sessionId);

      const rows = (data || []) as ConversationListRow[];
      const formatted = rows.map((c) => ({
        id: c.id,
        title: c.title,
        messageCount: Number(c.message_count || 0),
        projectId: c.project_id,
        createdAt: new Date(c.created_at).getTime(),
        updatedAt: new Date(c.updated_at).getTime()
      }));

      return new Response(JSON.stringify({ conversations: formatted }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error('[API] Get conversations error:', error);
      return new Response(JSON.stringify({ error: '获取对话列表失败' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }

  // POST: Create a new conversation
  if (request.method === 'POST') {
    try {
      const body = (await request.json()) as {
        title?: string;
        messages?: unknown[];
        project_id?: string;
      };
      const { title, messages, project_id } = body;

      if (!title) {
        return new Response(JSON.stringify({ error: '标题不能为空' }), {
          status: 400,
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

      const userId = await getUserIdFromRequest(request);
      const sessionId = getSessionIdFromRequest(request);
      if (!userId && !sessionId) {
        return new Response(JSON.stringify({ error: '请先登录或提供会话标识' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      if (project_id && !userId) {
        return new Response(JSON.stringify({ error: '项目对话需要登录' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      if (project_id && userId) {
        const { data: project, error: projectError } = await sb
          .from('workspace_projects')
          .select('id')
          .eq('id', project_id)
          .eq('user_id', userId)
          .maybeSingle();

        if (projectError || !project) {
          return new Response(
            JSON.stringify({ error: '无权访问指定项目或项目不存在' }),
            {
              status: 403,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
          );
        }
      }

      const { data, error } = await sb
        .from('conversations')
        .insert({
          title,
          messages: messages || [],
          user_id: userId,
          session_id: userId ? null : sessionId,
          project_id: project_id || null
        })
        .select()
        .single();

      if (error) throw error;

      void cleanupOldConversations(sb, userId, sessionId);

      debugLog('[API] Conversation created:', data.id);
      return new Response(JSON.stringify({ id: data.id, success: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } catch (error: unknown) {
      console.error('[API] Create conversation error:', {
        details: getErrorDetails(error),
        full: JSON.stringify(error)
      });
      return new Response(
        JSON.stringify({
          error: '创建对话失败',
          details: getErrorDetails(error)
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }
  }

  // Method not allowed
  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}
