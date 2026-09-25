import {
  getCanonicalApiCreditCents,
  getApiCreditPackageQuote,
  getConfiguredApiCreditUsdToCnyRate,
  getCustomApiRechargeUsdBounds
} from '../utils/api-credit-pricing';
import {
  requireUserContextPublic,
  jsonResponse,
  preflightResponse
} from './runtime';
import { hasStripeCheckoutConfig } from '../utils/stripe-env';
import { getZpayConfig, hasZpayCheckoutConfig } from '../utils/zpay';

export const config = { runtime: 'edge' };

export default async function handler(request: Request) {
  const preflight = preflightResponse(request);
  if (preflight) return preflight;
  if (request.method !== 'GET')
    return jsonResponse(request, { error: 'Method not allowed' }, 405);
  const context = await requireUserContextPublic(request);
  if (!context) {
    return jsonResponse(
      request,
      { error: '登录后可查看 API 充值套餐' },
      401
    );
  }
  const supabase = context.supabase;
  if (!supabase)
    return jsonResponse(request, { error: 'Database not configured' }, 500);
  const { data, error } = await supabase
    .from('api_credit_packages')
    .select('id,name,price_cents,credit_cents,metadata,sort_order,is_active')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  if (error) {
    console.error('[ApiMarketplace] Package fetch failed:', error);
    return jsonResponse(request, { error: 'API 充值套餐暂时不可用' }, 503);
  }
  const usdToCnyRate = getConfiguredApiCreditUsdToCnyRate();
  if (!usdToCnyRate) {
    // Never show a stale credit amount when the settlement rate is missing.
    // The same server-side guard is applied again during checkout.
    return jsonResponse(
      request,
      { error: 'API 充值汇率暂时不可用，请稍后重试' },
      503
    );
  }
  let packages;
  try {
    packages = (data || []).map((pkg) => {
      const canonicalCreditCents = getCanonicalApiCreditCents(pkg.metadata);
      const quote = getApiCreditPackageQuote({
        paymentProvider: 'stripe',
        catalogAmountCnyCents: Number(pkg.price_cents),
        listedCreditCents: Number(pkg.credit_cents),
        canonicalCreditCents,
        usdToCnyRate
      });
      if (quote.apiCreditCents % 100 !== 0) {
        throw new Error(
          `API credit package ${pkg.id} is missing an integer USD catalog amount`
        );
      }
      const packageName = canonicalCreditCents
        ? `$${canonicalCreditCents / 100} 充值`
        : pkg.name;
      return {
        ...pkg,
        name: packageName,
        price_cents: quote.catalogAmountCnyCents,
        credit_cents: quote.apiCreditCents
      };
    });
  } catch (error) {
    console.error('[ApiMarketplace] Package pricing validation failed:', error);
    return jsonResponse(
      request,
      { error: 'API 充值套餐配置暂时不可用，请稍后重试' },
      503
    );
  }
  const checkoutProviders: Array<'stripe' | 'alipay'> = [
    ...(hasStripeCheckoutConfig() ? (['stripe'] as const) : []),
    ...(hasZpayCheckoutConfig() && getZpayConfig() ? (['alipay'] as const) : [])
  ];
  const customUsdBounds = getCustomApiRechargeUsdBounds(usdToCnyRate);
  return jsonResponse(
    request,
    {
      packages,
      checkoutProviders,
      pricing: {
        usdToCnyRate,
        customAvailable: Boolean(usdToCnyRate),
        customMinUsdCents: customUsdBounds.minUsdCents,
        customMaxUsdCents: customUsdBounds.maxUsdCents
      }
    },
    200,
    {
      'Cache-Control': 'private, no-store'
    }
  );
}
