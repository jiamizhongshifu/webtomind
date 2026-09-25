import { describe, expect, it } from 'vitest';
import {
  buildImageTaskTurnRow,
  resolveImageTaskTurnRows
} from '../../api/image-sessions/task-turns';

const baseTask = {
  id: '4100c18a-1d16-4f5e-a4cc-68107e1cece1',
  user_id: 'user-1',
  status: 'succeeded' as const,
  request_payload: {
    prompt: 'A quiet mountain village at dawn',
    negativePrompt: '',
    imageCount: 2,
    creationContext: {
      sessionId: 'session-1',
      recipeId: 'recipe-1',
      referenceAssetIds: []
    }
  },
  result_payload: {
    requestedImageCount: 2,
    actualImageCount: 1,
    images: [{ generationId: 'generation-1' }]
  },
  generation_id: 'generation-1',
  error_message: null,
  created_at: '2026-07-24T08:47:59.000Z',
  updated_at: '2026-07-24T08:48:30.000Z'
};

describe('image task to session turn recovery', () => {
  it('uses the task id as an idempotent turn id and preserves partial results', () => {
    expect(buildImageTaskTurnRow(baseTask, 'session-1')).toEqual({
      id: baseTask.id,
      session_id: 'session-1',
      user_id: 'user-1',
      prompt: 'A quiet mountain village at dawn',
      negative_prompt: null,
      status: 'partial',
      context: {
        sessionId: 'session-1',
        taskId: baseTask.id,
        recipeId: 'recipe-1',
        referenceAssetIds: []
      },
      generation_ids: ['generation-1'],
      error_message: null,
      created_at: baseTask.created_at,
      updated_at: baseTask.updated_at
    });
  });

  it('recovers a terminal provider timeout as a visible failed turn', () => {
    const failedTurn = buildImageTaskTurnRow(
      {
        ...baseTask,
        status: 'failed',
        result_payload: {
          success: false,
          errorDetails: {
            code: 'IMAGE_PIPELINE_DEADLINE',
            category: 'pipeline_deadline'
          }
        },
        generation_id: null,
        error_message:
          'IMAGE_PIPELINE_DEADLINE: 生成超时（接近函数上限），已触发退款'
      },
      'session-1'
    );

    expect(failedTurn).toMatchObject({
      id: baseTask.id,
      status: 'failed',
      generation_ids: [],
      error_message: '生成超时（接近函数上限），已触发退款'
    });
  });

  it('refuses to attach a task to a different session', () => {
    expect(buildImageTaskTurnRow(baseTask, 'session-2')).toBeNull();
  });

  it('claims a matching legacy frontend turn instead of creating a duplicate', () => {
    const taskTurn = buildImageTaskTurnRow(
      {
        ...baseTask,
        status: 'failed',
        result_payload: { success: false },
        generation_id: null,
        error_message: 'PROVIDER_TIMEOUT: 生成超时，已触发退款'
      },
      'session-1'
    );
    expect(taskTurn).not.toBeNull();
    if (!taskTurn) return;

    const [resolved] = resolveImageTaskTurnRows(
      [taskTurn],
      [
        {
          id: 'legacy-random-turn-id',
          prompt: taskTurn.prompt,
          status: 'failed',
          context: { sessionId: 'session-1', referenceAssetIds: [] },
          generation_ids: [],
          created_at: '2026-07-24T08:48:31.000Z',
          updated_at: '2026-07-24T08:48:31.000Z'
        }
      ]
    );

    expect(resolved.id).toBe('legacy-random-turn-id');
    expect(resolved.context.taskId).toBe(baseTask.id);
  });

  it('keeps repeated legacy turns from being claimed by more than one task', () => {
    const firstTurn = buildImageTaskTurnRow(
      {
        ...baseTask,
        status: 'failed',
        result_payload: { success: false },
        generation_id: null,
        error_message: 'PROVIDER_TIMEOUT: 生成超时'
      },
      'session-1'
    );
    const secondTurn = firstTurn
      ? {
          ...firstTurn,
          id: 'task-2',
          created_at: '2026-07-24T08:49:00.000Z',
          updated_at: '2026-07-24T08:49:30.000Z',
          context: { ...firstTurn.context, taskId: 'task-2' }
        }
      : null;
    expect(firstTurn).not.toBeNull();
    expect(secondTurn).not.toBeNull();
    if (!firstTurn || !secondTurn) return;

    const resolved = resolveImageTaskTurnRows(
      [firstTurn, secondTurn],
      [
        {
          id: 'legacy-only-once',
          prompt: firstTurn.prompt,
          status: 'failed',
          context: { sessionId: 'session-1', referenceAssetIds: [] },
          generation_ids: [],
          created_at: '2026-07-24T08:48:31.000Z',
          updated_at: '2026-07-24T08:48:31.000Z'
        }
      ]
    );

    expect(resolved.map((turn) => turn.id)).toEqual([
      'legacy-only-once',
      'task-2'
    ]);
  });
});
