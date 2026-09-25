/**
 * 智能对话 API - 统一对话入口
 * - 文本对话：OpenAgent SDK + GLM-5
 * - 图片生成：Gemini（保留）
 * - 意图检测：Gemini（仅在 agent+image 模式触发）
 *
 * Node.js Runtime（maxDuration: 120s）
 */

import { createClient } from '@supabase/supabase-js';
import {
  getCorsHeadersForRequest,
  getSupabaseAdmin,
  getUserIdFromRequest
} from '../utils/auth';
import {
  DEEPSEEK_V4_FLASH_0731_MODEL,
  DEFAULT_SMARTCHAT_TEXT_MODEL,
  normalizeGeminiModel
} from '../utils/model-registry';
import {
  getDeepSeekTextConnection,
  isOfficialGeminiEnabled
} from '../utils/model-provider-routing';
import { fetchModelWithTimeout } from '../utils/model-fetch';
import {
  consumeModelRateLimit,
  createModelRateLimitResponse
} from '../utils/model-rate-limit';
import { withNoThinking } from '../utils/gemini-helpers';
import {
  createAiProviderUsageTiming,
  estimateTokensFromText,
  extractGeminiUsage,
  recordAiProviderUsage,
  resolveTokenUsageSource
} from '../utils/ai-provider-usage';

export const config = {
  runtime: 'edge',
  maxDuration: 300
};

const DEBUG_LOG = process.env.NODE_ENV !== 'production';
const debugLog = (...args: unknown[]) => {
  if (DEBUG_LOG) {
    console.log(...args);
  }
};

interface IntentResult {
  intent: 'IMAGE' | 'BATCH_IMAGE' | 'TEXT';
  imagePrompt: string;
  /** ?????????????? */
  batchPrompts?: Array<{ title: string; prompt: string }>;
}

type SmartChatMode = 'ask' | 'agent';

interface SmartChatCreditCharge {
  idempotencyKey: string;
  action: string;
  consumed: number;
  creditType: string;
  creditBreakdown?: Record<string, number>;
}

const SMART_CHAT_PREPAY_OUTPUT_TOKENS = 8192;
const SMART_CHAT_STREAM_TIMEOUT_MS = 90_000;

async function fetchStreamingResponse(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs = SMART_CHAT_STREAM_TIMEOUT_MS
): Promise<{ response: Response; clearTimeout: () => void }> {
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);
  try {
    const response = await fetch(input, { ...init, signal: abortController.signal });
    return {
      response,
      clearTimeout: () => clearTimeout(timeoutId)
    };
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

function getTextCreditAction(mode: SmartChatMode, feature?: string): string {
  return mode === 'agent' || feature === 'skill-chat-compat'
    ? 'ai_chat_advanced'
    : 'ai_chat_basic';
}

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeCreditBreakdown(value: unknown): Record<string, number> | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const source = value as Record<string, unknown>;
  const breakdown = {
    daily: toNumber(source.daily),
    subscription: toNumber(source.subscription),
    bonus: toNumber(source.bonus),
    referral: toNumber(source.referral),
    media: toNumber(source.media),
    promoMedia: toNumber(source.promoMedia)
  };
  return Object.values(breakdown).some((amount) => amount > 0)
    ? breakdown
    : undefined;
}

function prorateCreditBreakdown(
  breakdown: Record<string, number> | undefined,
  refundAmount: number
): Record<string, number> | undefined {
  if (!breakdown || refundAmount <= 0) return undefined;
  const refundableEntries = Object.entries(breakdown)
    .map(([key, value]) => [key, Math.max(0, Math.floor(Number(value) || 0))] as const)
    .filter(([, value]) => value > 0);

  if (refundableEntries.length === 0) return undefined;

  let remaining = refundAmount;
  const refund: Record<string, number> = {};
  for (const [key, value] of refundableEntries) {
    if (remaining <= 0) break;
    const amount = Math.min(value, remaining);
    refund[key] = amount;
    remaining -= amount;
  }

  return Object.keys(refund).length > 0 ? refund : undefined;
}

async function ensureSmartChatCreditRecord(
  admin: ReturnType<typeof getSupabaseAdmin>,
  userId: string
): Promise<boolean> {
  if (!admin) return false;

  const { data, error } = await admin
    .from('user_credits')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (data) return true;
  if (error) {
    console.error('[SmartChat] Credit record lookup failed:', error);
    return false;
  }

  const { error: upsertError } = await admin
    .from('user_credits')
    .upsert({ user_id: userId }, { onConflict: 'user_id' });

  if (upsertError) {
    console.error('[SmartChat] Credit record upsert failed:', upsertError);
    return false;
  }

  return true;
}

async function prepaySmartChatTextCredits(input: {
  userId: string;
  mode: SmartChatMode;
  feature?: string;
  inputTokens: number;
  corsHeaders: Record<string, string>;
}): Promise<{ charge: SmartChatCreditCharge | null; response: Response | null }> {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return {
      charge: null,
      response: new Response(
        JSON.stringify({ error: '积分服务未配置，请稍后重试' }),
        {
          status: 500,
          headers: { ...input.corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    };
  }

  const action = getTextCreditAction(input.mode, input.feature);
  const hasCreditRecord = await ensureSmartChatCreditRecord(admin, input.userId);
  if (!hasCreditRecord) {
    return {
      charge: null,
      response: new Response(JSON.stringify({ error: '积分余额异常，请稍后重试' }), {
        status: 402,
        headers: { ...input.corsHeaders, 'Content-Type': 'application/json' }
      })
    };
  }

  const idempotencyKey = crypto.randomUUID();
  const metadata = {
    source: 'smart_chat_text',
    billingPhase: 'prepay',
    mode: input.mode,
    feature: input.feature || null,
    inputTokens: input.inputTokens,
    outputTokens: SMART_CHAT_PREPAY_OUTPUT_TOKENS,
    tokenUsageSource: 'estimated',
    idempotency_key: idempotencyKey,
    timestamp: new Date().toISOString()
  };
  const { data: result, error } = await admin.rpc('consume_credits', {
    p_user_id: input.userId,
    p_action: action,
    p_metadata: metadata
  });

  if (error) {
    console.error('[SmartChat] Text credit prepay RPC error:', error);
    return {
      charge: null,
      response: new Response(JSON.stringify({ error: '积分扣减失败，请稍后重试' }), {
        status: 500,
        headers: { ...input.corsHeaders, 'Content-Type': 'application/json' }
      })
    };
  }

  if (!result?.success) {
    const status = result?.error === 'QUOTA_EXCEEDED' ? 429 : 402;
    return {
      charge: null,
      response: new Response(
        JSON.stringify({
          error: result?.error || 'INSUFFICIENT_CREDITS',
          required: result?.required,
          current: result?.current
        }),
        {
          status,
          headers: { ...input.corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    };
  }

  return {
    response: null,
    charge: {
      idempotencyKey,
      action,
      consumed: toNumber(result.consumed),
      creditType: typeof result.credit_type === 'string' ? result.credit_type : 'bonus',
      creditBreakdown: normalizeCreditBreakdown(result.credit_breakdown)
    }
  };
}

async function refundSmartChatTextCredits(input: {
  userId: string;
  charge: SmartChatCreditCharge | null;
  amount?: number;
  reason: string;
}): Promise<void> {
  if (!input.charge || input.charge.consumed <= 0) return;

  const admin = getSupabaseAdmin();
  if (!admin) return;

  const refundAmount = Math.min(
    input.charge.consumed,
    Math.max(0, Math.floor(input.amount ?? input.charge.consumed))
  );
  if (refundAmount <= 0) return;

  const creditBreakdown = prorateCreditBreakdown(
    input.charge.creditBreakdown,
    refundAmount
  );
  const { error } = await admin.rpc('refund_generation_credit', {
    p_user_id: input.userId,
    p_amount: refundAmount,
    p_credit_type: input.charge.creditType,
    p_source: 'smart_chat_text_refund',
    p_metadata: {
      billingDomain: 'smart_chat_text',
      reason: input.reason,
      originalAction: input.charge.action,
      originalPrepayKey: input.charge.idempotencyKey,
      idempotency_key: `${input.charge.idempotencyKey}:${input.reason}:${refundAmount}`,
      creditBreakdown
    }
  });

  if (error) {
    console.error('[SmartChat] Text credit refund failed:', error);
  }
}

async function settleSmartChatTextCredits(input: {
  userId: string;
  charge: SmartChatCreditCharge | null;
  inputTokens: number;
  outputTokens: number;
  reason: string;
}): Promise<void> {
  if (!input.charge) return;
  const admin = getSupabaseAdmin();
  if (!admin) return;

  const { data: actualCost, error } = await admin.rpc('calculate_credit_cost', {
    p_action: input.charge.action,
    p_input_tokens: input.inputTokens,
    p_output_tokens: input.outputTokens
  });

  if (error) {
    console.error('[SmartChat] Text credit settlement cost failed:', error);
    return;
  }

  const refundAmount = input.charge.consumed - Math.max(1, toNumber(actualCost, 1));
  if (refundAmount > 0) {
    await refundSmartChatTextCredits({
      userId: input.userId,
      charge: input.charge,
      amount: refundAmount,
      reason: input.reason
    });
  }
}

const EXPLICIT_BATCH_PATTERNS = [
  new RegExp('(?:\u751f\u6210|\u505a|\u51fa|\u753b|\u7ed9\u6211|\u5e2e\u6211).{0,8}(?:[\u4e24\u4e8c\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341\\d]+)\u5f20'),
  new RegExp('(?:[\u4e24\u4e8c\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341\\d]+)\u5f20(?:\u56fe|\u56fe\u7247|\u7167\u7247|\u6d77\u62a5|\u914d\u56fe)'),
  new RegExp('(?:\u4e00\u7ec4|\u4e00\u5957|\u4e00\u7cfb\u5217|\u7cfb\u5217\u56fe|\u7ec4\u56fe|\u591a\u5f20|\u591a\u56fe|\u4e5d\u5bab\u683c|\u8fde\u56fe)'),
  new RegExp('(?:\u5c01\u9762|\u5934\u56fe).{0,8}(?:\u914d|\u52a0|\u52a0\u4e0a|\u642d\u914d).{0,8}(?:\u5185\u5bb9\u56fe|\u5185\u9875|\u8be6\u60c5\u56fe|\u7b2c[\u4e8c\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341\\d]+\u5f20)'),
  new RegExp('\u5c0f\u7ea2\u4e66.{0,8}(?:\u5c01\u9762|\u914d\u56fe|\u7ec4\u56fe|\u5185\u9875)'),
  new RegExp('(?:\u9996\u56fe|\u7b2c\u4e00\u5f20).{0,20}(?:\u7b2c\u4e8c\u5f20|\u7b2c2\u5f20|\u7b2c\u4e09\u5f20|\u7b2c3\u5f20)')
];

function hasExplicitBatchIntent(prompt: string): boolean {
  const normalized = prompt.replace(/\s+/g, ' ').trim();
  return EXPLICIT_BATCH_PATTERNS.some((pattern) => pattern.test(normalized));
}

function normalizeIntentResult(
  prompt: string,
  result: {
    intent?: string;
    imagePrompt?: string;
    batchPrompts?: Array<{ title?: string; prompt?: string }>;
  }
): IntentResult {
  const explicitBatchIntent = hasExplicitBatchIntent(prompt);

  if (result.intent === 'BATCH_IMAGE') {
    const batchPrompts = (result.batchPrompts || [])
      .map((item, index) => ({
        title: item.title?.trim() || `Image ${index + 1}`,
        prompt: item.prompt?.trim() || ''
      }))
      .filter((item) => item.prompt.length > 0);

    if (explicitBatchIntent && batchPrompts.length > 1) {
      return {
        intent: 'BATCH_IMAGE',
        imagePrompt: '',
        batchPrompts
      };
    }

    console.log('[SmartChat] Downgrading BATCH_IMAGE to IMAGE due to missing explicit batch cues', {
      promptChars: prompt.length,
      batchPromptsCount: batchPrompts.length
    });

    return {
      intent: 'IMAGE',
      imagePrompt: result.imagePrompt?.trim() || prompt.trim()
    };
  }

  if (result.intent === 'IMAGE') {
    return {
      intent: 'IMAGE',
      imagePrompt: result.imagePrompt?.trim() || prompt.trim()
    };
  }

  return { intent: 'TEXT', imagePrompt: '' };
}

// Gemini API 类型定义
interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
  inline_data?: { mime_type: string; data: string };
}

interface GroundingChunk {
  web?: { uri?: string; title?: string };
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: GeminiPart[] };
    finishReason?: string;
    groundingMetadata?: { groundingChunks?: GroundingChunk[] };
  }>;
  promptFeedback?: { blockReason?: string };
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
  };
}

// 意图识别的 JSON Schema (Structured Output)
const INTENT_SCHEMA = {
  type: 'object',
  properties: {
    intent: {
      type: 'string',
      enum: ['IMAGE', 'BATCH_IMAGE', 'TEXT'],
      description:
        'IMAGE: 生成单张图片; BATCH_IMAGE: 生成多张图片(组图/系列); TEXT: 普通对话'
    },
    imagePrompt: {
      type: 'string',
      description:
        '如果是单张图片生成请求(IMAGE)，这里是优化后的图片描述提示词；否则为空字符串'
    },
    batchPrompts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: '图片标题/序号描述，如"封面图"、"第1张"'
          },
          prompt: {
            type: 'string',
            description: '该图片的详细描述提示词'
          }
        },
        required: ['title', 'prompt']
      },
      description:
        '如果是批量图片生成(BATCH_IMAGE)，这里是每张图片的描述列表；否则为空数组'
    }
  },
  required: ['intent', 'imagePrompt', 'batchPrompts']
};

/**
 * 分析用户意图（纯文本，不传图片以保持稳定）
 */
async function analyzeIntent(
  apiKey: string,
  prompt: string,
  context?: { references?: string; history?: string },
  hasReferenceImages?: boolean,
  userId?: string
): Promise<IntentResult> {
  const cleanedReferences = (context?.references || '')
    .replace(
      /<img[^>]+src=["']data:image\/[^;]+;base64,[^"]*"[^>]*>/gi,
      '[图片]'
    )
    .replace(/!\[.*?\]\(data:image\/[^;]+;base64,[^)]+\)/gi, '[图片]');

  const truncatedReferences =
    cleanedReferences.length > 1500
      ? cleanedReferences.substring(0, 1500) + '...(已截断)'
      : cleanedReferences;

  // 如果用户上传了图片，在意图识别时提示 AI
  const imageUploadHint = hasReferenceImages
    ? `
【?? 关键信息：用户已上传参考图片！】
当用户上传了图片并附带提示词时，这几乎总是意味着用户想要：
- 基于参考图生成新图片
- 修改/调整参考图的风格、比例、元素
- 以参考图为灵感创作新图片
- 将参考图转换为其他风格

只有当用户明确说"分析这张图"、"描述图片内容"、"这张图是什么"等分析性问题时，才选择 TEXT。
其他情况下，只要用户上传了图片，就应该选择 IMAGE 意图！`
    : '';

  const intentPrompt = `分析用户意图，判断是：
1. TEXT - 普通对话（仅当用户明确要求分析/描述图片内容时）
2. IMAGE - 生成单张图片（用户上传参考图 + 任何创作性提示词）
3. BATCH_IMAGE - 生成多张图片（组图/系列图）
${imageUploadHint}

【判断规则】
- 如果用户明确要求"画图"、"生成图片"、"创作图像"、"画一个"、"帮我画"、"生成"、"创作"、"做一张"等，选择 IMAGE
- 如果用户上传了参考图片，并且提示词不是明确的分析性问题，选择 IMAGE
- 如果用户要求生成"多张"、"一组"、"系列"、"组图"、"N张"图片，或者提到"小红书"、"封面+内容"等，选择 BATCH_IMAGE
- Choose BATCH_IMAGE only when the user explicitly asks for multiple images, a series, a cover plus inner pages, or numbered image outputs.
- If the user provides one long single-image prompt with many sections, bullets, or descriptive dimensions, it is still IMAGE.
- Do not infer BATCH_IMAGE from prompt length, structure, or detailed style/composition sections alone.
- 只有当用户明确要求分析、描述、解释图片内容时，才选择 TEXT
- 【禁止】不要因为参考内容中提到了"天气"、"新闻"等词就误判

【BATCH_IMAGE 规则】
当选择 BATCH_IMAGE 时，你需要：
1. 根据用户需求确定要生成的图片数量（通常 3-9 张）
2. 为每张图片生成独立的标题和详细提示词
3. 保持系列图片的风格一致性
4. 第一张通常是封面图，后续是内容图

参考内容（文字部分）：${truncatedReferences || '无'}
历史对话：${context?.history?.substring(0, 500) || '无'}
当前问题: "${prompt}"

如果是 IMAGE 意图，imagePrompt 应该是一个详细的图片描述。
如果是 BATCH_IMAGE 意图，batchPrompts 应该是每张图片的标题和提示词数组。`;

  const model = normalizeGeminiModel(process.env.SMARTCHAT_TEXT_MODEL || DEFAULT_SMARTCHAT_TEXT_MODEL);
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const timing = createAiProviderUsageTiming();

  // 添加 10 秒超时，防止 API 卡住
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    console.log('[SmartChat] Analyzing intent with Structured Output...');
    console.log('[SmartChat] Intent analysis params:', {
      hasReferenceImages,
      promptChars: prompt?.length || 0,
      hasReferences: !!context?.references
    });
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: intentPrompt }] }],
        generationConfig: withNoThinking({
          temperature: 0.1,
          responseMimeType: 'application/json',
          responseSchema: INTENT_SCHEMA
        })
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error('[SmartChat] Intent API error:', response.status);
      await recordAiProviderUsage({
        userId,
        provider: 'gemini',
        model,
        endpoint: 'generateContent',
        source: 'smart_chat_intent',
        status: 'failed',
        promptChars: intentPrompt.length,
        inputTokens: estimateTokensFromText(intentPrompt),
        tokenUsageSource: 'estimated',
        latencyMs: timing.mark(),
        startedAt: timing.startedAt,
        errorMessage: `Intent API error: ${response.status}`
      });
      return { intent: 'TEXT', imagePrompt: '' };
    }
    const data = (await response.json()) as GeminiResponse;
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const usage = extractGeminiUsage(data);
    await recordAiProviderUsage({
      userId,
      provider: 'gemini',
      model,
      endpoint: 'generateContent',
      source: 'smart_chat_intent',
      status: 'succeeded',
      promptChars: intentPrompt.length,
      responseChars: text.length,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.totalTokens,
      tokenUsageSource: resolveTokenUsageSource(usage),
      latencyMs: timing.mark(),
      startedAt: timing.startedAt
    });

    // Structured Output 直接返回 JSON，无需正则提取
    try {
      const result = JSON.parse(text);
      return normalizeIntentResult(prompt, result);
    } catch (parseErr) {
      console.error('[SmartChat] JSON parse error:', parseErr);
      return { intent: 'TEXT', imagePrompt: '' };
    }
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === 'AbortError') {
      console.error('[SmartChat] Intent analysis timeout (10s)');
    } else {
      console.error('[SmartChat] Intent analysis error:', err);
    }
    await recordAiProviderUsage({
      userId,
      provider: 'gemini',
      model,
      endpoint: 'generateContent',
      source: 'smart_chat_intent',
      status: 'failed',
      promptChars: intentPrompt.length,
      inputTokens: estimateTokensFromText(intentPrompt),
      tokenUsageSource: 'estimated',
      latencyMs: timing.mark(),
      startedAt: timing.startedAt,
      errorMessage: err instanceof Error ? err.message : String(err)
    });
  }
  return { intent: 'TEXT', imagePrompt: '' };
}

import { generateImageWithZImage } from '../ai/aliyun/z-image';
import {
  executeImageGenerationJob,
  sanitizeImageGenerateInput
} from '../image/generate';

// 图片生成结果类型
interface ImageGenerationResult {
  success: boolean;
  imageUrl?: string;
  error?: string;
  errorType?:
    | 'SAFETY_FILTER'
    | 'EMPTY_RESPONSE'
    | 'API_ERROR'
    | 'FALLBACK_FAILED'
    | 'TIMEOUT';
  usedFallback?: boolean;
  isTemporaryUrl?: boolean; // Z-Image 返回的是临时 URL，前端需要下载
}

/**
 * 生成图片（带 Z-Image 兜底）
 * 根据 Gemini API 文档，REST API 使用下划线格式字段名（inline_data, mime_type）
 * parts 顺序：先 inline_data（参考图片）后 text（编辑指令）
 */
async function generateImage(
  apiKey: string,
  prompt: string,
  referenceImages?: Array<{ data: string; mimeType: string }>,
  aliyunApiKey?: string,
  onStatusChange?: (status: string, message: string) => void,
  userId?: string
): Promise<ImageGenerationResult> {
  const model = 'gemini-3.1-flash-image-preview';
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  // 构建 parts：编辑场景优先传图，再传文本指令
  const parts: GeminiPart[] = [];

  // 1. 先添加参考图片（使用下划线格式的字段名）
  if (referenceImages && referenceImages.length > 0) {
    console.log(
      '[SmartChat] generateImage: Adding',
      referenceImages.length,
      'reference images'
    );
    for (const img of referenceImages) {
      // 确保 data 是纯 base64，去除可能的 data URL 前缀
      let cleanData = img.data;
      if (cleanData.startsWith('data:')) {
        const match = cleanData.match(/^data:[^;]+;base64,(.+)$/);
        if (match) {
          cleanData = match[1];
          console.log('[SmartChat] generateImage: Stripped data URL prefix');
        }
      }

      // 检查图片数据大小
      const sizeKB = Math.round((cleanData.length * 0.75) / 1024);
      console.log(
        '[SmartChat] generateImage: Reference image size:',
        sizeKB,
        'KB, mimeType:',
        img.mimeType
      );

      // 使用下划线格式（REST API 要求）
      parts.push({
        inlineData: {
          mimeType: img.mimeType,
          data: cleanData
        }
      });
    }
  }

  // 2. 再添加文本提示
  parts.push({ text: prompt });

  console.log(
    '[SmartChat] generateImage: Calling Gemini API with',
    parts.length,
    'parts'
  );
  console.log(
    '[SmartChat] generateImage: Parts order:',
    parts.map((p) => Object.keys(p)[0]).join(' -> ')
  );
  let geminiError: {
    type: ImageGenerationResult['errorType'];
    message: string;
  } | null = null;
  let geminiUsageRecorded = false;
  const geminiTiming = createAiProviderUsageTiming();

  if (!apiKey) {
    geminiError = {
      type: 'API_ERROR',
      message: 'Official Gemini image provider is disabled'
    };
    geminiUsageRecorded = true;
  } else try {
    const requestBody = {
      contents: [{ role: 'user', parts }],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
        imageConfig: {
          imageSize: '2K'
        }
      }
    };

    // 计算请求体大小
    const bodyStr = JSON.stringify(requestBody);
    const bodySizeKB = Math.round(bodyStr.length / 1024);
    console.log(
      '[SmartChat] generateImage: Request body size:',
      bodySizeKB,
      'KB'
    );

    const response = await fetchModelWithTimeout(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: bodyStr
    }, { timeoutMs: 45_000, label: 'official Gemini image generation' });

    console.log('[SmartChat] generateImage: Response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        '[SmartChat] generateImage: API error:',
        response.status,
        errorText
      );
      geminiError = {
        type: 'API_ERROR',
        message: `Gemini API error: ${response.status}`
      };
      geminiUsageRecorded = true;
      await recordAiProviderUsage({
        userId,
        provider: 'gemini',
        model,
        endpoint: 'generateContent',
        source: 'smart_chat_image',
        status: 'failed',
        promptChars: prompt.length,
        inputTokens: estimateTokensFromText(prompt),
        tokenUsageSource: 'estimated',
        imageCount: 0,
        latencyMs: geminiTiming.mark(),
        startedAt: geminiTiming.startedAt,
        errorMessage: `${geminiError.message}: ${errorText.slice(0, 500)}`,
        metadata: {
          referenceImageCount: referenceImages?.length || 0,
          requestBodyKB: bodySizeKB
        }
      });
    } else {
      const data = (await response.json()) as GeminiResponse;
      console.log(
        '[SmartChat] generateImage: Response candidates:',
        data.candidates?.length || 0
      );

      // 打印完整的响应结构用于调试
      console.log(
        '[SmartChat] generateImage: Full response structure:',
        JSON.stringify({
          candidatesCount: data.candidates?.length,
          firstCandidate: data.candidates?.[0]
            ? {
                finishReason: data.candidates[0].finishReason,
                hasContent: !!data.candidates[0].content,
                partsCount: data.candidates[0].content?.parts?.length,
                partTypes: data.candidates[0].content?.parts?.map(
                  (p: GeminiPart) => Object.keys(p)
                )
              }
            : null,
          promptFeedback: data.promptFeedback,
          usageMetadata: data.usageMetadata
        })
      );

      // 检查是否有安全过滤
      const finishReason = data.candidates?.[0]?.finishReason;
      if (
        finishReason === 'SAFETY' ||
        finishReason === 'PROHIBITED_CONTENT' ||
        finishReason === 'IMAGE_SAFETY'
      ) {
        console.error(
          '[SmartChat] generateImage: Content blocked by safety filter, finishReason:',
          finishReason
        );
        geminiError = {
          type: 'SAFETY_FILTER',
          message: '内容被安全过滤器拦截'
        };
      }
      // 检查 promptFeedback 是否有阻止信息
      else if (data.promptFeedback?.blockReason) {
        console.error(
          '[SmartChat] generateImage: Prompt blocked:',
          data.promptFeedback.blockReason
        );
        geminiError = {
          type: 'SAFETY_FILTER',
          message: `提示词被拦截: ${data.promptFeedback.blockReason}`
        };
      }
      // 检查是否有内容
      else {
        const contentParts = data.candidates?.[0]?.content?.parts;
        console.log(
          '[SmartChat] generateImage: Content parts:',
          contentParts?.length || 0
        );

        // 响应中可能使用 inlineData 或 inline_data
        const part = contentParts?.find(
          (p: GeminiPart) => p.inlineData || p.inline_data
        );
        if (part) {
          const imageData = part.inlineData ?? part.inline_data;
          if (!imageData) {
            throw new Error('Image data missing from response part');
          }
          const mimeType =
            'mimeType' in imageData ? imageData.mimeType : imageData.mime_type;
          console.log(
            '[SmartChat] generateImage: Found image, mimeType:',
            mimeType
          );
          const usage = extractGeminiUsage(data);
          geminiUsageRecorded = true;
          await recordAiProviderUsage({
            userId,
            provider: 'gemini',
            model,
            endpoint: 'generateContent',
            source: 'smart_chat_image',
            status: 'succeeded',
            promptChars: prompt.length,
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            totalTokens: usage.totalTokens,
            tokenUsageSource: resolveTokenUsageSource(usage),
            imageCount: 1,
            latencyMs: geminiTiming.mark(),
            startedAt: geminiTiming.startedAt,
            metadata: {
              referenceImageCount: referenceImages?.length || 0,
              requestBodyKB: bodySizeKB
            }
          });
          return {
            success: true,
            imageUrl: `data:${mimeType};base64,${imageData.data}`
          };
        } else {
          console.error(
            '[SmartChat] generateImage: No image in response, parts:',
            JSON.stringify(contentParts?.map((p: GeminiPart) => Object.keys(p)))
          );
          // 检查是否有文本响应（可能是模型拒绝生成的解释）
          const textPart = contentParts?.find((p: GeminiPart) => p.text);
          if (textPart?.text) {
            console.log(
              '[SmartChat] generateImage: Model text response:',
              textPart.text.substring(0, 200)
            );
          }
          geminiError = {
            type: 'EMPTY_RESPONSE',
            message: '模型未返回图片内容'
          };
        }
      }
    }
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[SmartChat] generateImage: Exception:', errMsg);
    geminiError = {
      type: 'API_ERROR',
      message: errMsg
    };
  }

  if (geminiError && !geminiUsageRecorded) {
    geminiUsageRecorded = true;
    await recordAiProviderUsage({
      userId,
      provider: 'gemini',
      model,
      endpoint: 'generateContent',
      source: 'smart_chat_image',
      status: 'failed',
      promptChars: prompt.length,
      inputTokens: estimateTokensFromText(prompt),
      tokenUsageSource: 'estimated',
      imageCount: 0,
      latencyMs: geminiTiming.mark(),
      startedAt: geminiTiming.startedAt,
      errorMessage: geminiError.message,
      metadata: { referenceImageCount: referenceImages?.length || 0 }
    });
  }

  // Gemini 失败，尝试 Z-Image 兜底
  if (geminiError && aliyunApiKey) {
    console.log(
      '[SmartChat] generateImage: Gemini failed, trying Z-Image fallback...'
    );
    console.log(
      '[SmartChat] generateImage: Gemini error was:',
      geminiError.type,
      geminiError.message
    );

    // 发送状态更新，告知用户正在使用备用方案
    if (onStatusChange) {
      onStatusChange('generating', '正在使用备用方案生成...');
    }

    try {
      // Edge Runtime 时间有限，直接返回 Z-Image 的临时 URL，让前端下载
      const zImageResult = await generateImageWithZImage(aliyunApiKey, {
        prompt: prompt,
        size: '1024*1536',
        promptExtend: true
      });

      if (zImageResult.success && zImageResult.imageUrl) {
        console.log(
          '[SmartChat] generateImage: Z-Image fallback succeeded, returning temporary URL'
        );
        return {
          success: true,
          imageUrl: zImageResult.imageUrl, // 临时 URL，前端需要下载转存
          usedFallback: true,
          isTemporaryUrl: true
        };
      } else {
        console.error(
          '[SmartChat] generateImage: Z-Image fallback also failed:',
          zImageResult.error
        );
        // 检查 Z-Image 是否也是内容审核问题
        const isZImageSafetyError =
          zImageResult.error?.includes('DataInspectionFailed') ||
          zImageResult.error?.includes('内容') ||
          zImageResult.error?.includes('安全');
        return {
          success: false,
          error: isZImageSafetyError
            ? '图片内容不符合安全规范，请调整描述后重试'
            : zImageResult.error || geminiError.message,
          errorType: isZImageSafetyError ? 'SAFETY_FILTER' : geminiError.type
        };
      }
    } catch (fallbackErr: unknown) {
      const fallbackErrMsg =
        fallbackErr instanceof Error ? fallbackErr.message : 'Unknown error';
      console.error(
        '[SmartChat] generateImage: Z-Image fallback exception:',
        fallbackErrMsg
      );
      return {
        success: false,
        error: geminiError.message,
        errorType: geminiError.type
      };
    }
  }

  // 没有兜底方案或兜底也失败
  return {
    success: false,
    error: geminiError?.message || '图片生成失败',
    errorType: geminiError?.type || 'API_ERROR'
  };
}

/**
 * SSRF 防护:只允许 https / data: URL,拒绝 http、内网 IP、localhost、
 * 非标准协议(file:// gopher:// 等)。用户可控的 targetImageUrl 必须过这关,
 * 否则后端 fetch 会变成内网探测/SSRF 跳板。
 */
function isSafeImageUrl(rawUrl: string): boolean {
  // data:image/... 直接放行(本身就是内联数据,无网络请求)
  if (/^data:image\//i.test(rawUrl)) return true;
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  const host = parsed.hostname.toLowerCase();
  // 拒绝 localhost / 内网保留段 / link-local / 元数据地址
  if (
    host === 'localhost' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host) ||
    /^169\.254\./.test(host) || // link-local + 云元数据 169.254.169.254
    /^fc00:/i.test(host) ||
    /^fe80:/i.test(host) ||
    host.includes('::ffff:') // IPv4-mapped IPv6,如 ::ffff:169.254.169.254
  ) {
    return false;
  }
  // 编码型 IP 绕过:十进制整数(2130706433=127.0.0.1)、十六进制(0x7f000001)、
  // 八进制点分(0177.0.0.1)。纯数字/十六进制形态的 host 一律按 IP 严格校验,
  // 只放行标准点分十进制 a.b.c.d(每段 0-255、无前导零)。含字母的正常域名不受影响。
  const ipLike = /^[0-9.]+$/.test(host) || /^0x[0-9a-f.]+$/i.test(host);
  if (ipLike) {
    const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
    if (!v4) return false; // 十进制整数 / 十六进制 / 段数不对 → 拒绝
    const segs = v4.slice(1);
    if (segs.some((s) => Number(s) > 255)) return false;
    if (segs.some((s) => s.length > 1 && s.startsWith('0'))) return false; // 前导零=八进制写法
  }
  return true;
}

async function imageUrlToReferenceImage(
  imageUrl: string
): Promise<{ data: string; mimeType: string } | null> {
  try {
    if (!isSafeImageUrl(imageUrl)) {
      console.warn('[SmartChat] Rejected unsafe target image URL:', imageUrl);
      return null;
    }
    const response = await fetch(imageUrl, { redirect: 'error' });
    if (!response.ok) {
      console.warn(
        '[SmartChat] Failed to fetch target image URL:',
        response.status,
        imageUrl
      );
      return null;
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const arrayBuffer = await response.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const data = btoa(binary);

    return {
      data,
      mimeType: contentType
    };
  } catch (error) {
    console.warn('[SmartChat] Failed to convert target image URL:', error);
    return null;
  }
}

function normalizeBase64Data(data: string): string {
  if (!data.startsWith('data:')) {
    return data;
  }

  const match = data.match(/^data:[^;]+;base64,(.+)$/);
  return match?.[1] || data;
}

function dedupeReferenceImages(
  images?: Array<{ data: string; mimeType: string }>
): Array<{ data: string; mimeType: string }> | undefined {
  if (!images || images.length <= 1) {
    return images;
  }

  const seen = new Set<string>();
  const deduped: Array<{ data: string; mimeType: string }> = [];

  for (const image of images) {
    const cleanData = normalizeBase64Data(image.data);
    const key = `${image.mimeType}:${cleanData.length}:${cleanData.slice(0, 128)}:${cleanData.slice(-64)}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push({
      data: cleanData,
      mimeType: image.mimeType
    });
  }

  return deduped;
}

function buildEditConstrainedPrompt(prompt: string): string {
  return `Use the provided reference image as the base image. Keep composition, perspective, style, lighting, and all unspecified elements unchanged. Only apply the explicit edits requested by the user.\n\nUser edit request:\n${prompt}`;
}

function buildReferenceGuidedPrompt(prompt: string): string {
  return `Use the provided reference image only as a visual reference for the main subject's identity, key features, and overall consistency. Follow the user's prompt as the primary instruction for the new image. You may change composition, background, styling, clothing, camera angle, and scene when requested. Do not ignore explicit user requirements.\n\nUser generation request:\n${prompt}`;
}

// ---------------------------------------------------------------------------
// Handler (Edge Runtime)
// ---------------------------------------------------------------------------

export default async function handler(request: Request) {
  const corsHeaders = getCorsHeadersForRequest(request);

  if (request.method === 'OPTIONS')
    return new Response(null, { status: 204, headers: corsHeaders });

  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const rateLimit = await consumeModelRateLimit({
    userId,
    bucket: 'smart_chat',
    maxRequests: 20
  });
  if (!rateLimit.allowed) {
    return createModelRateLimitResponse(rateLimit, corsHeaders);
  }

  const geminiApiKey = isOfficialGeminiEnabled()
    ? process.env.GEMINI_API_KEY || ''
    : '';
  const encoder = new TextEncoder();

  try {
    const body = (await request.json()) as {
      prompt?: string;
      context?: {
        references?: string;
        history?: string;
        referenceImages?: Array<{ data: string; mimeType: string }>;
        targetImageUrl?: string;
        targetImageMessageId?: string;
        feature?: string;
        projectId?: string;
      };
      thinkingMode?: boolean;
      mode?: 'ask' | 'agent';
      feature?: string;
      sessionId?: string;
    };
    const { prompt, context, mode = 'ask' } = body;
    let referenceImages = context?.referenceImages;
    if (context?.targetImageUrl) {
      const targetImage = await imageUrlToReferenceImage(context.targetImageUrl);
      if (targetImage) {
        referenceImages = [targetImage, ...(referenceImages || [])];
      }
    }
    referenceImages = dedupeReferenceImages(referenceImages);

    const feature = body.feature || context?.feature;
    const allowImageGeneration = mode === 'agent' && feature === 'image';

    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (event: string, data: unknown) => {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        };
        let textCreditCharge: SmartChatCreditCharge | null = null;

        try {
          // 意图识别
          let intent: IntentResult = { intent: 'TEXT', imagePrompt: '' };

          if (allowImageGeneration) {
            sendEvent('status', { status: 'analyzing', message: '分析中...' });
            intent = geminiApiKey
              ? await analyzeIntent(
                  geminiApiKey,
                  prompt || '',
                  context,
                  referenceImages && referenceImages.length > 0,
                  userId
                )
              : { intent: 'IMAGE', imagePrompt: prompt || '' };
        // 用户已明确选择图像模式，如果意图分析返回 TEXT，强制为 IMAGE
        if (intent.intent === 'TEXT') {
          intent = { intent: 'IMAGE', imagePrompt: intent.imagePrompt || prompt || '' };
        }
        debugLog('[SmartChat] Agent mode intent:', intent.intent);
      } else if (mode === 'ask') {
        // ask 模式：快速检测是否是 Agent 功能请求（关键词匹配）
        const lowerPrompt = (prompt || '').toLowerCase();
        const imageKeywords = [
          '画', '生成图', '图片', '绘制', '画一', '帮我画', '创作图',
          'draw', 'generate image', 'create image', '生成一张', '画个', '画出'
        ];
        const slideKeywords = [
          'ppt', 'PPT', '演示文稿', '幻灯片', 'slide', 'presentation', '做个ppt', '制作ppt'
        ];

        const isImageRequest = imageKeywords.some((kw) => lowerPrompt.includes(kw));
        const isSlideRequest = slideKeywords.some((kw) => lowerPrompt.includes(kw.toLowerCase()));

        if (isImageRequest || isSlideRequest) {
          const detectedFeature = isImageRequest ? 'image' : 'slide_deck';
          const featureName = isImageRequest ? '图片生成' : 'PPT 制作';
          sendEvent('mode_switch', {
            targetMode: 'agent',
            feature: detectedFeature,
            message: `${featureName}功能需要在 Agent 模式下使用。点击下方按钮切换到 Agent 模式，即可使用${featureName}功能。`
          });
          sendEvent('done', { tokenUsage: { inputTokens: 0, outputTokens: 0 } });
          controller.close();
          return;
        }
      }

      // ========== IMAGE 图片生成（Gemini） ==========
      if (intent.intent === 'IMAGE') {
        // 扣费必须先成功；配置缺失、RPC 异常和未知响应一律失败关闭。
        let canGenerate = false;
        let quotaError: { error: string; max?: number; used?: number; resetAt?: string } | null = null;
        // 扣费上下文：生图失败时据此退款（与 image/generate 对齐）
        let chargedUserId: string | null = null;
        let chargedAmount = 0;
        let chargedType = 'bonus';
        let chargedBreakdown: Record<string, number> | undefined;

        try {
          const supabaseAdmin = getSupabaseAdmin();
          if (!supabaseAdmin) {
            quotaError = { error: 'CREDIT_SERVICE_UNAVAILABLE' };
          } else {
            const { data: result, error: rpcError } = await supabaseAdmin.rpc('consume_credits', {
              p_user_id: userId,
              p_action: 'image_generation',
              p_metadata: {
                source: 'smart_chat_intent',
                idempotency_key: crypto.randomUUID()
              }
            });
            if (rpcError) {
              console.error('[SmartChat] Failed to consume credits:', rpcError);
              quotaError = { error: 'CREDIT_SERVICE_UNAVAILABLE' };
            } else if (!result?.success) {
              if (result?.error === 'QUOTA_EXCEEDED') {
                const tomorrow = new Date();
                tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
                tomorrow.setUTCHours(0, 0, 0, 0);
                quotaError = { error: 'QUOTA_EXCEEDED', max: result.max, used: result.used, resetAt: tomorrow.toISOString() };
              } else {
                quotaError = { error: result?.error || 'CREDIT_SERVICE_UNAVAILABLE' };
              }
            } else {
              chargedAmount = Number(result.consumed || 0);
              if (chargedAmount <= 0) {
                quotaError = { error: 'CREDIT_SERVICE_UNAVAILABLE' };
              } else {
                canGenerate = true;
                chargedUserId = userId;
                chargedType = result.credit_type || 'bonus';
                if (result.credit_breakdown && typeof result.credit_breakdown === 'object') {
                  chargedBreakdown = {
                    daily: Number(result.credit_breakdown.daily || 0),
                    subscription: Number(result.credit_breakdown.subscription || 0),
                    bonus: Number(result.credit_breakdown.bonus || 0),
                    referral: Number(result.credit_breakdown.referral || 0),
                    media: Number(result.credit_breakdown.media || 0),
                    promoMedia: Number(result.credit_breakdown.promoMedia || 0)
                  };
                }
              }
            }
          }
        } catch (creditErr) {
          console.error('[SmartChat] Credit check error:', creditErr);
          quotaError = { error: 'CREDIT_SERVICE_UNAVAILABLE' };
        }

        if (!canGenerate) {
          quotaError ||= { error: 'CREDIT_SERVICE_UNAVAILABLE' };
          let errorMessage = '生成失败';
          if (quotaError.error === 'QUOTA_EXCEEDED') {
            errorMessage = `今日图片生成次数已达上限（${quotaError.used}/${quotaError.max}次），将于明日重置`;
          } else if (quotaError.error === 'INSUFFICIENT_MEDIA_CREDITS') {
            errorMessage = '媒体积分不足，请充值媒体积分后再试';
          } else if (quotaError.error === 'INSUFFICIENT_CREDITS') {
            errorMessage = '积分不足，请充值后再试';
          } else if (quotaError.error === 'CREDIT_SERVICE_UNAVAILABLE') {
            errorMessage = '积分服务暂时不可用，请稍后重试';
          }
          sendEvent('error', { type: quotaError.error, message: errorMessage, details: quotaError });
          sendEvent('done', { tokenUsage: { inputTokens: 0, outputTokens: 0 }, isImageGeneration: true, error: quotaError.error });
          controller.close();
          return;
        }

        sendEvent('status', { status: 'generating', message: '生图中...' });

        const aliyunApiKey = process.env.DASHSCOPE_API_KEY;
        const onStatusChange = (status: string, message: string) => {
          sendEvent('status', { status, message });
        };

        const baseImagePrompt = intent.imagePrompt || prompt?.trim() || 'generate an image';
        const promptStrategy = context?.targetImageUrl
          ? 'edit-constrained'
          : referenceImages && referenceImages.length > 0 ? 'reference-guided' : 'plain';
        const imagePrompt = promptStrategy === 'edit-constrained'
          ? buildEditConstrainedPrompt(baseImagePrompt)
          : promptStrategy === 'reference-guided'
            ? buildReferenceGuidedPrompt(baseImagePrompt)
            : baseImagePrompt;

        let imageResult: ImageGenerationResult;
        const imageAdmin = getSupabaseAdmin();
        if ((!referenceImages || referenceImages.length === 0) && imageAdmin) {
          const sanitized = sanitizeImageGenerateInput({
            prompt: imagePrompt,
            model: 'gpt-image-2',
            imageCount: 1,
            aspectRatio: '3:4',
            promptMode: 'custom'
          });
          if (!sanitized.ok) {
            imageResult = {
              success: false,
              error: String(sanitized.body.message || sanitized.body.error || '图片参数无效'),
              errorType: 'API_ERROR'
            };
          } else {
            const execution = await executeImageGenerationJob({
              request,
              userId,
              sanitizedInput: sanitized.value,
              sb: imageAdmin,
              options: {
                prepaidCredit: {
                  consumed: chargedAmount,
                  creditType: chargedType,
                  creditBreakdown: chargedBreakdown
                }
              }
            });
            // 主图片管线已接管成功结算或失败退款，避免 Smart Chat 二次退款。
            chargedAmount = 0;
            imageResult = execution.ok && execution.payload
              ? {
                  success: true,
                  imageUrl: execution.payload.imageUrl,
                  usedFallback: execution.payload.usedFallback
                }
              : {
                  success: false,
                  error: execution.failureReason || String(execution.body?.message || execution.body?.error || '图片生成失败'),
                  errorType: 'API_ERROR'
                };
          }
        } else {
          imageResult = await generateImage(
            geminiApiKey,
            imagePrompt,
            referenceImages,
            aliyunApiKey,
            onStatusChange,
            userId
          );
        }

        if (imageResult.success && imageResult.imageUrl) {
          sendEvent('image', { imageUrl: imageResult.imageUrl, usedFallback: imageResult.usedFallback, isTemporaryUrl: imageResult.isTemporaryUrl });
          sendEvent('done', { tokenUsage: { inputTokens: 0, outputTokens: 0 }, isImageGeneration: true });
        } else {
          // 生图失败：退还已扣积分（与 image/generate、batch-image-execute 对齐）
          if (chargedUserId && chargedAmount > 0) {
            try {
              const refundClient = getSupabaseAdmin();
              if (refundClient) {
                const refundMetadata: Record<string, unknown> = {
                  source: 'smart_chat_intent',
                  reason: imageResult.errorType || 'IMAGE_GENERATION_FAILED'
                };
                if (chargedBreakdown) {
                  refundMetadata.creditBreakdown = chargedBreakdown;
                }
                await refundClient.rpc('refund_image_generation_credit', {
                  p_user_id: chargedUserId,
                  p_amount: chargedAmount,
                  p_credit_type: chargedType,
                  p_metadata: refundMetadata
                });
              }
            } catch (refundErr) {
              console.error('[SmartChat] refund_image_generation_credit failed:', refundErr);
            }
          }
          let userMessage = '图片生成失败，请稍后重试';
          if (imageResult.errorType === 'SAFETY_FILTER') userMessage = '图片内容不符合安全规范，请调整描述后重试';
          else if (imageResult.errorType === 'EMPTY_RESPONSE') userMessage = '模型无法生成该图片，请尝试调整描述';
          sendEvent('error', { type: imageResult.errorType || 'IMAGE_GENERATION_FAILED', message: userMessage, detail: imageResult.error });
          sendEvent('done', { tokenUsage: { inputTokens: 0, outputTokens: 0 }, isImageGeneration: true, error: imageResult.errorType });
        }
        controller.close();
        return;
      }

      // ========== BATCH_IMAGE 批量图片预览 ==========
      if (intent.intent === 'BATCH_IMAGE' && intent.batchPrompts && intent.batchPrompts.length > 0) {
        const batchTasks = intent.batchPrompts.map((p, index) => ({
          id: `batch_${Date.now()}_${index}`,
          index: index + 1,
          title: p.title,
          prompt: p.prompt,
          status: 'pending' as const
        }));
        sendEvent('batch_preview', {
          batchTasks: batchTasks.map((t) => ({ id: t.id, index: t.index, title: t.title, prompt: t.prompt, status: 'pending' })),
          totalCount: batchTasks.length,
          estimatedCredits: batchTasks.length
        });
        sendEvent('done', { tokenUsage: { inputTokens: 0, outputTokens: 0 }, isBatchPreview: true });
        controller.close();
        return;
      }

      // ========== TEXT 文本对话（DeepSeek via OpenAI-compatible API） ==========

      const cleanedReferences = (context?.references || '')
        .replace(/<img[^>]+src=["']data:image\/[^;]+;base64,[^"']+"[^>]*>/gi, '[已提供图片]')
        .replace(/!\[.*?\]\(data:image\/[^;]+;base64,[^)]+\)/gi, '[已提供图片]');

      const currentDate = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });

      // ChatGPT-style 项目自定义指令 — 注入到 system prompt 顶部
      let projectInstructions = '';
      if (context?.projectId) {
        try {
          const sbUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
          const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
          if (sbUrl && sbKey) {
            const sb = createClient(sbUrl, sbKey, { auth: { persistSession: false } });
            const { data: row } = await sb
              .from('workspace_projects')
              .select('instructions')
              .eq('id', context.projectId)
              // 安全:必须校验项目归属当前用户,否则 A 传 B 的 projectId
              // 就能让 agent 加载 B 的私有指令(service_role 绕过 RLS)
              .eq('user_id', userId)
              .maybeSingle();
            if (row?.instructions && typeof row.instructions === 'string' && row.instructions.trim()) {
              projectInstructions = row.instructions.trim();
              debugLog('[SmartChat] Project instructions loaded, length:', projectInstructions.length);
            }
          }
        } catch (err) {
          console.warn('[SmartChat] Failed to load project instructions:', err);
        }
      }

      let enrichedPrompt = prompt || '';
      if (cleanedReferences) {
        enrichedPrompt = `【参考内容】\n${cleanedReferences.substring(0, 4000)}\n\n【用户问题】\n${enrichedPrompt}`;
      }
      if (context?.history) {
        enrichedPrompt = `【对话历史】\n${context.history.substring(0, 2000)}\n\n${enrichedPrompt}`;
      }
      enrichedPrompt = `当前日期：${currentDate}\n\n${enrichedPrompt}`;

      // 默认 system prompt;若项目设置了自定义指令,prepend 到 system 顶部
      const baseSystemPrompt = '你是一个智能助手。请直接回答问题，不要提及"参考内容"等元信息。';
      const finalSystemPrompt = projectInstructions
        ? `${projectInstructions}\n\n---\n\n${baseSystemPrompt}`
        : baseSystemPrompt;

      const deepseekConnection = getDeepSeekTextConnection();
      const openaiKey = deepseekConnection.apiKey;
      const openaiBase = deepseekConnection.baseURL;
      const openaiModel = DEEPSEEK_V4_FLASH_0731_MODEL;
      const openaiProvider = deepseekConnection.provider;

      if (!openaiKey) {
        sendEvent('error', { message: 'DeepSeek 服务未配置（缺少 DEEPSEEK_API_KEY）' });
        sendEvent('done', { tokenUsage: { inputTokens: 0, outputTokens: 0 } });
        controller.close();
        return;
      }

      debugLog('[SmartChat] Using DeepSeek model:', openaiModel, 'mode:', mode);

      const textInputTokens = estimateTokensFromText(finalSystemPrompt + String.fromCharCode(10) + enrichedPrompt) ?? 0;
      const textCreditPrepay = await prepaySmartChatTextCredits({
        userId,
        mode,
        feature,
        inputTokens: textInputTokens,
        corsHeaders
      });
      if (textCreditPrepay.response) {
        let message = '积分不足，请充值后再试';
        try {
          const payload = await textCreditPrepay.response.clone().json();
          if (payload?.error === 'INSUFFICIENT_CREDITS') {
            message = '积分不足，请充值后再试';
          } else if (typeof payload?.error === 'string') {
            message = payload.error;
          }
        } catch {
          message = '积分校验失败，请稍后重试';
        }
        sendEvent('error', { message, status: textCreditPrepay.response.status });
        sendEvent('done', { tokenUsage: { inputTokens: 0, outputTokens: 0 } });
        controller.close();
        return;
      }
      textCreditCharge = textCreditPrepay.charge;

      const deepseekRequestBody: Record<string, unknown> = {
        model: openaiModel,
        max_tokens: 8192,
        stream: true,
        messages: [
          { role: 'system', content: finalSystemPrompt },
          { role: 'user', content: enrichedPrompt }
        ]
      };

      const deepseekTiming = createAiProviderUsageTiming();
      const deepseekStreamRequest = await fetchStreamingResponse(`${openaiBase}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openaiKey}`
        },
        body: JSON.stringify(deepseekRequestBody)
      });
      const aiResp = deepseekStreamRequest.response;

      // DeepSeek 失败时自动降级到 Gemini
      let useGeminiFallback = false;
      if (!aiResp.ok) {
        deepseekStreamRequest.clearTimeout();
        const errText = await aiResp.text().catch(() => '');
        console.warn('[SmartChat] DeepSeek failed:', aiResp.status, errText, '→ falling back to Gemini');
        await recordAiProviderUsage({
          userId,
          provider: openaiProvider,
          model: openaiModel,
          endpoint: 'chat/completions',
          source: 'smart_chat_text',
          status: 'failed',
          promptChars: enrichedPrompt.length + finalSystemPrompt.length,
          inputTokens: estimateTokensFromText(finalSystemPrompt + String.fromCharCode(10) + enrichedPrompt) ?? 0,
          tokenUsageSource: 'estimated',
          latencyMs: deepseekTiming.mark(),
          startedAt: deepseekTiming.startedAt,
          errorMessage: `DeepSeek failed: ${aiResp.status} ${errText.slice(0, 500)}`
        });
        useGeminiFallback = true;
      }

      if (useGeminiFallback && geminiApiKey) {
        // Gemini 兜底：流式文本生成
        const fallbackModel = normalizeGeminiModel(process.env.SMARTCHAT_TEXT_MODEL || DEFAULT_SMARTCHAT_TEXT_MODEL);
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${fallbackModel}:streamGenerateContent?alt=sse&key=${geminiApiKey}`;
        const geminiTiming = createAiProviderUsageTiming();
        // Gemini 没有 system role,把项目指令 prepend 到 user prompt
        const geminiPrompt = projectInstructions
          ? `${projectInstructions}\n\n---\n\n${enrichedPrompt}`
          : enrichedPrompt;
        const geminiFallbackBody: Record<string, unknown> = {
          contents: [{ role: 'user', parts: [{ text: geminiPrompt }] }],
          generationConfig: withNoThinking({ temperature: 0.7 })
        };
        // Ask 模式启用 Google Search Grounding
        if (mode === 'ask') {
          geminiFallbackBody.tools = [{ googleSearch: {} }];
        }

        console.log('[SmartChat] Gemini fallback model:', fallbackModel);
        const geminiStreamRequest = await fetchStreamingResponse(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(geminiFallbackBody)
        });
        const geminiResp = geminiStreamRequest.response;

        if (!geminiResp.ok) {
          geminiStreamRequest.clearTimeout();
          const geminiErr = await geminiResp.text().catch(() => '');
          console.error('[SmartChat] Gemini fallback also failed:', geminiResp.status, geminiErr);
          await recordAiProviderUsage({
            userId,
            provider: 'gemini',
            model: fallbackModel,
            endpoint: 'streamGenerateContent',
            source: 'smart_chat_text',
            status: 'failed',
            fallbackOf: 'deepseek',
            promptChars: geminiPrompt.length,
            inputTokens: estimateTokensFromText(geminiPrompt) ?? 0,
            tokenUsageSource: 'estimated',
            latencyMs: geminiTiming.mark(),
            startedAt: geminiTiming.startedAt,
            errorMessage: `Gemini fallback failed: ${geminiResp.status} ${geminiErr.slice(0, 500)}`
          });
          await refundSmartChatTextCredits({
            userId,
            charge: textCreditCharge,
            reason: 'gemini_fallback_failed'
          });
          textCreditCharge = null;
          sendEvent('error', { message: `AI 调用失败，请稍后重试` });
          sendEvent('done', { tokenUsage: { inputTokens: 0, outputTokens: 0 } });
          controller.close();
          return;
        }

        const geminiReader = geminiResp.body?.getReader();
        const geminiDecoder = new TextDecoder();
        let geminiBuf = '';
        let geminiOutput = '';
        let geminiFinishReason = '';
        try {
          while (geminiReader) {
            const { done: gDone, value: gVal } = await geminiReader.read();
            if (gDone) break;
            geminiBuf += geminiDecoder.decode(gVal, { stream: true });
            const gLines = geminiBuf.split('\n');
            geminiBuf = gLines.pop() || '';
            for (const gLine of gLines) {
              if (gLine.startsWith('data: ')) {
                const gData = JSON.parse(gLine.slice(6));
                geminiFinishReason = gData.candidates?.[0]?.finishReason || geminiFinishReason;
                const gParts = gData.candidates?.[0]?.content?.parts || [];
                for (const gPart of gParts) {
                  if (gPart.text) {
                    geminiOutput += gPart.text;
                    sendEvent('text', { content: gPart.text });
                  }
                }
              }
            }
          }
        } finally {
          geminiStreamRequest.clearTimeout();
        }
        if (!geminiOutput.trim() || geminiFinishReason !== 'STOP') {
          throw new Error(`Gemini stream incomplete (${geminiFinishReason || 'missing finishReason'})`);
        }
        await recordAiProviderUsage({
          userId,
          provider: 'gemini',
          model: fallbackModel,
          endpoint: 'streamGenerateContent',
          source: 'smart_chat_text',
          status: 'succeeded',
          fallbackOf: 'deepseek',
          promptChars: geminiPrompt.length,
          responseChars: geminiOutput.length,
          inputTokens: estimateTokensFromText(geminiPrompt) ?? 0,
          outputTokens: estimateTokensFromText(geminiOutput) ?? 0,
          tokenUsageSource: 'estimated',
          latencyMs: geminiTiming.mark(),
          startedAt: geminiTiming.startedAt
        });
        await settleSmartChatTextCredits({
          userId,
          charge: textCreditCharge,
          inputTokens: estimateTokensFromText(geminiPrompt) ?? 0,
          outputTokens: estimateTokensFromText(geminiOutput) ?? 0,
          reason: 'gemini_success'
        });
        textCreditCharge = null;
        sendEvent('done', { tokenUsage: { inputTokens: 0, outputTokens: 0 } });
        controller.close();
        return;
      } else if (useGeminiFallback) {
        await refundSmartChatTextCredits({
          userId,
          charge: textCreditCharge,
          reason: 'text_provider_unavailable'
        });
        textCreditCharge = null;
        sendEvent('error', { message: 'AI 服务暂时不可用，请稍后重试' });
        sendEvent('done', { tokenUsage: { inputTokens: 0, outputTokens: 0 } });
        controller.close();
        return;
      }

      // DeepSeek 正常：解析 OpenAI-compatible SSE 流
      const reader = aiResp.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let deepseekOutput = '';
      let deepseekDone = false;

      const processDeepSeekLine = (line: string) => {
        if (!line.startsWith('data: ')) return;
        const data = line.slice(6).trim();
        if (data === '[DONE]') {
          deepseekDone = true;
          return;
        }
        if (data) {
          const parsed = JSON.parse(data) as {
            choices?: Array<{ delta?: { content?: string } }>;
          };
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            deepseekOutput += content;
            sendEvent('text', { content });
          }
        }
      };

      try {
        while (reader) {
          const { done: streamDone, value } = await reader.read();
          if (streamDone) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) processDeepSeekLine(line);
        }
        buffer += decoder.decode();
        if (buffer.trim()) processDeepSeekLine(buffer.trim());
      } finally {
        deepseekStreamRequest.clearTimeout();
      }

      if (!deepseekDone || !deepseekOutput.trim()) {
        throw new Error(
          `DeepSeek stream incomplete (${deepseekDone ? 'empty response' : 'missing [DONE]'})`
        );
      }

      await recordAiProviderUsage({
        userId,
        provider: openaiProvider,
        model: openaiModel,
        endpoint: 'chat/completions',
        source: 'smart_chat_text',
        status: 'succeeded',
        promptChars: enrichedPrompt.length + finalSystemPrompt.length,
        responseChars: deepseekOutput.length,
        inputTokens: estimateTokensFromText(finalSystemPrompt + String.fromCharCode(10) + enrichedPrompt) ?? 0,
        outputTokens: estimateTokensFromText(deepseekOutput) ?? 0,
        tokenUsageSource: 'estimated',
        latencyMs: deepseekTiming.mark(),
        startedAt: deepseekTiming.startedAt
      });
      await settleSmartChatTextCredits({
        userId,
        charge: textCreditCharge,
        inputTokens: estimateTokensFromText(finalSystemPrompt + String.fromCharCode(10) + enrichedPrompt) ?? 0,
        outputTokens: estimateTokensFromText(deepseekOutput) ?? 0,
        reason: 'deepseek_success'
      });
      textCreditCharge = null;
      sendEvent('done', { tokenUsage: { inputTokens: 0, outputTokens: 0 } });
      controller.close();
    } catch (err: unknown) {
      console.error('[SmartChat] Error:', err);
      await refundSmartChatTextCredits({
        userId,
        charge: textCreditCharge,
        reason: 'text_stream_error'
      });
      textCreditCharge = null;
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      sendEvent('error', { message: errMsg });
      sendEvent('done', { tokenUsage: { inputTokens: 0, outputTokens: 0 } });
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' }
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : 'Request parsing error';
    return new Response(JSON.stringify({ error: errMsg }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
