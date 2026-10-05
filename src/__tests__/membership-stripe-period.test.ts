import { describe, it, expect } from 'vitest';
import {
  getStripeSubscriptionPeriod,
  getStripeInvoiceSubscriptionId
} from '../../api/membership/stripe-period';
describe('Stripe billing API versions', () => {
  it('uses item periods in Basil and later', () => {
    expect(
      getStripeSubscriptionPeriod({
        items: {
          data: [{ current_period_start: 1000, current_period_end: 2000 }]
        }
      } as never)
    ).toEqual({
      start: '1970-01-01T00:16:40.000Z',
      end: '1970-01-01T00:33:20.000Z'
    });
  });
  it('accepts legacy subscriptions without inventing missing dates', () => {
    expect(
      getStripeSubscriptionPeriod({
        current_period_start: 1000,
        current_period_end: 2000
      } as never).end
    ).toBe('1970-01-01T00:33:20.000Z');
    for (const value of [
      {},
      { items: { data: [] } },
      { current_period_start: 2000, current_period_end: 1000 }
    ])
      expect(() => getStripeSubscriptionPeriod(value as never)).toThrow(
        'missing or invalid'
      );
  });
  it('finds renewal subscription IDs in both invoice schemas', () => {
    for (const subscription of ['sub_1', { id: 'sub_1' }]) {
      expect(
        getStripeInvoiceSubscriptionId({
          parent: { subscription_details: { subscription } }
        } as never)
      ).toBe('sub_1');
      expect(getStripeInvoiceSubscriptionId({ subscription } as never)).toBe(
        'sub_1'
      );
    }
    expect(getStripeInvoiceSubscriptionId({} as never)).toBeNull();
  });
});
