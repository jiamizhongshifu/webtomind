import {
  FREE_DAILY_CREDITS,
  FREE_DAILY_IMAGE_GENERATION_LIMIT,
  isFreePlanName,
  normalizePlanLimits
} from './credit-policy';
import type {
  BillingCycle,
  PlanName,
  SubscriptionPlan
} from '../types/membership';
import { estimateVideoGenerationCreditCost } from './video-generation-pricing';

export const PRICING_PROMO_ORIGINAL_PRICE_CENTS: Record<PlanName, number> = {
  free: 900,
  pro: 3000,
  max: 15000
};

/** 年付正常折扣：30%（月付原价 × 12 × 0.7）。 */
export const TARGET_YEARLY_DISCOUNT_PERCENT = 30;

/**
 * Product Hunt 发布优惠（年付 5 折）活动截止日期（含当天）。
 * 套餐页优惠提示会展示该日期；如需延期/提前结束，只改这里。
 */
export const PH_PROMO_END_DATE = '2026-08-31';

export const VIDEO_PLAN_MARKETING_COSTS = {
  mini5s480p: estimateVideoGenerationCreditCost({
    model: 'seedance-2-0-mini',
    duration: 5,
    resolution: '480p'
  }).cost,
  fast5s720p: estimateVideoGenerationCreditCost({
    model: 'seedance-2-0-fast',
    duration: 5,
    resolution: '720p'
  }).cost,
  standard15s720p: estimateVideoGenerationCreditCost({
    model: 'seedance-2-0',
    duration: 15,
    resolution: '720p'
  }).cost,
  seedance25_5s720p: estimateVideoGenerationCreditCost({
    model: 'seedance-2-5',
    duration: 5,
    resolution: '720p'
  }).cost
} as const;

export function getVideoGenerationCapacity(
  credits: number,
  costPerVideo: number
): number {
  if (
    !Number.isFinite(credits) ||
    !Number.isFinite(costPerVideo) ||
    costPerVideo <= 0
  ) {
    return 0;
  }
  return Math.floor(Math.max(0, credits) / costPerVideo);
}

const PRO_MINI_VIDEO_CAPACITY = getVideoGenerationCapacity(
  10_000,
  VIDEO_PLAN_MARKETING_COSTS.mini5s480p
);
const PRO_FAST_VIDEO_CAPACITY = getVideoGenerationCapacity(
  10_000,
  VIDEO_PLAN_MARKETING_COSTS.fast5s720p
);
const MAX_MINI_VIDEO_CAPACITY = getVideoGenerationCapacity(
  60_000,
  VIDEO_PLAN_MARKETING_COSTS.mini5s480p
);
const MAX_FAST_VIDEO_CAPACITY = getVideoGenerationCapacity(
  60_000,
  VIDEO_PLAN_MARKETING_COSTS.fast5s720p
);

export const CLIENT_FALLBACK_SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    id: 'free',
    name: 'free',
    displayName: { 'zh-CN': '免费版', 'en-US': 'Free' },
    priceMonthly: 0,
    priceYearly: 0,
    monthlyCredits: FREE_DAILY_CREDITS,
    features: {
      aiModels: ['gemini-3.1-flash-lite-preview'],
      imageGeneration: true,
      youtubeTranscription: false,
      prioritySupport: false
    },
    limits: {
      maxMaterials: 100,
      maxConversations: -1,
      dailyCredits: FREE_DAILY_CREDITS,
      dailyImageGeneration: FREE_DAILY_IMAGE_GENERATION_LIMIT
    },
    sortOrder: 0,
    isActive: true,
    checkoutEnabled: true
  },
  {
    id: 'pro',
    name: 'pro',
    displayName: { 'zh-CN': '专业版', 'en-US': 'Pro' },
    priceMonthly: 2000,
    priceYearly: 16800,
    monthlyCredits: 10_000,
    features: {
      aiModels: [
        'gemini-3.1-flash-lite-preview',
        'gemini-3.1-flash-image-preview',
        'claude-sonnet-4-20250514'
      ],
      imageGeneration: true,
      youtubeTranscription: true,
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
    checkoutEnabled: false,
    checkoutUnavailableReason: 'pricing_unavailable'
  },
  {
    id: 'max',
    name: 'max',
    displayName: { 'zh-CN': '旗舰版', 'en-US': 'Max' },
    priceMonthly: 10000,
    priceYearly: 84000,
    monthlyCredits: 60_000,
    features: {
      aiModels: [
        'gemini-3.1-flash-lite-preview',
        'gemini-3.1-flash-image-preview',
        'claude-sonnet-4-20250514',
        'claude-opus-4-20250514'
      ],
      imageGeneration: true,
      youtubeTranscription: true,
      prioritySupport: true,
      earlyAccess: true
    },
    limits: {
      maxMaterials: -1,
      maxConversations: -1,
      dailyCredits: -1,
      dailyImageGeneration: -1,
      maxFileSizeMb: 100
    },
    sortOrder: 2,
    isActive: true,
    checkoutEnabled: false,
    checkoutUnavailableReason: 'pricing_unavailable'
  }
];

export type UpgradePlanName = Extract<PlanName, 'pro' | 'max'>;

export interface UpgradePlanCatalogEntry {
  name: UpgradePlanName;
  label: string;
  monthlyCredits: number;
  benefits: Record<'zh-CN' | 'en-US', string[]>;
}

export const CREATOR_UPGRADE_PLAN_CATALOG: Record<
  UpgradePlanName,
  UpgradePlanCatalogEntry
> = {
  pro: {
    name: 'pro',
    label: 'Pro',
    monthlyCredits: 10_000,
    benefits: {
      'zh-CN': [
        '每月 10,000 积分',
        `积分全部用于无参考视频时，约 ${PRO_MINI_VIDEO_CAPACITY} 条 Mini 5 秒 480P，或 ${PRO_FAST_VIDEO_CAPACITY} 条 Fast 5 秒 720P`,
        'Seedance 支持最长 15 秒、首尾帧、4K 与同步音频',
        '情绪板风格引导与多参考图创作',
        '完整 Prompt 案例与可视化配方',
        '参考图解析、会话与资产库复用'
      ],
      'en-US': [
        '10,000 credits every month',
        `If all credits fund videos without references: about ${PRO_MINI_VIDEO_CAPACITY} Mini 5s 480p or ${PRO_FAST_VIDEO_CAPACITY} Fast 5s 720p`,
        'Seedance supports up to 15 seconds, frames, 4K, and synchronized audio',
        'Moodboard guidance and multi-reference creation',
        'Complete prompt library and visual recipes',
        'Reference analysis, Sessions, and asset library reuse'
      ]
    }
  },
  max: {
    name: 'max',
    label: 'Max',
    monthlyCredits: 60_000,
    benefits: {
      'zh-CN': [
        '每月 60,000 积分',
        '专业版全部创作工作流',
        `积分全部用于无参考视频时，约 ${MAX_MINI_VIDEO_CAPACITY} 条 Mini 5 秒 480P，或 ${MAX_FAST_VIDEO_CAPACITY} 条 Fast 5 秒 720P`,
        '适合长期项目与高频商业交付'
      ],
      'en-US': [
        '60,000 credits every month',
        'Every creation workflow in Pro',
        `If all credits fund videos without references: about ${MAX_MINI_VIDEO_CAPACITY} Mini 5s 480p or ${MAX_FAST_VIDEO_CAPACITY} Fast 5s 720p`,
        'Built for long-running, high-volume commercial projects'
      ]
    }
  }
};

export interface UpgradeSelection {
  plan: UpgradePlanName;
  billing: BillingCycle;
}

export function normalizeSubscriptionPlan(
  plan: SubscriptionPlan
): SubscriptionPlan {
  return {
    ...plan,
    monthlyCredits: isFreePlanName(plan.name)
      ? FREE_DAILY_CREDITS
      : plan.monthlyCredits,
    limits: normalizePlanLimits(
      plan.limits,
      plan.name
    ) as SubscriptionPlan['limits']
  };
}

export function normalizeSubscriptionPlans(
  plans: SubscriptionPlan[]
): SubscriptionPlan[] {
  return plans.map(normalizeSubscriptionPlan);
}

export function getYearlyDiscountPercent(
  priceMonthly: number,
  priceYearly: number
): number {
  if (
    !Number.isFinite(priceMonthly) ||
    !Number.isFinite(priceYearly) ||
    priceMonthly <= 0 ||
    priceYearly <= 0
  ) {
    return 0;
  }
  return Math.max(0, Math.round((1 - priceYearly / (priceMonthly * 12)) * 100));
}

export function getDisplayedYearlyDiscountPercent(
  plans: SubscriptionPlan[]
): number {
  const paidDiscounts = plans
    .filter(
      (plan) => plan.isActive && plan.priceMonthly > 0 && plan.priceYearly > 0
    )
    .map((plan) =>
      getYearlyDiscountPercent(plan.priceMonthly, plan.priceYearly)
    )
    .filter((discount) => discount > 0);
  return paidDiscounts.length > 0 ? Math.min(...paidDiscounts) : 0;
}

export function getRecommendedUpgradePlan(
  search: string,
  fallback: UpgradePlanName = 'pro'
): UpgradePlanName {
  const plan = new URLSearchParams(search).get('plan');
  return plan === 'max' || plan === 'pro' ? plan : fallback;
}
