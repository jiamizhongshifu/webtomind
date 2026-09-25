import { describe, expect, it } from 'vitest';
import {
  CLIENT_FALLBACK_SUBSCRIPTION_PLANS,
  CREATOR_UPGRADE_PLAN_CATALOG,
  TARGET_YEARLY_DISCOUNT_PERCENT,
  VIDEO_PLAN_MARKETING_COSTS,
  getDisplayedYearlyDiscountPercent,
  getRecommendedUpgradePlan,
  getVideoGenerationCapacity,
  getYearlyDiscountPercent,
  normalizeSubscriptionPlan
} from '../pricing-catalog';

describe('shared pricing catalog', () => {
  it('keeps the existing Free, Pro and Max product contract', () => {
    expect(
      CLIENT_FALLBACK_SUBSCRIPTION_PLANS.map((plan) => ({
        name: plan.name,
        monthly: plan.priceMonthly,
        yearly: plan.priceYearly,
        credits: plan.monthlyCredits
      }))
    ).toEqual([
      { name: 'free', monthly: 0, yearly: 0, credits: 100 },
      { name: 'pro', monthly: 2000, yearly: 16800, credits: 10_000 },
      { name: 'max', monthly: 10000, yearly: 84000, credits: 60_000 }
    ]);
  });

  it('keeps both paid plans at the 30% annual discount', () => {
    const paidPlans = CLIENT_FALLBACK_SUBSCRIPTION_PLANS.filter(
      (plan) => plan.priceMonthly > 0
    );

    expect(
      paidPlans.map((plan) =>
        getYearlyDiscountPercent(plan.priceMonthly, plan.priceYearly)
      )
    ).toEqual([TARGET_YEARLY_DISCOUNT_PERCENT, 30]);
    expect(
      getDisplayedYearlyDiscountPercent(CLIENT_FALLBACK_SUBSCRIPTION_PLANS)
    ).toBe(30);
  });

  it('never overstates a mixed annual discount in the shared badge', () => {
    const plans = CLIENT_FALLBACK_SUBSCRIPTION_PLANS.map((plan) =>
      plan.name === 'max' ? { ...plan, priceYearly: 90000 } : plan
    );

    expect(getDisplayedYearlyDiscountPercent(plans)).toBe(25);
  });

  it('uses the same credits and benefits in upgrade surfaces', () => {
    expect(CREATOR_UPGRADE_PLAN_CATALOG.pro.monthlyCredits).toBe(10_000);
    expect(CREATOR_UPGRADE_PLAN_CATALOG.max.monthlyCredits).toBe(60_000);
    expect(CREATOR_UPGRADE_PLAN_CATALOG.pro.benefits['zh-CN']).toContain(
      '情绪板风格引导与多参考图创作'
    );
    expect(CREATOR_UPGRADE_PLAN_CATALOG.max.benefits['zh-CN']).toContain(
      '专业版全部创作工作流'
    );
  });

  it('derives video marketing capacity from the live credit formula', () => {
    expect(VIDEO_PLAN_MARKETING_COSTS).toEqual({
      mini5s480p: 400,
      fast5s720p: 1385,
      standard15s720p: 5160,
      seedance25_5s720p: 2736
    });
    expect(getVideoGenerationCapacity(10_000, 400)).toBe(25);
    expect(getVideoGenerationCapacity(10_000, 1385)).toBe(7);
    expect(getVideoGenerationCapacity(10_000, 2736)).toBe(3);
    expect(getVideoGenerationCapacity(60_000, 400)).toBe(150);
    expect(getVideoGenerationCapacity(60_000, 1385)).toBe(43);
    expect(getVideoGenerationCapacity(60_000, 2736)).toBe(21);
  });

  it('honors valid upgrade selection and rejects unknown plan names', () => {
    expect(getRecommendedUpgradePlan('?plan=max&mode=yearly')).toBe('max');
    expect(getRecommendedUpgradePlan('?plan=enterprise')).toBe('pro');
  });

  it('normalizes free-plan limits without changing paid plan credits', () => {
    const free = normalizeSubscriptionPlan({
      ...CLIENT_FALLBACK_SUBSCRIPTION_PLANS[0],
      monthlyCredits: 999
    });
    const pro = normalizeSubscriptionPlan({
      ...CLIENT_FALLBACK_SUBSCRIPTION_PLANS[1],
      monthlyCredits: 12_345
    });

    expect(free.monthlyCredits).toBe(100);
    expect(pro.monthlyCredits).toBe(12_345);
  });
});
