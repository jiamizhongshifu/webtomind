/**
 * URL Extractor 模块
 * 从网页提取可读内容，使用简化的 readability 算法
 */

import { validateURL } from '../utils/url-validator.js';

/**
 * 提取结果
 */
export interface ExtractionResult {
  /** 是否成功 */
  success: boolean;
  /** 提取的内容 */
  content?: string;
  /** 页面标题 */
  title?: string;
  /** 内容长度 */
  length?: number;
  /** 错误信息 */
  error?: string;
}

/**
 * 提取选项
 */
export interface ExtractionOptions {
  /** 最大内容长度，默认 10000 */
  maxLength?: number;
  /** 请求超时（毫秒），默认 30000 */
  timeout?: number;
  /** 最大重定向次数，默认 5 */
  maxRedirects?: number;
}

const DEFAULT_OPTIONS: Required<ExtractionOptions> = {
  maxLength: 10000,
  timeout: 30000,
  maxRedirects: 5,
};

/**
 * 用户代理字符串
 */
const USER_AGENT = 'Mozilla/5.0 (compatible; WebToMind/1.0; +https://webtomind.com)';

/**
 * 需要移除的 HTML 标签
 */
const REMOVE_TAGS = [
  'script',
  'style',
  'noscript',
  'iframe',
  'svg',
  'canvas',
  'video',
  'audio',
  'nav',
  'header',
  'footer',
  'aside',
  'form',
  'button',
  'input',
  'select',
  'textarea',
];

/**
 * 从 HTML 中提取标题
 */
function extractTitle(html: string): string | undefined {
  // 尝试 <title> 标签
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) {
    return decodeHTMLEntities(titleMatch[1].trim());
  }
  
  // 尝试 og:title
  const ogTitleMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
  if (ogTitleMatch) {
    return decodeHTMLEntities(ogTitleMatch[1].trim());
  }
  
  // 尝试 <h1>
  const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  if (h1Match) {
    return decodeHTMLEntities(h1Match[1].trim());
  }
  
  return undefined;
}

/**
 * 解码 HTML 实体
 */
function decodeHTMLEntities(text: string): string {
  const entities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&nbsp;': ' ',
    '&mdash;': '—',
    '&ndash;': '–',
    '&hellip;': '…',
    '&copy;': '©',
    '&reg;': '®',
    '&trade;': '™',
  };
  
  let result = text;
  for (const [entity, char] of Object.entries(entities)) {
    result = result.replace(new RegExp(entity, 'gi'), char);
  }
  
  // 处理数字实体
  result = result.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
  result = result.replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
  
  return result;
}

/**
 * 从 HTML 中提取可读内容
 * 简化的 readability 算法
 */
function extractContent(html: string): string {
  let content = html;
  
  // 移除注释
  content = content.replace(/<!--[\s\S]*?-->/g, '');
  
  // 移除不需要的标签及其内容
  for (const tag of REMOVE_TAGS) {
    const regex = new RegExp(`<${tag}[^>]*>[\\s\\S]*?<\\/${tag}>`, 'gi');
    content = content.replace(regex, ' ');
    // 也移除自闭合标签
    content = content.replace(new RegExp(`<${tag}[^>]*\\/?>`, 'gi'), ' ');
  }
  
  // 保留段落结构
  content = content.replace(/<\/p>/gi, '\n\n');
  content = content.replace(/<br\s*\/?>/gi, '\n');
  content = content.replace(/<\/div>/gi, '\n');
  content = content.replace(/<\/li>/gi, '\n');
  content = content.replace(/<\/h[1-6]>/gi, '\n\n');
  
  // 处理列表项
  content = content.replace(/<li[^>]*>/gi, '• ');
  
  // 移除所有剩余的 HTML 标签
  content = content.replace(/<[^>]+>/g, ' ');
  
  // 解码 HTML 实体
  content = decodeHTMLEntities(content);
  
  // 清理空白
  content = content
    .replace(/\t/g, ' ')
    .replace(/ +/g, ' ')
    .replace(/\n +/g, '\n')
    .replace(/ +\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  
  return content;
}

/**
 * 检测并处理字符编码
 */
function detectAndDecodeContent(buffer: ArrayBuffer, contentType: string | null): string {
  // 从 Content-Type 提取编码
  let charset = 'utf-8';
  if (contentType) {
    const charsetMatch = contentType.match(/charset=([^\s;]+)/i);
    if (charsetMatch) {
      charset = charsetMatch[1].toLowerCase().replace(/['"]/g, '');
    }
  }
  
  // 尝试使用检测到的编码解码
  try {
    const decoder = new TextDecoder(charset);
    return decoder.decode(buffer);
  } catch {
    // 回退到 UTF-8
    try {
      const decoder = new TextDecoder('utf-8');
      return decoder.decode(buffer);
    } catch {
      // 最后尝试 ISO-8859-1
      const decoder = new TextDecoder('iso-8859-1');
      return decoder.decode(buffer);
    }
  }
}

/**
 * 从 URL 提取可读内容
 * @param url - 目标 URL
 * @param options - 提取选项
 * @returns 提取结果
 */
export async function extractURL(
  url: string,
  options: ExtractionOptions = {}
): Promise<ExtractionResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  // 验证 URL 安全性
  const validation = await validateURL(url);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }
  
  const targetUrl = validation.normalizedUrl!;
  let redirectCount = 0;
  let currentUrl = targetUrl;
  
  try {
    // 创建 AbortController 用于超时
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), opts.timeout);
    
    try {
      // 发起请求，手动处理重定向
      let response = await fetch(currentUrl, {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        },
        redirect: 'manual',
        signal: controller.signal,
      });
      
      // 处理重定向
      while (response.status >= 300 && response.status < 400 && redirectCount < opts.maxRedirects) {
        const location = response.headers.get('Location');
        if (!location) break;
        
        // 验证重定向目标
        const redirectUrl = new URL(location, currentUrl).href;
        const redirectValidation = await validateURL(redirectUrl);
        if (!redirectValidation.valid) {
          return { success: false, error: `Redirect blocked: ${redirectValidation.error}` };
        }
        
        currentUrl = redirectValidation.normalizedUrl!;
        redirectCount++;
        
        response = await fetch(currentUrl, {
          headers: {
            'User-Agent': USER_AGENT,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          },
          redirect: 'manual',
          signal: controller.signal,
        });
      }
      
      // 检查重定向次数
      if (redirectCount >= opts.maxRedirects && response.status >= 300 && response.status < 400) {
        return { success: false, error: `Too many redirects (max: ${opts.maxRedirects})` };
      }
      
      // 检查响应状态
      if (!response.ok) {
        return { success: false, error: `HTTP error: ${response.status}` };
      }
      
      // 获取内容
      const contentType = response.headers.get('Content-Type');
      const buffer = await response.arrayBuffer();
      const html = detectAndDecodeContent(buffer, contentType);
      
      // 提取标题和内容
      const title = extractTitle(html);
      let content = extractContent(html);
      
      // 截断内容
      if (content.length > opts.maxLength) {
        content = content.substring(0, opts.maxLength) + '...(内容已截断)';
      }
      
      return {
        success: true,
        content,
        title,
        length: content.length,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        return { success: false, error: `Request timeout after ${opts.timeout / 1000} seconds` };
      }
      return { success: false, error: error.message };
    }
    return { success: false, error: 'Unknown error during extraction' };
  }
}
