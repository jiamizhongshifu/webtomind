/**
 * Workspace Studio AI API
 * POST: Weave / Humanizer / Expand
 */

import {
  getUserIdFromRequest,
  getCorsHeadersForRequest
} from '../utils/auth';
import { withNoThinking } from '../utils/gemini-helpers';
import {
  DEEPSEEK_V4_FLASH_0731_MODEL,
  normalizeGeminiModel
} from '../utils/model-registry';
import {
  classifyModelProvider,
  isOfficialGeminiEnabled
} from '../utils/model-provider-routing';
import { fetchModelWithTimeout } from '../utils/model-fetch';
import {
  consumeModelRateLimit,
  createModelRateLimitResponse
} from '../utils/model-rate-limit';
import {
  createAiProviderUsageTiming,
  estimateTokensFromText,
  extractGeminiUsage,
  extractOpenAICompatibleUsage,
  recordAiProviderUsage,
  resolveTokenUsageSource
} from '../utils/ai-provider-usage';

export const config = {
  runtime: 'edge',
  maxDuration: 60
};

type StudioAiAction = 'weave' | 'humanizer' | 'expand';

interface StudioAiRequest {
  action: StudioAiAction;
  selectionText: string;
  projectId?: string | null;
  materialText?: string;
}

function jsonResponse(
  data: unknown,
  corsHeaders: Record<string, string>,
  status = 200
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders
    }
  });
}

function getStudioAiPrompt(input: StudioAiRequest): string {
  const baseRules = [
    '你是内容写作编辑助手。',
    '输出必须是纯文本，不要使用 markdown 代码块。',
    '保持事实准确，不要臆造未提供的数据。',
    '中文输出，语气自然。'
  ].join('\n');

  const selection = input.selectionText.trim();
  const material = (input.materialText || '').trim();

  if (input.action === 'weave') {
    return `${baseRules}
任务：生成一段“过渡段”，用于连接上下文内容。
要求：
1) 120-220 字；
2) 逻辑顺滑，避免空话；
3) 不重复原文句子。

上下文文本：
${selection}

仅返回过渡段正文。`;
  }

  if (input.action === 'humanizer') {
    return `${baseRules}
任务：对给定文本做“去AI痕迹”改写。
要求：
1) 保留原意；
2) 增加口语化节奏和断句变化；
3) 避免机械模板句；
4) 长度控制在原文的 0.8x-1.2x。

原文：
${selection}

仅返回改写后的正文。`;
  }

  return `${baseRules}
任务：扩写观点段落。
要求：
1) 扩写到 180-320 字；
2) 尽量使用提供素材中的事实点；
3) 保持结构清晰（观点 -> 解释 -> 事实支持 -> 小结）。

待扩写观点：
${selection}

素材（可选）：
${material || '无'}

仅返回扩写后的正文。`;
}

async function generateTextWithGemini(apiKey: string, prompt: string, userId: string) {
  const model = normalizeGeminiModel(process.env.STUDIO_AI_MODEL);
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const timing = createAiProviderUsageTiming();

  const response = await fetchModelWithTimeout(
    apiUrl,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: withNoThinking({
          temperature: 0.7,
          topP: 0.9
        })
      })
    },
    { timeoutMs: 30_000, label: 'workspace studio Gemini' }
  );

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    await recordAiProviderUsage({
      userId,
      provider: 'gemini',
      model,
      endpoint: 'generateContent',
      source: 'workspace_studio_ai',
      status: 'failed',
      promptChars: prompt.length,
      inputTokens: estimateTokensFromText(prompt),
      tokenUsageSource: 'estimated',
      latencyMs: timing.mark(),
      startedAt: timing.startedAt,
      errorMessage: `Gemini request failed: ${response.status} ${text.slice(0, 500)}`
    });
    throw new Error(`Gemini request failed: ${response.status} ${text}`);
  }

  const result = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    usageMetadata?: unknown;
  };

  const text =
    result.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || '')
      .join('')
      .trim() || '';

  if (!text) {
    throw new Error('Gemini returned empty content');
  }

  const usage = extractGeminiUsage(result);
  await recordAiProviderUsage({
    userId,
    provider: 'gemini',
    model,
    endpoint: 'generateContent',
    source: 'workspace_studio_ai',
    status: 'succeeded',
    promptChars: prompt.length,
    responseChars: text.length,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
    tokenUsageSource: resolveTokenUsageSource(usage),
    latencyMs: timing.mark(),
    startedAt: timing.startedAt
  });

  return { text, model };
}

function normalizeChatBaseURL(baseURL: string): string {
  const trimmed = baseURL.replace(/\/+$/, '');
  return /\/v\d+$/i.test(trimmed) ? trimmed : `${trimmed}/v1`;
}

async function generateTextWithOpenAICompatible(prompt: string, userId: string, fallbackOf?: string) {
  const apiKey =
    process.env.DEEPSEEK_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.TUZI_TEXT_API_KEY ||
    process.env.TUZI_API_KEY;
  if (!apiKey) {
    throw new Error('OpenAI-compatible provider key not configured');
  }

  const baseURL =
    process.env.DEEPSEEK_BASE_URL ||
    process.env.OPENAI_BASE_URL ||
    process.env.TUZI_TEXT_BASE_URL ||
    process.env.TUZI_API_BASE_URL ||
    'https://api.deepseek.com';
  const model = DEEPSEEK_V4_FLASH_0731_MODEL;
  const provider = classifyModelProvider(baseURL);
  const timing = createAiProviderUsageTiming();

  const response = await fetchModelWithTimeout(
    `${normalizeChatBaseURL(baseURL)}/chat/completions`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 1200,
        stream: false
      })
    },
    { timeoutMs: 30_000, label: 'workspace studio DeepSeek' }
  );

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    await recordAiProviderUsage({
      userId,
      provider,
      model,
      endpoint: 'chat/completions',
      source: 'workspace_studio_ai',
      status: 'failed',
      fallbackOf,
      promptChars: prompt.length,
      inputTokens: estimateTokensFromText(prompt),
      tokenUsageSource: 'estimated',
      latencyMs: timing.mark(),
      startedAt: timing.startedAt,
      errorMessage: `OpenAI-compatible request failed: ${response.status} ${text.slice(0, 500)}`
    });
    throw new Error(`OpenAI-compatible request failed: ${response.status} ${text.slice(0, 500)}`);
  }

  const result = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: unknown;
  };

  const text = result.choices?.[0]?.message?.content?.trim() || '';
  if (!text) {
    throw new Error('OpenAI-compatible provider returned empty content');
  }

  const usage = extractOpenAICompatibleUsage(result);
  await recordAiProviderUsage({
    userId,
    provider,
    model,
    endpoint: 'chat/completions',
    source: 'workspace_studio_ai',
    status: 'succeeded',
    fallbackOf,
    promptChars: prompt.length,
    responseChars: text.length,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
    tokenUsageSource: resolveTokenUsageSource(usage),
    latencyMs: timing.mark(),
    startedAt: timing.startedAt
  });

  return { text, model };
}

async function generateStudioText(prompt: string, userId: string) {
  const apiKey =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GOOGLE_GEMINI_API_KEY;

  if (apiKey && isOfficialGeminiEnabled()) {
    try {
      return await generateTextWithGemini(apiKey, prompt, userId);
    } catch (error) {
      console.warn('[StudioAI] Gemini failed, trying OpenAI-compatible fallback:', error);
    }
  }

  return generateTextWithOpenAICompatible(prompt, userId, apiKey ? 'gemini' : undefined);
}

export default async function handler(request: Request) {
  const corsHeaders = getCorsHeadersForRequest(request);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, corsHeaders, 405);
  }

  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return jsonResponse({ error: '请先登录' }, corsHeaders, 401);
  }
  const rateLimit = await consumeModelRateLimit({
    userId,
    bucket: 'workspace_studio_ai',
    maxRequests: 20
  });
  if (!rateLimit.allowed) {
    return createModelRateLimitResponse(rateLimit, corsHeaders);
  }

  try {
    const body = (await request.json()) as StudioAiRequest;
    if (!body.action || !['weave', 'humanizer', 'expand'].includes(body.action)) {
      return jsonResponse({ error: 'Invalid action' }, corsHeaders, 400);
    }
    if (!body.selectionText || body.selectionText.trim().length === 0) {
      return jsonResponse({ error: 'selectionText 不能为空' }, corsHeaders, 400);
    }

    const prompt = getStudioAiPrompt(body);
    const generated = await generateStudioText(prompt, userId);

    return jsonResponse(
      {
        success: true,
        action: body.action,
        text: generated.text,
        model: generated.model
      },
      corsHeaders
    );
  } catch (error: unknown) {
    return jsonResponse(
      {
        error: 'Studio AI 处理失败',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      corsHeaders,
      500
    );
  }
}
