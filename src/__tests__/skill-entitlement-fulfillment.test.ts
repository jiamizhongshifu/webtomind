// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildZpayOutTradeNo, signZpayParameters } from '../../api/utils/zpay';

const m = vi.hoisted(() => ({ client: vi.fn(), conversion: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: m.client }));
vi.mock('../../api/utils/conversion-events', () => ({
  recordConversionEvent: m.conversion
}));

import {
  fulfillOrder,
  revokeRefundedCheckoutEntitlements,
  syncStripeSubscription
} from '../../api/membership/webhook';
import { processZpayNotification } from '../../api/membership/zpay-notify';

type Row = Record<string, unknown>;

/** Minimal in-memory PostgREST stand-in for the calls fulfillment makes. */
function createFakeDb(tables: Record<string, Row[]>) {
  const rpc = vi.fn(async (_name: string, _args: Record<string, unknown>) => ({
    data: null,
    error: null
  }));
  function from(table: string) {
    let op: 'select' | 'update' | 'insert' = 'select';
    let patch: Row = {};
    let inserted: Row[] = [];
    const filters: Array<(row: Row) => boolean> = [];
    const run = () => {
      const rows = (tables[table] ||= []);
      if (op === 'insert') {
        rows.push(...inserted.map((row) => ({ id: crypto.randomUUID(), ...row })));
        return inserted;
      }
      const matched = rows.filter((row) => filters.every((filter) => filter(row)));
      if (op === 'update') matched.forEach((row) => Object.assign(row, patch));
      return matched.map((row) => ({ ...row }));
    };
    const builder = {
      select: () => builder,
      order: () => builder,
      limit: () => builder,
      update(value: Row) {
        op = 'update';
        patch = value;
        return builder;
      },
      insert(value: Row | Row[]) {
        op = 'insert';
        inserted = Array.isArray(value) ? value : [value];
        return builder;
      },
      eq(column: string, value: unknown) {
        filters.push((row) => row[column] === value);
        return builder;
      },
      in(column: string, values: unknown[]) {
        filters.push((row) => values.includes(row[column]));
        return builder;
      },
      lt(column: string, value: string) {
        filters.push((row) => String(row[column]) < value);
        return builder;
      },
      async maybeSingle() {
        return { data: run()[0] ?? null, error: null };
      },
      async single() {
        const row = run()[0];
        return { data: row ?? null, error: row ? null : { message: 'not found' } };
      },
      then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
        return Promise.resolve({ data: run(), error: null }).then(resolve, reject);
      }
    };
    return builder;
  }
  return { db: { from, rpc } as unknown as SupabaseClient, rpc, tables };
}

const USER = '00000000-0000-4000-8000-000000000012';
const ORDER = '00000000-0000-4000-8000-000000000011';
const now = new Date().toISOString();

function plans() {
  return [
    { id: 'pro', name: 'pro', monthly_credits: 0, limits: {}, skill_tier_access: 'free', billing_kind: 'recurring' },
    { id: 'skill_pro', name: 'skill_pro', monthly_credits: 0, limits: { dailyImageGeneration: 5 }, skill_tier_access: 'premium', billing_kind: 'recurring' },
    { id: 'skill_lifetime', name: 'skill_lifetime', monthly_credits: 0, limits: {}, skill_tier_access: 'premium', billing_kind: 'one_time' }
  ];
}

const grants = (rpc: ReturnType<typeof vi.fn>) =>
  rpc.mock.calls.filter(([name]) => name === 'grant_skill_entitlement');

beforeEach(() => {
  vi.clearAllMocks();
  m.conversion.mockResolvedValue(undefined);
});

describe('ZPAY lifetime purchase', () => {
  function notifyRequest() {
    const params: Record<string, string> = {
      pid: 'merchant-test',
      name: 'WebToMind Skill 买断',
      money: '899.00',
      out_trade_no: buildZpayOutTradeNo(ORDER),
      trade_no: 'zpay-trade-lifetime',
      param: ORDER,
      trade_status: 'TRADE_SUCCESS',
      type: 'alipay',
      sign_type: 'MD5'
    };
    params.sign = signZpayParameters(params, 'test-key');
    return new Request(
      `https://webtomind.com/api/membership/zpay-notify?${new URLSearchParams(params)}`
    );
  }

  it('grants lifetime access once even when the notify is replayed', async () => {
    Object.assign(process.env, {
      ZPAY_CHECKOUT_ENABLED: 'true',
      ZPAY_PID: 'merchant-test',
      ZPAY_KEY: 'test-key',
      ZPAY_USD_TO_CNY_RATE: '7.2',
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-test'
    });
    const fake = createFakeDb({
      subscription_plans: plans(),
      payment_orders: [
        {
          id: ORDER,
          user_id: USER,
          amount: 89_900,
          currency: 'cny',
          status: 'pending',
          provider: 'zpay',
          provider_order_id: buildZpayOutTradeNo(ORDER),
          product_type: 'skill_lifetime',
          product_id: 'skill_lifetime',
          metadata: {},
          updated_at: now
        }
      ]
    });
    m.client.mockReturnValue(fake.db);

    expect(await processZpayNotification(notifyRequest())).toMatchObject({ ok: true });
    expect(await processZpayNotification(notifyRequest())).toMatchObject({ ok: true });

    expect(grants(fake.rpc)).toHaveLength(1);
    expect(grants(fake.rpc)[0][1]).toMatchObject({
      p_user_id: USER,
      p_payment_order_id: ORDER,
      p_source: 'lifetime',
      p_skill_id: null,
      p_ends_at: null,
      p_metadata: expect.objectContaining({
        payment_provider: 'zpay',
        provider_payment_id: 'zpay-trade-lifetime'
      })
    });
    expect(fake.tables.payment_orders[0].status).toBe('succeeded');
    // Lifetime access never touches subscription credits.
    expect(fake.rpc.mock.calls.map(([name]) => name)).toEqual(['grant_skill_entitlement']);
  });
});

describe('Stripe subscription fulfillment', () => {
  function subscriptionOrder(planId: string) {
    return {
      id: ORDER,
      user_id: USER,
      amount: 999,
      currency: 'usd',
      status: 'pending',
      provider: 'stripe',
      product_type: 'subscription',
      product_id: planId,
      metadata: { billingCycle: 'monthly' },
      updated_at: now
    };
  }
  const payment = {
    id: 'cs_test_1',
    amount_total: 999,
    currency: 'usd',
    client_reference_id: USER,
    customer: 'cus_1',
    subscription: 'sub_1',
    metadata: { order_id: ORDER, product_type: 'subscription', product_id: 'skill_pro' },
    payment_status: 'paid',
    status: 'complete',
    billingPeriod: {
      start: '2026-10-18T00:00:00.000Z',
      end: '2026-11-18T00:00:00.000Z'
    }
  };

  it('grants premium Skill access bounded to the paid period, idempotently', async () => {
    const fake = createFakeDb({
      subscription_plans: plans(),
      payment_orders: [subscriptionOrder('skill_pro')],
      user_subscriptions: [],
      user_credits: [{ user_id: USER }]
    });
    await fulfillOrder(fake.db, ORDER, payment, 'evt_1');
    await fulfillOrder(fake.db, ORDER, payment, 'evt_1'); // Stripe redelivery

    expect(grants(fake.rpc)).toHaveLength(1);
    expect(grants(fake.rpc)[0][1]).toMatchObject({
      p_source: 'subscription',
      p_payment_order_id: ORDER,
      p_starts_at: '2026-10-18T00:00:00.000Z',
      p_ends_at: '2026-11-18T00:00:00.000Z',
      p_external_subscription_id: 'sub_1'
    });
    expect(fake.tables.payment_orders[0].status).toBe('succeeded');
  });

  it('does not grant Skills for plans without premium Skill access', async () => {
    const fake = createFakeDb({
      subscription_plans: plans(),
      payment_orders: [subscriptionOrder('pro')],
      user_subscriptions: [],
      user_credits: [{ user_id: USER }]
    });
    await fulfillOrder(fake.db, ORDER, {
      ...payment,
      metadata: { ...payment.metadata, product_id: 'pro' }
    });
    expect(grants(fake.rpc)).toHaveLength(0);
  });

  it('leaves the order retryable when the entitlement grant fails', async () => {
    const fake = createFakeDb({
      subscription_plans: plans(),
      payment_orders: [subscriptionOrder('skill_pro')],
      user_subscriptions: [],
      user_credits: [{ user_id: USER }]
    });
    fake.rpc.mockImplementation(async (name: string) =>
      name === 'grant_skill_entitlement'
        ? ({ data: null, error: { message: 'db down' } } as never)
        : { data: null, error: null }
    );
    await expect(fulfillOrder(fake.db, ORDER, payment)).rejects.toBeTruthy();
    expect(fake.tables.payment_orders[0].status).toBe('failed');
  });

  it('suspends entitlements when the subscription lapses and extends on renewal', async () => {
    const fake = createFakeDb({
      subscription_plans: plans(),
      user_subscriptions: [{ id: 's1', user_id: USER, plan_id: 'skill_pro', stripe_subscription_id: 'sub_1' }],
      user_credits: [{ user_id: USER }]
    });
    const periodEnd = Math.floor(Date.now() / 1000) - 60;
    await syncStripeSubscription(fake.db, {
      id: 'sub_1',
      status: 'canceled',
      customer: 'cus_1',
      cancel_at_period_end: false,
      items: { data: [{ current_period_start: periodEnd - 2_592_000, current_period_end: periodEnd }] }
    } as unknown as Stripe.Subscription);
    expect(fake.rpc).toHaveBeenCalledWith('sync_subscription_skill_entitlements', {
      p_external_subscription_id: 'sub_1',
      p_has_access: false,
      p_ends_at: new Date(periodEnd * 1000).toISOString(),
      p_metadata: { stripe_status: 'canceled' }
    });

    const renewedEnd = Math.floor(Date.now() / 1000) + 2_592_000;
    await syncStripeSubscription(fake.db, {
      id: 'sub_1',
      status: 'active',
      customer: 'cus_1',
      cancel_at_period_end: false,
      items: { data: [{ current_period_start: renewedEnd - 2_592_000, current_period_end: renewedEnd }] }
    } as unknown as Stripe.Subscription);
    expect(fake.rpc).toHaveBeenLastCalledWith(
      'sync_subscription_skill_entitlements',
      expect.objectContaining({ p_has_access: true, p_ends_at: new Date(renewedEnd * 1000).toISOString() })
    );
  });
});

describe('Stripe refunds', () => {
  it('revokes the order entitlements and marks a lifetime order refunded', async () => {
    const fake = createFakeDb({
      payment_orders: [
        { id: ORDER, user_id: USER, status: 'succeeded', product_type: 'skill_lifetime' }
      ]
    });
    const stripe = {
      checkout: {
        sessions: {
          list: vi.fn(async () => ({ data: [{ metadata: { order_id: ORDER } }] }))
        }
      }
    } as unknown as Pick<Stripe, 'checkout'>;
    const orderId = await revokeRefundedCheckoutEntitlements(fake.db, stripe, {
      id: 'ch_1',
      refunded: true,
      payment_intent: 'pi_1'
    } as Stripe.Charge);
    expect(orderId).toBe(ORDER);
    expect(fake.rpc).toHaveBeenCalledWith('revoke_skill_entitlements_for_order', {
      p_payment_order_id: ORDER,
      p_reason: 'stripe_refund:ch_1'
    });
    expect(fake.tables.payment_orders[0].status).toBe('refunded');

    const partial = await revokeRefundedCheckoutEntitlements(fake.db, stripe, {
      id: 'ch_2',
      refunded: false,
      payment_intent: 'pi_2'
    } as Stripe.Charge);
    expect(partial).toBeNull();
  });
});
