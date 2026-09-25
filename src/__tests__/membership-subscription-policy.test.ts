import { describe, expect, it } from 'vitest';
import {
  blocksNewPaidSubscriptionCheckout,
  blocksNewSubscriptionCheckout,
  findSubscriptionBlockingCheckout,
  findSubscriptionBlockingNewPaidCheckout,
  findSubscriptionWithPaidAccess,
  hasPaidSubscriptionAccess,
  isEligibleForSubscriptionCreditGrant
} from '../../api/membership/subscription-policy';

const NOW = new Date('2026-07-21T00:00:00.000Z');

describe('membership subscription policy', () => {
  it.each(['active', 'trialing', 'past_due'])(
    'blocks a second checkout for %s subscriptions',
    (status) => {
      expect(blocksNewSubscriptionCheckout({ status }, NOW)).toBe(true);
    }
  );

  it('blocks checkout for a canceled subscription until its paid period ends', () => {
    expect(
      blocksNewSubscriptionCheckout(
        {
          status: 'canceled',
          current_period_end: '2026-07-22T00:00:00.000Z'
        },
        NOW
      )
    ).toBe(true);
    expect(
      blocksNewSubscriptionCheckout(
        {
          status: 'canceled',
          current_period_end: '2026-07-20T23:59:59.000Z'
        },
        NOW
      )
    ).toBe(false);
    expect(
      blocksNewSubscriptionCheckout(
        {
          status: 'cancelled',
          current_period_end: '2026-07-22T00:00:00.000Z'
        },
        NOW
      )
    ).toBe(true);
  });

  it('lets an unexpired canceled legacy entitlement convert to a paid subscription', () => {
    const legacyEntitlement = {
      id: 'legacy-test-entitlement',
      status: 'canceled',
      current_period_end: '2026-07-22T00:00:00.000Z',
      stripe_customer_id: null,
      stripe_subscription_id: null
    };

    expect(blocksNewSubscriptionCheckout(legacyEntitlement, NOW)).toBe(true);
    expect(blocksNewPaidSubscriptionCheckout(legacyEntitlement, NOW)).toBe(
      false
    );
    expect(hasPaidSubscriptionAccess(legacyEntitlement, NOW)).toBe(true);
  });

  it('keeps canceled Stripe subscriptions in the Billing Portal flow', () => {
    const stripeSubscription = {
      id: 'stripe-subscription',
      status: 'canceled',
      current_period_end: '2026-07-22T00:00:00.000Z',
      stripe_customer_id: 'cus_1',
      stripe_subscription_id: 'sub_1'
    };

    expect(blocksNewPaidSubscriptionCheckout(stripeSubscription, NOW)).toBe(
      true
    );
    expect(
      findSubscriptionBlockingNewPaidCheckout([stripeSubscription], NOW)?.id
    ).toBe('stripe-subscription');
  });

  it('still blocks active legacy rows until they are explicitly migrated', () => {
    expect(
      blocksNewPaidSubscriptionCheckout(
        {
          status: 'active',
          stripe_customer_id: null,
          stripe_subscription_id: null
        },
        NOW
      )
    ).toBe(true);
  });

  it('fails paid access closed while payment is past due', () => {
    expect(hasPaidSubscriptionAccess({ status: 'past_due' }, NOW)).toBe(false);
    expect(hasPaidSubscriptionAccess({ status: 'active' }, NOW)).toBe(true);
    expect(hasPaidSubscriptionAccess({ status: 'trialing' }, NOW)).toBe(true);
  });

  it('keeps canceled access only for an unexpired paid period', () => {
    expect(
      hasPaidSubscriptionAccess(
        {
          status: 'canceled',
          current_period_end: '2026-07-22T00:00:00.000Z'
        },
        NOW
      )
    ).toBe(true);
    expect(
      hasPaidSubscriptionAccess(
        {
          status: 'canceled',
          current_period_end: '2026-07-20T23:59:59.000Z'
        },
        NOW
      )
    ).toBe(false);
    expect(
      hasPaidSubscriptionAccess(
        {
          status: 'cancelled',
          current_period_end: '2026-07-22T00:00:00.000Z'
        },
        NOW
      )
    ).toBe(true);
  });

  it('grants recurring credits only to paid or trialing subscriptions', () => {
    expect(isEligibleForSubscriptionCreditGrant({ status: 'active' })).toBe(
      true
    );
    expect(isEligibleForSubscriptionCreditGrant({ status: 'trialing' })).toBe(
      true
    );
    expect(isEligibleForSubscriptionCreditGrant({ status: 'past_due' })).toBe(
      false
    );
    expect(isEligibleForSubscriptionCreditGrant({ status: 'canceled' })).toBe(
      false
    );
  });

  it('does not let a newer expired row hide an older active subscription', () => {
    const subscriptions = [
      {
        id: 'new-expired',
        status: 'canceled',
        current_period_end: '2026-07-20T23:59:59.000Z'
      },
      {
        id: 'older-active',
        status: 'active',
        current_period_end: '2026-08-21T00:00:00.000Z'
      }
    ];

    expect(findSubscriptionBlockingCheckout(subscriptions, NOW)?.id).toBe(
      'older-active'
    );
    expect(findSubscriptionWithPaidAccess(subscriptions, NOW)?.id).toBe(
      'older-active'
    );
  });
});
