import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createImageGenerationTask,
  executeImageGenerationJob,
  extractProviderRequestId,
  getErrorMessage,
  getImageTaskBillingIdempotencyKey,
  parseQueuedImageGenerationCreditWaiver,
  parseQueuedImageGenerationPrepaidCredit,
  parseQueuedImageGenerationRequest,
  GPT_IMAGE_2_DENOISE_PIPELINE_DEADLINE_MS,
  QUEUED_PIPELINE_DEADLINE_MS,
  QUEUED_TUZI_VIP_TIMEOUT_MS,
  type ImageGenerationSuccessPayload,
  type ImageGenerationTaskDiagnostics
} from './generate.js';
import { getUserImageConcurrency } from './task-concurrency.js';
import {
  recordImageTaskTerminalEvents,
  type ImageTaskCompletionDurations
} from './task-observability.js';

export type ImageTaskStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export interface ImageGenerationTaskRecord {
  id: string;
  user_id: string;
  status: ImageTaskStatus;
  request_payload: unknown;
  result_payload: Record<string, unknown> | null;
  error_message: string | null;
  refund_failed: boolean | null;
  generation_id: string | null;
  attempt_count: number | null;
  max_attempts?: number | null;
  lease_token?: string | null;
  started_at: string | null;
  first_started_at: string | null;
  locked_until: string | null;
  failure_category?: string | null;
  failure_code?: string | null;
  provider_request_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ImageTaskRunResult {
  taskId: string;
  status: ImageTaskStatus;
  payload?: ImageGenerationSuccessPayload;
  reenqueue?: {
    taskId: string;
    delaySeconds: number;
  };
  error?: string;
  errorDetails?: {
    code: string;
    category: string;
    retryable: boolean;
    httpStatus?: number;
    provider?: string;
    model?: string;
  };
  body?: Record<string, unknown>;
  refundFailed?: boolean;
  diagnostics?: ImageGenerationTaskDiagnostics;
}

interface ClaimImageTaskOptions {
  sb: SupabaseClient;
  task: ImageGenerationTaskRecord;
  userId?: string;
  logPrefix?: string;
}

interface RunImageTaskOptions {
  sb: SupabaseClient;
  task: ImageGenerationTaskRecord;
  request: Request;
  logPrefix?: string;
}

interface FinalizeImageTaskOptions {
  sb: SupabaseClient;
  task: ImageGenerationTaskRecord;
  values: Record<string, unknown>;
  logPrefix?: string;
}

interface DeferImageTaskOptions {
  sb: SupabaseClient;
  task: ImageGenerationTaskRecord;
  result: {
    body?: Record<string, unknown>;
    failureDetails?: ImageTaskRunResult['errorDetails'];
    diagnostics?: ImageGenerationTaskDiagnostics;
  };
  errorMessage: string;
  delaySeconds: number;
  logPrefix?: string;
}

export function isImageTaskLockStale(task: ImageGenerationTaskRecord): boolean {
  return Boolean(
    task.locked_until && new Date(task.locked_until).getTime() < Date.now()
  );
}

export function getImageTaskMaxAttempts(): number {
  const configured = Number(process.env.IMAGE_TASK_MAX_ATTEMPTS || 24);
  if (!Number.isFinite(configured)) return 24;
  return Math.max(1, Math.min(100, Math.floor(configured)));
}

export function getImageTaskPipelineDeadlineMs(payload: unknown): number {
  if (!payload || typeof payload !== 'object') {
    return QUEUED_PIPELINE_DEADLINE_MS;
  }
  return isCloudDenoiseTask(payload)
    ? GPT_IMAGE_2_DENOISE_PIPELINE_DEADLINE_MS
    : QUEUED_PIPELINE_DEADLINE_MS;
}

function isCloudDenoiseTask(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false;
  const record = payload as Record<string, unknown>;
  return (
    record.model === 'nano-banana-2' &&
    record.appSlug === 'gpt-image-2-denoiser' &&
    record.appOperation === 'gpt-image-2-denoise' &&
    record.sourceApp === 'gpt-image-2-denoiser' &&
    record.provider === 'tuzi'
  );
}

async function reconcileCloudDenoiseFailureRefund({
  sb,
  task,
  logPrefix
}: {
  sb: SupabaseClient;
  task: ImageGenerationTaskRecord;
  logPrefix: string;
}): Promise<boolean> {
  const prepaidCredit = parseQueuedImageGenerationPrepaidCredit(
    task.request_payload
  );
  if (!prepaidCredit?.consumed) return false;

  const billingPhase = 'generation_failure_refund';
  const { data, error } = await sb.rpc(
    'refund_gpt_image_2_denoise_credits_v3',
    {
      p_user_id: task.user_id,
      p_amount: prepaidCredit.consumed,
      p_credit_type: prepaidCredit.creditType || 'bonus',
      p_source: `denoise_task:${task.id}:refund`,
      p_metadata: {
        taskId: task.id,
        appSlug: 'gpt-image-2-denoiser',
        appOperation: 'gpt-image-2-denoise',
        billingDomain: 'image_task',
        billingPhase,
        idempotency_key: getImageTaskBillingIdempotencyKey(
          task.id,
          billingPhase
        ),
        creditBreakdown: prepaidCredit.creditBreakdown
      }
    }
  );
  const refund = data as {
    success?: boolean;
    refunded?: number;
    error?: string;
    idempotent?: boolean;
  } | null;
  const refundedAmount = Number(refund?.refunded || 0);
  if (
    error ||
    refund?.success !== true ||
    refundedAmount !== prepaidCredit.consumed
  ) {
    console.error(`[${logPrefix}] denoise failure refund reconciliation failed:`, {
      taskId: task.id,
      message: error?.message || refund?.error || 'invalid refund response',
      expectedAmount: prepaidCredit.consumed,
      refundedAmount
    });
    return true;
  }

  console.info(`[${logPrefix}] denoise failure refund reconciled:`, {
    taskId: task.id,
    refundedAmount,
    idempotent: Boolean(refund.idempotent)
  });
  return false;
}

export function getImageTaskCompletionMetrics(
  task: ImageGenerationTaskRecord,
  finishedAt = Date.now()
): ImageTaskCompletionDurations {
  const createdAt = new Date(task.created_at).getTime();
  const startedAt = task.first_started_at
    ? new Date(task.first_started_at).getTime()
    : task.started_at
      ? new Date(task.started_at).getTime()
      : createdAt;
  return {
    queue_wait_ms: Math.max(0, startedAt - createdAt),
    provider_latency_ms: Math.max(0, finishedAt - startedAt),
    total_duration_ms: Math.max(0, finishedAt - createdAt)
  };
}

function getRecordPayload(
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

function clearPartialRetryMarker(
  payload: Record<string, unknown>
): Record<string, unknown> {
  const {
    missingImageRetryTaskId,
    missingImageRetryStartedAt,
    missingImageRetryImageCount,
    missingImageRetryCreditWaived,
    missingImageRetryFailedTaskId,
    missingImageRetryFailedAt,
    missingImageRetryError,
    ...rest
  } = payload;
  void missingImageRetryTaskId;
  void missingImageRetryStartedAt;
  void missingImageRetryImageCount;
  void missingImageRetryCreditWaived;
  void missingImageRetryFailedTaskId;
  void missingImageRetryFailedAt;
  void missingImageRetryError;
  return rest;
}

function getPayloadImages(payload: Record<string, unknown>): unknown[] {
  return Array.isArray(payload.images) ? payload.images : [];
}

function getGeneratedImageKey(image: unknown, index: number): string {
  if (!image || typeof image !== 'object') return `index:${index}`;
  const record = image as Record<string, unknown>;
  const key =
    record.generationId ||
    record.storagePath ||
    record.imageUrl ||
    record.thumbnailUrl ||
    record.previewUrl;
  return typeof key === 'string' && key ? key : `index:${index}`;
}

function mergeGeneratedImages(
  parentImages: unknown[],
  childImages: unknown[]
): unknown[] {
  const seen = new Set<string>();
  const merged: unknown[] = [];
  [...parentImages, ...childImages].forEach((image, index) => {
    const key = getGeneratedImageKey(image, index);
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(image);
  });
  return merged;
}

function getActualImageCountFromPayload(
  payload: Record<string, unknown>
): number {
  return (
    toPositiveInteger(payload.actualImageCount) ||
    toPositiveInteger(payload.imageCount) ||
    getPayloadImages(payload).length
  );
}

function getRequestedImageCountFromTask(
  task: ImageGenerationTaskRecord,
  payload: Record<string, unknown>
): number | undefined {
  const requestPayload =
    task.request_payload && typeof task.request_payload === 'object'
      ? (task.request_payload as Record<string, unknown>)
      : {};
  return (
    toPositiveInteger(payload.requestedImageCount) ||
    toPositiveInteger(requestPayload.imageCount) ||
    toPositiveInteger(payload.imageCount)
  );
}

function getMissingImageCountFromPayload(
  task: ImageGenerationTaskRecord,
  payload: Record<string, unknown>
): number {
  const requestedImageCount = getRequestedImageCountFromTask(task, payload);
  const actualImageCount = getActualImageCountFromPayload(payload);
  if (
    !requestedImageCount ||
    !Number.isFinite(actualImageCount) ||
    actualImageCount <= 0 ||
    actualImageCount >= requestedImageCount
  ) {
    return 0;
  }
  return requestedImageCount - actualImageCount;
}

function shouldAutoRetryMissingImages(
  task: ImageGenerationTaskRecord,
  payload: ImageGenerationSuccessPayload,
  creditWaiver: ReturnType<typeof parseQueuedImageGenerationCreditWaiver>
): boolean {
  if (creditWaiver) return false;
  if (process.env.IMAGE_TASK_AUTO_RETRY_MISSING_IMAGES === 'false') {
    return false;
  }
  const resultPayload = payload as unknown as Record<string, unknown>;
  if (typeof resultPayload.missingImageRetryTaskId === 'string') return false;
  if (typeof resultPayload.missingImageRetryFailedTaskId === 'string') {
    return false;
  }
  return getMissingImageCountFromPayload(task, resultPayload) > 0;
}

async function enqueueAutomaticMissingImageRetry({
  sb,
  task,
  sanitizedInput,
  payload,
  creditWaiver,
  logPrefix
}: {
  sb: SupabaseClient;
  task: ImageGenerationTaskRecord;
  sanitizedInput: NonNullable<
    ReturnType<typeof parseQueuedImageGenerationRequest>
  >;
  payload: ImageGenerationSuccessPayload;
  creditWaiver: ReturnType<typeof parseQueuedImageGenerationCreditWaiver>;
  logPrefix: string;
}): Promise<ImageGenerationSuccessPayload> {
  if (!shouldAutoRetryMissingImages(task, payload, creditWaiver)) {
    return payload;
  }

  const resultPayload = payload as unknown as Record<string, unknown>;
  const missingImageCount = getMissingImageCountFromPayload(
    task,
    resultPayload
  );
  if (missingImageCount <= 0) return payload;

  try {
    const retryTaskId = await createImageGenerationTask(
      sb,
      task.user_id,
      {
        ...sanitizedInput,
        imageCount: missingImageCount
      },
      undefined,
      {
        reason: 'auto_retry_missing_images_without_double_charge',
        sourceTaskId: task.id
      }
    );
    return {
      ...(payload as unknown as Record<string, unknown>),
      missingImageRetryTaskId: retryTaskId,
      missingImageRetryStartedAt: new Date().toISOString(),
      missingImageRetryImageCount: missingImageCount,
      missingImageRetryCreditWaived: true,
      missingImageRetryMode: 'auto'
    } as unknown as ImageGenerationSuccessPayload;
  } catch (error) {
    console.error(
      `[${logPrefix}] automatic missing image retry enqueue failed:`,
      {
        taskId: task.id,
        missingImageCount,
        message: getErrorMessage(error)
      }
    );
    return {
      ...(payload as unknown as Record<string, unknown>),
      missingImageRetryEnqueueFailedAt: new Date().toISOString(),
      missingImageRetryEnqueueError: getErrorMessage(error)
    } as unknown as ImageGenerationSuccessPayload;
  }
}

async function persistSucceededImageTaskPayload({
  sb,
  task,
  resultPayload,
  logPrefix
}: {
  sb: SupabaseClient;
  task: ImageGenerationTaskRecord;
  resultPayload: ImageGenerationSuccessPayload;
  logPrefix: string;
}): Promise<boolean> {
  const { data, error } = await sb
    .from('image_generation_tasks')
    .update({
      result_payload: resultPayload,
      updated_at: new Date().toISOString()
    })
    .eq('id', task.id)
    .eq('user_id', task.user_id)
    .eq('status', 'succeeded')
    .select('id')
    .maybeSingle();

  if (error || !data) {
    console.error(`[${logPrefix}] succeeded task payload update failed:`, {
      taskId: task.id,
      message: error?.message || 'task is no longer succeeded'
    });
    return false;
  }
  return true;
}

async function findPartialRetryParentTask({
  sb,
  task,
  logPrefix
}: {
  sb: SupabaseClient;
  task: ImageGenerationTaskRecord;
  logPrefix: string;
}): Promise<ImageGenerationTaskRecord | null> {
  const requestPayload =
    task.request_payload && typeof task.request_payload === 'object'
      ? (task.request_payload as Record<string, unknown>)
      : {};
  const creditWaiver =
    requestPayload.creditWaiver &&
    typeof requestPayload.creditWaiver === 'object'
      ? (requestPayload.creditWaiver as Record<string, unknown>)
      : {};
  const candidateIds = [
    task.id,
    typeof creditWaiver.sourceTaskId === 'string'
      ? creditWaiver.sourceTaskId
      : undefined
  ].filter((id): id is string => Boolean(id));

  if (typeof creditWaiver.sourceTaskId === 'string') {
    const { data, error } = await sb
      .from('image_generation_tasks')
      .select('*')
      .eq('id', creditWaiver.sourceTaskId)
      .eq('user_id', task.user_id)
      .eq('status', 'succeeded')
      .limit(1);

    if (error) {
      console.warn(
        `[${logPrefix}] partial retry source parent lookup failed:`,
        {
          taskId: task.id,
          sourceTaskId: creditWaiver.sourceTaskId,
          message: error.message
        }
      );
    } else {
      const sourceParent =
        ((data || [])[0] as ImageGenerationTaskRecord | undefined) || null;
      if (
        sourceParent &&
        getMissingImageCountFromPayload(
          sourceParent,
          getRecordPayload(sourceParent)
        ) > 0
      ) {
        return sourceParent;
      }
    }
  }

  for (const candidateId of candidateIds) {
    for (const field of [
      'result_payload->>missingImageRetryTaskId',
      'result_payload->>missingImageRetryFailedTaskId'
    ]) {
      const { data, error } = await sb
        .from('image_generation_tasks')
        .select('*')
        .eq('user_id', task.user_id)
        .eq('status', 'succeeded')
        .eq(field, candidateId)
        .limit(1);

      if (error) {
        console.warn(`[${logPrefix}] partial retry parent lookup failed:`, {
          taskId: task.id,
          candidateId,
          field,
          message: error.message
        });
        continue;
      }

      const parentTask =
        ((data || [])[0] as ImageGenerationTaskRecord | undefined) || null;
      if (parentTask) return parentTask;
    }
  }

  return null;
}

async function updatePartialRetryParentTask({
  sb,
  parentTask,
  resultPayload,
  logPrefix
}: {
  sb: SupabaseClient;
  parentTask: ImageGenerationTaskRecord;
  resultPayload: Record<string, unknown>;
  logPrefix: string;
}): Promise<void> {
  const { error } = await sb
    .from('image_generation_tasks')
    .update({
      result_payload: resultPayload,
      updated_at: new Date().toISOString()
    })
    .eq('id', parentTask.id)
    .eq('user_id', parentTask.user_id);

  if (error) {
    console.error(`[${logPrefix}] partial retry parent update failed:`, {
      taskId: parentTask.id,
      message: error.message
    });
  }
}

async function reconcilePartialImageRetryParent({
  sb,
  task,
  status,
  payload,
  error,
  logPrefix = 'ImageTaskRunner'
}: {
  sb: SupabaseClient;
  task: ImageGenerationTaskRecord;
  status: ImageTaskStatus;
  payload?: ImageGenerationSuccessPayload;
  error?: string;
  logPrefix?: string;
}): Promise<void> {
  const parentTask = await findPartialRetryParentTask({ sb, task, logPrefix });
  if (!parentTask) return;

  const parentPayload = getRecordPayload(parentTask);
  const nextPayload = clearPartialRetryMarker(parentPayload);
  const nowIso = new Date().toISOString();

  if (status === 'succeeded' && payload?.success) {
    const requestedImageCount =
      getRequestedImageCountFromTask(parentTask, parentPayload) ||
      toPositiveInteger(payload.requestedImageCount) ||
      toPositiveInteger(payload.imageCount);
    const mergedImages = mergeGeneratedImages(
      getPayloadImages(parentPayload),
      getPayloadImages(payload as unknown as Record<string, unknown>)
    );
    const actualImageCount = Math.max(
      mergedImages.length,
      getActualImageCountFromPayload(parentPayload) +
        getActualImageCountFromPayload(
          payload as unknown as Record<string, unknown>
        )
    );
    const cappedImages =
      requestedImageCount && mergedImages.length > requestedImageCount
        ? mergedImages.slice(0, requestedImageCount)
        : mergedImages;
    const finalActualImageCount = cappedImages.length || actualImageCount;
    const completed =
      Boolean(requestedImageCount) &&
      finalActualImageCount >= (requestedImageCount as number);
    const credits =
      nextPayload.credits && typeof nextPayload.credits === 'object'
        ? { ...(nextPayload.credits as Record<string, unknown>) }
        : undefined;
    if (completed && credits && typeof credits.warning === 'string') {
      delete credits.warning;
    }
    const mergedParentPayload: Record<string, unknown> = {
      ...nextPayload,
      ...(credits ? { credits } : {}),
      images: cappedImages,
      imageCount: finalActualImageCount,
      actualImageCount: finalActualImageCount,
      requestedImageCount: requestedImageCount || finalActualImageCount,
      skippedCrossChannelSupplement: completed
        ? false
        : nextPayload.skippedCrossChannelSupplement,
      missingImageRetryCompletedTaskId: task.id,
      missingImageRetryCompletedAt: nowIso,
      missingImageRetryResultStatus: 'succeeded'
    };
    if (completed) {
      delete mergedParentPayload.partialRefundWarning;
    }

    await updatePartialRetryParentTask({
      sb,
      parentTask,
      logPrefix,
      resultPayload: mergedParentPayload
    });
    return;
  }

  await updatePartialRetryParentTask({
    sb,
    parentTask,
    logPrefix,
    resultPayload: {
      ...nextPayload,
      missingImageRetryFailedTaskId: task.id,
      missingImageRetryFailedAt: nowIso,
      missingImageRetryResultStatus: status,
      missingImageRetryError: error || null
    }
  });
}

export async function claimImageTask({
  sb,
  task,
  userId,
  logPrefix = 'ImageTaskRunner'
}: ClaimImageTaskOptions): Promise<ImageGenerationTaskRecord | null> {
  const ownerUserId = userId || task.user_id;
  if (userId && task.user_id !== userId) return null;

  if (
    task.status !== 'queued' &&
    !(task.status === 'running' && isImageTaskLockStale(task))
  ) {
    return null;
  }

  const concurrency = await getUserImageConcurrency(sb, ownerUserId);
  const pipelineDeadlineMs = getImageTaskPipelineDeadlineMs(
    task.request_payload
  );
  const { data, error } = await sb.rpc('claim_image_generation_task', {
    p_task_id: task.id,
    p_expected_status: task.status,
    p_user_id: userId || null,
    p_concurrency: concurrency,
    p_lease_seconds: Math.ceil((pipelineDeadlineMs + 15_000) / 1000),
    p_max_attempts: getImageTaskMaxAttempts()
  });
  if (error) {
    console.error(`[${logPrefix}] atomic task claim failed:`, {
      taskId: task.id,
      message: error.message
    });
    return null;
  }

  const result = data as {
    claimed?: boolean;
    task?: ImageGenerationTaskRecord;
  } | null;
  return result?.claimed && result.task ? result.task : null;
}

export async function finalizeImageTask({
  sb,
  task,
  values,
  logPrefix = 'ImageTaskRunner'
}: FinalizeImageTaskOptions): Promise<{
  persisted: boolean;
  durations: ImageTaskCompletionDurations;
}> {
  const completedAt = new Date();
  const durations = getImageTaskCompletionMetrics(task, completedAt.getTime());
  let query = sb
    .from('image_generation_tasks')
    .update({
      ...values,
      ...durations,
      locked_until: null,
      lease_token: null,
      completed_at: completedAt.toISOString(),
      updated_at: completedAt.toISOString()
    })
    .eq('id', task.id)
    .eq('status', 'running');
  if (task.lease_token) {
    query = query.eq('lease_token', task.lease_token);
  }
  const { data, error } = await query.select('id').maybeSingle();

  if (error || !data) {
    console.error(`[${logPrefix}] task update failed:`, {
      taskId: task.id,
      message: error?.message || 'task lease was superseded'
    });
    return { persisted: false, durations };
  }
  return { persisted: true, durations };
}

function getPendingProviderPollDelaySeconds(
  body: Record<string, unknown> | undefined
): number | null {
  if (!body?.pendingProviderPoll) return null;
  const reenqueue =
    body.reenqueue && typeof body.reenqueue === 'object'
      ? (body.reenqueue as Record<string, unknown>)
      : null;
  const bodyDelay = Number(reenqueue?.delaySeconds);
  const retryAfterMs = Number(body.retryAfterMs);
  const delaySeconds = Number.isFinite(bodyDelay)
    ? bodyDelay
    : Number.isFinite(retryAfterMs)
      ? Math.ceil(retryAfterMs / 1000)
      : 12;
  return Math.max(5, Math.min(120, Math.floor(delaySeconds)));
}

async function deferImageTaskForProviderPoll({
  sb,
  task,
  result,
  errorMessage,
  delaySeconds,
  logPrefix = 'ImageTaskRunner'
}: DeferImageTaskOptions): Promise<boolean> {
  const nowIso = new Date().toISOString();
  const nextClaimAt = new Date(Date.now() + delaySeconds * 1000).toISOString();
  const providerTaskId =
    typeof result.body?.providerTaskId === 'string'
      ? result.body.providerTaskId.trim()
      : '';
  let query = sb
    .from('image_generation_tasks')
    .update({
      status: 'running',
      error_message: errorMessage,
      failure_category: result.failureDetails?.category || null,
      failure_code: result.failureDetails?.code || null,
      provider_request_id: providerTaskId || task.provider_request_id || null,
      locked_until: nextClaimAt,
      result_payload: {
        success: false,
        pendingProviderPoll: true,
        retryAfterMs: delaySeconds * 1000,
        errorDetails: result.failureDetails || null,
        errorBody: result.body || null,
        diagnostics: result.diagnostics,
        deferredAt: nowIso
      },
      updated_at: nowIso
    })
    .eq('id', task.id)
    .eq('status', 'running');
  if (task.lease_token) {
    query = query.eq('lease_token', task.lease_token);
  }
  const { data, error } = await query.select('id').maybeSingle();

  if (error || !data) {
    console.error(`[${logPrefix}] pending provider poll update failed:`, {
      taskId: task.id,
      message: error?.message || 'task lease was superseded'
    });
    return false;
  }
  return true;
}

async function hasImageTaskBeenCancelled({
  sb,
  task,
  logPrefix
}: {
  sb: SupabaseClient;
  task: ImageGenerationTaskRecord;
  logPrefix: string;
}): Promise<boolean> {
  if (task.status === 'cancelled') return true;

  const { data, error } = await sb
    .from('image_generation_tasks')
    .select('status,lease_token')
    .eq('id', task.id)
    .single();

  if (error) {
    console.warn(`[${logPrefix}] cancel status lookup failed:`, {
      taskId: task.id,
      message: error.message
    });
    return false;
  }

  return (
    data?.status === 'cancelled' ||
    Boolean(task.lease_token && data?.lease_token !== task.lease_token)
  );
}

export async function runImageTask({
  sb,
  task,
  request,
  logPrefix = 'ImageTaskRunner'
}: RunImageTaskOptions): Promise<ImageTaskRunResult> {
  if (await hasImageTaskBeenCancelled({ sb, task, logPrefix })) {
    return {
      taskId: task.id,
      status: 'cancelled'
    };
  }

  const sanitizedInput = parseQueuedImageGenerationRequest(
    task.request_payload
  );
  if (!sanitizedInput) {
    const finalized = await finalizeImageTask({
      sb,
      task,
      logPrefix,
      values: {
        status: 'failed',
        error_message: '任务参数无效',
        failure_category: 'invalid_request',
        failure_code: 'INVALID_IMAGE_REQUEST',
        result_payload: {
          success: false,
          errorDetails: {
            code: 'INVALID_IMAGE_REQUEST',
            category: 'invalid_request',
            retryable: false
          }
        },
        refund_failed: false
      }
    });
    if (finalized.persisted) {
      await recordImageTaskTerminalEvents({
        sb,
        task,
        status: 'failed',
        durations: finalized.durations,
        failure: {
          code: 'INVALID_IMAGE_REQUEST',
          category: 'invalid_request'
        }
      });
      await reconcilePartialImageRetryParent({
        sb,
        task,
        status: 'failed',
        error: '任务参数无效',
        logPrefix
      });
    } else {
      return {
        taskId: task.id,
        status: 'cancelled',
        error: 'Task lease was superseded'
      };
    }
    return {
      taskId: task.id,
      status: 'failed',
      error: '任务参数无效',
      errorDetails: {
        code: 'INVALID_IMAGE_REQUEST',
        category: 'invalid_request',
        retryable: false
      },
      refundFailed: false
    };
  }

  const creditWaiver = parseQueuedImageGenerationCreditWaiver(
    task.request_payload
  );
  const pipelineDeadlineMs = getImageTaskPipelineDeadlineMs(
    task.request_payload
  );
  const isDenoiseTask = isCloudDenoiseTask(task.request_payload);
  const result = await executeImageGenerationJob({
    request,
    userId: task.user_id,
    sanitizedInput,
    sb,
    options: {
      mode: 'queued',
      taskId: task.id,
      cloudDenoiseTask: isDenoiseTask,
      pipelineDeadlineMs,
      tuziVipTimeoutMs: QUEUED_TUZI_VIP_TIMEOUT_MS,
      disableProviderFallback: isDenoiseTask,
      skipCreditCharge: Boolean(creditWaiver),
      creditWaiverReason: creditWaiver?.reason,
      prepaidCredit: parseQueuedImageGenerationPrepaidCredit(
        task.request_payload
      )
    }
  });

  if (await hasImageTaskBeenCancelled({ sb, task, logPrefix })) {
    return {
      taskId: task.id,
      status: 'cancelled'
    };
  }

  if (result.ok && result.payload) {
    const finalized = await finalizeImageTask({
      sb,
      task,
      logPrefix,
      values: {
        status: 'succeeded',
        result_payload: result.payload,
        generation_id: result.payload.generationId,
        error_message: null,
        refund_failed: false,
        failure_category: null,
        failure_code: null,
        provider_request_id: task.provider_request_id || null
      }
    });
    if (!finalized.persisted) {
      return {
        taskId: task.id,
        status: 'cancelled',
        error: 'Task lease was superseded'
      };
    }

    const resultPayload = await enqueueAutomaticMissingImageRetry({
      sb,
      task,
      sanitizedInput,
      payload: result.payload,
      creditWaiver,
      logPrefix
    });
    await persistSucceededImageTaskPayload({
      sb,
      task,
      resultPayload,
      logPrefix
    });
    await recordImageTaskTerminalEvents({
      sb,
      task,
      status: 'succeeded',
      durations: finalized.durations,
      payload: resultPayload,
      diagnostics: result.diagnostics
    });
    await reconcilePartialImageRetryParent({
      sb,
      task,
      status: 'succeeded',
      payload: resultPayload,
      logPrefix
    });
    return {
      taskId: task.id,
      status: 'succeeded',
      payload: resultPayload
    };
  }

  const errorMessage =
    result.failureReason ||
    (typeof result.body?.error === 'string'
      ? result.body.error
      : getErrorMessage(result.body?.error));
  const pendingDelaySeconds = getPendingProviderPollDelaySeconds(result.body);
  if (pendingDelaySeconds !== null) {
    const deferred = await deferImageTaskForProviderPoll({
      sb,
      task,
      result,
      errorMessage,
      delaySeconds: pendingDelaySeconds,
      logPrefix
    });
    if (!deferred) {
      return {
        taskId: task.id,
        status: 'cancelled',
        error: 'Task lease was superseded'
      };
    }
    return {
      taskId: task.id,
      status: 'running',
      error: errorMessage,
      errorDetails: result.failureDetails,
      body: result.body,
      refundFailed: false,
      diagnostics: result.diagnostics,
      reenqueue: {
        taskId: task.id,
        delaySeconds: pendingDelaySeconds
      }
    };
  }
  const refundFailed = isDenoiseTask
    ? await reconcileCloudDenoiseFailureRefund({ sb, task, logPrefix })
    : Boolean(result.refundFailed);
  if (result.diagnostics && isDenoiseTask) {
    const prepaidCredit = parseQueuedImageGenerationPrepaidCredit(
      task.request_payload
    );
    result.diagnostics.billing = {
      ...result.diagnostics.billing,
      consumedCredits: refundFailed ? prepaidCredit?.consumed || 0 : 0,
      refundedCredits: refundFailed ? 0 : prepaidCredit?.consumed || 0,
      refundFailed
    };
  }
  const finalized = await finalizeImageTask({
    sb,
    task,
    logPrefix,
    values: {
      status: 'failed',
      error_message: errorMessage,
      failure_category: result.failureDetails?.category || 'unknown',
      failure_code: result.failureDetails?.code || 'IMAGE_GENERATION_FAILED',
      provider_request_id: extractProviderRequestId(errorMessage),
      result_payload: {
        success: false,
        errorDetails: result.failureDetails || null,
        errorBody: result.body || null,
        diagnostics: result.diagnostics
      },
      refund_failed: refundFailed
    }
  });
  if (finalized.persisted) {
    await recordImageTaskTerminalEvents({
      sb,
      task,
      status: 'failed',
      durations: finalized.durations,
      failure: result.failureDetails,
      diagnostics: result.diagnostics
    });
    await reconcilePartialImageRetryParent({
      sb,
      task,
      status: 'failed',
      error: errorMessage,
      logPrefix
    });
  } else {
    return {
      taskId: task.id,
      status: 'cancelled',
      error: 'Task lease was superseded'
    };
  }

  return {
    taskId: task.id,
    status: 'failed',
    error: errorMessage,
    errorDetails: result.failureDetails,
    body: result.body,
    refundFailed,
    diagnostics: result.diagnostics
  };
}
