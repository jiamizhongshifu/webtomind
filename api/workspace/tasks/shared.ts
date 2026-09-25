import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getCorsHeadersForRequest,
  getSupabaseAdmin,
  getUserIdFromRequest
} from '../../utils/auth';
import type {
  WorkspaceTaskRecord,
  WorkspaceTaskRequest,
  WorkspaceTaskResult,
  WorkspaceTaskStatus,
  WorkspaceTaskStep
} from '../../../server/src/types/workspace-task';

export const WORKSPACE_TASK_POLL_AFTER_MS = 2000;

export type WorkspaceTaskRunStatus = WorkspaceTaskStatus;

export interface WorkspaceTaskProgress {
  percent: number;
  label: string;
  current?: number;
  total?: number;
}

export interface WorkspaceTaskRunRow {
  id: string;
  user_id: string;
  kind: string;
  type: string;
  skill_id: string | null;
  tool_id: string | null;
  status: WorkspaceTaskRunStatus;
  progress: WorkspaceTaskProgress | null;
  steps: WorkspaceTaskStep[] | null;
  request_payload: WorkspaceTaskRequest;
  result_payload: WorkspaceTaskResult | null;
  error_message: string | null;
  retry_of: string | null;
  idempotency_key: string | null;
  executor: string | null;
  attempt_count: number;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export type ApiWorkspaceTaskRecord = WorkspaceTaskRecord & {
  kind?: string;
  progress?: WorkspaceTaskProgress;
  retryOf?: string | null;
  idempotencyKey?: string | null;
  executor?: string | null;
  attemptCount?: number;
  pollAfterMs?: number;
};

export function jsonResponse(
  data: unknown,
  corsHeaders: Record<string, string>,
  status = 200
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders
    }
  });
}

export function getTaskCorsHeaders(request: Request): Record<string, string> {
  return getCorsHeadersForRequest(request);
}

export function getWorkspaceTaskSupabase(): SupabaseClient | null {
  return getSupabaseAdmin();
}

export async function getWorkspaceTaskUserId(
  request: Request
): Promise<string | null> {
  return getUserIdFromRequest(request);
}

export function getTaskIdFromPath(request: Request): string | null {
  const url = new URL(request.url);
  const parts = url.pathname.split('/').filter(Boolean);
  const tasksIndex = parts.lastIndexOf('tasks');
  if (tasksIndex < 0) return null;
  return parts[tasksIndex + 1] || null;
}

export function normalizeWorkspaceTaskRequest(
  body: unknown
): WorkspaceTaskRequest | null {
  if (!body || typeof body !== 'object') return null;
  const payload = body as Partial<WorkspaceTaskRequest>;
  if (typeof payload.type !== 'string') return null;
  if (!payload.params || typeof payload.params !== 'object') return null;
  if (!payload.context || typeof payload.context !== 'object') return null;

  return {
    type: payload.type,
    skillId: typeof payload.skillId === 'string' ? payload.skillId : undefined,
    toolId: typeof payload.toolId === 'string' ? payload.toolId : undefined,
    params: payload.params as Record<string, unknown>,
    context: payload.context
  };
}

export function getIdempotencyKey(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const payload = body as {
    idempotencyKey?: unknown;
    requestId?: unknown;
    params?: { idempotencyKey?: unknown };
  };

  const key =
    typeof payload.idempotencyKey === 'string'
      ? payload.idempotencyKey
      : typeof payload.requestId === 'string'
        ? payload.requestId
        : typeof payload.params?.idempotencyKey === 'string'
          ? payload.params.idempotencyKey
          : '';

  const trimmed = key.trim();
  return trimmed ? trimmed.slice(0, 160) : null;
}

export function getTaskKind(body: unknown, task: WorkspaceTaskRequest): string {
  if (body && typeof body === 'object') {
    const value = (body as { kind?: unknown }).kind;
    if (typeof value === 'string' && value.trim()) {
      return value.trim().slice(0, 80);
    }
  }

  if (task.skillId === 'slide-deck') return 'slide_image_deck';
  if (task.type === 'search_source') return 'workspace_search_source';
  return 'workspace_skill';
}

export function shouldRunLegacySync(body: unknown): boolean {
  if (!body || typeof body !== 'object') return false;
  const payload = body as {
    sync?: unknown;
    compat?: unknown;
    params?: { runtime?: unknown; executionMode?: unknown };
  };
  return (
    payload.sync === true ||
    payload.compat === 'sync' ||
    payload.params?.runtime === 'sync' ||
    payload.params?.executionMode === 'sync'
  );
}

export function buildQueuedSteps(): WorkspaceTaskStep[] {
  const now = Date.now();
  return [
    {
      id: 'prepare',
      title: '接收任务',
      kind: 'prepare',
      status: 'completed',
      startedAt: now,
      endedAt: now
    },
    {
      id: 'queue',
      title: '等待后台执行',
      kind: 'queue',
      status: 'running',
      startedAt: now,
      detail: '任务已保存，刷新页面后可继续查看状态'
    },
    {
      id: 'execute',
      title: '执行任务',
      kind: 'execute',
      status: 'pending'
    },
    {
      id: 'finish',
      title: '整理结果',
      kind: 'finalize',
      status: 'pending'
    }
  ];
}

export function buildInitialTaskRunInsert(input: {
  userId: string;
  task: WorkspaceTaskRequest;
  body: unknown;
  status?: WorkspaceTaskRunStatus;
  retryOf?: string | null;
  attemptCount?: number;
  idempotencyKey?: string | null;
}): Record<string, unknown> {
  const status = input.status || 'queued';
  const startedAt =
    status === 'running' || status === 'preparing' ? new Date().toISOString() : null;

  return {
    user_id: input.userId,
    kind: getTaskKind(input.body, input.task),
    type: input.task.type,
    skill_id: input.task.skillId || null,
    tool_id: input.task.toolId || null,
    status,
    progress:
      status === 'running'
        ? { percent: 5, label: '正在执行任务' }
        : { percent: 0, label: '已加入任务队列' },
    steps: buildQueuedSteps(),
    request_payload: input.task,
    result_payload: null,
    error_message: null,
    retry_of: input.retryOf || null,
    idempotency_key: input.idempotencyKey || null,
    executor: 'pending',
    attempt_count: input.attemptCount ?? 0,
    started_at: startedAt,
    completed_at: null
  };
}

export function mapTaskRunRow(row: WorkspaceTaskRunRow): ApiWorkspaceTaskRecord {
  const task = row.request_payload || ({} as WorkspaceTaskRequest);
  const result = row.result_payload || undefined;
  const createdAt = new Date(row.created_at).getTime();
  const updatedAt = new Date(row.updated_at).getTime();
  const startedAt = row.started_at ? new Date(row.started_at).getTime() : undefined;
  const endedAt = row.completed_at ? new Date(row.completed_at).getTime() : undefined;

  return {
    id: row.id,
    type: task.type || row.type,
    status: row.status,
    skillId: task.skillId || row.skill_id || undefined,
    toolId: task.toolId || row.tool_id || undefined,
    params: task.params || {},
    context: task.context || {},
    createdAt,
    updatedAt,
    startedAt,
    endedAt,
    error: row.error_message || undefined,
    steps: row.steps || [],
    result,
    kind: row.kind,
    progress: row.progress || undefined,
    retryOf: row.retry_of,
    idempotencyKey: row.idempotency_key,
    executor: row.executor,
    attemptCount: row.attempt_count,
    pollAfterMs: isTerminalStatus(row.status) ? undefined : WORKSPACE_TASK_POLL_AFTER_MS
  };
}

export function isTerminalStatus(status: WorkspaceTaskRunStatus): boolean {
  return (
    status === 'succeeded' ||
    status === 'failed' ||
    status === 'cancelled'
  );
}

export async function fetchTaskRun(
  sb: SupabaseClient,
  taskId: string,
  userId: string
): Promise<ApiWorkspaceTaskRecord | null> {
  const { data, error } = await sb
    .from('workspace_task_runs')
    .select('*')
    .eq('id', taskId)
    .eq('user_id', userId)
    .single();

  if (error || !data) return null;
  return mapTaskRunRow(data as WorkspaceTaskRunRow);
}
