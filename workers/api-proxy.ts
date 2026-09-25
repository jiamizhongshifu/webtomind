/**
 * Cloudflare Workers API 代理
 * 用于保护 API Key 并提供缓存功能
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { cache } from 'hono/cache';

// 环境变量类型
interface Env {
  GEMINI_API_KEY: string;
  ALLOWED_ORIGINS?: string;
  PROXY_API_KEY?: string; // 用于验证请求的 API Key
}

const app = new Hono<{ Bindings: Env }>();

// CORS 配置
app.use(
  '*',
  cors({
    origin: (origin, c) => {
      const allowedOrigins = c.env.ALLOWED_ORIGINS?.split(',') || [
        'chrome-extension://*'
      ];

      // 安全的 origin 匹配（避免正则注入）
      const isAllowed = allowedOrigins.some((allowed: string) => {
        const trimmed = allowed.trim();
        // 精确匹配
        if (trimmed === origin) return true;
        // 通配符匹配：chrome-extension://*
        if (
          trimmed === 'chrome-extension://*' &&
          origin.startsWith('chrome-extension://')
        ) {
          return true;
        }
        return false;
      });

      return isAllowed ? origin : null;
    },
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Proxy-Key'],
    maxAge: 86400
  })
);

/**
 * 验证请求的 API Key
 * 如果配置了 PROXY_API_KEY，则要求请求携带有效的 X-Proxy-Key 头
 */
function validateProxyKey(c: { req: { header: (name: string) => string | undefined }; env: Env }): boolean {
  const proxyApiKey = c.env.PROXY_API_KEY;

  // 如果没有配置 PROXY_API_KEY，跳过验证（向后兼容）
  if (!proxyApiKey) {
    return true;
  }

  const requestKey = c.req.header('X-Proxy-Key');
  return requestKey === proxyApiKey;
}

// 健康检查
app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: Date.now() });
});

/**
 * Gemini API 代理
 */
app.post('/api/gemini/generate', async (c) => {
  try {
    // 验证请求的 API Key
    if (!validateProxyKey(c)) {
      return c.json({ error: '未授权访问' }, 401);
    }

    const body = await c.req.json();

    // 验证请求
    if (!body.contents || !Array.isArray(body.contents)) {
      return c.json({ error: '无效的请求格式' }, 400);
    }

    // 选择模型
    const model = body.model || 'gemini-3.1-flash-lite-preview';

    // 调用 Gemini API
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': c.env.GEMINI_API_KEY
        },
        body: JSON.stringify({
          contents: body.contents,
          generationConfig: body.generationConfig || {}
        })
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('Gemini API 错误:', error);

      return c.json(
        {
          error: 'Gemini API 请求失败'
        },
        response.status
      );
    }

    const data = await response.json();

    // 返回结果
    return c.json(data);
  } catch (error) {
    console.error('API 代理错误:', error);

    return c.json(
      {
        error: '服务器内部错误',
        message: error instanceof Error ? error.message : '未知错误'
      },
      500
    );
  }
});

/**
 * 流式响应代理（未来支持）
 */
app.post('/api/gemini/stream', async (c) => {
  try {
    // 验证请求的 API Key
    if (!validateProxyKey(c)) {
      return c.json({ error: '未授权访问' }, 401);
    }

    const body = await c.req.json();
    const model = body.model || 'gemini-3.1-flash-lite-preview';

    // 调用 Gemini API（流式）
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': c.env.GEMINI_API_KEY
        },
        body: JSON.stringify({
          contents: body.contents,
          generationConfig: body.generationConfig || {}
        })
      }
    );

    if (!response.ok) {
      return c.json({ error: 'API 请求失败' }, response.status);
    }

    // 转发流式响应
    return new Response(response.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    });
  } catch (error) {
    console.error('流式 API 错误:', error);
    return c.json({ error: '服务器错误' }, 500);
  }
});

/**
 * 缓存代理（用于重复内容）
 */
app.post(
  '/api/gemini/cached',
  cache({
    cacheName: 'gemini-cache',
    cacheControl: 'max-age=604800' // 7天
  }),
  async (c) => {
    // 使用相同的处理逻辑
    return app.fetch(
      new Request(new URL('/api/gemini/generate', c.req.url), {
        method: 'POST',
        headers: c.req.raw.headers,
        body: c.req.raw.body
      }),
      c.env
    );
  }
);

// 404 处理
app.notFound((c) => {
  return c.json({ error: '未找到该端点' }, 404);
});

// 错误处理
app.onError((err, c) => {
  console.error('全局错误:', err);
  return c.json(
    {
      error: '服务器错误',
      message: err.message
    },
    500
  );
});

export default app;
