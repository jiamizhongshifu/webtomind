/**
 * Vercel Serverless Function - /api/credits/transactions
 * 获取用户积分交易记录
 */

import { createClient } from '@supabase/supabase-js';
import { getCorsHeadersForRequest } from '../utils/auth';

export const config = {
  runtime: 'edge'
};

export default async function handler(request: Request) {
  const corsHeaders = getCorsHeadersForRequest(request);

  // JSON 响应辅助函数
  function jsonResponse(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
      status,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }

  // 处理 CORS 预检请求
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  // 获取 Authorization header
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse({ error: 'Missing Authorization header' }, 401);
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return jsonResponse({ error: 'Invalid Authorization header' }, 401);
  }

  const token = parts[1];

  // 解析查询参数
  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
  const offset = parseInt(url.searchParams.get('offset') || '0');
  const type = url.searchParams.get('type'); // 可选过滤类型

  // 初始化 Supabase
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return jsonResponse({ error: 'Database not configured' }, 500);
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  });

  try {
    // 验证 token 并获取用户
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return jsonResponse({ error: 'Invalid token' }, 401);
    }

    const userId = user.id;

    // 构建查询
    let query = supabase
      .from('credit_transactions')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // 可选类型过滤
    if (type) {
      query = query.eq('type', type);
    }

    const { data: transactions, error, count } = await query;

    if (error) {
      console.error('[Transactions] Fetch error:', error);
      return jsonResponse({ error: 'Failed to fetch transactions' }, 500);
    }

    // 格式化响应
    const formattedTransactions = (transactions || []).map((tx) => ({
      id: tx.id,
      type: tx.type,
      creditType: tx.credit_type,
      amount: tx.amount,
      balanceAfter: tx.balance_after,
      source: tx.source,
      sourceId: tx.source_id,
      description: tx.description,
      metadata: tx.metadata,
      createdAt: tx.created_at
    }));

    return jsonResponse({
      transactions: formattedTransactions,
      pagination: {
        total: count || 0,
        limit,
        offset,
        hasMore: (count || 0) > offset + limit
      }
    });
  } catch (error: unknown) {
    console.error('[Transactions] Error:', error);
    // 安全修复：不暴露内部错误详情
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
}
