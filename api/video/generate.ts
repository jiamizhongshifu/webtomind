import {
  getCorsHeadersForRequest,
  getSupabaseAdmin,
  getUserIdFromRequest
} from '../utils/auth.js';
import {
  getSeedanceVideoModelConfig,
  type SeedanceVideoOutputFormat,
  type SeedanceVideoResolution
} from '../../src/shared/seedance-video-models.js';
import { estimateVideoGenerationCreditCost } from '../../src/shared/video-generation-pricing.js';
import { describeVideoTaskFailure } from '../../src/shared/video-task-failure.js';
import {
  buildArkVideoCreateHttpRequest,
  getArkVideoApiBaseUrl,
  getArkVideoApiKey,
  isArkVideoGenerationAvailable,
  normalizeArkVideoCreateResponse
} from '../../src/shared/ark-video-api.js';
import { fetchModelWithTimeout } from '../utils/model-fetch.js';
import { validateHttpsRemoteUrl } from '../utils/safe-remote-url.js';
import {
  consumeModelRateLimit,
  createModelRateLimitResponse
} from '../utils/model-rate-limit.js';

export const config = { runtime: 'edge' };

export interface VideoGenerateRequest {
  prompt?: string;
  model?: string;
  aspectRatio?: string;
  duration?: number;
  resolution?: string;
  generateAudio?: boolean;
  referenceMode?: 'reference' | 'first-last-frame';
  referenceImageIds?: string[];
  referenceImageUrls?: string[];
  referenceVideoUrls?: string[];
  referenceVideoDurations?: number[];
  referenceAudioUrls?: string[];
  firstFrameUrl?: string;
  lastFrameUrl?: string;
  watermark?: boolean;
  webSearch?: boolean;
  outputFormat?: 'mp4' | 'mov' | 'webm';
  async?: boolean;
}

export interface VideoGenerateContract {
  prompt: string;
  model: string;
  apiModel: string;
  aspectRatio: string;
  duration: number;
  resolution: SeedanceVideoResolution;
  generateAudio: boolean;
  referenceMode: 'reference' | 'first-last-frame';
  referenceImageIds: string[];
  referenceImageUrls: string[];
  referenceVideoUrls: string[];
  referenceVideoDurations: number[];
  referenceAudioUrls: string[];
  firstFrameUrl: string;
  lastFrameUrl: string;
  watermark: boolean;
  webSearch: boolean;
  outputFormat: SeedanceVideoOutputFormat;
  async: boolean;
  costEstimate: ReturnType<typeof estimateVideoGenerationCreditCost>;
}

interface VideoCreditCharge {
  consumed: number;
  creditType: string;
  creditBreakdown?: Record<string, number>;
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

function normalizeOutputFormat(
  format: unknown,
  supportedFormats: SeedanceVideoOutputFormat[],
  fallback: SeedanceVideoOutputFormat
): SeedanceVideoOutputFormat | null {
  const normalized = String(format || '')
    .trim()
    .toLowerCase();
  if (!normalized || normalized === 'webm') return fallback;
  return supportedFormats.includes(normalized as SeedanceVideoOutputFormat)
    ? (normalized as SeedanceVideoOutputFormat)
    : null;
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is string =>
          typeof item === 'string' && item.trim().length > 0
      )
    : [];
}

function normalizeNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (item): item is number =>
        typeof item === 'number' && Number.isFinite(item) && item >= 0
    )
    .map((item) => Number(item));
}

function normalizeVideoResolution(
  value: unknown,
  supportedResolutions: SeedanceVideoResolution[],
  fallback: SeedanceVideoResolution
): SeedanceVideoResolution {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  return supportedResolutions.includes(normalized as SeedanceVideoResolution)
    ? (normalized as SeedanceVideoResolution)
    : fallback;
}

export function buildVideoGenerateContract(
  body: VideoGenerateRequest
):
  | { ok: true; value: VideoGenerateContract }
  | { ok: false; status: number; body: Record<string, unknown> } {
  const prompt = (body.prompt || '').trim();
  if (!prompt) {
    return {
      ok: false,
      status: 400,
      body: {
        error: 'missing prompt',
        message: '请先输入视频生成提示词。'
      }
    };
  }
  if (prompt.length > 12_000) {
    return {
      ok: false,
      status: 400,
      body: {
        error: 'prompt too long',
        message: '视频提示词不能超过 12000 个字符。'
      }
    };
  }

  const model = getSeedanceVideoModelConfig(body.model, process.env);
  if (model.status === 'unavailable') {
    return {
      ok: false,
      status: 503,
      body: {
        error: 'model unavailable',
        message: `${model.label} 当前暂未开放，请选择其他可用模型。`,
        model: model.id
      }
    };
  }
  const resolution = normalizeVideoResolution(
    body.resolution,
    model.supportedResolutions,
    model.defaultResolution
  );
  const apiModel = model.apiModel;
  const outputFormat = normalizeOutputFormat(
    body.outputFormat,
    model.supportedOutputFormats,
    model.defaultOutputFormat
  );
  if (!outputFormat) {
    return {
      ok: false,
      status: 400,
      body: {
        error: 'unsupported output format',
        message: `${model.label} 暂不支持 ${body.outputFormat} 输出格式。`,
        supportedOutputFormats: model.supportedOutputFormats
      }
    };
  }
  const aspectRatio = body.aspectRatio || model.defaultAspectRatio;
  if (!model.supportedAspectRatios.includes(aspectRatio)) {
    return {
      ok: false,
      status: 400,
      body: {
        error: 'unsupported aspect ratio',
        message: `${model.label} 暂不支持 ${aspectRatio} 比例。`,
        supportedAspectRatios: model.supportedAspectRatios
      }
    };
  }

  const duration = body.duration || model.defaultDuration;
  if (!model.supportedDurations.includes(duration)) {
    return {
      ok: false,
      status: 400,
      body: {
        error: 'unsupported duration',
        message: `${model.label} 暂不支持 ${duration} 秒视频。`,
        supportedDurations: model.supportedDurations
      }
    };
  }

  const referenceImageIds = normalizeStringArray(body.referenceImageIds);
  const incomingReferenceImageUrls = normalizeStringArray(
    body.referenceImageUrls
  );
  const referenceVideoUrls = normalizeStringArray(body.referenceVideoUrls);
  const referenceVideoDurations = normalizeNumberArray(
    body.referenceVideoDurations
  )
    .slice(0, model.maxReferenceVideos)
    .map((seconds) =>
      Math.min(Math.max(0, seconds), model.maxReferenceMediaDurationSeconds)
    );
  const referenceAudioUrls = normalizeStringArray(body.referenceAudioUrls);
  let firstFrameUrl =
    typeof body.firstFrameUrl === 'string' ? body.firstFrameUrl.trim() : '';
  let lastFrameUrl =
    typeof body.lastFrameUrl === 'string' ? body.lastFrameUrl.trim() : '';
  let referenceImageUrls = incomingReferenceImageUrls;

  try {
    [
      ...incomingReferenceImageUrls,
      ...referenceVideoUrls,
      ...referenceAudioUrls,
      firstFrameUrl,
      lastFrameUrl
    ]
      .filter(Boolean)
      .forEach((url) => validateHttpsRemoteUrl(url));
  } catch {
    return {
      ok: false,
      status: 400,
      body: {
        error: 'untrusted reference URL',
        message: '参考素材地址无效或来源不受信任。'
      }
    };
  }

  // Backward compatibility for clients that used one ordered list for frames.
  if (
    body.referenceMode === 'first-last-frame' &&
    !firstFrameUrl &&
    !lastFrameUrl
  ) {
    if (incomingReferenceImageUrls.length > 2) {
      return {
        ok: false,
        status: 400,
        body: {
          error: 'too many first-last frame references',
          message: '首尾帧模式最多支持首帧和尾帧 2 张图片。',
          maxReferenceImages: 2
        }
      };
    }
    [firstFrameUrl = '', lastFrameUrl = ''] = incomingReferenceImageUrls;
    referenceImageUrls = [];
  }

  const referenceImageCount = Math.max(
    referenceImageIds.length,
    referenceImageUrls.length
  );
  const frameImageCount =
    Number(Boolean(firstFrameUrl)) + Number(Boolean(lastFrameUrl));
  const totalImageCount = referenceImageCount + frameImageCount;
  const referenceMediaCount =
    referenceImageCount + referenceVideoUrls.length + referenceAudioUrls.length;
  const referenceMode = frameImageCount > 0 ? 'first-last-frame' : 'reference';

  if (lastFrameUrl && !firstFrameUrl) {
    return {
      ok: false,
      status: 400,
      body: {
        error: 'missing first frame',
        message: '使用尾帧前需要先添加首帧。'
      }
    };
  }
  if (frameImageCount > 0 && referenceMediaCount > 0) {
    return {
      ok: false,
      status: 400,
      body: {
        error: 'incompatible reference modes',
        message: '严格首尾帧与普通图片、视频、音频参考不可同时使用。'
      }
    };
  }
  if (totalImageCount > 0 && !model.supportsImageToVideo) {
    return {
      ok: false,
      status: 400,
      body: {
        error: 'model does not support image to video',
        message: `${model.label} 暂不支持参考图生成视频。`
      }
    };
  }
  if (referenceImageCount > model.maxReferenceImages) {
    return {
      ok: false,
      status: 400,
      body: {
        error: 'too many reference images',
        message: `${model.label} 最多支持 ${model.maxReferenceImages} 张参考图。`,
        maxReferenceImages: model.maxReferenceImages
      }
    };
  }
  if (referenceVideoUrls.length > 0 && !model.supportsReferenceVideo) {
    return {
      ok: false,
      status: 400,
      body: {
        error: 'model does not support reference video',
        message: `${model.label} 暂不支持参考视频。`
      }
    };
  }
  if (referenceVideoUrls.length > model.maxReferenceVideos) {
    return {
      ok: false,
      status: 400,
      body: {
        error: 'too many reference videos',
        message: `${model.label} 最多支持 ${model.maxReferenceVideos} 个参考视频。`,
        maxReferenceVideos: model.maxReferenceVideos
      }
    };
  }
  if (referenceAudioUrls.length > 0 && !model.supportsReferenceAudio) {
    return {
      ok: false,
      status: 400,
      body: {
        error: 'model does not support reference audio',
        message: `${model.label} 暂不支持参考音频。`
      }
    };
  }
  if (referenceAudioUrls.length > model.maxReferenceAudios) {
    return {
      ok: false,
      status: 400,
      body: {
        error: 'too many reference audios',
        message: `${model.label} 最多支持 ${model.maxReferenceAudios} 个参考音频。`,
        maxReferenceAudios: model.maxReferenceAudios
      }
    };
  }
  if (
    referenceAudioUrls.length > 0 &&
    referenceMediaCount === referenceAudioUrls.length
  ) {
    return {
      ok: false,
      status: 400,
      body: {
        error: 'audio-only reference is unsupported',
        message: '参考音频不能单独使用，请至少添加 1 张参考图或 1 个参考视频。'
      }
    };
  }
  const webSearch = body.webSearch === true;
  if (webSearch && (referenceMediaCount > 0 || frameImageCount > 0)) {
    return {
      ok: false,
      status: 400,
      body: {
        error: 'web search requires text only',
        message: '联网搜索仅支持纯文本生成，添加参考素材或首尾帧后不可开启。'
      }
    };
  }

  return {
    ok: true,
    value: {
      prompt,
      model: model.id,
      apiModel,
      aspectRatio,
      duration,
      resolution,
      generateAudio:
        model.supportsGenerateAudio && body.generateAudio !== false,
      referenceMode,
      referenceImageIds,
      referenceImageUrls,
      referenceVideoUrls,
      referenceVideoDurations,
      referenceAudioUrls,
      firstFrameUrl,
      lastFrameUrl,
      watermark: body.watermark === true,
      webSearch,
      outputFormat,
      async: body.async !== false,
      costEstimate: estimateVideoGenerationCreditCost({
        model: model.id,
        duration,
        resolution,
        // 官方计费中只有“输入包含视频”会额外增加 token 用量：
        // 参考图 / 首尾帧图 / 参考音频不计费，参考视频收取固定附加费。
        referenceImageCount: totalImageCount,
        referenceVideoCount: referenceVideoUrls.length,
        referenceVideoDurations,
        referenceAudioCount: referenceAudioUrls.length
      })
    }
  };
}

async function callArkVideoCreate(contract: VideoGenerateContract) {
  const apiKey = getArkVideoApiKey();
  if (!apiKey) {
    throw new Error('ARK_API_KEY is not configured');
  }

  const apiBaseUrl = getArkVideoApiBaseUrl();
  const createRequest = buildArkVideoCreateHttpRequest({
    prompt: contract.prompt,
    model: contract.apiModel,
    aspectRatio: contract.aspectRatio,
    duration: contract.duration,
    resolution: contract.resolution,
    outputFormat: contract.outputFormat,
    referenceMode:
      contract.referenceMode === 'first-last-frame'
        ? 'first-last-frame'
        : 'reference',
    referenceImageUrls: contract.referenceImageUrls,
    referenceVideoUrls: contract.referenceVideoUrls,
    referenceAudioUrls: contract.referenceAudioUrls,
    firstFrameUrl: contract.firstFrameUrl,
    lastFrameUrl: contract.lastFrameUrl,
    generateAudio: contract.generateAudio,
    watermark: contract.watermark,
    webSearch: contract.webSearch,
    costEstimate: contract.costEstimate
  });

  const response = await fetchModelWithTimeout(
    `${apiBaseUrl}${createRequest.path}`,
    {
      method: createRequest.method || 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...(createRequest.headers || {})
      },
      ...(createRequest.body ? { body: createRequest.body } : {})
    },
    { timeoutMs: 45_000, label: 'Ark video create' }
  );

  const text = await response.text();
  let data: unknown = text;
  try {
    data = text ? JSON.parse(text) : '';
  } catch {
    data = text;
  }
  if (!response.ok) {
    const body =
      data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
    const providerError =
      body.error && typeof body.error === 'object'
        ? (body.error as Record<string, unknown>)
        : {};
    const message =
      typeof body.error === 'string'
        ? body.error
        : typeof providerError.message === 'string'
          ? providerError.message
          : typeof body.message === 'string'
            ? body.message
            : text.trim()
              ? text.trim().slice(0, 500)
              : `Official video request failed with status ${response.status}`;
    throw new Error(message);
  }

  return normalizeArkVideoCreateResponse(data);
}

function buildVideoCreditMetadata(contract: VideoGenerateContract) {
  return {
    dynamicCredits: contract.costEstimate.cost,
    allowDynamicCostAboveMax: true,
    model: contract.model,
    modelLabel: contract.costEstimate.modelLabel,
    requestedApiModel: contract.apiModel,
    duration: contract.duration,
    resolution: contract.resolution,
    generateAudio: contract.generateAudio,
    aspectRatio: contract.aspectRatio,
    referenceImageCount:
      Math.max(
        contract.referenceImageIds.length,
        contract.referenceImageUrls.length
      ) +
      Number(Boolean(contract.firstFrameUrl)) +
      Number(Boolean(contract.lastFrameUrl)),
    referenceAssetCount:
      Math.max(
        contract.referenceImageIds.length,
        contract.referenceImageUrls.length
      ) +
      contract.referenceVideoUrls.length +
      contract.referenceAudioUrls.length,
    referenceVideoCount: contract.referenceVideoUrls.length,
    referenceVideoDurations: contract.referenceVideoDurations,
    referenceAudioCount: contract.referenceAudioUrls.length,
    firstFrameAttached: Boolean(contract.firstFrameUrl),
    lastFrameAttached: Boolean(contract.lastFrameUrl),
    watermark: contract.watermark,
    webSearch: contract.webSearch,
    referenceMode: contract.referenceMode,
    billingModelMultiplier: contract.costEstimate.modelMultiplier,
    billingModelAdjustment: contract.costEstimate.modelAdjustment,
    billingResolutionMultiplier: contract.costEstimate.resolutionMultiplier,
    billingResolutionAdjustment: contract.costEstimate.resolutionAdjustment,
    billingBaseCost: contract.costEstimate.baseCost,
    billingReferenceAdjustment: contract.costEstimate.referenceAdjustment,
    source: 'video_create_page'
  };
}

async function consumeVideoCredit(
  userId: string,
  contract: VideoGenerateContract
): Promise<
  | { ok: true; charge: VideoCreditCharge }
  | { ok: false; status: number; body: Record<string, unknown> }
> {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return {
      ok: false,
      status: 500,
      body: { error: 'Credit service is not configured' }
    };
  }

  const { data, error } = await admin.rpc('consume_credits', {
    p_user_id: userId,
    p_action: 'video_generation',
    p_metadata: buildVideoCreditMetadata(contract)
  });

  if (error) {
    console.error('[VideoGenerate] consume_credits RPC error:', error);
    return {
      ok: false,
      status: 500,
      body: {
        error: 'CREDIT_CONSUME_FAILED',
        message: '积分扣减失败，请稍后再试。'
      }
    };
  }

  const result = data as {
    success?: boolean;
    error?: string;
    required?: number;
    current?: number;
    consumed?: number;
    credit_type?: string;
    credit_breakdown?: Record<string, number>;
  };
  if (result?.success === false) {
    const isInsufficient =
      result.error === 'INSUFFICIENT_CREDITS' ||
      result.error === 'INSUFFICIENT_MEDIA_CREDITS';
    return {
      ok: false,
      status: isInsufficient ? 402 : 400,
      body: {
        error: result.error || 'CREDIT_CONSUME_REJECTED',
        message:
          result.error === 'INSUFFICIENT_MEDIA_CREDITS'
            ? '媒体积分不足，请充值媒体积分后再试。'
            : result.error === 'INSUFFICIENT_CREDITS'
              ? '积分不足，请充值后再试。'
              : '积分扣减失败，请稍后再试。',
        details: result
      }
    };
  }

  const consumed = Number(result?.consumed || 0);
  if (!consumed) {
    return {
      ok: false,
      status: 500,
      body: {
        error: 'CREDIT_CONSUME_EMPTY',
        message: '积分扣减结果异常，请稍后再试。'
      }
    };
  }

  return {
    ok: true,
    charge: {
      consumed,
      creditType: result?.credit_type || 'bonus',
      creditBreakdown: result?.credit_breakdown
    }
  };
}

async function refundVideoCredit(
  userId: string,
  charge: VideoCreditCharge | null,
  metadata: Record<string, unknown>
): Promise<boolean> {
  if (!charge?.consumed) return true;
  const admin = getSupabaseAdmin();
  if (!admin) return false;

  const refundMetadata = {
    ...metadata,
    ...(metadata.taskId
      ? {
          billingDomain: 'video_task',
          billingPhase: 'refund',
          idempotency_key: `video_task:${metadata.taskId}:refund`,
          idempotencyKey: `video_task:${metadata.taskId}:refund`
        }
      : {}),
    creditBreakdown: charge.creditBreakdown
  };
  const { data, error } = await admin.rpc('refund_generation_credit', {
    p_user_id: userId,
    p_amount: charge.consumed,
    p_credit_type: charge.creditType || 'bonus',
    p_source:
      typeof metadata.taskId === 'string' && metadata.taskId
        ? `video_task:${metadata.taskId}:refund`
        : 'video_generation_refund',
    p_metadata: refundMetadata
  });

  if (error) {
    console.error('[VideoGenerate] refund_generation_credit failed:', error);
    const fallback = await admin.rpc('refund_image_generation_credit', {
      p_user_id: userId,
      p_amount: charge.consumed,
      p_credit_type: charge.creditType || 'bonus',
      p_metadata: refundMetadata
    });
    return (
      !fallback.error &&
      (fallback.data as { success?: boolean })?.success !== false
    );
  }

  return (data as { success?: boolean } | null)?.success !== false;
}

async function createVideoTask(
  userId: string,
  contract: VideoGenerateContract,
  charge: VideoCreditCharge,
  status: 'queued' | 'running' = 'queued'
): Promise<string> {
  const admin = getSupabaseAdmin();
  if (!admin) {
    throw new Error('Database admin is not configured');
  }

  const { data, error } = await admin
    .from('video_generation_tasks')
    .insert({
      user_id: userId,
      status,
      provider: 'volcengine_ark',
      started_at: status === 'running' ? new Date().toISOString() : null,
      request_payload: {
        prompt: contract.prompt,
        model: contract.model,
        apiModel: contract.apiModel,
        aspectRatio: contract.aspectRatio,
        duration: contract.duration,
        resolution: contract.resolution,
        generateAudio: contract.generateAudio,
        referenceMode: contract.referenceMode,
        referenceImageIds: contract.referenceImageIds,
        referenceImageUrls: contract.referenceImageUrls,
        referenceVideoUrls: contract.referenceVideoUrls,
        referenceAudioUrls: contract.referenceAudioUrls,
        firstFrameUrl: contract.firstFrameUrl,
        lastFrameUrl: contract.lastFrameUrl,
        watermark: contract.watermark,
        webSearch: contract.webSearch,
        outputFormat: contract.outputFormat,
        async: contract.async,
        costEstimate: contract.costEstimate,
        prepaidCredit: {
          consumed: charge.consumed,
          creditType: charge.creditType,
          creditBreakdown: charge.creditBreakdown
        }
      }
    })
    .select('id')
    .single();

  if (error || !data?.id) {
    throw new Error(
      `Video generation task create failed: ${error?.message || 'empty task id'}`
    );
  }

  return data.id as string;
}

function isQueuedVideoPipelineEnabled(): boolean {
  return (process.env.VIDEO_QUEUE_PROVIDER || 'cloudflare') !== 'legacy';
}

async function updateVideoTask(
  taskId: string,
  values: Record<string, unknown>
): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) return;
  const { error } = await admin
    .from('video_generation_tasks')
    .update({
      ...values,
      updated_at: new Date().toISOString()
    })
    .eq('id', taskId);
  if (error) {
    console.error('[VideoGenerate] task update failed:', {
      taskId,
      message: error.message
    });
  }
}

export default async function handler(request: Request) {
  const corsHeaders = getCorsHeadersForRequest(request);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, corsHeaders, 405);
  }

  const body = (await request.json().catch(() => ({}))) as VideoGenerateRequest;
  const contract = buildVideoGenerateContract(body);
  if (!contract.ok) {
    return jsonResponse(contract.body, corsHeaders, contract.status);
  }

  if (!isArkVideoGenerationAvailable()) {
    return jsonResponse(
      {
        success: false,
        error: 'VIDEO_GENERATION_NOT_ENABLED',
        message: '视频生成通道维护中，修复完成后再开放使用。',
        contract: contract.value,
        enablement: {
          billingReady: true
        }
      },
      corsHeaders,
      501
    );
  }

  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return jsonResponse(
      {
        error: 'Unauthorized',
        message: '视频生成需要登录。'
      },
      corsHeaders,
      401
    );
  }
  const rateLimit = await consumeModelRateLimit({
    userId,
    bucket: 'video_generate',
    maxRequests: 4,
    windowSeconds: 60
  });
  if (!rateLimit.allowed)
    return createModelRateLimitResponse(rateLimit, corsHeaders);

  let charge: VideoCreditCharge | null = null;
  let taskId: string | null = null;

  try {
    const credit = await consumeVideoCredit(userId, contract.value);
    if (!credit.ok) {
      return jsonResponse(credit.body, corsHeaders, credit.status);
    }
    charge = credit.charge;
    const queueVideoTask = isQueuedVideoPipelineEnabled();
    taskId = await createVideoTask(
      userId,
      contract.value,
      charge,
      queueVideoTask ? 'queued' : 'running'
    );

    if (queueVideoTask) {
      return jsonResponse(
        {
          success: true,
          queued: true,
          taskId,
          status: 'queued',
          pollAfterMs: 5000,
          contract: contract.value,
          credits: {
            consumed: charge.consumed,
            creditType: charge.creditType,
            creditBreakdown: charge.creditBreakdown
          }
        },
        corsHeaders,
        202
      );
    }

    const providerTask = await callArkVideoCreate(contract.value);
    await updateVideoTask(taskId, {
      provider_task_id: providerTask.id || null,
      result_payload: {
        providerTask,
        contract: contract.value
      }
    });

    return jsonResponse(
      {
        success: true,
        queued: true,
        taskId,
        providerTaskId: providerTask.id,
        status: providerTask.status || 'running',
        pollAfterMs: 5000,
        contract: contract.value,
        credits: {
          consumed: charge.consumed,
          creditType: charge.creditType,
          creditBreakdown: charge.creditBreakdown
        }
      },
      corsHeaders,
      202
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '视频生成请求失败。';
    const failure = describeVideoTaskFailure(
      message,
      undefined,
      contract.value
    );
    const refundSucceeded = await refundVideoCredit(userId, charge, {
      taskId,
      error: message,
      model: contract.value.model,
      requestedApiModel: contract.value.apiModel
    });
    if (taskId) {
      await updateVideoTask(taskId, {
        status: 'failed',
        error_message: message,
        refund_failed: !refundSucceeded,
        completed_at: new Date().toISOString(),
        result_payload: {
          error: 'VIDEO_PROVIDER_REQUEST_FAILED',
          message,
          contract: contract.value
        }
      });
    }
    return jsonResponse(
      {
        success: false,
        error: failure.message,
        message: failure.message,
        code: failure.code,
        requestId: failure.requestId,
        retryable: failure.retryable,
        details: !charge?.consumed
          ? '本次未扣除积分。'
          : refundSucceeded
            ? '本次扣除的积分已自动退回。'
            : '本次积分退款未完成，请联系管理员协助处理。',
        taskId,
        refundFailed: !refundSucceeded,
        contract: contract.value
      },
      corsHeaders,
      502
    );
  }
}
