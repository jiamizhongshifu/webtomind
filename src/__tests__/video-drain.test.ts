import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getCorsHeadersForRequestMock, runVideoGenerationTaskStepMock } =
  vi.hoisted(() => ({
    getCorsHeadersForRequestMock: vi.fn(() => ({})),
    runVideoGenerationTaskStepMock: vi.fn()
  }));

vi.mock('../../api/utils/auth.js', () => ({
  getCorsHeadersForRequest: getCorsHeadersForRequestMock
}));

vi.mock('../../api/video/task-runner', () => ({
  runVideoGenerationTaskStep: runVideoGenerationTaskStepMock
}));

import handler from '../../api/video/drain';

const ORIGINAL_ENV = { ...process.env };

describe('video drain', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.VIDEO_DRAIN_SECRET = 'secret';
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('returns runner reenqueue instructions for valid queue messages', async () => {
    runVideoGenerationTaskStepMock
      .mockResolvedValueOnce({
        taskId: 'task-1',
        status: 'running',
        phase: 'poll',
        providerTaskId: 'provider-task-1',
        reenqueue: {
          taskId: 'task-1',
          phase: 'poll',
          delaySeconds: 5
        }
      })
      .mockResolvedValueOnce({
        taskId: 'task-2',
        status: 'succeeded',
        providerTaskId: 'provider-task-2',
        generationId: 'generation-2'
      });

    const response = await handler(
      new Request('https://webtomind.com/api/video/drain', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer secret',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          requestedBatchSize: 3,
          messages: [
            { body: { taskId: 'task-1', phase: 'create' } },
            { body: { taskId: 'task-2', phase: 'poll' } },
            { body: { phase: 'poll' } }
          ]
        })
      })
    );

    const body = await response.json();
    expect(response.status).toBe(200);
    expect(runVideoGenerationTaskStepMock).toHaveBeenCalledTimes(2);
    expect(runVideoGenerationTaskStepMock).toHaveBeenNthCalledWith(1, {
      taskId: 'task-1',
      phase: 'create'
    });
    expect(runVideoGenerationTaskStepMock).toHaveBeenNthCalledWith(2, {
      taskId: 'task-2',
      phase: 'poll'
    });
    expect(body).toMatchObject({
      success: true,
      processedCount: 2,
      queuedMessageCount: 2,
      reenqueueCount: 1,
      reenqueue: [
        {
          taskId: 'task-1',
          phase: 'poll',
          delaySeconds: 5
        }
      ]
    });
  });
});
