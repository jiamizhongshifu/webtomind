/**
 * Image prompt optimizer
 * POST /api/image/prompt-optimize
 */

import { getUserIdFromRequest, getCorsHeadersForRequest } from '../utils/auth';
import { withNoThinking } from '../utils/gemini-helpers';
import {
  DEEPSEEK_V4_FLASH_0731_MODEL,
  normalizeGeminiModel
} from '../utils/model-registry';
import {
  createAiProviderUsageTiming,
  estimateTokensFromText,
  extractGeminiUsage,
  extractOpenAICompatibleUsage,
  recordAiProviderUsage,
  resolveTokenUsageSource
} from '../utils/ai-provider-usage';
import { UNIVERSAL_PROMPT_OPTIMIZER_CORE } from '../../src/shared/prompt-optimizer-core';
import { isOfficialGeminiEnabled } from '../utils/model-provider-routing';
import {
  consumeModelRateLimit,
  createModelRateLimitResponse
} from '../utils/model-rate-limit';

export const config = {
  runtime: 'edge',
  maxDuration: 60
};

interface OptimizePromptAsset {
  id: string;
  slot: string;
  title: string;
  prompt: string;
  promptZh?: string;
}

interface OptimizePromptDiagnostic {
  id: string;
  severity: string;
  title: string;
  description: string;
  suggestion: string;
}

interface OptimizePromptRequest {
  prompt: string;
  negativePrompt?: string;
  locale?: 'zh-CN' | 'en-US';
  mediaType?: 'image' | 'video';
  promptMode?: 'composed' | 'custom';
  aiTasteScore?: number;
  aiTasteLevel?: 'low' | 'medium' | 'high';
  selectedAssets?: OptimizePromptAsset[];
  diagnostics?: OptimizePromptDiagnostic[];
  videoSettings?: {
    model?: string;
    aspectRatio?: string;
    duration?: number;
    resolution?: string;
    generateAudio?: boolean;
    referenceImageCount?: number;
    referenceVideoCount?: number;
    referenceAudioCount?: number;
    hasFirstFrame?: boolean;
    hasLastFrame?: boolean;
  };
}

interface OptimizePromptResult {
  optimizedPrompt: string;
  optimizedNegativePrompt?: string;
  summary?: string;
  changes?: string[];
}

interface TextGenerationResult {
  text: string;
  model: string;
  provider: 'gemini_official' | 'tuzi' | 'deepseek';
}

const DEFAULT_PROVIDER_TIMEOUT_MS = 12_000;
const MIN_PROVIDER_TIMEOUT_MS = 100;
const MAX_PROVIDER_TIMEOUT_MS = 60_000;

/**
 * DeepSeek is the preferred prompt-optimizer provider but is consistently
 * slower than 12s from the Cloudflare Worker edge (historically 25-51s for
 * the optimizer workload). Give it a dedicated, longer budget so it can
 * actually run; keep fallback providers fast so failures do not cascade.
 */
const PROVIDER_TIMEOUT_MS: Record<TextGenerationResult['provider'], number> = {
  deepseek: 45_000,
  gemini_official: DEFAULT_PROVIDER_TIMEOUT_MS,
  tuzi: DEFAULT_PROVIDER_TIMEOUT_MS
};

const PROVIDER_TIMEOUT_ENV_KEYS: Record<
  TextGenerationResult['provider'],
  string
> = {
  deepseek: 'PROMPT_OPTIMIZER_DEEPSEEK_TIMEOUT_MS',
  gemini_official: 'PROMPT_OPTIMIZER_GEMINI_TIMEOUT_MS',
  tuzi: 'PROMPT_OPTIMIZER_TUZI_TIMEOUT_MS'
};

function getProviderTimeoutMs(
  provider: TextGenerationResult['provider']
): number {
  const configured = Number(
    process.env[PROVIDER_TIMEOUT_ENV_KEYS[provider]] ||
      process.env.PROMPT_OPTIMIZER_PROVIDER_TIMEOUT_MS ||
      PROVIDER_TIMEOUT_MS[provider]
  );
  if (!Number.isFinite(configured)) return PROVIDER_TIMEOUT_MS[provider];
  return Math.min(
    MAX_PROVIDER_TIMEOUT_MS,
    Math.max(MIN_PROVIDER_TIMEOUT_MS, Math.round(configured))
  );
}

async function fetchPromptProvider(
  provider: TextGenerationResult['provider'],
  input: RequestInfo | URL,
  init: RequestInit
): Promise<Response> {
  const timeoutMs = getProviderTimeoutMs(provider);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(
        `${provider} request timed out after ${Math.ceil(timeoutMs / 1000)}s`
      );
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
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

function clampText(value: string | undefined, maxLength: number): string {
  if (!value) return '';
  const trimmed = value.trim();
  return trimmed.length > maxLength
    ? `${trimmed.slice(0, maxLength)}...`
    : trimmed;
}

function buildOptimizePrompt(input: OptimizePromptRequest): string {
  const locale = input.locale === 'en-US' ? 'en-US' : 'zh-CN';
  const outputLanguage = locale === 'zh-CN' ? '中文' : 'English';
  if (input.mediaType === 'video') {
    const settings = input.videoSettings || {};
    const referenceCount = Math.max(
      0,
      Math.min(9, Number(settings.referenceImageCount) || 0)
    );
    const referenceVideoCount = Math.max(
      0,
      Math.min(3, Number(settings.referenceVideoCount) || 0)
    );
    const referenceAudioCount = Math.max(
      0,
      Math.min(3, Number(settings.referenceAudioCount) || 0)
    );
    return `${UNIVERSAL_PROMPT_OPTIMIZER_CORE}

当前任务类型：视频提示词
媒体专项目标：像专业的 Seedance 视频提示词导演一样，把用户的镜头想法整理成时间可执行、主体稳定、动作清楚、可直接生成的视频提示词。
任务：在不改变用户核心创意、人物身份、对白语言和关键情节的前提下，优化下面的视频提示词。

硬性规则：
1. 只输出 JSON，不要 markdown，不要代码块。
2. 不引入用户没有要求的真人名、品牌、版权角色、字幕、Logo、水印或背景音乐。
3. 优先保留用户明确指定的主体、动作、场景、镜头、光线、节奏、声音和负向约束；删除重复、冲突和无法在指定时长内完成的描述。
4. 按可执行顺序组织：主体与场景锚点 → 时间轴动作 → 摄像机 → 光线与材质 → 现场声音/对白 → 连贯性与负向约束。
5. 单个镜头只保留一个主要动作和一种主要运镜。若用户要求多段硬切，按时间顺序压缩为清晰分镜，并确保总时长可实现。
6. 严格区分素材用途：多模态参考素材按同类顺序使用“图片1 / 视频1 / 音频1”引用。通用参考图不是严格首尾帧；参考视频只继承用户指定的主体、运镜、动作或风格；参考音频只继承用户指定的音色、旋律、对白或声音。首帧用于锁定开场，尾帧用于锁定收束。不要臆测素材内容，不要删除用户已有的素材编号。
7. 对白必须保留原语言和原句，不改写含义；需要口型同步时明确正面可见、现场收音、无画外音。
8. optimizedPrompt 必须是完整可直接提交的提示词；optimizedNegativePrompt 给出精炼、非重复的负向约束。
9. 输出语言使用${outputLanguage}。

接口输出映射（严格执行）：
- summary：只写一行最短、最核心的「核心意图」。
- optimizedPrompt：写完整、可直接复制提交的视频提示词，不要混入解释。
- changes：可选填写简短说明；没有必要说明时返回空数组。
- optimizedNegativePrompt：写精炼、非重复、可直接提交的负向约束。

返回 JSON 结构：
{
  "optimizedPrompt": "string",
  "optimizedNegativePrompt": "string",
  "summary": "string",
  "changes": ["string"]
}

生成设置：
${JSON.stringify(
  {
    model: clampText(settings.model, 120) || 'Seedance',
    aspectRatio: clampText(settings.aspectRatio, 20) || '16:9',
    durationSeconds: Number(settings.duration) || 5,
    resolution: clampText(settings.resolution, 20) || '720p',
    generateAudio: settings.generateAudio !== false,
    referenceImageCount: referenceCount,
    referenceVideoCount,
    referenceAudioCount,
    hasFirstFrame: settings.hasFirstFrame === true,
    hasLastFrame: settings.hasLastFrame === true
  },
  null,
  2
)}

当前提示词：
${clampText(input.prompt, 12000)}

现在只返回 JSON。`;
  }
  const assets = (input.selectedAssets || []).slice(0, 24).map((asset) => ({
    slot: asset.slot,
    title: asset.title,
    prompt: clampText(
      locale === 'zh-CN' && asset.promptZh ? asset.promptZh : asset.prompt,
      320
    )
  }));
  const diagnostics = (input.diagnostics || []).slice(0, 8).map((item) => ({
    severity: item.severity,
    title: item.title,
    suggestion: item.suggestion
  }));

  return `${UNIVERSAL_PROMPT_OPTIMIZER_CORE}

当前任务类型：图像提示词
媒体专项目标：像专业的视觉提示词结构优化专家一样，把泛化描述改成商业可交付、版式明确、可复用的完整图片提示词。
任务：在不改变用户核心意图的前提下，把图片生成提示词优化成更稳定、可复现、可直接用于多模型图片生成的版本。

硬性规则：
1. 只输出 JSON，不要 markdown，不要代码块。
2. 不要引入未提供的第三方品牌、真人名、版权角色或水印。
3. 保留用户已选择素材的核心语义。
4. 不要只堆“高级感、电影感、氛围感、质感、masterpiece、aesthetic”等抽象词；必须把它们翻译成具体画面结构。
5. 按 GPT Image 2 商业提示词母版思路补齐：商业落点（用在哪门生意、给谁看、交付什么物料）、整体定位（是什么/不是什么）、整体版式（比例、分区、视觉中心、阅读路径）、主体刻画、分模块细节、结构化信息区、视觉质量、特别要求。
6. 如果出现色块/面板/卡片/窗口，必须说明它承担什么功能：承载标题、组织卖点、引导阅读、区分层级、给主体做舞台或收束留白。
7. optimizedPrompt 必须是完整可用提示词，不要只输出修改建议；optimizedNegativePrompt 必须是完整负向提示词。
8. 输出语言使用${outputLanguage}。

接口输出映射（严格执行）：
- summary：只写一行最短、最核心的「核心意图」。
- optimizedPrompt：写完整、可直接复制提交的图像提示词，不要混入解释。
- changes：可选填写简短说明；没有必要说明时返回空数组。
- optimizedNegativePrompt：写完整、可直接提交的负向提示词。

返回 JSON 结构：
{
  "optimizedPrompt": "string",
  "optimizedNegativePrompt": "string",
  "summary": "string",
  "changes": ["string"]
}

当前模式：${input.promptMode || 'composed'}

AI味检测：
${JSON.stringify(
  {
    score: input.aiTasteScore ?? null,
    level: input.aiTasteLevel || 'unknown'
  },
  null,
  2
)}

当前提示词：
${clampText(input.prompt, 6000)}

当前负向提示词：
${clampText(input.negativePrompt, 1600) || '无'}

已选择素材：
${JSON.stringify(assets, null, 2)}

结构检测结果：
${JSON.stringify(diagnostics, null, 2)}

现在只返回 JSON。`;
}

function parseJsonResult(text: string): OptimizePromptResult {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  const jsonText =
    start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;
  const parsed = JSON.parse(jsonText) as Partial<OptimizePromptResult>;
  if (!parsed.optimizedPrompt || typeof parsed.optimizedPrompt !== 'string') {
    throw new Error('optimizedPrompt missing');
  }
  return {
    optimizedPrompt: parsed.optimizedPrompt,
    optimizedNegativePrompt:
      typeof parsed.optimizedNegativePrompt === 'string'
        ? parsed.optimizedNegativePrompt
        : '',
    summary: typeof parsed.summary === 'string' ? parsed.summary : '',
    changes: Array.isArray(parsed.changes)
      ? parsed.changes.filter(
          (item): item is string => typeof item === 'string'
        )
      : []
  };
}

function normalizeChatBaseURL(baseURL: string): string {
  const trimmed = baseURL.replace(/\/+$/, '');
  return /\/v\d+$/i.test(trimmed) ? trimmed : `${trimmed}/v1`;
}

function getCloudflareAiGatewayHeaders(
  apiBaseUrl: string
): Record<string, string> {
  const token = String(
    process.env.CLOUDFLARE_AI_GATEWAY_RUN_TOKEN || ''
  ).trim();
  if (!token) return {};
  try {
    if (new URL(apiBaseUrl).hostname !== 'gateway.ai.cloudflare.com') {
      return {};
    }
  } catch {
    return {};
  }
  return { 'cf-aig-authorization': `Bearer ${token}` };
}

async function generateTextWithOfficialGemini(
  apiKey: string,
  prompt: string,
  userId: string
): Promise<TextGenerationResult> {
  const model = normalizeGeminiModel(
    process.env.STUDIO_AI_MODEL || process.env.GEMINI_MODEL
  );
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const timing = createAiProviderUsageTiming();

  try {
    const response = await fetchPromptProvider('gemini_official', apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: withNoThinking({
          temperature: 0.45,
          topP: 0.9,
          responseMimeType: 'application/json'
        })
      })
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      await recordAiProviderUsage({
        userId,
        provider: 'gemini',
        model,
        endpoint: 'generateContent',
        source: 'image_prompt_optimize',
        status: 'failed',
        promptChars: prompt.length,
        inputTokens: estimateTokensFromText(prompt),
        tokenUsageSource: 'estimated',
        latencyMs: timing.mark(),
        startedAt: timing.startedAt,
        errorMessage: `Gemini request failed: ${response.status} ${text.slice(0, 500)}`
      });
      throw new Error(
        `Gemini request failed: ${response.status} ${text.slice(0, 500)}`
      );
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
      source: 'image_prompt_optimize',
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

    return { text, model, provider: 'gemini_official' };
  } catch (error) {
    if (
      error instanceof Error &&
      !error.message.startsWith('Gemini request failed')
    ) {
      await recordAiProviderUsage({
        userId,
        provider: 'gemini',
        model,
        endpoint: 'generateContent',
        source: 'image_prompt_optimize',
        status: 'failed',
        promptChars: prompt.length,
        inputTokens: estimateTokensFromText(prompt),
        tokenUsageSource: 'estimated',
        latencyMs: timing.mark(),
        startedAt: timing.startedAt,
        errorMessage: error.message
      });
    }
    throw error;
  }
}

async function generateTextWithOpenAICompatible(input: {
  provider: 'tuzi' | 'deepseek';
  apiKey: string;
  baseURL: string;
  model: string;
  prompt: string;
  userId: string;
}): Promise<TextGenerationResult> {
  const timing = createAiProviderUsageTiming();
  try {
    const response = await fetchPromptProvider(
      input.provider,
      `${normalizeChatBaseURL(input.baseURL)}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${input.apiKey}`,
          ...getCloudflareAiGatewayHeaders(input.baseURL)
        },
        body: JSON.stringify({
          model: input.model,
          messages: [{ role: 'user', content: input.prompt }],
          temperature: 0.45,
          max_tokens: 4096,
          stream: false
        })
      }
    );

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      await recordAiProviderUsage({
        userId: input.userId,
        provider: input.provider,
        model: input.model,
        endpoint: 'chat/completions',
        source: 'image_prompt_optimize',
        status: 'failed',
        promptChars: input.prompt.length,
        inputTokens: estimateTokensFromText(input.prompt),
        tokenUsageSource: 'estimated',
        latencyMs: timing.mark(),
        startedAt: timing.startedAt,
        errorMessage: `${input.provider} request failed: ${response.status} ${text.slice(0, 500)}`
      });
      throw new Error(
        `${input.provider} request failed: ${response.status} ${text.slice(0, 500)}`
      );
    }

    const result = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: unknown;
    };
    const text = result.choices?.[0]?.message?.content?.trim() || '';
    if (!text) {
      throw new Error(`${input.provider} returned empty content`);
    }

    const usage = extractOpenAICompatibleUsage(result);
    await recordAiProviderUsage({
      userId: input.userId,
      provider: input.provider,
      model: input.model,
      endpoint: 'chat/completions',
      source: 'image_prompt_optimize',
      status: 'succeeded',
      promptChars: input.prompt.length,
      responseChars: text.length,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.totalTokens,
      tokenUsageSource: resolveTokenUsageSource(usage),
      latencyMs: timing.mark(),
      startedAt: timing.startedAt
    });

    return { text, model: input.model, provider: input.provider };
  } catch (error) {
    if (error instanceof Error && !error.message.includes('request failed')) {
      await recordAiProviderUsage({
        userId: input.userId,
        provider: input.provider,
        model: input.model,
        endpoint: 'chat/completions',
        source: 'image_prompt_optimize',
        status: 'failed',
        promptChars: input.prompt.length,
        inputTokens: estimateTokensFromText(input.prompt),
        tokenUsageSource: 'estimated',
        latencyMs: timing.mark(),
        startedAt: timing.startedAt,
        errorMessage: error.message
      });
    }
    throw error;
  }
}

async function generateTextWithFallback(
  prompt: string,
  userId: string
): Promise<TextGenerationResult> {
  const attempts: Array<{
    provider: TextGenerationResult['provider'];
    run: () => Promise<TextGenerationResult>;
  }> = [];

  const deepseekKey =
    process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY;
  if (deepseekKey) {
    attempts.push({
      provider: 'deepseek',
      run: () =>
        generateTextWithOpenAICompatible({
          provider: 'deepseek',
          apiKey: deepseekKey,
          baseURL:
            process.env.DEEPSEEK_BASE_URL ||
            process.env.OPENAI_BASE_URL ||
            'https://api.deepseek.com',
          model: DEEPSEEK_V4_FLASH_0731_MODEL,
          prompt,
          userId
        })
    });
  }

  const officialGeminiKey =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GOOGLE_GEMINI_API_KEY;
  if (officialGeminiKey && isOfficialGeminiEnabled()) {
    attempts.push({
      provider: 'gemini_official',
      run: () =>
        generateTextWithOfficialGemini(officialGeminiKey, prompt, userId)
    });
  }

  const tuziKey = process.env.TUZI_TEXT_API_KEY || process.env.TUZI_API_KEY;
  if (tuziKey) {
    attempts.push({
      provider: 'tuzi',
      run: () =>
        generateTextWithOpenAICompatible({
          provider: 'tuzi',
          apiKey: tuziKey,
          baseURL:
            process.env.TUZI_TEXT_BASE_URL ||
            process.env.TUZI_API_BASE_URL ||
            'https://api.tu-zi.com',
          model:
            process.env.TUZI_PROMPT_OPTIMIZE_MODEL ||
            process.env.TUZI_TEXT_MODEL ||
            process.env.TUZI_GEMINI_MODEL ||
            'gemini-2.5-flash',
          prompt,
          userId
        })
    });
  }

  if (attempts.length === 0) {
    throw new Error(
      'No prompt optimizer provider configured. Set GEMINI_API_KEY, TUZI_API_KEY, or DEEPSEEK_API_KEY.'
    );
  }

  const errors: string[] = [];
  for (const attempt of attempts) {
    try {
      return await attempt.run();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      errors.push(`${attempt.provider}: ${message}`);
      console.warn('[PromptOptimize] provider failed, trying fallback:', {
        provider: attempt.provider,
        error: message.slice(0, 500)
      });
    }
  }

  throw new Error(
    `All prompt optimizer providers failed. ${errors.join(' | ')}`
  );
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
    bucket: 'image_prompt_optimize',
    maxRequests: 12
  });
  if (!rateLimit.allowed) {
    return createModelRateLimitResponse(rateLimit, corsHeaders);
  }

  let requestLocale: OptimizePromptRequest['locale'] = 'zh-CN';
  try {
    const body = (await request.json()) as OptimizePromptRequest;
    requestLocale = body.locale;
    if (!body.prompt || body.prompt.trim().length === 0) {
      return jsonResponse({ error: '提示词不能为空' }, corsHeaders, 400);
    }

    const generated = await generateTextWithFallback(
      buildOptimizePrompt(body),
      userId
    );

    let parsed: OptimizePromptResult;
    try {
      parsed = parseJsonResult(generated.text);
    } catch {
      parsed = {
        optimizedPrompt: generated.text,
        optimizedNegativePrompt: body.negativePrompt || '',
        summary: body.locale === 'en-US' ? 'Optimized prompt' : '已优化提示词',
        changes: []
      };
    }

    return jsonResponse(
      {
        success: true,
        optimizedPrompt: parsed.optimizedPrompt,
        optimizedNegativePrompt:
          parsed.optimizedNegativePrompt || body.negativePrompt || '',
        summary: parsed.summary || '',
        changes: parsed.changes || [],
        model: generated.model,
        provider: generated.provider
      },
      corsHeaders
    );
  } catch (error: unknown) {
    return jsonResponse(
      {
        error:
          requestLocale === 'en-US'
            ? 'Prompt optimization is temporarily unavailable'
            : '提示词优化服务暂时不可用',
        details: error instanceof Error ? error.message : 'Unknown error',
        errorCode: 'PROMPT_OPTIMIZER_UNAVAILABLE',
        retryable: true
      },
      corsHeaders,
      503
    );
  }
}
