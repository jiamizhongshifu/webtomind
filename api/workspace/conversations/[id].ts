/**
 * Workspace Conversations API - Single item operations
 * GET: Get a conversation by ID
 * PATCH: Update a conversation
 * DELETE: Delete a conversation
 */

import { SupabaseClient } from '@supabase/supabase-js';
import {
  getCorsHeadersForRequest,
  getUserIdFromRequest,
  getSessionIdFromRequest,
  getSupabaseAdmin
} from '../../utils/auth';

export const config = {
  runtime: 'edge'
};

const CONVERSATION_RETENTION_DAYS = 7;
const DEBUG_LOG =
  typeof process !== 'undefined' && process.env.NODE_ENV !== 'production';

const debugLog = (...args: unknown[]): void => {
  if (DEBUG_LOG) {
    console.log(...args);
  }
};

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

function getSupabase(): SupabaseClient | null {
  return getSupabaseAdmin();
}

export default async function handler(request: Request) {
  const corsHeaders = getCorsHeadersForRequest(request);

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // Extract ID from URL
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/');
  const id = pathParts[pathParts.length - 1];

  if (!id) {
    return new Response(JSON.stringify({ error: '缺少对话ID' }), {
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

  // GET: Get a conversation by ID
  if (request.method === 'GET') {
    try {
      let query = sb.from('conversations').select('*').eq('id', id);

      // 权限检查
      if (userId) {
        query = query.eq('user_id', userId);
      } else if (sessionId) {
        query = query.eq('session_id', sessionId);
      } else {
        return new Response(JSON.stringify({ error: '无权访问' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { data, error } = await query.single();

      if (error || !data) {
        return new Response(JSON.stringify({ error: '对话不存在' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const formatted = {
        id: data.id,
        title: data.title,
        messages: data.messages || [],
        createdAt: new Date(data.created_at).getTime(),
        updatedAt: new Date(data.updated_at).getTime()
      };

      return new Response(JSON.stringify(formatted), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error('[API] Get conversation error:', error);
      return new Response(JSON.stringify({ error: '获取对话失败' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }

  // PATCH: Update a conversation
  if (request.method === 'PATCH') {
    try {
      const body = (await request.json()) as {
        title?: string;
        messages?: unknown[];
      };
      const { title, messages } = body;

      const updateData: Record<string, unknown> = {
        updated_at: new Date().toISOString()
      };

      if (title !== undefined) updateData.title = title;
      if (messages !== undefined) {
        updateData.messages = messages;
      }

      let query = sb.from('conversations').update(updateData).eq('id', id);

      // 权限检查
      if (userId) {
        query = query.eq('user_id', userId);
      } else if (sessionId) {
        query = query.eq('session_id', sessionId);
      } else {
        return new Response(JSON.stringify({ error: '无权操作' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { error } = await query;

      if (error) throw error;

      void cleanupOldConversations(sb, userId, sessionId);

      debugLog('[API] Conversation updated:', id);
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error('[API] Update conversation error:', error);
      return new Response(JSON.stringify({ error: '更新对话失败' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }

  // DELETE: Delete a conversation
  if (request.method === 'DELETE') {
    try {
      let query = sb.from('conversations').delete().eq('id', id);

      // 权限检查
      if (userId) {
        query = query.eq('user_id', userId);
      } else if (sessionId) {
        query = query.eq('session_id', sessionId);
      } else {
        return new Response(JSON.stringify({ error: '无权操作' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { error } = await query;

      if (error) throw error;

      debugLog('[API] Conversation deleted:', id);
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error('[API] Delete conversation error:', error);
      return new Response(JSON.stringify({ error: '删除对话失败' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }

  // Method not allowed
  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}
