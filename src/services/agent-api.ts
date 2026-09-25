import { withRetry, classifyError, type ClassifiedError } from '../utils/retry';
import { getApiBaseUrl } from '@/utils/env';
import { createLogger } from '@/utils/logger';
import {
  normalizePromptCase,
  sortPromptCasesByDisplayPriority
} from '@/utils/prompt-case';
import type {
  ImageCharacterCard,
  ImageCharacterReferenceGroup,
  ImageConsistencyCheckResult,
  ImageReferenceAsset,
  ImageReferenceMode,
  ImageReferenceRole
} from '@/shared/image-reference-types';
import { GPT_IMAGE_2_DENOISE_CREDIT_COST } from '@/shared/gpt-image-2-denoise';
import type { ImagePromptRecipeAudit } from '@/shared/image-prompt-recipe-audit';
import type { TuziReferenceTransport } from '@/shared/tuzi-image-models';
import type { ImageCreationContext } from '@/shared/create-workspace-v2';
import { extractApiErrorMessage } from '@/shared/errors/user-facing-error';

const log = createLogger('AgentAPI');

const API_BASE = getApiBaseUrl();

// ============================================
// ============================================

let authToken: string | null = null;
let chatSyncEndpointState: 'unknown' | 'available' | 'missing' = 'unknown';
let hasLoggedChatSyncFallback = false;
const PROMPT_CASES_CACHE_TTL_MS = 5 * 60 * 1000;
const SIGNED_PROMPT_CASES_CACHE_TTL_MS = 60 * 1000;
const PROMPT_CASES_API_VERSION = 'model-counts-v3';
let publicPromptCasesCache: {
  limit: number;
  locale?: string;
  requireImage?: boolean;
  result: PublicPromptCasesResult;
  expiresAt: number;
} | null = null;
let publicPromptCasesRequest: {
  key: string;
  request: Promise<PublicPromptCasesResult>;
} | null = null;
const publicPromptCaseCache = new Map<
  string,
  {
    caseItem: PromptCase | null;
    expiresAt: number;
  }
>();

export type PromptCaseCountMap = Record<string, number>;

export interface PublicPromptCasesResult {
  cases: PromptCase[];
  total: number;
  navigationTotal: number;
  modelCounts: PromptCaseCountMap;
  categoryCounts: PromptCaseCountMap;
}

export type PromptLibrarySort = 'featured' | 'latest' | 'hot';

export interface PromptLibraryQuery {
  locale: 'zh-CN' | 'en-US' | string;
  model?: string;
  label?: string;
  mediaType?: 'image' | 'video';
  seoOnly?: boolean;
  sort: PromptLibrarySort;
  q?: string;
  cursor?: string;
  limit: number;
}

export interface PromptLibraryFacet {
  slug: string;
  label: string;
  count: number;
  active: boolean;
}

export interface PromptLibraryFacets {
  models: PromptLibraryFacet[];
  labels: PromptLibraryFacet[];
  sorts: Array<{ slug: PromptLibrarySort; label: string; active: boolean }>;
}

export interface PublicPromptLibraryResult {
  items: PromptCase[];
  total: number;
  pageInfo: { nextCursor: string | null; hasMore: boolean };
  facets: PromptLibraryFacets;
  queryEcho: PromptLibraryQuery;
  version: string;
  source: 'database' | 'rpc' | 'cache' | 'fallback';
  debug?: Record<string, unknown>;
}

const publicPromptLibraryResultCache = new Map<
  string,
  {
    result: PublicPromptLibraryResult;
    expiresAt: number;
  }
>();
const publicPromptLibraryRequests = new Map<
  string,
  Promise<PublicPromptLibraryResult>
>();

function promptCaseUsesSignedImageUrl(caseItem: PromptCase): boolean {
  return [caseItem.imageUrl, ...(caseItem.imageUrls || [])].some((url) =>
    url.includes('/storage/v1/object/sign/')
  );
}

function getPromptCasesCacheTtl(cases: PromptCase[]): number {
  return cases.some(promptCaseUsesSignedImageUrl)
    ? SIGNED_PROMPT_CASES_CACHE_TTL_MS
    : PROMPT_CASES_CACHE_TTL_MS;
}

function invalidatePublicPromptCasesCache(): void {
  publicPromptCasesCache = null;
  publicPromptCasesRequest = null;
  publicPromptCaseCache.clear();
  publicPromptLibraryResultCache.clear();
  publicPromptLibraryRequests.clear();
}

export function setAuthToken(token: string | null): void {
  const previousToken = authToken;
  authToken = token;
  if (previousToken !== token) {
    invalidatePublicPromptCasesCache();
  }
}

/** 閼惧嘲褰囩拋銈堢槈 Token */
export function getAuthToken(): string | null {
  return authToken;
}

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }
  return headers;
}

const SMART_CHAT_REQUEST_TARGET_BYTES = 900 * 1024;
const SMART_CHAT_REQUEST_MAX_BYTES = 10 * 1024 * 1024;
const SMART_CHAT_MAX_REFERENCES_CHARS = 40000;
const SMART_CHAT_MAX_HISTORY_CHARS = 8000;
const SMART_CHAT_TRIM_NOTICE = '\n\n[Context trimmed to fit request size]';

function measureRequestBytes(payload: unknown): number {
  return new TextEncoder().encode(JSON.stringify(payload)).length;
}

function measureTextBytes(value: string | undefined): number {
  if (!value) return 0;
  return new TextEncoder().encode(value).length;
}

function truncateContextText(
  value: string | undefined,
  maxChars: number
): string | undefined {
  if (!value) return undefined;
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}${SMART_CHAT_TRIM_NOTICE}`;
}

function truncateTextToBytes(value: string, maxBytes: number): string {
  if (measureTextBytes(value) <= maxBytes) {
    return value;
  }

  let low = 0;
  let high = value.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const candidate = `${value.slice(0, mid)}${SMART_CHAT_TRIM_NOTICE}`;
    if (measureTextBytes(candidate) <= maxBytes) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }

  return `${value.slice(0, low)}${SMART_CHAT_TRIM_NOTICE}`;
}

function buildSmartChatRequestPayload(
  prompt: string,
  options: ChatOptions
): {
  payload: {
    prompt: string;
    context?: ChatOptions['context'];
    thinkingMode?: boolean;
    mode: 'ask' | 'agent';
    feature?: string;
  };
  diagnostics: {
    originalBytes: number;
    finalBytes: number;
    droppedReferenceImages: number;
    referencesTrimmed: boolean;
    historyTrimmed: boolean;
    originalPromptBytes: number;
    finalPromptBytes: number;
    promptTrimmed: boolean;
    originalReferencesBytes: number;
    finalReferencesBytes: number;
    originalHistoryBytes: number;
    finalHistoryBytes: number;
    referenceImagesBytes: number;
    targetImageUrlBytes: number;
    droppedTargetImageUrl: boolean;
  };
} {
  let referencesTrimmed = false;
  let historyTrimmed = false;
  let droppedTargetImageUrl = false;
  let promptTrimmed = false;
  const mode = options.mode || 'ask';
  const context = options.context
    ? {
        ...options.context,
        references: truncateContextText(
          options.context.references,
          SMART_CHAT_MAX_REFERENCES_CHARS
        ),
        history: truncateContextText(
          options.context.history,
          SMART_CHAT_MAX_HISTORY_CHARS
        ),
        referenceImages: options.context.referenceImages
          ? [...options.context.referenceImages]
          : undefined
      }
    : undefined;

  const payload = {
    prompt,
    context,
    thinkingMode: options.thinkingMode,
    mode,
    feature: options.context?.feature
  };

  const originalPayload = {
    prompt,
    context: options.context,
    thinkingMode: options.thinkingMode,
    mode,
    feature: options.context?.feature
  };

  let finalBytes = measureRequestBytes(payload);
  let droppedReferenceImages = 0;

  while (
    finalBytes > SMART_CHAT_REQUEST_TARGET_BYTES &&
    context?.referenceImages &&
    context.referenceImages.length > 1
  ) {
    context.referenceImages.pop();
    droppedReferenceImages += 1;
    finalBytes = measureRequestBytes(payload);
  }

  if (
    finalBytes > SMART_CHAT_REQUEST_TARGET_BYTES &&
    context?.referenceImages &&
    context.referenceImages.length > 0
  ) {
    droppedReferenceImages += context.referenceImages.length;
    delete context.referenceImages;
    finalBytes = measureRequestBytes(payload);
  }

  if (
    finalBytes > SMART_CHAT_REQUEST_TARGET_BYTES &&
    typeof context?.references === 'string'
  ) {
    const harderTrimmedReferences = truncateContextText(
      context.references,
      Math.min(SMART_CHAT_MAX_REFERENCES_CHARS, 12000)
    );
    if (harderTrimmedReferences !== context.references) {
      context.references = harderTrimmedReferences;
      referencesTrimmed = true;
      finalBytes = measureRequestBytes(payload);
    }
  }

  if (
    finalBytes > SMART_CHAT_REQUEST_TARGET_BYTES &&
    typeof context?.history === 'string'
  ) {
    const harderTrimmedHistory = truncateContextText(
      context.history,
      Math.min(SMART_CHAT_MAX_HISTORY_CHARS, 2000)
    );
    if (harderTrimmedHistory !== context.history) {
      context.history = harderTrimmedHistory;
      historyTrimmed = true;
      finalBytes = measureRequestBytes(payload);
    }
  }

  if (context?.referenceImages && context.referenceImages.length === 0) {
    delete context.referenceImages;
    finalBytes = measureRequestBytes(payload);
  }

  if (
    finalBytes > SMART_CHAT_REQUEST_TARGET_BYTES &&
    typeof context?.targetImageUrl === 'string' &&
    context.targetImageUrl.startsWith('data:')
  ) {
    delete context.targetImageUrl;
    delete context.targetImageMessageId;
    droppedTargetImageUrl = true;
    finalBytes = measureRequestBytes(payload);
  }

  if (finalBytes > SMART_CHAT_REQUEST_MAX_BYTES) {
    const payloadWithoutPrompt = {
      ...payload,
      prompt: ''
    };
    const availablePromptBytes = Math.max(
      4096,
      SMART_CHAT_REQUEST_MAX_BYTES - measureRequestBytes(payloadWithoutPrompt)
    );
    const trimmedPrompt = truncateTextToBytes(prompt, availablePromptBytes);
    if (trimmedPrompt !== prompt) {
      payload.prompt = trimmedPrompt;
      promptTrimmed = true;
      finalBytes = measureRequestBytes(payload);
    }
  }
  const referenceImagesBytes =
    context?.referenceImages?.reduce(
      (sum, image) => sum + image.data.length,
      0
    ) || 0;
  const originalPromptBytes = measureTextBytes(prompt);
  const finalPromptBytes = measureTextBytes(payload.prompt);
  const originalReferencesBytes = measureTextBytes(options.context?.references);
  const finalReferencesBytes = measureTextBytes(context?.references);
  const originalHistoryBytes = measureTextBytes(options.context?.history);
  const finalHistoryBytes = measureTextBytes(context?.history);
  const targetImageUrlBytes = measureTextBytes(context?.targetImageUrl);

  return {
    payload,
    diagnostics: {
      originalBytes: measureRequestBytes(originalPayload),
      finalBytes,
      droppedReferenceImages,
      referencesTrimmed:
        referencesTrimmed ||
        (options.context?.references?.length || 0) >
          (context?.references?.length || 0),
      historyTrimmed:
        historyTrimmed ||
        (options.context?.history?.length || 0) >
          (context?.history?.length || 0),
      originalPromptBytes,
      finalPromptBytes,
      promptTrimmed,
      originalReferencesBytes,
      finalReferencesBytes,
      originalHistoryBytes,
      finalHistoryBytes,
      referenceImagesBytes,
      targetImageUrlBytes,
      droppedTargetImageUrl
    }
  };
}

async function handleResponseError(response: Response): Promise<never> {
  let errorMessage = `HTTP ${response.status}`;
  try {
    const errorData = await response.json();
    errorMessage = errorData.error || errorMessage;
  } catch {
    // Some endpoints return empty or non-JSON error bodies.
  }
  const error = new Error(errorMessage);
  const classified = classifyError(error, response.status);
  const enhancedError = new Error(classified.message) as Error & {
    classified: ClassifiedError;
  };
  enhancedError.classified = classified;
  throw enhancedError;
}

export type { ClassifiedError };

// ============================================
// ============================================

export interface ChatOptions {
  /** AI 閹绘劒绶甸崯?*/
  provider?: 'claude' | 'gemini' | 'auto';
  /** 娑撳﹣绗呴弬鍥︿繆閹?*/
  context?: {
    references?: string;
    history?: string;
    pageInfo?: {
      url: string;
      title: string;
    };
    referenceImages?: Array<{ data: string; mimeType: string }>;
    targetImageUrl?: string;
    targetImageMessageId?: string;
    projectId?: string;
    feature?: string;
    retryStep?: {
      stepId: number;
      stepType?: 'tool_call' | 'status' | 'search';
      stepLabel?: string;
      completedToolsBeforeStep?: string[];
    };
  };
  sessionId?: string;
  signal?: AbortSignal;
  timeout?: number;
  thinkingMode?: boolean;
  mode?: 'ask' | 'agent';
}

export interface StreamChunk {
  type:
    | 'text'
    | 'thinking'
    | 'tool_call'
    | 'tool_result'
    | 'status'
    | 'error'
    | 'done'
    | 'image'
    | 'search'
    | 'mode_switch';
  data: unknown;
}

export interface TextChunkData {
  content: string;
}

export interface ToolCallData {
  id: string;
  name: string;
  input: Record<string, unknown>;
  status?: 'pending' | 'running' | 'completed' | 'error' | 'cancelled';
  requiresConfirmation?: boolean;
}

export interface ToolResultData {
  id: string;
  name: string;
  result: unknown;
  success: boolean;
  cancelled?: boolean;
  message?: string;
}

export interface StatusData {
  status: 'analyzing' | 'searching' | 'generating' | 'executing' | 'done';
  message?: string;
}

export interface ErrorData {
  message: string;
}

// ============================================
// ============================================

export async function* streamChat(
  prompt: string,
  options: ChatOptions = {}
): AsyncGenerator<StreamChunk> {
  for await (const chunk of smartChatStream(prompt, {
    ...options,
    mode: options.mode || 'agent'
  })) {
    yield {
      type: chunk.type as StreamChunk['type'],
      data: chunk.data
    };
  }
}

// ============================================
// ============================================

export type BatchImageTaskStatus = 'pending' | 'generating' | 'done' | 'error';

export interface BatchImageTaskData {
  id: string;
  index: number;
  title: string;
  prompt?: string;
  status: BatchImageTaskStatus;
  imageUrl?: string;
  thumbnailUrl?: string;
  errorMessage?: string;
}

export interface BatchPreviewTask {
  id: string;
  index: number;
  title: string;
  prompt: string;
  status: 'pending';
}

export interface BatchPreviewData {
  batchTasks: BatchPreviewTask[];
  totalCount: number;
  estimatedCredits: number;
}

export interface SmartChatChunk {
  type:
    | 'status'
    | 'text'
    | 'thinking'
    | 'image'
    | 'batch_image'
    | 'batch_preview'
    | 'quota_exceeded'
    | 'tool_call'
    | 'tool_result'
    | 'done'
    | 'error'
    | 'mode_switch'
    | 'search';
  data: {
    status?: string;
    message?: string;
    content?: string;
    imageUrl?: string;
    id?: string;
    name?: string;
    input?: Record<string, unknown>;
    result?: unknown;
    success?: boolean;
    batchTasks?: BatchImageTaskData[];
    batchTaskId?: string;
    batchTaskStatus?: BatchImageTaskStatus;
    batchTaskImageUrl?: string;
    batchTaskError?: string;
    totalCount?: number;
    completedCount?: number;
    failedCount?: number;
    estimatedCredits?: number;
    tokenUsage?: {
      inputTokens: number;
      outputTokens: number;
    };
    isImageGeneration?: boolean;
    isBatchPreview?: boolean;
    errorType?:
      | 'QUOTA_EXCEEDED'
      | 'INSUFFICIENT_CREDITS'
      | 'INSUFFICIENT_MEDIA_CREDITS';
    used?: number;
    max?: number;
    feature?: string;
    resetAt?: string;
    currentBalance?: number;
    required?: number;
    retryFromStepId?: number;
  };
}

export async function* smartChatStream(
  prompt: string,
  options: ChatOptions = {}
): AsyncGenerator<SmartChatChunk> {
  log.info(
    '[agent-api] smartChatStream called, prompt length:',
    prompt.length,
    'mode:',
    options.mode
  );
  log.info('[agent-api] smartChatStream context:', {
    hasReferenceImages:
      !!options.context?.referenceImages &&
      options.context.referenceImages.length > 0,
    referenceImagesCount: options.context?.referenceImages?.length || 0
  });

  const { payload, diagnostics } = buildSmartChatRequestPayload(
    prompt,
    options
  );
  const payloadDiagnostics = {
    originalBytes: diagnostics.originalBytes,
    finalBytes: diagnostics.finalBytes,
    originalPromptBytes: diagnostics.originalPromptBytes,
    finalPromptBytes: diagnostics.finalPromptBytes,
    promptTrimmed: diagnostics.promptTrimmed,
    droppedReferenceImages: diagnostics.droppedReferenceImages,
    referencesTrimmed: diagnostics.referencesTrimmed,
    historyTrimmed: diagnostics.historyTrimmed,
    originalReferencesBytes: diagnostics.originalReferencesBytes,
    finalReferencesBytes: diagnostics.finalReferencesBytes,
    originalHistoryBytes: diagnostics.originalHistoryBytes,
    finalHistoryBytes: diagnostics.finalHistoryBytes,
    referenceImagesBytes: diagnostics.referenceImagesBytes,
    targetImageUrlBytes: diagnostics.targetImageUrlBytes,
    droppedTargetImageUrl: diagnostics.droppedTargetImageUrl,
    hasTargetImage: !!payload.context?.targetImageUrl,
    referenceImagesCount: payload.context?.referenceImages?.length || 0,
    referencesLength: payload.context?.references?.length || 0,
    historyLength: payload.context?.history?.length || 0
  };
  const shouldWarnOnPayloadDiagnostics =
    diagnostics.finalBytes >= SMART_CHAT_REQUEST_TARGET_BYTES * 0.8 ||
    diagnostics.originalBytes > diagnostics.finalBytes ||
    diagnostics.droppedReferenceImages > 0 ||
    diagnostics.droppedTargetImageUrl ||
    diagnostics.referencesTrimmed ||
    diagnostics.historyTrimmed ||
    diagnostics.promptTrimmed ||
    diagnostics.finalBytes >= SMART_CHAT_REQUEST_MAX_BYTES;
  const payloadDiagnosticsMethod = shouldWarnOnPayloadDiagnostics
    ? log.warn
    : log.info;
  payloadDiagnosticsMethod(
    '[agent-api] smartChatStream payload diagnostics:',
    payloadDiagnostics
  );

  const response = await withRetry(
    async () => {
      log.info(
        '[agent-api] smartChatStream: sending fetch request to',
        `${API_BASE}/api/agent/smart-chat`
      );
      const res = await fetch(`${API_BASE}/api/agent/smart-chat`, {
        method: 'POST',
        headers: buildHeaders(),
        signal: options.signal,
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        log.info(
          '[agent-api] smartChatStream: response not ok, status:',
          res.status
        );
        await handleResponseError(res);
      }

      log.info('[agent-api] smartChatStream: response ok, status:', res.status);
      return res;
    },
    {
      maxRetries: 2,
      baseDelay: 1000,
      maxDelay: 5000
    }
  );

  log.info(
    '[agent-api] smartChatStream: got response, starting to read stream'
  );
  const reader = response.body?.getReader();
  const decoder = new TextDecoder();

  if (!reader) {
    log.info('[agent-api] smartChatStream: no response body!');
    throw new Error('No response body');
  }

  let buffer = '';
  let currentEventType = 'text';
  let chunkCount = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      log.info(
        '[agent-api] smartChatStream: stream done, total chunks yielded:',
        chunkCount
      );
      break;
    }

    const chunk = decoder.decode(value, { stream: true });
    buffer += chunk;

    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('event: ')) {
        currentEventType = line.slice(7).trim();
        continue;
      }

      if (line.startsWith('data: ')) {
        const dataStr = line.slice(6);
        if (dataStr === '[DONE]') {
          log.info(
            '[agent-api] smartChatStream: received [DONE], total chunks:',
            chunkCount
          );
          return;
        }

        try {
          const data = JSON.parse(dataStr);
          chunkCount++;
          yield {
            type: currentEventType as SmartChatChunk['type'],
            data
          };
          currentEventType = 'text';
        } catch {
          log.warn('[agent-api] Failed to parse smart chat SSE data:', dataStr);
        }
      }
    }
  }
}

export interface VisualImageGenerationRequest {
  prompt: string;
  negativePrompt?: string;
  model: string;
  aspectRatio: string;
  imageSize?: string;
  quality: string;
  outputFormat?: string;
  assetIds: string[];
  promptMode?: 'composed' | 'custom';
  recipeAudit?: ImagePromptRecipeAudit;
  imageCount?: number;
  referenceImageIds?: string[];
  /** Auto-Mask 蒙版参考图 ID：编辑时随原图一起提交给生图模型 */
  maskImageId?: string;
  referenceMode?: ImageReferenceMode;
  characterCardIds?: string[];
  characterReferenceGroups?: ImageCharacterReferenceGroup[];
  sourceGenerationId?: string;
  editInstruction?: string;
  editMode?: 'context_locked';
  appSlug?: string;
  appOperation?: string;
  sourceApp?: string;
  creationContext?: ImageCreationContext;
}

export interface VisualImageModelOption {
  id: string;
  label: string;
  provider: string;
  group?: string;
  description?: string;
  badges?: string[];
  supportsTextToImage: boolean;
  supportsReferenceImage: boolean;
  supportsMultipleImages?: boolean;
  maxImageCount?: number;
  maxReferenceImages: number;
  referenceTransport: TuziReferenceTransport;
  preferredResponseFormat?: 'b64_json' | 'url';
  allowProviderFallback?: boolean;
  recommendedImageSizes?: string[];
  creditMultiplier?: number;
  status?: 'available' | 'degraded' | 'unavailable';
  availabilityReason?:
    | 'configured'
    | 'insufficient_health_data'
    | 'provider_degraded'
    | 'provider_not_configured'
    | 'all_routes_unhealthy';
  configuredRouteCount?: number;
  healthyRouteCount?: number;
}

export interface VisualGeneratedImage {
  generationId: string | null;
  imageUrl: string;
  imageUrlExpiresIn?: number;
  thumbnailUrl?: string;
  previewUrl?: string;
  storageBucket?: string;
  storagePath?: string;
  thumbnailStoragePath?: string;
  previewStoragePath?: string;
  width?: number;
  height?: number;
  byteSize?: number;
  provider?: string;
  model?: string;
  modelLabel?: string;
  usedFallback?: boolean;
}

export interface VisualImageGenerationResult {
  generationId: string | null;
  imageUrl: string;
  imageUrlExpiresIn?: number;
  images: VisualGeneratedImage[];
  imageCount?: number;
  requestedImageCount?: number;
  actualImageCount?: number;
  refunded?: number;
  refundFailed?: boolean;
  partialRefundWarning?: string;
  batchConsistencyMode?: string;
  strictBatchConsistency?: boolean;
  skippedCrossChannelSupplement?: boolean;
  provider: string;
  model: string;
  modelLabel?: string;
  quality?: string;
  aspectRatio?: string;
  imageSize?: string;
  outputFormat?: string;
  usedFallback: boolean;
  credits?: {
    consumed: number;
    creditType?: string;
    refunded?: number;
    warning?: string;
  };
}

export interface VisualVideoGenerationRequest {
  prompt: string;
  model: string;
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
}

export async function uploadVideoReferenceMedia(
  file: File,
  mediaType: 'video' | 'audio'
): Promise<{ mediaUrl: string; filePath: string; bucket: string }> {
  const prepareResponse = await fetch(
    `${API_BASE}/api/video/references/upload`,
    {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({
        action: 'prepare',
        mediaType,
        mimeType: file.type,
        fileSizeBytes: file.size
      })
    }
  );
  const prepared = (await prepareResponse.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  if (!prepareResponse.ok || !prepared.uploadUrl || !prepared.filePath) {
    throw new Error(extractApiErrorMessage(prepared, '参考素材上传准备失败。'));
  }

  const uploadResponse = await fetch(String(prepared.uploadUrl), {
    method: 'PUT',
    headers: {
      'Content-Type': file.type,
      'cache-control': '31536000'
    },
    body: file
  });
  if (!uploadResponse.ok) {
    const message = await uploadResponse.text().catch(() => '');
    throw new Error(
      message.trim() ||
        `参考素材上传失败：${uploadResponse.status} ${uploadResponse.statusText}`
    );
  }

  const completeResponse = await fetch(
    `${API_BASE}/api/video/references/upload`,
    {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({
        action: 'complete',
        mediaType,
        filePath: prepared.filePath
      })
    }
  );
  const completed = (await completeResponse.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  if (!completeResponse.ok || !completed.mediaUrl) {
    throw new Error(
      extractApiErrorMessage(completed, '参考素材读取地址生成失败。')
    );
  }
  return {
    mediaUrl: String(completed.mediaUrl),
    filePath: String(completed.filePath || prepared.filePath),
    bucket: String(completed.bucket || prepared.bucket || '')
  };
}

export interface VisualVideoGenerationItem {
  generationId: string;
  taskId?: string | null;
  videoUrl: string;
  videoUrlExpiresIn?: number;
  posterUrl?: string;
  prompt?: string;
  provider?: string;
  model?: string;
  modelLabel?: string;
  providerTaskId?: string | null;
  aspectRatio?: string | null;
  duration?: number | null;
  storageBucket?: string | null;
  storagePath?: string | null;
  byteSize?: number | null;
  metadata?: Record<string, unknown>;
  isFavorite?: boolean;
  createdAt?: string;
}

export interface VisualVideoGenerationResult {
  taskId: string;
  providerTaskId?: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  pollAfterMs?: number;
  generation?: VisualVideoGenerationItem;
  videoUrl?: string;
  videoUrlExpiresIn?: number;
  posterUrl?: string;
  provider?: string;
  model?: string;
  modelLabel?: string;
  aspectRatio?: string | null;
  duration?: number | null;
  credits?: {
    consumed: number;
    creditType?: string;
    creditBreakdown?: Record<string, number>;
  };
}

export interface VisualVideoHistoryResult {
  items: VisualVideoGenerationItem[];
  nextBefore?: string;
  hasMore: boolean;
}

interface VisualImageTaskResponse {
  success?: boolean;
  queued?: boolean;
  taskId?: string;
  status?: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  pollAfterMs?: number;
  generationId?: string | null;
  imageUrl?: string;
  imageUrlExpiresIn?: number;
  images?: VisualGeneratedImage[];
  imageCount?: number;
  requestedImageCount?: number;
  actualImageCount?: number;
  partialRefundWarning?: string;
  batchConsistencyMode?: string;
  strictBatchConsistency?: boolean;
  skippedCrossChannelSupplement?: boolean;
  currentStage?: VisualImageTaskStage;
  provider?: string;
  model?: string;
  modelLabel?: string;
  quality?: string;
  aspectRatio?: string;
  imageSize?: string;
  outputFormat?: string;
  usedFallback?: boolean;
  credits?: {
    consumed: number;
    creditType?: string;
    refunded?: number;
    warning?: string;
  };
  message?: string;
  error?: string;
  errorDetails?: {
    code?: string;
    category?: string;
    retryable?: boolean;
    httpStatus?: number;
    provider?: string;
    model?: string;
  };
  refundFailed?: boolean;
  refunded?: number;
  cancelledTaskStatus?: 'queued' | 'running' | 'cancelled';
  interruptMode?: 'queue' | 'soft';
  activeTasks?: VisualImageTaskListItem[];
  retryOfTaskId?: string;
  retryImageCount?: number;
  creditWaived?: boolean;
}

interface VisualVideoTaskResponse extends Partial<VisualVideoGenerationResult> {
  success?: boolean;
  queued?: boolean;
  taskId?: string;
  status?: 'queued' | 'running' | 'succeeded' | 'failed';
  pollAfterMs?: number;
  providerTaskId?: string;
  generation?: VisualVideoGenerationItem;
  videoUrl?: string;
  videoUrlExpiresIn?: number;
  posterUrl?: string;
  message?: string;
  error?: string;
  code?: string;
  details?: string;
  requestId?: string;
  retryable?: boolean;
  refundFailed?: boolean;
}

export interface VisualImageTaskListItem {
  taskId: string;
  status: 'queued' | 'running' | 'failed' | 'succeeded' | 'cancelled';
  retryOfTaskId?: string;
  request: VisualImageGenerationRequest;
  createdAt: string;
  startedAt?: string | null;
  updatedAt?: string;
  error?: string;
  errorCategory?: string;
  errorCode?: string;
  retryable?: boolean;
  failureReason?: string;
  queuePosition?: number;
  pollAfterMs?: number;
  imageCount?: number;
  requestedImageCount?: number;
  actualImageCount?: number;
  missingImageCount?: number;
  canRetryMissingImages?: boolean;
  missingImageRetryTaskId?: string;
  missingImageRetryStartedAt?: string;
  missingImageRetryImageCount?: number;
  missingImageRetryCreditWaived?: boolean;
  refunded?: number;
  refundFailed?: boolean;
  partialRefundWarning?: string;
  batchConsistencyMode?: string;
  strictBatchConsistency?: boolean;
  skippedCrossChannelSupplement?: boolean;
  currentStage?: VisualImageTaskStage;
  cancelledTaskStatus?: 'queued' | 'running' | 'cancelled';
  interruptMode?: 'queue' | 'soft';
}

export interface VisualImageTaskStage {
  phase?: 'primary' | 'fallback' | 'rescue' | 'supplemental' | 'unknown';
  provider?: string;
  providerLabel?: string;
  model?: string;
  channel?: string;
  attemptIndex?: number;
  status?: 'running' | 'succeeded' | 'failed';
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  errorCategory?: string;
  errorCode?: string;
  errorMessage?: string;
  failureReason?: string;
  providerRequestId?: string;
}

export interface VisualImageTaskSnapshot {
  tasks: VisualImageTaskListItem[];
  activeCount: number;
  runningCount: number;
  queuedCount: number;
  failedCount: number;
  maxConcurrency: number;
}

export interface VisualImageTaskCancelResult {
  taskId?: string;
  status?: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  refunded?: number;
  refundFailed?: boolean;
  cancelledTaskStatus?: 'queued' | 'running' | 'cancelled';
  interruptMode?: 'queue' | 'soft';
}

interface VisualImageGenerationOptions {
  onQueued?: (taskId: string, pollAfterMs?: number) => void;
}

export interface ImageReferenceUploadInput {
  imageBase64: string;
  mimeType?: string;
  role?: ImageReferenceRole;
  label?: string;
  description?: string;
  sourceApp?: string;
}

export class VisualImageGenerationError extends Error {
  status?: number;
  refundFailed?: boolean;
  errorDetails?: VisualImageTaskResponse['errorDetails'];
  activeTasks?: VisualImageTaskListItem[];

  constructor(
    message: string,
    options: {
      status?: number;
      refundFailed?: boolean;
      errorDetails?: VisualImageTaskResponse['errorDetails'];
      activeTasks?: VisualImageTaskListItem[];
    } = {}
  ) {
    super(message);
    this.name = 'VisualImageGenerationError';
    this.status = options.status;
    this.refundFailed = options.refundFailed;
    this.errorDetails = options.errorDetails;
    this.activeTasks = options.activeTasks;
  }
}

function buildVisualImageGenerationError(
  result: VisualImageTaskResponse,
  fallback: string,
  status?: number
): VisualImageGenerationError {
  const baseMessage = result.message || result.error || fallback;
  return new VisualImageGenerationError(
    result.refundFailed
      ? `${baseMessage}（积分退还失败，请联系客服核实余额）`
      : baseMessage,
    {
      status,
      refundFailed: result.refundFailed,
      errorDetails: result.errorDetails,
      activeTasks: Array.isArray(result.activeTasks)
        ? result.activeTasks
        : undefined
    }
  );
}

export interface VisualImageHistoryItem {
  id: string;
  imageUrl: string;
  imageUrlExpiresIn?: number;
  thumbnailUrl?: string;
  previewUrl?: string;
  storageBucket?: string;
  storagePath?: string;
  thumbnailStoragePath?: string;
  previewStoragePath?: string;
  width?: number;
  height?: number;
  prompt: string;
  negativePrompt?: string;
  modelLabel?: string;
  provider: string;
  model: string;
  aspectRatio?: string;
  imageSize?: string;
  actualImageSize?: string;
  requestedImageSize?: string;
  imageCount?: number;
  requestedImageCount?: number;
  quality?: string;
  outputFormat?: string;
  assetIds: string[];
  referenceImageIds?: string[];
  referenceMode?: ImageReferenceMode;
  characterCardIds?: string[];
  characterReferenceGroups?: ImageCharacterReferenceGroup[];
  sourceGenerationId?: string;
  editInstruction?: string;
  editMode?: 'context_locked';
  appSlug?: string;
  appOperation?: string;
  sourceApp?: string;
  recipeAudit?: ImagePromptRecipeAudit;
  isFavorite?: boolean;
  referenceImages?: ImageReferenceAsset[];
  createdAt: string;
}

export interface ImageCharacterSaveInput {
  id?: string;
  name: string;
  description?: string;
  lockedTraits?: string[];
  referenceImageIds?: string[];
}

export interface ImageConsistencyCheckInput {
  generationId: string;
  prompt?: string;
  characterCardIds?: string[];
  characterReferenceGroups?: ImageCharacterReferenceGroup[];
}

export interface ImageCreatorRecipeScene {
  id: string;
  name: string;
  prompt: string;
  negativePrompt?: string;
  imageCount: number;
  sortOrder: number;
}

export interface ImageCreatorRecipe {
  id: string;
  name: string;
  description?: string;
  recipeType: 'character_scene_pack' | 'style_batch_pack';
  settings: Record<string, unknown>;
  selection: Record<string, unknown>;
  characterCardIds: string[];
  characterReferenceGroups: ImageCharacterReferenceGroup[];
  scenes: ImageCreatorRecipeScene[];
  metadata?: Record<string, unknown>;
  missingCharacterCardIds?: string[];
  missingReferenceImageIds?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface ImageCreatorRecipeSaveInput {
  id?: string;
  name: string;
  description?: string;
  recipeType?: ImageCreatorRecipe['recipeType'];
  settings: Record<string, unknown>;
  selection: Record<string, unknown>;
  characterCardIds: string[];
  characterReferenceGroups: ImageCharacterReferenceGroup[];
  scenes: ImageCreatorRecipeScene[];
  metadata?: Record<string, unknown>;
}

export interface ImageCreatorUserLibraryPreset {
  id: string;
  name: string;
  selection: Record<string, unknown>;
  settings: Record<string, unknown>;
  createdAt: number;
}

export interface ImageCreatorUserLibraryPrompt {
  id: string;
  title: string;
  prompt: string;
  negativePrompt: string;
  createdAt: number;
}

export interface ImageCreatorUserLibraryPayload {
  presets: ImageCreatorUserLibraryPreset[];
  promptLibrary: ImageCreatorUserLibraryPrompt[];
  updatedAt?: string;
}

export interface VisualImageHistoryResult {
  items: VisualImageHistoryItem[];
  total: number;
}

interface VisualImageUrlCacheEntry {
  imageUrl: string;
  thumbnailUrl?: string;
  previewUrl?: string;
  expiresAt: number;
  cachedAt: number;
}

const VISUAL_IMAGE_URL_CACHE_KEY = 'webtomind_visual_image_url_cache_v1';
const VISUAL_IMAGE_URL_CACHE_MAX = 160;
const VISUAL_IMAGE_URL_CACHE_EXPIRY_MARGIN_MS = 5 * 60 * 1000;
const VISUAL_IMAGE_URL_CACHE_FALLBACK_TTL_MS = 24 * 60 * 60 * 1000;

function canUseBrowserStorage(): boolean {
  return typeof window !== 'undefined' && Boolean(window.localStorage);
}

function readVisualImageUrlCache(): Record<string, VisualImageUrlCacheEntry> {
  if (!canUseBrowserStorage()) return {};
  try {
    const raw = window.localStorage.getItem(VISUAL_IMAGE_URL_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, VisualImageUrlCacheEntry>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeVisualImageUrlCache(
  cache: Record<string, VisualImageUrlCacheEntry>
): void {
  if (!canUseBrowserStorage()) return;
  try {
    const now = Date.now();
    const entries = Object.entries(cache)
      .filter(([, entry]) => entry.expiresAt > now)
      .sort(([, a], [, b]) => b.cachedAt - a.cachedAt)
      .slice(0, VISUAL_IMAGE_URL_CACHE_MAX);
    window.localStorage.setItem(
      VISUAL_IMAGE_URL_CACHE_KEY,
      JSON.stringify(Object.fromEntries(entries))
    );
  } catch {
    // Ignore cache write failures; signed URLs from the API remain the source of truth.
  }
}

function getCachedVisualImageUrls(
  id: string
): Pick<
  VisualImageHistoryItem,
  'imageUrl' | 'thumbnailUrl' | 'previewUrl'
> | null {
  const cache = readVisualImageUrlCache();
  const entry = cache[id];
  if (!entry) return null;
  if (entry.expiresAt - VISUAL_IMAGE_URL_CACHE_EXPIRY_MARGIN_MS <= Date.now()) {
    delete cache[id];
    writeVisualImageUrlCache(cache);
    return null;
  }
  return {
    imageUrl: entry.imageUrl,
    thumbnailUrl:
      entry.thumbnailUrl && entry.thumbnailUrl !== entry.imageUrl
        ? entry.thumbnailUrl
        : undefined,
    previewUrl:
      entry.previewUrl && entry.previewUrl !== entry.imageUrl
        ? entry.previewUrl
        : undefined
  };
}

export function getCachedVisualImageUrlsByIds(
  ids: string[]
): Record<
  string,
  Pick<VisualImageHistoryItem, 'imageUrl' | 'thumbnailUrl' | 'previewUrl'>
> {
  const uniqueIds = Array.from(
    new Set(ids.map((id) => id.trim()).filter(Boolean))
  );
  if (uniqueIds.length === 0) return {};

  const cache = readVisualImageUrlCache();
  const now = Date.now();
  let cacheChanged = false;
  const result: Record<
    string,
    Pick<VisualImageHistoryItem, 'imageUrl' | 'thumbnailUrl' | 'previewUrl'>
  > = {};

  uniqueIds.forEach((id) => {
    const entry = cache[id];
    if (!entry) return;
    if (entry.expiresAt - VISUAL_IMAGE_URL_CACHE_EXPIRY_MARGIN_MS <= now) {
      delete cache[id];
      cacheChanged = true;
      return;
    }
    result[id] = {
      imageUrl: entry.imageUrl,
      thumbnailUrl:
        entry.thumbnailUrl && entry.thumbnailUrl !== entry.imageUrl
          ? entry.thumbnailUrl
          : undefined,
      previewUrl:
        entry.previewUrl && entry.previewUrl !== entry.imageUrl
          ? entry.previewUrl
          : undefined
    };
  });

  if (cacheChanged) writeVisualImageUrlCache(cache);
  return result;
}

function rememberVisualImageUrls(
  id: string | null | undefined,
  urls: {
    imageUrl?: string | null;
    thumbnailUrl?: string | null;
    previewUrl?: string | null;
  },
  expiresInSeconds?: number
): void {
  if (!id || !urls.imageUrl) return;
  const now = Date.now();
  const ttlMs =
    typeof expiresInSeconds === 'number' && expiresInSeconds > 0
      ? expiresInSeconds * 1000
      : VISUAL_IMAGE_URL_CACHE_FALLBACK_TTL_MS;
  const cache = readVisualImageUrlCache();
  const existing = cache[id];
  const safeExistingThumbnail =
    existing?.thumbnailUrl && existing.thumbnailUrl !== urls.imageUrl
      ? existing.thumbnailUrl
      : undefined;
  const safeExistingPreview =
    existing?.previewUrl && existing.previewUrl !== urls.imageUrl
      ? existing.previewUrl
      : undefined;
  const safeThumbnail =
    urls.thumbnailUrl && urls.thumbnailUrl !== urls.imageUrl
      ? urls.thumbnailUrl
      : undefined;
  const safePreview =
    urls.previewUrl && urls.previewUrl !== urls.imageUrl
      ? urls.previewUrl
      : undefined;
  cache[id] = {
    imageUrl: urls.imageUrl,
    thumbnailUrl: safeThumbnail || safeExistingThumbnail,
    previewUrl: safePreview || safeExistingPreview,
    expiresAt: now + ttlMs,
    cachedAt: now
  };
  writeVisualImageUrlCache(cache);
}

function forgetVisualImageUrl(id: string): void {
  const cache = readVisualImageUrlCache();
  if (!cache[id]) return;
  delete cache[id];
  writeVisualImageUrlCache(cache);
}

export interface AdminPromptAsset {
  id: string;
  slot:
    | 'character'
    | 'expression'
    | 'pose'
    | 'top'
    | 'bottom'
    | 'shoes'
    | 'background'
    | 'style'
    | 'lighting'
    | 'visualEffect'
    | 'layoutDesign'
    | 'accessory'
    | 'prop'
    | 'lens'
    | 'shot'
    | 'makeup';
  title: string;
  subtitle: string;
  prompt: string;
  negativePrompt?: string;
  tags: string[];
  thumbnailUrl: string;
  sourceBatchId?: string;
  provider?: string;
  visual?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  sortOrder?: number;
  isPublished: boolean;
  publishedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type AdminPromptAssetWrite = Partial<
  Omit<
    AdminPromptAsset,
    | 'createdAt'
    | 'updatedAt'
    | 'publishedAt'
    | 'negativePrompt'
    | 'sourceBatchId'
  >
> & {
  id: string;
  negativePrompt?: string | null;
  sourceBatchId?: string | null;
};

export interface PromptCaseAssetCoverageMatch {
  slot: string;
  assetId: string;
  title: string;
  thumbnailUrl?: string;
  score: number;
  hits: string[];
}

export interface PromptCaseMissingAssetSuggestion {
  id: string;
  slot: string;
  title: string;
  subtitle: string;
  prompt: string;
  tags: string[];
  triggers: string[];
}

export interface PromptCaseAssetCoverageCase {
  id: string;
  slug?: string;
  title?: string;
  category?: string;
  popularity: {
    score: number;
    views: number;
    copies: number;
    generates: number;
  };
  hasExistingRecipe: boolean;
  suggestedSelection: Record<string, unknown>;
  matchedAssets: PromptCaseAssetCoverageMatch[];
  missingAssetSuggestions: PromptCaseMissingAssetSuggestion[];
  coverageScore: number;
  promptSnippet: string;
}

export interface PromptAssetProductionBatchDraft {
  id: string;
  slot: string;
  grid: { columns: number; rows: number; [key: string]: unknown };
  size: string;
  outputSize: number;
  prompt: string;
  assets: Array<{
    id: string;
    slot?: string;
    title: string;
    subtitle: string;
    prompt: string;
    tags: string[];
  }>;
  notes?: string[];
}

export interface PromptCaseAssetCoverageReport {
  generatedAt: string;
  analyzedCaseCount: number;
  assetCount: number;
  assetCountsBySlot: Record<string, number>;
  topMissingBySlot: Record<string, Record<string, unknown>>;
  cases: PromptCaseAssetCoverageCase[];
  batchDrafts: PromptAssetProductionBatchDraft[];
}

export interface PromptAssetProductionBatch extends PromptAssetProductionBatchDraft {
  status: string;
  notes: string[];
  caseIds: string[];
  analysisResult: Record<string, unknown>;
  result: Record<string, unknown>;
  runCommand?: string;
  createdByEmail?: string;
  updatedByEmail?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface PromptCase {
  id: string;
  imageUrl: string;
  imageUrls?: string[];
  mediaType?: 'image' | 'video' | string;
  videoUrl?: string;
  videoUrls?: string[];
  posterUrl?: string;
  durationSeconds?: number;
  uploadDate?: string;
  title?: string;
  slug?: string;
  category?: string;
  tags?: string[];
  model?: string;
  locale?: 'zh-CN' | 'en-US' | string;
  sourceCaseId?: string;
  featured?: boolean;
  memberOnly?: boolean;
  packageSlug?: string;
  commercialIntent?: string;
  promptPreview?: string;
  promptPreviewZh?: string;
  promptPreviewEn?: string;
  visualRecipe?: Record<string, unknown>;
  sourceDraftId?: string;
  viewCount?: number;
  copyCount?: number;
  generateCount?: number;
  promptLocked?: boolean;
  prompt: string;
  promptZh?: string;
  promptEn?: string;
  titleZh?: string;
  titleEn?: string;
  authorUrl?: string;
  sortOrder?: number;
  isPublished?: boolean;
  deletedAt?: string;
  createdByEmail?: string;
  createdAt?: string;
  updatedAt?: string;
  seoStatus?: 'draft' | 'review' | 'indexable' | 'retired';
  seoReviewedAt?: string;
  seoEvidence?: Record<string, unknown>;
}

export type AdminPromptCaseWrite = Partial<
  Omit<
    PromptCase,
    | 'createdAt'
    | 'updatedAt'
    | 'deletedAt'
    | 'createdByEmail'
    | 'authorUrl'
    | 'visualRecipe'
  >
> & {
  id?: string;
  imageUrl?: string;
  imageUrls?: string[];
  prompt?: string;
  authorUrl?: string | null;
  title?: string;
  slug?: string;
  category?: string;
  tags?: string[];
  model?: string;
  locale?: string;
  featured?: boolean;
  visualRecipe?: Record<string, unknown> | null;
};

export type PromptCaseDraftStatus =
  | 'draft'
  | 'images_generated'
  | 'approved'
  | 'published'
  | 'rejected';

export interface PromptCaseDraft {
  id: string;
  packageSlug: string;
  sourceSkill: string;
  title: string;
  category: string;
  tags: string[];
  prompt: string;
  negativePrompt?: string;
  promptPreview?: string;
  commercialIntent?: string;
  generationSettings: {
    model: string;
    imageSize: string;
    quality: 'auto' | 'low' | 'medium' | 'high';
    imageCount: number;
    [key: string]: unknown;
  };
  imageUrls: string[];
  selectedImageUrl?: string;
  memberOnly: boolean;
  status: PromptCaseDraftStatus;
  reviewNotes?: string;
  publishedCaseId?: string;
  createdByEmail?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CommercialCaseDraftGenerateInput {
  packageSlug: string;
  businessScene?: string;
  targetAudience?: string;
  deliverable?: string;
  count?: number;
  locale?: 'zh-CN' | 'en-US' | string;
  imageSize?: string;
  memberOnlyDefault?: boolean;
}

export type PromptCaseDraftImportInput = {
  title: string;
  category: string;
  tags: string[];
  prompt: string;
  negativePrompt?: string;
  commercialIntent?: string;
  generationSettings?: Record<string, unknown>;
  imageUrls: string[];
  selectedImageUrl?: string;
  memberOnly?: boolean;
  reviewNotes?: string;
};

export type AdminPromptCaseDraftWrite = Partial<
  Pick<
    PromptCaseDraft,
    | 'title'
    | 'packageSlug'
    | 'category'
    | 'tags'
    | 'prompt'
    | 'negativePrompt'
    | 'promptPreview'
    | 'commercialIntent'
    | 'generationSettings'
    | 'imageUrls'
    | 'selectedImageUrl'
    | 'memberOnly'
    | 'status'
    | 'reviewNotes'
  >
>;

export interface AiUsageSummaryRecord {
  usageDate: string;
  provider: string;
  model: string;
  source: string;
  eventCount: number;
  succeededCount: number;
  failedCount: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  imageCount: number;
  avgLatencyMs: number | null;
  p95LatencyMs: number | null;
}

export interface AiUsageSummaryFilters {
  from: string;
  to: string;
  provider?: string;
  model?: string;
  source?: string;
  limit: number;
}

export interface AiUsageSummaryTotals {
  eventCount: number;
  succeededCount: number;
  failedCount: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  imageCount: number;
}

export interface AiUsageSummaryResult {
  success?: boolean;
  needsSetup?: boolean;
  error?: string;
  message?: string;
  filters?: AiUsageSummaryFilters;
  items: AiUsageSummaryRecord[];
  totals: AiUsageSummaryTotals;
}

function normalizePromptCaseDraft(input: PromptCaseDraft): PromptCaseDraft {
  return {
    ...input,
    packageSlug: input.packageSlug || '',
    sourceSkill: input.sourceSkill || 'zhong-image-director',
    title: input.title || '',
    category: input.category || 'featured',
    tags: Array.isArray(input.tags)
      ? input.tags.map((tag) => tag.trim()).filter(Boolean)
      : [],
    prompt: input.prompt || '',
    negativePrompt: input.negativePrompt || undefined,
    promptPreview: input.promptPreview || undefined,
    commercialIntent: input.commercialIntent || undefined,
    generationSettings: {
      ...(input.generationSettings || {}),
      model: 'gpt-image-2',
      imageSize: input.generationSettings?.imageSize || '1024x1536',
      quality: input.generationSettings?.quality || 'auto',
      imageCount: Number(input.generationSettings?.imageCount || 2)
    },
    imageUrls: Array.isArray(input.imageUrls)
      ? input.imageUrls.map((url) => url.trim()).filter(Boolean)
      : [],
    selectedImageUrl: input.selectedImageUrl || undefined,
    memberOnly: input.memberOnly === true,
    status: input.status || 'draft'
  };
}

export interface OptimizeImagePromptInput {
  prompt: string;
  negativePrompt?: string;
  locale?: 'zh-CN' | 'en-US';
  promptMode?: 'composed' | 'custom';
  aiTasteScore?: number;
  aiTasteLevel?: 'low' | 'medium' | 'high';
  selectedAssets?: Array<{
    id: string;
    slot: string;
    title: string;
    prompt: string;
    promptZh?: string;
  }>;
  diagnostics?: Array<{
    id: string;
    severity: string;
    title: string;
    description: string;
    suggestion: string;
  }>;
}

export interface OptimizeImagePromptResult {
  success: boolean;
  optimizedPrompt: string;
  optimizedNegativePrompt: string;
  summary: string;
  changes: string[];
  model?: string;
  provider?: string;
}

export async function optimizeImagePrompt(
  data: OptimizeImagePromptInput
): Promise<OptimizeImagePromptResult> {
  const response = await fetch(`${API_BASE}/api/image/prompt-optimize`, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify(data)
  });

  const result = (await response.json().catch(() => ({}))) as Partial<
    OptimizeImagePromptResult & { error?: unknown; message?: unknown }
  >;
  if (!response.ok || !result.success) {
    throw new Error(
      extractApiErrorMessage(result, '提示词优化失败，请稍后重试。')
    );
  }

  return {
    success: true,
    optimizedPrompt: result.optimizedPrompt || data.prompt,
    optimizedNegativePrompt:
      result.optimizedNegativePrompt || data.negativePrompt || '',
    summary: result.summary || '',
    changes: Array.isArray(result.changes) ? result.changes : [],
    model: result.model,
    provider: result.provider
  };
}

export interface OptimizeVideoPromptInput {
  prompt: string;
  locale?: 'zh-CN' | 'en-US';
  model: string;
  aspectRatio: string;
  duration: number;
  resolution: string;
  generateAudio: boolean;
  referenceImageCount: number;
  referenceVideoCount: number;
  referenceAudioCount: number;
  hasFirstFrame: boolean;
  hasLastFrame: boolean;
}

export async function optimizeVideoPrompt(
  data: OptimizeVideoPromptInput
): Promise<OptimizeImagePromptResult> {
  const response = await fetch(`${API_BASE}/api/video/prompt-optimize`, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify({
      prompt: data.prompt,
      locale: data.locale,
      mediaType: 'video',
      promptMode: 'custom',
      videoSettings: {
        model: data.model,
        aspectRatio: data.aspectRatio,
        duration: data.duration,
        resolution: data.resolution,
        generateAudio: data.generateAudio,
        referenceImageCount: data.referenceImageCount,
        referenceVideoCount: data.referenceVideoCount,
        referenceAudioCount: data.referenceAudioCount,
        hasFirstFrame: data.hasFirstFrame,
        hasLastFrame: data.hasLastFrame
      }
    })
  });

  const result = (await response.json().catch(() => ({}))) as Partial<
    OptimizeImagePromptResult & { error?: unknown; message?: unknown }
  >;
  if (!response.ok || !result.success) {
    throw new Error(
      extractApiErrorMessage(result, '提示词优化失败，请稍后重试。')
    );
  }

  return {
    success: true,
    optimizedPrompt: result.optimizedPrompt || data.prompt,
    optimizedNegativePrompt: result.optimizedNegativePrompt || '',
    summary: result.summary || '',
    changes: Array.isArray(result.changes) ? result.changes : [],
    model: result.model,
    provider: result.provider
  };
}

export async function getVisualImageModels(): Promise<
  VisualImageModelOption[]
> {
  const response = await fetch(`${API_BASE}/api/image/models`, {
    headers: buildHeaders()
  });
  const result = (await response.json().catch(() => ({}))) as {
    models?: VisualImageModelOption[];
    error?: unknown;
    message?: unknown;
  };
  if (!response.ok) {
    throw new Error(extractApiErrorMessage(result, '模型列表加载失败。'));
  }
  return Array.isArray(result.models) ? result.models : [];
}

export async function listImageReferences(): Promise<ImageReferenceAsset[]> {
  const response = await fetch(`${API_BASE}/api/image/references`, {
    headers: buildHeaders()
  });
  const result = (await response.json().catch(() => ({}))) as {
    references?: ImageReferenceAsset[];
    error?: unknown;
    message?: unknown;
  };
  if (!response.ok) {
    throw new Error(extractApiErrorMessage(result, '参考图加载失败。'));
  }
  return Array.isArray(result.references) ? result.references : [];
}

export async function uploadImageReference(
  data: ImageReferenceUploadInput
): Promise<ImageReferenceAsset> {
  const response = await fetch(`${API_BASE}/api/image/references/upload`, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify(data)
  });
  const result = (await response.json().catch(() => ({}))) as {
    reference?: ImageReferenceAsset;
    error?: unknown;
    message?: unknown;
  };
  if (!response.ok || !result.reference) {
    throw new Error(extractApiErrorMessage(result, '参考图上传失败。'));
  }
  return result.reference;
}

export async function enqueueGptImage2Denoise(data: {
  referenceId: string;
  strength: 'light' | 'standard' | 'strong';
  outputFormat: 'png' | 'webp';
  sourceWidth: number;
  sourceHeight: number;
}): Promise<{
  taskId: string;
  pollAfterMs: number;
  cost: typeof GPT_IMAGE_2_DENOISE_CREDIT_COST;
}> {
  const response = await fetch(`${API_BASE}/api/tools/gpt-image-2-denoise`, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify(data)
  });
  const result = (await response.json().catch(() => ({}))) as {
    taskId?: string;
    pollAfterMs?: number;
    cost?: number;
    error?: unknown;
    message?: unknown;
  };
  if (
    !response.ok ||
    !result.taskId ||
    result.cost !== GPT_IMAGE_2_DENOISE_CREDIT_COST
  ) {
    const serverMessage =
      typeof result.message === 'string' ? result.message.trim() : '';
    throw new Error(
      serverMessage ||
        extractApiErrorMessage(result, '强力重绘提交失败，请稍后重试。')
    );
  }
  return {
    taskId: result.taskId,
    pollAfterMs: result.pollAfterMs || 5_000,
    cost: GPT_IMAGE_2_DENOISE_CREDIT_COST
  };
}

export async function generateGptImage2Denoise(data: {
  referenceId: string;
  strength: 'light' | 'standard' | 'strong';
  outputFormat: 'png' | 'webp';
  sourceWidth: number;
  sourceHeight: number;
}): Promise<VisualImageGenerationResult> {
  const queued = await enqueueGptImage2Denoise(data);
  return waitForVisualImageTask(queued.taskId, queued.pollAfterMs);
}

export async function importGenerationAsReference(data: {
  generationId: string;
  role?: ImageReferenceRole;
  label?: string;
  description?: string;
}): Promise<ImageReferenceAsset> {
  const response = await fetch(
    `${API_BASE}/api/image/references/from-generation`,
    {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify(data)
    }
  );
  const result = (await response.json().catch(() => ({}))) as {
    reference?: ImageReferenceAsset;
    error?: unknown;
    message?: unknown;
  };
  if (!response.ok || !result.reference) {
    throw new Error(extractApiErrorMessage(result, '图库参考图导入失败。'));
  }
  return result.reference;
}

export async function deleteImageReference(id: string): Promise<void> {
  const response = await fetch(
    `${API_BASE}/api/image/references?id=${encodeURIComponent(id)}`,
    {
      method: 'DELETE',
      headers: buildHeaders()
    }
  );
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(extractApiErrorMessage(result, '参考图删除失败。'));
  }
}

export async function listImageCharacters(): Promise<ImageCharacterCard[]> {
  const response = await fetch(`${API_BASE}/api/image/characters`, {
    headers: buildHeaders()
  });
  const result = (await response.json().catch(() => ({}))) as {
    characters?: ImageCharacterCard[];
    error?: unknown;
    message?: unknown;
  };
  if (!response.ok) {
    throw new Error(extractApiErrorMessage(result, '角色卡加载失败。'));
  }
  return Array.isArray(result.characters) ? result.characters : [];
}

export async function createImageCharacter(
  data: ImageCharacterSaveInput
): Promise<ImageCharacterCard> {
  const response = await fetch(`${API_BASE}/api/image/characters`, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify(data)
  });
  const result = (await response.json().catch(() => ({}))) as {
    character?: ImageCharacterCard;
    error?: unknown;
    message?: unknown;
  };
  if (!response.ok || !result.character) {
    throw new Error(extractApiErrorMessage(result, '角色卡创建失败。'));
  }
  return result.character;
}

export async function updateImageCharacter(
  data: ImageCharacterSaveInput & { id: string }
): Promise<ImageCharacterCard> {
  const response = await fetch(`${API_BASE}/api/image/characters`, {
    method: 'PATCH',
    headers: buildHeaders(),
    body: JSON.stringify(data)
  });
  const result = (await response.json().catch(() => ({}))) as {
    character?: ImageCharacterCard;
    error?: unknown;
    message?: unknown;
  };
  if (!response.ok || !result.character) {
    throw new Error(extractApiErrorMessage(result, '角色卡更新失败。'));
  }
  return result.character;
}

export async function deleteImageCharacter(id: string): Promise<void> {
  const response = await fetch(
    `${API_BASE}/api/image/characters?id=${encodeURIComponent(id)}`,
    {
      method: 'DELETE',
      headers: buildHeaders()
    }
  );
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(extractApiErrorMessage(result, '角色卡删除失败。'));
  }
}

export async function listImageCreatorRecipes(): Promise<ImageCreatorRecipe[]> {
  const response = await fetch(`${API_BASE}/api/image/recipes`, {
    headers: buildHeaders()
  });
  const result = (await response.json().catch(() => ({}))) as {
    recipes?: ImageCreatorRecipe[];
    error?: unknown;
    message?: unknown;
  };
  if (!response.ok) {
    throw new Error(extractApiErrorMessage(result, '场景套件加载失败。'));
  }
  return Array.isArray(result.recipes) ? result.recipes : [];
}

export async function saveImageCreatorRecipe(
  data: ImageCreatorRecipeSaveInput
): Promise<ImageCreatorRecipe> {
  const id = data.id?.trim();
  const response = await fetch(
    id
      ? `${API_BASE}/api/image/recipes?id=${encodeURIComponent(id)}`
      : `${API_BASE}/api/image/recipes`,
    {
      method: id ? 'PATCH' : 'POST',
      headers: buildHeaders(),
      body: JSON.stringify(data)
    }
  );
  const result = (await response.json().catch(() => ({}))) as {
    recipe?: ImageCreatorRecipe;
    error?: unknown;
    message?: unknown;
  };
  if (!response.ok || !result.recipe) {
    throw new Error(extractApiErrorMessage(result, '场景套件保存失败。'));
  }
  return result.recipe;
}

export async function deleteImageCreatorRecipe(id: string): Promise<void> {
  const response = await fetch(
    `${API_BASE}/api/image/recipes?id=${encodeURIComponent(id)}`,
    {
      method: 'DELETE',
      headers: buildHeaders()
    }
  );
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(extractApiErrorMessage(result, '场景套件删除失败。'));
  }
}

export async function getImageCreatorUserLibrary(): Promise<ImageCreatorUserLibraryPayload> {
  const response = await fetch(`${API_BASE}/api/image/user-library`, {
    headers: buildHeaders()
  });
  const result = (await response.json().catch(() => ({}))) as
    | ImageCreatorUserLibraryPayload
    | {
        error?: unknown;
        message?: unknown;
      };
  if (!response.ok) {
    throw new Error(extractApiErrorMessage(result, '个人提示词库加载失败。'));
  }
  const data = result as ImageCreatorUserLibraryPayload;
  return {
    presets: Array.isArray(data.presets) ? data.presets : [],
    promptLibrary: Array.isArray(data.promptLibrary) ? data.promptLibrary : [],
    updatedAt: data.updatedAt
  };
}

export async function saveImageCreatorUserLibrary(
  data: ImageCreatorUserLibraryPayload
): Promise<ImageCreatorUserLibraryPayload> {
  const response = await fetch(`${API_BASE}/api/image/user-library`, {
    method: 'PUT',
    headers: buildHeaders(),
    body: JSON.stringify(data)
  });
  const result = (await response.json().catch(() => ({}))) as
    | ImageCreatorUserLibraryPayload
    | {
        error?: unknown;
        message?: unknown;
      };
  if (!response.ok) {
    throw new Error(extractApiErrorMessage(result, '个人提示词库同步失败。'));
  }
  const saved = result as ImageCreatorUserLibraryPayload;
  return {
    presets: Array.isArray(saved.presets) ? saved.presets : [],
    promptLibrary: Array.isArray(saved.promptLibrary)
      ? saved.promptLibrary
      : [],
    updatedAt: saved.updatedAt
  };
}

export async function checkImageConsistency(
  data: ImageConsistencyCheckInput
): Promise<ImageConsistencyCheckResult> {
  const response = await fetch(`${API_BASE}/api/image/consistency/check`, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify(data)
  });
  const result = (await response.json().catch(() => ({}))) as {
    consistency?: ImageConsistencyCheckResult;
    error?: unknown;
    message?: unknown;
  };
  if (!response.ok || !result.consistency) {
    throw new Error(extractApiErrorMessage(result, '一致性检查失败。'));
  }
  return result.consistency;
}

export async function enqueueVisualImageTask(
  data: VisualImageGenerationRequest
): Promise<{ taskId: string; pollAfterMs?: number }> {
  const response = await fetch(`${API_BASE}/api/image/generate`, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify({ ...data, async: true })
  });

  const result = (await response
    .json()
    .catch(() => ({}))) as VisualImageTaskResponse;

  if (response.status === 202 && result.queued && result.taskId) {
    return {
      taskId: result.taskId,
      pollAfterMs: result.pollAfterMs
    };
  }

  if (!response.ok || !result.success || !result.taskId) {
    throw buildVisualImageGenerationError(
      result,
      '图片生成失败，请稍后重试。',
      response.status
    );
  }

  return {
    taskId: result.taskId,
    pollAfterMs: result.pollAfterMs
  };
}

export async function retryVisualImageTask(taskId: string): Promise<{
  taskId: string;
  pollAfterMs?: number;
  creditWaived?: boolean;
  retryImageCount?: number;
  retryOfTaskId?: string;
}> {
  const response = await fetch(`${API_BASE}/api/image/task`, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify({ id: taskId, action: 'retry' })
  });

  const result = (await response
    .json()
    .catch(() => ({}))) as VisualImageTaskResponse;

  if (response.status === 202 && result.queued && result.taskId) {
    return {
      taskId: result.taskId,
      pollAfterMs: result.pollAfterMs,
      creditWaived: result.creditWaived,
      retryImageCount: result.retryImageCount,
      retryOfTaskId: result.retryOfTaskId
    };
  }

  throw buildVisualImageGenerationError(
    result,
    '图片任务暂不可重试，请稍后再试或编辑提示词后重新生成。',
    response.status
  );
}

export async function cancelVisualImageTask(
  taskId: string
): Promise<VisualImageTaskCancelResult> {
  const response = await fetch(`${API_BASE}/api/image/task`, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify({ id: taskId, action: 'cancel' })
  });
  const result = (await response
    .json()
    .catch(() => ({}))) as VisualImageTaskCancelResult & {
    success?: boolean;
    message?: string;
    error?: string;
  };
  if (!response.ok) {
    throw new Error(
      extractApiErrorMessage(result, '图片任务中止失败，请稍后重试。')
    );
  }
  return result;
}

export async function deleteFailedVisualImageTask(
  taskId: string
): Promise<void> {
  const response = await fetch(`${API_BASE}/api/image/task`, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify({ id: taskId, action: 'delete_failed' })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      extractApiErrorMessage(result, '失败任务清理失败，请稍后重试。')
    );
  }
}

export async function generateVisualImage(
  data: VisualImageGenerationRequest,
  options: VisualImageGenerationOptions = {}
): Promise<VisualImageGenerationResult> {
  const queued = await enqueueVisualImageTask(data);
  options.onQueued?.(queued.taskId, queued.pollAfterMs);
  return waitForVisualImageTask(queued.taskId, queued.pollAfterMs);
}

function mapVisualImageGenerationResult(
  result: VisualImageTaskResponse
): VisualImageGenerationResult {
  const images =
    Array.isArray(result.images) && result.images.length > 0
      ? result.images
          .filter((image) => image?.imageUrl)
          .map((image) => ({
            generationId: image.generationId || null,
            imageUrl: image.imageUrl,
            imageUrlExpiresIn:
              image.imageUrlExpiresIn || result.imageUrlExpiresIn,
            thumbnailUrl: image.thumbnailUrl,
            previewUrl: image.previewUrl,
            storageBucket: image.storageBucket,
            storagePath: image.storagePath,
            thumbnailStoragePath: image.thumbnailStoragePath,
            previewStoragePath: image.previewStoragePath,
            width: image.width,
            height: image.height,
            byteSize: image.byteSize,
            provider: image.provider || result.provider,
            model: image.model || result.model,
            modelLabel: image.modelLabel || result.modelLabel,
            usedFallback: Boolean(image.usedFallback || result.usedFallback)
          }))
      : result.imageUrl
        ? [
            {
              generationId: result.generationId || null,
              imageUrl: result.imageUrl,
              imageUrlExpiresIn: result.imageUrlExpiresIn,
              thumbnailUrl: result.images?.[0]?.thumbnailUrl,
              previewUrl: result.images?.[0]?.previewUrl,
              storageBucket: result.images?.[0]?.storageBucket,
              storagePath: result.images?.[0]?.storagePath,
              thumbnailStoragePath: result.images?.[0]?.thumbnailStoragePath,
              previewStoragePath: result.images?.[0]?.previewStoragePath,
              width: result.images?.[0]?.width,
              height: result.images?.[0]?.height,
              byteSize: result.images?.[0]?.byteSize,
              provider: result.provider,
              model: result.model,
              modelLabel: result.modelLabel,
              usedFallback: Boolean(result.usedFallback)
            }
          ]
        : [];
  const primaryImage = images[0];
  const mapped = {
    generationId: primaryImage?.generationId || result.generationId || null,
    imageUrl: primaryImage?.imageUrl || result.imageUrl || '',
    imageUrlExpiresIn:
      primaryImage?.imageUrlExpiresIn || result.imageUrlExpiresIn,
    images,
    imageCount: result.imageCount || images.length,
    requestedImageCount: result.requestedImageCount,
    actualImageCount:
      result.actualImageCount || result.imageCount || images.length,
    refunded: result.refunded ?? result.credits?.refunded,
    refundFailed: result.refundFailed,
    partialRefundWarning:
      result.partialRefundWarning || result.credits?.warning,
    batchConsistencyMode: result.batchConsistencyMode,
    strictBatchConsistency: result.strictBatchConsistency,
    skippedCrossChannelSupplement: result.skippedCrossChannelSupplement,
    provider: result.provider || '',
    model: result.model || '',
    modelLabel: result.modelLabel,
    quality: result.quality,
    aspectRatio: result.aspectRatio,
    imageSize: result.imageSize,
    outputFormat: result.outputFormat,
    usedFallback: !!result.usedFallback,
    credits: result.credits
  };
  rememberVisualImageUrls(
    mapped.generationId,
    {
      imageUrl: mapped.imageUrl,
      thumbnailUrl: primaryImage?.thumbnailUrl,
      previewUrl: primaryImage?.previewUrl
    },
    mapped.imageUrlExpiresIn
  );
  images.forEach((image) =>
    rememberVisualImageUrls(
      image.generationId,
      {
        imageUrl: image.imageUrl,
        thumbnailUrl: image.thumbnailUrl,
        previewUrl: image.previewUrl
      },
      image.imageUrlExpiresIn
    )
  );
  return mapped;
}

export async function waitForVisualImageTask(
  taskId: string,
  initialDelayMs = 5000
): Promise<VisualImageGenerationResult> {
  let delayMs = initialDelayMs;
  const startedAt = Date.now();
  const maxWaitMs = 10 * 60 * 1000;

  while (Date.now() - startedAt < maxWaitMs) {
    if (delayMs > 0) {
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(delayMs, 10000))
      );
    }

    let response: Response;
    try {
      response = await fetch(
        `${API_BASE}/api/image/task?id=${encodeURIComponent(taskId)}`,
        { headers: buildHeaders() }
      );
    } catch {
      delayMs = 5000;
      continue;
    }
    const result = (await response
      .json()
      .catch(() => ({}))) as VisualImageTaskResponse;

    if ([502, 503, 504].includes(response.status)) {
      delayMs = 5000;
      continue;
    }

    if (!response.ok) {
      throw buildVisualImageGenerationError(
        result,
        '图片任务查询失败。',
        response.status
      );
    }

    if (
      result.status === 'succeeded' ||
      result.imageUrl ||
      result.images?.length
    ) {
      return mapVisualImageGenerationResult(result);
    }

    if (result.status === 'cancelled') {
      throw new VisualImageGenerationError(
        result.message || '图片任务已中止。',
        {
          errorDetails: {
            code: 'IMAGE_TASK_CANCELLED',
            category: 'cancelled',
            retryable: false
          }
        }
      );
    }

    if (result.status === 'failed' || result.success === false) {
      throw buildVisualImageGenerationError(
        result,
        '图片生成失败，请稍后重试。'
      );
    }

    delayMs = result.pollAfterMs || 5000;
  }

  throw new Error('图片生成仍在队列中，请稍后刷新历史记录查看结果。');
}

export interface VisualImageTaskPollResult {
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  currentStage?: VisualImageTaskStage;
  message?: string;
  imageUrl?: string;
  imageUrlExpiresIn?: number;
  images?: VisualGeneratedImage[];
  generationId?: string | null;
}

/**
 * 轻量查询单个图片任务状态，供需要展示进度而不阻塞的界面使用。
 */
export async function getVisualImageTaskStatus(
  taskId: string
): Promise<VisualImageTaskPollResult> {
  const response = await fetch(
    `${API_BASE}/api/image/task?id=${encodeURIComponent(taskId)}`,
    { headers: buildHeaders() }
  );
  const result = (await response.json().catch(() => ({}))) as VisualImageTaskResponse;
  if ([502, 503, 504].includes(response.status)) {
    return { status: 'running' };
  }
  if (!response.ok) {
    throw buildVisualImageGenerationError(
      result,
      '图片任务查询失败。',
      response.status
    );
  }
  return {
    status: result.status || 'running',
    currentStage: result.currentStage,
    message: result.message || result.error,
    imageUrl: result.imageUrl,
    imageUrlExpiresIn: result.imageUrlExpiresIn,
    images: result.images,
    generationId: result.generationId
  };
}

function mapVisualVideoGenerationResult(
  result: VisualVideoTaskResponse
): VisualVideoGenerationResult {
  return {
    taskId: result.taskId || result.generation?.taskId || '',
    providerTaskId:
      result.providerTaskId || result.generation?.providerTaskId || undefined,
    status: result.status || (result.generation ? 'succeeded' : 'running'),
    pollAfterMs: result.pollAfterMs,
    generation: result.generation,
    videoUrl: result.videoUrl || result.generation?.videoUrl,
    videoUrlExpiresIn:
      result.videoUrlExpiresIn || result.generation?.videoUrlExpiresIn,
    posterUrl: result.posterUrl || result.generation?.posterUrl,
    provider: result.provider || result.generation?.provider,
    model: result.model || result.generation?.model,
    modelLabel: result.modelLabel || result.generation?.modelLabel,
    aspectRatio: result.aspectRatio || result.generation?.aspectRatio,
    duration: result.duration || result.generation?.duration,
    credits: result.credits
  };
}

export async function enqueueVisualVideoTask(
  data: VisualVideoGenerationRequest
): Promise<{ taskId: string; pollAfterMs?: number }> {
  const response = await fetch(`${API_BASE}/api/video/generate`, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify({ ...data, async: true })
  });

  const result = (await response
    .json()
    .catch(() => ({}))) as VisualVideoTaskResponse;
  if (response.status === 202 && result.queued && result.taskId) {
    return {
      taskId: result.taskId,
      pollAfterMs: result.pollAfterMs
    };
  }

  if (!response.ok || !result.taskId) {
    throw new Error(
      extractApiErrorMessage(result, '视频生成失败，请稍后重试。')
    );
  }

  return {
    taskId: result.taskId,
    pollAfterMs: result.pollAfterMs
  };
}

export async function getVisualVideoAvailability(): Promise<{
  enabled: boolean;
  message?: string;
  models: Array<{
    id: string;
    status: 'beta' | 'available' | 'unavailable';
  }>;
}> {
  const response = await fetch(`${API_BASE}/api/video/models`, {
    method: 'GET',
    headers: buildHeaders()
  });
  const result = (await response.json().catch(() => ({}))) as {
    enabled?: boolean;
    message?: string;
    models?: unknown;
  };

  if (!response.ok) {
    throw new Error(extractApiErrorMessage(result, '视频生成状态获取失败。'));
  }

  return {
    enabled: result.enabled === true,
    message: result.message,
    models: Array.isArray(result.models)
      ? result.models.flatMap((item) => {
          if (!item || typeof item !== 'object') return [];
          const record = item as Record<string, unknown>;
          if (
            typeof record.id !== 'string' ||
            !['beta', 'available', 'unavailable'].includes(
              String(record.status)
            )
          ) {
            return [];
          }
          return [
            {
              id: record.id,
              status: record.status as 'beta' | 'available' | 'unavailable'
            }
          ];
        })
      : []
  };
}

export async function waitForVisualVideoTask(
  taskId: string,
  initialDelayMs = 5000
): Promise<VisualVideoGenerationResult> {
  let delayMs = initialDelayMs;
  const startedAt = Date.now();
  const maxWaitMs = 20 * 60 * 1000;

  while (Date.now() - startedAt < maxWaitMs) {
    if (delayMs > 0) {
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(delayMs, 15000))
      );
    }

    let response: Response;
    try {
      response = await fetch(
        `${API_BASE}/api/video/task?id=${encodeURIComponent(taskId)}`,
        { headers: buildHeaders() }
      );
    } catch {
      delayMs = 8000;
      continue;
    }

    const result = (await response
      .json()
      .catch(() => ({}))) as VisualVideoTaskResponse;
    if ([502, 503, 504].includes(response.status)) {
      delayMs = 8000;
      continue;
    }
    if (!response.ok) {
      throw new Error(
        extractApiErrorMessage(result, '视频任务查询失败，请稍后重试。')
      );
    }
    if (result.status === 'succeeded' || result.videoUrl || result.generation) {
      return mapVisualVideoGenerationResult(result);
    }
    if (result.status === 'failed' || result.success === false) {
      throw new Error(
        extractApiErrorMessage(result, '视频生成失败，积分已自动退回。')
      );
    }

    delayMs = result.pollAfterMs || 8000;
  }

  throw new Error('视频生成仍在处理中，请稍后刷新历史记录查看结果。');
}

export async function generateVisualVideo(
  data: VisualVideoGenerationRequest
): Promise<VisualVideoGenerationResult> {
  const queued = await enqueueVisualVideoTask(data);
  return waitForVisualVideoTask(queued.taskId, queued.pollAfterMs);
}

export async function listActiveVisualImageTasks(
  limit = 20
): Promise<VisualImageTaskListItem[]> {
  const snapshot = await getVisualImageTaskSnapshot(limit);
  return snapshot.tasks;
}

export async function getVisualImageTaskSnapshot(
  limit = 20
): Promise<VisualImageTaskSnapshot> {
  const safeLimit = Math.max(1, Math.min(50, Math.floor(limit)));
  const response = await fetch(
    `${API_BASE}/api/image/task?mode=active&limit=${encodeURIComponent(
      String(safeLimit)
    )}`,
    { headers: buildHeaders() }
  );

  const result = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    tasks?: VisualImageTaskListItem[];
    activeCount?: number;
    runningCount?: number;
    queuedCount?: number;
    failedCount?: number;
    maxConcurrency?: number;
    error?: string;
    message?: string;
  };
  if (!response.ok || result.success === false) {
    throw new Error(result.message || result.error || '图片任务列表加载失败。');
  }

  const tasks = Array.isArray(result.tasks) ? result.tasks : [];
  return {
    tasks,
    activeCount:
      typeof result.activeCount === 'number'
        ? result.activeCount
        : tasks.length,
    runningCount:
      typeof result.runningCount === 'number'
        ? result.runningCount
        : tasks.filter((task) => task.status === 'running').length,
    queuedCount:
      typeof result.queuedCount === 'number'
        ? result.queuedCount
        : tasks.filter((task) => task.status === 'queued').length,
    failedCount:
      typeof result.failedCount === 'number'
        ? result.failedCount
        : tasks.filter((task) => task.status === 'failed').length,
    maxConcurrency:
      typeof result.maxConcurrency === 'number' ? result.maxConcurrency : 1
  };
}

export async function getVisualImageHistoryResult(
  limit: number | 'all' = 12,
  offset = 0,
  options: { favorite?: boolean } = {}
): Promise<VisualImageHistoryResult> {
  const params = new URLSearchParams({
    limit: String(limit)
  });
  if (offset > 0) {
    params.set('offset', String(offset));
  }
  if (options.favorite) {
    params.set('favorite', 'true');
  }
  const response = await fetch(
    `${API_BASE}/api/image/history?${params.toString()}`,
    {
      headers: buildHeaders()
    }
  );

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.message || result.error || '图片历史加载失败。');
  }

  if (!Array.isArray(result.items)) {
    return {
      items: [],
      total: typeof result.total === 'number' ? result.total : 0
    };
  }
  const items = (result.items as VisualImageHistoryItem[]).map((item) => {
    const cachedUrls = getCachedVisualImageUrls(item.id);
    if (cachedUrls) {
      if (
        (!cachedUrls.thumbnailUrl && item.thumbnailUrl) ||
        (!cachedUrls.previewUrl && item.previewUrl)
      ) {
        rememberVisualImageUrls(
          item.id,
          {
            imageUrl: cachedUrls.imageUrl,
            thumbnailUrl: cachedUrls.thumbnailUrl || item.thumbnailUrl,
            previewUrl: cachedUrls.previewUrl || item.previewUrl
          },
          item.imageUrlExpiresIn
        );
      }
      return {
        ...item,
        imageUrl: cachedUrls.imageUrl,
        thumbnailUrl: cachedUrls.thumbnailUrl || item.thumbnailUrl,
        previewUrl: cachedUrls.previewUrl || item.previewUrl
      };
    }
    rememberVisualImageUrls(
      item.id,
      {
        imageUrl: item.imageUrl,
        thumbnailUrl: item.thumbnailUrl,
        previewUrl: item.previewUrl
      },
      item.imageUrlExpiresIn
    );
    return item;
  });
  return {
    items,
    total: typeof result.total === 'number' ? result.total : items.length
  };
}

export async function setVisualImageFavorite(
  id: string,
  isFavorite: boolean
): Promise<{ id: string; isFavorite: boolean }> {
  const response = await fetch(
    `${API_BASE}/api/image/history?id=${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      headers: buildHeaders(),
      body: JSON.stringify({ isFavorite })
    }
  );
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.message || result.error || '收藏状态更新失败。');
  }
  return {
    id: typeof result.id === 'string' ? result.id : id,
    isFavorite: result.isFavorite === true
  };
}

export async function getVisualVideoHistoryResult(
  options: {
    limit?: number;
    before?: string;
    favorite?: boolean;
  } = {}
): Promise<VisualVideoHistoryResult> {
  const params = new URLSearchParams({
    limit: String(options.limit || 48)
  });
  if (options.before) {
    params.set('before', options.before);
  }
  if (options.favorite) {
    params.set('favorite', 'true');
  }

  const response = await fetch(
    `${API_BASE}/api/video/history?${params.toString()}`,
    {
      headers: buildHeaders()
    }
  );
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      extractApiErrorMessage(result, '视频历史加载失败，请稍后重试。')
    );
  }

  return {
    items: Array.isArray(result.items)
      ? (result.items as VisualVideoGenerationItem[])
      : [],
    nextBefore:
      typeof result.nextBefore === 'string' ? result.nextBefore : undefined,
    hasMore: Boolean(result.hasMore)
  };
}

export async function setVisualVideoFavorite(
  id: string,
  isFavorite: boolean
): Promise<{ id: string; isFavorite: boolean }> {
  const response = await fetch(
    `${API_BASE}/api/video/history?id=${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      headers: buildHeaders(),
      body: JSON.stringify({ isFavorite })
    }
  );
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.message || result.error || '收藏状态更新失败。');
  }
  return {
    id: typeof result.id === 'string' ? result.id : id,
    isFavorite: result.isFavorite === true
  };
}

export async function getVisualVideoHistoryByIds(ids: string[]): Promise<{
  items: VisualVideoGenerationItem[];
  missingIds: string[];
}> {
  const uniqueIds = Array.from(
    new Set(ids.map((id) => id.trim()).filter(Boolean))
  ).slice(0, 60);
  if (uniqueIds.length === 0) return { items: [], missingIds: [] };
  const params = new URLSearchParams({
    limit: String(uniqueIds.length),
    ids: uniqueIds.join(',')
  });
  const response = await fetch(`${API_BASE}/api/video/history?${params}`, {
    headers: buildHeaders()
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      extractApiErrorMessage(result, '视频会话结果加载失败，请稍后重试。')
    );
  }
  const items = Array.isArray(result.items)
    ? (result.items as VisualVideoGenerationItem[])
    : [];
  return {
    items,
    missingIds: Array.isArray(result.missingIds)
      ? result.missingIds.filter(
          (id: unknown): id is string => typeof id === 'string'
        )
      : uniqueIds.filter(
          (id) => !items.some((item) => item.generationId === id)
        )
  };
}

export async function getVisualImageHistory(
  limit: number | 'all' = 12
): Promise<VisualImageHistoryItem[]> {
  const result = await getVisualImageHistoryResult(limit);
  return result.items;
}

export async function refreshVisualImageHistoryItem(input: {
  generationId?: string | null;
  imageUrl?: string | null;
}): Promise<VisualImageHistoryItem | null> {
  const params = new URLSearchParams();
  const generationId = input.generationId?.trim();
  const imageUrl = input.imageUrl?.trim();

  if (generationId) {
    params.set('id', generationId);
  } else if (imageUrl) {
    params.set('imageUrl', imageUrl);
  } else {
    return null;
  }

  const response = await fetch(`${API_BASE}/api/image/history?${params}`, {
    headers: buildHeaders()
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.message || result.error || '图片历史刷新失败。');
  }

  const item = result.item as VisualImageHistoryItem | undefined;
  if (!item?.id || !item.imageUrl) return null;
  rememberVisualImageUrls(
    item.id,
    {
      imageUrl: item.imageUrl,
      thumbnailUrl: item.thumbnailUrl,
      previewUrl: item.previewUrl
    },
    item.imageUrlExpiresIn
  );
  return item;
}

export async function loadVisualImageHistoryBlob(
  generationId: string,
  variant: 'original' | 'thumbnail' | 'preview' = 'original'
): Promise<Blob> {
  const params = new URLSearchParams({
    id: generationId.trim(),
    content: variant
  });
  const response = await fetch(`${API_BASE}/api/image/history?${params}`, {
    headers: buildHeaders()
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(
      extractApiErrorMessage(result, '图片原文件读取失败，请稍后重试。')
    );
  }
  const blob = await response.blob();
  if (!blob.type.startsWith('image/')) {
    throw new Error('图片原文件格式无效。');
  }
  return blob;
}

export async function loadVisualImageHistoryBlobUrl(
  generationId: string,
  variant: 'original' | 'thumbnail' | 'preview' = 'original'
): Promise<string> {
  return URL.createObjectURL(await loadVisualImageHistoryBlob(generationId, variant));
}

export async function getVisualImageHistoryByIds(
  generationIds: string[]
): Promise<{
  items: VisualImageHistoryItem[];
  missingIds: string[];
}> {
  const ids = Array.from(
    new Set(generationIds.map((id) => id.trim()).filter(Boolean))
  );
  if (ids.length === 0) return { items: [], missingIds: [] };
  if (ids.length > 60) {
    throw new Error('单次最多查询 60 个图片历史 ID。');
  }

  const params = new URLSearchParams({ ids: ids.join(',') });
  const response = await fetch(`${API_BASE}/api/image/history?${params}`, {
    headers: buildHeaders()
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.message || result.error || '图片历史批量加载失败。');
  }

  const items = Array.isArray(result.items)
    ? (result.items as VisualImageHistoryItem[])
    : [];
  items.forEach((item) => {
    if (!item?.id || !item.imageUrl) return;
    rememberVisualImageUrls(
      item.id,
      {
        imageUrl: item.imageUrl,
        thumbnailUrl: item.thumbnailUrl,
        previewUrl: item.previewUrl
      },
      item.imageUrlExpiresIn
    );
  });
  return {
    items,
    missingIds: Array.isArray(result.missingIds)
      ? (result.missingIds as unknown[]).filter(
          (id): id is string => typeof id === 'string'
        )
      : []
  };
}

export async function deleteVisualImageHistoryItem(id: string): Promise<void> {
  const response = await fetch(
    `${API_BASE}/api/image/history?id=${encodeURIComponent(id)}`,
    {
      method: 'DELETE',
      headers: buildHeaders()
    }
  );

  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.success === false) {
    throw new Error(result.message || result.error || '图片删除失败。');
  }
  forgetVisualImageUrl(id);
}

export async function getAdminPromptAssets(
  options: {
    slot?: AdminPromptAsset['slot'] | 'all';
    limit?: number;
  } = {}
): Promise<AdminPromptAsset[]> {
  const params = new URLSearchParams();
  params.set('limit', String(options.limit || 500));
  if (options.slot && options.slot !== 'all') {
    params.set('slot', options.slot);
  }

  const response = await fetch(
    `${API_BASE}/api/admin/prompt-assets?${params.toString()}`,
    {
      headers: buildHeaders()
    }
  );

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.message || result.error || '运营素材加载失败。');
  }

  return Array.isArray(result.assets) ? result.assets : [];
}

export async function saveAdminPromptAsset(
  asset: AdminPromptAssetWrite
): Promise<AdminPromptAsset> {
  const response = await fetch(`${API_BASE}/api/admin/prompt-assets`, {
    method: 'PATCH',
    headers: buildHeaders(),
    body: JSON.stringify(asset)
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.message || result.error || '素材保存失败。');
  }

  return result.asset as AdminPromptAsset;
}

export async function createAdminPromptAsset(
  asset: AdminPromptAssetWrite
): Promise<AdminPromptAsset> {
  const response = await fetch(`${API_BASE}/api/admin/prompt-assets`, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify(asset)
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.message || result.error || '素材创建失败。');
  }

  return result.asset as AdminPromptAsset;
}

export async function unpublishAdminPromptAsset(
  id: string
): Promise<AdminPromptAsset> {
  const response = await fetch(
    `${API_BASE}/api/admin/prompt-assets?id=${encodeURIComponent(id)}`,
    {
      method: 'DELETE',
      headers: buildHeaders()
    }
  );

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.message || result.error || '素材下架失败。');
  }

  return result.asset as AdminPromptAsset;
}

export async function analyzeAdminPromptCaseAssetCoverage(input: {
  caseId?: string;
  caseQuery?: string;
  limit?: number;
  includeRecipes?: boolean;
  includeUnpublished?: boolean;
}): Promise<PromptCaseAssetCoverageReport> {
  const response = await fetch(
    `${API_BASE}/api/admin/prompt-case-asset-coverage/analyze`,
    {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify(input)
    }
  );

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(extractApiErrorMessage(result, '案例素材覆盖分析失败。'));
  }
  return result as PromptCaseAssetCoverageReport;
}

export async function getAdminPromptAssetProductionBatches(
  options: { status?: string; limit?: number } = {}
): Promise<PromptAssetProductionBatch[]> {
  const params = new URLSearchParams();
  if (options.status) params.set('status', options.status);
  if (options.limit) params.set('limit', String(options.limit));
  const query = params.toString();
  const response = await fetch(
    `${API_BASE}/api/admin/prompt-asset-production-batches${
      query ? `?${query}` : ''
    }`,
    { headers: buildHeaders() }
  );

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(extractApiErrorMessage(result, '素材生产批次加载失败。'));
  }
  return Array.isArray(result.batches)
    ? (result.batches as PromptAssetProductionBatch[])
    : [];
}

export async function createAdminPromptAssetProductionBatch(
  batch: PromptAssetProductionBatchDraft & {
    status?: string;
    caseIds?: string[];
    analysisResult?: Record<string, unknown>;
  }
): Promise<PromptAssetProductionBatch> {
  const response = await fetch(
    `${API_BASE}/api/admin/prompt-asset-production-batches`,
    {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify(batch)
    }
  );

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(extractApiErrorMessage(result, '素材生产批次创建失败。'));
  }
  return result.batch as PromptAssetProductionBatch;
}

export async function queueAdminPromptAssetProductionBatch(
  id: string
): Promise<{ batch: PromptAssetProductionBatch; runCommand?: string }> {
  const response = await fetch(
    `${API_BASE}/api/admin/prompt-asset-production-batches/${encodeURIComponent(
      id
    )}/run`,
    {
      method: 'POST',
      headers: buildHeaders()
    }
  );

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(extractApiErrorMessage(result, '素材生产批次排队失败。'));
  }
  return {
    batch: result.batch as PromptAssetProductionBatch,
    runCommand:
      typeof result.runCommand === 'string' ? result.runCommand : undefined
  };
}

export async function updateAdminPromptAssetProductionBatch(
  id: string,
  patch: Partial<
    Pick<
      PromptAssetProductionBatch,
      | 'status'
      | 'slot'
      | 'grid'
      | 'size'
      | 'outputSize'
      | 'prompt'
      | 'assets'
      | 'notes'
      | 'caseIds'
      | 'analysisResult'
      | 'result'
    >
  >
): Promise<PromptAssetProductionBatch> {
  const response = await fetch(
    `${API_BASE}/api/admin/prompt-asset-production-batches/${encodeURIComponent(
      id
    )}`,
    {
      method: 'PATCH',
      headers: buildHeaders(),
      body: JSON.stringify(patch)
    }
  );

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(extractApiErrorMessage(result, '素材生产批次更新失败。'));
  }
  return result.batch as PromptAssetProductionBatch;
}

export async function getPublicPromptCases(
  limit = 100,
  options: {
    force?: boolean;
    includeAuth?: boolean;
    category?: string;
    model?: string;
    tag?: string;
    packageSlug?: string;
    locale?: string;
    search?: string;
    requireImage?: boolean;
    featuredOnly?: boolean;
  } = {}
): Promise<PromptCase[]> {
  const result = await getPublicPromptCasesResult(limit, options);
  return result.cases;
}

function normalizePromptCaseCountMap(input: unknown): PromptCaseCountMap {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  return Object.fromEntries(
    Object.entries(input as Record<string, unknown>)
      .map(([key, value]) => [key, Number(value)])
      .filter(([, value]) => Number.isFinite(value))
  );
}

function buildPublicPromptCasesResult(
  cases: PromptCase[],
  source?: Record<string, unknown>
): PublicPromptCasesResult {
  return {
    cases,
    total: Number(source?.total) || cases.length,
    navigationTotal:
      Number(source?.navigationTotal) || Number(source?.total) || cases.length,
    modelCounts: normalizePromptCaseCountMap(source?.modelCounts),
    categoryCounts: normalizePromptCaseCountMap(source?.categoryCounts)
  };
}

function slicePublicPromptCasesResult(
  result: PublicPromptCasesResult,
  limit: number
): PublicPromptCasesResult {
  return {
    ...result,
    cases: result.cases.slice(0, limit)
  };
}

function normalizePromptLibrarySort(value: unknown): PromptLibrarySort {
  return value === 'latest' || value === 'hot' ? value : 'featured';
}

function normalizePromptLibraryFacet(
  input: unknown
): PromptLibraryFacet | null {
  if (!input || typeof input !== 'object') return null;
  const record = input as Record<string, unknown>;
  const slug = typeof record.slug === 'string' ? record.slug.trim() : '';
  const label = typeof record.label === 'string' ? record.label.trim() : '';
  if (!slug || !label) return null;
  const count = Number(record.count);
  return {
    slug,
    label,
    count: Number.isFinite(count) ? count : 0,
    active: record.active === true
  };
}

function normalizePromptLibraryFacets(input: unknown): PromptLibraryFacets {
  const record =
    input && typeof input === 'object'
      ? (input as Record<string, unknown>)
      : {};
  return {
    models: Array.isArray(record.models)
      ? record.models.map(normalizePromptLibraryFacet).filter(Boolean)
      : [],
    labels: Array.isArray(record.labels)
      ? record.labels.map(normalizePromptLibraryFacet).filter(Boolean)
      : [],
    sorts: Array.isArray(record.sorts)
      ? record.sorts
          .map((item) => {
            if (!item || typeof item !== 'object') return null;
            const facet = normalizePromptLibraryFacet(item);
            if (!facet) return null;
            return {
              slug: normalizePromptLibrarySort(facet.slug),
              label: facet.label,
              active: facet.active
            };
          })
          .filter(Boolean)
      : []
  } as PromptLibraryFacets;
}

export function buildPublicPromptLibraryResult(
  source?: Record<string, unknown>
): PublicPromptLibraryResult {
  const record = source || {};
  const items = Array.isArray(record.items)
    ? (record.items as PromptCase[]).map(normalizePromptCase)
    : [];
  const pageInfo =
    record.pageInfo && typeof record.pageInfo === 'object'
      ? (record.pageInfo as Record<string, unknown>)
      : {};
  const queryEcho =
    record.queryEcho && typeof record.queryEcho === 'object'
      ? (record.queryEcho as Record<string, unknown>)
      : {};
  return {
    items,
    total: Number(record.total) || items.length,
    pageInfo: {
      nextCursor:
        typeof pageInfo.nextCursor === 'string' ? pageInfo.nextCursor : null,
      hasMore: pageInfo.hasMore === true
    },
    facets: normalizePromptLibraryFacets(record.facets),
    queryEcho: {
      locale: String(queryEcho.locale || 'zh-CN'),
      model: typeof queryEcho.model === 'string' ? queryEcho.model : undefined,
      label: typeof queryEcho.label === 'string' ? queryEcho.label : undefined,
      mediaType:
        queryEcho.mediaType === 'image' || queryEcho.mediaType === 'video'
          ? queryEcho.mediaType
          : undefined,
      seoOnly: queryEcho.seoOnly === true,
      sort: normalizePromptLibrarySort(queryEcho.sort),
      q: typeof queryEcho.q === 'string' ? queryEcho.q : undefined,
      cursor:
        typeof queryEcho.cursor === 'string' ? queryEcho.cursor : undefined,
      limit: Number(queryEcho.limit) || items.length
    },
    version: String(record.version || 'prompt-library-v2'),
    source:
      record.source === 'cache' || record.source === 'fallback'
        ? record.source
        : 'database',
    debug:
      record.debug && typeof record.debug === 'object'
        ? (record.debug as Record<string, unknown>)
        : undefined
  };
}

export async function getPublicPromptCasesResult(
  limit = 100,
  options: {
    force?: boolean;
    includeAuth?: boolean;
    category?: string;
    model?: string;
    tag?: string;
    packageSlug?: string;
    locale?: string;
    search?: string;
    requireImage?: boolean;
    featuredOnly?: boolean;
  } = {}
): Promise<PublicPromptCasesResult> {
  const now = Date.now();
  const shouldIncludeAuth = options.includeAuth === true;
  const currentAuthToken = shouldIncludeAuth ? authToken : null;
  const canUsePromptCaseCache = !currentAuthToken;
  const locale = options.locale?.trim();
  const search = options.search?.trim();
  const hasFocusedFilter = Boolean(
    options.category ||
    options.model ||
    options.tag ||
    options.packageSlug ||
    search ||
    options.featuredOnly
  );
  const requestKey = [
    PROMPT_CASES_API_VERSION,
    locale || 'all',
    options.category || 'all-categories',
    options.model || 'all-models',
    options.tag || 'all-tags',
    options.packageSlug || 'all-packages',
    search || 'all-search',
    options.featuredOnly ? 'featured-only' : 'all-featured',
    options.requireImage ? 'with-image' : 'all-images',
    limit
  ].join(':');
  if (
    canUsePromptCaseCache &&
    !options.force &&
    publicPromptCasesCache &&
    publicPromptCasesCache.limit >= limit &&
    publicPromptCasesCache.locale === locale &&
    Boolean(publicPromptCasesCache.requireImage) ===
      Boolean(options.requireImage) &&
    !hasFocusedFilter &&
    publicPromptCasesCache.expiresAt > now
  ) {
    return slicePublicPromptCasesResult(publicPromptCasesCache.result, limit);
  }
  if (
    canUsePromptCaseCache &&
    !options.force &&
    !hasFocusedFilter &&
    publicPromptCasesRequest?.key === requestKey
  ) {
    return publicPromptCasesRequest.request.then((result) =>
      slicePublicPromptCasesResult(result, limit)
    );
  }

  const params = new URLSearchParams();
  params.set('limit', String(limit));
  params.set('v', PROMPT_CASES_API_VERSION);
  if (options.category) {
    params.set('category', options.category);
  }
  if (options.model) {
    params.set('model', options.model);
  }
  if (options.tag) {
    params.set('tag', options.tag);
  }
  if (options.packageSlug) {
    params.set('packageSlug', options.packageSlug);
  }
  if (search) {
    params.set('q', search);
  }
  if (locale) {
    params.set('locale', locale);
  }
  if (options.requireImage) {
    params.set('requireImage', '1');
  }
  if (options.featuredOnly) {
    params.set('featured', '1');
  }
  if (options.force) {
    params.set('_t', String(Date.now()));
  }
  const requestAuthToken = currentAuthToken;
  const requestHeaders = requestAuthToken
    ? buildHeaders()
    : { 'Content-Type': 'application/json' };
  const request = fetch(
    `${API_BASE}/api/content/prompt-cases?${params.toString()}`,
    {
      headers: {
        ...requestHeaders,
        Accept: 'application/json'
      },
      cache: requestAuthToken || options.force ? 'no-store' : 'default'
    }
  )
    .then(async (response) => {
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(extractApiErrorMessage(result, '精选案例加载失败。'));
      }
      const resultRecord =
        result && typeof result === 'object'
          ? (result as Record<string, unknown>)
          : {};
      const cases = Array.isArray(result.cases)
        ? sortPromptCasesByDisplayPriority(
            (result.cases as PromptCase[]).map(normalizePromptCase)
          )
        : [];
      const cacheTtl = getPromptCasesCacheTtl(cases);
      if (
        shouldIncludeAuth &&
        (authToken !== requestAuthToken || requestAuthToken)
      ) {
        return buildPublicPromptCasesResult(cases, resultRecord);
      }
      const builtResult = buildPublicPromptCasesResult(cases, resultRecord);
      if (!hasFocusedFilter) {
        publicPromptCasesCache = {
          limit,
          locale,
          requireImage: Boolean(options.requireImage),
          result: builtResult,
          expiresAt: Date.now() + cacheTtl
        };
      }
      cases.forEach((caseItem) => {
        publicPromptCaseCache.set(
          `${locale || 'all'}:id:${caseItem.id}:preview`,
          {
            caseItem,
            expiresAt: Date.now() + cacheTtl
          }
        );
        if (caseItem.slug) {
          publicPromptCaseCache.set(
            `${locale || 'all'}:slug:${caseItem.slug}:preview`,
            {
              caseItem,
              expiresAt: Date.now() + cacheTtl
            }
          );
        }
      });
      return builtResult;
    })
    .finally(() => {
      if (!hasFocusedFilter && publicPromptCasesRequest?.key === requestKey) {
        publicPromptCasesRequest = null;
      }
    });

  if (canUsePromptCaseCache && !hasFocusedFilter)
    publicPromptCasesRequest = {
      key: requestKey,
      request
    };
  return request;
}

export async function getPublicPromptLibraryResult(
  options: {
    locale?: string;
    model?: string;
    label?: string;
    sort?: PromptLibrarySort | string;
    search?: string;
    cursor?: string;
    limit?: number;
    requireImage?: boolean;
    mediaType?: 'image' | 'video';
    seoOnly?: boolean;
    force?: boolean;
    debug?: boolean;
  } = {}
): Promise<PublicPromptLibraryResult> {
  const limit = Math.max(1, Math.min(Number(options.limit) || 36, 100));
  const search = options.search?.trim();
  const sort = normalizePromptLibrarySort(options.sort);
  const cacheKey = [
    'prompt-library-v2',
    options.locale || 'all-locales',
    options.model || 'all-models',
    options.label || 'all-labels',
    options.mediaType || 'all-media',
    options.seoOnly ? 'seo-only' : 'all-statuses',
    sort,
    search || 'all-search',
    options.cursor || 'first',
    options.requireImage ? 'with-image' : 'all-images',
    limit
  ].join(':');
  const now = Date.now();
  const cached = publicPromptLibraryResultCache.get(cacheKey);
  if (!options.force && cached && cached.expiresAt > now) {
    return cached.result;
  }
  const inflight = publicPromptLibraryRequests.get(cacheKey);
  if (!options.force && inflight) return inflight;

  const params = new URLSearchParams();
  params.set('library', '1');
  params.set('limit', String(limit));
  params.set('sort', sort);
  params.set('v', 'prompt-library-v2');
  if (options.locale) params.set('locale', options.locale);
  if (options.model) params.set('model', options.model);
  if (options.label) params.set('label', options.label);
  if (options.mediaType) params.set('mediaType', options.mediaType);
  if (options.seoOnly) params.set('seoOnly', '1');
  if (search) params.set('q', search);
  if (options.cursor) params.set('cursor', options.cursor);
  if (options.requireImage) params.set('requireImage', '1');
  if (options.debug) params.set('debug', '1');
  if (options.force) params.set('_t', String(Date.now()));

  const request = fetch(
    `${API_BASE}/api/content/prompt-cases?${params.toString()}`,
    {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      cache: options.force ? 'no-store' : 'default'
    }
  )
    .then(async (response) => {
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(extractApiErrorMessage(result, '案例库加载失败。'));
      }
      const builtResult = buildPublicPromptLibraryResult(
        result && typeof result === 'object'
          ? (result as Record<string, unknown>)
          : {}
      );
      const ttl = getPromptCasesCacheTtl(builtResult.items);
      publicPromptLibraryResultCache.set(cacheKey, {
        result: builtResult,
        expiresAt: Date.now() + ttl
      });
      builtResult.items.forEach((caseItem) => {
        publicPromptCaseCache.set(
          `${options.locale || 'all'}:id:${caseItem.id}:preview`,
          {
            caseItem,
            expiresAt: Date.now() + ttl
          }
        );
        if (caseItem.slug) {
          publicPromptCaseCache.set(
            `${options.locale || 'all'}:slug:${caseItem.slug}:preview`,
            {
              caseItem,
              expiresAt: Date.now() + ttl
            }
          );
        }
      });
      return builtResult;
    })
    .finally(() => {
      if (publicPromptLibraryRequests.get(cacheKey) === request) {
        publicPromptLibraryRequests.delete(cacheKey);
      }
    });

  publicPromptLibraryRequests.set(cacheKey, request);
  return request;
}

export async function getPublicPromptCase(
  idOrSlug: string,
  options: {
    force?: boolean;
    by?: 'id' | 'slug';
    locale?: string;
    includePrompt?: boolean;
  } = {}
): Promise<PromptCase | null> {
  const trimmedValue = idOrSlug.trim();
  if (!trimmedValue) return null;
  const locale = options.locale?.trim();
  const includePrompt = options.includePrompt !== false;
  const lookupKey = `${locale || 'all'}:${options.by || 'id'}:${trimmedValue}:${
    includePrompt ? 'full' : 'preview'
  }`;
  const currentAuthToken = authToken;
  const canUsePromptCaseCache = !currentAuthToken;

  const now = Date.now();
  const cachedSingle = publicPromptCaseCache.get(lookupKey);
  if (
    canUsePromptCaseCache &&
    !options.force &&
    cachedSingle &&
    cachedSingle.expiresAt > now
  ) {
    return cachedSingle.caseItem;
  }

  const cachedList = publicPromptCasesCache;
  if (
    canUsePromptCaseCache &&
    !options.force &&
    cachedList &&
    cachedList.locale === locale &&
    cachedList.expiresAt > now
  ) {
    const cachedListItem = cachedList.result.cases.find((caseItem) =>
      options.by === 'slug'
        ? caseItem.slug === trimmedValue
        : caseItem.id === trimmedValue
    );
    if (cachedListItem) {
      const cachedListHasPrompt =
        !includePrompt ||
        Boolean(
          cachedListItem.prompt?.trim() ||
          cachedListItem.promptZh?.trim() ||
          cachedListItem.promptEn?.trim()
        ) ||
        cachedListItem.promptLocked === false;
      if (cachedListHasPrompt) {
        publicPromptCaseCache.set(lookupKey, {
          caseItem: cachedListItem,
          expiresAt: cachedList.expiresAt
        });
        return cachedListItem;
      }
    }
  }

  const params = new URLSearchParams();
  params.set(options.by === 'slug' ? 'slug' : 'id', trimmedValue);
  if (includePrompt) {
    params.set('includePrompt', '1');
  }
  if (locale) {
    params.set('locale', locale);
  }
  const requestAuthToken = currentAuthToken;
  const response = await fetch(
    `${API_BASE}/api/content/prompt-cases?${params.toString()}`,
    {
      headers: {
        ...buildHeaders(),
        Accept: 'application/json'
      },
      cache: requestAuthToken || options.force ? 'no-store' : 'default'
    }
  );
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(extractApiErrorMessage(result, '精选案例加载失败。'));
  }

  const caseItem = Array.isArray(result.cases)
    ? result.cases[0]
      ? normalizePromptCase(result.cases[0] as PromptCase)
      : null
    : null;
  if (authToken !== requestAuthToken || requestAuthToken) {
    return caseItem;
  }
  const cacheTtl = caseItem
    ? getPromptCasesCacheTtl([caseItem])
    : PROMPT_CASES_CACHE_TTL_MS;
  publicPromptCaseCache.set(lookupKey, {
    caseItem,
    expiresAt: Date.now() + cacheTtl
  });
  if (caseItem && publicPromptCasesCache) {
    if (caseItem.slug) {
      for (const promptMode of includePrompt
        ? ['full', 'preview']
        : ['preview']) {
        publicPromptCaseCache.set(
          `${locale || 'all'}:slug:${caseItem.slug}:${promptMode}`,
          {
            caseItem,
            expiresAt: Date.now() + cacheTtl
          }
        );
      }
    }
    const exists = publicPromptCasesCache.result.cases.some(
      (item) => item.id === caseItem.id
    );
    const nextCases = exists
      ? publicPromptCasesCache.result.cases.map((item) =>
          item.id === caseItem.id ? caseItem : item
        )
      : [caseItem, ...publicPromptCasesCache.result.cases];
    publicPromptCasesCache = {
      ...publicPromptCasesCache,
      result: {
        ...publicPromptCasesCache.result,
        cases: nextCases
      }
    };
  }
  return caseItem;
}

export async function subscribeMarketingEmail(input: {
  email: string;
  locale?: 'zh-CN' | 'en-US' | string;
  source?: string;
}): Promise<{ ok: true; status: 'subscribed' | 'already_subscribed' }> {
  const response = await fetch(`${API_BASE}/api/marketing/subscribe`, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify(input)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(extractApiErrorMessage(result, '订阅失败，请稍后重试。'));
  }
  const status =
    result?.status === 'already_subscribed'
      ? 'already_subscribed'
      : 'subscribed';
  return { ok: true, status };
}

export async function trackPromptCaseEvent(
  id: string,
  event: 'view' | 'copy' | 'generate'
): Promise<void> {
  if (!id) return;
  try {
    await fetch(`${API_BASE}/api/content/prompt-cases/event`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ id, event })
    });
  } catch {
    // Analytics should never block browsing, copying, or generation.
  }
}

export type AdminPromptCaseSort =
  | 'default'
  | 'created-desc'
  | 'created-asc'
  | 'views'
  | 'copies'
  | 'generates'
  | 'generate-rate';

export interface AdminPromptCasePage {
  cases: PromptCase[];
  total: number;
  hasMore: boolean;
  nextOffset: number | null;
}

export async function getAdminPromptCases(
  options: {
    sort?: AdminPromptCaseSort;
    offset?: number;
    limit?: number;
    featuredOnly?: boolean;
    search?: string;
  } = {}
): Promise<AdminPromptCasePage> {
  const params = new URLSearchParams();
  if (options.sort && options.sort !== 'default')
    params.set('sort', options.sort);
  if (typeof options.offset === 'number')
    params.set('offset', String(Math.max(0, options.offset)));
  if (typeof options.limit === 'number')
    params.set('limit', String(Math.max(1, options.limit)));
  if (options.featuredOnly) params.set('featured', '1');
  if (options.search?.trim()) params.set('search', options.search.trim());
  const query = params.toString();
  const response = await fetch(
    `${API_BASE}/api/admin/prompt-cases${query ? `?${query}` : ''}`,
    {
      headers: buildHeaders()
    }
  );
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(extractApiErrorMessage(result, '精选案例加载失败。'));
  }
  const cases = Array.isArray(result.cases)
    ? sortPromptCasesByDisplayPriority(
        (result.cases as PromptCase[]).map(normalizePromptCase)
      )
    : [];
  const pagination =
    result.pagination && typeof result.pagination === 'object'
      ? (result.pagination as Record<string, unknown>)
      : {};
  const total = Number(pagination.total);
  const nextOffset = Number(pagination.nextOffset);
  return {
    cases,
    total: Number.isFinite(total) ? total : cases.length,
    hasMore: pagination.hasMore === true,
    nextOffset:
      pagination.hasMore === true && Number.isFinite(nextOffset)
        ? nextOffset
        : null
  };
}

export async function getAdminPromptCase(id: string): Promise<PromptCase> {
  const params = new URLSearchParams({ id });
  const response = await fetch(`${API_BASE}/api/admin/prompt-cases?${params}`, {
    headers: buildHeaders()
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(extractApiErrorMessage(result, '精选案例详情加载失败。'));
  }
  return normalizePromptCase(result.case as PromptCase);
}

export async function getAdminPromptCaseDrafts(
  options: {
    status?: PromptCaseDraftStatus | string;
    packageSlug?: string;
  } = {}
): Promise<PromptCaseDraft[]> {
  const params = new URLSearchParams();
  if (options.status) params.set('status', options.status);
  if (options.packageSlug) params.set('packageSlug', options.packageSlug);
  const query = params.toString();
  const response = await fetch(
    `${API_BASE}/api/admin/prompt-case-drafts${query ? `?${query}` : ''}`,
    { headers: buildHeaders() }
  );
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(extractApiErrorMessage(result, '草稿箱加载失败。'));
  }
  return Array.isArray(result.drafts)
    ? (result.drafts as PromptCaseDraft[]).map(normalizePromptCaseDraft)
    : [];
}

export async function generateAdminPromptCaseDrafts(
  input: CommercialCaseDraftGenerateInput
): Promise<PromptCaseDraft[]> {
  const response = await fetch(
    `${API_BASE}/api/admin/prompt-case-drafts/generate`,
    {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify(input)
    }
  );
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(extractApiErrorMessage(result, '商业案例草稿生成失败。'));
  }
  return Array.isArray(result.drafts)
    ? (result.drafts as PromptCaseDraft[]).map(normalizePromptCaseDraft)
    : [];
}

export async function extractAdminPromptCaseDraftFromTweet(
  tweetUrl: string
): Promise<PromptCaseDraftImportInput> {
  let response: Response | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      response = await fetch(
        `${API_BASE}/api/admin/prompt-case-drafts/import`,
        {
          method: 'POST',
          headers: buildHeaders(),
          body: JSON.stringify({ action: 'extractTweet', tweetUrl })
        }
      );
    } catch (error) {
      throw new Error(
        error instanceof TypeError
          ? '推文案例提取请求失败，可能是评论区搜索超时或网络中断，请稍后重试。'
          : '推文案例提取失败。'
      );
    }
    if (![503, 504].includes(response.status) || attempt === 1) break;
    await new Promise((resolve) => globalThis.setTimeout(resolve, 600));
  }
  if (!response) throw new Error('推文案例提取失败。');
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const requestId =
      response.headers.get('x-request-id') || response.headers.get('cf-ray');
    const message = extractApiErrorMessage(result, '推文案例提取失败。');
    throw new Error(
      requestId ? `${message}（请求 ID：${requestId}）` : message
    );
  }
  return result.draft as PromptCaseDraftImportInput;
}

export async function createAdminPromptCaseDraftFromImport(
  draft: PromptCaseDraftImportInput
): Promise<PromptCaseDraft> {
  const response = await fetch(
    `${API_BASE}/api/admin/prompt-case-drafts/import`,
    {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({ action: 'createDraft', draft })
    }
  );
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(extractApiErrorMessage(result, '导入草稿创建失败。'));
  }
  return normalizePromptCaseDraft(result.draft as PromptCaseDraft);
}

export async function generateAdminPromptCaseDraftImages(input: {
  draftIds: string[];
  imageCount?: number;
}): Promise<{
  drafts: PromptCaseDraft[];
  failures: Array<{ draftId: string; error: string }>;
}> {
  const response = await fetch(
    `${API_BASE}/api/admin/prompt-case-drafts/generate-images`,
    {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify(input)
    }
  );
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(extractApiErrorMessage(result, '候选图生成失败。'));
  }
  return {
    drafts: Array.isArray(result.drafts)
      ? (result.drafts as PromptCaseDraft[]).map(normalizePromptCaseDraft)
      : [],
    failures: Array.isArray(result.failures)
      ? (result.failures as Array<{ draftId: string; error: string }>)
      : []
  };
}

export async function saveAdminPromptCaseDraft(
  id: string,
  input: AdminPromptCaseDraftWrite
): Promise<PromptCaseDraft> {
  const response = await fetch(
    `${API_BASE}/api/admin/prompt-case-drafts/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      headers: buildHeaders(),
      body: JSON.stringify(input)
    }
  );
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(extractApiErrorMessage(result, '草稿保存失败。'));
  }
  return normalizePromptCaseDraft(result.draft as PromptCaseDraft);
}

export async function deleteAdminPromptCaseDraft(
  id: string
): Promise<{ deletedDraftId: string }> {
  const response = await fetch(
    `${API_BASE}/api/admin/prompt-case-drafts/${encodeURIComponent(id)}`,
    {
      method: 'DELETE',
      headers: buildHeaders()
    }
  );
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(extractApiErrorMessage(result, '草稿删除失败。'));
  }
  return {
    deletedDraftId:
      typeof result.deletedDraftId === 'string' ? result.deletedDraftId : id
  };
}

export async function publishAdminPromptCaseDraft(
  id: string
): Promise<{ deletedDraftId: string; case?: PromptCase }> {
  const response = await fetch(
    `${API_BASE}/api/admin/prompt-case-drafts/${encodeURIComponent(id)}/publish`,
    {
      method: 'POST',
      headers: buildHeaders()
    }
  );
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(extractApiErrorMessage(result, '草稿发布失败。'));
  }
  invalidatePublicPromptCasesCache();
  return {
    deletedDraftId:
      typeof result.deletedDraftId === 'string' ? result.deletedDraftId : id,
    case: result.case
      ? normalizePromptCase(result.case as PromptCase)
      : undefined
  };
}

export async function createAdminPromptCase(
  input: AdminPromptCaseWrite
): Promise<PromptCase> {
  const response = await fetch(`${API_BASE}/api/admin/prompt-cases`, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify(input)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(extractApiErrorMessage(result, '精选案例创建失败。'));
  }
  invalidatePublicPromptCasesCache();
  return normalizePromptCase(result.case as PromptCase);
}

export async function saveAdminPromptCase(
  input: AdminPromptCaseWrite
): Promise<PromptCase> {
  const response = await fetch(`${API_BASE}/api/admin/prompt-cases`, {
    method: 'PATCH',
    headers: buildHeaders(),
    body: JSON.stringify(input)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(extractApiErrorMessage(result, '精选案例保存失败。'));
  }
  invalidatePublicPromptCasesCache();
  return normalizePromptCase(result.case as PromptCase);
}

export async function deleteAdminPromptCase(id: string): Promise<PromptCase> {
  const response = await fetch(
    `${API_BASE}/api/admin/prompt-cases?id=${encodeURIComponent(id)}`,
    {
      method: 'DELETE',
      headers: buildHeaders()
    }
  );
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(extractApiErrorMessage(result, '精选案例删除失败。'));
  }
  invalidatePublicPromptCasesCache();
  return normalizePromptCase(result.case as PromptCase);
}

function normalizeAiUsageSummaryTotals(value: unknown): AiUsageSummaryTotals {
  const record =
    value && typeof value === 'object'
      ? (value as Partial<AiUsageSummaryTotals>)
      : {};
  return {
    eventCount: Number(record.eventCount) || 0,
    succeededCount: Number(record.succeededCount) || 0,
    failedCount: Number(record.failedCount) || 0,
    inputTokens: Number(record.inputTokens) || 0,
    outputTokens: Number(record.outputTokens) || 0,
    totalTokens: Number(record.totalTokens) || 0,
    imageCount: Number(record.imageCount) || 0
  };
}

function normalizeAiUsageSummaryItem(
  value: unknown
): AiUsageSummaryRecord | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Partial<AiUsageSummaryRecord>;
  return {
    usageDate: String(record.usageDate || ''),
    provider: String(record.provider || 'unknown'),
    model: String(record.model || 'unknown'),
    source: String(record.source || 'unknown'),
    eventCount: Number(record.eventCount) || 0,
    succeededCount: Number(record.succeededCount) || 0,
    failedCount: Number(record.failedCount) || 0,
    inputTokens: Number(record.inputTokens) || 0,
    outputTokens: Number(record.outputTokens) || 0,
    totalTokens: Number(record.totalTokens) || 0,
    imageCount: Number(record.imageCount) || 0,
    avgLatencyMs:
      typeof record.avgLatencyMs === 'number' ? record.avgLatencyMs : null,
    p95LatencyMs:
      typeof record.p95LatencyMs === 'number' ? record.p95LatencyMs : null
  };
}

export async function getAdminAiUsageSummary(
  filters: Partial<AiUsageSummaryFilters> = {}
): Promise<AiUsageSummaryResult> {
  const params = new URLSearchParams();
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (filters.provider) params.set('provider', filters.provider);
  if (filters.model) params.set('model', filters.model);
  if (filters.source) params.set('source', filters.source);
  if (filters.limit) params.set('limit', String(filters.limit));

  const query = params.toString();
  const response = await fetch(
    `${API_BASE}/api/admin/ai-usage/summary${query ? `?${query}` : ''}`,
    {
      headers: buildHeaders()
    }
  );
  const result = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  if (!response.ok && !result.needsSetup) {
    throw new Error(extractApiErrorMessage(result, 'AI 用量汇总加载失败。'));
  }

  return {
    success: Boolean(result.success),
    needsSetup: Boolean(result.needsSetup),
    error: typeof result.error === 'string' ? result.error : undefined,
    message: typeof result.message === 'string' ? result.message : undefined,
    filters:
      result.filters && typeof result.filters === 'object'
        ? (result.filters as AiUsageSummaryFilters)
        : undefined,
    items: Array.isArray(result.items)
      ? result.items
          .map(normalizeAiUsageSummaryItem)
          .filter((item): item is AiUsageSummaryRecord => Boolean(item))
      : [],
    totals: normalizeAiUsageSummaryTotals(result.totals)
  };
}

export async function uploadAdminPromptCaseImage(input: {
  imageBase64: string;
  mimeType: string;
}): Promise<{ imageUrl: string; filePath?: string }> {
  const response = await fetch(`${API_BASE}/api/admin/prompt-cases/upload`, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify(input)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.success) {
    throw new Error(extractApiErrorMessage(result, '精选案例图片上传失败。'));
  }
  return { imageUrl: result.imageUrl, filePath: result.filePath };
}

export async function uploadAdminPromptCaseImageFile(
  file: File
): Promise<{ imageUrl: string; filePath?: string }> {
  const mimeType = file.type || 'image/png';
  const signResponse = await fetch(
    `${API_BASE}/api/admin/prompt-cases/upload`,
    {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({
        uploadMode: 'signed-url',
        mimeType,
        fileSizeBytes: file.size
      })
    }
  );
  const signed = await signResponse.json().catch(() => ({}));
  if (!signResponse.ok || !signed.success || !signed.uploadUrl) {
    throw new Error(extractApiErrorMessage(signed, '精选案例图片上传失败。'));
  }

  const uploadResponse = await fetch(String(signed.uploadUrl), {
    method: 'PUT',
    headers: {
      'Content-Type': mimeType,
      'cache-control': '31536000'
    },
    body: file
  });
  if (!uploadResponse.ok) {
    const uploadError = await uploadResponse.text().catch(() => '');
    throw new Error(
      uploadError.trim() ||
        `精选案例图片上传失败：${uploadResponse.status} ${uploadResponse.statusText}`
    );
  }

  return { imageUrl: signed.imageUrl, filePath: signed.filePath };
}

// ============================================
// ============================================

export async function chat(
  prompt: string,
  options: ChatOptions = {}
): Promise<{
  content: string;
  toolCalls: ToolCallData[];
  toolResults: ToolResultData[];
}> {
  return withRetry(async () => {
    if (chatSyncEndpointState !== 'missing') {
      chatSyncEndpointState = 'missing';
    }
    if (!hasLoggedChatSyncFallback) {
      hasLoggedChatSyncFallback = true;
      log.warn(
        '[agent-api] legacy /api/agent/chat/sync disabled, using /api/agent/smart-chat'
      );
    }
    const contentParts: string[] = [];
    const toolCalls: ToolCallData[] = [];
    const toolResults: ToolResultData[] = [];

    for await (const chunk of smartChatStream(prompt, {
      ...options,
      mode: options.mode || 'agent'
    })) {
      if (chunk.type === 'text' || chunk.type === 'thinking') {
        if (typeof chunk.data.content === 'string') {
          contentParts.push(chunk.data.content);
        }
      } else if (chunk.type === 'tool_call') {
        toolCalls.push(chunk.data as ToolCallData);
      } else if (chunk.type === 'tool_result') {
        toolResults.push(chunk.data as ToolResultData);
      } else if (chunk.type === 'error') {
        throw new Error(chunk.data.message || '聊天请求失败');
      }
    }

    return {
      content: contentParts.join(''),
      toolCalls,
      toolResults
    };
  });
}

// ============================================
// 瀹搞儱鍙跨涵顔款吇
// ============================================

export async function confirmToolCall(
  sessionId: string,
  toolCallId: string,
  approved: boolean
): Promise<void> {
  await withRetry(async () => {
    const response = await fetch(`${API_BASE}/api/agent/confirm-tool`, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({ sessionId, toolCallId, approved })
    });

    if (!response.ok) {
      await handleResponseError(response);
    }
  });
}

// ============================================
// 閹绘劒绶甸崯鍡曚繆閹?
// ============================================

export async function getProviders(): Promise<
  Array<{ name: string; type: string; available: boolean }>
> {
  return withRetry(async () => {
    const response = await fetch(`${API_BASE}/api/agent/providers`, {
      headers: buildHeaders()
    });

    if (!response.ok) {
      await handleResponseError(response);
    }

    const result = await response.json();
    return result.providers;
  });
}

// ============================================
// 缁楁棁顔囬幒銉ュ經
// ============================================

export async function getNotes(): Promise<
  Array<{
    id: string;
    title: string;
    tags: string[];
    createdAt: string;
  }>
> {
  return withRetry(async () => {
    const response = await fetch(`${API_BASE}/api/agent/notes`, {
      headers: buildHeaders()
    });

    if (!response.ok) {
      await handleResponseError(response);
    }

    const result = await response.json();
    return result.notes;
  });
}

export async function getNote(noteId: string): Promise<{
  id: string;
  title: string;
  content: string;
  tags: string[];
  sourceUrl?: string;
  createdAt: string;
}> {
  return withRetry(async () => {
    const response = await fetch(`${API_BASE}/api/agent/notes/${noteId}`, {
      headers: buildHeaders()
    });

    if (!response.ok) {
      await handleResponseError(response);
    }

    const result = await response.json();
    return result.note;
  });
}

// ============================================
// ============================================

export interface BatchExecuteTask {
  id: string;
  index: number;
  title: string;
  prompt: string;
}

/** 閹靛綊鍣洪崶鍓у閹笛嗩攽闁銆?*/
export interface BatchImageExecuteOptions {
  tasks: BatchExecuteTask[];
  referenceImages?: Array<{ data: string; mimeType: string }>;
  signal?: AbortSignal;
}

export async function* batchImageExecuteStream(
  options: BatchImageExecuteOptions
): AsyncGenerator<SmartChatChunk> {
  const response = await withRetry(
    async () => {
      const res = await fetch(`${API_BASE}/api/agent/batch-image-execute`, {
        method: 'POST',
        headers: buildHeaders(),
        signal: options.signal,
        body: JSON.stringify({
          tasks: options.tasks,
          referenceImages: options.referenceImages
        })
      });

      if (!res.ok) {
        await handleResponseError(res);
      }

      return res;
    },
    {
      maxRetries: 2,
      baseDelay: 1000,
      maxDelay: 5000
    }
  );

  const reader = response.body?.getReader();
  const decoder = new TextDecoder();

  if (!reader) {
    throw new Error('No response body');
  }

  let buffer = '';
  let currentEventType = 'batch_image';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    buffer += chunk;

    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('event: ')) {
        currentEventType = line.slice(7).trim();
        continue;
      }

      if (line.startsWith('data: ')) {
        const dataStr = line.slice(6);
        if (dataStr === '[DONE]') {
          return;
        }

        try {
          const data = JSON.parse(dataStr);
          yield {
            type: currentEventType as SmartChatChunk['type'],
            data
          };
          currentEventType = 'batch_image';
        } catch {
          log.warn(
            '[agent-api] Failed to parse batch image SSE data:',
            dataStr
          );
        }
      }
    }
  }
}

// ============================================
// Skill Chat API
// ============================================

export interface SkillData {
  id: string;
  name: string;
  displayName: string;
  triggers: string[];
  coreInstructions: string;
  outputType: string | null;
  priority: number;
}

/** Skill Chat 闁銆?*/
export interface SkillChatOptions {
  skillId?: string;
  /** 前端候选 hint，仅用于服务端解析辅助 */
  skillHint?: {
    id: string;
    name: string;
    source?: 'user' | 'system' | 'market';
    explicit?: boolean;
    matchedTriggers?: string[];
  };
  /** 娑撳﹣绗呴弬鍥︿繆閹?*/
  context?: {
    references?: string;
    history?: string;
    pageInfo?: { url: string; title: string };
  };
  sessionId?: string;
  signal?: AbortSignal;
}

export interface SkillChatChunk {
  type:
    | 'skills'
    | 'status'
    | 'text'
    | 'tool_call'
    | 'tool_result'
    | 'error'
    | 'done'
    | 'skill_create_preview'
    | 'summary_create_preview'
    | 'summary_update_preview'
    | 'summary_delete_confirm'
    | 'run_started'
    | 'step_started'
    | 'step_completed'
    | 'artifact_created'
    | 'run_waiting_async'
    | 'run_completed'
    | 'run_failed'
    | 'resolver_result';
  data: {
    skills?: Array<{ id: string; name: string }>;
    status?: string;
    message?: string;
    content?: string;
    id?: string;
    name?: string;
    input?: Record<string, unknown>;
    result?: unknown;
    success?: boolean;
    error?: string;
    errorMessage?: string;
    statusDetail?: string;
    cancelled?: boolean;
    policyReason?: string;
    policySource?: string;
    requiresConfirmation?: boolean;
    confirmationState?: string;
    auditTrail?: Array<{ type: string; at: number; detail?: unknown }>;
    skillPreview?: {
      name: string;
      displayName: string;
      description?: string;
      icon: string;
      triggers: string[];
      coreInstructions: string;
      outputType?: string;
      category: string;
    };
    summaryPreview?: {
      title: string;
      content: string;
      url?: string | null;
      tags: string[];
      projectId: string;
    };
    original?: {
      title: string;
      content: string;
      tags: string[];
    };
    updated?: {
      title: string;
      content: string;
      tags: string[];
    };
    projectId?: string;
    summary?: {
      id: string;
      title: string;
      url?: string | null;
      tags: string[];
    };
    runId?: string;
    stepId?: string;
    traceId?: string;
    startedAt?: number;
    endedAt?: number;
    taskId?: string;
    kind?: string;
    title?: string;
    artifactId?: string;
    preview?: string;
    explicitSkillId?: string;
    localHint?: {
      id: string;
      name: string;
      source?: 'user' | 'system' | 'market';
      explicit?: boolean;
      matchedTriggers?: string[];
    };
    matchedSkills?: Array<{
      id: string;
      name: string;
      source: 'user' | 'system' | 'market';
      associatedTools?: string[];
    }>;
  };
}

export interface SkillRunListItem {
  id: string;
  userId: string;
  skillId?: string;
  mode: 'sync' | 'async' | 'hybrid';
  status: string;
  traceId: string;
  startedAt: number;
  endedAt?: number;
  errorMessage?: string;
}

export async function listSkillRuns(
  limit = 20,
  options?: {
    offset?: number;
    status?: string;
    from?: number;
    to?: number;
    includeStats?: boolean;
  }
): Promise<SkillRunListItem[]> {
  const params = new URLSearchParams();
  params.set('limit', String(limit));
  if (options?.offset !== undefined)
    params.set('offset', String(options.offset));
  if (options?.status) params.set('status', options.status);
  if (options?.from !== undefined) params.set('from', String(options.from));
  if (options?.to !== undefined) params.set('to', String(options.to));
  if (options?.includeStats) params.set('includeStats', 'true');

  const response = await fetch(
    `${API_BASE}/api/agent/skill-runs?${params.toString()}`,
    {
      method: 'GET',
      headers: buildHeaders()
    }
  );

  if (!response.ok) {
    if (response.status === 404 || response.status === 410) {
      log.warn(
        '[agent-api] skill run list endpoint unavailable on Worker runtime'
      );
      return [];
    }
    await handleResponseError(response);
  }

  const data = (await response.json()) as { runs?: SkillRunListItem[] };
  return data.runs || [];
}

export async function cleanupSkillRuns(
  maxAgeMs: number
): Promise<{ removed: number }> {
  const response = await fetch(`${API_BASE}/api/agent/skill-runs-cleanup`, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify({ maxAgeMs })
  });

  if (!response.ok) {
    if (response.status === 404 || response.status === 410) {
      log.warn(
        '[agent-api] skill run cleanup endpoint unavailable on Worker runtime'
      );
      return { removed: 0 };
    }
    await handleResponseError(response);
  }

  return (await response.json()) as { removed: number };
}

export interface RuntimeStepPayload {
  eventType?: 'resolution' | 'prompt_build' | 'tool';
  explicitSkillId?: string;
  selectedSkillIds?: string[];
  selectedSkillNames?: string[];
  candidateCount?: number;
  selectedToolNames?: string[];
  activeSkillCount?: number;
  systemPromptLength?: number;
  success?: boolean;
  result?: unknown;
  error?: string;
  confirmationState?: string;
  auditTrail?: Array<{
    type: string;
    at: number;
    detail?: unknown;
  }>;
  resolutionContext?: {
    explicitSkillId?: string;
    selectedToolNames?: string[];
    localHintName?: string;
    resolvedSkillNames?: string[];
  };
}

export interface SkillRunDetailsResponse {
  run: {
    id: string;
    userId: string;
    skillId?: string;
    mode: 'sync' | 'async' | 'hybrid';
    status: string;
    traceId: string;
    startedAt: number;
    endedAt?: number;
    errorMessage?: string;
  };
  steps: Array<{
    id: string;
    runId: string;
    index: number;
    kind: string;
    status: string;
    title: string;
    toolName?: string;
    payload?: RuntimeStepPayload;
    startedAt: number;
    endedAt?: number;
    errorMessage?: string;
  }>;
  artifacts: Array<{
    id: string;
    runId: string;
    stepId?: string;
    type: string;
    title?: string;
    preview?: string;
    data?: unknown;
    createdAt: number;
  }>;
}

export async function getSkillRun(
  runId: string
): Promise<SkillRunDetailsResponse> {
  const response = await fetch(
    `${API_BASE}/api/agent/skill-run?runId=${encodeURIComponent(runId)}`,
    {
      method: 'GET',
      headers: buildHeaders()
    }
  );

  if (!response.ok) {
    if (response.status === 404 || response.status === 410) {
      const now = Date.now();
      log.warn(
        '[agent-api] skill run detail endpoint unavailable on Worker runtime'
      );
      return {
        run: {
          id: runId,
          userId: '',
          mode: 'sync',
          status: 'unavailable',
          traceId: 'worker-skill-run-history-disabled',
          startedAt: now,
          endedAt: now,
          errorMessage:
            'Skill run history is unavailable on the Cloudflare Worker runtime.'
        },
        steps: [],
        artifacts: []
      };
    }
    await handleResponseError(response);
  }

  return (await response.json()) as SkillRunDetailsResponse;
}

export async function* skillChatStream(
  prompt: string,
  options: SkillChatOptions = {}
): AsyncGenerator<SkillChatChunk> {
  const runId =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `local-skill-${Date.now()}`;
  const skillName =
    options.skillHint?.name || options.skillId || 'selected skill';
  const startedAt = Date.now();

  yield {
    type: 'run_started',
    data: {
      runId,
      traceId: runId,
      message: `使用 ${skillName}...`
    }
  };
  yield {
    type: 'resolver_result',
    data: {
      explicitSkillId: options.skillId,
      localHint: options.skillHint,
      matchedSkills: options.skillHint
        ? [
            {
              id: options.skillHint.id,
              name: options.skillHint.name,
              source: options.skillHint.source || 'user'
            }
          ]
        : []
    }
  };
  yield {
    type: 'step_started',
    data: {
      runId,
      stepId: `${runId}:smart-chat`,
      kind: 'execute',
      title: `执行 ${skillName}`
    }
  };

  const compatibilityPrompt = [
    `你正在以「${skillName}」技能身份执行用户请求。`,
    options.skillHint?.explicit ? '这是用户显式选择的技能。' : '',
    options.context?.references
      ? '请优先基于用户提供的参考内容，不要向用户重复索要原文。'
      : '',
    '请直接输出可用结果，避免解释运行时限制。',
    '',
    prompt
  ]
    .filter(Boolean)
    .join('\n');

  try {
    for await (const chunk of smartChatStream(compatibilityPrompt, {
      context: {
        references: options.context?.references,
        history: options.context?.history,
        pageInfo: options.context?.pageInfo,
        feature: 'skill-chat-compat'
      },
      mode: 'agent',
      sessionId: options.sessionId,
      signal: options.signal
    })) {
      if (
        chunk.type === 'text' ||
        chunk.type === 'status' ||
        chunk.type === 'tool_call' ||
        chunk.type === 'tool_result' ||
        chunk.type === 'error' ||
        chunk.type === 'done'
      ) {
        yield {
          type: chunk.type as SkillChatChunk['type'],
          data: chunk.data
        };
      }
    }

    yield {
      type: 'step_completed',
      data: {
        runId,
        stepId: `${runId}:smart-chat`,
        status: 'completed',
        startedAt,
        endedAt: Date.now()
      }
    };
    yield {
      type: 'run_completed',
      data: {
        runId,
        status: 'completed',
        startedAt,
        endedAt: Date.now()
      }
    };
    yield { type: 'done', data: {} };
  } catch (error) {
    const message = error instanceof Error ? error.message : '技能执行失败';
    yield {
      type: 'step_completed',
      data: {
        runId,
        stepId: `${runId}:smart-chat`,
        status: 'failed',
        errorMessage: message,
        startedAt,
        endedAt: Date.now()
      }
    };
    yield {
      type: 'run_failed',
      data: {
        runId,
        status: 'failed',
        errorMessage: message,
        startedAt,
        endedAt: Date.now()
      }
    };
    yield {
      type: 'error',
      data: { message }
    };
  }
}

// ============================================================
// 个人素材库（用户上传 + 反推 + CRUD）
// ============================================================

export interface UserPromptAssetReverseItem {
  slot: string;
  title: string;
  subtitle: string;
  prompt: string;
  negativePrompt?: string;
  tags: string[];
  confidence?: number;
}

export interface UserPromptAssetReverseResult {
  items: UserPromptAssetReverseItem[];
  ok: boolean;
  sourceType: 'image' | 'prompt';
  fullPrompt: string;
  negativePrompt: string;
  routeHint?: string;
  confidence?: number;
  error?: string;
}

export interface UserPromptAssetUploadResponse {
  success: boolean;
  thumbnailUrl: string;
  storageBucket?: string;
  storagePath?: string;
  reverse: UserPromptAssetReverseResult;
}

export interface UserPromptAssetPromptImportResponse {
  success: boolean;
  reverse: UserPromptAssetReverseResult;
}

export interface UserPromptAsset {
  id: string;
  slot: string;
  title: string;
  subtitle: string;
  prompt: string;
  promptZh: string | null;
  negativePrompt: string | null;
  negativePromptZh: string | null;
  tags: string[];
  thumbnailUrl: string;
  visual: Record<string, unknown>;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  ownerUserId: string | null;
}

export interface UserPromptAssetSaveInput {
  id?: string;
  slot: string;
  title: string;
  subtitle?: string;
  prompt: string;
  promptZh?: string | null;
  negativePrompt?: string | null;
  negativePromptZh?: string | null;
  tags?: string[];
  thumbnailUrl: string;
  source?: 'user_upload' | 'prompt_import';
  sourcePrompt?: string;
}

export async function uploadUserPromptAssetImage(input: {
  imageBase64: string;
  mimeType: string;
  locale?: 'zh-CN' | 'en-US';
}): Promise<UserPromptAssetUploadResponse> {
  const response = await fetch(`${API_BASE}/api/prompt-assets/user/upload`, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify(input)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.success) {
    throw new Error(extractApiErrorMessage(result, '上传或反推失败'));
  }
  return result as UserPromptAssetUploadResponse;
}

export async function importUserPromptAssetPrompt(input: {
  prompt: string;
}): Promise<UserPromptAssetPromptImportResponse> {
  const response = await fetch(
    `${API_BASE}/api/prompt-assets/user/import-prompt`,
    {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify(input)
    }
  );
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.success) {
    throw new Error(extractApiErrorMessage(result, '提示词解析失败'));
  }
  return result as UserPromptAssetPromptImportResponse;
}

export async function listUserPromptAssets(
  limit = 200
): Promise<UserPromptAsset[]> {
  const response = await fetch(
    `${API_BASE}/api/prompt-assets/user?limit=${encodeURIComponent(String(limit))}`,
    { headers: buildHeaders() }
  );
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(extractApiErrorMessage(result, '个人素材库加载失败'));
  }
  return Array.isArray(result.items) ? result.items : [];
}

export async function saveUserPromptAsset(
  input: UserPromptAssetSaveInput
): Promise<UserPromptAsset> {
  const response = await fetch(`${API_BASE}/api/prompt-assets/user`, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify(input)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.item) {
    throw new Error(extractApiErrorMessage(result, '保存个人素材失败'));
  }
  return result.item as UserPromptAsset;
}

export async function deleteUserPromptAsset(id: string): Promise<void> {
  const response = await fetch(
    `${API_BASE}/api/prompt-assets/user?id=${encodeURIComponent(id)}`,
    {
      method: 'DELETE',
      headers: buildHeaders()
    }
  );
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.success) {
    throw new Error(extractApiErrorMessage(result, '删除个人素材失败'));
  }
}

export async function regenerateUserPromptAssetThumbnail(input: {
  assetId: string;
  generationId: string;
}): Promise<UserPromptAsset> {
  const response = await fetch(`${API_BASE}/api/prompt-assets/user/thumbnail`, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify(input)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.item) {
    throw new Error(extractApiErrorMessage(result, '缩略图生成失败'));
  }
  return result.item as UserPromptAsset;
}
