import { describe, expect, it, vi } from 'vitest';
import {
  PH_YEARLY_PROMO_PERCENT_OFF,
  PromoCodeError,
  getPromoDiscountedAmountCents,
  getPromoOriginalAnnualAmountUsdCents,
  getStripeCheckoutUnitAmountCents,
  isPromoEligible,
  normalizePromoCode,
  resolvePromoCode,
  validatePromotionCode
} from '../../api/utils/promo-codes';
import type Stripe from 'stripe';

function fakePromotionCode(
  overrides: Partial<Stripe.PromotionCode> = {},
  couponOverrides: Partial<Stripe.Coupon> = {}
): Stripe.PromotionCode {
  return {
    id: 'promo_ph_test',
    object: 'promotion_code',
    code: 'WEBTOMIND50',
    active: true,
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    metadata: {},
    times_redeemed: 0,
    expires_at: null,
    max_redemptions: null,
    first_time_transaction: false,
    restrictions: { first_time_transaction: false },
    promotion: {
      type: 'coupon',
      coupon: {
        id: 'ph_yearly_50_test',
        object: 'coupon',
        percent_off: PH_YEARLY_PROMO_PERCENT_OFF,
        amount_off: null,
        currency: null,
        created: Math.floor(Date.now() / 1000),
        duration: 'once',
        livemode: false,
        duration_in_months: null,
        max_redemptions: null,
        metadata: {},
        name: 'Product Hunt launch',
        redeem_by: null,
        times_redeemed: 0,
        valid: true,
        ...couponOverrides
      }
    },
    ...overrides
  } as unknown as Stripe.PromotionCode;
}

describe('promo-codes policy', () => {
  it('only applies to yearly Stripe subscriptions', () => {
    expect(
      isPromoEligible({
        type: 'subscription',
        paymentProvider: 'stripe',
        billingCycle: 'yearly'
      })
    ).toBe(true);
    expect(
      isPromoEligible({
        type: 'subscription',
        paymentProvider: 'stripe',
        billingCycle: 'monthly'
      })
    ).toBe(false);
    expect(
      isPromoEligible({
        type: 'subscription',
        paymentProvider: 'alipay',
        billingCycle: 'yearly'
      })
    ).toBe(true);
    expect(
      isPromoEligible({
        type: 'subscription',
        paymentProvider: 'alipay',
        billingCycle: 'monthly'
      })
    ).toBe(false);
    expect(
      isPromoEligible({
        type: 'credit_package',
        paymentProvider: 'stripe',
        billingCycle: 'yearly'
      })
    ).toBe(false);
  });

  it('computes discounted amount with rounding', () => {
    // 年付 5 折基准是「年付原价」（月付 × 12），不是折后年付价。
    expect(getPromoDiscountedAmountCents(24000, 50)).toBe(12000);
    expect(getPromoDiscountedAmountCents(120000, 50)).toBe(60000);
    expect(getPromoDiscountedAmountCents(9999, 33)).toBe(6699);
  });

  it('derives the Product Hunt annual promo base from the monthly list price', () => {
    expect(getPromoOriginalAnnualAmountUsdCents(2000)).toBe(24000);
    expect(getPromoOriginalAnnualAmountUsdCents(10000)).toBe(120000);
    expect(getPromoOriginalAnnualAmountUsdCents(0)).toBe(0);
  });

  it('keeps the full unit amount when a promo coupon is applied', () => {
    expect(
      getStripeCheckoutUnitAmountCents({
        fullAmountUsdCents: 24000,
        chargedAmountUsdCents: 12000,
        promoApplied: true
      })
    ).toBe(24000);
    expect(
      getStripeCheckoutUnitAmountCents({
        fullAmountUsdCents: 14400,
        chargedAmountUsdCents: 14400,
        promoApplied: false
      })
    ).toBe(14400);
  });

  it('normalizes code to uppercase and trims', () => {
    expect(normalizePromoCode('  webtomind50 ')).toBe('WEBTOMIND50');
  });

});

describe('validatePromotionCode', () => {
  it('accepts an active 50%-off coupon', () => {
    const result = validatePromotionCode(
      fakePromotionCode(),
      PH_YEARLY_PROMO_PERCENT_OFF
    );
    expect(result).toEqual({
      promotionCodeId: 'promo_ph_test',
      couponId: 'ph_yearly_50_test',
      percentOff: PH_YEARLY_PROMO_PERCENT_OFF
    });
  });

  it('rejects inactive promotion codes', () => {
    expect(() =>
      validatePromotionCode(
        fakePromotionCode({ active: false }),
        PH_YEARLY_PROMO_PERCENT_OFF
      )
    ).toThrowError(PromoCodeError);
  });

  it('rejects coupons with a different percent off', () => {
    expect(() =>
      validatePromotionCode(
        fakePromotionCode({}, { percent_off: 30 }),
        PH_YEARLY_PROMO_PERCENT_OFF
      )
    ).toThrowError(PromoCodeError);
  });

  it('rejects expired coupons', () => {
    const past = Math.floor(Date.now() / 1000) - 60;
    expect(() =>
      validatePromotionCode(
        fakePromotionCode({}, { redeem_by: past }),
        PH_YEARLY_PROMO_PERCENT_OFF
      )
    ).toThrowError(/expired/i);
  });

  it('rejects promotion codes past their own expires_at', () => {
    const past = Math.floor(Date.now() / 1000) - 60;
    expect(() =>
      validatePromotionCode(
        fakePromotionCode({ expires_at: past }),
        PH_YEARLY_PROMO_PERCENT_OFF
      )
    ).toThrowError(/expired/i);
  });

  it('rejects fully redeemed coupons', () => {
    expect(() =>
      validatePromotionCode(
        fakePromotionCode(
          { times_redeemed: 5, max_redemptions: 5 },
          { max_redemptions: 5, times_redeemed: 5 }
        ),
        PH_YEARLY_PROMO_PERCENT_OFF
      )
    ).toThrowError(/redemption limit/i);
  });
});

describe('resolvePromoCode', () => {
  it('returns null when no code is provided', async () => {
    const result = await resolvePromoCode({
      stripe: {} as Stripe,
      eligibility: {
        type: 'subscription',
        paymentProvider: 'stripe',
        billingCycle: 'yearly'
      }
    });
    expect(result).toBeNull();
  });

  it('rejects codes for ineligible flows without calling Stripe', async () => {
    const list = vi.fn();
    await expect(
      resolvePromoCode({
        stripe: {
          promotionCodes: { list }
        } as unknown as Stripe,
        code: 'WEBTOMIND50',
        eligibility: {
          type: 'subscription',
          paymentProvider: 'stripe',
          billingCycle: 'monthly'
        }
      })
    ).rejects.toMatchObject({ code: 'PROMO_CODE_APPLICABLE_YEARLY_ONLY' });
    expect(list).not.toHaveBeenCalled();
  });

  it('resolves a valid promotion code for Alipay yearly checkout', async () => {
    const promo = fakePromotionCode();
    const result = await resolvePromoCode({
      stripe: {
        promotionCodes: {
          list: vi.fn().mockResolvedValue({ data: [promo] })
        }
      } as unknown as Stripe,
      code: 'WEBTOMIND50',
      eligibility: {
        type: 'subscription',
        paymentProvider: 'alipay',
        billingCycle: 'yearly'
      }
    });
    expect(result).toMatchObject({
      code: 'WEBTOMIND50',
      percentOff: PH_YEARLY_PROMO_PERCENT_OFF
    });
  });

  it('resolves a valid promotion code from Stripe', async () => {
    const promo = fakePromotionCode();
    const list = vi.fn().mockResolvedValue({ data: [promo] });
    const result = await resolvePromoCode({
      stripe: {
        promotionCodes: {
          list
        }
      } as unknown as Stripe,
      code: ' webtomind50 ',
      eligibility: {
        type: 'subscription',
        paymentProvider: 'stripe',
        billingCycle: 'yearly'
      }
    });
    expect(result).toMatchObject({
      code: 'WEBTOMIND50',
      promotionCodeId: promo.id,
      percentOff: PH_YEARLY_PROMO_PERCENT_OFF
    });
    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({ expand: ['data.promotion.coupon'] })
    );
  });

  it('rejects unknown codes', async () => {
    await expect(
      resolvePromoCode({
        stripe: {
          promotionCodes: {
            list: vi.fn().mockResolvedValue({ data: [] })
          }
        } as unknown as Stripe,
        code: 'NOPE',
        eligibility: {
          type: 'subscription',
          paymentProvider: 'stripe',
          billingCycle: 'yearly'
        }
      })
    ).rejects.toMatchObject({ code: 'PROMO_CODE_INVALID' });
  });
});
