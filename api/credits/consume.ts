/**
 * Vercel Serverless Function - /api/credits/consume
 * 消耗用户积分
 */

import { createClient } from '@supabase/supabase-js';
import { getCorsHeadersForRequest, getSupabaseAdmin } from '../utils/auth';

export const config = {
  runtime: 'edge',
};

// JSON 响应辅助函数
function jsonResponse(data: unknown, corsHeaders: Record<string, string>, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
    },
  });
}

export default async function handler(request: Request) {
  const corsHeaders = getCorsHeadersForRequest(request);

  // 处理 CORS 预检请求
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, corsHeaders, 405);
  }

  // 获取 Authorization header
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse({ error: 'Missing Authorization header' }, corsHeaders, 401);
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return jsonResponse({ error: 'Invalid Authorization header' }, corsHeaders, 401);
  }

  const token = parts[1];

  // 解析请求体
  let body: { action: string; metadata?: Record<string, unknown> };
  try {
    body = (await request.json()) as { action: string; metadata?: Record<string, unknown> };
  } catch {
    return jsonResponse({ error: 'Invalid request body' }, corsHeaders, 400);
  }

  const { action, metadata } = body;
  if (!action) {
    return jsonResponse({ error: 'Missing action parameter' }, corsHeaders, 400);
  }

  // 初始化 Supabase
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return jsonResponse({ error: 'Database not configured' }, corsHeaders, 500);
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });

  try {
    // 验证 token 并获取用户
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return jsonResponse({ error: 'Invalid token' }, corsHeaders, 401);
    }

    const userId = user.id;
    const admin = getSupabaseAdmin();
    if (!admin) {
      return jsonResponse({ error: 'Database admin not configured' }, corsHeaders, 500);
    }

    // 4. 调用 RPC 消耗积分 (原子操作)
    const { data: result, error: rpcError } = await admin.rpc('consume_credits', {
      p_user_id: userId,
      p_action: action,
      p_metadata: metadata || {}
    });

    if (rpcError) {
      console.error('[Credits] RPC Error:', rpcError);
      return jsonResponse({
        error: 'Failed to consume credits',
        details: rpcError.message,
        hint: rpcError.hint,
        code: rpcError.code
      }, corsHeaders, 500);
    }

    if (!result.success) {
      // 处理已知错误类型
      if (
        result.error === 'INSUFFICIENT_CREDITS' ||
        result.error === 'INSUFFICIENT_MEDIA_CREDITS'
      ) {
        return jsonResponse({
          error: result.error,
          required: result.required,
          current: result.current,
        }, corsHeaders, 402);
      }
      if (result.error === 'QUOTA_EXCEEDED') {
        // 429（配额满/明日重置）与 image/generate 统一；402 仅用于积分不足（需充值）
        return jsonResponse({
          error: 'QUOTA_EXCEEDED',
          feature: result.feature || 'image_generation',
          used: result.used,
          max: result.max,
          resetAt: getNextDayUTC(),
        }, corsHeaders, 429);
      }
      return jsonResponse({ error: result.message || 'Consumption failed' }, corsHeaders, 400);
    }

    // 5. 返回结果
    return jsonResponse({
      success: true,
      consumed: result.consumed,
      creditType: result.credit_type,
      creditBreakdown: result.credit_breakdown,
      balance: result.balance,
    }, corsHeaders);
  } catch (error: unknown) {
    console.error('[Credits] Error:', error);
    return jsonResponse({ error: 'Internal server error' }, corsHeaders, 500);
  }
}

// 获取下一天 UTC 时间
function getNextDayUTC(): string {
  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(0, 0, 0, 0);
  return tomorrow.toISOString();
}
