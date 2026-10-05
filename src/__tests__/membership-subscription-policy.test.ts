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
      expect(
        blocksNewSubscriptionCheckout(
          { status, stripe_subscription_id: 'sub_1' },
          NOW
        )
      ).toBe(true);
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

  it('does not block renewal of a legacy row with no valid period', () => {
    expect(
      blocksNewPaidSubscriptionCheckout(
        {
          status: 'active',
          stripe_customer_id: null,
          stripe_subscription_id: null
        },
        NOW
      )
    ).toBe(false);
  });

  it('fails paid access closed while payment is past due', () => {
    expect(hasPaidSubscriptionAccess({ status: 'past_due' }, NOW)).toBe(false);
    expect(
      hasPaidSubscriptionAccess(
        { status: 'active', current_period_end: '2099-01-01' },
        NOW
      )
    ).toBe(true);
    expect(
      hasPaidSubscriptionAccess(
        { status: 'trialing', current_period_end: '2099-01-01' },
        NOW
      )
    ).toBe(true);
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
    expect(
      isEligibleForSubscriptionCreditGrant({
        status: 'active',
        current_period_end: '2099-01-01'
      })
    ).toBe(true);
    expect(
      isEligibleForSubscriptionCreditGrant({
        status: 'trialing',
        current_period_end: '2099-01-01'
      })
    ).toBe(true);
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

describe('subscription expiry boundary', () => {
  it.each(['active', 'trialing', 'canceled', 'cancelled'])(
    'expires %s at the exact period end',
    (status) => {
      const expired = { status, current_period_end: NOW.toISOString() };
      expect(hasPaidSubscriptionAccess(expired, NOW)).toBe(false);
      expect(isEligibleForSubscriptionCreditGrant(expired, NOW)).toBe(false);
      expect(blocksNewPaidSubscriptionCheckout(expired, NOW)).toBe(false);
    }
  );
  it('denies access but prevents a second recurring bill for a stale Stripe period', () => {
    const expired = {
      status: 'active',
      current_period_end: NOW.toISOString(),
      stripe_subscription_id: 'sub_live'
    };
    expect(hasPaidSubscriptionAccess(expired, NOW)).toBe(false);
    expect(blocksNewPaidSubscriptionCheckout(expired, NOW)).toBe(true);
  });
  it.each([null, 'invalid'])(
    'fails closed for a missing or invalid period %s',
    (end) => {
      expect(
        hasPaidSubscriptionAccess(
          { status: 'active', current_period_end: end },
          NOW
        )
      ).toBe(false);
    }
  );
});
