/**
 * Workspace Studio Chart Image API
 * POST: 使用 Nano Banana Pro（gemini-3.1-flash-image-preview）生成图表图片并上传 studio-assets
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  getUserIdFromRequest,
  getCorsHeadersForRequest
} from '../utils/auth';
import {
  createAiProviderUsageTiming,
  estimateTokensFromText,
  extractGeminiUsage,
  recordAiProviderUsage,
  resolveTokenUsageSource
} from '../utils/ai-provider-usage';
import { fetchModelWithTimeout } from '../utils/model-fetch';
import { isOfficialGeminiEnabled } from '../utils/model-provider-routing';
import {
  consumeModelRateLimit,
  createModelRateLimitResponse
} from '../utils/model-rate-limit';

export const config = {
  runtime: 'edge',
  maxDuration: 60
};

interface StudioChartImageRequest {
  instruction: string;
  dataText?: string;
}

function getSupabaseAdmin(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
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

function buildPrompt(input: StudioChartImageRequest): string {
  const instruction = input.instruction.trim();
  const dataText = (input.dataText || '').trim();

  return `
你是一名专业信息设计师。请根据用户提供的数据和意图，生成“一张图表图片”。

硬性要求：
1) 只生成图表图片（不要返回解释文字）；
2) 图表元素清晰，字号可读，布局平衡；
3) 画面比例 16:9，白色或浅色背景；
4) 包含必要标题和图例；
5) 不要出现无关装饰。

用户图表需求：
${instruction}

数据（可能为原始文本/结构化摘要）：
${dataText || '无'}
`.trim();
}

async function generateImageDataUrl(
  apiKey: string,
  prompt: string,
  userId: string
): Promise<{ dataUrl: string; mimeType: string } | null> {
  const model = 'gemini-3.1-flash-image-preview';
  const apiUrl =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const timing = createAiProviderUsageTiming();

  const response = await fetchModelWithTimeout(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'] }
    })
  }, { timeoutMs: 45_000, label: 'official Gemini chart image' });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    await recordAiProviderUsage({
      userId,
      provider: 'gemini',
      model,
      endpoint: 'generateContent',
      source: 'workspace_studio_chart_image',
      status: 'failed',
      promptChars: prompt.length,
      inputTokens: estimateTokensFromText(prompt),
      tokenUsageSource: 'estimated',
      latencyMs: timing.mark(),
      startedAt: timing.startedAt,
      errorMessage: `Image generation failed: ${response.status} ${text.slice(0, 500)}`
    });
    throw new Error(`Image generation failed: ${response.status} ${text}`);
  }

  const data = (await response.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ inlineData?: { mimeType?: string; data?: string } }>;
      };
    }>;
    usageMetadata?: unknown;
  };

  const parts = data.candidates?.[0]?.content?.parts || [];
  for (const part of parts) {
    const mimeType = part.inlineData?.mimeType || '';
    const base64 = part.inlineData?.data || '';
    if (mimeType.startsWith('image/') && base64) {
      const usage = extractGeminiUsage(data);
      await recordAiProviderUsage({
        userId,
        provider: 'gemini',
        model,
        endpoint: 'generateContent',
        source: 'workspace_studio_chart_image',
        status: 'succeeded',
        promptChars: prompt.length,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        totalTokens: usage.totalTokens,
        tokenUsageSource: resolveTokenUsageSource(usage),
        imageCount: 1,
        latencyMs: timing.mark(),
        startedAt: timing.startedAt
      });
      return {
        dataUrl: `data:${mimeType};base64,${base64}`,
        mimeType
      };
    }
  }

  await recordAiProviderUsage({
    userId,
    provider: 'gemini',
    model,
    endpoint: 'generateContent',
    source: 'workspace_studio_chart_image',
    status: 'failed',
    promptChars: prompt.length,
    inputTokens: estimateTokensFromText(prompt),
    tokenUsageSource: 'estimated',
    latencyMs: timing.mark(),
    startedAt: timing.startedAt,
    errorMessage: 'Gemini response did not include an image'
  });
  return null;
}

async function generateImageWithTuzi(
  apiKey: string,
  baseURL: string,
  prompt: string,
  userId: string
): Promise<{ dataUrl: string; mimeType: string } | null> {
  const model = 'gemini-3.1-flash-image-preview';
  const timing = createAiProviderUsageTiming();
  const endpoint = `${baseURL.replace(/\/+$/, '').replace(/\/v1$/, '')}/v1/images/generations`;
  const response = await fetchModelWithTimeout(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      prompt,
      size: '1536x864',
      n: 1,
      response_format: 'b64_json'
    })
  }, { timeoutMs: 45_000, label: 'Tuzi chart image' });
  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    await recordAiProviderUsage({
      userId,
      provider: 'tuzi',
      model,
      endpoint: 'images/generations',
      source: 'workspace_studio_chart_image',
      status: 'failed',
      promptChars: prompt.length,
      inputTokens: estimateTokensFromText(prompt),
      tokenUsageSource: 'estimated',
      latencyMs: timing.mark(),
      startedAt: timing.startedAt,
      errorMessage: `Tuzi image failed: ${response.status} ${errorText.slice(0, 500)}`
    });
    throw new Error(`Tuzi image failed: ${response.status}`);
  }
  const data = (await response.json()) as {
    data?: Array<{ b64_json?: string; mime_type?: string }>;
  };
  const image = data.data?.[0];
  if (!image?.b64_json) throw new Error('Tuzi response did not include base64 image');
  const mimeType = image.mime_type?.startsWith('image/') ? image.mime_type : 'image/png';
  await recordAiProviderUsage({
    userId,
    provider: 'tuzi',
    model,
    endpoint: 'images/generations',
    source: 'workspace_studio_chart_image',
    status: 'succeeded',
    promptChars: prompt.length,
    inputTokens: estimateTokensFromText(prompt),
    tokenUsageSource: 'estimated',
    imageCount: 1,
    latencyMs: timing.mark(),
    startedAt: timing.startedAt
  });
  return { dataUrl: `data:${mimeType};base64,${image.b64_json}`, mimeType };
}

async function uploadToStudioAssets(
  sb: SupabaseClient,
  userId: string,
  base64: string,
  mimeType: string
): Promise<string> {
  const date = new Date();
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const random = Math.random().toString(36).slice(2, 8);
  const ext = mimeType.includes('png')
    ? 'png'
    : mimeType.includes('jpeg')
      ? 'jpg'
      : 'png';
  const filePath = `${userId}/${y}${m}/chart-${Date.now()}-${random}.${ext}`;

  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const { error } = await sb.storage.from('studio-assets').upload(filePath, bytes, {
    contentType: mimeType,
    cacheControl: '31536000',
    upsert: false
  });
  if (error) {
    throw new Error(`Upload failed: ${error.message}`);
  }

  const { data } = sb.storage.from('studio-assets').getPublicUrl(filePath);
  return data.publicUrl;
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
    bucket: 'workspace_studio_chart_image',
    maxRequests: 4
  });
  if (!rateLimit.allowed) return createModelRateLimitResponse(rateLimit, corsHeaders);

  try {
    const body = (await request.json()) as StudioChartImageRequest;
    if (!body.instruction || body.instruction.trim().length === 0) {
      return jsonResponse({ error: 'instruction 不能为空' }, corsHeaders, 400);
    }
    if (body.instruction.length > 4_000 || (body.dataText?.length || 0) > 20_000) {
      return jsonResponse({ error: '图表输入内容过长' }, corsHeaders, 400);
    }

    const geminiApiKey =
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_API_KEY ||
      process.env.GOOGLE_GEMINI_API_KEY;
    const tuziApiKey = process.env.TUZI_IMAGE_API_KEY || process.env.TUZI_API_KEY;
    const tuziBaseURL = process.env.TUZI_IMAGE_API_BASE_URL || process.env.TUZI_API_BASE_URL || 'https://api.tu-zi.com';
    if (!tuziApiKey && (!geminiApiKey || !isOfficialGeminiEnabled())) {
      return jsonResponse({ error: '图像模型服务未配置' }, corsHeaders, 503);
    }

    const sb = getSupabaseAdmin();
    if (!sb) {
      return jsonResponse({ error: 'Supabase not configured' }, corsHeaders, 500);
    }

    const prompt = buildPrompt(body);
    let generated: { dataUrl: string; mimeType: string } | null = null;
    let provider = 'tuzi';
    if (tuziApiKey && tuziBaseURL) {
      try {
        generated = await generateImageWithTuzi(tuziApiKey, tuziBaseURL, prompt, userId);
      } catch (error) {
        if (!geminiApiKey || !isOfficialGeminiEnabled()) throw error;
      }
    }
    if (!generated && geminiApiKey && isOfficialGeminiEnabled()) {
      provider = 'gemini_official';
      generated = await generateImageDataUrl(geminiApiKey, prompt, userId);
    }
    if (!generated) {
      return jsonResponse({ error: '未生成图片' }, corsHeaders, 500);
    }

    const base64 = generated.dataUrl.split(',')[1] || '';
    const imageUrl = await uploadToStudioAssets(sb, userId, base64, generated.mimeType);

    return jsonResponse(
      {
        success: true,
        imageUrl,
        mimeType: generated.mimeType,
        model: 'gemini-3.1-flash-image-preview',
        provider
      },
      corsHeaders
    );
  } catch (error: unknown) {
    return jsonResponse(
      {
        error: '生成图表图片失败',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      corsHeaders,
      500
    );
  }
}
