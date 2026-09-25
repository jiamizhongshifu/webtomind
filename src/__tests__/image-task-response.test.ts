import { describe, expect, it, vi } from 'vitest';
import {
  imageTaskClaimMissResponse,
  imageTaskRunResponse
} from '../../api/image/task';
import type { ImageGenerationTaskRecord } from '../../api/image/task-runner';

function makeTask(
  overrides: Partial<ImageGenerationTaskRecord> = {}
): ImageGenerationTaskRecord {
  return {
    id: 'task-1',
    user_id: 'user-1',
    status: 'running',
    request_payload: {},
    result_payload: null,
    error_message: null,
    refund_failed: null,
    generation_id: null,
    attempt_count: 1,
    lease_token: 'lease-1',
    started_at: '2026-07-21T00:00:00.000Z',
    first_started_at: '2026-07-21T00:00:00.000Z',
    locked_until: '2026-07-21T00:05:00.000Z',
    created_at: '2026-07-21T00:00:00.000Z',
    updated_at: '2026-07-21T00:00:00.000Z',
    ...overrides
  };
}

function createSupabaseTaskLookup(
  latestTask: ImageGenerationTaskRecord | null,
  error: { message: string } | null = null
) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({ data: latestTask, error }))
  };
  return { from: vi.fn(() => query) };
}

describe('image task poll response', () => {
  it('keeps the task running when the provider result is still pending', async () => {
    const task = makeTask();
    const response = await imageTaskRunResponse({
      sb: createSupabaseTaskLookup(task) as never,
      userId: task.user_id,
      claimedTask: task,
      result: {
        taskId: task.id,
        status: 'running',
        reenqueue: { taskId: task.id, delaySeconds: 8 }
      },
      corsHeaders: {}
    });

    await expect(response.json()).resolves.toMatchObject({
      success: true,
      queued: true,
      taskId: task.id,
      status: 'running'
    });
  });

  it('uses the latest persisted terminal state instead of a stale worker result', async () => {
    const claimedTask = makeTask();
    const latestTask = makeTask({
      status: 'succeeded',
      result_payload: {
        success: true,
        generationId: 'generation-1',
        imageUrl: 'https://example.com/image.png'
      }
    });
    const response = await imageTaskRunResponse({
      sb: createSupabaseTaskLookup(latestTask) as never,
      userId: claimedTask.user_id,
      claimedTask,
      result: {
        taskId: claimedTask.id,
        status: 'cancelled',
        error: 'Task lease was superseded'
      },
      corsHeaders: {}
    });

    await expect(response.json()).resolves.toMatchObject({
      success: true,
      taskId: claimedTask.id,
      status: 'succeeded',
      generationId: 'generation-1'
    });
  });

  it('does not accept a stale worker success after its lease was superseded', async () => {
    const claimedTask = makeTask();
    const latestTask = makeTask({
      status: 'running',
      lease_token: 'lease-2',
      result_payload: { pendingProviderPoll: true }
    });
    const response = await imageTaskRunResponse({
      sb: createSupabaseTaskLookup(latestTask) as never,
      userId: claimedTask.user_id,
      claimedTask,
      result: {
        taskId: claimedTask.id,
        status: 'succeeded',
        payload: {
          success: true,
          generationId: 'stale-generation',
          imageUrl: 'https://example.com/stale.png',
          imageUrlExpiresIn: 3600,
          images: [],
          imageCount: 1,
          requestedImageCount: 1,
          provider: 'openai',
          model: 'gpt-image-2',
          modelLabel: 'GPT Image 2',
          requestedModelLabel: 'GPT Image 2',
          quality: 'high',
          aspectRatio: '1:1',
          imageSize: '1024x1024',
          outputFormat: 'png',
          usedFallback: false,
          credits: {
            consumed: 60,
            creditType: 'media_credits'
          }
        }
      },
      corsHeaders: {}
    });

    await expect(response.json()).resolves.toMatchObject({
      success: true,
      taskId: claimedTask.id,
      status: 'running'
    });
  });

  it('returns the terminal row created by an exhausted atomic claim', async () => {
    const staleTask = makeTask({ status: 'running' });
    const exhaustedTask = makeTask({
      status: 'failed',
      error_message: '任务重试次数已达上限',
      result_payload: {
        success: false,
        errorDetails: {
          code: 'IMAGE_TASK_MAX_ATTEMPTS_EXCEEDED',
          category: 'internal',
          retryable: false
        }
      }
    });
    const response = await imageTaskClaimMissResponse({
      sb: createSupabaseTaskLookup(exhaustedTask) as never,
      userId: staleTask.user_id,
      task: staleTask,
      corsHeaders: {}
    });

    await expect(response.json()).resolves.toMatchObject({
      success: false,
      taskId: staleTask.id,
      status: 'failed',
      error: '任务重试次数已达上限',
      errorDetails: {
        code: 'IMAGE_TASK_MAX_ATTEMPTS_EXCEEDED'
      }
    });
  });
});
