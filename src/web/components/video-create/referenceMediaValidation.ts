import { VIDEO_REFERENCE_MEDIA_LIMITS as LIMITS } from '@/shared/video-reference-media-rules';

export type ReferenceMediaKind = 'video' | 'audio';

export interface ReferenceMediaMetadata {
  duration: number;
  width?: number;
  height?: number;
}

export interface ReferenceMediaValidationIssue {
  code:
    | 'file_too_large'
    | 'metadata_unreadable'
    | 'duration_out_of_range'
    | 'dimensions_out_of_range'
    | 'aspect_ratio_out_of_range'
    | 'pixel_count_out_of_range'
    | 'total_duration_exceeded';
  message: string;
}

interface ValidateReferenceMediaInput {
  mediaType: ReferenceMediaKind;
  fileSizeBytes: number;
  metadata: ReferenceMediaMetadata;
  existingDurations: number[];
  maxDurationSeconds?: number;
  locale: 'zh-CN' | 'en-US';
}

function formatNumber(
  value: number,
  locale: 'zh-CN' | 'en-US',
  maximumFractionDigits = 2
): string {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits,
    minimumFractionDigits: 0
  }).format(value);
}

function formatMegabytes(bytes: number, locale: 'zh-CN' | 'en-US'): string {
  return formatNumber(bytes / 1024 / 1024, locale, 1);
}

function metadataUnreadable(
  mediaType: ReferenceMediaKind,
  locale: 'zh-CN' | 'en-US'
): ReferenceMediaValidationIssue {
  const isEnglish = locale === 'en-US';
  return {
    code: 'metadata_unreadable',
    message: isEnglish
      ? `The reference ${mediaType} metadata could not be read. Make sure the file is not damaged and export it again in a supported format.`
      : `无法读取参考${mediaType === 'video' ? '视频' : '音频'}信息。请确认文件未损坏，并重新导出为支持的格式后重试。`
  };
}

export function getReferenceMediaReadError(
  mediaType: ReferenceMediaKind,
  locale: 'zh-CN' | 'en-US'
): string {
  return metadataUnreadable(mediaType, locale).message;
}

export function validateReferenceMediaFileSize(input: {
  mediaType: ReferenceMediaKind;
  fileSizeBytes: number;
  locale: 'zh-CN' | 'en-US';
}): ReferenceMediaValidationIssue | null {
  const { mediaType, fileSizeBytes, locale } = input;
  const isEnglish = locale === 'en-US';
  const mediaLabel = mediaType === 'video' ? 'video' : 'audio clip';
  const zhMediaLabel = mediaType === 'video' ? '视频' : '音频';
  const maxBytes = LIMITS.fileBytes[mediaType];

  if (!Number.isFinite(fileSizeBytes) || fileSizeBytes <= 0) {
    return metadataUnreadable(mediaType, locale);
  }
  if (fileSizeBytes <= maxBytes) return null;

  const actualMb = formatMegabytes(fileSizeBytes, locale);
  const maxMb = formatMegabytes(maxBytes, locale);
  return {
    code: 'file_too_large',
    message: isEnglish
      ? `The reference ${mediaLabel} is ${actualMb} MB; the limit is ${maxMb} MB. Compress or trim the file and try again.`
      : `参考${zhMediaLabel}大小为 ${actualMb} MB，上限为 ${maxMb} MB。请压缩或裁剪文件后重试。`
  };
}

export function validateReferenceMedia(
  input: ValidateReferenceMediaInput
): ReferenceMediaValidationIssue | null {
  const { mediaType, metadata, existingDurations, locale } = input;
  const maxDurationSeconds =
    typeof input.maxDurationSeconds === 'number' &&
    Number.isFinite(input.maxDurationSeconds) &&
    input.maxDurationSeconds > 0
      ? input.maxDurationSeconds
      : LIMITS.duration.max;
  const isEnglish = locale === 'en-US';
  const mediaLabel = mediaType === 'video' ? 'video' : 'audio clip';
  const zhMediaLabel = mediaType === 'video' ? '视频' : '音频';
  const fileSizeIssue = validateReferenceMediaFileSize(input);
  if (fileSizeIssue) return fileSizeIssue;

  if (!Number.isFinite(metadata.duration) || metadata.duration <= 0) {
    return metadataUnreadable(mediaType, locale);
  }
  if (
    metadata.duration < LIMITS.duration.min ||
    metadata.duration > maxDurationSeconds
  ) {
    const actualDuration = formatNumber(metadata.duration, locale);
    const actualMb = formatMegabytes(input.fileSizeBytes, locale);
    return {
      code: 'duration_out_of_range',
      message: isEnglish
        ? `The reference ${mediaLabel} is ${actualDuration}s long; the allowed range is 2–${maxDurationSeconds}s. Its ${actualMb} MB file size is within the limit. Trim it to ${maxDurationSeconds}s or less and try again.`
        : `参考${zhMediaLabel}时长为 ${actualDuration} 秒，允许范围为 2–${maxDurationSeconds} 秒；文件大小 ${actualMb} MB 符合上限。请裁剪到 ${maxDurationSeconds} 秒以内后重试。`
    };
  }

  if (mediaType === 'video') {
    const width = metadata.width || 0;
    const height = metadata.height || 0;
    if (
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      !width ||
      !height
    ) {
      return metadataUnreadable(mediaType, locale);
    }
    if (
      width < LIMITS.video.dimension.min ||
      height < LIMITS.video.dimension.min ||
      width > LIMITS.video.dimension.max ||
      height > LIMITS.video.dimension.max
    ) {
      return {
        code: 'dimensions_out_of_range',
        message: isEnglish
          ? `The reference video is ${width}×${height}px. Both width and height must be between 300 and 6000px. Resize the video and try again.`
          : `参考视频分辨率为 ${width}×${height}px，宽和高均需在 300–6000px 之间。请调整分辨率后重试。`
      };
    }

    const ratio = width / height;
    if (
      ratio < LIMITS.video.aspectRatio.min ||
      ratio > LIMITS.video.aspectRatio.max
    ) {
      const actualRatio = formatNumber(ratio, locale);
      return {
        code: 'aspect_ratio_out_of_range',
        message: isEnglish
          ? `The reference video aspect ratio is ${actualRatio}:1 (${width}×${height}px); the allowed range is 0.4–2.5. Crop the video and try again.`
          : `参考视频宽高比为 ${actualRatio}:1（${width}×${height}px），允许范围为 0.4–2.5。请裁剪画面后重试。`
      };
    }

    const pixels = width * height;
    if (pixels < LIMITS.video.pixels.min || pixels > LIMITS.video.pixels.max) {
      const actualMegapixels = formatNumber(pixels / 1_000_000, locale);
      const minMegapixels = formatNumber(
        LIMITS.video.pixels.min / 1_000_000,
        locale
      );
      const maxMegapixels = formatNumber(
        LIMITS.video.pixels.max / 1_000_000,
        locale
      );
      return {
        code: 'pixel_count_out_of_range',
        message: isEnglish
          ? `The reference video is ${actualMegapixels} MP (${width}×${height}px); the allowed range is ${minMegapixels}–${maxMegapixels} MP. Adjust the resolution and try again.`
          : `参考视频总像素为 ${actualMegapixels} MP（${width}×${height}px），允许范围为 ${minMegapixels}–${maxMegapixels} MP。请调整分辨率后重试。`
      };
    }
  }

  const totalDuration =
    existingDurations.reduce((sum, value) => sum + value, 0) +
    metadata.duration;
  if (totalDuration > maxDurationSeconds) {
    const actualDuration = formatNumber(totalDuration, locale);
    return {
      code: 'total_duration_exceeded',
      message: isEnglish
        ? `Adding this file would make the total reference ${mediaType} duration ${actualDuration}s; the total limit is ${maxDurationSeconds}s. Shorten this file or remove another reference.`
        : `加入后参考${zhMediaLabel}总时长为 ${actualDuration} 秒，上限为 ${maxDurationSeconds} 秒。请缩短当前文件或移除其他参考${zhMediaLabel}。`
    };
  }

  return null;
}
