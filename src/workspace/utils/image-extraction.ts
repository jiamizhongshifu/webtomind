import { createLogger } from '@/utils/logger';
import { compressImage, IMAGE_COMPRESS_CONFIG } from '@/utils/image-utils';
import type { Reference } from '@/types';
import type { UnifiedMessage, ImageBlock } from '@/types/unified-chat';

const log = createLogger('image-extraction');

const REFERENCE_IMAGE_TOTAL_BUDGET = 650 * 1024;
const REFERENCE_IMAGE_COMPRESS_THRESHOLD =
  IMAGE_COMPRESS_CONFIG.maxSizeKB * 1024;

/**
 * 从引用内容中提取图片 base64 数据（用于图片生成时传递参考图片）
 * 不限制图片数量，但单张超过阈值会自动压缩，总大小控制在预算以内
 */
export async function extractImagesFromReferences(
  refs: Reference[]
): Promise<Array<{ data: string; mimeType: string }>> {
  const MAX_TOTAL_SIZE = REFERENCE_IMAGE_TOTAL_BUDGET;
  const COMPRESS_THRESHOLD = REFERENCE_IMAGE_COMPRESS_THRESHOLD;

  log.info('[image-extraction] extractImagesFromReferences called with', refs.length, 'refs');

  const rawImages: Array<{ data: string; mimeType: string }> = [];

  for (const ref of refs) {
    log.info('[image-extraction] Processing ref:', {
      id: ref.id,
      contentLength: ref.content?.length || 0,
      hasContent: !!ref.content,
      hasDataImage: ref.content?.includes('data:image') || false
    });

    if (!ref.content) {
      log.info('[image-extraction] Ref has no content, skipping');
      continue;
    }

    const imgRegex =
      /<img[^>]+src=["']data:([^;]+);base64,([^"']+)["'][^>]*>/gi;
    let match;

    while ((match = imgRegex.exec(ref.content)) !== null) {
      const mimeType = match[1];
      const data = match[2];

      if (data && mimeType) {
        rawImages.push({ data, mimeType });
        log.info(
          '[image-extraction] Found reference image, mimeType:',
          mimeType,
          'data length:',
          data.length
        );
      }
    }
  }

  log.info('[image-extraction] Processing all', rawImages.length, 'images');

  const processedImages = await Promise.all(
    rawImages.map(async (img) => {
      if (img.data.length > COMPRESS_THRESHOLD) {
        log.info('[image-extraction] Image needs compression, size:', img.data.length);
        return compressImage(img.data, img.mimeType);
      }
      return img;
    })
  );

  const finalImages: Array<{ data: string; mimeType: string }> = [];
  let totalSize = 0;

  for (const img of processedImages) {
    const imgSize = img.data.length;
    if (totalSize + imgSize <= MAX_TOTAL_SIZE) {
      finalImages.push(img);
      totalSize += imgSize;
    } else {
      log.info(
        '[image-extraction] Skipping image due to size limit, current total:',
        totalSize,
        'image size:',
        imgSize
      );
    }
  }

  log.info(
    '[image-extraction] Total extracted reference images:',
    finalImages.length,
    'total size:',
    totalSize
  );
  return finalImages;
}

/**
 * 压缩粘贴的图片（用于发送 API 前压缩大图片，避免 413 错误）
 * 与 extractImagesFromReferences 使用相同的压缩策略
 */
export async function compressPastedImages(
  images: Array<{
    id: string;
    data: string;
    mimeType: string;
    preview?: string;
  }>
): Promise<Array<{ data: string; mimeType: string }>> {
  const MAX_TOTAL_SIZE = REFERENCE_IMAGE_TOTAL_BUDGET;
  const COMPRESS_THRESHOLD = REFERENCE_IMAGE_COMPRESS_THRESHOLD;

  log.info('[image-extraction] compressPastedImages called with', images.length, 'images');

  const processedImages = await Promise.all(
    images.map(async (img) => {
      if (img.data.length > COMPRESS_THRESHOLD) {
        log.info(
          '[image-extraction] Pasted image needs compression, size:',
          img.data.length,
          'threshold:',
          COMPRESS_THRESHOLD
        );
        return compressImage(img.data, img.mimeType);
      }
      return { data: img.data, mimeType: img.mimeType };
    })
  );

  const finalImages: Array<{ data: string; mimeType: string }> = [];
  let totalSize = 0;

  for (const img of processedImages) {
    const imgSize = img.data.length;
    if (totalSize + imgSize <= MAX_TOTAL_SIZE) {
      finalImages.push(img);
      totalSize += imgSize;
    } else {
      log.warn(
        '[image-extraction] Skipping pasted image due to size limit, current total:',
        totalSize,
        'image size:',
        imgSize
      );
    }
  }

  log.info(
    '[image-extraction] Compressed pasted images:',
    finalImages.length,
    'total size:',
    totalSize
  );
  return finalImages;
}

/**
 * 从消息列表中找到最新的 assistant 图片消息
 */
export function findLatestAssistantImage(
  messages: UnifiedMessage[]
): { imageUrl: string; messageId: string } | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role !== 'assistant') continue;

    const imageBlock = message.blocks?.find(
      (block) => block.type === 'image'
    ) as ImageBlock | undefined;

    const imageUrl = imageBlock?.imageUrl || message.imageUrl;
    if (imageUrl) {
      return { imageUrl, messageId: message.id };
    }
  }

  return null;
}
