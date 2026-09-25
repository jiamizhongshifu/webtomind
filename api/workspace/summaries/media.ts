import { SupabaseClient } from '@supabase/supabase-js';
import {
  BUCKET_NAME,
  generateStoragePath,
  getDefaultUploadOptions
} from '../../utils/storage-utils';
import {
  debugLog,
  safeErrorLog,
  safeWarnLog
} from '../../utils/logging';

const MAX_MEDIA_ITEMS = 10;
const MAX_MEDIA_BYTES = 5 * 1024 * 1024;
const MAX_CONCURRENT_UPLOADS = 3;

type EmbeddedMediaUpload = {
  dataUrl: string;
  mimeType: string;
  base64: string;
  mediaType: 'image' | 'video';
};

async function uploadMediaToStorage(
  sb: SupabaseClient,
  base64Data: string,
  mimeType: string,
  userId?: string
): Promise<string> {
  const filePath = generateStoragePath(userId, mimeType);

  debugLog('[API] Uploading media', { mimeType });

  const binaryString = atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const uploadOptions = getDefaultUploadOptions(mimeType);

  const { data, error } = await sb.storage
    .from(BUCKET_NAME)
    .upload(filePath, bytes, uploadOptions);

  if (error) {
    safeErrorLog('[API] Upload failed', error, { mimeType });
    throw new Error(`媒体上传失败: ${error.message}`);
  }

  debugLog('[API] Upload successful', { mimeType, hasPath: !!data.path });

  const { data: urlData } = sb.storage.from(BUCKET_NAME).getPublicUrl(filePath);

  return urlData.publicUrl;
}

function collectEmbeddedMedia(content: string): EmbeddedMediaUpload[] {
  const htmlImageRegex =
    /<img[^>]+src=["'](data:image\/([^;]+);\s*base64\s*,\s*([A-Za-z0-9+/=]+))["'][^>]*>/gi;
  const htmlVideoRegex =
    /<video[^>]+src=["'](data:video\/([^;]+);\s*base64\s*,\s*([A-Za-z0-9+/=]+))["'][^>]*>/gi;
  const markdownImageRegex =
    /!\[[^\]]*\]\((data:image\/([^;]+);\s*base64\s*,\s*([A-Za-z0-9+/=]+))\)/gi;

  const uploads: EmbeddedMediaUpload[] = [];
  let match;

  while ((match = htmlImageRegex.exec(content)) !== null) {
    uploads.push({
      dataUrl: match[1],
      mimeType: `image/${match[2]}`,
      base64: match[3],
      mediaType: 'image'
    });
  }

  while ((match = htmlVideoRegex.exec(content)) !== null) {
    uploads.push({
      dataUrl: match[1],
      mimeType: `video/${match[2]}`,
      base64: match[3],
      mediaType: 'video'
    });
  }

  while ((match = markdownImageRegex.exec(content)) !== null) {
    uploads.push({
      dataUrl: match[1],
      mimeType: `image/${match[2]}`,
      base64: match[3],
      mediaType: 'image'
    });
  }

  return Array.from(
    new Map(uploads.map((upload) => [upload.dataUrl, upload])).values()
  );
}

export async function processSummaryContentMedia(
  sb: SupabaseClient,
  content: string,
  userId?: string
): Promise<string> {
  if (!content) return content;

  debugLog('[API] processSummaryContentMedia input', {
    inputLength: content.length
  });

  const uploads = collectEmbeddedMedia(content);
  if (uploads.length === 0) {
    debugLog('[API] No base64 media found in content');
    return content;
  }

  if (uploads.length > MAX_MEDIA_ITEMS) {
    safeWarnLog('[API] Too many media items, truncating', {
      mediaCount: uploads.length,
      maxMediaItems: MAX_MEDIA_ITEMS
    });
  }

  const filteredUploads = uploads.slice(0, MAX_MEDIA_ITEMS).filter((upload) => {
    const approxBytes = Math.floor((upload.base64.length * 3) / 4);
    if (approxBytes > MAX_MEDIA_BYTES) {
      safeWarnLog('[API] Media too large, skipping upload', {
        approxBytes,
        maxBytes: MAX_MEDIA_BYTES,
        mediaType: upload.mediaType
      });
      return false;
    }
    return true;
  });

  debugLog('[API] Processing base64 media files', {
    mediaCount: filteredUploads.length,
    imageCount: filteredUploads.filter((upload) => upload.mediaType === 'image')
      .length,
    videoCount: filteredUploads.filter((upload) => upload.mediaType === 'video')
      .length
  });

  let result = content;
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < filteredUploads.length; i += MAX_CONCURRENT_UPLOADS) {
    const batch = filteredUploads.slice(i, i + MAX_CONCURRENT_UPLOADS);
    const batchResults = await Promise.all(
      batch.map(async (upload) => {
        try {
          debugLog('[API] Uploading embedded media', {
            mediaType: upload.mediaType,
            base64Length: upload.base64.length
          });
          const publicUrl = await uploadMediaToStorage(
            sb,
            upload.base64,
            upload.mimeType,
            userId
          );
          return { dataUrl: upload.dataUrl, url: publicUrl, success: true };
        } catch (error) {
          safeErrorLog('[API] Failed to upload embedded media', error, {
            mediaType: upload.mediaType
          });
          return {
            dataUrl: upload.dataUrl,
            url: upload.dataUrl,
            success: false
          };
        }
      })
    );

    for (const { dataUrl, url, success } of batchResults) {
      if (dataUrl !== url) {
        result = result.split(dataUrl).join(url);
      }
      if (success) {
        successCount++;
      } else {
        failCount++;
      }
    }
  }

  debugLog('[API] processSummaryContentMedia complete', {
    successCount,
    failCount,
    outputLength: result.length
  });

  return result;
}
