/**
 * 网络搜索工具
 */

import type { ToolResult } from '../types/api.js';

interface WebSearchParams {
  query: string;
  maxResults?: number;
}

interface SearchResult {
  title: string;
  snippet: string;
  url: string;
}

/**
 * 执行网络搜索
 */
export async function webSearch(params: WebSearchParams): Promise<ToolResult> {
  const { query, maxResults = 5 } = params;
  const startTime = Date.now();

  console.log(`[WebSearch] Searching: ${query}`);

  try {
    // 使用 DuckDuckGo Instant Answer API
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'MindMapper/1.0',
      },
    });

    console.log(`[WebSearch] API response in ${Date.now() - startTime}ms`);

    if (!response.ok) {
      throw new Error(`Search API error: ${response.status}`);
    }

    const data = await response.json();
    const results: SearchResult[] = [];

    // 提取摘要结果
    if (data.Abstract) {
      results.push({
        title: data.Heading || query,
        snippet: data.Abstract,
        url: data.AbstractURL || '',
      });
    }

    // 提取相关主题
    if (data.RelatedTopics) {
      for (const topic of data.RelatedTopics.slice(0, maxResults - results.length)) {
        if (topic.Text && topic.FirstURL) {
          results.push({
            title: topic.Text.split(' - ')[0] || '',
            snippet: topic.Text,
            url: topic.FirstURL,
          });
        }
      }
    }

    // 如果没有结果，返回提示
    if (results.length === 0) {
      return {
        success: true,
        data: {
          message: `未找到关于 "${query}" 的直接结果，建议尝试其他关键词`,
          results: [],
        },
      };
    }

    console.log(`[WebSearch] Found ${results.length} results`);

    return {
      success: true,
      data: {
        query,
        results,
        count: results.length,
      },
    };
  } catch (error) {
    console.error('[WebSearch] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '搜索失败',
    };
  }
}

/**
 * 工具定义（Anthropic 格式）
 */
export const webSearchDefinition = {
  name: 'web_search',
  description: '在网络上搜索信息，返回相关结果摘要。适用于查找最新信息、事实核查、获取背景知识等场景。',
  input_schema: {
    type: 'object' as const,
    properties: {
      query: {
        type: 'string',
        description: '搜索关键词，建议使用简洁明确的关键词',
      },
      maxResults: {
        type: 'number',
        description: '最大返回结果数量，默认 5',
      },
    },
    required: ['query'],
  },
};
