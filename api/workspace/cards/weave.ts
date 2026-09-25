/**
 * Workspace Cards Weave API
 * POST: 基于多张卡片生成过渡段落，并插入 AI-Gen Card
 */

import { SupabaseClient } from '@supabase/supabase-js';
import {
  getUserIdFromRequest,
  getCorsHeadersForRequest,
  getSupabaseAdmin
} from '../../utils/auth';
import {
  DEFAULT_WEAVING_FALLBACK_MODEL,
  DEFAULT_WEAVING_MODEL,
  normalizeGeminiModel
} from '../../utils/model-registry';
import {
  classifyModelProvider,
  isOfficialGeminiEnabled
} from '../../utils/model-provider-routing';
import { fetchModelWithTimeout } from '../../utils/model-fetch';
import {
  consumeModelRateLimit,
  createModelRateLimitResponse
} from '../../utils/model-rate-limit';
import { withNoThinking } from '../../utils/gemini-helpers';
import {
  createAiProviderUsageTiming,
  estimateTokensFromText,
  extractGeminiUsage,
  extractOpenAICompatibleUsage,
  recordAiProviderUsage,
  resolveTokenUsageSource
} from '../../utils/ai-provider-usage';

export const config = {
  runtime: 'edge',
  maxDuration: 120
};

interface WeaveRequest {
  projectId: string;
  cardIds: string[];
  saveCard?: boolean;
}

interface CardRow {
  id: string;
  project_id: string;
  type: string;
  content: unknown;
  position: number;
}

function getSupabase(): SupabaseClient | null {
  return getSupabaseAdmin();
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

function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

async function consumeWeavingQuota(
  sb: SupabaseClient,
  userId: string,
  corsHeaders: Record<string, string>
): Promise<{ response: Response | null; idempotencyKey: string }> {
  const idempotencyKey = crypto.randomUUID();
  const { data: result, error } = await sb.rpc('consume_weaving_quota', {
    p_user_id: userId,
    p_idempotency_key: idempotencyKey
  });

  if (error) {
    return {
      idempotencyKey,
      response: jsonResponse(
        { error: '编织配额校验失败', details: error.message },
        corsHeaders,
        500
      )
    };
  }

  if (!result?.success) {
    if (result?.error === 'QUOTA_EXCEEDED') {
      return {
        idempotencyKey,
        response: jsonResponse(
          {
            error: 'QUOTA_EXCEEDED',
            feature: result.feature || 'weaving_generation',
            used: result.used,
            max: result.max
          },
          corsHeaders,
          429
        )
      };
    }

    return {
      idempotencyKey,
      response: jsonResponse(
        { error: result?.error || '编织配额校验失败' },
        corsHeaders,
        400
      )
    };
  }

  return { idempotencyKey, response: null };
}

async function refundWeavingQuota(
  sb: SupabaseClient,
  userId: string,
  idempotencyKey: string,
  reason: string
): Promise<void> {
  const { error } = await sb.rpc('refund_weaving_quota', {
    p_user_id: userId,
    p_idempotency_key: idempotencyKey
  });

  if (error) {
    console.error('[WeaveAPI] Failed to refund weaving quota:', {
      reason,
      idempotencyKey,
      error
    });
  }
}

function extractCardText(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }

  if (!content || typeof content !== 'object') {
    return '';
  }

  const obj = content as Record<string, unknown>;
  const text = obj.text;
  const markdown = obj.markdown;
  const title = obj.title;

  if (typeof text === 'string' && text.trim().length > 0) return text;
  if (typeof markdown === 'string' && markdown.trim().length > 0)
    return markdown;
  if (typeof title === 'string' && title.trim().length > 0) return title;

  return JSON.stringify(content);
}

async function generateWithAnthropicCompatible(
  prompt: string,
  userId: string
): Promise<string> {
  const apiKey =
    process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('Claude key not configured');
  }

  const rawBaseURL =
    process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
  const baseURL = rawBaseURL.replace(/\/+$/, '').replace(/\/v1$/, '');
  const provider = classifyModelProvider(baseURL);
  const model =
    provider === 'anthropic'
      ? process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514'
      : DEFAULT_WEAVING_MODEL;
  const timing = createAiProviderUsageTiming();

  const response = await fetchModelWithTimeout(
    `${baseURL}/v1/messages`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model,
        max_tokens: 600,
        temperature: 0.6,
        messages: [{ role: 'user', content: prompt }]
      })
    },
    { timeoutMs: 30_000, label: 'workspace weave fallback' }
  );

  if (!response.ok) {
    const err = await response.text();
    await recordAiProviderUsage({
      userId,
      provider,
      model,
      endpoint: 'messages',
      source: 'workspace_cards_weave',
      status: 'failed',
      fallbackOf: 'deepseek',
      fallbackUsed: true,
      promptChars: prompt.length,
      inputTokens: estimateTokensFromText(prompt),
      tokenUsageSource: 'estimated',
      latencyMs: timing.mark(),
      startedAt: timing.startedAt,
      errorMessage: `${response.status} ${err.slice(0, 500)}`
    });
    throw new Error(`Anthropic-compatible API error: ${response.status} ${err}`);
  }

  const data = (await response.json()) as {
    content?: Array<{ type?: string; text?: string }>;
  };

  const text = (data.content || [])
    .filter((part) => part.type === 'text')
    .map((part) => part.text || '')
    .join('')
    .trim();

  if (!text) {
    throw new Error('Anthropic-compatible provider returned empty content');
  }

  await recordAiProviderUsage({
    userId,
    provider,
    model,
    endpoint: 'messages',
    source: 'workspace_cards_weave',
    status: 'succeeded',
    fallbackOf: 'deepseek',
    fallbackUsed: true,
    promptChars: prompt.length,
    responseChars: text.length,
    inputTokens: estimateTokensFromText(prompt),
    outputTokens: estimateTokensFromText(text),
    tokenUsageSource: 'estimated',
    latencyMs: timing.mark(),
    startedAt: timing.startedAt
  });

  return text;
}

async function generateWithGemini(prompt: string, userId: string): Promise<string> {
  if (!isOfficialGeminiEnabled()) {
    throw new Error('Official Gemini is disabled for this runtime');
  }
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error('Gemini key not configured');
  }

  const model = normalizeGeminiModel(DEFAULT_WEAVING_FALLBACK_MODEL);
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
          maxOutputTokens: 600,
          temperature: 0.6
        })
      })
    },
    { timeoutMs: 30_000, label: 'workspace weave Gemini fallback' }
  );

  if (!response.ok) {
    const err = await response.text();
    await recordAiProviderUsage({
      userId,
      provider: 'gemini',
      model,
      endpoint: 'generateContent',
      source: 'workspace_cards_weave',
      status: 'failed',
      fallbackOf: 'openai_compatible',
      promptChars: prompt.length,
      inputTokens: estimateTokensFromText(prompt),
      tokenUsageSource: 'estimated',
      latencyMs: timing.mark(),
      startedAt: timing.startedAt,
      errorMessage: `Gemini API error: ${response.status} ${err.slice(0, 500)}`
    });
    throw new Error(`Gemini API error: ${response.status} ${err}`);
  }

  const data = (await response.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
    usageMetadata?: unknown;
  };

  const text =
    data.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || '')
      .join('')
      .trim() || '';

  if (!text) {
    throw new Error('Gemini returned empty content');
  }

  const usage = extractGeminiUsage(data);
  await recordAiProviderUsage({
    userId,
    provider: 'gemini',
    model,
    endpoint: 'generateContent',
    source: 'workspace_cards_weave',
    status: 'succeeded',
    fallbackOf: 'openai_compatible',
    promptChars: prompt.length,
    responseChars: text.length,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
    tokenUsageSource: resolveTokenUsageSource(usage),
    latencyMs: timing.mark(),
    startedAt: timing.startedAt
  });

  return text;
}

function normalizeChatBaseURL(baseURL: string): string {
  const trimmed = baseURL.replace(/\/+$/, '');
  return /\/v\d+$/i.test(trimmed) ? trimmed : `${trimmed}/v1`;
}

async function generateWithOpenAICompatible(prompt: string, userId: string): Promise<string> {
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
  const model = DEFAULT_WEAVING_MODEL;
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
        temperature: 0.6,
        max_tokens: 800,
        stream: false
      })
    },
    { timeoutMs: 30_000, label: 'workspace weave DeepSeek' }
  );

  if (!response.ok) {
    const err = await response.text().catch(() => '');
    await recordAiProviderUsage({
      userId,
      provider,
      model,
      endpoint: 'chat/completions',
      source: 'workspace_cards_weave',
      status: 'failed',
      promptChars: prompt.length,
      inputTokens: estimateTokensFromText(prompt),
      tokenUsageSource: 'estimated',
      latencyMs: timing.mark(),
      startedAt: timing.startedAt,
      errorMessage: `OpenAI-compatible API error: ${response.status} ${err.slice(0, 500)}`
    });
    throw new Error(`OpenAI-compatible API error: ${response.status} ${err.slice(0, 500)}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: unknown;
  };

  const text = data.choices?.[0]?.message?.content?.trim() || '';
  if (!text) {
    throw new Error('OpenAI-compatible provider returned empty content');
  }

  const usage = extractOpenAICompatibleUsage(data);
  await recordAiProviderUsage({
    userId,
    provider,
    model,
    endpoint: 'chat/completions',
    source: 'workspace_cards_weave',
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

  return text;
}

function buildWeavePrompt(cards: CardRow[]): string {
  const cardTexts = cards
    .map((card, index) => {
      const content = extractCardText(card.content).slice(0, 2500);
      return `Card ${index + 1} (${card.type}):\n${content}`;
    })
    .join('\n\n');

  return [
    '你是内容编织助手。',
    '请基于以下卡片内容，生成一段自然、逻辑清晰的过渡段。',
    '要求：',
    '1) 只输出过渡段正文，不要标题或解释。',
    '2) 长度控制在 120-220 字（中文）。',
    '3) 语气与原卡片一致，避免重复原句。',
    '',
    cardTexts
  ].join('\n');
}

function calculateInsertPosition(cards: CardRow[]): number {
  const sorted = [...cards].sort((a, b) => a.position - b.position);
  const first = sorted[0]?.position ?? 0;
  const last = sorted[sorted.length - 1]?.position ?? first;

  if (first === last) {
    return first + 1;
  }

  return (first + last) / 2;
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
    bucket: 'workspace_cards_weave',
    maxRequests: 10
  });
  if (!rateLimit.allowed) return createModelRateLimitResponse(rateLimit, corsHeaders);

  const sb = getSupabase();
  if (!sb) {
    return jsonResponse({ error: '数据库未配置' }, corsHeaders, 500);
  }

  let quotaIdempotencyKey: string | null = null;

  try {
    const body = (await request.json()) as WeaveRequest;
    const projectId = body.projectId;
    const cardIds = Array.isArray(body.cardIds) ? body.cardIds : [];
    const saveCard = body.saveCard !== false;

    if (!projectId || !isValidUuid(projectId)) {
      return jsonResponse({ error: 'Invalid projectId' }, corsHeaders, 400);
    }

    if (cardIds.length < 2) {
      return jsonResponse(
        { error: '至少需要 2 张卡片进行编织' },
        corsHeaders,
        400
      );
    }

    if (!cardIds.every(isValidUuid)) {
      return jsonResponse({ error: 'Invalid cardIds' }, corsHeaders, 400);
    }

    const { data: project, error: projectError } = await sb
      .from('workspace_projects')
      .select('id')
      .eq('id', projectId)
      .eq('user_id', userId)
      .single();

    if (projectError || !project) {
      return jsonResponse(
        { error: '项目不存在或无权限访问' },
        corsHeaders,
        403
      );
    }

    const { data: cards, error: cardsError } = await sb
      .from('cards')
      .select('id, project_id, type, content, position')
      .eq('project_id', projectId)
      .in('id', cardIds);

    if (cardsError) {
      return jsonResponse(
        { error: '获取卡片失败', details: cardsError.message },
        corsHeaders,
        500
      );
    }

    const selectedCards = (cards || []) as CardRow[];
    if (selectedCards.length < 2) {
      return jsonResponse({ error: '可编织卡片不足' }, corsHeaders, 400);
    }

    const quota = await consumeWeavingQuota(sb, userId, corsHeaders);
    if (quota.response) {
      return quota.response;
    }
    quotaIdempotencyKey = quota.idempotencyKey;

    const sortedCards = [...selectedCards].sort(
      (a, b) => a.position - b.position
    );
    const prompt = buildWeavePrompt(sortedCards);

    let wovenText = '';
    let resolvedModel = DEFAULT_WEAVING_MODEL;
    let fallbackUsed = false;

    try {
      wovenText = await generateWithOpenAICompatible(prompt, userId);
      resolvedModel = DEFAULT_WEAVING_MODEL;
    } catch (openAiError) {
      fallbackUsed = true;
      try {
        wovenText = await generateWithAnthropicCompatible(prompt, userId);
        resolvedModel = DEFAULT_WEAVING_MODEL;
      } catch (claudeError) {
        resolvedModel = DEFAULT_WEAVING_FALLBACK_MODEL;
        console.warn('[WeaveAPI] OpenAI-compatible and Claude failed, fallback to Gemini:', {
          openAiError,
          claudeError
        });
        wovenText = await generateWithGemini(prompt, userId);
      }
    }

    const insertPosition = calculateInsertPosition(sortedCards);

    if (!saveCard) {
      return jsonResponse(
        {
          success: true,
          wovenText,
          card: null,
          model: {
            requestedModel: DEFAULT_WEAVING_MODEL,
            resolvedModel,
            fallbackUsed
          },
          insertPosition
        },
        corsHeaders
      );
    }

    const { data: insertedCard, error: insertError } = await sb
      .from('cards')
      .insert({
        project_id: projectId,
        type: 'ai_gen',
        content: {
          text: wovenText
        },
        meta_data: {
          source: 'weaving',
          model: resolvedModel,
          fallbackUsed,
          cardIds: sortedCards.map((c) => c.id),
          generatedAt: new Date().toISOString()
        },
        position: insertPosition
      })
      .select('*')
      .single();

    if (insertError) {
      await refundWeavingQuota(
        sb,
        userId,
        quota.idempotencyKey,
        'card_insert_failed'
      );
      return jsonResponse(
        {
          success: true,
          warning: '编织文本已生成，但保存卡片失败',
          warningDetails: insertError.message,
          wovenText,
          card: null,
          model: {
            requestedModel: DEFAULT_WEAVING_MODEL,
            resolvedModel,
            fallbackUsed
          },
          insertPosition
        },
        corsHeaders,
        200
      );
    }

    return jsonResponse(
      {
        success: true,
        wovenText,
        card: insertedCard,
        model: {
          requestedModel: DEFAULT_WEAVING_MODEL,
          resolvedModel,
          fallbackUsed
        },
        insertPosition
      },
      corsHeaders
    );
  } catch (error: unknown) {
    if (quotaIdempotencyKey) {
      await refundWeavingQuota(
        sb,
        userId,
        quotaIdempotencyKey,
        'weave_generation_failed'
      );
    }
    const message = error instanceof Error ? error.message : 'Unknown error';
    return jsonResponse(
      {
        error: '编织失败',
        details: message
      },
      corsHeaders,
      500
    );
  }
}
