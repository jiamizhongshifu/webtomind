import { quoteSkillProduct } from '../../api/membership/skill-commerce';
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
  const rpc = vi.fn(
    async (
      _name: string,
      _args: Record<string, unknown>
    ): Promise<{ data: unknown; error: { message: string } | null }> => ({
      data: null,
      error: null
    })
  );
  function from(table: string) {
    let op: 'select' | 'update' | 'insert' = 'select';
    let patch: Row = {};
    let inserted: Row[] = [];
    const filters: Array<(row: Row) => boolean> = [];
    const run = () => {
      const rows = (tables[table] ||= []);
      if (op === 'insert') {
        rows.push(
          ...inserted.map((row) => ({ id: crypto.randomUUID(), ...row }))
        );
        return inserted;
      }
      const matched = rows.filter((row) =>
        filters.every((filter) => filter(row))
      );
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
        return {
          data: row ?? null,
          error: row ? null : { message: 'not found' }
        };
      },
      then(
        resolve: (value: unknown) => unknown,
        reject?: (reason: unknown) => unknown
      ) {
        return Promise.resolve({ data: run(), error: null }).then(
          resolve,
          reject
        );
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
    {
      id: 'pro',
      name: 'pro',
      monthly_credits: 0,
      limits: {},
      skill_tier_access: 'premium',
      billing_kind: 'recurring'
    },
    {
      id: 'legacy',
      name: 'legacy',
      monthly_credits: 0,
      limits: {},
      skill_tier_access: 'free',
      billing_kind: 'recurring'
    },
    {
      id: 'skill_pro',
      name: 'skill_pro',
      monthly_credits: 0,
      limits: { dailyImageGeneration: 5 },
      skill_tier_access: 'premium',
      billing_kind: 'recurring'
    },
    {
      id: 'skill_lifetime',
      name: 'skill_lifetime',
      monthly_credits: 0,
      limits: {},
      skill_tier_access: 'premium',
      billing_kind: 'one_time'
    }
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

    expect(await processZpayNotification(notifyRequest())).toMatchObject({
      ok: true
    });
    expect(await processZpayNotification(notifyRequest())).toMatchObject({
      ok: true
    });

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
    expect(fake.rpc.mock.calls.map(([name]) => name)).toEqual([
      'grant_skill_entitlement'
    ]);
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
    metadata: {
      order_id: ORDER,
      product_type: 'subscription',
      product_id: 'skill_pro'
    },
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

  it('grants premium Skills to existing Pro/Max plans but not to free-tier plans', async () => {
    const pro = createFakeDb({
      subscription_plans: plans(),
      payment_orders: [subscriptionOrder('pro')],
      user_subscriptions: [],
      user_credits: [{ user_id: USER }]
    });
    await fulfillOrder(pro.db, ORDER, {
      ...payment,
      metadata: { ...payment.metadata, product_id: 'pro' }
    });
    expect(grants(pro.rpc)).toHaveLength(1);
    expect(grants(pro.rpc)[0][1]).toMatchObject({
      p_source: 'subscription',
      p_ends_at: '2026-11-18T00:00:00.000Z',
      p_metadata: expect.objectContaining({ plan_id: 'pro' })
    });

    const legacy = createFakeDb({
      subscription_plans: plans(),
      payment_orders: [subscriptionOrder('legacy')],
      user_subscriptions: [],
      user_credits: [{ user_id: USER }]
    });
    await fulfillOrder(legacy.db, ORDER, {
      ...payment,
      metadata: { ...payment.metadata, product_id: 'legacy' }
    });
    expect(grants(legacy.rpc)).toHaveLength(0);
  });

  it('backfills an order-traced grant when a paid subscription has none yet', async () => {
    const periodEnd = Math.floor(Date.now() / 1000) + 2_592_000;
    const subscription = {
      id: 'sub_legacy',
      status: 'active',
      customer: 'cus_1',
      cancel_at_period_end: false,
      items: {
        data: [
          {
            current_period_start: periodEnd - 2_592_000,
            current_period_end: periodEnd
          }
        ]
      }
    } as unknown as Stripe.Subscription;
    const fake = createFakeDb({
      subscription_plans: plans(),
      user_subscriptions: [
        {
          id: 's1',
          user_id: USER,
          plan_id: 'pro',
          stripe_subscription_id: 'sub_legacy'
        }
      ],
      user_credits: [{ user_id: USER }]
    });
    fake.rpc.mockImplementation(async (name: string) => ({
      data: name === 'sync_subscription_skill_entitlements' ? 0 : null,
      error: null
    }));
    await syncStripeSubscription(fake.db, subscription);
    expect(fake.rpc).toHaveBeenCalledWith(
      'backfill_subscription_skill_entitlements',
      {
        p_apply: true,
        p_user_id: USER
      }
    );

    fake.rpc.mockClear();
    fake.rpc.mockImplementation(async (name: string) => ({
      data: name === 'sync_subscription_skill_entitlements' ? 1 : null,
      error: null
    }));
    await syncStripeSubscription(fake.db, subscription);
    expect(fake.rpc.mock.calls.map(([name]) => name)).not.toContain(
      'backfill_subscription_skill_entitlements'
    );
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
        ? { data: null, error: { message: 'db down' } }
        : { data: null, error: null }
    );
    await expect(fulfillOrder(fake.db, ORDER, payment)).rejects.toBeTruthy();
    expect(fake.tables.payment_orders[0].status).toBe('failed');
  });

  it('suspends entitlements when the subscription lapses and extends on renewal', async () => {
    const fake = createFakeDb({
      subscription_plans: plans(),
      user_subscriptions: [
        {
          id: 's1',
          user_id: USER,
          plan_id: 'skill_pro',
          stripe_subscription_id: 'sub_1'
        }
      ],
      user_credits: [{ user_id: USER }]
    });
    const periodEnd = Math.floor(Date.now() / 1000) - 60;
    await syncStripeSubscription(fake.db, {
      id: 'sub_1',
      status: 'canceled',
      customer: 'cus_1',
      cancel_at_period_end: false,
      items: {
        data: [
          {
            current_period_start: periodEnd - 2_592_000,
            current_period_end: periodEnd
          }
        ]
      }
    } as unknown as Stripe.Subscription);
    expect(fake.rpc).toHaveBeenCalledWith(
      'sync_subscription_skill_entitlements',
      {
        p_external_subscription_id: 'sub_1',
        p_has_access: false,
        p_ends_at: new Date(periodEnd * 1000).toISOString(),
        p_metadata: { stripe_status: 'canceled' }
      }
    );

    const renewedEnd = Math.floor(Date.now() / 1000) + 2_592_000;
    await syncStripeSubscription(fake.db, {
      id: 'sub_1',
      status: 'active',
      customer: 'cus_1',
      cancel_at_period_end: false,
      items: {
        data: [
          {
            current_period_start: renewedEnd - 2_592_000,
            current_period_end: renewedEnd
          }
        ]
      }
    } as unknown as Stripe.Subscription);
    expect(fake.rpc).toHaveBeenLastCalledWith(
      'sync_subscription_skill_entitlements',
      expect.objectContaining({
        p_has_access: true,
        p_ends_at: new Date(renewedEnd * 1000).toISOString()
      })
    );
  });
});

describe('Stripe refunds', () => {
  it('revokes the order entitlements and marks a lifetime order refunded', async () => {
    const fake = createFakeDb({
      payment_orders: [
        {
          id: ORDER,
          user_id: USER,
          status: 'succeeded',
          product_type: 'skill_lifetime'
        }
      ]
    });
    const stripe = {
      checkout: {
        sessions: {
          list: vi.fn(async () => ({
            data: [{ metadata: { order_id: ORDER } }]
          }))
        }
      }
    } as unknown as Pick<Stripe, 'checkout'>;
    const orderId = await revokeRefundedCheckoutEntitlements(fake.db, stripe, {
      id: 'ch_1',
      refunded: true,
      payment_intent: 'pi_1'
    } as Stripe.Charge);
    expect(orderId).toBe(ORDER);
    expect(fake.rpc).toHaveBeenCalledWith(
      'revoke_skill_entitlements_for_order',
      {
        p_payment_order_id: ORDER,
        p_reason: 'stripe_refund:ch_1'
      }
    );
    expect(fake.tables.payment_orders[0].status).toBe('refunded');

    const partial = await revokeRefundedCheckoutEntitlements(fake.db, stripe, {
      id: 'ch_2',
      refunded: false,
      payment_intent: 'pi_2'
    } as Stripe.Charge);
    expect(partial).toBeNull();
  });
});

describe('content-only commerce', () => {
  it.each(['skill_purchase', 'skill_subscription'])(
    'fulfills %s without changing compute credits or legacy membership',
    async (type) => {
      const fake = createFakeDb({
        payment_orders: [
          {
            id: ORDER,
            user_id: USER,
            status: 'pending',
            amount: 999,
            currency: 'usd',
            provider: 'stripe',
            product_type: type,
            product_id: 'content-v2',
            metadata: { billingCycle: 'monthly' }
          }
        ],
        user_credits: [
          { user_id: USER, daily_credits: 50, subscription_credits: 6000 }
        ],
        user_subscriptions: [
          { user_id: USER, plan_id: 'pro', status: 'active' }
        ]
      });
      const credits = structuredClone(fake.tables.user_credits);
      const subscriptions = structuredClone(fake.tables.user_subscriptions);
      const payment = {
        id: 'cs_content',
        amount_total: 999,
        currency: 'usd',
        client_reference_id: USER,
        payment_status: 'paid',
        status: 'complete',
        subscription: type === 'skill_subscription' ? 'sub_content' : null,
        billingPeriod: {
          start: '2026-10-20T00:00:00Z',
          end: '2026-11-20T00:00:00Z'
        }
      };
      await fulfillOrder(fake.db, ORDER, payment);
      await fulfillOrder(fake.db, ORDER, payment);
      expect(fake.tables.user_credits).toEqual(credits);
      expect(fake.tables.user_subscriptions).toEqual(subscriptions);
      expect(fake.rpc.mock.calls.map(([name]) => name)).toEqual([
        'fulfill_skill_commerce'
      ]);
      expect(fake.tables.payment_orders[0].status).toBe('succeeded');
    }
  );
  it('routes content subscription renewals and lapses to the isolated ledger', async () => {
    const fake = createFakeDb({
      skill_subscriptions: [
        {
          user_id: USER,
          plan_id: 'content-v2',
          stripe_subscription_id: 'sub_content'
        }
      ],
      user_credits: [{ user_id: USER, daily_credits: 50 }],
      user_subscriptions: [{ user_id: USER, plan_id: 'pro' }]
    });
    const before = structuredClone(fake.tables);
    const result = await syncStripeSubscription(fake.db, {
      id: 'sub_content',
      status: 'past_due',
      customer: 'cus_test',
      cancel_at_period_end: false,
      metadata: { product_type: 'skill_subscription' },
      items: {
        data: [
          { current_period_start: 1792454400, current_period_end: 1795132800 }
        ]
      }
    } as unknown as Stripe.Subscription);
    expect(result?.contentOnly).toBe(true);
    expect(fake.rpc).toHaveBeenCalledWith(
      'sync_skill_commerce_subscription',
      expect.objectContaining({ p_has_access: false })
    );
    expect(fake.tables.user_credits).toEqual(before.user_credits);
    expect(fake.tables.user_subscriptions).toEqual(before.user_subscriptions);
  });
  it('uses the atomic refund RPC for a single Skill', async () => {
    const fake = createFakeDb({});
    const stripe = {
      checkout: {
        sessions: {
          list: vi.fn(async () => ({
            data: [
              { metadata: { order_id: ORDER, product_type: 'skill_purchase' } }
            ]
          }))
        }
      }
    } as unknown as Pick<Stripe, 'checkout'>;
    await revokeRefundedCheckoutEntitlements(fake.db, stripe, {
      id: 'ch_single',
      refunded: true,
      payment_intent: 'pi_single'
    } as Stripe.Charge);
    expect(fake.rpc).toHaveBeenCalledWith('refund_skill_purchase', {
      p_order_id: ORDER,
      p_reason: 'stripe_refund:ch_single'
    });
  });
  it('resolves renewal refunds by invoice interval without a Checkout session', async () => {
    const fake = createFakeDb({});
    const stripe = {
      checkout: { sessions: { list: vi.fn() } },
      invoicePayments: {
        list: vi.fn(async () => ({ data: [{ invoice: 'in_renewal' }] }))
      },
      invoices: {
        retrieve: vi.fn(async () => ({
          id: 'in_renewal',
          billing_reason: 'subscription_cycle',
          parent: { subscription_details: { subscription: 'sub_content' } },
          lines: { data: [{ period: { start: 1792454400, end: 1795132800 } }] }
        }))
      },
      subscriptions: {
        retrieve: vi.fn(async () => ({
          metadata: { product_type: 'skill_subscription', order_id: ORDER }
        }))
      }
    } as unknown as Pick<
      Stripe,
      'checkout' | 'invoices' | 'invoicePayments' | 'subscriptions'
    >;
    expect(
      await revokeRefundedCheckoutEntitlements(fake.db, stripe, {
        id: 'ch_renewal',
        refunded: true,
        payment_intent: 'pi_renewal'
      } as Stripe.Charge)
    ).toBe(ORDER);
    expect(fake.rpc).toHaveBeenCalledWith(
      'refund_skill_subscription_period',
      expect.objectContaining({
        p_invoice_id: 'in_renewal',
        p_initial: false,
        p_external_id: 'sub_content'
      })
    );
    expect(stripe.checkout.sessions.list).not.toHaveBeenCalled();
  });
});

describe('server-side Skill quotes', () => {
  const product = {
    id: 'content-v2',
    kind: 'subscription',
    is_active: true,
    name: 'Skill Pro',
    price_usd: 999,
    price_cny: 4900,
    yearly_usd: 7900,
    yearly_cny: 39900,
    contract_version: 'skills-2026-10-v2'
  };
  it('uses regional prices and records zero workspace credits in the contract', async () => {
    const fake = createFakeDb({ skill_products: [product] });
    const result = await quoteSkillProduct(
      fake.db,
      USER,
      'content-v2',
      'skill_subscription',
      'yearly'
    );
    expect(result).toMatchObject({
      usd: 7900,
      cny: 39900,
      snapshot: { workspaceCredits: 0, contractVersion: 'skills-2026-10-v2' }
    });
  });
  it('rejects inactive products and does not permit kind confusion', async () => {
    const fake = createFakeDb({
      skill_products: [{ ...product, is_active: false }]
    });
    await expect(
      quoteSkillProduct(
        fake.db,
        USER,
        'content-v2',
        'skill_subscription',
        'monthly'
      )
    ).rejects.toMatchObject({ code: 'SKILL_PRODUCT_NOT_FOUND' });
    fake.tables.skill_products[0].is_active = true;
    await expect(
      quoteSkillProduct(
        fake.db,
        USER,
        'content-v2',
        'skill_purchase',
        'monthly'
      )
    ).rejects.toMatchObject({ code: 'SKILL_PRODUCT_NOT_FOUND' });
  });
  it('protects legacy Pro owners even before their Skill entitlement backfill', async () => {
    const fake = createFakeDb({
      skill_products: [product],
      user_subscriptions: [
        {
          user_id: USER,
          status: 'active',
          current_period_end: '2099-01-01',
          subscription_plans: { skill_tier_access: 'premium' }
        }
      ]
    });
    await expect(
      quoteSkillProduct(
        fake.db,
        USER,
        'content-v2',
        'skill_subscription',
        'monthly'
      )
    ).rejects.toMatchObject({ code: 'SKILL_ACCESS_ALREADY_INCLUDED' });
  });
  it('refuses duplicate subscriptions while a past-due recurring bill still exists', async () => {
    const fake = createFakeDb({
      skill_products: [product],
      skill_subscriptions: [
        {
          user_id: USER,
          status: 'past_due',
          stripe_subscription_id: 'sub_past',
          current_period_end: '2020-01-01'
        }
      ]
    });
    await expect(
      quoteSkillProduct(
        fake.db,
        USER,
        'content-v2',
        'skill_subscription',
        'monthly'
      )
    ).rejects.toMatchObject({ code: 'ACTIVE_SKILL_SUBSCRIPTION_EXISTS' });
  });
});
