import { describe, expect, it } from 'vitest';
import {
  getCheckoutBillingCycle,
  getCheckoutRequestValidationError
} from '../../api/membership/checkout';

describe('membership checkout request validation', () => {
  it('defaults legacy subscription requests to yearly billing', () => {
    expect(getCheckoutBillingCycle()).toBe('yearly');
    expect(getCheckoutBillingCycle('monthly')).toBe('monthly');
    expect(getCheckoutBillingCycle('yearly')).toBe('yearly');
  });

  it('accepts supported products and billing cycles', () => {
    expect(
      getCheckoutRequestValidationError({
        type: 'subscription',
        id: 'pro',
        billingCycle: 'yearly',
        paymentProvider: 'alipay'
      })
    ).toBeNull();
    expect(
      getCheckoutRequestValidationError({
        type: 'credit_package',
        id: 'pack_1k'
      })
    ).toBeNull();
  });

  it('rejects unsupported runtime values before creating an order', () => {
    expect(
      getCheckoutRequestValidationError({ type: 'unknown', id: 'pack_1k' })
    ).toBe('Invalid checkout type');
    expect(
      getCheckoutRequestValidationError({ type: 'subscription', id: '' })
    ).toBe('Invalid product id');
    expect(
      getCheckoutRequestValidationError({
        type: 'subscription',
        id: 'pro',
        billingCycle: 'weekly'
      })
    ).toBe('Invalid billing cycle');
    expect(
      getCheckoutRequestValidationError({
        type: 'subscription',
        id: 'pro',
        paymentProvider: 'bank_transfer'
      })
    ).toBe('Invalid payment provider');
  });

  it('accepts a custom API recharge only with an integer USD amount', () => {
    expect(
      getCheckoutRequestValidationError({
        type: 'api_credit_package',
        id: 'custom',
        customAmountUsdCents: 1000
      })
    ).toBeNull();
    expect(
      getCheckoutRequestValidationError({
        type: 'api_credit_package',
        id: 'custom',
        customAmountUsdCents: 1050
      })
    ).toBe('Custom API recharge must be a whole USD amount');
    expect(
      getCheckoutRequestValidationError({
        type: 'api_credit_package',
        id: 'api_cny_10',
        customAmountUsdCents: 1000
      })
    ).toBe('Invalid custom API recharge request');
  });
});
