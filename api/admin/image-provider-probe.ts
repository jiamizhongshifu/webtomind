import { getCorsHeadersForRequest } from '../utils/auth';
import { assertPromptCaseAdmin } from './prompt-case-auth';
import {
  classifyOpenAICompatibleImageHttpError,
  resolveOpenAICompatibleImageConfig
} from '../image/providers/openai-compatible-image';

export const config = { runtime: 'edge' };

type ProbeMode = 'models' | 'generation';

type ProbeBody = {
  mode?: unknown;
  prompt?: unknown;
  model?: unknown;
  size?: unknown;
  quality?: unknown;
  outputFormat?: unknown;
  responseFormat?: unknown;
  stream?: unknown;
  partialImages?: unknown;
  n?: unknown;
  timeoutMs?: unknown;
};

const DEFAULT_GENERATION_PROMPT =
  'A small red ceramic cup on a clean white table, soft daylight, simple product photo.';
const DEFAULT_TIMEOUT_MS = 180_000;
const MAX_TIMEOUT_MS = 300_000;
const MAX_ERROR_BODY_CHARS = 1200;

function jsonResponse(
  body: unknown,
  corsHeaders: Record<string, string>,
  status = 200
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    }
  });
}

function cleanString(
  value: unknown,
  fallback: string,
  maxLength = 4000
): string {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim();
  if (!normalized) return fallback;
  return normalized.slice(0, maxLength);
}

function cleanPositiveInteger(
  value: unknown,
  fallback: number,
  max: number
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(max, Math.max(1, Math.floor(parsed)));
}

function cleanMode(value: unknown): ProbeMode {
  return value === 'generation' ? 'generation' : 'models';
}

function shouldOmit(value: unknown): boolean {
  return value === false || value === null || value === '__omit';
}

function isTruthyProbeValue(value: unknown): boolean {
  return /^(1|true|yes|on)$/i.test(String(value || '').trim());
}

function redactApiHost(apiBaseUrl: string): string {
  try {
    const parsed = new URL(apiBaseUrl);
    return parsed.host;
  } catch {
    return apiBaseUrl.replace(/^https?:\/\//i, '').split('/')[0] || 'unknown';
  }
}

function buildEndpoint(baseUrl: string, mode: ProbeMode): string {
  return `${baseUrl.replace(/\/+$/g, '')}/${
    mode === 'models' ? 'models' : 'images/generations'
  }`;
}

async function readBodySnippet(response: Response): Promise<{
  text: string;
  json: unknown;
}> {
  const text = await response.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return {
    text:
      text.length > MAX_ERROR_BODY_CHARS
        ? `${text.slice(0, MAX_ERROR_BODY_CHARS)}...`
        : text,
    json
  };
}

function summarizeProviderPayload(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { payloadType: typeof payload };
  }
  const record = payload as Record<string, unknown>;
  const data = Array.isArray(record.data) ? record.data : [];
  const first = data[0];
  const firstRecord =
    first && typeof first === 'object' && !Array.isArray(first)
      ? (first as Record<string, unknown>)
      : {};
  const modelIds = data
    .map((item) =>
      item && typeof item === 'object' && !Array.isArray(item)
        ? (item as Record<string, unknown>).id
        : null
    )
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
  return {
    keys: Object.keys(record),
    dataCount: data.length,
    modelIds: modelIds.slice(0, 30),
    firstDataKeys: Object.keys(firstRecord),
    hasB64Json: typeof firstRecord.b64_json === 'string',
    hasUrl: typeof firstRecord.url === 'string',
    errorMessage:
      typeof (record.error as { message?: unknown } | undefined)?.message ===
      'string'
        ? (record.error as { message: string }).message
        : typeof record.message === 'string'
          ? record.message
          : null
  };
}

async function summarizeEventStream(response: Response): Promise<{
  summary: Record<string, unknown>;
  errorMessage: string | null;
}> {
  const text = await response.text();
  const events = text
    .split(/\r?\n\r?\n/)
    .map((raw) =>
      raw
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n')
        .trim()
    )
    .filter((data) => data && data !== '[DONE]');
  const parsedEvents = events
    .map((event) => {
      try {
        return JSON.parse(event) as Record<string, unknown>;
      } catch {
        return { type: 'unparseable', message: event.slice(0, 160) };
      }
    })
    .filter(Boolean);
  const completed = parsedEvents.filter(
    (event) =>
      event.type === 'image_generation.completed' ||
      event.type === 'image_edit.completed'
  );
  const partial = parsedEvents.filter(
    (event) =>
      event.type === 'image_generation.partial_image' ||
      event.type === 'image_edit.partial_image'
  );
  const error = parsedEvents.find(
    (event) => event.type === 'error' || event.error || event.message
  );
  const firstCompleted = completed[0] || {};
  const firstPartial = partial[0] || {};
  const b64Events = parsedEvents.filter(
    (event) => countStreamEventImages(event) > 0
  );
  const firstEvent = parsedEvents[0] || {};
  const lastEvent = parsedEvents[parsedEvents.length - 1] || {};
  const nestedError = error?.error as { message?: unknown } | undefined;
  const errorMessage =
    typeof error?.message === 'string'
      ? error.message
      : typeof nestedError?.message === 'string'
        ? nestedError.message
        : null;

  return {
    summary: {
      payloadType: 'event-stream',
      eventCount: parsedEvents.length,
      completedCount: completed.length,
      partialCount: partial.length,
      eventTypes: parsedEvents
        .map((event) => event.type)
        .filter((type): type is string => typeof type === 'string')
        .slice(0, 20),
      completedHasB64Json: typeof firstCompleted.b64_json === 'string',
      partialHasB64Json: typeof firstPartial.b64_json === 'string',
      b64EventCount: b64Events.length,
      firstEventKeys: Object.keys(firstEvent).slice(0, 20),
      lastEventKeys: Object.keys(lastEvent).slice(0, 20),
      bodyChars: text.length
    },
    errorMessage
  };
}

function countStreamEventImages(event: Record<string, unknown>): number {
  let count = typeof event.b64_json === 'string' ? 1 : 0;
  const nestedData = event.data;
  if (
    nestedData &&
    typeof nestedData === 'object' &&
    !Array.isArray(nestedData) &&
    typeof (nestedData as Record<string, unknown>).b64_json === 'string'
  ) {
    count += 1;
  }
  if (Array.isArray(nestedData)) {
    count += nestedData.filter(
      (item) =>
        item &&
        typeof item === 'object' &&
        !Array.isArray(item) &&
        typeof (item as Record<string, unknown>).b64_json === 'string'
    ).length;
  }
  return count;
}

async function assertProbeAccess(
  request: Request
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const opsSecret =
    process.env.IMAGE_PROVIDER_PROBE_SECRET ||
    process.env.CRON_SECRET ||
    process.env.VIDEO_DRAIN_SECRET ||
    '';
  const providedSecret =
    request.headers.get('x-provider-probe-secret') ||
    request.headers.get('x-cron-secret') ||
    '';
  if (opsSecret && providedSecret && providedSecret === opsSecret) {
    return { ok: true };
  }

  const admin = await assertPromptCaseAdmin(request);
  if (!admin.ok) {
    return {
      ok: false,
      status: admin.status,
      error: admin.error || 'Prompt case admin access required'
    };
  }
  return { ok: true };
}

export default async function handler(request: Request): Promise<Response> {
  const corsHeaders = await getCorsHeadersForRequest(request);
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (!['GET', 'POST'].includes(request.method)) {
    return jsonResponse({ error: 'Method not allowed' }, corsHeaders, 405);
  }

  const access = await assertProbeAccess(request);
  if (!access.ok) {
    return jsonResponse({ error: access.error }, corsHeaders, access.status);
  }

  const url = new URL(request.url);
  const rawBody =
    request.method === 'POST'
      ? ((await request.json().catch(() => ({}))) as ProbeBody)
      : {};
  const body: ProbeBody = {
    ...Object.fromEntries(url.searchParams.entries()),
    ...rawBody
  };
  const mode = cleanMode(body.mode);
  const providerConfig = resolveOpenAICompatibleImageConfig();
  const endpoint = buildEndpoint(providerConfig.apiBaseUrl, mode);
  const model = cleanString(body.model, providerConfig.model, 160);
  const timeoutMs = cleanPositiveInteger(
    body.timeoutMs,
    Math.min(
      providerConfig.timeoutMs || DEFAULT_TIMEOUT_MS,
      DEFAULT_TIMEOUT_MS
    ),
    MAX_TIMEOUT_MS
  );
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();

  const generationPayload =
    mode === 'generation'
      ? {
          model,
          prompt: cleanString(body.prompt, DEFAULT_GENERATION_PROMPT),
          ...(shouldOmit(body.size)
            ? {}
            : { size: cleanString(body.size, '1024x1024', 80) }),
          ...(shouldOmit(body.quality)
            ? {}
            : { quality: cleanString(body.quality, 'auto', 40) }),
          ...(shouldOmit(body.outputFormat)
            ? {}
            : { output_format: cleanString(body.outputFormat, 'png', 20) }),
          ...(shouldOmit(body.responseFormat)
            ? {}
            : { response_format: cleanString(body.responseFormat, 'url', 40) }),
          ...(isTruthyProbeValue(body.stream)
            ? {
                stream: true,
                partial_images: cleanPositiveInteger(body.partialImages, 0, 3)
              }
            : {}),
          n: cleanPositiveInteger(body.n, 1, 4)
        }
      : null;

  try {
    const response = await fetch(endpoint, {
      method: mode === 'models' ? 'GET' : 'POST',
      headers: {
        Authorization: `Bearer ${providerConfig.apiKey}`,
        Accept: 'application/json',
        ...(mode === 'generation' ? { 'Content-Type': 'application/json' } : {})
      },
      body: generationPayload ? JSON.stringify(generationPayload) : undefined,
      signal: controller.signal
    });
    const durationMs = Date.now() - startedAt;
    const isEventStream = /text\/event-stream/i.test(
      response.headers.get('content-type') || ''
    );
    const streamResult = isEventStream
      ? await summarizeEventStream(response)
      : null;
    const { text, json } = streamResult
      ? { text: '', json: null }
      : await readBodySnippet(response);
    const payloadSummary =
      streamResult?.summary || summarizeProviderPayload(json);
    const errorMessage =
      streamResult?.errorMessage ||
      (json && typeof json === 'object' && !Array.isArray(json)
        ? summarizeProviderPayload(json).errorMessage
        : text);

    return jsonResponse(
      {
        ok: response.ok,
        mode,
        endpointHost: redactApiHost(providerConfig.apiBaseUrl),
        endpointPath: new URL(endpoint).pathname,
        configuredModel: providerConfig.model,
        request:
          mode === 'generation'
            ? {
                model: generationPayload?.model,
                size: generationPayload?.size || null,
                quality: generationPayload?.quality || null,
                outputFormat: generationPayload?.output_format || null,
                responseFormat: generationPayload?.response_format || null,
                stream: generationPayload?.stream || false,
                partialImages: generationPayload?.partial_images ?? null,
                n: generationPayload?.n,
                promptChars: generationPayload?.prompt.length
              }
            : { model },
        status: response.status,
        statusText: response.statusText,
        durationMs,
        category: response.ok
          ? null
          : classifyOpenAICompatibleImageHttpError(
              response.status,
              String(errorMessage || '')
            ),
        payloadSummary,
        bodySnippet: response.ok ? undefined : text
      },
      corsHeaders,
      response.ok ? 200 : 502
    );
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const isAbort =
      error instanceof Error &&
      (error.name === 'AbortError' || /aborted/i.test(error.message));
    return jsonResponse(
      {
        ok: false,
        mode,
        endpointHost: redactApiHost(providerConfig.apiBaseUrl),
        endpointPath: new URL(endpoint).pathname,
        configuredModel: providerConfig.model,
        durationMs,
        category: isAbort ? 'timeout' : 'network',
        error: error instanceof Error ? error.message : String(error)
      },
      corsHeaders,
      502
    );
  } finally {
    clearTimeout(timeout);
  }
}
