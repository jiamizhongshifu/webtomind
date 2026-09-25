import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildZpayOutTradeNo,
  signZpayParameters
} from '../../api/utils/zpay';

const fulfillOrder = vi.fn();
const { PaymentOrderInProgressError } = vi.hoisted(() => ({
  PaymentOrderInProgressError: class PaymentOrderInProgressError extends Error {}
}));
const maybeSingle = vi.fn();
const query = {
  select: vi.fn(() => query),
  eq: vi.fn(() => query),
  maybeSingle
};
const from = vi.fn(() => query);

vi.mock('../../api/membership/webhook', () => ({
  fulfillOrder,
  PaymentOrderInProgressError
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from }))
}));

function notificationUrl(overrides: Record<string, string> = {}) {
  const params: Record<string, string> = {
    pid: 'merchant-test',
    name: 'WebToMind Pro 月度会员',
    money: '144.00',
    out_trade_no: buildZpayOutTradeNo(
      '00000000-0000-4000-8000-000000000011'
    ),
    trade_no: 'zpay-trade-1',
    param: '00000000-0000-4000-8000-000000000011',
    trade_status: 'TRADE_SUCCESS',
    type: 'alipay',
    sign_type: 'MD5',
    ...overrides
  };
  params.sign = signZpayParameters(params, 'test-key');
  return `https://webtomind.com/api/membership/zpay-notify?${new URLSearchParams(params)}`;
}

describe('ZPAY callback verification', () => {
  beforeEach(() => {
    process.env.ZPAY_CHECKOUT_ENABLED = 'true';
    process.env.ZPAY_PID = 'merchant-test';
    process.env.ZPAY_KEY = 'test-key';
    process.env.ZPAY_USD_TO_CNY_RATE = '7.2';
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test';
    maybeSingle.mockResolvedValue({
      data: {
        id: '00000000-0000-4000-8000-000000000011',
        user_id: '00000000-0000-4000-8000-000000000012',
        amount: 14_400,
        currency: 'cny',
        status: 'pending',
        provider: 'zpay',
        provider_order_id: buildZpayOutTradeNo(
          '00000000-0000-4000-8000-000000000011'
        ),
        product_type: 'subscription',
        product_id: 'pro'
      },
      error: null
    });
    fulfillOrder.mockResolvedValue(undefined);
    vi.clearAllMocks();
  });

  it('rejects a forged callback before reading the order', async () => {
    const { processZpayNotification } = await import(
      '../../api/membership/zpay-notify'
    );
    const result = await processZpayNotification(
      new Request(`${notificationUrl()}&money=1.00`)
    );

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Duplicate|signature/);
    expect(from).not.toHaveBeenCalled();
    expect(fulfillOrder).not.toHaveBeenCalled();
  });

  it('rejects a signed callback when the paid amount differs from the order', async () => {
    const { processZpayNotification } = await import(
      '../../api/membership/zpay-notify'
    );
    const result = await processZpayNotification(
      new Request(notificationUrl({ money: '1.00' }))
    );

    expect(result).toMatchObject({
      ok: false,
      error: 'Payment amount mismatch'
    });
    expect(fulfillOrder).not.toHaveBeenCalled();
  });

  it('passes a fully verified payment into the shared idempotent fulfillment', async () => {
    // Disabling new checkouts must not strand an already-paid callback.
    process.env.ZPAY_CHECKOUT_ENABLED = 'false';
    const { processZpayNotification } = await import(
      '../../api/membership/zpay-notify'
    );
    const result = await processZpayNotification(
      new Request(notificationUrl())
    );

    expect(result).toMatchObject({
      ok: true,
      orderId: '00000000-0000-4000-8000-000000000011',
      checkoutType: 'subscription',
      productId: 'pro'
    });
    expect(fulfillOrder).toHaveBeenCalledTimes(1);
    expect(fulfillOrder.mock.calls[0][2]).toMatchObject({
      id: 'zpay-trade-1',
      amount_total: 14_400,
      currency: 'cny',
      payment_status: 'paid',
      status: 'complete',
      provider: 'zpay'
    });
  });

  it('does not acknowledge a callback while another delivery holds the order', async () => {
    fulfillOrder.mockRejectedValueOnce(
      new PaymentOrderInProgressError('order is being fulfilled')
    );
    const { default: handler, processZpayNotification } = await import(
      '../../api/membership/zpay-notify'
    );
    const result = await processZpayNotification(
      new Request(notificationUrl())
    );
    expect(result).toMatchObject({
      ok: false,
      pending: true,
      orderId: '00000000-0000-4000-8000-000000000011',
      checkoutType: 'subscription'
    });

    fulfillOrder.mockRejectedValueOnce(
      new PaymentOrderInProgressError('order is being fulfilled')
    );
    const response = await handler(new Request(notificationUrl()));
    expect(response.status).toBe(400);
    expect(await response.text()).toBe('fail');
  });

  it('sends the paying user to the success page while fulfillment is pending', async () => {
    fulfillOrder.mockRejectedValueOnce(
      new PaymentOrderInProgressError('order is being fulfilled')
    );
    const { default: returnHandler } = await import(
      '../../api/membership/zpay-return'
    );
    const response = await returnHandler(
      new Request(notificationUrl().replace('zpay-notify', 'zpay-return'))
    );
    const location = new URL(response.headers.get('Location') || '');
    expect(location.searchParams.get('payment')).toBe('success');
    expect(location.searchParams.get('orderId')).toBe(
      '00000000-0000-4000-8000-000000000011'
    );
  });
});
