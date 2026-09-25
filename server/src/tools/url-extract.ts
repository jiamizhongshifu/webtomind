/**
 * URL 内容提取工具
 */

import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import type { ToolResult } from '../types/api.js';

interface ExtractUrlParams {
  url: string;
  maxLength?: number;
}

/**
 * 提取 URL 内容
 */
export async function extractUrl(params: ExtractUrlParams): Promise<ToolResult> {
  const { url, maxLength = 10000 } = params;

  console.log(`[ExtractUrl] Extracting: ${url}`);

  try {
    // 验证 URL
    const parsedUrl = new URL(url);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return {
        success: false,
        error: '仅支持 http/https 协议的 URL',
      };
    }

    // 获取网页内容
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MindMapper/1.0; +https://mindmapper.app)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
      redirect: 'follow',
    });

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP 错误: ${response.status} ${response.statusText}`,
      };
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      return {
        success: false,
        error: `不支持的内容类型: ${contentType}`,
      };
    }

    const html = await response.text();

    // 使用 Readability 提取正文
    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    if (!article) {
      // 回退：尝试提取基本信息
      const title = dom.window.document.title || '';
      const description = dom.window.document.querySelector('meta[name="description"]')?.getAttribute('content') || '';

      return {
        success: true,
        data: {
          url,
          title,
          content: description || '无法提取页面正文内容',
          excerpt: description,
          siteName: parsedUrl.hostname,
          byline: null,
        },
      };
    }

    // 截断过长的内容
    let content = article.textContent || '';
    if (content.length > maxLength) {
      content = content.substring(0, maxLength) + '\n\n...(内容已截断)';
    }

    console.log(`[ExtractUrl] Extracted: ${article.title}, ${content.length} chars`);

    return {
      success: true,
      data: {
        url,
        title: article.title,
        content,
        excerpt: article.excerpt,
        siteName: article.siteName,
        byline: article.byline,
        length: article.length,
      },
    };
  } catch (error) {
    console.error('[ExtractUrl] Error:', error);

    // 处理常见错误
    if (error instanceof TypeError && error.message.includes('fetch')) {
      return {
        success: false,
        error: '网络请求失败，请检查 URL 是否正确',
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : '内容提取失败',
    };
  }
}

/**
 * 工具定义（Anthropic 格式）
 */
export const extractUrlDefinition = {
  name: 'extract_url',
  description: '提取指定 URL 的网页内容，返回标题和正文。适用于阅读文章、获取网页详细信息等场景。',
  input_schema: {
    type: 'object' as const,
    properties: {
      url: {
        type: 'string',
        description: '要提取内容的网页 URL',
      },
      maxLength: {
        type: 'number',
        description: '内容最大长度限制，默认 10000 字符',
      },
    },
    required: ['url'],
  },
};
