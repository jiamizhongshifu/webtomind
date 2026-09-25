import { describe, expect, it } from 'vitest';
import imageModelsHandler from '../../../api/image/models';
import {
  TUZI_IMAGE_MODELS,
  getTuziImageModelConfig,
  normalizeTuziImageModelId
} from '../tuzi-image-models';
import { deriveImageGenerationAspectRatio } from '../image-generation-output-params';

const ALL_SUPPORTED_RATIOS = [
  '1:1',
  '2:3',
  '3:2',
  '3:4',
  '4:3',
  '4:5',
  '5:4',
  '9:16',
  '16:9',
  '21:9'
];

describe('Tuzi image model directory', () => {
  it('declares explicit generation capability fields for every model', () => {
    expect(TUZI_IMAGE_MODELS.length).toBeGreaterThan(0);

    for (const model of TUZI_IMAGE_MODELS) {
      expect(model.maxImageCount).toBeGreaterThanOrEqual(1);
      expect(['b64_json', 'url']).toContain(model.preferredResponseFormat);
      expect(typeof model.allowProviderFallback).toBe('boolean');
    }

    expect(getTuziImageModelConfig('gpt-image-2')).toMatchObject({
      maxImageCount: 10,
      preferredResponseFormat: 'b64_json',
      allowProviderFallback: true
    });
  });

  it('declares Seedream 5.0 Pro single-image and 10-reference capabilities', () => {
    const model = getTuziImageModelConfig('seedream-5-pro');

    expect(model).toMatchObject({
      id: 'seedream-5-pro',
      apiModel: 'seedream-5-0-pro',
      label: 'Seedream 5.0 Pro',
      supportsMultipleImages: false,
      maxImageCount: 1,
      maxReferenceImages: 10,
      supportsReferenceImage: true,
      preferredResponseFormat: 'url',
      creditMultiplier: 2
    });
    // 官方仅 1K/1.5K/2K 档位：推荐尺寸里不能出现 4K。
    for (const size of model.recommendedImageSizes) {
      const [width, height] = size.split('x').map(Number);
      expect(Math.max(width, height)).toBeLessThanOrEqual(2048);
    }
  });

  it('registers GPT Image 2.5 as a first-class model without mapping it to GPT Image 2', () => {
    expect(normalizeTuziImageModelId('gpt-image-2.5')).toBe('gpt-image-2.5');
    expect(getTuziImageModelConfig('gpt-image-2.5')).toMatchObject({
      id: 'gpt-image-2.5',
      apiModel: 'gpt-image-2.5',
      label: 'GPT Image 2.5',
      provider: 'tuzi',
      supportsReferenceImage: true,
      supportsMultipleImages: true,
      maxImageCount: 10,
      creditMultiplier: 1
    });
  });

  it('covers every supported aspect ratio in recommended sizes', () => {
    for (const model of TUZI_IMAGE_MODELS) {
      const ratios = new Set(
        model.recommendedImageSizes
          .map((size) => deriveImageGenerationAspectRatio(size))
          .filter((ratio): ratio is string => Boolean(ratio))
      );
      expect([...ratios].sort()).toEqual([...ALL_SUPPORTED_RATIOS].sort());
    }
  });

  it('exposes generation capabilities from /api/image/models', async () => {
    const response = await imageModelsHandler(
      new Request('https://webtomind.com/api/image/models')
    );
    const body = (await response.json()) as {
      models: Array<{
        id: string;
        maxImageCount?: number;
        preferredResponseFormat?: string;
        allowProviderFallback?: boolean;
        status?: string;
        availabilityReason?: string;
      }>;
      enabled: boolean;
    };
    const gptImage25 = body.models.filter((model) =>
      model.id.startsWith('gpt-image-2.5')
    );

    expect(response.status).toBe(200);
    expect(body.models.some((model) => model.id === 'gpt-image-2')).toBe(false);
    expect(typeof body.enabled).toBe('boolean');
    expect(body.models.some((model) => model.id === 'codex-gpt-image-2')).toBe(
      false
    );
    expect(gptImage25).toHaveLength(1);
    expect(gptImage25).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'gpt-image-2.5',
          status: 'unavailable',
          availabilityReason: 'provider_not_configured'
        })
      ])
    );
  });

  it('exposes GPT Image 2.5 only when its Tuzi route is explicitly enabled', async () => {
    const previousKey = process.env.TUZI_API_KEY;
    const previousEnabled = process.env.TUZI_GPT_IMAGE_25_ENABLED;
    process.env.TUZI_API_KEY = 'test-key';
    process.env.TUZI_GPT_IMAGE_25_ENABLED = 'true';
    try {
      const response = await imageModelsHandler(
        new Request('https://webtomind.com/api/image/models')
      );
      const body = (await response.json()) as {
        models: Array<{
          id: string;
          status: string;
          configuredRouteCount: number;
        }>;
      };
      expect(
        body.models.find((model) => model.id === 'gpt-image-2.5')
      ).toMatchObject({
        status: 'available',
        configuredRouteCount: 1
      });
    } finally {
      if (previousKey === undefined) delete process.env.TUZI_API_KEY;
      else process.env.TUZI_API_KEY = previousKey;
      if (previousEnabled === undefined)
        delete process.env.TUZI_GPT_IMAGE_25_ENABLED;
      else process.env.TUZI_GPT_IMAGE_25_ENABLED = previousEnabled;
    }
  });
});
