/**
 * Workspace Trash API - Restore or Permanently Delete
 * POST: Restore a deleted summary
 * DELETE: Permanently delete a summary
 */

import { SupabaseClient } from '@supabase/supabase-js';
import {
  getUserIdFromRequest,
  getCorsHeadersForRequest,
  getSupabaseAdmin
} from '../../utils/auth';

export const config = {
  runtime: 'edge',
};

// 使用共享的 Supabase Admin 客户端
function getSupabase(): SupabaseClient | null {
  return getSupabaseAdmin();
}

function getIdFromUrl(request: Request): string | null {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/');
  return pathParts[pathParts.length - 1] || null;
}

export default async function handler(request: Request) {
  const corsHeaders = getCorsHeadersForRequest(request);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const id = getIdFromUrl(request);
  if (!id) {
    return new Response(
      JSON.stringify({ error: 'Missing ID' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const sb = getSupabase();
  if (!sb) {
    return new Response(
      JSON.stringify({ error: '数据库未配置' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return new Response(
      JSON.stringify({ error: '请先登录' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // POST: Restore a deleted summary
  if (request.method === 'POST') {
    try {
      const { data, error } = await sb
        .from('summaries')
        .update({ deleted_at: null })
        .eq('id', id)
        .eq('user_id', userId)
        .not('deleted_at', 'is', null)
        .select();

      if (error) throw error;

      if (!data || data.length === 0) {
        return new Response(
          JSON.stringify({ error: '记录不存在或无权限' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, restored: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } catch (error) {
      console.error('[API] Restore error:', error);
      return new Response(
        JSON.stringify({ error: '恢复失败' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  }

  // DELETE: Permanently delete a summary
  if (request.method === 'DELETE') {
    try {
      const { data, error } = await sb
        .from('summaries')
        .delete()
        .eq('id', id)
        .eq('user_id', userId)
        .not('deleted_at', 'is', null) // 只能永久删除已在回收站的记录
        .select();

      if (error) throw error;

      if (!data || data.length === 0) {
        return new Response(
          JSON.stringify({ error: '记录不存在或无权限' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, deleted: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } catch (error) {
      console.error('[API] Permanent delete error:', error);
      return new Response(
        JSON.stringify({ error: '删除失败' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  }

  return new Response(
    JSON.stringify({ error: 'Method not allowed' }),
    { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
