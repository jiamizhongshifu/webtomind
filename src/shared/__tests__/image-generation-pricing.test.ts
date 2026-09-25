import { describe, expect, it } from 'vitest';
import { estimateImageGenerationCreditCost } from '../image-generation-pricing';

describe('image generation pricing v2', () => {
  it.each([
    ['standard auto', {}, 60, 0],
    ['draft', { quality: 'low' }, 40, -20],
    ['medium', { quality: 'medium' }, 150, 90],
    ['high', { quality: 'high' }, 600, 540],
    ['2K auto', { imageSize: '2048x2048' }, 100, 0],
    ['2K portrait preset', { imageSize: '1152x2048' }, 100, 0],
    ['1K ultrawide preset', { imageSize: '1792x768' }, 60, 0],
    ['2K draft', { imageSize: '2048x2048', quality: 'low' }, 100, 0],
    ['2K medium', { imageSize: '2048x2048', quality: 'medium' }, 150, 50],
    ['4K medium', { imageSize: '4096x4096', quality: 'medium' }, 300, 0],
    ['4K portrait preset', { imageSize: '2304x3072' }, 300, 0],
    ['4K high', { imageSize: '4096x4096', quality: 'high' }, 600, 300]
  ])('%s costs %s credits', (_label, input, cost, qualityAdjustment) => {
    expect(estimateImageGenerationCreditCost(input)).toMatchObject({
      cost,
      qualityAdjustment
    });
  });

  it('falls back to the flat per-image rate when reference sizes are unknown', () => {
    expect(
      estimateImageGenerationCreditCost({ referenceImageCount: 1 }).cost
    ).toBe(80);
  });

  it('bills reference images by pixel size (official input-token formula)', () => {
    const small = estimateImageGenerationCreditCost({
      referenceImageCount: 1,
      referenceImageSizes: [{ width: 512, height: 512 }]
    });
    expect(small.referenceAdjustment).toBe(5);
    expect(small.cost).toBe(65);

    const oneK = estimateImageGenerationCreditCost({
      referenceImageCount: 1,
      referenceImageSizes: [{ width: 1024, height: 1024 }]
    });
    expect(oneK.referenceAdjustment).toBe(20);
    expect(oneK.cost).toBe(80);

    const fourK = estimateImageGenerationCreditCost({
      referenceImageCount: 1,
      referenceImageSizes: [{ width: 3840, height: 2160 }]
    });
    expect(fourK.referenceAdjustment).toBe(30);
    expect(fourK.cost).toBe(90);
  });

  it('blends unknown reference sizes with the flat rate', () => {
    const estimate = estimateImageGenerationCreditCost({
      referenceImageCount: 2,
      referenceImageSizes: [{ width: 1024, height: 1024 }]
    });
    expect(estimate.referenceAdjustment).toBe(40);
    expect(estimate.cost).toBe(100);
  });

  it('does not charge a separate character-consistency mode fee', () => {
    const estimate = estimateImageGenerationCreditCost({
      referenceMode: 'character_consistency',
      referenceImageCount: 1
    });
    expect(estimate.modeAdjustment).toBe(0);
    expect(estimate.cost).toBe(80);
  });

  it('applies the model multiplier after quality and reference adjustments', () => {
    expect(
      estimateImageGenerationCreditCost({
        model: 'nano-banana-2',
        quality: 'high'
      })
    ).toMatchObject({
      cost: 600,
      modelMultiplier: 1,
      modelAdjustment: 0
    });
  });

  describe('Seedream 5 Pro credit consumption matches the shared pricing logic', () => {
    it('applies a 2.0 multiplier and maps 1K/2K sizes to base/2K tiers', () => {
      expect(
        estimateImageGenerationCreditCost({
          model: 'seedream-5-pro',
          imageSize: '1024x1024'
        })
      ).toMatchObject({
        cost: 120,
        tier: 'base',
        baseCost: 60,
        modelMultiplier: 2,
        modelAdjustment: 60
      });

      expect(
        estimateImageGenerationCreditCost({
          model: 'seedream-5-pro',
          imageSize: '2048x2048'
        })
      ).toMatchObject({
        cost: 200,
        tier: 'large-2k',
        baseCost: 100,
        modelMultiplier: 2
      });

      // Seedream has no 4K tier: even 2048x2048 (4.19 MP) stays 2K.
      expect(
        estimateImageGenerationCreditCost({
          model: 'seedream-5-pro',
          imageSize: '1152x2048'
        })
      ).toMatchObject({
        cost: 200,
        tier: 'large-2k'
      });
    });

    it('multiplies the reference surcharge by the model multiplier', () => {
      expect(
        estimateImageGenerationCreditCost({
          model: 'seedream-5-pro',
          imageSize: '1536x1024',
          referenceImageCount: 1
        })
      ).toMatchObject({
        cost: 160,
        referenceAdjustment: 20,
        modelMultiplier: 2
      });

      expect(
        estimateImageGenerationCreditCost({
          model: 'seedream-5-pro',
          imageSize: '2048x2048',
          referenceImageCount: 3
        })
      ).toMatchObject({
        cost: 320,
        referenceAdjustment: 60,
        modelMultiplier: 2
      });
    });

    it('applies the high-quality floor before the multiplier', () => {
      expect(
        estimateImageGenerationCreditCost({
          model: 'seedream-5-pro',
          imageSize: '1024x1024',
          quality: 'high'
        })
      ).toMatchObject({
        cost: 1200,
        tier: 'base',
        modelMultiplier: 2,
        modelAdjustment: 600
      });
    });

    it('keeps Seedream 5 Lite at 1.5 while Pro stays at 2.0', () => {
      expect(
        estimateImageGenerationCreditCost({
          model: 'seedream-5-lite',
          imageSize: '1024x1024'
        })
      ).toMatchObject({
        cost: 90,
        modelMultiplier: 1.5
      });
    });
  });
});
