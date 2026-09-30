// @vitest-environment node
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  retrieve: vi.fn(),
  update: vi.fn()
}));
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }));
vi.mock('stripe', () => ({
  default: class {
    subscriptions = { retrieve: mocks.retrieve, update: mocks.update };
  }
}));
import handler from '../../api/membership/cancellation';

const end = '2026-10-30T12:00:00.000Z';
const row = {
  id: 'owned-row',
  plan_id: 'pro',
  user_id: 'user-1',
  status: 'active',
  current_period_end: end,
  stripe_subscription_id: 'sub_owned',
  stripe_customer_id: 'cus_owned',
  payment_provider: 'stripe'
};
const stripeSubscription = () => ({
  id: 'sub_owned',
  customer: 'cus_owned',
  metadata: { user_id: 'user-1' },
  status: 'active',
  cancel_at_period_end: false,
  cancel_at: null,
  items: { data: [{ current_period_end: Date.parse(end) / 1000 }] }
});
let rows: Record<string, unknown>[];
let queryError: object | null;
let syncError: object | null;
let authError: object | null;
let dbUpdate: ReturnType<typeof vi.fn<(...args: unknown[]) => void>>;
let filters: ReturnType<typeof vi.fn<(...args: unknown[]) => void>>;
function request(
  method = 'POST',
  body: unknown = { subscriptionId: row.id, currentPeriodEnd: end },
  token: string | null = 'token'
) {
  return new Request('https://webtomind.com/api/membership/cancellation', {
    method,
    headers: token
      ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
      : {},
    ...(method === 'POST'
      ? { body: typeof body === 'string' ? body : JSON.stringify(body) }
      : {})
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('SUPABASE_URL', 'https://db.example');
  vi.stubEnv('SUPABASE_ANON_KEY', 'anon');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service');
  vi.stubEnv('STRIPE_MODE', 'test');
  vi.stubEnv('STRIPE_SECRET_KEY_TEST', 'sk_test_fake');
  rows = [{ ...row }];
  queryError = null;
  syncError = null;
  authError = null;
  filters = vi.fn();
  dbUpdate = vi.fn();
  mocks.createClient.mockImplementation((_url, key) =>
    key === 'anon'
      ? {
          auth: {
            getUser: async () => ({
              data: { user: authError ? null : { id: 'user-1' } },
              error: authError
            })
          }
        }
      : {
          from: () => {
            const conditions: [string, unknown][] = [];
            let updating = false;
            const query = {
              select: () => query,
              in: () => query,
              eq: (key: string, value: unknown) => {
                filters(key, value);
                conditions.push([key, value]);
                return query;
              },
              order: () => query,
              update: (value: unknown) => {
                updating = true;
                dbUpdate(value);
                return query;
              },
              then: (resolve: (value: unknown) => unknown) =>
                Promise.resolve({
                  data: rows.filter((row) =>
                    conditions.every(([key, value]) => row[key] === value)
                  ),
                  error: updating ? syncError : queryError
                }).then(resolve)
            };
            return query;
          }
        }
  );
  mocks.retrieve.mockResolvedValue(stripeSubscription());
  mocks.update.mockResolvedValue({
    ...stripeSubscription(),
    cancel_at_period_end: true
  });
});
afterEach(() => vi.unstubAllEnvs());

describe('self-service subscription cancellation', () => {
  it('requires a bearer token and verified user before reading subscriptions', async () => {
    expect((await handler(request('GET', undefined, null))).status).toBe(401);
    authError = { message: 'expired' };
    expect((await handler(request('GET'))).status).toBe(401);
    expect(mocks.retrieve).not.toHaveBeenCalled();
  });
  it('rejects unsupported methods and accepts preflight without payment calls', async () => {
    expect((await handler(request('DELETE'))).status).toBe(405);
    expect((await handler(request('OPTIONS'))).status).toBe(204);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('reads fresh Stripe state without a mutation and prevents caching', async () => {
    mocks.retrieve.mockResolvedValue({
      ...stripeSubscription(),
      cancel_at_period_end: true
    });
    const response = await handler(request('GET'));
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect((await response.json()).subscriptions[0]).toMatchObject({
      cancelAtPeriodEnd: true,
      canCancel: false,
      currentPeriodEnd: end
    });
    expect(filters).toHaveBeenCalledWith('user_id', 'user-1');
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('only schedules period-end cancellation, preserves access/credits and uses idempotency', async () => {
    const response = await handler(request());
    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith(
      'sub_owned',
      { cancel_at_period_end: true },
      {
        idempotencyKey: expect.stringMatching(
          /^cancel-at-period-end:owned-row:/
        )
      }
    );
    expect(dbUpdate).toHaveBeenCalledWith({
      cancel_at_period_end: true,
      current_period_end: end,
      updated_at: expect.any(String)
    });
    expect((await response.json()).subscription.status).toBe('active');
  });
  it('rejects another user’s row even if its ID is supplied', async () => {
    rows = [{ ...row, user_id: 'other-user' }];
    expect((await handler(request())).status).toBe(404);
    expect(mocks.retrieve).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it.each([{ customer: 'cus_other' }, { metadata: { user_id: 'other-user' } }])(
    'rejects contradictory Stripe ownership %j',
    async (overrides) => {
      mocks.retrieve.mockResolvedValue({
        ...stripeSubscription(),
        ...overrides
      });
      expect((await handler(request())).status).toBe(403);
      expect(mocks.update).not.toHaveBeenCalled();
    }
  );
  it('allows legacy rows only when Stripe metadata verifies ownership', async () => {
    rows = [{ ...row, stripe_customer_id: null }];
    expect((await handler(request())).status).toBe(200);
    mocks.update.mockClear();
    mocks.retrieve.mockResolvedValue({ ...stripeSubscription(), metadata: {} });
    expect((await handler(request())).status).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it.each([true, false])(
    'retries already scheduled/canceled state without another Stripe write (%s)',
    async (scheduled) => {
      mocks.retrieve.mockResolvedValue({
        ...stripeSubscription(),
        cancel_at_period_end: scheduled,
        status: scheduled ? 'active' : 'canceled'
      });
      expect((await handler(request())).status).toBe(200);
      expect(mocks.update).not.toHaveBeenCalled();
    }
  );
  it('concurrent requests only set the same period-end cancellation flag', async () => {
    const responses = await Promise.all([
      handler(request()),
      handler(request())
    ]);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(mocks.update.mock.calls.map((call) => call[1])).toEqual([
      { cancel_at_period_end: true },
      { cancel_at_period_end: true }
    ]);
  });
  it('does not report an accepted Stripe cancellation as failed when DB sync is delayed', async () => {
    syncError = { message: 'database unavailable' };
    const response = await handler(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      syncPending: true,
      subscription: { cancelAtPeriodEnd: true }
    });
  });
  it('rejects stale billing-period confirmation', async () => {
    expect(
      (
        await handler(
          request('POST', {
            subscriptionId: row.id,
            currentPeriodEnd: '2026-09-30T12:00:00.000Z'
          })
        )
      ).status
    ).toBe(409);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it.each(['{', null, {}, { subscriptionId: row.id }])(
    'rejects malformed confirmation %j',
    async (body) => {
      expect((await handler(request('POST', body))).status).toBe(400);
      expect(mocks.update).not.toHaveBeenCalled();
    }
  );
  it('shows prepaid plans without exposing a Stripe cancellation action', async () => {
    rows = [{ ...row, payment_provider: 'zpay' }];
    expect(
      (await (await handler(request('GET'))).json()).subscriptions[0]
    ).toMatchObject({ prepaid: true, canCancel: false });
    expect((await handler(request())).status).toBe(409);
    expect(mocks.retrieve).not.toHaveBeenCalled();
  });
  it('returns a recoverable failure for provider errors without leaking internals', async () => {
    mocks.update.mockRejectedValue(new Error('private provider failure'));
    const response = await handler(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'BILLING_UNAVAILABLE' });
    expect(dbUpdate).not.toHaveBeenCalled();
  });
  it('fails closed on database lookup errors', async () => {
    queryError = { message: 'db failed' };
    expect((await handler(request())).status).toBe(503);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('allows past-due users to stop renewal without granting paid access', async () => {
    mocks.retrieve.mockResolvedValue({
      ...stripeSubscription(),
      status: 'past_due'
    });
    mocks.update.mockResolvedValue({
      ...stripeSubscription(),
      status: 'past_due',
      cancel_at_period_end: true
    });
    expect((await handler(request())).status).toBe(200);
    expect(dbUpdate.mock.calls[0][0]).not.toHaveProperty('status');
  });
  it('does not replay an old idempotency result after renewal was reactivated', async () => {
    expect((await handler(request())).status).toBe(200);
    // The billing portal may turn renewal back on within the same period.
    mocks.retrieve.mockResolvedValue(stripeSubscription());
    expect((await handler(request())).status).toBe(200);
    expect(mocks.update.mock.calls[0][2].idempotencyKey).not.toBe(
      mocks.update.mock.calls[1][2].idempotencyKey
    );
  });
});
