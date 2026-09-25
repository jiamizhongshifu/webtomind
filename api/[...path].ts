/**
 * Vercel Serverless Function Entry
 * 直接实现 API 路由，避免跨目录导入问题
 * @version 1.2.0 - 添加 Gemini API 代理
 */

import { handle } from 'hono/vercel';
import { Hono, Context } from 'hono';
import { cors } from 'hono/cors';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { normalizeGeminiModel } from './utils/model-registry';
import { checkRateLimit } from './utils/rate-limit';
import { getAuthMeResult } from './utils/auth-me';
import { verifyTokenAndGetUserId } from './utils/auth';

// Edge Runtime 配置 - 启动更快
export const config = {
  runtime: 'edge'
};

// ============================================
// 安全常量
// ============================================

// Request body size limits
const DEFAULT_MAX_BODY_SIZE = 1 * 1024 * 1024;
const SMART_CHAT_MAX_BODY_SIZE = 12 * 1024 * 1024;


/**
 * 验证请求体大小
 */
function getMaxBodySize(c: Context): number {
  return c.req.path === '/api/agent/smart-chat'
    ? SMART_CHAT_MAX_BODY_SIZE
    : DEFAULT_MAX_BODY_SIZE;
}

function isBodySizeValid(c: Context): boolean {
  const contentLength = c.req.header('Content-Length');
  if (contentLength) {
    const size = parseInt(contentLength, 10);
    if (size > getMaxBodySize(c)) {
      return false;
    }
  }
  return true;
}

// 加载环境变量
const ALLOWED_ORIGINS = (
  process.env.ALLOWED_ORIGINS ||
  'https://webtomind.com,https://www.webtomind.com,chrome-extension://<your-extension-id>'
)
  .split(',')
  .map((s) => s.trim().replace(/\/+$/, ''));

function normalizeOrigin(origin: string | undefined): string {
  return (origin || '').trim().replace(/\/+$/, '');
}

function matchesAllowedOrigin(origin: string, pattern: string): boolean {
  if (!origin || !pattern) return false;

  if (pattern.includes('*')) {
    const escaped = pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*');
    return new RegExp(`^${escaped}$`, 'i').test(origin);
  }

  return pattern === origin;
}

function isDebugAccessAllowed(c: Context):
  | {
    allowed: boolean;
    status: 401 | 403;
    body: { error: string; hint: string };
  }
  | { allowed: true } {
  const isDev = process.env.NODE_ENV !== 'production';
  const debugSecret = process.env.DEBUG_SECRET;
  const providedSecret = c.req.header('X-Debug-Secret');

  if (isDev && !debugSecret) return { allowed: true };

  if (!debugSecret) {
    return {
      allowed: false,
      status: 403,
      body: {
        error: 'Debug endpoint disabled in production',
        hint: 'Set DEBUG_SECRET to enable controlled access'
      }
    };
  }

  if (providedSecret !== debugSecret) {
    return {
      allowed: false,
      status: 401,
      body: {
        error: 'Unauthorized',
        hint: 'Provide X-Debug-Secret header'
      }
    };
  }

  return { allowed: true };
}

// 创建 Hono 应用
const app = new Hono().basePath('/api');

// ============================================
// Supabase 客户端
// ============================================

let supabase: SupabaseClient | null = null;

function getSupabase(): SupabaseClient | null {
  if (!supabase) {
    const url = process.env.SUPABASE_URL;
    const key =
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

    if (!url || !key) {
      console.warn('[API] Supabase not configured');
      return null;
    }

    supabase = createClient(url, key);
  }
  return supabase;
}

// ============================================
// 中间件
// ============================================

// CORS
app.use(
  '*',
  cors({
    origin: (origin) => {
      const normalizedOrigin = normalizeOrigin(origin);
      if (!normalizedOrigin)
        return ALLOWED_ORIGINS[0] || 'https://webtomind.com';
      if (
        ALLOWED_ORIGINS.some((allowed) =>
          matchesAllowedOrigin(normalizedOrigin, allowed)
        )
      ) {
        return normalizedOrigin;
      }
      if (
        process.env.NODE_ENV !== 'production' &&
        (normalizedOrigin.includes('localhost') ||
          normalizedOrigin.includes('127.0.0.1'))
      ) {
        return normalizedOrigin;
      }
      return null;
    },
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: [
      'Content-Type',
      'Authorization',
      'X-Session-ID',
      'X-Debug-Secret'
    ],
    exposeHeaders: ['X-Session-ID'],
    maxAge: 86400,
    credentials: true
  })
);

// 请求体大小验证中间件
app.use('*', async (c, next) => {
  if (['POST', 'PATCH', 'PUT'].includes(c.req.method)) {
    if (!isBodySizeValid(c)) {
      return c.json({ error: '请求体过大' }, 413);
    }
  }
  await next();
});

// 速率限制中间件
app.use('*', async (c, next) => {
  // 使用 IP 或用户 ID 作为标识符
  const forwardedFor = c.req.header('X-Forwarded-For');
  const clientIp = forwardedFor ? forwardedFor.split(',')[0]?.trim() : null;
  const ip =
    c.req.header('CF-Connecting-IP') ||
    clientIp ||
    'unknown';
  const { allowed, remaining } = await checkRateLimit(ip);

  c.header('X-RateLimit-Remaining', String(remaining));

  if (!allowed) {
    return c.json({ error: '请求过于频繁，请稍后再试' }, 429);
  }

  await next();
});

// ============================================
// 辅助函数：从请求头获取用户ID
// ============================================

async function getUserIdFromRequest(c: Context): Promise<string | null> {
  const authHeader = c.req.header('Authorization');
  if (!authHeader) return null;
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null;
  return verifyTokenAndGetUserId(parts[1]);
}

// ============================================
// 路由：健康检查
// ============================================

// 最简单的健康检查，不调用任何外部服务
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    version: '1.2.3',
    timestamp: new Date().toISOString(),
    runtime: 'edge'
  });
});

// 带 Supabase 状态的健康检查
app.get('/health/full', (c) => {
  return c.json({
    status: 'ok',
    version: '1.2.3',
    timestamp: new Date().toISOString(),
    runtime: 'edge',
    supabase: !!getSupabase(),
    env: {
      hasSupabaseUrl: !!process.env.SUPABASE_URL,
      hasSupabaseKey:
        !!process.env.SUPABASE_SERVICE_ROLE_KEY ||
        !!process.env.SUPABASE_ANON_KEY,
      hasGeminiKey: !!process.env.GEMINI_API_KEY
    }
  });
});

// ============================================
// 路由：公开配置
// ============================================

// 返回插件端需要的公开配置（如 Supabase anon key）
// 注意：只返回公开的、安全的配置信息
app.get('/config', (c) => {
  const supabaseUrl =
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const supabaseAnonKey =
    process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

  return c.json(
    {
      supabase: {
        url: supabaseUrl,
        anonKey: supabaseAnonKey
      }
    },
    200,
    {
      'Cache-Control': 'public, max-age=3600' // 缓存1小时
    }
  );
});

// ============================================
// 路由：AI - Gemini 代理
// ============================================

// Gemini API 代理 - 生成内容
app.post('/ai/gemini/generate', async (c) => {
  const userId = await getUserIdFromRequest(c);
  if (!userId) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return c.json({ error: 'Gemini API key not configured' }, 500);
  }

  try {
    const body = await c.req.json();
    const { model, contents, generationConfig, safetySettings } = body;

    const modelName = normalizeGeminiModel(model);
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`;

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        contents,
        generationConfig,
        safetySettings
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Gemini Proxy] Error:', response.status, errorText);
      return c.json(
        {
          error: 'Gemini API error',
          status: response.status
          // 安全修复：不暴露内部错误详情给客户端
        },
        500
      );
    }

    const data = await response.json();
    return c.json(data);
  } catch (error: unknown) {
    console.error('[Gemini Proxy] Error:', error);
    return c.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      500
    );
  }
});

// Gemini API 代理 - 流式生成（SSE）
app.post('/ai/gemini/stream', async (c) => {
  const userId = await getUserIdFromRequest(c);
  if (!userId) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return c.json({ error: 'Gemini API key not configured' }, 500);
  }

  try {
    const body = await c.req.json();
    const { model, contents, generationConfig, safetySettings } = body;

    const modelName = normalizeGeminiModel(model);
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:streamGenerateContent?alt=sse`;

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        contents,
        generationConfig,
        safetySettings
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Gemini Proxy Stream] Error:', response.status, errorText);
      return c.json(
        {
          error: 'Gemini API error',
          status: response.status
          // 安全修复：不暴露内部错误详情给客户端
        },
        500
      );
    }

    // 转发流式响应
    return new Response(response.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive'
      }
    });
  } catch (error: unknown) {
    console.error('[Gemini Proxy Stream] Error:', error);
    return c.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      500
    );
  }
});

// ============================================
// 路由：Workspace - Tasks（技能执行）
// 注意：已迁移至独立 Node.js Function api/workspace/tasks/index.ts
// 通过 OpenAgent SDK + GLM-5 统一执行，Vercel 路由优先匹配独立文件
// 其他 /api/workspace/* 生产流量由 Cloudflare Worker 本地路由接管。
// ============================================

// ============================================
// 路由：Auth - 用户认证
// ============================================

// 获取当前用户信息
app.get('/auth/me', async (c) => {
  const result = await getAuthMeResult(c.req.header('Authorization') || null);
  return c.json(result.body, result.status as 200 | 401 | 500);
});

// ============================================
// 路由：Debug - Agent 诊断
// ============================================

function getTuziOmniSmokeSecret(c: Context): string {
  const header =
    c.req.header('x-cron-secret') || c.req.header('x-debug-secret') || '';
  if (header) return header;

  const authorization = c.req.header('authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || '';
}

type TuziOmniSmokePayload = {
  taskId?: string;
  model?: string;
  prompt?: string;
  seconds?: string | number;
  size?: string;
  watermark?: boolean;
};

async function readTuziOmniSmokePayload(c: Context): Promise<TuziOmniSmokePayload> {
  const text = await c.req.text().catch(() => '');
  if (!text.trim()) return {};
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as TuziOmniSmokePayload)
      : {};
  } catch {
    return {};
  }
}

function getTuziSmokeString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function getTuziSmokeRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function parseTuziSmokeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function extractTuziSmokeTaskId(raw: unknown): string | undefined {
  const record = getTuziSmokeRecord(raw);
  const data = getTuziSmokeRecord(record?.data) || record;
  const result = getTuziSmokeRecord(data?.result) || getTuziSmokeRecord(record?.result);
  const output = getTuziSmokeRecord(data?.output) || result || data;
  return (
    getTuziSmokeString(data?.id) ||
    getTuziSmokeString(data?.task_id) ||
    getTuziSmokeString(data?.taskId) ||
    getTuziSmokeString(output?.id) ||
    getTuziSmokeString(output?.task_id) ||
    getTuziSmokeString(output?.taskId) ||
    getTuziSmokeString(record?.id) ||
    getTuziSmokeString(record?.task_id)
  );
}

function extractTuziSmokeStatus(raw: unknown): string | undefined {
  const record = getTuziSmokeRecord(raw);
  const data = getTuziSmokeRecord(record?.data) || record;
  return (
    getTuziSmokeString(data?.status) ||
    getTuziSmokeString(data?.state) ||
    getTuziSmokeString(record?.status)
  );
}

type TuziSmokeApiKeyCandidate = {
  source: string;
  apiKey: string;
  baseUrl: string;
};

function pushTuziSmokeApiKeyCandidate(
  candidates: TuziSmokeApiKeyCandidate[],
  source: string,
  apiKey: string | undefined,
  baseUrl: string
): void {
  const trimmedKey = apiKey?.trim();
  if (!trimmedKey || candidates.some((candidate) => candidate.apiKey === trimmedKey)) {
    return;
  }
  candidates.push({
    source,
    apiKey: trimmedKey,
    baseUrl: baseUrl.replace(/\/+$/, '')
  });
}

function getTuziSmokeApiKeyCandidates(defaultBaseUrl: string): TuziSmokeApiKeyCandidate[] {
  const candidates: TuziSmokeApiKeyCandidate[] = [];
  pushTuziSmokeApiKeyCandidate(
    candidates,
    'video',
    process.env.TUZI_VIDEO_API_KEY,
    defaultBaseUrl
  );
  pushTuziSmokeApiKeyCandidate(
    candidates,
    'default',
    process.env.TUZI_API_KEY,
    defaultBaseUrl
  );
  pushTuziSmokeApiKeyCandidate(
    candidates,
    'official_discount',
    process.env.TUZI_OFFICIAL_DISCOUNT_API_KEY,
    process.env.TUZI_OFFICIAL_DISCOUNT_API_BASE_URL || defaultBaseUrl
  );
  pushTuziSmokeApiKeyCandidate(
    candidates,
    'official',
    process.env.TUZI_OFFICIAL_API_KEY,
    process.env.TUZI_OFFICIAL_API_BASE_URL || defaultBaseUrl
  );
  return candidates;
}

function isRetryableTuziSmokeError(status: number, raw: unknown): boolean {
  const record = getTuziSmokeRecord(raw);
  const data = getTuziSmokeRecord(record?.data);
  const error = getTuziSmokeRecord(data?.error);
  const message = [
    getTuziSmokeString(record?.message),
    getTuziSmokeString(error?.message)
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return (
    status === 429 ||
    message.includes('负载') ||
    message.includes('饱和') ||
    message.includes('rate limit') ||
    message.includes('too many requests')
  );
}

app.post('/tuzi-omni-smoke', async (c) => {
  const expectedSecret = process.env.CRON_SECRET || process.env.DEBUG_SECRET || '';
  if (!expectedSecret || getTuziOmniSmokeSecret(c) !== expectedSecret) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const baseUrl = (
    process.env.TUZI_VIDEO_API_BASE_URL ||
    process.env.TUZI_API_BASE_URL ||
    'https://api.tu-zi.com'
  ).replace(/\/+$/, '');
  const candidates = getTuziSmokeApiKeyCandidates(baseUrl);
  if (!candidates.length) {
    return c.json({ ok: false, error: 'TUZI_VIDEO_API_KEY_MISSING' }, 500);
  }
  const createPath = process.env.TUZI_VIDEO_CREATE_PATH || '/v1/videos';
  const statusTemplate = process.env.TUZI_VIDEO_STATUS_PATH_TEMPLATE || '/v1/videos/{id}';

  try {
    const payload = await readTuziOmniSmokePayload(c);
    const taskId = getTuziSmokeString(payload.taskId);
    const model = getTuziSmokeString(payload.model) || 'omni-flash';
    const prompt =
      getTuziSmokeString(payload.prompt) ||
      '一段宇宙飞船穿过星云的镜头，电影感，8 秒';
    const seconds = String(payload.seconds || '8');
    const size = getTuziSmokeString(payload.size) || '1280x720';
    const statusPath = taskId
      ? statusTemplate.replace('{id}', encodeURIComponent(taskId))
      : createPath;

    const attempts: Array<{
      source: string;
      status: number;
      ok: boolean;
      message?: string | null;
    }> = [];
    let finalRaw: unknown = null;
    let finalStatus = 500;
    let finalSource = candidates[0]?.source || null;

    for (const [index, candidate] of candidates.entries()) {
      const createBody = new FormData();
      createBody.append('model', model);
      createBody.append('prompt', prompt);
      createBody.append('seconds', seconds);
      createBody.append('size', size);
      createBody.append('watermark', String(payload.watermark ?? false));
      const upstream = await fetch(`${candidate.baseUrl}${statusPath}`, {
        method: taskId ? 'GET' : 'POST',
        headers: {
          Authorization: `Bearer ${candidate.apiKey}`
        },
        body: taskId ? undefined : createBody,
        signal: AbortSignal.timeout(60_000)
      });
      const text = await upstream.text();
      const raw = parseTuziSmokeJson(text);
      finalRaw = raw;
      finalStatus = upstream.status;
      finalSource = candidate.source;
      const record = getTuziSmokeRecord(raw);
      attempts.push({
        source: candidate.source,
        status: upstream.status,
        ok: upstream.ok,
        message: getTuziSmokeString(record?.message) || null
      });
      if (
        upstream.ok ||
        taskId ||
        index === candidates.length - 1 ||
        !isRetryableTuziSmokeError(upstream.status, raw)
      ) {
        break;
      }
    }

    const providerTaskId = taskId || extractTuziSmokeTaskId(finalRaw);
    const providerStatus = extractTuziSmokeStatus(finalRaw);
    return c.json({
      ok: finalStatus >= 200 && finalStatus < 300,
      status: finalStatus,
      mode: taskId ? 'status' : 'create',
      model,
      keySource: finalSource,
      attempts,
      taskId: providerTaskId || null,
      providerStatus: providerStatus || null,
      raw: finalStatus >= 200 && finalStatus < 300
        ? finalRaw
        : typeof finalRaw === 'string'
          ? finalRaw.slice(0, 1000)
          : finalRaw
    });
  } catch (error) {
    console.error('[TuziOmniSmoke] request failed', error);
    return c.json(
      {
        ok: false,
        error:
          error instanceof Error && error.name === 'TimeoutError'
            ? 'timeout'
            : error instanceof Error
              ? error.message
              : 'Unknown error'
      }
    );
  }
});

app.get('/debug/agent', async (c) => {
  const debugAccess = isDebugAccessAllowed(c);
  if (!debugAccess.allowed) {
    return c.json(debugAccess.body, debugAccess.status);
  }

  const checks: Array<{
    name: string;
    status: string;
    message: string;
    details?: unknown;
  }> = [];
  const recommendations: string[] = [];

  // 1. 检查 Claude API 配置
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const anthropicToken = process.env.ANTHROPIC_AUTH_TOKEN;
  const anthropicBaseUrl = process.env.ANTHROPIC_BASE_URL;
  const anthropicModel =
    process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';

  if (anthropicToken && anthropicBaseUrl) {
    checks.push({
      name: 'Claude API (第三方代理)',
      status: 'ok',
      message: `使用第三方代理: ${anthropicBaseUrl}`,
      details: {
        baseUrl: anthropicBaseUrl,
        model: anthropicModel
      }
    });
  } else if (anthropicKey?.startsWith('sk-ant-')) {
    checks.push({
      name: 'Claude API (原生)',
      status: 'ok',
      message: '使用 Anthropic 原生 API'
    });
  } else {
    checks.push({
      name: 'Claude API',
      status: 'error',
      message: '未配置有效的 Claude API 凭证'
    });
    recommendations.push('设置 ANTHROPIC_AUTH_TOKEN + ANTHROPIC_BASE_URL');
  }

  // 2. 检查 Gemini 备选
  const googleKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  if (googleKey) {
    checks.push({
      name: 'Gemini API (备选)',
      status: 'ok',
      message: 'Gemini API 已配置'
    });
  } else {
    checks.push({
      name: 'Gemini API (备选)',
      status: 'warning',
      message: '未配置 Gemini API'
    });
  }

  // 3. 检查 NotebookLM Worker
  const workerUrl = process.env.NLM_WORKER_URL;
  if (workerUrl) {
    try {
      const healthRes = await fetch(`${workerUrl}/health`, {
        signal: AbortSignal.timeout(10000)
      });
      const health = (await healthRes.json()) as {
        status: string;
        accounts_available?: number;
      };

      if (health.status === 'ok' && (health.accounts_available ?? 0) > 0) {
        checks.push({
          name: 'Python Worker',
          status: 'ok',
          message: `服务正常，${health.accounts_available} 个账号可用`,
          details: { workerUrl, ...health }
        });
      } else {
        checks.push({
          name: 'Python Worker',
          status: 'warning',
          message:
            health.status === 'ok'
              ? '服务运行中，但没有可用账号'
              : `服务状态: ${health.status}`,
          details: { workerUrl, ...health }
        });
      }
    } catch (error: unknown) {
      checks.push({
        name: 'Python Worker',
        status: 'error',
        message: `无法连接: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: { workerUrl }
      });
      recommendations.push('请确认 Python Worker 已启动');
    }
  } else {
    checks.push({
      name: 'Python Worker',
      status: 'error',
      message: '未配置 NLM_WORKER_URL'
    });
    recommendations.push('设置 NLM_WORKER_URL 环境变量');
  }

  // 4. 检查 Supabase
  const sb = getSupabase();
  checks.push({
    name: 'Supabase',
    status: sb ? 'ok' : 'error',
    message: sb ? '已配置' : '未配置'
  });

  const hasError = checks.some((c) => c.status === 'error');
  const hasWarning = checks.some((c) => c.status === 'warning');

  return c.json({
    timestamp: new Date().toISOString(),
    runtime: 'edge',
    checks,
    recommendations,
    overallStatus: hasError ? 'error' : hasWarning ? 'warning' : 'ok'
  });
});

// ============================================
// 404 处理
// ============================================

app.notFound((c) => {
  return c.json({ error: 'Not Found', path: c.req.path }, 404);
});

// ============================================
// 错误处理
// ============================================

app.onError((err, c) => {
  // 只在服务端日志记录详细错误，不暴露给客户端
  console.error('[Vercel API Error]', err);
  return c.json(
    {
      error: 'Internal Server Error'
      // 安全修复：不暴露错误详情给客户端
    },
    500
  );
});

// 导出 Vercel handler
export default handle(app);

// 导出 HTTP 方法（Vercel 需要）
export const GET = handle(app);
export const POST = handle(app);
export const PATCH = handle(app);
export const DELETE = handle(app);
export const OPTIONS = handle(app);
