/**
 * Source Search API - 全网搜索新来源
 * POST: 搜索互联网内容，返回结构化结果
 *
 * 使用 Jina Search API（免费，无需 Key）作为默认搜索引擎
 * 如果 Agent-Reach + Exa 可用，优先使用 Exa 语义搜索
 */

import {
  getUserIdFromRequest,
  getCorsHeadersForRequest
} from '../utils/auth';
import { withNoThinking } from '../utils/gemini-helpers';
import {
  debugLog,
  safeErrorLog,
  safeErrorSummary,
  safeWarnLog
} from '../utils/logging';
import { normalizeGeminiModel } from '../utils/model-registry';
import { isOfficialGeminiEnabled } from '../utils/model-provider-routing';
import {
  consumeModelRateLimit,
  createModelRateLimitResponse
} from '../utils/model-rate-limit';

export const config = {
  runtime: 'edge'
};

interface SearchResult {
  title: string;
  snippet: string;
  url: string;
  source: string;
  favicon?: string;
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

/**
 * 从 URL 提取域名
 */
function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/**
 * 生成 favicon URL
 */
function getFaviconUrl(url: string): string {
  const domain = extractDomain(url);
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
}

/**
 * 使用 Jina Search API 进行搜索
 */
async function searchViaJina(
  query: string,
  maxResults: number
): Promise<SearchResult[]> {
  const searchUrl = `https://s.jina.ai/${encodeURIComponent(query)}`;
  const response = await fetch(searchUrl, {
    headers: {
      'Accept': 'application/json',
      'X-Return-Format': 'json'
    },
    signal: AbortSignal.timeout(20000)
  });

  if (!response.ok) {
    throw new Error(`Jina search failed: ${response.status}`);
  }

  const data = (await response.json()) as {
    data?: Array<{
      title?: string;
      description?: string;
      url?: string;
      content?: string;
    }>;
  };

  const results: SearchResult[] = [];
  if (data?.data && Array.isArray(data.data)) {
    for (const item of data.data.slice(0, maxResults)) {
      const itemUrl = item.url || '';
      results.push({
        title: item.title || '',
        snippet: item.description || item.content?.substring(0, 300) || '',
        url: itemUrl,
        source: extractDomain(itemUrl),
        favicon: getFaviconUrl(itemUrl)
      });
    }
  }

  return results;
}

/**
 * 使用 Gemini + Google Search 作为备选搜索
 */
async function searchViaGemini(
  query: string,
  maxResults: number
): Promise<SearchResult[]> {
  if (!isOfficialGeminiEnabled()) {
    throw new Error('Official Gemini is disabled for this runtime');
  }
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error('Google API key not configured');
  }

  const model = normalizeGeminiModel(process.env.SOURCE_SEARCH_MODEL);
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        { role: 'user', parts: [{ text: `搜索并总结：${query}` }] }
      ],
      tools: [{ googleSearch: {} }],
      generationConfig: withNoThinking({ maxOutputTokens: 2048 })
    }),
    signal: AbortSignal.timeout(15000)
  });

  if (!response.ok) {
    throw new Error(`Gemini search failed: ${response.status}`);
  }

  const data = (await response.json()) as {
    candidates?: Array<{
      groundingMetadata?: {
        groundingChunks?: Array<{ web?: { title?: string; uri?: string } }>;
      };
    }>;
  };

  const chunks = data.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  return chunks.slice(0, maxResults).map((chunk) => {
    const url = chunk.web?.uri || '';
    return {
      title: chunk.web?.title || '',
      snippet: '',
      url,
      source: extractDomain(url),
      favicon: getFaviconUrl(url)
    };
  });
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
    bucket: 'workspace_source_search',
    maxRequests: 20
  });
  if (!rateLimit.allowed) return createModelRateLimitResponse(rateLimit, corsHeaders);

  let body: { query?: string; maxResults?: number };
  try {
    body = (await request.json()) as { query?: string; maxResults?: number };
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, corsHeaders, 400);
  }

  const { query, maxResults = 10 } = body;
  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    return jsonResponse({ error: '请输入搜索关键词' }, corsHeaders, 400);
  }

  const trimmedQuery = query.trim();
  if (trimmedQuery.length > 500) {
    return jsonResponse({ error: '搜索关键词过长' }, corsHeaders, 400);
  }

  debugLog('[SourceSearch] Search requested', {
    queryLength: trimmedQuery.length,
    maxResults
  });

  try {
    // 优先使用 Jina Search（免费、快速）
    let results: SearchResult[];
    try {
      results = await searchViaJina(trimmedQuery, maxResults);
    } catch (jinaError) {
      safeWarnLog('[SourceSearch] Jina search failed, trying Gemini', {
        ...safeErrorSummary(jinaError),
        maxResults
      });
      results = await searchViaGemini(trimmedQuery, maxResults);
    }

    debugLog('[SourceSearch] Search completed', {
      resultCount: results.length
    });

    return jsonResponse({ results, query: trimmedQuery }, corsHeaders);
  } catch (error) {
    safeErrorLog('[SourceSearch] Search failed', error);
    return jsonResponse(
      { error: '搜索失败，请稍后重试' },
      corsHeaders,
      500
    );
  }
}
