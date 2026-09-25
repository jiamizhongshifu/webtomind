/**
 * 用户素材上传 + VLM 反推（不入库）
 *
 * POST /api/prompt-assets/user/upload
 * Body: { imageBase64: string (data URL or raw base64), mimeType: string, locale?: 'zh-CN' | 'en-US' }
 *
 * 流程：
 *   1. 鉴权（authenticated 即可，无需 admin 白名单）
 *   2. 把图片上传到 Supabase Storage 的 prompt-asset-uploads/{userId}/{uuid}.ext
 *   3. 调 reverseImageToPromptAsset 拿 slot/prompt/tags 等结构化字段
 *   4. **不入库**，返回 { thumbnailUrl, reverse }
 *
 * 入库由前端拿到 reverse 结果让用户确认后再调 /api/prompt-assets/user 的 POST。
 */

import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '../../utils/vercel-types';
import { getUserIdFromRequest } from '../../utils/auth.js';
import { reverseImageToPromptAsset } from '../../utils/prompt-asset-reverse.js';
import { sendWebResponse, toWebRequest } from '../../utils/edge-adapter.js';
import {
  buildPromptAssetStoragePath,
  createJsonResponder,
  decodeBase64ToBytes,
  detectExtensionFromMimeType,
  estimateBase64Bytes,
  getPromptAssetBucket,
  MAX_PROMPT_ASSET_IMAGE_BYTES,
  parseBase64Payload
} from './worker-compat.js';

// Node.js runtime：避免 edge 25s 强制超时（VLM 多 slot 反推可能要 30-60s）
// maxDuration 180：反推三级 fallback 最坏 Flash 30s + Pro 50s + Tuzi 90s = 170s，需 >175s 才能跑完第三级
export const config = { runtime: 'nodejs', maxDuration: 180 };

export async function handleUserUploadRequest(
  request: Request
): Promise<Response> {
  const { corsHeaders, jsonResponse } = createJsonResponder(request);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return jsonResponse({ error: '请先登录' }, 401);
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return jsonResponse({ error: 'Supabase 未配置' }, 503);
  }

  const body = (await request.json().catch(() => ({}))) as {
    imageBase64?: string;
    mimeType?: string;
    locale?: string;
  };

  const parsed = parseBase64Payload(body.imageBase64 || '');
  if (!parsed) {
    return jsonResponse({ error: '图片数据格式错误' }, 400);
  }
  const mimeType = body.mimeType || parsed.mimeType;
  const locale = body.locale === 'en-US' ? 'en-US' : 'zh-CN';
  if (!mimeType.startsWith('image/')) {
    return jsonResponse({ error: '仅支持图片格式' }, 400);
  }

  // 估算大小（base64 长度 * 3/4 ≈ 字节数）
  const estimatedBytes = estimateBase64Bytes(parsed.base64);
  if (estimatedBytes > MAX_PROMPT_ASSET_IMAGE_BYTES) {
    return jsonResponse(
      { error: `图片超过 ${Math.floor(MAX_PROMPT_ASSET_IMAGE_BYTES / 1024 / 1024)}MB 大小限制` },
      413
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const assetBucket = getPromptAssetBucket();
  const ext = detectExtensionFromMimeType(mimeType);
  const filePath = buildPromptAssetStoragePath({ userId, extension: ext });
  const bytes = decodeBase64ToBytes(parsed.base64);
  if (!bytes) {
    return jsonResponse({ error: '图片 base64 解码失败' }, 400);
  }

  const { error: uploadError } = await supabase.storage
    .from(assetBucket)
    .upload(filePath, bytes, {
      contentType: mimeType,
      cacheControl: '31536000',
      upsert: false
    });
  if (uploadError) {
    console.error('[PromptAssetUpload] upload failed:', uploadError);
    return jsonResponse(
      { error: `图片上传失败: ${uploadError.message}` },
      500
    );
  }

  const { data: publicData } = supabase.storage
    .from(assetBucket)
    .getPublicUrl(filePath);
  const thumbnailUrl = publicData?.publicUrl;
  if (!thumbnailUrl) {
    return jsonResponse({ error: '上传成功但无法获取访问 URL' }, 500);
  }

  let reverse;
  try {
    reverse = await reverseImageToPromptAsset({
      data: parsed.base64,
      mimeType,
      locale
    });
  } catch (reverseError) {
    console.error('[PromptAssetUpload] reverse failed:', reverseError);
    // 与 reverseImageToPromptAsset 成功返回结构对齐({ items, ok }),
    // 避免前端读 reverse.items 时拿到 undefined(虽有 `|| []` 兜底,形状仍应一致)
    reverse = {
      items: [],
      ok: false,
      sourceType: 'image',
      fullPrompt: '',
      negativePrompt: '',
      error:
        reverseError instanceof Error
          ? reverseError.message
          : '图片反推服务暂不可用，请稍后重试'
    };
  }

  return jsonResponse({
    success: true,
    thumbnailUrl,
    storageBucket: assetBucket,
    storagePath: filePath,
    reverse
  });
}

export default async function handler(
  request: VercelRequest,
  response: VercelResponse
): Promise<void> {
  const webResponse = await handleUserUploadRequest(
    toWebRequest(request, '/api/prompt-assets/user/upload')
  );
  await sendWebResponse(webResponse, response);
}
