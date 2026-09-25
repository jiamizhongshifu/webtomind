/**
 * 服务端图片存储服务
 * 将 base64 图片/视频上传到 Supabase Storage，返回公开 URL
 */

import { getSupabase } from './supabase';
import {
  BUCKET_NAME,
  generateStoragePath,
  parseDataUrl as parseDataUrlUtil,
  getDefaultUploadOptions
} from '../utils/storage-utils';

const MAX_MEDIA_ITEMS = 10;
const MAX_MEDIA_BYTES = 5 * 1024 * 1024; // 5MB per media
const MAX_CONCURRENT_UPLOADS = 3;

// 导出别名以保持向后兼容
export { parseDataUrlUtil as parseDataUrl };

/**
 * 将 base64 媒体文件上传到 Supabase Storage（支持图片和视频）
 * @param base64Data - base64 编码的媒体数据（不含 data:xxx 前缀）
 * @param mimeType - 媒体 MIME 类型
 * @param userId - 用户 ID（用于组织存储路径）
 * @returns 媒体的公开 URL
 */
export async function uploadMediaToStorage(
  base64Data: string,
  mimeType: string,
  userId?: string
): Promise<string> {
  const supabase = getSupabase();

  // 使用共享工具生成存储路径
  const filePath = generateStoragePath(userId, mimeType);

  console.log(
    '[ImageStorage] Uploading media to:',
    filePath,
    'mimeType:',
    mimeType
  );

  // 将 base64 转换为 Buffer
  const buffer = Buffer.from(base64Data, 'base64');

  // 使用共享工具获取上传配置
  const uploadOptions = getDefaultUploadOptions(mimeType);

  // 上传到 Supabase Storage
  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(filePath, buffer, uploadOptions);

  if (error) {
    console.error('[ImageStorage] Upload failed:', error);
    throw new Error(`媒体上传失败: ${error.message}`);
  }

  console.log('[ImageStorage] Upload successful:', data.path);

  // 获取公开 URL
  const { data: urlData } = supabase.storage
    .from(BUCKET_NAME)
    .getPublicUrl(filePath);

  console.log('[ImageStorage] Public URL:', urlData.publicUrl);

  return urlData.publicUrl;
}

// 保持向后兼容的别名
export async function uploadImageToStorage(
  base64Data: string,
  mimeType: string,
  userId?: string
): Promise<string> {
  return uploadMediaToStorage(base64Data, mimeType, userId);
}

/**
 * 将 data URL 媒体文件上传到存储并返回公开 URL
 * 支持图片和视频
 * 如果上传失败，返回原始 data URL
 */
export async function uploadDataUrlMedia(
  dataUrl: string,
  userId?: string
): Promise<string> {
  // 如果不是 data URL，直接返回
  if (!dataUrl.startsWith('data:image') && !dataUrl.startsWith('data:video')) {
    return dataUrl;
  }

  const parsed = parseDataUrlUtil(dataUrl);
  if (!parsed) {
    console.warn('[ImageStorage] Invalid data URL format');
    return dataUrl;
  }

  try {
    const publicUrl = await uploadMediaToStorage(
      parsed.base64,
      parsed.mimeType,
      userId
    );
    return publicUrl;
  } catch (error) {
    console.error('[ImageStorage] Failed to upload, using data URL:', error);
    // 上传失败时返回原始 data URL（降级处理）
    return dataUrl;
  }
}

// 保持向后兼容的别名
export async function uploadDataUrlImage(
  dataUrl: string,
  userId?: string
): Promise<string> {
  return uploadDataUrlMedia(dataUrl, userId);
}

/**
 * 处理 markdown/HTML 中的所有 base64 图片和视频，上传到 Storage 并替换为 URL
 * @param content - markdown 或 HTML 内容
 * @param userId - 用户 ID
 * @returns 替换后的内容
 */
export async function processContentMedia(
  content: string,
  userId?: string
): Promise<string> {
  if (!content) return content;

  console.log(
    '[ImageStorage] processContentMedia called, content length:',
    content.length,
    'userId:',
    userId
  );

  // 匹配 HTML img 标签中的 base64: <img src="data:image/xxx;base64,xxx">
  const htmlImageRegex =
    /<img[^>]+src=["'](data:image\/[^;]+;\s*base64\s*,\s*[A-Za-z0-9+/=]+)["'][^>]*>/gi;
  // 匹配 HTML video 标签中的 base64: <video src="data:video/xxx;base64,xxx">
  const htmlVideoRegex =
    /<video[^>]+src=["'](data:video\/[^;]+;\s*base64\s*,\s*[A-Za-z0-9+/=]+)["'][^>]*>/gi;
  // 匹配 markdown 图片语法中的 base64: ![alt](data:image/xxx;base64,xxx)
  const mdImageRegex =
    /!\[([^\]]*)\]\((data:image\/[^;]+;\s*base64\s*,\s*[A-Za-z0-9+/=]+)\)/gi;

  // 收集所有需要上传的媒体
  const uploads: Array<{ dataUrl: string; type: 'image' | 'video' }> = [];

  // 收集 HTML img 标签中的 base64
  let match;
  while ((match = htmlImageRegex.exec(content)) !== null) {
    uploads.push({ dataUrl: match[1], type: 'image' });
  }

  // 收集 HTML video 标签中的 base64
  while ((match = htmlVideoRegex.exec(content)) !== null) {
    uploads.push({ dataUrl: match[1], type: 'video' });
  }

  // 收集 markdown 图片中的 base64
  while ((match = mdImageRegex.exec(content)) !== null) {
    uploads.push({ dataUrl: match[2], type: 'image' });
  }

  const imageCount = uploads.filter((u) => u.type === 'image').length;
  const videoCount = uploads.filter((u) => u.type === 'video').length;
  console.log(
    '[ImageStorage] Found',
    uploads.length,
    'base64 media (images:',
    imageCount,
    ', videos:',
    videoCount,
    ')'
  );

  if (uploads.length === 0) {
    return content;
  }

  console.log(
    '[ImageStorage] Processing',
    uploads.length,
    'base64 media in content'
  );

  // 去重（同一个媒体可能出现多次）
  const uniqueDataUrls = [...new Set(uploads.map((u) => u.dataUrl))];
  if (uniqueDataUrls.length > MAX_MEDIA_ITEMS) {
    console.warn(
      '[ImageStorage] Too many media items, truncating:',
      uniqueDataUrls.length,
      'max:',
      MAX_MEDIA_ITEMS
    );
  }
  const limitedDataUrls = uniqueDataUrls.slice(0, MAX_MEDIA_ITEMS);

  const filteredDataUrls = limitedDataUrls.filter((dataUrl) => {
    const base64Part = dataUrl.split(',')[1];
    if (!base64Part) return false;
    const approxBytes = Math.floor((base64Part.length * 3) / 4);
    if (approxBytes > MAX_MEDIA_BYTES) {
      console.warn(
        '[ImageStorage] Media too large, skipping upload:',
        approxBytes,
        'bytes'
      );
      return false;
    }
    return true;
  });

  const uploadResults: Array<{
    dataUrl: string;
    url: string;
    success: boolean;
  }> = [];
  for (let i = 0; i < filteredDataUrls.length; i += MAX_CONCURRENT_UPLOADS) {
    const batch = filteredDataUrls.slice(i, i + MAX_CONCURRENT_UPLOADS);
    const results = await Promise.all(
      batch.map(async (dataUrl) => {
        try {
          const url = await uploadDataUrlMedia(dataUrl, userId);
          return { dataUrl, url, success: url !== dataUrl };
        } catch (error) {
          console.error('[ImageStorage] Failed to upload media:', error);
          return { dataUrl, url: dataUrl, success: false };
        }
      })
    );
    uploadResults.push(...results);
  }

  // 替换所有 base64 为 URL
  let result = content;
  for (const { dataUrl, url } of uploadResults) {
    if (dataUrl !== url) {
      // 使用 split/join 替换，避免正则特殊字符问题
      result = result.split(dataUrl).join(url);
    }
  }

  const successCount = uploadResults.filter((r) => r.success).length;
  console.log(
    '[ImageStorage] Uploaded',
    successCount,
    'media files to Storage'
  );

  return result;
}

// 保持向后兼容的别名
export async function processContentImages(
  content: string,
  userId?: string
): Promise<string> {
  return processContentMedia(content, userId);
}
