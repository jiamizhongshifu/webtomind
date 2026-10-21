import { describe, it, expect, vi } from 'vitest';
import { purchaseAccess } from '../../apps/siskill/server/purchase-access';
import type { Order } from '../../apps/siskill/server/policy';
function fixture() {
  const order = {
    id: 'order',
    user_id: 'owner',
    sku: 'siskill_deck',
    product_scope: 'siskill',
    status: 'paid',
    provider: 'stripe',
    provider_payment_id: 'pi_paid',
    amount: 999,
    currency: 'usd'
  } as Order;
  const metadata = {
    product_scope: 'siskill',
    order_id: 'order',
    sku: 'siskill_deck'
  };
  const payment = {
    id: 'pi_paid',
    metadata,
    status: 'succeeded',
    livemode: false,
    amount: 999,
    amount_received: 999,
    currency: 'usd',
    latest_charge: 'ch_paid'
  };
  const charge = {
    id: 'ch_paid',
    metadata,
    status: 'succeeded',
    livemode: false,
    paid: true,
    captured: true,
    payment_intent: 'pi_paid',
    amount: 999,
    amount_captured: 999,
    currency: 'usd',
    refunded: false,
    amount_refunded: 0,
    disputed: false
  };
  const disputes = {
    data: [{ charge: 'ch_paid', livemode: false, status: 'needs_response' }],
    has_more: false
  };
  const stripe = {
    paymentIntents: { retrieve: vi.fn(async () => payment) },
    charges: { retrieve: vi.fn(async () => charge) },
    disputes: { list: vi.fn(async () => disputes) }
  };
  const verify = () => purchaseAccess(order, stripe as any, 'sk_test_fixture');
  return { order, payment, charge, disputes, stripe, verify };
}
describe('Current Stripe purchase authorization', () => {
  it('keeps paid and partially refunded access; full refund revokes before the webhook', async () => {
    const f = fixture();
    expect(await f.verify()).toBe(true);
    f.charge.amount_refunded = 100;
    expect(await f.verify()).toBe(true);
    f.charge.amount_refunded = 999;
    expect(await f.verify()).toBe(false);
  });
  it('suspends an open or lost dispute and restores only a verified won dispute', async () => {
    const f = fixture();
    f.charge.disputed = true;
    for (const status of ['needs_response', 'under_review', 'lost']) {
      f.disputes.data[0].status = status;
      expect(await f.verify()).toBe(false);
    }
    f.disputes.data[0].status = 'won';
    expect(await f.verify()).toBe(true);
    expect(f.stripe.disputes.list).toHaveBeenCalledWith({
      charge: 'ch_paid',
      limit: 100
    });
  });
  it('fails closed on missing or truncated dispute evidence', async () => {
    const f = fixture();
    f.charge.disputed = true;
    f.disputes.data[0].status = 'won';
    f.disputes.has_more = true;
    expect(await f.verify()).toBe(false);
    f.disputes.has_more = false;
    f.disputes.data = [];
    expect(await f.verify()).toBe(false);
  });
  it('rejects cross-order metadata even when amount matches', async () => {
    const f = fixture();
    f.payment.metadata = { ...f.payment.metadata, order_id: 'another' };
    await expect(f.verify()).rejects.toMatchObject({
      code: 'PRODUCT_SCOPE_MISMATCH'
    });
  });
  it('rejects another charge or environment', async () => {
    const f = fixture();
    f.charge.payment_intent = 'another';
    expect(await f.verify()).toBe(false);
    f.charge.payment_intent = 'pi_paid';
    f.charge.livemode = true;
    expect(await f.verify()).toBe(false);
  });
  it('does not grant an unpaid or locally refunded order', async () => {
    const f = fixture();
    for (const status of ['pending', 'refunded', 'expired']) {
      f.order.status = status;
      expect(await f.verify()).toBe(false);
    }
    expect(f.stripe.paymentIntents.retrieve).not.toHaveBeenCalled();
  });
  it('does not fall back to local grants during provider failure', async () => {
    const f = fixture();
    f.stripe.charges.retrieve.mockRejectedValue(Error('unavailable'));
    await expect(f.verify()).rejects.toThrow();
  });
});
