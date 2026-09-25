import { describe, expect, it } from 'vitest';
import {
  VIDEO_GENERATION_BASE_UNIT_CREDIT_COST,
  VIDEO_GENERATION_BASE_UNIT_SECONDS,
  estimateVideoGenerationCreditCost,
  getVideoGenerationCreditCostPerSecond
} from '../video-generation-pricing';

describe('video generation pricing', () => {
  it('prices Seedance 2.5 from the official public token rate ratio (70/23)', () => {
    const estimate = estimateVideoGenerationCreditCost({
      model: 'seedance-2-5',
      duration: 5,
      resolution: '720p'
    });

    expect(estimate.modelMultiplier).toBe(3.04);
    expect(estimate.resolutionMultiplier).toBe(2.25);
    expect(estimate.cost).toBe(2736);
  });

  it('prices 480p video from observed per-second usage and model cost ratio', () => {
    const estimate = estimateVideoGenerationCreditCost({
      model: 'seedance-2-0',
      duration: 5,
      resolution: '480p'
    });

    expect(estimate.model).toBe('seedance-2-0');
    expect(estimate.durationUnits).toBe(1);
    expect(estimate.baseUnitCost).toBe(VIDEO_GENERATION_BASE_UNIT_CREDIT_COST);
    expect(VIDEO_GENERATION_BASE_UNIT_SECONDS).toBe(5);
    expect(estimate.modelMultiplier).toBe(2);
    expect(estimate.resolutionMultiplier).toBe(1);
    expect(estimate.cost).toBe(800);
  });

  it('charges duration linearly instead of rounding 6-9 seconds to 10', () => {
    const estimate = estimateVideoGenerationCreditCost({
      model: 'seedance-2-0',
      duration: 8,
      resolution: '480p'
    });

    expect(estimate.durationUnits).toBe(1.6);
    expect(estimate.baseCost).toBe(640);
    expect(estimate.cost).toBe(1280);
  });

  it('does not surcharge reference images or first/last frames (official billing)', () => {
    const estimate = estimateVideoGenerationCreditCost({
      model: 'seedance-2-0',
      duration: 5,
      resolution: '480p',
      referenceImageCount: 1
    });

    expect(estimate.referenceAdjustment).toBe(0);
    expect(estimate.cost).toBe(800);
    expect(estimate.modelAdjustment).toBe(400);
    expect(estimate.resolutionAdjustment).toBe(0);
  });

  it('surcharges reference videos only (input video duration adds tokens)', () => {
    const estimate = estimateVideoGenerationCreditCost({
      model: 'seedance-2-0',
      duration: 5,
      resolution: '480p',
      referenceImageCount: 2,
      referenceVideoCount: 1,
      referenceAudioCount: 1
    });

    expect(estimate.referenceAdjustment).toBe(50);
    expect(estimate.cost).toBe(900);
    expect(estimate.modelAdjustment).toBe(450);
    expect(estimate.resolutionAdjustment).toBe(0);
  });

  it('scales reference video surcharge linearly with input video duration', () => {
    const short = estimateVideoGenerationCreditCost({
      model: 'seedance-2-0',
      duration: 5,
      resolution: '480p',
      referenceVideoDurations: [4]
    });
    expect(short.referenceAdjustment).toBe(40);
    expect(short.cost).toBe(880);

    const long = estimateVideoGenerationCreditCost({
      model: 'seedance-2-0',
      duration: 5,
      resolution: '480p',
      referenceVideoDurations: [15]
    });
    expect(long.referenceAdjustment).toBe(150);
    expect(long.cost).toBe(1100);

    const multi = estimateVideoGenerationCreditCost({
      model: 'seedance-2-0',
      duration: 5,
      resolution: '480p',
      referenceVideoDurations: [2, 3]
    });
    expect(multi.referenceAdjustment).toBe(50);
    expect(multi.cost).toBe(900);
  });

  it('calibrates HD resolution multipliers to official list prices', () => {
    const standard720 = estimateVideoGenerationCreditCost({
      model: 'seedance-2-0',
      duration: 5,
      resolution: '720p'
    });
    const standard1080 = estimateVideoGenerationCreditCost({
      model: 'seedance-2-0',
      duration: 5,
      resolution: '1080p'
    });
    const standard4k = estimateVideoGenerationCreditCost({
      model: 'seedance-2-0',
      duration: 5,
      resolution: '4k'
    });
    const mini720 = estimateVideoGenerationCreditCost({
      model: 'seedance-2-0-mini',
      duration: 5,
      resolution: '720p'
    });

    expect(standard720.resolutionMultiplier).toBe(2.15);
    expect(standard720.cost).toBe(1720);
    expect(standard1080.resolutionMultiplier).toBe(5.36);
    expect(standard1080.cost).toBe(4288);
    expect(standard4k.resolutionMultiplier).toBe(10.94);
    expect(standard4k.cost).toBe(8752);
    expect(mini720.resolutionMultiplier).toBe(2.14);
    expect(mini720.cost).toBe(856);
  });

  it('keeps the three models proportional to official token prices', () => {
    const standard = estimateVideoGenerationCreditCost({
      model: 'seedance-2-0',
      duration: 15,
      resolution: '480p'
    });
    const fast = estimateVideoGenerationCreditCost({
      model: 'seedance-2-0-fast',
      duration: 15,
      resolution: '480p'
    });
    const mini = estimateVideoGenerationCreditCost({
      model: 'seedance-2-0-mini',
      duration: 15,
      resolution: '480p'
    });

    expect(standard.cost).toBe(2400);
    expect(fast.cost).toBe(1932);
    expect(mini.cost).toBe(1200);
  });

  it('falls back to count-based surcharge when video durations are missing', () => {
    const estimate = estimateVideoGenerationCreditCost({
      model: 'seedance-2-0',
      duration: 5,
      resolution: '480p',
      referenceVideoCount: 2
    });

    expect(estimate.referenceAdjustment).toBe(100);
    expect(estimate.cost).toBe(1000);
  });

  it('reports a conservative per-second estimate for the current configuration', () => {
    const estimate = estimateVideoGenerationCreditCost({
      model: 'seedance-2-0-fast',
      duration: 8,
      resolution: '720p',
      referenceImageCount: 1
    });

    expect(getVideoGenerationCreditCostPerSecond(estimate)).toBe(
      Math.ceil(estimate.cost / 8)
    );
  });
});
