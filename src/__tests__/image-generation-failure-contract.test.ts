import { describe, expect, it, vi } from 'vitest';
import {
  canRetryImageGenerationFailure,
  resolveImageGenerationFailureDetails
} from '../shared/image-generation-failure';
import { toActiveTaskResponseItem } from '../../api/image/task-status';
import { handleRetryImageTaskRequest } from '../../api/image/task';

const REQUEST_PAYLOAD = {
  prompt: 'A clean editorial portrait',
  model: 'gpt-image-2',
  aspectRatio: '1:1',
  imageSize: '1024x1024',
  quality: 'auto',
  outputFormat: 'png',
  promptMode: 'custom',
  imageCount: 1,
  assetIds: [],
  referenceImageIds: [],
  referenceMode: 'none',
  characterCardIds: [],
  characterReferenceGroups: []
};

function failedTask(overrides: Record<string, unknown> = {}) {
  return {
    id: 'task-policy-failure',
    user_id: 'user-1',
    status: 'failed',
    request_payload: REQUEST_PAYLOAD,
    result_payload: null,
    error_message: 'Blocked by provider policy',
    refund_failed: false,
    generation_id: null,
    attempt_count: 1,
    started_at: '2026-07-15T00:00:01.000Z',
    first_started_at: '2026-07-15T00:00:01.000Z',
    locked_until: null,
    failure_category: 'provider_policy',
    failure_code: 'CONTENT_POLICY_VIOLATION',
    created_at: '2026-07-15T00:00:00.000Z',
    updated_at: '2026-07-15T00:00:02.000Z',
    ...overrides
  };
}

describe('image generation failure retry contract', () => {
  it('keeps known policy failures non-retryable even when payload says true', () => {
    expect(
      canRetryImageGenerationFailure({
        category: 'provider_policy',
        code: 'CONTENT_POLICY_VIOLATION',
        retryable: true
      })
    ).toBe(false);
  });

  it('falls back to persisted failure columns for refreshed tasks', () => {
    expect(
      resolveImageGenerationFailureDetails({
        failureCategory: 'invalid_request',
        failureCode: 'INVALID_IMAGE_REQUEST'
      })
    ).toEqual({
      category: 'invalid_request',
      code: 'INVALID_IMAGE_REQUEST',
      retryable: false
    });
  });

  it('returns authoritative failure fields in the active task list item', () => {
    const item = toActiveTaskResponseItem(failedTask() as never);

    expect(item).toMatchObject({
      taskId: 'task-policy-failure',
      errorCategory: 'provider_policy',
      errorCode: 'CONTENT_POLICY_VIOLATION',
      retryable: false
    });
  });

  it('rejects a direct API retry for a non-retryable failed task', async () => {
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      single: vi.fn(async () => ({ data: failedTask(), error: null }))
    };
    const supabase = {
      from: vi.fn(() => query)
    };

    const response = await handleRetryImageTaskRequest({
      sb: supabase as never,
      userId: 'user-1',
      taskId: 'task-policy-failure',
      corsHeaders: {}
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: 'IMAGE_TASK_NOT_RETRYABLE',
      errorDetails: { retryable: false }
    });
  });
});
