/**
 * Product Hunt 发布优惠码（年付 5 折）策略与校验。
 *
 * 策略：仅适用于 Stripe 订阅、年付套餐。优惠码本体在 Stripe 中创建
 * （coupon percent_off=50 + promotion code），服务端结账时校验后
 * 把 promotion_code 传入 Checkout Session。
 */

import type Stripe from 'stripe';

export const PH_YEARLY_PROMO_PERCENT_OFF = Number(
  process.env.PH_PROMO_PERCENT_OFF || 50
);

export const PH_PROMO_MAX_CODE_LENGTH = 64;

export type PromoEligibilityInput = {
  type: 'subscription' | 'credit_package';
  paymentProvider?: 'stripe' | 'alipay';
  billingCycle: 'monthly' | 'yearly';
};

export function isPromoEligible(input: PromoEligibilityInput): boolean {
  return (
    input.type === 'subscription' &&
    (input.paymentProvider === 'stripe' || input.paymentProvider === 'alipay') &&
    input.billingCycle === 'yearly'
  );
}

export function getPromoDiscountedAmountCents(
  amountCents: number,
  percentOff: number
): number {
  const safePercent = Math.min(100, Math.max(0, percentOff));
  return Math.round(amountCents * (1 - safePercent / 100));
}

/**
 * Product Hunt 年付 5 折的折扣基准：年付原价 = 月付原价 × 12。
 * 明确不能把折后年付价（price_yearly，30% off 后）再打 5 折，
 * 避免「折上折」导致实收远低于年付原价的 5 折。
 */
export function getPromoOriginalAnnualAmountUsdCents(
  monthlyPriceUsdCents: number
): number {
  return Math.round(Number(monthlyPriceUsdCents || 0) * 12);
}

/**
 * Stripe Checkout 行项目单价：有促销时保持原价，让 Stripe 按 coupon 计算
 * 折后实收；避免在 price_data 兜底路径（plan 未绑定 stripe_price_*）
 * 下先打折再打券造成双重折扣、且 webhook 金额与订单不一致。
 */
export function getStripeCheckoutUnitAmountCents(input: {
  fullAmountUsdCents: number;
  chargedAmountUsdCents: number;
  promoApplied: boolean;
}): number {
  return input.promoApplied
    ? input.fullAmountUsdCents
    : input.chargedAmountUsdCents;
}

export type PromoCodeErrorCode =
  | 'PROMO_CODE_INVALID'
  | 'PROMO_CODE_EXPIRED'
  | 'PROMO_CODE_APPLICABLE_YEARLY_ONLY';

export class PromoCodeError extends Error {
  constructor(
    public code: PromoCodeErrorCode,
    message: string
  ) {
    super(message);
    this.name = code;
  }
}

export type ValidatedPromo = {
  code: string;
  promotionCodeId: string;
  couponId: string;
  percentOff: number;
};

export function normalizePromoCode(value: string): string {
  return value.trim().toUpperCase();
}

/**
 * 校验 Stripe 返回的 PromotionCode 是否符合本次优惠策略。
 * 纯函数，便于单元测试；Stripe 对象由调用方通过 API 获取。
 */
export function validatePromotionCode(
  promotionCode: Stripe.PromotionCode,
  expectedPercentOff: number
): Pick<ValidatedPromo, 'promotionCodeId' | 'couponId' | 'percentOff'> {
  if (!promotionCode.active) {
    throw new PromoCodeError('PROMO_CODE_INVALID', 'Invalid promo code.');
  }

  const promotion = promotionCode.promotion;
  if (
    promotion.type !== 'coupon' ||
    !promotion.coupon ||
    typeof promotion.coupon === 'string' ||
    promotion.coupon.deleted
  ) {
    throw new PromoCodeError('PROMO_CODE_INVALID', 'Invalid promo code.');
  }
  const coupon = promotion.coupon;
  if (
    typeof coupon.percent_off !== 'number' ||
    coupon.percent_off !== expectedPercentOff
  ) {
    throw new PromoCodeError(
      'PROMO_CODE_INVALID',
      'This promo code does not match the current offer.'
    );
  }

  if (coupon.currency && coupon.currency !== 'usd') {
    throw new PromoCodeError(
      'PROMO_CODE_INVALID',
      'This promo code does not apply to your currency.'
    );
  }

  if (coupon.redeem_by && coupon.redeem_by * 1000 < Date.now()) {
    throw new PromoCodeError(
      'PROMO_CODE_EXPIRED',
      'This promo code has expired.'
    );
  }

  if (
    typeof promotionCode.max_redemptions === 'number' &&
    promotionCode.times_redeemed >= promotionCode.max_redemptions
  ) {
    throw new PromoCodeError(
      'PROMO_CODE_EXPIRED',
      'This promo code has reached its redemption limit.'
    );
  }

  if (
    promotionCode.expires_at &&
    promotionCode.expires_at * 1000 < Date.now()
  ) {
    throw new PromoCodeError(
      'PROMO_CODE_EXPIRED',
      'This promo code has expired.'
    );
  }

  return {
    promotionCodeId: promotionCode.id,
    couponId: coupon.id,
    percentOff: coupon.percent_off
  };
}

/**
 * 服务端入口：按策略过滤 + 调用 Stripe 查询并校验。
 * 不适用场景直接抛 PROMO_CODE_APPLICABLE_YEARLY_ONLY，避免误用。
 */
export async function resolvePromoCode(params: {
  stripe: Stripe;
  code?: string;
  eligibility: PromoEligibilityInput;
}): Promise<ValidatedPromo | null> {
  const { stripe, code, eligibility } = params;
  if (!code || !code.trim()) return null;

  const normalized = normalizePromoCode(code);
  if (normalized.length > PH_PROMO_MAX_CODE_LENGTH) {
    throw new PromoCodeError('PROMO_CODE_INVALID', 'Invalid promo code.');
  }

  if (!isPromoEligible(eligibility)) {
    throw new PromoCodeError(
      'PROMO_CODE_APPLICABLE_YEARLY_ONLY',
      'This promo code only applies to yearly plans.'
    );
  }

  const list = await stripe.promotionCodes.list({
    code: normalized,
    limit: 1,
    active: true,
    // promotion.coupon 默认只返回 coupon ID 字符串；展开后才能读取
    // percent_off / redeem_by 等策略字段做校验。
    expand: ['data.promotion.coupon']
  });
  const promotionCode = list.data[0];
  if (!promotionCode) {
    throw new PromoCodeError('PROMO_CODE_INVALID', 'Invalid promo code.');
  }

  const validated = validatePromotionCode(
    promotionCode,
    PH_YEARLY_PROMO_PERCENT_OFF
  );
  return { code: normalized, ...validated };
}
