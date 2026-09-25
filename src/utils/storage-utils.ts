/**
 * 共享存储工具模块
 * 统一管理 Supabase Storage 相关的常量和工具函数
 */

// Storage bucket 名称
export const BUCKET_NAME = 'generated-images';

// MIME 类型到扩展名的映射
export const MIME_TO_EXTENSION: Record<string, string> = {
  // 图片
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'image/heif': 'heif',
  // 视频
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  // 音频
  'audio/mp3': 'mp3',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/ogg': 'ogg',
  // 文档
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'text/html': 'html',
  'text/css': 'css',
  'text/javascript': 'js',
  'application/javascript': 'js',
  'text/markdown': 'md',
  'text/csv': 'csv',
  'text/xml': 'xml',
  'application/json': 'json',
  // Office
  'application/vnd.openxmlformats-officedocument.presentationml.presentation':
    'pptx',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx'
};

/**
 * 根据 MIME 类型获取文件扩展名
 */
export function getExtensionFromMime(mimeType: string): string {
  if (MIME_TO_EXTENSION[mimeType]) {
    return MIME_TO_EXTENSION[mimeType];
  }
  // 从 MIME 类型中提取（如 video/mp4 -> mp4）
  const parts = mimeType.split('/');
  return parts[1]?.split('+')[0] || 'bin';
}

/**
 * 生成友好的文件名
 * 格式: webtomind-2026-01-20-143052-abc123.jpeg
 * @param mimeType - 文件 MIME 类型
 * @param originalName - 原始文件名（可选）
 * @returns 格式化的文件名
 */
export function generateFriendlyFileName(
  mimeType: string,
  originalName?: string
): string {
  const now = new Date();
  // 格式化日期时间: 2026-01-20-143052
  const dateStr = now
    .toISOString()
    .replace(/T/, '-')
    .replace(/:/g, '')
    .slice(0, 17);
  // 短随机 ID 用于唯一性
  const randomId = Math.random().toString(36).substring(2, 8);
  // 扩展名
  const extension = getExtensionFromMime(mimeType);

  // 如果有原始文件名，使用清理后的名称
  if (originalName) {
    const cleanName =
      originalName
        .replace(/\.[^.]+$/, '') // 移除扩展名
        .replace(/[^a-zA-Z0-9-_]/g, '_') // 只保留 ASCII 字母数字和连字符下划线
        .replace(/_+/g, '_') // 合并连续下划线
        .replace(/^_|_$/g, '') // 移除首尾下划线
        .slice(0, 50) || 'file'; // 限制长度
    return `${cleanName}-${randomId}.${extension}`;
  }

  return `webtomind-${dateStr}-${randomId}.${extension}`;
}

/**
 * 生成存储路径
 * 格式: {userId}/{yearMonth}/{typeDir}/{fileName}
 * @param userId - 用户 ID
 * @param mimeType - 文件 MIME 类型
 * @param originalName - 原始文件名（可选）
 * @returns 存储路径
 */
export function generateStoragePath(
  userId: string | undefined,
  mimeType: string,
  originalName?: string
): string {
  const date = new Date();
  const yearMonth = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`;
  const userPath = userId || 'anonymous';
  const fileName = generateFriendlyFileName(mimeType, originalName);

  // 根据类型分目录
  let typeDir = '';
  if (mimeType.startsWith('video/')) {
    typeDir = 'videos/';
  } else if (mimeType.includes('presentation')) {
    typeDir = 'pptx/';
  } else if (mimeType.startsWith('audio/')) {
    typeDir = 'audio/';
  } else if (mimeType === 'application/pdf') {
    typeDir = 'docs/';
  }

  return `${userPath}/${yearMonth}/${typeDir}${fileName}`;
}

/**
 * 从 data URL 中提取 base64 数据和 MIME 类型
 */
export function parseDataUrl(
  dataUrl: string
): { base64: string; mimeType: string } | null {
  if (!dataUrl.startsWith('data:')) {
    return null;
  }

  const commaIndex = dataUrl.indexOf(',');
  if (commaIndex <= 5) {
    return null;
  }

  const metadata = dataUrl.slice(5, commaIndex);
  const base64 = dataUrl.slice(commaIndex + 1).trim();
  const metadataParts = metadata.split(';').map((part) => part.trim());
  const mimeType = metadataParts[0];
  const isBase64 = metadataParts.some(
    (part) => part.toLowerCase() === 'base64'
  );

  if (!mimeType || !isBase64 || !base64) {
    return null;
  }

  return {
    mimeType,
    base64
  };
}

/**
 * 检查是否是支持的媒体 data URL
 */
export function isSupportedMediaDataUrl(dataUrl: string): boolean {
  return (
    dataUrl.startsWith('data:image') ||
    dataUrl.startsWith('data:video') ||
    dataUrl.startsWith('data:audio') ||
    dataUrl.startsWith('data:application/pdf')
  );
}

/**
 * 默认缓存策略（1年）
 */
export const DEFAULT_CACHE_CONTROL = '31536000';

/**
 * 上传配置
 */
export interface UploadOptions {
  contentType: string;
  cacheControl?: string;
  upsert?: boolean;
}

/**
 * 获取默认上传配置
 */
export function getDefaultUploadOptions(mimeType: string): UploadOptions {
  return {
    contentType: mimeType,
    cacheControl: DEFAULT_CACHE_CONTROL,
    upsert: false
  };
}
