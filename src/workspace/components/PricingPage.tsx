import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import './PricingPage.css';
import './PricingPagePlans.css';
import './PricingPageDetails.css';
import './PricingPageResponsive.css';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { createLogger } from '@/utils/logger';
import {
  Check,
  X,
  Star,
  Shield,
  HelpCircle,
  Languages,
  RefreshCw,
  Flame
} from 'lucide-react';
import { Logo } from './Logo';

const log = createLogger('PricingPage');
import { useAuth } from '@/web/contexts/AuthContext';
import { getApiBaseUrl } from '@/utils/env';
import type { SubscriptionPlan } from '@/types/membership';
import {
  collapsePaywallReturnTo,
  unwrapPaywallReturnTo
} from '@/shared/paywall-return-to';
import {
  consumePendingCheckoutIntent,
  createBillingPortalSession,
  createCheckoutSession,
  redirectToCheckout,
  savePendingCheckoutIntent,
  verifyCheckoutReturn
} from '@/services/payment-api';
import { getCreditPackages } from '@/services/credits-api';
import { usdCentsToDisplayedCny } from '@/shared/zpay-pricing';
import {
  getAnalyticsSessionId,
  trackCheckoutStart,
  trackEvent,
  trackPurchase,
  trackPricingView
} from '@/web/lib/analytics';
import { readSeoConversionAttribution } from '@/web/lib/seo-conversion-attribution';
import {
  recordClientConversionEvent,
  type ClientConversionEventPayload
} from '@/web/lib/client-conversion-events';
import {
  IMAGE_GENERATION_4K_CREDIT_COST,
  IMAGE_GENERATION_BASE_CREDIT_COST,
  IMAGE_GENERATION_CHARACTER_MODE_SURCHARGE,
  IMAGE_GENERATION_HIGH_QUALITY_CREDIT_FLOOR,
  IMAGE_GENERATION_LARGE_2K_CREDIT_COST,
  IMAGE_GENERATION_REFERENCE_IMAGE_SURCHARGE
} from '@/shared/image-generation-pricing';
import {
  CLIENT_FALLBACK_SUBSCRIPTION_PLANS,
  PH_PROMO_END_DATE,
  PRICING_PROMO_ORIGINAL_PRICE_CENTS,
  VIDEO_PLAN_MARKETING_COSTS,
  getDisplayedYearlyDiscountPercent,
  getRecommendedUpgradePlan,
  getVideoGenerationCapacity,
  normalizeSubscriptionPlans
} from '@/shared/pricing-catalog';
import { useLanguage } from '@/i18n/hooks/useLanguage';
import type { SupportedLanguage } from '@/i18n/config';
import { Button } from '@/shared/ui';
import {
  PricingBillingSwitch,
  PricingFaqList,
  PricingPaymentMethodSwitch,
  PricingPlanCreditSummary,
  PricingSectionHeading,
  type PricingBillingMode,
  type PricingPaymentMethod
} from './PricingPresentation';

interface PricingPageProps {
  onClose: () => void;
  embedded?: boolean;
}

// v4：改价后必须换 key 失效旧缓存；在线时始终后台拉最新套餐，
// localStorage 仅作首帧直出与离线兜底，避免旧价格被展示长达 TTL。
const PLANS_CACHE_KEY = 'webtomind_plans_cache_v4';
const PLANS_CACHE_TTL = 15 * 60 * 1000;
const CHECKOUT_CONTEXT_STORAGE_KEY = 'webtomind_checkout_context';
const PROMO_CODE_STORAGE_KEY = 'webtomind:promo-code:v1';
const CHECKOUT_CONTEXT_TTL_MS = 2 * 60 * 60 * 1000;
function normalizePlanIdentity(value?: string | null) {
  return (
    value
      ?.trim()
      .toLowerCase()
      .replace(/[\s_-]+/g, '') || ''
  );
}

export function isSubscriptionPlanCurrent(
  plan: SubscriptionPlan,
  currentPlanId: string | null
) {
  const currentIdentity = normalizePlanIdentity(currentPlanId);
  if (!currentIdentity) return false;

  if (
    [plan.id, plan.name].some(
      (identity) => normalizePlanIdentity(identity) === currentIdentity
    )
  ) {
    return true;
  }

  return currentIdentity === 'free' && plan.priceMonthly <= 0;
}

function getPlanCheckoutPrice(
  plan: SubscriptionPlan,
  billingCycle: 'monthly' | 'yearly',
  paymentMethod: PricingPaymentMethod
): { amountCents: number; currency: 'USD' | 'CNY'; symbol: '$' | '¥' } {
  const alipay = plan.checkoutPrices?.alipay;
  if (paymentMethod === 'alipay' && (alipay || plan.priceMonthly <= 0)) {
    return {
      amountCents:
        alipay && billingCycle === 'yearly'
          ? alipay.priceYearly
          : alipay?.priceMonthly || 0,
      currency: 'CNY',
      symbol: '¥'
    };
  }
  return {
    amountCents:
      billingCycle === 'yearly' ? plan.priceYearly : plan.priceMonthly,
    currency: 'USD',
    symbol: '$'
  };
}

interface SubscriptionStateResponse {
  plan?: { id?: string | null } | null;
  isFree?: boolean;
  subscription?: { planId?: string | null } | null;
}

type StoredCheckoutContext = {
  orderId?: string;
  checkoutType: 'subscription' | 'credit_package';
  productId: string;
  productName?: string;
  amountCents?: number;
  currency: string;
  billingCycle?: 'monthly' | 'yearly';
  paymentProvider?: PricingPaymentMethod;
  ctaSource?: string;
  pricingIntent?: string;
  recommendedPlanName?: string;
  returnTo?: string;
  createdAt: number;
};

export function getPricingSourceFromSearch(search: string): string {
  return new URLSearchParams(search).get('source') || 'pricing_page';
}

export function getInitialPricingMode(
  search: string
): 'payg' | 'monthly' | 'yearly' {
  const mode = new URLSearchParams(search).get('mode');
  if (mode === 'monthly' || mode === 'yearly') return mode;
  return 'monthly';
}

export function getRecommendedPlanName(
  source: string,
  search = ''
): 'pro' | 'max' {
  void source;
  return getRecommendedUpgradePlan(search);
}

export function getPricingIntentFromSource(source: string): string {
  const normalized = source.toLowerCase();
  if (
    normalized.includes('credit_blocked') ||
    normalized.includes('low_balance') ||
    normalized.includes('insufficient') ||
    normalized.includes('balance')
  ) {
    return 'generation_continuity';
  }
  if (
    normalized.includes('prompt_share') ||
    normalized.includes('prompt_case') ||
    normalized.includes('prompt_unlock') ||
    normalized.includes('prompt_cases')
  ) {
    return 'prompt_workflow';
  }
  return 'membership_value';
}

function getCheckoutUtmParams(search: string): Record<string, string> {
  const params = new URLSearchParams(search);
  const utm: Record<string, string> = {};
  [
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_term',
    'utm_content'
  ].forEach((key) => {
    const value = params.get(key);
    if (value) utm[key] = value;
  });
  return utm;
}

/**
 * Backwards-compatible wrapper kept for callers that only unwrap pricing
 * chains; the shared helper also collapses /recharge nesting so a pricing
 * page reached from recharge still resolves to the original destination.
 */
export function unwrapPricingReturnTo(value?: string | null): string | null {
  if (!value || typeof window === 'undefined') return null;
  return unwrapPaywallReturnTo(value, window.location.origin);
}

function getCheckoutAttribution(input: {
  search: string;
  pathname: string;
  hash: string;
  pricingSource: string;
}) {
  const params = new URLSearchParams(input.search);
  const localePrefix = input.pathname.startsWith('/en-US')
    ? '/en-US'
    : input.pathname.startsWith('/zh-CN')
      ? '/zh-CN'
      : '';
  const returnTo =
    unwrapPricingReturnTo(
      params.get('returnTo') || `${input.pathname}${input.search}${input.hash}`
    ) || `${localePrefix}/create`;
  const pricingPath = `${localePrefix}/create/pricing`;
  const urlOrigin =
    typeof window !== 'undefined'
      ? window.location.origin
      : 'https://webtomind.com';
  const successUrl = new URL(pricingPath, urlOrigin);
  const cancelUrl = new URL(pricingPath, urlOrigin);
  successUrl.searchParams.set('source', input.pricingSource);
  successUrl.searchParams.set('returnTo', returnTo);
  cancelUrl.searchParams.set('source', input.pricingSource);
  cancelUrl.searchParams.set('returnTo', returnTo);

  return {
    ctaSource: input.pricingSource,
    returnTo,
    pageLocation:
      typeof window !== 'undefined' ? window.location.href : undefined,
    pageReferrer:
      typeof document !== 'undefined'
        ? document.referrer || undefined
        : undefined,
    utm: getCheckoutUtmParams(input.search),
    acquisition: readSeoConversionAttribution()?.acquisition,
    successUrl: successUrl.toString(),
    cancelUrl: cancelUrl.toString()
  };
}

function writeCheckoutContext(context: StoredCheckoutContext) {
  try {
    window.sessionStorage.setItem(
      CHECKOUT_CONTEXT_STORAGE_KEY,
      JSON.stringify(context)
    );
  } catch {
    // Storage can be unavailable in strict browsers; analytics still degrades safely.
  }
}

function readCheckoutContext(params: {
  orderId?: string | null;
  checkoutType?: string | null;
  productId?: string | null;
}): StoredCheckoutContext | null {
  try {
    const raw = window.sessionStorage.getItem(CHECKOUT_CONTEXT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredCheckoutContext;
    if (
      typeof parsed.createdAt !== 'number' ||
      Date.now() - parsed.createdAt > CHECKOUT_CONTEXT_TTL_MS
    ) {
      clearCheckoutContext();
      return null;
    }
    if (params.orderId && parsed.orderId && parsed.orderId !== params.orderId) {
      return null;
    }
    if (
      params.checkoutType &&
      parsed.checkoutType &&
      parsed.checkoutType !== params.checkoutType
    ) {
      return null;
    }
    if (
      params.productId &&
      parsed.productId &&
      parsed.productId !== params.productId
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function getSafePostPurchaseReturnPath(value?: string | null): string | null {
  return unwrapPricingReturnTo(value);
}

function clearCheckoutContext() {
  try {
    window.sessionStorage.removeItem(CHECKOUT_CONTEXT_STORAGE_KEY);
  } catch {
    // ignore storage issues
  }
}

export function getCreditPackageImageCapacity(credits: number): number {
  return Math.floor(credits / IMAGE_GENERATION_BASE_CREDIT_COST);
}

export function getBestValuePaidPlanId(
  plans: SubscriptionPlan[],
  billingCycle: 'monthly' | 'yearly'
): string | null {
  let best: { id: string; perCreditCents: number } | null = null;
  for (const plan of plans) {
    if (!plan.isActive || plan.priceMonthly <= 0) continue;
    const priceCents =
      billingCycle === 'yearly' ? plan.priceYearly / 12 : plan.priceMonthly;
    const credits = Math.max(1, plan.monthlyCredits);
    const perCreditCents = priceCents / credits;
    if (!best || perCreditCents < best.perCreditCents) {
      best = { id: plan.id, perCreditCents };
    }
  }
  return best?.id ?? null;
}

export function getCreditUsageExamples() {
  return [
    {
      id: 'base',
      titleKey: 'membership.creditUsageExampleBaseTitle',
      title: '快速草图 / 社媒封面',
      credits: IMAGE_GENERATION_BASE_CREDIT_COST,
      detailKey: 'membership.creditUsageExampleBaseDetail',
      detail: '标准尺寸起算，适合快速构图、小红书封面和灵感测试。'
    },
    {
      id: 'large-2k',
      titleKey: 'membership.creditUsageExample2kTitle',
      title: '2K 商业主图',
      credits: IMAGE_GENERATION_LARGE_2K_CREDIT_COST,
      detailKey: 'membership.creditUsageExample2kDetail',
      detail: '适合产品图、公众号封面、Prompt 案例复现和可投放素材。'
    },
    {
      id: '4k',
      titleKey: 'membership.creditUsageExample4kTitle',
      title: '4K 大图 / 精修',
      credits: IMAGE_GENERATION_4K_CREDIT_COST,
      detailKey: 'membership.creditUsageExample4kDetail',
      detail: `4K 起算 ${IMAGE_GENERATION_4K_CREDIT_COST} 积分；高画质按 ${IMAGE_GENERATION_HIGH_QUALITY_CREDIT_FLOOR} 积分起算，不与尺寸重复叠加。`
    },
    {
      id: 'reference',
      titleKey: 'membership.creditUsageExampleReferenceTitle',
      title: '参考图 / 角色一致性',
      credits: IMAGE_GENERATION_REFERENCE_IMAGE_SURCHARGE,
      detailKey: 'membership.creditUsageExampleReferenceDetail',
      detail: '参考图按像素计费：1K 参考图约 +20 积分，小图更少、大图封顶约 +30；角色一致性按参考图张数计费，无额外模式费。'
    },
    {
      id: 'video-mini',
      titleKey: 'membership.creditUsageExampleVideoMiniTitle',
      title: 'Mini 轻量视频 · 5 秒 480P',
      credits: VIDEO_PLAN_MARKETING_COSTS.mini5s480p,
      detailKey: 'membership.creditUsageExampleVideoMiniDetail',
      detail: '适合批量短镜头、分镜测试和高频社媒内容。'
    },
    {
      id: 'video-fast',
      titleKey: 'membership.creditUsageExampleVideoFastTitle',
      title: 'Fast 高清视频 · 5 秒 720P',
      credits: VIDEO_PLAN_MARKETING_COSTS.fast5s720p,
      detailKey: 'membership.creditUsageExampleVideoFastDetail',
      detail: '兼顾速度与高清成片，适合稳定日常交付。'
    },
    {
      id: 'video-standard-long',
      titleKey: 'membership.creditUsageExampleVideoStandardLongTitle',
      title: 'Seedance 2.0 完整镜头 · 15 秒 720P',
      credits: VIDEO_PLAN_MARKETING_COSTS.standard15s720p,
      detailKey: 'membership.creditUsageExampleVideoStandardLongDetail',
      detail: '旗舰模型长镜头，适合复杂动作、首尾帧和成片探索。'
    },
    {
      id: 'video-seedance-25',
      titleKey: 'membership.creditUsageExampleVideoSeedance25Title',
      title: 'Seedance 2.5 高清视频 · 5 秒 720P',
      credits: VIDEO_PLAN_MARKETING_COSTS.seedance25_5s720p,
      detailKey: 'membership.creditUsageExampleVideoSeedance25Detail',
      detail:
        '当前旗舰模型，支持 30 秒连贯直出、多模态参考和原生音频；按实际时长与分辨率计费，参考图与首尾帧不额外收费，参考视频按输入时长计费。'
    }
  ];
}

export function getSubscriptionValueMultiplier(
  subscriptionCredits: number,
  packageCredits: number
): number {
  if (!Number.isFinite(packageCredits) || packageCredits <= 0) return 0;
  return Math.floor(subscriptionCredits / packageCredits);
}

export function getPromoOriginalPrice(
  planName: string,
  currentPrice: number
): number {
  const preset =
    PRICING_PROMO_ORIGINAL_PRICE_CENTS[
      planName.toLowerCase() as keyof typeof PRICING_PROMO_ORIGINAL_PRICE_CENTS
    ];
  if (typeof preset === 'number') {
    return Math.max(preset, currentPrice);
  }
  if (currentPrice <= 0) {
    return PRICING_PROMO_ORIGINAL_PRICE_CENTS.free;
  }
  return Math.max(currentPrice, Math.ceil((currentPrice * 1.5) / 100) * 100);
}

export function getPromoSavings(
  originalPrice: number,
  currentPrice: number
): number {
  return Math.max(0, originalPrice - currentPrice);
}

export function getPromoAnnualSavings(
  originalMonthlyPrice: number,
  currentMonthlyPrice: number
): number {
  const monthlySavings = getPromoSavings(
    originalMonthlyPrice,
    currentMonthlyPrice
  );
  return Math.max(0, Math.round((monthlySavings * 12) / 100) * 100);
}

export function getBillingCycleDisplayAnchorPrice(
  planName: string,
  monthlyPrice: number,
  displayedMonthlyPrice: number,
  billingCycle: PlanComparisonBillingCycle
): number {
  if (billingCycle === 'yearly') {
    return Math.max(monthlyPrice, displayedMonthlyPrice);
  }
  return getPromoOriginalPrice(planName, displayedMonthlyPrice);
}

export function formatPromoCountdown(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds]
    .map((value) => value.toString().padStart(2, '0'))
    .join(':');
}

export function formatCreditPackageUnitPrice(
  price: number,
  credits: number
): string {
  if (!Number.isFinite(price) || !Number.isFinite(credits) || credits <= 0) {
    return '0.000';
  }
  return (price / 100 / credits).toFixed(3);
}

export function formatPlanPrice(price: number): string {
  return price === 0 ? '0' : `${price / 100}`;
}

function getLocalizedPricingPath(
  pathname: string,
  targetLanguage: SupportedLanguage
): string {
  const withoutLocale =
    pathname.replace(/^\/(?:zh-CN|en-US)(?=\/|$)/, '') || '/pricing';
  const normalizedPath = withoutLocale.startsWith('/')
    ? withoutLocale
    : `/${withoutLocale}`;
  return `/${targetLanguage}${normalizedPath}`;
}

function getPlanGenerationSpeed(planName: string): string {
  if (planName === 'max') return '⚡⚡⚡';
  if (planName === 'pro') return '⚡⚡';
  return '⚡';
}

export type PlanComparisonBillingCycle = 'monthly' | 'yearly';

type PricingTranslator = (
  key: string,
  options?: Record<string, unknown>
) => string;

type PlanComparisonRow = {
  id: string;
  label: string;
  getValue: (plan: SubscriptionPlan) => string;
};

export const PLAN_COMPARISON_BILLING_ROW_IDS = [
  'price',
  'averageMonthly',
  'annualSavings'
] as const;

export const PLAN_COMPARISON_STABLE_BENEFIT_ROW_IDS = [
  'monthlyCredits',
  'workflowScope',
  'speed',
  'promptCases',
  'privacy',
  'creditDiscount',
  'bestFor'
] as const;

export function getPlanComparisonRows(
  billingCycle: PlanComparisonBillingCycle,
  t: PricingTranslator,
  paymentMethod: PricingPaymentMethod = 'stripe'
): PlanComparisonRow[] {
  const getComparisonPrices = (plan: SubscriptionPlan) => {
    const alipay = plan.checkoutPrices?.alipay;
    return paymentMethod === 'alipay' && alipay
      ? {
          monthly: alipay.priceMonthly,
          yearly: alipay.priceYearly,
          symbol: '¥'
        }
      : {
          monthly: plan.priceMonthly,
          yearly: plan.priceYearly,
          symbol: paymentMethod === 'alipay' ? '¥' : '$'
        };
  };
  return [
    {
      id: 'price',
      label: t('membership.comparePrice', {
        defaultValue: billingCycle === 'yearly' ? '年付价格' : '月付价格'
      }),
      getValue: (plan: SubscriptionPlan) => {
        const prices = getComparisonPrices(plan);
        if (plan.priceMonthly <= 0) return `${prices.symbol}0`;
        return billingCycle === 'yearly'
          ? `${prices.symbol}${formatPlanPrice(prices.yearly)} / ${t('membership.year', { defaultValue: '年' })}`
          : `${prices.symbol}${formatPlanPrice(prices.monthly)} / ${t('membership.mo', { defaultValue: '月' })}`;
      }
    },
    {
      id: 'averageMonthly',
      label: t('membership.compareAverageMonthly', {
        defaultValue: '折后月均'
      }),
      getValue: (plan: SubscriptionPlan) => {
        const prices = getComparisonPrices(plan);
        if (plan.priceMonthly <= 0) return `${prices.symbol}0`;
        const monthly =
          billingCycle === 'yearly'
            ? Math.round(prices.yearly / 12)
            : prices.monthly;
        return `${prices.symbol}${formatPlanPrice(monthly)} / ${t('membership.mo', { defaultValue: '月' })}`;
      }
    },
    {
      id: 'annualSavings',
      label: t('membership.compareAnnualSavings', {
        defaultValue: '年付节省'
      }),
      getValue: (plan: SubscriptionPlan) => {
        const prices = getComparisonPrices(plan);
        const annualSavings = Math.max(0, prices.monthly * 12 - prices.yearly);
        return billingCycle === 'yearly' && annualSavings > 0
          ? `${prices.symbol}${formatPlanPrice(annualSavings)} / ${t('membership.year', { defaultValue: '年' })}`
          : t('membership.notApplicable', { defaultValue: '-' });
      }
    },
    {
      id: 'monthlyCredits',
      label: t('membership.compareMonthlyCredits', {
        defaultValue: '积分额度'
      }),
      getValue: (plan: SubscriptionPlan) =>
        plan.name === 'free'
          ? t('membership.freeDailyCreditsShort', {
              credits: plan.monthlyCredits.toLocaleString(),
              defaultValue: `${plan.monthlyCredits.toLocaleString()}/天`
            })
          : `${plan.monthlyCredits.toLocaleString()} / ${t('membership.mo', { defaultValue: '月' })}`
    },
    {
      id: 'workflowScope',
      label: t('membership.compareWorkflowScope', {
        defaultValue: '创作工作流'
      }),
      getValue: (plan: SubscriptionPlan) =>
        t(`membership.compareWorkflowScope_${plan.name}`, {
          defaultValue:
            plan.name === 'max'
              ? '完整工作流 + 高频迭代'
              : plan.name === 'pro'
                ? '完整创作工作流'
                : '基础图像创作'
        })
    },
    {
      id: 'speed',
      label: t('membership.compareSpeed', {
        defaultValue: '生成速度'
      }),
      getValue: (plan: SubscriptionPlan) =>
        `${getPlanGenerationSpeed(plan.name)} ${
          plan.name === 'max'
            ? t('membership.compareSpeedMax', {
                defaultValue: '极速生成'
              })
            : plan.name === 'pro'
              ? t('membership.compareSpeedPro', {
                  defaultValue: '高速生成'
                })
              : t('membership.compareSpeedFree', {
                  defaultValue: '标准生成'
                })
        }`
    },
    {
      id: 'promptCases',
      label: t('membership.comparePromptCases', {
        defaultValue: 'Prompt 案例'
      }),
      getValue: (plan: SubscriptionPlan) =>
        plan.name === 'free'
          ? t('membership.comparePromptCasesFree', {
              defaultValue: '基础案例'
            })
          : t('membership.comparePromptCasesPaid', {
              defaultValue: '解锁会员案例'
            })
    },
    {
      id: 'privacy',
      label: t('membership.comparePrivacy', {
        defaultValue: '生成隐私'
      }),
      getValue: (plan: SubscriptionPlan) =>
        plan.name === 'free'
          ? t('membership.comparePrivacyFree', {
              defaultValue: '标准'
            })
          : t('membership.comparePrivacyPaid', {
              defaultValue: '默认私密'
            })
    },
    {
      id: 'creditDiscount',
      label: t('membership.compareCreditDiscount', {
        defaultValue: '额外积分折扣'
      }),
      getValue: (plan: SubscriptionPlan) =>
        plan.name === 'free'
          ? t('membership.compareCreditDiscountFree', {
              defaultValue: '原价购买'
            })
          : plan.name === 'max'
            ? t('membership.compareCreditDiscountMax', {
                defaultValue: '更高折扣'
              })
            : t('membership.compareCreditDiscountPro', {
                defaultValue: '可享折扣'
              })
    },
    {
      id: 'bestFor',
      label: t('membership.compareBestFor', {
        defaultValue: '适合场景'
      }),
      getValue: (plan: SubscriptionPlan) =>
        plan.name === 'max'
          ? t('membership.compareMaxFit', {
              defaultValue: '长期项目、批量实验和高频迭代'
            })
          : plan.name === 'pro'
            ? t('membership.compareProFit', {
                defaultValue: '稳定周更、商业封面和产品图交付'
              })
            : t('membership.compareFreeFit', {
                defaultValue: '轻量试用和基础创作'
              })
    }
  ];
}

export const PricingPage: React.FC<PricingPageProps> = ({
  onClose,
  embedded = false
}) => {
  const { t } = useTranslation('workspace');
  const { language, changeLanguage } = useLanguage();
  const { getAccessToken, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [pricingMode, setPricingMode] = useState<'payg' | 'monthly' | 'yearly'>(
    () => getInitialPricingMode(location.search)
  );
  const [paymentMethod, setPaymentMethod] =
    useState<PricingPaymentMethod>(() =>
      location.pathname.startsWith('/en-US') ? 'stripe' : 'alipay'
    );
  const [cheapestCreditPrice, setCheapestCreditPrice] = useState<
    number | null
  >(null);
  useEffect(() => {
    let cancelled = false;
    getCreditPackages()
      .then((packages) => {
        if (cancelled) return;
        const active = packages.filter(
          (pkg) => pkg.isActive && pkg.price > 0
        );
        if (active.length > 0) {
          setCheapestCreditPrice(
            Math.min(...active.map((pkg) => pkg.price))
          );
        }
      })
      .catch(() => {
        // Credit package price is progressive enhancement only.
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  // Never infer that an authenticated user is on Free while the membership
  // source of truth is unresolved. That can expose the wrong CTA and resume a
  // stale checkout intent before we know whether a subscription already exists.
  const [currentPlanId, setCurrentPlanId] = useState<string | null>(() =>
    isAuthenticated ? null : 'free'
  );
  const [subscriptionStatus, setSubscriptionStatus] = useState<
    'loading' | 'resolved' | 'error'
  >(() => (isAuthenticated ? 'loading' : 'resolved'));
  const [purchasingId, setPurchasingId] = useState<string | null>(null);
  // 预填 Product Hunt 优惠码，用户只需点击「应用」即可兑换。
  const [promoCodeInput, setPromoCodeInput] = useState('WEBTOMIND50');
  const [appliedPromoCode, setAppliedPromoCode] = useState<string>(() => {
    try {
      return localStorage.getItem(PROMO_CODE_STORAGE_KEY) || '';
    } catch {
      return '';
    }
  });
  const [paymentNotice, setPaymentNotice] = useState<{
    tone: 'neutral' | 'success' | 'warning' | 'error';
    message: string;
  } | null>(null);
  const [paymentRetryAvailable, setPaymentRetryAvailable] = useState(false);
  const resumedCheckoutRef = useRef(false);
  const activeCheckoutRef = useRef<string | null>(null);
  const reportedPurchaseReturnsRef = useRef<Set<string>>(new Set());
  const pricingExposureKeysRef = useRef<Set<string>>(new Set());
  const billingCycle = pricingMode === 'yearly' ? 'yearly' : 'monthly';
  const pricingSource = getPricingSourceFromSearch(location.search);
  const pricingIntent = getPricingIntentFromSource(pricingSource);
  const recommendedPlanName = getRecommendedPlanName(
    pricingSource,
    location.search
  );
  const availablePaymentMethods = useMemo(
    () =>
      (['stripe', 'alipay'] as PricingPaymentMethod[]).filter((method) =>
        plans.some((plan) => plan.checkoutProviders?.includes(method))
      ),
    [plans]
  );
  const effectivePaymentMethod = availablePaymentMethods.includes(paymentMethod)
    ? paymentMethod
    : availablePaymentMethods[0] || paymentMethod;
  const phPromoActive =
    billingCycle === 'yearly' &&
    Boolean(appliedPromoCode);

  const recordPricingConversion = useCallback(
    (payload: ClientConversionEventPayload) => {
      const accessToken = getAccessToken();
      if (!accessToken) return;

      void recordClientConversionEvent(accessToken, {
        ...payload,
        ctaSource: payload.ctaSource || pricingSource,
        metadata: {
          pricing_mode: pricingMode,
          pricing_intent: pricingIntent,
          recommended_plan_name: recommendedPlanName,
          path: `${location.pathname}${location.search}${location.hash}`,
          ...payload.metadata
        }
      });
    },
    [
      getAccessToken,
      location.hash,
      location.pathname,
      location.search,
      pricingIntent,
      pricingMode,
      recommendedPlanName,
      pricingSource
    ]
  );

  const trackPricingExposure = useCallback(
    (
      key: string,
      name: 'pricing_item_view' | 'pricing_promo_view',
      params: Record<string, unknown> = {}
    ) => {
      if (pricingExposureKeysRef.current.has(key)) return;
      pricingExposureKeysRef.current.add(key);
      trackEvent(name, {
        cta_source: pricingSource,
        pricing_mode: pricingMode,
        pricing_intent: pricingIntent,
        recommended_plan_name: recommendedPlanName,
        ...params
      });
      recordPricingConversion({
        eventName: name,
        entityType: 'pricing_exposure',
        entityId: key,
        idempotencyKey: key,
        metadata: params
      });
    },
    [
      pricingIntent,
      pricingMode,
      pricingSource,
      recordPricingConversion,
      recommendedPlanName
    ]
  );

  useEffect(() => {
    const source = getPricingSourceFromSearch(window.location.search);
    const sourceIntent = getPricingIntentFromSource(source);
    const sourceRecommendedPlan = getRecommendedPlanName(source);
    const analyticsSessionId = getAnalyticsSessionId();
    const pricingViewKey = `${analyticsSessionId}:${location.pathname}:${source}`;
    trackPricingView(
      source,
      {
        pricing_mode: getInitialPricingMode(location.search),
        pricing_intent: sourceIntent,
        recommended_plan_name: sourceRecommendedPlan,
        authenticated: isAuthenticated
      },
      pricingViewKey
    );
    const accessToken = getAccessToken();
    if (!accessToken) return;

    void recordClientConversionEvent(accessToken, {
      eventName: 'pricing_view',
      entityType: 'pricing_page',
      entityId: 'pricing',
      ctaSource: source,
      idempotencyKey: `pricing_view:${pricingViewKey}`,
      metadata: {
        source,
        pricing_mode: getInitialPricingMode(location.search),
        pricing_intent: sourceIntent,
        recommended_plan_name: sourceRecommendedPlan,
        path: `${location.pathname}${location.search}${location.hash}`,
        referrer: document.referrer || undefined
      }
    });
  }, [
    getAccessToken,
    isAuthenticated,
    location.hash,
    location.pathname,
    location.search
  ]);

  useEffect(() => {
    let cancelled = false;
    const loadData = async () => {
      try {
        setLoading(true);
        if (isAuthenticated) {
          setCurrentPlanId(null);
          setSubscriptionStatus('loading');
        } else {
          setCurrentPlanId('free');
          setSubscriptionStatus('resolved');
        }
        const baseUrl = getApiBaseUrl();

        let cachedPlans: SubscriptionPlan[] | null = null;
        try {
          const cached = localStorage.getItem(PLANS_CACHE_KEY);
          if (cached) {
            const { plans: cachedData, timestamp } = JSON.parse(cached);
            cachedPlans = normalizeSubscriptionPlans(cachedData);
            // 缓存只在 TTL 内用于首帧直出；过期缓存仅作离线兜底。
            if (Date.now() - timestamp < PLANS_CACHE_TTL) {
              setPlans(cachedPlans);
              setLoading(false);
            }
          }
        } catch {
          // ignore cache parsing issues
        }

        // 在线始终拉取最新套餐，避免改价后旧缓存继续展示；失败时回退缓存。
        const plansPromise = (async () => {
          try {
            const response = await fetch(`${baseUrl}/api/membership/plans`);
            if (!response.ok) {
              throw new Error(`Membership plans failed (${response.status})`);
            }
            return (await response.json()) as { plans?: SubscriptionPlan[] };
          } catch (error) {
            if (cachedPlans) return { plans: cachedPlans };
            throw error;
          }
        })();

        let subscriptionPromise: Promise<SubscriptionStateResponse> =
          Promise.resolve({ plan: null });
        if (isAuthenticated) {
          const token = getAccessToken();
          if (!token) {
            throw new Error(
              'Authenticated membership lookup has no access token'
            );
          }
          subscriptionPromise = fetch(
            `${baseUrl}/api/membership/subscription`,
            {
              headers: { Authorization: `Bearer ${token}` }
            }
          ).then(async (response) => {
            if (!response.ok) {
              throw new Error(
                `Membership subscription failed (${response.status})`
              );
            }
            return response.json();
          });
        }

        const [plansData, subData] = await Promise.all([
          plansPromise,
          subscriptionPromise
        ]);
        if (cancelled) return;

        if (plansData.plans) {
          const normalizedPlans = normalizeSubscriptionPlans(plansData.plans);
          setPlans(normalizedPlans);
          try {
            localStorage.setItem(
              PLANS_CACHE_KEY,
              JSON.stringify({
                plans: normalizedPlans,
                timestamp: Date.now()
              })
            );
          } catch {
            // ignore cache write issues
          }
        }
        const planId =
          subData.plan?.id ||
          (subData.isFree === false ? subData.subscription?.planId : 'free');
        setCurrentPlanId(planId || 'free');
        setSubscriptionStatus('resolved');
      } catch (error) {
        if (cancelled) return;
        log.error('[PricingPage] Failed to load data:', error);
        if (isAuthenticated) {
          setCurrentPlanId(null);
          setSubscriptionStatus('error');
          setPaymentNotice(
            (current) =>
              current || {
                tone: 'error',
                message: t('membership.subscriptionStatusUnavailable', {
                  defaultValue: '暂时无法确认当前套餐，请稍后重试。'
                })
              }
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadData();

    const params = new URLSearchParams(window.location.search);
    if (params.get('payment') === 'success') {
      const checkoutType = params.get('checkoutType');
      const productId = params.get('productId');
      const orderId = params.get('orderId');
      const checkoutContext = readCheckoutContext({
        orderId,
        checkoutType,
        productId
      });
      const returnTo =
        params.get('returnTo') || checkoutContext?.returnTo || null;
      const safeReturnPath = getSafePostPurchaseReturnPath(returnTo);
      const checkoutSource =
        checkoutContext?.ctaSource || params.get('source') || 'stripe_return';
      setPaymentRetryAvailable(false);
      setPaymentNotice({
        tone: 'neutral',
        message: t('membership.paymentVerifying', {
          defaultValue: '正在确认支付结果…'
        })
      });
      void verifyCheckoutReturn({ orderId, checkoutType, productId })
        .then((order) => {
          if (order.status === 'failed') {
            setPaymentNotice({
              tone: 'error',
              message: t('membership.paymentFailed', {
                defaultValue: '支付未能完成，套餐未变更。'
              })
            });
            return;
          }
          if (order.status === 'expired') {
            setPaymentRetryAvailable(false);
            setPaymentNotice({
              tone: 'warning',
              message: t('membership.paymentExpired', {
                defaultValue: '支付会话已过期，套餐没有变更。请重新选择套餐并发起支付。'
              })
            });
            return;
          }
          if (order.status !== 'succeeded') {
            setPaymentRetryAvailable(true);
            setPaymentNotice({
              tone: 'warning',
              message: t('membership.paymentProcessing', {
                defaultValue: '支付仍在处理中，请稍后再次确认。'
              })
            });
            return;
          }
          const transactionId =
            orderId || checkoutContext?.orderId || 'stripe_return';
          if (reportedPurchaseReturnsRef.current.has(transactionId)) return;
          reportedPurchaseReturnsRef.current.add(transactionId);
          trackPurchase({
            transactionId,
            value:
              typeof checkoutContext?.amountCents === 'number'
                ? checkoutContext.amountCents / 100
                : undefined,
            currency: checkoutContext?.currency || 'USD',
            checkoutType:
              checkoutType === 'subscription' ||
              checkoutType === 'credit_package'
                ? checkoutType
                : checkoutContext?.checkoutType,
            productId: productId || checkoutContext?.productId,
            productName: checkoutContext?.productName,
            billingCycle: checkoutContext?.billingCycle,
            ctaSource: checkoutSource,
            pricingIntent: checkoutContext?.pricingIntent,
            recommendedPlanName: checkoutContext?.recommendedPlanName
          });
          trackEvent('purchase_success', {
            cta_source: checkoutSource,
            billing_context: 'membership',
            transaction_id: orderId,
            checkout_type: checkoutType,
            product_id: productId,
            pricing_intent: checkoutContext?.pricingIntent,
            recommended_plan_name: checkoutContext?.recommendedPlanName,
            value:
              typeof checkoutContext?.amountCents === 'number'
                ? checkoutContext.amountCents / 100
                : undefined,
            currency: checkoutContext?.currency || 'USD'
          });
          trackEvent('post_purchase_return', {
            cta_source: checkoutSource,
            billing_context: 'membership',
            transaction_id: orderId,
            checkout_type: checkoutType,
            product_id: productId,
            pricing_intent: checkoutContext?.pricingIntent,
            recommended_plan_name: checkoutContext?.recommendedPlanName,
            return_to: safeReturnPath,
            will_redirect: Boolean(safeReturnPath)
          });
          const accessToken = getAccessToken();
          if (accessToken) {
            void recordClientConversionEvent(accessToken, {
              eventName: 'post_purchase_return',
              orderId,
              entityType: 'payment_order',
              entityId: orderId,
              productType: checkoutType,
              productId,
              ctaSource: checkoutSource,
              metadata: {
                billing_context: 'membership',
                pricing_intent: checkoutContext?.pricingIntent,
                recommended_plan_name: checkoutContext?.recommendedPlanName,
                return_to: safeReturnPath,
                will_redirect: Boolean(safeReturnPath)
              }
            });
          }
          clearCheckoutContext();
          setPaymentNotice({
            tone: 'success',
            message: t('membership.paymentSuccess', {
              defaultValue: '支付成功，感谢支持。'
            })
          });
          if (safeReturnPath) {
            navigate(safeReturnPath, { replace: true });
          } else {
            window.history.replaceState({}, '', window.location.pathname);
          }
        })
        .catch(() => {
          setPaymentRetryAvailable(Boolean(orderId));
          setPaymentNotice({
            tone: 'error',
            message: t('membership.paymentVerificationFailed', {
              defaultValue: '暂时无法验证这笔支付，系统不会将其记录为成功。'
            })
          });
        });
    } else if (params.get('payment') === 'cancel') {
      const checkoutContext = readCheckoutContext({
        checkoutType: params.get('checkoutType'),
        productId: params.get('productId')
      });
      const checkoutSource =
        checkoutContext?.ctaSource || params.get('source') || 'stripe_return';
      trackEvent('checkout_cancel', {
        cta_source: checkoutSource,
        billing_context: 'membership',
        checkout_type: checkoutContext?.checkoutType,
        product_id: checkoutContext?.productId,
        pricing_intent: checkoutContext?.pricingIntent,
        recommended_plan_name: checkoutContext?.recommendedPlanName,
        value:
          typeof checkoutContext?.amountCents === 'number'
            ? checkoutContext.amountCents / 100
            : undefined,
        currency: checkoutContext?.currency || 'USD'
      });
      setPaymentNotice({
        tone: 'warning',
        message: t('membership.paymentCancel', {
          defaultValue: '支付已取消。'
        })
      });
      clearCheckoutContext();
      window.history.replaceState({}, '', window.location.pathname);
    }
    return () => {
      cancelled = true;
    };
  }, [getAccessToken, isAuthenticated, navigate, t]);

  const getLoginTarget = useCallback(
    (redirect: string) => {
      const referralCode = new URLSearchParams(location.search).get('ref');
      const referralQuery = referralCode
        ? `&ref=${encodeURIComponent(referralCode)}`
        : '';
      return `/login?redirect=${encodeURIComponent(redirect)}${referralQuery}`;
    },
    [location.search]
  );

  const handleFreePlanAction = () => {
    trackEvent('pricing_cta_click', {
      cta_source: pricingSource,
      pricing_mode: pricingMode,
      pricing_intent: pricingIntent,
      recommended_plan_name: recommendedPlanName,
      cta_kind: 'free_plan',
      checkout_type: 'free',
      product_id: 'free',
      authenticated: isAuthenticated
    });
    recordPricingConversion({
      eventName: 'pricing_cta_click',
      entityType: 'pricing_cta',
      entityId: 'free_plan',
      productType: 'free',
      productId: 'free',
      metadata: {
        cta_kind: 'free_plan',
        checkout_type: 'free',
        pricing_intent: pricingIntent,
        recommended_plan_name: recommendedPlanName,
        authenticated: isAuthenticated
      }
    });
    if (!isAuthenticated) {
      navigate(getLoginTarget('/create'));
      return;
    }

    onClose();
    navigate('/create');
  };

  const applyPromoCode = useCallback(() => {
    const normalized = promoCodeInput.trim().toUpperCase();
    if (!normalized) return;
    setAppliedPromoCode(normalized);
    try {
      localStorage.setItem(PROMO_CODE_STORAGE_KEY, normalized);
    } catch {
      // ignore storage errors
    }
    trackEvent('pricing_promo_apply', {
      promo_code: normalized,
      cta_source: pricingSource
    });
  }, [promoCodeInput, pricingSource]);

  const clearAppliedPromoCode = useCallback(() => {
    setAppliedPromoCode('');
    setPromoCodeInput('');
    try {
      localStorage.removeItem(PROMO_CODE_STORAGE_KEY);
    } catch {
      // ignore storage errors
    }
  }, []);

  const handlePurchase = useCallback(
    async (
      planId: string,
      options: {
        upgradeFromPackageId?: string;
        billingCycle?: 'monthly' | 'yearly';
        paymentProvider?: PricingPaymentMethod;
      } = {}
    ) => {
      if (isAuthenticated && subscriptionStatus !== 'resolved') {
        setPaymentNotice({
          tone: subscriptionStatus === 'error' ? 'error' : 'neutral',
          message:
            subscriptionStatus === 'error'
              ? t('membership.subscriptionStatusUnavailable', {
                  defaultValue: '暂时无法确认当前套餐，请稍后重试。'
                })
              : t('membership.subscriptionStatusLoading', {
                  defaultValue: '正在确认当前套餐，请稍候。'
                })
        });
        return;
      }
      const checkoutBillingCycle = options.billingCycle || billingCycle;
      const checkoutPaymentMethod =
        options.paymentProvider || effectivePaymentMethod;
      const selectedPlan = plans.find((plan) => plan.id === planId);
      if (
        selectedPlan?.checkoutProviders?.length &&
        !selectedPlan.checkoutProviders.includes(checkoutPaymentMethod)
      ) {
        setPaymentNotice({
          tone: 'error',
          message: t('membership.paymentMethodUnavailable', {
            defaultValue: '所选支付方式暂不可用，请选择其他方式。'
          })
        });
        return;
      }
      const checkoutPrice = selectedPlan
        ? getPlanCheckoutPrice(
            selectedPlan,
            checkoutBillingCycle,
            checkoutPaymentMethod
          )
        : null;
      const amountCents = checkoutPrice?.amountCents;
      const checkoutCurrency = checkoutPrice?.currency || 'USD';
      if (isAuthenticated && activeCheckoutRef.current) return;
      if (isAuthenticated) activeCheckoutRef.current = planId;
      trackEvent('pricing_cta_click', {
        cta_source: pricingSource,
        pricing_mode: pricingMode,
        pricing_intent: pricingIntent,
        recommended_plan_name: recommendedPlanName,
        cta_kind: options.upgradeFromPackageId
          ? 'trial_upgrade'
          : 'subscription_checkout',
        checkout_type: 'subscription',
        product_id: planId,
        product_name: selectedPlan?.name || planId,
        billing_cycle: checkoutBillingCycle,
        payment_provider: checkoutPaymentMethod,
        value: typeof amountCents === 'number' ? amountCents / 100 : undefined,
        currency: checkoutCurrency,
        authenticated: isAuthenticated
      });
      recordPricingConversion({
        eventName: 'pricing_cta_click',
        entityType: 'pricing_cta',
        entityId: planId,
        productType: 'subscription',
        productId: planId,
        metadata: {
          cta_kind: options.upgradeFromPackageId
            ? 'trial_upgrade'
            : 'subscription_checkout',
          checkout_type: 'subscription',
          product_name: selectedPlan?.name || planId,
          pricing_intent: pricingIntent,
          recommended_plan_name: recommendedPlanName,
          billing_cycle: checkoutBillingCycle,
          payment_provider: checkoutPaymentMethod,
          value:
            typeof amountCents === 'number' ? amountCents / 100 : undefined,
          currency: checkoutCurrency,
          authenticated: isAuthenticated,
          upgrade_from_package_id: options.upgradeFromPackageId
        }
      });
      const checkoutAttribution = getCheckoutAttribution({
        search: location.search,
        pathname: location.pathname,
        hash: location.hash,
        pricingSource
      });
      if (!isAuthenticated) {
        const returnPath = `${location.pathname}${location.search}`;
        savePendingCheckoutIntent({
          type: 'subscription',
          id: planId,
          billingCycle: checkoutBillingCycle,
          paymentProvider: checkoutPaymentMethod,
          returnPath
        });
        writeCheckoutContext({
          orderId: `pending:${planId}:${Date.now()}`,
          checkoutType: 'subscription',
          productId: planId,
          productName: selectedPlan?.name || planId,
          amountCents,
          currency: checkoutCurrency,
          billingCycle: checkoutBillingCycle,
          paymentProvider: checkoutPaymentMethod,
          ctaSource: pricingSource,
          pricingIntent,
          recommendedPlanName,
          returnTo: checkoutAttribution.returnTo,
          createdAt: Date.now()
        });
        navigate(getLoginTarget(returnPath));
        return;
      }

      try {
        setPurchasingId(planId);
        trackCheckoutStart({
          planId,
          billingCycle: checkoutBillingCycle,
          paymentProvider: checkoutPaymentMethod,
          checkoutType: 'subscription',
          value:
            typeof amountCents === 'number' ? amountCents / 100 : undefined,
          currency: checkoutCurrency,
          ctaSource: pricingSource,
          productName: selectedPlan?.name || planId,
          recommendedPlanName,
          pricingIntent,
          authenticated: isAuthenticated
        });
        const session = await createCheckoutSession({
          type: 'subscription',
          id: planId,
          billingCycle: checkoutBillingCycle,
          paymentProvider: checkoutPaymentMethod,
          promoCode:
            checkoutBillingCycle === 'yearly'
              ? appliedPromoCode || undefined
              : undefined,
          upgradeFromPackageId: options.upgradeFromPackageId,
          ...checkoutAttribution
        });

        if (session.url) {
          writeCheckoutContext({
            orderId: session.id,
            checkoutType: 'subscription',
            productId: planId,
            productName: selectedPlan?.name || planId,
            amountCents,
            currency: checkoutCurrency,
            billingCycle: checkoutBillingCycle,
            paymentProvider: checkoutPaymentMethod,
            ctaSource: pricingSource,
            pricingIntent,
            recommendedPlanName,
            returnTo: checkoutAttribution.returnTo,
            createdAt: Date.now()
          });
          redirectToCheckout(session);
        } else {
          throw new Error('Checkout URL not found');
        }
      } catch (error) {
        if (
          error instanceof Error &&
          error.name.startsWith('PROMO_CODE')
        ) {
          setAppliedPromoCode('');
          try {
            localStorage.removeItem(PROMO_CODE_STORAGE_KEY);
          } catch {
            // ignore storage errors
          }
        }
        if (
          error instanceof Error &&
          error.name === 'ACTIVE_SUBSCRIPTION_EXISTS'
        ) {
          try {
            const portal = await createBillingPortalSession({
              returnUrl: window.location.href
            });
            if (portal.url) {
              trackEvent('billing_portal_open', {
                cta_source: pricingSource,
                billing_context: 'membership',
                requested_plan_id: planId
              });
              window.location.href = portal.url;
              return;
            }
          } catch (portalError) {
            log.error('[PricingPage] Billing portal failed:', portalError);
          }
        }
        log.error('[PricingPage] Purchase failed:', error);
        trackEvent('checkout_session_create_failed', {
          cta_source: pricingSource,
          billing_context: 'membership',
          checkout_type: 'subscription',
          product_id: planId,
          billing_cycle: checkoutBillingCycle,
          payment_provider: checkoutPaymentMethod,
          pricing_intent: pricingIntent,
          recommended_plan_name: recommendedPlanName,
          error_code: error instanceof Error ? error.name : 'CHECKOUT_ERROR'
        });
        recordPricingConversion({
          eventName: 'checkout_session_create_failed',
          entityType: 'pricing_cta',
          entityId: planId,
          productType: 'subscription',
          productId: planId,
          metadata: {
            billing_context: 'membership',
            checkout_type: 'subscription',
            billing_cycle: checkoutBillingCycle,
            payment_provider: checkoutPaymentMethod,
            pricing_intent: pricingIntent,
            recommended_plan_name: recommendedPlanName,
            error_code: error instanceof Error ? error.name : 'CHECKOUT_ERROR'
          }
        });
        setPaymentNotice({
          tone: 'error',
          message:
            error instanceof Error &&
            error.name.startsWith('PROMO_CODE')
              ? error.message
              : t('membership.purchaseFailed', {
                  defaultValue: '结账服务暂时不可用，请稍后重试。'
                })
        });
      } finally {
        activeCheckoutRef.current = null;
        setPurchasingId(null);
      }
    },
    [
      billingCycle,
      getLoginTarget,
      isAuthenticated,
      location.hash,
      location.pathname,
      location.search,
      navigate,
      effectivePaymentMethod,
      plans,
      pricingIntent,
      pricingMode,
      pricingSource,
      appliedPromoCode,
      recordPricingConversion,
      recommendedPlanName,
      subscriptionStatus,
      t
    ]
  );

  useEffect(() => {
    if (
      resumedCheckoutRef.current ||
      !isAuthenticated ||
      loading ||
      subscriptionStatus !== 'resolved' ||
      new URLSearchParams(location.search).has('payment')
    )
      return;
    resumedCheckoutRef.current = true;
    const intent = consumePendingCheckoutIntent(
      `${location.pathname}${location.search}`
    );
    if (!intent || intent.type !== 'subscription') return;
    const selectedPlan = plans.find(
      (plan) =>
        plan.id === intent.id && plan.isActive && plan.checkoutEnabled !== false
    );
    if (!selectedPlan) return;
    void handlePurchase(selectedPlan.id, {
      billingCycle: intent.billingCycle || 'monthly',
      paymentProvider: intent.paymentProvider
    });
  }, [
    handlePurchase,
    isAuthenticated,
    loading,
    location.pathname,
    location.search,
    plans,
    subscriptionStatus
  ]);

  const formatPrice = (price: number) => {
    if (price === 0) return '0';
    const dollars = price / 100;
    return dollars.toLocaleString('en-US', {
      minimumFractionDigits: Number.isInteger(dollars) ? 0 : 2,
      maximumFractionDigits: 2
    });
  };
  const creditUsageExamples = getCreditUsageExamples();
  const subscriptionPlans = (
    plans.length > 0 ? plans : CLIENT_FALLBACK_SUBSCRIPTION_PLANS
  )
    .filter((plan) => plan.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const yearlyDiscountPercent =
    getDisplayedYearlyDiscountPercent(subscriptionPlans);
  const currentPlan = subscriptionPlans.find((plan) =>
    isSubscriptionPlanCurrent(plan, currentPlanId)
  );
  const localePrefix = location.pathname.startsWith('/en-US')
    ? '/en-US'
    : location.pathname.startsWith('/zh-CN')
      ? '/zh-CN'
      : '';
  const rechargeHref = `${localePrefix}/recharge?source=pricing_extra_credit_anchor&returnTo=${encodeURIComponent(
    collapsePaywallReturnTo(
      location.pathname,
      location.search,
      location.hash,
      `${localePrefix}/create`
    )
  )}`;

  const handleLanguageSwitch = async () => {
    const nextLanguage: SupportedLanguage =
      language === 'zh-CN' ? 'en-US' : 'zh-CN';
    await changeLanguage(nextLanguage);
    navigate(
      `${getLocalizedPricingPath(location.pathname, nextLanguage)}${location.search}${location.hash}`,
      { replace: true }
    );
  };

  useEffect(() => {
    if (loading) return;
    subscriptionPlans.forEach((plan, index) => {
      const amountCents =
        billingCycle === 'yearly' ? plan.priceYearly : plan.priceMonthly;
      trackPricingExposure(
        `item:subscription:${pricingSource}:${pricingMode}:${plan.id}`,
        'pricing_item_view',
        {
          item_type: 'subscription',
          product_id: plan.id,
          product_name: plan.name,
          position: index + 1,
          billing_cycle: billingCycle,
          value: amountCents / 100,
          currency: 'USD',
          credits: plan.monthlyCredits,
          is_popular: plan.name === 'pro',
          is_recommended: plan.name === recommendedPlanName,
          is_current: isSubscriptionPlanCurrent(plan, currentPlanId)
        }
      );
    });
  }, [
    billingCycle,
    currentPlanId,
    loading,
    pricingMode,
    pricingSource,
    recommendedPlanName,
    subscriptionPlans,
    trackPricingExposure
  ]);

  useEffect(() => {
    if (loading) return;
    trackPricingExposure(
      `credit-explainer:${pricingSource}:${pricingMode}`,
      'pricing_item_view',
      {
        item_type: 'credit_explainer',
        base_credit_cost: IMAGE_GENERATION_BASE_CREDIT_COST,
        large_2k_credit_cost: IMAGE_GENERATION_LARGE_2K_CREDIT_COST,
        four_k_credit_cost: IMAGE_GENERATION_4K_CREDIT_COST
      }
    );
  }, [loading, pricingMode, pricingSource, trackPricingExposure]);

  const getPlanFeatures = (plan: SubscriptionPlan) => {
    if (plan.id === 'free') {
      return [
        t('membership.feature_freeVisualWorkbench', {
          defaultValue: '灵感案例浏览与基础提示词工作台'
        }),
        t('membership.feature_freeVideoGeneration', {
          defaultValue: `视频按模型、时长和分辨率透明计费，Mini 5 秒 480P 为 ${VIDEO_PLAN_MARKETING_COSTS.mini5s480p} 积分`
        }),
        t('membership.feature_freeDailyCredits', {
          defaultValue: '图像与视频统一使用套餐积分，失败任务自动退回'
        }),
        t('membership.feature_freeBasicCases', {
          defaultValue: '公开 Prompt 案例一键带回创作台'
        }),
        t('membership.feature_freeLibrary', {
          defaultValue: '会话记录与个人图库沉淀'
        }),
        t('membership.feature_basicImageGeneration', {
          defaultValue: '系统失败自动退回积分'
        })
      ];
    }

    if (plan.id === 'pro') {
      return [
        t('membership.feature_proVisualWorkbench', {
          defaultValue: '免费版全部权益'
        }),
        t('membership.feature_proVideoGeneration', {
          defaultValue: `积分全部用于无参考视频时，每月约 ${getVideoGenerationCapacity(10_000, VIDEO_PLAN_MARKETING_COSTS.mini5s480p)} 条 Mini 5 秒 480P，或 ${getVideoGenerationCapacity(10_000, VIDEO_PLAN_MARKETING_COSTS.fast5s720p)} 条 Fast 5 秒 720P`
        }),
        t('membership.feature_proPromptCases', {
          defaultValue: '完整 Prompt 案例与可视化配方'
        }),
        t('membership.feature_proReferenceLibrary', {
          defaultValue: '情绪板风格引导与多参考图创作'
        }),
        t('membership.feature_proPrivateReuse', {
          defaultValue: '参考图 AI 解析、收藏与图库复用'
        }),
        t('membership.feature_proSessions', {
          defaultValue: '私密创作与 Session 会话工作流'
        }),
        t('membership.feature_extraCreditDiscount', {
          defaultValue: '购买额外积分享折扣'
        })
      ];
    }

    return [
      t('membership.feature_maxAdvancedWorkflows', {
        defaultValue: '专业版全部权益'
      }),
      t('membership.feature_maxVideoGeneration', {
        defaultValue: `积分全部用于无参考视频时，每月约 ${getVideoGenerationCapacity(60_000, VIDEO_PLAN_MARKETING_COSTS.mini5s480p)} 条 Mini 5 秒 480P，或 ${getVideoGenerationCapacity(60_000, VIDEO_PLAN_MARKETING_COSTS.fast5s720p)} 条 Fast 5 秒 720P`
      }),
      t('membership.feature_maxBatchRegen', {
        defaultValue: '更大积分池，适合长期项目与多轮探索'
      }),
      t('membership.feature_maxCustomInstructions', {
        defaultValue: '批量实验、一键重试与高频迭代'
      }),
      t('membership.feature_maxPrivateCases', {
        defaultValue: '角色、情绪板与图库资产持续复用'
      }),
      t('membership.feature_maxCreationPace', {
        defaultValue: '更充裕的高频创作空间'
      }),
      t('membership.feature_extraCreditBestDiscount', {
        defaultValue: '额外积分享更高折扣'
      })
    ];
  };
  const pricingFaqs = [
    {
      question: t('membership.faqCreditsQuestion', {
        defaultValue: '积分系统是如何运作的？'
      }),
      answer: t('membership.faqCreditsAnswer', {
        defaultValue:
          '积分用于图像与视频生成、图片编辑和提示词提取。实际消耗根据生成参数计算，失败任务自动退回。'
      })
    },
    {
      question: t('membership.faqSubscriptionPaygQuestion', {
        defaultValue: '订阅和单次充值有什么区别？'
      }),
      answer: t('membership.faqSubscriptionPaygAnswer', {
        defaultValue:
          '订阅适合持续创作，包含每月积分、会员案例、私密生成和更好的工作流权益；单次充值更适合偶尔集中创作。'
      })
    },
    {
      question: t('membership.faqFailedChargeQuestion', {
        defaultValue: '失败生成会扣积分吗？'
      }),
      answer: t('membership.faqFailedChargeAnswer', {
        defaultValue:
          '不会。因系统或模型错误导致失败时，积分不会扣除，已扣除的会自动返还。'
      })
    },
    {
      question: t('membership.faqCancelQuestion', {
        defaultValue: '可以随时取消吗？'
      }),
      answer: t('membership.faqCancelAnswer', {
        defaultValue:
          '可以。你可以在账单门户管理订阅，已购买周期内的会员权益会保留到周期结束。'
      })
    }
  ];

  const pricingHeroCopy =
    pricingIntent === 'prompt_workflow'
      ? {
          title: t('membership.promptUnlockPricingTitle', {
            defaultValue: '升级 Pro，持续复用 Prompt 工作流'
          }),
          subtitle: t('membership.promptUnlockPricingSubTitle', {
            defaultValue:
              '会员可以解锁完整案例库，把单个 Prompt 变成可持续复用的图像生成流程。'
          })
        }
      : pricingIntent === 'generation_continuity'
        ? {
            title: t('membership.creditPricingTitle', {
              defaultValue: '升级 Pro，持续生成不中断'
            }),
            subtitle: t('membership.creditPricingSubTitle', {
              defaultValue:
                '稳定月度额度比临时补积分更适合持续创作；积分包只作为项目高峰时的补充。'
            })
          }
        : {
            title: t('membership.pricingTitle', {
              defaultValue: '选择您的套餐'
            }),
            subtitle: t('membership.pricingSubTitle', {
              defaultValue:
                '为经常交付视觉内容的创作者解锁更高额度、会员案例和私密生成能力。'
            })
          };

  const comparisonRows = getPlanComparisonRows(
    billingCycle,
    t as PricingTranslator,
    effectivePaymentMethod
  );

  const planTagline: Record<SubscriptionPlan['name'], string> = {
    free: t('membership.planFreeTagline', {
      defaultValue: '适合轻量体验图像创作。'
    }),
    pro: t('membership.planProTagline', {
      defaultValue: '适合稳定图像交付与持续短视频创作的个人创作者。'
    }),
    max: t('membership.planMaxTagline', {
      defaultValue: '适合高频视频、多版本测试和长期商业项目。'
    })
  };
  const planCreditCopy: Record<
    SubscriptionPlan['name'],
    { badge: string; description: string }
  > = {
    free: {
      badge: t('membership.planCreditBadgeFree', {
        defaultValue: '每日刷新'
      }),
      description: t('membership.planCreditDescriptionFree', {
        defaultValue: '用于体验从灵感案例到首次生成的基础创作闭环。'
      })
    },
    pro: {
      badge: t('membership.planCreditBadgePro', {
        defaultValue: '完整工作流'
      }),
      description: t('membership.planCreditDescriptionPro', {
        defaultValue: `每月 10,000 积分 ≈ ${getCreditPackageImageCapacity(10_000)} 张基础商业图；旗舰 Seedance 2.5 约 ${getVideoGenerationCapacity(10_000, VIDEO_PLAN_MARKETING_COSTS.seedance25_5s720p)} 条 5 秒 720P 视频。`
      })
    },
    max: {
      badge: t('membership.planCreditBadgeMax', {
        defaultValue: '高频创作'
      }),
      description: t('membership.planCreditDescriptionMax', {
        defaultValue: `每月 60,000 积分 ≈ ${getCreditPackageImageCapacity(60_000)} 张基础商业图；旗舰 Seedance 2.5 约 ${getVideoGenerationCapacity(60_000, VIDEO_PLAN_MARKETING_COSTS.seedance25_5s720p)} 条 5 秒 720P 视频。`
      })
    }
  };

  const handleBillingModeChange = (nextMode: PricingBillingMode) => {
    if (pricingMode === nextMode) return;
    trackEvent('pricing_mode_change', {
      from_mode: pricingMode,
      to_mode: nextMode,
      cta_source: pricingSource
    });
    setPricingMode(nextMode);
  };

  return (
    <div
      className={`pricing-product-os bg-[#080808] text-slate-50 ${
        embedded
          ? 'pricing-product-os-embedded relative min-h-full min-w-0 overflow-x-hidden'
          : 'fixed inset-0 z-[100] overflow-y-auto'
      }`}
      data-embedded={embedded ? 'true' : 'false'}
    >
      {!embedded && (
        <nav className="pricing-navigation sticky top-0 z-20 border-b border-white/10 bg-[#080808]/88 px-4 py-3 backdrop-blur-md md:px-8">
          <div className="pricing-navigation-inner mx-auto flex max-w-7xl items-center justify-between gap-4">
            <Link
              to={`${localePrefix}/create`}
              className="pricing-brand flex items-center gap-3 rounded-full pr-2 text-white transition hover:text-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/70"
              aria-label="WebToMind"
            >
              <Logo size={32} className="h-8 w-8" />
              <span className="text-base font-black tracking-normal text-white">
                WebToMind
              </span>
            </Link>
            <div className="pricing-navigation-actions flex items-center gap-2">
              <button
                type="button"
                onClick={handleLanguageSwitch}
                className="pricing-nav-button inline-flex h-11 min-w-11 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 text-xs font-black text-slate-300 transition hover:bg-white/10 hover:text-white"
                aria-label={t('language.switch', {
                  defaultValue: 'Switch language'
                })}
              >
                <Languages className="h-4 w-4" />
                {language === 'zh-CN' ? 'EN' : '中'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="pricing-nav-button inline-grid h-11 w-11 place-items-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10 hover:text-white"
                aria-label="Close pricing"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </nav>
      )}
      <main className="pricing-grid-wrap pricing-krea-main w-full pb-16 pt-10 md:pb-24 md:pt-16">
        {paymentNotice && (
          <div
            className={`pricing-payment-notice ${paymentNotice.tone}`}
            role="status"
            aria-live="polite"
          >
            <span>{paymentNotice.message}</span>
            {paymentRetryAvailable && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.location.reload()}
              >
                <RefreshCw className="h-4 w-4" />
                {t('membership.paymentCheckAgain', {
                  defaultValue: '再次确认'
                })}
              </Button>
            )}
          </div>
        )}
        <section className="pricing-krea-hero">
          <div className="pricing-krea-hero-copy">
            <span className="pricing-krea-kicker">
              {t('membership.creatorPlansKicker', {
                defaultValue: 'WEBTOMIND CREATOR PLANS'
              })}
            </span>
            <h1 className="pricing-krea-title text-4xl font-black tracking-normal text-white md:text-6xl">
              {pricingHeroCopy.title}
            </h1>
            <p className="pricing-krea-subtitle mt-4 max-w-2xl text-base leading-7 text-slate-400 md:text-lg">
              {pricingHeroCopy.subtitle}
            </p>
          </div>
        </section>

        <div className="pricing-cycle-toolbar">
          <PricingBillingSwitch
            mode={billingCycle}
            monthlyLabel={t('membership.monthly', { defaultValue: '月付' })}
            yearlyLabel={t('membership.yearly', { defaultValue: '年付' })}
            savingsLabel={t('membership.yearlySaveBadge', {
              defaultValue:
                language === 'zh-CN' ? '省 {{percent}}%' : 'Save {{percent}}%',
              percent: yearlyDiscountPercent
            })}
            ariaLabel={t('membership.billingCycleToggle', {
              defaultValue: '切换月付或年付'
            })}
            onChange={handleBillingModeChange}
          />
          <PricingPaymentMethodSwitch
            method={effectivePaymentMethod}
            availableMethods={availablePaymentMethods}
            cardLabel={t('membership.cardPayment', {
              defaultValue: '银行卡'
            })}
            alipayLabel={t('membership.alipayPayment', {
              defaultValue: '支付宝'
            })}
            ariaLabel={t('membership.paymentMethod', {
              defaultValue: '支付方式'
            })}
            onChange={(method) => {
              setPaymentMethod(method);
              trackEvent('pricing_payment_method_select', {
                payment_provider: method,
                cta_source: pricingSource
              });
            }}
          />
        </div>

        {billingCycle === 'yearly' && (
            <div className="pricing-promo-box mx-auto mt-6 flex max-w-3xl flex-col gap-3 rounded-[18px] border border-rose-400/20 bg-rose-400/[0.06] p-4 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-black text-rose-100">
                  {t('membership.phPromoTitle', {
                    defaultValue: 'Product Hunt 发布优惠：年付 5 折'
                  })}
                </p>
                <p className="mt-0.5 text-xs leading-5 text-slate-400">
                  {t('membership.phPromoDescPrefix', {
                    defaultValue: '年付套餐输入优惠码'
                  })}
                  <strong className="font-black text-rose-300">
                    {t('membership.phPromoCode', {
                      defaultValue: 'WEBTOMIND50'
                    })}
                  </strong>
                  {t('membership.phPromoDescSuffix', {
                    defaultValue: '，首年立减 50%，结账时自动抵扣。'
                  })}
                </p>
                <p className="mt-1 text-xs font-bold text-rose-200">
                  {t('membership.phPromoEnds', {
                    date: PH_PROMO_END_DATE,
                    defaultValue: `活动截止：${PH_PROMO_END_DATE}`
                  })}
                </p>
              </div>
              {appliedPromoCode ? (
                <span className="inline-flex shrink-0 items-center gap-2 rounded-full bg-rose-500/20 px-3 py-1.5 text-xs font-black text-rose-100 ring-1 ring-rose-300/20">
                  {appliedPromoCode} · 5 折
                  <button
                    type="button"
                    onClick={clearAppliedPromoCode}
                    className="text-rose-200 transition hover:text-white"
                    aria-label={t('membership.phPromoRemove', {
                      defaultValue: '移除优惠码'
                    })}
                  >
                    ×
                  </button>
                </span>
              ) : (
                <div className="flex shrink-0 items-center gap-2">
                  <input
                    type="text"
                    value={promoCodeInput}
                    onChange={(event) =>
                      setPromoCodeInput(event.target.value.toUpperCase())
                    }
                    placeholder="WEBTOMIND50"
                    className="min-h-[44px] w-44 rounded-xl border border-white/10 bg-white/[0.06] px-3 text-sm font-bold text-white outline-none transition placeholder:text-slate-500 focus:border-rose-300/40"
                    aria-label={t('membership.phPromoInput', {
                      defaultValue: '优惠码'
                    })}
                  />
                  <button
                    type="button"
                    onClick={applyPromoCode}
                    className="pricing-primary-action inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-xl bg-rose-500 px-4 text-sm font-black text-white transition hover:bg-rose-400"
                  >
                    {t('membership.phPromoApply', {
                      defaultValue: '应用'
                    })}
                  </button>
                </div>
              )}
            </div>
          )}

        <section
          id="creator-plans"
          className="pricing-plan-grid pricing-krea-plan-grid mt-10"
          aria-label={t('membership.planComparison', {
            defaultValue: '套餐对比'
          })}
        >
          {loading && subscriptionPlans.length === 0 ? (
            [1, 2, 3].map((item) => (
              <div
                key={item}
                className="h-[520px] animate-pulse rounded-[22px] border border-white/10 bg-white/[0.04]"
              />
            ))
          ) : subscriptionPlans.length > 0 ? (
            subscriptionPlans.map((plan) => {
              const isFreePlan = plan.name === 'free' || plan.priceMonthly <= 0;
              const isPopular = plan.name === 'pro';
              const isBestValue =
                plan.id ===
                getBestValuePaidPlanId(subscriptionPlans, billingCycle);
              const isCurrent = isSubscriptionPlanCurrent(plan, currentPlanId);
              const isCoveredByCurrent =
                !!currentPlan &&
                !isCurrent &&
                currentPlan.sortOrder > plan.sortOrder;
              const isCheckoutUnavailable =
                !isFreePlan && plan.checkoutEnabled === false;
              const isSubscriptionUnresolved =
                !isFreePlan &&
                isAuthenticated &&
                subscriptionStatus !== 'resolved';
              const translatedPlanName = t(`membership.plan_${plan.name}`, {
                defaultValue:
                  plan.name.charAt(0).toUpperCase() + plan.name.slice(1)
              });
              const checkoutPrice = getPlanCheckoutPrice(
                plan,
                billingCycle,
                effectivePaymentMethod
              );
              const amountCents = checkoutPrice.amountCents;
              const monthlyListPrice =
                effectivePaymentMethod === 'alipay' &&
                plan.checkoutPrices?.alipay
                  ? plan.checkoutPrices.alipay.priceMonthly
                  : plan.priceMonthly;
              const monthlyDisplayPrice =
                billingCycle === 'yearly'
                  ? Math.round(amountCents / 12)
                  : amountCents;
              const promoOriginalPrice =
                billingCycle === 'yearly'
                  ? Math.max(monthlyListPrice, monthlyDisplayPrice)
                  : monthlyDisplayPrice;
              const promoSavings = getPromoSavings(
                promoOriginalPrice,
                monthlyDisplayPrice
              );
              const phDiscountApplied = phPromoActive && !isFreePlan;
              // 年付 5 折基准 = 月付原价 × 12（年付原价），
              // 不允许在折后年付价上继续打折。
              const phPromoBaseAmountCents = phDiscountApplied
                ? Math.round(monthlyListPrice * 12)
                : amountCents;
              const phDiscountedAmountCents = phDiscountApplied
                ? Math.round(phPromoBaseAmountCents * 0.5)
                : amountCents;
              const phMonthlyDisplayPrice = phDiscountApplied
                ? Math.round(phDiscountedAmountCents / 12)
                : monthlyDisplayPrice;
              const displaySavings = phDiscountApplied
                ? getPromoSavings(monthlyListPrice, phMonthlyDisplayPrice)
                : promoSavings;
              const planFeatures = getPlanFeatures(plan).slice(0, 6);
              const creditCopy = planCreditCopy[plan.name];
              const badge = isCurrent
                ? t('membership.currentPlan', { defaultValue: '当前方案' })
                : isPopular
                  ? t('membership.popular', { defaultValue: '最热门' })
                  : isBestValue
                    ? t('membership.bestValue', {
                        defaultValue: '最高性价比'
                      })
                    : null;

              return (
                <article
                  key={plan.id}
                  data-plan={plan.name}
                  data-popular={isPopular ? 'true' : 'false'}
                  data-current={isCurrent ? 'true' : 'false'}
                  className="pricing-krea-plan-card relative flex min-h-[590px] flex-col rounded-[22px] bg-[#171719] p-5 md:p-6"
                >
                  {badge ? (
                    <div
                      className="pricing-krea-plan-badge absolute top-0 text-[11px] font-black tracking-normal text-white"
                      data-tone={
                        isCurrent
                          ? 'current'
                          : isPopular
                            ? 'popular'
                            : 'best-value'
                      }
                    >
                      {isCurrent ? (
                        <span
                          className="pricing-krea-current-dot"
                          aria-hidden="true"
                        />
                      ) : (
                        <Flame aria-hidden="true" />
                      )}
                      {badge}
                    </div>
                  ) : null}

                  <div className="pricing-plan-intro">
                    <h2 className="pricing-plan-name text-2xl font-black tracking-normal text-white">
                      {translatedPlanName}
                    </h2>
                    <p className="pricing-plan-tagline mt-2 min-h-[48px] text-sm leading-6 text-slate-400">
                      {planTagline[plan.name]}
                    </p>
                  </div>

                  <div className="pricing-plan-price-block mt-7">
                    <div className="pricing-plan-price-row flex items-end gap-2">
                      <span className="pricing-plan-currency text-2xl font-black text-white">
                        {checkoutPrice.symbol}
                      </span>
                      <span className="pricing-plan-price text-5xl font-black tracking-normal text-white">
                        {formatPrice(phMonthlyDisplayPrice)}
                      </span>
                      {!isFreePlan &&
                      (phDiscountApplied
                        ? monthlyListPrice > phMonthlyDisplayPrice
                        : promoOriginalPrice > monthlyDisplayPrice) ? (
                        <span className="pricing-plan-list-price pb-2 text-sm font-bold text-slate-500 line-through">
                          {checkoutPrice.symbol}
                          {formatPrice(
                            phDiscountApplied
                              ? monthlyListPrice
                              : promoOriginalPrice
                          )}
                        </span>
                      ) : null}
                      <span className="pricing-plan-period pb-2 text-sm font-bold text-slate-400">
                        /{t('membership.mo', { defaultValue: '月' })}
                      </span>
                    </div>
                    {billingCycle === 'yearly' && !isFreePlan ? (
                      <p className="pricing-plan-annual-price mt-2 text-sm font-bold text-amber-300">
                        {t('membership.annualBillingLine', {
                          amount: formatPrice(
                            phDiscountApplied
                              ? phDiscountedAmountCents
                              : amountCents
                          ),
                          currencySymbol: checkoutPrice.symbol,
                          defaultValue: `每年支付 ${checkoutPrice.symbol}${formatPrice(
                            phDiscountApplied
                              ? phDiscountedAmountCents
                              : amountCents
                          )}`
                        })}
                        {phDiscountApplied ? (
                          <span className="ml-1 rounded-full bg-rose-500/20 px-2 py-0.5 text-[10px] font-black text-rose-200 ring-1 ring-rose-300/20">
                            WEBTOMIND50 · 5 折
                          </span>
                        ) : null}
                      </p>
                    ) : null}
                    {!isFreePlan && displaySavings > 0 ? (
                      <p className="pricing-plan-savings mt-2 text-sm font-bold text-rose-200">
                        {phDiscountApplied
                          ? t('membership.promoSaveMonthly', {
                              amount: formatPrice(displaySavings),
                              currencySymbol: checkoutPrice.symbol,
                              defaultValue: `立省 ${checkoutPrice.symbol}${formatPrice(displaySavings)}/月`
                            })
                          : billingCycle === 'yearly'
                          ? t('membership.yearlySaveMonthly', {
                              amount: formatPrice(displaySavings),
                              currencySymbol: checkoutPrice.symbol,
                              defaultValue: `年付月均省 ${checkoutPrice.symbol}${formatPrice(displaySavings)}/月`
                            })
                          : t('membership.promoSaveMonthly', {
                              amount: formatPrice(displaySavings),
                              currencySymbol: checkoutPrice.symbol,
                              defaultValue: `立省 ${checkoutPrice.symbol}${formatPrice(displaySavings)}/月`
                            })}
                      </p>
                    ) : null}
                  </div>

                  <PricingPlanCreditSummary
                    credits={plan.monthlyCredits.toLocaleString()}
                    unit={
                      plan.name === 'free'
                        ? t('membership.creditsDailyUnit', {
                            defaultValue: '积分/天'
                          })
                        : t('membership.creditsMonthlyUnit', {
                            defaultValue: '积分/月'
                          })
                    }
                    badge={creditCopy.badge}
                    description={creditCopy.description}
                    tone={plan.name}
                  />

                  <div className="pricing-plan-action mt-6">
                    {isCurrent || isCoveredByCurrent ? (
                      <button
                        type="button"
                        disabled
                        className="flex min-h-[44px] w-full cursor-default items-center justify-center rounded-xl bg-white/12 px-4 text-sm font-black text-slate-400"
                      >
                        {isCurrent
                          ? t('membership.alreadyCurrentPlan', {
                              defaultValue: '已处于当前套餐'
                            })
                          : t('membership.includedInCurrentPlan', {
                              defaultValue: '已包含在当前套餐中'
                            })}
                      </button>
                    ) : isFreePlan ? (
                      <button
                        type="button"
                        onClick={handleFreePlanAction}
                        className="pricing-primary-action flex min-h-[44px] w-full items-center justify-center rounded-xl bg-rose-500 px-4 text-sm font-black text-white transition hover:bg-rose-400"
                      >
                        {t('membership.tryVisualStudioFree', {
                          defaultValue: '免费开始创作'
                        })}
                      </button>
                    ) : isSubscriptionUnresolved ? (
                      <button
                        type="button"
                        disabled
                        className="flex min-h-[44px] w-full cursor-not-allowed items-center justify-center rounded-xl bg-white/10 px-4 text-sm font-black text-slate-400"
                      >
                        {subscriptionStatus === 'error'
                          ? t('membership.subscriptionStatusUnavailableShort', {
                              defaultValue: '套餐状态暂不可用'
                            })
                          : t('membership.subscriptionStatusLoading', {
                              defaultValue: '正在确认当前套餐…'
                            })}
                      </button>
                    ) : isCheckoutUnavailable ? (
                      <button
                        type="button"
                        disabled
                        className="flex min-h-[44px] w-full cursor-not-allowed items-center justify-center rounded-xl bg-white/10 px-4 text-sm font-black text-slate-400"
                      >
                        {t('membership.temporarilyUnavailable', {
                          defaultValue: '暂不可用'
                        })}
                      </button>
                    ) : (
                      <Button
                        type="button"
                        disabled={!!purchasingId}
                        isLoading={purchasingId === plan.id}
                        onClick={() => handlePurchase(plan.id)}
                        className="pricing-plan-cta pricing-primary-action w-full rounded-xl px-4 text-sm font-black disabled:cursor-wait"
                        variant="primary"
                        size="md"
                      >
                        {purchasingId === plan.id
                          ? t('membership.loading', {
                              defaultValue: '处理中...'
                            })
                          : t('membership.choosePlanNamed', {
                              name: translatedPlanName,
                              defaultValue: `选择 ${translatedPlanName}`
                            })}
                      </Button>
                    )}
                  </div>

                  <ul className="pricing-krea-feature-list mt-6 space-y-3">
                    {planFeatures.map((feature) => (
                      <li
                        key={feature}
                        className="pricing-plan-feature flex items-start gap-3 text-sm leading-6 text-slate-300"
                      >
                        <Check className="mt-1 h-4 w-4 shrink-0 text-emerald-300" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </article>
              );
            })
          ) : (
            <div className="col-span-full rounded-[22px] border border-white/10 bg-white/[0.04] p-8 text-center text-sm font-semibold text-slate-400">
              {t('membership.subscriptionPlansUnavailable', {
                defaultValue: '套餐暂时不可用，请稍后再试。'
              })}
            </div>
          )}
        </section>

        <section
          id="credit-usage"
          className="pricing-credit-section pricing-surface-section mt-10 rounded-[22px] border border-white/10 bg-white/[0.035] p-5 md:p-6"
        >
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-xl font-black tracking-normal text-white md:text-2xl">
                {t('membership.creditUsageTitle', {
                  defaultValue: '积分如何消耗'
                })}
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
                {t('membership.creditUsageDesc', {
                  defaultValue:
                    '套餐额度按真实生成参数扣费。基础图估算只用于快速理解，实际消耗会记录在生成结果中。'
                })}
              </p>
            </div>
            <span className="w-fit rounded-full bg-emerald-400/10 px-3 py-1.5 text-xs font-black text-emerald-200 ring-1 ring-emerald-300/15">
              {t('membership.failedGenerationRefund', {
                defaultValue: '失败不扣费'
              })}
            </span>
          </div>
          <div className="pricing-usage-grid mt-5">
            {creditUsageExamples.map((item) => (
              <div
                key={item.id}
                className="pricing-usage-card rounded-2xl border border-white/8 bg-white/[0.035] p-4"
              >
                <div className="text-sm font-black text-white">
                  {t(item.titleKey, { defaultValue: item.title })}
                </div>
                <div className="mt-3 text-2xl font-black text-rose-200">
                  {item.id === 'reference' ? '+' : ''}
                  {item.credits}{' '}
                  <span className="text-xs font-bold text-slate-500">
                    {t('membership.creditsUnit', { defaultValue: '积分' })}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-400">
                  {t(item.detailKey, {
                    defaultValue: item.detail,
                    baseCredits: IMAGE_GENERATION_BASE_CREDIT_COST,
                    large2kCredits: IMAGE_GENERATION_LARGE_2K_CREDIT_COST,
                    fourKCredits: IMAGE_GENERATION_4K_CREDIT_COST,
                    highQualityFloor:
                      IMAGE_GENERATION_HIGH_QUALITY_CREDIT_FLOOR,
                    referenceSurcharge:
                      IMAGE_GENERATION_REFERENCE_IMAGE_SURCHARGE,
                    characterSurcharge:
                      IMAGE_GENERATION_CHARACTER_MODE_SURCHARGE
                  })}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="pricing-extra-credit-card mx-auto mt-10 flex max-w-2xl flex-col items-center gap-3 rounded-[22px] border border-white/10 bg-white/[0.035] p-5 text-center md:flex-row md:justify-between md:text-left">
          <p className="text-sm leading-6 text-slate-400">
            <strong className="block text-base text-slate-200">
              {t('membership.needExtraCredits', {
                defaultValue: '项目高峰需要额外积分？'
              })}
            </strong>
            {t('membership.extraCreditsShortDesc', {
              defaultValue:
                '一次性补充只适合临时补量和价格参考，不替代 Pro 会员的月度额度、案例库和工作流权益。'
            })}
          </p>
          <Link
            to={rechargeHref}
            onClick={() =>
              trackEvent('recharge_cta_click', {
                cta_source: pricingSource,
                pricing_intent: pricingIntent,
                recommended_plan_name: recommendedPlanName,
                placement: 'pricing_extra_credit_short_cta',
                cta_kind: 'supplemental_credit_anchor',
                pricing_mode: pricingMode
              })
            }
            className="pricing-primary-action inline-flex min-h-[46px] shrink-0 items-center justify-center rounded-full bg-rose-500 px-6 text-sm font-black text-white shadow-xl shadow-rose-950/30 transition hover:bg-rose-400"
          >
            {t(
              cheapestCreditPrice != null
                ? 'membership.buyExtraCreditsFrom'
                : 'membership.buyExtraCredits',
              {
                price:
                  localePrefix === '/en-US'
                    ? `$${((cheapestCreditPrice ?? 0) / 100).toFixed(2)}`
                    : `¥${Math.round(usdCentsToDisplayedCny(cheapestCreditPrice ?? 0))}`,
                defaultValue: '查看补充积分包'
              }
            )}
          </Link>
        </section>

        {subscriptionPlans.length > 0 ? (
          <section
            id="plan-comparison"
            className="pricing-comparison-section mt-16"
          >
            <PricingSectionHeading
              eyebrow={
                billingCycle === 'yearly'
                  ? t('membership.yearly', { defaultValue: '年付' })
                  : t('membership.monthly', { defaultValue: '月付' })
              }
              title={t('membership.planComparison', {
                defaultValue: '方案对比'
              })}
              description={t('membership.planComparisonDesc', {
                defaultValue:
                  '套餐权益不随付费周期变化；付费周期只改变价格、折后月均和年付节省。'
              })}
            />

            <p className="pricing-comparison-scroll-hint">
              {t('membership.comparisonScrollHint', {
                defaultValue: '左右滑动查看完整对比'
              })}
            </p>
            <div
              className="pricing-comparison-scroll pricing-surface-section overflow-x-auto rounded-[22px] border border-white/10 bg-white/[0.035]"
              tabIndex={0}
              aria-label={t('membership.planComparison', {
                defaultValue: '方案对比'
              })}
            >
              <div
                className="pricing-comparison-table"
                style={
                  {
                    '--pricing-plan-count': subscriptionPlans.length
                  } as React.CSSProperties
                }
              >
                <div className="pricing-comparison-row border-b border-white/10 text-sm font-black text-white">
                  <div className="p-4 text-slate-400">
                    {t('membership.compareFeature', {
                      defaultValue: '功能'
                    })}
                  </div>
                  {subscriptionPlans.map((plan) => {
                    const isFreePlan =
                      plan.name === 'free' || plan.priceMonthly <= 0;
                    const planLabel = t(`membership.plan_${plan.name}`, {
                      defaultValue:
                        plan.name.charAt(0).toUpperCase() + plan.name.slice(1)
                    });
                    const isCurrent = isSubscriptionPlanCurrent(
                      plan,
                      currentPlanId
                    );
                    const isCoveredByCurrent =
                      !!currentPlan &&
                      !isCurrent &&
                      currentPlan.sortOrder > plan.sortOrder;
                    const isCheckoutUnavailable =
                      !isFreePlan && !plan.checkoutEnabled;
                    const isSubscriptionUnresolved =
                      !isFreePlan &&
                      isAuthenticated &&
                      subscriptionStatus !== 'resolved';
                    const isDisabled =
                      !!purchasingId ||
                      isCurrent ||
                      isCoveredByCurrent ||
                      isCheckoutUnavailable ||
                      isSubscriptionUnresolved;
                    const comparisonCheckoutPrice = getPlanCheckoutPrice(
                      plan,
                      billingCycle,
                      effectivePaymentMethod
                    );
                    const monthlyPrice =
                      billingCycle === 'yearly'
                        ? Math.round(comparisonCheckoutPrice.amountCents / 12)
                        : comparisonCheckoutPrice.amountCents;
                    const phComparisonApplied =
                      phPromoActive && !isFreePlan;
                    const comparisonMonthlyListPrice =
                      effectivePaymentMethod === 'alipay' &&
                      plan.checkoutPrices?.alipay
                        ? plan.checkoutPrices.alipay.priceMonthly
                        : plan.priceMonthly;
                    const phComparisonBaseAmountCents =
                      phComparisonApplied
                        ? Math.round(comparisonMonthlyListPrice * 12)
                        : comparisonCheckoutPrice.amountCents;
                    const phComparisonAmountCents = phComparisonApplied
                      ? Math.round(phComparisonBaseAmountCents * 0.5)
                      : comparisonCheckoutPrice.amountCents;
                    const phComparisonMonthly = phComparisonApplied
                      ? Math.round(phComparisonAmountCents / 12)
                      : monthlyPrice;
                    return (
                      <div
                        key={plan.id}
                        className="pricing-comparison-plan-cell p-4"
                        data-plan={planLabel}
                      >
                        <div>{planLabel}</div>
                        <div className="mt-1 text-xs font-bold text-slate-400">
                          {isFreePlan
                            ? t('membership.free', { defaultValue: '免费' })
                            : phComparisonApplied
                              ? (
                                  <>
                                    <span className="line-through text-slate-500">
                                      {comparisonCheckoutPrice.symbol}
                                      {formatPrice(
                                        phComparisonApplied
                                          ? comparisonMonthlyListPrice
                                          : monthlyPrice
                                      )}
                                    </span>{' '}
                                    <span className="text-rose-200">
                                      {comparisonCheckoutPrice.symbol}
                                      {formatPrice(phComparisonMonthly)}
                                    </span>
                                    /
                                    {t('membership.mo', {
                                      defaultValue: '月'
                                    })}
                                  </>
                                )
                              : `${comparisonCheckoutPrice.symbol}${formatPrice(monthlyPrice)}/${t('membership.mo', { defaultValue: '月' })}`}
                        </div>
                        <button
                          type="button"
                          disabled={isDisabled}
                          onClick={() => {
                            if (isDisabled) return;
                            if (isFreePlan) {
                              handleFreePlanAction();
                              return;
                            }
                            void handlePurchase(plan.id);
                          }}
                          className={`mt-3 min-h-[44px] w-full rounded-lg px-3 text-xs font-black transition ${
                            isCurrent || isCoveredByCurrent
                              ? 'cursor-default bg-white/10 text-slate-500'
                              : isCheckoutUnavailable ||
                                  isSubscriptionUnresolved
                                ? 'cursor-not-allowed bg-white/10 text-slate-500'
                                : 'pricing-primary-action bg-rose-500 text-white hover:bg-rose-400 disabled:cursor-wait'
                          }`}
                        >
                          {purchasingId === plan.id
                            ? t('membership.loading', {
                                defaultValue: '处理中...'
                              })
                            : isCurrent
                              ? t('membership.alreadyCurrentPlan', {
                                  defaultValue: '已处于当前套餐'
                                })
                              : isCoveredByCurrent
                                ? t('membership.includedInCurrentPlan', {
                                    defaultValue: '已包含在当前套餐中'
                                  })
                                : isSubscriptionUnresolved
                                  ? subscriptionStatus === 'error'
                                    ? t(
                                        'membership.subscriptionStatusUnavailableShort',
                                        {
                                          defaultValue: '套餐状态暂不可用'
                                        }
                                      )
                                    : t(
                                        'membership.subscriptionStatusLoading',
                                        {
                                          defaultValue: '正在确认当前套餐…'
                                        }
                                      )
                                  : isCheckoutUnavailable
                                    ? t('membership.temporarilyUnavailable', {
                                        defaultValue: '暂不可用'
                                      })
                                    : t('membership.choosePlan', {
                                        defaultValue: '选择方案'
                                      })}
                        </button>
                      </div>
                    );
                  })}
                </div>
                {comparisonRows.map((row) => (
                  <div
                    key={row.id}
                    className="pricing-comparison-row border-b border-white/8 text-sm last:border-b-0"
                  >
                    <div className="p-4 font-bold text-slate-400">
                      {row.label}
                    </div>
                    {subscriptionPlans.map((plan) => {
                      const planLabel = t(`membership.plan_${plan.name}`, {
                        defaultValue:
                          plan.name.charAt(0).toUpperCase() + plan.name.slice(1)
                      });
                      return (
                        <div
                          key={plan.id}
                          className="pricing-comparison-value-cell p-4 font-bold text-slate-200"
                          data-plan={planLabel}
                        >
                          {row.getValue(plan)}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        <section className="pricing-trust-grid mt-16">
          <div className="pricing-trust-card rounded-[20px] border border-white/10 bg-white/[0.035] p-5">
            <Shield className="h-5 w-5 text-sky-300" />
            <h3 className="mt-4 text-base font-black tracking-normal text-white">
              {t('membership.secureBilling', {
                defaultValue: '安全支付'
              })}
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              {t('membership.secureBillingDesc', {
                defaultValue: '支付由安全的第三方结账系统处理。'
              })}
            </p>
          </div>
          <div className="pricing-trust-card rounded-[20px] border border-white/10 bg-white/[0.035] p-5">
            <Star className="h-5 w-5 text-amber-300" />
            <h3 className="mt-4 text-base font-black tracking-normal text-white">
              {effectivePaymentMethod === 'alipay'
                ? t('membership.alipayPrepaidTerm', {
                    defaultValue: '固定期限'
                  })
                : t('membership.cancelAnytime', {
                    defaultValue: '随时调整'
                  })}
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              {effectivePaymentMethod === 'alipay'
                ? t('membership.alipayPrepaidTermDesc', {
                    defaultValue: '支付宝按所选周期一次性支付，不会自动续费。'
                  })
                : t('membership.cancelAnytimeDesc', {
                    defaultValue: '需要时升级，后续可在账单门户调整。'
                  })}
            </p>
          </div>
          <div className="pricing-trust-card rounded-[20px] border border-white/10 bg-white/[0.035] p-5">
            <HelpCircle className="h-5 w-5 text-rose-300" />
            <h3 className="mt-4 text-base font-black tracking-normal text-white">
              {t('membership.support247', { defaultValue: '创作支持' })}
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              {t('membership.support247Desc', {
                defaultValue: '遇到工作流阻塞时，可获得更快的处理支持。'
              })}
            </p>
          </div>
        </section>

        <section id="pricing-faq" className="pricing-faq-section mt-16">
          <PricingSectionHeading
            title={t('membership.pricingFaqTitle', {
              defaultValue: '常见问题'
            })}
            description={t('membership.pricingFaqDescription', {
              defaultValue: '关于积分、订阅和生成计费的常见问题。'
            })}
          />
          <PricingFaqList items={pricingFaqs} />
        </section>
      </main>
    </div>
  );
};
