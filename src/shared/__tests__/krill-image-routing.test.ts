import { afterEach, describe, expect, it } from 'vitest';
import {
  getConfiguredKrillImageModels,
  getEnabledKrillImageModels,
  getKrillImageModel,
  getKrillImageResolutionTier,
  isKrillImageResolutionEnabled
} from '../../../api/image/generate/krill-routing';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('Krill GPT Image 2 resolution routing', () => {
  it.each([
    ['1024x1024', '1k', 'gpt-image-2'],
    ['1024x1536', '1k', 'gpt-image-2'],
    ['1152x2048', '2k', 'gpt-image-2-2k'],
    ['2048x2048', '2k', 'gpt-image-2-2k'],
    ['2304x3072', '4k', 'gpt-image-2-4k'],
    ['2160x3840', '4k', 'gpt-image-2-4k']
  ] as const)('maps %s to the %s Krill model', (imageSize, tier, model) => {
    expect(getKrillImageResolutionTier(imageSize)).toBe(tier);
    expect(getKrillImageModel({ imageSize })).toBe(model);
  });

  it('uses detected prompt dimensions when the UI size is auto', () => {
    expect(
      getKrillImageModel({ imageSize: 'auto', promptImageSize: '2160x3840' })
    ).toBe('gpt-image-2-4k');
  });

  it('honors explicit model overrides without collapsing resolution tiers', () => {
    process.env.KRILL_IMAGE_MODEL = 'base-model';
    process.env.KRILL_IMAGE_MODEL_2K = 'two-k-model';
    process.env.KRILL_IMAGE_MODEL_4K = 'four-k-model';

    expect(getKrillImageModel({ imageSize: '1024x1024' })).toBe('base-model');
    expect(getKrillImageModel({ imageSize: '2048x2048' })).toBe('two-k-model');
    expect(getKrillImageModel({ imageSize: '2160x3840' })).toBe('four-k-model');
    expect(getConfiguredKrillImageModels()).toEqual([
      'base-model',
      'two-k-model',
      'four-k-model'
    ]);
  });

  it('keeps higher-resolution routes disabled until the production key is proven', () => {
    expect(isKrillImageResolutionEnabled({ imageSize: '1024x1024' })).toBe(
      true
    );
    expect(isKrillImageResolutionEnabled({ imageSize: '2048x2048' })).toBe(
      false
    );
    expect(isKrillImageResolutionEnabled({ imageSize: '2160x3840' })).toBe(
      false
    );
    expect(getEnabledKrillImageModels()).toEqual(['gpt-image-2']);
  });

  it('enables 2K and 4K independently after their live routes are confirmed', () => {
    process.env.KRILL_IMAGE_2K_ENABLED = 'true';
    expect(isKrillImageResolutionEnabled({ imageSize: '2048x2048' })).toBe(
      true
    );
    expect(getEnabledKrillImageModels()).toEqual([
      'gpt-image-2',
      'gpt-image-2-2k'
    ]);

    process.env.KRILL_IMAGE_4K_ENABLED = 'true';
    expect(getEnabledKrillImageModels()).toEqual([
      'gpt-image-2',
      'gpt-image-2-2k',
      'gpt-image-2-4k'
    ]);
  });
});
