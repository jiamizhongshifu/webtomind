import {
  buildInitialTaskRunInsert,
  fetchTaskRun,
  getTaskCorsHeaders,
  getTaskIdFromPath,
  getWorkspaceTaskSupabase,
  getWorkspaceTaskUserId,
  isTerminalStatus,
  jsonResponse,
  mapTaskRunRow
} from '../shared';
import type { WorkspaceTaskRequest } from '../../../../server/src/types/workspace-task';

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

  if (!isTerminalStatus(task.status) || task.status === 'succeeded') {
    return jsonResponse(
      { error: '只有失败或已取消的任务可以重试' },
      corsHeaders,
      409
    );
  }

  const retryRequest: WorkspaceTaskRequest = {
    type: task.type,
    skillId: task.skillId,
    toolId: task.toolId,
    params: task.params,
    context: task.context
  };

  const insertPayload = buildInitialTaskRunInsert({
    userId,
    task: retryRequest,
    body: {
      kind: task.kind,
      type: task.type,
      skillId: task.skillId,
      toolId: task.toolId,
      params: task.params,
      context: task.context
    },
    retryOf: task.id,
    attemptCount: (task.attemptCount || 0) + 1
  });

  const { data, error } = await sb
    .from('workspace_task_runs')
    .insert(insertPayload)
    .select('*')
    .single();

  if (error || !data) {
    return jsonResponse(
      { error: error?.message || '重试任务创建失败' },
      corsHeaders,
      500
    );
  }

  return jsonResponse({ task: mapTaskRunRow(data) }, corsHeaders, 201);
}
