/**
 * Workspace Trash API - List deleted summaries
 * GET: List all deleted summaries (trash)
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

interface TrashSummaryRow {
  id: string;
  title: string;
  url: string;
  project_id: string | null;
  deleted_at: string;
  created_at: string;
}

// 使用共享的 Supabase Admin 客户端
function getSupabase(): SupabaseClient | null {
  return getSupabaseAdmin();
}

export default async function handler(request: Request) {
  const corsHeaders = getCorsHeadersForRequest(request);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method === 'GET') {
    try {
      const sb = getSupabase();
      if (!sb) {
        return new Response(JSON.stringify({ items: [] }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const userId = await getUserIdFromRequest(request);
      if (!userId) {
        return new Response(JSON.stringify({ error: '请先登录' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // 获取已删除的记录（deleted_at 不为空）
      const { data, error } = await sb
        .from('summaries')
        .select('id, title, url, project_id, deleted_at, created_at')
        .eq('user_id', userId)
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false });

      if (error) throw error;

      const rows = (data || []) as TrashSummaryRow[];
      const items = rows.map((s) => ({
        id: s.id,
        title: s.title,
        url: s.url,
        projectId: s.project_id,
        deletedAt: new Date(s.deleted_at).getTime(),
        createdAt: new Date(s.created_at).getTime()
      }));

      return new Response(JSON.stringify({ items }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error('[API] Get trash error:', error);
      return new Response(JSON.stringify({ error: '获取回收站失败' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}
