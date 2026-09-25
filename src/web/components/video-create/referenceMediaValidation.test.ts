import { describe, expect, it } from 'vitest';
import {
  getReferenceMediaReadError,
  validateReferenceMedia,
  validateReferenceMediaFileSize
} from './referenceMediaValidation';

const VALID_VIDEO = {
  mediaType: 'video' as const,
  fileSizeBytes: 10 * 1024 * 1024,
  metadata: { duration: 10, width: 1280, height: 720 },
  existingDurations: [],
  locale: 'zh-CN' as const
};

describe('reference media validation', () => {
  it('accepts a reference video that stays inside every supported bound', () => {
    expect(validateReferenceMedia(VALID_VIDEO)).toBeNull();
  });

  it('identifies the reported 80 MB sample as a duration failure, not a size failure', () => {
    const issue = validateReferenceMedia({
      ...VALID_VIDEO,
      fileSizeBytes: 89_043_687,
      metadata: { duration: 44.366667, width: 1254, height: 720 }
    });

    expect(issue).toEqual(
      expect.objectContaining({
        code: 'duration_out_of_range',
        message:
          '参考视频时长为 44.37 秒，允许范围为 2–15 秒；文件大小 84.9 MB 符合上限。请裁剪到 15 秒以内后重试。'
      })
    );
  });

  it('reports the measured file size when the file is too large', () => {
    const issue = validateReferenceMedia({
      ...VALID_VIDEO,
      fileSizeBytes: 201 * 1024 * 1024
    });

    expect(issue?.code).toBe('file_too_large');
    expect(issue?.message).toContain('大小为 201 MB，上限为 200 MB');
  });

  it('rejects an oversized file before browser metadata parsing', () => {
    expect(
      validateReferenceMediaFileSize({
        mediaType: 'video',
        fileSizeBytes: 201 * 1024 * 1024,
        locale: 'zh-CN'
      })?.code
    ).toBe('file_too_large');
  });

  it('separates dimension, aspect-ratio, and total-pixel failures', () => {
    expect(
      validateReferenceMedia({
        ...VALID_VIDEO,
        metadata: { duration: 10, width: 200, height: 200 }
      })?.code
    ).toBe('dimensions_out_of_range');

    expect(
      validateReferenceMedia({
        ...VALID_VIDEO,
        metadata: { duration: 10, width: 3000, height: 1000 }
      })?.code
    ).toBe('aspect_ratio_out_of_range');

    expect(
      validateReferenceMedia({
        ...VALID_VIDEO,
        metadata: { duration: 10, width: 4096, height: 2160 }
      })?.code
    ).toBe('pixel_count_out_of_range');
  });

  it('reports the resulting total duration across multiple references', () => {
    const issue = validateReferenceMedia({
      ...VALID_VIDEO,
      metadata: { duration: 6, width: 1280, height: 720 },
      existingDurations: [9.5]
    });

    expect(issue).toEqual(
      expect.objectContaining({
        code: 'total_duration_exceeded',
        message:
          '加入后参考视频总时长为 15.5 秒，上限为 15 秒。请缩短当前文件或移除其他参考视频。'
      })
    );
  });

  it('uses the selected model reference-duration limit for Seedance 2.5', () => {
    expect(
      validateReferenceMedia({
        ...VALID_VIDEO,
        metadata: { duration: 20, width: 1280, height: 720 },
        existingDurations: [10],
        maxDurationSeconds: 30
      })
    ).toBeNull();

    expect(
      validateReferenceMedia({
        ...VALID_VIDEO,
        metadata: { duration: 20.5, width: 1280, height: 720 },
        existingDurations: [10],
        maxDurationSeconds: 30
      })
    ).toMatchObject({
      code: 'total_duration_exceeded',
      message:
        '加入后参考视频总时长为 30.5 秒，上限为 30 秒。请缩短当前文件或移除其他参考视频。'
    });
  });

  it('uses the audio size limit and gives an actionable metadata read error', () => {
    expect(
      validateReferenceMedia({
        mediaType: 'audio',
        fileSizeBytes: 16 * 1024 * 1024,
        metadata: { duration: 10 },
        existingDurations: [],
        locale: 'zh-CN'
      })?.message
    ).toContain('参考音频大小为 16 MB，上限为 15 MB');

    expect(getReferenceMediaReadError('video', 'zh-CN')).toBe(
      '无法读取参考视频信息。请确认文件未损坏，并重新导出为支持的格式后重试。'
    );
  });

  it('provides equivalent actionable copy in English', () => {
    const issue = validateReferenceMedia({
      ...VALID_VIDEO,
      fileSizeBytes: 89_043_687,
      metadata: { duration: 44.366667, width: 1254, height: 720 },
      locale: 'en-US'
    });

    expect(issue?.message).toBe(
      'The reference video is 44.37s long; the allowed range is 2–15s. Its 84.9 MB file size is within the limit. Trim it to 15s or less and try again.'
    );
  });
});
