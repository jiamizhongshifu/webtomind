export const PRODUCT_SCOPE = 'siskill' as const;
export const SITE_ORIGIN = 'https://siskill.dev';
export type Provider = 'stripe' | 'zpay';
export interface Order {
  id: string;
  user_id: string;
  sku: string;
  release_id: string;
  product_scope: 'siskill';
  provider: Provider;
  status: string;
  amount: number;
  currency: 'usd' | 'cny';
  checkout_id: string | null;
  checkout_url: string | null;
  provider_payment_id: string | null;
  snapshot: {
    locale: string;
    name: string;
    slug: string;
    version: string;
    sha256: string;
    bytes: number;
    contract_version: string;
  };
}
export class CommerceError extends Error {
  constructor(
    public code: string,
    public status = 400
  ) {
    super(code);
  }
}
export function checkoutInput(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new CommerceError('INVALID_CHECKOUT');
  const v = input as Record<string, unknown>;
  if (Object.keys(v).some((k) => !['sku', 'provider', 'locale'].includes(k)))
    throw new CommerceError('UNSUPPORTED_CHECKOUT_FIELD');
  if (typeof v.sku !== 'string' || !/^siskill_[a-z0-9_]{1,100}$/.test(v.sku))
    throw new CommerceError('INVALID_SKU');
  if (!['stripe', 'alipay'].includes(String(v.provider)))
    throw new CommerceError('INVALID_PROVIDER');
  if (v.locale !== undefined && !['en-US', 'zh-CN'].includes(String(v.locale)))
    throw new CommerceError('INVALID_LOCALE');
  return {
    sku: v.sku,
    provider: (v.provider === 'alipay' ? 'zpay' : 'stripe') as Provider,
    locale: v.locale === 'zh-CN' ? 'zh-CN' : 'en-US'
  };
}
export function paymentMetadata(order: Order) {
  if (order.product_scope !== PRODUCT_SCOPE)
    throw new CommerceError('PRODUCT_SCOPE_MISMATCH', 409);
  return { product_scope: PRODUCT_SCOPE, order_id: order.id, sku: order.sku };
}
export function verifyMetadata(
  order: Order,
  metadata: Record<string, string> | null | undefined
) {
  const expected = paymentMetadata(order);
  if (!metadata || Object.entries(expected).some(([k, v]) => metadata[k] !== v))
    throw new CommerceError('PRODUCT_SCOPE_MISMATCH', 409);
}
export function returnUrls(orderId: string, locale: string) {
  if (!/^[a-f0-9-]{36}$/.test(orderId))
    throw new CommerceError('INVALID_ORDER');
  const base = `${SITE_ORIGIN}/${locale === 'zh-CN' ? 'zh-CN' : 'en-US'}/account`;
  return {
    success: `${base}?order=${orderId}`,
    cancel: `${base}?order=${orderId}&cancelled=1`
  };
}
export function assertCheckoutUrl(url: string) {
  const parsed = new URL(url);
  if (
    parsed.origin !== 'https://checkout.stripe.com' ||
    parsed.username ||
    parsed.password
  )
    throw new CommerceError('INVALID_PROVIDER_URL', 502);
  return url;
}
