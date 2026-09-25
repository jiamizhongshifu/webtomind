import { describe, expect, it, vi } from 'vitest';
import type {
  VisualImageGenerationRequest,
  VisualImageTaskListItem
} from '@/services/agent-api';
import {
  buildImageProgressTasks,
  getMissingImageTaskCount
} from '../imageTaskProgressTasks';
import type { ImageGenerationQueueItem } from '../useImageGeneration';

const request: VisualImageGenerationRequest = {
  prompt: 'test prompt',
  model: 'gpt-image-2',
  aspectRatio: '1:1',
  imageSize: '1024x1024',
  quality: 'auto',
  outputFormat: 'png',
  imageCount: 1,
  assetIds: [],
  promptMode: 'custom',
  referenceImageIds: [],
  referenceMode: 'none',
  characterCardIds: [],
  characterReferenceGroups: []
};

const translate = (key: string, options?: Record<string, unknown>) => {
  const map: Record<string, string> = {
    'progress.taskQueued': 'queued',
    'progress.taskMainGen': 'running',
    'progress.taskFailed': 'failed',
    'progress.taskSucceeded': 'succeeded',
    'progress.taskPartialSucceeded': 'partial',
    'progress.taskCancelled': 'cancelled',
    'progress.detailSubmitted': 'submitted',
    'progress.detailDone': 'done',
    'progress.detailPartialSucceeded': `${String(options?.done)}/${String(
      options?.total
    )} missing ${String(options?.missing)}`,
    'progress.detailWaitingModel': `waiting ${String(options?.seconds)}`,
    'progress.cancelledQueued': 'cancelled queued',
    'progress.cancelledRunning': 'cancelled running',
    'progress.queuePosition': `queue ${String(options?.n)}`,
    'progress.strictBatchPending': 'strict pending',
    'progress.strictBatchPartial': 'strict partial',
    'progress.partialRefundedNoAmount': 'partial refunded',
    'progress.partialRefunded': `partial refunded ${String(options?.credits)}`,
    'progress.partialRefundFailed': 'partial refund failed',
    'progress.retryMissing': 'retry missing',
    'progress.acknowledgeDone': 'ok',
    'progress.dismissTask': 'dismiss',
    'progress.deleteFailed': 'delete failed',
    'progress.taskRegen': 'regen',
    'progress.taskBatch': 'batch',
    'progress.allFailedHint': `failed ${String(options?.n)}`,
    'errors.generateFailed': 'generate failed'
  };
  return map[key] || key;
};

function makeServerTask(
  task: Partial<VisualImageTaskListItem>
): VisualImageTaskListItem {
  return {
    taskId: 'server-1',
    status: 'queued',
    request,
    createdAt: '2026-06-30T00:00:00.000Z',
    ...task
  };
}

function makeLocalTask(
  task: Partial<ImageGenerationQueueItem>
): ImageGenerationQueueItem {
  return {
    id: 'local-1',
    request,
    status: 'queued',
    createdAt: 1000,
    ...task
  };
}

function makeParams(
  overrides: Partial<Parameters<typeof buildImageProgressTasks>[0]> = {}
): Parameters<typeof buildImageProgressTasks>[0] {
  return {
    generationQueue: [],
    imageTaskCenterTasks: [],
    acknowledgedProgressTaskKeys: new Set(),
    failureFeedbackByTaskKey: {},
    failureFeedbackOptions: [{ id: 'wait_too_long', label: 'Wait too long' }],
    safetyFailureFeedbackOptions: [
      { id: 'safety_false_positive', label: 'Safety false block' },
      { id: 'wait_too_long', label: 'Wait too long' }
    ],
    batchRunning: false,
    batchStats: { total: 0, done: 0, failed: 0, processing: 0 },
    currentProcessingAsset: null,
    t: translate,
    now: 10_000,
    acknowledgeProgressTask: vi.fn(),
    cancelQueuedGeneration: vi.fn(),
    cancelServerQueuedGeneration: vi.fn(),
    cancelRunningGeneration: vi.fn(),
    cancelServerRunningGeneration: vi.fn(),
    handleEditGenerationTask: vi.fn(),
    retryGenerationTask: vi.fn(),
    retryServerGenerationTask: vi.fn(),
    dismissGenerationTask: vi.fn(),
    deleteGenerationTask: vi.fn(),
    deleteServerGenerationTask: vi.fn(),
    handleFailureFeedback: vi.fn(),
    removeImageTaskFromCenter: vi.fn(),
    dismissImageTaskFromCenter: vi.fn(),
    refreshImageTaskCenter: vi.fn(),
    setStatusText: vi.fn(),
    trackImageGenerationEvent: vi.fn(),
    ...overrides
  };
}

describe('buildImageProgressTasks', () => {
  it('keeps the creation session id on active task view models', () => {
    const params = makeParams({
      generationQueue: [
        {
          id: 'local-session-task',
          request: {
            ...request,
            creationContext: {
              sessionId: 'session-current',
              referenceAssetIds: []
            }
          },
          status: 'running',
          createdAt: Date.now(),
          generationIds: ['generation-current']
        }
      ]
    });

    const [task] = buildImageProgressTasks(params);

    expect(task?.sessionId).toBe('session-current');
    expect(task?.generationIds).toEqual(['generation-current']);
    expect(task?.prompt).toBe('test prompt');
    expect(task?.aspectRatio).toBe('1:1');
    expect(task?.imageCount).toBe(1);
  });

  it('uses server tasks ahead of matching local queue items and hides the duplicate local card', () => {
    const localTask = makeLocalTask({
      id: 'local-running',
      serverTaskId: 'server-1',
      status: 'running',
      progressDetail: 'local progress'
    });
    const params = makeParams({
      imageTaskCenterTasks: [
        makeServerTask({ status: 'running', taskId: 'server-1' })
      ],
      generationQueue: [
        localTask,
        makeLocalTask({ id: 'local-queued', status: 'queued' })
      ]
    });

    const tasks = buildImageProgressTasks(params);

    expect(tasks.map((task) => task.key)).toEqual([
      'image-server-server-1',
      'image-local-queued'
    ]);
    expect(tasks[0].detail).toBe('local progress');

    tasks[0].onEdit?.();
    expect(params.handleEditGenerationTask).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'local-running',
        serverTaskId: 'server-1',
        status: 'running'
      })
    );
  });

  it('omits acknowledged succeeded tasks from both server and local sources', () => {
    const tasks = buildImageProgressTasks(
      makeParams({
        acknowledgedProgressTaskKeys: new Set([
          'image-server-server-done',
          'image-local-done'
        ]),
        imageTaskCenterTasks: [
          makeServerTask({
            taskId: 'server-done',
            status: 'succeeded'
          })
        ],
        generationQueue: [
          makeLocalTask({
            id: 'local-done',
            status: 'succeeded',
            finishedAt: 9900
          })
        ]
      })
    );

    expect(tasks).toEqual([]);
  });

  it('retries only the missing image count for partial server successes', () => {
    const params = makeParams({
      imageTaskCenterTasks: [
        makeServerTask({
          taskId: 'server-partial',
          status: 'succeeded',
          request: { ...request, imageCount: 4 },
          requestedImageCount: 4,
          actualImageCount: 2,
          canRetryMissingImages: true
        })
      ]
    });

    const [task] = buildImageProgressTasks(params);

    expect(task.label).toBe('partial');
    expect(task.detail).toBe('2/4 missing 2');
    expect(task.retryLabel).toBe('retry missing');
    expect(task.imageProgress).toEqual({ total: 4, current: 2 });

    task.onRetry?.();
    expect(params.trackImageGenerationEvent).toHaveBeenCalledWith(
      'retry_click',
      expect.objectContaining({
        task_key: 'image-server-server-partial',
        source: 'server_task_partial_missing'
      })
    );
    expect(params.retryServerGenerationTask).toHaveBeenCalledWith(
      'server-partial',
      expect.objectContaining({ imageCount: 2 }),
      { deleteOriginalFailedTask: false }
    );
  });

  it('hides a partial server success while its missing-image retry is active', () => {
    const tasks = buildImageProgressTasks(
      makeParams({
        imageTaskCenterTasks: [
          makeServerTask({
            taskId: 'server-partial',
            status: 'succeeded',
            request: { ...request, imageCount: 2 },
            requestedImageCount: 2,
            actualImageCount: 1,
            missingImageCount: 1,
            canRetryMissingImages: true,
            missingImageRetryTaskId: 'server-retry'
          }),
          makeServerTask({
            taskId: 'server-retry',
            retryOfTaskId: 'server-partial',
            status: 'running',
            request: { ...request, imageCount: 1 }
          })
        ]
      })
    );

    expect(tasks.map((task) => task.key)).toEqual([
      'image-server-server-retry'
    ]);
    expect(tasks[0].label).toBe('running');
  });

  it('hides a local partial success immediately after the missing-image retry is queued locally', () => {
    const tasks = buildImageProgressTasks(
      makeParams({
        generationQueue: [
          makeLocalTask({
            id: 'local-partial',
            serverTaskId: 'server-partial',
            status: 'succeeded',
            request: { ...request, imageCount: 2 },
            requestedImageCount: 2,
            actualImageCount: 1,
            finishedAt: 9900
          }),
          makeLocalTask({
            id: 'local-retry',
            serverTaskId: 'server-retry',
            retryOfTaskId: 'server-partial',
            status: 'queued',
            request: { ...request, imageCount: 1 }
          })
        ]
      })
    );

    expect(tasks.map((task) => task.key)).toEqual(['image-local-retry']);
    expect(tasks[0].label).toBe('queued');
  });

  it('keeps cancelled server tasks dismissible from both the center and local queue', () => {
    const params = makeParams({
      imageTaskCenterTasks: [
        makeServerTask({
          taskId: 'server-cancelled',
          status: 'cancelled',
          cancelledTaskStatus: 'queued'
        })
      ]
    });

    const [task] = buildImageProgressTasks(params);

    expect(task.status).toBe('cancelled');
    expect(task.dismissLabel).toBe('dismiss');

    task.onDismiss?.();
    expect(params.dismissImageTaskFromCenter).toHaveBeenCalledWith(
      'server-cancelled'
    );
    expect(params.dismissGenerationTask).toHaveBeenCalledWith(
      'server-cancelled'
    );
  });

  it('acknowledges matching local tasks when a server success is confirmed', () => {
    const params = makeParams({
      imageTaskCenterTasks: [
        makeServerTask({
          taskId: 'server-done',
          status: 'succeeded'
        })
      ],
      generationQueue: [
        makeLocalTask({
          id: 'local-done',
          serverTaskId: 'server-done',
          status: 'succeeded',
          finishedAt: 9900
        })
      ]
    });

    const [task] = buildImageProgressTasks(params);
    task.onAcknowledge?.();

    expect(params.acknowledgeProgressTask).toHaveBeenCalledWith(
      'image-server-server-done'
    );
    expect(params.acknowledgeProgressTask).toHaveBeenCalledWith(
      'image-local-done'
    );
  });

  it('dismisses matching local queue items when a cancelled server task is dismissed', () => {
    const params = makeParams({
      imageTaskCenterTasks: [
        makeServerTask({
          taskId: 'server-cancelled',
          status: 'cancelled',
          cancelledTaskStatus: 'running'
        })
      ],
      generationQueue: [
        makeLocalTask({
          id: 'local-cancelled',
          serverTaskId: 'server-cancelled',
          status: 'cancelled',
          finishedAt: 9900
        })
      ]
    });

    const [task] = buildImageProgressTasks(params);
    task.onDismiss?.();

    expect(params.dismissImageTaskFromCenter).toHaveBeenCalledWith(
      'server-cancelled'
    );
    expect(params.dismissGenerationTask).toHaveBeenCalledWith(
      'local-cancelled'
    );
  });

  it('wires local failure feedback and retry actions without losing submitted state', () => {
    const params = makeParams({
      failureFeedbackByTaskKey: { 'image-local-failed': 'wait_too_long' },
      generationQueue: [
        makeLocalTask({
          id: 'local-failed',
          serverTaskId: 'server-failed',
          status: 'failed',
          error: 'provider timeout'
        })
      ]
    });

    const [task] = buildImageProgressTasks(params);

    expect(task.status).toBe('failed');
    expect(task.feedbackOptions).toEqual(params.failureFeedbackOptions);
    expect(task.feedbackSubmitted).toBe('wait_too_long');

    task.onFeedback?.('quality_low');
    expect(params.handleFailureFeedback).toHaveBeenCalledWith(
      'image-local-failed',
      'quality_low',
      expect.objectContaining({
        taskId: 'server-failed',
        source: 'local_queue'
      })
    );

    task.onRetry?.();
    expect(params.retryGenerationTask).toHaveBeenCalledWith('local-failed');
  });

  it('uses safety feedback options for provider policy failures', () => {
    const params = makeParams({
      imageTaskCenterTasks: [
        makeServerTask({
          taskId: 'server-policy',
          status: 'failed',
          errorCategory: 'provider_policy',
          error: 'blocked'
        })
      ]
    });

    const [task] = buildImageProgressTasks(params);

    expect(task.status).toBe('failed');
    expect(task.feedbackOptions).toEqual(params.safetyFailureFeedbackOptions);
    expect(task.onRetry).toBeUndefined();
    expect(task.onEdit).toBeTypeOf('function');
  });

  it('does not expose retry after a local task is marked non-retryable', () => {
    const params = makeParams({
      generationQueue: [
        makeLocalTask({
          id: 'local-invalid',
          status: 'failed',
          error: 'invalid request',
          retryable: false
        })
      ]
    });

    const [task] = buildImageProgressTasks(params);

    expect(task.onRetry).toBeUndefined();
    expect(task.onEdit).toBeTypeOf('function');
  });

  it('uses safety feedback options when only localized safety copy is available', () => {
    const params = makeParams({
      generationQueue: [
        makeLocalTask({
          id: 'local-policy',
          status: 'failed',
          error: '图片生成被安全系统拦截。请点击编辑任务 Prompt 后重试。'
        })
      ]
    });

    const [task] = buildImageProgressTasks(params);

    expect(task.status).toBe('failed');
    expect(task.feedbackOptions).toEqual(params.safetyFailureFeedbackOptions);
  });
});

describe('getMissingImageTaskCount', () => {
  it('prefers explicit positive missing count before deriving from actual images', () => {
    expect(
      getMissingImageTaskCount({
        request: { ...request, imageCount: 4 },
        requestedImageCount: 4,
        actualImageCount: 3,
        missingImageCount: 2
      })
    ).toBe(2);
  });
});
