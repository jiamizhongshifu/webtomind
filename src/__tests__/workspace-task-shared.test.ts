import { describe, expect, it } from 'vitest';
import {
  buildInitialTaskRunInsert,
  mapTaskRunRow,
  normalizeWorkspaceTaskRequest,
  shouldRunLegacySync,
  type WorkspaceTaskRunRow
} from '../../api/workspace/tasks/shared';

describe('workspace task shared helpers', () => {
  it('normalizes a valid workspace task request', () => {
    const request = normalizeWorkspaceTaskRequest({
      type: 'skill',
      skillId: 'rewrite',
      params: { format: 'markdown' },
      context: { projectId: 'project-1' }
    });

    expect(request).toEqual({
      type: 'skill',
      skillId: 'rewrite',
      toolId: undefined,
      params: { format: 'markdown' },
      context: { projectId: 'project-1' }
    });
  });

  it('builds a queued insert payload by default', () => {
    const task = normalizeWorkspaceTaskRequest({
      type: 'skill',
      skillId: 'slide-deck',
      params: { slideCount: 10 },
      context: { projectId: 'project-1' }
    });

    expect(task).not.toBeNull();
    const payload = buildInitialTaskRunInsert({
      userId: 'user-1',
      task: task!,
      body: { type: 'skill', skillId: 'slide-deck', params: {}, context: {} },
      idempotencyKey: 'same-request'
    });

    expect(payload.status).toBe('queued');
    expect(payload.kind).toBe('slide_image_deck');
    expect(payload.idempotency_key).toBe('same-request');
    expect(payload.result_payload).toBeNull();
  });

  it('maps a persisted row to the frontend task record shape', () => {
    const row: WorkspaceTaskRunRow = {
      id: '00000000-0000-4000-8000-000000000001',
      user_id: 'user-1',
      kind: 'workspace_skill',
      type: 'skill',
      skill_id: 'rewrite',
      tool_id: null,
      status: 'queued',
      progress: { percent: 0, label: '已加入任务队列' },
      steps: [],
      request_payload: {
        type: 'skill',
        skillId: 'rewrite',
        params: { format: 'markdown' },
        context: { projectId: 'project-1' }
      },
      result_payload: null,
      error_message: null,
      retry_of: null,
      idempotency_key: null,
      executor: 'pending',
      attempt_count: 0,
      started_at: null,
      completed_at: null,
      created_at: '2026-06-15T10:30:00.000Z',
      updated_at: '2026-06-15T10:30:00.000Z'
    };

    const task = mapTaskRunRow(row);

    expect(task.id).toBe(row.id);
    expect(task.status).toBe('queued');
    expect(task.params).toEqual({ format: 'markdown' });
    expect(task.context).toEqual({ projectId: 'project-1' });
    expect(task.pollAfterMs).toBeGreaterThan(0);
  });

  it('requires explicit sync compatibility opt-in', () => {
    expect(shouldRunLegacySync({ params: { runtime: 'sync' } })).toBe(true);
    expect(shouldRunLegacySync({ params: { runtime: 'auto' } })).toBe(false);
  });
});
