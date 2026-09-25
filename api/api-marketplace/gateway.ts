import type { SupabaseClient } from '@supabase/supabase-js';
import {
  API_MARKETPLACE_MARKUP,
  buildOpenAiModelList,
  estimateCustomerChargeCents,
  extractUsage,
  getApiMarketplaceCatalog,
  getBearerToken,
  getMarketplaceRelayBaseUrlError,
  getMarketplaceRelayConfigError,
  getUpstreamApiKey,
  getUpstreamBaseUrl,
  hashApiKey,
  isApiMarketplaceAdminUserId,
  isEndpointAllowed,
  isMarketplaceRelayConfigured,
  isMarketplaceRelayRequired,
  API_MARKETPLACE_DEFAULT_GROUP,
  jsonResponse,
  normalizeEndpointPath,
  preflightResponse
} from './runtime';
import { getSupabaseAdmin } from '../utils/auth';

export const config = { runtime: 'edge' };

type ApiKeyRecord = {
  id: string;
  user_id: string;
  name: string;
  status: string;
  expires_at?: string | null;
};

function isExpired(value: string | null | undefined): boolean {
  return Boolean(value && new Date(value).getTime() <= Date.now());
}

/**
 * Standard OpenAI clients send /images/edits and audio endpoints as multipart
 * form data, so the model never appears in a JSON body. Parse the cloned body
 * up front; the raw multipart stream still proxies untouched.
 *
 * The field is extracted from the raw bytes because Request#formData() has
 * divergent behaviors across runtimes (undici versions refuse to re-parse a
 * previously encoded Request body). A bounded byte scan keeps this identical
 * on Workers and Node.
 */
const MAX_MULTIPART_MODEL_SCAN_BYTES = 4 * 1024 * 1024;

export async function extractModelNameFromMultipart(
  request: Request
): Promise<string> {
  const buffer = await request.clone().arrayBuffer();
  const view =
    buffer.byteLength > MAX_MULTIPART_MODEL_SCAN_BYTES
      ? buffer.slice(0, MAX_MULTIPART_MODEL_SCAN_BYTES)
      : buffer;
  const text = new TextDecoder('utf-8', { fatal: false }).decode(view);
  const match = /name="model"[^\r\n]*\r?\n\r?\n([^\r\n]+)/.exec(text);
  return match ? match[1].trim().slice(0, 256) : '';
}

/**
 * Client-supplied idempotency keys become the ledger global request id, so
 * they share the stricter charset and length budget reserved for internal ids.
 */
export function parseClientIdempotencyKey(value: string | null): string {
  const trimmed = (value || '').trim();
  if (!trimmed) return '';
  if (trimmed.length > 128) return '';
  if (/[^!-~]/.test(trimmed)) return '';
  return trimmed;
}

/**
 * Classify a reserve_api_wallet result for a possibly replayed request id.
 * Only `new` may be forwarded upstream: an idempotent result means an earlier
 * request with the same id already holds (or closed) the single reservation
 * this request id will ever be billed against.
 */
export function classifyReservationReplay(
  reserveResult: unknown
): 'new' | 'in_progress' | 'completed' {
  if (
    !reserveResult ||
    typeof reserveResult !== 'object' ||
    (reserveResult as { idempotent?: unknown }).idempotent !== true
  ) {
    return 'new';
  }
  const status = String((reserveResult as { status?: unknown }).status || '');
  return status === 'reserved' ? 'in_progress' : 'completed';
}

export function describeReserveFailure(code: string): {
  status: number;
  type: string;
  message: string;
} {
  if (code === 'INSUFFICIENT_WALLET_BALANCE' || code === 'INSUFFICIENT_KEY_BALANCE') {
    return {
      status: 402,
      type: 'insufficient_quota',
      message: 'API 余额不足，请先充值'
    };
  }
  if (code === 'REQUEST_ID_CONFLICT') {
    return {
      status: 409,
      type: 'idempotency_key_conflict',
      message: 'Idempotency-Key 已被其他请求占用，请更换后重试'
    };
  }
  return {
    status: 503,
    type: 'reservation_failed',
    message: '扣费预处理失败，请稍后重试'
  };
}

function getModelName(body: unknown, request: Request): string {
  if (body && typeof body === 'object' && typeof (body as Record<string, unknown>).model === 'string') {
    return String((body as Record<string, unknown>).model);
  }
  return new URL(request.url).searchParams.get('model') || '';
}

const MAX_ESTIMATED_INPUT_TOKENS = 1_000_000;
const DEFAULT_OUTPUT_RESERVATION_TOKENS = 1024;
const UPSTREAM_HEADERS_TIMEOUT_MS = 30_000;
const SETTLEMENT_ATTEMPTS = 3;
const MAX_JSON_BODY_BYTES = 2 * 1024 * 1024;
const MAX_MULTIPART_BODY_BYTES = 25 * 1024 * 1024;

/**
 * Per-user sliding-window rate limit backed by a single ledger row. Cheap,
 * transactional and survives Worker eviction; the upstream relay already caps
 * global concurrency, this only stops a single user from monopolizing it.
 */
export async function isUserRateLimited(
  supabase: SupabaseClient,
  userId: string,
  limits: { perMinute: number; perDay: number }
): Promise<boolean> {
  const { data, error } = await supabase.rpc('check_api_gateway_rate_limit', {
    p_user_id: userId,
    p_per_minute: limits.perMinute,
    p_per_day: limits.perDay
  });
  if (error) {
    // Never let a limiter outage take the gateway down.
    console.error('[ApiMarketplace] Rate limit check failed (fail-open):', error.message);
    return false;
  }
  if (data && typeof data === 'object') {
    return (data as { limited?: unknown }).limited === true;
  }
  return false;
}

/**
 * Reservations must be conservative. Looking only at `messages[].content`
 * under-reserves Responses requests, tool calls, audio/image parts and other
 * OpenAI-compatible payloads. Serializing the complete JSON body gives us a
 * safe upper estimate; the final provider usage still determines the actual
 * charge and any surplus is refunded by the ledger.
 */
export function approximateInputTokens(body: unknown): number {
  if (!body || typeof body !== 'object') return 0;
  let serialized = '';
  try {
    serialized = JSON.stringify(body);
  } catch {
    return MAX_ESTIMATED_INPUT_TOKENS;
  }
  if (!serialized) return 0;
  return Math.min(
    MAX_ESTIMATED_INPUT_TOKENS,
    Math.max(0, Math.ceil(serialized.length / 4))
  );
}

function getReservationCents(
  model: Awaited<ReturnType<typeof getApiMarketplaceCatalog>>['models'][number],
  body: unknown,
  fallbackInputTokens = 0
): number {
  if (model.pricingMode === 'request') return estimateCustomerChargeCents(model, {});
  const rawMaxTokens =
    body && typeof body === 'object'
      ? Number((body as Record<string, unknown>).max_tokens ?? (body as Record<string, unknown>).max_output_tokens ?? 1024)
      : DEFAULT_OUTPUT_RESERVATION_TOKENS;
  const maxTokens = Number.isFinite(rawMaxTokens)
    ? Math.max(1, Math.floor(rawMaxTokens))
    : DEFAULT_OUTPUT_RESERVATION_TOKENS;
  return estimateCustomerChargeCents(model, {
    inputTokens: Math.max(approximateInputTokens(body), fallbackInputTokens),
    outputTokens: Math.min(maxTokens, MAX_ESTIMATED_INPUT_TOKENS)
  });
}

function getCustomerChargeCents(
  model: Awaited<ReturnType<typeof getApiMarketplaceCatalog>>['models'][number],
  usage: { inputTokens: number; outputTokens: number },
  reservedCents: number,
  upstreamOk: boolean
): number {
  if (!upstreamOk) return 0;
  // Some compatible providers omit usage in successful responses. Keeping the
  // reservation in that case prevents an upstream response-format quirk from
  // turning a real request into a one-cent charge.
  if (model.pricingMode === 'token' && usage.inputTokens === 0 && usage.outputTokens === 0) {
    return reservedCents;
  }
  return estimateCustomerChargeCents(model, usage);
}

export function getSafeUpstreamErrorMessage(status: number): string {
  if (status === 429) return '模型服务当前请求较多，请稍后重试';
  if (status >= 500) return '模型服务暂时不可用，请稍后重试';
  return '模型服务未接受本次请求，请检查模型和请求参数';
}

/**
 * Only successful SSE responses may be streamed through to customers.
 * Provider error streams must go through the normal sanitized error path so
 * their body cannot reveal upstream branding, diagnostics, or credentials.
 */
export function shouldStreamUpstreamResponse(
  response: Pick<Response, 'ok' | 'body'>,
  contentType: string
): boolean {
  return (
    response.ok &&
    Boolean(response.body) &&
    contentType.toLowerCase().includes('text/event-stream')
  );
}

/**
 * The upstream provider times out / 502s on non-streaming
 * `/v1/chat/completions` calls but reliably answers SSE when `stream: true`.
 * When a customer asks for a non-streaming chat completion, force the
 * upstream request into streaming mode with usage included, then aggregate
 * the SSE back into a standard chat.completion response.
 *
 * Explicitly streaming customer requests keep their existing behavior: the
 * body is only normalized to request usage in the stream.
 */
export function buildUpstreamForwardedBody(
  body: Record<string, unknown>,
  path: string
): Record<string, unknown> {
  const forwarded = { ...body };
  if (path === '/chat/completions' && forwarded.stream !== true) {
    forwarded.stream = true;
  }
  if (forwarded.stream === true) {
    const streamOptions =
      forwarded.stream_options && typeof forwarded.stream_options === 'object'
        ? { ...(forwarded.stream_options as Record<string, unknown>) }
        : {};
    forwarded.stream_options = { ...streamOptions, include_usage: true };
  }
  return forwarded;
}

export type ChatCompletionSseAggregate = {
  id: string;
  model: string;
  role: string;
  content: string;
  toolCalls: Array<Record<string, unknown>>;
  finishReason: string | null;
  usage: { inputTokens: number; outputTokens: number };
};

export function createEmptyChatCompletionAggregate(): ChatCompletionSseAggregate {
  return {
    id: '',
    model: '',
    role: 'assistant',
    content: '',
    toolCalls: [],
    finishReason: null,
    usage: { inputTokens: 0, outputTokens: 0 }
  };
}

/**
 * Merge one parsed OpenAI-compatible SSE data payload into the running
 * aggregate. Content deltas accumulate, the last observed model / id / role /
 * finish_reason wins, and a chunk carrying usage replaces the running usage.
 */
export function aggregateChatCompletionChunk(
  aggregate: ChatCompletionSseAggregate,
  chunk: unknown
): ChatCompletionSseAggregate {
  if (!chunk || typeof chunk !== 'object' || Array.isArray(chunk)) {
    return aggregate;
  }
  const record = chunk as Record<string, unknown>;
  const next: ChatCompletionSseAggregate = { ...aggregate };
  if (typeof record.id === 'string' && record.id) next.id = record.id;
  if (typeof record.model === 'string' && record.model) next.model = record.model;
  const choices = record.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const choice = choices[0] as Record<string, unknown> | undefined;
    if (choice && typeof choice === 'object') {
      const delta = choice.delta;
      if (delta && typeof delta === 'object') {
        const deltaRecord = delta as Record<string, unknown>;
        if (typeof deltaRecord.role === 'string' && deltaRecord.role) {
          next.role = deltaRecord.role;
        }
        if (typeof deltaRecord.content === 'string') {
          next.content += deltaRecord.content;
        }
        // Streaming tool calls arrive as indexed partial fragments; merge them
        // so the aggregated non-streaming response carries a complete
        // tool_calls array (agent frameworks depend on this contract).
        if (Array.isArray(deltaRecord.tool_calls)) {
          for (const fragment of deltaRecord.tool_calls) {
            if (!fragment || typeof fragment !== 'object' || Array.isArray(fragment)) continue;
            const item = fragment as Record<string, unknown>;
            const index = Number.isFinite(Number(item.index))
              ? Number(item.index)
              : next.toolCalls.length;
            const existing = next.toolCalls[index];
            if (!existing || typeof existing !== 'object') {
              next.toolCalls[index] = { ...item };
              continue;
            }
            const merged: Record<string, unknown> = { ...existing };
            if (typeof item.id === 'string' && item.id) merged.id = item.id;
            if (typeof item.type === 'string' && item.type) merged.type = item.type;
            if (item.function && typeof item.function === 'object') {
              const prevFn =
                merged.function && typeof merged.function === 'object'
                  ? (merged.function as Record<string, unknown>)
                  : {};
              const nextFn = item.function as Record<string, unknown>;
              merged.function = {
                ...prevFn,
                name: typeof nextFn.name === 'string' && nextFn.name
                  ? nextFn.name
                  : prevFn.name,
                arguments:
                  typeof nextFn.arguments === 'string'
                    ? String(prevFn.arguments || '') + nextFn.arguments
                    : prevFn.arguments
              };
            }
            next.toolCalls[index] = merged;
          }
        }
      }
      if (typeof choice.finish_reason === 'string') {
        next.finishReason = choice.finish_reason;
      }
    }
  }
  const usage = extractUsage(record);
  if (usage.inputTokens || usage.outputTokens) next.usage = usage;
  return next;
}

/**
 * Parse a complete SSE body (`data:` lines only, tolerant of keep-alive
 * comments and `[DONE]`) into a single aggregated chat completion.
 */
export function aggregateChatCompletionSseText(
  value: string,
  initial?: ChatCompletionSseAggregate
): ChatCompletionSseAggregate {
  let aggregate = initial ? { ...initial } : createEmptyChatCompletionAggregate();
  for (const line of value.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) continue;
    const payload = trimmed.replace(/^data:\s*/, '');
    if (!payload || payload === '[DONE]') continue;
    try {
      aggregate = aggregateChatCompletionChunk(aggregate, JSON.parse(payload));
    } catch {
      // Ignore non-JSON SSE lines and preserve the last valid aggregate.
    }
  }
  return aggregate;
}

export type NonStreamingChatCompletion = {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
      tool_calls?: Array<Record<string, unknown>>;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

/**
 * Rebuild the standard non-streaming `chat.completion` payload that a client
 * would have received had the upstream honored `stream: false`.
 */
export function buildNonStreamingChatCompletion(
  aggregate: ChatCompletionSseAggregate,
  fallbackId = '',
  fallbackModel = ''
): NonStreamingChatCompletion {
  const inputTokens = Math.max(0, aggregate.usage.inputTokens);
  const outputTokens = Math.max(0, aggregate.usage.outputTokens);
  return {
    id: aggregate.id || fallbackId || 'chatcmpl-sse-aggregated',
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: aggregate.model || fallbackModel,
    choices: [
      {
        index: 0,
        message: {
          role: aggregate.role || 'assistant',
          content: aggregate.content,
          ...(Array.isArray(aggregate.toolCalls) && aggregate.toolCalls.length > 0
            ? { tool_calls: aggregate.toolCalls.filter(Boolean) }
            : {})
        },
        finish_reason:
          aggregate.finishReason ??
          (aggregate.toolCalls.length > 0 ? 'tool_calls' : 'stop')
      }
    ],
    usage: {
      prompt_tokens: inputTokens,
      completion_tokens: outputTokens,
      total_tokens: inputTokens + outputTokens
    }
  };
}

/**
 * Convert the public `/v1/*` request path to the internal allowlist path.
 * Keep this at the gateway boundary so Worker routing and endpoint policy use
 * the same normalization contract as catalog endpoint metadata.
 */
export function normalizeGatewayEndpointPath(pathname: string): string {
  return normalizeEndpointPath(pathname);
}

function parseStreamUsage(value: string): { inputTokens: number; outputTokens: number } {
  let usage = { inputTokens: 0, outputTokens: 0 };
  for (const line of value.split(/\r?\n/)) {
    const payload = line.trim().replace(/^data:\s*/, '');
    if (!payload || payload === '[DONE]') continue;
    try {
      const next = extractUsage(JSON.parse(payload));
      if (next.inputTokens || next.outputTokens) usage = next;
    } catch {
      // Ignore non-JSON SSE lines and preserve the last usage payload.
    }
  }
  return usage;
}

function mergeStreamUsage(
  value: string,
  current: { inputTokens: number; outputTokens: number }
): { inputTokens: number; outputTokens: number } {
  try {
    const next = extractUsage(JSON.parse(value.trim().replace(/^data:\s*/, '')));
    if (next.inputTokens || next.outputTokens) return next;
  } catch {
    // Partial SSE frames and [DONE] are expected.
  }
  return current;
}

async function settleUsage(params: {
  upstreamGroup?: string;
  supabase: SupabaseClient;
  requestId: string;
  model: string;
  upstreamCostCents: number;
  customerCostCents: number;
  usage: { inputTokens: number; outputTokens: number };
  status: number;
}): Promise<{ ok: boolean; balanceCents?: number }> {
  const { data, error } = await params.supabase.rpc('settle_api_usage', {
    p_request_id: params.requestId,
    p_actual_customer_cents: params.customerCostCents,
    p_upstream_cost_cents: params.upstreamCostCents,
    p_metadata: {
      source: 'api_gateway',
      model: params.model,
      upstream_group: params.upstreamGroup || API_MARKETPLACE_DEFAULT_GROUP,
      status_code: params.status,
      input_tokens: params.usage.inputTokens,
      output_tokens: params.usage.outputTokens
    }
  });
  if (error) {
    console.error('[ApiMarketplace] Usage settlement failed:', error);
    return { ok: false };
  }
  // An empty/missing RPC payload means the caller cannot prove the ledger
  // accepted the settlement. Fail closed so the durable queue retries later.
  if (!data || typeof data !== 'object') {
    console.error('[ApiMarketplace] Usage settlement returned no payload:', {
      requestId: params.requestId
    });
    return { ok: false };
  }
  const result = data as {
    ok?: unknown;
    balance_cents?: unknown;
    balanceCents?: unknown;
    wallet_balance_cents?: unknown;
    walletBalanceCents?: unknown;
  };
  return {
    ok: result.ok !== false,
    balanceCents:
      Number(
        result.wallet_balance_cents ??
          result.walletBalanceCents ??
          result.balance_cents ??
          result.balanceCents
      ) || undefined
  };
}

async function settleUsageWithRetry(params: Parameters<typeof settleUsage>[0]) {
  let lastResult: Awaited<ReturnType<typeof settleUsage>> = { ok: false };
  for (let attempt = 1; attempt <= SETTLEMENT_ATTEMPTS; attempt += 1) {
    lastResult = await settleUsage(params);
    if (lastResult.ok) return lastResult;
    if (attempt < SETTLEMENT_ATTEMPTS) {
      await new Promise<void>((resolve) => setTimeout(resolve, 25 * attempt));
    }
  }
  return lastResult;
}

async function settleUsageAndQueue(
  params: Parameters<typeof settleUsage>[0]
): Promise<Awaited<ReturnType<typeof settleUsage>>> {
  const result = await settleUsageWithRetry(params);
  if (result.ok) return result;

  // A completed upstream request must not depend on the edge invocation
  // surviving until the ledger is healthy again. Persist the exact observed
  // usage so the service-role cron can retry the idempotent settlement later.
  const { data, error } = await params.supabase.rpc(
    'queue_api_usage_settlement',
    {
      p_request_id: params.requestId,
      p_actual_customer_cents: params.customerCostCents,
      p_upstream_cost_cents: params.upstreamCostCents,
      p_metadata: {
        source: 'api_gateway_settlement_retry',
        model: params.model,
        status_code: params.status,
        input_tokens: params.usage.inputTokens,
        output_tokens: params.usage.outputTokens
      }
    }
  );
  if (error || (data && typeof data === 'object' && (data as { ok?: unknown }).ok === false)) {
    console.error('[ApiMarketplace] Failed to queue usage settlement:', {
      requestId: params.requestId,
      error: error?.message || data
    });
  }
  return result;
}

export function buildUpstreamHeaders(
  request: Request,
  upstreamKey: string,
  requestId: string,
  modelName: string,
  hasForwardedJsonBody: boolean
): Headers {
  // Only protocol headers are copied. Cookies, origin/referrer and forwarding
  // headers belong to the customer-facing request and must never cross the
  // relay boundary.
  const headers = new Headers();
  for (const name of ['accept', 'accept-encoding', 'content-type', 'user-agent']) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set('Authorization', `Bearer ${upstreamKey}`);
  headers.set('X-WebToMind-Relay-Request-Id', requestId);
  headers.set('X-WebToMind-Model', modelName);
  // Observability contract: the pricing catalog is pinned to this Tuzi group.
  // Relays that honor per-group billing must forward or log it so auditors can
  // prove which group multiplier actually billed each request.
  headers.set('X-WebToMind-Upstream-Group', API_MARKETPLACE_DEFAULT_GROUP);
  if (hasForwardedJsonBody) headers.set('Content-Type', 'application/json');
  return headers;
}

type GatewayExecutionContext = {
  waitUntil(promise: Promise<unknown>): void;
};

export default async function handler(
  request: Request,
  context?: GatewayExecutionContext
): Promise<Response> {
  const preflight = preflightResponse(request);
  if (preflight) return preflight;
  const supabase = getSupabaseAdmin();
  if (!supabase) return jsonResponse(request, { error: 'Gateway database is not configured' }, 503);

  const bearer = getBearerToken(request);
  if (!bearer || !bearer.startsWith('sk-wtm_')) {
    return jsonResponse(request, { error: { message: 'Invalid API key', type: 'invalid_request_error' } }, 401);
  }
  const keyHash = await hashApiKey(bearer);
  const { data: key, error: keyError } = await supabase
    .from('api_keys')
    .select('id,user_id,name,status,expires_at')
    .eq('key_hash', keyHash)
    .maybeSingle();
  if (keyError || !key) {
    return jsonResponse(request, { error: { message: 'Invalid API key', type: 'invalid_request_error' } }, 401);
  }
  const apiKey = key as ApiKeyRecord;
  if (apiKey.status !== 'active' || isExpired(apiKey.expires_at)) {
    return jsonResponse(request, { error: { message: 'API key is inactive', type: 'invalid_request_error' } }, 401);
  }
  if (!(await isApiMarketplaceAdminUserId(supabase, apiKey.user_id))) {
    return jsonResponse(request, { error: { message: 'Invalid API key', type: 'invalid_request_error' } }, 401);
  }
  if (
    await isUserRateLimited(supabase, apiKey.user_id, {
      perMinute: 60,
      perDay: 5000
    })
  ) {
    return jsonResponse(
      request,
      { error: { message: '请求频率超出限额，请稍后重试', type: 'rate_limit_exceeded' } },
      429,
      { 'Retry-After': '60' }
    );
  }

  const url = new URL(request.url);
  const path = normalizeGatewayEndpointPath(url.pathname);
  const method = request.method;
  const catalog = await getApiMarketplaceCatalog().catch(() => null);
  if (!catalog) return jsonResponse(request, { error: { message: 'Model catalog unavailable', type: 'server_error' } }, 503);

  if (path === '/models' && method === 'GET') {
    return jsonResponse(request, buildOpenAiModelList(catalog.models));
  }

  // P0: Only the exact public OpenAI-compatible surface may be proxied. A
  // valid model in the body is never enough to reach an arbitrary upstream
  // path; unknown methods and paths are rejected before any credential or
  // wallet is touched.
  if (!isEndpointAllowed(method, path)) {
    return jsonResponse(request, { error: { message: 'Not found', type: 'invalid_request_error' } }, 404);
  }

  // P0: Production must fail closed to the internal relay. Missing or invalid
  // relay configuration is an error here, never a reason to silently fall back
  // to a direct provider endpoint.
  if (isMarketplaceRelayRequired()) {
    const relayError = getMarketplaceRelayConfigError();
    if (relayError) {
      console.error('[ApiMarketplace] Relay configuration invalid:', relayError);
      return jsonResponse(request, { error: { message: 'API relay is not configured', type: 'server_error' } }, 503);
    }
  } else if (isMarketplaceRelayConfigured()) {
    const relayError = getMarketplaceRelayBaseUrlError();
    if (relayError) {
      console.error('[ApiMarketplace] Relay configuration invalid:', relayError);
      return jsonResponse(request, { error: { message: 'API relay is not configured', type: 'server_error' } }, 503);
    }
  }

  const upstreamKey = getUpstreamApiKey();
  if (!upstreamKey) {
    return jsonResponse(request, { error: { message: 'Upstream API is not configured', type: 'server_error' } }, 503);
  }

  let body: unknown = null;
  let forwardedBody: BodyInit | undefined;
  let clientWantsStream = false;
  let isMultipartForm = false;
  let multipartModelName = '';
  const contentType = request.headers.get('content-type') || '';
  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(declaredLength) && declaredLength > 0) {
    const maxBytes = contentType.includes('multipart/form-data')
      ? MAX_MULTIPART_BODY_BYTES
      : MAX_JSON_BODY_BYTES;
    if (declaredLength > maxBytes) {
      return jsonResponse(
        request,
        { error: { message: '请求体过大', type: 'request_too_large' } },
        413
      );
    }
  }
  if (contentType.includes('multipart/form-data') && method !== 'GET' && method !== 'HEAD') {
    try {
      multipartModelName = await extractModelNameFromMultipart(request);
      isMultipartForm = true;
    } catch {
      return jsonResponse(request, { error: { message: 'Invalid multipart form data', type: 'invalid_request_error' } }, 400);
    }
  } else if (contentType.includes('application/json') && request.method !== 'GET') {
    try {
      body = await request.clone().json();
    } catch {
      return jsonResponse(request, { error: { message: 'Invalid JSON body', type: 'invalid_request_error' } }, 400);
    }
    if (body && typeof body === 'object' && !Array.isArray(body)) {
      const sourceBody = body as Record<string, unknown>;
      clientWantsStream = sourceBody.stream === true;
      forwardedBody = JSON.stringify(buildUpstreamForwardedBody(sourceBody, path));
    }
  }
  const modelName = getModelName(body, request) || multipartModelName;
  const model = catalog.models.find((item) => item.id === modelName);
  if (!modelName || !model) {
    return jsonResponse(request, { error: { message: `Model ${modelName || '(missing)'} is not available`, type: 'invalid_request_error' } }, 400);
  }
  if (!isEndpointAllowed(method, path, model)) {
    return jsonResponse(
      request,
      { error: { message: `Model ${modelName} does not support endpoint ${path}`, type: 'invalid_request_error' } },
      400
    );
  }

  const upstreamBaseUrl = getUpstreamBaseUrl();
  if (!upstreamBaseUrl) {
    return jsonResponse(request, { error: { message: 'API relay is not configured', type: 'server_error' } }, 503);
  }

  // A client Idempotency-Key becomes the ledger-wide unique request id, so a
  // retried request reuses the original reservation instead of double-charging
  // an expensive image/audio operation whose first attempt may have completed.
  const clientKeyIdempotency = parseClientIdempotencyKey(request.headers.get('Idempotency-Key'));
  const requestId = clientKeyIdempotency || crypto.randomUUID();
  // Multipart uploads carry binary audio/images that JSON serialization cannot
  // see. Approximate from declared upload size (~1 token per 4 bytes) so the
  // reservation covers the real work; the ledger refunds the unused surplus.
  const contentLengthBytes = Number(request.headers.get('content-length') || 0);
  const multipartInputTokens = isMultipartForm && Number.isFinite(contentLengthBytes)
    ? Math.min(MAX_ESTIMATED_INPUT_TOKENS, Math.ceil(contentLengthBytes / 4))
    : 0;
  const reserveCents = getReservationCents(model, body, multipartInputTokens);
  const { data: reserveResult, error: reserveError } = await supabase.rpc('reserve_api_wallet', {
    p_key_id: apiKey.id,
    p_user_id: apiKey.user_id,
    p_request_id: requestId,
    p_amount_cents: reserveCents,
    p_metadata: {
      source: 'api_gateway',
      model: modelName,
      endpoint: path,
      idempotency_key: requestId
    }
  });
  if (reserveError || (reserveResult && typeof reserveResult === 'object' && (reserveResult as { ok?: unknown }).ok === false)) {
    const failureCode =
      !reserveError && reserveResult && typeof reserveResult === 'object'
        ? String((reserveResult as { error?: unknown }).error || 'RESERVE_FAILED')
        : 'RESERVE_RPC_ERROR';
    const failure = describeReserveFailure(failureCode);
    console.error('[ApiMarketplace] Reservation failed:', {
      requestId,
      code: failureCode,
      detail: reserveError?.message || null
    });
    return jsonResponse(request, { error: { message: failure.message, type: failure.type } }, failure.status);
  }
  // A replayed Idempotency-Key never reaches upstream again. The reservation
  // RPC does not reserve twice for one request id and settlement is
  // idempotent, so forwarding a replay would run a second paid upstream call
  // that can never be billed.
  const replay = classifyReservationReplay(reserveResult);
  if (replay === 'in_progress') {
    return jsonResponse(
      request,
      { error: { message: '该 Idempotency-Key 的请求仍在处理中，请稍后查询使用记录，勿重复提交', type: 'idempotent_request_in_progress' } },
      409,
      { 'X-WebToMind-Request-Id': requestId, 'Retry-After': '30' }
    );
  }
  if (replay === 'completed') {
    return jsonResponse(
      request,
      { error: { message: '该 Idempotency-Key 的请求已处理完成，请勿重复提交', type: 'idempotent_replay_rejected' } },
      409,
      { 'X-WebToMind-Request-Id': requestId }
    );
  }

  const upstreamHeaders = buildUpstreamHeaders(
    request,
    upstreamKey,
    requestId,
    modelName,
    forwardedBody !== undefined
  );
  const upstreamUrl = `${upstreamBaseUrl}${url.pathname}${url.search}`;
  let upstreamResponse: Response;
  const upstreamAbort = new AbortController();
  const upstreamTimeout = setTimeout(
    () => upstreamAbort.abort(),
    UPSTREAM_HEADERS_TIMEOUT_MS
  );
  try {
    upstreamResponse = await fetch(upstreamUrl, {
      method: request.method,
      headers: upstreamHeaders,
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : forwardedBody ?? request.body,
      signal: upstreamAbort.signal
    });
  } catch (error) {
    clearTimeout(upstreamTimeout);
    await settleUsageAndQueue({
      supabase,
      requestId,
      model: modelName,
      upstreamCostCents: 0,
      customerCostCents: 0,
      usage: { inputTokens: 0, outputTokens: 0 },
      status: 502
    });
    console.error('[ApiMarketplace] Upstream request failed:', error);
    return jsonResponse(request, { error: { message: 'Upstream API request failed', type: 'upstream_error' } }, 502);
  }
  clearTimeout(upstreamTimeout);

  const upstreamContentType = upstreamResponse.headers.get('content-type') || '';
  // Non-streaming chat.completions requests were forced into upstream
  // streaming mode; aggregate the successful SSE back into the standard
  // non-streaming response the customer asked for.
  const shouldAggregateForcedSse =
    path === '/chat/completions' &&
    !clientWantsStream &&
    shouldStreamUpstreamResponse(upstreamResponse, upstreamContentType);
  if (shouldAggregateForcedSse) {
    const responseText = await upstreamResponse.text();
    const aggregate = aggregateChatCompletionSseText(responseText);
    const usage = aggregate.usage;
    const customerCostCents = getCustomerChargeCents(
      model,
      usage,
      reserveCents,
      upstreamResponse.ok
    );
    const upstreamCostCents = Math.max(0, Math.ceil(customerCostCents / API_MARKETPLACE_MARKUP));
    const settled = await settleUsageAndQueue({
      supabase,
      requestId,
      model: modelName,
      upstreamCostCents,
      customerCostCents,
      usage,
      status: upstreamResponse.status
    });
    if (!settled.ok) {
      return jsonResponse(
        request,
        { error: { message: '本次请求已完成，账单正在核对，请稍后查询使用记录', type: 'billing_pending' } },
        503,
        {
          'X-WebToMind-Request-Id': requestId,
          'X-WebToMind-Billing-Status': 'pending'
        }
      );
    }
    await supabase
      .from('api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', apiKey.id)
      .eq('user_id', apiKey.user_id);
    return jsonResponse(
      request,
      buildNonStreamingChatCompletion(aggregate, requestId, modelName),
      200,
      {
        'X-WebToMind-Request-Id': requestId,
        'X-WebToMind-Cost-Cents': String(customerCostCents)
      }
    );
  }

  if (shouldStreamUpstreamResponse(upstreamResponse, upstreamContentType)) {
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
    const streamSettlement = (async (): Promise<void> => {
      const writer = writable.getWriter();
      const reader = upstreamResponse.body!.getReader();
      const decoder = new TextDecoder();
      let pending = '';
      let usage = { inputTokens: 0, outputTokens: 0 };
      try {
        let reading = true;
        while (reading) {
          const next = await reader.read();
          if (next.done) {
            reading = false;
            continue;
          }
          await writer.write(next.value);
          pending += decoder.decode(next.value, { stream: true });
          const lines = pending.split(/\r?\n/);
          pending = lines.pop() || '';
          for (const line of lines) usage = mergeStreamUsage(line, usage);
        }
        pending += decoder.decode();
        if (pending.trim()) usage = mergeStreamUsage(pending, usage);
        const customerCostCents = getCustomerChargeCents(
          model,
          usage,
          reserveCents,
          upstreamResponse.ok
        );
        const upstreamCostCents = Math.max(0, Math.ceil(customerCostCents / API_MARKETPLACE_MARKUP));
        const settled = await settleUsageAndQueue({
          supabase,
          requestId,
          model: modelName,
          upstreamCostCents,
          customerCostCents,
          usage,
          status: upstreamResponse.status
        });
        if (!settled.ok) {
          console.error('[ApiMarketplace] Streaming usage settlement was not acknowledged:', {
            requestId,
            model: modelName,
            status: upstreamResponse.status
          });
        } else {
          await supabase
            .from('api_keys')
            .update({ last_used_at: new Date().toISOString() })
            .eq('id', apiKey.id)
            .eq('user_id', apiKey.user_id);
        }
      } catch (error) {
        console.error('[ApiMarketplace] Streaming proxy failed:', error);
        // A client disconnect or a broken downstream writer does not prove
        // that the upstream request failed. If the upstream already returned
        // a successful response, close the ledger using the best usage seen so
        // far (or the reservation as a conservative fallback). Only refund
        // when the upstream response itself was unsuccessful.
        const customerCostCents = getCustomerChargeCents(
          model,
          usage,
          reserveCents,
          upstreamResponse.ok
        );
        const settled = await settleUsageAndQueue({
          supabase,
          requestId,
          model: modelName,
          upstreamCostCents: Math.max(0, Math.ceil(customerCostCents / API_MARKETPLACE_MARKUP)),
          customerCostCents,
          usage,
          status: upstreamResponse.status
        });
        if (!settled.ok) {
          console.error('[ApiMarketplace] Streaming fallback settlement was not acknowledged:', {
            requestId,
            model: modelName,
            status: upstreamResponse.status
          });
        }
      } finally {
        try {
          await writer.close();
        } catch {
          writer.releaseLock();
        }
      }
    })();
    // Settlement runs after the last upstream byte. Keep the invocation alive
    // for it even if the client disconnects mid-stream, otherwise the
    // reservation is left for stale recovery to refund in full.
    context?.waitUntil(streamSettlement);

    const responseHeaders = new Headers();
    responseHeaders.set('Content-Type', upstreamContentType);
    responseHeaders.set('Cache-Control', 'no-cache, no-transform');
    responseHeaders.set('X-WebToMind-Request-Id', requestId);
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    return new Response(readable, { status: upstreamResponse.status, headers: responseHeaders });
  }

  const responseText = await upstreamResponse.text();
  let responseJson: unknown = null;
  if ((upstreamResponse.headers.get('content-type') || '').includes('json')) {
    try {
      responseJson = JSON.parse(responseText);
    } catch {
      responseJson = null;
    }
  }
  const usage = responseJson ? extractUsage(responseJson) : parseStreamUsage(responseText);
  const customerCostCents = getCustomerChargeCents(
    model,
    usage,
    reserveCents,
    upstreamResponse.ok
  );
  const upstreamCostCents = Math.max(0, Math.ceil(customerCostCents / API_MARKETPLACE_MARKUP));
  const settled = await settleUsageAndQueue({
    supabase,
    requestId,
    model: modelName,
    upstreamCostCents,
    customerCostCents,
    usage,
    status: upstreamResponse.status
  });
  if (!settled.ok) {
    // The upstream request has already completed. Returning an insufficient
    // balance error would invite clients to retry and could duplicate a paid
    // operation. Keep the reservation visible to the recovery job instead.
    return jsonResponse(
      request,
      { error: { message: '本次请求已完成，账单正在核对，请稍后查询使用记录', type: 'billing_pending' } },
      503,
      {
        'X-WebToMind-Request-Id': requestId,
        'X-WebToMind-Billing-Status': 'pending'
      }
    );
  }

  await supabase
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', apiKey.id)
    .eq('user_id', apiKey.user_id);

  const responseHeaders = new Headers();
  if (!upstreamResponse.ok) {
    return jsonResponse(
      request,
      {
        error: {
          message: getSafeUpstreamErrorMessage(upstreamResponse.status),
          type: 'upstream_error'
        }
      },
      upstreamResponse.status,
      { 'X-WebToMind-Request-Id': requestId }
    );
  }
  responseHeaders.set('Content-Type', upstreamContentType || 'application/json');
  responseHeaders.set('Cache-Control', 'no-store');
  responseHeaders.set('X-WebToMind-Request-Id', requestId);
  responseHeaders.set('X-WebToMind-Cost-Cents', String(customerCostCents));
  responseHeaders.set('Access-Control-Allow-Origin', '*');
  return new Response(responseText, {
    status: upstreamResponse.status,
    headers: responseHeaders
  });
}
