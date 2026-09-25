/**
 * VisionPreprocessor — 多模态图片预处理
 *
 * 当用户发送带图片的请求时，先调用 VLM（glm-4.6v）对图片进行理解，
 * 将理解结果作为文本上下文注入到 prompt 中，
 * 再交给文本模型（glm-5）进行工具推理和回复。
 *
 * 这样实现了「双模型自动切换」：
 * - 图片理解 → VLM（glm-4.6v）
 * - 文本推理 + 工具调用 → 文本模型（glm-5）
 */

import { getOpenAgentProvider } from '../config/feature-flags.js';

/** 图片引用（与前端 ChatContext.referenceImages 对齐） */
interface ReferenceImage {
  data: string;     // base64 或 data URL
  mimeType: string; // e.g. 'image/png'
}

/** VLM 模型名 — 默认 gpt-5.5（通过 Tuzi 中转） */
function resolveVLMModel(): string {
  return (
    process.env.OPENAI_VLM_MODEL ||
    process.env.TUZI_VLM_MODEL ||
    'gpt-5.5'
  );
}

/**
 * 归一化 base URL：智谱/OpenAI 自带 /vN 后缀，Tuzi/DeepSeek 不带。
 * 末尾缺少 /v{数字} 时自动补 /v1，让下游统一拼 `/chat/completions`。
 */
function normalizeChatBaseURL(url: string): string {
  const trimmed = url.replace(/\/+$/, '');
  return /\/v\d+$/.test(trimmed) ? trimmed : `${trimmed}/v1`;
}

/**
 * 调用 VLM 对图片进行理解分析
 *
 * @param prompt - 用户原始提问
 * @param images - 用户附带的图片列表
 * @returns 图片理解结果文本
 */
export async function analyzeImages(
  prompt: string,
  images: ReferenceImage[]
): Promise<string> {
  const provider = getOpenAgentProvider();

  // 目前仅 openai（智谱兼容）支持 VLM
  if (provider !== 'openai') {
    return buildFallbackDescription(images);
  }

  // VLM 优先级：显式 OPENAI_VLM_* > 项目级 TUZI_* > 主模型 OPENAI_* > 内置兜底
  const apiKey =
    process.env.OPENAI_VLM_API_KEY ||
    process.env.TUZI_API_KEY ||
    process.env.OPENAI_API_KEY;
  const baseURL =
    process.env.OPENAI_VLM_BASE_URL ||
    process.env.TUZI_API_BASE_URL ||
    process.env.OPENAI_BASE_URL ||
    'https://api.tu-zi.com';
  const vlmModel = resolveVLMModel();

  if (!apiKey) {
    return buildFallbackDescription(images);
  }

  try {
    console.log(`[VisionPreprocessor] Analyzing ${images.length} image(s) with ${vlmModel}`);

    // 构建 OpenAI 兼容格式的多模态消息
    const contentParts: Array<
      | { type: 'text'; text: string }
      | { type: 'image_url'; image_url: { url: string } }
    > = [];

    // 添加文本指令
    contentParts.push({
      type: 'text',
      text: `请仔细分析以下图片，结合用户的问题给出详细描述。

用户问题：${prompt}

请描述：
1. 图片中的主要内容和关键信息
2. 与用户问题相关的具体细节
3. 图片中的文字内容（如有）

请直接输出分析结果，不要加前缀说明。`
    });

    // 添加图片
    for (const img of images) {
      let imageUrl = img.data;
      // 如果是纯 base64（不含 data URL 前缀），补上前缀
      if (!imageUrl.startsWith('data:') && !imageUrl.startsWith('http')) {
        imageUrl = `data:${img.mimeType};base64,${imageUrl}`;
      }
      contentParts.push({
        type: 'image_url',
        image_url: { url: imageUrl }
      });
    }

    // 调用 VLM API（base URL 自动补 /v1 兼容 Tuzi/DeepSeek 这类不带 /v1 的端点）
    const response = await fetch(`${normalizeChatBaseURL(baseURL)}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: vlmModel,
        messages: [
          {
            role: 'user',
            content: contentParts
          }
        ],
        max_tokens: 2048,
        stream: false
      })
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`[VisionPreprocessor] VLM API error ${response.status}:`, errorBody);
      return buildFallbackDescription(images);
    }

    const result = await response.json() as {
      choices?: Array<{
        message?: { content?: string }
      }>
    };

    const analysis = result.choices?.[0]?.message?.content;
    if (!analysis) {
      console.warn('[VisionPreprocessor] VLM returned empty content');
      return buildFallbackDescription(images);
    }

    console.log(`[VisionPreprocessor] Image analysis complete (${analysis.length} chars)`);
    return analysis;

  } catch (error) {
    console.error('[VisionPreprocessor] Error:', error);
    return buildFallbackDescription(images);
  }
}

/**
 * 降级方案：无法调用 VLM 时生成图片元信息描述
 */
function buildFallbackDescription(images: ReferenceImage[]): string {
  const descriptions = images.map((img, i) => {
    const sizeKB = Math.round((img.data.length * 3) / 4 / 1024);
    return `[图片${i + 1}: ${img.mimeType}, ~${sizeKB}KB]`;
  });
  return `用户附带了 ${images.length} 张图片：${descriptions.join('、')}。（无法获取图片内容描述，请提示用户用文字描述图片内容）`;
}
