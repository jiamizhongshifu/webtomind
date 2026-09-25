import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SEEDANCE_VIDEO_MODELS,
  getArkVideoApiModelEnvKey,
  getSeedanceVideoModelConfig,
  normalizeSeedanceVideoModelId
} from '../seedance-video-models';
import {
  buildArkVideoCreateHttpRequest,
  buildArkVideoCreatePayload,
  getArkVideoApiBaseUrl,
  getArkVideoStatusPath,
  isArkVideoGenerationAvailable,
  normalizeArkVideoCreateResponse,
  normalizeArkVideoStatusResponse
} from '../ark-video-api';

afterEach(() => vi.unstubAllEnvs());

describe('official Seedance video integration', () => {
  it('declares the official 2.5 model and the three verified 2.0 models', () => {
    expect(SEEDANCE_VIDEO_MODELS.map((model) => model.id)).toEqual([
      'seedance-2-5',
      'seedance-2-0',
      'seedance-2-0-fast',
      'seedance-2-0-mini'
    ]);
    expect(getSeedanceVideoModelConfig('seedance-2-5')).toMatchObject({
      apiModel: 'doubao-seedance-2-5-260628',
      maxReferenceImages: 30,
      maxReferenceVideos: 10,
      maxReferenceAudios: 10,
      maxReferenceMediaDurationSeconds: 30,
      supportedDurations: expect.arrayContaining([4, 15, 30]),
      supportedResolutions: ['480p', '720p'],
      supportedOutputFormats: ['mp4', 'mov'],
      creditMultiplier: 3.04,
      status: 'available'
    });
    expect(getSeedanceVideoModelConfig('seedance-2-0')).toMatchObject({
      apiModel: 'doubao-seedance-2-0-260128',
      supportedResolutions: ['480p', '720p', '1080p', '4k'],
      defaultAspectRatio: 'adaptive',
      maxReferenceImages: 9,
      maxReferenceVideos: 3,
      maxReferenceAudios: 3,
      maxReferenceMediaDurationSeconds: 15,
      supportsReferenceVideo: true,
      supportsReferenceAudio: true,
      supportsWebSearch: true,
      supportsGenerateAudio: true,
      supportedOutputFormats: ['mp4'],
      creditMultiplier: 2,
      status: 'available'
    });
    expect(getSeedanceVideoModelConfig('seedance-2-0-fast')).toMatchObject({
      apiModel: 'doubao-seedance-2-0-fast-260128',
      supportedResolutions: ['480p', '720p'],
      supportsGenerateAudio: true,
      creditMultiplier: 1.61,
      status: 'available'
    });
    expect(getSeedanceVideoModelConfig('seedance-2-0-mini')).toMatchObject({
      apiModel: 'doubao-seedance-2-0-mini-260615',
      supportedResolutions: ['480p', '720p'],
      supportsGenerateAudio: true,
      creditMultiplier: 1,
      status: 'available'
    });
    expect(
      getSeedanceVideoModelConfig('seedance-2-0').supportedDurations
    ).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
  });

  it('normalizes public aliases and supports per-model server overrides', () => {
    expect(normalizeSeedanceVideoModelId('Seedance 2.5')).toBe('seedance-2-5');
    expect(normalizeSeedanceVideoModelId('doubao-seedance-2-5-260628')).toBe(
      'seedance-2-5'
    );
    expect(normalizeSeedanceVideoModelId('Seedance 2.0 Fast')).toBe(
      'seedance-2-0-fast'
    );
    expect(
      normalizeSeedanceVideoModelId('doubao-seedance-2-0-mini-260615')
    ).toBe('seedance-2-0-mini');
    expect(getArkVideoApiModelEnvKey('seedance-2-0-mini')).toBe(
      'ARK_VIDEO_API_MODEL_SEEDANCE_2_0_MINI'
    );
    expect(
      getSeedanceVideoModelConfig('seedance-2-5', {
        ARK_VIDEO_API_MODEL_SEEDANCE_2_5: 'next-seedance-2-5-model'
      })
    ).toMatchObject({
      apiModel: 'next-seedance-2-5-model',
      status: 'available'
    });
  });

  it('builds the official Seedance 2.5 30-second MOV request', () => {
    const payload = buildArkVideoCreatePayload({
      model: 'doubao-seedance-2-5-260628',
      prompt: 'A continuous thirty-second cinematic sequence',
      aspectRatio: '16:9',
      duration: 30,
      resolution: '720p',
      outputFormat: 'mov',
      generateAudio: true
    });

    expect(payload).toMatchObject({
      model: 'doubao-seedance-2-5-260628',
      duration: 30,
      resolution: '720p',
      output_format: 'mov',
      generate_audio: true
    });
  });

  it('builds the official JSON request with first and last frame roles', () => {
    const input = {
      model: 'doubao-seedance-2-0-260128',
      prompt: 'A calm cinematic product reveal',
      aspectRatio: '16:9',
      duration: 8,
      resolution: '1080p',
      referenceImageUrls: [
        'https://example.com/first.png',
        'https://example.com/last.png'
      ],
      referenceMode: 'first-last-frame' as const,
      generateAudio: true
    };
    expect(buildArkVideoCreatePayload(input)).toEqual({
      model: 'doubao-seedance-2-0-260128',
      content: [
        { type: 'text', text: 'A calm cinematic product reveal' },
        {
          type: 'image_url',
          image_url: { url: 'https://example.com/first.png' },
          role: 'first_frame'
        },
        {
          type: 'image_url',
          image_url: { url: 'https://example.com/last.png' },
          role: 'last_frame'
        }
      ],
      resolution: '1080p',
      ratio: '16:9',
      duration: 8,
      generate_audio: true,
      return_last_frame: true,
      watermark: false
    });
    const request = buildArkVideoCreateHttpRequest(input);
    expect(request).toMatchObject({
      method: 'POST',
      path: '/contents/generations/tasks',
      headers: { 'Content-Type': 'application/json' }
    });
    expect(JSON.parse(String(request.body))).toEqual(
      buildArkVideoCreatePayload(input)
    );
  });

  it('builds the official multimodal image, video, and audio reference roles', () => {
    const input = {
      model: 'doubao-seedance-2-0-260128',
      prompt: 'Use 图片1 for identity, 视频1 for motion, and 音频1 for rhythm',
      aspectRatio: '16:9',
      duration: 8,
      resolution: '720p',
      referenceImageUrls: ['https://example.com/product.png'],
      referenceVideoUrls: ['https://example.com/motion.mp4'],
      referenceAudioUrls: ['https://example.com/rhythm.mp3'],
      generateAudio: true,
      watermark: true
    };

    expect(buildArkVideoCreatePayload(input)).toMatchObject({
      content: [
        {
          type: 'text',
          text: 'Use 图片1 for identity, 视频1 for motion, and 音频1 for rhythm'
        },
        {
          type: 'image_url',
          image_url: { url: 'https://example.com/product.png' },
          role: 'reference_image'
        },
        {
          type: 'video_url',
          video_url: { url: 'https://example.com/motion.mp4' },
          role: 'reference_video'
        },
        {
          type: 'audio_url',
          audio_url: { url: 'https://example.com/rhythm.mp3' },
          role: 'reference_audio'
        }
      ],
      watermark: true
    });
  });

  it('adds the official web search tool only when requested', () => {
    const payload = buildArkVideoCreatePayload({
      model: 'doubao-seedance-2-0-260128',
      prompt: 'Search current weather and generate a scene',
      aspectRatio: 'adaptive',
      duration: 5,
      resolution: '720p',
      generateAudio: true,
      webSearch: true
    });

    expect(payload).toMatchObject({
      ratio: 'adaptive',
      tools: [{ type: 'web_search' }],
      watermark: false
    });
  });

  it('uses explicit official availability flags and task paths', () => {
    vi.stubEnv('ARK_VIDEO_GENERATION_ENABLED', 'true');
    vi.stubEnv('ARK_VIDEO_LAUNCH_ENABLED', 'true');
    expect(isArkVideoGenerationAvailable()).toBe(true);
    expect(getArkVideoApiBaseUrl()).toBe(
      'https://ark.cn-beijing.volces.com/api/v3'
    );
    expect(getArkVideoStatusPath('cgt-task-1')).toBe(
      '/contents/generations/tasks/cgt-task-1'
    );
  });

  it('normalizes official create and completed task responses', () => {
    expect(
      normalizeArkVideoCreateResponse({ id: 'cgt-task-1', status: 'queued' })
    ).toMatchObject({ id: 'cgt-task-1', status: 'queued' });
    expect(
      normalizeArkVideoStatusResponse({
        id: 'cgt-task-1',
        status: 'succeeded',
        content: {
          video_url: 'https://example.com/video.mp4',
          last_frame_url: 'https://example.com/last.png'
        }
      })
    ).toMatchObject({
      id: 'cgt-task-1',
      status: 'succeeded',
      videoUrl: 'https://example.com/video.mp4',
      previewImageUrl: 'https://example.com/last.png'
    });
    expect(
      normalizeArkVideoStatusResponse({
        id: 'cgt-task-2',
        status: 'failed',
        error: { code: 'BadRequest', message: 'invalid input' }
      })
    ).toMatchObject({ errorMessage: 'invalid input' });
  });
});
