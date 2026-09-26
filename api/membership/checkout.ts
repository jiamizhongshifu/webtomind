import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { getCorsHeadersForRequest } from '../utils/auth';
import { recordConversionEvent } from '../utils/conversion-events';
import {
  getStripeSecretKey,
  hasStripeCheckoutConfig
} from '../utils/stripe-env';
import {
  getCanonicalApiCreditCents,
  getApiCreditPackageQuote,
  getApiCreditPaymentAmount,
  getConfiguredApiCreditUsdToCnyRate,
  getCustomApiCreditQuote
} from '../utils/api-credit-pricing';
import {
  buildZpayCheckoutFields,
  getZpayConfig,
  hasZpayCheckoutConfig,
  usdCentsToCnyCents
} from '../utils/zpay';
import {
  PromoCodeError,
  getPromoDiscountedAmountCents,
  getPromoOriginalAnnualAmountUsdCents,
  getStripeCheckoutUnitAmountCents,
  resolvePromoCode,
  type ValidatedPromo
} from '../utils/promo-codes';
import {
  SUBSCRIPTION_ACCESS_STATUSES,
  findSubscriptionBlockingNewPaidCheckout
} from './subscription-policy';

// 注意：使用 Edge Runtime 以获得 Web API Request/Response 兼容性
// Stripe SDK 在 Edge 环境下需要确保正确初始化

export const config = {
  runtime: 'edge'
};

// Test-mode 专用的 Stripe price 覆盖：数据库中的 stripe_price_id 是 live 环境的
// price，test key 无法使用。STRIPE_MODE=test 时优先读取
// STRIPE_TEST_PRICE_<PRODUCT>_<CYCLE> 环境变量（如 STRIPE_TEST_PRICE_PRO_MONTHLY），
// 用于本地/CI 跑 test-mode 结账冒烟，不影响 live 配置。
function resolveStripePriceId(
  product: {
    id: string;
    stripe_price_id?: string | null;
    stripe_price_monthly?: string | null;
    stripe_price_yearly?: string | null;
  },
  billingCycle?: 'monthly' | 'yearly'
): string | undefined {
  // Test-mode 一律返回 undefined，结账 line_items 走 price_data 动态建价
  // （与 credit packages 相同的兜底路径）。数据库中的 stripe_price_id 是
  // live 环境的 price，test key 无法使用；手动维护 test price 又容易在
  // live/test 环境间复制错 id（No such price）。动态建价让 test-mode
  // 冒烟完全不需要手工建 price，且不影响 live 配置。
  if (process.env.STRIPE_MODE === 'test') return undefined;
  if (product.stripe_price_id) return product.stripe_price_id ?? undefined;
  return (
    (billingCycle === 'yearly'
      ? product.stripe_price_yearly
      : product.stripe_price_monthly) ?? undefined
  );
}

function createStripeClient(secretKey: string): Stripe {
  return new Stripe(secretKey, {
    apiVersion: '2026-06-24.dahlia'
  });
}

function createStripeIntegrationIdentifier(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz';
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const suffix = Array.from(
    bytes,
    (value) => alphabet[value % alphabet.length]
  ).join('');
  return `webtomind_checkout_${suffix}`;
}

function getConversionEventClient(fallback: SupabaseClient): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return fallback;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

interface CheckoutRequest {
  type: 'subscription' | 'credit_package' | 'api_credit_package';
  id: string;
  paymentProvider?: 'stripe' | 'alipay';
  customAmountUsdCents?: number;
  billingCycle?: 'monthly' | 'yearly';
  promoCode?: string;
  upgradeFromPackageId?: string;
  successUrl?: string;
  cancelUrl?: string;
  ctaSource?: string;
  returnTo?: string;
  pageLocation?: string;
  pageReferrer?: string;
  utm?: Record<string, string>;
  acquisition?: AcquisitionSnapshot;
}

interface AcquisitionSnapshot {
  utm?: Record<string, string>;
  clickId?: string;
  externalReferrer?: string;
  refCode?: string;
}

export function getCheckoutRequestValidationError(
  value: unknown
): string | null {
  if (!value || typeof value !== 'object') return 'Invalid checkout request';
  const request = value as Record<string, unknown>;
  if (
    request.type !== 'subscription' &&
    request.type !== 'credit_package' &&
    request.type !== 'api_credit_package'
  ) {
    return 'Invalid checkout type';
  }
  if (typeof request.id !== 'string' || !request.id.trim()) {
    return 'Invalid product id';
  }
  if (
    request.type === 'subscription' &&
    request.billingCycle !== undefined &&
    request.billingCycle !== 'monthly' &&
    request.billingCycle !== 'yearly'
  ) {
    return 'Invalid billing cycle';
  }
  if (
    request.paymentProvider !== undefined &&
    request.paymentProvider !== 'stripe' &&
    request.paymentProvider !== 'alipay'
  ) {
    return 'Invalid payment provider';
  }
  const hasCustomAmount = request.customAmountUsdCents !== undefined;
  if (hasCustomAmount && request.type !== 'api_credit_package') {
    return 'Custom amount is only available for API credit recharge';
  }
  if (request.type === 'api_credit_package' && request.id === 'custom') {
    if (
      !hasCustomAmount ||
      typeof request.customAmountUsdCents !== 'number' ||
      !Number.isSafeInteger(request.customAmountUsdCents) ||
      request.customAmountUsdCents <= 0 ||
      request.customAmountUsdCents % 100 !== 0
    ) {
      return 'Custom API recharge must be a whole USD amount';
    }
  } else if (hasCustomAmount) {
    return 'Invalid custom API recharge request';
  }
  if (
    request.promoCode !== undefined &&
    (typeof request.promoCode !== 'string' ||
      request.promoCode.trim().length > 64)
  ) {
    return 'Invalid promo code';
  }
  return null;
}

export function getCheckoutBillingCycle(
  value?: 'monthly' | 'yearly'
): 'monthly' | 'yearly' {
  return value ?? 'yearly';
}

// 安全修复：验证重定向 URL 是否属于允许的域名
const ALLOWED_REDIRECT_DOMAINS = [
  'webtomind.com',
  'www.webtomind.com',
  'localhost:3000',
  'localhost:5173'
];
const TRIAL_PACK_UPGRADE_WINDOW_MS = 48 * 60 * 60 * 1000;
const TRIAL_PACK_UPGRADE_PACKAGE_IDS = new Set(['pack_1k']);

interface TrialPackUpgradeOrder {
  id: string;
  amount: number | null;
  status: string | null;
  provider_order_id: string | null;
}

interface CheckoutOrderSnapshot {
  id: string;
  metadata?: Record<string, unknown> | null;
  userId: string;
  productType: CheckoutRequest['type'];
  productId: string;
  ctaSource?: string;
  billingCycle?: 'monthly' | 'yearly';
}

function isValidRedirectUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.host;

    return ALLOWED_REDIRECT_DOMAINS.some((domain) => {
      const domainHost = domain.split(':')[0];

      // localhost 精确匹配（含端口），防止 evil.localhost 绕过
      if (domainHost === 'localhost') {
        return host === domain;
      }

      // 其他域名允许子域名
      return host === domainHost || host.endsWith('.' + domainHost);
    });
  } catch {
    return false;
  }
}

function getSafeRedirectUrl(
  userUrl: string | undefined,
  defaultUrl: string
): string {
  if (!userUrl) return defaultUrl;
  return isValidRedirectUrl(userUrl) ? userUrl : defaultUrl;
}

function cleanMetadataString(
  value: unknown,
  maxLength = 500
): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLength);
}

function cleanUtmParams(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const allowedKeys = [
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_term',
    'utm_content'
  ];
  const utm: Record<string, string> = {};
  allowedKeys.forEach((key) => {
    const cleanValue = cleanMetadataString(
      (value as Record<string, unknown>)[key],
      200
    );
    if (cleanValue) utm[key] = cleanValue;
  });
  return Object.keys(utm).length > 0 ? utm : undefined;
}

function cleanAcquisition(value: unknown): AcquisitionSnapshot | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const utm = cleanUtmParams(record.utm);
  const clickId = cleanMetadataString(record.clickId, 200);
  const externalReferrer = cleanMetadataString(record.externalReferrer, 500);
  const refCode = cleanMetadataString(record.refCode, 200);
  if (!utm && !clickId && !externalReferrer && !refCode) {
    return undefined;
  }
  return {
    ...(utm ? { utm } : {}),
    ...(clickId ? { clickId } : {}),
    ...(externalReferrer ? { externalReferrer } : {}),
    ...(refCode ? { refCode } : {})
  };
}

function getZpayProductName(input: {
  type: CheckoutRequest['type'];
  productName: string;
  billingCycle: 'monthly' | 'yearly';
}): string {
  if (input.type === 'api_credit_package') {
    return `WebToMind ${input.productName} API 额度`;
  }
  if (input.type === 'credit_package') {
    return `WebToMind ${input.productName} 积分包`;
  }
  const cycleName = input.billingCycle === 'yearly' ? '年度' : '月度';
  return `WebToMind ${input.productName} ${cycleName}会员`;
}

function appendCheckoutReturnParams(input: {
  userUrl?: string;
  defaultUrl: string;
  payment: 'success' | 'cancel';
  orderId: string;
  checkoutType: CheckoutRequest['type'];
  productId: string;
  ctaSource?: string;
  returnTo?: string;
}): string {
  const safeUrl = getSafeRedirectUrl(input.userUrl, input.defaultUrl);
  const url = new URL(safeUrl);
  url.searchParams.set('payment', input.payment);
  url.searchParams.set('orderId', input.orderId);
  url.searchParams.set('checkoutType', input.checkoutType);
  url.searchParams.set('productId', input.productId);
  if (input.ctaSource) {
    url.searchParams.set('source', input.ctaSource);
  }
  if (input.returnTo) {
    url.searchParams.set('returnTo', input.returnTo);
  }
  return url.toString();
}

async function findRecentTrialPackUpgradeOrder(params: {
  supabase: SupabaseClient;
  stripe: Stripe;
  userId: string;
  packageId?: string;
}): Promise<TrialPackUpgradeOrder | null> {
  if (
    !params.packageId ||
    !TRIAL_PACK_UPGRADE_PACKAGE_IDS.has(params.packageId)
  ) {
    return null;
  }

  const cutoff = new Date(
    Date.now() - TRIAL_PACK_UPGRADE_WINDOW_MS
  ).toISOString();
  const { data, error } = await params.supabase
    .from('payment_orders')
    .select('id, amount, status, provider_order_id')
    .eq('user_id', params.userId)
    .eq('product_type', 'credit_package')
    .eq('product_id', params.packageId)
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false })
    .limit(5);

  if (error) {
    console.warn('[Checkout] Trial pack upgrade lookup failed:', error);
    return null;
  }

  const orders = (data || []) as TrialPackUpgradeOrder[];
  for (const order of orders) {
    if (order.status === 'succeeded') return order;
    if (!order.provider_order_id) continue;

    try {
      const session = await params.stripe.checkout.sessions.retrieve(
        order.provider_order_id
      );
      if (session.status === 'complete' && session.payment_status === 'paid') {
        return order;
      }
    } catch (error) {
      console.warn('[Checkout] Trial pack session verification failed:', error);
    }
  }

  return null;
}

async function getReferralCheckoutMetadata(
  supabase: SupabaseClient,
  userId: string
): Promise<Record<string, unknown> | undefined> {
  try {
    const { data, error } = await supabase
      .from('referrals')
      .select(
        'id, referrer_id, status, reward_amount, created_at, qualified_at, reward_granted_at'
      )
      .eq('referee_id', userId)
      .maybeSingle();

    if (error || !data) {
      if (error) {
        console.warn('[Checkout] Referral attribution lookup failed:', error);
      }
      return undefined;
    }

    return {
      referral_id: data.id,
      referrer_id: data.referrer_id,
      referral_status: data.status,
      referral_reward_amount: data.reward_amount,
      referral_created_at: data.created_at,
      referral_qualified_at: data.qualified_at,
      referral_reward_granted_at: data.reward_granted_at
    };
  } catch (error) {
    console.warn('[Checkout] Referral attribution lookup failed:', error);
    return undefined;
  }
}

// 订单已创建但结账初始化失败时的一致性兜底：
// 只把仍为 pending 且尚未关联 provider_order_id 的订单标记为 failed，
// 避免并发场景下把已可支付的订单误标失败；同时写一条幂等的
// checkout_session_create_failed 事件。任何失败都不抛出、不遮蔽原始响应。
async function reconcileFailedCheckoutOrder(params: {
  supabase: SupabaseClient;
  order: CheckoutOrderSnapshot;
  errorCode: string;
  errorSummary: string;
}): Promise<void> {
  const { supabase, order, errorCode, errorSummary } = params;
  try {
    const { data, error } = await supabase
      .from('payment_orders')
      .update({
        status: 'failed',
        metadata: {
          ...(order.metadata || {}),
          checkout_error_code: errorCode,
          checkout_error: errorSummary
        }
      })
      .eq('id', order.id)
      .eq('status', 'pending')
      .is('provider_order_id', null)
      .select('id');

    if (error) {
      console.warn('[Checkout] Failed to reconcile checkout order:', {
        orderId: order.id,
        message: error.message
      });
      return;
    }
    if (!data || data.length === 0) {
      // 订单已非 pending 或已有关联的 provider_order_id，不标记失败、不写失败事件。
      return;
    }

    await recordConversionEvent(getConversionEventClient(supabase), {
      eventName: 'checkout_session_create_failed',
      eventSource: 'checkout_api',
      userId: order.userId,
      entityType: 'payment_order',
      entityId: order.id,
      orderId: order.id,
      productType: order.productType,
      productId: order.productId,
      ctaSource: order.ctaSource,
      idempotencyKey: `checkout_session_create_failed:${order.id}`,
      metadata: {
        error_code: errorCode,
        error_summary: errorSummary,
        ...(order.billingCycle ? { billing_cycle: order.billingCycle } : {})
      }
    });
  } catch (error) {
    console.warn('[Checkout] Checkout failure reconciliation skipped:', {
      orderId: order.id,
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

export default async function handler(request: Request) {
  const corsHeaders = getCorsHeadersForRequest(request);

  // JSON 响应辅助函数
  function jsonResponse(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
      status,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: corsHeaders
    });
  }

  let body: CheckoutRequest;
  try {
    const rawBody = await request.json();
    const validationError = getCheckoutRequestValidationError(rawBody);
    if (validationError) {
      return jsonResponse({ error: validationError }, 400);
    }
    body = rawBody as CheckoutRequest;
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  if (
    !process.env.SUPABASE_URL ||
    !process.env.SUPABASE_ANON_KEY ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    console.error('[Checkout] Supabase environment variables not configured');
    return jsonResponse({ error: 'Database not configured' }, 500);
  }

  const {
    type,
    id,
    paymentProvider = 'stripe',
    customAmountUsdCents,
    billingCycle: requestedBillingCycle,
    promoCode,
    upgradeFromPackageId,
    successUrl,
    cancelUrl,
    ctaSource,
    returnTo,
    pageLocation,
    pageReferrer,
    utm,
    acquisition
  } = body;
  const billingCycle = getCheckoutBillingCycle(requestedBillingCycle);
  // 支付宝渠道也支持折扣码：需要用 Stripe 只读校验码是否有效，
  // 折扣最终体现在 ZPAY 实收金额上。
  const needsStripeValidation =
    paymentProvider === 'stripe' || Boolean(promoCode);
  const stripeSecretKey = needsStripeValidation ? getStripeSecretKey() : '';
  const stripe =
    needsStripeValidation && stripeSecretKey && hasStripeCheckoutConfig()
      ? createStripeClient(stripeSecretKey)
      : null;
  const zpay =
    paymentProvider === 'alipay' && hasZpayCheckoutConfig()
      ? getZpayConfig()
      : null;

  if (paymentProvider === 'stripe' && !stripe) {
    console.error('[Checkout] STRIPE_SECRET_KEY is not configured');
    return jsonResponse(
      {
        error: 'Payment service not configured',
        errorCode: 'STRIPE_NOT_CONFIGURED'
      },
      500
    );
  }
  if (promoCode && !stripe) {
    console.error('[Checkout] Promo validation requires STRIPE_SECRET_KEY');
    return jsonResponse({ error: 'Promo validation is not configured' }, 500);
  }
  if (paymentProvider === 'alipay' && !zpay) {
    console.error('[Checkout] ZPAY checkout is not configured');
    return jsonResponse(
      {
        error: 'Alipay checkout is not configured',
        errorCode: 'ALIPAY_NOT_CONFIGURED'
      },
      503
    );
  }
  if (paymentProvider === 'alipay' && upgradeFromPackageId) {
    return jsonResponse(
      {
        error: 'Trial upgrade credit is only available for card checkout',
        errorCode: 'ALIPAY_TRIAL_UPGRADE_UNAVAILABLE'
      },
      400
    );
  }
  if (type === 'api_credit_package' && promoCode) {
    return jsonResponse(
      {
        error: 'API 余额套餐不支持促销码',
        errorCode: 'API_CREDIT_PROMO_UNAVAILABLE'
      },
      400
    );
  }

  const checkoutAttribution = {
    cta_source: cleanMetadataString(ctaSource, 120),
    return_to: cleanMetadataString(returnTo, 1000),
    page_location: cleanMetadataString(pageLocation, 1000),
    page_referrer: cleanMetadataString(pageReferrer, 1000),
    utm: cleanUtmParams(utm),
    acquisition: cleanAcquisition(acquisition)
  };
  const hasCheckoutAttribution =
    Object.values(checkoutAttribution).some(Boolean);

  // 获取 Authorization header
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse({ error: 'Missing Authorization header' }, 401);
  }
  const token = authHeader.replace('Bearer ', '');

  const supabase = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_ANON_KEY || '',
    {
      global: { headers: { Authorization: `Bearer ${token}` } }
    }
  );
  // Payment orders are written only with the service role: product, amount and
  // metadata drive fulfillment, so users must never be able to insert or edit
  // their own order rows through the Data API.
  const orderDb = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );

  let createdOrder: CheckoutOrderSnapshot | null = null;
  try {
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser(token);
    if (authError || !user)
      return jsonResponse({ error: 'Invalid token' }, 401);

    const userId = user.id;
    const userEmail = user.email;
    const referralCheckoutMetadata = await getReferralCheckoutMetadata(
      supabase,
      userId
    );

    let amount = 0;
    let productName = '';
    let stripePriceId: string | undefined;
    let apiCreditCents: number | undefined;
    let apiCatalogAmountCnyCents: number | undefined;
    const apiUsdToCnyRate = getConfiguredApiCreditUsdToCnyRate();
    const isCustomApiRecharge =
      type === 'api_credit_package' && id === 'custom';
    let trialUpgradeCouponId: string | undefined;
    // Product Hunt 年付 5 折基准价：月付原价 × 12（年付原价），
    // 与折后年付价（price_yearly）无关，禁止折上折。
    let promoOriginalAnnualAmountUsdCents: number | null = null;

    if (type === 'subscription') {
      const { data: plan } = await supabase
        .from('subscription_plans')
        .select('*')
        .eq('id', id)
        .eq('is_active', true)
        .single();

      if (!plan) return jsonResponse({ error: 'Plan not found' }, 404);

      // 免费版不需要创建 Stripe 会话
      if (plan.id === 'free' || plan.price_monthly === 0) {
        return jsonResponse(
          { error: 'Free plan does not require payment' },
          400
        );
      }

      const { data: subscriptionCandidates, error: subscriptionError } =
        await supabase
          .from('user_subscriptions')
          .select(
            'id,status,current_period_end,stripe_customer_id,stripe_subscription_id,payment_provider'
          )
          .eq('user_id', userId)
          .in('status', [...SUBSCRIPTION_ACCESS_STATUSES])
          .order('created_at', { ascending: false });

      if (subscriptionError) {
        console.error('[Checkout] Subscription lookup failed:', {
          userId,
          message: subscriptionError.message
        });
        return jsonResponse(
          {
            error: 'Unable to verify current subscription',
            errorCode: 'SUBSCRIPTION_LOOKUP_FAILED'
          },
          503
        );
      }

      const blockingSubscription = findSubscriptionBlockingNewPaidCheckout(
        subscriptionCandidates
      );
      if (blockingSubscription?.payment_provider === 'zpay') {
        return jsonResponse(
          {
            error: '当前支付宝套餐仍在有效期内，期满后可续费或更换套餐。',
            errorCode: 'ACTIVE_PREPAID_SUBSCRIPTION_EXISTS'
          },
          409
        );
      }
      if (blockingSubscription) {
        return jsonResponse(
          {
            error: 'Manage the existing subscription before changing plans',
            errorCode: 'ACTIVE_SUBSCRIPTION_EXISTS'
          },
          409
        );
      }

      amount =
        billingCycle === 'yearly' ? plan.price_yearly : plan.price_monthly;
      if (billingCycle === 'yearly') {
        promoOriginalAnnualAmountUsdCents =
          getPromoOriginalAnnualAmountUsdCents(plan.price_monthly);
      }
      productName = plan.name;
      stripePriceId = resolveStripePriceId(plan, billingCycle);

      if (
        stripe &&
        plan.id === 'pro' &&
        billingCycle === 'monthly' &&
        upgradeFromPackageId
      ) {
        const trialOrder = await findRecentTrialPackUpgradeOrder({
          supabase,
          stripe,
          userId,
          packageId: upgradeFromPackageId
        });
        const trialAmount = Number(trialOrder?.amount || 0);
        if (trialOrder && trialAmount > 0) {
          const coupon = await stripe.coupons.create({
            amount_off: Math.min(Math.round(amount), trialAmount),
            currency: 'usd',
            duration: 'once',
            name: 'Trial pack upgrade credit',
            metadata: {
              user_id: userId,
              source_order_id: trialOrder.id,
              source_package_id: upgradeFromPackageId,
              target_plan_id: plan.id
            }
          });
          trialUpgradeCouponId = coupon.id;
        }
      }
    } else {
      if (type === 'api_credit_package' && !apiUsdToCnyRate) {
        return jsonResponse(
          {
            error: 'API recharge exchange rate is not configured',
            errorCode: 'API_CREDIT_RATE_NOT_CONFIGURED'
          },
          503
        );
      }
      if (type === 'api_credit_package' && isCustomApiRecharge) {
        if (!apiUsdToCnyRate || customAmountUsdCents === undefined) {
          return jsonResponse(
            {
              error: 'API recharge exchange rate is not configured',
              errorCode: 'API_CREDIT_RATE_NOT_CONFIGURED'
            },
            503
          );
        }
        try {
          const quote = getCustomApiCreditQuote({
            paymentProvider,
            amountUsdCents: customAmountUsdCents,
            usdToCnyRate: apiUsdToCnyRate
          });
          apiCatalogAmountCnyCents = quote.catalogAmountCnyCents;
          apiCreditCents = quote.apiCreditCents;
        } catch (error) {
          return jsonResponse(
            {
              error:
                error instanceof Error
                  ? error.message
                  : 'Invalid custom API recharge amount',
              errorCode: 'INVALID_CUSTOM_API_RECHARGE'
            },
            400
          );
        }
        amount = apiCatalogAmountCnyCents;
        productName = '自定义 API 额度';
        stripePriceId = undefined;
      } else {
        const packageTable =
          type === 'api_credit_package'
            ? 'api_credit_packages'
            : 'credit_packages';
        const { data: pkg } = await supabase
          .from(packageTable)
          .select('*')
          .eq('id', id)
          .eq('is_active', true)
          .single();

        if (!pkg) return jsonResponse({ error: 'Package not found' }, 404);
        if (type === 'api_credit_package') {
          apiCatalogAmountCnyCents = Number(pkg.price_cents);
          const quote = getApiCreditPackageQuote({
            paymentProvider,
            catalogAmountCnyCents: apiCatalogAmountCnyCents,
            listedCreditCents: Number(pkg.credit_cents),
            canonicalCreditCents: getCanonicalApiCreditCents(pkg.metadata),
            usdToCnyRate: apiUsdToCnyRate
          });
          apiCreditCents = quote.apiCreditCents;
          if (
            !Number.isSafeInteger(apiCatalogAmountCnyCents) ||
            apiCatalogAmountCnyCents <= 0 ||
            !Number.isSafeInteger(apiCreditCents) ||
            apiCreditCents <= 0 ||
            apiCreditCents % 100 !== 0
          ) {
            return jsonResponse(
              {
                error: 'API credit package is temporarily unavailable',
                errorCode: 'API_CREDIT_PACKAGE_CONFIG_INVALID'
              },
              503
            );
          }
          amount = apiCatalogAmountCnyCents;
        } else {
          amount = pkg.price;
        }
        productName =
          type === 'api_credit_package' ? pkg.name : `${pkg.credits} Credits`;
        stripePriceId = resolveStripePriceId(pkg);
      }
    }

    // 检查金额
    if (amount <= 0 && !stripePriceId) {
      return jsonResponse({ error: 'Invalid product amount' }, 400);
    }

    if (paymentProvider === 'stripe' && stripePriceId && stripe) {
      const stripePrice = await stripe.prices.retrieve(stripePriceId);
      const expectedStripeAmountCents =
        type === 'api_credit_package' ? apiCreditCents : amount;
      const expectedInterval =
        type === 'subscription'
          ? billingCycle === 'yearly'
            ? 'year'
            : 'month'
          : null;
      const priceMatches =
        stripePrice.active &&
        stripePrice.currency === 'usd' &&
        stripePrice.unit_amount ===
          Math.round(expectedStripeAmountCents || 0) &&
        (type !== 'subscription' ||
          stripePrice.recurring?.interval === expectedInterval);
      if (!priceMatches) {
        console.error('[Checkout] Stripe price configuration mismatch', {
          productId: id,
          stripePriceId,
          databaseAmount:
            type === 'api_credit_package' ? apiCreditCents : amount,
          stripeAmount: stripePrice.unit_amount,
          stripeCurrency: stripePrice.currency,
          stripeActive: stripePrice.active,
          expectedInterval,
          stripeInterval: stripePrice.recurring?.interval
        });
        return jsonResponse(
          {
            error: 'Product is temporarily unavailable',
            errorCode: 'PRODUCT_PRICE_MISMATCH'
          },
          409
        );
      }
    }

    // Product Hunt 发布优惠码（年付 5 折）：先按原价完成价格核对，
    // 再校验优惠码并计算折后实付金额，保证内部订单金额与 Stripe 实收一致。
    let promo: ValidatedPromo | null = null;
    if (promoCode && type !== 'api_credit_package') {
      try {
        promo = await resolvePromoCode({
          stripe: stripe!,
          code: promoCode,
          eligibility: {
            type: type === 'subscription' ? 'subscription' : 'credit_package',
            paymentProvider,
            billingCycle
          }
        });
      } catch (error) {
        if (error instanceof PromoCodeError) {
          return jsonResponse(
            { error: error.message, errorCode: error.code },
            400
          );
        }
        throw error;
      }
    }

    // API packages are canonically denominated in USD cents. Alipay receives
    // the corresponding CNY fen; the server-side rate is snapshotted on the
    // order so the credited balance cannot drift after checkout starts.
    const fullAmountUsdCents =
      type === 'api_credit_package' ? apiCreditCents || 0 : Math.round(amount);
    const fullAmountCnyCents =
      type === 'api_credit_package' ? apiCatalogAmountCnyCents || 0 : null;
    const apiCreditPayment =
      type === 'api_credit_package'
        ? getApiCreditPaymentAmount({
            paymentProvider,
            catalogAmountCnyCents: fullAmountCnyCents || 0,
            apiCreditCents: fullAmountUsdCents
          })
        : null;
    const promoBaseAmountUsdCents = promo
      ? (promoOriginalAnnualAmountUsdCents ?? fullAmountUsdCents)
      : fullAmountUsdCents;
    const chargedAmountUsdCents = promo
      ? getPromoDiscountedAmountCents(promoBaseAmountUsdCents, promo.percentOff)
      : fullAmountUsdCents;
    const orderAmount =
      type === 'api_credit_package'
        ? apiCreditPayment?.amount || 0
        : paymentProvider === 'alipay' && zpay
          ? usdCentsToCnyCents(chargedAmountUsdCents, zpay.usdToCnyRate)
          : chargedAmountUsdCents;
    const orderCurrency =
      apiCreditPayment?.currency ||
      (paymentProvider === 'alipay' ? 'cny' : 'usd');
    const orderProvider = paymentProvider === 'alipay' ? 'zpay' : 'stripe';

    // 创建内部待处理订单（用于追踪）
    const { data: order, error: orderError } = await orderDb
      .from('payment_orders')
      .insert({
        user_id: userId,
        amount: orderAmount,
        currency: orderCurrency,
        status: 'pending',
        provider: orderProvider,
        product_type: type,
        product_id: id,
        metadata: {
          billingCycle,
          productName,
          paymentProvider,
          ...(type === 'api_credit_package'
            ? {
                catalogAmountCnyCents: fullAmountCnyCents,
                apiCreditCents,
                ...(apiUsdToCnyRate ? { usdToCnyRate: apiUsdToCnyRate } : {}),
                ...(isCustomApiRecharge
                  ? { customAmountUsdCents: fullAmountUsdCents }
                  : {})
              }
            : { catalogAmountUsdCents: fullAmountUsdCents }),
          ...(promo
            ? {
                promoCode: promo.code,
                promoPercentOff: promo.percentOff,
                promoAppliedAmountUsdCents: chargedAmountUsdCents,
                promoOriginalAnnualAmountUsdCents:
                  promoOriginalAnnualAmountUsdCents
              }
            : {}),
          upgradeFromPackageId,
          ...(referralCheckoutMetadata
            ? { referral: referralCheckoutMetadata }
            : {}),
          ...(hasCheckoutAttribution
            ? { checkout_attribution: checkoutAttribution }
            : {})
        }
      })
      .select()
      .single();

    if (orderError) {
      console.error('[Checkout] Order transformation error:', orderError);
      throw new Error(`Failed to create order: ${orderError.message}`);
    }

    createdOrder = {
      id: order.id,
      metadata: (order.metadata || {}) as Record<string, unknown>,
      userId,
      productType: type,
      productId: id,
      ctaSource: checkoutAttribution.cta_source,
      billingCycle
    };

    await recordConversionEvent(getConversionEventClient(supabase), {
      eventName: 'checkout_start',
      eventSource: 'checkout_api',
      userId,
      entityType: 'payment_order',
      entityId: order.id,
      orderId: order.id,
      productType: type,
      productId: id,
      ctaSource: checkoutAttribution.cta_source,
      idempotencyKey: `checkout_start:${order.id}`,
      metadata: {
        billing_cycle: billingCycle,
        product_name: productName,
        amount: orderAmount,
        currency: orderCurrency,
        payment_provider: orderProvider,
        ...(type === 'api_credit_package'
          ? { catalog_amount_cny_cents: fullAmountCnyCents }
          : { catalog_amount_usd_cents: fullAmountUsdCents }),
        ...(promo
          ? {
              promo_code: promo.code,
              promo_percent_off: promo.percentOff
            }
          : {}),
        upgrade_from_package_id: upgradeFromPackageId,
        checkout_attribution: hasCheckoutAttribution
          ? checkoutAttribution
          : undefined,
        referral: referralCheckoutMetadata
      }
    });

    const defaultSuccessUrl = new URL(
      '/pricing',
      process.env.APP_URL || 'https://webtomind.com'
    );
    const defaultCancelUrl = new URL(
      '/pricing',
      process.env.APP_URL || 'https://webtomind.com'
    );
    if (paymentProvider === 'alipay' && zpay) {
      const appUrl = process.env.APP_URL || 'https://webtomind.com';
      const zpayReturnUrl = new URL('/api/membership/zpay-return', appUrl);
      const requestedReturnUrl = getSafeRedirectUrl(
        successUrl,
        defaultSuccessUrl.toString()
      );
      const requestedReturn = new URL(requestedReturnUrl);
      zpayReturnUrl.searchParams.set(
        'returnTo',
        `${requestedReturn.pathname}${requestedReturn.search}`
      );
      const fields = buildZpayCheckoutFields({
        config: zpay,
        orderId: order.id,
        productName: getZpayProductName({
          type,
          productName,
          billingCycle
        }),
        cnyCents: orderAmount,
        notifyUrl: new URL('/api/membership/zpay-notify', appUrl).toString(),
        returnUrl: zpayReturnUrl.toString()
      });
      const { error: providerOrderError } = await orderDb
        .from('payment_orders')
        .update({ provider_order_id: fields.out_trade_no })
        .eq('id', order.id)
        .eq('status', 'pending');
      if (providerOrderError) {
        throw new Error('Failed to persist ZPAY merchant order number');
      }
      return jsonResponse({
        id: order.id,
        url: zpay.submitUrl,
        method: 'POST',
        fields,
        paymentProvider: 'alipay'
      });
    }

    const successRedirectUrl = appendCheckoutReturnParams({
      userUrl: successUrl,
      defaultUrl: defaultSuccessUrl.toString(),
      payment: 'success',
      orderId: order.id,
      checkoutType: type,
      productId: id,
      ctaSource: checkoutAttribution.cta_source,
      returnTo: checkoutAttribution.return_to
    });
    const cancelRedirectUrl = appendCheckoutReturnParams({
      userUrl: cancelUrl,
      defaultUrl: defaultCancelUrl.toString(),
      payment: 'cancel',
      orderId: order.id,
      checkoutType: type,
      productId: id,
      ctaSource: checkoutAttribution.cta_source,
      returnTo: checkoutAttribution.return_to
    });
    const stripeAttributionMetadata: Stripe.MetadataParam = {};
    if (checkoutAttribution.cta_source) {
      stripeAttributionMetadata.checkout_source =
        checkoutAttribution.cta_source;
    }
    if (checkoutAttribution.return_to) {
      stripeAttributionMetadata.return_to = checkoutAttribution.return_to.slice(
        0,
        500
      );
    }
    if (checkoutAttribution.page_referrer) {
      stripeAttributionMetadata.page_referrer =
        checkoutAttribution.page_referrer.slice(0, 500);
    }
    Object.entries(checkoutAttribution.utm || {}).forEach(([key, value]) => {
      stripeAttributionMetadata[key] = value.slice(0, 500);
    });
    if (typeof referralCheckoutMetadata?.referral_id === 'string') {
      stripeAttributionMetadata.referral_id =
        referralCheckoutMetadata.referral_id.slice(0, 500);
    }
    if (typeof referralCheckoutMetadata?.referrer_id === 'string') {
      stripeAttributionMetadata.referrer_id =
        referralCheckoutMetadata.referrer_id.slice(0, 500);
    }
    if (typeof referralCheckoutMetadata?.referral_status === 'string') {
      stripeAttributionMetadata.referral_status =
        referralCheckoutMetadata.referral_status.slice(0, 500);
    }

    if (!stripe) {
      throw new Error('Stripe checkout is not configured');
    }

    const checkoutDiscounts: Stripe.Checkout.SessionCreateParams['discounts'] =
      [
        ...(trialUpgradeCouponId ? [{ coupon: trialUpgradeCouponId }] : []),
        ...(promo ? [{ promotion_code: promo.promotionCodeId }] : [])
      ];

    // 创建 Stripe Checkout Session
    try {
      const sessionParams: Stripe.Checkout.SessionCreateParams = {
        line_items: stripePriceId
          ? [{ price: stripePriceId, quantity: 1 }]
          : [
              {
                price_data: {
                  currency: 'usd',
                  product_data: { name: productName },
                  // 有促销时行项目保持原价，折扣交给 Stripe coupon 计算，
                  // 防止 price_data 兜底路径下双重折扣导致 webhook 金额不匹配。
                  unit_amount: getStripeCheckoutUnitAmountCents({
                    fullAmountUsdCents: promoBaseAmountUsdCents,
                    chargedAmountUsdCents,
                    promoApplied: Boolean(promo)
                  }),
                  ...(type === 'subscription'
                    ? {
                        recurring: {
                          interval: billingCycle === 'yearly' ? 'year' : 'month'
                        }
                      }
                    : {})
                },
                quantity: 1
              }
            ],
        mode: type === 'subscription' ? 'subscription' : 'payment',
        ...(checkoutDiscounts.length > 0
          ? { discounts: checkoutDiscounts }
          : {}),
        success_url: successRedirectUrl,
        cancel_url: cancelRedirectUrl,
        integration_identifier: createStripeIntegrationIdentifier(),
        client_reference_id: userId,
        customer_email: userEmail,
        ...(type === 'subscription'
          ? {
              subscription_data: {
                metadata: {
                  order_id: order.id,
                  user_id: userId,
                  plan_id: id,
                  billing_cycle: billingCycle,
                  ...(promo ? { promo_code: promo.code } : {}),
                  ...stripeAttributionMetadata
                }
              }
            }
          : {}),
        metadata: {
          order_id: order.id,
          user_id: userId,
          product_type: type,
          product_id: id,
          ...(promo ? { promo_code: promo.code } : {}),
          ...stripeAttributionMetadata
        }
      };

      const session = await stripe.checkout.sessions.create(sessionParams, {
        idempotencyKey: `payment-order:${order.id}`
      });

      // 更新订单，关联 Stripe Session ID
      await orderDb
        .from('payment_orders')
        .update({ provider_order_id: session.id })
        .eq('id', order.id);

      return jsonResponse({
        id: order.id,
        sessionId: session.id,
        url: session.url,
        paymentProvider: 'stripe'
      });
    } catch (stripeError: unknown) {
      console.error('[Checkout] Stripe Session Error:', stripeError);
      const errorSummary =
        stripeError instanceof Error ? stripeError.message : 'Unknown error';
      await reconcileFailedCheckoutOrder({
        supabase: orderDb,
        order: createdOrder,
        errorCode: 'CHECKOUT_PROVIDER_ERROR',
        errorSummary
      });

      return jsonResponse(
        {
          error: 'Unable to start checkout',
          errorCode: 'CHECKOUT_PROVIDER_ERROR'
        },
        502
      );
    }
  } catch (error: unknown) {
    console.error('[Checkout] General Error:', error);
    if (createdOrder) {
      await reconcileFailedCheckoutOrder({
        supabase: orderDb,
        order: createdOrder,
        errorCode: 'CHECKOUT_ERROR',
        errorSummary: error instanceof Error ? error.message : 'Unknown error'
      });
    }
    return jsonResponse(
      { error: 'Unable to start checkout', errorCode: 'CHECKOUT_ERROR' },
      500
    );
  }
}
