import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '../utils/vercel-types';
import {
  getCorsHeadersForRequest,
  getUserIdFromRequest
} from '../utils/auth.js';
import {
  buildMediaMetadata,
  createMediaStorageAdapter,
  createMediaStorageAdapters,
  safeUpsertMediaObjectRecords,
  type MediaObjectRegistryInput,
  type MediaObjectRecord,
  type MediaStorageAdapter,
  type MediaStorageProvider
} from '../utils/media-storage/index.js';
import { generateImageWithZImage } from '../ai/aliyun/z-image.js';
import {
  IMAGE_GENERATION_4K_CREDIT_COST,
  estimateImageGenerationCreditCost
} from '../../src/shared/image-generation-pricing.js';
import { GPT_IMAGE_2_DENOISE_CREDIT_COST } from '../../src/shared/gpt-image-2-denoise.js';
import {
  getTuziImageModelConfig,
  isGptImage25Model,
  isSupportedChaoGptImage25ApiModel,
  getTuziImageModelLabel
} from '../../src/shared/tuzi-image-models.js';
import {
  buildImageProviderHealthLookup,
  getImageProviderHealthKey,
  getImageProviderRoutingDecision,
  safeFetchImageProviderHealth,
  shouldSkipImageProviderFallbackRoute
} from './provider-health.js';
import { isOfficialGeminiEnabled } from '../utils/model-provider-routing.js';
import {
  OpenAICompatibleImageProviderError,
  editOpenAICompatibleImage,
  generateOpenAICompatibleImage,
  isOpenAICompatibleImageProviderPendingError,
  resolveOpenAICompatibleImageConfig,
  type OpenAICompatibleGeneratedImage,
  type OpenAICompatibleImageErrorCategory,
  type OpenAICompatibleImageReference
} from './providers/openai-compatible-image.js';
import {
  isTuziMidjourneyModelId,
  submitAndPollTuziMidjourneyTask,
  TuziMidjourneyApiError,
  TuziMidjourneyTimeoutError
} from './providers/tuzi-midjourney.js';
import {
  classifyPolicyFailureMessage,
  createDailyPolicyFallbackBudget,
  isExplicitPolicyContentMessage
} from './generate/policy-fallback.js';
import {
  COMPRESSED_OUTPUT_QUALITY,
  GENERATED_IMAGE_BUCKET,
  IMAGE_DOWNLOAD_TIMEOUT_MS,
  IMAGE_GENERATION_TIMEOUT_MS,
  KRILL_IMAGE_TIMEOUT_MS,
  MAX_SUPPLEMENTAL_IMAGE_ATTEMPTS,
  PREFERRED_TUZI_IMAGE_MODEL,
  QUEUED_TUZI_FALLBACK_TIMEOUT_MS,
  QUEUED_KRILL_IMAGE_TIMEOUT_MS,
  QUEUED_PIPELINE_DEADLINE_MS,
  QUEUED_TUZI_DEADLINE_RESERVE_MS,
  QUEUED_TUZI_VIP_TIMEOUT_MS,
  SYNC_PIPELINE_DEADLINE_MS
} from './generate/constants.js';
import {
  getProviderImageSize,
  getImageSizeForSourceDimensions,
  getKrillProviderImageSize,
  getResultAspectRatio,
  getResultImageSize,
  getTuziProviderImageSize,
  getZImageSize,
  sanitizeImageGenerateInput
} from './generate/request.js';
import { buildGenerationPrompt } from './generate/prompt.js';
import {
  KRILL_IMAGE_CHANNEL,
  getKrillImageModel,
  getKrillImageResolutionTier,
  isKrillImageResolutionEnabled
} from './generate/krill-routing.js';
import {
  buildCloudDenoiseRestorationPrompt,
  CLOUD_DENOISE_API_MODEL,
  CLOUD_DENOISE_APP_OPERATION,
  CLOUD_DENOISE_APP_SLUG,
  CLOUD_DENOISE_GUIDE_OUTPUT,
  CLOUD_DENOISE_GUIDE_TRANSFORM,
  CLOUD_DENOISE_MODEL,
  isCloudDenoiseInput
} from './generate/cloud-denoise.js';
import {
  evaluateImageGenerationPolicy,
  IMAGE_GENERATION_POLICY_VERSION
} from './generate/policy.js';
import {
  buildTuziImageAttemptPlan,
  buildTuziImageGenerationRequestBody,
  filterTuziAttemptsForLock,
  getConfiguredTuziApiModel,
  getTuziAttemptHealthRecord,
  getTuziImageRoutingDiagnostics,
  getTuziModelTimeoutMs,
  rankTuziAttemptsByProviderHealth
} from './generate/tuzi-routing.js';
import { recordFirstPostPurchaseGenerationSuccess } from './post-purchase-activation.js';
import type {
  AspectRatio,
  GeneratedImage,
  ImageGenerateRequest,
  ImageGenerationAttemptDiagnostic,
  ImageGenerationAttemptLogInput,
  ImageGenerationFailureCategory,
  ImageGenerationFailureDetails,
  ImageGenerationRunOptions,
  ImageGenerationTaskDiagnostics,
  ImageProvider,
  ModelId,
  OutputFormat,
  QualityProfile,
  SanitizedImageGenerateRequest,
  TuziImageChannel
} from './generate/types.js';
import type { MoodboardConditioning } from '../../src/shared/create-workspace-v2.js';
import { getAuthorizedMoodboardReferenceIds } from './generate/moodboard-reference-access.js';

export type {
  AspectRatio,
  GeneratedImage,
  ImageGenerateRequest,
  ImageGenerationAttemptLogInput,
  ImageGenerationTaskDiagnostics,
  ImageGenerationFailureCategory,
  ImageGenerationFailureDetails,
  ImageGenerationRunOptions,
  ImageProvider,
  LockedTuziAttempt,
  ModelId,
  OutputFormat,
  PromptMode,
  QualityProfile,
  SanitizedImageGenerateRequest,
  TuziImageChannel
} from './generate/types.js';
export {
  GPT_IMAGE_2_DENOISE_PIPELINE_DEADLINE_MS,
  QUEUED_PIPELINE_DEADLINE_MS,
  QUEUED_TUZI_VIP_TIMEOUT_MS
} from './generate/constants.js';
export {
  getImageSizeForSourceDimensions,
  getKrillProviderImageSize,
  getTuziProviderImageSize,
  sanitizeImageGenerateInput,
  shouldRouteGptImage2DirectlyToTuzi
} from './generate/request.js';
export {
  buildGenerationPrompt,
  getImagePromptSafetyGuidance
} from './generate/prompt.js';
export {
  getConfiguredKrillImageModels,
  getKrillImageModel,
  getKrillImageResolutionTier,
  isKrillImageResolutionEnabled
} from './generate/krill-routing.js';
export {
  buildTuziImageGenerationRequestBody,
  getTuziImageAttemptPlanSummary,
  getTuziImageModelCandidates,
  getTuziModelTimeoutMs,
  parseTuziChannelConnectionConfig
} from './generate/tuzi-routing.js';

export const config = {
  runtime: 'nodejs',
  maxDuration: 300
};

const OPENAI_COMPATIBLE_CODEX_FALLBACK_MODEL = 'codex-gpt-image-2';
const DEFAULT_OPENAI_COMPATIBLE_SINGLE_IMAGE_RESCUE_TIMEOUT_MS = 180_000;
const MIN_OPENAI_COMPATIBLE_SINGLE_IMAGE_RESCUE_TIMEOUT_MS = 65_000;
const MAX_OPENAI_COMPATIBLE_SINGLE_IMAGE_RESCUE_TIMEOUT_MS = 240_000;
const DEFAULT_OPENAI_COMPATIBLE_BATCH_SIZE = 1;
const CLOUDFLARE_UPSCALE_MIN_PIXELS = 2_800_000;
const CLOUDFLARE_UPSCALE_MIN_LONG_SIDE = 1792;
const CLOUDFLARE_UPSCALE_TIMEOUT_MS = 20_000;
const GENERATED_IMAGE_STORAGE_TIMEOUT_MS = 75_000;

interface StoredImageVariant {
  provider?: MediaStorageProvider;
  bucket: string;
  path: string;
  signedUrl: string;
  width?: number;
  height?: number;
  byteSize?: number;
  mediaRecord?: MediaObjectRecord;
}

interface StoredImage extends StoredImageVariant {
  thumbnail?: StoredImageVariant;
  preview?: StoredImageVariant;
  upscale?: StoredImageUpscaleMetadata;
}

interface StoredImageUpscaleMetadata {
  provider: 'cloudflare';
  sourceWidth: number;
  sourceHeight: number;
  targetWidth: number;
  targetHeight: number;
  contentType: string;
  byteSize: number;
}

interface ResolvedImageReference {
  id: string;
  role: string;
  label?: string;
  storageBucket: string;
  storagePath: string;
  mimeType: string;
  signedUrl: string;
}

interface TemporaryDenoiseGuide {
  reference: ResolvedImageReference;
  storedImage: StoredImage;
}

interface StoredGeneratedImage {
  generationId: string;
  imageUrl: string;
  imageUrlExpiresIn: number;
  thumbnailUrl?: string;
  previewUrl?: string;
  storageBucket?: string;
  storagePath?: string;
  thumbnailStoragePath?: string;
  previewStoragePath?: string;
  width?: number;
  height?: number;
  byteSize?: number;
  provider: ImageProvider;
  model: string;
  modelLabel: string;
  usedFallback: boolean;
}

export interface ImageGenerationSuccessPayload {
  success: true;
  generationId: string;
  imageUrl: string;
  imageUrlExpiresIn: number;
  images: StoredGeneratedImage[];
  imageCount: number;
  requestedImageCount: number;
  actualImageCount?: number;
  refunded?: number;
  refundFailed?: boolean;
  partialRefundWarning?: string;
  batchConsistencyMode?: 'single' | 'strict';
  strictBatchConsistency?: boolean;
  skippedCrossChannelSupplement?: boolean;
  provider: ImageProvider;
  model: string;
  modelLabel: string;
  requestedModelLabel: string;
  quality: QualityProfile;
  aspectRatio: AspectRatio;
  imageSize: string;
  outputFormat: OutputFormat;
  usedFallback: boolean;
  diagnostics?: ImageGenerationTaskDiagnostics;
  credits: {
    consumed: number;
    creditType: string;
    creditBreakdown?: Record<string, number>;
    unitCost?: number;
    requestedCost?: number;
    refunded?: number;
    warning?: string;
  };
  referralReward?: {
    qualified: boolean;
    rewardAmount?: number;
    status?: string;
    reason?: string;
  };
}

export interface ImageGenerationExecutionResult {
  ok: boolean;
  status: number;
  payload?: ImageGenerationSuccessPayload;
  body?: Record<string, unknown>;
  failureReason?: string;
  failureDetails?: ImageGenerationFailureDetails;
  refundFailed?: boolean;
  diagnostics?: ImageGenerationTaskDiagnostics;
}

export function jsonResponse(
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

export function getSupabaseAdmin(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

class ProviderHttpError extends Error {
  readonly httpStatus: number;
  readonly provider?: string;
  readonly model?: string;
  constructor(
    message: string,
    httpStatus: number,
    details: { provider?: string; model?: string } = {}
  ) {
    super(message);
    this.name = 'ProviderHttpError';
    this.httpStatus = httpStatus;
    this.provider = details.provider;
    this.model = details.model;
  }
}

function isRetryableProviderHttpStatus(httpStatus: number): boolean {
  return (
    httpStatus === 429 ||
    [500, 502, 503, 504, 520, 521, 522, 523, 524, 525, 526, 527].includes(
      httpStatus
    )
  );
}

function isProviderUnavailableHttpStatus(httpStatus: number): boolean {
  return [500, 502, 503, 504, 520, 521, 522, 523, 524, 525, 526, 527].includes(
    httpStatus
  );
}

class ProviderTimeoutError extends Error {
  readonly provider: string;
  readonly model: string;
  readonly timeoutMs: number;
  constructor(provider: string, model: string, timeoutMs: number) {
    super(
      `${provider} image generation timed out after ${Math.round(
        timeoutMs / 1000
      )}s (${model})`
    );
    this.name = 'ProviderTimeoutError';
    this.provider = provider;
    this.model = model;
    this.timeoutMs = timeoutMs;
  }
}

class PipelineDeadlineError extends Error {
  constructor() {
    super('IMAGE_PIPELINE_DEADLINE: 生成超时（接近函数上限），已触发退款');
    this.name = 'PipelineDeadlineError';
  }
}

function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { name?: unknown; message?: unknown };
  return (
    candidate.name === 'AbortError' ||
    (typeof candidate.message === 'string' &&
      candidate.message.toLowerCase().includes('aborted'))
  );
}

function isTruthyEnv(value?: string): boolean {
  return /^(1|true|yes|on)$/i.test(String(value || '').trim());
}

async function withOperationTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  message: string
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
      })
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function getImageExecutionRuntime(): string {
  return (
    process.env.WEBTOMIND_IMAGE_RUNTIME ||
    process.env.WEBTOMIND_RUNTIME ||
    (process.env.VERCEL === '1' ? 'vercel' : 'node')
  );
}

function getImageAttemptRuntimeMetadata(): Record<string, unknown> {
  return {
    executionRuntime: getImageExecutionRuntime(),
    vercelRuntime: process.env.VERCEL === '1',
    legacyImageExecutionEnabled:
      process.env.WEBTOMIND_ENABLE_LEGACY_IMAGE_EXECUTION === 'true',
    openAICompatibleCodexFallbackDisabled: isTruthyEnv(
      process.env.OPENAI_COMPAT_IMAGE_DISABLE_CODEX_FALLBACK
    ),
    policyVersion: IMAGE_GENERATION_POLICY_VERSION
  };
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

function getCloudflareAiGatewayHeaders(
  apiBaseUrl: string
): Record<string, string> {
  const token = String(
    process.env.CLOUDFLARE_AI_GATEWAY_RUN_TOKEN || ''
  ).trim();
  if (!token) return {};
  try {
    if (new URL(apiBaseUrl).hostname !== 'gateway.ai.cloudflare.com') {
      return {};
    }
  } catch {
    return {};
  }
  return { 'cf-aig-authorization': `Bearer ${token}` };
}

export function getOpenAICompatibleImageModel(
  input?: SanitizedImageGenerateRequest
): string {
  const config = resolveOpenAICompatibleImageConfig();
  if (input) {
    // Chaojitudou keeps its provider-facing legacy alias while serving the
    // current GPT Image generation route. Persist the logical 2.5 model on our
    // task and keep the actual upstream alias in attempt diagnostics.
    if (
      isGptImage25Model(input.model) &&
      isChaojitudouOpenAICompatibleHost(config.apiBaseUrl) &&
      config.model
    ) {
      return config.model;
    }
    return getTuziImageModelConfig(input.model).apiModel;
  }
  return config.model || 'gpt-image-2';
}

function getOpenAICompatibleImageFallbackModel(
  primaryModel: string
): string | undefined {
  if (primaryModel !== 'gpt-image-2') return undefined;
  if (isTruthyEnv(process.env.OPENAI_COMPAT_IMAGE_DISABLE_CODEX_FALLBACK)) {
    return undefined;
  }
  const fallbackModel = (
    process.env.OPENAI_COMPAT_IMAGE_FALLBACK_MODEL ||
    OPENAI_COMPATIBLE_CODEX_FALLBACK_MODEL
  ).trim();
  if (!fallbackModel || fallbackModel === primaryModel) return undefined;
  return fallbackModel;
}

function isChaojitudouOpenAICompatibleHost(apiBaseUrl: string): boolean {
  try {
    return /(^|\.)chaojitudou\.com$/i.test(new URL(apiBaseUrl).hostname);
  } catch {
    return /(^|\.)chaojitudou\.com(\/|$)/i.test(apiBaseUrl);
  }
}

function getOpenAICompatibleBatchSizeOverride(): number {
  const parsed = Number(process.env.OPENAI_COMPAT_IMAGE_BATCH_SIZE || '');
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_OPENAI_COMPATIBLE_BATCH_SIZE;
  }
  return Math.floor(parsed);
}

function getOpenAICompatibleSingleImageRescueTimeoutMs(): number {
  const parsed = Number(
    process.env.OPENAI_COMPAT_IMAGE_RESCUE_TIMEOUT_MS || ''
  );
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_OPENAI_COMPATIBLE_SINGLE_IMAGE_RESCUE_TIMEOUT_MS;
  }
  return Math.max(
    MIN_OPENAI_COMPATIBLE_SINGLE_IMAGE_RESCUE_TIMEOUT_MS,
    Math.min(
      Math.floor(parsed),
      MAX_OPENAI_COMPATIBLE_SINGLE_IMAGE_RESCUE_TIMEOUT_MS
    )
  );
}

function getOpenAICompatibleProviderBatchSize({
  apiBaseUrl,
  model,
  imageCount
}: {
  apiBaseUrl: string;
  model: string;
  imageCount: number;
}): number {
  if (imageCount <= 1) return 1;
  if (
    model === 'gpt-image-2' &&
    isChaojitudouOpenAICompatibleHost(apiBaseUrl)
  ) {
    return Math.min(imageCount, getOpenAICompatibleBatchSizeOverride());
  }
  return 1;
}

function shouldFallbackOpenAICompatibleModel(error: unknown): boolean {
  const details = getFailureDetails(error);
  return details.retryable;
}

function getKrillApiBaseUrl(): string {
  return normalizeBaseUrl(
    process.env.KRILL_IMAGE_API_BASE_URL ||
      process.env.KRILL_API_BASE_URL ||
      'https://api.krill-ai.com/v1'
  );
}

function getGeminiModel(): string {
  return process.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image-preview';
}

function getGeneratedModelLabel(generated: GeneratedImage): string {
  if (generated.modelLabel) return generated.modelLabel;
  if (generated.provider === 'krill') return 'GPT Image 2';
  if (generated.provider === 'tuzi')
    return getTuziImageModelLabel(generated.model);
  if (generated.provider === 'gemini') return 'Nano Banana Pro';
  if (generated.provider === 'z-image') return 'Z-Image';
  if (generated.provider === 'openai') return 'GPT Image 2';
  return generated.model;
}

function getOutputMimeType(outputFormat: OutputFormat): string {
  if (outputFormat === 'jpeg') return 'image/jpeg';
  if (outputFormat === 'webp') return 'image/webp';
  return 'image/png';
}

function dataUrlFromProviderBase64(
  value: string,
  fallbackMimeType: string
): { dataUrl: string; mimeType: string } {
  if (value.startsWith('data:')) {
    const parsed = parseDataUrl(value);
    return {
      dataUrl: value,
      mimeType: parsed?.mimeType || fallbackMimeType
    };
  }

  const compact = value.trim();
  const mimeType = compact.startsWith('/9j/')
    ? 'image/jpeg'
    : compact.startsWith('iVBORw0KGgo')
      ? 'image/png'
      : compact.startsWith('UklGR')
        ? 'image/webp'
        : fallbackMimeType;
  return {
    dataUrl: `data:${mimeType};base64,${compact}`,
    mimeType
  };
}

function getDurationMs(startedAt: Date, finishedAt: Date): number {
  return Math.max(0, finishedAt.getTime() - startedAt.getTime());
}

export function extractProviderRequestId(message: string): string | undefined {
  return (
    message.match(/request id:\s*([^)]+)/i)?.[1]?.trim() ||
    message.match(/request ID\s+([a-z0-9-]+)/i)?.[1]?.trim() ||
    undefined
  );
}

function getCreditEstimate(input: SanitizedImageGenerateRequest) {
  const unitEstimate = estimateImageGenerationCreditCost({
    model: input.model,
    imageSize: getResultImageSize(input),
    quality: input.quality,
    referenceImageCount: input.referenceImageIds.length,
    referenceMode: input.referenceMode,
    referenceImageSizes: input.referenceImageSizes
  });
  if (isCloudDenoiseInput(input)) {
    return {
      ...unitEstimate,
      cost: GPT_IMAGE_2_DENOISE_CREDIT_COST * input.imageCount,
      unitCost: GPT_IMAGE_2_DENOISE_CREDIT_COST,
      baseCost: GPT_IMAGE_2_DENOISE_CREDIT_COST,
      qualityAdjustment: 0,
      referenceAdjustment: 0,
      modeAdjustment: 0,
      modelMultiplier: 1,
      modelAdjustment: 0
    };
  }
  return {
    ...unitEstimate,
    unitCost: unitEstimate.cost,
    cost: unitEstimate.cost * input.imageCount
  };
}

export function isStrictBatchConsistencyEnabled(
  requestedImageCount: number
): boolean {
  return requestedImageCount > 1;
}

function getImageBatchConsistencyRequestMetadata(
  input: SanitizedImageGenerateRequest
): Record<string, unknown> {
  const strict = isStrictBatchConsistencyEnabled(input.imageCount);
  return {
    batchConsistencyMode: strict ? 'strict' : 'single',
    strictBatchConsistency: strict,
    requestedImageCount: input.imageCount,
    requestedProvider: input.provider,
    requestedModel: input.model,
    requestedApiModel: getRequestedApiModel(input)
  };
}

function getRequestedApiModel(input: SanitizedImageGenerateRequest): string {
  if (input.provider === 'openai') return getOpenAICompatibleImageModel(input);
  if (input.provider === 'krill') return getKrillImageModel(input);
  if (input.provider === 'z-image') return 'z-image-turbo';
  if (input.provider === 'gemini') return getGeminiModel();
  return getConfiguredTuziApiModel(input.model);
}

function getGeneratedImageBatchLockMetadata(
  generated?: GeneratedImage
): Record<string, unknown> {
  if (!generated) return {};
  return {
    lockedProvider: generated.provider,
    lockedModel: generated.model,
    lockedChannel:
      generated.provider === 'tuzi'
        ? generated.tuziChannel || null
        : generated.provider === 'krill'
          ? 'primary'
          : null,
    lockedApiBaseUrl: generated.providerApiBaseUrl || null
  };
}

export function getImageGenerationCreditMetadata(
  input: SanitizedImageGenerateRequest,
  options: ImageGenerationRunOptions = {}
): Record<string, unknown> {
  const creditEstimate = getCreditEstimate(input);
  return {
    source: 'image_create_page',
    sourceApp: input.sourceApp,
    appSlug: input.appSlug,
    appOperation: input.appOperation,
    mode: options.mode || 'sync',
    taskId: options.taskId,
    creditWaiverReason: options.creditWaiverReason,
    skipCreditCharge: Boolean(options.skipCreditCharge),
    requestedModel: input.model,
    requestedModelLabel: input.modelLabel,
    requestedApiModel: getRequestedApiModel(input),
    requestedProvider: input.provider,
    ...getImageBatchConsistencyRequestMetadata(input),
    aspectRatio: input.aspectRatio,
    imageSize: input.imageSize,
    quality: input.quality,
    qualityLabel: input.qualityLabel,
    outputFormat: input.outputFormat,
    dynamicCredits: creditEstimate.cost,
    unitDynamicCredits: creditEstimate.unitCost,
    billingTier: creditEstimate.tier,
    billingMegapixels: creditEstimate.megapixels,
    billingBaseCost: creditEstimate.baseCost,
    billingQualityAdjustment: creditEstimate.qualityAdjustment,
    billingReferenceAdjustment: creditEstimate.referenceAdjustment,
    billingModeAdjustment: creditEstimate.modeAdjustment,
    billingModelMultiplier: creditEstimate.modelMultiplier,
    billingModelAdjustment: creditEstimate.modelAdjustment,
    imageCount: input.imageCount,
    requestedImageCount: input.imageCount,
    // DB image_generation.max_cost >= IMAGE_GENERATION_4K_CREDIT_COST is enforced
    // by business guardrails (image_dynamic_pricing_clamp_window); otherwise a
    // single-image dynamicCredit in (max_cost, 4K] would silently clamp and
    // under-charge.
    allowDynamicCostAboveMax:
      input.imageCount > 1 ||
      creditEstimate.unitCost > IMAGE_GENERATION_4K_CREDIT_COST,
    assetIds: input.assetIds,
    referenceImageIds: input.referenceImageIds,
    referenceMode: input.referenceMode,
    characterCardIds: input.characterCardIds,
    characterReferenceGroups: input.characterReferenceGroups,
    promptMode: input.promptMode,
    promptAspectRatio: input.promptAspectRatio,
    promptImageSize: input.promptImageSize
  };
}

export function getImageTaskBillingIdempotencyKey(
  taskId: string | undefined,
  billingPhase: string
): string | undefined {
  if (!taskId || !billingPhase) return undefined;
  return `image_task:${taskId}:${billingPhase}`;
}

function withImageTaskBillingMetadata(
  metadata: Record<string, unknown>,
  taskId: string | undefined,
  billingPhase: string
): Record<string, unknown> {
  const idempotencyKey = getImageTaskBillingIdempotencyKey(
    taskId,
    billingPhase
  );
  return {
    ...metadata,
    billingDomain: taskId ? 'image_task' : 'image_generation',
    billingPhase,
    ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {})
  };
}

function parseDataUrl(
  dataUrl: string
): { mimeType: string; base64: string } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return { mimeType: match[1], base64: match[2] };
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function readPngDimensions(bytes: Uint8Array): {
  width: number;
  height: number;
} | null {
  if (
    bytes.length < 24 ||
    bytes[0] !== 0x89 ||
    bytes[1] !== 0x50 ||
    bytes[2] !== 0x4e ||
    bytes[3] !== 0x47 ||
    bytes[12] !== 0x49 ||
    bytes[13] !== 0x48 ||
    bytes[14] !== 0x44 ||
    bytes[15] !== 0x52
  ) {
    return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    width: view.getUint32(16, false),
    height: view.getUint32(20, false)
  };
}

function readJpegDimensions(bytes: Uint8Array): {
  width: number;
  height: number;
} | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9) continue;
    if (offset + 2 > bytes.length) return null;
    const length = (bytes[offset] << 8) + bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length) return null;
    const isStartOfFrame =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);
    if (isStartOfFrame && length >= 7) {
      return {
        height: (bytes[offset + 3] << 8) + bytes[offset + 4],
        width: (bytes[offset + 5] << 8) + bytes[offset + 6]
      };
    }
    offset += length;
  }
  return null;
}

function readWebpDimensions(bytes: Uint8Array): {
  width: number;
  height: number;
} | null {
  if (
    bytes.length < 30 ||
    String.fromCharCode(...bytes.subarray(0, 4)) !== 'RIFF' ||
    String.fromCharCode(...bytes.subarray(8, 12)) !== 'WEBP'
  ) {
    return null;
  }
  const chunk = String.fromCharCode(...bytes.subarray(12, 16));
  if (chunk === 'VP8X' && bytes.length >= 30) {
    return {
      width: 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16),
      height: 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16)
    };
  }
  if (chunk === 'VP8 ' && bytes.length >= 30) {
    return {
      width: bytes[26] + ((bytes[27] & 0x3f) << 8),
      height: bytes[28] + ((bytes[29] & 0x3f) << 8)
    };
  }
  if (chunk === 'VP8L' && bytes.length >= 25 && bytes[20] === 0x2f) {
    const bits =
      bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1
    };
  }
  return null;
}

function readImageDimensions(
  bytes: Uint8Array,
  mimeType: string
): { width: number; height: number } | null {
  const normalizedMimeType = mimeType.toLowerCase();
  if (normalizedMimeType.includes('png')) return readPngDimensions(bytes);
  if (
    normalizedMimeType.includes('jpeg') ||
    normalizedMimeType.includes('jpg')
  ) {
    return readJpegDimensions(bytes);
  }
  if (normalizedMimeType.includes('webp')) return readWebpDimensions(bytes);
  return (
    readPngDimensions(bytes) ||
    readJpegDimensions(bytes) ||
    readWebpDimensions(bytes)
  );
}

function parseFixedImageSize(
  imageSize: string | undefined
): { width: number; height: number } | null {
  const match = (imageSize || '')
    .trim()
    .toLowerCase()
    .replace(/[×＊*]/g, 'x')
    .match(/^(\d{2,4})x(\d{2,4})$/);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!width || !height) return null;
  return { width, height };
}

function isCloudflareUpscaleEnabled(): boolean {
  const flag = (process.env.IMAGE_CLOUDFLARE_UPSCALE_ENABLED || '')
    .trim()
    .toLowerCase();
  if (flag === 'false' || flag === '0' || flag === 'off') return false;
  return getImageExecutionRuntime() === 'cloudflare-worker';
}

function isRequestedUpscaleTier(size: {
  width: number;
  height: number;
}): boolean {
  return (
    size.width * size.height >= CLOUDFLARE_UPSCALE_MIN_PIXELS ||
    Math.max(size.width, size.height) >= CLOUDFLARE_UPSCALE_MIN_LONG_SIDE
  );
}

function shouldAttemptCloudflareUpscale({
  generated,
  requestedSize,
  originalWidth,
  originalHeight
}: {
  generated: GeneratedImage;
  requestedSize: { width: number; height: number };
  originalWidth: number;
  originalHeight: number;
}): boolean {
  if (!isCloudflareUpscaleEnabled()) return false;
  const isChaojitudouResult =
    generated.provider === 'openai' &&
    isChaojitudouOpenAICompatibleHost(generated.providerApiBaseUrl || '');
  const isCloudDenoiseResult =
    generated.provider === 'tuzi' &&
    generated.model === CLOUD_DENOISE_API_MODEL;
  if (!isChaojitudouResult && !isCloudDenoiseResult) {
    return false;
  }
  if (!isRequestedUpscaleTier(requestedSize)) return false;
  return (
    requestedSize.width * requestedSize.height > originalWidth * originalHeight
  );
}

function getImageExtensionFromMimeType(mimeType: string): string {
  const normalized = mimeType.toLowerCase();
  if (normalized.includes('webp')) return 'webp';
  if (normalized.includes('jpeg') || normalized.includes('jpg')) return 'jpg';
  return 'png';
}

type CloudflareImageFetchInit = RequestInit & {
  cf?: {
    image?: Record<string, unknown>;
  };
};

type CloudflareImagesOutput = {
  response(): Response;
};

type CloudflareImagesInput = {
  transform(options: Record<string, unknown>): CloudflareImagesInput;
  output(options: Record<string, unknown>): Promise<CloudflareImagesOutput>;
};

type CloudflareImagesBinding = {
  input(
    source: ArrayBuffer | Uint8Array | Blob | ReadableStream
  ): CloudflareImagesInput;
};

function getCloudflareImagesBinding(): CloudflareImagesBinding | null {
  const binding = (
    globalThis as typeof globalThis & {
      __WEBTOMIND_CLOUDFLARE_IMAGES?: CloudflareImagesBinding;
    }
  ).__WEBTOMIND_CLOUDFLARE_IMAGES;
  return binding && typeof binding.input === 'function' ? binding : null;
}

function getCloudflareImagesOutputFormat(mimeType: string): string {
  const normalized = mimeType.toLowerCase();
  if (normalized.includes('webp')) return 'image/webp';
  if (normalized.includes('jpeg') || normalized.includes('jpg')) {
    return 'image/jpeg';
  }
  return 'image/png';
}

async function validateCloudflareUpscaleResponse({
  response,
  sourceMimeType,
  requestedSize,
  sourceWidth,
  sourceHeight,
  mode
}: {
  response: Response;
  sourceMimeType: string;
  requestedSize: { width: number; height: number };
  sourceWidth: number;
  sourceHeight: number;
  mode: 'images-binding' | 'fetch-transform';
}): Promise<{
  bytes: Uint8Array;
  mimeType: string;
  width: number;
  height: number;
} | null> {
  if (!response.ok) {
    console.warn('[ImageGenerate] Cloudflare image upscale failed:', {
      mode,
      status: response.status,
      sourceWidth,
      sourceHeight,
      targetWidth: requestedSize.width,
      targetHeight: requestedSize.height
    });
    return null;
  }

  const mimeType = response.headers.get('content-type') || sourceMimeType;
  const bytes = new Uint8Array(await response.arrayBuffer());
  const metadata = readImageDimensions(bytes, mimeType);
  if (
    metadata?.width !== requestedSize.width ||
    metadata?.height !== requestedSize.height
  ) {
    console.warn(
      '[ImageGenerate] Cloudflare image upscale returned unexpected size:',
      {
        mode,
        sourceWidth,
        sourceHeight,
        targetWidth: requestedSize.width,
        targetHeight: requestedSize.height,
        width: metadata?.width,
        height: metadata?.height,
        mimeType
      }
    );
    return null;
  }

  return {
    bytes,
    mimeType,
    width: metadata.width,
    height: metadata.height
  };
}

async function upscaleImageWithCloudflareImagesBinding({
  sourceBytes,
  sourceMimeType,
  requestedSize,
  sourceWidth,
  sourceHeight
}: {
  sourceBytes: Uint8Array;
  sourceMimeType: string;
  requestedSize: { width: number; height: number };
  sourceWidth: number;
  sourceHeight: number;
}): Promise<{
  bytes: Uint8Array;
  mimeType: string;
  width: number;
  height: number;
} | null> {
  const binding = getCloudflareImagesBinding();
  if (!binding) return null;

  const transformed = await binding
    .input(sourceBytes)
    .transform({
      width: requestedSize.width,
      height: requestedSize.height,
      fit: 'cover'
    })
    .output({
      format: getCloudflareImagesOutputFormat(sourceMimeType)
    });

  return validateCloudflareUpscaleResponse({
    response: transformed.response(),
    sourceMimeType,
    requestedSize,
    sourceWidth,
    sourceHeight,
    mode: 'images-binding'
  });
}

async function upscaleImageWithCloudflareTransform({
  imageUrl,
  sourceMimeType,
  requestedSize,
  sourceWidth,
  sourceHeight
}: {
  imageUrl: string;
  sourceMimeType: string;
  requestedSize: { width: number; height: number };
  sourceWidth: number;
  sourceHeight: number;
}): Promise<{
  bytes: Uint8Array;
  mimeType: string;
  width: number;
  height: number;
} | null> {
  const response = await fetch(imageUrl, {
    headers: {
      Accept: sourceMimeType
    },
    cf: {
      image: {
        width: requestedSize.width,
        height: requestedSize.height,
        fit: 'cover',
        metadata: 'none'
      }
    }
  } as CloudflareImageFetchInit);
  return validateCloudflareUpscaleResponse({
    response,
    sourceMimeType,
    requestedSize,
    sourceWidth,
    sourceHeight,
    mode: 'fetch-transform'
  });
}

async function conformGeneratedImageToRequestedSize(
  generated: GeneratedImage,
  input: SanitizedImageGenerateRequest
): Promise<GeneratedImage> {
  const requestedSize = parseFixedImageSize(getResultImageSize(input));
  if (!requestedSize) return generated;

  const parsed = parseDataUrl(generated.dataUrl);
  if (!parsed) return generated;

  const originalBytes = base64ToBytes(parsed.base64);
  const metadata = readImageDimensions(originalBytes, parsed.mimeType);
  const originalWidth = metadata?.width;
  const originalHeight = metadata?.height;
  if (!originalWidth || !originalHeight) return generated;

  if (
    originalWidth === requestedSize.width &&
    originalHeight === requestedSize.height
  ) {
    return generated;
  }

  const requestedPixels = requestedSize.width * requestedSize.height;
  const originalPixels = originalWidth * originalHeight;
  if (requestedPixels <= originalPixels) {
    return {
      ...generated,
      providerOriginalWidth: originalWidth,
      providerOriginalHeight: originalHeight,
      requestedOutputSize: `${requestedSize.width}x${requestedSize.height}`
    };
  }

  console.warn(
    '[ImageGenerate] provider output is smaller than requested size:',
    {
      provider: generated.provider,
      model: generated.model,
      requestedSize: `${requestedSize.width}x${requestedSize.height}`,
      originalWidth,
      originalHeight
    }
  );

  return {
    ...generated,
    providerOriginalWidth: originalWidth,
    providerOriginalHeight: originalHeight,
    requestedOutputSize: `${requestedSize.width}x${requestedSize.height}`,
    outputImageSizeConformed: false
  };
}

async function conformGeneratedImagesToRequestedSize(
  generated: GeneratedImage[],
  input: SanitizedImageGenerateRequest
): Promise<GeneratedImage[]> {
  return Promise.all(
    generated.map((image) => conformGeneratedImageToRequestedSize(image, input))
  );
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  return bytesToBase64(new Uint8Array(buffer));
}

async function downloadImageAsDataUrl(
  imageUrl: string
): Promise<{ dataUrl: string; mimeType: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    IMAGE_DOWNLOAD_TIMEOUT_MS
  );
  try {
    const response = await fetch(imageUrl, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Failed to download generated image: ${response.status}`);
    }
    const mimeType = response.headers.get('content-type') || 'image/png';
    const base64 = arrayBufferToBase64(await response.arrayBuffer());
    return { dataUrl: `data:${mimeType};base64,${base64}`, mimeType };
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error(
        `Generated image download timed out after ${Math.round(
          IMAGE_DOWNLOAD_TIMEOUT_MS / 1000
        )}s`
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function maybeUpscaleStoredImageWithCloudflare({
  storage,
  generated,
  storedImage,
  sourceBytes,
  sourceMimeType
}: {
  storage: MediaStorageAdapter;
  generated: GeneratedImage;
  storedImage: StoredImage;
  sourceBytes: Uint8Array;
  sourceMimeType: string;
}): Promise<StoredImage> {
  const requestedSize = parseFixedImageSize(generated.requestedOutputSize);
  if (
    !requestedSize ||
    !storedImage.width ||
    !storedImage.height ||
    !shouldAttemptCloudflareUpscale({
      generated,
      requestedSize,
      originalWidth: storedImage.width,
      originalHeight: storedImage.height
    })
  ) {
    return storedImage;
  }

  try {
    const upscaled =
      (await withOperationTimeout(
        upscaleImageWithCloudflareImagesBinding({
          sourceBytes,
          sourceMimeType,
          requestedSize,
          sourceWidth: storedImage.width,
          sourceHeight: storedImage.height
        }),
        CLOUDFLARE_UPSCALE_TIMEOUT_MS,
        `Cloudflare image upscale timed out after ${Math.round(
          CLOUDFLARE_UPSCALE_TIMEOUT_MS / 1000
        )}s`
      )) ||
      (await withOperationTimeout(
        upscaleImageWithCloudflareTransform({
          imageUrl: storedImage.signedUrl,
          sourceMimeType,
          requestedSize,
          sourceWidth: storedImage.width,
          sourceHeight: storedImage.height
        }),
        CLOUDFLARE_UPSCALE_TIMEOUT_MS,
        `Cloudflare image upscale transform timed out after ${Math.round(
          CLOUDFLARE_UPSCALE_TIMEOUT_MS / 1000
        )}s`
      ));
    if (!upscaled) return storedImage;

    const extension = getImageExtensionFromMimeType(upscaled.mimeType);
    const upscaledPath = storedImage.path.replace(
      /\.[a-z0-9]+$/i,
      `-upscaled.${extension}`
    );
    const upscaledRecord = await storage.putObject({
      key: upscaledPath,
      body: upscaled.bytes,
      contentType: upscaled.mimeType,
      cacheControl: '31536000',
      width: upscaled.width,
      height: upscaled.height,
      byteSize: upscaled.bytes.byteLength
    });
    const upscaledSignedUrl = await storage.signReadUrl({
      locator: {
        provider: upscaledRecord.provider,
        bucket: upscaledRecord.bucket,
        key: upscaledRecord.key
      },
      expiresIn: 60 * 60 * 24,
      fallbackUrl: upscaledRecord.publicUrl
    });
    if (!upscaledSignedUrl) {
      await storage.deleteObjects([
        {
          provider: upscaledRecord.provider,
          bucket: upscaledRecord.bucket,
          key: upscaledRecord.key
        }
      ]);
      return storedImage;
    }

    try {
      await storage.deleteObjects([
        {
          provider:
            storedImage.mediaRecord?.provider ||
            storedImage.provider ||
            'supabase',
          bucket: storedImage.bucket,
          key: storedImage.path
        }
      ]);
    } catch (cleanupError) {
      console.warn('[ImageGenerate] cleanup pre-upscale image failed:', {
        path: storedImage.path,
        reason:
          cleanupError instanceof Error
            ? cleanupError.message
            : String(cleanupError)
      });
    }

    generated.cloudflareUpscaled = true;
    generated.cloudflareUpscaleSourceWidth = storedImage.width;
    generated.cloudflareUpscaleSourceHeight = storedImage.height;
    generated.cloudflareUpscaleTargetWidth = upscaled.width;
    generated.cloudflareUpscaleTargetHeight = upscaled.height;
    generated.cloudflareUpscaleContentType = upscaled.mimeType;
    generated.outputImageSizeConformed = true;

    console.info('[ImageGenerate] Cloudflare image upscale applied:', {
      provider: generated.provider,
      model: generated.model,
      apiHost: generated.providerApiBaseUrl,
      mode: getCloudflareImagesBinding() ? 'images-binding' : 'fetch-transform',
      sourceWidth: storedImage.width,
      sourceHeight: storedImage.height,
      targetWidth: upscaled.width,
      targetHeight: upscaled.height,
      path: upscaledPath
    });

    return {
      provider: upscaledRecord.provider,
      bucket: upscaledRecord.bucket,
      path: upscaledRecord.key,
      signedUrl: upscaledSignedUrl,
      width: upscaled.width,
      height: upscaled.height,
      byteSize: upscaled.bytes.byteLength,
      mediaRecord: upscaledRecord,
      upscale: {
        provider: 'cloudflare',
        sourceWidth: storedImage.width,
        sourceHeight: storedImage.height,
        targetWidth: upscaled.width,
        targetHeight: upscaled.height,
        contentType: upscaled.mimeType,
        byteSize: upscaled.bytes.byteLength
      }
    };
  } catch (error) {
    console.warn('[ImageGenerate] Cloudflare image upscale error:', {
      provider: generated.provider,
      model: generated.model,
      apiHost: generated.providerApiBaseUrl,
      requestedOutputSize: generated.requestedOutputSize,
      reason: error instanceof Error ? error.message : String(error)
    });
    return storedImage;
  }
}

async function resolveImageReferences(
  sb: SupabaseClient,
  userId: string,
  referenceImageIds: string[],
  moodboard?: MoodboardConditioning
): Promise<ResolvedImageReference[]> {
  if (referenceImageIds.length === 0) return [];

  const { data: ownedData, error } = await sb
    .from('image_reference_assets')
    .select('id, role, label, storage_bucket, storage_path, mime_type')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .in('id', referenceImageIds);

  if (error) {
    console.error('[ImageGenerate] reference load failed:', error);
    throw new Error('参考图加载失败，请稍后再试');
  }

  const rows = (ownedData || []) as Array<{
    id: string;
    role: string;
    label: string | null;
    storage_bucket: string;
    storage_path: string;
    mime_type: string;
  }>;
  const ownedIds = new Set(rows.map((row) => row.id));
  const missingIds = referenceImageIds.filter((id) => !ownedIds.has(id));
  if (missingIds.length > 0) {
    const authorizedIds = await getAuthorizedMoodboardReferenceIds(
      sb,
      userId,
      moodboard,
      missingIds
    );
    if (authorizedIds.size !== missingIds.length) {
      throw new Error('参考图不存在或无权访问');
    }
    const { data: sharedData, error: sharedError } = await sb
      .from('image_reference_assets')
      .select('id, role, label, storage_bucket, storage_path, mime_type')
      .is('deleted_at', null)
      .in('id', missingIds);
    if (sharedError || !sharedData || sharedData.length !== missingIds.length) {
      throw new Error('参考图不存在或无权访问');
    }
    rows.push(...(sharedData as typeof rows));
  }

  const byId = new Map(rows.map((row) => [row.id, row]));
  return Promise.all(
    referenceImageIds.map(async (id) => {
      const row = byId.get(id);
      if (!row) {
        throw new Error('参考图不存在或无权访问');
      }
      const { data: signed, error: signedError } = await sb.storage
        .from(row.storage_bucket)
        .createSignedUrl(row.storage_path, 60 * 60);
      if (signedError || !signed?.signedUrl) {
        console.error('[ImageGenerate] reference signed URL failed:', {
          id: row.id,
          storageBucket: row.storage_bucket,
          storagePath: row.storage_path,
          error: signedError
        });
        throw new Error('参考图签名失败，请稍后再试');
      }
      return {
        id: row.id,
        role: row.role,
        label: row.label || undefined,
        storageBucket: row.storage_bucket,
        storagePath: row.storage_path,
        mimeType: row.mime_type,
        signedUrl: signed.signedUrl
      };
    })
  );
}

async function resolveReferenceImageSizes(
  sb: SupabaseClient,
  userId: string,
  referenceImageIds: string[],
  moodboard?: MoodboardConditioning
): Promise<Array<{ width: number; height: number }>> {
  const uniqueIds = Array.from(new Set(referenceImageIds.filter(Boolean)));
  if (uniqueIds.length === 0) return [];
  const { data: ownedData, error } = await sb
    .from('image_reference_assets')
    .select('id, width, height')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .in('id', uniqueIds);
  if (error) {
    console.error('[ImageGenerate] reference size load failed:', error);
    return [];
  }
  const rows = (ownedData || []) as Array<{
    id: string;
    width: number | null;
    height: number | null;
  }>;
  const ownedIds = new Set(rows.map((row) => row.id));
  const missingIds = uniqueIds.filter((id) => !ownedIds.has(id));
  if (missingIds.length > 0) {
    const authorizedIds = await getAuthorizedMoodboardReferenceIds(
      sb,
      userId,
      moodboard,
      missingIds
    );
    if (authorizedIds.size === missingIds.length) {
      const { data: sharedData, error: sharedError } = await sb
        .from('image_reference_assets')
        .select('id, width, height')
        .is('deleted_at', null)
        .in('id', missingIds);
      if (!sharedError && sharedData) {
        rows.push(
          ...(sharedData as typeof rows).filter((row) =>
            authorizedIds.has(row.id)
          )
        );
      }
    }
  }
  const byId = new Map(rows.map((row) => [row.id, row]));
  return uniqueIds.map((id) => {
    const row = byId.get(id);
    return {
      width: Number(row?.width) > 0 ? Number(row?.width) : 0,
      height: Number(row?.height) > 0 ? Number(row?.height) : 0
    };
  });
}

async function resolveSourceGenerationReference(
  sb: SupabaseClient,
  userId: string,
  sourceGenerationId?: string
): Promise<ResolvedImageReference | null> {
  if (!sourceGenerationId) return null;

  const { data, error } = await sb
    .from('image_generations')
    .select('id, image_url, metadata')
    .eq('id', sourceGenerationId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) {
    console.error('[ImageGenerate] source generation load failed:', {
      userId,
      sourceGenerationId,
      error
    });
    throw new Error('源图片不存在或无权访问');
  }

  const metadata =
    data.metadata && typeof data.metadata === 'object'
      ? (data.metadata as Record<string, unknown>)
      : {};
  const storageBucket =
    typeof metadata.storageBucket === 'string' ? metadata.storageBucket : '';
  const storagePath =
    typeof metadata.storagePath === 'string' ? metadata.storagePath : '';
  if (!storageBucket || !storagePath) {
    throw new Error('源图片缺少可编辑的存储信息');
  }

  const { data: signed, error: signedError } = await sb.storage
    .from(storageBucket)
    .createSignedUrl(storagePath, 60 * 60);
  if (signedError || !signed?.signedUrl) {
    console.error('[ImageGenerate] source generation signed URL failed:', {
      sourceGenerationId,
      storageBucket,
      storagePath,
      error: signedError
    });
    throw new Error('源图片签名失败，请稍后再试');
  }

  return {
    id: sourceGenerationId,
    role: 'source',
    label: 'Source image',
    storageBucket,
    storagePath,
    mimeType: 'image/png',
    signedUrl: signed.signedUrl
  };
}

export function getErrorMessage(
  error: unknown,
  fallback = '图片生成失败'
): string {
  return error instanceof Error ? error.message : fallback;
}

function shouldAllowOpenAICompatibleTuziFallback(
  input?: Pick<
    SanitizedImageGenerateRequest,
    'imageCount' | 'imageSize' | 'model'
  >
): boolean {
  if (!input || input.model !== PREFERRED_TUZI_IMAGE_MODEL) return false;
  const mode = String(
    process.env.OPENAI_COMPAT_IMAGE_TUZI_FALLBACK_MODE || 'all'
  )
    .trim()
    .toLowerCase();
  if (['0', 'false', 'off', 'disabled', 'none'].includes(mode)) {
    return false;
  }
  if (['heavy', 'direct', 'direct-only'].includes(mode)) {
    return (
      input.imageCount >= 4 ||
      getKrillImageResolutionTier(input.imageSize) === '4k'
    );
  }
  return true;
}

function shouldAllowOpenAICompatibleKrillFallback(
  input?: Pick<
    SanitizedImageGenerateRequest,
    'imageSize' | 'model' | 'promptImageSize'
  >
): boolean {
  if (!input || input.model !== PREFERRED_TUZI_IMAGE_MODEL) return false;
  if (isTruthyEnv(process.env.OPENAI_COMPAT_IMAGE_DISABLE_KRILL_FALLBACK)) {
    return false;
  }
  return Boolean(
    (process.env.KRILL_IMAGE_API_KEY || process.env.KRILL_API_KEY) &&
    isKrillImageResolutionEnabled(input)
  );
}

function shouldAllowTuziOpenAICompatibleFallback(
  input?: Pick<SanitizedImageGenerateRequest, 'model'>
): boolean {
  if (!input) return false;
  if (isGptImage25Model(input.model)) {
    const config = resolveOpenAICompatibleImageConfig();
    return Boolean(
      config.enabled &&
      config.apiBaseUrl &&
      config.apiKey &&
      isSupportedChaoGptImage25ApiModel(config.model) &&
      isChaojitudouOpenAICompatibleHost(config.apiBaseUrl)
    );
  }
  if (input.model !== PREFERRED_TUZI_IMAGE_MODEL) return false;
  if (!isTruthyEnv(process.env.TUZI_ENABLE_OPENAI_COMPAT_FALLBACK)) {
    return false;
  }
  const config = resolveOpenAICompatibleImageConfig();
  return Boolean(
    config.enabled && config.apiBaseUrl && config.apiKey && config.model
  );
}

export function getImageProviderFallbackChain(
  requestedProvider: ImageProvider,
  input?: Pick<
    SanitizedImageGenerateRequest,
    'imageCount' | 'imageSize' | 'model' | 'promptImageSize'
  >
): ImageProvider[] {
  const fallbacks: ImageProvider[] = [];
  if (
    requestedProvider === 'openai' &&
    shouldAllowOpenAICompatibleKrillFallback(input)
  ) {
    fallbacks.push('krill');
  }
  if (
    requestedProvider === 'openai' &&
    shouldAllowOpenAICompatibleTuziFallback(input) &&
    !isTruthyEnv(process.env.OPENAI_COMPAT_IMAGE_DISABLE_TUZI_FALLBACK) &&
    !isTruthyEnv(process.env.OPENAI_DISABLE_TUZI_FALLBACK) &&
    buildTuziImageAttemptPlan(PREFERRED_TUZI_IMAGE_MODEL, {
      imageCount: input?.imageCount,
      imageSize: input?.imageSize
    }).length > 0
  ) {
    fallbacks.push('tuzi');
  }
  if (
    requestedProvider === 'krill' &&
    !isTruthyEnv(process.env.KRILL_DISABLE_TUZI_FALLBACK)
  ) {
    fallbacks.push('tuzi');
  }
  if (
    requestedProvider === 'tuzi' &&
    shouldAllowOpenAICompatibleKrillFallback(input)
  ) {
    fallbacks.push('krill');
    if (shouldAllowTuziOpenAICompatibleFallback(input)) {
      fallbacks.push('openai');
    }
  }
  if (
    requestedProvider === 'tuzi' &&
    shouldAllowTuziOpenAICompatibleFallback(input)
  ) {
    fallbacks.push('openai');
  }
  return Array.from(new Set(fallbacks));
}

export function getTuziSingleImageRescueAttemptPlanCount(
  model: ModelId = PREFERRED_TUZI_IMAGE_MODEL
): number {
  return buildTuziImageAttemptPlan(model, {
    imageCount: 1
  }).length;
}

export function getTuziSingleImageRescueDiagnostics(
  model: ModelId = PREFERRED_TUZI_IMAGE_MODEL
): Record<string, unknown> {
  return {
    ...getTuziImageRoutingDiagnostics(model, {
      imageCount: 1
    })
  };
}

function getImageProviderExecutionChain(
  requestedProvider: ImageProvider,
  disableProviderFallback?: boolean,
  input?: Pick<
    SanitizedImageGenerateRequest,
    'imageCount' | 'imageSize' | 'model'
  >
): ImageProvider[] {
  const chain = disableProviderFallback
    ? [requestedProvider]
    : [
        requestedProvider,
        ...getImageProviderFallbackChain(requestedProvider, input)
      ];
  return Array.from(new Set(chain));
}

function getProviderHealthRecord(
  options: ImageGenerationRunOptions,
  route: { provider: string; model: string; channel?: string | null }
) {
  return options.providerHealthLookup?.get(getImageProviderHealthKey(route));
}

function shouldSkipOpenAICompatibleFallbackModel(
  model: string,
  options: ImageGenerationRunOptions
): boolean {
  return shouldSkipImageProviderFallbackRoute(
    getProviderHealthRecord(options, {
      provider: 'openai',
      model,
      channel: 'openai-compatible'
    })
  );
}

function shouldSkipProviderFallbackByHealth(
  provider: ImageProvider,
  input: SanitizedImageGenerateRequest,
  options: ImageGenerationRunOptions
): boolean {
  if (provider === 'tuzi') {
    const attempts = filterTuziAttemptsForLock(
      buildTuziImageAttemptPlan(input.model, {
        imageCount: input.imageCount,
        imageSize: input.imageSize
      }),
      options.lockedTuziAttempt
    );
    if (attempts.length === 0) return false;
    return attempts.every((attempt) =>
      shouldSkipImageProviderFallbackRoute(
        getProviderHealthRecord(options, {
          provider: 'tuzi',
          model: attempt.model,
          channel: attempt.channel
        })
      )
    );
  }

  if (provider === 'krill') {
    const record = getProviderHealthRecord(options, {
      provider: 'krill',
      model: getKrillImageModel(input),
      channel: KRILL_IMAGE_CHANNEL
    });
    if (!record || record.healthState === 'insufficient_data') return false;
    if (record.authErrorCount > 0) return true;
    return shouldSkipImageProviderFallbackRoute(record);
  }

  return false;
}

function shouldSkipOpenAICompatiblePrimaryByHealth({
  input,
  options,
  providers
}: {
  input: SanitizedImageGenerateRequest;
  options: ImageGenerationRunOptions;
  providers: ImageProvider[];
}): boolean {
  if (providers.length <= 1) return false;
  const record = getProviderHealthRecord(options, {
    provider: 'openai',
    model: getOpenAICompatibleImageModel(input),
    channel: 'openai-compatible'
  });
  return shouldSkipImageProviderFallbackRoute(record);
}

export function isProviderResourceExhaustedMessage(message: string): boolean {
  return /资源不足|稍后再试|无可用渠道|没有可用渠道|通道繁忙|渠道繁忙|当前没有(?:健康)?可用(?:的)?(?:生成)?渠道|no available channel|no route available|channel unavailable|channel busy|resource exhausted|insufficient resources|capacity|overloaded|busy|try again later/i.test(
    message
  );
}

function isProviderChannelBusyMessage(message: string): boolean {
  return /无可用渠道|没有可用渠道|通道繁忙|渠道繁忙|当前没有(?:健康)?可用(?:的)?(?:生成)?渠道|no available channel|no route available|channel unavailable|channel busy/i.test(
    message
  );
}

function isLikelyPolicyError(message: string): boolean {
  return /policy|safety|moderation|blocked|unsafe|sexual|nudity|erotic|adult|违规|安全|审核|拒绝|色情|情色|成人|裸露|擦边/i.test(
    message
  );
}

function getImageGenerationFailureMessage(
  error: unknown,
  input?: SanitizedImageGenerateRequest
): string {
  const message = getErrorMessage(error);
  if (!isLikelyPolicyError(message)) {
    return message;
  }
  const providerRequestId = extractProviderRequestId(message);
  const suffix = providerRequestId ? ` (request id: ${providerRequestId})` : '';
  if (input && isCloudDenoiseInput(input)) {
    return `上游模型拒绝处理这张参考图，通常是图片内容触发了安全策略。本次积分会自动退回；请更换符合要求的图片，或使用本地保真清理。${suffix}`;
  }
  return `图片生成被安全系统拦截：提示词可能包含性、裸露或擦边内容。请点击编辑调整提示词后重试。${suffix}`;
}

function mapOpenAICompatibleFailureCategory(
  category: OpenAICompatibleImageErrorCategory
): ImageGenerationFailureCategory {
  if (category === 'timeout') return 'provider_timeout';
  if (category === 'rate_limit') return 'provider_rate_limit';
  if (category === 'policy') return 'provider_policy';
  if (category === 'provider_unavailable' || category === 'network') {
    return 'provider_unavailable';
  }
  if (category === 'configuration' || category === 'not_enabled') {
    return 'provider_unavailable';
  }
  return 'provider_http';
}

function getOpenAICompatibleFailureDetails(
  error: OpenAICompatibleImageProviderError
): ImageGenerationFailureDetails {
  const category = mapOpenAICompatibleFailureCategory(error.category);
  return {
    code: error.failureCode || `OPENAI_COMPAT_${error.category.toUpperCase()}`,
    category,
    retryable: error.retryable,
    httpStatus: error.httpStatus,
    provider: 'openai',
    model: error.model
  };
}

function getFailureDetails(error: unknown): ImageGenerationFailureDetails {
  const message = getErrorMessage(error);
  if (error instanceof PipelineDeadlineError) {
    return {
      code: 'IMAGE_PIPELINE_DEADLINE',
      category: 'pipeline_deadline',
      retryable: true
    };
  }
  if (error instanceof OpenAICompatibleImageProviderError) {
    return getOpenAICompatibleFailureDetails(error);
  }
  if (error instanceof ProviderTimeoutError) {
    return {
      code: 'PROVIDER_TIMEOUT',
      category: 'provider_timeout',
      retryable: true,
      provider: error.provider,
      model: error.model
    };
  }
  if (error instanceof ProviderHttpError) {
    const category: ImageGenerationFailureCategory =
      error.httpStatus === 429
        ? 'provider_rate_limit'
        : isProviderChannelBusyMessage(error.message)
          ? 'provider_unavailable'
          : isProviderResourceExhaustedMessage(error.message)
            ? 'provider_rate_limit'
            : isProviderUnavailableHttpStatus(error.httpStatus)
              ? 'provider_unavailable'
              : isLikelyPolicyError(error.message)
                ? 'provider_policy'
                : 'provider_http';
    return {
      code: category.toUpperCase(),
      category,
      retryable: ['provider_rate_limit', 'provider_unavailable'].includes(
        category
      ),
      httpStatus: error.httpStatus,
      provider: error.provider,
      model: error.model
    };
  }
  if (/credit/i.test(message)) {
    return { code: 'CREDIT_ERROR', category: 'credit', retryable: false };
  }
  if (/prompt is too long|invalid|required/i.test(message)) {
    return {
      code: 'INVALID_IMAGE_REQUEST',
      category: 'invalid_request',
      retryable: false
    };
  }
  if (isLikelyPolicyError(message)) {
    return {
      code: 'PROVIDER_POLICY',
      category: 'provider_policy',
      retryable: false
    };
  }
  return {
    code: 'IMAGE_GENERATION_FAILED',
    category: 'unknown',
    retryable: true
  };
}

export function toWebRequest(request: VercelRequest): Request {
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) {
      value.forEach((item) => headers.append(key, item));
    } else if (typeof value === 'string') {
      headers.set(key, value);
    }
  }

  const protocolHeader = request.headers['x-forwarded-proto'];
  const hostHeader =
    request.headers['x-forwarded-host'] || request.headers.host;
  const protocol = Array.isArray(protocolHeader)
    ? protocolHeader[0]
    : protocolHeader || 'https';
  const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;
  const url = `${protocol}://${host || 'webtomind.com'}${request.url || '/api/image/generate'}`;
  const method = request.method || 'GET';
  const hasBody = method !== 'GET' && method !== 'HEAD';
  const body =
    hasBody && request.body !== undefined
      ? typeof request.body === 'string'
        ? request.body
        : JSON.stringify(request.body)
      : undefined;

  return new Request(url, {
    method,
    headers,
    body
  });
}

export async function sendWebResponse(
  response: Response,
  vercelResponse: VercelResponse
): Promise<void> {
  response.headers.forEach((value, key) => {
    vercelResponse.setHeader(key, value);
  });
  const body = await response.text();
  vercelResponse.statusCode = response.status;
  vercelResponse.end(body);
}

async function uploadGeneratedImage(
  sb: SupabaseClient,
  userId: string,
  generated: GeneratedImage
): Promise<StoredImage> {
  const parsed = parseDataUrl(generated.dataUrl);
  if (!parsed) {
    throw new Error('Generated image was not a data URL');
  }

  const ext = parsed.mimeType.includes('webp')
    ? 'webp'
    : parsed.mimeType.includes('jpeg')
      ? 'jpg'
      : 'png';
  const date = new Date();
  const month = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`;
  const random = Math.random().toString(36).slice(2, 8);
  const baseName = `image-create-${Date.now()}-${random}`;
  const filePath = `${userId}/${month}/${baseName}.${ext}`;
  const bytes = base64ToBytes(parsed.base64);
  const storage = createMediaStorageAdapter({
    supabase: sb,
    defaultBucket: GENERATED_IMAGE_BUCKET
  });

  let originalMetadata: { width?: number; height?: number } | null = null;
  try {
    originalMetadata = readImageDimensions(bytes, parsed.mimeType);
  } catch (metadataError) {
    console.warn('[ImageGenerate] read image metadata failed:', {
      path: filePath,
      error: metadataError
    });
  }

  const originalRecord = await storage.putObject({
    key: filePath,
    body: bytes,
    contentType: parsed.mimeType,
    cacheControl: '31536000',
    width: originalMetadata?.width,
    height: originalMetadata?.height,
    byteSize: bytes.byteLength
  });

  const signedUrl = await storage.signReadUrl({
    locator: {
      provider: originalRecord.provider,
      bucket: originalRecord.bucket,
      key: originalRecord.key
    },
    expiresIn: 60 * 60 * 24,
    fallbackUrl: originalRecord.publicUrl
  });

  if (!signedUrl) {
    await storage.deleteObjects([
      {
        provider: originalRecord.provider,
        bucket: originalRecord.bucket,
        key: originalRecord.key
      }
    ]);
    throw new Error('Signed URL failed: empty URL');
  }

  let storedImage: StoredImage = {
    provider: originalRecord.provider,
    bucket: originalRecord.bucket,
    path: originalRecord.key,
    signedUrl,
    width: originalMetadata?.width,
    height: originalMetadata?.height,
    byteSize: bytes.byteLength,
    mediaRecord: originalRecord
  };

  storedImage = await maybeUpscaleStoredImageWithCloudflare({
    storage,
    generated,
    storedImage,
    sourceBytes: bytes,
    sourceMimeType: parsed.mimeType
  });

  console.info('[ImageGenerate] derivative image upload skipped:', {
    path: filePath,
    reason: 'worker-safe-image-pipeline',
    cloudflareUpscaled: Boolean(storedImage.upscale)
  });

  return storedImage;
}

async function deleteStoredImage(
  sb: SupabaseClient,
  storedImage: StoredImage | null
): Promise<void> {
  if (!storedImage) return;
  const adapters = createMediaStorageAdapters({
    supabase: sb,
    defaultBucket: storedImage.bucket || GENERATED_IMAGE_BUCKET
  });
  const locators = [
    storedImage.mediaRecord,
    storedImage.thumbnail?.mediaRecord,
    storedImage.preview?.mediaRecord
  ]
    .map((record) =>
      record
        ? {
            provider: record.provider,
            bucket: record.bucket,
            key: record.key
          }
        : null
    )
    .filter(
      (
        locator
      ): locator is {
        provider: MediaStorageProvider;
        bucket: string;
        key: string;
      } => Boolean(locator)
    );

  if (locators.length === 0) {
    locators.push(
      ...[
        storedImage.path,
        storedImage.thumbnail?.path,
        storedImage.preview?.path
      ]
        .filter((path): path is string => Boolean(path))
        .map((path) => ({
          provider: storedImage.provider || 'supabase',
          bucket: storedImage.bucket,
          key: path
        }))
    );
  }

  for (const provider of ['supabase', 'r2'] as MediaStorageProvider[]) {
    const adapter = adapters[provider];
    const providerLocators = locators.filter(
      (locator) => locator.provider === provider
    );
    if (!adapter || providerLocators.length === 0) continue;
    try {
      await adapter.deleteObjects(providerLocators);
    } catch (error) {
      console.error('[ImageGenerate] cleanup image failed:', error);
    }
  }
}

async function deleteStoredImages(
  sb: SupabaseClient,
  storedImages: StoredImage[]
): Promise<void> {
  await Promise.all(storedImages.map((item) => deleteStoredImage(sb, item)));
}

async function deleteGenerationRecord(
  sb: SupabaseClient,
  generationId: string | null
): Promise<void> {
  if (!generationId) return;
  const { error } = await sb
    .from('image_generations')
    .delete()
    .eq('id', generationId);
  if (error) {
    console.error('[ImageGenerate] cleanup generation record failed:', error);
  }
}

async function deleteGenerationRecords(
  sb: SupabaseClient,
  generationIds: string[]
): Promise<void> {
  await Promise.all(
    generationIds.map((generationId) =>
      deleteGenerationRecord(sb, generationId)
    )
  );
}

function buildGeneratedImageMediaObjectInputs({
  storedImage,
  userId,
  generationId,
  context
}: {
  storedImage: StoredImage;
  userId: string;
  generationId: string;
  context: {
    groupId: string;
    imageIndex: number;
    imageCount: number;
  };
}): MediaObjectRegistryInput[] {
  const baseMetadata = {
    source: 'image_create_page',
    groupId: context.groupId,
    imageIndex: context.imageIndex,
    imageCount: context.imageCount
  };
  const entries: Array<{
    kind: 'original' | 'thumbnail' | 'preview';
    record?: MediaObjectRecord;
  }> = [
    {
      kind: 'original',
      record: storedImage.mediaRecord || {
        provider: storedImage.provider || 'supabase',
        bucket: storedImage.bucket,
        key: storedImage.path,
        width: storedImage.width,
        height: storedImage.height,
        byteSize: storedImage.byteSize
      }
    },
    { kind: 'thumbnail', record: storedImage.thumbnail?.mediaRecord },
    { kind: 'preview', record: storedImage.preview?.mediaRecord }
  ];

  return entries
    .filter(
      (
        entry
      ): entry is {
        kind: 'original' | 'thumbnail' | 'preview';
        record: MediaObjectRecord;
      } => Boolean(entry.record)
    )
    .map((entry) => ({
      userId,
      ownerType: 'image_generation',
      ownerId: generationId,
      kind: entry.kind,
      record: entry.record,
      metadata: {
        ...baseMetadata,
        variant: entry.kind
      }
    }));
}

async function recordImageGeneration(
  sb: SupabaseClient,
  input: SanitizedImageGenerateRequest,
  generated: GeneratedImage,
  storedImage: StoredImage,
  userId: string,
  context: {
    groupId: string;
    imageIndex: number;
    imageCount: number;
    references?: ResolvedImageReference[];
  }
): Promise<string> {
  const resultAspectRatio = getResultAspectRatio(input);
  const resultImageSize = getResultImageSize(input);
  const mediaMetadata = buildMediaMetadata({
    existing: {
      source: 'image_create_page',
      sourceApp: input.sourceApp,
      appSlug: input.appSlug,
      appOperation: input.appOperation,
      sourceGenerationId: input.sourceGenerationId,
      editInstruction: input.editInstruction,
      editMode: input.editMode,
      creationContext: input.creationContext,
      requestedModel: input.model,
      requestedModelLabel: input.modelLabel,
      negativePromptSource: input.negativePrompt ? 'user' : 'none',
      promptMode: input.promptMode,
      recipeAudit: input.recipeAudit,
      promptAspectRatio: input.promptAspectRatio,
      promptImageSize: input.promptImageSize,
      controlAspectRatio: input.aspectRatio,
      controlImageSize: input.imageSize,
      resultImageSize,
      outputFormat: input.outputFormat,
      usedFallback: generated.usedFallback || false,
      ...getImageBatchConsistencyRequestMetadata(input),
      ...getGeneratedImageBatchLockMetadata(generated),
      providerOriginalWidth: generated.providerOriginalWidth,
      providerOriginalHeight: generated.providerOriginalHeight,
      requestedOutputSize: generated.requestedOutputSize,
      outputImageSizeConformed: generated.outputImageSizeConformed || undefined,
      cloudflareUpscaled: generated.cloudflareUpscaled || undefined,
      cloudflareUpscaleSourceWidth: generated.cloudflareUpscaleSourceWidth,
      cloudflareUpscaleSourceHeight: generated.cloudflareUpscaleSourceHeight,
      cloudflareUpscaleTargetWidth: generated.cloudflareUpscaleTargetWidth,
      cloudflareUpscaleTargetHeight: generated.cloudflareUpscaleTargetHeight,
      cloudflareUpscaleContentType: generated.cloudflareUpscaleContentType,
      cloudflareUpscaleByteSize: storedImage.upscale?.byteSize,
      referenceImageIds: input.referenceImageIds,
      referenceMode: input.referenceMode,
      referenceCount: input.referenceImageIds.length,
      characterCardIds: input.characterCardIds,
      characterReferenceGroups: input.characterReferenceGroups,
      referenceRoles: context.references?.map((item) => item.role) || [],
      groupId: context.groupId,
      imageIndex: context.imageIndex,
      imageCount: context.imageCount,
      requestedImageCount: input.imageCount,
      width: storedImage.width,
      height: storedImage.height,
      byteSize: storedImage.byteSize,
      thumbnailWidth: storedImage.thumbnail?.width,
      thumbnailHeight: storedImage.thumbnail?.height,
      thumbnailByteSize: storedImage.thumbnail?.byteSize,
      previewWidth: storedImage.preview?.width,
      previewHeight: storedImage.preview?.height,
      previewByteSize: storedImage.preview?.byteSize
    },
    storageProvider: storedImage.provider || 'supabase',
    original: storedImage.mediaRecord || {
      provider: storedImage.provider || 'supabase',
      bucket: storedImage.bucket,
      key: storedImage.path,
      width: storedImage.width,
      height: storedImage.height,
      byteSize: storedImage.byteSize
    },
    thumbnail: storedImage.thumbnail?.mediaRecord,
    preview: storedImage.preview?.mediaRecord
  });
  const { data, error } = await sb
    .from('image_generations')
    .insert({
      user_id: userId,
      image_url: storedImage.signedUrl,
      prompt: input.prompt,
      negative_prompt: input.negativePrompt || null,
      model_label: getGeneratedModelLabel(generated),
      provider: generated.provider,
      provider_model: generated.model,
      aspect_ratio: resultAspectRatio,
      quality: input.quality,
      asset_ids: input.assetIds,
      metadata: mediaMetadata
    })
    .select('id')
    .single();

  if (error) {
    console.error('[ImageGenerate] record insert failed:', error);
    throw new Error(`Generation record failed: ${error.message}`);
  }

  const generationId = data?.id || '';
  if (generationId) {
    await safeUpsertMediaObjectRecords(
      sb,
      buildGeneratedImageMediaObjectInputs({
        storedImage,
        userId,
        generationId,
        context
      }),
      { logPrefix: '[ImageGenerate] media_objects upsert failed' }
    );
  }

  return generationId;
}

async function recordImageGenerationAttempt(
  sb: SupabaseClient,
  userId: string,
  options: ImageGenerationRunOptions,
  attempt: ImageGenerationAttemptLogInput
): Promise<void> {
  const { error } = await sb.from('image_generation_attempts').insert({
    task_id: options.taskId || null,
    user_id: userId,
    request_mode: options.mode || 'sync',
    provider: attempt.provider,
    model: attempt.model,
    channel: attempt.channel || null,
    attempt_index: attempt.attemptIndex,
    started_at: attempt.startedAt.toISOString(),
    finished_at: attempt.finishedAt.toISOString(),
    duration_ms: getDurationMs(attempt.startedAt, attempt.finishedAt),
    status: attempt.status,
    error_category: attempt.errorDetails?.category || null,
    error_code: attempt.errorDetails?.code || null,
    error_message: attempt.errorMessage || null,
    provider_request_id: attempt.providerRequestId || null,
    metadata: {
      ...getImageAttemptRuntimeMetadata(),
      retryable: attempt.errorDetails?.retryable,
      httpStatus: attempt.errorDetails?.httpStatus,
      ...attempt.metadata
    }
  });

  if (error) {
    throw new Error(error.message);
  }
}

function getStringMetadataValue(
  metadata: Record<string, unknown> | undefined,
  key: string
): string | undefined {
  const value = metadata?.[key];
  return typeof value === 'string' && value ? value : undefined;
}

function getNumberMetadataValue(
  metadata: Record<string, unknown> | undefined,
  key: string
): number | undefined {
  const value = metadata?.[key];
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function getBooleanMetadataValue(
  metadata: Record<string, unknown> | undefined,
  key: string
): boolean | undefined {
  const value = metadata?.[key];
  return typeof value === 'boolean' ? value : undefined;
}

function getImageGenerationAttemptPhase(
  attempt: ImageGenerationAttemptLogInput
): string | undefined {
  const metadata = attempt.metadata;
  const phase = getStringMetadataValue(metadata, 'phase');
  if (phase) return phase;
  const isFallback =
    getBooleanMetadataValue(metadata, 'openAICompatibleFallbackAttempt') ||
    attempt.attemptIndex > 1;
  return isFallback ? 'fallback' : undefined;
}

function toImageGenerationAttemptDiagnostic(
  attempt: ImageGenerationAttemptLogInput
): ImageGenerationAttemptDiagnostic {
  const metadata = attempt.metadata;
  return {
    provider: attempt.provider,
    model: attempt.model,
    channel: attempt.channel,
    attemptIndex: attempt.attemptIndex,
    phase: getImageGenerationAttemptPhase(attempt),
    status: attempt.status,
    startedAt: attempt.startedAt.toISOString(),
    finishedAt: attempt.finishedAt.toISOString(),
    durationMs: getDurationMs(attempt.startedAt, attempt.finishedAt),
    errorCategory: attempt.errorDetails?.category,
    errorCode: attempt.errorDetails?.code,
    errorMessage: attempt.errorMessage,
    httpStatus:
      attempt.errorDetails?.httpStatus ||
      getNumberMetadataValue(metadata, 'httpStatus'),
    retryable:
      attempt.errorDetails?.retryable ??
      getBooleanMetadataValue(metadata, 'retryable'),
    providerRequestId: attempt.providerRequestId,
    requestedImageCount:
      getNumberMetadataValue(metadata, 'requestedImageCount') ||
      getNumberMetadataValue(metadata, 'requestedBatchImageCount'),
    effectiveImageCount: getNumberMetadataValue(
      metadata,
      'effectiveImageCount'
    ),
    providerRequestImageCount: getNumberMetadataValue(
      metadata,
      'providerRequestImageCount'
    ),
    accumulatedImageCount: getNumberMetadataValue(
      metadata,
      'accumulatedImageCount'
    ),
    usedFallback:
      getBooleanMetadataValue(metadata, 'openAICompatibleFallbackAttempt') ||
      getBooleanMetadataValue(metadata, 'usedFallback'),
    rescueProvider: getStringMetadataValue(metadata, 'rescueProvider') as
      | ImageProvider
      | undefined
  };
}

function getStoredImageDimension(
  storedImages: StoredGeneratedImage[],
  field: 'width' | 'height'
): number | undefined {
  const value = storedImages.find(
    (image) => typeof image[field] === 'number'
  )?.[field];
  return typeof value === 'number' ? value : undefined;
}

function buildImageGenerationTaskDiagnostics({
  input,
  attempts,
  chargedCredit,
  finalConsumed,
  refundedAmount,
  refundFailed,
  finalStatus,
  primaryImage,
  storedImages,
  resultImageSize,
  usedFallback,
  usedSingleImageRescue,
  skippedCrossChannelSupplement,
  failureDetails,
  options
}: {
  input: SanitizedImageGenerateRequest;
  attempts: ImageGenerationAttemptLogInput[];
  chargedCredit: {
    consumed: number;
    creditType?: string;
    creditBreakdown?: Record<string, number>;
  } | null;
  finalConsumed?: number;
  refundedAmount?: number;
  refundFailed?: boolean;
  finalStatus: 'succeeded' | 'failed';
  primaryImage?: GeneratedImage;
  storedImages?: StoredGeneratedImage[];
  resultImageSize?: string;
  usedFallback?: boolean;
  usedSingleImageRescue?: boolean;
  skippedCrossChannelSupplement?: boolean;
  failureDetails?: ImageGenerationFailureDetails;
  options: ImageGenerationRunOptions;
}): ImageGenerationTaskDiagnostics {
  return {
    requested: {
      provider: input.provider,
      model: input.model,
      imageCount: input.imageCount,
      imageSize: input.imageSize,
      aspectRatio: input.aspectRatio,
      quality: input.quality,
      outputFormat: input.outputFormat
    },
    attempts: attempts.map(toImageGenerationAttemptDiagnostic),
    final: {
      status: finalStatus,
      provider: primaryImage?.provider,
      model: primaryImage?.model,
      imageCount: storedImages?.length,
      requestedImageCount: input.imageCount,
      imageSize: resultImageSize,
      width: storedImages
        ? getStoredImageDimension(storedImages, 'width')
        : undefined,
      height: storedImages
        ? getStoredImageDimension(storedImages, 'height')
        : undefined,
      usedFallback,
      usedSingleImageRescue,
      skippedCrossChannelSupplement,
      failureCategory: failureDetails?.category,
      failureCode: failureDetails?.code
    },
    billing: {
      chargedCredits: chargedCredit?.consumed || 0,
      consumedCredits:
        finalConsumed ?? Math.max(0, chargedCredit?.consumed || 0),
      refundedCredits: refundedAmount || 0,
      creditType: chargedCredit?.creditType,
      refundFailed: Boolean(refundFailed),
      skipCreditCharge: Boolean(options.skipCreditCharge),
      prepaid: Boolean(options.prepaidCredit?.consumed),
      creditWaiverReason: options.creditWaiverReason
    }
  };
}

function isBlockingPartialImageFailure(
  failureDetails: ImageGenerationFailureDetails
): boolean {
  return ['provider_policy', 'invalid_request', 'credit'].includes(
    failureDetails.category
  );
}

async function qualifyReferralAfterImageGeneration(
  sb: SupabaseClient,
  userId: string
): Promise<ImageGenerationSuccessPayload['referralReward'] | undefined> {
  const { data, error } = await sb.rpc('qualify_pending_referral', {
    p_referee_id: userId,
    p_activation_event: 'image_generation_success'
  });

  if (error) {
    console.warn('[ImageGenerate] qualify_pending_referral failed:', {
      userId,
      message: error.message
    });
    return undefined;
  }

  if (!data || typeof data !== 'object') {
    return undefined;
  }

  const result = data as {
    qualified?: unknown;
    reward_amount?: unknown;
    reason?: unknown;
    already_completed?: unknown;
  };
  const qualified = result.qualified === true;
  if (!qualified || result.already_completed === true) {
    return undefined;
  }

  const rewardAmount = Number(result.reward_amount || 0);
  return {
    qualified,
    ...(Number.isFinite(rewardAmount) && rewardAmount > 0
      ? { rewardAmount }
      : {}),
    status: qualified ? 'completed' : 'pending',
    ...(typeof result.reason === 'string' ? { reason: result.reason } : {})
  };
}

async function generateWithOpenAI(
  prompt: string,
  input: SanitizedImageGenerateRequest,
  options: ImageGenerationRunOptions = {},
  references: ResolvedImageReference[] = [],
  mask?: ResolvedImageReference
): Promise<GeneratedImage[]> {
  const config = resolveOpenAICompatibleImageConfig();
  const primaryModel = getOpenAICompatibleImageModel(input);
  const fallbackModel = isGptImage25Model(input.model)
    ? undefined
    : getOpenAICompatibleImageFallbackModel(primaryModel);
  const plannedModels = fallbackModel
    ? [primaryModel, fallbackModel]
    : [primaryModel];
  const models = plannedModels.filter(
    (model, index) =>
      index === 0 || !shouldSkipOpenAICompatibleFallbackModel(model, options)
  );
  const apiBaseUrl = config.apiBaseUrl;
  const providerImageSize = getProviderImageSize(input);
  const skippedFallbackModels = plannedModels
    .slice(1)
    .filter((model) => !models.includes(model));
  const baseMetadata = {
    providerVariant: 'openai-compatible',
    attemptedApiHost: redactApiHost(apiBaseUrl),
    requestedProvider: 'openai',
    requestedModel: input.model,
    primaryModel,
    fallbackModel: fallbackModel || null,
    skippedFallbackModels,
    referenceCount: references.length,
    effectiveImageCount: input.imageCount,
    openAICompatibleTimeoutMs: options.openAICompatibleTimeoutMs || null
  };

  console.info('[ImageGenerate] calling OpenAI-compatible image provider:', {
    model: primaryModel,
    fallbackModel,
    skippedFallbackModels,
    mode: options.mode || 'sync',
    taskId: options.taskId,
    apiHost: redactApiHost(apiBaseUrl),
    imageSize: providerImageSize || 'provider-default',
    quality: input.quality,
    outputFormat: input.outputFormat,
    promptMode: input.promptMode,
    promptChars: prompt.length,
    negativePromptChars: input.negativePrompt?.length || 0,
    referenceCount: references.length,
    referenceMode: input.referenceMode,
    imageCount: input.imageCount
  });

  let resolvedCompatibleReferences:
    | OpenAICompatibleImageReference[]
    | undefined;
  let lastError: unknown;
  const providerBatchSize =
    options.mode === 'queued' && primaryModel === 'gpt-image-2'
      ? getOpenAICompatibleProviderBatchSize({
          apiBaseUrl,
          model: primaryModel,
          imageCount: input.imageCount
        })
      : input.imageCount;
  const splitMultiImageRequest = providerBatchSize < input.imageCount;
  let attemptOrdinal = 0;
  let resolvedMaskReference: OpenAICompatibleImageReference | undefined;
  if (mask) {
    resolvedMaskReference = await resolveOpenAICompatibleMaskReference(mask);
  }
  const isChaojitudouHost = isChaojitudouOpenAICompatibleHost(apiBaseUrl);
  const streamChaojitudou = isTruthyEnv(
    process.env.OPENAI_COMPAT_IMAGE_STREAMING_ALLOW_CHAO
  );

  for (const [attemptIndex, model] of models.entries()) {
    const openAICompatibleStreamingRequested =
      Boolean(config.supportsStreaming) &&
      /^gpt-image/i.test(model) &&
      (!isChaojitudouHost || streamChaojitudou);
    const metadata = {
      ...baseMetadata,
      effectiveModel: model,
      openAICompatibleBatchMode: splitMultiImageRequest
        ? providerBatchSize === 1
          ? 'split_single_requests'
          : 'split_native_batches'
        : 'single_request',
      openAICompatibleProviderBatchSize: providerBatchSize,
      openAICompatibleStreamingEnabled: Boolean(config.supportsStreaming),
      openAICompatibleStreamingAllowChao: streamChaojitudou,
      openAICompatibleStreamingRequested,
      openAICompatiblePartialImages: config.partialImages ?? null,
      openAICompatibleFallbackAttempt: attemptIndex > 0
    };
    const batchCount = Math.ceil(input.imageCount / providerBatchSize);
    const generatedBatch: GeneratedImage[] = [];
    try {
      for (let batchIndex = 0; batchIndex < batchCount; batchIndex += 1) {
        attemptOrdinal += 1;
        const startedAt = new Date();
        const remainingImageCount =
          input.imageCount - batchIndex * providerBatchSize;
        const requestImageCount = Math.min(
          providerBatchSize,
          remainingImageCount
        );
        const attemptMetadata = {
          ...metadata,
          requestedBatchImageCount: input.imageCount,
          providerRequestImageCount: requestImageCount,
          splitBatchIndex: splitMultiImageRequest ? batchIndex + 1 : null,
          splitBatchTotal: splitMultiImageRequest ? batchCount : null
        };
        try {
          const compatibleImages =
            references.length > 0
              ? await editOpenAICompatibleImage({
                  prompt,
                  imageCount: requestImageCount,
                  size: providerImageSize,
                  quality: input.quality,
                  outputFormat: input.outputFormat,
                  model,
                  timeoutMs: options.openAICompatibleTimeoutMs,
                  clientTaskId: buildOpenAICompatibleClientTaskId({
                    taskId: options.taskId,
                    phase: options.attemptMetadata?.phase,
                    model,
                    attemptOrdinal,
                    requestImageCount,
                    size: providerImageSize
                  }),
                  references: (resolvedCompatibleReferences ||=
                    await resolveOpenAICompatibleReferences(references)),
                  mask: resolvedMaskReference
                })
              : await generateOpenAICompatibleImage({
                  prompt,
                  imageCount: requestImageCount,
                  size: providerImageSize,
                  quality: input.quality,
                  outputFormat: input.outputFormat,
                  model,
                  timeoutMs: options.openAICompatibleTimeoutMs,
                  clientTaskId: buildOpenAICompatibleClientTaskId({
                    taskId: options.taskId,
                    phase: options.attemptMetadata?.phase,
                    model,
                    attemptOrdinal,
                    requestImageCount,
                    size: providerImageSize
                  })
                });
          const generated = compatibleImages.map((image) => ({
            ...mapOpenAICompatibleGeneratedImage(image, input),
            usedFallback: attemptIndex > 0
          }));
          generatedBatch.push(...generated);
          await options.attemptLogger?.({
            provider: 'openai',
            model,
            channel: 'openai-compatible',
            attemptIndex: attemptOrdinal,
            startedAt,
            finishedAt: new Date(),
            status: 'succeeded',
            metadata: {
              ...attemptMetadata,
              lockedProvider: 'openai',
              lockedModel: model,
              lockedChannel: 'openai-compatible',
              lockedApiHost: redactApiHost(apiBaseUrl),
              effectiveImageCount: generated.length,
              accumulatedImageCount: generatedBatch.length
            }
          });
        } catch (error) {
          lastError = error;
          const rawAttemptError = getErrorMessage(error);
          const failureDetails = getFailureDetails(error);
          await options.attemptLogger?.({
            provider: 'openai',
            model,
            channel: 'openai-compatible',
            attemptIndex: attemptOrdinal,
            startedAt,
            finishedAt: new Date(),
            status: 'failed',
            errorDetails: failureDetails,
            errorMessage: rawAttemptError,
            providerRequestId: isOpenAICompatibleImageProviderPendingError(
              error
            )
              ? error.providerTaskId
              : extractProviderRequestId(rawAttemptError),
            metadata: {
              ...attemptMetadata,
              accumulatedImageCount: generatedBatch.length
            }
          });
          if (
            generatedBatch.length > 0 &&
            !isBlockingPartialImageFailure(failureDetails)
          ) {
            return generatedBatch;
          }
          throw error;
        }
      }
      if (generatedBatch.length > 0) return generatedBatch;
    } catch (error) {
      lastError = error;
      const rawAttemptError = getErrorMessage(error);
      const canFallback =
        attemptIndex < models.length - 1 &&
        shouldFallbackOpenAICompatibleModel(error);
      console.warn('[ImageGenerate] OpenAI-compatible attempt failed:', {
        model,
        fallbackModel: canFallback ? models[attemptIndex + 1] : undefined,
        mode: options.mode || 'sync',
        taskId: options.taskId,
        retryable: getFailureDetails(error).retryable,
        reason: rawAttemptError
      });
      if (!canFallback) break;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('OpenAI-compatible image generation failed');
}

async function resolveOpenAICompatibleReferences(
  references: ResolvedImageReference[]
): Promise<OpenAICompatibleImageReference[]> {
  return Promise.all(
    references.map(async (reference, index) => {
      const response = await fetch(reference.signedUrl);
      if (!response.ok) {
        throw new OpenAICompatibleImageProviderError(
          `OpenAI-compatible reference image download failed: ${response.status}`,
          {
            category: 'provider_response',
            httpStatus: response.status,
            retryable: false
          }
        );
      }
      return {
        data: await response.arrayBuffer(),
        mimeType: reference.mimeType || 'image/png',
        fileName: getReferenceFileName(reference, index)
      };
    })
  );
}

function mapOpenAICompatibleGeneratedImage(
  image: OpenAICompatibleGeneratedImage,
  input: SanitizedImageGenerateRequest
): GeneratedImage {
  return {
    dataUrl: image.dataUrl,
    mimeType: image.mimeType,
    provider: 'openai',
    model: input.model,
    modelLabel: input.modelLabel,
    providerApiBaseUrl: redactApiHost(image.providerApiBaseUrl)
  };
}

async function resolveOpenAICompatibleMaskReference(
  mask: ResolvedImageReference
): Promise<OpenAICompatibleImageReference> {
  const response = await fetch(mask.signedUrl);
  if (!response.ok) {
    throw new OpenAICompatibleImageProviderError(
      `OpenAI-compatible mask image download failed: ${response.status}`,
      {
        category: 'provider_response',
        httpStatus: response.status,
        retryable: false
      }
    );
  }
  return {
    data: await response.arrayBuffer(),
    mimeType: mask.mimeType || 'image/png',
    fileName: 'mask.png'
  };
}

function buildOpenAICompatibleClientTaskId({
  taskId,
  phase,
  model,
  attemptOrdinal,
  requestImageCount,
  size
}: {
  taskId?: string;
  phase?: unknown;
  model: string;
  attemptOrdinal: number;
  requestImageCount: number;
  size?: string;
}): string | undefined {
  if (!taskId) return undefined;
  const phaseText =
    typeof phase === 'string' && phase.trim() ? phase.trim() : 'initial';
  return [
    'wtm',
    taskId,
    phaseText,
    model,
    `a${attemptOrdinal}`,
    `n${requestImageCount}`,
    size || 'auto'
  ]
    .join(':')
    .replace(/[^a-zA-Z0-9._:-]/g, '-')
    .slice(0, 160);
}

function redactApiHost(apiBaseUrl: string | undefined): string | undefined {
  if (!apiBaseUrl) return undefined;
  try {
    return new URL(apiBaseUrl).host;
  } catch {
    return apiBaseUrl
      .replace(/^https?:\/\//i, '')
      .replace(/\/.*$/, '')
      .trim();
  }
}

function getKrillTimeoutMs(options: ImageGenerationRunOptions): number {
  if (options.mode !== 'queued') return KRILL_IMAGE_TIMEOUT_MS;
  const pipelineBudget =
    (options.pipelineDeadlineMs || QUEUED_PIPELINE_DEADLINE_MS) -
    QUEUED_TUZI_DEADLINE_RESERVE_MS;
  return Math.max(
    30000,
    Math.min(QUEUED_KRILL_IMAGE_TIMEOUT_MS, pipelineBudget)
  );
}

async function mapKrillImageResponse(
  data: { data?: Array<{ b64_json?: string; url?: string }> },
  input: SanitizedImageGenerateRequest,
  model: string,
  apiBaseUrl?: string
): Promise<GeneratedImage[]> {
  const images: Array<GeneratedImage | null> = await Promise.all(
    (data.data || []).slice(0, input.imageCount).map(async (item) => {
      if (item?.b64_json) {
        const fallbackMimeType = getOutputMimeType(input.outputFormat);
        const encoded = dataUrlFromProviderBase64(
          item.b64_json,
          fallbackMimeType
        );
        return {
          dataUrl: encoded.dataUrl,
          mimeType: encoded.mimeType,
          provider: 'krill' as const,
          model,
          providerApiBaseUrl: apiBaseUrl
        };
      }
      if (item?.url) {
        const downloaded = await downloadImageAsDataUrl(item.url);
        return {
          ...downloaded,
          provider: 'krill' as const,
          model,
          providerApiBaseUrl: apiBaseUrl
        };
      }
      return null;
    })
  );
  const generated = images.filter(
    (item): item is GeneratedImage => item !== null
  );
  if (generated.length > 0) return generated;

  throw new Error('Krill response did not include an image');
}

function getKrillProviderErrorMessage(
  httpStatus: number,
  providerMessage?: string
): string {
  if ([401, 403].includes(httpStatus)) {
    return 'Krill 图片主通道认证失败，请检查服务端 KRILL_IMAGE_API_KEY';
  }
  return providerMessage || `Krill image generation failed: ${httpStatus}`;
}

async function callKrillReferenceEditOnce(
  model: string,
  apiBaseUrl: string,
  prompt: string,
  input: SanitizedImageGenerateRequest,
  apiKey: string,
  timeoutMs: number,
  references: ResolvedImageReference[]
): Promise<GeneratedImage[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const formData = new FormData();
  formData.append('model', model);
  formData.append('prompt', prompt);
  const providerImageSize = getKrillProviderImageSize(input);
  const providerQuality = input.quality === 'auto' ? 'high' : input.quality;
  if (providerImageSize && providerImageSize !== 'auto') {
    formData.append('size', providerImageSize);
  }
  formData.append('quality', providerQuality);
  formData.append('output_format', input.outputFormat);
  if (input.outputFormat === 'jpeg' || input.outputFormat === 'webp') {
    formData.append('output_compression', String(COMPRESSED_OUTPUT_QUALITY));
  }

  for (const [index, reference] of references.entries()) {
    const response = await fetch(reference.signedUrl, {
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`Reference image download failed: ${response.status}`);
    }
    const blob = new Blob([await response.arrayBuffer()], {
      type: reference.mimeType || 'image/png'
    });
    formData.append('image', blob, getReferenceFileName(reference, index));
  }

  const response = await fetch(`${apiBaseUrl}/images/edits`, {
    signal: controller.signal,
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`
    },
    body: formData
  })
    .catch((error) => {
      if (isAbortError(error)) {
        throw new ProviderTimeoutError('krill', model, timeoutMs);
      }
      throw error;
    })
    .finally(() => clearTimeout(timeout));

  const data = (await response.json().catch(() => ({}))) as {
    data?: Array<{ b64_json?: string; url?: string }>;
    error?: { message?: string };
    message?: string;
  };

  if (!response.ok || data.error) {
    throw new ProviderHttpError(
      getKrillProviderErrorMessage(
        response.ok ? 502 : response.status,
        data.error?.message || data.message
      ),
      response.ok ? 502 : response.status,
      { provider: 'krill', model }
    );
  }

  return mapKrillImageResponse(data, input, model, apiBaseUrl);
}

async function callKrillOnce(
  model: string,
  apiBaseUrl: string,
  prompt: string,
  input: SanitizedImageGenerateRequest,
  apiKey: string,
  timeoutMs: number,
  references: ResolvedImageReference[] = []
): Promise<GeneratedImage[]> {
  if (references.length > 0) {
    return callKrillReferenceEditOnce(
      model,
      apiBaseUrl,
      prompt,
      input,
      apiKey,
      timeoutMs,
      references
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const providerImageSize = getKrillProviderImageSize(input);
  const providerQuality = input.quality === 'auto' ? 'high' : input.quality;
  const outputCompression =
    input.outputFormat === 'jpeg' || input.outputFormat === 'webp'
      ? COMPRESSED_OUTPUT_QUALITY
      : undefined;
  const response = await fetch(`${apiBaseUrl}/images/generations`, {
    signal: controller.signal,
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      prompt,
      n: input.imageCount,
      ...(providerImageSize ? { size: providerImageSize } : {}),
      quality: providerQuality,
      output_format: input.outputFormat,
      ...(outputCompression ? { output_compression: outputCompression } : {})
    })
  })
    .catch((error) => {
      if (isAbortError(error)) {
        throw new ProviderTimeoutError('krill', model, timeoutMs);
      }
      throw error;
    })
    .finally(() => clearTimeout(timeout));

  const data = (await response.json().catch(() => ({}))) as {
    data?: Array<{ b64_json?: string; url?: string }>;
    error?: { message?: string };
    message?: string;
  };

  if (!response.ok || data.error) {
    throw new ProviderHttpError(
      getKrillProviderErrorMessage(
        response.ok ? 502 : response.status,
        data.error?.message || data.message
      ),
      response.ok ? 502 : response.status,
      { provider: 'krill', model }
    );
  }

  return mapKrillImageResponse(data, input, model, apiBaseUrl);
}

async function generateWithKrill(
  prompt: string,
  input: SanitizedImageGenerateRequest,
  options: ImageGenerationRunOptions = {},
  references: ResolvedImageReference[] = [],
  _mask?: ResolvedImageReference
): Promise<GeneratedImage[]> {
  const apiKey = process.env.KRILL_IMAGE_API_KEY || process.env.KRILL_API_KEY;
  if (!apiKey) {
    throw new Error('KRILL_IMAGE_API_KEY is not configured');
  }

  const model = getKrillImageModel(input);
  const apiBaseUrl = getKrillApiBaseUrl();
  const timeoutMs = getKrillTimeoutMs(options);
  const startedAt = new Date();
  console.info('[ImageGenerate] calling Krill image model:', {
    model,
    mode: options.mode || 'sync',
    taskId: options.taskId,
    timeoutMs,
    imageSize: getKrillProviderImageSize(input) || 'provider-default',
    quality: input.quality,
    outputFormat: input.outputFormat,
    promptMode: input.promptMode,
    promptChars: prompt.length,
    negativePromptChars: input.negativePrompt?.length || 0,
    referenceCount: references.length,
    referenceMode: input.referenceMode
  });

  try {
    const generated = await callKrillOnce(
      model,
      apiBaseUrl,
      prompt,
      input,
      apiKey,
      timeoutMs,
      references
    );
    await options.attemptLogger?.({
      provider: 'krill',
      model,
      channel: KRILL_IMAGE_CHANNEL,
      attemptIndex: 1,
      startedAt,
      finishedAt: new Date(),
      status: 'succeeded',
      metadata: {
        attemptedApiBaseUrl: apiBaseUrl,
        lockedProvider: 'krill',
        lockedModel: model,
        lockedChannel: KRILL_IMAGE_CHANNEL,
        lockedApiBaseUrl: apiBaseUrl,
        effectiveImageCount: generated.length
      }
    });
    return generated;
  } catch (error) {
    await options.attemptLogger?.({
      provider: 'krill',
      model,
      channel: KRILL_IMAGE_CHANNEL,
      attemptIndex: 1,
      startedAt,
      finishedAt: new Date(),
      status: 'failed',
      errorDetails: getFailureDetails(error),
      errorMessage: getErrorMessage(error),
      providerRequestId: extractProviderRequestId(getErrorMessage(error)),
      metadata: {
        attemptedApiBaseUrl: apiBaseUrl
      }
    });
    throw error;
  }
}

async function mapTuziImageResponse(
  data: { data?: Array<{ b64_json?: string; url?: string }> },
  input: SanitizedImageGenerateRequest,
  model: string,
  channel: TuziImageChannel,
  apiBaseUrl: string
): Promise<GeneratedImage[]> {
  const images: Array<GeneratedImage | null> = await Promise.all(
    (data.data || []).slice(0, input.imageCount).map(async (item) => {
      if (item?.b64_json) {
        const fallbackMimeType = getOutputMimeType(input.outputFormat);
        const encoded = dataUrlFromProviderBase64(
          item.b64_json,
          fallbackMimeType
        );
        return {
          dataUrl: encoded.dataUrl,
          mimeType: encoded.mimeType,
          provider: 'tuzi' as const,
          model,
          modelLabel: input.modelLabel,
          tuziChannel: channel,
          providerApiBaseUrl: apiBaseUrl
        };
      }
      if (item?.url) {
        const downloaded = await downloadImageAsDataUrl(item.url);
        return {
          ...downloaded,
          provider: 'tuzi' as const,
          model,
          modelLabel: input.modelLabel,
          tuziChannel: channel,
          providerApiBaseUrl: apiBaseUrl
        };
      }
      return null;
    })
  );
  const generated = images.filter(
    (item): item is GeneratedImage => item !== null
  );
  if (generated.length > 0) return generated;

  throw new Error('Tuzi response did not include an image');
}

function getReferenceFileName(
  reference: ResolvedImageReference,
  index: number
): string {
  const ext = reference.mimeType.includes('webp')
    ? 'webp'
    : reference.mimeType.includes('jpeg') || reference.mimeType.includes('jpg')
      ? 'jpg'
      : 'png';
  return `reference-${index + 1}-${reference.id.slice(0, 8)}.${ext}`;
}

async function callTuziReferenceEditOnce(
  model: string,
  channel: TuziImageChannel,
  apiBaseUrl: string,
  prompt: string,
  input: SanitizedImageGenerateRequest,
  apiKey: string,
  timeoutMs: number,
  references: ResolvedImageReference[],
  mask?: ResolvedImageReference
): Promise<GeneratedImage[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const formData = new FormData();
  formData.append('model', model);
  formData.append('prompt', prompt);
  const providerImageSize = getTuziProviderImageSize(input);
  if (providerImageSize) {
    formData.append('size', providerImageSize);
  }
  formData.append('quality', input.quality);
  formData.append('output_format', input.outputFormat);
  if (input.outputFormat === 'jpeg' || input.outputFormat === 'webp') {
    formData.append('output_compression', String(COMPRESSED_OUTPUT_QUALITY));
  }
  formData.append('n', String(input.imageCount));

  for (const [index, reference] of references.entries()) {
    const response = await fetch(reference.signedUrl, {
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`Reference image download failed: ${response.status}`);
    }
    const blob = new Blob([await response.arrayBuffer()], {
      type: reference.mimeType || 'image/png'
    });
    formData.append('image', blob, getReferenceFileName(reference, index));
  }
  if (mask) {
    const maskResponse = await fetch(mask.signedUrl, {
      signal: controller.signal
    });
    if (!maskResponse.ok) {
      throw new Error(`Mask image download failed: ${maskResponse.status}`);
    }
    const maskBlob = new Blob([await maskResponse.arrayBuffer()], {
      type: mask.mimeType || 'image/png'
    });
    formData.append('mask', maskBlob, 'mask.png');
  }

  try {
    const response = await fetch(`${apiBaseUrl}/v1/images/edits`, {
      signal: controller.signal,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...getCloudflareAiGatewayHeaders(apiBaseUrl)
      },
      body: formData
    }).catch((error) => {
      if (isAbortError(error)) {
        throw new ProviderTimeoutError('Tuzi', model, timeoutMs);
      }
      throw error;
    });

    const data = (await response.json().catch((error) => {
      if (isAbortError(error)) {
        throw new ProviderTimeoutError('Tuzi', model, timeoutMs);
      }
      return {};
    })) as {
      data?: Array<{ b64_json?: string; url?: string }>;
      error?: { message?: string };
      message?: string;
    };

    if (!response.ok) {
      throw new ProviderHttpError(
        data.error?.message ||
          data.message ||
          `Tuzi image edit failed: ${response.status}`,
        response.status,
        { provider: 'tuzi', model }
      );
    }

    return mapTuziImageResponse(data, input, model, channel, apiBaseUrl);
  } finally {
    clearTimeout(timeout);
  }
}

async function callTuziOnce(
  modelId: ModelId,
  model: string,
  channel: TuziImageChannel,
  apiBaseUrl: string,
  prompt: string,
  input: SanitizedImageGenerateRequest,
  apiKey: string,
  timeoutMs: number,
  references: ResolvedImageReference[] = [],
  mask?: ResolvedImageReference
): Promise<GeneratedImage[]> {
  if (isTuziMidjourneyModelId(modelId)) {
    try {
      const task = await submitAndPollTuziMidjourneyTask({
        apiBaseUrl,
        apiKey,
        modelId,
        prompt,
        aspectRatio: input.aspectRatio,
        timeoutMs,
        extraHeaders: getCloudflareAiGatewayHeaders(apiBaseUrl)
      });
      const downloaded = await downloadImageAsDataUrl(task.imageUrl);
      return [
        {
          ...downloaded,
          provider: 'tuzi',
          model,
          modelLabel: input.modelLabel,
          tuziChannel: channel,
          providerApiBaseUrl: apiBaseUrl
        }
      ];
    } catch (error) {
      if (error instanceof TuziMidjourneyTimeoutError) {
        throw new ProviderTimeoutError('Tuzi', model, error.timeoutMs);
      }
      if (error instanceof TuziMidjourneyApiError) {
        throw new ProviderHttpError(error.message, error.httpStatus, {
          provider: 'tuzi',
          model
        });
      }
      throw error;
    }
  }

  if (references.length > 0 && channel !== 'default') {
    return callTuziReferenceEditOnce(
      model,
      channel,
      apiBaseUrl,
      prompt,
      input,
      apiKey,
      timeoutMs,
      references,
      mask
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${apiBaseUrl}/v1/images/generations`, {
      signal: controller.signal,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...getCloudflareAiGatewayHeaders(apiBaseUrl)
      },
      body: JSON.stringify({
        ...buildTuziImageGenerationRequestBody(model, prompt, input),
        ...(references.length > 0
          ? {
              image: references.map((reference) => reference.signedUrl)
            }
          : {})
      })
    }).catch((error) => {
      if (isAbortError(error)) {
        throw new ProviderTimeoutError('Tuzi', model, timeoutMs);
      }
      throw error;
    });

    const data = (await response.json().catch((error) => {
      if (isAbortError(error)) {
        throw new ProviderTimeoutError('Tuzi', model, timeoutMs);
      }
      return {};
    })) as {
      data?: Array<{ b64_json?: string; url?: string }>;
      error?: { message?: string };
      message?: string;
    };

    if (!response.ok) {
      throw new ProviderHttpError(
        data.error?.message ||
          data.message ||
          `Tuzi image generation failed: ${response.status}`,
        response.status,
        { provider: 'tuzi', model }
      );
    }

    return mapTuziImageResponse(data, input, model, channel, apiBaseUrl);
  } finally {
    clearTimeout(timeout);
  }
}

function isRetryableTuziError(error: unknown): boolean {
  return (
    error instanceof ProviderHttpError &&
    (isRetryableProviderHttpStatus(error.httpStatus) ||
      isProviderResourceExhaustedMessage(error.message))
  );
}

function getTuziImageTransport(
  modelId: ModelId,
  channel: TuziImageChannel,
  references: ResolvedImageReference[]
):
  | 'tuzi_midjourney_task_json'
  | 'tuzi_images_generations_json'
  | 'openai_images_edits_multipart' {
  if (isTuziMidjourneyModelId(modelId)) return 'tuzi_midjourney_task_json';
  return references.length > 0 && channel !== 'default'
    ? 'openai_images_edits_multipart'
    : 'tuzi_images_generations_json';
}

function shouldFallbackTuziModel(
  error: unknown,
  options?: ImageGenerationRunOptions
): boolean {
  // 队列模式允许超时换通道重试：单通道 120s、双通道 240s，仍在
  // 330s 队列预算内；同步模式保持现状避免撞 200s pipeline deadline。
  if (error instanceof ProviderTimeoutError) return options?.mode === 'queued';
  return isRetryableTuziError(error);
}

function shouldStopTuziFallback(error: unknown): boolean {
  const details = getFailureDetails(error);
  return (
    details.category === 'provider_policy' ||
    details.category === 'invalid_request' ||
    details.category === 'credit'
  );
}

function normalizeTuziError(
  error: unknown,
  model: string,
  channel: TuziImageChannel
): unknown {
  if (
    error instanceof ProviderHttpError &&
    channel !== 'default' &&
    /groups?\s+not\s+available/i.test(error.message)
  ) {
    const channelLabel =
      channel === 'official_discount'
        ? 'official discount'
        : channel === 'openai_original'
          ? 'OpenAI original'
          : 'official';
    return new ProviderHttpError(
      `Tuzi ${channelLabel} 分组未开通或当前 API key 无权访问 ${model}：${error.message}`,
      error.httpStatus,
      { provider: 'tuzi', model }
    );
  }

  if (
    error instanceof ProviderHttpError &&
    error.httpStatus === 503 &&
    /model .*not available/i.test(error.message)
  ) {
    return new ProviderHttpError(
      `Tuzi ${model} 通道暂不可用：${error.message}`,
      error.httpStatus,
      { provider: 'tuzi', model }
    );
  }
  return error;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function generateWithTuzi(
  prompt: string,
  input: SanitizedImageGenerateRequest,
  options: ImageGenerationRunOptions = {},
  references: ResolvedImageReference[] = [],
  mask?: ResolvedImageReference
): Promise<GeneratedImage[]> {
  const plannedAttempts = buildTuziImageAttemptPlan(input.model, {
    imageCount: input.imageCount,
    imageSize: input.imageSize
  });
  const requestedModelAttempts = options.lockTuziModelToRequested
    ? plannedAttempts.filter((attempt) => attempt.modelId === input.model)
    : plannedAttempts;
  const availableAttempts = filterTuziAttemptsForLock(
    requestedModelAttempts,
    options.lockedTuziAttempt
  );
  const attempts = rankTuziAttemptsByProviderHealth(
    availableAttempts,
    options.providerHealthLookup
  );
  if (attempts.length === 0) {
    throw new ProviderHttpError(
      options.lockedTuziAttempt
        ? `Locked Tuzi attempt is not available: ${options.lockedTuziAttempt.channel}/${options.lockedTuziAttempt.model}`
        : `${input.modelLabel} 当前没有健康可用的生成渠道，请稍后再试或切换模型。`,
      503,
      { provider: 'tuzi', model: input.model }
    );
  }

  const primaryAttempt = attempts[0];
  const skippedByHealth = availableAttempts.filter(
    (attempt) =>
      !attempts.some(
        (rankedAttempt) =>
          rankedAttempt.model === attempt.model &&
          rankedAttempt.channel === attempt.channel &&
          rankedAttempt.apiBaseUrl === attempt.apiBaseUrl
      )
  );
  const logAttempt = async (attempt: ImageGenerationAttemptLogInput) => {
    try {
      await options.attemptLogger?.(attempt);
    } catch (error) {
      console.warn('[ImageGenerate] attempt log failed:', {
        taskId: options.taskId,
        provider: attempt.provider,
        model: attempt.model,
        channel: attempt.channel,
        status: attempt.status,
        error: getErrorMessage(error)
      });
    }
  };
  const timeoutMs = getTuziModelTimeoutMs(
    options,
    attempts.length,
    input.imageCount
  );
  console.info('[ImageGenerate] calling Tuzi image model:', {
    model: primaryAttempt.model,
    channel: primaryAttempt.channel,
    fallbackModels: attempts.slice(1).map((attempt) => ({
      model: attempt.model,
      channel: attempt.channel
    })),
    skippedByHealth: skippedByHealth.map((attempt) => ({
      model: attempt.model,
      channel: attempt.channel
    })),
    mode: options.mode || 'sync',
    taskId: options.taskId,
    lockedChannel: options.lockedTuziAttempt?.channel,
    timeoutMs,
    imageSize: getTuziProviderImageSize(input) || 'provider-default',
    quality: input.quality,
    outputFormat: input.outputFormat,
    promptMode: input.promptMode,
    promptChars: prompt.length,
    negativePromptChars: input.negativePrompt?.length || 0,
    referenceCount: references.length,
    referenceMode: input.referenceMode,
    transport: getTuziImageTransport(
      primaryAttempt.modelId,
      primaryAttempt.channel,
      references
    )
  });

  const maxAttempts = options.disableTuziRetries
    ? 1
    : attempts.length > 1
      ? 1
      : options.mode === 'queued'
        ? 3
        : 1;
  let lastError: unknown;
  let attemptOrdinal = 0;
  for (const [attemptIndex, tuziAttempt] of attempts.entries()) {
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      attemptOrdinal += 1;
      const attemptStartedAt = new Date();
      const healthRecord = getTuziAttemptHealthRecord(
        tuziAttempt,
        options.providerHealthLookup
      );
      const healthDecision = getImageProviderRoutingDecision(healthRecord);
      try {
        const generated = await callTuziOnce(
          tuziAttempt.modelId,
          tuziAttempt.model,
          tuziAttempt.channel,
          tuziAttempt.apiBaseUrl,
          prompt,
          input,
          tuziAttempt.apiKey,
          timeoutMs,
          references,
          mask
        );
        const transport = getTuziImageTransport(
          tuziAttempt.modelId,
          tuziAttempt.channel,
          references
        );
        await logAttempt({
          provider: 'tuzi',
          model: tuziAttempt.model,
          channel: tuziAttempt.channel,
          attemptIndex: attemptOrdinal,
          startedAt: attemptStartedAt,
          finishedAt: new Date(),
          status: 'succeeded',
          metadata: {
            attemptedApiBaseUrl: tuziAttempt.apiBaseUrl,
            lockedProvider: 'tuzi',
            lockedModel: tuziAttempt.model,
            lockedChannel: tuziAttempt.channel,
            lockedApiBaseUrl: tuziAttempt.apiBaseUrl,
            providerHealthState: healthRecord?.healthState,
            providerHealthScore: healthDecision.score,
            providerHealthReason: healthDecision.reason,
            timeoutMs,
            transport,
            providerRequestImageCount: input.imageCount,
            effectiveImageCount: generated.length
          }
        });
        return generated.map((image) => ({
          ...image,
          usedFallback: attemptIndex > 0 || image.usedFallback
        }));
      } catch (error) {
        lastError = normalizeTuziError(
          error,
          tuziAttempt.model,
          tuziAttempt.channel
        );
        const rawAttemptError = getErrorMessage(lastError);
        const attemptFailureDetails = getFailureDetails(lastError);
        await logAttempt({
          provider: 'tuzi',
          model: tuziAttempt.model,
          channel: tuziAttempt.channel,
          attemptIndex: attemptOrdinal,
          startedAt: attemptStartedAt,
          finishedAt: new Date(),
          status: 'failed',
          errorDetails: attemptFailureDetails,
          errorMessage: rawAttemptError,
          providerRequestId: extractProviderRequestId(rawAttemptError),
          metadata: {
            attemptedApiBaseUrl: tuziAttempt.apiBaseUrl,
            providerHealthState: healthRecord?.healthState,
            providerHealthScore: healthDecision.score,
            providerHealthReason: healthDecision.reason,
            timeoutMs,
            transport: getTuziImageTransport(
              tuziAttempt.modelId,
              tuziAttempt.channel,
              references
            ),
            providerRequestImageCount: input.imageCount
          }
        });
        const canFallback =
          attemptIndex < attempts.length - 1 &&
          shouldFallbackTuziModel(error, options);
        const shouldRetry =
          !canFallback && attempt < maxAttempts && isRetryableTuziError(error);
        console.warn('[ImageGenerate] Tuzi attempt failed:', {
          model: tuziAttempt.model,
          channel: tuziAttempt.channel,
          mode: options.mode || 'sync',
          taskId: options.taskId,
          attempt,
          maxAttempts,
          retrying: shouldRetry,
          fallbackModel: canFallback
            ? attempts[attemptIndex + 1]?.model
            : undefined,
          fallbackChannel: canFallback
            ? attempts[attemptIndex + 1]?.channel
            : undefined,
          httpStatus:
            error instanceof ProviderHttpError ? error.httpStatus : undefined,
          reason: rawAttemptError
        });
        if (shouldStopTuziFallback(lastError)) {
          throw lastError instanceof Error
            ? lastError
            : new Error(rawAttemptError);
        }
        if (canFallback) break;
        if (!shouldRetry) {
          throw lastError instanceof Error
            ? lastError
            : new Error(rawAttemptError);
        }
        await sleep(1500 * attempt);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Tuzi 图片生成失败');
}

async function generateWithGemini(
  prompt: string,
  input: SanitizedImageGenerateRequest
): Promise<GeneratedImage[]> {
  if (!isOfficialGeminiEnabled()) {
    throw new Error('Official Gemini image generation is disabled');
  }
  const apiKey =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GOOGLE_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const model = getGeminiModel();
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    IMAGE_GENERATION_TIMEOUT_MS
  );
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      signal: controller.signal,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ['TEXT', 'IMAGE'] }
      })
    }
  ).finally(() => clearTimeout(timeout));

  const data = (await response.json().catch(() => ({}))) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          inlineData?: { mimeType?: string; data?: string };
          inline_data?: { mime_type?: string; data?: string };
        }>;
      };
    }>;
    error?: { message?: string };
  };

  if (!response.ok) {
    throw new ProviderHttpError(
      data.error?.message ||
        `Gemini image generation failed: ${response.status}`,
      response.status,
      { provider: 'gemini', model }
    );
  }

  const images: Array<GeneratedImage | null> =
    data.candidates
      ?.flatMap((candidate) => candidate.content?.parts || [])
      .map((part) => {
        const inlineData = part.inlineData || part.inline_data;
        const base64 = inlineData?.data || '';
        if (!base64) return null;
        const mimeType =
          ('mimeType' in (inlineData || {})
            ? part.inlineData?.mimeType
            : part.inline_data?.mime_type) || 'image/png';
        return {
          dataUrl: `data:${mimeType};base64,${base64}`,
          mimeType,
          provider: 'gemini' as const,
          model
        };
      })
      .slice(0, input.imageCount) || [];
  const generated = images.filter(
    (item): item is GeneratedImage => item !== null
  );

  if (generated.length === 0) {
    throw new Error('Gemini response did not include an image');
  }

  return generated;
}

async function generateWithZImage(
  prompt: string,
  input: SanitizedImageGenerateRequest
): Promise<GeneratedImage[]> {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) {
    throw new Error('DASHSCOPE_API_KEY is not configured');
  }

  const result = await generateImageWithZImage(apiKey, {
    prompt,
    size: getZImageSize(input),
    promptExtend: true
  });

  if (!result.success || !result.imageUrl) {
    throw new Error(result.error || 'Z-Image generation failed');
  }

  const downloaded = await downloadImageAsDataUrl(result.imageUrl);
  return [
    {
      ...downloaded,
      provider: 'z-image',
      model: 'z-image-turbo'
    }
  ];
}

async function generateWithProvider(
  provider: ImageProvider,
  prompt: string,
  input: SanitizedImageGenerateRequest,
  options: ImageGenerationRunOptions = {},
  references: ResolvedImageReference[] = [],
  mask?: ResolvedImageReference
): Promise<GeneratedImage[]> {
  if (provider === 'krill') {
    return generateWithKrill(prompt, input, options, references, mask);
  }
  if (provider === 'tuzi') {
    return generateWithTuzi(prompt, input, options, references, mask);
  }
  if (provider === 'openai') {
    return generateWithOpenAI(prompt, input, options, references, mask);
  }
  if (provider === 'z-image') {
    return generateWithZImage(prompt, input);
  }
  return generateWithGemini(prompt, input);
}

function getTuziFallbackTimeoutMsForImageCount(imageCount: number): number {
  const normalizedImageCount = Math.max(1, Math.floor(Number(imageCount) || 1));
  if (normalizedImageCount <= 1) return QUEUED_TUZI_FALLBACK_TIMEOUT_MS;
  return Math.min(
    QUEUED_TUZI_VIP_TIMEOUT_MS,
    Math.max(
      QUEUED_TUZI_FALLBACK_TIMEOUT_MS,
      QUEUED_TUZI_FALLBACK_TIMEOUT_MS * normalizedImageCount
    )
  );
}

async function generateWithSelectedProvider(
  requestedProvider: ImageProvider,
  prompt: string,
  input: SanitizedImageGenerateRequest,
  options: ImageGenerationRunOptions = {},
  references: ResolvedImageReference[] = [],
  mask?: ResolvedImageReference
): Promise<GeneratedImage[]> {
  const providers = getImageProviderExecutionChain(
    requestedProvider,
    options.disableProviderFallback,
    input
  );
  let lastError: unknown;
  let policyFallbackUsed = false;

  for (const [index, provider] of providers.entries()) {
    if (
      index === 0 &&
      provider === 'openai' &&
      shouldSkipOpenAICompatiblePrimaryByHealth({
        input,
        options,
        providers
      })
    ) {
      console.warn(
        '[ImageGenerate] OpenAI-compatible primary skipped by health:',
        {
          taskId: options.taskId,
          requestedProvider,
          provider,
          fallbackProvider: providers[index + 1] || null
        }
      );
      continue;
    }

    if (
      index > 0 &&
      shouldSkipProviderFallbackByHealth(provider, input, options)
    ) {
      console.warn('[ImageGenerate] provider fallback skipped by health:', {
        taskId: options.taskId,
        provider,
        requestedProvider
      });
      continue;
    }

    try {
      const providerOptions =
        provider === 'tuzi' && provider !== requestedProvider
          ? {
              ...options,
              tuziVipTimeoutMs: Math.min(
                options.tuziVipTimeoutMs ||
                  getTuziFallbackTimeoutMsForImageCount(input.imageCount),
                getTuziFallbackTimeoutMsForImageCount(input.imageCount)
              )
            }
          : options;
      const generated = await generateWithProvider(
        provider,
        prompt,
        input,
        providerOptions,
        references,
        mask
      );
      return generated.map((image) => ({
        ...image,
        usedFallback:
          index > 0 || provider !== requestedProvider || image.usedFallback
      }));
    } catch (error) {
      lastError = error;
      const details = getFailureDetails(error);
      if (isOpenAICompatibleImageProviderPendingError(error)) {
        console.warn('[ImageGenerate] provider poll deferred:', {
          taskId: options.taskId,
          provider,
          requestedProvider,
          category: details.category,
          retryable: details.retryable,
          reason: getErrorMessage(error)
        });
        throw error;
      }
      console.warn('[ImageGenerate] provider attempt failed:', {
        taskId: options.taskId,
        provider,
        requestedProvider,
        fallbackAvailable:
          !options.disableProviderFallback && index < providers.length - 1,
        category: details.category,
        retryable: details.retryable,
        reason: getErrorMessage(error)
      });
      if (
        index >= providers.length - 1 ||
        details.category === 'invalid_request' ||
        details.category === 'credit'
      ) {
        break;
      }
      if (details.category === 'provider_policy') {
        const policyMessage = getErrorMessage(error);
        const messageKind = classifyPolicyFailureMessage(policyMessage);
        if (
          isExplicitPolicyContentMessage(policyMessage) ||
          policyFallbackUsed ||
          options.disableProviderFallback
        ) {
          break;
        }
        const nextProvider = providers[index + 1];
        if (nextProvider) {
          const budget = options.policyFallbackBudget;
          let allowed = true;
          if (budget) {
            try {
              allowed = await budget.consume({
                fromProvider: provider,
                toProvider: nextProvider,
                messageKind
              });
            } catch (budgetError) {
              console.warn(
                '[ImageGenerate] policy fallback budget threw, allowing fallback:',
                {
                  taskId: options.taskId,
                  reason: getErrorMessage(budgetError)
                }
              );
            }
          }
          if (!allowed) {
            break;
          }
        }
        policyFallbackUsed = true;
        console.warn('[ImageGenerate] provider policy fallback allowed:', {
          taskId: options.taskId,
          fromProvider: provider,
          toProvider: nextProvider,
          messageKind
        });
      }
    }
  }

  throw (
    lastError || new Error('Image provider did not return any usable image')
  );
}

async function createDeterministicDenoiseGuide({
  sb,
  userId,
  reference,
  taskId
}: {
  sb: SupabaseClient;
  userId: string;
  reference: ResolvedImageReference;
  taskId?: string;
}): Promise<TemporaryDenoiseGuide> {
  const binding = getCloudflareImagesBinding();
  if (!binding) {
    throw new Error(
      'Cloud denoise requires the Cloudflare Images binding for its deterministic structure guide'
    );
  }

  const originalResponse = await fetch(reference.signedUrl, {
    signal: AbortSignal.timeout(30_000)
  });
  if (!originalResponse.ok || !originalResponse.body) {
    throw new Error(
      `Cloud denoise original reference download failed: ${originalResponse.status}`
    );
  }

  const transformed = await binding
    .input(originalResponse.body)
    .transform(CLOUD_DENOISE_GUIDE_TRANSFORM)
    .output(CLOUD_DENOISE_GUIDE_OUTPUT);
  const transformedResponse = transformed.response();
  if (!transformedResponse.ok) {
    throw new Error(
      `Cloud denoise deterministic guide transform failed: ${transformedResponse.status}`
    );
  }
  const guideBytes = new Uint8Array(await transformedResponse.arrayBuffer());
  if (guideBytes.byteLength === 0) {
    throw new Error('Cloud denoise deterministic guide was empty');
  }
  const guideMimeType =
    transformedResponse.headers.get('content-type') || 'image/webp';

  const generated: GeneratedImage = {
    dataUrl: `data:${guideMimeType};base64,${bytesToBase64(guideBytes)}`,
    mimeType: guideMimeType,
    provider: 'tuzi',
    model: 'deterministic-grayscale-guide-v1',
    modelLabel: 'Deterministic grayscale structure guide'
  };
  const storedImage = await uploadGeneratedImage(sb, userId, generated);
  return {
    storedImage,
    reference: {
      id: `generated-structure-${taskId || crypto.randomUUID()}`,
      role: 'structure_reference',
      label: 'Deterministic grayscale structure guide',
      storageBucket: storedImage.bucket,
      storagePath: storedImage.path,
      mimeType: generated.mimeType || 'image/webp',
      signedUrl: storedImage.signedUrl
    }
  };
}

async function generateWithCloudDenoisePipeline({
  input,
  options,
  references,
  sb,
  userId
}: {
  input: SanitizedImageGenerateRequest;
  options: ImageGenerationRunOptions;
  references: ResolvedImageReference[];
  sb: SupabaseClient;
  userId: string;
}): Promise<GeneratedImage[]> {
  if (references.length !== 1) {
    throw new ProviderHttpError(
      'Cloud denoise requires exactly one original reference image',
      400,
      { provider: 'tuzi', model: CLOUD_DENOISE_MODEL }
    );
  }

  const pipelineStartedAt = Date.now();
  const pipelineBudgetMs = options.pipelineDeadlineMs || 300_000;
  const lockedOptions: ImageGenerationRunOptions = {
    ...options,
    disableProviderFallback: true,
    lockTuziModelToRequested: true,
    disableTuziRetries: true
  };
  let temporaryGuide: TemporaryDenoiseGuide | null = null;
  try {
    temporaryGuide = await createDeterministicDenoiseGuide({
      sb,
      userId,
      reference: references[0],
      taskId: options.taskId
    });
    const elapsedMs = Date.now() - pipelineStartedAt;
    const remainingMs = pipelineBudgetMs - elapsedMs;
    if (remainingMs < 45_000) {
      throw new PipelineDeadlineError();
    }
    const restorationTimeoutMs = Math.max(
      30_000,
      Math.min(options.tuziVipTimeoutMs || 180_000, remainingMs - 45_000)
    );
    return await generateWithSelectedProvider(
      'tuzi',
      input.prompt,
      input,
      withAttemptMetadata(
        {
          ...lockedOptions,
          pipelineDeadlineMs: remainingMs,
          tuziVipTimeoutMs: restorationTimeoutMs
        },
        {
          phase: 'denoise_dual_reference_restore',
          denoiseStage: 1,
          referenceOrder: ['original', 'structure_guide'],
          guideMode: 'deterministic_cloudflare_images_v1',
          guideTransform: CLOUD_DENOISE_GUIDE_TRANSFORM
        }
      ),
      [references[0], temporaryGuide.reference]
    );
  } finally {
    if (temporaryGuide) {
      await deleteStoredImage(sb, temporaryGuide.storedImage);
    }
  }
}

function withAttemptMetadata(
  options: ImageGenerationRunOptions,
  metadata: Record<string, unknown>
): ImageGenerationRunOptions {
  return {
    ...options,
    attemptMetadata: {
      ...(options.attemptMetadata || {}),
      ...metadata
    },
    attemptLogger: async (attempt) => {
      await options.attemptLogger?.({
        ...attempt,
        metadata: {
          ...metadata,
          ...attempt.metadata
        }
      });
    }
  };
}

export function shouldAttemptSupplementalImageGeneration({
  requestedImageCount,
  generatedImageCount,
  supplementAttempt,
  maxSupplementAttempts = MAX_SUPPLEMENTAL_IMAGE_ATTEMPTS
}: {
  requestedImageCount: number;
  generatedImageCount: number;
  supplementAttempt: number;
  maxSupplementAttempts?: number;
  strictBatchConsistency?: boolean;
}): boolean {
  const effectiveMaxSupplementAttempts = Math.max(
    maxSupplementAttempts,
    requestedImageCount - 1
  );
  return (
    requestedImageCount > 1 &&
    generatedImageCount > 0 &&
    generatedImageCount < requestedImageCount &&
    supplementAttempt < effectiveMaxSupplementAttempts
  );
}

export function shouldAttemptSingleImageRescue({
  requestedProvider,
  requestedImageCount,
  failureDetails
}: {
  requestedProvider?: ImageProvider;
  requestedImageCount: number;
  failureDetails: ImageGenerationFailureDetails;
}): boolean {
  if (requestedImageCount <= 1 || !failureDetails.retryable) return false;
  if (
    requestedProvider === 'tuzi' &&
    !isTruthyEnv(process.env.TUZI_ENABLE_OPENAI_COMPAT_FALLBACK)
  ) {
    return false;
  }
  return [
    'provider_timeout',
    'provider_unavailable',
    'provider_rate_limit'
  ].includes(failureDetails.category);
}

export function getSingleImageRescueProviderChain(
  requestedProvider: ImageProvider,
  input?: Pick<
    SanitizedImageGenerateRequest,
    'imageCount' | 'imageSize' | 'model'
  >
): ImageProvider[] {
  return Array.from(
    new Set([
      ...getImageProviderFallbackChain(requestedProvider, input),
      requestedProvider
    ])
  );
}

function getRescueImageCount({
  rescueProvider,
  sanitizedInput
}: {
  rescueProvider: ImageProvider;
  sanitizedInput: SanitizedImageGenerateRequest;
}): number {
  if (rescueProvider !== 'tuzi') return 1;
  const modelConfig = getTuziImageModelConfig(sanitizedInput.model);
  if (!modelConfig.supportsMultipleImages) return 1;
  return Math.max(
    1,
    Math.min(sanitizedInput.imageCount, modelConfig.maxImageCount)
  );
}

async function completePartialImageGeneration({
  requestedProvider,
  prompt,
  sanitizedInput,
  executionOptions,
  resolvedReferences,
  initialImages,
  jobStartedAt
}: {
  requestedProvider: ImageProvider;
  prompt: string;
  sanitizedInput: SanitizedImageGenerateRequest;
  executionOptions: ImageGenerationRunOptions;
  resolvedReferences: ResolvedImageReference[];
  initialImages: GeneratedImage[];
  jobStartedAt: number;
}): Promise<GeneratedImage[]> {
  let generated = initialImages.slice(0, sanitizedInput.imageCount);
  let supplementAttempt = 0;
  const strictBatchConsistency = isStrictBatchConsistencyEnabled(
    sanitizedInput.imageCount
  );
  const softDeadlineAt =
    jobStartedAt +
    (executionOptions.pipelineDeadlineMs || SYNC_PIPELINE_DEADLINE_MS);
  const primaryGenerated = generated[0];
  const supplementalProvider = primaryGenerated?.provider || requestedProvider;
  const lockedTuziAttempt =
    primaryGenerated?.provider === 'tuzi' && primaryGenerated.tuziChannel
      ? {
          model: primaryGenerated.model,
          channel: primaryGenerated.tuziChannel,
          apiBaseUrl: primaryGenerated.providerApiBaseUrl
        }
      : undefined;

  while (
    shouldAttemptSupplementalImageGeneration({
      requestedImageCount: sanitizedInput.imageCount,
      generatedImageCount: generated.length,
      supplementAttempt,
      strictBatchConsistency
    })
  ) {
    const remainingBudgetMs = softDeadlineAt - Date.now();
    if (remainingBudgetMs < 15_000) {
      console.warn('[ImageGenerate] skip supplemental image generation:', {
        taskId: executionOptions.taskId,
        generatedImageCount: generated.length,
        requestedImageCount: sanitizedInput.imageCount,
        remainingBudgetMs
      });
      break;
    }

    supplementAttempt += 1;
    const missingImageCount = sanitizedInput.imageCount - generated.length;
    const supplementalInput: SanitizedImageGenerateRequest = {
      ...sanitizedInput,
      imageCount: missingImageCount
    };

    try {
      console.info('[ImageGenerate] supplementing partial image generation:', {
        taskId: executionOptions.taskId,
        attempt: supplementAttempt,
        missingImageCount,
        generatedImageCount: generated.length,
        requestedImageCount: sanitizedInput.imageCount,
        supplementalProvider,
        lockedTuziChannel: lockedTuziAttempt?.channel,
        lockedTuziModel: lockedTuziAttempt?.model
      });
      const supplementalImages = await generateWithSelectedProvider(
        supplementalProvider,
        prompt,
        supplementalInput,
        withAttemptMetadata(
          {
            ...executionOptions,
            lockedTuziAttempt,
            disableProviderFallback: true
          },
          {
            phase: 'supplemental',
            supplementAttempt,
            requestedImageCount: sanitizedInput.imageCount,
            generatedImageCount: generated.length,
            missingImageCount,
            effectiveImageCount: supplementalInput.imageCount,
            supplementalProvider,
            lockedTuziChannel: lockedTuziAttempt?.channel,
            lockedTuziModel: lockedTuziAttempt?.model
          }
        ),
        resolvedReferences
      );
      const usableSupplementalImages = supplementalImages.slice(
        0,
        missingImageCount
      );
      if (usableSupplementalImages.length === 0) break;
      generated = [...generated, ...usableSupplementalImages].slice(
        0,
        sanitizedInput.imageCount
      );
    } catch (error) {
      const canRetrySupplement =
        shouldAttemptSupplementalImageGeneration({
          requestedImageCount: sanitizedInput.imageCount,
          generatedImageCount: generated.length,
          supplementAttempt,
          strictBatchConsistency
        }) && softDeadlineAt - Date.now() >= 15_000;
      console.warn('[ImageGenerate] supplemental image generation failed:', {
        taskId: executionOptions.taskId,
        attempt: supplementAttempt,
        missingImageCount,
        canRetrySupplement,
        reason: getErrorMessage(error)
      });
      if (!canRetrySupplement) break;
    }
  }

  return generated;
}

async function consumeImageCredit(
  request: Request,
  userId: string,
  metadata: Record<string, unknown>
): Promise<{
  ok: boolean;
  status: number;
  body?: unknown;
  consumed?: number;
  creditType?: string;
  creditBreakdown?: Record<string, number>;
}> {
  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const supabaseUrl = process.env.SUPABASE_URL;
  const authKey = process.env.SUPABASE_ANON_KEY;
  const admin = getSupabaseAdmin();
  if (!supabaseUrl || (token && !authKey) || !admin) {
    return {
      ok: false,
      status: 500,
      body: { error: 'Credit service is not configured' }
    };
  }

  if (token) {
    const authClient = createClient(supabaseUrl, authKey || '', {
      global: { headers: { Authorization: `Bearer ${token}` } }
    });
    const {
      data: { user },
      error: authError
    } = await authClient.auth.getUser(token);
    if (authError || user?.id !== userId) {
      return {
        ok: false,
        status: 401,
        body: { error: 'Invalid token' }
      };
    }
  }

  const { data, error } = await admin.rpc('consume_credits', {
    p_user_id: userId,
    p_action: 'image_generation',
    p_metadata: metadata
  });

  if (error) {
    console.error('[ImageGenerate] consume_credits RPC error:', error);
    return {
      ok: false,
      status: 500,
      body: {
        error: 'CREDIT_CONSUME_FAILED',
        message: '积分扣减失败，请稍后再试'
      }
    };
  }

  const result = data as {
    success?: boolean;
    error?: string;
    max?: number;
    used?: number;
    consumed?: number;
    credit_type?: string;
    credit_breakdown?: Record<string, number>;
  };
  if (result?.success === false) {
    const status = result.error === 'QUOTA_EXCEEDED' ? 429 : 402;
    const message =
      result.error === 'QUOTA_EXCEEDED'
        ? '今日图片生成次数已达上限'
        : result.error === 'INSUFFICIENT_MEDIA_CREDITS'
          ? '媒体积分不足，请充值媒体积分后再试'
          : '积分不足，请充值后再试';
    return {
      ok: false,
      status,
      body: {
        error: result.error,
        message,
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
        message: '积分扣减结果异常，请稍后再试'
      }
    };
  }

  return {
    ok: true,
    status: 200,
    consumed,
    creditType: result?.credit_type || 'bonus',
    creditBreakdown: result?.credit_breakdown
  };
}

async function consumeGptImage2DenoiseCredit(
  request: Request,
  userId: string,
  metadata: Record<string, unknown>
): Promise<{
  ok: boolean;
  status: number;
  body?: unknown;
  consumed?: number;
  creditType?: string;
  creditBreakdown?: Record<string, number>;
}> {
  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const supabaseUrl = process.env.SUPABASE_URL;
  const authKey = process.env.SUPABASE_ANON_KEY;
  const admin = getSupabaseAdmin();
  if (!supabaseUrl || !authKey || !admin) {
    return {
      ok: false,
      status: 500,
      body: { error: 'Credit service is not configured' }
    };
  }

  const authClient = createClient(supabaseUrl, authKey, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });
  const {
    data: { user },
    error: authError
  } = await authClient.auth.getUser(token);
  if (!token || authError || user?.id !== userId) {
    return {
      ok: false,
      status: 401,
      body: { error: 'Invalid token' }
    };
  }

  const { data, error } = await admin.rpc(
    'consume_gpt_image_2_denoise_credits_v3',
    {
      p_user_id: userId,
      p_metadata: metadata
    }
  );
  if (error) {
    console.error(
      '[GptImage2Denoise] consume_gpt_image_2_denoise_credits_v3 RPC error:',
      error
    );
    return {
      ok: false,
      status: 500,
      body: {
        error: 'CREDIT_CONSUME_FAILED',
        message: '积分扣减失败，请稍后再试'
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
    const isInsufficientCredits =
      result.error === 'INSUFFICIENT_CREDITS' ||
      result.error === 'INSUFFICIENT_MEDIA_CREDITS';
    return {
      ok: false,
      status: isInsufficientCredits ? 402 : 500,
      body: {
        error: result.error || 'CREDIT_CONSUME_FAILED',
        message: isInsufficientCredits
          ? `可用积分不足，云端双参考降噪固定消耗 ${GPT_IMAGE_2_DENOISE_CREDIT_COST} 积分。`
          : '积分扣减失败，请稍后再试',
        details: result
      }
    };
  }

  if (Number(result?.consumed) !== GPT_IMAGE_2_DENOISE_CREDIT_COST) {
    return {
      ok: false,
      status: 500,
      body: {
        error: 'INVALID_DENOISE_CREDIT_COST',
        message: '降噪积分扣减结果异常，请稍后再试'
      }
    };
  }

  return {
    ok: true,
    status: 200,
    consumed: GPT_IMAGE_2_DENOISE_CREDIT_COST,
    creditType: result?.credit_type || 'media',
    creditBreakdown: result?.credit_breakdown
  };
}

async function refundImageCredit(
  sb: SupabaseClient,
  userId: string,
  amount: number | undefined,
  creditType: string | undefined,
  metadata: Record<string, unknown>
): Promise<boolean> {
  if (!amount) return true;

  const refundMetadata = {
    ...metadata,
    billingDomain: metadata.billingDomain || 'image_generation',
    billingPhase: metadata.billingPhase || 'refund',
    creditBreakdown: metadata.creditBreakdown
  };
  const isDedicatedDenoiseRefund =
    metadata.appOperation === 'gpt-image-2-denoise';
  const refundSource = isDedicatedDenoiseRefund
    ? typeof metadata.taskId === 'string' && metadata.taskId
      ? `denoise_task:${metadata.taskId}:refund`
      : 'gpt_denoise_refund'
    : typeof metadata.taskId === 'string' && metadata.taskId
      ? `image_task:${metadata.taskId}:refund`
      : 'image_generation_refund';
  const { data, error } = isDedicatedDenoiseRefund
    ? await sb.rpc('refund_gpt_image_2_denoise_credits_v3', {
        p_user_id: userId,
        p_amount: amount,
        p_credit_type: creditType || 'bonus',
        p_source: refundSource,
        p_metadata: refundMetadata
      })
    : await sb.rpc('refund_generation_credit', {
        p_user_id: userId,
        p_amount: amount,
        p_credit_type: creditType || 'bonus',
        p_source: refundSource,
        p_metadata: refundMetadata
      });

  if (error) {
    console.error('[ImageGenerate] credit refund RPC failed:', {
      rpc: isDedicatedDenoiseRefund
        ? 'refund_gpt_image_2_denoise_credits_v3'
        : 'refund_generation_credit',
      message: error.message,
      code: error.code,
      hint: error.hint
    });
    if (isDedicatedDenoiseRefund) {
      return false;
    }
    const fallback = await sb.rpc('refund_image_generation_credit', {
      p_user_id: userId,
      p_amount: amount,
      p_credit_type: creditType || 'bonus',
      p_metadata: refundMetadata
    });
    if (fallback.error) {
      console.error('[ImageGenerate] refund_image_generation_credit failed:', {
        message: fallback.error.message,
        code: fallback.error.code,
        hint: fallback.error.hint
      });
      return false;
    }
    const fallbackResult = fallback.data as {
      success?: boolean;
      error?: string;
    } | null;
    return fallbackResult?.success !== false;
  }

  const result = data as { success?: boolean; error?: string } | null;
  if (result?.success === false) {
    console.error('[ImageGenerate] refund_image_generation_credit rejected:', {
      userId,
      amount,
      creditType,
      error: result.error || 'unknown'
    });
    return false;
  }

  return true;
}

async function isImageTaskCancelledBeforeRefund(
  sb: SupabaseClient,
  taskId: string | undefined
): Promise<boolean> {
  if (!taskId) return false;

  const { data, error } = await sb
    .from('image_generation_tasks')
    .select('status')
    .eq('id', taskId)
    .single();

  if (error) {
    console.warn('[ImageGenerate] cancel status lookup before refund failed:', {
      taskId,
      message: error.message
    });
    return false;
  }

  return data?.status === 'cancelled';
}

function buildPartialCreditBreakdown(
  breakdown: Record<string, number> | undefined,
  refundAmount: number,
  chargedAmount: number
): Record<string, number> | undefined {
  if (!breakdown || refundAmount <= 0 || chargedAmount <= 0) return undefined;
  const keys = ['daily', 'subscription', 'bonus'];
  const source = keys.map((key) => ({
    key,
    value: Math.max(0, Number(breakdown[key] || 0))
  }));
  const sourceTotal = source.reduce((sum, item) => sum + item.value, 0);
  if (sourceTotal <= 0) return undefined;

  let remaining = refundAmount;
  const scaled: Record<string, number> = {};
  source.forEach((item, index) => {
    if (index === source.length - 1) {
      scaled[item.key] = Math.max(0, remaining);
      return;
    }
    const value = Math.min(
      remaining,
      Math.floor((item.value / sourceTotal) * refundAmount)
    );
    scaled[item.key] = value;
    remaining -= value;
  });
  return scaled;
}

export async function createImageGenerationTask(
  sb: SupabaseClient,
  userId: string,
  input: SanitizedImageGenerateRequest,
  prepaidCredit?: {
    consumed: number;
    creditType?: string;
    creditBreakdown?: Record<string, number>;
  },
  creditWaiver?: {
    reason: string;
    sourceTaskId?: string;
  },
  taskId?: string
): Promise<string> {
  const policy = evaluateImageGenerationPolicy(input);
  const insertPayload: Record<string, unknown> = {
    ...(taskId ? { id: taskId } : {}),
    user_id: userId,
    status: 'queued',
    request_payload: {
      prompt: input.prompt,
      negativePrompt: input.negativePrompt || null,
      negativePromptSource: input.negativePrompt ? 'user' : 'none',
      model: input.model,
      modelLabel: input.modelLabel,
      provider: input.provider,
      aspectRatio: input.aspectRatio,
      imageSize: input.imageSize,
      quality: input.quality,
      qualityLabel: input.qualityLabel,
      outputFormat: input.outputFormat,
      assetIds: input.assetIds,
      recipeAudit: input.recipeAudit,
      referenceImageIds: input.referenceImageIds,
      referenceMode: input.referenceMode,
      characterCardIds: input.characterCardIds,
      characterReferenceGroups: input.characterReferenceGroups,
      sourceGenerationId: input.sourceGenerationId,
      editInstruction: input.editInstruction,
      editMode: input.editMode,
      appSlug: input.appSlug,
      appOperation: input.appOperation,
      sourceApp: input.sourceApp,
      promptMode: input.promptMode,
      imageCount: input.imageCount,
      creationContext: input.creationContext,
      promptAspectRatio: input.promptAspectRatio,
      promptImageSize: input.promptImageSize,
      policy: {
        version: policy.version,
        riskLevel: policy.riskLevel,
        tags: policy.tags
      },
      prepaidCredit: prepaidCredit
        ? {
            consumed: prepaidCredit.consumed,
            creditType: prepaidCredit.creditType || 'bonus',
            creditBreakdown: prepaidCredit.creditBreakdown
          }
        : null,
      creditWaiver: creditWaiver
        ? {
            reason: creditWaiver.reason,
            sourceTaskId: creditWaiver.sourceTaskId || null
          }
        : null
    }
  };

  const { data, error } = await sb
    .from('image_generation_tasks')
    .insert(insertPayload)
    .select('id')
    .single();

  if (error || !data?.id) {
    throw new Error(
      `Image generation task create failed: ${error?.message || 'empty task id'}`
    );
  }

  return data.id;
}

export function parseQueuedImageGenerationRequest(
  payload: unknown
): SanitizedImageGenerateRequest | null {
  const record =
    payload && typeof payload === 'object'
      ? (payload as Record<string, unknown>)
      : null;
  if (!record) return null;

  const sanitized = sanitizeImageGenerateInput({
    prompt: typeof record.prompt === 'string' ? record.prompt : '',
    negativePrompt:
      typeof record.negativePrompt === 'string'
        ? record.negativePrompt
        : undefined,
    model: typeof record.model === 'string' ? record.model : undefined,
    aspectRatio:
      typeof record.aspectRatio === 'string' ? record.aspectRatio : undefined,
    imageSize:
      typeof record.imageSize === 'string' ? record.imageSize : undefined,
    quality: typeof record.quality === 'string' ? record.quality : undefined,
    outputFormat:
      typeof record.outputFormat === 'string' ? record.outputFormat : undefined,
    promptMode:
      typeof record.promptMode === 'string' ? record.promptMode : undefined,
    imageCount:
      typeof record.imageCount === 'number' ||
      typeof record.imageCount === 'string'
        ? record.imageCount
        : undefined,
    assetIds: Array.isArray(record.assetIds)
      ? record.assetIds.filter((id): id is string => typeof id === 'string')
      : [],
    recipeAudit: record.recipeAudit,
    referenceImageIds: Array.isArray(record.referenceImageIds)
      ? record.referenceImageIds.filter(
          (id): id is string => typeof id === 'string'
        )
      : [],
    referenceMode:
      typeof record.referenceMode === 'string'
        ? record.referenceMode
        : undefined,
    characterCardIds: Array.isArray(record.characterCardIds)
      ? record.characterCardIds.filter(
          (id): id is string => typeof id === 'string'
        )
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
    creationContext: record.creationContext
  });

  if (!sanitized.ok) return null;
  const trustedAppMetadata = {
    appSlug:
      typeof record.appSlug === 'string' ? record.appSlug.trim() : undefined,
    appOperation:
      typeof record.appOperation === 'string'
        ? record.appOperation.trim()
        : undefined,
    sourceApp:
      typeof record.sourceApp === 'string' ? record.sourceApp.trim() : undefined
  };
  const trustedDenoiseProvider =
    sanitized.value.model === CLOUD_DENOISE_MODEL &&
    trustedAppMetadata.appSlug === CLOUD_DENOISE_APP_SLUG &&
    trustedAppMetadata.appOperation === CLOUD_DENOISE_APP_OPERATION &&
    trustedAppMetadata.sourceApp === CLOUD_DENOISE_APP_SLUG &&
    record.provider === 'tuzi';

  const creditWaiver =
    record.creditWaiver && typeof record.creditWaiver === 'object'
      ? (record.creditWaiver as Record<string, unknown>)
      : null;
  const providerOverride =
    typeof record.providerOverride === 'string'
      ? record.providerOverride.trim()
      : '';
  if (
    process.env.CHAOJITUDOU_REAL_TASK_SMOKE_ENABLED === 'true' &&
    creditWaiver?.reason === 'chaojitudou_real_task_smoke' &&
    providerOverride === 'openai'
  ) {
    return {
      ...sanitized.value,
      ...trustedAppMetadata,
      provider: 'openai'
    };
  }

  return {
    ...sanitized.value,
    ...trustedAppMetadata,
    ...(trustedDenoiseProvider ? { provider: 'tuzi' as const } : {})
  };
}

export function parseQueuedImageGenerationPrepaidCredit(payload: unknown):
  | {
      consumed: number;
      creditType?: string;
      creditBreakdown?: Record<string, number>;
    }
  | undefined {
  const record =
    payload && typeof payload === 'object'
      ? (payload as Record<string, unknown>)
      : null;
  const prepaid =
    record?.prepaidCredit && typeof record.prepaidCredit === 'object'
      ? (record.prepaidCredit as Record<string, unknown>)
      : null;
  const consumed = Number(prepaid?.consumed || 0);
  if (!consumed) return undefined;
  const rawBreakdown =
    prepaid?.creditBreakdown && typeof prepaid.creditBreakdown === 'object'
      ? (prepaid.creditBreakdown as Record<string, unknown>)
      : null;
  const creditBreakdown = rawBreakdown
    ? ({
        daily: Number(rawBreakdown.daily || 0),
        subscription: Number(rawBreakdown.subscription || 0),
        bonus: Number(rawBreakdown.bonus || 0),
        ...(Number(rawBreakdown.referral || 0) > 0
          ? { referral: Number(rawBreakdown.referral || 0) }
          : {}),
        ...(Number(rawBreakdown.media || 0) > 0
          ? { media: Number(rawBreakdown.media || 0) }
          : {}),
        ...(Number(rawBreakdown.promoMedia || 0) > 0
          ? { promoMedia: Number(rawBreakdown.promoMedia || 0) }
          : {})
      } as Record<string, number>)
    : undefined;
  return {
    consumed,
    creditType:
      typeof prepaid?.creditType === 'string' ? prepaid.creditType : undefined,
    creditBreakdown
  };
}

export function parseQueuedImageGenerationCreditWaiver(payload: unknown):
  | {
      reason: string;
      sourceTaskId?: string;
    }
  | undefined {
  const record =
    payload && typeof payload === 'object'
      ? (payload as Record<string, unknown>)
      : null;
  const waiver =
    record?.creditWaiver && typeof record.creditWaiver === 'object'
      ? (record.creditWaiver as Record<string, unknown>)
      : null;
  const reason = typeof waiver?.reason === 'string' ? waiver.reason.trim() : '';
  if (!reason) return undefined;
  return {
    reason,
    sourceTaskId:
      typeof waiver?.sourceTaskId === 'string' ? waiver.sourceTaskId : undefined
  };
}

export async function executeImageGenerationJob({
  request,
  userId,
  sanitizedInput,
  sb,
  options = {}
}: {
  request: Request;
  userId: string;
  sanitizedInput: SanitizedImageGenerateRequest;
  sb: SupabaseClient;
  options?: ImageGenerationRunOptions;
}): Promise<ImageGenerationExecutionResult> {
  if (options.cloudDenoiseTask) {
    sanitizedInput = {
      ...sanitizedInput,
      model: CLOUD_DENOISE_MODEL,
      provider: 'tuzi',
      appSlug: CLOUD_DENOISE_APP_SLUG,
      appOperation: CLOUD_DENOISE_APP_OPERATION,
      sourceApp: CLOUD_DENOISE_APP_SLUG
    };
  }
  const jobStartedAt = Date.now();
  const requestedProvider = sanitizedInput.provider;
  const prompt = buildGenerationPrompt(sanitizedInput);
  const referenceSizes = await resolveReferenceImageSizes(
    sb,
    userId,
    sanitizedInput.referenceImageIds,
    sanitizedInput.creationContext?.moodboard
  );
  sanitizedInput = {
    ...sanitizedInput,
    referenceImageSizes: referenceSizes
  };
  const creditMetadata = getImageGenerationCreditMetadata(
    sanitizedInput,
    options
  );
  const attemptLogs: ImageGenerationAttemptLogInput[] = [];
  let chargedCredit: {
    consumed: number;
    creditType?: string;
    creditBreakdown?: Record<string, number>;
  } | null = options.prepaidCredit?.consumed
    ? {
        consumed: options.prepaidCredit.consumed,
        creditType: options.prepaidCredit.creditType,
        creditBreakdown: options.prepaidCredit.creditBreakdown
      }
    : null;
  const executionOptions: ImageGenerationRunOptions = {
    ...options,
    policyFallbackBudget:
      options.policyFallbackBudget ||
      createDailyPolicyFallbackBudget(sb, {
        taskId: options.taskId,
        limit: Number.isFinite(
          Number(process.env.IMAGE_POLICY_FALLBACK_DAILY_LIMIT)
        )
          ? Number(process.env.IMAGE_POLICY_FALLBACK_DAILY_LIMIT)
          : 100
      }),
    attemptLogger: async (attempt) => {
      try {
        const enrichedAttempt: ImageGenerationAttemptLogInput = {
          ...attempt,
          metadata: {
            requestedProvider,
            requestedModel: sanitizedInput.model,
            requestedImageSize: sanitizedInput.imageSize,
            requestedAspectRatio: sanitizedInput.aspectRatio,
            requestedImageCount: sanitizedInput.imageCount,
            outputFormat: sanitizedInput.outputFormat,
            billingCharged: Boolean(chargedCredit),
            chargedCredits: chargedCredit?.consumed || 0,
            creditType: chargedCredit?.creditType,
            skipCreditCharge: Boolean(options.skipCreditCharge),
            prepaidCredit: Boolean(options.prepaidCredit?.consumed),
            creditWaiverReason: options.creditWaiverReason,
            ...attempt.metadata
          }
        };
        attemptLogs.push(enrichedAttempt);
        await options.attemptLogger?.(enrichedAttempt);
        await recordImageGenerationAttempt(
          sb,
          userId,
          options,
          enrichedAttempt
        );
      } catch (error) {
        console.warn('[ImageGenerate] attempt log write failed:', {
          taskId: options.taskId,
          provider: attempt.provider,
          model: attempt.model,
          status: attempt.status,
          reason: getErrorMessage(error)
        });
      }
    }
  };

  let storedImages: StoredImage[] = [];
  let generationIds: string[] = [];
  let partialRefund: {
    amount: number;
    failed: boolean;
  } | null = null;
  let deadlineTimer: ReturnType<typeof setTimeout> | null = null;
  let resolvedReferences: ResolvedImageReference[] = [];
  let resolvedMask: ResolvedImageReference | undefined;
  let usedSingleImageRescue = false;

  try {
    const [explicitReferences, sourceReference] = await Promise.all([
      resolveImageReferences(
        sb,
        userId,
        sanitizedInput.referenceImageIds,
        sanitizedInput.creationContext?.moodboard
      ),
      resolveSourceGenerationReference(
        sb,
        userId,
        sanitizedInput.sourceGenerationId
      )
    ]);
    resolvedReferences = sourceReference
      ? [sourceReference, ...explicitReferences]
      : explicitReferences;
    if (sanitizedInput.maskImageId) {
      const maskReferences = await resolveImageReferences(
        sb,
        userId,
        [sanitizedInput.maskImageId],
        sanitizedInput.creationContext?.moodboard
      );
      resolvedMask = maskReferences[0];
      if (!resolvedMask) {
        throw new Error('蒙版图不存在或无权访问');
      }
    }
    if (resolvedReferences.length > 0) {
      console.info('[ImageGenerate] resolved reference images:', {
        userId,
        taskId: options.taskId,
        referenceCount: resolvedReferences.length,
        referenceRoles: resolvedReferences.map((item) => item.role)
      });
    }

    if (
      !executionOptions.providerHealthLookup &&
      (requestedProvider === 'openai' ||
        getImageProviderExecutionChain(
          requestedProvider,
          options.disableProviderFallback,
          sanitizedInput
        ).includes('tuzi'))
    ) {
      // Generation routing needs to see low-volume cross-channel outages. A
      // single failed task can produce one unavailable row per Tuzi channel;
      // the model-level circuit aggregates those rows and blocks a known
      // unavailable model without silently substituting another model.
      const providerHealthRecords = await safeFetchImageProviderHealth(sb, {
        minAttempts: 1
      });
      executionOptions.providerHealthLookup = buildImageProviderHealthLookup(
        providerHealthRecords
      );
      if (providerHealthRecords.length > 0) {
        console.info('[ImageGenerate] loaded image provider health:', {
          taskId: options.taskId,
          providerHealthRecordCount: providerHealthRecords.length
        });
      }
    }

    if (options.skipCreditCharge) {
      chargedCredit = {
        consumed: 0,
        creditType: 'waived',
        creditBreakdown: {
          daily: 0,
          subscription: 0,
          bonus: 0
        }
      };
    } else if (!chargedCredit) {
      const credit = await consumeImageCredit(request, userId, {
        ...withImageTaskBillingMetadata(
          creditMetadata,
          options.taskId,
          'before_generation'
        )
      });
      if (!credit.ok) {
        const creditBody = credit.body as Record<string, unknown> | undefined;
        const failureReason =
          typeof creditBody?.message === 'string'
            ? creditBody.message
            : typeof creditBody?.error === 'string'
              ? creditBody.error
              : 'credit check failed';
        const failureDetails: ImageGenerationFailureDetails = {
          code: 'CREDIT_CHECK_FAILED',
          category: 'credit',
          retryable: false
        };
        const diagnostics = buildImageGenerationTaskDiagnostics({
          input: sanitizedInput,
          attempts: attemptLogs,
          chargedCredit,
          finalStatus: 'failed',
          failureDetails,
          refundFailed: false,
          options
        });
        return {
          ok: false,
          status: credit.status,
          body: {
            ...(creditBody ||
              ({ error: failureReason } as Record<string, unknown>)),
            diagnostics
          } as Record<string, unknown>,
          failureReason,
          failureDetails,
          diagnostics
        };
      }

      chargedCredit = {
        consumed: credit.consumed || 0,
        creditType: credit.creditType,
        creditBreakdown: credit.creditBreakdown
      };
    }

    let generatedImages: GeneratedImage[] = [];
    const strictInitialProviderOnly = isStrictBatchConsistencyEnabled(
      sanitizedInput.imageCount
    );
    const shouldBypassStrictInitialProviderOnly =
      strictInitialProviderOnly &&
      requestedProvider === 'openai' &&
      shouldSkipOpenAICompatiblePrimaryByHealth({
        input: sanitizedInput,
        options: executionOptions,
        providers: getImageProviderExecutionChain(
          requestedProvider,
          false,
          sanitizedInput
        )
      });
    const initialExecutionOptions =
      strictInitialProviderOnly && !shouldBypassStrictInitialProviderOnly
        ? {
            ...executionOptions,
            disableProviderFallback: true
          }
        : executionOptions;
    try {
      const initialGeneration = isCloudDenoiseInput(sanitizedInput)
        ? generateWithCloudDenoisePipeline({
            input: sanitizedInput,
            options: initialExecutionOptions,
            references: resolvedReferences,
            sb,
            userId
          })
        : generateWithSelectedProvider(
            requestedProvider,
            prompt,
            sanitizedInput,
            withAttemptMetadata(initialExecutionOptions, {
              phase: 'initial',
              ...getImageBatchConsistencyRequestMetadata(sanitizedInput),
              requestedImageCount: sanitizedInput.imageCount,
              effectiveImageCount: sanitizedInput.imageCount,
              strictInitialProviderOnly,
              strictInitialProviderOnlyBypassed:
                shouldBypassStrictInitialProviderOnly,
              ...(requestedProvider === 'openai' ||
              requestedProvider === 'krill'
                ? {
                    tuziRescueDiagnostics: getTuziSingleImageRescueDiagnostics(
                      sanitizedInput.model
                    )
                  }
                : {})
            }),
            resolvedReferences,
            resolvedMask
          );
      generatedImages = await Promise.race([
        initialGeneration,
        new Promise<never>((_, reject) => {
          deadlineTimer = setTimeout(
            () => reject(new PipelineDeadlineError()),
            options.pipelineDeadlineMs || SYNC_PIPELINE_DEADLINE_MS
          );
        })
      ]);
    } catch (initialError) {
      if (deadlineTimer) {
        clearTimeout(deadlineTimer);
        deadlineTimer = null;
      }

      const initialFailureDetails = getFailureDetails(initialError);
      const remainingPipelineMs =
        (options.pipelineDeadlineMs || SYNC_PIPELINE_DEADLINE_MS) -
        (Date.now() - jobStartedAt);
      if (
        isCloudDenoiseInput(sanitizedInput) ||
        isOpenAICompatibleImageProviderPendingError(initialError) ||
        executionOptions.disableProviderFallback ||
        !shouldAttemptSingleImageRescue({
          requestedProvider,
          requestedImageCount: sanitizedInput.imageCount,
          failureDetails: initialFailureDetails
        }) ||
        remainingPipelineMs < 30_000
      ) {
        throw initialError;
      }

      console.warn('[ImageGenerate] attempting batch-capable image rescue:', {
        userId,
        taskId: options.taskId,
        requestedProvider,
        requestedModel: sanitizedInput.model,
        requestedImageCount: sanitizedInput.imageCount,
        remainingPipelineMs,
        failureDetails: initialFailureDetails,
        reason: getErrorMessage(initialError)
      });

      const rescueProviders = getSingleImageRescueProviderChain(
        requestedProvider,
        sanitizedInput
      );
      const tuziRescueAttemptPlanCount =
        getTuziSingleImageRescueAttemptPlanCount(sanitizedInput.model);
      let rescueError: unknown;
      for (const rescueProvider of rescueProviders) {
        if (deadlineTimer) {
          clearTimeout(deadlineTimer);
          deadlineTimer = null;
        }
        const rescueRemainingMs =
          (options.pipelineDeadlineMs || SYNC_PIPELINE_DEADLINE_MS) -
          (Date.now() - jobStartedAt);
        if (rescueRemainingMs < 20_000) break;

        try {
          const rescueImageCount = getRescueImageCount({
            rescueProvider,
            sanitizedInput
          });
          const rescueInput: SanitizedImageGenerateRequest = {
            ...sanitizedInput,
            imageCount: rescueImageCount
          };
          const rescueExecutionOptions: ImageGenerationRunOptions = {
            ...executionOptions,
            disableProviderFallback: true
          };
          if (rescueProvider === 'openai') {
            rescueExecutionOptions.openAICompatibleTimeoutMs = Math.min(
              getOpenAICompatibleSingleImageRescueTimeoutMs(),
              rescueRemainingMs
            );
          }
          generatedImages = await Promise.race([
            generateWithSelectedProvider(
              rescueProvider,
              prompt,
              rescueInput,
              withAttemptMetadata(rescueExecutionOptions, {
                phase:
                  rescueInput.imageCount > 1
                    ? 'initial_rescue_batch'
                    : 'initial_rescue_single',
                ...getImageBatchConsistencyRequestMetadata(rescueInput),
                originalRequestedProvider: requestedProvider,
                originalRequestedImageCount: sanitizedInput.imageCount,
                effectiveImageCount: rescueInput.imageCount,
                rescueProviderChain: rescueProviders,
                rescueProvider,
                rescueImageCount: rescueInput.imageCount,
                tuziRescueAttemptPlanCount,
                tuziRescueDiagnostics: getTuziSingleImageRescueDiagnostics(
                  sanitizedInput.model
                ),
                openAICompatibleRescueTimeoutMs:
                  rescueExecutionOptions.openAICompatibleTimeoutMs || null,
                rescueFromErrorCode: initialFailureDetails.code,
                rescueFromErrorCategory: initialFailureDetails.category
              }),
              resolvedReferences,
              resolvedMask
            ),
            new Promise<never>((_, reject) => {
              deadlineTimer = setTimeout(
                () => reject(new PipelineDeadlineError()),
                rescueRemainingMs
              );
            })
          ]);
          usedSingleImageRescue = true;
          break;
        } catch (error) {
          rescueError = error;
          console.warn('[ImageGenerate] image rescue provider failed:', {
            userId,
            taskId: options.taskId,
            requestedProvider,
            rescueProvider,
            requestedModel: sanitizedInput.model,
            requestedImageCount: sanitizedInput.imageCount,
            originalReason: getErrorMessage(initialError),
            rescueReason: getErrorMessage(error)
          });
        }
      }

      if (!usedSingleImageRescue) {
        const rescueFailureDetails = rescueError
          ? getFailureDetails(rescueError)
          : null;
        console.warn('[ImageGenerate] image rescue failed:', {
          userId,
          taskId: options.taskId,
          requestedProvider,
          requestedModel: sanitizedInput.model,
          requestedImageCount: sanitizedInput.imageCount,
          originalReason: getErrorMessage(initialError),
          rescueReason: rescueError
            ? getErrorMessage(rescueError)
            : 'no rescue budget'
        });
        if (
          rescueError &&
          rescueFailureDetails &&
          isBlockingPartialImageFailure(rescueFailureDetails)
        ) {
          throw rescueError;
        }
        throw initialError;
      }
    }
    if (deadlineTimer) clearTimeout(deadlineTimer);

    const providerGenerated = await completePartialImageGeneration({
      requestedProvider,
      prompt,
      sanitizedInput,
      executionOptions,
      resolvedReferences,
      initialImages: usedSingleImageRescue
        ? generatedImages.slice(0, sanitizedInput.imageCount)
        : generatedImages,
      jobStartedAt
    });
    const generated = await conformGeneratedImagesToRequestedSize(
      providerGenerated,
      sanitizedInput
    );
    if (generated.length === 0) {
      throw new Error('Image provider did not return any usable images');
    }

    const resultAspectRatio = getResultAspectRatio(sanitizedInput);
    const resultImageSize = getResultImageSize(sanitizedInput);
    const creditEstimate = getCreditEstimate(sanitizedInput);
    const groupId =
      options.taskId ||
      `${userId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const storedGeneratedImages: StoredGeneratedImage[] = [];

    for (const [index, image] of generated.entries()) {
      const storedImage = await withOperationTimeout(
        uploadGeneratedImage(sb, userId, image),
        GENERATED_IMAGE_STORAGE_TIMEOUT_MS,
        `Generated image storage timed out after ${Math.round(
          GENERATED_IMAGE_STORAGE_TIMEOUT_MS / 1000
        )}s`
      );
      storedImages = [...storedImages, storedImage];
      const generationId = await recordImageGeneration(
        sb,
        sanitizedInput,
        image,
        storedImage,
        userId,
        {
          groupId,
          imageIndex: index,
          imageCount: generated.length,
          references: resolvedReferences
        }
      );
      generationIds = [...generationIds, generationId];
      storedGeneratedImages.push({
        generationId,
        imageUrl: storedImage.signedUrl,
        imageUrlExpiresIn: 60 * 60 * 24,
        thumbnailUrl: storedImage.thumbnail?.signedUrl,
        previewUrl: storedImage.preview?.signedUrl,
        storageBucket: storedImage.bucket,
        storagePath: storedImage.path,
        thumbnailStoragePath: storedImage.thumbnail?.path,
        previewStoragePath: storedImage.preview?.path,
        width: storedImage.width,
        height: storedImage.height,
        byteSize: storedImage.byteSize,
        provider: image.provider,
        model: image.model,
        modelLabel: getGeneratedModelLabel(image),
        usedFallback: image.usedFallback || false
      });
    }

    const actualCost = creditEstimate.unitCost * generated.length;
    const refundAmount = Math.max(
      0,
      (chargedCredit?.consumed || 0) - actualCost
    );
    const primaryGenerated = generated[0];
    const primaryStored = storedGeneratedImages[0];
    const taskCancelledBeforePartialRefund =
      await isImageTaskCancelledBeforeRefund(sb, options.taskId);
    if (refundAmount > 0 && !taskCancelledBeforePartialRefund) {
      const partialCreditBreakdown = buildPartialCreditBreakdown(
        chargedCredit?.creditBreakdown,
        refundAmount,
        chargedCredit?.consumed || 0
      );
      const refunded = await refundImageCredit(
        sb,
        userId,
        refundAmount,
        chargedCredit?.creditType,
        {
          ...creditMetadata,
          creditBreakdown: partialCreditBreakdown,
          ...withImageTaskBillingMetadata(
            {},
            options.taskId,
            'partial_generation_refund'
          ),
          imageCount: sanitizedInput.imageCount - generated.length,
          requestedImageCount: sanitizedInput.imageCount,
          actualImageCount: generated.length,
          ...getImageBatchConsistencyRequestMetadata(sanitizedInput),
          ...getGeneratedImageBatchLockMetadata(primaryGenerated),
          generationIds,
          storagePaths: storedImages.map((item) => item.path)
        }
      );
      partialRefund = { amount: refundAmount, failed: !refunded };
    }

    const finalConsumed = Math.max(
      0,
      (chargedCredit?.consumed || 0) -
        (partialRefund?.failed ? 0 : refundAmount)
    );
    const referralReward = await qualifyReferralAfterImageGeneration(
      sb,
      userId
    );
    await recordFirstPostPurchaseGenerationSuccess({
      sb,
      userId,
      generationIds,
      imageCount: generated.length,
      requestedImageCount: sanitizedInput.imageCount,
      creditsConsumed: finalConsumed,
      creditType: chargedCredit.creditType,
      creditBreakdown: chargedCredit.creditBreakdown,
      taskId: options.taskId,
      provider: primaryGenerated.provider,
      model: primaryGenerated.model,
      promptMode: sanitizedInput.promptMode
    });

    const strictBatchConsistency = isStrictBatchConsistencyEnabled(
      sanitizedInput.imageCount
    );
    const skippedCrossChannelSupplement =
      strictBatchConsistency &&
      generated.length > 0 &&
      generated.length < sanitizedInput.imageCount;
    const refundedAmount = partialRefund?.failed ? 0 : refundAmount;
    const partialRefundWarning = partialRefund?.failed
      ? '部分图片未返回，但差额积分退还失败，请联系客服核实余额'
      : refundAmount > 0
        ? `图片服务只返回 ${generated.length}/${sanitizedInput.imageCount} 张，未返回部分已自动退回积分`
        : undefined;
    const diagnostics = buildImageGenerationTaskDiagnostics({
      input: sanitizedInput,
      attempts: attemptLogs,
      chargedCredit,
      finalConsumed,
      refundedAmount,
      refundFailed: partialRefund?.failed,
      finalStatus: 'succeeded',
      primaryImage: primaryGenerated,
      storedImages: storedGeneratedImages,
      resultImageSize,
      usedFallback: generated.some((image) => image.usedFallback),
      usedSingleImageRescue,
      skippedCrossChannelSupplement,
      options
    });
    const payload: ImageGenerationSuccessPayload = {
      success: true,
      generationId: primaryStored.generationId,
      imageUrl: primaryStored.imageUrl,
      imageUrlExpiresIn: primaryStored.imageUrlExpiresIn,
      images: storedGeneratedImages,
      imageCount: generated.length,
      requestedImageCount: sanitizedInput.imageCount,
      actualImageCount: generated.length,
      refunded: refundedAmount,
      refundFailed: partialRefund?.failed,
      partialRefundWarning,
      batchConsistencyMode: strictBatchConsistency ? 'strict' : 'single',
      strictBatchConsistency,
      skippedCrossChannelSupplement,
      provider: primaryGenerated.provider,
      model: primaryGenerated.model,
      modelLabel: getGeneratedModelLabel(primaryGenerated),
      requestedModelLabel: sanitizedInput.modelLabel,
      quality: sanitizedInput.quality,
      aspectRatio: resultAspectRatio,
      imageSize: resultImageSize,
      outputFormat: sanitizedInput.outputFormat,
      usedFallback: generated.some((image) => image.usedFallback),
      diagnostics,
      credits: {
        consumed: finalConsumed,
        creditType: chargedCredit.creditType || 'bonus',
        creditBreakdown: chargedCredit.creditBreakdown,
        unitCost: creditEstimate.unitCost,
        requestedCost: creditEstimate.cost,
        refunded: refundedAmount,
        warning: partialRefundWarning
      },
      referralReward
    };

    console.info('[ImageGenerate] succeeded:', {
      userId,
      taskId: options.taskId,
      mode: options.mode || 'sync',
      requestedProvider,
      requestedModel: sanitizedInput.model,
      provider: primaryGenerated.provider,
      model: primaryGenerated.model,
      modelLabel: payload.modelLabel,
      quality: sanitizedInput.quality,
      imageSize: resultImageSize,
      aspectRatio: resultAspectRatio,
      imageCount: generated.length,
      requestedImageCount: sanitizedInput.imageCount,
      ...getImageBatchConsistencyRequestMetadata(sanitizedInput),
      ...getGeneratedImageBatchLockMetadata(primaryGenerated),
      generationIds,
      creditsConsumed: finalConsumed,
      creditsRefunded: partialRefund?.failed ? 0 : refundAmount,
      durationMs: Date.now() - jobStartedAt,
      usedFallback: payload.usedFallback
    });

    return {
      ok: true,
      status: 200,
      payload
    };
  } catch (error) {
    const rawFailureReason = getErrorMessage(error);
    const failureReason = getImageGenerationFailureMessage(
      error,
      sanitizedInput
    );
    const failureDetails = getFailureDetails(error);
    if (
      options.mode === 'queued' &&
      options.taskId &&
      isOpenAICompatibleImageProviderPendingError(error)
    ) {
      const retryAfterMs = Math.max(5_000, Math.floor(error.retryAfterMs));
      const diagnostics = buildImageGenerationTaskDiagnostics({
        input: sanitizedInput,
        attempts: attemptLogs,
        chargedCredit,
        finalConsumed: chargedCredit?.consumed || 0,
        refundedAmount: 0,
        refundFailed: false,
        finalStatus: 'failed',
        failureDetails,
        options
      });
      console.warn('[ImageGenerate] deferred provider poll:', {
        userId,
        taskId: options.taskId,
        mode: options.mode,
        requestedProvider,
        providerTaskId: error.providerTaskId,
        retryAfterMs,
        reason: rawFailureReason,
        failureDetails
      });
      return {
        ok: false,
        status: 202,
        failureReason: rawFailureReason,
        failureDetails,
        refundFailed: false,
        diagnostics,
        body: {
          success: false,
          pendingProviderPoll: true,
          provider: 'openai',
          providerTaskId: error.providerTaskId,
          retryAfterMs,
          error: rawFailureReason,
          errorCode: failureDetails.code,
          errorCategory: failureDetails.category,
          retryable: true,
          refundFailed: false,
          diagnostics,
          reenqueue: {
            taskId: options.taskId,
            delaySeconds: Math.ceil(retryAfterMs / 1000)
          }
        }
      };
    }
    console.error('[ImageGenerate] failed:', {
      userId,
      taskId: options.taskId,
      mode: options.mode || 'sync',
      requestedProvider,
      httpStatus:
        error instanceof ProviderHttpError ? error.httpStatus : undefined,
      reason: rawFailureReason,
      displayReason: failureReason,
      failureDetails
    });
    await deleteStoredImages(sb, storedImages);
    await deleteGenerationRecords(sb, generationIds);
    const taskCancelledBeforeFailureRefund =
      await isImageTaskCancelledBeforeRefund(sb, options.taskId);
    const refunded = taskCancelledBeforeFailureRefund
      ? true
      : await refundImageCredit(
          sb,
          userId,
          chargedCredit?.consumed,
          chargedCredit?.creditType,
          {
            ...creditMetadata,
            creditBreakdown: chargedCredit?.creditBreakdown,
            ...withImageTaskBillingMetadata(
              {},
              options.taskId,
              'generation_failure_refund'
            ),
            imageCount: sanitizedInput.imageCount,
            generationIds,
            storageBuckets: storedImages.map((item) => item.bucket),
            storagePaths: storedImages.map((item) => item.path),
            failureReason,
            rawFailureReason,
            failureDetails
          }
        );
    const diagnostics = buildImageGenerationTaskDiagnostics({
      input: sanitizedInput,
      attempts: attemptLogs,
      chargedCredit,
      finalConsumed: 0,
      refundedAmount: chargedCredit && refunded ? chargedCredit.consumed : 0,
      refundFailed: chargedCredit ? !refunded : false,
      finalStatus: 'failed',
      failureDetails,
      options
    });

    return {
      ok: false,
      status: 500,
      failureReason,
      failureDetails,
      refundFailed: chargedCredit ? !refunded : false,
      diagnostics,
      body: {
        error: failureReason,
        errorCode: failureDetails.code,
        errorCategory: failureDetails.category,
        retryable: failureDetails.retryable,
        refundFailed: chargedCredit ? !refunded : false,
        diagnostics
      }
    };
  } finally {
    if (deadlineTimer) clearTimeout(deadlineTimer);
  }
}

export async function handleImageGenerateRequest(
  request: Request
): Promise<Response> {
  const corsHeaders = getCorsHeadersForRequest(request);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, corsHeaders, 405);
  }

  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return jsonResponse({ error: '请先登录' }, corsHeaders, 401);
  }

  const input = (await request
    .json()
    .catch(() => ({}))) as ImageGenerateRequest;
  const sanitized = sanitizeImageGenerateInput(input);
  if (!sanitized.ok) {
    return jsonResponse(sanitized.body, corsHeaders, sanitized.status);
  }

  const sanitizedInput = sanitized.value;
  const policy = evaluateImageGenerationPolicy(sanitizedInput);
  if (!policy.ok) {
    return jsonResponse(
      {
        error: policy.code || 'image_generation_policy_blocked',
        message:
          policy.message || '该请求不符合图像生成安全策略，请修改后重试。',
        policy: {
          version: policy.version,
          riskLevel: policy.riskLevel,
          tags: policy.tags
        }
      },
      corsHeaders,
      policy.status || 400
    );
  }

  const sb = getSupabaseAdmin();
  if (!sb) {
    return jsonResponse({ error: 'Supabase not configured' }, corsHeaders, 500);
  }

  if (input.async) {
    const taskId = crypto.randomUUID();
    const referenceSizes = await resolveReferenceImageSizes(
      sb,
      userId,
      sanitizedInput.referenceImageIds,
      sanitizedInput.creationContext?.moodboard
    );
    const creditMetadata = getImageGenerationCreditMetadata(
      {
        ...sanitizedInput,
        referenceImageSizes: referenceSizes
      },
      {
        mode: 'queued',
        taskId
      }
    );
    const credit = await consumeImageCredit(request, userId, {
      ...withImageTaskBillingMetadata(creditMetadata, taskId, 'queue_enqueue')
    });
    if (!credit.ok) {
      return jsonResponse(
        (credit.body as Record<string, unknown> | undefined) || {
          error: 'credit check failed'
        },
        corsHeaders,
        credit.status
      );
    }

    const prepaidCredit = {
      consumed: credit.consumed || 0,
      creditType: credit.creditType,
      creditBreakdown: credit.creditBreakdown
    };
    try {
      const createdTaskId = await createImageGenerationTask(
        sb,
        userId,
        sanitizedInput,
        prepaidCredit,
        undefined,
        taskId
      );
      if (createdTaskId !== taskId) {
        console.warn('[ImageGenerate] queued task id mismatch:', {
          expectedTaskId: taskId,
          createdTaskId
        });
      }
    } catch (error) {
      await refundImageCredit(
        sb,
        userId,
        prepaidCredit.consumed,
        prepaidCredit.creditType,
        {
          ...creditMetadata,
          creditBreakdown: prepaidCredit.creditBreakdown,
          ...withImageTaskBillingMetadata({}, taskId, 'queue_enqueue_rollback'),
          failureReason: getErrorMessage(error)
        }
      );
      throw error;
    }
    return jsonResponse(
      {
        success: true,
        queued: true,
        taskId,
        status: 'queued',
        pollAfterMs: 5000
      },
      corsHeaders,
      202
    );
  }

  const result = await executeImageGenerationJob({
    request,
    userId,
    sanitizedInput,
    sb,
    options: { mode: 'sync' }
  });

  return jsonResponse(
    result.ok ? result.payload : result.body || { error: '图片生成失败' },
    corsHeaders,
    result.status
  );
}

export async function handleGptImage2DenoiseRequest(
  request: Request
): Promise<Response> {
  const corsHeaders = getCorsHeadersForRequest(request);
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, corsHeaders, 405);
  }
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return jsonResponse({ error: '请先登录' }, corsHeaders, 401);
  }
  const body = (await request.json().catch(() => ({}))) as {
    referenceId?: unknown;
    strength?: unknown;
    outputFormat?: unknown;
    sourceWidth?: unknown;
    sourceHeight?: unknown;
  };
  const referenceId =
    typeof body.referenceId === 'string' ? body.referenceId.trim() : '';
  const strength =
    body.strength === 'light' ||
    body.strength === 'standard' ||
    body.strength === 'strong'
      ? body.strength
      : null;
  const outputFormat =
    body.outputFormat === 'png' || body.outputFormat === 'webp'
      ? body.outputFormat
      : null;
  const sourceWidth = Math.floor(Number(body.sourceWidth));
  const sourceHeight = Math.floor(Number(body.sourceHeight));
  if (
    !referenceId ||
    !strength ||
    !outputFormat ||
    !Number.isFinite(sourceWidth) ||
    !Number.isFinite(sourceHeight) ||
    sourceWidth <= 0 ||
    sourceHeight <= 0 ||
    sourceWidth > 8192 ||
    sourceHeight > 8192
  ) {
    return jsonResponse(
      {
        error: 'INVALID_DENOISE_REQUEST',
        message:
          'referenceId、strength、outputFormat 或原图尺寸不合法，请刷新页面后重试。'
      },
      corsHeaders,
      400
    );
  }

  const restorationPrompt = buildCloudDenoiseRestorationPrompt(strength);
  const providerImageSize = getImageSizeForSourceDimensions(
    sourceWidth,
    sourceHeight
  );
  const sanitized = sanitizeImageGenerateInput({
    prompt: restorationPrompt,
    model: CLOUD_DENOISE_MODEL,
    aspectRatio: 'auto',
    imageSize: providerImageSize,
    quality: 'auto',
    outputFormat,
    assetIds: [],
    imageCount: 1,
    referenceImageIds: [referenceId],
    referenceMode: 'image_reference',
    editInstruction: restorationPrompt,
    editMode: 'context_locked',
    appSlug: CLOUD_DENOISE_APP_SLUG,
    appOperation: CLOUD_DENOISE_APP_OPERATION,
    sourceApp: CLOUD_DENOISE_APP_SLUG,
    promptMode: 'custom'
  });
  if (!sanitized.ok) {
    return jsonResponse(sanitized.body, corsHeaders, sanitized.status);
  }
  const denoiseInput: SanitizedImageGenerateRequest = {
    ...sanitized.value,
    provider: 'tuzi',
    appSlug: CLOUD_DENOISE_APP_SLUG,
    appOperation: CLOUD_DENOISE_APP_OPERATION,
    sourceApp: CLOUD_DENOISE_APP_SLUG
  };
  const policy = evaluateImageGenerationPolicy(denoiseInput);
  if (!policy.ok) {
    return jsonResponse(
      {
        error: policy.code || 'image_generation_policy_blocked',
        message: policy.message || '该请求不符合图像生成安全策略。'
      },
      corsHeaders,
      policy.status || 400
    );
  }
  const sb = getSupabaseAdmin();
  if (!sb) {
    return jsonResponse({ error: 'Supabase not configured' }, corsHeaders, 500);
  }
  const taskId = crypto.randomUUID();
  const billingMetadata = withImageTaskBillingMetadata(
    {
      source: 'gpt_image_2_denoiser',
      billingDomain: 'image_tool',
      billingTier: 'gpt_image_2_denoise_fixed',
      dynamicCredits: GPT_IMAGE_2_DENOISE_CREDIT_COST,
      unitDynamicCredits: GPT_IMAGE_2_DENOISE_CREDIT_COST,
      imageCount: 1,
      requestedImageCount: 1,
      requestedModel: CLOUD_DENOISE_MODEL,
      providerModel: getConfiguredTuziApiModel(CLOUD_DENOISE_MODEL),
      pipeline: 'deterministic_guide_dual_reference_v2',
      appSlug: CLOUD_DENOISE_APP_SLUG,
      appOperation: CLOUD_DENOISE_APP_OPERATION,
      referenceImageIds: [referenceId],
      strength,
      outputFormat,
      sourceWidth,
      sourceHeight,
      providerImageSize
    },
    taskId,
    'queue_enqueue'
  );
  const credit = await consumeGptImage2DenoiseCredit(
    request,
    userId,
    billingMetadata
  );
  if (!credit.ok) {
    return jsonResponse(
      (credit.body as Record<string, unknown> | undefined) || {
        error: 'credit check failed'
      },
      corsHeaders,
      credit.status
    );
  }
  const prepaidCredit = {
    consumed: credit.consumed || GPT_IMAGE_2_DENOISE_CREDIT_COST,
    creditType: credit.creditType,
    creditBreakdown: credit.creditBreakdown
  };
  try {
    await createImageGenerationTask(
      sb,
      userId,
      denoiseInput,
      prepaidCredit,
      undefined,
      taskId
    );
  } catch (error) {
    await refundImageCredit(
      sb,
      userId,
      prepaidCredit.consumed,
      prepaidCredit.creditType,
      {
        ...billingMetadata,
        creditBreakdown: prepaidCredit.creditBreakdown,
        failureReason: getErrorMessage(error)
      }
    );
    return jsonResponse(
      {
        error: 'DENOISE_TASK_CREATE_FAILED',
        message: '任务创建失败，积分已退回。'
      },
      corsHeaders,
      500
    );
  }
  return jsonResponse(
    {
      taskId,
      pollAfterMs: 5_000,
      cost: GPT_IMAGE_2_DENOISE_CREDIT_COST
    },
    corsHeaders,
    202
  );
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
  const webResponse = await handleImageGenerateRequest(
    isWebRequest(request) ? request : toWebRequest(request)
  );
  if (response) {
    await sendWebResponse(webResponse, response);
    return;
  }
  return webResponse;
}

export default handler;
