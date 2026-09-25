import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '../utils/auth.js';
import {
  buildMediaMetadata,
  buildClientMediaUrls,
  createMediaStorageAdapter,
  createMediaStorageAdapters
} from '../utils/media-storage/index.js';
import {
  buildArkVideoCreateHttpRequest,
  getArkVideoApiBaseUrl,
  getArkVideoApiKey,
  getArkVideoStatusPath,
  normalizeArkVideoCreateResponse,
  normalizeArkVideoStatusResponse,
  type ArkVideoStatusResult
} from '../../src/shared/ark-video-api.js';
import {
  fetchModelWithTimeout,
  readResponseArrayBufferWithLimit
} from '../utils/model-fetch.js';
import { fetchTrustedRemoteWithTimeout } from '../utils/safe-remote-url.js';

type VideoTaskStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled';
type VideoTaskPhase = 'create' | 'poll';

interface VideoGenerationTaskRecord {
  id: string;
  user_id: string;
  status: VideoTaskStatus;
  provider: string;
  provider_task_id: string | null;
  request_payload: Record<string, unknown>;
  result_payload: Record<string, unknown> | null;
  error_message: string | null;
  refund_failed: boolean | null;
  generation_id: string | null;
  locked_until?: string | null;
  queue_message_count?: number | null;
  created_at: string;
  updated_at: string;
}

interface VideoGenerationRecord {
  id: string;
  task_id: string | null;
  video_url: string | null;
  poster_url: string | null;
  prompt: string;
  model_label: string;
  provider: string;
  provider_model: string;
  provider_task_id: string | null;
  aspect_ratio: string | null;
  duration: number | null;
  storage_bucket: string | null;
  storage_path: string | null;
  byte_size: number | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface VideoTaskRunnerResult {
  taskId: string;
  status: VideoTaskStatus;
  phase?: VideoTaskPhase;
  reenqueue?: {
    taskId: string;
    phase: VideoTaskPhase;
    delaySeconds: number;
  };
  generationId?: string;
  providerTaskId?: string | null;
  error?: string;
  refundFailed?: boolean;
}

const VIDEO_SIGNED_URL_EXPIRES_IN = 60 * 60 * 24;
const VIDEO_TASK_LEASE_SECONDS = 120;
const VIDEO_TASK_CLAIM_RETRY_DELAY_SECONDS = 5;
const MAX_PROVIDER_VIDEO_BYTES = 256 * 1024 * 1024;

function getGeneratedVideoBucket(): string {
  return process.env.GENERATED_VIDEO_BUCKET || 'user-generated-videos';
}

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function isCompletedStatus(status: string | undefined): boolean {
  return ['completed', 'complete', 'succeeded', 'success', 'done'].includes(
    (status || '').toLowerCase()
  );
}

function isFailedStatus(status: string | undefined): boolean {
  return [
    'failed',
    'error',
    'cancelled',
    'canceled',
    'rejected',
    'expired'
  ].includes((status || '').toLowerCase());
}

async function callArkVideoCreate(request: Record<string, unknown>) {
  const apiKey = getArkVideoApiKey();
  if (!apiKey) throw new Error('ARK_API_KEY is not configured');
  const apiBaseUrl = getArkVideoApiBaseUrl();

  const createInput = {
    prompt: String(request.prompt || ''),
    model: String(request.apiModel || request.model || ''),
    aspectRatio: String(request.aspectRatio || '16:9'),
    duration:
      typeof request.duration === 'number' && Number.isFinite(request.duration)
        ? request.duration
        : 5,
    referenceImageUrls: Array.isArray(request.referenceImageUrls)
      ? request.referenceImageUrls.filter(
          (item): item is string =>
            typeof item === 'string' && item.trim().length > 0
        )
      : [],
    referenceVideoUrls: Array.isArray(request.referenceVideoUrls)
      ? request.referenceVideoUrls.filter(
          (item): item is string =>
            typeof item === 'string' && item.trim().length > 0
        )
      : [],
    referenceAudioUrls: Array.isArray(request.referenceAudioUrls)
      ? request.referenceAudioUrls.filter(
          (item): item is string =>
            typeof item === 'string' && item.trim().length > 0
        )
      : [],
    firstFrameUrl:
      typeof request.firstFrameUrl === 'string'
        ? request.firstFrameUrl.trim()
        : '',
    lastFrameUrl:
      typeof request.lastFrameUrl === 'string'
        ? request.lastFrameUrl.trim()
        : '',
    referenceMode:
      request.referenceMode === 'first-last-frame'
        ? ('first-last-frame' as const)
        : ('reference' as const),
    resolution:
      typeof request.resolution === 'string' && request.resolution.trim()
        ? request.resolution.trim()
        : '720p',
    outputFormat:
      request.outputFormat === 'mov' ? ('mov' as const) : ('mp4' as const),
    generateAudio: request.generateAudio !== false,
    watermark: request.watermark === true,
    webSearch: request.webSearch === true,
    costEstimate: request.costEstimate as never
  };
  const createRequest = buildArkVideoCreateHttpRequest(createInput);
  const response = await fetchModelWithTimeout(
    `${apiBaseUrl}${createRequest.path}`,
    {
      method: createRequest.method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...(createRequest.headers || {})
      },
      ...(createRequest.body ? { body: createRequest.body } : {})
    },
    { timeoutMs: 45_000, label: 'Ark video create' }
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const body = getRecord(data);
    const error = getRecord(body.error);
    throw new Error(
      String(
        error.message ||
          body.message ||
          `Official video request failed with status ${response.status}`
      )
    );
  }
  return normalizeArkVideoCreateResponse(data);
}

async function callArkVideoStatus(providerTaskId: string) {
  const apiKey = getArkVideoApiKey();
  if (!apiKey) throw new Error('ARK_API_KEY is not configured');
  const response = await fetchModelWithTimeout(
    `${getArkVideoApiBaseUrl()}${getArkVideoStatusPath(providerTaskId)}`,
    { headers: { Authorization: `Bearer ${apiKey}` } },
    { timeoutMs: 20_000, label: 'Ark video status' }
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      `Official video status failed with status ${response.status}`
    );
  }
  return normalizeArkVideoStatusResponse(data);
}

function getPrepaidCredit(task: VideoGenerationTaskRecord): {
  consumed?: number;
  creditType?: string;
  creditBreakdown?: Record<string, number>;
} {
  const prepaid = getRecord(task.request_payload).prepaidCredit;
  return getRecord(prepaid) as {
    consumed?: number;
    creditType?: string;
    creditBreakdown?: Record<string, number>;
  };
}

async function refundVideoCredit(
  sb: SupabaseClient,
  task: VideoGenerationTaskRecord,
  metadata: Record<string, unknown>
): Promise<boolean> {
  const prepaid = getPrepaidCredit(task);
  if (!prepaid.consumed) return true;

  const refundMetadata = {
    ...metadata,
    taskId: task.id,
    billingDomain: 'video_task',
    billingPhase: 'refund',
    idempotency_key: `video_task:${task.id}:refund`,
    idempotencyKey: `video_task:${task.id}:refund`,
    providerTaskId: task.provider_task_id,
    creditBreakdown: prepaid.creditBreakdown
  };
  const { data, error } = await sb.rpc('refund_generation_credit', {
    p_user_id: task.user_id,
    p_amount: prepaid.consumed,
    p_credit_type: prepaid.creditType || 'bonus',
    p_source: `video_task:${task.id}:refund`,
    p_metadata: refundMetadata
  });

  if (error) {
    console.error('[VideoTaskRunner] refund_generation_credit failed:', error);
    const fallback = await sb.rpc('refund_image_generation_credit', {
      p_user_id: task.user_id,
      p_amount: prepaid.consumed,
      p_credit_type: prepaid.creditType || 'bonus',
      p_metadata: refundMetadata
    });
    return (
      !fallback.error &&
      (fallback.data as { success?: boolean })?.success !== false
    );
  }

  return (data as { success?: boolean } | null)?.success !== false;
}

function getRunnablePhase(task: VideoGenerationTaskRecord): VideoTaskPhase {
  return task.provider_task_id ? 'poll' : 'create';
}

async function claimVideoTaskLease(
  sb: SupabaseClient,
  task: VideoGenerationTaskRecord,
  phase: VideoTaskPhase
): Promise<
  { claimed: true } | { claimed: false; reason?: string; error?: string }
> {
  const { data, error } = await sb.rpc('claim_video_generation_task', {
    p_task_id: task.id,
    p_expected_phase: phase,
    p_expected_status: task.status,
    p_lease_seconds: VIDEO_TASK_LEASE_SECONDS
  });

  if (error) {
    const message =
      typeof error.message === 'string' ? error.message : 'claim RPC failed';
    console.error('[VideoTaskRunner] claim_video_generation_task failed:', {
      taskId: task.id,
      phase,
      message
    });
    return { claimed: false, error: message };
  }

  const payload = getRecord(data);
  if (payload.claimed === true) {
    return { claimed: true };
  }

  return {
    claimed: false,
    reason: typeof payload.reason === 'string' ? payload.reason : 'not_claimed'
  };
}

function deferAfterClaimMiss(
  task: VideoGenerationTaskRecord,
  phase: VideoTaskPhase,
  message?: string
): VideoTaskRunnerResult {
  const status: VideoTaskStatus =
    task.status === 'queued' ? 'queued' : 'running';
  return {
    taskId: task.id,
    status,
    phase,
    providerTaskId: task.provider_task_id,
    error: message,
    reenqueue: {
      taskId: task.id,
      phase,
      delaySeconds: VIDEO_TASK_CLAIM_RETRY_DELAY_SECONDS
    }
  };
}

function getVideoExtension(
  contentType: string | null,
  fallback: unknown
): string {
  if (contentType?.includes('webm')) return 'webm';
  if (contentType?.includes('quicktime')) return 'mov';
  if (fallback === 'webm') return 'webm';
  if (fallback === 'mov') return 'mov';
  return 'mp4';
}

async function storeProviderVideo(
  sb: SupabaseClient,
  task: VideoGenerationTaskRecord,
  videoUrl: string,
  options: { headers?: Record<string, string> } = {}
) {
  const response = await fetchTrustedRemoteWithTimeout(
    videoUrl,
    { headers: options.headers },
    30_000
  );
  if (!response.ok) {
    throw new Error(
      `Provider video download failed with status ${response.status}`
    );
  }

  const request = getRecord(task.request_payload);
  const contentType =
    response.headers.get('content-type') ||
    (request.outputFormat === 'mov'
      ? 'video/quicktime'
      : request.outputFormat === 'webm'
        ? 'video/webm'
        : 'video/mp4');
  if (
    !contentType.toLowerCase().startsWith('video/') &&
    !contentType.toLowerCase().startsWith('application/octet-stream')
  ) {
    throw new Error(
      `Provider video returned unsupported content type: ${contentType}`
    );
  }
  const bytes = await readResponseArrayBufferWithLimit(
    response,
    MAX_PROVIDER_VIDEO_BYTES,
    { timeoutMs: 90_000, label: 'provider video download' }
  );
  const extension = getVideoExtension(contentType, request.outputFormat);
  const key = `${task.user_id}/${task.id}/${crypto.randomUUID()}.${extension}`;
  const storage = createMediaStorageAdapter({
    supabase: sb,
    defaultBucket: getGeneratedVideoBucket()
  });

  const record = await storage.putObject({
    key,
    body: bytes,
    contentType,
    cacheControl: '31536000',
    byteSize: bytes.byteLength
  });
  const signedUrl = await storage.signReadUrl({
    locator: {
      provider: record.provider,
      bucket: record.bucket,
      key: record.key
    },
    expiresIn: VIDEO_SIGNED_URL_EXPIRES_IN,
    fallbackUrl: record.publicUrl
  });
  if (!signedUrl) {
    await storage.deleteObjects([
      {
        provider: record.provider,
        bucket: record.bucket,
        key: record.key
      }
    ]);
    throw new Error('Video signed URL failed: empty URL');
  }

  return {
    record,
    signedUrl,
    byteSize: bytes.byteLength
  };
}

export async function signVideoGeneration(
  sb: SupabaseClient,
  generation: VideoGenerationRecord
) {
  const mediaUrls = await buildClientMediaUrls(
    createMediaStorageAdapters({
      supabase: sb,
      defaultBucket: generation.storage_bucket || getGeneratedVideoBucket()
    }),
    generation.metadata,
    VIDEO_SIGNED_URL_EXPIRES_IN,
    { videoUrl: generation.video_url, posterUrl: generation.poster_url }
  );

  return {
    generationId: generation.id,
    taskId: generation.task_id,
    videoUrl: mediaUrls.videoUrl || generation.video_url || '',
    videoUrlExpiresIn: mediaUrls.videoUrlExpiresIn,
    posterUrl: mediaUrls.posterUrl || generation.poster_url || undefined,
    prompt: generation.prompt,
    provider: generation.provider,
    model: generation.provider_model,
    modelLabel: generation.model_label,
    providerTaskId: generation.provider_task_id,
    aspectRatio: generation.aspect_ratio,
    duration: generation.duration,
    storageBucket: generation.storage_bucket,
    storagePath: generation.storage_path,
    byteSize: generation.byte_size,
    metadata: generation.metadata || {},
    createdAt: generation.created_at
  };
}

async function finalizeCompletedTask(
  sb: SupabaseClient,
  task: VideoGenerationTaskRecord,
  providerStatus: ArkVideoStatusResult
): Promise<VideoTaskRunnerResult> {
  if (task.generation_id) {
    return {
      taskId: task.id,
      status: 'succeeded',
      generationId: task.generation_id,
      providerTaskId: task.provider_task_id
    };
  }
  if (!providerStatus.videoUrl) {
    throw new Error('Official video task completed without video_url');
  }

  const request = getRecord(task.request_payload);
  const stored = await storeProviderVideo(sb, task, providerStatus.videoUrl);
  const mediaMetadata = buildMediaMetadata({
    existing: {
      source: 'video_create_page',
      requestedModel: request.model,
      requestedApiModel: request.apiModel,
      referenceImageIds: request.referenceImageIds,
      referenceImageUrls: request.referenceImageUrls,
      referenceVideoUrls: request.referenceVideoUrls,
      referenceAudioUrls: request.referenceAudioUrls,
      firstFrameUrl: request.firstFrameUrl,
      lastFrameUrl: request.lastFrameUrl,
      watermark: request.watermark,
      webSearch: request.webSearch,
      outputFormat: request.outputFormat,
      providerStatus: providerStatus.raw,
      ...(providerStatus.completionTokens !== undefined
        ? { completionTokens: providerStatus.completionTokens }
        : {}),
      byteSize: stored.byteSize
    },
    storageProvider: stored.record.provider,
    original: {
      ...stored.record,
      byteSize: stored.byteSize
    }
  });

  const { data, error } = await sb
    .from('video_generations')
    .insert({
      user_id: task.user_id,
      task_id: task.id,
      video_url: stored.signedUrl,
      poster_url: providerStatus.previewImageUrl || null,
      prompt: String(request.prompt || ''),
      model_label:
        getRecord(request.costEstimate).modelLabel ||
        String(request.model || request.apiModel || ''),
      provider: 'volcengine_ark',
      provider_model: String(request.apiModel || request.model || ''),
      provider_task_id: task.provider_task_id,
      aspect_ratio:
        typeof request.aspectRatio === 'string' ? request.aspectRatio : null,
      duration: typeof request.duration === 'number' ? request.duration : null,
      storage_bucket: stored.record.bucket,
      storage_path: stored.record.key,
      byte_size: stored.byteSize,
      metadata: mediaMetadata
    })
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(
      `Video generation record create failed: ${error?.message || 'empty row'}`
    );
  }

  const generation = data as VideoGenerationRecord;
  const signedGeneration = await signVideoGeneration(sb, generation);
  const prepaid = getPrepaidCredit(task);
  const payload = {
    success: true,
    queued: true,
    taskId: task.id,
    status: 'succeeded',
    generation: signedGeneration,
    videoUrl: signedGeneration.videoUrl,
    videoUrlExpiresIn: signedGeneration.videoUrlExpiresIn,
    posterUrl: signedGeneration.posterUrl,
    provider: 'volcengine_ark',
    model: generation.provider_model,
    modelLabel: generation.model_label,
    aspectRatio: generation.aspect_ratio,
    duration: generation.duration,
    credits: {
      consumed: prepaid.consumed || 0,
      creditType: prepaid.creditType || 'bonus',
      creditBreakdown: prepaid.creditBreakdown
    }
  };

  await sb
    .from('video_generation_tasks')
    .update({
      status: 'succeeded',
      generation_id: generation.id,
      result_payload: payload,
      locked_until: null,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', task.id);

  return {
    taskId: task.id,
    status: 'succeeded',
    generationId: generation.id,
    providerTaskId: task.provider_task_id
  };
}

async function markTaskFailed(
  sb: SupabaseClient,
  task: VideoGenerationTaskRecord,
  message: string,
  metadata: Record<string, unknown>
): Promise<VideoTaskRunnerResult> {
  const refundSucceeded = await refundVideoCredit(sb, task, {
    ...metadata,
    errorMessage: message
  });
  await sb
    .from('video_generation_tasks')
    .update({
      status: 'failed',
      error_message: message,
      refund_failed: !refundSucceeded,
      locked_until: null,
      result_payload: {
        error: 'VIDEO_PROVIDER_FAILED',
        message,
        ...metadata
      },
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', task.id);

  return {
    taskId: task.id,
    status: 'failed',
    providerTaskId: task.provider_task_id,
    error: message,
    refundFailed: !refundSucceeded
  };
}

async function deferPollAfterTransientError(
  sb: SupabaseClient,
  task: VideoGenerationTaskRecord,
  message: string,
  phase: VideoTaskPhase
): Promise<VideoTaskRunnerResult> {
  const delaySeconds = 8;
  await sb
    .from('video_generation_tasks')
    .update({
      status: 'running',
      locked_until: null,
      last_attempt_at: new Date().toISOString(),
      next_poll_after: new Date(Date.now() + delaySeconds * 1000).toISOString(),
      result_payload: {
        ...(task.result_payload || {}),
        transientError: {
          phase,
          message,
          occurredAt: new Date().toISOString()
        }
      },
      updated_at: new Date().toISOString()
    })
    .eq('id', task.id);

  return {
    taskId: task.id,
    status: 'running',
    phase: 'poll',
    providerTaskId: task.provider_task_id,
    error: message,
    reenqueue: {
      taskId: task.id,
      phase: 'poll',
      delaySeconds
    }
  };
}

export async function runVideoGenerationTaskStep(input: {
  taskId: string;
  phase?: VideoTaskPhase;
}): Promise<VideoTaskRunnerResult> {
  const sb = getSupabaseAdmin();
  if (!sb) {
    throw new Error('Database admin not configured');
  }

  const { data, error } = await sb
    .from('video_generation_tasks')
    .select('*')
    .eq('id', input.taskId)
    .single();
  if (error || !data) {
    throw new Error(`Video task not found: ${input.taskId}`);
  }

  const task = data as VideoGenerationTaskRecord;
  if (
    task.status === 'succeeded' ||
    task.status === 'failed' ||
    task.status === 'cancelled'
  ) {
    return {
      taskId: task.id,
      status: task.status,
      generationId: task.generation_id || undefined,
      providerTaskId: task.provider_task_id
    };
  }

  const phase = getRunnablePhase(task);
  const claim = await claimVideoTaskLease(sb, task, phase);
  if (!claim.claimed) {
    return deferAfterClaimMiss(
      task,
      phase,
      claim.error ||
        (claim.reason ? `Video task claim skipped: ${claim.reason}` : undefined)
    );
  }

  try {
    if (!task.provider_task_id) {
      const providerTask = await callArkVideoCreate(
        getRecord(task.request_payload)
      );
      if (isFailedStatus(providerTask.status)) {
        return markTaskFailed(
          sb,
          {
            ...task,
            provider_task_id: providerTask.id || null
          },
          '视频生成提交失败',
          { providerTask: providerTask.raw }
        );
      }
      if (
        !providerTask.id &&
        !(isCompletedStatus(providerTask.status) && providerTask.videoUrl)
      ) {
        return markTaskFailed(
          sb,
          task,
          'Official video create response missing task id',
          {
            phase: 'create',
            providerTask: providerTask.raw
          }
        );
      }
      const providerCompleted =
        isCompletedStatus(providerTask.status) &&
        Boolean(providerTask.videoUrl);
      await sb
        .from('video_generation_tasks')
        .update({
          status: 'running',
          provider_task_id: providerTask.id || null,
          ...(providerCompleted ? {} : { locked_until: null }),
          last_attempt_at: new Date().toISOString(),
          result_payload: {
            ...(task.result_payload || {}),
            providerTask,
            contract: task.request_payload
          },
          updated_at: new Date().toISOString()
        })
        .eq('id', task.id);

      const nextTask = {
        ...task,
        status: 'running' as VideoTaskStatus,
        provider_task_id: providerTask.id || null,
        result_payload: {
          ...(task.result_payload || {}),
          providerTask,
          contract: task.request_payload
        }
      };
      if (providerCompleted) {
        return finalizeCompletedTask(sb, nextTask, {
          ...providerTask
        });
      }
      return {
        taskId: task.id,
        status: 'running',
        phase: 'poll',
        providerTaskId: providerTask.id,
        reenqueue: {
          taskId: task.id,
          phase: 'poll',
          delaySeconds: 5
        }
      };
    }

    const providerStatus = await callArkVideoStatus(task.provider_task_id);
    if (isCompletedStatus(providerStatus.status)) {
      return finalizeCompletedTask(sb, task, providerStatus);
    }
    if (isFailedStatus(providerStatus.status)) {
      return markTaskFailed(
        sb,
        task,
        providerStatus.errorMessage || '视频生成失败',
        { providerStatus: providerStatus.raw }
      );
    }

    await sb
      .from('video_generation_tasks')
      .update({
        status: 'running',
        locked_until: null,
        last_attempt_at: new Date().toISOString(),
        next_poll_after: new Date(Date.now() + 5000).toISOString(),
        result_payload: {
          ...(task.result_payload || {}),
          providerStatus
        },
        updated_at: new Date().toISOString()
      })
      .eq('id', task.id);

    return {
      taskId: task.id,
      status: 'running',
      phase: 'poll',
      providerTaskId: task.provider_task_id,
      reenqueue: {
        taskId: task.id,
        phase: 'poll',
        delaySeconds: 5
      }
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : '视频任务执行失败';
    const failurePhase: VideoTaskPhase =
      input.phase || (!task.provider_task_id ? 'create' : 'poll');
    if (task.provider_task_id && failurePhase === 'poll') {
      return deferPollAfterTransientError(sb, task, message, failurePhase);
    }
    return markTaskFailed(sb, task, message, {
      phase: failurePhase
    });
  }
}
