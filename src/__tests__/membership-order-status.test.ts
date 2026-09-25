import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import handler from '../../api/membership/order-status';

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }));

const ORDER_ID = '00000000-0000-4000-8000-000000000001';

describe('membership order status', () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'anon-key';
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('rejects missing authentication before looking up an order', async () => {
    const response = await handler(
      new Request(
        `https://webtomind.com/api/membership/order-status?orderId=${ORDER_ID}`
      )
    );
    expect(response.status).toBe(401);
    expect(createClient).not.toHaveBeenCalled();
  });

  it('only returns an order owned by the authenticated user', async () => {
    const eq = vi.fn();
    const query = {
      select: vi.fn(),
      eq,
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          id: ORDER_ID,
          status: 'succeeded',
          amount: 999,
          currency: 'usd',
          product_type: 'credit_package',
          product_id: 'pack_1k'
        },
        error: null
      })
    };
    query.select.mockReturnValue(query);
    eq.mockReturnValue(query);
    vi.mocked(createClient).mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-1' } },
          error: null
        })
      },
      from: vi.fn().mockReturnValue(query)
    } as never);

    const response = await handler(
      new Request(
        `https://webtomind.com/api/membership/order-status?orderId=${ORDER_ID}`,
        { headers: { Authorization: 'Bearer valid-token' } }
      )
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(eq).toHaveBeenCalledWith('id', ORDER_ID);
    expect(eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(body.order.status).toBe('succeeded');
  });

  it('normalizes refunded orders to a terminal failed state', async () => {
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          id: ORDER_ID,
          status: 'refunded',
          amount: 999,
          currency: 'usd',
          product_type: 'credit_package',
          product_id: 'pack_1k'
        },
        error: null
      })
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    vi.mocked(createClient).mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-1' } },
          error: null
        })
      },
      from: vi.fn().mockReturnValue(query)
    } as never);

    const response = await handler(
      new Request(
        `https://webtomind.com/api/membership/order-status?orderId=${ORDER_ID}`,
        { headers: { Authorization: 'Bearer valid-token' } }
      )
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.order.status).toBe('failed');
  });

  it('returns expired as its own terminal checkout state', async () => {
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          id: ORDER_ID,
          status: 'expired',
          amount: 2000,
          currency: 'usd',
          product_type: 'subscription',
          product_id: 'pro'
        },
        error: null
      })
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    vi.mocked(createClient).mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-1' } },
          error: null
        })
      },
      from: vi.fn().mockReturnValue(query)
    } as never);

    const response = await handler(
      new Request(
        `https://webtomind.com/api/membership/order-status?orderId=${ORDER_ID}`,
        { headers: { Authorization: 'Bearer valid-token' } }
      )
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.order.status).toBe('expired');
  });
});
