/**
 * 閺傚洣娆㈢€涙ê鍋嶉張宥呭
 * 鐏忓棛鏁撻幋鎰畱閸ュ墽澧栭崪灞藉従娴犳牗鏋冩禒鏈电瑐娴肩姴鍩?Supabase Storage閿涘矁绻戦崶鐐插彆瀵偓 URL
 */

import { getSupabase } from '@/services/supabase-client';
import {
  BUCKET_NAME,
  generateStoragePath,
  parseDataUrl as parseDataUrlUtil,
  getDefaultUploadOptions
} from '@/utils/storage-utils';
import { createLogger } from '@/utils/logger';

const log = createLogger('ImageStorage');
const STORAGE_FAILURE_COOLDOWN_MS = 5 * 60 * 1000;
let storageFailureCooldownUntil = 0;

// 鐎电厧鍤崚顐㈡倳娴犮儰绻氶幐浣告倻閸氬骸鍚嬬€?
export { parseDataUrlUtil as parseDataUrl };

function isStorageCooldownActive(): boolean {
  return Date.now() < storageFailureCooldownUntil;
}

function markStorageFailureCooldown(error: unknown): void {
  storageFailureCooldownUntil = Date.now() + STORAGE_FAILURE_COOLDOWN_MS;
  log.warn(
    '[ImageStorage] Storage persistence cooling down after failure:',
    error
  );
}

async function uploadBlobToStorage(
  blob: Blob,
  mimeType: string,
  userId?: string,
  originalName?: string,
  logTag: 'FileStorage' | 'ImageStorage' = 'FileStorage'
): Promise<string> {
  const supabase = getSupabase();
  const filePath = generateStoragePath(userId, mimeType, originalName);

  log.info(`[${logTag}] Uploading file to:`, filePath);

  const uploadOptions = getDefaultUploadOptions(mimeType);
  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(filePath, blob, uploadOptions);

  if (error) {
    log.error(`[${logTag}] Upload failed:`, error);
    throw new Error(
      `${logTag === 'FileStorage' ? '??' : '??'}????: ${error.message}`
    );
  }

  log.info(`[${logTag}] Upload successful:`, data.path);

  const { data: urlData } = supabase.storage
    .from(BUCKET_NAME)
    .getPublicUrl(filePath);

  log.info(`[${logTag}] Public URL:`, urlData.publicUrl);

  return urlData.publicUrl;
}

export async function uploadBrowserFileToStorage(
  file: File,
  userId?: string,
  originalName?: string
): Promise<string> {
  return uploadBlobToStorage(
    file,
    file.type || 'application/octet-stream',
    userId,
    originalName || file.name,
    'FileStorage'
  );
}

/**
 * 鐏忓棔鎹㈤幇蹇旀瀮娴犺绱檅ase64閿涘绗傛导鐘插煂 Supabase Storage
 * @param base64Data - base64 缂傛牜鐖滈惃鍕瀮娴犺埖鏆熼幑顕嗙礄娑撳秴鎯?data: 閸撳秶绱戦敍?
 * @param mimeType - 閺傚洣娆?MIME 缁鐎?
 * @param userId - 閻劍鍩?ID閿涘牏鏁ゆ禍搴ｇ矋缂佸洤鐡ㄩ崒銊ㄧ熅瀵板嫸绱?
 * @param originalName - 閸樼喎顫愰弬鍥︽閸氬稄绱欓崣顖炩偓澶涚礆
 * @returns 閺傚洣娆㈤惃鍕彆瀵偓 URL
 */
export async function uploadFileToStorage(
  base64Data: string,
  mimeType: string,
  userId?: string,
  originalName?: string
): Promise<string> {
  const byteCharacters = atob(base64Data);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  const blob = new Blob([byteArray], { type: mimeType });

  return uploadBlobToStorage(
    blob,
    mimeType,
    userId,
    originalName,
    'FileStorage'
  );
}

/**
 * ? data URL ???????????? URL
 * ????????????PDF?????
 * @param dataUrl - data URL ???????
 * @param userId - ?? ID????
 * @param originalName - ?????????
 * @returns ????? URL
 */
export async function uploadDataUrlFile(
  dataUrl: string,
  userId?: string,
  originalName?: string
): Promise<string> {
  if (isStorageCooldownActive()) {
    return dataUrl;
  }

  const parsed = parseDataUrlUtil(dataUrl);
  if (!parsed) {
    log.warn('[FileStorage] Invalid data URL format');
    return dataUrl;
  }

  if (isStorageCooldownActive()) {
    return dataUrl;
  }

  try {
    const publicUrl = await uploadFileToStorage(
      parsed.base64,
      parsed.mimeType,
      userId,
      originalName
    );
    return publicUrl;
  } catch (error) {
    markStorageFailureCooldown(error);
    log.error('[FileStorage] Failed to upload, using data URL:', error);
    // 娑撳﹣绱舵径杈Е閺冩儼绻戦崶鐐插斧婵?data URL閿涘牓妾风痪褍顦╅悶鍡礆
    return dataUrl;
  }
}

/**
 * 鐏?base64 閸ュ墽澧栭幋鏍潒妫版垳绗傛导鐘插煂 Supabase Storage
 * @param base64Data - base64 缂傛牜鐖滈惃鍕崯娴ｆ挻鏆熼幑顕嗙礄娑撳秴鎯?data:xxx 閸撳秶绱戦敍?
 * @param mimeType - 婵帊缍?MIME 缁鐎?
 * @param userId - 閻劍鍩?ID閿涘牏鏁ゆ禍搴ｇ矋缂佸洤鐡ㄩ崒銊ㄧ熅瀵板嫸绱?
 * @returns 婵帊缍嬮惃鍕彆瀵偓 URL
 */
export async function uploadImageToStorage(
  base64Data: string,
  mimeType: string,
  userId?: string
): Promise<string> {
  const byteCharacters = atob(base64Data);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  const blob = new Blob([byteArray], { type: mimeType });

  return uploadBlobToStorage(blob, mimeType, userId, undefined, 'ImageStorage');
}

/**
 * ? data URL ??????????????? URL
 * ?????????
 * ??????????? data URL
 */
export async function uploadDataUrlImage(
  dataUrl: string,
  userId?: string
): Promise<string> {
  // 婵″倹鐏夋稉宥嗘Ц data URL閿涘牆娴橀悧鍥ㄥ灗鐟欏棝顣堕敍澶涚礉閻╁瓨甯存潻鏂挎礀
  if (!dataUrl.startsWith('data:image') && !dataUrl.startsWith('data:video')) {
    return dataUrl;
  }

  if (isStorageCooldownActive()) {
    return dataUrl;
  }

  const parsed = parseDataUrlUtil(dataUrl);
  if (!parsed) {
    log.warn('[ImageStorage] Invalid data URL format');
    return dataUrl;
  }

  try {
    const publicUrl = await uploadImageToStorage(
      parsed.base64,
      parsed.mimeType,
      userId
    );
    return publicUrl;
  } catch (error) {
    markStorageFailureCooldown(error);
    log.error('[ImageStorage] Failed to upload, using data URL:', error);
    // 娑撳﹣绱舵径杈Е閺冩儼绻戦崶鐐插斧婵?data URL閿涘牓妾风痪褍顦╅悶鍡礆
    return dataUrl;
  }
}

/**
 * 婢跺嫮鎮?markdown/HTML 娑擃厾娈戦幍鈧張?base64 閸ュ墽澧栭崪宀冾潒妫版埊绱濇稉濠佺炊閸?Storage 楠炶埖娴涢幑顫礋 URL
 * @param content - markdown 閹?HTML 閸愬懎顔?
 * @param userId - 閻劍鍩?ID
 * @returns 閺囨寧宕查崥搴ｆ畱閸愬懎顔?
 */
export async function processContentImages(
  content: string,
  userId?: string
): Promise<string> {
  if (!content) return content;

  // 閸栧綊鍘?HTML img 閺嶅洨顒锋稉顓犳畱 base64: <img src="data:image/xxx;base64,xxx">
  const htmlImageRegex =
    /<img[^>]+src=["'](data:image\/[^;]+;\s*base64\s*,\s*[A-Za-z0-9+/=]+)["'][^>]*>/gi;
  // 閸栧綊鍘?HTML video 閺嶅洨顒锋稉顓犳畱 base64: <video src="data:video/xxx;base64,xxx">
  const htmlVideoRegex =
    /<video[^>]+src=["'](data:video\/[^;]+;\s*base64\s*,\s*[A-Za-z0-9+/=]+)["'][^>]*>/gi;
  // 閸栧綊鍘?markdown 閸ュ墽澧栫拠顓熺《娑擃厾娈?base64: ![alt](data:image/xxx;base64,xxx)
  const mdImageRegex =
    /!\[([^\]]*)\]\((data:image\/[^;]+;\s*base64\s*,\s*[A-Za-z0-9+/=]+)\)/gi;

  let result = content;

  // 閺€鍫曟肠閹碘偓閺堝娓剁憰浣风瑐娴肩姷娈戞刊鎺嶇秼
  const uploads: Array<{
    original: string;
    dataUrl: string;
    type: 'image' | 'video';
  }> = [];

  // 閺€鍫曟肠 HTML img 閺嶅洨顒锋稉顓犳畱 base64
  let match;
  while ((match = htmlImageRegex.exec(content)) !== null) {
    uploads.push({ original: match[1], dataUrl: match[1], type: 'image' });
  }

  // 閺€鍫曟肠 HTML video 閺嶅洨顒锋稉顓犳畱 base64
  while ((match = htmlVideoRegex.exec(content)) !== null) {
    uploads.push({ original: match[1], dataUrl: match[1], type: 'video' });
  }

  // 閺€鍫曟肠 markdown 閸ュ墽澧栨稉顓犳畱 base64
  while ((match = mdImageRegex.exec(content)) !== null) {
    uploads.push({ original: match[2], dataUrl: match[2], type: 'image' });
  }

  if (uploads.length === 0 || isStorageCooldownActive()) {
    return content;
  }

  const imageCount = uploads.filter((u) => u.type === 'image').length;
  const videoCount = uploads.filter((u) => u.type === 'video').length;
  log.info(
    '[ImageStorage] Processing',
    uploads.length,
    'base64 media in content (images:',
    imageCount,
    ', videos:',
    videoCount,
    ')'
  );

  // 閸樺鍣搁敍鍫濇倱娑撯偓娑擃亜鐛熸担鎾冲讲閼宠棄鍤悳鏉款樋濞嗏槄绱?
  const uniqueUploads = [
    ...new Map(uploads.map((u) => [u.dataUrl, u])).values()
  ];

  const uploadResults: Array<{
    dataUrl: string;
    url: string;
    success: boolean;
  }> = [];

  for (const { dataUrl } of uniqueUploads) {
    if (isStorageCooldownActive()) {
      uploadResults.push({ dataUrl, url: dataUrl, success: false });
      continue;
    }

    try {
      const url = await uploadDataUrlImage(dataUrl, userId);
      uploadResults.push({ dataUrl, url, success: url !== dataUrl });
    } catch (error) {
      markStorageFailureCooldown(error);
      log.error('[ImageStorage] Failed to upload media:', error);
      uploadResults.push({ dataUrl, url: dataUrl, success: false });
    }
  }

  // 閺囨寧宕查幍鈧張?base64 娑?URL
  for (const { dataUrl, url } of uploadResults) {
    if (dataUrl !== url) {
      // 闂団偓鐟曚浇娴嗘稊澶屽濞堝﹤鐡х粭锔炬暏娴滃孩顒滈崚娆愭禌閹?
      result = result.split(dataUrl).join(url);
    }
  }

  const successCount = uploadResults.filter(
    (r) => r.success && r.dataUrl !== r.url
  ).length;
  log.info('[ImageStorage] Uploaded', successCount, 'media files to Storage');

  return result;
}
