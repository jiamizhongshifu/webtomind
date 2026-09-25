import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { createClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn()
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: createClientMock
}));

const USER_ID = '00000000-0000-4000-8000-000000000041';

function authorizedRequest(path: string): Request {
  return new Request(`https://webtomind.test${path}`, {
    headers: { Authorization: 'Bearer valid-token' }
  });
}

function chainTo(result: unknown) {
  const query: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'in', 'order']) {
    query[method] = vi.fn(() =>
      method === 'order' ? Promise.resolve(result) : query
    );
  }
  query.single = vi.fn().mockResolvedValue(result);
  return query;
}

describe('membership balance and identity fail closed', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    createClientMock.mockReset();
    process.env = {
      ...originalEnv,
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_ANON_KEY: 'anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key'
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  it('does not downgrade a balance request when subscription lookup fails', async () => {
    const creditsFrom = vi.fn((table: string) => {
      if (table !== 'user_subscriptions') {
        throw new Error(
          `Unexpected table after subscription failure: ${table}`
        );
      }
      return chainTo({
        data: null,
        error: { message: 'temporary subscription read failure' }
      });
    });
    createClientMock.mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: USER_ID } },
          error: null
        })
      },
      from: creditsFrom
    });
    const { default: balanceHandler } =
      await import('../../api/credits/balance');

    const response = await balanceHandler(
      authorizedRequest('/api/credits/balance')
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: 'Failed to verify subscription status'
    });
    expect(creditsFrom).toHaveBeenCalledTimes(1);
  });

  it('reconciles the verified user credit ledger through the service client', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const staleCredits = {
      user_id: USER_ID,
      daily_credits: 100,
      daily_credits_max: 100,
      daily_image_gen_used: 0,
      daily_image_gen_max: 10,
      subscription_credits: 0,
      subscription_credits_max: 0,
      bonus_credits: 0,
      referral_credits: 0,
      media_credits: 0,
      promo_media_credits: 0,
      last_daily_refresh: today,
      last_checkin_date: null,
      consecutive_checkin_days: 0
    };
    const reconciledCredits = {
      ...staleCredits,
      daily_image_gen_max: 1
    };
    const authClient = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: USER_ID } },
          error: null
        })
      }
    };
    const adminClient = {
      from: vi.fn((table: string) => {
        if (table === 'user_subscriptions') {
          return chainTo({ data: [], error: null });
        }
        if (table !== 'user_credits') {
          throw new Error(`Unexpected table: ${table}`);
        }
        return chainTo({ data: staleCredits, error: null });
      }),
      rpc: vi.fn().mockResolvedValue({
        data: reconciledCredits,
        error: null
      })
    };
    createClientMock
      .mockReturnValueOnce(authClient)
      .mockReturnValueOnce(adminClient);
    const { default: balanceHandler } =
      await import('../../api/credits/balance');

    const response = await balanceHandler(
      authorizedRequest('/api/credits/balance')
    );

    expect(response.status).toBe(200);
    expect((await response.json()).quota.dailyImageGen).toEqual({
      used: 0,
      max: 1
    });
    expect(adminClient.rpc).toHaveBeenCalledWith(
      'reconcile_free_credit_policy',
      { p_user_id: USER_ID }
    );
    expect(createClientMock).toHaveBeenNthCalledWith(
      2,
      'https://example.supabase.co',
      'service-role-key'
    );
  });

  it('does not expose stale free credits when member reconciliation fails', async () => {
    let creditReads = 0;
    const credits = {
      user_id: USER_ID,
      daily_credits: 100,
      daily_credits_max: 100,
      daily_image_gen_used: 0,
      daily_image_gen_max: 1,
      subscription_credits: 10_000,
      subscription_credits_max: 10_000,
      bonus_credits: 0,
      referral_credits: 0,
      media_credits: 0,
      promo_media_credits: 0,
      last_daily_refresh: new Date().toISOString().slice(0, 10),
      last_checkin_date: null,
      consecutive_checkin_days: 0
    };
    const from = vi.fn((table: string) => {
      if (table === 'user_subscriptions') {
        return chainTo({
          data: [
            {
              status: 'active',
              current_period_end: '2099-01-01T00:00:00.000Z',
              subscription_plans: { name: 'pro' }
            }
          ],
          error: null
        });
      }
      if (table !== 'user_credits') {
        throw new Error(`Unexpected table: ${table}`);
      }
      creditReads += 1;
      if (creditReads <= 2) {
        return chainTo({ data: { ...credits }, error: null });
      }
      const updateQuery = chainTo({
        data: null,
        error: { message: 'member quota reset failed' }
      });
      updateQuery.update = vi.fn(() => updateQuery);
      return updateQuery;
    });
    createClientMock.mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: USER_ID } },
          error: null
        })
      },
      from,
      rpc: vi.fn().mockResolvedValue({ data: {}, error: null })
    });
    const { default: balanceHandler } =
      await import('../../api/credits/balance');

    const response = await balanceHandler(
      authorizedRequest('/api/credits/balance')
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: 'Failed to reconcile member credits'
    });
  });

  it('does not report a free identity when subscription lookup fails', async () => {
    const authClient = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: {
              id: USER_ID,
              email: 'member@example.com',
              user_metadata: {}
            }
          },
          error: null
        })
      }
    };
    const profileQuery = chainTo({
      data: {
        username: 'member',
        avatar_url: null,
        member_number: 41,
        created_at: '2026-01-01T00:00:00.000Z',
        referral_code: null
      },
      error: null
    });
    const subscriptionQuery = chainTo({
      data: null,
      error: { message: 'temporary subscription read failure' }
    });
    const adminClient = {
      from: vi.fn((table: string) => {
        if (table === 'profiles') return profileQuery;
        if (table === 'user_subscriptions') return subscriptionQuery;
        throw new Error(
          `Unexpected table after subscription failure: ${table}`
        );
      })
    };
    createClientMock
      .mockReturnValueOnce(authClient)
      .mockReturnValueOnce(adminClient);
    const { getAuthMeResult } = await import('../../api/utils/auth-me');

    const result = await getAuthMeResult('Bearer valid-token');

    expect(result).toEqual({
      status: 503,
      body: { error: 'Failed to verify subscription status' }
    });
  });
});
