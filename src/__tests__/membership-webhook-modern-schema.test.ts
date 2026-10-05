import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
const m = vi.hoisted(() => ({
  event: vi.fn(),
  retrieve: vi.fn(),
  client: vi.fn(),
  conversion: vi.fn()
}));
vi.mock('stripe', () => ({
  default: class {
    webhooks = { constructEventAsync: m.event };
    subscriptions = { retrieve: m.retrieve };
  }
}));
vi.mock('@supabase/supabase-js', () => ({ createClient: m.client }));
vi.mock('../../api/utils/conversion-events', () => ({
  recordConversionEvent: m.conversion
}));
import handler from '../../api/membership/webhook';
let update: ReturnType<typeof vi.fn>;
let rpc: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks();
  for (const [key, value] of Object.entries({
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service',
    STRIPE_SECRET_KEY: 'sk_test_test',
    STRIPE_WEBHOOK_SECRET: 'whsec_test'
  }))
    vi.stubEnv(key, value);
  const query = {
    update: vi.fn(),
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(),
    then: vi.fn()
  };
  update = query.update.mockReturnValue(query);
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.maybeSingle.mockResolvedValue({
    data: {
      user_id: 'u1',
      plan_id: 'pro',
      limits: { dailyImageGeneration: -1 }
    },
    error: null
  });
  query.then.mockImplementation((resolve) =>
    Promise.resolve({ error: null }).then(resolve)
  );
  rpc = vi.fn().mockResolvedValue({ error: null });
  m.client.mockReturnValue({ from: () => query, rpc });
  m.retrieve.mockResolvedValue({
    id: 'sub_live',
    status: 'active',
    customer: 'cus_1',
    cancel_at_period_end: false,
    items: {
      data: [
        {
          current_period_start: Date.now() / 1000 - 100,
          current_period_end: Date.now() / 1000 + 86400
        }
      ]
    }
  });
});
afterEach(() => vi.unstubAllEnvs());
const request = () =>
  new Request('https://webtomind.test/api/membership/webhook', {
    method: 'POST',
    headers: { 'stripe-signature': 'verified-by-mock' },
    body: 'event'
  });
describe('webhook dispatch across modern Stripe schemas', () => {
  it('grants a renewal found under invoice.parent.subscription_details', async () => {
    m.event.mockResolvedValue({
      id: 'evt_1',
      type: 'invoice.payment_succeeded',
      data: {
        object: {
          id: 'in_1',
          billing_reason: 'subscription_cycle',
          parent: { subscription_details: { subscription: 'sub_live' } }
        }
      }
    });
    expect((await handler(request())).status).toBe(200);
    expect(m.retrieve).toHaveBeenCalledWith('sub_live');
    expect(rpc).toHaveBeenCalledWith('grant_subscription_credits_if_due', {
      p_user_id: 'u1'
    });
  });
  it('reconciles the latest provider state for an out-of-order update', async () => {
    m.event.mockResolvedValue({
      id: 'evt_old',
      type: 'customer.subscription.updated',
      data: { object: { id: 'sub_live', status: 'past_due' } }
    });
    expect((await handler(request())).status).toBe(200);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'active' })
    );
    expect(update).not.toHaveBeenCalledWith(
      expect.objectContaining({ subscription_credits: 0 })
    );
  });
  it('does not acknowledge a renewal with missing billing period data', async () => {
    m.event.mockResolvedValue({
      id: 'evt_bad',
      type: 'invoice.payment_succeeded',
      data: {
        object: {
          id: 'in_bad',
          billing_reason: 'subscription_cycle',
          parent: { subscription_details: { subscription: 'sub_live' } }
        }
      }
    });
    m.retrieve.mockResolvedValue({
      id: 'sub_live',
      status: 'active',
      items: { data: [] }
    });
    expect((await handler(request())).status).toBe(500);
    expect(update).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
});
