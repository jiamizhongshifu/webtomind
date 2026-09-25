/**
 * 鍏变韩瀛樺偍宸ュ叿妯″潡
 * 缁熶竴绠＄悊 Supabase Storage 鐩稿叧鐨勫父閲忓拰宸ュ叿鍑芥暟
 */

// Storage bucket 鍚嶇О
export const BUCKET_NAME = 'generated-images';

// MIME 绫诲瀷鍒版墿灞曞悕鐨勬槧灏?
export const MIME_TO_EXTENSION: Record<string, string> = {
  // 鍥剧墖
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'image/heif': 'heif',
  // 瑙嗛
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  // 闊抽
  'audio/mp3': 'mp3',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/ogg': 'ogg',
  // 鏂囨。
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
 * 鏍规嵁 MIME 绫诲瀷鑾峰彇鏂囦欢鎵╁睍鍚?
 */
export function getExtensionFromMime(mimeType: string): string {
  if (MIME_TO_EXTENSION[mimeType]) {
    return MIME_TO_EXTENSION[mimeType];
  }
  // 浠?MIME 绫诲瀷涓彁鍙栵紙濡?video/mp4 -> mp4锛?
  const parts = mimeType.split('/');
  return parts[1]?.split('+')[0] || 'bin';
}

/**
 * 鐢熸垚鍙嬪ソ鐨勬枃浠跺悕
 * 鏍煎紡: webtomind-2026-01-20-143052-abc123.jpeg
 * @param mimeType - 鏂囦欢 MIME 绫诲瀷
 * @param originalName - 鍘熷鏂囦欢鍚嶏紙鍙€夛級
 * @returns 鏍煎紡鍖栫殑鏂囦欢鍚?
 */
export function generateFriendlyFileName(
  mimeType: string,
  originalName?: string
): string {
  const now = new Date();
  // 鏍煎紡鍖栨棩鏈熸椂闂? 2026-01-20-143052
  const dateStr = now
    .toISOString()
    .replace(/T/, '-')
    .replace(/:/g, '')
    .slice(0, 17);
  // 鐭殢鏈?ID 鐢ㄤ簬鍞竴鎬?
  const randomId = Math.random().toString(36).substring(2, 8);
  // 鎵╁睍鍚?
  const extension = getExtensionFromMime(mimeType);

  // 濡傛灉鏈夊師濮嬫枃浠跺悕锛屼娇鐢ㄦ竻鐞嗗悗鐨勫悕绉?
  if (originalName) {
    const cleanName =
      originalName
        .replace(/\.[^.]+$/, '') // 绉婚櫎鎵╁睍鍚?
        .replace(/[^a-zA-Z0-9-_]/g, '_') // 鍙繚鐣?ASCII 瀛楁瘝鏁板瓧鍜岃繛瀛楃涓嬪垝绾?
        .replace(/_+/g, '_') // 鍚堝苟杩炵画涓嬪垝绾?
        .replace(/^_|_$/g, '') // 绉婚櫎棣栧熬涓嬪垝绾?
        .slice(0, 50) || 'file'; // 闄愬埗闀垮害
    return `${cleanName}-${randomId}.${extension}`;
  }

  return `webtomind-${dateStr}-${randomId}.${extension}`;
}

/**
 * 鐢熸垚瀛樺偍璺緞
 * 鏍煎紡: {userId}/{yearMonth}/{typeDir}/{fileName}
 * @param userId - 鐢ㄦ埛 ID
 * @param mimeType - 鏂囦欢 MIME 绫诲瀷
 * @param originalName - 鍘熷鏂囦欢鍚嶏紙鍙€夛級
 * @returns 瀛樺偍璺緞
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

  // 鏍规嵁绫诲瀷鍒嗙洰褰?
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
 * 浠?data URL 涓彁鍙?base64 鏁版嵁鍜?MIME 绫诲瀷
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
 * 妫€鏌ユ槸鍚︽槸鏀寔鐨勫獟浣?data URL
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
 * 榛樿缂撳瓨绛栫暐锛?骞达級
 */
export const DEFAULT_CACHE_CONTROL = '31536000';

/**
 * 涓婁紶閰嶇疆
 */
export interface UploadOptions {
  contentType: string;
  cacheControl?: string;
  upsert?: boolean;
}

/**
 * 鑾峰彇榛樿涓婁紶閰嶇疆
 */
export function getDefaultUploadOptions(mimeType: string): UploadOptions {
  return {
    contentType: mimeType,
    cacheControl: DEFAULT_CACHE_CONTROL,
    upsert: false
  };
}
