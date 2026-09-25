import { SupabaseClient } from '@supabase/supabase-js';
import {
  getCorsHeadersForRequest,
  getSupabaseAdmin,
  getUserIdFromRequest
} from '../utils/auth.js';
import {
  buildClientMediaUrls,
  createMediaStorageAdapters
} from '../utils/media-storage/index.js';
import {
  getArkVideoApiBaseUrl,
  getArkVideoApiKey,
  getArkVideoStatusPath,
  normalizeArkVideoStatusResponse,
  type ArkVideoStatusResult
} from '../../src/shared/ark-video-api.js';
import { describeVideoTaskFailure } from '../../src/shared/video-task-failure.js';

export const config = { runtime: 'edge' };

type VideoTaskStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

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
  poster_storage_path: string | null;
  byte_size: number | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

const VIDEO_SIGNED_URL_EXPIRES_IN = 60 * 60 * 24;

function getGeneratedVideoBucket(): string {
  return typeof process !== 'undefined'
    ? process.env.GENERATED_VIDEO_BUCKET || 'user-generated-videos'
    : 'user-generated-videos';
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

function buildStatusUrl(taskId: string): string {
  return `${getArkVideoApiBaseUrl()}${getArkVideoStatusPath(taskId)}`;
}

async function callArkVideoStatus(providerTaskId: string) {
  const apiKey = getArkVideoApiKey();
  if (!apiKey) {
    throw new Error('ARK_API_KEY is not configured');
  }

  const response = await fetch(buildStatusUrl(providerTaskId), {
    method: 'GET',
    headers: { Authorization: `Bearer ${apiKey}` }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      `Official video status failed with status ${response.status}`
    );
  }
  return normalizeArkVideoStatusResponse(data);
}

function isCompletedStatus(status: string | undefined): boolean {
  return ['completed', 'complete', 'succeeded', 'success', 'done'].includes(
    (status || '').toLowerCase()
  );
}

function isFailedStatus(status: string | undefined): boolean {
  return ['failed', 'error', 'cancelled', 'canceled', 'rejected'].includes(
    (status || '').toLowerCase()
  );
}

function getRequestRecord(
  task: VideoGenerationTaskRecord
): Record<string, unknown> {
  return task.request_payload && typeof task.request_payload === 'object'
    ? task.request_payload
    : {};
}

function getPrepaidCredit(task: VideoGenerationTaskRecord): {
  consumed?: number;
  creditType?: string;
  creditBreakdown?: Record<string, number>;
} {
  const prepaid = getRequestRecord(task).prepaidCredit;
  return prepaid && typeof prepaid === 'object'
    ? (prepaid as {
        consumed?: number;
        creditType?: string;
        creditBreakdown?: Record<string, number>;
      })
    : {};
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
    console.error('[VideoTask] refund_generation_credit failed:', error);
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
  videoUrl: string
): Promise<{
  bucket: string;
  path: string;
  signedUrl: string;
  byteSize: number;
}> {
  const response = await fetch(videoUrl);
  if (!response.ok) {
    throw new Error(
      `Provider video download failed with status ${response.status}`
    );
  }

  const contentType =
    response.headers.get('content-type') ||
    (getRequestRecord(task).outputFormat === 'mov'
      ? 'video/quicktime'
      : getRequestRecord(task).outputFormat === 'webm'
        ? 'video/webm'
        : 'video/mp4');
  const bytes = await response.arrayBuffer();
  const extension = getVideoExtension(
    contentType,
    getRequestRecord(task).outputFormat
  );
  const storagePath = `${task.user_id}/${task.id}/${crypto.randomUUID()}.${extension}`;

  const { error: uploadError } = await sb.storage
    .from(getGeneratedVideoBucket())
    .upload(storagePath, new Blob([bytes], { type: contentType }), {
      contentType,
      upsert: false
    });

  if (uploadError) {
    throw new Error(`Video storage upload failed: ${uploadError.message}`);
  }

  const { data, error: signedUrlError } = await sb.storage
    .from(getGeneratedVideoBucket())
    .createSignedUrl(storagePath, VIDEO_SIGNED_URL_EXPIRES_IN);

  if (signedUrlError || !data?.signedUrl) {
    await sb.storage.from(getGeneratedVideoBucket()).remove([storagePath]);
    throw new Error(
      `Video signed URL failed: ${signedUrlError?.message || 'empty URL'}`
    );
  }

  return {
    bucket: getGeneratedVideoBucket(),
    path: storagePath,
    signedUrl: data.signedUrl,
    byteSize: bytes.byteLength
  };
}

async function signVideoGeneration(
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
    model: generation.provider_model,
    modelLabel: generation.model_label,
    aspectRatio: generation.aspect_ratio,
    duration: generation.duration,
    storageBucket: generation.storage_bucket,
    storagePath: generation.storage_path,
    byteSize: generation.byte_size,
    createdAt: generation.created_at
  };
}

async function getStoredGenerationPayload(
  sb: SupabaseClient,
  task: VideoGenerationTaskRecord
) {
  if (!task.generation_id) return null;
  const { data, error } = await sb
    .from('video_generations')
    .select('*')
    .eq('id', task.generation_id)
    .eq('user_id', task.user_id)
    .single();
  if (error || !data) return null;
  return signVideoGeneration(sb, data as VideoGenerationRecord);
}

async function finalizeCompletedTask(
  sb: SupabaseClient,
  task: VideoGenerationTaskRecord,
  providerStatus: ArkVideoStatusResult
) {
  if (!providerStatus.videoUrl) {
    throw new Error('Official video task completed without video_url');
  }

  const request = getRequestRecord(task);
  const stored = await storeProviderVideo(sb, task, providerStatus.videoUrl);
  const { data, error } = await sb
    .from('video_generations')
    .insert({
      user_id: task.user_id,
      task_id: task.id,
      video_url: stored.signedUrl,
      poster_url: providerStatus.previewImageUrl || null,
      prompt: String(request.prompt || ''),
      model_label:
        (request.costEstimate as { modelLabel?: string } | undefined)
          ?.modelLabel || String(request.model || request.apiModel || ''),
      provider: 'volcengine_ark',
      provider_model: String(request.apiModel || request.model || ''),
      provider_task_id: task.provider_task_id,
      aspect_ratio:
        typeof request.aspectRatio === 'string' ? request.aspectRatio : null,
      duration: typeof request.duration === 'number' ? request.duration : null,
      storage_bucket: stored.bucket,
      storage_path: stored.path,
      byte_size: stored.byteSize,
      metadata: {
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
          : {})
      }
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
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', task.id);

  return payload;
}

function pendingResponse(task: VideoGenerationTaskRecord) {
  return {
    success: true,
    queued: true,
    taskId: task.id,
    status: task.status === 'queued' ? 'queued' : 'running',
    pollAfterMs: 5000
  };
}

export default async function handler(request: Request) {
  const corsHeaders = getCorsHeadersForRequest(request);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed' }, corsHeaders, 405);
  }

  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return jsonResponse({ error: 'Unauthorized' }, corsHeaders, 401);
  }

  const sb = getSupabaseAdmin();
  if (!sb) {
    return jsonResponse(
      { error: 'Database admin not configured' },
      corsHeaders,
      500
    );
  }

  const url = new URL(request.url);
  const taskId = (
    url.searchParams.get('id') ||
    url.searchParams.get('taskId') ||
    ''
  ).trim();
  if (!taskId) {
    return jsonResponse(
      { error: 'missing task id', message: '请提供要查询的视频任务 ID。' },
      corsHeaders,
      400
    );
  }

  const { data, error } = await sb
    .from('video_generation_tasks')
    .select('*')
    .eq('id', taskId)
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    return jsonResponse({ error: 'TASK_NOT_FOUND' }, corsHeaders, 404);
  }

  const task = data as VideoGenerationTaskRecord;

  if (task.status === 'succeeded') {
    const generation = await getStoredGenerationPayload(sb, task);
    return jsonResponse(
      generation
        ? {
            ...(task.result_payload || {}),
            success: true,
            queued: true,
            taskId: task.id,
            status: 'succeeded',
            generation,
            videoUrl: generation.videoUrl,
            videoUrlExpiresIn: generation.videoUrlExpiresIn
          }
        : {
            success: true,
            taskId: task.id,
            status: 'succeeded'
          },
      corsHeaders
    );
  }

  if (task.status === 'failed') {
    const failure = describeVideoTaskFailure(
      task.error_message,
      task.result_payload,
      task.request_payload
    );
    return jsonResponse(
      {
        success: false,
        queued: true,
        taskId: task.id,
        status: 'failed',
        error: failure.message,
        code: failure.code,
        requestId: failure.requestId,
        retryable: failure.retryable,
        details: task.refund_failed
          ? '本次积分退款未完成，请联系管理员协助处理。'
          : '本次扣除的积分已自动退回。',
        refundFailed: Boolean(task.refund_failed)
      },
      corsHeaders
    );
  }

  if (!task.provider_task_id) {
    return jsonResponse(pendingResponse(task), corsHeaders);
  }

  if ((process.env.VIDEO_QUEUE_PROVIDER || 'cloudflare') !== 'legacy') {
    return jsonResponse(pendingResponse(task), corsHeaders);
  }

  try {
    const providerStatus = await callArkVideoStatus(task.provider_task_id);
    if (isCompletedStatus(providerStatus.status)) {
      const payload = await finalizeCompletedTask(sb, task, providerStatus);
      return jsonResponse(payload, corsHeaders);
    }

    if (isFailedStatus(providerStatus.status)) {
      const failure = describeVideoTaskFailure(
        providerStatus.errorMessage,
        { providerStatus: providerStatus.raw },
        task.request_payload
      );
      const refundSucceeded = await refundVideoCredit(sb, task, {
        providerStatus: providerStatus.raw,
        errorMessage: providerStatus.errorMessage
      });
      await sb
        .from('video_generation_tasks')
        .update({
          status: 'failed',
          error_message: providerStatus.errorMessage || failure.message,
          refund_failed: !refundSucceeded,
          result_payload: {
            error: 'VIDEO_PROVIDER_FAILED',
            providerStatus
          },
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', task.id);

      return jsonResponse(
        {
          success: false,
          queued: true,
          taskId: task.id,
          status: 'failed',
          error: failure.message,
          code: failure.code,
          requestId: failure.requestId,
          retryable: failure.retryable,
          details: refundSucceeded
            ? '本次扣除的积分已自动退回。'
            : '本次积分退款未完成，请联系管理员协助处理。',
          refundFailed: !refundSucceeded
        },
        corsHeaders
      );
    }

    await sb
      .from('video_generation_tasks')
      .update({
        result_payload: {
          ...(task.result_payload || {}),
          providerStatus
        },
        updated_at: new Date().toISOString()
      })
      .eq('id', task.id);

    return jsonResponse(pendingResponse(task), corsHeaders);
  } catch {
    return jsonResponse(
      {
        success: true,
        queued: true,
        taskId: task.id,
        status: 'running',
        pollAfterMs: 8000,
        warning: '视频任务状态暂时不可用。'
      },
      corsHeaders,
      202
    );
  }
}
