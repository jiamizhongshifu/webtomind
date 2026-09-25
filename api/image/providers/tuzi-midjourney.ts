import type { TuziImageModelId } from '../../../src/shared/tuzi-image-models.js';

const DEFAULT_POLL_INTERVAL_MS = 2000;
const MAX_POLL_INTERVAL_MS = 5000;
const MAX_REQUEST_TIMEOUT_MS = 30_000;

type JsonRecord = Record<string, unknown>;

export interface TuziMidjourneyTaskResult {
  taskId: string;
  imageUrl: string;
}

export class TuziMidjourneyApiError extends Error {
  readonly httpStatus: number;

  constructor(message: string, httpStatus: number) {
    super(message);
    this.name = 'TuziMidjourneyApiError';
    this.httpStatus = httpStatus;
  }
}

export class TuziMidjourneyTimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(
      `Tuzi Midjourney task timed out after ${Math.round(timeoutMs / 1000)}s`
    );
    this.name = 'TuziMidjourneyTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

export function isTuziMidjourneyModelId(
  modelId: TuziImageModelId
): modelId is 'midjourney-v7' | 'midjourney-niji-v7' {
  return modelId === 'midjourney-v7' || modelId === 'midjourney-niji-v7';
}

function getBotType(modelId: TuziImageModelId): 'MID_JOURNEY' | 'NIJI_JOURNEY' {
  return modelId === 'midjourney-niji-v7' ? 'NIJI_JOURNEY' : 'MID_JOURNEY';
}

function buildPrompt(prompt: string, aspectRatio?: string): string {
  const normalizedPrompt = prompt.trim();
  const normalizedRatio = String(aspectRatio || '').trim();
  if (
    !normalizedRatio ||
    normalizedRatio === 'auto' ||
    /(?:^|\s)--ar(?:\s|=)\d+(?::\d+)?(?:\s|$)/i.test(normalizedPrompt)
  ) {
    return normalizedPrompt;
  }
  return `${normalizedPrompt} --ar ${normalizedRatio}`;
}

export function buildTuziMidjourneySubmitBody({
  modelId,
  prompt,
  aspectRatio
}: {
  modelId: TuziImageModelId;
  prompt: string;
  aspectRatio?: string;
}): Record<string, unknown> {
  return {
    botType: getBotType(modelId),
    prompt: buildPrompt(prompt, aspectRatio),
    base64Array: []
  };
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' ? (value as JsonRecord) : {};
}

function getMessage(data: unknown, fallback: string): string {
  const record = asRecord(data);
  const description = record.description;
  const message = record.message;
  const failReason = record.failReason;
  const error = record.error;
  const nestedError = asRecord(error).message;
  return (
    [
      description,
      message,
      failReason,
      nestedError,
      typeof error === 'string' ? error : ''
    ]
      .find(
        (value): value is string =>
          typeof value === 'string' && value.trim().length > 0
      )
      ?.trim() || fallback
  );
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

async function fetchJson(
  url: string,
  init: RequestInit,
  remainingMs: number,
  timeoutMessage: string
): Promise<{ response: Response; data: JsonRecord }> {
  const requestTimeoutMs = Math.max(
    1,
    Math.min(MAX_REQUEST_TIMEOUT_MS, Math.floor(remainingMs))
  );
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    let response: Response;
    try {
      response = await fetch(url, { ...init, signal: controller.signal });
    } catch (error) {
      if (
        controller.signal.aborted ||
        (error instanceof Error && error.name === 'AbortError')
      ) {
        throw new TuziMidjourneyTimeoutError(requestTimeoutMs);
      }
      throw new TuziMidjourneyApiError(
        error instanceof Error ? error.message : timeoutMessage,
        503
      );
    }

    const data = asRecord(await response.json().catch(() => ({})));
    if (!response.ok) {
      throw new TuziMidjourneyApiError(
        getMessage(data, timeoutMessage),
        response.status
      );
    }
    return { response, data };
  } finally {
    clearTimeout(timeout);
  }
}

function getTaskId(data: JsonRecord): string {
  const result = data.result;
  if (typeof result === 'string' || typeof result === 'number') {
    return String(result).trim();
  }
  return '';
}

function getNumericCode(data: JsonRecord): number | undefined {
  const code = Number(data.code);
  return Number.isFinite(code) ? code : undefined;
}

function getTaskRecord(data: JsonRecord): JsonRecord {
  return data.result && typeof data.result === 'object'
    ? asRecord(data.result)
    : data;
}

export async function submitAndPollTuziMidjourneyTask({
  apiBaseUrl,
  apiKey,
  modelId,
  prompt,
  aspectRatio,
  timeoutMs,
  extraHeaders = {}
}: {
  apiBaseUrl: string;
  apiKey: string;
  modelId: TuziImageModelId;
  prompt: string;
  aspectRatio?: string;
  timeoutMs: number;
  extraHeaders?: Record<string, string>;
}): Promise<TuziMidjourneyTaskResult> {
  const deadline = Date.now() + Math.max(1, Math.floor(timeoutMs));
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    ...extraHeaders
  };
  const submit = await fetchJson(
    `${apiBaseUrl}/mj/submit/imagine`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify(
        buildTuziMidjourneySubmitBody({ modelId, prompt, aspectRatio })
      )
    },
    Math.max(1, deadline - Date.now()),
    'Tuzi Midjourney submit failed'
  );
  const code = getNumericCode(submit.data);
  if (code !== 1 && code !== 22) {
    throw new TuziMidjourneyApiError(
      getMessage(submit.data, 'Tuzi Midjourney submit failed'),
      submit.response.status
    );
  }
  const taskId = getTaskId(submit.data);
  if (!taskId) {
    throw new TuziMidjourneyApiError(
      'Tuzi Midjourney submit response did not include a task id',
      502
    );
  }

  let pollDelayMs = 0;
  while (Date.now() < deadline) {
    if (pollDelayMs > 0) {
      await sleep(Math.min(pollDelayMs, Math.max(1, deadline - Date.now())));
    }
    if (Date.now() >= deadline) break;

    const taskResponse = await fetchJson(
      `${apiBaseUrl}/mj/task/${encodeURIComponent(taskId)}/fetch`,
      { method: 'GET', headers },
      Math.max(1, deadline - Date.now()),
      `Tuzi Midjourney task query failed (${taskId})`
    );
    const task = getTaskRecord(taskResponse.data);
    const status = String(task.status || '')
      .trim()
      .toUpperCase();
    const imageUrl =
      typeof task.imageUrl === 'string' ? task.imageUrl.trim() : '';
    if (status === 'SUCCESS' || imageUrl) {
      if (imageUrl) return { taskId, imageUrl };
      throw new TuziMidjourneyApiError(
        `Tuzi Midjourney task ${taskId} succeeded without an image URL`,
        502
      );
    }
    if (status === 'FAILURE') {
      throw new TuziMidjourneyApiError(
        getMessage(task, `Tuzi Midjourney task ${taskId} failed`),
        taskResponse.response.status
      );
    }
    pollDelayMs = Math.min(
      MAX_POLL_INTERVAL_MS,
      Math.max(DEFAULT_POLL_INTERVAL_MS, pollDelayMs + DEFAULT_POLL_INTERVAL_MS)
    );
  }

  throw new TuziMidjourneyTimeoutError(timeoutMs);
}
