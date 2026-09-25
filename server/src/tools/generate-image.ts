/**
 * 图片生成工具
 * 使用 Gemini API 生成图片
 * 支持动态计费：根据图片尺寸收取不同积分
 */

import type { ToolResult } from '../types/api.js';

// ============================================
// 类型定义
// ============================================

/** 支持的图片尺寸 */
export type ImageSize = '1k' | '2k' | '4k';

/** 图片尺寸配置 */
interface ImageSizeConfig {
  resolution: string;
  tokens: number;
  costUsd: number;
}

/** 图片尺寸到配置的映射 */
const IMAGE_SIZE_CONFIG: Record<ImageSize, ImageSizeConfig> = {
  '1k': { resolution: '1024x1024', tokens: 1120, costUsd: 0.134 },
  '2k': { resolution: '2048x2048', tokens: 1120, costUsd: 0.134 },
  '4k': { resolution: '4096x4096', tokens: 2000, costUsd: 0.24 },
};

export interface GenerateImageParams {
  prompt: string;
  imageSize?: ImageSize;
  referenceImages?: Array<{ data: string; mimeType: string }>;
}

export interface GenerateImageResult {
  imageUrl: string;
  message: string;
  /** 用于动态计费的元信息 */
  _billing: {
    imageSize: ImageSize;
    resolution: string;
    tokens: number;
  };
}

// ============================================
// 工具定义
// ============================================

export const generateImageDefinition = {
  name: 'generate_image',
  description: '使用 AI 生成图片（基于 Gemini）。支持 1K/2K/4K 分辨率，按尺寸动态计费。',
  input_schema: {
    type: 'object' as const,
    properties: {
      prompt: {
        type: 'string',
        description: '图片生成提示词（英文效果更好）'
      },
      imageSize: {
        type: 'string',
        enum: ['1k', '2k', '4k'],
        description: '图片尺寸：1k(1024x1024, 160积分)、2k(2048x2048, 160积分)、4k(4096x4096, 280积分)。默认 2k'
      },
      referenceImages: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            data: { type: 'string', description: 'Base64 编码的图片数据' },
            mimeType: { type: 'string', description: '图片 MIME 类型，如 image/png' }
          }
        },
        description: '参考图片列表（可选，用于风格参考）'
      }
    },
    required: ['prompt']
  }
};

// ============================================
// 工具实现
// ============================================

/**
 * 使用 Gemini 生成图片
 */
async function generateImageWithGemini(
  apiKey: string,
  prompt: string,
  imageSize: ImageSize = '2k',
  referenceImages?: Array<{ data: string; mimeType: string }>
): Promise<{ imageUrl: string; config: ImageSizeConfig } | null> {
  const config = IMAGE_SIZE_CONFIG[imageSize];

  // 使用 gemini-3.1-flash-image-preview 模型
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent?key=${apiKey}`;

  const parts: unknown[] = [];
  if (referenceImages && referenceImages.length > 0) {
    for (const img of referenceImages) {
      let base64Data = img.data;
      // 如果包含 data:xxx;base64, 前缀，需要去掉
      if (base64Data.includes(',')) {
        base64Data = base64Data.split(',')[1];
      }
      parts.push({ inlineData: { mimeType: img.mimeType, data: base64Data } });
    }
  }
  parts.push({ text: prompt });

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE']
        },
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error('[GenerateImage] Gemini API failed:', response.status, errBody.slice(0, 500));
      return null;
    }

    const data = (await response.json()) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{
            inlineData?: { mimeType: string; data: string };
          }>;
        };
      }>;
    };

    const part = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
    if (part?.inlineData) {
      console.log('[GenerateImage] Success, mimeType:', part.inlineData.mimeType, 'data length:', part.inlineData.data.length);
      return {
        imageUrl: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`,
        config,
      };
    }
    console.error('[GenerateImage] No image data in response. Parts:', JSON.stringify(data.candidates?.[0]?.content?.parts?.map(p => ({ hasInlineData: !!p.inlineData, keys: Object.keys(p) })) || 'none'));
    return null;
  } catch (error) {
    console.error('[GenerateImage] Error:', error);
    return null;
  }
}

/**
 * 执行图片生成
 */
export async function executeGenerateImage(
  params: GenerateImageParams
): Promise<ToolResult> {
  const { prompt, imageSize = '2k', referenceImages } = params;

  if (!prompt) {
    return { success: false, error: '缺少必需参数: prompt' };
  }

  // 验证 imageSize
  if (!['1k', '2k', '4k'].includes(imageSize)) {
    return { success: false, error: '无效的 imageSize，支持: 1k, 2k, 4k' };
  }

  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return { success: false, error: 'Gemini API Key 未配置' };
  }

  const result = await generateImageWithGemini(apiKey, prompt, imageSize as ImageSize, referenceImages);

  if (result) {
    const response: GenerateImageResult = {
      imageUrl: result.imageUrl,
      message: `图片生成成功 (${result.config.resolution})`,
      _billing: {
        imageSize: imageSize as ImageSize,
        resolution: result.config.resolution,
        tokens: result.config.tokens,
      },
    };
    return {
      success: true,
      data: response,
    };
  }

  return { success: false, error: '图片生成失败，请稍后重试' };
}
