import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { createClientMock, recordConversionEventMock, StripeMock } =
  vi.hoisted(() => ({
    createClientMock: vi.fn(),
    recordConversionEventMock: vi.fn(),
    StripeMock: vi.fn()
  }));

vi.mock('@supabase/supabase-js', () => ({
  createClient: createClientMock
}));

vi.mock('stripe', () => ({
  default: StripeMock
}));

vi.mock('../../api/utils/conversion-events', () => ({
  recordConversionEvent: recordConversionEventMock
}));

vi.mock('../../api/utils/zpay', () => ({
  hasZpayCheckoutConfig: vi.fn(() => true),
  getZpayConfig: vi.fn(() => ({
    pid: 'zpay-pid',
    key: 'zpay-key',
    usdToCnyRate: 7.2,
    submitUrl: 'https://zpayz.cn/submit.php'
  })),
  buildZpayCheckoutFields: vi.fn(() => ({
    out_trade_no: 'ZPAY-ORDER-1',
    product_name: 'WebToMind 积分包',
    total_fee: '5000',
    notify_url: 'https://webtomind.com/api/membership/zpay-notify',
    return_url: 'https://webtomind.com/api/membership/zpay-return'
  })),
  usdCentsToCnyCents: vi.fn((cents: number) => cents * 72)
}));

import handler from '../../api/membership/checkout';

const USER_ID = '00000000-0000-4000-8000-000000000042';
const ORDER_ID = '00000000-0000-4000-8000-000000000043';

const ORDER = {
  id: ORDER_ID,
  user_id: USER_ID,
  status: 'pending',
  provider: 'stripe',
  product_type: 'subscription',
  product_id: 'pro',
  metadata: {
    billingCycle: 'yearly',
    productName: 'Pro'
  }
};

const PLAN = {
  id: 'pro',
  name: 'Pro',
  price_monthly: 1500,
  price_yearly: 12000,
  stripe_price_id: null,
  stripe_price_monthly: null,
  stripe_price_yearly: null,
  is_active: true
};

const PACKAGE = {
  id: 'pack_5k',
  credits: 5000,
  price: 5000,
  is_active: true
};

type QueryResult = { data: unknown; error: unknown };

interface QueryOverrides {
  select?: (columns?: string) => unknown;
  single?: () => Promise<QueryResult>;
  maybeSingle?: () => Promise<QueryResult>;
  order?: () => Promise<QueryResult>;
  then?: (
    resolve: (value: QueryResult) => void
  ) => void;
}

function buildQuery(overrides: QueryOverrides = {}) {
  const query: Record<string, any> = {};
  query.select = vi.fn((_columns?: string) => query);
  query.eq = vi.fn(() => query);
  query.in = vi.fn(() => query);
  query.order = vi.fn(async () => ({ data: [], error: null }));
  query.limit = vi.fn(() => query);
  query.gte = vi.fn(() => query);
  query.is = vi.fn(() => query);
  query.update = vi.fn(() => query);
  query.insert = vi.fn(() => query);
  query.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
  query.single = vi.fn(async () => ({ data: null, error: null }));

  if (overrides.select) query.select.mockImplementation(overrides.select);
  if (overrides.single) query.single.mockImplementation(overrides.single);
  if (overrides.maybeSingle)
    query.maybeSingle.mockImplementation(overrides.maybeSingle);
  if (overrides.order) query.order.mockImplementation(overrides.order);
  if (overrides.then) (query as { then: unknown }).then = overrides.then;
  return query as unknown as {
    select: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    in: ReturnType<typeof vi.fn>;
    order: ReturnType<typeof vi.fn>;
    limit: ReturnType<typeof vi.fn>;
    gte: ReturnType<typeof vi.fn>;
    is: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    insert: ReturnType<typeof vi.fn>;
    maybeSingle: ReturnType<typeof vi.fn>;
    single: ReturnType<typeof vi.fn>;
  };
}

function authorizedRequest(body: Record<string, unknown>): Request {
  return new Request('https://webtomind.test/api/membership/checkout', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer valid-token',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
}

function setupSupabase(options: {
  paymentOrdersUpdateResult?: QueryResult;
  reconcileResult?: QueryResult;
} = {}) {
  const {
    paymentOrdersUpdateResult = { data: null, error: null },
    reconcileResult = { data: [{ id: ORDER_ID }], error: null }
  } = options;

  const insertQuery = buildQuery({
    single: async () => ({ data: ORDER, error: null })
  });
  const paymentOrdersQuery = buildQuery({
    select: (columns?: string) =>
      columns === 'id'
        ? Promise.resolve(reconcileResult)
        : insertQuery,
    then: (resolve) => resolve(paymentOrdersUpdateResult)
  });

  const referralsQuery = buildQuery({
    maybeSingle: async () => ({ data: null, error: null })
  });
  const plansQuery = buildQuery({
    single: async () => ({ data: PLAN, error: null })
  });
  const subscriptionsQuery = buildQuery({
    order: async () => ({ data: [], error: null })
  });
  const packagesQuery = buildQuery({
    single: async () => ({ data: PACKAGE, error: null })
  });

  const from = vi.fn((table: string) => {
    if (table === 'payment_orders') return paymentOrdersQuery;
    if (table === 'referrals') return referralsQuery;
    if (table === 'subscription_plans') return plansQuery;
    if (table === 'user_subscriptions') return subscriptionsQuery;
    if (table === 'credit_packages') return packagesQuery;
    throw new Error(`Unexpected table: ${table}`);
  });

  createClientMock.mockReturnValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: USER_ID, email: 'user@example.com' } },
        error: null
      })
    },
    from
  });

  return { from, paymentOrdersQuery };
}

describe('membership checkout failure reconciliation', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    createClientMock.mockReset();
    recordConversionEventMock.mockReset();
    recordConversionEventMock.mockResolvedValue(undefined);
    StripeMock.mockReset();
    StripeMock.mockImplementation(function () {
      return {
        checkout: {
          sessions: {
            create: vi.fn().mockRejectedValue(new Error('card declined'))
          }
        }
      };
    });
    process.env = {
      ...originalEnv,
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_ANON_KEY: 'anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
      STRIPE_SECRET_KEY: 'sk_test_example'
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  it('marks a pending order failed and records checkout_session_create_failed when Stripe session creation fails', async () => {
    const { paymentOrdersQuery } = setupSupabase();

    const response = await handler(
      authorizedRequest({
        type: 'subscription',
        id: 'pro',
        billingCycle: 'yearly',
        ctaSource: 'pricing_cta_click'
      })
    );

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: 'Unable to start checkout',
      errorCode: 'CHECKOUT_PROVIDER_ERROR'
    });

    const updatePayload = paymentOrdersQuery.update.mock.calls[0][0];
    expect(updatePayload).toMatchObject({
      status: 'failed',
      metadata: expect.objectContaining({
        billingCycle: 'yearly',
        checkout_error_code: 'CHECKOUT_PROVIDER_ERROR',
        checkout_error: 'card declined'
      })
    });
    expect(paymentOrdersQuery.eq).toHaveBeenCalledWith('id', ORDER_ID);
    expect(paymentOrdersQuery.eq).toHaveBeenCalledWith('status', 'pending');
    expect(paymentOrdersQuery.is).toHaveBeenCalledWith(
      'provider_order_id',
      null
    );

    expect(recordConversionEventMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventName: 'checkout_session_create_failed',
        idempotencyKey: `checkout_session_create_failed:${ORDER_ID}`,
        orderId: ORDER_ID,
        productType: 'subscription',
        productId: 'pro',
        ctaSource: 'pricing_cta_click',
        metadata: expect.objectContaining({
          error_code: 'CHECKOUT_PROVIDER_ERROR',
          error_summary: 'card declined'
        })
      })
    );
  });

  it('reconciles through the outer catch when checkout initialization fails after order creation', async () => {
    setupSupabase({
      paymentOrdersUpdateResult: {
        data: null,
        error: { message: 'provider order number persistence failed' }
      }
    });

    const response = await handler(
      authorizedRequest({
        type: 'credit_package',
        id: 'pack_5k',
        paymentProvider: 'alipay',
        ctaSource: 'pricing_bulk_packages_expand'
      })
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: 'Unable to start checkout',
      errorCode: 'CHECKOUT_ERROR'
    });
    expect(recordConversionEventMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventName: 'checkout_session_create_failed',
        orderId: ORDER_ID,
        productType: 'credit_package',
        productId: 'pack_5k',
        ctaSource: 'pricing_bulk_packages_expand',
        metadata: expect.objectContaining({
          error_code: 'CHECKOUT_ERROR',
          error_summary: 'Failed to persist ZPAY merchant order number'
        })
      })
    );
  });

  it('does not mask the original response when reconciliation itself fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    setupSupabase({
      reconcileResult: {
        data: null,
        error: { message: 'reconcile database unavailable' }
      }
    });

    const response = await handler(
      authorizedRequest({
        type: 'subscription',
        id: 'pro',
        billingCycle: 'yearly',
        ctaSource: 'pricing_cta_click'
      })
    );

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: 'Unable to start checkout',
      errorCode: 'CHECKOUT_PROVIDER_ERROR'
    });
    expect(
      recordConversionEventMock.mock.calls.some(
        ([, input]) =>
          (input as { eventName?: string }).eventName ===
          'checkout_session_create_failed'
      )
    ).toBe(false);
    warn.mockRestore();
  });

  it('does not mark an order failed when it is no longer pending or already has a provider_order_id', async () => {
    const { paymentOrdersQuery } = setupSupabase({
      reconcileResult: { data: [], error: null }
    });

    const response = await handler(
      authorizedRequest({
        type: 'subscription',
        id: 'pro',
        billingCycle: 'yearly',
        ctaSource: 'pricing_cta_click'
      })
    );

    expect(response.status).toBe(502);
    expect(paymentOrdersQuery.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed' })
    );
    expect(paymentOrdersQuery.eq).toHaveBeenCalledWith('status', 'pending');
    expect(paymentOrdersQuery.is).toHaveBeenCalledWith(
      'provider_order_id',
      null
    );
    expect(
      recordConversionEventMock.mock.calls.some(
        ([, input]) =>
          (input as { eventName?: string }).eventName ===
          'checkout_session_create_failed'
      )
    ).toBe(false);
  });
});
