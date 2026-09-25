/**
 * Workspace Shortcuts API - Single Shortcut Operations
 * PATCH: Update a shortcut
 * DELETE: Delete a shortcut
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getCorsHeadersForRequest, getRuntimeEnvValue } from '../../utils/auth';

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

function isMissingColumnError(error: unknown, columnName: string): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { message?: string; details?: string; hint?: string };
  const raw = `${e.message || ''} ${e.details || ''} ${e.hint || ''}`.toLowerCase();
  return raw.includes('column') && raw.includes(columnName.toLowerCase());
}

// Supabase client singleton
function getSupabase(request: Request): SupabaseClient | null {
  const url = getRuntimeEnvValue('SUPABASE_URL');
  const serviceKey = getRuntimeEnvValue('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = getRuntimeEnvValue('SUPABASE_ANON_KEY');
  if (!url) {
    console.warn('[API] Supabase not configured: missing SUPABASE_URL');
    return null;
  }

  if (serviceKey) {
    return createClient(url, serviceKey);
  }

  if (!anonKey) {
    console.warn('[API] Supabase not configured: missing keys');
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

// Get user ID from Authorization header
async function getUserIdFromRequest(request: Request): Promise<string | null> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) return null;

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null;

  const token = parts[1];
  const sb = getSupabase(request);
  if (!sb) return null;

  try {
    const {
      data: { user },
      error
    } = await sb.auth.getUser(token);
    if (error || !user) return null;
    return user.id;
  } catch {
    return null;
  }
}

// Extract ID from URL path
function getIdFromUrl(request: Request): string | null {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/');
  // Path format: /api/workspace/shortcuts/[id]
  return pathParts[pathParts.length - 1] || null;
}

export default async function handler(request: Request) {
  const corsHeaders = getCorsHeadersForRequest(request);

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const id = getIdFromUrl(request);
  if (!id) {
    return new Response(JSON.stringify({ error: 'Missing shortcut ID' }), {
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

  // PATCH: Update a shortcut
  if (request.method === 'PATCH') {
    try {
      const body = (await request.json()) as {
        name?: string;
        prompt?: string;
        description?: string;
        referenceIds?: string[];
        order?: number;
      };
      const { name, prompt, description, referenceIds, order } = body;

      if (
        description !== undefined &&
        (typeof description !== 'string' || description.length > 300)
      ) {
        return new Response(JSON.stringify({ error: '描述长度不能超过 300' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // 调试日志
      debugLog('[API] PATCH shortcut - id:', id);
      debugLog('[API] PATCH shortcut - body:', JSON.stringify(body));
      debugLog('[API] PATCH shortcut - referenceIds:', referenceIds);
      debugLog('[API] PATCH shortcut - userId:', userId);

      // 只更新提供的字段
      const updates: Record<string, unknown> = {};
      if (name !== undefined) updates.name = name;
      if (prompt !== undefined) updates.prompt = prompt;
      if (description !== undefined) updates.description = description || null;
      if (referenceIds !== undefined) updates.reference_ids = referenceIds;
      if (order !== undefined) updates.sort_order = order;

      debugLog(
        '[API] PATCH shortcut - updates to apply:',
        JSON.stringify(updates)
      );

      if (Object.keys(updates).length === 0) {
        return new Response(JSON.stringify({ error: '没有提供更新字段' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      if (!userId) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // 仅允许更新当前用户拥有的快捷指令
      const query = sb
        .from('shortcuts')
        .update(updates)
        .eq('id', id)
        .eq('user_id', userId);

      let { error } = await query;

      // 兼容旧库结构：shortcuts 可能尚未添加 description 字段
      if (error && isMissingColumnError(error, 'description')) {
        const fallbackUpdates = { ...updates };
        delete fallbackUpdates.description;
        if (Object.keys(fallbackUpdates).length === 0) {
          return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        const fallbackQuery = sb
          .from('shortcuts')
          .update(fallbackUpdates)
          .eq('id', id)
          .eq('user_id', userId);
        ({ error } = await fallbackQuery);
      }

      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error('[API] Update shortcut error:', error);
      return new Response(JSON.stringify({ error: '更新失败' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }

  // DELETE: Delete a shortcut
  if (request.method === 'DELETE') {
    try {
      if (!userId) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // 仅允许删除当前用户拥有的快捷指令
      const query = sb
        .from('shortcuts')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);

      const { error } = await query;

      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error('[API] Delete shortcut error:', error);
      return new Response(JSON.stringify({ error: '删除失败' }), {
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
