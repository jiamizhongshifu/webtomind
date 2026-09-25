/**
 * 微信公众号发布工具
 * 将 Markdown 内容发布到微信公众号草稿箱
 */

import { marked, type Tokens } from 'marked';
import type { ToolResult } from '../types/api.js';

// ============================================
// 类型定义
// ============================================

export interface WechatPublishParams {
  content: string;
  coverUrl: string;
  title?: string;
  theme?: 'autumn-warm' | 'spring-fresh' | 'ocean-calm';
  author?: string;
  digest?: string;
  // 用户在 Skill 中配置的微信公众号凭证
  appId?: string;
  appSecret?: string;
}

interface ThemeStyles {
  container: string;
  title: string;
  heading2: string;
  heading3: string;
  paragraph: string;
  blockquote: string;
  code: string;
  codeBlock: string;
  list: string;
  listItem: string;
  link: string;
  image: string;
  hr: string;
  strong: string;
  em: string;
}

interface Theme {
  name: string;
  styles: ThemeStyles;
}

// ============================================
// 主题定义
// ============================================

const themes: Record<string, Theme> = {
  'autumn-warm': {
    name: 'autumn-warm',
    styles: {
      container: 'background-color:#ffffff;padding:20px 15px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;',
      title: 'color:#8b4513;font-size:24px;font-weight:bold;text-align:center;margin-bottom:20px;line-height:1.4;',
      heading2: 'color:#d2691e;font-size:20px;font-weight:bold;margin:25px 0 15px;padding-left:10px;border-left:4px solid #f4a460;',
      heading3: 'color:#cd853f;font-size:18px;font-weight:bold;margin:20px 0 10px;',
      paragraph: 'color:#5d4e37;font-size:16px;line-height:1.8;margin:15px 0;text-align:justify;',
      blockquote: 'background-color:#fff8dc;border-left:4px solid #daa520;padding:15px;margin:15px 0;color:#8b7355;font-style:italic;',
      code: 'background-color:#ffefd5;color:#8b4513;padding:2px 6px;border-radius:3px;font-family:Consolas,monospace;font-size:14px;',
      codeBlock: 'background-color:#2d2d2d;color:#f8f8f2;padding:15px;border-radius:8px;overflow-x:auto;font-family:Consolas,monospace;font-size:14px;line-height:1.5;',
      list: 'color:#5d4e37;margin:15px 0;padding-left:20px;',
      listItem: 'margin:8px 0;line-height:1.6;',
      link: 'color:#d2691e;text-decoration:none;border-bottom:1px solid #f4a460;',
      image: 'max-width:100%;height:auto;border-radius:8px;margin:20px auto;display:block;box-shadow:0 4px 12px rgba(139,69,19,0.15);',
      hr: 'border:none;height:1px;background:linear-gradient(to right,transparent,#daa520,transparent);margin:30px 0;',
      strong: 'color:#8b4513;font-weight:bold;',
      em: 'color:#cd853f;font-style:italic;',
    },
  },
  'spring-fresh': {
    name: 'spring-fresh',
    styles: {
      container: 'background-color:#f5faf5;padding:20px 15px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;',
      title: 'color:#2e8b57;font-size:24px;font-weight:bold;text-align:center;margin-bottom:20px;line-height:1.4;',
      heading2: 'color:#3cb371;font-size:20px;font-weight:bold;margin:25px 0 15px;padding-left:10px;border-left:4px solid #90ee90;',
      heading3: 'color:#66cdaa;font-size:18px;font-weight:bold;margin:20px 0 10px;',
      paragraph: 'color:#2f4f4f;font-size:16px;line-height:1.8;margin:15px 0;text-align:justify;',
      blockquote: 'background-color:#f0fff0;border-left:4px solid #3cb371;padding:15px;margin:15px 0;color:#556b2f;font-style:italic;',
      code: 'background-color:#e0ffe0;color:#228b22;padding:2px 6px;border-radius:3px;font-family:Consolas,monospace;font-size:14px;',
      codeBlock: 'background-color:#1e1e1e;color:#d4d4d4;padding:15px;border-radius:8px;overflow-x:auto;font-family:Consolas,monospace;font-size:14px;line-height:1.5;',
      list: 'color:#2f4f4f;margin:15px 0;padding-left:20px;',
      listItem: 'margin:8px 0;line-height:1.6;',
      link: 'color:#3cb371;text-decoration:none;border-bottom:1px solid #90ee90;',
      image: 'max-width:100%;height:auto;border-radius:8px;margin:20px auto;display:block;box-shadow:0 4px 12px rgba(46,139,87,0.15);',
      hr: 'border:none;height:1px;background:linear-gradient(to right,transparent,#3cb371,transparent);margin:30px 0;',
      strong: 'color:#2e8b57;font-weight:bold;',
      em: 'color:#3cb371;font-style:italic;',
    },
  },
  'ocean-calm': {
    name: 'ocean-calm',
    styles: {
      container: 'background-color:#f5f8fa;padding:20px 15px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;',
      title: 'color:#1e3a5f;font-size:24px;font-weight:bold;text-align:center;margin-bottom:20px;line-height:1.4;',
      heading2: 'color:#2c5282;font-size:20px;font-weight:bold;margin:25px 0 15px;padding-left:10px;border-left:4px solid #4299e1;',
      heading3: 'color:#3182ce;font-size:18px;font-weight:bold;margin:20px 0 10px;',
      paragraph: 'color:#2d3748;font-size:16px;line-height:1.8;margin:15px 0;text-align:justify;',
      blockquote: 'background-color:#ebf8ff;border-left:4px solid #4299e1;padding:15px;margin:15px 0;color:#2b6cb0;font-style:italic;',
      code: 'background-color:#e2e8f0;color:#2c5282;padding:2px 6px;border-radius:3px;font-family:Consolas,monospace;font-size:14px;',
      codeBlock: 'background-color:#1a202c;color:#e2e8f0;padding:15px;border-radius:8px;overflow-x:auto;font-family:Consolas,monospace;font-size:14px;line-height:1.5;',
      list: 'color:#2d3748;margin:15px 0;padding-left:20px;',
      listItem: 'margin:8px 0;line-height:1.6;',
      link: 'color:#3182ce;text-decoration:none;border-bottom:1px solid #90cdf4;',
      image: 'max-width:100%;height:auto;border-radius:8px;margin:20px auto;display:block;box-shadow:0 4px 12px rgba(45,55,72,0.15);',
      hr: 'border:none;height:1px;background:linear-gradient(to right,transparent,#4299e1,transparent);margin:30px 0;',
      strong: 'color:#1e3a5f;font-weight:bold;',
      em: 'color:#3182ce;font-style:italic;',
    },
  },
};

// ============================================
// 工具定义
// ============================================

export const wechatPublishDefinition = {
  name: 'wechat_publish',
  description: '将 Markdown 文章发布到微信公众号草稿箱',
  input_schema: {
    type: 'object' as const,
    properties: {
      content: { type: 'string', description: 'Markdown 格式的文章内容' },
      coverUrl: { type: 'string', description: '封面图 URL（必填）' },
      title: { type: 'string', description: '文章标题（可选，默认从内容提取）' },
      theme: {
        type: 'string',
        enum: ['autumn-warm', 'spring-fresh', 'ocean-calm'],
        description: '主题名称（可选，默认 autumn-warm）'
      },
      author: { type: 'string', description: '作者名（可选）' },
      digest: { type: 'string', description: '文章摘要（可选，默认自动提取）' },
      appId: { type: 'string', description: '微信公众号 AppID（在 Skill 设置中配置）' },
      appSecret: { type: 'string', description: '微信公众号 AppSecret（在 Skill 设置中配置）' },
    },
    required: ['content', 'coverUrl', 'appId', 'appSecret']
  }
};

// ============================================
// 辅助函数
// ============================================

function getTheme(name: string): Theme {
  return themes[name] || themes['autumn-warm'];
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function extractTitle(content: string): string {
  const titleMatch = content.match(/^#\s+(.+)$/m);
  if (titleMatch) {
    return titleMatch[1].trim();
  }
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('!') && !trimmed.startsWith('-')) {
      return trimmed.slice(0, 50);
    }
  }
  return '无标题';
}

function extractDigest(content: string): string {
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('#')) continue;
    if (trimmed.startsWith('!')) continue;
    if (trimmed.startsWith('>')) continue;
    if (trimmed.startsWith('-') || trimmed.startsWith('*')) continue;

    let digest = trimmed
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/`([^`]+)`/g, '$1');

    if (digest.length > 120) {
      digest = digest.slice(0, 117) + '...';
    }
    return digest;
  }
  return '';
}

function convertToHtml(markdown: string, theme: Theme): string {
  marked.setOptions({
    gfm: true,
    breaks: true,
  });

  const renderer = new marked.Renderer();
  const styles = theme.styles;

  renderer.heading = ({ text, depth }: Tokens.Heading) => {
    if (depth === 1) {
      return `<h1 style="${styles.title}">${text}</h1>\n`;
    } else if (depth === 2) {
      return `<h2 style="${styles.heading2}">${text}</h2>\n`;
    } else {
      return `<h3 style="${styles.heading3}">${text}</h3>\n`;
    }
  };

  renderer.paragraph = ({ text }: Tokens.Paragraph) => {
    return `<p style="${styles.paragraph}">${text}</p>\n`;
  };

  renderer.blockquote = ({ text }: Tokens.Blockquote) => {
    return `<blockquote style="${styles.blockquote}">${text}</blockquote>\n`;
  };

  renderer.code = ({ text }: Tokens.Code) => {
    return `<pre style="${styles.codeBlock}"><code>${escapeHtml(text)}</code></pre>\n`;
  };

  renderer.codespan = ({ text }: Tokens.Codespan) => {
    return `<code style="${styles.code}">${text}</code>`;
  };

  renderer.list = (token: Tokens.List) => {
    const tag = token.ordered ? 'ol' : 'ul';
    const body = token.items.map((item) => renderer.listitem(item)).join('');
    return `<${tag} style="${styles.list}">${body}</${tag}>\n`;
  };

  renderer.listitem = (token: Tokens.ListItem) => {
    let text = '';
    if (token.tokens && token.tokens.length > 0) {
      text = token.tokens.map((t) => {
        if (t.type === 'text') {
          return (t as Tokens.Text).text || '';
        } else if (t.type === 'paragraph') {
          const para = t as Tokens.Paragraph;
          return para.tokens ? para.tokens.map((pt) => (pt as Tokens.Text).text || (pt as Tokens.Generic).raw || '').join('') : (para.text || '');
        } else {
          return (t as Tokens.Generic).raw || '';
        }
      }).join('');
    } else {
      text = token.text || token.raw || '';
    }
    return `<li style="${styles.listItem}">${text}</li>`;
  };

  renderer.link = ({ href, text }: Tokens.Link) => {
    return `<a href="${href}" style="${styles.link}">${text}</a>`;
  };

  renderer.image = ({ href, text }: Tokens.Image) => {
    return `<img src="${href}" alt="${text}" style="${styles.image}" />`;
  };

  renderer.hr = () => {
    return `<hr style="${styles.hr}" />\n`;
  };

  renderer.strong = ({ text }: Tokens.Strong) => {
    return `<strong style="${styles.strong}">${text}</strong>`;
  };

  renderer.em = ({ text }: Tokens.Em) => {
    return `<em style="${styles.em}">${text}</em>`;
  };

  marked.use({ renderer });

  const bodyHtml = marked.parse(markdown) as string;
  return `<section style="${styles.container}">${bodyHtml}</section>`;
}

// ============================================
// 微信 API 调用
// ============================================

interface TokenCache {
  token: string;
  expiresAt: number;
}

const tokenCache = new Map<string, TokenCache>();

async function getAccessToken(appId: string, appSecret: string): Promise<string> {
  const cacheKey = `${appId}:${appSecret}`;
  const cached = tokenCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now() + 60000) {
    return cached.token;
  }

  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appId}&secret=${appSecret}`;
  const response = await fetch(url);
  const data = (await response.json()) as { access_token?: string; expires_in?: number; errcode?: number; errmsg?: string };

  if (data.errcode) {
    throw new Error(`微信 API 错误: ${data.errcode} - ${data.errmsg}`);
  }

  if (!data.access_token) {
    throw new Error('获取 access_token 失败');
  }

  tokenCache.set(cacheKey, {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in || 7200) * 1000,
  });

  return data.access_token;
}

async function uploadCoverFromUrl(token: string, imageUrl: string): Promise<{ mediaId: string; url: string }> {
  // 下载图片
  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) {
    throw new Error(`下载封面图失败: ${imageResponse.status}`);
  }

  const imageBuffer = await imageResponse.arrayBuffer();
  const contentType = imageResponse.headers.get('content-type') || 'image/png';
  const ext = contentType.includes('jpeg') || contentType.includes('jpg') ? 'jpg' : 'png';

  // 上传到微信
  const formData = new FormData();
  formData.append('media', new Blob([imageBuffer], { type: contentType }), `cover.${ext}`);

  const uploadUrl = `https://api.weixin.qq.com/cgi-bin/material/add_material?access_token=${token}&type=image`;
  const uploadResponse = await fetch(uploadUrl, {
    method: 'POST',
    body: formData,
  });

  const result = (await uploadResponse.json()) as { media_id?: string; url?: string; errcode?: number; errmsg?: string };

  if (result.errcode) {
    throw new Error(`上传封面图失败: ${result.errcode} - ${result.errmsg}`);
  }

  return {
    mediaId: result.media_id || '',
    url: result.url || '',
  };
}

async function createDraft(
  token: string,
  article: {
    title: string;
    author?: string;
    digest: string;
    content: string;
    thumb_media_id: string;
  }
): Promise<string> {
  const url = `https://api.weixin.qq.com/cgi-bin/draft/add?access_token=${token}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      articles: [{
        title: article.title,
        author: article.author || '',
        digest: article.digest,
        content: article.content,
        thumb_media_id: article.thumb_media_id,
        need_open_comment: 0,
        only_fans_can_comment: 0,
      }],
    }),
  });

  const result = (await response.json()) as { media_id?: string; errcode?: number; errmsg?: string };

  if (result.errcode) {
    throw new Error(`创建草稿失败: ${result.errcode} - ${result.errmsg}`);
  }

  return result.media_id || '';
}

// ============================================
// 工具执行
// ============================================

export async function executeWechatPublish(params: WechatPublishParams): Promise<ToolResult> {
  const { content, coverUrl, theme: themeName = 'autumn-warm', author, digest: customDigest, appId, appSecret } = params;

  if (!content) {
    return { success: false, error: '缺少必需参数: content' };
  }
  if (!coverUrl) {
    return { success: false, error: '缺少必需参数: coverUrl' };
  }

  // 检查微信配置（优先使用参数传入的，其次使用环境变量）
  const wechatAppId = appId || process.env.WECHAT_APP_ID;
  const wechatAppSecret = appSecret || process.env.WECHAT_APP_SECRET;

  if (!wechatAppId || !wechatAppSecret) {
    return { success: false, error: '微信公众号配置缺失。请在 Skill 设置中配置 AppID 和 AppSecret' };
  }

  try {
    // 1. 获取 access_token
    console.log('[WechatPublish] 获取 access_token...');
    const token = await getAccessToken(wechatAppId, wechatAppSecret);

    // 2. 提取元数据
    const title = params.title || extractTitle(content);
    const digest = customDigest || extractDigest(content);

    // 3. 转换 Markdown 为 HTML
    console.log('[WechatPublish] 转换 Markdown...');
    const theme = getTheme(themeName);
    const html = convertToHtml(content, theme);

    // 4. 上传封面图
    console.log('[WechatPublish] 上传封面图...');
    const coverResult = await uploadCoverFromUrl(token, coverUrl);

    // 5. 创建草稿
    console.log('[WechatPublish] 创建草稿...');
    const mediaId = await createDraft(token, {
      title,
      author,
      digest,
      content: html,
      thumb_media_id: coverResult.mediaId,
    });

    console.log('[WechatPublish] 发布成功:', mediaId);

    return {
      success: true,
      data: {
        mediaId,
        title,
        digest,
        coverMediaId: coverResult.mediaId,
        message: '草稿创建成功，请登录微信公众平台查看草稿箱',
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '发布失败';

    // 检查常见错误
    if (errorMessage.includes('40164') || errorMessage.includes('61004')) {
      return {
        success: false,
        error: 'IP 地址未加入白名单。请登录微信公众平台 → 设置与开发 → 基本配置 → IP 白名单 添加服务器 IP',
      };
    }

    return { success: false, error: errorMessage };
  }
}
