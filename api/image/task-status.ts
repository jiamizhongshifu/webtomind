import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  sanitizeLegacyAutoNegativePrompt,
  type NegativePromptSource
} from '../../src/shared/image-negative-prompt.js';
import { resolveImageGenerationFailureDetails } from '../../src/shared/image-generation-failure.js';
import {
  getCorsHeadersForRequest,
  getUserIdFromRequest
} from '../utils/auth.js';
import type {
  ImageGenerationAttemptDiagnostic,
  ImageGenerationFailureCategory,
  ImageGenerationTaskDiagnostics,
  ImageProvider
} from './generate/types.js';
import { getUserImageConcurrency } from './task-concurrency.js';

type TaskStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

interface ImageGenerationTaskRecord {
  id: string;
  user_id: string;
  status: TaskStatus;
  request_payload: Record<string, unknown> | null;
  result_payload: Record<string, unknown> | null;
  error_message: string | null;
  refund_failed: boolean | null;
  started_at: string | null;
  completed_at?: string | null;
  failure_category?: string | null;
  failure_code?: string | null;
  created_at: string;
  updated_at: string;
}

const ACTIVE_TASK_LOOKBACK_MS = 12 * 60 * 60 * 1000;
const FAILED_TASK_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
const PARTIAL_SUCCEEDED_TASK_LOOKBACK_MS = 24 * 60 * 60 * 1000;
const ACTIVE_TASK_MAX_LIMIT = 50;
const ACTIVE_FAILED_TASK_MAX_LIMIT = 5;
const ACTIVE_PARTIAL_TASK_MAX_LIMIT = 8;
const IMAGE_TASK_QUEUED_POLL_AFTER_MS = 5000;
const IMAGE_TASK_RUNNING_POLL_AFTER_MS = 8000;
const IMAGE_TASK_FAILED_POLL_AFTER_MS = 12000;

interface ImageGenerationAttemptRecord {
  task_id: string | null;
  request_mode: string | null;
  provider: string;
  model: string;
  channel: string | null;
  attempt_index: number;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  status: 'running' | 'succeeded' | 'failed';
  error_category: string | null;
  error_code: string | null;
  error_message: string | null;
  provider_request_id: string | null;
  metadata: Record<string, unknown> | null;
}

function getSupabaseAdmin(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function jsonResponse(
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

function normalizeCount(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;
  return Math.floor(parsed);
}

function getTaskRequestedImageCount(task: ImageGenerationTaskRecord): number {
  const payload = task.request_payload || {};
  return normalizeCount(payload.imageCount) || 1;
}

function getTaskActualImageCount(
  task: ImageGenerationTaskRecord
): number | undefined {
  const payload = task.result_payload || {};
  const images = Array.isArray(payload.images) ? payload.images : null;
  return (
    normalizeCount(payload.actualImageCount) ||
    normalizeCount(payload.imageCount) ||
    (images ? images.length : undefined)
  );
}

function getTaskMissingImageCount(task: ImageGenerationTaskRecord): number {
  const requested = getTaskRequestedImageCount(task);
  const actual = getTaskActualImageCount(task);
  if (!actual || actual >= requested) return 0;
  return requested - actual;
}

function getCreditWaiverSourceTaskId(
  payload: Record<string, unknown> | null
): string | undefined {
  const creditWaiver =
    payload?.creditWaiver && typeof payload.creditWaiver === 'object'
      ? (payload.creditWaiver as Record<string, unknown>)
      : null;
  return typeof creditWaiver?.sourceTaskId === 'string'
    ? creditWaiver.sourceTaskId
    : undefined;
}

function isPartialSucceededTask(task: ImageGenerationTaskRecord): boolean {
  return task.status === 'succeeded' && getTaskMissingImageCount(task) > 0;
}

function getAttemptProviderLabel(
  attempt: ImageGenerationAttemptRecord
): string {
  if (
    attempt.provider === 'openai' &&
    attempt.channel === 'openai-compatible'
  ) {
    return 'OpenAI-compatible';
  }
  if (attempt.channel) return `${attempt.provider}/${attempt.channel}`;
  return attempt.provider;
}

function getAttemptFailureReason(
  attempt: ImageGenerationAttemptRecord
): string | undefined {
  const httpStatus = normalizeCount(attempt.metadata?.httpStatus);
  if (httpStatus) return String(httpStatus);
  if (attempt.error_code) return attempt.error_code;
  if (attempt.error_category) return attempt.error_category;
  if (attempt.error_message) return attempt.error_message.slice(0, 80);
  return undefined;
}

function toCurrentStage(
  task: ImageGenerationTaskRecord,
  latestAttempt?: ImageGenerationAttemptRecord
) {
  if (!latestAttempt) return undefined;
  const retryableFailure =
    latestAttempt.status === 'failed' &&
    [
      'provider_unavailable',
      'provider_timeout',
      'provider_rate_limit'
    ].includes(latestAttempt.error_category || '');
  const phase =
    task.status === 'running' && retryableFailure
      ? 'fallback'
      : latestAttempt.metadata?.phase === 'initial_rescue_single' ||
          latestAttempt.metadata?.phase === 'initial_rescue_batch'
        ? 'rescue'
        : latestAttempt.metadata?.phase === 'supplemental'
          ? 'supplemental'
          : latestAttempt.metadata?.phase === 'initial'
            ? 'primary'
            : 'unknown';

  return {
    phase,
    provider: latestAttempt.provider,
    providerLabel: getAttemptProviderLabel(latestAttempt),
    model: latestAttempt.model,
    channel: latestAttempt.channel || undefined,
    attemptIndex: latestAttempt.attempt_index,
    status: latestAttempt.status,
    startedAt: latestAttempt.started_at,
    finishedAt: latestAttempt.finished_at || undefined,
    durationMs: latestAttempt.duration_ms || undefined,
    errorCategory: latestAttempt.error_category || undefined,
    errorCode: latestAttempt.error_code || undefined,
    errorMessage: latestAttempt.error_message || undefined,
    failureReason: getAttemptFailureReason(latestAttempt),
    providerRequestId: latestAttempt.provider_request_id || undefined
  };
}

function getAttemptMetadataPhase(
  attempt: ImageGenerationAttemptRecord
): string | undefined {
  const phase = attempt.metadata?.phase;
  if (typeof phase === 'string' && phase) return phase;
  return attempt.attempt_index > 1 ? 'fallback' : undefined;
}

function toAttemptDiagnostic(
  attempt: ImageGenerationAttemptRecord
): ImageGenerationAttemptDiagnostic {
  return {
    provider: attempt.provider as ImageProvider,
    model: attempt.model,
    channel: attempt.channel || undefined,
    attemptIndex: attempt.attempt_index,
    phase: getAttemptMetadataPhase(attempt),
    status: attempt.status,
    startedAt: attempt.started_at,
    finishedAt: attempt.finished_at || attempt.started_at,
    durationMs: attempt.duration_ms || 0,
    errorCategory:
      (attempt.error_category as ImageGenerationAttemptDiagnostic['errorCategory']) ||
      undefined,
    errorCode: attempt.error_code || undefined,
    errorMessage: attempt.error_message || undefined,
    httpStatus: normalizeCount(attempt.metadata?.httpStatus),
    retryable:
      typeof attempt.metadata?.retryable === 'boolean'
        ? attempt.metadata.retryable
        : undefined,
    providerRequestId: attempt.provider_request_id || undefined,
    requestedImageCount:
      normalizeCount(attempt.metadata?.requestedImageCount) ||
      normalizeCount(attempt.metadata?.requestedBatchImageCount),
    effectiveImageCount: normalizeCount(attempt.metadata?.effectiveImageCount),
    providerRequestImageCount: normalizeCount(
      attempt.metadata?.providerRequestImageCount
    ),
    accumulatedImageCount: normalizeCount(
      attempt.metadata?.accumulatedImageCount
    ),
    usedFallback:
      typeof attempt.metadata?.openAICompatibleFallbackAttempt === 'boolean'
        ? attempt.metadata.openAICompatibleFallbackAttempt
        : attempt.attempt_index > 1,
    rescueProvider:
      typeof attempt.metadata?.rescueProvider === 'string'
        ? (attempt.metadata.rescueProvider as ImageProvider)
        : undefined
  };
}

function getPayloadDiagnostics(
  task: ImageGenerationTaskRecord
): ImageGenerationTaskDiagnostics | undefined {
  const diagnostics = task.result_payload?.diagnostics;
  return diagnostics && typeof diagnostics === 'object'
    ? (diagnostics as ImageGenerationTaskDiagnostics)
    : undefined;
}

function getTaskDiagnostics(
  task: ImageGenerationTaskRecord,
  attempts: ImageGenerationAttemptRecord[]
): ImageGenerationTaskDiagnostics | undefined {
  const existing = getPayloadDiagnostics(task);
  const attemptDiagnostics = attempts.map(toAttemptDiagnostic);
  if (!existing && attemptDiagnostics.length === 0) return undefined;

  const request = task.request_payload || {};
  const result = task.result_payload || {};
  const latestAttempt = attempts[attempts.length - 1];
  const credits =
    result.credits && typeof result.credits === 'object'
      ? (result.credits as Record<string, unknown>)
      : {};
  return {
    requested:
      existing?.requested ||
      ({
        provider:
          (typeof request.provider === 'string'
            ? request.provider
            : undefined) ||
          latestAttempt?.provider ||
          'tuzi',
        model:
          (typeof request.model === 'string' ? request.model : undefined) ||
          latestAttempt?.model ||
          '',
        imageCount: getTaskRequestedImageCount(task),
        imageSize:
          (typeof request.imageSize === 'string'
            ? request.imageSize
            : undefined) || '',
        aspectRatio:
          (typeof request.aspectRatio === 'string'
            ? request.aspectRatio
            : undefined) || '',
        quality:
          (typeof request.quality === 'string' ? request.quality : undefined) ||
          'auto',
        outputFormat:
          (typeof request.outputFormat === 'string'
            ? request.outputFormat
            : undefined) || 'png'
      } as ImageGenerationTaskDiagnostics['requested']),
    attempts:
      attemptDiagnostics.length > 0
        ? attemptDiagnostics
        : existing?.attempts || [],
    final:
      existing?.final ||
      (task.status === 'succeeded' || task.status === 'failed'
        ? {
            status: task.status === 'succeeded' ? 'succeeded' : 'failed',
            provider:
              typeof result.provider === 'string'
                ? (result.provider as ImageProvider)
                : undefined,
            model: typeof result.model === 'string' ? result.model : undefined,
            imageCount: getTaskActualImageCount(task),
            requestedImageCount: getTaskRequestedImageCount(task),
            imageSize:
              typeof result.imageSize === 'string'
                ? result.imageSize
                : undefined,
            usedFallback:
              typeof result.usedFallback === 'boolean'
                ? result.usedFallback
                : undefined,
            skippedCrossChannelSupplement:
              typeof result.skippedCrossChannelSupplement === 'boolean'
                ? result.skippedCrossChannelSupplement
                : undefined,
            failureCategory: getTaskFailureDetails(task)?.category as
              | ImageGenerationFailureCategory
              | undefined,
            failureCode: getTaskFailureDetails(task)?.code
          }
        : existing?.final),
    billing:
      existing?.billing ||
      ({
        chargedCredits: normalizeCount(credits.requestedCost) || 0,
        consumedCredits: normalizeCount(credits.consumed) || 0,
        refundedCredits: normalizeCount(result.refunded) || 0,
        creditType:
          typeof credits.creditType === 'string'
            ? credits.creditType
            : undefined,
        refundFailed: Boolean(task.refund_failed || result.refundFailed),
        skipCreditCharge: false,
        prepaid: false
      } as ImageGenerationTaskDiagnostics['billing'])
  };
}

function taskResponse(
  task: ImageGenerationTaskRecord,
  corsHeaders: Record<string, string>,
  attempts: ImageGenerationAttemptRecord[] = []
): Response {
  const latestAttempt = attempts[attempts.length - 1];
  const diagnostics = getTaskDiagnostics(task, attempts);
  if (task.status === 'succeeded' && task.result_payload) {
    const requestedImageCount = getTaskRequestedImageCount(task);
    const actualImageCount = getTaskActualImageCount(task);
    const missingImageCount = getTaskMissingImageCount(task);
    return jsonResponse(
      {
        ...task.result_payload,
        queued: true,
        taskId: task.id,
        status: 'succeeded',
        requestedImageCount,
        actualImageCount,
        missingImageCount,
        canRetryMissingImages: missingImageCount > 0,
        ...(diagnostics ? { diagnostics } : {}),
        currentStage: toCurrentStage(task, latestAttempt)
      },
      corsHeaders
    );
  }

  if (task.status === 'failed') {
    const errorDetails = getTaskFailureDetails(task);
    return jsonResponse(
      {
        success: false,
        queued: true,
        taskId: task.id,
        status: 'failed',
        error: task.error_message || '图片生成失败',
        ...(errorDetails ? { errorDetails } : {}),
        refundFailed: Boolean(task.refund_failed),
        ...(diagnostics ? { diagnostics } : {}),
        currentStage: toCurrentStage(task, latestAttempt)
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
      currentStage: toCurrentStage(task, latestAttempt),
      ...(diagnostics ? { diagnostics } : {}),
      pollAfterMs:
        task.status === 'running'
          ? IMAGE_TASK_RUNNING_POLL_AFTER_MS
          : IMAGE_TASK_QUEUED_POLL_AFTER_MS
    },
    corsHeaders
  );
}

function parseTaskListLimit(value: string | null): number {
  const parsed = Number(value || 20);
  if (!Number.isFinite(parsed)) return 20;
  return Math.max(1, Math.min(ACTIVE_TASK_MAX_LIMIT, Math.floor(parsed)));
}

function pickRequestPayload(record: Record<string, unknown> | null) {
  if (!record) return {};
  return {
    prompt: typeof record.prompt === 'string' ? record.prompt : '',
    negativePrompt: sanitizeLegacyAutoNegativePrompt(
      typeof record.negativePrompt === 'string'
        ? record.negativePrompt
        : undefined,
      typeof record.negativePromptSource === 'string'
        ? (record.negativePromptSource as NegativePromptSource)
        : undefined
    ),
    model: typeof record.model === 'string' ? record.model : undefined,
    aspectRatio:
      typeof record.aspectRatio === 'string' ? record.aspectRatio : undefined,
    imageSize:
      typeof record.imageSize === 'string' ? record.imageSize : undefined,
    quality: typeof record.quality === 'string' ? record.quality : undefined,
    outputFormat:
      typeof record.outputFormat === 'string' ? record.outputFormat : undefined,
    assetIds: Array.isArray(record.assetIds) ? record.assetIds : [],
    promptMode:
      typeof record.promptMode === 'string' ? record.promptMode : undefined,
    imageCount:
      typeof record.imageCount === 'number' ||
      typeof record.imageCount === 'string'
        ? Number(record.imageCount)
        : 1,
    referenceImageIds: Array.isArray(record.referenceImageIds)
      ? record.referenceImageIds
      : [],
    referenceMode:
      typeof record.referenceMode === 'string'
        ? record.referenceMode
        : undefined,
    characterCardIds: Array.isArray(record.characterCardIds)
      ? record.characterCardIds
      : [],
    characterReferenceGroups: Array.isArray(record.characterReferenceGroups)
      ? record.characterReferenceGroups
      : [],
    sourceGenerationId:
      typeof record.sourceGenerationId === 'string'
        ? record.sourceGenerationId
        : undefined,
    editInstruction:
      typeof record.editInstruction === 'string'
        ? record.editInstruction
        : undefined,
    editMode: typeof record.editMode === 'string' ? record.editMode : undefined,
    appSlug: typeof record.appSlug === 'string' ? record.appSlug : undefined,
    appOperation:
      typeof record.appOperation === 'string' ? record.appOperation : undefined,
    sourceApp:
      typeof record.sourceApp === 'string' ? record.sourceApp : undefined,
    creationContext:
      record.creationContext && typeof record.creationContext === 'object'
        ? record.creationContext
        : undefined
  };
}

export function toActiveTaskResponseItem(
  task: ImageGenerationTaskRecord,
  queuePosition?: number,
  latestAttempt?: ImageGenerationAttemptRecord
) {
  const failureDetails = getTaskFailureDetails(task);
  const requestedImageCount = getTaskRequestedImageCount(task);
  const actualImageCount = getTaskActualImageCount(task);
  const missingImageCount = getTaskMissingImageCount(task);
  return {
    taskId: task.id,
    status: task.status,
    retryOfTaskId: getCreditWaiverSourceTaskId(task.request_payload),
    request: pickRequestPayload(task.request_payload),
    createdAt: task.created_at,
    startedAt: task.started_at,
    updatedAt: task.updated_at,
    error: task.error_message || undefined,
    errorCategory: failureDetails?.category,
    errorCode: failureDetails?.code,
    retryable: failureDetails?.retryable,
    queuePosition,
    imageCount: actualImageCount,
    requestedImageCount,
    actualImageCount,
    missingImageCount,
    canRetryMissingImages: missingImageCount > 0,
    missingImageRetryTaskId:
      typeof task.result_payload?.missingImageRetryTaskId === 'string'
        ? task.result_payload.missingImageRetryTaskId
        : undefined,
    missingImageRetryStartedAt:
      typeof task.result_payload?.missingImageRetryStartedAt === 'string'
        ? task.result_payload.missingImageRetryStartedAt
        : undefined,
    missingImageRetryImageCount: normalizeCount(
      task.result_payload?.missingImageRetryImageCount
    ),
    missingImageRetryCreditWaived:
      typeof task.result_payload?.missingImageRetryCreditWaived === 'boolean'
        ? task.result_payload.missingImageRetryCreditWaived
        : undefined,
    refunded:
      typeof task.result_payload?.refunded === 'number'
        ? task.result_payload.refunded
        : undefined,
    refundFailed: Boolean(
      task.refund_failed || task.result_payload?.refundFailed
    ),
    partialRefundWarning:
      typeof task.result_payload?.partialRefundWarning === 'string'
        ? task.result_payload.partialRefundWarning
        : typeof (
              task.result_payload?.credits as
                | Record<string, unknown>
                | undefined
            )?.warning === 'string'
          ? ((task.result_payload?.credits as Record<string, unknown>)
              .warning as string)
          : undefined,
    batchConsistencyMode:
      typeof task.result_payload?.batchConsistencyMode === 'string'
        ? task.result_payload.batchConsistencyMode
        : undefined,
    strictBatchConsistency:
      typeof task.result_payload?.strictBatchConsistency === 'boolean'
        ? task.result_payload.strictBatchConsistency
        : undefined,
    skippedCrossChannelSupplement:
      typeof task.result_payload?.skippedCrossChannelSupplement === 'boolean'
        ? task.result_payload.skippedCrossChannelSupplement
        : undefined,
    currentStage: toCurrentStage(task, latestAttempt),
    pollAfterMs:
      task.status === 'running'
        ? IMAGE_TASK_RUNNING_POLL_AFTER_MS
        : task.status === 'failed'
          ? IMAGE_TASK_FAILED_POLL_AFTER_MS
          : IMAGE_TASK_QUEUED_POLL_AFTER_MS
  };
}

async function getLatestAttemptsByTaskId(
  sb: SupabaseClient,
  taskIds: string[]
): Promise<Map<string, ImageGenerationAttemptRecord>> {
  if (taskIds.length === 0) return new Map();

  const { data, error } = await sb
    .from('image_generation_attempts')
    .select(
      'task_id,request_mode,provider,model,channel,attempt_index,started_at,finished_at,duration_ms,status,error_category,error_code,error_message,provider_request_id,metadata'
    )
    .in('task_id', taskIds)
    .order('started_at', { ascending: false })
    .limit(Math.max(20, taskIds.length * 4));

  if (error) {
    console.warn('[ImageTaskStatus] latest attempt lookup failed:', {
      message: error.message
    });
    return new Map();
  }

  const attempts = new Map<string, ImageGenerationAttemptRecord>();
  for (const attempt of (data || []) as ImageGenerationAttemptRecord[]) {
    if (!attempt.task_id || attempts.has(attempt.task_id)) continue;
    attempts.set(attempt.task_id, attempt);
  }
  return attempts;
}

async function getAttemptsForTaskId(
  sb: SupabaseClient,
  taskId: string
): Promise<ImageGenerationAttemptRecord[]> {
  const { data, error } = await sb
    .from('image_generation_attempts')
    .select(
      'task_id,request_mode,provider,model,channel,attempt_index,started_at,finished_at,duration_ms,status,error_category,error_code,error_message,provider_request_id,metadata'
    )
    .eq('task_id', taskId)
    .order('started_at', { ascending: true })
    .limit(20);

  if (error) {
    console.warn('[ImageTaskStatus] task attempt lookup failed:', {
      taskId,
      message: error.message
    });
    return [];
  }

  return (data || []) as ImageGenerationAttemptRecord[];
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
  const partialLimit = Math.min(limit, ACTIVE_PARTIAL_TASK_MAX_LIMIT);
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
  const { data: succeededData, error: succeededError } = await sb
    .from('image_generation_tasks')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'succeeded')
    .gte('updated_at', partialLookbackSince)
    .order('updated_at', { ascending: false })
    .limit(Math.max(20, partialLimit * 4));

  if (activeError || failedError || succeededError) {
    console.error('[ImageTaskStatus] active task list failed:', {
      userId,
      message:
        activeError?.message || failedError?.message || succeededError?.message
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
    ...((succeededData || []) as ImageGenerationTaskRecord[])
      .filter(isPartialSucceededTask)
      .slice(0, partialLimit)
  ].sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  const latestAttemptsByTaskId = await getLatestAttemptsByTaskId(
    sb,
    rows.map((task) => task.id)
  );
  let queuedIndex = 0;
  const tasks = rows.map((task) => {
    const queuePosition = task.status === 'queued' ? ++queuedIndex : undefined;
    return toActiveTaskResponseItem(
      task,
      queuePosition,
      latestAttemptsByTaskId.get(task.id)
    );
  });
  const runningCount = rows.filter((task) => task.status === 'running').length;
  const failedCount = rows.filter((task) => task.status === 'failed').length;
  const partialSucceededCount = rows.filter(isPartialSucceededTask).length;

  return jsonResponse(
    {
      success: true,
      activeCount: tasks.length,
      maxConcurrency,
      runningCount,
      queuedCount: queuedIndex,
      failedCount,
      partialSucceededCount,
      tasks
    },
    corsHeaders
  );
}

export default async function handler(request: Request): Promise<Response> {
  const corsHeaders = {
    ...getCorsHeadersForRequest(request),
    'Cache-Control': 'no-store',
    'x-webtomind-image-task-runtime': 'cloudflare-worker'
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed' }, corsHeaders, 405);
  }

  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return jsonResponse({ error: '请先登录' }, corsHeaders, 401);
  }

  const sb = getSupabaseAdmin();
  if (!sb) {
    return jsonResponse({ error: 'Supabase not configured' }, corsHeaders, 500);
  }

  const url = new URL(request.url);
  if (url.searchParams.get('mode')?.trim() === 'active') {
    return handleActiveImageTasksRequest({
      sb,
      userId,
      limit: parseTaskListLimit(url.searchParams.get('limit')),
      corsHeaders
    });
  }

  const taskId =
    url.searchParams.get('id')?.trim() ||
    url.searchParams.get('taskId')?.trim();
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

  const attempts = await getAttemptsForTaskId(sb, taskId);
  return taskResponse(data as ImageGenerationTaskRecord, corsHeaders, attempts);
}
