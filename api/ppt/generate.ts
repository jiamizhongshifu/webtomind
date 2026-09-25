/**
 * PPT 生成 API - Node.js runtime
 * 使用 pptxgenjs 生成 PPTX 文件
 */

import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import PptxGenJS from 'pptxgenjs';
import {
  buildPptStoragePath,
  getPptCorsOrigin,
  normalizeGenerateRequest,
  sanitizePptFileName
} from './generate-worker-compat.js';
import {
  createAiProviderUsageTiming,
  estimateTokensFromText,
  extractGeminiUsage,
  recordAiProviderUsage,
  resolveTokenUsageSource
} from '../utils/ai-provider-usage';

// Node.js runtime (NOT Edge) - 支持 pptxgenjs
export const config = {
  runtime: 'nodejs',
  maxDuration: 60
};

type PptxTextRun = {
  text: string;
  options?: Record<string, unknown>;
};

type PptxTextInput = string | PptxTextRun[];

interface PptxSlide {
  addText: (text: PptxTextInput, options: Record<string, unknown>) => void;
  addNotes: (notes: string) => void;
}

interface PptxPresentation {
  author: string;
  title: string;
  subject: string;
  defineSlideMaster: (options: Record<string, unknown>) => void;
  addSlide: (options: Record<string, unknown>) => PptxSlide;
  write: (options: { outputType: string }) => Promise<unknown>;
}

interface VercelRequest {
  method?: string;
  headers: { authorization?: string; origin?: string };
  body: unknown;
}

interface VercelResponse {
  setHeader: (name: string, value: string) => void;
  status: (code: number) => { json: (data: unknown) => void; end: () => void };
}

// ============================================
// Types
// ============================================

interface SlideContent {
  title: string;
  bullets?: string[];
  notes?: string;
}

interface SlideOutline {
  title: string;
  slides: SlideContent[];
}

interface StyleConfig {
  backgroundColor: string;
  titleColor: string;
  textColor: string;
  accentColor: string;
  fontFace: string;
  titleFontFace: string;
}

// ============================================
// Style Configurations
// ============================================

const STYLE_CONFIGS: Record<string, StyleConfig> = {
  blueprint: {
    backgroundColor: '1a365d',
    titleColor: 'ffffff',
    textColor: 'e2e8f0',
    accentColor: '63b3ed',
    fontFace: 'Consolas',
    titleFontFace: 'Consolas'
  },
  notion: {
    backgroundColor: 'ffffff',
    titleColor: '1a1a1a',
    textColor: '4a4a4a',
    accentColor: '2eaadc',
    fontFace: 'Inter',
    titleFontFace: 'Inter'
  },
  corporate: {
    backgroundColor: '0a1628',
    titleColor: 'd4af37',
    textColor: 'ffffff',
    accentColor: 'd4af37',
    fontFace: 'Georgia',
    titleFontFace: 'Georgia'
  },
  minimal: {
    backgroundColor: 'fafafa',
    titleColor: '1a1a1a',
    textColor: '4a4a4a',
    accentColor: '000000',
    fontFace: 'Helvetica',
    titleFontFace: 'Helvetica'
  },
  'sketch-notes': {
    backgroundColor: 'fffef0',
    titleColor: '3d3d3d',
    textColor: '5a5a5a',
    accentColor: 'e57373',
    fontFace: 'Comic Sans MS',
    titleFontFace: 'Comic Sans MS'
  },
  chalkboard: {
    backgroundColor: '2d4a3e',
    titleColor: 'ffffff',
    textColor: 'e8e8e8',
    accentColor: 'ffeb3b',
    fontFace: 'Chalk',
    titleFontFace: 'Chalk'
  },
  'bold-editorial': {
    backgroundColor: 'ffffff',
    titleColor: '000000',
    textColor: '333333',
    accentColor: 'ff0000',
    fontFace: 'Impact',
    titleFontFace: 'Impact'
  },
  'dark-atmospheric': {
    backgroundColor: '0d0d0d',
    titleColor: 'ffffff',
    textColor: 'b0b0b0',
    accentColor: '6366f1',
    fontFace: 'Segoe UI',
    titleFontFace: 'Segoe UI'
  },
  watercolor: {
    backgroundColor: 'f5f0e8',
    titleColor: '4a6741',
    textColor: '5c5c5c',
    accentColor: '7eb8a6',
    fontFace: 'Palatino',
    titleFontFace: 'Palatino'
  },
  'pixel-art': {
    backgroundColor: '1a1a2e',
    titleColor: '00ff41',
    textColor: 'ffffff',
    accentColor: 'ff00ff',
    fontFace: 'Courier New',
    titleFontFace: 'Courier New'
  },
  scientific: {
    backgroundColor: 'ffffff',
    titleColor: '1e3a5f',
    textColor: '333333',
    accentColor: '0066cc',
    fontFace: 'Times New Roman',
    titleFontFace: 'Arial'
  },
  vintage: {
    backgroundColor: 'f4e9d8',
    titleColor: '5c4033',
    textColor: '6b5344',
    accentColor: '8b4513',
    fontFace: 'Georgia',
    titleFontFace: 'Georgia'
  }
};

// ============================================
// Helper Functions
// ============================================

async function getUserIdFromToken(token: string): Promise<string | null> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) return null;

  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });

  try {
    const {
      data: { user },
      error
    } = await supabase.auth.getUser(token);
    if (error || !user) return null;
    return user.id;
  } catch {
    return null;
  }
}

async function generateSlideOutline(
  content: string,
  slideCount: number,
  language: string,
  userId: string,
  title?: string
): Promise<SlideOutline> {
  const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_API_KEY 未配置');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: process.env.PPT_TEXT_MODEL || 'gemini-3.5-flash' });

  const languageInstruction =
    language === 'zh'
      ? '使用中文输出'
      : language === 'en'
        ? 'Output in English'
        : '使用与输入内容相同的语言输出';

  const prompt = `你是一个专业的 PPT 设计师。请根据以下内容创建一个 ${slideCount} 页的演示文稿大纲。

${languageInstruction}

内容：
${content}

${title ? `标题建议: ${title}` : ''}

请以 JSON 格式返回，格式如下：
{
  "title": "演示文稿标题",
  "slides": [
    {
      "title": "幻灯片标题",
      "bullets": ["要点1", "要点2", "要点3"],
      "notes": "演讲者备注（可选）"
    }
  ]
}

要求：
1. 第一页是标题页，只有标题，bullets 为空数组
2. 第二页是目录/概述页
3. 中间是内容页，每页 3-5 个要点
4. 最后一页是总结/结论页
5. 每个要点简洁有力，不超过 20 个字
6. 确保逻辑连贯，结构清晰

只返回 JSON，不要其他内容。`;

  console.log('[PPT Generate] Generating outline with Gemini...');

  const timing = createAiProviderUsageTiming();
  let responseText = '';
  try {
    const result = await model.generateContent(prompt);
    responseText = result.response.text();
    const usage = extractGeminiUsage(result.response as unknown);
    await recordAiProviderUsage({
      userId,
      provider: 'gemini',
      model: process.env.PPT_TEXT_MODEL || 'gemini-3.5-flash',
      endpoint: 'generateContent',
      source: 'ppt_generate_outline',
      status: responseText ? 'succeeded' : 'failed',
      inputTokens: usage.inputTokens ?? estimateTokensFromText(prompt),
      outputTokens: usage.outputTokens ?? estimateTokensFromText(responseText),
      totalTokens: usage.totalTokens,
      tokenUsageSource: resolveTokenUsageSource({
        ...usage,
        estimated: !usage.totalTokens && !usage.inputTokens && !usage.outputTokens
      }),
      promptChars: prompt.length,
      responseChars: responseText.length,
      latencyMs: timing.mark(),
      errorMessage: responseText ? null : 'Gemini returned empty PPT outline',
      metadata: { slideCount, language },
      startedAt: timing.startedAt
    });
  } catch (error) {
    await recordAiProviderUsage({
      userId,
      provider: 'gemini',
      model: process.env.PPT_TEXT_MODEL || 'gemini-3.5-flash',
      endpoint: 'generateContent',
      source: 'ppt_generate_outline',
      status: 'failed',
      inputTokens: estimateTokensFromText(prompt),
      tokenUsageSource: 'estimated',
      promptChars: prompt.length,
      latencyMs: timing.mark(),
      errorMessage: error instanceof Error ? error.message : String(error),
      metadata: { slideCount, language },
      startedAt: timing.startedAt
    });
    throw error;
  }

  // 提取 JSON（处理可能的 markdown 代码块）
  let jsonStr = responseText;
  const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1];
  }

  try {
    const outline = JSON.parse(jsonStr.trim()) as SlideOutline;
    console.log(
      '[PPT Generate] Generated outline:',
      outline.title,
      `(${outline.slides.length} slides)`
    );
    return outline;
  } catch (e) {
    console.error('[PPT Generate] Failed to parse outline JSON:', e);
    throw new Error('无法解析 AI 生成的大纲');
  }
}

function createPptx(outline: SlideOutline, style: string): PptxPresentation {
  const PptxConstructor = PptxGenJS as unknown as new () => PptxPresentation;
  const pptx = new PptxConstructor();
  const styleConfig = STYLE_CONFIGS[style] || STYLE_CONFIGS.blueprint;

  // 设置演示文稿属性
  pptx.author = 'WebToMind AI';
  pptx.title = outline.title;
  pptx.subject = 'AI Generated Presentation';

  // 定义母版
  pptx.defineSlideMaster({
    title: 'MAIN',
    background: { color: styleConfig.backgroundColor }
  });

  // 生成每一页幻灯片
  outline.slides.forEach((slideContent, index) => {
    const slide = pptx.addSlide({ masterName: 'MAIN' });

    if (index === 0) {
      // 标题页 - 居中大标题
      slide.addText(slideContent.title, {
        x: '10%',
        y: '40%',
        w: '80%',
        h: '20%',
        fontSize: 44,
        fontFace: styleConfig.titleFontFace,
        color: styleConfig.titleColor,
        align: 'center',
        bold: true
      });

      // 副标题（如果有 bullets）
      if (slideContent.bullets && slideContent.bullets.length > 0) {
        slide.addText(slideContent.bullets[0], {
          x: '10%',
          y: '60%',
          w: '80%',
          h: '10%',
          fontSize: 20,
          fontFace: styleConfig.fontFace,
          color: styleConfig.textColor,
          align: 'center'
        });
      }
    } else {
      // 内容页 - 标题 + 要点
      slide.addText(slideContent.title, {
        x: '5%',
        y: '5%',
        w: '90%',
        h: '15%',
        fontSize: 32,
        fontFace: styleConfig.titleFontFace,
        color: styleConfig.titleColor,
        bold: true
      });

      // 要点列表
      if (slideContent.bullets && slideContent.bullets.length > 0) {
        const bulletText = slideContent.bullets.map((bullet) => ({
          text: bullet,
          options: {
            bullet: { type: 'bullet' as const, color: styleConfig.accentColor },
            fontSize: 20,
            fontFace: styleConfig.fontFace,
            color: styleConfig.textColor,
            breakLine: true
          }
        }));

        slide.addText(bulletText, {
          x: '5%',
          y: '25%',
          w: '90%',
          h: '65%',
          valign: 'top',
          paraSpaceAfter: 12
        });
      }

      // 添加演讲者备注
      if (slideContent.notes) {
        slide.addNotes(slideContent.notes);
      }
    }

    // 页码（除标题页外）
    if (index > 0) {
      slide.addText(`${index}`, {
        x: '90%',
        y: '92%',
        w: '8%',
        h: '5%',
        fontSize: 10,
        color: styleConfig.textColor,
        align: 'right'
      });
    }
  });

  return pptx;
}

async function uploadToSupabase(
  pptxBuffer: Buffer,
  fileName: string,
  userId: string
): Promise<string> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Supabase 配置缺失');
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // 生成存储路径: {userId}/{yearMonth}/pptx/{fileName} (与其他媒体保持一致)
  const storagePath = buildPptStoragePath({ userId, fileName });

  console.log('[PPT Generate] Uploading to Supabase Storage:', storagePath);

  const { error: uploadError } = await supabase.storage
    .from('generated-images')
    .upload(storagePath, pptxBuffer, {
      contentType:
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      cacheControl: '31536000', // 1 年缓存（与其他媒体一致）
      upsert: false
    });

  if (uploadError) {
    console.error('[PPT Generate] Upload error:', uploadError);
    throw new Error(`上传失败: ${uploadError.message}`);
  }

  // 使用 Public URL（永久有效，与其他媒体保持一致）
  const { data: urlData } = supabase.storage
    .from('generated-images')
    .getPublicUrl(storagePath);

  console.log('[PPT Generate] Generated public URL:', urlData.publicUrl);
  return urlData.publicUrl;
}

// ============================================
// Main Handler
// ============================================

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  // CORS - 动态获取
  res.setHeader(
    'Access-Control-Allow-Origin',
    getPptCorsOrigin(req.headers.origin as string | undefined)
  );
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // 验证用户
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: '未授权' });
    return;
  }

  const token = authHeader.slice(7);
  const userId = await getUserIdFromToken(token);

  if (!userId) {
    res.status(401).json({ error: '无效的认证' });
    return;
  }

  try {
    const normalized = normalizeGenerateRequest(req.body);
    if (!normalized.ok) {
      res.status(normalized.status).json({ error: normalized.error });
      return;
    }
    const { content, style, slideCount, language, title } = normalized.value;

    console.log('[PPT Generate] Starting generation:', {
      style,
      slideCount,
      language,
      contentLength: content.length
    });

    // 1. 使用 Gemini 生成大纲
    const outline = await generateSlideOutline(
      content,
      slideCount,
      language,
      userId,
      title
    );

    // 2. 创建 PPTX
    const pptx = createPptx(outline, style);

    // 3. 生成 Buffer
    const pptxBuffer = (await pptx.write({
      outputType: 'nodebuffer'
    })) as Buffer;

    console.log(
      '[PPT Generate] PPTX generated, size:',
      pptxBuffer.length,
      'bytes'
    );

    // 4. 上传到 Supabase
    const fileName = sanitizePptFileName(outline.title);
    const downloadUrl = await uploadToSupabase(pptxBuffer, fileName, userId);

    // Public URL 永久有效，无需 expiresAt
    res.status(200).json({
      success: true,
      downloadUrl,
      slideCount: outline.slides.length,
      outline: outline.slides.map((s) => s.title)
    });
  } catch (error) {
    console.error('[PPT Generate] Error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'PPT 生成失败'
    });
  }
}
