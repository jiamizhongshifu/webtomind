/**
 * Grok API 搜索工具
 *
 * 使用 xAI 的 Grok API 进行 Twitter/X 搜索
 * 参考文档: https://docs.x.ai/docs/guides/live-search
 */

import type { ToolResult } from '../types/api.js';

// ============================================
// 类型定义
// ============================================

interface GrokXSearchParams {
  query: string;
  maxResults?: number;
  category?: 'ai' | 'money' | 'product' | 'design' | 'all';
  allowedHandles?: string[];
  excludedHandles?: string[];
  fromDate?: string; // ISO8601 格式 YYYY-MM-DD
  toDate?: string;
}

export type { GrokXSearchParams };

interface XSearchResult {
  id: string;
  author: {
    handle: string;
    name: string;
  };
  content: string;
  url: string;
  createdAt: string;
  metrics?: {
    likes: number;
    retweets: number;
    replies: number;
  };
}

interface GrokMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface GrokToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

interface GrokResponse {
  id: string;
  choices: Array<{
    message: {
      role: string;
      content: string | null;
      tool_calls?: GrokToolCall[];
    };
    finish_reason: string;
  }>;
  citations?: string[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// ============================================
// 预设的 AI/科技领域热门账号
// ============================================

const AI_TECH_HANDLES = [
  'elonmusk', // Elon Musk
  'sama', // Sam Altman
  'AnthropicAI', // Anthropic
  'OpenAI', // OpenAI
  'GoogleAI', // Google AI
  'xaboringcompany', // Boring Company
  'reaboringcompany',
  'amjadmasad', // Replit CEO
  'levelsio', // Pieter Levels
  'karpathy', // Andrej Karpathy
  'ylecun' // Yann LeCun
];

const MONEY_SIDE_HUSTLE_HANDLES = [
  'levelsio', // Pieter Levels
  'thedankoe', // Dan Koe
  'naval', // Naval Ravikant
  'jasonfried', // Jason Fried
  'dhh', // DHH
  'shl' // Sahil Lavingia (Gumroad)
];

const PRODUCT_DESIGN_HANDLES = [
  'zoink', // Dylan Field (Figma)
  'brian_lovin', // Brian Lovin
  'JuneYinDesign', // June Yin
  'uiuxjp' // UI/UX Japan
];

// ============================================
// 核心函数
// ============================================

/**
 * 获取 Grok API 配置
 */
function getGrokApiConfig(): { baseUrl: string; apiKey: string } | null {
  const apiKey = process.env.GROK_API_KEY || process.env.XAI_API_KEY;
  const baseUrl = process.env.GROK_BASE_URL || 'https://api.x.ai';

  if (!apiKey) {
    return null;
  }

  return { baseUrl, apiKey };
}

/**
 * 根据分类获取推荐的 handles
 */
function getHandlesByCategory(category: string): string[] {
  switch (category) {
    case 'ai':
      return AI_TECH_HANDLES;
    case 'money':
      return MONEY_SIDE_HUSTLE_HANDLES;
    case 'product':
    case 'design':
      return PRODUCT_DESIGN_HANDLES;
    case 'all':
    default:
      return [
        ...new Set([
          ...AI_TECH_HANDLES,
          ...MONEY_SIDE_HUSTLE_HANDLES,
          ...PRODUCT_DESIGN_HANDLES
        ])
      ].slice(0, 10);
  }
}

/**
 * 使用 Grok API 搜索 Twitter/X 热帖
 */
export async function grokXSearch(
  params: GrokXSearchParams
): Promise<ToolResult> {
  const {
    query,
    maxResults = 10,
    category = 'all',
    allowedHandles,
    excludedHandles,
    fromDate,
    toDate
  } = params;

  const apiConfig = getGrokApiConfig();
  if (!apiConfig) {
    return {
      success: false,
      error: '未配置 GROK_API_KEY（或 XAI_API_KEY）环境变量'
    };
  }

  const { baseUrl, apiKey } = apiConfig;

  console.log(`[GrokXSearch] Searching: ${query}, category: ${category}`);

  try {
    // 构建 x_search 工具配置
    const xSearchTool: Record<string, unknown> = {
      type: 'x_search'
    };

    // 设置 handles 过滤
    const handles =
      allowedHandles || getHandlesByCategory(category).slice(0, 10);
    if (handles.length > 0) {
      xSearchTool.allowed_x_handles = handles;
    }
    if (excludedHandles && excludedHandles.length > 0) {
      xSearchTool.excluded_x_handles = excludedHandles.slice(0, 10);
    }

    // 设置日期范围
    if (fromDate) {
      xSearchTool.from_date = fromDate;
    }
    if (toDate) {
      xSearchTool.to_date = toDate;
    }

    // 启用图片理解
    xSearchTool.enable_image_understanding = true;

    // 构建请求
    const messages: GrokMessage[] = [
      {
        role: 'system',
        content: `你是一个 Twitter/X 热帖分析专家。请搜索并分析最近的热门帖子。
返回格式要求：
1. 每条帖子包含：作者、内容摘要、互动数据（点赞/转发）、原文链接
2. 按热度排序（互动数据高的优先）
3. 最多返回 ${maxResults} 条结果
4. 用中文总结内容，但保留原文链接`
      },
      {
        role: 'user',
        content: `搜索 Twitter/X 上关于 "${query}" 的热门帖子，找出最近最火的内容。`
      }
    ];

    const model = process.env.GROK_MODEL || 'grok-3';
    const timeoutMs = Number(process.env.GROK_TIMEOUT_MS) || 60000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          messages,
          tools: [xSearchTool],
          tool_choice: 'auto',
          max_tokens: 4096
        })
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[GrokXSearch] API error:', errorText);
      return {
        success: false,
        error: `Grok API 错误: ${response.status} - ${errorText}`
      };
    }

    const data = (await response.json()) as GrokResponse;
    console.log(
      `[GrokXSearch] Got response, citations: ${data.citations?.length || 0}`
    );

    // 提取结果
    const content = data.choices[0]?.message?.content || '';
    const citations = data.citations || [];

    // 构建结果
    const results: XSearchResult[] = citations.map((url, index) => ({
      id: `${index + 1}`,
      author: { handle: extractHandleFromUrl(url), name: '' },
      content: '', // 内容在 AI 的回复中
      url,
      createdAt: new Date().toISOString()
    }));

    return {
      success: true,
      data: {
        query,
        category,
        summary: content,
        results,
        citations,
        usage: data.usage
      }
    };
  } catch (error) {
    console.error('[GrokXSearch] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '搜索失败'
    };
  }
}

/**
 * 从 Twitter URL 提取 handle
 */
function extractHandleFromUrl(url: string): string {
  const match = url.match(/x\.com\/([^/]+)/);
  return match ? match[1] : '';
}

/**
 * 获取 AI 领域 Twitter 热帖
 */
export async function getAIHotPosts(
  maxResults: number = 10
): Promise<ToolResult> {
  return grokXSearch({
    query: 'AI tools LLM Claude GPT Cursor trending',
    category: 'ai',
    maxResults
  });
}

/**
 * 获取副业/搞钱领域 Twitter 热帖
 */
export async function getMoneyHotPosts(
  maxResults: number = 10
): Promise<ToolResult> {
  return grokXSearch({
    query: 'side hustle indie hacker solopreneur making money online',
    category: 'money',
    maxResults
  });
}

// ============================================
// 工具定义
// ============================================

export const grokXSearchDefinition = {
  name: 'grok_x_search',
  description:
    '使用 Grok API 搜索 Twitter/X 热帖。可按领域分类（AI、副业、产品设计）获取最新热门内容。适用于选题决策、热点追踪。',
  input_schema: {
    type: 'object' as const,
    properties: {
      query: {
        type: 'string',
        description: '搜索关键词'
      },
      maxResults: {
        type: 'number',
        description: '最大返回结果数量，默认 10'
      },
      category: {
        type: 'string',
        enum: ['ai', 'money', 'product', 'design', 'all'],
        description:
          '内容分类：ai（AI工具）, money（副业搞钱）, product（产品）, design（设计）, all（全部）'
      },
      allowedHandles: {
        type: 'array',
        items: { type: 'string' },
        description: '只搜索这些 Twitter 账号的帖子（最多 10 个）'
      },
      fromDate: {
        type: 'string',
        description: '开始日期（ISO8601 格式：YYYY-MM-DD）'
      },
      toDate: {
        type: 'string',
        description: '结束日期（ISO8601 格式：YYYY-MM-DD）'
      }
    },
    required: ['query']
  }
};
