/**
 * Agent 聊天 API - 支持意图识别、图片生成和联网搜索
 *
 * 功能：
 * 1. 意图识别 - 自动判断 TEXT/IMAGE/SEARCH
 * 2. 文本对话 - 使用 gemini-3.1-flash-lite-preview
 * 3. 图片生成 - 使用 gemini-3.1-flash-image-preview
 * 4. 联网搜索 - 使用 gemini-3.1-flash-lite-preview + Google Search Grounding
 *
 * [DISABLED] NotebookLM 功能暂时屏蔽，后续可能恢复
 */

import {
  getCorsHeadersForRequest,
  getSupabaseAdmin,
  verifyTokenAndGetUserId
} from '../utils/auth';
import {
  DEFAULT_ASK_GROUNDING_MODEL,
  DEEPSEEK_V4_FLASH_0731_MODEL,
  DEFAULT_SMARTCHAT_TEXT_MODEL,
  DEFAULT_THINKING_MODEL,
  normalizeGeminiModel
} from '../utils/model-registry';
import { withNoThinking } from '../utils/gemini-helpers';

export const config = {
  runtime: 'edge',
  regions: ['iad1']
};

const ASK_GROUNDING_MODEL = normalizeGeminiModel(
  process.env.ASK_GROUNDING_MODEL || DEFAULT_ASK_GROUNDING_MODEL
);
const TEXT_MODEL = normalizeGeminiModel(
  process.env.SMARTCHAT_TEXT_MODEL || DEFAULT_SMARTCHAT_TEXT_MODEL
);
const THINKING_MODEL = normalizeGeminiModel(
  process.env.THINKING_MODEL || DEFAULT_THINKING_MODEL
);

function geminiGenerateUrl(model: string, apiKey: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
}

function getDeepSeekTextConfig(): {
  apiKey: string;
  baseUrl: string;
  model: string;
} {
  return {
    apiKey: process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY || '',
    baseUrl: (
      process.env.DEEPSEEK_BASE_URL ||
      process.env.OPENAI_BASE_URL ||
      'https://api.deepseek.com'
    ).replace(/\/+$/, ''),
    model: DEEPSEEK_V4_FLASH_0731_MODEL
  };
}

interface ChatRequestBody {
  prompt: string;
  provider?: 'claude' | 'gemini' | 'auto';
  context?: {
    references?: string;
    history?: string;
    pageInfo?: { url: string; title: string };
    referenceImages?: Array<{ data: string; mimeType: string }>;
  };
  sessionId?: string;
}

type IntentType =
  | 'TEXT'
  | 'IMAGE'
  | 'SEARCH'
  | 'NOTEBOOKLM'
  | 'VIDEO'
  | 'INFOGRAPHIC'
  | 'URL_ANALYSIS';
type NotebookLMOutputType =
  | 'flashcards'
  | 'mindmap'
  | 'quiz'
  | 'report'
  | 'summary'
  | 'video'
  | 'infographic';

interface UrlAnalysisResult {
  url: string;
  success: boolean;
  title?: string;
  summary?: string;
  keyPoints?: string[];
  error?: string;
}

interface IntentResult {
  intent: IntentType;
  imagePrompt: string;
  notebooklm?: {
    outputType: NotebookLMOutputType;
    sourceUrl?: string;
    sourceText?: string;
  };
  urls?: string[]; // 多 URL 分析
}

/**
 * 分析用户意图 - 优化版
 * 1. 快速路径检测：明显意图直接返回，跳过 API 调用
 * 2. 简化 Prompt：减少上下文长度
 * 3. Structured Output：使用 JSON Schema 确保稳定输出
 * 4. 超时控制：5 秒超时，降级为 TEXT
 */
async function analyzeIntent(
  apiKey: string,
  prompt: string,
  context?: { references?: string; history?: string },
  hasReferenceImages?: boolean
): Promise<IntentResult> {
  const hasReferences =
    context?.references && context.references.trim().length > 0;

  // ========== 快速路径 1: 多 URL 分析 ==========
  const allUrls = prompt.match(/https?:\/\/[^\s<>"{}|\\^`[\]]+/g) || [];
  const uniqueUrls = Array.from(new Set(allUrls)).slice(0, 10);
  const urlAnalysisKeywords = [
    '分析',
    '总结',
    '对比',
    '比较',
    '提取',
    '汇总',
    '整理'
  ];

  if (
    uniqueUrls.length >= 2 &&
    urlAnalysisKeywords.some((kw) => prompt.includes(kw))
  ) {
    console.log('[AgentChat] Fast path: URL_ANALYSIS');
    return { intent: 'URL_ANALYSIS', imagePrompt: '', urls: uniqueUrls };
  }

  // ========== 快速路径 2: 明显的图片生成请求 ==========
  const imageKeywords = [
    '画',
    '生成图片',
    '画一个',
    '帮我画',
    '画个',
    '生成一张',
    '创作图片',
    'draw',
    'generate image'
  ];
  const isObviousImage =
    imageKeywords.some((kw) => prompt.includes(kw)) || hasReferenceImages;

  if (isObviousImage && !prompt.includes('?') && prompt.length < 100) {
    // 短请求 + 图片关键词 → 直接判定为图片生成
    console.log('[AgentChat] Fast path: IMAGE (obvious keywords)');
    return { intent: 'IMAGE', imagePrompt: prompt };
  }

  // ========== 快速路径 3: 明显的搜索请求 ==========
  const searchKeywords = [
    '天气',
    '新闻',
    '股票',
    '比赛',
    '今天',
    '现在',
    '最新',
    '实时',
    '当前',
    '价格'
  ];
  const isObviousSearch = searchKeywords.some((kw) => prompt.includes(kw));

  if (isObviousSearch && !hasReferences && !hasReferenceImages) {
    console.log('[AgentChat] Fast path: SEARCH (obvious keywords)');
    return { intent: 'SEARCH', imagePrompt: '' };
  }

  // ========== 需要 API 判断的情况 ==========
  // 简化 Prompt，减少上下文
  const truncatedRefs = hasReferences
    ? context!.references!.substring(0, 300) +
      (context!.references!.length > 300 ? '...' : '')
    : '';
  const truncatedHistory = context?.history
    ? context.history.substring(0, 200) +
      (context.history.length > 200 ? '...' : '')
    : '';

  const intentPrompt = `判断用户意图：IMAGE(生成图片) / SEARCH(需要实时信息) / TEXT(普通对话)

规则：
- 画图、生成图片 → IMAGE
- 天气、新闻、股票等实时信息 → SEARCH  
- 其他 → TEXT
${hasReferenceImages ? '- 用户已上传图片，如需基于图片生成/修改 → IMAGE' : ''}
${truncatedRefs ? `\n参考内容：${truncatedRefs}` : ''}
${truncatedHistory ? `\n历史：${truncatedHistory}` : ''}

用户请求："${prompt.substring(0, 200)}"`;

  // Structured Output Schema
  const intentSchema = {
    type: 'object',
    properties: {
      intent: { type: 'string', enum: ['IMAGE', 'SEARCH', 'TEXT'] },
      imagePrompt: {
        type: 'string',
        description: '图片描述提示词，非IMAGE时为空'
      }
    },
    required: ['intent', 'imagePrompt']
  };

  const apiUrl = geminiGenerateUrl(ASK_GROUNDING_MODEL, apiKey);

  // 5 秒超时控制
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: intentPrompt }] }],
        generationConfig: withNoThinking({
          maxOutputTokens: 128,
          temperature: 0.1,
          responseMimeType: 'application/json',
          responseSchema: intentSchema
        })
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error('[AgentChat] Intent API error:', response.status);
      return isObviousSearch
        ? { intent: 'SEARCH', imagePrompt: '' }
        : { intent: 'TEXT', imagePrompt: '' };
    }

    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const jsonText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    try {
      const result = JSON.parse(jsonText);
      console.log('[AgentChat] Intent result:', result.intent);

      if (result.intent === 'IMAGE') {
        return { intent: 'IMAGE', imagePrompt: result.imagePrompt || prompt };
      }
      if (result.intent === 'SEARCH') {
        return { intent: 'SEARCH', imagePrompt: '' };
      }
      return { intent: 'TEXT', imagePrompt: '' };
    } catch (parseErr) {
      console.error('[AgentChat] JSON parse error:', parseErr);
      // 降级：尝试正则匹配
      const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.intent === 'IMAGE')
          return { intent: 'IMAGE', imagePrompt: parsed.imagePrompt || '' };
        if (parsed.intent === 'SEARCH')
          return { intent: 'SEARCH', imagePrompt: '' };
      }
    }
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === 'AbortError') {
      console.error('[AgentChat] Intent analysis timeout (5s)');
    } else {
      console.error('[AgentChat] Intent analysis error:', err);
    }
  }

  // 默认降级
  return isObviousSearch
    ? { intent: 'SEARCH', imagePrompt: '' }
    : { intent: 'TEXT', imagePrompt: '' };
}

/**
 * 检查是否为私有/内网 IP 地址（防止 SSRF 攻击）
 */
function isPrivateOrReservedIP(hostname: string): boolean {
  // 检查常见的私有/保留地址
  const privatePatterns = [
    /^localhost$/i,
    /^127\./, // Loopback
    /^10\./, // Class A private
    /^192\.168\./, // Class C private
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // Class B private
    /^169\.254\./, // Link-local
    /^0\./, // Current network
    /^100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\./, // Carrier-grade NAT
    /^192\.0\.0\./, // IETF Protocol Assignments
    /^192\.0\.2\./, // TEST-NET-1
    /^198\.51\.100\./, // TEST-NET-2
    /^203\.0\.113\./, // TEST-NET-3
    /^224\./, // Multicast
    /^240\./, // Reserved
    /^255\./, // Broadcast
    /^\[::1\]$/, // IPv6 loopback
    /^\[fc/i, // IPv6 unique local
    /^\[fd/i, // IPv6 unique local
    /^\[fe80:/i // IPv6 link-local
  ];
  return privatePatterns.some((pattern) => pattern.test(hostname));
}

/**
 * 抓取并提取 URL 内容
 */
async function fetchUrlContent(
  url: string
): Promise<{ success: boolean; content?: string; error?: string }> {
  try {
    // SSRF 防护：验证 URL 不指向私有/内网地址
    const parsedUrl = new URL(url);
    if (isPrivateOrReservedIP(parsedUrl.hostname)) {
      console.warn(
        '[AgentChat] SSRF blocked: attempted access to private IP:',
        parsedUrl.hostname
      );
      return {
        success: false,
        error: 'Access to private networks is not allowed'
      };
    }

    // 只允许 http/https 协议
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return { success: false, error: 'Only HTTP/HTTPS protocols are allowed' };
    }

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; WebToMind/1.0)',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}` };
    }

    const html = await response.text();
    const content = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 30000);

    return { success: true, content };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Fetch failed'
    };
  }
}

/**
 * 分析单个 URL 内容
 */
async function analyzeUrlContent(
  apiKey: string,
  url: string,
  content: string
): Promise<UrlAnalysisResult> {
  const apiUrl = geminiGenerateUrl(ASK_GROUNDING_MODEL, apiKey);

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `分析以下网页内容，提取标题、摘要（100-200字）和3-5个关键要点。

网页内容：
${content.substring(0, 15000)}`
              }
            ]
          }
        ],
        generationConfig: withNoThinking({
          temperature: 0.3,
          maxOutputTokens: 1024,
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              summary: { type: 'string' },
              keyPoints: { type: 'array', items: { type: 'string' } }
            },
            required: ['title', 'summary', 'keyPoints']
          }
        })
      })
    });

    if (!response.ok) {
      return { url, success: false, error: 'API error' };
    }

    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const jsonText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!jsonText) {
      return { url, success: false, error: 'No response' };
    }

    const parsed = JSON.parse(jsonText) as {
      title: string;
      summary: string;
      keyPoints: string[];
    };
    return {
      url,
      success: true,
      title: parsed.title,
      summary: parsed.summary,
      keyPoints: parsed.keyPoints
    };
  } catch (err) {
    return {
      url,
      success: false,
      error: err instanceof Error ? err.message : 'Parse error'
    };
  }
}

/**
 * 批量分析多个 URL
 */
async function analyzeMultipleUrls(
  apiKey: string,
  urls: string[],
  prompt: string
): Promise<{ results: UrlAnalysisResult[]; comparison?: string }> {
  console.log('[AgentChat] Analyzing', urls.length, 'URLs');

  // 并行抓取所有 URL
  const fetchResults = await Promise.all(
    urls.map(async (url) => {
      const result = await fetchUrlContent(url);
      return { url, ...result };
    })
  );

  // 并行分析成功抓取的内容
  const analysisPromises = fetchResults
    .filter((r) => r.success && r.content)
    .map((r) => analyzeUrlContent(apiKey, r.url, r.content!));

  const analysisResults = await Promise.all(analysisPromises);

  // 添加抓取失败的结果
  const failedResults: UrlAnalysisResult[] = fetchResults
    .filter((r) => !r.success)
    .map((r) => ({ url: r.url, success: false, error: r.error }));

  const results = [...analysisResults, ...failedResults];

  // 如果有多个成功结果且用户要求比较，生成比较分析
  const successfulResults = results.filter((r) => r.success);
  let comparison: string | undefined;

  if (
    successfulResults.length >= 2 &&
    (prompt.includes('对比') || prompt.includes('比较'))
  ) {
    comparison = await generateComparison(apiKey, successfulResults);
  }

  return { results, comparison };
}

/**
 * 生成多 URL 比较分析
 */
async function generateComparison(
  apiKey: string,
  results: UrlAnalysisResult[]
): Promise<string> {
  const summariesText = results
    .map(
      (r, i) =>
        `【来源 ${i + 1}】${r.title}\n摘要: ${r.summary}\n要点:\n${r.keyPoints?.map((p) => `- ${p}`).join('\n')}`
    )
    .join('\n\n');

  const apiUrl = geminiGenerateUrl(ASK_GROUNDING_MODEL, apiKey);

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `请对比分析以下 ${results.length} 个来源的内容，找出：
1. 共同观点
2. 不同观点
3. 各自的独特信息
4. 综合结论

${summariesText}`
              }
            ]
          }
        ],
        generationConfig: withNoThinking({ temperature: 0.3, maxOutputTokens: 2048 })
      })
    });

    if (!response.ok) {
      return '比较分析生成失败';
    }

    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };

    return (
      data.candidates?.[0]?.content?.parts?.[0]?.text || '无法生成比较分析'
    );
  } catch {
    return '比较分析生成失败';
  }
}

/**
 * 格式化 URL 分析结果为文本
 */
function formatUrlAnalysisResults(
  results: UrlAnalysisResult[],
  comparison?: string
): string {
  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);

  let text = `📊 分析完成 (${successful.length}/${results.length} 成功)\n\n`;

  for (const result of successful) {
    text += `### ${result.title || result.url}\n\n`;
    text += `${result.summary}\n\n`;
    if (result.keyPoints && result.keyPoints.length > 0) {
      text += '**关键要点:**\n';
      for (const point of result.keyPoints) {
        text += `- ${point}\n`;
      }
    }
    text += `\n[查看原文](${result.url})\n\n---\n\n`;
  }

  if (failed.length > 0) {
    text += '**以下链接分析失败:**\n';
    for (const result of failed) {
      text += `- ${result.url}: ${result.error}\n`;
    }
    text += '\n';
  }

  if (comparison) {
    text += '## 综合比较分析\n\n' + comparison;
  }

  return text;
}

/**
 * 使用 Gemini API 处理内容生成（替代 NotebookLM）
 * 优势：无需 Cookie，直接使用 API Key
 * @deprecated 保留供将来使用，当前使用 NotebookLM 代理
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function processWithGemini(
  apiKey: string,
  outputType: NotebookLMOutputType,
  sourceUrl?: string,
  sourceText?: string
): Promise<{ success: boolean; result?: unknown; error?: string }> {
  console.log('[AgentChat] Processing with Gemini:', {
    outputType,
    hasUrl: !!sourceUrl,
    hasText: !!sourceText
  });

  try {
    // 1. 获取内容（如果是 URL，先抓取）
    let content = sourceText || '';
    if (sourceUrl) {
      try {
        const fetchResponse = await fetch(sourceUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WebToMind/1.0)' }
        });
        if (fetchResponse.ok) {
          const html = await fetchResponse.text();
          // 简单提取文本内容
          content = html
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 50000); // 限制长度
        }
      } catch (fetchErr) {
        console.warn('[AgentChat] Failed to fetch URL:', fetchErr);
        if (!sourceText) {
          return { success: false, error: '无法获取 URL 内容' };
        }
      }
    }

    if (!content || content.length < 50) {
      return { success: false, error: '内容太短，无法生成' };
    }

    // 2. 根据输出类型构建 prompt 和 schema
    const { prompt, schema } = buildPromptAndSchema(outputType, content);

    // 3. 调用 Gemini API（使用结构化输出）
    const apiUrl = geminiGenerateUrl(THINKING_MODEL, apiKey);

    const requestBody: Record<string, unknown> = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: withNoThinking({
        temperature: 0.3,
        maxOutputTokens: 8192,
        responseMimeType: 'application/json',
        responseSchema: schema
      })
    };

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        '[AgentChat] Gemini API error:',
        response.status,
        errorText
      );
      return { success: false, error: 'Gemini API 调用失败' };
    }

    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };

    const jsonText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!jsonText) {
      return { success: false, error: '未能获取生成结果' };
    }

    // 4. 解析并格式化结果（带有容错处理）
    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch (parseError) {
      console.warn(
        '[AgentChat] JSON parse failed, attempting to fix truncated JSON:',
        parseError
      );

      // 尝试修复被截断的 JSON
      let fixedJson = jsonText;

      // 计算未闭合的括号
      const openBraces = (fixedJson.match(/{/g) || []).length;
      const closeBraces = (fixedJson.match(/}/g) || []).length;
      const openBrackets = (fixedJson.match(/\[/g) || []).length;
      const closeBrackets = (fixedJson.match(/\]/g) || []).length;

      // 如果在字符串中间被截断，先截断到最后一个完整的字符串
      if (
        fixedJson.includes('"') &&
        !fixedJson.endsWith('"') &&
        !fixedJson.endsWith('}') &&
        !fixedJson.endsWith(']')
      ) {
        // 找到最后一个完整的属性
        const lastCompleteQuote = fixedJson.lastIndexOf('",');
        if (lastCompleteQuote > 0) {
          fixedJson = fixedJson.substring(0, lastCompleteQuote + 1);
        }
      }

      // 添加缺失的闭合括号
      for (let i = 0; i < openBrackets - closeBrackets; i++) {
        fixedJson += ']';
      }
      for (let i = 0; i < openBraces - closeBraces; i++) {
        fixedJson += '}';
      }

      try {
        parsed = JSON.parse(fixedJson);
        console.log('[AgentChat] Successfully recovered truncated JSON');
      } catch (secondError) {
        console.error('[AgentChat] Failed to recover JSON:', secondError);
        return { success: false, error: `JSON 解析失败，内容可能过长` };
      }
    }

    const result = formatGeminiResult(outputType, parsed);

    console.log('[AgentChat] Gemini generation successful:', outputType);
    return { success: true, result };
  } catch (error) {
    console.error('[AgentChat] Gemini processing error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '处理失败'
    };
  }
}

/**
 * 构建 Gemini 结构化输出的 prompt 和 schema
 */
function buildPromptAndSchema(
  outputType: NotebookLMOutputType,
  content: string
): { prompt: string; schema: Record<string, unknown> } {
  // 限制内容长度以避免响应被截断
  const contentPreview =
    content.length > 5000
      ? content.substring(0, 5000) + '\n\n[内容已截断...]'
      : content;

  switch (outputType) {
    case 'flashcards':
      return {
        prompt: `根据以下内容生成 10 张学习闪卡。每张卡片包含一个问题和答案，帮助记忆和理解核心概念。

内容：
${contentPreview}

请生成结构化的闪卡数据。`,
        schema: {
          type: 'object',
          properties: {
            cards: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  question: { type: 'string', description: '问题' },
                  answer: { type: 'string', description: '答案' }
                },
                required: ['question', 'answer']
              }
            }
          },
          required: ['cards']
        }
      };

    case 'mindmap':
      return {
        prompt: `根据以下内容生成一个思维导图结构。包含根节点和多个层级的子节点，展示内容的逻辑结构。

内容：
${contentPreview}

请生成结构化的思维导图数据。`,
        schema: {
          type: 'object',
          properties: {
            root: {
              type: 'object',
              properties: {
                text: { type: 'string', description: '根节点文本' },
                children: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      text: { type: 'string' },
                      children: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: { text: { type: 'string' } }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          required: ['root']
        }
      };

    case 'quiz':
      return {
        prompt: `根据以下内容生成 5 道选择题。每题包含 4 个选项，标注正确答案索引，并提供解析。

内容：
${contentPreview}

请生成结构化的测验数据。`,
        schema: {
          type: 'object',
          properties: {
            questions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  question: { type: 'string', description: '题目' },
                  options: {
                    type: 'array',
                    items: { type: 'string' },
                    description: '四个选项'
                  },
                  correct_index: {
                    type: 'integer',
                    description: '正确答案索引 (0-3)'
                  },
                  explanation: { type: 'string', description: '解析' }
                },
                required: ['question', 'options', 'correct_index']
              }
            }
          },
          required: ['questions']
        }
      };

    case 'report':
      return {
        prompt: `根据以下内容生成一份详细报告。包含标题、核心要点和多个章节。

内容：
${contentPreview}

请生成结构化的报告数据。`,
        schema: {
          type: 'object',
          properties: {
            title: { type: 'string', description: '报告标题' },
            key_points: {
              type: 'array',
              items: { type: 'string' },
              description: '核心要点'
            },
            sections: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  heading: { type: 'string', description: '章节标题' },
                  content: { type: 'string', description: '章节内容' }
                }
              }
            }
          },
          required: ['title', 'sections']
        }
      };

    case 'summary':
    default:
      return {
        prompt: `根据以下内容生成一份摘要。包含标题、摘要文本和关键要点。

内容：
${contentPreview}

请生成结构化的摘要数据。`,
        schema: {
          type: 'object',
          properties: {
            title: { type: 'string', description: '标题' },
            summary: { type: 'string', description: '摘要内容' },
            key_points: {
              type: 'array',
              items: { type: 'string' },
              description: '关键要点'
            }
          },
          required: ['title', 'summary']
        }
      };
  }
}

/**
 * 格式化 Gemini 结果为统一格式
 */
function formatGeminiResult(
  outputType: NotebookLMOutputType,
  parsed: unknown
): Record<string, unknown> {
  const data = parsed as Record<string, unknown>;

  switch (outputType) {
    case 'flashcards':
      return { cards: data.cards || [] };
    case 'mindmap':
      return { root: data.root || { text: 'Root', children: [] } };
    case 'quiz':
      return { questions: data.questions || [] };
    case 'report':
      return {
        title: data.title || '报告',
        key_points: data.key_points || [],
        sections: data.sections || []
      };
    case 'summary':
    default:
      return {
        title: data.title || '摘要',
        summary: data.summary || '',
        key_points: data.key_points || []
      };
  }
}

/**
 * 格式化 NotebookLM 结果为用户友好的文本（纯文本，无 Markdown）
 * @deprecated 保留供将来使用
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function formatNotebookLMResult(
  outputType: NotebookLMOutputType,
  result: unknown
): string {
  const data = result as Record<string, unknown>;

  switch (outputType) {
    case 'flashcards': {
      const cards =
        (data.cards as Array<{ question: string; answer: string }>) || [];
      if (cards.length === 0) return '未能生成闪卡，请检查内容来源。';
      let text = `📚 生成了 ${cards.length} 张闪卡\n\n`;
      cards.forEach((card, i) => {
        text += `卡片 ${i + 1}\n`;
        text += `❓ ${card.question}\n`;
        text += `✅ ${card.answer}\n\n`;
      });
      return text;
    }

    case 'mindmap': {
      const root = data.root as {
        text: string;
        children?: Array<{ text: string; children?: unknown[] }>;
      };
      if (!root) return '未能生成脑图，请检查内容来源。';
      let text = `🧠 思维导图\n\n`;
      text += `${root.text}\n`;
      if (root.children) {
        root.children.forEach((child) => {
          text += `  ├─ ${child.text}\n`;
          if (child.children && Array.isArray(child.children)) {
            (child.children as Array<{ text?: string }>).forEach((subChild) => {
              text += `  │   └─ ${subChild.text || ''}\n`;
            });
          }
        });
      }
      return text;
    }

    case 'quiz': {
      const questions =
        (data.questions as Array<{
          question: string;
          options: string[];
          correct_index: number;
          explanation?: string;
        }>) || [];
      if (questions.length === 0) return '未能生成测验，请检查内容来源。';
      let text = `📝 生成了 ${questions.length} 道测验题\n\n`;
      questions.forEach((q, i) => {
        text += `题目 ${i + 1}: ${q.question}\n`;
        q.options.forEach((opt, j) => {
          const marker = j === q.correct_index ? '✅' : '○';
          text += `  ${marker} ${String.fromCharCode(65 + j)}. ${opt}\n`;
        });
        if (q.explanation) {
          text += `  💡 解析: ${q.explanation}\n`;
        }
        text += '\n';
      });
      return text;
    }

    case 'report': {
      const title = (data.title as string) || '报告';
      const sections =
        (data.sections as Array<{ heading: string; content: string }>) || [];
      const keyPoints = (data.key_points as string[]) || [];

      let text = `📄 ${title}\n\n`;
      if (keyPoints.length > 0) {
        text += `核心要点\n`;
        keyPoints.forEach((point) => {
          text += `• ${point}\n`;
        });
        text += '\n';
      }
      sections.forEach((section) => {
        text += `〖${section.heading}〗\n${section.content}\n\n`;
      });
      return text;
    }

    case 'summary': {
      const title = (data.title as string) || '摘要';
      const summary = (data.summary as string) || '';
      const keyPoints = (data.key_points as string[]) || [];

      let text = `📋 ${title}\n\n`;
      text += summary + '\n\n';
      if (keyPoints.length > 0) {
        text += `关键要点\n`;
        keyPoints.forEach((point) => {
          text += `• ${point}\n`;
        });
      }
      return text;
    }

    default:
      return JSON.stringify(result, null, 2);
  }
}

/**
 * 生成图片（使用 gemini-3.1-flash-image-preview）
 */
async function generateImage(
  apiKey: string,
  prompt: string,
  referenceImages?: Array<{ data: string; mimeType: string }>
): Promise<string | null> {
  const apiUrl =
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent?key=' +
    apiKey;

  const parts: Array<
    { text: string } | { inlineData: { mimeType: string; data: string } }
  > = [];

  if (referenceImages && referenceImages.length > 0) {
    console.log(
      '[AgentChat] Adding',
      referenceImages.length,
      'reference images'
    );
    for (const img of referenceImages) {
      parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });
    }
  }

  parts.push({ text: prompt });

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: { responseModalities: ['TEXT', 'IMAGE'] }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        '[AgentChat] Image generation failed:',
        response.status,
        errorText
      );
      return null;
    }

    const data = (await response.json()) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{ inlineData?: { mimeType?: string; data?: string } }>;
        };
      }>;
    };
    const responseParts = data.candidates?.[0]?.content?.parts || [];

    for (const part of responseParts) {
      if (part.inlineData?.mimeType?.startsWith('image/')) {
        return (
          'data:' + part.inlineData.mimeType + ';base64,' + part.inlineData.data
        );
      }
    }

    console.warn('[AgentChat] No image in response');
    return null;
  } catch (error) {
    console.error('[AgentChat] Image generation error:', error);
    return null;
  }
}

/**
 * 使用 Veo3 生成视频
 * Veo3 是异步 API，返回 operation ID，需要轮询获取结果
 * @deprecated 保留供将来使用，视频生成功能开发中
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function generateVideoWithVeo3(
  apiKey: string,
  prompt: string,
  aspectRatio: '16:9' | '9:16' = '16:9'
): Promise<{ success: boolean; operationId?: string; error?: string }> {
  console.log(
    '[AgentChat] Starting Veo3 video generation:',
    prompt.substring(0, 100)
  );

  try {
    // 使用 veo-3.1-fast-preview 模型（更快）
    const apiUrl =
      'https://generativelanguage.googleapis.com/v1beta/models/veo-3.1-fast-preview:predictLongRunning?key=' +
      apiKey;

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instances: [
          {
            prompt: prompt.substring(0, 500) // Veo 提示限制
          }
        ],
        parameters: {
          aspectRatio: aspectRatio,
          personGeneration: 'allow_adult',
          videoLength: '5s' // 5 秒视频
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[AgentChat] Veo3 API error:', response.status, errorText);

      // 解析错误信息
      try {
        const errorJson = JSON.parse(errorText);
        const errorMessage =
          errorJson.error?.message || '视频生成服务暂时不可用';
        return { success: false, error: errorMessage };
      } catch {
        return { success: false, error: '视频生成服务暂时不可用' };
      }
    }

    const data = (await response.json()) as { name?: string };

    if (data.name) {
      console.log('[AgentChat] Veo3 operation started:', data.name);
      return { success: true, operationId: data.name };
    } else {
      return { success: false, error: '未能获取视频生成任务 ID' };
    }
  } catch (error) {
    console.error('[AgentChat] Veo3 video generation error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '视频生成失败'
    };
  }
}

export default async function handler(request: Request) {
  const corsHeaders = getCorsHeadersForRequest(request);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';

  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: '未提供认证令牌，请先登录' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  let body: ChatRequestBody;
  try {
    body = (await request.json()) as ChatRequestBody;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const { prompt, context } = body;
  if (!prompt) {
    return new Response(JSON.stringify({ error: 'Missing prompt' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // 提取参考图片
  const referenceImages = context?.referenceImages;

  // 构建系统提示
  let systemPrompt = `你是一个智能 Agent 助手，具备以下能力：
1. 联网搜索 - 可以获取实时信息（天气、新闻、股票等）
2. 图片生成 - 可以根据描述生成图片
3. 信息整合 - 综合多个来源的信息给出准确回答

重要提示：
- 对于需要实时信息的问题，请使用搜索工具获取最新数据
- 回答时请注明信息来源
- 请用中文回答

`;

  if (context?.references) {
    systemPrompt += '参考内容：\n' + context.references + '\n\n---\n\n';
  }
  if (context?.pageInfo) {
    systemPrompt +=
      '当前页面: ' +
      context.pageInfo.title +
      ' (' +
      context.pageInfo.url +
      ')\n\n';
  }
  if (context?.history) {
    systemPrompt += '历史对话：\n' + context.history + '\n\n';
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // 1. 分析用户意图（优化：移除"分析意图"状态，直接显示"思考中"）
        controller.enqueue(
          encoder.encode(
            'event: status\ndata: {"status":"generating","message":"思考中..."}\n\n'
          )
        );
        const intent = geminiApiKey
          ? await analyzeIntent(
              geminiApiKey,
              prompt,
              context,
              referenceImages && referenceImages.length > 0
            )
          : { intent: 'TEXT' as const, imagePrompt: '' };
        console.log('[AgentChat] Intent:', intent.intent);

        // 2. 根据意图处理
        if (intent.intent === 'IMAGE') {
          if (!geminiApiKey) {
            controller.enqueue(
              encoder.encode(
                'event: error\ndata: {"message":"图片生成服务未配置（缺少 GEMINI_API_KEY）"}\n\n'
              )
            );
            controller.enqueue(encoder.encode('event: done\ndata: {}\n\n'));
            controller.close();
            return;
          }

          // 图片生成
          controller.enqueue(
            encoder.encode(
              'event: status\ndata: {"status":"generating","message":"生图中..."}\n\n'
            )
          );
          const imagePrompt = intent.imagePrompt || prompt;
          const imageUrl = await generateImage(
            geminiApiKey,
            imagePrompt,
            referenceImages
          );

          if (imageUrl) {
            controller.enqueue(
              encoder.encode(
                'event: image\ndata: ' + JSON.stringify({ imageUrl }) + '\n\n'
              )
            );
            controller.enqueue(encoder.encode('event: done\ndata: {}\n\n'));
            controller.close();
            return;
          } else {
            // 图片生成失败，回退到文本
            console.warn(
              '[AgentChat] Image generation failed, falling back to text'
            );
            controller.enqueue(
              encoder.encode(
                'event: status\ndata: {"status":"generating","message":"图片生成失败，转为文本回复..."}\n\n'
              )
            );
          }
        }

        // URL_ANALYSIS 处理 - 多链接批量分析
        if (
          intent.intent === 'URL_ANALYSIS' &&
          intent.urls &&
          intent.urls.length >= 2
        ) {
          if (!geminiApiKey) {
            controller.enqueue(
              encoder.encode(
                'event: error\ndata: {"message":"多链接分析服务未配置（缺少 GEMINI_API_KEY）"}\n\n'
              )
            );
            controller.enqueue(encoder.encode('event: done\ndata: {}\n\n'));
            controller.close();
            return;
          }

          controller.enqueue(
            encoder.encode(
              `event: status\ndata: ${JSON.stringify({ status: 'analyzing', message: `正在分析 ${intent.urls.length} 个链接...` })}\n\n`
            )
          );

          const { results, comparison } = await analyzeMultipleUrls(
            geminiApiKey,
            intent.urls,
            prompt
          );
          const formattedText = formatUrlAnalysisResults(results, comparison);

          // 流式输出结果
          controller.enqueue(
            encoder.encode(
              'event: text\ndata: ' +
                JSON.stringify({ content: formattedText }) +
                '\n\n'
            )
          );
          controller.enqueue(encoder.encode('event: done\ndata: {}\n\n'));
          controller.close();
          return;
        }

        // [DISABLED] NotebookLM 处理 - 功能暂时屏蔽，后续可能恢复
        /*
        if (intent.intent === 'NOTEBOOKLM' && intent.notebooklm) {
          const outputTypeNames: Record<NotebookLMOutputType, string> = {
            flashcards: '闪卡',
            mindmap: '脑图',
            quiz: '测验',
            report: '报告',
            summary: '摘要',
            video: '视频',
            infographic: '信息图'
          };
          const typeName = outputTypeNames[intent.notebooklm.outputType];

          controller.enqueue(
            encoder.encode(
              'event: status\ndata: ' +
                JSON.stringify({
                  status: 'processing',
                  message: `正在生成${typeName}，请稍候...`
                }) +
                '\n\n'
            )
          );

          // 视频生成使用 Veo3 API
          if (intent.notebooklm.outputType === 'video') {
            const videoResult = await generateVideoWithVeo3(geminiApiKey, prompt);
            if (videoResult.success) {
              const message = `🎬 **视频生成已开始**\n\n您的视频正在生成中，预计需要 1-5 分钟。\n\n操作 ID: \`${videoResult.operationId}\`\n\n视频生成完成后将可以下载。由于 Veo3 视频生成是异步的，请稍后刷新查看结果。`;
              controller.enqueue(
                encoder.encode(
                  'event: text\ndata: ' +
                    JSON.stringify({ content: message }) +
                    '\n\n'
                )
              );
            } else {
              controller.enqueue(
                encoder.encode(
                  'event: text\ndata: ' +
                    JSON.stringify({
                      content: `视频生成失败：${videoResult.error}`
                    }) +
                    '\n\n'
                )
              );
            }
            controller.enqueue(encoder.encode('event: done\ndata: {}\n\n'));
            controller.close();
            return;
          }

          // 信息图使用图片生成
          if (intent.notebooklm.outputType === 'infographic') {
            // 先生成摘要，然后基于摘要生成信息图
            const summaryResult = await processWithGemini(
              geminiApiKey,
              'summary',
              intent.notebooklm.sourceUrl,
              intent.notebooklm.sourceText
            );
            let infographicPrompt = '生成一张专业的信息图';
            if (summaryResult.success && summaryResult.result) {
              const summary =
                (summaryResult.result as { summary?: string }).summary || '';
              infographicPrompt = `为以下内容生成一张精美的信息图，包含关键数据和可视化元素：\n${summary.substring(0, 500)}`;
            }

            const imageResult = await generateImage(geminiApiKey, infographicPrompt);
            if (imageResult) {
              const imageMessage = `📊 **信息图已生成**\n\n![信息图](${imageResult})`;
              controller.enqueue(
                encoder.encode(
                  'event: text\ndata: ' +
                    JSON.stringify({ content: imageMessage }) +
                    '\n\n'
                )
              );
              controller.enqueue(
                encoder.encode(
                  'event: image\ndata: ' +
                    JSON.stringify({ imageUrl: imageResult }) +
                    '\n\n'
                )
              );
            } else {
              controller.enqueue(
                encoder.encode(
                  'event: text\ndata: ' +
                    JSON.stringify({
                      content: '信息图生成失败，请稍后重试。'
                    }) +
                    '\n\n'
                )
              );
            }
            controller.enqueue(encoder.encode('event: done\ndata: {}\n\n'));
            controller.close();
            return;
          }

          // 其他类型使用 Gemini 文本生成
          const nlmResult = await processWithGemini(
            geminiApiKey,
            intent.notebooklm.outputType,
            intent.notebooklm.sourceUrl,
            intent.notebooklm.sourceText
          );

          if (nlmResult.success && nlmResult.result) {
            const formattedResult = formatNotebookLMResult(
              intent.notebooklm.outputType,
              nlmResult.result
            );
            // 先发送状态完成事件，清除 processing 状态
            controller.enqueue(
              encoder.encode(
                'event: status\ndata: ' +
                  JSON.stringify({ status: 'done', message: '' }) +
                  '\n\n'
              )
            );
            controller.enqueue(
              encoder.encode(
                'event: text\ndata: ' +
                  JSON.stringify({ content: formattedResult }) +
                  '\n\n'
              )
            );
            controller.enqueue(encoder.encode('event: done\ndata: {}\n\n'));
            controller.close();
            return;
          } else {
            // Gemini 生成失败
            console.warn(
              '[AgentChat] Gemini generation failed:',
              nlmResult.error
            );
            const errorMessage = `抱歉，生成${typeName}时遇到问题：${nlmResult.error}\n\n我可以尝试用其他方式帮助你理解这个内容。`;
            controller.enqueue(
              encoder.encode(
                'event: text\ndata: ' +
                  JSON.stringify({ content: errorMessage }) +
                  '\n\n'
              )
            );
            controller.enqueue(encoder.encode('event: done\ndata: {}\n\n'));
            controller.close();
            return;
          }
        }
        */

        // 3. 搜索或文本对话
        if (intent.intent === 'SEARCH') {
          // 联网搜索需要消耗积分
          try {
            const authHeader = request.headers.get('Authorization');
            const token = authHeader?.startsWith('Bearer ')
              ? authHeader.slice(7)
              : '';
            const searchUserId = token
              ? await verifyTokenAndGetUserId(token)
              : null;
            const supabaseAdmin = searchUserId ? getSupabaseAdmin() : null;

            if (searchUserId && supabaseAdmin) {
              const { data: result, error: rpcError } =
                await supabaseAdmin.rpc('consume_credits', {
                  p_user_id: searchUserId,
                  p_action: 'web_search',
                  p_metadata: { source: 'agent_chat_search' }
                });

              if (rpcError) {
                console.error(
                  '[AgentChat] Failed to consume credits for search:',
                  rpcError
                );
              } else if (!result.success) {
                console.log(
                  '[AgentChat] Credit check failed for search:',
                  result
                );
                // 积分不足时发送错误
                if (result.error === 'INSUFFICIENT_CREDITS') {
                  controller.enqueue(
                    encoder.encode(
                      'event: error\ndata: ' +
                        JSON.stringify({
                          type: 'INSUFFICIENT_CREDITS',
                          message: '积分不足，无法使用联网搜索功能'
                        }) +
                        '\n\n'
                    )
                  );
                  controller.enqueue(
                    encoder.encode('event: done\ndata: {}\n\n')
                  );
                  controller.close();
                  return;
                }
              } else {
                console.log(
                  '[AgentChat] Web search credits consumed:',
                  result.consumed
                );
              }
            }
          } catch (creditErr) {
            console.error(
              '[AgentChat] Credit check error for search:',
              creditErr
            );
            // 积分检查失败时继续执行（降级）
          }

          controller.enqueue(
            encoder.encode(
              'event: status\ndata: {"status":"searching","message":"搜索中..."}\n\n'
            )
          );
        } else {
          // TEXT 意图：不需要再发状态，前面已经发了"思考中"
        }

        const useGeminiGrounding = intent.intent === 'SEARCH' && !!geminiApiKey;
        if (!useGeminiGrounding) {
          const deepseek = getDeepSeekTextConfig();
          if (!deepseek.apiKey) {
            controller.enqueue(
              encoder.encode(
                'event: error\ndata: {"message":"DeepSeek 服务未配置（缺少 DEEPSEEK_API_KEY）"}\n\n'
              )
            );
            controller.enqueue(encoder.encode('event: done\ndata: {}\n\n'));
            controller.close();
            return;
          }

          const response = await fetch(`${deepseek.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${deepseek.apiKey}`
            },
            body: JSON.stringify({
              model: deepseek.model,
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: prompt }
              ],
              max_tokens: 8192,
              temperature: 0.7,
              stream: true
            })
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error(
              '[AgentChat] DeepSeek API error:',
              response.status,
              errorText
            );
            controller.enqueue(
              encoder.encode(
                'event: error\ndata: {"message":"DeepSeek API error"}\n\n'
              )
            );
            controller.enqueue(encoder.encode('event: done\ndata: {}\n\n'));
            controller.close();
            return;
          }

          const reader = response.body?.getReader();
          if (!reader) {
            controller.enqueue(
              encoder.encode(
                'event: error\ndata: {"message":"No response body"}\n\n'
              )
            );
            controller.close();
            return;
          }

          const decoder = new TextDecoder();
          let buffer = '';
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith('data: ')) continue;
              const data = trimmed.slice(6).trim();
              if (!data || data === '[DONE]') continue;

              try {
                const parsed = JSON.parse(data) as {
                  choices?: Array<{ delta?: { content?: string } }>;
                };
                const content = parsed.choices?.[0]?.delta?.content;
                if (content) {
                  controller.enqueue(
                    encoder.encode(
                      'event: text\ndata: ' +
                        JSON.stringify({ content }) +
                        '\n\n'
                    )
                  );
                }
              } catch {
                // ignore parse errors
              }
            }
          }

          controller.enqueue(encoder.encode('event: done\ndata: {}\n\n'));
          controller.close();
          return;
        }

        // 根据意图选择模型。需要 Google Search grounding 的请求继续走 Gemini。
        const modelName =
          intent.intent === 'SEARCH' ? ASK_GROUNDING_MODEL : TEXT_MODEL;
        const apiUrl =
          'https://generativelanguage.googleapis.com/v1beta/models/' +
          modelName +
          ':streamGenerateContent?alt=sse&key=' +
          geminiApiKey;

        const requestBody: Record<string, unknown> = {
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: withNoThinking({ maxOutputTokens: 8192, temperature: 0.7 })
        };

        // 搜索模式启用 Google Search Grounding
        if (intent.intent === 'SEARCH') {
          requestBody.tools = [{ googleSearch: {} }];
        }

        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(
            '[AgentChat] Gemini API error:',
            response.status,
            errorText
          );
          controller.enqueue(
            encoder.encode(
              'event: error\ndata: {"message":"Gemini API error"}\n\n'
            )
          );
          controller.enqueue(encoder.encode('event: done\ndata: {}\n\n'));
          controller.close();
          return;
        }

        const reader = response.body?.getReader();
        if (!reader) {
          controller.enqueue(
            encoder.encode(
              'event: error\ndata: {"message":"No response body"}\n\n'
            )
          );
          controller.close();
          return;
        }

        const decoder = new TextDecoder();
        let buffer = '';
        let searchGroundingInfo: string | null = null;

        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim();
              if (!data) continue;

              try {
                const parsed = JSON.parse(data);

                // 提取文本内容
                const textContent =
                  parsed.candidates?.[0]?.content?.parts?.[0]?.text;
                if (textContent) {
                  controller.enqueue(
                    encoder.encode(
                      'event: text\ndata: ' +
                        JSON.stringify({ content: textContent }) +
                        '\n\n'
                    )
                  );
                }

                // 提取搜索 grounding 元数据（如果有）
                const groundingMetadata =
                  parsed.candidates?.[0]?.groundingMetadata;
                if (groundingMetadata?.webSearchQueries) {
                  searchGroundingInfo = JSON.stringify({
                    queries: groundingMetadata.webSearchQueries,
                    sources: groundingMetadata.groundingChunks?.map(
                      (chunk: { web?: { uri?: string; title?: string } }) => ({
                        url: chunk.web?.uri,
                        title: chunk.web?.title
                      })
                    )
                  });
                  console.log(
                    '[AgentChat] Search grounding used:',
                    searchGroundingInfo
                  );
                }
              } catch {
                // ignore parse errors
              }
            }
          }
        }

        // 如果使用了搜索，发送搜索信息
        if (searchGroundingInfo) {
          controller.enqueue(
            encoder.encode(
              'event: search\ndata: ' + searchGroundingInfo + '\n\n'
            )
          );
        }

        controller.enqueue(encoder.encode('event: done\ndata: {}\n\n'));
        controller.close();
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        console.error('[AgentChat] Stream error:', error);
        controller.enqueue(
          encoder.encode(
            'event: error\ndata: ' +
              JSON.stringify({ message: errorMessage }) +
              '\n\n'
          )
        );
        controller.enqueue(encoder.encode('event: done\ndata: {}\n\n'));
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    }
  });
}
