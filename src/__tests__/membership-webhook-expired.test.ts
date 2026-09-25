import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import handler from '../../api/membership/webhook';

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }));

const ORDER_ID = '00000000-0000-4000-8000-000000000002';
const USER_ID = '00000000-0000-4000-8000-000000000003';
const WEBHOOK_SECRET = 'whsec_codex_expired_checkout_test';

interface PaymentOrderState {
  id: string;
  user_id: string;
  status: string;
  amount: number;
  currency: string;
  product_type: string;
  product_id: string;
  provider_order_id: string;
  metadata: Record<string, unknown>;
}

function createSupabaseMock(initialStatus: string) {
  const state: { order: PaymentOrderState } = {
    order: {
      id: ORDER_ID,
      user_id: USER_ID,
      status: initialStatus,
      amount: 2000,
      currency: 'usd',
      product_type: 'subscription',
      product_id: 'pro',
      provider_order_id: 'cs_test_expired_checkout',
      metadata: {
        checkout_attribution: { cta_source: 'pricing_page' }
      }
    }
  };
  const conversionUpsert = vi.fn().mockResolvedValue({ error: null });
  const paymentUpdate = vi.fn((values: Partial<PaymentOrderState>) => {
    let idFilter: string | null = null;
    let statusFilter: string | null = null;
    const query = {
      eq: vi.fn((column: string, value: string) => {
        if (column === 'id') idFilter = value;
        if (column === 'status') statusFilter = value;
        return query;
      }),
      select: vi.fn(() => query),
      maybeSingle: vi.fn(async () => {
        if (
          idFilter === ORDER_ID &&
          statusFilter === 'pending' &&
          state.order.status === 'pending'
        ) {
          state.order = { ...state.order, ...values };
          return { data: { ...state.order }, error: null };
        }
        return { data: null, error: null };
      })
    };
    return query;
  });
  const paymentSelect = vi.fn(() => {
    let idFilter: string | null = null;
    const query = {
      eq: vi.fn((column: string, value: string) => {
        if (column === 'id') idFilter = value;
        return query;
      }),
      maybeSingle: vi.fn(async () => ({
        data: idFilter === ORDER_ID ? { ...state.order } : null,
        error: null
      }))
    };
    return query;
  });
  const from = vi.fn((table: string) => {
    if (table === 'payment_orders') {
      return { update: paymentUpdate, select: paymentSelect };
    }
    if (table === 'conversion_events') {
      return { upsert: conversionUpsert };
    }
    throw new Error(`Unexpected table: ${table}`);
  });

  return { state, from, paymentUpdate, conversionUpsert };
}

function createExpiredWebhookRequest(eventId: string) {
  const payload = JSON.stringify({
    id: eventId,
    object: 'event',
    api_version: '2026-06-24.dahlia',
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: 'cs_test_expired_checkout',
        object: 'checkout.session',
        amount_total: 2000,
        currency: 'usd',
        client_reference_id: USER_ID,
        customer: null,
        expires_at: Math.floor(Date.now() / 1000),
        livemode: false,
        metadata: {
          order_id: ORDER_ID,
          user_id: USER_ID,
          product_type: 'subscription',
          product_id: 'pro'
        },
        mode: 'subscription',
        payment_status: 'unpaid',
        status: 'expired',
        subscription: null
      }
    },
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type: 'checkout.session.expired'
  });
  const stripe = new Stripe('sk_test_codex_expired_checkout', {
    apiVersion: '2026-06-24.dahlia'
  });
  const signature = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: WEBHOOK_SECRET
  });

  return new Request('https://webtomind.test/api/membership/webhook', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'stripe-signature': signature
    },
    body: payload
  });
}

describe('membership webhook checkout expiration', () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
    process.env.STRIPE_SECRET_KEY_TEST = 'sk_test_codex_expired_checkout';
    process.env.STRIPE_WEBHOOK_SECRET_TEST = WEBHOOK_SECRET;
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('marks a pending order expired and records an idempotent durable event', async () => {
    const mock = createSupabaseMock('pending');
    vi.mocked(createClient).mockReturnValue({ from: mock.from } as never);

    const firstResponse = await handler(
      createExpiredWebhookRequest('evt_expired_first')
    );
    const duplicateResponse = await handler(
      createExpiredWebhookRequest('evt_expired_duplicate')
    );

    expect(firstResponse.status).toBe(200);
    expect(duplicateResponse.status).toBe(200);
    expect(mock.state.order.status).toBe('expired');
    expect(mock.paymentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'expired',
        provider_order_id: 'cs_test_expired_checkout'
      })
    );
    expect(mock.conversionUpsert).toHaveBeenCalledTimes(2);
    for (const [row, options] of mock.conversionUpsert.mock.calls) {
      expect(row).toEqual(
        expect.objectContaining({
          event_name: 'checkout_session_expired',
          event_source: 'stripe_webhook',
          order_id: ORDER_ID,
          idempotency_key: `checkout_session_expired:${ORDER_ID}`
        })
      );
      expect(options).toEqual({
        onConflict: 'idempotency_key',
        ignoreDuplicates: true
      });
    }
  });

  it('does not overwrite or report an already succeeded order as expired', async () => {
    const mock = createSupabaseMock('succeeded');
    vi.mocked(createClient).mockReturnValue({ from: mock.from } as never);

    const response = await handler(
      createExpiredWebhookRequest('evt_expired_after_success')
    );

    expect(response.status).toBe(200);
    expect(mock.state.order.status).toBe('succeeded');
    expect(mock.conversionUpsert).not.toHaveBeenCalled();
  });
});
