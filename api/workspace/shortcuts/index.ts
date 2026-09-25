/**
 * Workspace Shortcuts API - List & Create
 * GET: List all shortcuts
 * POST: Create a new shortcut
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  getUserIdFromRequest,
  getCorsHeadersForRequest,
  getRuntimeEnvValue
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

// 优先使用 service role；若未配置则退回 anon + 请求中的 Authorization（让 RLS 生效）
function getSupabase(request: Request): SupabaseClient | null {
  const url = getRuntimeEnvValue('SUPABASE_URL');
  const serviceKey = getRuntimeEnvValue('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = getRuntimeEnvValue('SUPABASE_ANON_KEY');
  if (!url) {
    return null;
  }

  if (serviceKey) {
    return createClient(url, serviceKey);
  }

  if (!anonKey) {
    return null;
  }

  const authHeader = request.headers.get('Authorization');
  return createClient(url, anonKey, {
    global: authHeader
      ? {
          headers: {
            Authorization: authHeader
          }
        }
      : undefined
  });
}

interface ShortcutRow {
  id: string;
  name: string;
  prompt: string;
  description: string | null;
  reference_ids: string[] | null;
  sort_order: number | null;
  created_at: string;
}

function isMissingColumnError(error: unknown, columnName: string): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { message?: string; details?: string; hint?: string };
  const raw = `${e.message || ''} ${e.details || ''} ${e.hint || ''}`.toLowerCase();
  return raw.includes(`column`) && raw.includes(columnName.toLowerCase());
}

export default async function handler(request: Request) {
  const corsHeaders = getCorsHeadersForRequest(request);

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // GET: List all shortcuts
  if (request.method === 'GET') {
    try {
      const sb = getSupabase(request);
      if (!sb) {
        return new Response(JSON.stringify({ shortcuts: [] }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const userId = await getUserIdFromRequest(request);
      if (!userId) {
        return new Response(JSON.stringify({ shortcuts: [] }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const query = sb
        .from('shortcuts')
        .select('*')
        .eq('user_id', userId)
        .order('sort_order', { ascending: true });

      const { data, error } = await query;

      if (error) throw error;

      const rows = (data || []) as ShortcutRow[];
      const formatted = rows.map((s) => ({
        id: s.id,
        name: s.name,
        prompt: s.prompt,
        description: s.description,
        referenceIds: s.reference_ids,
        order: s.sort_order,
        createdAt: new Date(s.created_at).getTime()
      }));

      return new Response(JSON.stringify({ shortcuts: formatted }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error('[API] Get shortcuts error:', error);
      return new Response(JSON.stringify({ error: '获取快捷指令失败' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }

  // POST: Create a new shortcut
  if (request.method === 'POST') {
    try {
      const body = (await request.json()) as {
        name?: string;
        prompt?: string;
        description?: string;
        referenceIds?: string[];
      };
      const { name, prompt, description, referenceIds } = body;

      if (!name || !prompt) {
        return new Response(JSON.stringify({ error: '名称和提示词不能为空' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      if (
        description !== undefined &&
        (typeof description !== 'string' || description.length > 300)
      ) {
        return new Response(JSON.stringify({ error: '描述长度不能超过 300' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const sb = getSupabase(request);
      if (!sb) {
        return new Response(JSON.stringify({ error: '数据库未配置' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const userId = await getUserIdFromRequest(request);

      // 🔒 安全检查：必须登录才能创建快捷指令
      if (!userId) {
        console.warn('[API] Shortcuts POST - REJECTED: no userId');
        return new Response(
          JSON.stringify({ error: '请先登录后再创建快捷指令' }),
          {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }

      // Get min sort order (新建的排在最前面)
      let minOrderQuery = sb
        .from('shortcuts')
        .select('sort_order')
        .order('sort_order', { ascending: true })
        .limit(1);

      if (userId) {
        minOrderQuery = minOrderQuery.eq('user_id', userId);
      }

      const { data: minOrder } = await minOrderQuery.maybeSingle();
      const sortOrder = (minOrder?.sort_order ?? 1) - 1;

      const insertPayload: Record<string, unknown> = {
        name,
        prompt,
        reference_ids: referenceIds || [],
        sort_order: sortOrder,
        user_id: userId
      };
      if (description !== undefined) {
        insertPayload.description = description || null;
      }

      let query = sb.from('shortcuts').insert(insertPayload).select().single();
      let { data, error } = await query;

      // 兼容旧库结构：shortcuts 可能尚未添加 description 字段
      if (error && isMissingColumnError(error, 'description')) {
        const fallbackPayload = { ...insertPayload };
        delete fallbackPayload.description;
        query = sb.from('shortcuts').insert(fallbackPayload).select().single();
        ({ data, error } = await query);
      }

      if (error) {
        console.error('[API] Create shortcut insert error:', error);
        return new Response(
          JSON.stringify({ error: error.message || '创建失败', code: error.code }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }

      debugLog('[API] Shortcut created:', data.id);
      return new Response(JSON.stringify({ id: data.id, success: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error('[API] Create shortcut error:', error);
      return new Response(JSON.stringify({ error: '创建失败' }), {
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
