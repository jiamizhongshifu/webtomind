import { afterEach, describe, expect, it } from 'vitest';
import { buildVideoGenerateContract } from '../../api/video/generate';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('video generation contract', () => {
  it('uses the official Seedance 2.5 model ID and 30-second contract', () => {
    delete process.env.ARK_VIDEO_API_MODEL_SEEDANCE_2_5;
    const available = buildVideoGenerateContract({
      prompt: 'A cinematic scene',
      model: 'seedance-2-5',
      duration: 30,
      resolution: '720p',
      outputFormat: 'mov'
    });
    expect(available.ok).toBe(true);
    if (!available.ok) return;
    expect(available.value).toMatchObject({
      model: 'seedance-2-5',
      apiModel: 'doubao-seedance-2-5-260628',
      duration: 30,
      resolution: '720p',
      outputFormat: 'mov'
    });
  });

  it('rejects output formats that the selected model does not support', () => {
    const result = buildVideoGenerateContract({
      prompt: 'A cinematic scene',
      model: 'seedance-2-0',
      outputFormat: 'mov'
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({
      error: 'unsupported output format',
      supportedOutputFormats: ['mp4']
    });
  });

  it('builds an explicit contract without silently changing user parameters', () => {
    process.env.ARK_VIDEO_API_MODEL_SEEDANCE_2_0 = 'seedance-custom';

    const result = buildVideoGenerateContract({
      prompt: 'A slow cinematic product reveal',
      model: 'seedance-2-0',
      aspectRatio: '9:16',
      duration: 5,
      resolution: '480p',
      referenceImageIds: ['ref-1'],
      referenceImageUrls: ['https://example.com/ref.png'],
      outputFormat: 'webm'
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      prompt: 'A slow cinematic product reveal',
      model: 'seedance-2-0',
      apiModel: 'seedance-custom',
      aspectRatio: '9:16',
      duration: 5,
      resolution: '480p',
      referenceImageIds: ['ref-1'],
      referenceImageUrls: ['https://example.com/ref.png'],
      referenceMode: 'reference',
      outputFormat: 'mp4',
      generateAudio: true,
      async: true
    });
    expect(result.value.costEstimate).toMatchObject({
      baseUnitCost: 400,
      baseCost: 400,
      referenceAdjustment: 0,
      modelMultiplier: 2,
      resolutionMultiplier: 1,
      cost: 800
    });
  });

  it('rejects unsupported aspect ratios instead of falling back', () => {
    const result = buildVideoGenerateContract({
      prompt: 'A cinematic scene',
      model: 'seedance-2-0',
      aspectRatio: '2:3'
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(400);
    expect(result.body.error).toBe('unsupported aspect ratio');
    expect(result.body.supportedAspectRatios).toEqual([
      'adaptive',
      '16:9',
      '9:16',
      '4:3',
      '3:4',
      '1:1',
      '21:9'
    ]);
  });

  it('rejects unsupported durations instead of auto-downgrading', () => {
    const result = buildVideoGenerateContract({
      prompt: 'A cinematic scene',
      model: 'seedance-2-0',
      duration: 20
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(400);
    expect(result.body.error).toBe('unsupported duration');
    expect(result.body.supportedDurations).toEqual([
      4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15
    ]);
  });

  it('keeps Mini available with explicit audio control', () => {
    const result = buildVideoGenerateContract({
      prompt: 'A cinematic scene',
      model: 'seedance-2-0-mini',
      duration: 15,
      resolution: '720p',
      generateAudio: true
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      model: 'seedance-2-0-mini',
      apiModel: 'doubao-seedance-2-0-mini-260615',
      generateAudio: true
    });
  });

  it('rejects more than two references in first-last-frame mode', () => {
    const result = buildVideoGenerateContract({
      prompt: 'A cinematic scene',
      model: 'seedance-2-0',
      referenceMode: 'first-last-frame',
      referenceImageUrls: [
        'https://example.com/first.png',
        'https://example.com/last.png',
        'https://example.com/extra.png'
      ]
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(400);
    expect(result.body.error).toBe('too many first-last frame references');
    expect(result.body.maxReferenceImages).toBe(2);
  });

  it('rejects multimodal references combined with strict first and last frames', () => {
    const result = buildVideoGenerateContract({
      prompt: 'A controlled product transition',
      model: 'seedance-2-0',
      referenceImageUrls: ['https://example.com/product.png'],
      firstFrameUrl: 'https://example.com/opening.png',
      lastFrameUrl: 'https://example.com/ending.png'
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.body.error).toBe('incompatible reference modes');
  });

  it('accepts the official multimodal reference limits', () => {
    const result = buildVideoGenerateContract({
      prompt:
        '图片1 controls identity, 视频1 controls motion, 音频1 controls rhythm',
      model: 'seedance-2-0',
      referenceImageUrls: Array.from(
        { length: 9 },
        (_, index) => `https://example.com/image-${index + 1}.png`
      ),
      referenceVideoUrls: [
        'https://example.com/motion-1.mp4',
        'https://example.com/motion-2.mp4',
        'https://example.com/motion-3.mp4'
      ],
      referenceAudioUrls: [
        'https://example.com/audio-1.mp3',
        'https://example.com/audio-2.mp3',
        'https://example.com/audio-3.mp3'
      ],
      watermark: true
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      referenceMode: 'reference',
      referenceImageUrls: expect.arrayContaining([
        'https://example.com/image-1.png'
      ]),
      referenceVideoUrls: expect.arrayContaining([
        'https://example.com/motion-1.mp4'
      ]),
      referenceAudioUrls: expect.arrayContaining([
        'https://example.com/audio-1.mp3'
      ]),
      watermark: true
    });
  });

  it('normalizes reference video durations and bills by input length', () => {
    const result = buildVideoGenerateContract({
      prompt: 'Follow 视频1 camera movement',
      model: 'seedance-2-0',
      resolution: '720p',
      duration: 5,
      referenceVideoUrls: [
        'https://example.com/motion-1.mp4',
        'https://example.com/motion-2.mp4',
        'https://example.com/motion-3.mp4'
      ],
      referenceVideoDurations: [4, 30, -2, Number.NaN]
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.referenceVideoDurations).toEqual([4, 15]);
    expect(result.value.costEstimate.referenceAdjustment).toBe(190);
  });

  it('rejects a tenth reference image', () => {
    const result = buildVideoGenerateContract({
      prompt: 'Keep all referenced objects consistent',
      model: 'seedance-2-0',
      referenceImageUrls: Array.from(
        { length: 10 },
        (_, index) => `https://example.com/image-${index + 1}.png`
      )
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.body).toMatchObject({
      error: 'too many reference images',
      maxReferenceImages: 9
    });
  });

  it('rejects audio-only references and multimodal web search', () => {
    const audioOnly = buildVideoGenerateContract({
      prompt: 'Follow 音频1',
      model: 'seedance-2-0',
      referenceAudioUrls: ['https://example.com/audio.mp3']
    });
    expect(audioOnly.ok).toBe(false);
    if (!audioOnly.ok) {
      expect(audioOnly.body.error).toBe('audio-only reference is unsupported');
    }

    const webSearchWithMedia = buildVideoGenerateContract({
      prompt: 'Search the web while using 图片1',
      model: 'seedance-2-0',
      referenceImageUrls: ['https://example.com/image.png'],
      webSearch: true
    });
    expect(webSearchWithMedia.ok).toBe(false);
    if (!webSearchWithMedia.ok) {
      expect(webSearchWithMedia.body.error).toBe(
        'web search requires text only'
      );
    }
  });

  it('rejects a last frame without a first frame', () => {
    const result = buildVideoGenerateContract({
      prompt: 'A controlled product transition',
      model: 'seedance-2-0',
      lastFrameUrl: 'https://example.com/ending.png'
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.body.error).toBe('missing first frame');
  });
});
