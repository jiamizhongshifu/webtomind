/**
 * Gemini API 代理 - 生成内容
 */

import { getUserIdFromRequest, getCorsHeadersForRequest } from '../../utils/auth';
import {
  createAiProviderUsageTiming,
  estimateTokensFromText,
  extractGeminiUsage,
  recordAiProviderUsage,
  resolveTokenUsageSource
} from '../../utils/ai-provider-usage';

export const config = {
  runtime: 'edge',
  // 指定部署区域为美国，避免 Gemini API 地理位置限制
  regions: ['iad1'],
};

export default async function handler(request: Request) {
  const corsHeaders = getCorsHeadersForRequest(request);

  // 处理 CORS 预检请求
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  if (request.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      {
        status: 405,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      }
    );
  }

  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      }
    );
  }

  // This generic pass-through accepted caller-selected models and arbitrary
  // generation payloads. Keep the route only as an explicit compatibility
  // escape hatch; product features use bounded, purpose-specific endpoints.
  if (process.env.ENABLE_LEGACY_GEMINI_PROXY !== 'true') {
    return new Response(JSON.stringify({ error: 'Legacy Gemini proxy is disabled' }), {
      status: 410,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'Gemini API key not configured' }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      }
    );
  }

  try {
    const body = await request.json() as {
      model?: string;
      contents: unknown;
      generationConfig?: unknown;
      safetySettings?: unknown;
    };
    const { model, contents, generationConfig, safetySettings } = body;

    // 默认使用 gemini-3.1-flash-lite-preview
    const modelName = model || 'gemini-3.1-flash-lite-preview';
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`;
    const promptText = JSON.stringify(contents || '');
    const timing = createAiProviderUsageTiming();

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents,
        generationConfig,
        safetySettings,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Gemini Proxy] Error:', response.status, errorText);
      await recordAiProviderUsage({
        userId,
        provider: 'gemini',
        model: modelName,
        endpoint: 'generateContent',
        source: 'gemini_proxy_generate',
        status: 'failed',
        promptChars: promptText.length,
        inputTokens: estimateTokensFromText(promptText),
        tokenUsageSource: 'estimated',
        latencyMs: timing.mark(),
        startedAt: timing.startedAt,
        errorMessage: `Gemini API error: ${response.status} ${errorText.slice(0, 500)}`
      });
      return new Response(
        JSON.stringify({
          error: 'Gemini API error',
          status: response.status,
          // 安全修复：不暴露内部错误详情给客户端
        }),
        {
          status: response.status,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
          },
        }
      );
    }

    const data = await response.json();
    const usage = extractGeminiUsage(data);
    await recordAiProviderUsage({
      userId,
      provider: 'gemini',
      model: modelName,
      endpoint: 'generateContent',
      source: 'gemini_proxy_generate',
      status: 'succeeded',
      promptChars: promptText.length,
      responseChars: JSON.stringify(data).length,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.totalTokens,
      tokenUsageSource: resolveTokenUsageSource(usage),
      latencyMs: timing.mark(),
      startedAt: timing.startedAt
    });
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    });
  } catch (error: unknown) {
    console.error('[Gemini Proxy] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      }
    );
  }
}
