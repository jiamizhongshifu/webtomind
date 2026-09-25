/**
 * 把一次 /api/image/generate 的产出图作为某张个人素材的新缩略图。
 *
 * POST /api/prompt-assets/user/thumbnail
 * Body: { assetId: string; generationId: string }
 *
 * 流程：
 *   1. 鉴权用户（authenticated 即可）
 *   2. 查询 image_generations 行（必须 user_id 匹配），从 metadata 取
 *      storageBucket / storagePath（私有 bucket）
 *   3. 用 service role 从私有 bucket 下载图 bytes
 *   4. 重新上传到公共 bucket（prompt-asset-uploads 前缀）
 *   5. 更新 prompt_assets.thumbnail_url（必须 owner_user_id = userId）
 *   6. 返回更新后的素材
 *
 * 计费已在 /api/image/generate 阶段完成，本接口只搬运 + 写表，不再扣积分。
 */

import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '../../utils/vercel-types';
import { getUserIdFromRequest } from '../../utils/auth.js';
import { sendWebResponse, toWebRequest } from '../../utils/edge-adapter.js';
import {
  buildPromptAssetStoragePath,
  createJsonResponder,
  detectExtensionFromPath,
  getPromptAssetBucket,
  rowToClient,
  type PromptAssetRow
} from './worker-compat.js';

// Node.js runtime：private bucket 下载 + 公共 bucket 上传可能慢，给 60s 余量
export const config = { runtime: 'nodejs', maxDuration: 60 };

export async function handleThumbnailRequest(
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
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return jsonResponse(
      { error: 'Supabase service role 未配置，无法搬运私有缩略图' },
      503
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    assetId?: string;
    generationId?: string;
  };
  const assetId = (body.assetId || '').trim();
  const generationId = (body.generationId || '').trim();
  if (!assetId || !generationId) {
    return jsonResponse({ error: '缺少 assetId 或 generationId' }, 400);
  }

  const admin = createClient(supabaseUrl, serviceKey);
  const publicBucket = getPromptAssetBucket();

  // 1. 确认 generation 属于当前用户，拿 bucket/path
  const { data: generation, error: genError } = await admin
    .from('image_generations')
    .select('id, user_id, metadata')
    .eq('id', generationId)
    .eq('user_id', userId)
    .maybeSingle();
  if (genError) {
    console.error('[PromptAssetThumbnail] select generation failed:', genError);
    return jsonResponse({ error: '生图记录读取失败' }, 500);
  }
  if (!generation) {
    return jsonResponse({ error: '生图记录不存在或无权访问' }, 404);
  }
  const meta = (generation.metadata || {}) as Record<string, unknown>;
  const sourceBucket =
    typeof meta.storageBucket === 'string' ? meta.storageBucket : null;
  const sourcePath =
    typeof meta.storagePath === 'string' ? meta.storagePath : null;
  if (!sourceBucket || !sourcePath) {
    return jsonResponse({ error: '该生图记录未保留存储路径' }, 400);
  }

  // 2. 用 service role 下载私有 bucket 的图
  const { data: blob, error: downloadError } = await admin.storage
    .from(sourceBucket)
    .download(sourcePath);
  if (downloadError || !blob) {
    console.error(
      '[PromptAssetThumbnail] download failed:',
      downloadError
    );
    return jsonResponse({ error: '原图下载失败' }, 500);
  }
  const arrayBuf = await blob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuf);

  // 3. 上传到公共 bucket
  const ext = detectExtensionFromPath(sourcePath);
  const destPath = buildPromptAssetStoragePath({
    userId,
    extension: ext,
    prefix: 'thumb-'
  });
  const contentType = blob.type || `image/${ext === 'jpg' ? 'jpeg' : ext}`;
  const { error: uploadError } = await admin.storage
    .from(publicBucket)
    .upload(destPath, bytes, {
      contentType,
      cacheControl: '31536000',
      upsert: false
    });
  if (uploadError) {
    console.error('[PromptAssetThumbnail] upload failed:', uploadError);
    return jsonResponse(
      { error: `缩略图上传失败: ${uploadError.message}` },
      500
    );
  }
  const { data: publicData } = admin.storage
    .from(publicBucket)
    .getPublicUrl(destPath);
  const newThumbnailUrl = publicData?.publicUrl;
  if (!newThumbnailUrl) {
    return jsonResponse({ error: '缩略图无 public URL' }, 500);
  }

  // 4. 更新素材（必须 owner_user_id = userId 才能写）
  const { data: updated, error: updateError } = await admin
    .from('prompt_assets')
    .update({ thumbnail_url: newThumbnailUrl })
    .eq('id', assetId)
    .eq('owner_user_id', userId)
    .select(
      'id, slot, title, subtitle, prompt, negative_prompt, tags, thumbnail_url, visual, metadata, sort_order, created_at, updated_at, owner_user_id'
    )
    .single();
  if (updateError || !updated) {
    console.error(
      '[PromptAssetThumbnail] update prompt_assets failed:',
      updateError
    );
    // 回滚：删掉刚上传的新图，避免存储泄露
    await admin.storage
      .from(publicBucket)
      .remove([destPath])
      .catch(() => undefined);
    return jsonResponse(
      { error: '素材不存在或更新失败', detail: updateError?.message },
      500
    );
  }

  return jsonResponse({
    success: true,
    item: rowToClient(updated as PromptAssetRow)
  });
}

export default async function handler(
  request: VercelRequest,
  response: VercelResponse
): Promise<void> {
  const webResponse = await handleThumbnailRequest(
    toWebRequest(request, '/api/prompt-assets/user/thumbnail')
  );
  await sendWebResponse(webResponse, response);
}
