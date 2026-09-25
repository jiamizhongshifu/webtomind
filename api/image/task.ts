import { SupabaseClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '../utils/vercel-types';
import {
  getCorsHeadersForRequest,
  getUserIdFromRequest
} from '../utils/auth.js';
import {
  createImageGenerationTask,
  getImageTaskBillingIdempotencyKey,
  getSupabaseAdmin,
  jsonResponse,
  parseQueuedImageGenerationCreditWaiver,
  parseQueuedImageGenerationPrepaidCredit,
  parseQueuedImageGenerationRequest,
  sendWebResponse,
  toWebRequest
} from './generate.js';
import { getUserImageConcurrency } from './task-concurrency.js';
import {
  claimImageTask,
  runImageTask,
  type ImageGenerationTaskRecord,
  type ImageTaskRunResult
} from './task-runner.js';
import {
  canRetryImageGenerationFailure,
  resolveImageGenerationFailureDetails
} from '../../src/shared/image-generation-failure.js';

export const config = {
  runtime: 'nodejs',
  maxDuration: 300
};

const ACTIVE_TASK_LOOKBACK_MS = 12 * 60 * 60 * 1000;
const FAILED_TASK_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
const PARTIAL_SUCCEEDED_TASK_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
const ACTIVE_TASK_MAX_LIMIT = 50;
const ACTIVE_FAILED_TASK_MAX_LIMIT = 5;
const IMAGE_TASK_QUEUED_POLL_AFTER_MS = 5000;
const IMAGE_TASK_RUNNING_POLL_AFTER_MS = 8000;
const IMAGE_TASK_FAILED_POLL_AFTER_MS = 12000;

function isLegacyVercelImageExecutionDisabled(): boolean {
  return (
    process.env.VERCEL === '1' &&
    process.env.WEBTOMIND_ENABLE_LEGACY_IMAGE_EXECUTION !== 'true'
  );
}

function shouldExecuteTaskOnPoll(request: Request): boolean {
  if (isLegacyVercelImageExecutionDisabled()) return false;
  if (request.headers.get('x-image-task-poll-execution') === 'false') {
    return false;
  }
  if (process.env.IMAGE_TASK_POLL_EXECUTION === 'false') return false;
  return true;
}

async function updateTask(
  sb: SupabaseClient,
  taskId: string,
  values: Record<string, unknown>
): Promise<void> {
  const { error } = await sb
    .from('image_generation_tasks')
    .update({
      ...values,
      locked_until: null,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', taskId);

  if (error) {
    console.error('[ImageTask] task update failed:', {
      taskId,
      message: error.message
    });
  }
}

function taskResponse(
  task: ImageGenerationTaskRecord,
  corsHeaders: Record<string, string>
): Response {
  if (task.status === 'succeeded' && task.result_payload) {
    return jsonResponse(
      {
        ...task.result_payload,
        queued: true,
        taskId: task.id,
        status: 'succeeded'
      },
      corsHeaders
    );
  }

  if (task.status === 'failed') {
    const errorDetails =
      task.result_payload && typeof task.result_payload === 'object'
        ? task.result_payload.errorDetails
        : undefined;
    return jsonResponse(
      {
        success: false,
        queued: true,
        taskId: task.id,
        status: 'failed',
        error: task.error_message || '图片生成失败',
        ...(errorDetails ? { errorDetails } : {}),
        refundFailed: Boolean(task.refund_failed)
      },
      corsHeaders
    );
  }

  if (task.status === 'cancelled') {
    const resultPayload =
      task.result_payload && typeof task.result_payload === 'object'
        ? task.result_payload
        : undefined;
    return jsonResponse(
      {
        success: true,
        queued: true,
        taskId: task.id,
        status: 'cancelled',
        refundFailed: Boolean(task.refund_failed),
        cancelledTaskStatus: resultPayload?.cancelledTaskStatus,
        interruptMode: resultPayload?.interruptMode,
        refunded: resultPayload?.refunded
      },
      corsHeaders
    );
  }

  return jsonResponse(
    {
      success: true,
      queued: true,
      taskId: task.id,
      status: task.status,
      pollAfterMs:
        task.status === 'running'
          ? IMAGE_TASK_RUNNING_POLL_AFTER_MS
          : IMAGE_TASK_QUEUED_POLL_AFTER_MS
    },
    corsHeaders
  );
}

export async function imageTaskRunResponse({
  sb,
  userId,
  claimedTask,
  result,
  corsHeaders
}: {
  sb: SupabaseClient;
  userId: string;
  claimedTask: ImageGenerationTaskRecord;
  result: ImageTaskRunResult;
  corsHeaders: Record<string, string>;
}): Promise<Response> {
  // The provider may acknowledge a task before the final image is available.
  // Always prefer the persisted row so a deferred or superseded worker cannot
  // make the client remove its skeleton, display a false failure, or accept a
  // success produced by a worker whose lease has already been superseded.
  const { data: latestTask, error: latestTaskError } = await sb
    .from('image_generation_tasks')
    .select('*')
    .eq('id', claimedTask.id)
    .eq('user_id', userId)
    .maybeSingle();
  if (!latestTaskError && latestTask) {
    return taskResponse(latestTask as ImageGenerationTaskRecord, corsHeaders);
  }

  if (result.status === 'succeeded' && result.payload) {
    return jsonResponse(
      {
        ...result.payload,
        queued: true,
        taskId: claimedTask.id,
        status: 'succeeded'
      },
      corsHeaders
    );
  }

  if (result.status === 'running') {
    return taskResponse({ ...claimedTask, status: 'running' }, corsHeaders);
  }
  if (result.status === 'cancelled') {
    return taskResponse({ ...claimedTask, status: 'cancelled' }, corsHeaders);
  }

  return jsonResponse(
    {
      success: false,
      queued: true,
      taskId: claimedTask.id,
      status: 'failed',
      error: result.error || result.body?.error || '图片生成失败',
      errorDetails: result.errorDetails || undefined,
      refundFailed: Boolean(result.refundFailed)
    },
    corsHeaders
  );
}

export async function imageTaskClaimMissResponse({
  sb,
  userId,
  task,
  corsHeaders
}: {
  sb: SupabaseClient;
  userId: string;
  task: ImageGenerationTaskRecord;
  corsHeaders: Record<string, string>;
}): Promise<Response> {
  // A failed claim can mean another worker owns the lease, but it can also
  // mean the atomic claim RPC just moved an exhausted task to `failed` and
  // refunded it. Re-read before responding so the client does not keep a
  // terminal task's skeleton alive for an extra polling interval.
  const { data: latestTask, error: latestTaskError } = await sb
    .from('image_generation_tasks')
    .select('*')
    .eq('id', task.id)
    .eq('user_id', userId)
    .maybeSingle();
  return taskResponse(
    !latestTaskError && latestTask
      ? (latestTask as ImageGenerationTaskRecord)
      : task,
    corsHeaders
  );
}

type CancelledImageTaskStatus = 'queued' | 'running' | 'cancelled';

function getCancelledTaskStatus(
  task: ImageGenerationTaskRecord
): CancelledImageTaskStatus | undefined {
  const payload =
    task.result_payload && typeof task.result_payload === 'object'
      ? task.result_payload
      : undefined;
  const status = payload?.cancelledTaskStatus;
  return status === 'queued' || status === 'running' || status === 'cancelled'
    ? status
    : undefined;
}

function getCancelInterruptMode(status: CancelledImageTaskStatus) {
  return status === 'running' ? 'soft' : 'queue';
}

async function refundCancelledImageTaskCredit({
  sb,
  userId,
  task,
  cancelledTaskStatus
}: {
  sb: SupabaseClient;
  userId: string;
  task: ImageGenerationTaskRecord;
  cancelledTaskStatus: CancelledImageTaskStatus;
}): Promise<{ refunded: number; refundFailed: boolean }> {
  const prepaidCredit = parseQueuedImageGenerationPrepaidCredit(
    task.request_payload
  );
  if (!prepaidCredit?.consumed) {
    return { refunded: 0, refundFailed: false };
  }

  const billingPhase = 'queue_cancel_refund';
  const refundMetadata = {
    billingDomain: 'image_task',
    billingPhase,
    idempotency_key: getImageTaskBillingIdempotencyKey(task.id, billingPhase),
    taskId: task.id,
    cancelledTaskStatus,
    creditBreakdown: prepaidCredit.creditBreakdown
  };
  const { data, error } = await sb.rpc('refund_generation_credit', {
    p_user_id: userId,
    p_amount: prepaidCredit.consumed,
    p_credit_type: prepaidCredit.creditType || 'bonus',
    p_source: `image_task:${task.id}:${billingPhase}`,
    p_metadata: refundMetadata
  });

  if (error) {
    console.error('[ImageTask] cancel refund failed:', {
      userId,
      taskId: task.id,
      message: error.message
    });
    const fallback = await sb.rpc('refund_image_generation_credit', {
      p_user_id: userId,
      p_amount: prepaidCredit.consumed,
      p_credit_type: prepaidCredit.creditType || 'bonus',
      p_metadata: refundMetadata
    });
    if (fallback.error) {
      return { refunded: 0, refundFailed: true };
    }
    const fallbackResult = fallback.data as {
      success?: boolean;
      refunded?: number;
      error?: string;
    };
    if (fallbackResult?.success === false) {
      return { refunded: 0, refundFailed: true };
    }
    return {
      refunded: Number(fallbackResult?.refunded || prepaidCredit.consumed),
      refundFailed: false
    };
  }

  const result = data as {
    success?: boolean;
    refunded?: number;
    error?: string;
  };
  if (result?.success === false) {
    console.error('[ImageTask] cancel refund rejected:', {
      userId,
      taskId: task.id,
      error: result.error || 'unknown'
    });
    return { refunded: 0, refundFailed: true };
  }

  return {
    refunded: Number(result?.refunded || prepaidCredit.consumed),
    refundFailed: false
  };
}

function parseTaskListLimit(value: string | null): number {
  const parsed = Number(value || 20);
  if (!Number.isFinite(parsed)) return 20;
  return Math.max(1, Math.min(ACTIVE_TASK_MAX_LIMIT, Math.floor(parsed)));
}

function getTaskFailureDetails(task: ImageGenerationTaskRecord):
  | {
      category?: string;
      code?: string;
      retryable?: boolean;
    }
  | undefined {
  const details =
    task.result_payload && typeof task.result_payload === 'object'
      ? task.result_payload.errorDetails
      : undefined;
  if (
    task.status !== 'failed' &&
    !details &&
    !task.failure_category &&
    !task.failure_code
  ) {
    return undefined;
  }
  return resolveImageGenerationFailureDetails({
    payloadDetails: details,
    failureCategory: task.failure_category,
    failureCode: task.failure_code
  });
}

function getTaskResultPayload(
  task: ImageGenerationTaskRecord
): Record<string, unknown> {
  return task.result_payload && typeof task.result_payload === 'object'
    ? task.result_payload
    : {};
}

function toPositiveInteger(value: unknown): number | undefined {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.floor(parsed);
}

function getTaskRequestedImageCount(
  task: ImageGenerationTaskRecord,
  request?: ReturnType<typeof parseQueuedImageGenerationRequest>
): number | undefined {
  const payload = getTaskResultPayload(task);
  return (
    toPositiveInteger(payload.requestedImageCount) ||
    toPositiveInteger(request?.imageCount) ||
    toPositiveInteger(payload.imageCount)
  );
}

function getTaskActualImageCount(task: ImageGenerationTaskRecord): number {
  const payload = getTaskResultPayload(task);
  const images = Array.isArray(payload.images) ? payload.images : [];
  return (
    toPositiveInteger(payload.actualImageCount) ||
    toPositiveInteger(payload.imageCount) ||
    images.length
  );
}

function getTaskMissingImageCount(
  task: ImageGenerationTaskRecord,
  request?: ReturnType<typeof parseQueuedImageGenerationRequest>
): number {
  const requested = getTaskRequestedImageCount(task, request);
  const actual = getTaskActualImageCount(task);
  if (!requested || actual <= 0 || actual >= requested) return 0;
  return requested - actual;
}

function getTaskPartialRetryTaskId(
  task: ImageGenerationTaskRecord
): string | undefined {
  const payload = getTaskResultPayload(task);
  return typeof payload.missingImageRetryTaskId === 'string'
    ? payload.missingImageRetryTaskId
    : undefined;
}

function clearTaskPartialRetryMarker(
  payload: Record<string, unknown>
): Record<string, unknown> {
  const {
    missingImageRetryTaskId,
    missingImageRetryStartedAt,
    missingImageRetryImageCount,
    missingImageRetryCreditWaived,
    ...rest
  } = payload;
  void missingImageRetryTaskId;
  void missingImageRetryStartedAt;
  void missingImageRetryImageCount;
  void missingImageRetryCreditWaived;
  return rest;
}

function shouldShowPartialSucceededTask(
  task: ImageGenerationTaskRecord
): boolean {
  return task.status === 'succeeded' && getTaskMissingImageCount(task) > 0;
}

function shouldWaivePartialMissingRetry(): boolean {
  return true;
}

function toActiveTaskResponseItem(
  task: ImageGenerationTaskRecord,
  queuePosition?: number
) {
  const request = parseQueuedImageGenerationRequest(task.request_payload);
  if (!request) return null;
  const payload = getTaskResultPayload(task);
  const creditWaiver = parseQueuedImageGenerationCreditWaiver(
    task.request_payload
  );
  const requestedImageCount = getTaskRequestedImageCount(task, request);
  const actualImageCount = getTaskActualImageCount(task);
  const missingImageCount = getTaskMissingImageCount(task, request);
  const failureDetails = getTaskFailureDetails(task);

  return {
    taskId: task.id,
    status: task.status,
    retryOfTaskId: creditWaiver?.sourceTaskId,
    request: {
      prompt: request.prompt,
      negativePrompt: request.negativePrompt,
      model: request.model,
      aspectRatio: request.aspectRatio,
      imageSize: request.imageSize,
      quality: request.quality,
      outputFormat: request.outputFormat,
      assetIds: request.assetIds,
      promptMode: request.promptMode,
      imageCount: request.imageCount,
      referenceImageIds: request.referenceImageIds,
      referenceMode: request.referenceMode,
      characterCardIds: request.characterCardIds,
      characterReferenceGroups: request.characterReferenceGroups,
      sourceGenerationId: request.sourceGenerationId,
      editInstruction: request.editInstruction,
      editMode: request.editMode,
      appSlug: request.appSlug,
      appOperation: request.appOperation,
      sourceApp: request.sourceApp
    },
    createdAt: task.created_at,
    startedAt: task.started_at,
    updatedAt: task.updated_at,
    error: task.error_message || undefined,
    errorCategory: failureDetails?.category,
    errorCode: failureDetails?.code,
    retryable: failureDetails?.retryable,
    queuePosition,
    imageCount: toPositiveInteger(payload.imageCount),
    requestedImageCount,
    actualImageCount,
    missingImageCount,
    canRetryMissingImages: task.status === 'succeeded' && missingImageCount > 0,
    missingImageRetryTaskId:
      typeof payload.missingImageRetryTaskId === 'string'
        ? payload.missingImageRetryTaskId
        : undefined,
    missingImageRetryStartedAt:
      typeof payload.missingImageRetryStartedAt === 'string'
        ? payload.missingImageRetryStartedAt
        : undefined,
    missingImageRetryImageCount: toPositiveInteger(
      payload.missingImageRetryImageCount
    ),
    missingImageRetryCreditWaived:
      typeof payload.missingImageRetryCreditWaived === 'boolean'
        ? payload.missingImageRetryCreditWaived
        : undefined,
    refunded:
      typeof payload.refunded === 'number' ? payload.refunded : undefined,
    refundFailed: Boolean(payload.refundFailed || task.refund_failed),
    partialRefundWarning:
      typeof payload.partialRefundWarning === 'string'
        ? payload.partialRefundWarning
        : undefined,
    batchConsistencyMode:
      typeof payload.batchConsistencyMode === 'string'
        ? payload.batchConsistencyMode
        : undefined,
    strictBatchConsistency: Boolean(payload.strictBatchConsistency),
    skippedCrossChannelSupplement: Boolean(
      payload.skippedCrossChannelSupplement
    ),
    pollAfterMs:
      task.status === 'running'
        ? IMAGE_TASK_RUNNING_POLL_AFTER_MS
        : task.status === 'failed'
          ? IMAGE_TASK_FAILED_POLL_AFTER_MS
          : IMAGE_TASK_QUEUED_POLL_AFTER_MS
  };
}

async function handleActiveImageTasksRequest({
  sb,
  userId,
  limit,
  corsHeaders
}: {
  sb: SupabaseClient;
  userId: string;
  limit: number;
  corsHeaders: Record<string, string>;
}): Promise<Response> {
  const activeLookbackSince = new Date(
    Date.now() - ACTIVE_TASK_LOOKBACK_MS
  ).toISOString();
  const failedLookbackSince = new Date(
    Date.now() - FAILED_TASK_LOOKBACK_MS
  ).toISOString();
  const partialLookbackSince = new Date(
    Date.now() - PARTIAL_SUCCEEDED_TASK_LOOKBACK_MS
  ).toISOString();
  const failedLimit = Math.min(limit, ACTIVE_FAILED_TASK_MAX_LIMIT);
  const maxConcurrency = await getUserImageConcurrency(sb, userId);
  const { data: activeData, error: activeError } = await sb
    .from('image_generation_tasks')
    .select('*')
    .eq('user_id', userId)
    .in('status', ['queued', 'running'])
    .gte('created_at', activeLookbackSince)
    .order('created_at', { ascending: false })
    .limit(limit);
  const { data: failedData, error: failedError } = await sb
    .from('image_generation_tasks')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'failed')
    .gte('created_at', failedLookbackSince)
    .order('created_at', { ascending: false })
    .limit(failedLimit);
  const { data: partialData, error: partialError } = await sb
    .from('image_generation_tasks')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'succeeded')
    .gte('created_at', partialLookbackSince)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (activeError || failedError || partialError) {
    console.error('[ImageTask] active task list failed:', {
      userId,
      message:
        activeError?.message || failedError?.message || partialError?.message
    });
    return jsonResponse(
      { error: 'active image tasks not found', tasks: [] },
      corsHeaders,
      500
    );
  }

  const rows = [
    ...((activeData || []) as ImageGenerationTaskRecord[]),
    ...((failedData || []) as ImageGenerationTaskRecord[]),
    ...((partialData || []) as ImageGenerationTaskRecord[]).filter(
      shouldShowPartialSucceededTask
    )
  ].sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  let queuedIndex = 0;
  const tasks = rows
    .map((task) => {
      const queuePosition =
        task.status === 'queued' ? ++queuedIndex : undefined;
      return toActiveTaskResponseItem(task, queuePosition);
    })
    .filter(Boolean);
  const runningCount = rows.filter((task) => task.status === 'running').length;
  const failedCount = rows.filter((task) => task.status === 'failed').length;

  return jsonResponse(
    {
      success: true,
      activeCount: tasks.length,
      maxConcurrency,
      runningCount,
      queuedCount: queuedIndex,
      failedCount,
      tasks
    },
    corsHeaders
  );
}

async function handleCancelImageTaskRequest({
  sb,
  userId,
  taskId,
  corsHeaders
}: {
  sb: SupabaseClient;
  userId: string;
  taskId: string;
  corsHeaders: Record<string, string>;
}): Promise<Response> {
  const { data: targetTask, error: targetTaskError } = await sb
    .from('image_generation_tasks')
    .select('*')
    .eq('id', taskId)
    .eq('user_id', userId)
    .maybeSingle();

  if (targetTaskError) {
    console.error('[ImageTask] cancel task lookup failed:', {
      userId,
      taskId,
      message: targetTaskError.message
    });
    return jsonResponse({ error: 'task cancel failed' }, corsHeaders, 500);
  }

  const existingTask = targetTask as ImageGenerationTaskRecord | null;

  if (!existingTask) {
    return jsonResponse(
      {
        error: 'IMAGE_TASK_NOT_CANCELABLE',
        message: '任务不存在，无法取消。'
      },
      corsHeaders,
      409
    );
  }

  if (existingTask.status === 'cancelled') {
    const cancelledTaskStatus =
      getCancelledTaskStatus(existingTask) || 'cancelled';
    if (existingTask.refund_failed) {
      const retryRefund = await refundCancelledImageTaskCredit({
        sb,
        userId,
        task: existingTask,
        cancelledTaskStatus
      });
      if (!retryRefund.refundFailed) {
        await updateTask(sb, taskId, {
          status: 'cancelled',
          result_payload: {
            success: true,
            cancelled: true,
            refunded: retryRefund.refunded,
            billingPhase: 'queue_cancel_refund',
            cancelledTaskStatus,
            interruptMode: getCancelInterruptMode(cancelledTaskStatus)
          },
          refund_failed: false
        });
      }
      return jsonResponse(
        {
          success: true,
          taskId,
          status: 'cancelled',
          refunded: retryRefund.refunded,
          refundFailed: retryRefund.refundFailed,
          cancelledTaskStatus,
          interruptMode: getCancelInterruptMode(cancelledTaskStatus)
        },
        corsHeaders
      );
    }

    return jsonResponse(
      {
        success: true,
        taskId,
        status: 'cancelled',
        refundFailed: false,
        cancelledTaskStatus,
        interruptMode: getCancelInterruptMode(cancelledTaskStatus)
      },
      corsHeaders
    );
  }

  if (existingTask.status !== 'queued' && existingTask.status !== 'running') {
    return jsonResponse(
      {
        error: 'IMAGE_TASK_NOT_CANCELABLE',
        message: '任务已结束，不能取消。'
      },
      corsHeaders,
      409
    );
  }

  const cancelledTaskStatus = existingTask.status;
  const { data, error } = await sb
    .from('image_generation_tasks')
    .update({
      status: 'cancelled',
      locked_until: null,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      error_message:
        cancelledTaskStatus === 'running'
          ? '用户中止正在进行的生图任务'
          : '用户取消排队任务',
      refund_failed: true,
      result_payload: {
        success: true,
        cancelled: true,
        refunded: 0,
        billingPhase: 'queue_cancel_refund',
        cancelledTaskStatus,
        interruptMode: getCancelInterruptMode(cancelledTaskStatus)
      }
    })
    .eq('id', taskId)
    .eq('user_id', userId)
    .eq('status', cancelledTaskStatus)
    .select('*')
    .maybeSingle();

  if (error) {
    console.error('[ImageTask] cancel task failed:', {
      userId,
      taskId,
      message: error.message
    });
    return jsonResponse({ error: 'task cancel failed' }, corsHeaders, 500);
  }

  const task = data as ImageGenerationTaskRecord | null;
  if (!task) {
    return jsonResponse(
      {
        error: 'IMAGE_TASK_NOT_CANCELABLE',
        message: '任务状态已变化，请刷新后重试。'
      },
      corsHeaders,
      409
    );
  }

  const refund = await refundCancelledImageTaskCredit({
    sb,
    userId,
    task: existingTask,
    cancelledTaskStatus
  });
  await updateTask(sb, taskId, {
    status: 'cancelled',
    result_payload: {
      success: true,
      cancelled: true,
      refunded: refund.refunded,
      billingPhase: 'queue_cancel_refund',
      cancelledTaskStatus,
      interruptMode: getCancelInterruptMode(cancelledTaskStatus)
    },
    refund_failed: refund.refundFailed
  });

  return jsonResponse(
    {
      success: true,
      taskId,
      status: 'cancelled',
      refunded: refund.refunded,
      refundFailed: refund.refundFailed,
      cancelledTaskStatus,
      interruptMode: getCancelInterruptMode(cancelledTaskStatus)
    },
    corsHeaders
  );
}

async function handleDeleteFailedImageTaskRequest({
  sb,
  userId,
  taskId,
  corsHeaders
}: {
  sb: SupabaseClient;
  userId: string;
  taskId: string;
  corsHeaders: Record<string, string>;
}): Promise<Response> {
  const { data: targetTask, error: targetTaskError } = await sb
    .from('image_generation_tasks')
    .select('id,status,created_at')
    .eq('id', taskId)
    .eq('user_id', userId)
    .maybeSingle();

  if (targetTaskError) {
    console.error('[ImageTask] delete failed task lookup failed:', {
      userId,
      taskId,
      message: targetTaskError.message
    });
    return jsonResponse({ error: 'task delete failed' }, corsHeaders, 500);
  }

  if (!targetTask) {
    return jsonResponse({ success: true, taskId, deleted: false }, corsHeaders);
  }

  if (targetTask.status !== 'failed') {
    return jsonResponse(
      {
        error: 'IMAGE_TASK_NOT_DELETABLE',
        message: '只能清理已失败的任务。'
      },
      corsHeaders,
      409
    );
  }

  const { data, error } = await sb
    .from('image_generation_tasks')
    .delete()
    .eq('user_id', userId)
    .eq('status', 'failed')
    .lte('created_at', targetTask.created_at)
    .select('id');

  if (error) {
    console.error('[ImageTask] delete failed task failed:', {
      userId,
      taskId,
      message: error.message
    });
    return jsonResponse({ error: 'task delete failed' }, corsHeaders, 500);
  }

  return jsonResponse(
    {
      success: true,
      taskId,
      deleted: true,
      deletedTaskIds: (data || []).map((task) => task.id)
    },
    corsHeaders
  );
}

export async function handleRetryImageTaskRequest({
  sb,
  userId,
  taskId,
  corsHeaders
}: {
  sb: SupabaseClient;
  userId: string;
  taskId: string;
  corsHeaders: Record<string, string>;
}): Promise<Response> {
  const { data, error } = await sb
    .from('image_generation_tasks')
    .select('*')
    .eq('id', taskId)
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    return jsonResponse({ error: 'task not found' }, corsHeaders, 404);
  }

  const task = data as ImageGenerationTaskRecord;
  const sanitizedInput = parseQueuedImageGenerationRequest(
    task.request_payload
  );
  if (!sanitizedInput) {
    return jsonResponse(
      { error: 'INVALID_IMAGE_REQUEST', message: '任务参数无效' },
      corsHeaders,
      400
    );
  }

  if (task.status === 'succeeded') {
    const missingImageCount = getTaskMissingImageCount(task, sanitizedInput);
    if (missingImageCount <= 0) {
      return jsonResponse(
        {
          error: 'IMAGE_TASK_NOT_PARTIAL',
          message: '当前任务没有缺失图片需要重试。'
        },
        corsHeaders,
        409
      );
    }

    const existingRetryTaskId = getTaskPartialRetryTaskId(task);
    if (existingRetryTaskId) {
      const { data: existingRetryTask, error: existingRetryError } = await sb
        .from('image_generation_tasks')
        .select('id,status')
        .eq('id', existingRetryTaskId)
        .eq('user_id', userId)
        .maybeSingle();

      if (
        existingRetryTask &&
        !['failed', 'cancelled'].includes(
          String(existingRetryTask.status || '')
        )
      ) {
        return jsonResponse(
          {
            success: true,
            queued: true,
            taskId: existingRetryTaskId,
            status: existingRetryTask.status || 'queued',
            retryOfTaskId: task.id,
            retryImageCount: missingImageCount,
            creditWaived: Boolean(
              getTaskResultPayload(task).missingImageRetryCreditWaived
            ),
            pollAfterMs: IMAGE_TASK_QUEUED_POLL_AFTER_MS
          },
          corsHeaders,
          202
        );
      }

      if (existingRetryError) {
        console.warn('[ImageTask] partial retry marker lookup failed:', {
          userId,
          taskId: task.id,
          retryTaskId: existingRetryTaskId,
          message: existingRetryError.message
        });
      }
    }

    const creditWaived = shouldWaivePartialMissingRetry();
    const retryTaskId = await createImageGenerationTask(
      sb,
      userId,
      {
        ...sanitizedInput,
        imageCount: missingImageCount
      },
      undefined,
      creditWaived
        ? {
            reason: 'retry_missing_images_without_double_charge',
            sourceTaskId: task.id
          }
        : undefined
    );

    const resultPayload = {
      ...clearTaskPartialRetryMarker(getTaskResultPayload(task)),
      missingImageRetryTaskId: retryTaskId,
      missingImageRetryStartedAt: new Date().toISOString(),
      missingImageRetryImageCount: missingImageCount,
      missingImageRetryCreditWaived: creditWaived
    };
    const { error: updateError } = await sb
      .from('image_generation_tasks')
      .update({
        result_payload: resultPayload,
        updated_at: new Date().toISOString()
      })
      .eq('id', task.id)
      .eq('user_id', userId);
    if (updateError) {
      console.error('[ImageTask] partial retry marker update failed:', {
        userId,
        taskId: task.id,
        retryTaskId,
        message: updateError.message
      });
    }

    return jsonResponse(
      {
        success: true,
        queued: true,
        taskId: retryTaskId,
        status: 'queued',
        retryOfTaskId: task.id,
        retryImageCount: missingImageCount,
        creditWaived,
        pollAfterMs: IMAGE_TASK_QUEUED_POLL_AFTER_MS
      },
      corsHeaders,
      202
    );
  }

  if (task.status !== 'failed') {
    return jsonResponse(
      {
        error: 'IMAGE_TASK_NOT_FAILED',
        message: '只有失败或部分完成的图片任务可以重试。',
        errorDetails: getTaskFailureDetails(task)
      },
      corsHeaders,
      409
    );
  }

  const failureDetails = getTaskFailureDetails(task);
  if (!canRetryImageGenerationFailure(failureDetails || {})) {
    return jsonResponse(
      {
        error: 'IMAGE_TASK_NOT_RETRYABLE',
        message: '当前失败类型不能直接重试，请修改请求后重新生成。',
        errorDetails: failureDetails
      },
      corsHeaders,
      409
    );
  }

  const retryTaskId = await createImageGenerationTask(
    sb,
    userId,
    sanitizedInput,
    undefined,
    {
      reason: 'retry_after_refunded_failure',
      sourceTaskId: task.id
    }
  );

  return jsonResponse(
    {
      success: true,
      queued: true,
      taskId: retryTaskId,
      status: 'queued',
      retryOfTaskId: task.id,
      creditWaived: true,
      pollAfterMs: IMAGE_TASK_QUEUED_POLL_AFTER_MS
    },
    corsHeaders,
    202
  );
}

export async function handleImageTaskRequest(
  request: Request
): Promise<Response> {
  const corsHeaders = {
    ...getCorsHeadersForRequest(request),
    'Cache-Control': 'no-store'
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (!['GET', 'POST'].includes(request.method)) {
    return jsonResponse({ error: 'Method not allowed' }, corsHeaders, 405);
  }

  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return jsonResponse({ error: '请先登录' }, corsHeaders, 401);
  }

  const url = new URL(request.url);

  const sb = getSupabaseAdmin();
  if (!sb) {
    return jsonResponse({ error: 'Supabase not configured' }, corsHeaders, 500);
  }

  if (request.method === 'POST') {
    const body = (await request.json().catch(() => ({}))) as {
      id?: string;
      action?: string;
    };
    const taskId = body.id?.trim();
    if (!taskId || !body.action) {
      return jsonResponse(
        { error: 'task id and action are required' },
        corsHeaders,
        400
      );
    }
    if (body.action === 'retry') {
      return handleRetryImageTaskRequest({
        sb,
        userId,
        taskId,
        corsHeaders
      });
    }
    if (body.action === 'cancel') {
      return handleCancelImageTaskRequest({
        sb,
        userId,
        taskId,
        corsHeaders
      });
    }
    if (body.action === 'delete_failed') {
      return handleDeleteFailedImageTaskRequest({
        sb,
        userId,
        taskId,
        corsHeaders
      });
    }
    return jsonResponse({ error: 'unknown task action' }, corsHeaders, 400);
  }

  if (url.searchParams.get('mode')?.trim() === 'active') {
    return handleActiveImageTasksRequest({
      sb,
      userId,
      limit: parseTaskListLimit(url.searchParams.get('limit')),
      corsHeaders
    });
  }

  const taskId = url.searchParams.get('id')?.trim();
  if (!taskId) {
    return jsonResponse({ error: 'task id is required' }, corsHeaders, 400);
  }

  const { data, error } = await sb
    .from('image_generation_tasks')
    .select('*')
    .eq('id', taskId)
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    return jsonResponse({ error: 'task not found' }, corsHeaders, 404);
  }

  const task = data as ImageGenerationTaskRecord;
  if (task.status === 'succeeded' || task.status === 'failed') {
    return taskResponse(task, corsHeaders);
  }

  if (!shouldExecuteTaskOnPoll(request)) {
    return taskResponse(task, corsHeaders);
  }

  const claimed = await claimImageTask({
    sb,
    task,
    userId,
    logPrefix: 'ImageTask'
  });
  if (!claimed) {
    return imageTaskClaimMissResponse({
      sb,
      userId,
      task,
      corsHeaders
    });
  }

  const result = await runImageTask({
    sb,
    task: claimed,
    request,
    logPrefix: 'ImageTask'
  });

  return imageTaskRunResponse({
    sb,
    userId,
    claimedTask: claimed,
    result,
    corsHeaders
  });
}

function isWebRequest(request: Request | VercelRequest): request is Request {
  return typeof (request as Request).headers?.get === 'function';
}

async function handler(request: Request): Promise<Response>;
async function handler(
  request: VercelRequest,
  response: VercelResponse
): Promise<void>;
async function handler(
  request: Request | VercelRequest,
  response?: VercelResponse
): Promise<Response | void> {
  const webResponse = await handleImageTaskRequest(
    isWebRequest(request) ? request : toWebRequest(request)
  );
  if (response) {
    await sendWebResponse(webResponse, response);
    return;
  }
  return webResponse;
}

export default handler;
