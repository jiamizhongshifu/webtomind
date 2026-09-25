import { describe, expect, it, vi } from 'vitest';
import type Stripe from 'stripe';
import {
  fulfillOrder,
  PaymentOrderInProgressError
} from '../../api/membership/webhook';

const ORDER_ID = '00000000-0000-4000-8000-000000000011';
const USER_ID = '00000000-0000-4000-8000-000000000012';

function createFulfillmentMock(options: {
  creditGrantError?: Error;
  orderSuccessError?: Error;
  initialStatus?: string;
  recoverStale?: boolean;
}) {
  let orderStatus = options.initialStatus || 'pending';
  const recordedEvents: string[] = [];
  const order = {
    id: ORDER_ID,
    user_id: USER_ID,
    amount: 900,
    currency: 'usd',
    status: 'pending',
    product_type: 'credit_package',
    product_id: 'starter',
    provider_order_id: null,
    metadata: { checkout_attribution: { cta_source: 'pricing_page' } }
  };

  const paymentUpdate = vi.fn((values: Record<string, unknown>) => {
    let expectedStatus: string | null = null;
    let hasStaleCutoff = false;
    const query: Record<string, unknown> & PromiseLike<unknown> = {
      eq: vi.fn((column: string, value: string) => {
        if (column === 'status') expectedStatus = value;
        return query;
      }),
      lt: vi.fn(() => {
        hasStaleCutoff = true;
        return query;
      }),
      in: vi.fn(() => query),
      select: vi.fn(() => query),
      maybeSingle: vi.fn(async () => {
        if (values.status === 'processing') {
          if (!['pending', 'failed'].includes(orderStatus)) {
            return { data: null, error: null };
          }
          orderStatus = 'processing';
          return {
            data: { ...order, status: orderStatus },
            error: null
          };
        }
        if (values.status === 'succeeded') {
          if (options.orderSuccessError) {
            return { data: null, error: options.orderSuccessError };
          }
          if (expectedStatus !== 'processing' || orderStatus !== 'processing') {
            return { data: null, error: null };
          }
          orderStatus = 'succeeded';
          return { data: { id: ORDER_ID }, error: null };
        }
        return { data: null, error: null };
      }),
      then: (resolve) => {
        if (
          values.status === 'failed' &&
          orderStatus === 'processing' &&
          expectedStatus === 'processing' &&
          (!hasStaleCutoff || options.recoverStale)
        ) {
          orderStatus = 'failed';
        }
        return Promise.resolve({ error: null }).then(resolve ?? undefined);
      }
    };
    return query;
  });

  const from = vi.fn((table: string) => {
    if (table === 'payment_orders') {
      const lookup = {
        eq: vi.fn(() => lookup),
        maybeSingle: vi.fn(async () => ({
          data: { ...order, status: orderStatus },
          error: null
        }))
      };
      return { update: paymentUpdate, select: vi.fn(() => lookup) };
    }
    if (table === 'credit_packages') {
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        single: vi.fn(async () => ({
          data: { id: 'starter', credits: 500 },
          error: null
        }))
      };
      return query;
    }
    if (table === 'conversion_events') {
      return {
        upsert: vi.fn(async (row: { event_name: string }) => {
          recordedEvents.push(row.event_name);
          return { error: null };
        })
      };
    }
    throw new Error(`Unexpected table: ${table}`);
  });

  return {
    supabase: {
      from,
      rpc: vi.fn(async () => ({
        data: null,
        error: options.creditGrantError || null
      }))
    },
    getOrderStatus: () => orderStatus,
    recordedEvents
  };
}

function paidSession(): Stripe.Checkout.Session {
  return {
    id: 'cs_test_fulfillment_error',
    object: 'checkout.session',
    amount_total: 900,
    currency: 'usd',
    client_reference_id: USER_ID,
    customer: null,
    metadata: {
      order_id: ORDER_ID,
      product_type: 'credit_package',
      product_id: 'starter'
    },
    mode: 'payment',
    payment_status: 'paid',
    status: 'complete'
  } as unknown as Stripe.Checkout.Session;
}

describe('payment webhook fulfillment failures', () => {
  it('fails the order and does not report purchase success when credit grant fails', async () => {
    const mock = createFulfillmentMock({
      creditGrantError: new Error('credit RPC unavailable')
    });

    await expect(
      fulfillOrder(
        mock.supabase as never,
        ORDER_ID,
        paidSession(),
        'evt_credit'
      )
    ).rejects.toThrow('credit RPC unavailable');

    expect(mock.getOrderStatus()).toBe('failed');
    expect(mock.recordedEvents).toContain('purchase_webhook_failed');
    expect(mock.recordedEvents).not.toContain('purchase_webhook_succeeded');
  });

  it('does not report purchase success when the final order transition fails', async () => {
    const mock = createFulfillmentMock({
      orderSuccessError: new Error('order update unavailable')
    });

    await expect(
      fulfillOrder(mock.supabase as never, ORDER_ID, paidSession(), 'evt_order')
    ).rejects.toThrow('order update unavailable');

    expect(mock.getOrderStatus()).toBe('failed');
    expect(mock.recordedEvents).toContain('purchase_webhook_failed');
    expect(mock.recordedEvents).not.toContain('purchase_webhook_succeeded');
  });

  it('recovers a stale processing order and fulfills it once', async () => {
    const mock = createFulfillmentMock({
      initialStatus: 'processing',
      recoverStale: true
    });

    await expect(
      fulfillOrder(mock.supabase as never, ORDER_ID, paidSession(), 'evt_stale')
    ).resolves.toBeUndefined();

    expect(mock.getOrderStatus()).toBe('succeeded');
    expect(mock.recordedEvents).toContain('purchase_webhook_succeeded');
    expect(mock.recordedEvents).not.toContain('purchase_webhook_failed');
  });

  it('does not acknowledge a delivery while another one holds the order', async () => {
    const mock = createFulfillmentMock({ initialStatus: 'processing' });

    await expect(
      fulfillOrder(mock.supabase as never, ORDER_ID, paidSession(), 'evt_dup')
    ).rejects.toBeInstanceOf(PaymentOrderInProgressError);

    expect(mock.getOrderStatus()).toBe('processing');
    expect(mock.supabase.rpc).not.toHaveBeenCalled();
    expect(mock.recordedEvents).toEqual([]);
  });

  it('acknowledges a duplicate delivery of an already fulfilled order', async () => {
    const mock = createFulfillmentMock({ initialStatus: 'succeeded' });

    await expect(
      fulfillOrder(mock.supabase as never, ORDER_ID, paidSession(), 'evt_done')
    ).resolves.toBeUndefined();

    expect(mock.supabase.rpc).not.toHaveBeenCalled();
    expect(mock.recordedEvents).toContain('purchase_webhook_succeeded');
  });
});
