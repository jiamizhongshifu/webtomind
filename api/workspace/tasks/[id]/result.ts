import {
  fetchTaskRun,
  getTaskCorsHeaders,
  getTaskIdFromPath,
  getWorkspaceTaskSupabase,
  getWorkspaceTaskUserId,
  isTerminalStatus,
  jsonResponse,
  WORKSPACE_TASK_POLL_AFTER_MS
} from '../shared';

export const config = {
  runtime: 'edge'
};

export default async function handler(request: Request): Promise<Response> {
  const corsHeaders = getTaskCorsHeaders(request);
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== 'GET') {
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

  return jsonResponse(
    {
      task,
      result: task.result ?? null,
      pollAfterMs: isTerminalStatus(task.status)
        ? undefined
        : WORKSPACE_TASK_POLL_AFTER_MS
    },
    corsHeaders
  );
}
