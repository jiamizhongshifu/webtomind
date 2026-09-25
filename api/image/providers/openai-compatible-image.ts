import { IMAGE_DOWNLOAD_TIMEOUT_MS } from '../generate/constants.js';

export type OpenAICompatibleImageOutputFormat = 'png' | 'jpeg' | 'webp';
export type OpenAICompatibleImageQuality =
  | 'auto'
  | 'high'
  | 'medium'
  | 'low'
  | string;

export type OpenAICompatibleImageErrorCategory =
  | 'not_enabled'
  | 'configuration'
  | 'timeout'
  | 'auth'
  | 'rate_limit'
  | 'policy'
  | 'provider_unavailable'
  | 'provider_http'
  | 'provider_response'
  | 'network';

export interface OpenAICompatibleImageProviderConfig {
  enabled: boolean;
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  supportsEdits: boolean;
  supportsMulti: boolean;
  supportsStreaming?: boolean;
  partialImages?: number;
}

export interface OpenAICompatibleImageRequest {
  prompt: string;
  imageCount: number;
  size?: string;
  quality?: OpenAICompatibleImageQuality;
  outputFormat: OpenAICompatibleImageOutputFormat;
  model?: string;
  apiBaseUrl?: string;
  timeoutMs?: number;
  clientTaskId?: string;
}

export interface OpenAICompatibleImageReference {
  data: Blob | ArrayBuffer | Uint8Array;
  mimeType?: string;
  fileName?: string;
}

export interface OpenAICompatibleImageEditRequest extends OpenAICompatibleImageRequest {
  references: OpenAICompatibleImageReference[];
  /** Auto-Mask 蒙版：与原图一起提交（OpenAI /images/edits 的 mask 字段） */
  mask?: OpenAICompatibleImageReference;
}

export interface OpenAICompatibleGeneratedImage {
  dataUrl: string;
  mimeType: string;
  provider: 'openai-compatible';
  model: string;
  providerApiBaseUrl: string;
  source: 'b64_json' | 'url';
}

export class OpenAICompatibleImageProviderError extends Error {
  readonly category: OpenAICompatibleImageErrorCategory;
  readonly httpStatus?: number;
  readonly provider: 'openai-compatible';
  readonly model?: string;
  readonly retryable: boolean;
  readonly failureCode?: string;

  constructor(
    message: string,
    options: {
      category: OpenAICompatibleImageErrorCategory;
      httpStatus?: number;
      model?: string;
      retryable?: boolean;
      failureCode?: string;
    }
  ) {
    super(message);
    this.name = 'OpenAICompatibleImageProviderError';
    this.category = options.category;
    this.httpStatus = options.httpStatus;
    this.provider = 'openai-compatible';
    this.model = options.model;
    this.failureCode = options.failureCode;
    this.retryable =
      options.retryable ??
      ['timeout', 'rate_limit', 'provider_unavailable', 'network'].includes(
        options.category
      );
  }
}

export class OpenAICompatibleImageProviderPendingError extends OpenAICompatibleImageProviderError {
  readonly providerTaskId: string;
  readonly retryAfterMs: number;

  constructor(
    message: string,
    options: {
      model: string;
      providerTaskId: string;
      retryAfterMs: number;
    }
  ) {
    super(message, {
      category: 'provider_unavailable',
      model: options.model,
      retryable: true,
      failureCode: 'OPENAI_COMPAT_PROVIDER_PENDING'
    });
    this.name = 'OpenAICompatibleImageProviderPendingError';
    this.providerTaskId = options.providerTaskId;
    this.retryAfterMs = options.retryAfterMs;
  }
}

export function isOpenAICompatibleImageProviderPendingError(
  error: unknown
): error is OpenAICompatibleImageProviderPendingError {
  return error instanceof OpenAICompatibleImageProviderPendingError;
}

interface ProviderImageResponse {
  data?: Array<{ b64_json?: string; url?: string }>;
  error?: { message?: string } | string;
  message?: string;
}

type ProviderImageStreamEvent = {
  type?: string;
  b64_json?: string;
  data?: { b64_json?: string } | Array<{ b64_json?: string }>;
  error?: { message?: string };
  message?: string;
};

type ChaojitudouTaskStatus = 'queued' | 'running' | 'success' | 'error';

const DEFAULT_CHAOJITUDOU_TASK_REQUEST_TIMEOUT_MS = 15_000;
const MIN_CHAOJITUDOU_TASK_REQUEST_TIMEOUT_MS = 5_000;
const MAX_CHAOJITUDOU_TASK_REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_CHAOJITUDOU_TASK_POLL_MS = 12_000;
const DEFAULT_CHAOJITUDOU_ACTIVE_POLL_BUDGET_MS = 105_000;
const DEFAULT_CHAOJITUDOU_DEFERRED_POLL_DELAY_MS = 12_000;

interface ChaojitudouImageTask {
  id?: string;
  status?: ChaojitudouTaskStatus;
  data?: Array<{ b64_json?: string; url?: string }>;
  error?: string;
  conversation_id?: string;
}

export function isOpenAICompatibleImageEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return cleanProviderEnvValue(env.OPENAI_COMPAT_IMAGE_ENABLED) === 'true';
}

function cleanProviderEnvValue(value: string | undefined): string {
  return (value || '').replace(/\\n/g, '').replace(/\n/g, '').trim();
}

function isTruthyProviderEnvValue(value: string | undefined): boolean {
  return /^(1|true|yes|on)$/i.test(cleanProviderEnvValue(value));
}

export function resolveOpenAICompatibleImageConfig(
  env: NodeJS.ProcessEnv = process.env
): OpenAICompatibleImageProviderConfig {
  const enabled = isOpenAICompatibleImageEnabled(env);
  const apiBaseUrl = normalizeApiBaseUrl(
    cleanProviderEnvValue(env.OPENAI_COMPAT_IMAGE_BASE_URL)
  );
  const apiKey = cleanProviderEnvValue(env.OPENAI_COMPAT_IMAGE_API_KEY);
  const model = cleanProviderEnvValue(env.OPENAI_COMPAT_IMAGE_MODEL);
  const timeoutMs = clampTimeoutMs(
    Number(env.OPENAI_COMPAT_IMAGE_TIMEOUT_MS || 120000)
  );

  return {
    enabled,
    apiBaseUrl,
    apiKey,
    model,
    timeoutMs,
    supportsEdits:
      cleanProviderEnvValue(env.OPENAI_COMPAT_IMAGE_SUPPORTS_EDITS) === 'true',
    supportsMulti:
      cleanProviderEnvValue(env.OPENAI_COMPAT_IMAGE_SUPPORTS_MULTI) !== 'false',
    supportsStreaming: isTruthyProviderEnvValue(
      env.OPENAI_COMPAT_IMAGE_STREAMING_ENABLED
    ),
    partialImages: normalizePartialImages(
      env.OPENAI_COMPAT_IMAGE_PARTIAL_IMAGES
    )
  };
}

export function assertOpenAICompatibleImageConfig(
  config = resolveOpenAICompatibleImageConfig()
): OpenAICompatibleImageProviderConfig {
  if (!config.enabled) {
    throw new OpenAICompatibleImageProviderError(
      'OpenAI-compatible image provider is disabled',
      { category: 'not_enabled', retryable: false }
    );
  }
  if (!config.apiBaseUrl) {
    throw new OpenAICompatibleImageProviderError(
      'OPENAI_COMPAT_IMAGE_BASE_URL is not configured',
      { category: 'configuration', retryable: false }
    );
  }
  if (!config.apiKey) {
    throw new OpenAICompatibleImageProviderError(
      'OPENAI_COMPAT_IMAGE_API_KEY is not configured',
      { category: 'configuration', retryable: false }
    );
  }
  if (!config.model) {
    throw new OpenAICompatibleImageProviderError(
      'OPENAI_COMPAT_IMAGE_MODEL is not configured',
      { category: 'configuration', retryable: false }
    );
  }
  return config;
}

export async function generateOpenAICompatibleImage(
  request: OpenAICompatibleImageRequest,
  config = assertOpenAICompatibleImageConfig()
): Promise<OpenAICompatibleGeneratedImage[]> {
  const model = request.model || config.model;
  const apiBaseUrl = request.apiBaseUrl || config.apiBaseUrl;
  const imageCount = config.supportsMulti
    ? normalizeImageCount(request.imageCount)
    : 1;
  if (isChaojitudouOpenAICompatibleHost(apiBaseUrl)) {
    const response = await callChaojitudouImageTasks({
      apiBaseUrl,
      apiKey: config.apiKey,
      model,
      prompt: request.prompt,
      imageCount,
      size: request.size,
      quality: request.quality,
      timeoutMs: request.timeoutMs || config.timeoutMs,
      clientTaskId: request.clientTaskId,
      mode: 'generate'
    });
    return mapOpenAICompatibleImageResponse(response, {
      imageCount,
      outputFormat: request.outputFormat,
      model,
      apiBaseUrl
    });
  }
  const streamImages = shouldStreamOpenAICompatibleImages(config, model);
  const response = await callOpenAICompatibleImageEndpoint(
    `${apiBaseUrl}/images/generations`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        prompt: request.prompt,
        ...(request.size ? { size: request.size } : {}),
        ...(request.quality ? { quality: request.quality } : {}),
        output_format: request.outputFormat,
        ...(streamImages
          ? { stream: true, partial_images: config.partialImages ?? 2 }
          : { response_format: 'b64_json' }),
        n: imageCount
      })
    },
    request.timeoutMs || config.timeoutMs,
    model
  );

  return mapOpenAICompatibleImageResponse(response, {
    imageCount,
    outputFormat: request.outputFormat,
    model,
    apiBaseUrl
  });
}

export async function editOpenAICompatibleImage(
  request: OpenAICompatibleImageEditRequest,
  config = assertOpenAICompatibleImageConfig()
): Promise<OpenAICompatibleGeneratedImage[]> {
  if (!config.supportsEdits) {
    throw new OpenAICompatibleImageProviderError(
      'OpenAI-compatible image provider edits are disabled',
      { category: 'configuration', model: request.model || config.model }
    );
  }
  if (request.references.length === 0) {
    throw new OpenAICompatibleImageProviderError(
      'OpenAI-compatible image edit requires at least one reference image',
      { category: 'configuration', model: request.model || config.model }
    );
  }

  const model = request.model || config.model;
  const apiBaseUrl = request.apiBaseUrl || config.apiBaseUrl;
  const imageCount = config.supportsMulti
    ? normalizeImageCount(request.imageCount)
    : 1;
  if (isChaojitudouOpenAICompatibleHost(apiBaseUrl)) {
    const response = await callChaojitudouImageTasks({
      apiBaseUrl,
      apiKey: config.apiKey,
      model,
      prompt: request.prompt,
      imageCount,
      size: request.size,
      quality: request.quality,
      timeoutMs: request.timeoutMs || config.timeoutMs,
      clientTaskId: request.clientTaskId,
      mode: 'edit',
      references: request.references
    });
    return mapOpenAICompatibleImageResponse(response, {
      imageCount,
      outputFormat: request.outputFormat,
      model,
      apiBaseUrl
    });
  }
  const streamImages = shouldStreamOpenAICompatibleImages(config, model);
  const formData = new FormData();
  formData.append('model', model);
  formData.append('prompt', request.prompt);
  if (request.size) formData.append('size', request.size);
  if (request.quality) formData.append('quality', request.quality);
  formData.append('output_format', request.outputFormat);
  if (streamImages) {
    formData.append('stream', 'true');
    formData.append('partial_images', String(config.partialImages ?? 2));
  } else {
    formData.append('response_format', 'b64_json');
  }
  formData.append('n', String(imageCount));

  request.references.forEach((reference, index) => {
    formData.append(
      'image',
      toReferenceBlob(reference),
      reference.fileName || `reference-${index + 1}.png`
    );
  });
  if (request.mask) {
    formData.append(
      'mask',
      toReferenceBlob(request.mask),
      request.mask.fileName || 'mask.png'
    );
  }

  const response = await callOpenAICompatibleImageEndpoint(
    `${apiBaseUrl}/images/edits`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`
      },
      body: formData
    },
    request.timeoutMs || config.timeoutMs,
    model
  );

  return mapOpenAICompatibleImageResponse(response, {
    imageCount,
    outputFormat: request.outputFormat,
    model,
    apiBaseUrl
  });
}

export function classifyOpenAICompatibleImageHttpError(
  httpStatus: number,
  message = ''
): OpenAICompatibleImageErrorCategory {
  if ([401, 403].includes(httpStatus)) return 'auth';
  if (httpStatus === 429) return 'rate_limit';
  if (isLikelyPolicyError(message)) return 'policy';
  if (
    [500, 502, 503, 504, 520, 521, 522, 523, 524, 525, 526, 527].includes(
      httpStatus
    ) ||
    /资源不足|稍后再试|resource exhausted|insufficient resources|capacity|overloaded|busy|try again later/i.test(
      message
    )
  ) {
    return 'provider_unavailable';
  }
  return 'provider_http';
}

async function callChaojitudouImageTasks({
  apiBaseUrl,
  apiKey,
  model,
  prompt,
  imageCount,
  size,
  quality,
  timeoutMs,
  clientTaskId,
  mode,
  references
}: {
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
  imageCount: number;
  size?: string;
  quality?: OpenAICompatibleImageQuality;
  timeoutMs: number;
  clientTaskId?: string;
  mode: 'generate' | 'edit';
  references?: OpenAICompatibleImageReference[];
}): Promise<ProviderImageResponse> {
  const startedAt = Date.now();
  const data: ProviderImageResponse['data'] = [];
  const taskApiBaseUrl = getChaojitudouImageTaskApiBaseUrl(apiBaseUrl);
  for (let index = 0; index < imageCount; index += 1) {
    const taskId = buildChaojitudouClientTaskId(clientTaskId, index);
    try {
      await submitChaojitudouImageTask({
        apiBaseUrl: taskApiBaseUrl,
        apiKey,
        model,
        prompt,
        size,
        quality,
        taskId,
        mode,
        references,
        timeoutMs: getRemainingTimeoutMs(timeoutMs, startedAt, model)
      });
    } catch (error) {
      if (shouldDeferChaojitudouTaskError(error)) {
        throw createChaojitudouPendingError({
          model,
          taskId,
          stage: 'submit',
          cause: error
        });
      }
      throw error;
    }
    const task = await pollChaojitudouImageTask({
      apiBaseUrl: taskApiBaseUrl,
      apiKey,
      taskId,
      model,
      timeoutMs,
      startedAt
    });
    data.push(...(task.data || []));
  }
  return { data };
}

function getChaojitudouImageTaskApiBaseUrl(apiBaseUrl: string): string {
  try {
    return new URL(apiBaseUrl).origin;
  } catch {
    return apiBaseUrl.replace(/\/v1\/?$/i, '').replace(/\/+$/, '');
  }
}

function buildChaojitudouClientTaskId(
  clientTaskId: string | undefined,
  index: number
): string {
  const base =
    clientTaskId ||
    `webtomind-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const safeBase = base.replace(/[^a-zA-Z0-9._:-]/g, '-').slice(0, 120);
  return index === 0 ? safeBase : `${safeBase}-${index + 1}`;
}

async function submitChaojitudouImageTask({
  apiBaseUrl,
  apiKey,
  model,
  prompt,
  size,
  quality,
  taskId,
  mode,
  references,
  timeoutMs
}: {
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
  size?: string;
  quality?: OpenAICompatibleImageQuality;
  taskId: string;
  mode: 'generate' | 'edit';
  references?: OpenAICompatibleImageReference[];
  timeoutMs: number;
}): Promise<void> {
  if (mode === 'generate') {
    await fetchChaojitudouJson(
      `${apiBaseUrl}/api/image-tasks/generations`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          client_task_id: taskId,
          prompt,
          model,
          ...(size ? { size } : {}),
          ...(quality ? { quality } : {})
        })
      },
      timeoutMs,
      model
    );
    return;
  }

  const formData = new FormData();
  formData.append('client_task_id', taskId);
  formData.append('prompt', prompt);
  formData.append('model', model);
  if (size) formData.append('size', size);
  if (quality) formData.append('quality', String(quality));
  (references || []).forEach((reference, index) => {
    formData.append(
      'image',
      toReferenceBlob(reference),
      reference.fileName || `reference-${index + 1}.png`
    );
  });

  await fetchChaojitudouJson(
    `${apiBaseUrl}/api/image-tasks/edits`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`
      },
      body: formData
    },
    timeoutMs,
    model
  );
}

async function pollChaojitudouImageTask({
  apiBaseUrl,
  apiKey,
  taskId,
  model,
  timeoutMs,
  startedAt
}: {
  apiBaseUrl: string;
  apiKey: string;
  taskId: string;
  model: string;
  timeoutMs: number;
  startedAt: number;
}): Promise<ChaojitudouImageTask> {
  const pollStartedAt = Date.now();
  let resumeCount = 0;
  for (;;) {
    const remainingMs = getRemainingTimeoutMs(timeoutMs, startedAt, model);
    let data: {
      items?: ChaojitudouImageTask[];
      missing_ids?: string[];
    };
    try {
      data = (await fetchChaojitudouJson(
        `${apiBaseUrl}/api/image-tasks?ids=${encodeURIComponent(taskId)}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${apiKey}`
          }
        },
        Math.min(remainingMs, 30_000),
        model
      )) as {
        items?: ChaojitudouImageTask[];
        missing_ids?: string[];
      };
    } catch (error) {
      if (shouldDeferChaojitudouTaskError(error)) {
        throw createChaojitudouPendingError({
          model,
          taskId,
          stage: 'poll',
          cause: error
        });
      }
      throw error;
    }
    const task = data.items?.find((item) => item.id === taskId);
    if (!task) {
      if (Date.now() - startedAt > timeoutMs) {
        throw new OpenAICompatibleImageProviderError(
          'Chaojitudou image task was not found before timeout',
          { category: 'provider_response', model }
        );
      }
    } else if (task.status === 'success') {
      if (task.data && task.data.length > 0) return task;
      throw new OpenAICompatibleImageProviderError(
        'Chaojitudou image task succeeded without image data',
        { category: 'provider_response', model, retryable: false }
      );
    } else if (task.status === 'error') {
      const message = task.error || 'Chaojitudou image task failed';
      if (
        isChaojitudouTimeoutTask(task) &&
        resumeCount < getChaojitudouResumeLimit()
      ) {
        resumeCount += 1;
        await resumeChaojitudouImageTask({
          apiBaseUrl,
          apiKey,
          taskId,
          model,
          timeoutMs: Math.min(
            getRemainingTimeoutMs(timeoutMs, startedAt, model),
            30_000
          )
        });
      } else {
        throw new OpenAICompatibleImageProviderError(message, {
          category: classifyOpenAICompatibleImageHttpError(502, message),
          httpStatus: 502,
          model
        });
      }
    }

    if (Date.now() - pollStartedAt >= getChaojitudouActivePollBudgetMs()) {
      throw createChaojitudouPendingError({
        model,
        taskId,
        stage: 'poll_budget'
      });
    }

    await sleep(Math.min(getChaojitudouPollIntervalMs(), remainingMs));
  }
}

function isChaojitudouTimeoutTask(task: ChaojitudouImageTask): boolean {
  return Boolean(
    task.conversation_id &&
      typeof task.error === 'string' &&
      /超时|timeout/i.test(task.error)
  );
}

async function resumeChaojitudouImageTask({
  apiBaseUrl,
  apiKey,
  taskId,
  model,
  timeoutMs
}: {
  apiBaseUrl: string;
  apiKey: string;
  taskId: string;
  model: string;
  timeoutMs: number;
}): Promise<void> {
  await fetchChaojitudouJson(
    `${apiBaseUrl}/api/image-tasks/${encodeURIComponent(taskId)}/resume-poll`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        extra_timeout_secs: getChaojitudouResumeExtraTimeoutSecs()
      })
    },
    timeoutMs,
    model
  );
}

async function fetchChaojitudouJson(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  model: string
): Promise<unknown> {
  const controller = new AbortController();
  const requestTimeoutMs = Math.min(
    timeoutMs,
    getChaojitudouTaskRequestTimeoutMs()
  );
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const bodyText = await response.text().catch((error) => {
      if (isAbortError(error)) {
        throw new OpenAICompatibleImageProviderError(
          `Chaojitudou image task request timed out after ${Math.round(
            requestTimeoutMs / 1000
          )}s`,
          { category: 'timeout', model }
        );
      }
      return '';
    });
    const data = parseProviderImageJson(bodyText);
    if (!response.ok || data.error) {
      const message =
        getProviderErrorMessage(data.error) ||
        data.message ||
        bodyText.trim() ||
        `Chaojitudou image task request failed: ${response.status}`;
      throw new OpenAICompatibleImageProviderError(message, {
        category: classifyOpenAICompatibleImageHttpError(
          response.ok ? 502 : response.status,
          message
        ),
        httpStatus: response.ok ? 502 : response.status,
        model
      });
    }
    return data;
  } catch (error) {
    if (error instanceof OpenAICompatibleImageProviderError) {
      throw error;
    }
    if (isAbortError(error)) {
      throw new OpenAICompatibleImageProviderError(
        `Chaojitudou image task request timed out after ${Math.round(
          requestTimeoutMs / 1000
        )}s`,
        { category: 'timeout', model }
      );
    }
    throw new OpenAICompatibleImageProviderError(
      error instanceof Error ? error.message : 'Chaojitudou network error',
      { category: 'network', model }
    );
  } finally {
    clearTimeout(timeout);
  }
}

function getRemainingTimeoutMs(
  timeoutMs: number,
  startedAt: number,
  model: string
): number {
  const remainingMs = timeoutMs - (Date.now() - startedAt);
  if (remainingMs <= 0) {
    throw new OpenAICompatibleImageProviderError(
      `Chaojitudou image task timed out after ${Math.round(timeoutMs / 1000)}s`,
      { category: 'timeout', model }
    );
  }
  return remainingMs;
}

function getChaojitudouPollIntervalMs(): number {
  const configured = Number(
    process.env.CHAOJITUDOU_IMAGE_TASK_POLL_MS ||
      DEFAULT_CHAOJITUDOU_TASK_POLL_MS
  );
  if (!Number.isFinite(configured)) return DEFAULT_CHAOJITUDOU_TASK_POLL_MS;
  return Math.max(1, Math.min(15000, configured));
}

function getChaojitudouTaskRequestTimeoutMs(): number {
  const configured = Number(
    process.env.CHAOJITUDOU_IMAGE_TASK_REQUEST_TIMEOUT_MS ||
      DEFAULT_CHAOJITUDOU_TASK_REQUEST_TIMEOUT_MS
  );
  if (!Number.isFinite(configured) || configured <= 0) {
    return DEFAULT_CHAOJITUDOU_TASK_REQUEST_TIMEOUT_MS;
  }
  return Math.max(
    MIN_CHAOJITUDOU_TASK_REQUEST_TIMEOUT_MS,
    Math.min(MAX_CHAOJITUDOU_TASK_REQUEST_TIMEOUT_MS, Math.floor(configured))
  );
}

function getChaojitudouResumeExtraTimeoutSecs(): number {
  const configured = Number(
    process.env.CHAOJITUDOU_IMAGE_TASK_RESUME_EXTRA_SECS || 30
  );
  if (!Number.isFinite(configured)) return 30;
  return Math.max(5, Math.min(120, configured));
}

function getChaojitudouResumeLimit(): number {
  const configured = Number(process.env.CHAOJITUDOU_IMAGE_TASK_RESUME_LIMIT || 4);
  if (!Number.isFinite(configured)) return 4;
  return Math.max(0, Math.min(12, configured));
}

function getChaojitudouActivePollBudgetMs(): number {
  const configured = Number(
    process.env.CHAOJITUDOU_IMAGE_TASK_ACTIVE_POLL_BUDGET_MS ||
      DEFAULT_CHAOJITUDOU_ACTIVE_POLL_BUDGET_MS
  );
  if (!Number.isFinite(configured)) {
    return DEFAULT_CHAOJITUDOU_ACTIVE_POLL_BUDGET_MS;
  }
  return Math.max(30_000, Math.min(240_000, Math.floor(configured)));
}

function getChaojitudouDeferredPollDelayMs(): number {
  const configured = Number(
    process.env.CHAOJITUDOU_IMAGE_TASK_DEFERRED_POLL_DELAY_MS ||
      DEFAULT_CHAOJITUDOU_DEFERRED_POLL_DELAY_MS
  );
  if (!Number.isFinite(configured)) {
    return DEFAULT_CHAOJITUDOU_DEFERRED_POLL_DELAY_MS;
  }
  return Math.max(5_000, Math.min(120_000, Math.floor(configured)));
}

function shouldDeferChaojitudouTaskError(error: unknown): boolean {
  if (!(error instanceof OpenAICompatibleImageProviderError)) return false;
  return ['timeout', 'network', 'provider_unavailable'].includes(
    error.category
  );
}

function createChaojitudouPendingError({
  model,
  taskId,
  stage,
  cause
}: {
  model: string;
  taskId: string;
  stage: 'submit' | 'poll' | 'poll_budget';
  cause?: unknown;
}): OpenAICompatibleImageProviderPendingError {
  const causeMessage = cause ? `: ${getProviderPendingCauseMessage(cause)}` : '';
  return new OpenAICompatibleImageProviderPendingError(
    `Chaojitudou image task is still pending (${stage}) for ${taskId}${causeMessage}`,
    {
      model,
      providerTaskId: taskId,
      retryAfterMs: getChaojitudouDeferredPollDelayMs()
    }
  );
}

function getProviderPendingCauseMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'transient provider error';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

async function callOpenAICompatibleImageEndpoint(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  model: string
): Promise<ProviderImageResponse> {
  const controller = new AbortController();
  const startedAt = Date.now();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (isAbortError(error)) {
      throw new OpenAICompatibleImageProviderError(
        `OpenAI-compatible image provider timed out after ${Math.round(
          timeoutMs / 1000
        )}s`,
        { category: 'timeout', model }
      );
    }
    throw new OpenAICompatibleImageProviderError(
      error instanceof Error
        ? error.message
        : 'OpenAI-compatible network error',
      { category: 'network', model }
    );
  }

  try {
    if (isEventStreamResponse(response)) {
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        const message =
          text.trim() ||
          `OpenAI-compatible image provider failed: ${response.status}`;
        throw new OpenAICompatibleImageProviderError(message, {
          category: classifyOpenAICompatibleImageHttpError(
            response.status,
            message
          ),
          httpStatus: response.status,
          model
        });
      }
      return readOpenAICompatibleImageStream(response, {
        model,
        timeoutMs,
        startedAt
      });
    }

    const bodyText = await response.text().catch(() => '');
    const data = parseProviderImageJson(bodyText);
    if (!response.ok || data.error) {
      const message =
        getProviderErrorMessage(data.error) ||
        data.message ||
        bodyText.trim() ||
        `OpenAI-compatible image provider failed: ${response.status}`;
      const category = classifyOpenAICompatibleImageHttpError(
        response.ok ? 502 : response.status,
        message
      );
      throw new OpenAICompatibleImageProviderError(message, {
        category,
        httpStatus: response.ok ? 502 : response.status,
        model
      });
    }

    return data;
  } finally {
    clearTimeout(timeout);
  }
}

function shouldStreamOpenAICompatibleImages(
  config: OpenAICompatibleImageProviderConfig,
  model: string
): boolean {
  if (!config.supportsStreaming) return false;
  if (
    isChaojitudouOpenAICompatibleHost(config.apiBaseUrl) &&
    !isTruthyProviderEnvValue(
      process.env.OPENAI_COMPAT_IMAGE_STREAMING_ALLOW_CHAO
    )
  ) {
    return false;
  }
  return /^gpt-image/i.test(model);
}

function isChaojitudouOpenAICompatibleHost(apiBaseUrl: string): boolean {
  try {
    return /(^|\.)chaojitudou\.com$/i.test(new URL(apiBaseUrl).hostname);
  } catch {
    return /(^|\.)chaojitudou\.com(\/|$)/i.test(apiBaseUrl);
  }
}

function isEventStreamResponse(response: Response): boolean {
  return /text\/event-stream/i.test(response.headers.get('content-type') || '');
}

function parseProviderImageJson(text: string): ProviderImageResponse {
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as ProviderImageResponse;
  } catch {
    return { message: text.trim() };
  }
}

function getProviderErrorMessage(
  error: ProviderImageResponse['error']
): string | undefined {
  if (!error) return undefined;
  return typeof error === 'string' ? error : error.message;
}

async function readOpenAICompatibleImageStream(
  response: Response,
  {
    model,
    timeoutMs,
    startedAt
  }: {
    model: string;
    timeoutMs: number;
    startedAt: number;
  }
): Promise<ProviderImageResponse> {
  if (!response.body) {
    throw new OpenAICompatibleImageProviderError(
      'OpenAI-compatible image stream response did not include a body',
      { category: 'provider_response', model, retryable: false }
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const completedImages: Array<{ b64_json: string }> = [];
  let latestPartialImage: { b64_json: string } | null = null;
  let buffer = '';
  const getUsableStreamResponse = (): ProviderImageResponse | null => {
    if (completedImages.length > 0) return { data: completedImages };
    if (latestPartialImage) return { data: [latestPartialImage] };
    return null;
  };

  for (;;) {
    let value: Uint8Array | undefined;
    let done = false;
    try {
      const chunk = await readOpenAICompatibleStreamChunk(reader, {
        model,
        timeoutMs,
        startedAt
      });
      value = chunk.value;
      done = chunk.done;
    } catch (error) {
      const usable = getUsableStreamResponse();
      if (usable) return usable;
      if (error instanceof OpenAICompatibleImageProviderError) {
        throw error;
      }
      throw new OpenAICompatibleImageProviderError(
        error instanceof Error
          ? error.message
          : 'OpenAI-compatible image stream read failed',
        { category: 'network', model }
      );
    }
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const events = buffer.split(/\r?\n\r?\n/);
    buffer = events.pop() || '';

    for (const rawEvent of events) {
      const event = parseOpenAICompatibleStreamEvent(rawEvent);
      if (!event) continue;
      if (event.error || event.type === 'error') {
        const usable = getUsableStreamResponse();
        if (usable) return usable;
        const message =
          event.error?.message ||
          event.message ||
          'OpenAI-compatible image stream returned an error';
        throw new OpenAICompatibleImageProviderError(message, {
          category: classifyOpenAICompatibleImageHttpError(502, message),
          httpStatus: 502,
          model
        });
      }
      const eventImages = getOpenAICompatibleStreamEventImages(event);
      if (
        eventImages.length > 0 &&
        (event.type === 'image_generation.completed' ||
          event.type === 'image_edit.completed')
      ) {
        completedImages.push(...eventImages);
      } else if (eventImages.length > 0) {
        latestPartialImage = eventImages[eventImages.length - 1];
      }
    }

    if (done) break;
  }

  if (buffer.trim()) {
    const event = parseOpenAICompatibleStreamEvent(buffer);
    const eventImages = event
      ? getOpenAICompatibleStreamEventImages(event)
      : [];
    if (event && eventImages.length > 0) {
      if (
        event.type === 'image_generation.completed' ||
        event.type === 'image_edit.completed'
      ) {
        completedImages.push(...eventImages);
      } else {
        latestPartialImage = eventImages[eventImages.length - 1];
      }
    }
  }

  const usable = getUsableStreamResponse();
  if (usable) return usable;

  throw new OpenAICompatibleImageProviderError(
    'OpenAI-compatible image stream completed without an image',
    { category: 'provider_response', model, retryable: false }
  );
}

function getOpenAICompatibleRemainingTimeoutMs({
  timeoutMs,
  startedAt
}: {
  timeoutMs: number;
  startedAt: number;
}): number {
  return timeoutMs - (Date.now() - startedAt);
}

async function readOpenAICompatibleStreamChunk(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  {
    model,
    timeoutMs,
    startedAt
  }: {
    model: string;
    timeoutMs: number;
    startedAt: number;
  }
): Promise<ReadableStreamReadResult<Uint8Array>> {
  const remainingMs = getOpenAICompatibleRemainingTimeoutMs({
    timeoutMs,
    startedAt
  });
  if (remainingMs <= 0) {
    throw new OpenAICompatibleImageProviderError(
      `OpenAI-compatible image provider timed out after ${Math.round(
        timeoutMs / 1000
      )}s`,
      { category: 'timeout', model }
    );
  }

  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      reader.read(),
      new Promise<ReadableStreamReadResult<Uint8Array>>((_, reject) => {
        timeout = setTimeout(() => {
          reject(
            new OpenAICompatibleImageProviderError(
              `OpenAI-compatible image provider timed out after ${Math.round(
                timeoutMs / 1000
              )}s`,
              { category: 'timeout', model }
            )
          );
        }, remainingMs);
      })
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function parseOpenAICompatibleStreamEvent(
  rawEvent: string
): ProviderImageStreamEvent | null {
  const dataLines = rawEvent
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart());
  if (dataLines.length === 0) return null;
  const data = dataLines.join('\n').trim();
  if (!data || data === '[DONE]') return null;
  try {
    return JSON.parse(data) as ProviderImageStreamEvent;
  } catch {
    return { message: data };
  }
}

function getOpenAICompatibleStreamEventImages(
  event: ProviderImageStreamEvent
): Array<{ b64_json: string }> {
  const images: Array<{ b64_json: string }> = [];
  if (typeof event.b64_json === 'string' && event.b64_json.trim()) {
    images.push({ b64_json: event.b64_json });
  }
  const nestedData = event.data;
  if (
    nestedData &&
    !Array.isArray(nestedData) &&
    typeof nestedData.b64_json === 'string' &&
    nestedData.b64_json.trim()
  ) {
    images.push({ b64_json: nestedData.b64_json });
  }
  if (Array.isArray(nestedData)) {
    nestedData.forEach((item) => {
      if (typeof item?.b64_json === 'string' && item.b64_json.trim()) {
        images.push({ b64_json: item.b64_json });
      }
    });
  }
  return images;
}

async function mapOpenAICompatibleImageResponse(
  data: ProviderImageResponse,
  options: {
    imageCount: number;
    outputFormat: OpenAICompatibleImageOutputFormat;
    model: string;
    apiBaseUrl: string;
  }
): Promise<OpenAICompatibleGeneratedImage[]> {
  const settledImages = await Promise.allSettled(
    (data.data || []).slice(0, options.imageCount).map(async (item) => {
      if (item?.b64_json) {
        const encoded = dataUrlFromProviderBase64(
          item.b64_json,
          getOutputMimeType(options.outputFormat)
        );
        return {
          ...encoded,
          provider: 'openai-compatible' as const,
          model: options.model,
          providerApiBaseUrl: options.apiBaseUrl,
          source: 'b64_json' as const
        };
      }
      if (item?.url) {
        const downloaded = await downloadImageAsDataUrl(
          item.url,
          options.model
        );
        return {
          ...downloaded,
          provider: 'openai-compatible' as const,
          model: options.model,
          providerApiBaseUrl: options.apiBaseUrl,
          source: 'url' as const
        };
      }
      return null;
    })
  );

  const generated = settledImages
    .filter(
      (
        result
      ): result is PromiseFulfilledResult<OpenAICompatibleGeneratedImage | null> =>
        result.status === 'fulfilled'
    )
    .map((result) => result.value)
    .filter((item): item is OpenAICompatibleGeneratedImage => item !== null);
  if (generated.length > 0) return generated;

  const firstRejected = settledImages.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected'
  );
  if (firstRejected?.reason instanceof OpenAICompatibleImageProviderError) {
    throw firstRejected.reason;
  }

  throw new OpenAICompatibleImageProviderError(
    'OpenAI-compatible response did not include an image',
    {
      category: 'provider_response',
      model: options.model,
      retryable: false
    }
  );
}

async function downloadImageAsDataUrl(
  url: string,
  model?: string
): Promise<{ dataUrl: string; mimeType: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    IMAGE_DOWNLOAD_TIMEOUT_MS
  );
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new OpenAICompatibleImageProviderError(
        `OpenAI-compatible image URL download failed: ${response.status}`,
        {
          category: classifyOpenAICompatibleImageHttpError(response.status),
          httpStatus: response.status,
          model
        }
      );
    }

    const mimeType =
      response.headers.get('content-type')?.split(';')[0]?.trim() ||
      'image/png';
    const base64 = arrayBufferToBase64(await response.arrayBuffer());
    return {
      dataUrl: `data:${mimeType};base64,${base64}`,
      mimeType
    };
  } catch (error) {
    if (isAbortError(error)) {
      throw new OpenAICompatibleImageProviderError(
        `OpenAI-compatible image URL download timed out after ${Math.round(
          IMAGE_DOWNLOAD_TIMEOUT_MS / 1000
        )}s`,
        { category: 'timeout', model }
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function dataUrlFromProviderBase64(
  value: string,
  fallbackMimeType: string
): { dataUrl: string; mimeType: string } {
  const trimmed = value.trim();
  const dataUrlMatch = trimmed.match(/^data:([^;]+);base64,(.+)$/);
  if (dataUrlMatch) {
    return {
      dataUrl: trimmed,
      mimeType: dataUrlMatch[1] || fallbackMimeType
    };
  }
  return {
    dataUrl: `data:${fallbackMimeType};base64,${trimmed}`,
    mimeType: fallbackMimeType
  };
}

function getOutputMimeType(outputFormat: OpenAICompatibleImageOutputFormat) {
  if (outputFormat === 'jpeg') return 'image/jpeg';
  if (outputFormat === 'webp') return 'image/webp';
  return 'image/png';
}

function normalizeApiBaseUrl(value: string | undefined): string {
  return (value || '').trim().replace(/\/+$/, '');
}

function clampTimeoutMs(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 120000;
  return Math.max(5000, Math.min(Math.floor(value), 300000));
}

function normalizeImageCount(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(Math.floor(value), 4));
}

function normalizePartialImages(value: string | undefined): number {
  const cleaned = cleanProviderEnvValue(value);
  if (!cleaned) return 2;
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return 2;
  return Math.max(0, Math.min(Math.floor(parsed), 3));
}

function toReferenceBlob(reference: OpenAICompatibleImageReference): Blob {
  if (reference.data instanceof Blob) return reference.data;
  const data =
    reference.data instanceof Uint8Array
      ? copyUint8ArrayToArrayBuffer(reference.data)
      : reference.data;
  return new Blob([data], {
    type: reference.mimeType || 'image/png'
  });
}

function copyUint8ArrayToArrayBuffer(value: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy.buffer;
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

function isLikelyPolicyError(message: string): boolean {
  return /policy|safety|moderation|blocked|unsafe|sexual|nudity|erotic|adult|违规|安全|审核|拒绝|色情|情色|成人|裸露|擦边/i.test(
    message
  );
}
