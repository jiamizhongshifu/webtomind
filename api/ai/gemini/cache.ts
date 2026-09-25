/**
 * Gemini Context Caching 服务
 * 用于缓存大型参考内容，减少重复 token 消耗
 *
 * 使用场景：
 * - 用户选择多个素材作为参考时，缓存素材内容
 * - 后续对话复用缓存，降低成本 60-75%
 */

import {
  getUserIdFromRequest,
  getCorsHeadersForRequest
} from '../../utils/auth';
import {
  createAiProviderUsageTiming,
  estimateTokensFromText,
  recordAiProviderUsage
} from '../../utils/ai-provider-usage';

export const config = {
  runtime: 'edge',
  regions: ['iad1']
};

// 安全修复：验证 cacheName 格式，防止路径遍历
const CACHE_NAME_PATTERN = /^cachedContents\/[a-zA-Z0-9_-]+$/;

function isValidCacheName(cacheName: string): boolean {
  return CACHE_NAME_PATTERN.test(cacheName);
}

interface CacheCreateRequest {
  content: string;
  displayName?: string;
  ttlSeconds?: number;
  systemInstruction?: string;
}

interface CacheResponse {
  name: string;
  displayName: string;
  createTime: string;
  expireTime: string;
  usageMetadata?: {
    totalTokenCount: number;
  };
}

interface GeminiGenerateResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
  };
}

/**
 * 创建上下文缓存
 */
async function createCache(
  apiKey: string,
  request: CacheCreateRequest
): Promise<CacheResponse> {
  const apiUrl =
    'https://generativelanguage.googleapis.com/v1beta/cachedContents';

  const ttl = request.ttlSeconds || 3600; // 默认 1 小时

  const body = {
    model: 'models/gemini-3.5-flash',
    displayName: request.displayName || `cache-${Date.now()}`,
    contents: [
      {
        role: 'user',
        parts: [{ text: request.content }]
      }
    ],
    ttl: `${ttl}s`,
    ...(request.systemInstruction && {
      systemInstruction: {
        parts: [{ text: request.systemInstruction }]
      }
    })
  };

  console.log('[GeminiCache] Creating cache:', {
    displayName: body.displayName,
    contentLength: request.content.length,
    ttl: body.ttl
  });

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('[GeminiCache] Create cache error:', response.status, error);
    throw new Error(`Failed to create cache: ${response.status}`);
  }

  const result = (await response.json()) as CacheResponse;
  console.log('[GeminiCache] Cache created:', {
    name: result.name,
    expireTime: result.expireTime,
    tokenCount: result.usageMetadata?.totalTokenCount
  });

  return result;
}

/**
 * 获取缓存信息
 */
async function getCache(
  apiKey: string,
  cacheName: string
): Promise<CacheResponse | null> {
  // 安全修复：验证 cacheName 格式
  if (!isValidCacheName(cacheName)) {
    throw new Error('Invalid cache name format');
  }

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/${cacheName}`;

  const response = await fetch(apiUrl, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey
    }
  });

  if (!response.ok) {
    if (response.status === 404) {
      return null;
    }
    const error = await response.text();
    console.error('[GeminiCache] Get cache error:', response.status, error);
    throw new Error(`Failed to get cache: ${response.status}`);
  }

  return (await response.json()) as CacheResponse;
}

/**
 * 删除缓存
 */
async function deleteCache(apiKey: string, cacheName: string): Promise<void> {
  // 安全修复：验证 cacheName 格式
  if (!isValidCacheName(cacheName)) {
    throw new Error('Invalid cache name format');
  }

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/${cacheName}`;

  const response = await fetch(apiUrl, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey
    }
  });

  if (!response.ok && response.status !== 404) {
    const error = await response.text();
    console.error('[GeminiCache] Delete cache error:', response.status, error);
    throw new Error(`Failed to delete cache: ${response.status}`);
  }

  console.log('[GeminiCache] Cache deleted:', cacheName);
}

/**
 * 使用缓存生成内容
 */
async function generateWithCache(
  apiKey: string,
  cacheName: string,
  prompt: string,
  userId?: string
): Promise<{
  text: string;
  usage: { inputTokens: number; outputTokens: number };
}> {
  const model = 'gemini-3.5-flash';
  const apiUrl =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const timing = createAiProviderUsageTiming();

  const body = {
    cachedContent: cacheName,
    contents: [
      {
        role: 'user',
        parts: [{ text: prompt }]
      }
    ],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 4096,
      thinkingConfig: { thinkingBudget: 0 }
    }
  };

  console.log('[GeminiCache] Generating with cache:', {
    cacheName,
    promptLength: prompt.length
  });

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('[GeminiCache] Generate error:', response.status, error);
    await recordAiProviderUsage({
      userId,
      provider: 'gemini',
      model,
      endpoint: 'generateContent',
      source: 'gemini_cache_generate',
      status: 'failed',
      promptChars: prompt.length,
      inputTokens: estimateTokensFromText(prompt),
      tokenUsageSource: 'estimated',
      latencyMs: timing.mark(),
      startedAt: timing.startedAt,
      errorMessage: `Failed to generate with cache: ${response.status} ${error.slice(0, 500)}`,
      metadata: { cacheName }
    });
    throw new Error(`Failed to generate with cache: ${response.status}`);
  }

  const result = (await response.json()) as GeminiGenerateResponse;
  const text = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
  await recordAiProviderUsage({
    userId,
    provider: 'gemini',
    model,
    endpoint: 'generateContent',
    source: 'gemini_cache_generate',
    status: 'succeeded',
    promptChars: prompt.length,
    responseChars: text.length,
    inputTokens: result.usageMetadata?.promptTokenCount || 0,
    outputTokens: result.usageMetadata?.candidatesTokenCount || 0,
    tokenUsageSource: 'provider',
    latencyMs: timing.mark(),
    startedAt: timing.startedAt,
    metadata: { cacheName }
  });

  return {
    text,
    usage: {
      inputTokens: result.usageMetadata?.promptTokenCount || 0,
      outputTokens: result.usageMetadata?.candidatesTokenCount || 0
    }
  };
}

export default async function handler(request: Request) {
  const corsHeaders = getCorsHeadersForRequest(request);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // 安全修复：添加认证检查
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'Missing API Key' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const url = new URL(request.url);
  const pathParts = url.pathname.split('/').filter(Boolean);
  const action = pathParts[pathParts.length - 1];

  try {
    // POST /api/ai/gemini/cache - 创建缓存
    if (request.method === 'POST' && action === 'cache') {
      const body = (await request.json()) as CacheCreateRequest;

      if (!body.content || body.content.length < 100) {
        return new Response(
          JSON.stringify({
            error: 'Content too short for caching (min 100 chars)'
          }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }

      const cache = await createCache(apiKey, body);
      return new Response(JSON.stringify({ success: true, cache }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // GET /api/ai/gemini/cache?name=xxx - 获取缓存信息
    if (request.method === 'GET' && action === 'cache') {
      const cacheName = url.searchParams.get('name');
      if (!cacheName) {
        return new Response(JSON.stringify({ error: 'Missing cache name' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const cache = await getCache(apiKey, cacheName);
      if (!cache) {
        return new Response(
          JSON.stringify({ error: 'Cache not found', expired: true }),
          {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }

      return new Response(JSON.stringify({ success: true, cache }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // DELETE /api/ai/gemini/cache?name=xxx - 删除缓存
    if (request.method === 'DELETE' && action === 'cache') {
      const cacheName = url.searchParams.get('name');
      if (!cacheName) {
        return new Response(JSON.stringify({ error: 'Missing cache name' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      await deleteCache(apiKey, cacheName);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // POST /api/ai/gemini/cache/generate - 使用缓存生成
    if (request.method === 'POST' && action === 'generate') {
      const body = (await request.json()) as {
        cacheName: string;
        prompt: string;
      };

      if (!body.cacheName || !body.prompt) {
        return new Response(
          JSON.stringify({ error: 'Missing cacheName or prompt' }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }

      const result = await generateWithCache(
        apiKey,
        body.cacheName,
        body.prompt,
        userId
      );
      return new Response(JSON.stringify({ success: true, ...result }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error: unknown) {
    console.error('[GeminiCache] Handler error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
}
