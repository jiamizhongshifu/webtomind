/**
 * Vercel Serverless Function - /api/credits/daily-usage
 * 获取用户每日积分使用统计（最近14天）
 */

import { createClient } from '@supabase/supabase-js';
import { getCorsHeadersForRequest } from '../utils/auth';

export const config = {
  runtime: 'edge',
};

export default async function handler(request: Request) {
  const corsHeaders = getCorsHeadersForRequest(request);

  // JSON 响应辅助函数
  function jsonResponse(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
      status,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
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
  const days = Math.min(parseInt(url.searchParams.get('days') || '14'), 30);

  // 初始化 Supabase
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return jsonResponse({ error: 'Database not configured' }, 500);
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
      return jsonResponse({ error: 'Invalid token' }, 401);
    }

    const userId = user.id;

    // 计算日期范围
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days + 1);
    startDate.setHours(0, 0, 0, 0);

    // 查询消耗类型的交易记录（amount < 0 表示消耗）
    const { data: transactions, error } = await supabase
      .from('credit_transactions')
      .select('amount, created_at')
      .eq('user_id', userId)
      .lt('amount', 0) // 只查询消耗记录
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[DailyUsage] Fetch error:', error);
      return jsonResponse({ error: 'Failed to fetch usage data' }, 500);
    }

    // 按日期聚合数据
    const dailyUsage: Record<string, number> = {};
    
    // 初始化所有日期为 0
    for (let i = 0; i < days; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      const dateKey = date.toISOString().split('T')[0]; // YYYY-MM-DD
      dailyUsage[dateKey] = 0;
    }

    // 聚合交易数据
    (transactions || []).forEach(tx => {
      const dateKey = new Date(tx.created_at).toISOString().split('T')[0];
      if (dailyUsage[dateKey] !== undefined) {
        // amount 是负数，取绝对值
        dailyUsage[dateKey] += Math.abs(tx.amount);
      }
    });

    // 转换为数组格式
    const usageData = Object.entries(dailyUsage).map(([date, usage]) => ({
      date,
      usage,
    }));

    return jsonResponse({
      usage: usageData,
      period: {
        start: startDate.toISOString().split('T')[0],
        end: endDate.toISOString().split('T')[0],
        days,
      },
    });
  } catch (error: unknown) {
    console.error('[DailyUsage] Error:', error);
    // 安全修复：不暴露内部错误详情
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
}
