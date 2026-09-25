/**
 * 阿里云 Z-Image 图片生成服务
 * 作为 Gemini 图片生成的备用方案
 *
 * API 文档: https://help.aliyun.com/zh/model-studio/z-image-api-reference
 */

export interface ZImageGenerateOptions {
  prompt: string;
  size?: string; // 格式: "宽*高", 默认 "1024*1536"
  promptExtend?: boolean; // 是否启用智能提示词改写
  seed?: number; // 随机种子
}

export interface ZImageResponse {
  success: boolean;
  imageUrl?: string;
  error?: string;
  reasoning?: string; // 思考过程 (promptExtend=true 时返回)
  optimizedPrompt?: string; // 优化后的提示词 (promptExtend=true 时返回)
}

function arrayBufferToBase64(arrayBuffer: ArrayBuffer): string {
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

/**
 * 使用阿里云 Z-Image 生成图片
 * 添加 25 秒超时防止 Edge Function 超时
 */
export async function generateImageWithZImage(
  apiKey: string,
  options: ZImageGenerateOptions,
  timeoutMs: number = 25000
): Promise<ZImageResponse> {
  const { prompt, size = '1024*1536', promptExtend = false, seed } = options;

  const apiUrl =
    'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';

  const requestBody: Record<string, unknown> = {
    model: 'z-image-turbo',
    input: {
      messages: [
        {
          role: 'user',
          content: [{ text: prompt }]
        }
      ]
    },
    parameters: {
      prompt_extend: promptExtend,
      size: size
    }
  };

  // 添加可选的 seed 参数
  if (seed !== undefined) {
    (requestBody.parameters as Record<string, unknown>).seed = seed;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    console.log(
      '[Z-Image] Generating image with prompt:',
      prompt.substring(0, 100) + '...'
    );
    console.log('[Z-Image] Timeout set to', timeoutMs, 'ms');

    const response = await fetch(apiUrl, {
      signal: controller.signal,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Z-Image] API error:', response.status, errorText);
      return {
        success: false,
        error: `API error: ${response.status} - ${errorText}`
      };
    }

    const data = (await response.json()) as {
      output?: {
        choices?: Array<{
          finish_reason?: string;
          message?: {
            role?: string;
            content?: Array<{ image?: string; text?: string }>;
            reasoning_content?: string;
          };
        }>;
      };
      usage?: {
        width?: number;
        height?: number;
        image_count?: number;
      };
      request_id?: string;
      code?: string;
      message?: string;
    };

    // 检查错误响应
    if (data.code) {
      console.error('[Z-Image] API returned error:', data.code, data.message);
      return {
        success: false,
        error: `${data.code}: ${data.message}`
      };
    }

    // 提取图片 URL
    const choice = data.output?.choices?.[0];
    if (!choice) {
      return {
        success: false,
        error: 'No output generated'
      };
    }

    const content = choice.message?.content;
    if (!content || content.length === 0) {
      return {
        success: false,
        error: 'Empty content in response'
      };
    }

    // 查找图片
    const imageItem = content.find((item) => item.image);
    if (!imageItem?.image) {
      return {
        success: false,
        error: 'No image in response'
      };
    }

    // 查找优化后的提示词
    const textItem = content.find((item) => item.text);

    console.log('[Z-Image] Image generated successfully');

    return {
      success: true,
      imageUrl: imageItem.image,
      optimizedPrompt: textItem?.text,
      reasoning: choice.message?.reasoning_content
    };
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('[Z-Image] Request timeout after', timeoutMs, 'ms');
      return {
        success: false,
        error: 'Request timeout'
      };
    }
    console.error('[Z-Image] Request failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * 下载图片并转换为 base64
 * Z-Image 返回的是临时 URL，需要下载后转为 base64 存储
 * 添加 15 秒超时防止 Edge Function 超时
 */
export async function downloadImageAsBase64(
  imageUrl: string,
  timeoutMs: number = 15000
): Promise<string | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    console.log('[Z-Image] Downloading image from URL...');
    const response = await fetch(imageUrl, { signal: controller.signal });
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      console.error('[Z-Image] Failed to download image:', response.status);
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    const base64 = arrayBufferToBase64(arrayBuffer);
    const contentType = response.headers.get('content-type') || 'image/png';
    
    console.log('[Z-Image] Image downloaded, size:', Math.round(arrayBuffer.byteLength / 1024), 'KB');

    return `data:${contentType};base64,${base64}`;
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('[Z-Image] Download timeout after', timeoutMs, 'ms');
    } else {
      console.error('[Z-Image] Download error:', error);
    }
    return null;
  }
}

/**
 * 完整的图片生成流程（生成 + 下载转 base64）
 */
export async function generateAndDownloadImage(
  apiKey: string,
  options: ZImageGenerateOptions
): Promise<{ success: boolean; base64Url?: string; error?: string }> {
  // 1. 生成图片
  const result = await generateImageWithZImage(apiKey, options);
  if (!result.success || !result.imageUrl) {
    return { success: false, error: result.error };
  }

  // 2. 下载并转换为 base64
  const base64Url = await downloadImageAsBase64(result.imageUrl);
  if (!base64Url) {
    return { success: false, error: 'Failed to download generated image' };
  }

  return { success: true, base64Url };
}
