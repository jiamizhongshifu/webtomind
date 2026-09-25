import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createImageGenerationTaskMock,
  executeImageGenerationJobMock,
  getUserImageConcurrencyMock,
  recordImageTaskTerminalEventsMock
} = vi.hoisted(() => ({
  createImageGenerationTaskMock: vi.fn(),
  executeImageGenerationJobMock: vi.fn(),
  getUserImageConcurrencyMock: vi.fn(),
  recordImageTaskTerminalEventsMock: vi.fn()
}));

vi.mock('../../api/image/generate.js', () => ({
  createImageGenerationTask: createImageGenerationTaskMock,
  executeImageGenerationJob: executeImageGenerationJobMock,
  extractProviderRequestId: (message: string) =>
    message.match(/request id:\s*([^)]+)/i)?.[1]?.trim(),
  getImageTaskBillingIdempotencyKey: (
    taskId: string | undefined,
    billingPhase: string
  ) =>
    taskId && billingPhase
      ? `image_task:${taskId}:${billingPhase}`
      : undefined,
  getErrorMessage: (error: unknown, fallback = '图片生成失败') =>
    error instanceof Error ? error.message : fallback,
  parseQueuedImageGenerationCreditWaiver: (payload: unknown) =>
    payload && typeof payload === 'object'
      ? (payload as Record<string, unknown>).creditWaiver
      : undefined,
  parseQueuedImageGenerationPrepaidCredit: (payload: unknown) =>
    payload && typeof payload === 'object'
      ? (payload as Record<string, unknown>).prepaidCredit
      : undefined,
  parseQueuedImageGenerationRequest: (payload: unknown) =>
    payload &&
    typeof payload === 'object' &&
    (payload as Record<string, unknown>).valid === true
      ? (payload as Record<string, unknown>).input || {}
      : null,
  GPT_IMAGE_2_DENOISE_PIPELINE_DEADLINE_MS: 300000,
  QUEUED_PIPELINE_DEADLINE_MS: 330000,
  QUEUED_TUZI_VIP_TIMEOUT_MS: 260000
}));

vi.mock('../../api/image/task-concurrency.js', () => ({
  getUserImageConcurrency: getUserImageConcurrencyMock
}));

vi.mock('../../api/image/task-observability.js', () => ({
  recordImageTaskTerminalEvents: recordImageTaskTerminalEventsMock
}));

import {
  claimImageTask,
  getImageTaskCompletionMetrics,
  getImageTaskPipelineDeadlineMs,
  runImageTask,
  type ImageGenerationTaskRecord
} from '../../api/image/task-runner';

function makeTask(
  overrides: Partial<ImageGenerationTaskRecord> = {}
): ImageGenerationTaskRecord {
  return {
    id: 'task-1',
    user_id: 'user-1',
    status: 'queued',
    request_payload: { valid: true, input: { prompt: 'test prompt' } },
    result_payload: null,
    error_message: null,
    refund_failed: false,
    generation_id: null,
    attempt_count: 0,
    started_at: null,
    first_started_at: null,
    locked_until: null,
    created_at: '2026-06-15T00:00:00.000Z',
    updated_at: '2026-06-15T00:00:00.000Z',
    ...overrides
  };
}

class SupabaseQuery {
  private filters: Array<{
    op: 'eq' | 'neq' | 'gte' | 'lt';
    field: string;
    value: unknown;
  }> = [];
  private rowLimit: number | null = null;

  constructor(
    private rows: ImageGenerationTaskRecord[],
    private updateValues?: Record<string, unknown>,
    private beforeUpdateApply?: () => void
  ) {}

  select() {
    return this;
  }

  update(values: Record<string, unknown>) {
    this.updateValues = values;
    return this;
  }

  eq(field: string, value: unknown) {
    this.filters.push({ op: 'eq', field, value });
    return this;
  }

  neq(field: string, value: unknown) {
    this.filters.push({ op: 'neq', field, value });
    return this;
  }

  gte(field: string, value: unknown) {
    this.filters.push({ op: 'gte', field, value });
    return this;
  }

  lt(field: string, value: unknown) {
    this.filters.push({ op: 'lt', field, value });
    return this;
  }

  limit(value: number) {
    this.rowLimit = value;
    return this;
  }

  private matches(row: ImageGenerationTaskRecord) {
    return this.filters.every((filter) => {
      const rowRecord = row as unknown as Record<string, unknown>;
      const rowValue = filter.field.includes('->>')
        ? filter.field.split('->>').reduce<unknown>((value, key) => {
            if (!value || typeof value !== 'object') return undefined;
            return (value as Record<string, unknown>)[key];
          }, rowRecord)
        : rowRecord[filter.field];
      if (filter.op === 'eq') return rowValue === filter.value;
      if (filter.op === 'neq') return rowValue !== filter.value;
      if (filter.op === 'gte') return String(rowValue) >= String(filter.value);
      return String(rowValue) < String(filter.value);
    });
  }

  private apply() {
    if (this.updateValues) this.beforeUpdateApply?.();
    let matched = this.rows.filter((row) => this.matches(row));
    if (this.rowLimit !== null) matched = matched.slice(0, this.rowLimit);
    if (this.updateValues) {
      matched.forEach((row) => Object.assign(row, this.updateValues));
    }
    return matched;
  }

  single() {
    const data = this.apply()[0] || null;
    return Promise.resolve({
      data,
      error: data ? null : { message: 'not found' }
    });
  }

  maybeSingle() {
    return Promise.resolve({ data: this.apply()[0] || null, error: null });
  }

  then(
    resolve: (value: { data: ImageGenerationTaskRecord[]; error: null }) => void
  ) {
    return Promise.resolve({ data: this.apply(), error: null }).then(resolve);
  }
}

function createSupabaseMock(
  rows: ImageGenerationTaskRecord[],
  beforeUpdateApply?: () => void
) {
  return {
    from: vi.fn(() => new SupabaseQuery(rows, undefined, beforeUpdateApply)),
    rpc: vi.fn(
      async (
        name: string,
        args: {
          p_task_id: string;
          p_expected_status: string;
          p_user_id?: string | null;
          p_max_attempts: number;
        }
      ) => {
        if (name !== 'claim_image_generation_task') {
          return { data: null, error: { message: 'unexpected rpc' } };
        }
        const task = rows.find((row) => row.id === args.p_task_id);
        if (
          !task ||
          task.status !== args.p_expected_status ||
          (args.p_user_id && task.user_id !== args.p_user_id) ||
          (task.attempt_count || 0) >= args.p_max_attempts
        ) {
          return { data: { claimed: false }, error: null };
        }
        const now = new Date().toISOString();
        Object.assign(task, {
          status: 'running',
          started_at: now,
          first_started_at: task.first_started_at || now,
          last_attempt_at: now,
          locked_until: new Date(Date.now() + 345_000).toISOString(),
          lease_token: `lease-${(task.attempt_count || 0) + 1}`,
          attempt_count: (task.attempt_count || 0) + 1,
          updated_at: now
        });
        return { data: { claimed: true, task }, error: null };
      }
    )
  };
}

describe('image task runner', () => {
  beforeEach(() => {
    createImageGenerationTaskMock.mockReset();
    createImageGenerationTaskMock.mockResolvedValue('auto-retry-task');
    executeImageGenerationJobMock.mockReset();
    getUserImageConcurrencyMock.mockReset();
    getUserImageConcurrencyMock.mockResolvedValue(1);
    recordImageTaskTerminalEventsMock.mockReset();
    recordImageTaskTerminalEventsMock.mockResolvedValue(undefined);
  });

  it('measures queue and provider duration from the first task start', () => {
    const task = makeTask({
      created_at: '2026-06-15T00:00:00.000Z',
      first_started_at: '2026-06-15T00:00:05.000Z',
      started_at: '2026-06-15T00:00:20.000Z'
    });

    expect(
      getImageTaskCompletionMetrics(
        task,
        Date.parse('2026-06-15T00:00:30.000Z')
      )
    ).toEqual({
      queue_wait_ms: 5000,
      provider_latency_ms: 25000,
      total_duration_ms: 30000
    });
  });

  it('claims a queued task through the shared running lock path', async () => {
    const task = makeTask();
    const sb = createSupabaseMock([task]);

    const claimed = await claimImageTask({
      sb: sb as never,
      task,
      userId: 'user-1'
    });

    expect(claimed).toBeTruthy();
    expect(task.status).toBe('running');
    expect(task.attempt_count).toBe(1);
    expect(task.lease_token).toBe('lease-1');
    expect(task.first_started_at).toBeTruthy();
    expect(task.locked_until).toBeTruthy();
  });

  it('extends only denoiser task execution and lease budgets', async () => {
    const task = makeTask({
      request_payload: {
        valid: true,
        input: {
          prompt: 'faithful redraw',
          appOperation: 'gpt-image-2-denoise'
        },
        model: 'nano-banana-2',
        provider: 'tuzi',
        appSlug: 'gpt-image-2-denoiser',
        appOperation: 'gpt-image-2-denoise',
        sourceApp: 'gpt-image-2-denoiser'
      }
    });
    const sb = createSupabaseMock([task]);

    expect(getImageTaskPipelineDeadlineMs(task.request_payload)).toBe(300000);
    expect(getImageTaskPipelineDeadlineMs({ appOperation: 'generate' })).toBe(
      330000
    );
    expect(
      getImageTaskPipelineDeadlineMs({
        appOperation: 'gpt-image-2-denoise'
      })
    ).toBe(330000);

    await claimImageTask({ sb: sb as never, task, userId: 'user-1' });
    expect(sb.rpc).toHaveBeenCalledWith(
      'claim_image_generation_task',
      expect.objectContaining({ p_lease_seconds: 315 })
    );
  });

  it('does not let a superseded worker overwrite the current lease result', async () => {
    const task = makeTask({
      status: 'running',
      lease_token: 'lease-current'
    });
    const sb = createSupabaseMock([task]);
    executeImageGenerationJobMock.mockResolvedValue({
      ok: true,
      status: 200,
      payload: {
        success: true,
        generationId: 'generation-stale',
        images: [],
        imageCount: 1,
        requestedImageCount: 1
      }
    });

    const staleTask = { ...task, lease_token: 'lease-stale' };
    const result = await runImageTask({
      sb: sb as never,
      task: staleTask,
      request: new Request('https://webtomind.com/api/image/task')
    });

    expect(result.status).toBe('cancelled');
    expect(task.status).toBe('running');
    expect(task.generation_id).toBeNull();
    expect(executeImageGenerationJobMock).not.toHaveBeenCalled();
  });

  it('does not enqueue retry side effects when the lease changes during finalization', async () => {
    const storedTask = makeTask({
      status: 'running',
      lease_token: 'lease-current'
    });
    const workerTask = { ...storedTask };
    let superseded = false;
    const sb = createSupabaseMock([storedTask], () => {
      if (superseded) return;
      superseded = true;
      storedTask.lease_token = 'lease-new-worker';
    });
    executeImageGenerationJobMock.mockResolvedValue({
      ok: true,
      status: 200,
      payload: {
        success: true,
        generationId: 'generation-stale',
        images: [{ generationId: 'generation-stale' }],
        imageCount: 1,
        actualImageCount: 1,
        requestedImageCount: 2
      }
    });

    const result = await runImageTask({
      sb: sb as never,
      task: workerTask,
      request: new Request('https://webtomind.com/api/image/task')
    });

    expect(result).toMatchObject({
      status: 'cancelled',
      error: 'Task lease was superseded'
    });
    expect(storedTask.status).toBe('running');
    expect(storedTask.generation_id).toBeNull();
    expect(createImageGenerationTaskMock).not.toHaveBeenCalled();
    expect(recordImageTaskTerminalEventsMock).not.toHaveBeenCalled();
  });

  it('does not claim a task for a different polling user', async () => {
    const task = makeTask();
    const sb = createSupabaseMock([task]);

    const claimed = await claimImageTask({
      sb: sb as never,
      task,
      userId: 'user-2'
    });

    expect(claimed).toBeNull();
    expect(task.status).toBe('queued');
  });

  it('finalizes invalid queued payloads consistently as failed', async () => {
    const task = makeTask({
      request_payload: { valid: false },
      status: 'running'
    });
    const sb = createSupabaseMock([task]);

    const result = await runImageTask({
      sb: sb as never,
      task,
      request: new Request('https://webtomind.com/api/image/task')
    });

    expect(result).toMatchObject({
      taskId: 'task-1',
      status: 'failed',
      error: '任务参数无效',
      refundFailed: false
    });
    const updatedTask = task as unknown as Record<string, unknown>;
    expect(task.status).toBe('failed');
    expect(updatedTask.failure_category).toBe('invalid_request');
    expect(task.locked_until).toBeNull();
    expect(updatedTask.completed_at).toBeTruthy();
    expect(task.result_payload).toMatchObject({
      success: false,
      errorDetails: {
        code: 'INVALID_IMAGE_REQUEST',
        category: 'invalid_request',
        retryable: false
      }
    });
    expect(recordImageTaskTerminalEventsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        task,
        status: 'failed',
        failure: {
          code: 'INVALID_IMAGE_REQUEST',
          category: 'invalid_request'
        }
      })
    );
  });

  it('runs provider execution once and finalizes success payloads', async () => {
    const task = makeTask({ status: 'running' });
    const sb = createSupabaseMock([task]);
    executeImageGenerationJobMock.mockResolvedValue({
      ok: true,
      status: 200,
      payload: {
        success: true,
        generationId: 'generation-1',
        imageUrl: 'https://example.com/image.png',
        imageUrlExpiresIn: 86400,
        images: [],
        imageCount: 1,
        requestedImageCount: 1,
        provider: 'krill',
        model: 'gpt-image-2',
        modelLabel: 'GPT Image 2',
        requestedModelLabel: 'GPT Image 2',
        quality: 'auto',
        aspectRatio: '2:3',
        imageSize: '1024x1536',
        outputFormat: 'png',
        usedFallback: false,
        credits: {
          consumed: 100,
          creditType: 'bonus'
        }
      }
    });

    const result = await runImageTask({
      sb: sb as never,
      task,
      request: new Request('https://webtomind.com/api/image/task')
    });

    expect(executeImageGenerationJobMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        options: expect.objectContaining({
          mode: 'queued',
          taskId: 'task-1',
          pipelineDeadlineMs: 330000,
          tuziVipTimeoutMs: 260000
        })
      })
    );
    expect(result.status).toBe('succeeded');
    expect(task.status).toBe('succeeded');
    expect(task.generation_id).toBe('generation-1');
    expect(
      (task as unknown as Record<string, unknown>).failure_category
    ).toBeNull();
    expect(task.locked_until).toBeNull();
    expect(recordImageTaskTerminalEventsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        task,
        status: 'succeeded',
        payload: expect.objectContaining({ generationId: 'generation-1' })
      })
    );
  });

  it('runs denoiser jobs with the dedicated pipeline deadline', async () => {
    const task = makeTask({
      status: 'running',
      request_payload: {
        valid: true,
        input: {
          prompt: 'faithful redraw',
          appOperation: 'gpt-image-2-denoise'
        },
        model: 'nano-banana-2',
        provider: 'tuzi',
        appSlug: 'gpt-image-2-denoiser',
        appOperation: 'gpt-image-2-denoise',
        sourceApp: 'gpt-image-2-denoiser'
      }
    });
    const sb = createSupabaseMock([task]);
    executeImageGenerationJobMock.mockResolvedValue({
      ok: true,
      status: 200,
      payload: {
        success: true,
        generationId: 'denoise-generation',
        images: [],
        imageCount: 1,
        requestedImageCount: 1
      }
    });

    await runImageTask({
      sb: sb as never,
      task,
      request: new Request('https://webtomind.com/api/image/task')
    });

    expect(executeImageGenerationJobMock).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          cloudDenoiseTask: true,
          pipelineDeadlineMs: 300000,
          disableProviderFallback: true
        })
      })
    );
  });

  it('idempotently reconciles a denoiser failure refund before finalizing the task', async () => {
    const task = makeTask({
      status: 'running',
      request_payload: {
        valid: true,
        input: { prompt: 'faithful redraw' },
        model: 'nano-banana-2',
        provider: 'tuzi',
        appSlug: 'gpt-image-2-denoiser',
        appOperation: 'gpt-image-2-denoise',
        sourceApp: 'gpt-image-2-denoiser',
        prepaidCredit: {
          consumed: 115,
          creditType: 'media',
          creditBreakdown: { media: 115 }
        }
      }
    });
    const sb = createSupabaseMock([task]);
    (sb.rpc as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      async (name: string) => {
        if (name === 'refund_gpt_image_2_denoise_credits_v3') {
          return {
            data: { success: true, refunded: 115, idempotent: true },
            error: null
          };
        }
        return { data: null, error: { message: 'unexpected rpc' } };
      }
    );
    executeImageGenerationJobMock.mockResolvedValue({
      ok: false,
      status: 500,
      failureReason: 'reference signing failed',
      failureDetails: {
        code: 'IMAGE_GENERATION_FAILED',
        category: 'unknown',
        retryable: true
      },
      body: { error: 'reference signing failed' },
      refundFailed: false
    });

    const result = await runImageTask({
      sb: sb as never,
      task,
      request: new Request('https://webtomind.com/api/image/task')
    });

    expect(sb.rpc).toHaveBeenCalledWith(
      'refund_gpt_image_2_denoise_credits_v3',
      expect.objectContaining({
        p_amount: 115,
        p_source: 'denoise_task:task-1:refund',
        p_metadata: expect.objectContaining({
          idempotency_key: 'image_task:task-1:generation_failure_refund',
          creditBreakdown: { media: 115 }
        })
      })
    );
    expect(result).toMatchObject({ status: 'failed', refundFailed: false });
    expect(task.refund_failed).toBe(false);
  });

  it('marks a denoiser failure for retry when refund reconciliation is rejected', async () => {
    const task = makeTask({
      status: 'running',
      request_payload: {
        valid: true,
        input: { prompt: 'faithful redraw' },
        model: 'nano-banana-2',
        provider: 'tuzi',
        appSlug: 'gpt-image-2-denoiser',
        appOperation: 'gpt-image-2-denoise',
        sourceApp: 'gpt-image-2-denoiser',
        prepaidCredit: {
          consumed: 115,
          creditType: 'media',
          creditBreakdown: { media: 115 }
        }
      }
    });
    const sb = createSupabaseMock([task]);
    (sb.rpc as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { success: false, error: 'INVALID_CREDIT_BREAKDOWN' },
      error: null
    });
    executeImageGenerationJobMock.mockResolvedValue({
      ok: false,
      status: 500,
      failureReason: 'reference signing failed',
      body: { error: 'reference signing failed' },
      refundFailed: false
    });

    const result = await runImageTask({
      sb: sb as never,
      task,
      request: new Request('https://webtomind.com/api/image/task')
    });

    expect(result).toMatchObject({ status: 'failed', refundFailed: true });
    expect(task.refund_failed).toBe(true);
  });

  it('automatically queues a waived missing-image retry after partial success', async () => {
    const task = makeTask({
      id: 'parent-task',
      status: 'running',
      request_payload: {
        valid: true,
        input: { prompt: 'parent prompt', imageCount: 2 },
        imageCount: 2
      }
    });
    const sb = createSupabaseMock([task]);
    executeImageGenerationJobMock.mockResolvedValue({
      ok: true,
      status: 200,
      payload: {
        success: true,
        generationId: 'generation-parent',
        imageUrl: 'https://example.com/parent.png',
        imageUrlExpiresIn: 86400,
        images: [
          {
            generationId: 'generation-parent',
            imageUrl: 'https://example.com/parent.png'
          }
        ],
        imageCount: 1,
        requestedImageCount: 2,
        actualImageCount: 1,
        provider: 'tuzi',
        model: 'gpt-image-2',
        modelLabel: 'GPT Image 2',
        requestedModelLabel: 'GPT Image 2',
        quality: 'auto',
        aspectRatio: '9:16',
        imageSize: '1152x2048',
        outputFormat: 'png',
        usedFallback: false,
        partialRefundWarning: '图片服务只返回 1/2 张',
        credits: {
          consumed: 100,
          refunded: 100,
          creditType: 'bonus'
        }
      }
    });

    const result = await runImageTask({
      sb: sb as never,
      task,
      request: new Request('https://webtomind.com/api/image/task')
    });

    expect(result.status).toBe('succeeded');
    expect(createImageGenerationTaskMock).toHaveBeenCalledWith(
      sb,
      'user-1',
      expect.objectContaining({
        prompt: 'parent prompt',
        imageCount: 1
      }),
      undefined,
      {
        reason: 'auto_retry_missing_images_without_double_charge',
        sourceTaskId: 'parent-task'
      }
    );
    expect(task.result_payload).toMatchObject({
      imageCount: 1,
      actualImageCount: 1,
      requestedImageCount: 2,
      missingImageRetryTaskId: 'auto-retry-task',
      missingImageRetryImageCount: 1,
      missingImageRetryCreditWaived: true,
      missingImageRetryMode: 'auto'
    });
  });

  it('keeps provider-pending image tasks running and asks the worker to reenqueue', async () => {
    const task = makeTask({ status: 'running' });
    const sb = createSupabaseMock([task]);
    executeImageGenerationJobMock.mockResolvedValue({
      ok: false,
      status: 202,
      failureReason:
        'Chaojitudou image task is still pending (poll_budget) for provider-task-1',
      failureDetails: {
        code: 'OPENAI_COMPAT_PROVIDER_PENDING',
        category: 'provider_unavailable',
        retryable: true,
        provider: 'openai',
        model: 'gpt-image-2'
      },
      body: {
        success: false,
        pendingProviderPoll: true,
        providerTaskId: 'provider-task-1',
        retryAfterMs: 12000,
        reenqueue: {
          taskId: 'task-1',
          delaySeconds: 12
        }
      },
      refundFailed: false
    });

    const result = await runImageTask({
      sb: sb as never,
      task,
      request: new Request('https://webtomind.com/api/image/task')
    });

    expect(result).toMatchObject({
      taskId: 'task-1',
      status: 'running',
      reenqueue: {
        taskId: 'task-1',
        delaySeconds: 12
      },
      refundFailed: false
    });
    expect(task.status).toBe('running');
    expect(task.locked_until).toBeTruthy();
    expect(
      (task as unknown as Record<string, unknown>).completed_at
    ).toBeUndefined();
    expect(task.result_payload).toMatchObject({
      success: false,
      pendingProviderPoll: true,
      errorDetails: {
        code: 'OPENAI_COMPAT_PROVIDER_PENDING'
      }
    });
    expect(task.provider_request_id).toBe('provider-task-1');
    expect(recordImageTaskTerminalEventsMock).not.toHaveBeenCalled();
  });

  it('keeps the provider task id after a deferred task later succeeds', async () => {
    const task = makeTask({
      status: 'running',
      provider_request_id: 'provider-task-1'
    });
    const sb = createSupabaseMock([task]);
    executeImageGenerationJobMock.mockResolvedValue({
      ok: true,
      status: 200,
      payload: {
        success: true,
        generationId: 'generation-recovered',
        images: [],
        imageCount: 1,
        requestedImageCount: 1
      }
    });

    const result = await runImageTask({
      sb: sb as never,
      task,
      request: new Request('https://webtomind.com/api/image/task')
    });

    expect(result.status).toBe('succeeded');
    expect(task.provider_request_id).toBe('provider-task-1');
  });

  it('merges a successful missing-image retry back into its partial parent task', async () => {
    const parentTask = makeTask({
      id: 'parent-task',
      status: 'succeeded',
      request_payload: {
        valid: true,
        input: { prompt: 'parent prompt', imageCount: 2 },
        imageCount: 2
      },
      result_payload: {
        success: true,
        generationId: 'generation-parent',
        imageUrl: 'https://example.com/parent.png',
        imageUrlExpiresIn: 86400,
        images: [
          {
            generationId: 'generation-parent',
            imageUrl: 'https://example.com/parent.png'
          }
        ],
        imageCount: 1,
        actualImageCount: 1,
        requestedImageCount: 2,
        refunded: 100,
        partialRefundWarning: '图片服务只返回 1/2 张',
        skippedCrossChannelSupplement: true,
        missingImageRetryTaskId: 'retry-task',
        missingImageRetryImageCount: 1,
        credits: {
          consumed: 100,
          refunded: 100,
          warning: '图片服务只返回 1/2 张'
        }
      }
    });
    const retryTask = makeTask({
      id: 'retry-task',
      status: 'running',
      request_payload: {
        valid: true,
        input: { prompt: 'parent prompt', imageCount: 1 },
        imageCount: 1
      }
    });
    const sb = createSupabaseMock([parentTask, retryTask]);
    executeImageGenerationJobMock.mockResolvedValue({
      ok: true,
      status: 200,
      payload: {
        success: true,
        generationId: 'generation-retry',
        imageUrl: 'https://example.com/retry.png',
        imageUrlExpiresIn: 86400,
        images: [
          {
            generationId: 'generation-retry',
            imageUrl: 'https://example.com/retry.png'
          }
        ],
        imageCount: 1,
        requestedImageCount: 1,
        actualImageCount: 1,
        provider: 'openai',
        model: 'gpt-image-2',
        modelLabel: 'GPT Image 2',
        requestedModelLabel: 'GPT Image 2',
        quality: 'auto',
        aspectRatio: '3:4',
        imageSize: '1536x2048',
        outputFormat: 'png',
        usedFallback: false,
        credits: {
          consumed: 100,
          creditType: 'bonus'
        }
      }
    });

    const result = await runImageTask({
      sb: sb as never,
      task: retryTask,
      request: new Request('https://webtomind.com/api/image/task')
    });

    expect(result.status).toBe('succeeded');
    expect(parentTask.result_payload).toMatchObject({
      imageCount: 2,
      actualImageCount: 2,
      requestedImageCount: 2,
      skippedCrossChannelSupplement: false,
      missingImageRetryCompletedTaskId: 'retry-task',
      missingImageRetryResultStatus: 'succeeded'
    });
    expect(parentTask.result_payload?.images).toHaveLength(2);
    expect(parentTask.result_payload).not.toHaveProperty(
      'missingImageRetryTaskId'
    );
    expect(parentTask.result_payload).not.toHaveProperty(
      'partialRefundWarning'
    );
    expect(parentTask.result_payload?.credits).not.toHaveProperty('warning');
  });

  it('finds a partial parent directly from a missing-image retry source task id', async () => {
    const parentTask = makeTask({
      id: 'parent-task',
      status: 'succeeded',
      request_payload: {
        valid: true,
        input: { prompt: 'parent prompt', imageCount: 2 },
        imageCount: 2
      },
      result_payload: {
        success: true,
        images: [{ generationId: 'generation-parent' }],
        imageCount: 1,
        actualImageCount: 1,
        requestedImageCount: 2,
        partialRefundWarning: '图片服务只返回 1/2 张'
      }
    });
    const retryTask = makeTask({
      id: 'auto-retry-task',
      status: 'running',
      request_payload: {
        valid: true,
        input: { prompt: 'parent prompt', imageCount: 1 },
        imageCount: 1,
        creditWaiver: {
          reason: 'auto_retry_missing_images_without_double_charge',
          sourceTaskId: 'parent-task'
        }
      }
    });
    const sb = createSupabaseMock([parentTask, retryTask]);
    executeImageGenerationJobMock.mockResolvedValue({
      ok: true,
      status: 200,
      payload: {
        success: true,
        generationId: 'generation-retry',
        imageUrl: 'https://example.com/retry.png',
        imageUrlExpiresIn: 86400,
        images: [{ generationId: 'generation-retry' }],
        imageCount: 1,
        requestedImageCount: 1,
        actualImageCount: 1,
        provider: 'tuzi',
        model: 'gpt-image-2',
        modelLabel: 'GPT Image 2',
        requestedModelLabel: 'GPT Image 2',
        quality: 'auto',
        aspectRatio: '9:16',
        imageSize: '1152x2048',
        outputFormat: 'png',
        usedFallback: false,
        credits: {
          consumed: 0,
          creditType: 'waived'
        }
      }
    });

    const result = await runImageTask({
      sb: sb as never,
      task: retryTask,
      request: new Request('https://webtomind.com/api/image/task')
    });

    expect(result.status).toBe('succeeded');
    expect(parentTask.result_payload).toMatchObject({
      imageCount: 2,
      actualImageCount: 2,
      requestedImageCount: 2,
      missingImageRetryCompletedTaskId: 'auto-retry-task',
      missingImageRetryResultStatus: 'succeeded'
    });
    expect(parentTask.result_payload?.images).toHaveLength(2);
    expect(parentTask.result_payload).not.toHaveProperty(
      'partialRefundWarning'
    );
  });

  it('clears a partial parent retry marker when the missing-image retry fails', async () => {
    const parentTask = makeTask({
      id: 'parent-task',
      status: 'succeeded',
      request_payload: {
        valid: true,
        input: { prompt: 'parent prompt', imageCount: 2 },
        imageCount: 2
      },
      result_payload: {
        success: true,
        images: [{ generationId: 'generation-parent' }],
        imageCount: 1,
        actualImageCount: 1,
        requestedImageCount: 2,
        missingImageRetryTaskId: 'retry-task',
        missingImageRetryImageCount: 1
      }
    });
    const retryTask = makeTask({
      id: 'retry-task',
      status: 'running',
      request_payload: {
        valid: true,
        input: { prompt: 'parent prompt', imageCount: 1 },
        imageCount: 1
      }
    });
    const sb = createSupabaseMock([parentTask, retryTask]);
    executeImageGenerationJobMock.mockResolvedValue({
      ok: false,
      status: 500,
      failureReason: 'provider failed',
      failureDetails: {
        code: 'PROVIDER_FAILED',
        category: 'provider_unavailable',
        retryable: true
      },
      body: { error: 'provider failed' },
      refundFailed: false
    });

    const result = await runImageTask({
      sb: sb as never,
      task: retryTask,
      request: new Request('https://webtomind.com/api/image/task')
    });

    expect(result.status).toBe('failed');
    expect(parentTask.result_payload).toMatchObject({
      imageCount: 1,
      actualImageCount: 1,
      requestedImageCount: 2,
      missingImageRetryFailedTaskId: 'retry-task',
      missingImageRetryResultStatus: 'failed',
      missingImageRetryError: 'provider failed'
    });
    expect(parentTask.result_payload).not.toHaveProperty(
      'missingImageRetryTaskId'
    );
  });

  it('merges a successful retry of a failed missing-image retry into the partial parent', async () => {
    const parentTask = makeTask({
      id: 'parent-task',
      status: 'succeeded',
      request_payload: {
        valid: true,
        input: { prompt: 'parent prompt', imageCount: 2 },
        imageCount: 2
      },
      result_payload: {
        success: true,
        images: [{ generationId: 'generation-parent' }],
        imageCount: 1,
        actualImageCount: 1,
        requestedImageCount: 2,
        missingImageRetryFailedTaskId: 'failed-retry-task',
        missingImageRetryResultStatus: 'failed',
        missingImageRetryError: 'Invalid token'
      }
    });
    const retryOfFailedRetryTask = makeTask({
      id: 'retry-of-failed-retry-task',
      status: 'running',
      request_payload: {
        valid: true,
        input: { prompt: 'parent prompt', imageCount: 1 },
        imageCount: 1,
        creditWaiver: {
          reason: 'retry_after_refunded_failure',
          sourceTaskId: 'failed-retry-task'
        }
      }
    });
    const sb = createSupabaseMock([parentTask, retryOfFailedRetryTask]);
    executeImageGenerationJobMock.mockResolvedValue({
      ok: true,
      status: 200,
      payload: {
        success: true,
        generationId: 'generation-retry-2',
        imageUrl: 'https://example.com/retry-2.png',
        imageUrlExpiresIn: 86400,
        images: [
          {
            generationId: 'generation-retry-2',
            imageUrl: 'https://example.com/retry-2.png'
          }
        ],
        imageCount: 1,
        requestedImageCount: 1,
        actualImageCount: 1,
        provider: 'openai',
        model: 'gpt-image-2',
        modelLabel: 'GPT Image 2',
        requestedModelLabel: 'GPT Image 2',
        quality: 'auto',
        aspectRatio: '3:4',
        imageSize: '1536x2048',
        outputFormat: 'png',
        usedFallback: false,
        credits: {
          consumed: 0,
          creditType: 'waived'
        }
      }
    });

    const result = await runImageTask({
      sb: sb as never,
      task: retryOfFailedRetryTask,
      request: new Request('https://webtomind.com/api/image/task')
    });

    expect(result.status).toBe('succeeded');
    expect(parentTask.result_payload).toMatchObject({
      imageCount: 2,
      actualImageCount: 2,
      requestedImageCount: 2,
      skippedCrossChannelSupplement: false,
      missingImageRetryCompletedTaskId: 'retry-of-failed-retry-task',
      missingImageRetryResultStatus: 'succeeded'
    });
    expect(parentTask.result_payload?.images).toHaveLength(2);
    expect(parentTask.result_payload).not.toHaveProperty(
      'missingImageRetryFailedTaskId'
    );
    expect(parentTask.result_payload).not.toHaveProperty(
      'missingImageRetryError'
    );
  });

  it('does not finalize provider results after a running task is cancelled', async () => {
    const task = makeTask({ status: 'running' });
    const sb = createSupabaseMock([task]);
    executeImageGenerationJobMock.mockImplementation(async () => {
      task.status = 'cancelled';
      return {
        ok: true,
        status: 200,
        payload: {
          success: true,
          generationId: 'generation-cancelled',
          imageUrl: 'https://example.com/cancelled.png',
          imageUrlExpiresIn: 86400,
          images: [],
          imageCount: 1,
          requestedImageCount: 1,
          provider: 'krill',
          model: 'gpt-image-2',
          modelLabel: 'GPT Image 2',
          requestedModelLabel: 'GPT Image 2',
          quality: 'auto',
          aspectRatio: '2:3',
          imageSize: '1024x1536',
          outputFormat: 'png',
          usedFallback: false,
          credits: {
            consumed: 100,
            creditType: 'bonus'
          }
        }
      };
    });

    const result = await runImageTask({
      sb: sb as never,
      task,
      request: new Request('https://webtomind.com/api/image/task')
    });

    expect(result).toMatchObject({
      taskId: 'task-1',
      status: 'cancelled'
    });
    expect(task.status).toBe('cancelled');
    expect(task.generation_id).toBeNull();
    expect(task.result_payload).toBeNull();
  });
});
