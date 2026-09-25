import { describe, expect, it } from 'vitest';
import { getImageGenerationResolutionTier } from '../../../shared/image-generation-pricing';
import {
  aspectRatioOptions,
  clampImageCountForModel,
  getAspectRatioOptionsForModel,
  getImageCountOptionsForModel,
  getImageResolutionForImageSize,
  getImageResolutionOptionsForModel,
  getImageSizeForAspectRatioAndResolution,
  getImageSizeForModelAspectRatioAndResolution,
  getImageSizeOptionsForModel,
  imageSizeOptions,
  resolveRecommendedImageSettingsForModel,
  resolveRecommendedImageSizeForModel,
  getModelMaxImageCount,
  getSelectableImageModelOptions,
  mergeRuntimeImageModelOptions,
  modelOptions
} from '../image-creator-options';

describe('image creator model options', () => {
  it('passes model generation capabilities through to frontend options', () => {
    const gptImage25 = modelOptions.find(
      (model) => model.value === 'gpt-image-2.5'
    );

    expect(gptImage25).toMatchObject({
      maxImageCount: 10,
      preferredResponseFormat: 'b64_json',
      allowProviderFallback: true
    });
    expect(modelOptions.map((model) => String(model.value))).not.toContain(
      'gpt-image-2'
    );
    expect(modelOptions.map((model) => String(model.value))).not.toContain(
      'codex-gpt-image-2'
    );
  });

  it('keeps GPT Image 2.5 variants unavailable until runtime confirms a route', () => {
    expect(
      modelOptions.filter((model) => model.value.startsWith('gpt-image-2.5'))
    ).toEqual([
      expect.objectContaining({
        value: 'gpt-image-2.5',
        label: 'GPT Image 2.5',
        status: 'unavailable',
        creditMultiplier: 1
      })
    ]);
  });

  it('clamps image count to the current model max', () => {
    const gptImage25 = modelOptions.find(
      (model) => model.value === 'gpt-image-2.5'
    );
    expect(gptImage25).toBeDefined();
    if (!gptImage25) return;

    const originalMax = gptImage25.maxImageCount;
    try {
      gptImage25.maxImageCount = 2;

      expect(getModelMaxImageCount('gpt-image-2.5')).toBe(2);
      expect(clampImageCountForModel('gpt-image-2.5', 4)).toBe(2);
      expect(clampImageCountForModel('gpt-image-2.5', 0, 3)).toBe(2);
      expect(clampImageCountForModel('gpt-image-2.5', 0, 1)).toBe(1);
    } finally {
      gptImage25.maxImageCount = originalMax;
    }
  });

  it('clamps Seedream 5.0 Pro to a single image and exposes 10 reference slots', () => {
    const seedreamPro = modelOptions.find(
      (model) => model.value === 'seedream-5-pro'
    );
    expect(seedreamPro).toMatchObject({
      supportsMultipleImages: false,
      maxImageCount: 1,
      maxReferenceImages: 10
    });
    expect(getModelMaxImageCount('seedream-5-pro')).toBe(1);
    expect(clampImageCountForModel('seedream-5-pro', 4)).toBe(1);
    expect(getImageCountOptionsForModel(seedreamPro)).toEqual([1]);
  });

  it('marks runtime-unavailable models as non-selectable', () => {
    const runtimeModels = mergeRuntimeImageModelOptions([
      { id: 'gpt-image-2', status: 'unavailable' }
    ]);
    expect(
      getSelectableImageModelOptions(runtimeModels).some(
        (model) => model.value === 'gpt-image-2'
      )
    ).toBe(false);
  });

  it('limits the primary size list to auto and model recommendations', () => {
    const gptImage25 = modelOptions.find(
      (model) => model.value === 'gpt-image-2.5'
    );
    expect(
      getImageSizeOptionsForModel(gptImage25).map((option) => option.value)
    ).toEqual([
      'auto',
      '1024x1024',
      '1024x1536',
      '1536x1024',
      '1152x1536',
      '1536x1152',
      '1024x1280',
      '1280x1024',
      '864x1536',
      '1536x864',
      '1792x768',
      '1152x2048'
    ]);
    expect(resolveRecommendedImageSizeForModel(gptImage25, '2048x1152')).toBe(
      '1536x864'
    );
    expect(resolveRecommendedImageSizeForModel(gptImage25, '1024x1536')).toBe(
      '1024x1536'
    );
  });

  it('exposes every supported aspect ratio for every model, with Auto first', () => {
    for (const model of modelOptions) {
      expect(getAspectRatioOptionsForModel(model).map((o) => o.value)).toEqual(
        aspectRatioOptions.map((o) => o.value)
      );
      expect(getAspectRatioOptionsForModel(model)[0]).toMatchObject({
        value: 'auto',
        label: 'Auto'
      });
    }
  });

  it('keeps Auto ratio as a real selectable option that maps to auto imageSize', () => {
    expect(getImageSizeForAspectRatioAndResolution('auto', '2k')).toBe('auto');
    for (const model of modelOptions) {
      expect(
        getImageSizeForModelAspectRatioAndResolution(model, 'auto', '4k')
      ).toBe('auto');
      expect(
        getImageResolutionOptionsForModel(model, 'auto').map((o) => o.value)
      ).toEqual(['1k', '2k', '4k']);
    }
    expect(getImageSizeForAspectRatioAndResolution('3:4', '2k')).toBe(
      '1536x2048'
    );
  });

  it('keeps aspect and resolution combinations within model recommendations', () => {
    const nanoBanana = modelOptions.find(
      (model) => model.value === 'nano-banana'
    );
    expect(
      getImageResolutionOptionsForModel(nanoBanana, '9:16').map(
        (option) => option.value
      )
    ).toEqual(['1k', '2k']);
    expect(
      getImageSizeForModelAspectRatioAndResolution(nanoBanana, '9:16', '1k')
    ).toBe('864x1536');
    expect(
      resolveRecommendedImageSettingsForModel(nanoBanana, '1536x864')
    ).toEqual({ imageSize: '1536x864', aspectRatio: '16:9' });
  });

  it('offers batch counts up to each model max image count', () => {
    const gptImage25 = modelOptions.find(
      (model) => model.value === 'gpt-image-2.5'
    );
    expect(getImageCountOptionsForModel(gptImage25)).toEqual([
      1, 2, 4, 6, 8, 10
    ]);
    const nanoBanana = modelOptions.find(
      (model) => model.value === 'nano-banana'
    );
    expect(getImageCountOptionsForModel(nanoBanana)).toEqual([1, 2, 4]);
  });

  it('keeps every labeled resolution preset aligned with shared billing and routing tiers', () => {
    const expectedTierByResolution = {
      '1k': 'base',
      '2k': 'large-2k',
      '4k': '4k'
    } as const;

    for (const option of imageSizeOptions) {
      if (option.value === 'auto') continue;
      const labeledResolution = option.labelKey.toLowerCase().includes('4k')
        ? '4k'
        : option.labelKey.toLowerCase().includes('2k')
          ? '2k'
          : '1k';

      expect(getImageResolutionForImageSize(option.value)).toBe(
        labeledResolution
      );
      expect(getImageGenerationResolutionTier(option.value)).toBe(
        expectedTierByResolution[
          labeledResolution as keyof typeof expectedTierByResolution
        ]
      );
    }
  });
});
