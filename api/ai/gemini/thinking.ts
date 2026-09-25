/**
 * Reasoning API. The legacy route name is preserved for client compatibility,
 * while all text reasoning is routed through the unified DeepSeek V4 Flash model.
 */

import { getUserIdFromRequest, getCorsHeadersForRequest } from '../../utils/auth';
import {
  consumeModelRateLimit,
  createModelRateLimitResponse
} from '../../utils/model-rate-limit';
import { fetchModelWithTimeout } from '../../utils/model-fetch';
import { getDeepSeekTextConnection } from '../../utils/model-provider-routing';
import {
  createAiProviderUsageTiming,
  estimateTokensFromText,
  extractOpenAICompatibleUsage,
  recordAiProviderUsage,
  resolveTokenUsageSource
} from '../../utils/ai-provider-usage';

export const config = {
  runtime: 'edge',
  regions: ['iad1'],
  maxDuration: 120
};

interface ThinkingRequest {
  prompt: string;
  context?: string;
  thinkingBudget?: 'low' | 'medium' | 'high';
  stream?: boolean;
}

interface ThinkingResponse {
  thinking: string;
  answer: string;
  usage: {
    thinkingTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
}

function getBudgetTokens(budget: 'low' | 'medium' | 'high'): number {
  if (budget === 'low') return 2048;
  if (budget === 'high') return 8192;
  return 4096;
}

async function generateWithThinking(input: {
  prompt: string;
  context?: string;
  thinkingBudget: 'low' | 'medium' | 'high';
  userId: string;
}): Promise<ThinkingResponse> {
  const connection = getDeepSeekTextConnection();
  if (!connection.apiKey) throw new Error('DeepSeek 服务未配置');

  const fullPrompt = input.context
    ? `${input.context}\n\n用户问题：${input.prompt}`
    : input.prompt;
  if (fullPrompt.length > 32_000) throw new Error('输入内容过长，请缩短后重试');

  const timing = createAiProviderUsageTiming();
  try {
    const response = await fetchModelWithTimeout(
      `${connection.baseURL}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${connection.apiKey}`
        },
        body: JSON.stringify({
          model: connection.model,
          max_tokens: getBudgetTokens(input.thinkingBudget),
          messages: [
            {
              role: 'system',
              content: '请先严谨分析，再给出清晰结论。不要伪造事实；不确定时明确说明。'
            },
            { role: 'user', content: fullPrompt }
          ]
        })
      },
      { timeoutMs: 45_000, label: 'DeepSeek reasoning' }
    );
    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`DeepSeek request failed: ${response.status} ${errorText.slice(0, 500)}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{
        message?: { content?: string; reasoning_content?: string };
        finish_reason?: string | null;
      }>;
      usage?: unknown;
    };
    const choice = data.choices?.[0];
    const thinking = choice?.message?.reasoning_content || '';
    const answer = choice?.message?.content || '';
    if (!answer.trim() || !choice?.finish_reason) {
      throw new Error('DeepSeek 返回不完整');
    }

    const usage = extractOpenAICompatibleUsage(data);
    await recordAiProviderUsage({
      userId: input.userId,
      provider: connection.provider,
      model: connection.model,
      endpoint: 'chat/completions',
      source: 'reasoning_thinking',
      status: 'succeeded',
      promptChars: fullPrompt.length,
      responseChars: thinking.length + answer.length,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.totalTokens,
      tokenUsageSource: resolveTokenUsageSource(usage),
      latencyMs: timing.mark(),
      startedAt: timing.startedAt,
      metadata: { thinkingBudget: input.thinkingBudget }
    });

    const outputTokens = usage.outputTokens || estimateTokensFromText(answer) || 0;
    const thinkingTokens = estimateTokensFromText(thinking) || 0;
    return {
      thinking,
      answer,
      usage: {
        thinkingTokens,
        outputTokens,
        totalTokens: usage.totalTokens || outputTokens + thinkingTokens
      }
    };
  } catch (error) {
    await recordAiProviderUsage({
      userId: input.userId,
      provider: connection.provider,
      model: connection.model,
      endpoint: 'chat/completions',
      source: 'reasoning_thinking',
      status: 'failed',
      promptChars: fullPrompt.length,
      inputTokens: estimateTokensFromText(fullPrompt),
      tokenUsageSource: 'estimated',
      latencyMs: timing.mark(),
      startedAt: timing.startedAt,
      errorMessage: error instanceof Error ? error.message : String(error),
      metadata: { thinkingBudget: input.thinkingBudget }
    });
    throw error;
  }
}

export default async function handler(request: Request): Promise<Response> {
  const corsHeaders = getCorsHeadersForRequest(request);
  const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: jsonHeaders });
  }

  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: jsonHeaders });
  }
  const rateLimit = await consumeModelRateLimit({ userId, bucket: 'ai_thinking', maxRequests: 8 });
  if (!rateLimit.allowed) return createModelRateLimitResponse(rateLimit, corsHeaders);

  try {
    const body = (await request.json()) as ThinkingRequest;
    const prompt = body.prompt?.trim();
    if (!prompt) {
      return new Response(JSON.stringify({ error: 'Missing prompt' }), { status: 400, headers: jsonHeaders });
    }
    const thinkingBudget = body.thinkingBudget || 'medium';
    if (!['low', 'medium', 'high'].includes(thinkingBudget)) {
      return new Response(JSON.stringify({ error: 'Invalid thinkingBudget' }), { status: 400, headers: jsonHeaders });
    }

    const result = await generateWithThinking({
      prompt,
      context: body.context,
      thinkingBudget,
      userId
    });

    if (body.stream) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          if (result.thinking) {
            controller.enqueue(encoder.encode(`event: thinking\ndata: ${JSON.stringify({ type: 'thinking', content: result.thinking })}\n\n`));
          }
          controller.enqueue(encoder.encode(`event: answer\ndata: ${JSON.stringify({ type: 'answer', content: result.answer })}\n\n`));
          controller.enqueue(encoder.encode(`event: done\ndata: ${JSON.stringify({ type: 'done', content: '', usage: result.usage })}\n\n`));
          controller.close();
        }
      });
      return new Response(stream, {
        headers: { ...corsHeaders, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' }
      });
    }

    return new Response(JSON.stringify({ success: true, ...result }), { headers: jsonHeaders });
  } catch (error) {
    console.error('[ThinkingMode] Handler error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 503, headers: jsonHeaders }
    );
  }
}
