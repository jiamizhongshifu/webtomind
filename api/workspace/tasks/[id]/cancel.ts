import {
  fetchTaskRun,
  getTaskCorsHeaders,
  getTaskIdFromPath,
  getWorkspaceTaskSupabase,
  getWorkspaceTaskUserId,
  isTerminalStatus,
  jsonResponse,
  mapTaskRunRow
} from '../shared';

export const config = {
  runtime: 'edge'
};

export default async function handler(request: Request): Promise<Response> {
  const corsHeaders = getTaskCorsHeaders(request);
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, corsHeaders, 405);
  }

  const userId = await getWorkspaceTaskUserId(request);
  if (!userId) {
    return jsonResponse({ error: '请先登录' }, corsHeaders, 401);
  }

  const taskId = getTaskIdFromPath(request);
  if (!taskId) {
    return jsonResponse({ error: 'Invalid task id' }, corsHeaders, 400);
  }

  const sb = getWorkspaceTaskSupabase();
  if (!sb) {
    return jsonResponse({ error: '数据库未配置' }, corsHeaders, 500);
  }

  const task = await fetchTaskRun(sb, taskId, userId);
  if (!task) {
    return jsonResponse({ error: 'Task not found' }, corsHeaders, 404);
  }

  if (isTerminalStatus(task.status)) {
    return jsonResponse({ task }, corsHeaders);
  }

  const now = Date.now();
  const steps = task.steps.map((step) =>
    step.status === 'running'
      ? {
          ...step,
          status: 'failed' as const,
          endedAt: now,
          detail: '用户已取消任务'
        }
      : step
  );

  const { data, error } = await sb
    .from('workspace_task_runs')
    .update({
      status: 'cancelled',
      progress: { percent: 100, label: '任务已取消' },
      steps,
      error_message: '用户已取消任务',
      completed_at: new Date().toISOString()
    })
    .eq('id', taskId)
    .eq('user_id', userId)
    .select('*')
    .single();

  if (error || !data) {
    return jsonResponse(
      { error: error?.message || '取消任务失败' },
      corsHeaders,
      500
    );
  }

  return jsonResponse({ task: mapTaskRunRow(data) }, corsHeaders);
}
