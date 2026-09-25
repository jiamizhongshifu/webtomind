/**
 * Gemini API 代理 - 流式生成（SSE）
 */

import { getUserIdFromRequest, getCorsHeadersForRequest } from '../../utils/auth';
import {
  createAiProviderUsageTiming,
  estimateTokensFromText,
  recordAiProviderUsage
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
      contents?: Array<{ parts?: Array<{ text?: string }> }>;
      generationConfig?: { maxOutputTokens?: number };
      safetySettings?: unknown;
    };
    const { model, contents, generationConfig, safetySettings } = body;

    // 调试日志
    const promptText = contents?.[0]?.parts?.[0]?.text || '';
    console.log('[Gemini Proxy Stream] Request info:', {
      model: model,
      promptLength: promptText.length,
      maxOutputTokens: generationConfig?.maxOutputTokens,
    });

    const modelName = model || 'gemini-3.1-flash-lite-preview';
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:streamGenerateContent?alt=sse`;
    const promptForUsage = JSON.stringify(contents || '');
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
      console.error('[Gemini Proxy Stream] Error:', response.status, errorText);
      await recordAiProviderUsage({
        userId,
        provider: 'gemini',
        model: modelName,
        endpoint: 'streamGenerateContent',
        source: 'gemini_proxy_stream',
        status: 'failed',
        promptChars: promptForUsage.length,
        inputTokens: estimateTokensFromText(promptForUsage),
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

    // 转发流式响应
    const trackedStream = response.body
      ? response.body.pipeThrough(
          new TransformStream<Uint8Array, Uint8Array>({
            transform(chunk, controller) {
              controller.enqueue(chunk);
            },
            async flush() {
              await recordAiProviderUsage({
                userId,
                provider: 'gemini',
                model: modelName,
                endpoint: 'streamGenerateContent',
                source: 'gemini_proxy_stream',
                status: 'succeeded',
                promptChars: promptForUsage.length,
                inputTokens: estimateTokensFromText(promptForUsage),
                tokenUsageSource: 'estimated',
                latencyMs: timing.mark(),
                startedAt: timing.startedAt
              });
            }
          })
        )
      : response.body;

    return new Response(trackedStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        ...corsHeaders,
      },
    });
  } catch (error: unknown) {
    console.error('[Gemini Proxy Stream] Error:', error);
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
