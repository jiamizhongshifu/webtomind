/**
 * Simple Chat API - Gemini 流式对话
 * 路径: POST /api/simple-chat
 *
 * 为 Web 环境提供简单对话能力（无工具调用）
 * 与 Hono Server 的 /api/agent/chat 区分开来
 *
 * 注意：指定 regions 为美国区域，避免 Gemini API 地理位置限制
 */

import { getUserIdFromRequest, getCorsHeadersForRequest } from './utils/auth';
import { withNoThinking } from './utils/gemini-helpers';
import {
  createAiProviderUsageTiming,
  estimateTokensFromCharCount,
  estimateTokensFromText,
  recordAiProviderUsage
} from './utils/ai-provider-usage';

export const config = {
  runtime: 'edge',
  // 指定部署区域为美国（华盛顿特区），避免 Gemini API 地理位置限制
  regions: ['iad1'],
};

export default async function handler(request: Request) {
  const corsHeaders = getCorsHeadersForRequest(request);

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // 安全修复：添加认证检查
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'Gemini API key not configured' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const body = await request.json() as {
      prompt?: string;
      context?: {
        references?: string;
        history?: string;
      };
    };
    const { prompt, context } = body;

    if (!prompt) {
      return new Response(
        JSON.stringify({ error: 'Missing prompt' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[Agent Chat] Request:', {
      promptLength: prompt.length,
      hasContext: !!context,
    });

    // 构建完整提示
    let fullPrompt = '';

    // 添加系统指令
    fullPrompt += '你是一个智能助手，擅长回答问题、总结内容、分析信息。请用中文回答。\n\n';

    // 添加参考内容
    if (context?.references) {
      fullPrompt += `以下是用户提供的参考内容，请基于这些内容回答问题：\n\n${context.references}\n\n---\n\n`;
    }

    // 添加历史对话
    if (context?.history) {
      fullPrompt += `历史对话：\n${context.history}\n\n`;
    }

    // 添加当前问题
    fullPrompt += `当前问题：${prompt}`;

    // 调用 Gemini API（安全修复：使用 Header 传递 API Key）
    const modelName = process.env.SIMPLE_CHAT_MODEL || 'gemini-3.5-flash';
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:streamGenerateContent?alt=sse`;
    const timing = createAiProviderUsageTiming();

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: fullPrompt }]
          }
        ],
        generationConfig: withNoThinking({
          maxOutputTokens: 8192,
          temperature: 0.7,
        }),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Agent Chat] Gemini API error:', response.status, errorText);
      await recordAiProviderUsage({
        userId,
        provider: 'gemini',
        model: modelName,
        endpoint: 'streamGenerateContent',
        source: 'simple_chat',
        status: 'failed',
        inputTokens: estimateTokensFromText(fullPrompt),
        tokenUsageSource: 'estimated',
        promptChars: fullPrompt.length,
        latencyMs: timing.mark(),
        errorMessage: `Gemini stream failed: ${response.status} ${errorText.slice(0, 500)}`,
        startedAt: timing.startedAt
      });
      // 安全修复：不暴露内部错误详情给客户端
      return new Response(
        JSON.stringify({
          error: 'Gemini API error',
          status: response.status,
          model: modelName,
          promptLength: fullPrompt.length
        }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 创建 SSE 转换器：将 Gemini 格式转为前端期望的格式
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    let responseChars = 0;

    const transformStream = new TransformStream({
      async transform(chunk, controller) {
        const text = decoder.decode(chunk);
        const lines = text.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (!data || data === '[DONE]') {
              continue;
            }

            try {
              const parsed = JSON.parse(data);

              // Gemini 格式：candidates[0].content.parts[0].text
              const textContent = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
              if (textContent) {
                responseChars += textContent.length;
                const sseData = JSON.stringify({ content: textContent });
                controller.enqueue(encoder.encode(`event: text\ndata: ${sseData}\n\n`));
              }

              // 检查是否完成
              const finishReason = parsed.candidates?.[0]?.finishReason;
              if (finishReason && finishReason !== 'STOP') {
                console.log('[Agent Chat] Finish reason:', finishReason);
              }

              // 处理错误
              if (parsed.error) {
                const sseData = JSON.stringify({ message: parsed.error.message || 'Unknown error' });
                controller.enqueue(encoder.encode(`event: error\ndata: ${sseData}\n\n`));
              }
            } catch {
              // 忽略解析错误
            }
          }
        }
      },
      flush(controller) {
        // 流结束时发送 done 事件
        controller.enqueue(encoder.encode('event: done\ndata: {}\n\n'));
        void recordAiProviderUsage({
          userId,
          provider: 'gemini',
          model: modelName,
          endpoint: 'streamGenerateContent',
          source: 'simple_chat',
          status: 'succeeded',
          inputTokens: estimateTokensFromText(fullPrompt),
          outputTokens: estimateTokensFromCharCount(responseChars),
          tokenUsageSource: 'estimated',
          promptChars: fullPrompt.length,
          responseChars,
          latencyMs: timing.mark(),
          startedAt: timing.startedAt
        });
      }
    });

    // 转发流式响应
    return new Response(response.body?.pipeThrough(transformStream), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error: unknown) {
    console.error('[Agent Chat] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}
