/**
 * Vercel Serverless Function - /api/membership/tasks
 * 处理奖励任务列与状态更新
 */

import { createClient } from '@supabase/supabase-js';
import { getCorsHeadersForRequest } from '../utils/auth';

export const config = {
    runtime: 'edge',
};

export default async function handler(request: Request) {
    const corsHeaders = getCorsHeadersForRequest(request);

    function jsonResponse(data: unknown, status = 200): Response {
        return new Response(JSON.stringify(data), {
            status,
            headers: {
                'Content-Type': 'application/json',
                ...corsHeaders,
            },
        });
    }

    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders });
    }

    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return jsonResponse({ error: 'Unauthorized' }, 401);

    const supabaseUrl = process.env.SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. 验证用户
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return jsonResponse({ error: 'Unauthorized' }, 401);

    const userId = user.id;

    // GET: 获取任务列表及其完成状态
    if (request.method === 'GET') {
        try {
            // 获取所有活跃任务
            const { data: tasks } = await supabase
                .from('reward_tasks')
                .select('*')
                .eq('is_active', true)
                .order('created_at', { ascending: true });

            // 获取当前用户的完成记录
            const { data: completions } = await supabase
                .from('user_reward_tasks')
                .select('task_id, status, completed_at')
                .eq('user_id', userId);

            // 合并数据
            const result = tasks?.map(task => {
                const completion = completions?.find(c => c.task_id === task.id);
                return {
                    ...task,
                    is_completed: !!completion,
                    completed_at: completion?.completed_at
                };
            });

            return jsonResponse({ tasks: result || [] });
        } catch (err: unknown) {
            return jsonResponse({ error: err instanceof Error ? err.message : 'Unknown error' }, 500);
        }
    }

    // POST: 完成任务
    if (request.method === 'POST') {
        try {
            const { identifier } = await request.json() as { identifier: string };
            if (!identifier) return jsonResponse({ error: 'Task identifier is required' }, 400);

            // 调用 RPC 手原子事务处理完成任务并分发奖励
            const { data, error: rpcError } = await supabase.rpc('complete_reward_task', {
                p_user_id: userId,
                p_task_identifier: identifier
            });

            if (rpcError) throw rpcError;
            if (data.error) return jsonResponse({ error: data.error }, 400);

            return jsonResponse({ success: true, reward_amount: data.reward_amount });
        } catch (err: unknown) {
            return jsonResponse({ error: err instanceof Error ? err.message : 'Unknown error' }, 500);
        }
    }

    return jsonResponse({ error: 'Method not allowed' }, 405);
}
