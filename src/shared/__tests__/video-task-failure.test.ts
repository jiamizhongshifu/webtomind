import { describe, expect, it } from 'vitest';
import { describeVideoTaskFailure } from '../video-task-failure';

describe('video task failure details', () => {
  it('turns a real-person reference rejection into actionable guidance', () => {
    expect(
      describeVideoTaskFailure(
        'The request failed because the input image may contain real person. Request id: 021784959299766f5028489cb353b460b901382cc774869215553'
      )
    ).toEqual({
      code: 'REFERENCE_IMAGE_REAL_PERSON_REJECTED',
      message:
        'Seedance 检测到输入图片可能包含真人面孔，拒绝了本次生成。请移除该图片或更换为不含真人面孔的素材后重试；直接重试相同素材可能再次失败。',
      requestId: '021784959299766f5028489cb353b460b901382cc774869215553',
      retryable: false
    });
  });

  it.each([
    "input image 'content[1]' may contain real person",
    'input image "content[1]" may contain a real person',
    'INPUT IMAGE content[1] MAY CONTAIN REAL PERSON'
  ])('recognizes indexed provider rejection: %s', (reason) => {
    const failure = describeVideoTaskFailure(
      `The request failed because the ${reason}. Request id: req-indexed`,
      undefined,
      { referenceImageUrls: ['https://example.com/person.png'] }
    );
    expect(failure).toMatchObject({
      code: 'REFERENCE_IMAGE_REAL_PERSON_REJECTED',
      requestId: 'req-indexed',
      retryable: false
    });
    expect(failure.message).toContain('第 1 张参考图可能包含真人面孔');
    expect(failure.message).not.toContain('content[1]');
  });

  it.each([
    [
      2,
      {
        referenceImageUrls: [
          'https://example.com/1.png',
          'https://example.com/2.png'
        ]
      },
      '第 2 张参考图'
    ],
    [1, { firstFrameUrl: 'https://example.com/first.png' }, '首帧图片'],
    [
      2,
      {
        firstFrameUrl: 'https://example.com/first.png',
        lastFrameUrl: 'https://example.com/last.png'
      },
      '尾帧图片'
    ],
    [
      2,
      {
        referenceImageUrls: [
          'https://example.com/first.png',
          'https://example.com/last.png'
        ],
        referenceMode: 'first-last-frame' as const
      },
      '尾帧图片'
    ],
    [
      3,
      {
        referenceVideoUrls: ['https://example.com/video.mp4'],
        referenceAudioUrls: ['https://example.com/audio.mp3'],
        firstFrameUrl: 'https://example.com/first.png'
      },
      '首帧图片'
    ],
    [9, { referenceImageUrls: ['https://example.com/1.png'] }, '输入图片'],
    [1, undefined, '输入图片']
  ])('maps content[%i] to the actual input role', (index, input, label) => {
    expect(
      describeVideoTaskFailure(
        `The input image 'content[${index}]' may contain real person.`,
        undefined,
        input
      ).message
    ).toContain(`${label}可能包含真人面孔`);
  });

  it('preserves an unknown provider reason instead of replacing it', () => {
    expect(
      describeVideoTaskFailure(null, {
        message: 'Provider rejected an unsupported camera setting'
      })
    ).toMatchObject({
      code: 'VIDEO_PROVIDER_FAILED',
      message: 'Provider rejected an unsupported camera setting',
      retryable: true
    });
  });
});
