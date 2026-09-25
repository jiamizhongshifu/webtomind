import { describe, expect, it } from 'vitest';
import {
  getApiCreditPackageQuote,
  getApiCreditPaymentAmount,
  getCustomApiCreditQuote,
  getCustomApiRechargeUsdBounds,
  parseWholeUsdAmountToCents,
  usdCentsToCnyCents
} from '../../api/utils/api-credit-pricing';

describe('API credit payment amount', () => {
  it('charges the CNY catalog amount through Alipay', () => {
    expect(
      getApiCreditPaymentAmount({
        paymentProvider: 'alipay',
        catalogAmountCnyCents: 1000,
        apiCreditCents: 100
      })
    ).toEqual({ amount: 1000, currency: 'cny' });
  });

  it('charges the USD API credit amount through Stripe', () => {
    expect(
      getApiCreditPaymentAmount({
        paymentProvider: 'stripe',
        catalogAmountCnyCents: 1000,
        apiCreditCents: 100
      })
    ).toEqual({ amount: 100, currency: 'usd' });
  });

  it('rejects non-integer or empty package amounts', () => {
    expect(() =>
      getApiCreditPaymentAmount({
        paymentProvider: 'stripe',
        catalogAmountCnyCents: 0,
        apiCreditCents: 100
      })
    ).toThrow('Invalid API credit package amount');
  });

  it('converts fixed package CNY prices with the configured server rate', () => {
    expect(
      getApiCreditPackageQuote({
        paymentProvider: 'alipay',
        catalogAmountCnyCents: 1000,
        listedCreditCents: 100,
        usdToCnyRate: 7.2
      })
    ).toEqual({
      catalogAmountCnyCents: 1000,
      apiCreditCents: 138,
      payment: { amount: 1000, currency: 'cny' },
      usdToCnyRate: 7.2
    });
  });

  it('quotes integer USD recharge for both payment providers', () => {
    expect(parseWholeUsdAmountToCents('10')).toBe(1000);
    expect(parseWholeUsdAmountToCents('10.50')).toBeNull();
    expect(usdCentsToCnyCents(1000, 7.2)).toBe(7200);
    expect(
      getCustomApiCreditQuote({
        paymentProvider: 'alipay',
        amountUsdCents: 1000,
        usdToCnyRate: 7.2
      })
    ).toEqual({
      catalogAmountCnyCents: 7200,
      apiCreditCents: 1000,
      payment: { amount: 7200, currency: 'cny' },
      usdToCnyRate: 7.2
    });
    expect(
      getCustomApiCreditQuote({
        paymentProvider: 'stripe',
        amountUsdCents: 500,
        usdToCnyRate: 7.2
      }).payment
    ).toEqual({ amount: 500, currency: 'usd' });
  });

  it('keeps fixed packages denominated in whole USD while recalculating CNY', () => {
    expect(
      getApiCreditPackageQuote({
        paymentProvider: 'alipay',
        catalogAmountCnyCents: 1000,
        listedCreditCents: 138,
        canonicalCreditCents: 1000,
        usdToCnyRate: 7.2
      })
    ).toMatchObject({
      catalogAmountCnyCents: 7200,
      apiCreditCents: 1000,
      payment: { amount: 7200, currency: 'cny' }
    });
  });

  it('keeps custom USD bounds inside the provider CNY cap', () => {
    expect(getCustomApiRechargeUsdBounds(7.2)).toEqual({
      minUsdCents: 100,
      maxUsdCents: 138800
    });
    expect(() =>
      getCustomApiCreditQuote({
        paymentProvider: 'alipay',
        amountUsdCents: 50,
        usdToCnyRate: 7.2
      })
    ).toThrow('Invalid custom API recharge amount');
    expect(() =>
      getCustomApiCreditQuote({
        paymentProvider: 'alipay',
        amountUsdCents: 138900,
        usdToCnyRate: 7.2
      })
    ).toThrow('Invalid custom API recharge amount');
  });
});
