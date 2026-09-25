import { describe, expect, it, vi } from 'vitest';
import {
  reconcilePaidSubscription,
  syncStripeSubscription
} from '../../api/membership/webhook';

const values = {
  user_id: 'user-1',
  plan_id: 'pro',
  status: 'active' as const,
  billing_cycle: 'yearly',
  current_period_start: '2026-07-21T00:00:00.000Z',
  current_period_end: '2027-07-21T00:00:00.000Z',
  stripe_subscription_id: 'sub_new',
  stripe_customer_id: 'cus_1',
  updated_at: '2026-07-21T00:00:00.000Z'
};

function createSubscriptionMock(
  existing: Record<string, unknown> | Record<string, unknown>[] | null
) {
  const update = vi.fn(() => ({
    eq: vi.fn(async () => ({ error: null }))
  }));
  const insert = vi.fn(async () => ({ error: null }));
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    in: vi.fn(() => query),
    order: vi.fn(() => query),
    then: (
      resolve: (result: {
        data: Record<string, unknown>[];
        error: null;
      }) => unknown
    ) =>
      Promise.resolve({
        data: Array.isArray(existing) ? existing : existing ? [existing] : [],
        error: null
      }).then(resolve),
    update,
    insert
  };
  return {
    supabase: { from: vi.fn(() => query) },
    update,
    insert
  };
}

describe('paid subscription reconciliation', () => {
  it('updates the existing paid row instead of inserting a second active row', async () => {
    const mock = createSubscriptionMock({
      id: 'existing-1',
      status: 'active',
      current_period_end: '2026-08-21T00:00:00.000Z'
    });

    await reconcilePaidSubscription(mock.supabase as never, values);

    expect(mock.update).toHaveBeenCalledWith(values);
    expect(mock.insert).not.toHaveBeenCalled();
  });

  it('inserts when no active or paid-period row exists', async () => {
    const mock = createSubscriptionMock(null);

    await reconcilePaidSubscription(mock.supabase as never, values);

    expect(mock.insert).toHaveBeenCalledWith(values);
    expect(mock.update).not.toHaveBeenCalled();
  });

  it('updates an older active row when a newer canceled row has expired', async () => {
    const mock = createSubscriptionMock([
      {
        id: 'new-expired',
        status: 'canceled',
        current_period_end: '2020-01-01T00:00:00.000Z'
      },
      {
        id: 'older-active',
        status: 'active',
        current_period_end: '2099-01-01T00:00:00.000Z'
      }
    ]);

    await reconcilePaidSubscription(mock.supabase as never, values);

    expect(mock.update).toHaveBeenCalledWith(values);
    expect(mock.insert).not.toHaveBeenCalled();
  });
});

function createStripeSyncMock() {
  const subscriptionUpdate = vi.fn(() => ({
    eq: vi.fn(() => ({
      select: vi.fn(() => ({
        maybeSingle: vi.fn(async () => ({
          data: { user_id: 'user-1', plan_id: 'pro' },
          error: null
        }))
      }))
    }))
  }));
  const planMaybeSingle = vi.fn(async () => ({
    data: { limits: { dailyImageGeneration: -1 } },
    error: null
  }));
  const planSelect = vi.fn(() => ({
    eq: vi.fn(() => ({ maybeSingle: planMaybeSingle }))
  }));
  const creditUpdateEq = vi.fn(async () => ({ error: null }));
  const creditUpdate = vi.fn(() => ({ eq: creditUpdateEq }));
  const supabase = {
    from: vi.fn((table: string) => {
      if (table === 'user_subscriptions') {
        return { update: subscriptionUpdate };
      }
      if (table === 'subscription_plans') {
        return { select: planSelect };
      }
      return { update: creditUpdate };
    })
  };

  return {
    supabase,
    subscriptionUpdate,
    planSelect,
    creditUpdate,
    creditUpdateEq
  };
}

function stripeSubscription(status: 'active' | 'past_due') {
  return {
    id: 'sub_1',
    status,
    customer: 'cus_1',
    cancel_at_period_end: false,
    current_period_start: 1_753_056_000,
    current_period_end: 1_755_734_400
  };
}

describe('Stripe subscription synchronization', () => {
  it('restores paid limits for an active subscription', async () => {
    const mock = createStripeSyncMock();

    const result = await syncStripeSubscription(
      mock.supabase as never,
      stripeSubscription('active') as never
    );

    expect(result).toMatchObject({ userId: 'user-1', status: 'active' });
    expect(mock.subscriptionUpdate).toHaveBeenCalled();
    expect(mock.planSelect).toHaveBeenCalledWith('limits');
    expect(mock.creditUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        daily_credits: 0,
        daily_credits_max: 0,
        daily_image_gen_used: 0,
        daily_image_gen_max: -1
      })
    );
    expect(mock.creditUpdateEq).toHaveBeenCalledWith('user_id', 'user-1');
  });

  it('revokes subscription credits and restores free limits when past due', async () => {
    const mock = createStripeSyncMock();

    const result = await syncStripeSubscription(
      mock.supabase as never,
      stripeSubscription('past_due') as never
    );

    expect(result).toMatchObject({ userId: 'user-1', status: 'past_due' });
    expect(mock.creditUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        subscription_credits: 0,
        subscription_credits_max: 0,
        daily_credits: 100,
        daily_credits_max: 100,
        daily_image_gen_max: 1
      })
    );
    expect(mock.creditUpdateEq).toHaveBeenCalledWith('user_id', 'user-1');
  });
});
