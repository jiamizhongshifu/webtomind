import { describe, expect, it } from 'vitest';
import {
  PLAN_COMPARISON_BILLING_ROW_IDS,
  PLAN_COMPARISON_STABLE_BENEFIT_ROW_IDS,
  formatCreditPackageUnitPrice,
  formatPromoCountdown,
  getCreditPackageImageCapacity,
  getPlanComparisonRows,
  getPricingIntentFromSource,
  getInitialPricingMode,
  isSubscriptionPlanCurrent,
  getBillingCycleDisplayAnchorPrice,
  getRecommendedPlanName,
  getBestValuePaidPlanId,
  getCreditUsageExamples,
  getPromoAnnualSavings,
  getPromoOriginalPrice,
  getPromoSavings,
  getSubscriptionValueMultiplier,
  unwrapPricingReturnTo
} from '../PricingPage';
import type { SubscriptionPlan } from '@/types/membership';
import { CLIENT_FALLBACK_SUBSCRIPTION_PLANS } from '@/shared/pricing-catalog';

describe('PricingPage credit package helpers', () => {
  it('exposes credit usage examples from the shared pricing constants', () => {
    const examples = getCreditUsageExamples();
    expect(examples.map((item) => item.id)).toEqual([
      'base',
      'large-2k',
      '4k',
      'reference',
      'video-mini',
      'video-fast',
      'video-standard-long',
      'video-seedance-25'
    ]);
    expect(examples.find((item) => item.id === 'base')?.credits).toBe(60);
    expect(examples.find((item) => item.id === 'large-2k')?.credits).toBe(100);
    expect(examples.find((item) => item.id === '4k')?.credits).toBe(300);
    expect(examples.find((item) => item.id === 'reference')?.credits).toBe(20);
    expect(examples.find((item) => item.id === 'video-mini')?.credits).toBe(
      400
    );
    expect(examples.find((item) => item.id === 'video-fast')?.credits).toBe(
      1385
    );
    expect(
      examples.find((item) => item.id === 'video-standard-long')?.credits
    ).toBe(5160);
    expect(
      examples.find((item) => item.id === 'video-seedance-25')?.credits
    ).toBe(2736);
  });

  it('formats one-time credit package unit prices from cents', () => {
    expect(formatCreditPackageUnitPrice(500, 1000)).toBe('0.005');
    expect(formatCreditPackageUnitPrice(2000, 5000)).toBe('0.004');
    expect(formatCreditPackageUnitPrice(0, 0)).toBe('0.000');
  });

  it('estimates credit package base image capacity', () => {
    expect(getCreditPackageImageCapacity(1000)).toBe(16);
    expect(getCreditPackageImageCapacity(5000)).toBe(83);
    expect(getCreditPackageImageCapacity(0)).toBe(0);
  });

  it('picks the lowest per-credit paid plan for the active billing cycle', () => {
    const plans = CLIENT_FALLBACK_SUBSCRIPTION_PLANS;
    expect(getBestValuePaidPlanId(plans, 'monthly')).toBe('max');
    expect(getBestValuePaidPlanId(plans, 'yearly')).toBe('max');
    expect(
      getBestValuePaidPlanId(
        plans.map((plan) =>
          plan.name === 'max'
            ? { ...plan, priceMonthly: 100000, priceYearly: 720000 }
            : plan
        ),
        'monthly'
      )
    ).toBe('pro');
    expect(getBestValuePaidPlanId([], 'monthly')).toBeNull();
  });

  it('calculates subscription value against a trial package', () => {
    expect(getSubscriptionValueMultiplier(20_000, 1000)).toBe(20);
    expect(getSubscriptionValueMultiplier(20_000, 5000)).toBe(4);
    expect(getSubscriptionValueMultiplier(20_000, 0)).toBe(0);
  });
});

describe('PricingPage conversion positioning', () => {
  it('defaults to monthly billing while preserving explicit yearly links', () => {
    expect(getInitialPricingMode('')).toBe('monthly');
    expect(getInitialPricingMode('?source=creator_sidebar')).toBe('monthly');
    expect(getInitialPricingMode('?mode=yearly')).toBe('yearly');
    expect(getInitialPricingMode('?mode=monthly')).toBe('monthly');
    expect(getInitialPricingMode('?mode=payg')).toBe('monthly');
  });

  it('unwraps legacy nested pricing return paths before checkout', () => {
    expect(
      unwrapPricingReturnTo(
        '/zh-CN/create/pricing?source=creator_sidebar&returnTo=%2Fzh-CN%2Fcreate%2Fimage'
      )
    ).toBe('/zh-CN/create/image');
    expect(
      unwrapPricingReturnTo(
        '/zh-CN/create/pricing?returnTo=%2Fzh-CN%2Fcreate%2Fpricing%3FreturnTo%3D%252Fzh-CN%252Fcreate%252Fmoodboards'
      )
    ).toBe('/zh-CN/create/moodboards');
    expect(unwrapPricingReturnTo('https://example.com/steal')).toBeNull();
  });

  it('keeps Pro as the recommended plan for every pricing source', () => {
    expect(getRecommendedPlanName('pricing_page')).toBe('pro');
    expect(getRecommendedPlanName('credit_blocked')).toBe('pro');
    expect(getRecommendedPlanName('low_balance')).toBe('pro');
    expect(getRecommendedPlanName('prompt_share_unlock')).toBe('pro');
    expect(getRecommendedPlanName('prompt_case_unlock')).toBe('pro');
    expect(
      getRecommendedPlanName('credit_blocked', '?plan=max&mode=yearly')
    ).toBe('max');
    expect(
      getRecommendedPlanName('credit_blocked', '?plan=unknown&mode=yearly')
    ).toBe('pro');
  });

  it('maps pricing sources to conversion intent without promoting credit packs', () => {
    expect(getPricingIntentFromSource('credit_blocked')).toBe(
      'generation_continuity'
    );
    expect(getPricingIntentFromSource('low_balance')).toBe(
      'generation_continuity'
    );
    expect(getPricingIntentFromSource('prompt_share_unlock')).toBe(
      'prompt_workflow'
    );
    expect(getPricingIntentFromSource('pricing_page')).toBe('membership_value');
  });
});

describe('PricingPage current plan matching', () => {
  const freePlan = {
    ...CLIENT_FALLBACK_SUBSCRIPTION_PLANS[0],
    id: 'database-free-plan-id'
  };

  it('does not infer a free plan while authenticated subscription data is unresolved', () => {
    expect(isSubscriptionPlanCurrent(freePlan, null)).toBe(false);
    expect(isSubscriptionPlanCurrent(freePlan, 'free')).toBe(true);
  });

  it('normalizes plan names and identifiers', () => {
    const proPlan = {
      ...CLIENT_FALLBACK_SUBSCRIPTION_PLANS[1],
      id: 'database-pro-plan-id'
    };
    expect(isSubscriptionPlanCurrent(proPlan, 'DATABASE_PRO_PLAN_ID')).toBe(
      true
    );
  });
});

describe('PricingPage promotional offer helpers', () => {
  it('uses higher anchored monthly prices for the core plans', () => {
    expect(getPromoOriginalPrice('free', 0)).toBe(900);
    expect(getPromoOriginalPrice('pro', 1667)).toBe(3000);
    expect(getPromoOriginalPrice('max', 8333)).toBe(15000);
  });

  it('calculates the limited-time savings from the displayed price', () => {
    expect(getPromoSavings(3000, 1667)).toBe(1333);
    expect(getPromoSavings(15000, 10000)).toBe(5000);
    expect(getPromoSavings(900, 0)).toBe(900);
  });

  it('calculates yearly savings from the promotional monthly anchor', () => {
    expect(getPromoAnnualSavings(3000, 1667)).toBe(16000);
    expect(getPromoAnnualSavings(15000, 8333)).toBe(80000);
    expect(getPromoAnnualSavings(900, 900)).toBe(0);
  });

  it('uses monthly price as the yearly display anchor', () => {
    expect(getBillingCycleDisplayAnchorPrice('pro', 2000, 1667, 'yearly')).toBe(
      2000
    );
    expect(
      getBillingCycleDisplayAnchorPrice('pro', 2000, 2000, 'monthly')
    ).toBe(3000);
  });
});

describe('PricingPage promotion countdown', () => {
  it('formats a 12-hour countdown as HH:MM:SS', () => {
    expect(formatPromoCountdown(12 * 60 * 60 * 1000)).toBe('12:00:00');
    expect(formatPromoCountdown(3661000)).toBe('01:01:01');
    expect(formatPromoCountdown(-1)).toBe('00:00:00');
  });
});

describe('PricingPage plan comparison rows', () => {
  const translate = (key: string, options?: Record<string, unknown>): string =>
    String(options?.defaultValue || key);

  const proPlan: SubscriptionPlan = {
    id: 'pro',
    name: 'pro',
    displayName: { 'zh-CN': '专业版', 'en-US': 'Pro' },
    priceMonthly: 2000,
    priceYearly: 16800,
    monthlyCredits: 10000,
    features: {
      aiModels: ['gpt-image-2'],
      imageGeneration: true,
      youtubeTranscription: false,
      prioritySupport: false
    },
    limits: {
      maxMaterials: -1,
      maxConversations: -1,
      dailyCredits: -1,
      dailyImageGeneration: -1
    },
    sortOrder: 1,
    isActive: true,
    checkoutEnabled: true,
    checkoutPrices: {
      alipay: {
        currency: 'CNY',
        priceMonthly: 14_400,
        priceYearly: 120_960
      }
    }
  };

  it('keeps benefit copy stable when switching monthly and yearly billing', () => {
    const monthlyRows = getPlanComparisonRows('monthly', translate);
    const yearlyRows = getPlanComparisonRows('yearly', translate);
    const stableBenefitIds = [...PLAN_COMPARISON_STABLE_BENEFIT_ROW_IDS];

    const monthlyBenefits = monthlyRows
      .filter((row) => stableBenefitIds.includes(row.id as never))
      .map((row) => [row.id, row.label, row.getValue(proPlan)]);
    const yearlyBenefits = yearlyRows
      .filter((row) => stableBenefitIds.includes(row.id as never))
      .map((row) => [row.id, row.label, row.getValue(proPlan)]);

    expect(monthlyBenefits).toEqual(yearlyBenefits);
    expect(monthlyBenefits.map(([id]) => id)).toEqual(stableBenefitIds);
  });

  it('only reserves the billing rows for monthly and yearly price changes', () => {
    const monthlyRows = getPlanComparisonRows('monthly', translate);
    const yearlyRows = getPlanComparisonRows('yearly', translate);
    const billingIds = [...PLAN_COMPARISON_BILLING_ROW_IDS];

    expect(
      monthlyRows.slice(0, billingIds.length).map((row) => row.id)
    ).toEqual(billingIds);
    expect(yearlyRows.slice(0, billingIds.length).map((row) => row.id)).toEqual(
      billingIds
    );
    expect(monthlyRows[0].getValue(proPlan)).toBe('$20 / 月');
    expect(yearlyRows[0].getValue(proPlan)).toBe('$168 / 年');
  });

  it('keeps the comparison table in CNY when Alipay is selected', () => {
    const rows = getPlanComparisonRows('yearly', translate, 'alipay');

    expect(rows[0].getValue(proPlan)).toBe('¥1209.6 / 年');
    expect(rows[1].getValue(proPlan)).toBe('¥100.8 / 月');
    expect(rows[2].getValue(proPlan)).toBe('¥518.4 / 年');
  });

  it('compares plans by workflow scope instead of estimated image output', () => {
    const rows = getPlanComparisonRows('yearly', translate);
    const workflowRow = rows.find((row) => row.id === 'workflowScope');

    expect(workflowRow?.label).toBe('创作工作流');
    expect(workflowRow?.getValue(proPlan)).toBe('完整创作工作流');
    expect(rows.some((row) => row.id === 'imageCapacity')).toBe(false);
  });
});
