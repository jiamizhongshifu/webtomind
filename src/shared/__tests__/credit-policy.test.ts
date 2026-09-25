import { describe, expect, it } from 'vitest';
import {
  FREE_DAILY_CREDITS,
  FREE_DAILY_IMAGE_GENERATION_LIMIT,
  getCreditProgressPercent,
  normalizePlanLimits
} from '../credit-policy';

describe('credit policy plan limits', () => {
  it('keeps credit progress finite when a transient plan limit is zero', () => {
    expect(getCreditProgressPercent(0, 0)).toBe(0);
    expect(getCreditProgressPercent(25, 100)).toBe(25);
    expect(getCreditProgressPercent(150, 100)).toBe(100);
    expect(getCreditProgressPercent(-1, 100)).toBe(0);
  });

  it('forces free plan limits to the shared policy and removes the old alias', () => {
    expect(
      normalizePlanLimits(
        {
          maxMaterials: 100,
          dailyCredits: 300,
          dailyImageGen: 2,
          dailyImageGeneration: 10
        },
        'free'
      )
    ).toEqual({
      maxMaterials: 100,
      dailyCredits: FREE_DAILY_CREDITS,
      dailyImageGeneration: FREE_DAILY_IMAGE_GENERATION_LIMIT
    });
  });

  it('migrates the legacy image-generation limit alias only when needed', () => {
    expect(normalizePlanLimits({ dailyImageGen: 7 }, 'pro')).toEqual({
      dailyImageGeneration: 7
    });

    expect(
      normalizePlanLimits(
        {
          dailyImageGen: 7,
          dailyImageGeneration: -1
        },
        'pro'
      )
    ).toEqual({
      dailyImageGeneration: -1
    });
  });
});
