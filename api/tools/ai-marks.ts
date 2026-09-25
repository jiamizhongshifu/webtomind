import { getCorsHeadersForRequest, getUserIdFromRequest } from '../utils/auth';
import {
  consumeModelRateLimit,
  createModelRateLimitResponse
} from '../utils/model-rate-limit';
import {
  normalizeAiMarksServiceMode,
  type AiMarksServiceMode
} from './ai-marks-runtime';

export const config = { runtime: 'edge' };

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_REQUEST_BYTES = 30 * 1024 * 1024;
const MAX_UPSTREAM_RESPONSE_BYTES = 42 * 1024 * 1024;
const MAX_ARCHIVE_BYTES = 12 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 50_000_000;
const MAX_VISIBLE_MASK_BASE64_LENGTH = 12 * 1024 * 1024;
const STATUS_RATE_WINDOW_MS = 60_000;
const STATUS_RATE_LIMIT = 30;
const EDGE_ACTION_RATE_LIMITS = {
  inspect: 24,
  clean: 8
} as const;
const EDGE_ACTION_CONCURRENCY_LIMIT = 2;

type AiMarksAction = 'inspect' | 'clean';

export type AiMarksServiceFetch = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

export type AiMarksRateLimitCache = {
  get(key: string): Promise<string | null>;
  put(
    key: string,
    value: string,
    options?: { expirationTtl?: number }
  ): Promise<void>;
};

export type AiMarksRuntime = {
  serviceFetch?: AiMarksServiceFetch;
  publicRateLimitCache?: AiMarksRateLimitCache;
  waitUntil?: (promise: Promise<unknown>) => void;
};

const MAX_NAME_LENGTH = 240;
const CLEAN_OPTION_KEYS = new Set([
  'keep_non_ai_metadata',
  'strip_all_metadata',
  'remove_pixel',
  'remove_visible',
  'visible_mask',
  'visible_boxes',
  'visible_padding_px',
  'visible_expand_px',
  'visible_inpaint_radius',
  'visible_inpaint_method'
]);

function jsonResponse(
  data: unknown,
  corsHeaders: Record<string, string>,
  status = 200,
  cacheControl = 'no-store'
): Response {
  return Response.json(data, {
    status,
    headers: {
      ...corsHeaders,
      'Cache-Control': cacheControl
    }
  });
}

function getServiceConfig():
  | { mode: AiMarksServiceMode; url: string; apiKey: string }
  | null {
  const mode = normalizeAiMarksServiceMode(
    process.env.WATERMARKS_SERVICE_MODE
  );
  if (!mode) return null;
  const apiKey = process.env.WATERMARKS_SERVICE_API_KEY?.trim() || '';
  if (apiKey.length < 32) return null;
  const url = process.env.WATERMARKS_SERVICE_URL?.trim().replace(/\/+$/, '');
  if (mode === 'container') {
    return {
      mode,
      url: 'http://watermarks-container',
      apiKey
    };
  }
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
  } catch {
    return null;
  }
  return {
    mode,
    url,
    apiKey
  };
}

function serviceHeaders(apiKey?: string): Record<string, string> {
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
  };
}

async function fetchService(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  serviceFetch: AiMarksServiceFetch = fetch
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await serviceFetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const contentLength = Number(response.headers.get('content-length') || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_UPSTREAM_RESPONSE_BYTES) {
    const error = new Error('upstream response exceeded the safety limit');
    error.name = 'UpstreamResponseTooLargeError';
    throw error;
  }

  let text: string | null = '';
  if (!response.body) {
    text = await response.text();
  } else {
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    try {
      for (;;) {
        const result = await reader.read();
        if (result.done) break;
        if (!result.value) continue;
        totalBytes += result.value.byteLength;
        if (totalBytes > MAX_UPSTREAM_RESPONSE_BYTES) {
          await reader.cancel();
          const error = new Error('upstream response exceeded the safety limit');
          error.name = 'UpstreamResponseTooLargeError';
          throw error;
        }
        chunks.push(result.value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    text = new TextDecoder().decode(bytes);
  }
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { error: text || 'AI 标记服务返回了无法读取的响应。' };
  }
}

function getFileBytesFromBase64(value: string): number {
  return (
    Math.floor((value.length * 3) / 4) -
    (value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0)
  );
}

function isValidBase64(value: string): boolean {
  return (
    value.length > 0 &&
    value.length % 4 === 0 &&
    /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      value
    )
  );
}

function getFileExtension(name: string): string {
  return name.split('.').pop()?.toLowerCase() || '';
}

function decodeBase64Prefix(value: string, maxBytes = 64 * 1024): Uint8Array {
  const prefixLength = Math.min(value.length, Math.ceil(maxBytes / 3) * 4);
  const binary = atob(value.slice(0, prefixLength));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function readUInt16LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUInt32BE(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] << 24) |
    (bytes[offset + 1] << 16) |
    (bytes[offset + 2] << 8) |
    bytes[offset + 3]
  ) >>> 0;
}

function readImageDimensions(
  value: string
): { width: number; height: number } | null {
  let bytes: Uint8Array;
  try {
    bytes = decodeBase64Prefix(value);
  } catch {
    return null;
  }

  if (
    bytes.length >= 24 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return { width: readUInt32BE(bytes, 16), height: readUInt32BE(bytes, 20) };
  }
  if (bytes.length >= 10 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    return { width: readUInt16LE(bytes, 6), height: readUInt16LE(bytes, 8) };
  }
  if (
    bytes.length >= 30 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    const chunk = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
    if (chunk === 'VP8X') {
      return {
        width: 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)),
        height: 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16))
      };
    }
    if (chunk === 'VP8L' && bytes.length >= 25 && bytes[20] === 0x2f) {
      return {
        width: 1 + (bytes[21] | ((bytes[22] & 0x3f) << 8)),
        height: 1 + ((bytes[22] >> 6) | (bytes[23] << 2) | ((bytes[24] & 0x0f) << 10))
      };
    }
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = bytes[offset + 1];
      offset += 2;
      if (marker === 0xd8 || marker === 0xd9) continue;
      if (offset + 2 > bytes.length) break;
      const segmentLength = (bytes[offset] << 8) | bytes[offset + 1];
      if (segmentLength < 2 || offset + segmentLength > bytes.length) break;
      if (
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf)
      ) {
        return {
          width: (bytes[offset + 5] << 8) | bytes[offset + 6],
          height: (bytes[offset + 3] << 8) | bytes[offset + 4]
        };
      }
      offset += segmentLength;
    }
  }
  return null;
}

function validateFileResource(
  value: string,
  name: string,
  fileBytes: number
): string | null {
  const extension = getFileExtension(name);
  const archiveLikeExtensions = new Set([
    'docx',
    'epub',
    'odt',
    'ods',
    'odp',
    'pptx',
    'xlsx',
    'zip'
  ]);
  if (archiveLikeExtensions.has(extension) && fileBytes > MAX_ARCHIVE_BYTES) {
    return 'Office、EPUB 或压缩包文件请控制在 12 MB 以内。';
  }

  if (extension === 'pdf' && fileBytes > MAX_ARCHIVE_BYTES) {
    return 'PDF 文件请控制在 12 MB 以内。';
  }

  const imageExtensions = new Set([
    'avif',
    'bmp',
    'gif',
    'heic',
    'jpeg',
    'jpg',
    'png',
    'tif',
    'tiff',
    'webp'
  ]);
  if (imageExtensions.has(extension)) {
    const dimensions = readImageDimensions(value);
    if (
      dimensions &&
      (dimensions.width < 1 ||
        dimensions.height < 1 ||
        dimensions.width * dimensions.height > MAX_IMAGE_PIXELS)
    ) {
      return '图片像素尺寸过大，请先缩小后重试。';
    }
  }
  return null;
}

async function readRequestText(
  request: Request,
  maxBytes: number
): Promise<string | null> {
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > maxBytes) return null;

  if (!request.body) {
    const text = await request.text();
    return new TextEncoder().encode(text).byteLength > maxBytes ? null : text;
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  let done = false;
  try {
    while (!done) {
      const result = await reader.read();
      done = result.done;
      if (done || !result.value) break;
      const value = result.value;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

type RateLimitEntry = { windowStartedAt: number; count: number };
const edgeRateLimits = new Map<string, RateLimitEntry>();
let activeOperations = 0;
let statusRefresh: Promise<{ payload: unknown; ok: boolean }> | null = null;

function getClientKey(request: Request): string {
  return (
    request.headers.get('CF-Connecting-IP')?.trim().slice(0, 64) ||
    'anonymous'
  );
}

async function consumeEdgeRateLimit(
  request: Request,
  bucket: string,
  maxRequests: number,
  cache?: AiMarksRateLimitCache,
  now = Date.now()
): Promise<boolean> {
  const key = `${getClientKey(request)}:${bucket}`;
  const current = edgeRateLimits.get(key);
  if (!current || now - current.windowStartedAt >= STATUS_RATE_WINDOW_MS) {
    edgeRateLimits.set(key, { windowStartedAt: now, count: 1 });
    if (edgeRateLimits.size > 2_000) {
      for (const [entryKey, entry] of edgeRateLimits) {
        if (now - entry.windowStartedAt >= STATUS_RATE_WINDOW_MS) {
          edgeRateLimits.delete(entryKey);
        }
      }
    }
  } else {
    if (current.count >= maxRequests) return false;
    current.count += 1;
  }

  if (!cache) return true;
  try {
    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(getClientKey(request))
    );
    const hash = Array.from(new Uint8Array(digest))
      .map((value) => value.toString(16).padStart(2, '0'))
      .join('');
    const window = Math.floor(now / STATUS_RATE_WINDOW_MS);
    const cacheKey = `ai-marks-rate:${bucket}:${window}:${hash}`;
    const existing = Number(await cache.get(cacheKey) || 0);
    if (existing >= maxRequests) return false;
    await cache.put(cacheKey, String(existing + 1), { expirationTtl: 65 });
  } catch {
    // The local per-isolate limiter remains active if KV is temporarily unavailable.
  }
  return true;
}

function getStatusCacheKey(request: Request): Request {
  const url = new URL(request.url);
  url.pathname = '/__webtomind-cache/ai-marks-status';
  // Bump when the upstream/container capability contract changes so a deploy
  // cannot keep serving the previous capability payload from Cache API.
  url.search = '?v=2';
  return new Request(url.toString(), { method: 'GET' });
}

function getDefaultCache(): Cache | null {
  const cacheStorage = (
    globalThis as typeof globalThis & {
      caches?: CacheStorage & { default?: Cache };
    }
  ).caches;
  return cacheStorage?.default || null;
}

function withStatusCors(response: Response, request: Request): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(getCorsHeadersForRequest(request))) {
    headers.set(key, value);
  }
  headers.set('Vary', 'Origin');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

async function readCachedStatus(request: Request): Promise<Response | null> {
  const cache = getDefaultCache();
  if (!cache) return null;
  try {
    const response = await cache.match(getStatusCacheKey(request));
    return response ? withStatusCors(response, request) : null;
  } catch {
    return null;
  }
}

function writeCachedStatus(
  response: Response,
  request: Request,
  runtime: AiMarksRuntime
): void {
  const cache = getDefaultCache();
  if (!cache || response.status !== 200) return;
  const write = cache
    .put(getStatusCacheKey(request), response.clone())
    .catch(() => undefined);
  if (runtime.waitUntil) runtime.waitUntil(write);
  else void write;
}

function hasControlCharacters(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 0x1f || code === 0x7f;
  });
}

function getCleanOptions(
  value: unknown
):
  | { ok: true; options: Record<string, unknown> }
  | { ok: false; error: string } {
  if (value === undefined) return { ok: true, options: {} };
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, error: 'options 必须是对象。' };
  }

  const options = value as Record<string, unknown>;
  if (Object.keys(options).some((key) => !CLEAN_OPTION_KEYS.has(key))) {
    return { ok: false, error: 'options 包含不支持的字段。' };
  }
  if (
    Object.entries(options).some(([key, optionValue]) => {
      if (key === 'remove_pixel') {
        return optionValue !== 'ctrlregen' && optionValue !== 'diffusion';
      }
      if (key === 'remove_visible') return typeof optionValue !== 'boolean';
      if (key === 'visible_mask') {
        return (
          typeof optionValue !== 'string' ||
          optionValue.length > MAX_VISIBLE_MASK_BASE64_LENGTH
        );
      }
      if (key === 'visible_boxes') {
        return (
          !Array.isArray(optionValue) ||
          optionValue.length > 8 ||
          optionValue.some((box) => {
            if (!box || typeof box !== 'object' || Array.isArray(box)) return true;
            const candidate = box as Record<string, unknown>;
            const hasInvalidNumber = ['x', 'y', 'width', 'height'].some((field) => {
              const number = candidate[field];
              return (
                typeof number !== 'number' ||
                !Number.isFinite(number) ||
                number < 0 ||
                number > 1
              );
            });
            return (
              hasInvalidNumber ||
              Number(candidate.width) <= 0 ||
              Number(candidate.height) <= 0 ||
              Number(candidate.x) + Number(candidate.width) > 1 ||
              Number(candidate.y) + Number(candidate.height) > 1
            );
          })
        );
      }
      if (key === 'visible_padding_px') {
        return (
          typeof optionValue !== 'number' ||
          !Number.isInteger(optionValue) ||
          optionValue < 0 ||
          optionValue > 32
        );
      }
      if (key === 'visible_expand_px') {
        return (
          typeof optionValue !== 'number' ||
          !Number.isInteger(optionValue) ||
          optionValue < 0 ||
          optionValue > 32
        );
      }
      if (key === 'visible_inpaint_radius') {
        return (
          typeof optionValue !== 'number' ||
          !Number.isFinite(optionValue) ||
          optionValue <= 0 ||
          optionValue > 15
        );
      }
      if (key === 'visible_inpaint_method') {
        return optionValue !== 'telea' && optionValue !== 'ns';
      }
      return typeof optionValue !== 'boolean';
    })
  ) {
    return { ok: false, error: 'options 包含无效值。' };
  }

  const hasVisibleMask =
    typeof options.visible_mask === 'string' && options.visible_mask.length > 0;
  const hasVisibleBoxes =
    Array.isArray(options.visible_boxes) && options.visible_boxes.length > 0;
  if (options.remove_visible === true && !hasVisibleMask && !hasVisibleBoxes) {
    return { ok: false, error: '可见水印清理需要 visible_mask 或 visible_boxes。' };
  }

  return { ok: true, options };
}

function getUpstreamResponseStatus(response: Response): number {
  if (response.ok) return 200;
  if (
    response.status >= 400 &&
    response.status < 500 &&
    response.status !== 401 &&
    response.status !== 403
  ) {
    return response.status;
  }
  return 502;
}

function getAction(value: unknown): AiMarksAction | null {
  return value === 'inspect' || value === 'clean' ? value : null;
}

export async function handleAiMarksRequest(
  request: Request,
  runtime: AiMarksRuntime = {}
): Promise<Response> {
  const corsHeaders = getCorsHeadersForRequest(request);
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const service = getServiceConfig();
  const serviceFetch = runtime.serviceFetch || fetch;
  if (!service) {
    return jsonResponse(
      {
        ok: false,
        code: 'AI_MARKS_SERVICE_NOT_CONFIGURED',
        error:
          'AI 标记服务未配置。请配置 Cloudflare Container 或 WATERMARKS_SERVICE_URL。'
      },
      corsHeaders,
      503
    );
  }

  if (request.method === 'GET') {
    if (
      !(await consumeEdgeRateLimit(
        request,
        'ai_marks_status',
        STATUS_RATE_LIMIT,
        runtime.publicRateLimitCache
      ))
    ) {
      return jsonResponse(
        {
          ok: false,
          code: 'AI_MARKS_STATUS_RATE_LIMITED',
          error: '状态检查过于频繁，请稍后重试。'
        },
        corsHeaders,
        429,
        'public, max-age=5'
      );
    }

    const cached = await readCachedStatus(request);
    if (cached) return cached;

    const loadStatus = async (): Promise<{ payload: unknown; ok: boolean }> => {
      const [healthResponse, capabilitiesResponse] = await Promise.all([
        fetchService(
          `${service.url}/health`,
          {
            headers: serviceHeaders(service.apiKey)
          },
          8_000,
          serviceFetch
        ),
        fetchService(
          `${service.url}/capabilities`,
          {
            headers: serviceHeaders(service.apiKey)
          },
          8_000,
          serviceFetch
        )
      ]);
      const health = await readJsonResponse(healthResponse);
      const capabilities = await readJsonResponse(capabilitiesResponse);
      if (!healthResponse.ok || !capabilitiesResponse.ok) {
        return {
          ok: false,
          payload: {
            ok: false,
            code: healthResponse.ok
              ? 'AI_MARKS_SERVICE_DEGRADED'
              : 'AI_MARKS_SERVICE_UNHEALTHY',
            error: healthResponse.ok
              ? 'AI 标记服务能力检查失败。'
              : 'AI 标记服务当前不可用。',
            health,
            capabilities
          }
        };
      }
      return {
        ok: true,
        payload: { ok: true, health, capabilities }
      };
    };

    const currentRefresh =
      statusRefresh || (statusRefresh = loadStatus().catch((error) => ({
        ok: false,
        payload: {
          ok: false,
          code:
            error instanceof Error &&
            error.name === 'UpstreamResponseTooLargeError'
              ? 'AI_MARKS_SERVICE_RESPONSE_TOO_LARGE'
              : error instanceof Error && error.name === 'AbortError'
                ? 'AI_MARKS_SERVICE_UNREACHABLE'
                : 'AI_MARKS_SERVICE_UNREACHABLE',
          error:
            error instanceof Error && error.name === 'AbortError'
              ? 'AI 标记服务响应超时。'
              : 'AI 标记服务无法连接。'
        }
      })));
    try {
      const result = await currentRefresh;
      const status = result.ok ? 200 : 502;
      const cacheControl = result.ok
        ? 'public, max-age=15, stale-while-revalidate=30'
        : 'public, max-age=5';
      const response = jsonResponse(
        result.payload,
        corsHeaders,
        status,
        cacheControl
      );
      if (result.ok) writeCachedStatus(response, request, runtime);
      return response;
    } finally {
      if (statusRefresh === currentRefresh) statusRefresh = null;
    }
  }

  if (request.method !== 'POST') {
    return jsonResponse(
      { ok: false, error: 'Method not allowed' },
      corsHeaders,
      405
    );
  }

  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return jsonResponse(
      {
        ok: false,
        code: 'AUTH_REQUIRED',
        error: '请先登录后再使用 AI 标记清理。'
      },
      corsHeaders,
      401
    );
  }

  let bodyText: string | null;
  try {
    bodyText = await readRequestText(request, MAX_REQUEST_BYTES);
  } catch {
    return jsonResponse(
      { ok: false, error: '请求体读取失败，请稍后重试。' },
      corsHeaders,
      400
    );
  }
  if (bodyText === null) {
    return jsonResponse(
      { ok: false, error: '文件请求过大，请控制在 20 MB 以内。' },
      corsHeaders,
      413
    );
  }

  let body: Record<string, unknown>;
  try {
    const parsed = JSON.parse(bodyText) as unknown;
    body =
      parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
  } catch {
    return jsonResponse(
      { ok: false, error: '请求体不是有效的 JSON。' },
      corsHeaders,
      400
    );
  }
  const action = getAction(body?.action);
  const file = typeof body?.file === 'string' ? body.file : '';
  const name = typeof body?.name === 'string' ? body.name.trim() : '';

  if (!action || !file || !name) {
    return jsonResponse(
      { ok: false, error: 'action、file 和 name 都是必填项。' },
      corsHeaders,
      400
    );
  }
  if (name.length > MAX_NAME_LENGTH || hasControlCharacters(name)) {
    return jsonResponse(
      { ok: false, error: '文件名过长或包含不可用字符。' },
      corsHeaders,
      400
    );
  }
  if (!isValidBase64(file)) {
    return jsonResponse(
      { ok: false, error: '文件内容不是有效的 Base64。' },
      corsHeaders,
      400
    );
  }
  if (getFileBytesFromBase64(file) > MAX_FILE_BYTES) {
    return jsonResponse(
      { ok: false, error: '文件超过 20 MB，请先压缩后重试。' },
      corsHeaders,
      413
    );
  }
  const fileBytes = getFileBytesFromBase64(file);
  const resourceError = validateFileResource(file, name, fileBytes);
  if (resourceError) {
    return jsonResponse({ ok: false, error: resourceError }, corsHeaders, 413);
  }

  if (
    !(await consumeEdgeRateLimit(
      request,
      `ai_marks_${action}`,
      EDGE_ACTION_RATE_LIMITS[action],
      runtime.publicRateLimitCache
    ))
  ) {
    return createModelRateLimitResponse(
      {
        allowed: false,
        status: 429,
        retryAfter: 60,
        remaining: 0,
        error: 'EDGE_RATE_LIMITED'
      },
      corsHeaders
    );
  }

  const rateLimit = await consumeModelRateLimit({
    userId,
    bucket: action === 'clean' ? 'ai_marks_clean' : 'ai_marks_inspect',
    maxRequests: action === 'clean' ? 4 : 12
  });
  if (!rateLimit.allowed) {
    return createModelRateLimitResponse(rateLimit, corsHeaders);
  }

  const upstreamBody: Record<string, unknown> = { file, name };
  if (action === 'clean') {
    const cleanOptions = getCleanOptions(body?.options);
    if (!cleanOptions.ok) {
      return jsonResponse(
        { ok: false, error: cleanOptions.error },
        corsHeaders,
        400
      );
    }
    upstreamBody.options = cleanOptions.options;
  }

  if (activeOperations >= EDGE_ACTION_CONCURRENCY_LIMIT) {
    return createModelRateLimitResponse(
      {
        allowed: false,
        status: 429,
        retryAfter: 15,
        remaining: 0,
        error: 'AI_MARKS_BUSY'
      },
      corsHeaders
    );
  }
  activeOperations += 1;

  try {
    const upstreamResponse = await fetchService(
      `${service.url}/${action}`,
      {
        method: 'POST',
        headers: serviceHeaders(service.apiKey),
        body: JSON.stringify(upstreamBody)
      },
      action === 'clean' ? 90_000 : 30_000,
      serviceFetch
    );
    const payload = await readJsonResponse(upstreamResponse);
    return jsonResponse(
      payload,
      corsHeaders,
      getUpstreamResponseStatus(upstreamResponse)
    );
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        code: 'AI_MARKS_SERVICE_REQUEST_FAILED',
        error:
          error instanceof Error && error.name === 'AbortError'
            ? action === 'clean'
              ? 'AI 标记清理超过 90 秒仍未完成，请稍后重试。'
              : 'AI 标记检查超过 30 秒仍未完成，请稍后重试。'
            : 'AI 标记服务请求失败，请稍后重试。'
      },
      corsHeaders,
      502
    );
  } finally {
    activeOperations = Math.max(0, activeOperations - 1);
  }
}

export default handleAiMarksRequest;
