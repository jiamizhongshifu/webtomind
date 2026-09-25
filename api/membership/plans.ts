/**
 * Vercel Serverless Function - /api/membership/plans
 * Return subscription plans for the pricing page.
 */

import { createClient } from '@supabase/supabase-js';
import { getCorsHeadersForRequest } from '../utils/auth';
import { hasStripeCheckoutConfig } from '../utils/stripe-env';
import {
  getZpayConfig,
  hasZpayCheckoutConfig,
  usdCentsToCnyCents
} from '../utils/zpay';
import {
  FREE_DAILY_CREDITS,
  isFreePlanName,
  normalizePlanLimits
} from '../../src/shared/credit-policy';
import { CLIENT_FALLBACK_SUBSCRIPTION_PLANS } from '../../src/shared/pricing-catalog';

export const config = {
  runtime: 'edge'
};

type RawPlan = {
  id: string;
  name: string;
  display_name?: Record<string, string>;
  price_monthly?: number;
  price_yearly?: number;
  monthly_credits?: number;
  features?: Record<string, unknown>;
  limits?: Record<string, unknown>;
  sort_order?: number;
  is_active?: boolean;
};

function formatPlan(
  plan: RawPlan,
  options: {
    checkoutEnabled: boolean;
    checkoutProviders?: Array<'stripe' | 'alipay'>;
    alipayUsdToCnyRate?: number;
    checkoutUnavailableReason?: string;
  }
) {
  return {
    id: plan.id,
    name: plan.name,
    displayName: plan.display_name,
    priceMonthly: plan.price_monthly,
    priceYearly: plan.price_yearly,
    monthlyCredits: isFreePlanName(plan.name)
      ? FREE_DAILY_CREDITS
      : plan.monthly_credits,
    features: plan.features,
    limits: normalizePlanLimits(plan.limits, plan.name),
    sortOrder: plan.sort_order,
    isActive: plan.is_active,
    checkoutEnabled: options.checkoutEnabled,
    checkoutProviders: options.checkoutProviders,
    checkoutPrices:
      options.alipayUsdToCnyRate &&
      Number(plan.price_monthly || 0) > 0 &&
      Number(plan.price_yearly || 0) > 0
        ? {
            alipay: {
              currency: 'CNY' as const,
              priceMonthly: usdCentsToCnyCents(
                Number(plan.price_monthly),
                options.alipayUsdToCnyRate
              ),
              priceYearly: usdCentsToCnyCents(
                Number(plan.price_yearly),
                options.alipayUsdToCnyRate
              )
            }
          }
        : undefined,
    checkoutUnavailableReason: options.checkoutUnavailableReason
  };
}

function buildFallbackPlans(
  checkoutProviders: Array<'stripe' | 'alipay'>,
  alipayUsdToCnyRate?: number
) {
  return CLIENT_FALLBACK_SUBSCRIPTION_PLANS.map((plan) => ({
    ...plan,
    checkoutEnabled: plan.name === 'free' || checkoutProviders.length > 0,
    checkoutProviders:
      plan.name === 'free' ? [] : checkoutProviders,
    checkoutPrices:
      plan.name !== 'free' && alipayUsdToCnyRate
        ? {
            alipay: {
              currency: 'CNY' as const,
              priceMonthly: usdCentsToCnyCents(
                plan.priceMonthly,
                alipayUsdToCnyRate
              ),
              priceYearly: usdCentsToCnyCents(
                plan.priceYearly,
                alipayUsdToCnyRate
              )
            }
          }
        : undefined,
    checkoutUnavailableReason:
      plan.name === 'free' || checkoutProviders.length > 0
        ? undefined
        : 'pricing_unconfigured'
  }));
}

export default async function handler(request: Request) {
  const corsHeaders = getCorsHeadersForRequest(request);
  const hasStripeCheckout = hasStripeCheckoutConfig();
  const zpayConfig = hasZpayCheckoutConfig() ? getZpayConfig() : null;
  const hasZpayCheckout = Boolean(zpayConfig);
  const checkoutProviders: Array<'stripe' | 'alipay'> = [
    ...(hasStripeCheckout ? (['stripe'] as const) : []),
    ...(hasZpayCheckout ? (['alipay'] as const) : [])
  ];

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

  if (request.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return jsonResponse({
      plans: buildFallbackPlans(
        checkoutProviders,
        zpayConfig?.usdToCnyRate
      )
    });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { data: plans, error } = await supabase
      .from('subscription_plans')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (error) {
      console.error('[Plans] Fetch error:', error);
      return jsonResponse({
        plans: buildFallbackPlans(
          checkoutProviders,
          zpayConfig?.usdToCnyRate
        )
      });
    }

    if (!plans || plans.length === 0) {
      return jsonResponse({
        plans: buildFallbackPlans(
          checkoutProviders,
          zpayConfig?.usdToCnyRate
        )
      });
    }

    const formattedPlans = plans.map((plan) =>
      formatPlan(plan, {
        checkoutEnabled:
          plan.name === 'free'
            ? true
            : checkoutProviders.length > 0 &&
              Number(plan.price_monthly || 0) > 0 &&
              Number(plan.price_yearly || 0) > 0,
        checkoutProviders:
          plan.name === 'free' ? [] : checkoutProviders,
        alipayUsdToCnyRate: zpayConfig?.usdToCnyRate,
        checkoutUnavailableReason: checkoutProviders.length > 0
          ? undefined
          : 'payment_not_configured'
      })
    );

    return jsonResponse({ plans: formattedPlans });
  } catch (error) {
    console.error('[Plans] Error:', error);
    return jsonResponse({
      plans: buildFallbackPlans(
        checkoutProviders,
        zpayConfig?.usdToCnyRate
      )
    });
  }
}
