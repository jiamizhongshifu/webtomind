/**
 * Workspace Studio Readiness API
 * POST: 评估文档发布就绪度（逻辑连贯 + 引用完整 + 结构完整）
 */

import {
  getUserIdFromRequest,
  getCorsHeadersForRequest
} from '../utils/auth';
import { withNoThinking } from '../utils/gemini-helpers';
import { normalizeGeminiModel } from '../utils/model-registry';
import { fetchModelWithTimeout } from '../utils/model-fetch';
import {
  consumeModelRateLimit,
  createModelRateLimitResponse
} from '../utils/model-rate-limit';
import {
  getDeepSeekTextConnection,
  isOfficialGeminiEnabled
} from '../utils/model-provider-routing';
import {
  createAiProviderUsageTiming,
  estimateTokensFromText,
  extractOpenAICompatibleUsage,
  recordAiProviderUsage,
  resolveTokenUsageSource
} from '../utils/ai-provider-usage';

export const config = {
  runtime: 'edge',
  maxDuration: 60
};

interface StudioReadinessRequest {
  title?: string;
  content?: Record<string, unknown>;
}

interface ReadinessCheckItem {
  key: string;
  label: string;
  score: number;
  maxScore: number;
  passed: boolean;
  detail: string;
}

interface ReadinessResult {
  score: number;
  level: 'poor' | 'fair' | 'good' | 'ready';
  summary: string;
  checks: ReadinessCheckItem[];
  suggestions: string[];
  model: string;
}

type NodeLike = {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: NodeLike[];
  text?: string;
};

function jsonResponse(
  data: unknown,
  corsHeaders: Record<string, string>,
  status = 200
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders }
  });
}

function countWordsFromContent(content: Record<string, unknown>): number {
  const root = content as NodeLike;
  const queue: NodeLike[] = [root];
  let words = 0;
  while (queue.length > 0) {
    const node = queue.shift();
    if (!node) continue;
    if (node.type === 'text' && node.text) {
      words += node.text.trim().length;
    }
    if (Array.isArray(node.content)) {
      queue.push(...node.content);
    }
  }
  return words;
}

function collectStats(content: Record<string, unknown>) {
  const root = content as NodeLike;
  const queue: NodeLike[] = [root];
  let headingCount = 0;
  let paragraphCount = 0;
  let noteCount = 0;
  let noteWithSourceCount = 0;
  let imageCount = 0;

  while (queue.length > 0) {
    const node = queue.shift();
    if (!node) continue;

    if (node.type === 'heading') headingCount += 1;
    if (node.type === 'paragraph') paragraphCount += 1;
    if (node.type === 'noteBlock' || node.type === 'blockquote') {
      noteCount += 1;
      const sourceUrl = String(node.attrs?.sourceUrl || '');
      if (sourceUrl.startsWith('http://') || sourceUrl.startsWith('https://')) {
        noteWithSourceCount += 1;
      }
    }
    if (node.type === 'image') imageCount += 1;

    if (Array.isArray(node.content)) queue.push(...node.content);
  }

  return {
    headingCount,
    paragraphCount,
    noteCount,
    noteWithSourceCount,
    imageCount,
    wordCount: countWordsFromContent(content)
  };
}

function fallbackHeuristicResult(
  title: string,
  content: Record<string, unknown>
): ReadinessResult {
  const stats = collectStats(content);

  const structureScore = Math.min(
    30,
    (stats.headingCount > 0 ? 10 : 0) +
      Math.min(14, stats.paragraphCount * 2) +
      (stats.wordCount >= 300 ? 6 : stats.wordCount >= 120 ? 3 : 0)
  );

  const citationScore =
    stats.noteCount === 0
      ? 8
      : Math.min(
          35,
          Math.round((stats.noteWithSourceCount / Math.max(1, stats.noteCount)) * 35)
        );

  const coherenceScore =
    stats.paragraphCount >= 4
      ? 35
      : stats.paragraphCount >= 2
        ? 24
        : stats.paragraphCount >= 1
          ? 12
          : 0;

  const total = Math.max(0, Math.min(100, structureScore + citationScore + coherenceScore));
  const level: ReadinessResult['level'] =
    total >= 85 ? 'ready' : total >= 70 ? 'good' : total >= 50 ? 'fair' : 'poor';

  const checks: ReadinessCheckItem[] = [
    {
      key: 'structure',
      label: '结构完整性',
      score: structureScore,
      maxScore: 30,
      passed: structureScore >= 20,
      detail: `标题 ${stats.headingCount}，段落 ${stats.paragraphCount}，字数约 ${stats.wordCount}`
    },
    {
      key: 'citation',
      label: '引用与证据',
      score: citationScore,
      maxScore: 35,
      passed: citationScore >= 24,
      detail: `引用块 ${stats.noteCount}，带来源引用 ${stats.noteWithSourceCount}`
    },
    {
      key: 'coherence',
      label: '逻辑连贯性',
      score: coherenceScore,
      maxScore: 35,
      passed: coherenceScore >= 24,
      detail: `基于段落层次与内容密度进行启发式评估`
    }
  ];

  const suggestions: string[] = [];
  if (stats.headingCount === 0) suggestions.push('补充至少一个一级或二级标题，明确文章主线。');
  if (stats.noteCount > stats.noteWithSourceCount) {
    suggestions.push('为引用块补全来源 URL，提升可追溯性。');
  }
  if (stats.paragraphCount < 3) suggestions.push('增加论证段落，形成“观点-解释-证据-结论”结构。');
  if (suggestions.length === 0) suggestions.push('已具备发布基础，可做一次人工语气校对后发布。');

  return {
    score: total,
    level,
    summary: `${title || '该文档'}当前发布就绪度为 ${total}/100。`,
    checks,
    suggestions: suggestions.slice(0, 4),
    model: 'heuristic-fallback'
  };
}

function buildPrompt(title: string, content: Record<string, unknown>): string {
  return `
你是资深中文编辑，请对一篇待发布文章做“发布就绪度评估”。

评估维度：
1) 结构完整性（0-30）
2) 引用与证据（0-35）
3) 逻辑连贯性（0-35）

请严格输出 JSON（不要 markdown，不要多余解释），格式如下：
{
  "score": 0-100 的整数,
  "level": "poor|fair|good|ready",
  "summary": "一句话总结",
  "checks": [
    {"key":"structure","label":"结构完整性","score":0-30,"maxScore":30,"passed":true/false,"detail":"..."},
    {"key":"citation","label":"引用与证据","score":0-35,"maxScore":35,"passed":true/false,"detail":"..."},
    {"key":"coherence","label":"逻辑连贯性","score":0-35,"maxScore":35,"passed":true/false,"detail":"..."}
  ],
  "suggestions": ["最多4条可执行建议"]
}

标题：
${title || '未命名草稿'}

文档 JSON：
${JSON.stringify(content).slice(0, 24_000)}
`.trim();
}

function extractJsonText(raw: string): string {
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch?.[1]) return fenceMatch[1].trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return raw.slice(start, end + 1).trim();
  }
  return raw.trim();
}

function normalizeModelResult(rawText: string): Omit<ReadinessResult, 'model'> | null {
  try {
    const parsed = JSON.parse(extractJsonText(rawText)) as Partial<ReadinessResult>;
    const checks = Array.isArray(parsed.checks) ? parsed.checks : [];
    const suggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions : [];
    const score = Math.max(0, Math.min(100, Number(parsed.score || 0)));
    const level = ['poor', 'fair', 'good', 'ready'].includes(String(parsed.level))
      ? (parsed.level as ReadinessResult['level'])
      : score >= 85
        ? 'ready'
        : score >= 70
          ? 'good'
          : score >= 50
            ? 'fair'
            : 'poor';

    return {
      score,
      level,
      summary: String(parsed.summary || ''),
      checks: checks
        .map((item) => ({
          key: String((item as ReadinessCheckItem).key || ''),
          label: String((item as ReadinessCheckItem).label || ''),
          score: Number((item as ReadinessCheckItem).score || 0),
          maxScore: Number((item as ReadinessCheckItem).maxScore || 0),
          passed: Boolean((item as ReadinessCheckItem).passed),
          detail: String((item as ReadinessCheckItem).detail || '')
        }))
        .slice(0, 3),
      suggestions: suggestions.map((item) => String(item)).slice(0, 4)
    };
  } catch {
    return null;
  }
}

async function runGeminiReadiness(
  apiKey: string,
  prompt: string
): Promise<{ text: string; model: string }> {
  const model = normalizeGeminiModel(process.env.STUDIO_READINESS_MODEL);
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: withNoThinking({
          temperature: 0.2,
          responseMimeType: 'application/json'
        })
      })
    }
  );

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Gemini request failed: ${response.status} ${text}`);
  }

  const payload = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };

  const text =
    payload.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || '')
      .join('')
      .trim() || '';

  if (!text) throw new Error('Gemini returned empty content');
  return { text, model };
}

async function runDeepSeekReadiness(
  prompt: string,
  userId: string
): Promise<{ text: string; model: string }> {
  const connection = getDeepSeekTextConnection();
  if (!connection.apiKey) throw new Error('DeepSeek is not configured');
  const timing = createAiProviderUsageTiming();
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
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 1800,
        response_format: { type: 'json_object' },
        stream: false
      })
    },
    { timeoutMs: 25_000, label: 'studio readiness' }
  );
  if (!response.ok) {
    const error = await response.text().catch(() => '');
    await recordAiProviderUsage({
      userId,
      provider: connection.provider,
      model: connection.model,
      endpoint: 'chat/completions',
      source: 'workspace_studio_readiness',
      status: 'failed',
      promptChars: prompt.length,
      inputTokens: estimateTokensFromText(prompt),
      tokenUsageSource: 'estimated',
      latencyMs: timing.mark(),
      startedAt: timing.startedAt,
      errorMessage: `${response.status} ${error.slice(0, 500)}`
    });
    throw new Error(`DeepSeek request failed: ${response.status}`);
  }
  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: unknown;
  };
  const text = payload.choices?.[0]?.message?.content?.trim() || '';
  if (!text) throw new Error('DeepSeek returned empty content');
  const usage = extractOpenAICompatibleUsage(payload);
  await recordAiProviderUsage({
    userId,
    provider: connection.provider,
    model: connection.model,
    endpoint: 'chat/completions',
    source: 'workspace_studio_readiness',
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
  return { text, model: connection.model };
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
    bucket: 'workspace_studio_readiness',
    maxRequests: 12
  });
  if (!rateLimit.allowed) {
    return createModelRateLimitResponse(rateLimit, corsHeaders);
  }

  try {
    const body = (await request.json()) as StudioReadinessRequest;
    const content = (body.content || {}) as Record<string, unknown>;
    const title = String(body.title || '未命名草稿');
    if (!content || typeof content !== 'object') {
      return jsonResponse({ error: 'content 不能为空' }, corsHeaders, 400);
    }

    const apiKey =
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_API_KEY ||
      process.env.GOOGLE_GEMINI_API_KEY;

    try {
      const prompt = buildPrompt(title, content);
      let generated: { text: string; model: string };
      try {
        generated = await runDeepSeekReadiness(prompt, userId);
      } catch (deepSeekError) {
        if (!apiKey || !isOfficialGeminiEnabled()) throw deepSeekError;
        generated = await runGeminiReadiness(apiKey, prompt);
      }
      const parsed = normalizeModelResult(generated.text);
      if (!parsed) {
        const fallback = fallbackHeuristicResult(title, content);
        return jsonResponse(
          { success: true, ...fallback, model: `${generated.model}+heuristic-fallback` },
          corsHeaders
        );
      }

      return jsonResponse(
        {
          success: true,
          ...parsed,
          model: generated.model
        },
        corsHeaders
      );
    } catch {
      const fallback = fallbackHeuristicResult(title, content);
      return jsonResponse({ success: true, ...fallback }, corsHeaders);
    }
  } catch (error: unknown) {
    return jsonResponse(
      {
        error: '发布就绪度评估失败',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      corsHeaders,
      500
    );
  }
}
