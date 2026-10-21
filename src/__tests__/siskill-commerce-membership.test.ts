import { describe, it, expect, vi } from 'vitest';
import Stripe from 'stripe';
import {
  verifyPaidPeriod,
  verifyMemberContract,
  membershipMetadata
} from '../../apps/siskill/server/membership';
function fixture() {
  const m = {
    id: 'qa',
    user_id: 'user-a',
    plan_id: 'pro_monthly',
    state: 'bound',
    checkout_id: 'cs_qa',
    subscription_id: 'sub_qa',
    customer_id: 'cus_qa',
    created_at: new Date().toISOString(),
    snapshot: {
      stripe_price_id: 'price_qa',
      amount: 999,
      currency: 'usd',
      interval: 'month' as const,
      livemode: false,
      contract_version: 'siskill-test',
      locale: 'en-US',
      name: 'Pro'
    }
  };
  const s: any = {
    id: 'sub_qa',
    customer: 'cus_qa',
    livemode: false,
    metadata: membershipMetadata(m),
    status: 'active',
    latest_invoice: 'in_qa',
    cancel_at_period_end: false,
    items: {
      has_more: false,
      data: [
        {
          quantity: 1,
          current_period_start: 100,
          current_period_end: 200,
          price: {
            id: 'price_qa',
            unit_amount: 999,
            currency: 'usd',
            recurring: { interval: 'month', interval_count: 1 }
          }
        }
      ]
    }
  };
  const invoice: any = {
    id: 'in_qa',
    customer: 'cus_qa',
    livemode: false,
    status: 'paid',
    parent: { subscription_details: { subscription: 'sub_qa' } },
    amount_paid: 999,
    amount_remaining: 0,
    currency: 'usd',
    lines: {
      has_more: false,
      data: [
        {
          pricing: { price_details: { price: 'price_qa' } },
          period: { start: 100, end: 200 }
        }
      ]
    }
  };
  const payments: any = {
    has_more: false,
    data: [
      {
        amount_paid: 999,
        currency: 'usd',
        payment: { type: 'payment_intent', payment_intent: 'pi_qa' }
      }
    ]
  };
  const pi: any = {
    status: 'succeeded',
    amount_received: 999,
    latest_charge: 'ch_qa'
  };
  const charge: any = {
    livemode: false,
    customer: 'cus_qa',
    paid: true,
    disputed: false,
    amount: 999,
    currency: 'usd',
    refunded: false,
    amount_refunded: 0
  };
  const stripe = {
    invoices: { retrieve: vi.fn(async () => invoice) },
    invoicePayments: { list: vi.fn(async () => payments) },
    paymentIntents: { retrieve: vi.fn(async () => pi) },
    charges: { retrieve: vi.fn(async () => charge) }
  } as unknown as Stripe;
  return { m, s, invoice, payments, pi, charge, stripe };
}
describe('SiSkill membership access from actual paid periods', () => {
  it('grants paid active period and keeps access after cancel-at-period-end', async () => {
    const f = fixture();
    expect((await verifyPaidPeriod(f.m, f.s, f.stripe, 150)).active).toBe(true);
    f.s.cancel_at_period_end = true;
    expect(await verifyPaidPeriod(f.m, f.s, f.stripe, 150)).toMatchObject({
      active: true,
      cancelAtPeriodEnd: true
    });
    expect((await verifyPaidPeriod(f.m, f.s, f.stripe, 201)).active).toBe(
      false
    );
  });
  it.each([
    'incomplete',
    'past_due',
    'unpaid',
    'paused',
    'canceled',
    'trialing'
  ])('denies %s even with old paid invoice', async (status) => {
    const f = fixture();
    f.s.status = status;
    expect((await verifyPaidPeriod(f.m, f.s, f.stripe, 150)).active).toBe(
      false
    );
    expect(f.stripe.invoices.retrieve).not.toHaveBeenCalled();
  });
  it('denies old invoice after renewal and unlocks only a matching newly paid period', async () => {
    const f = fixture();
    f.s.items.data[0].current_period_start = 200;
    f.s.items.data[0].current_period_end = 300;
    expect((await verifyPaidPeriod(f.m, f.s, f.stripe, 250)).active).toBe(
      false
    );
    f.invoice.lines.data[0].period = { start: 200, end: 300 };
    expect((await verifyPaidPeriod(f.m, f.s, f.stripe, 250)).active).toBe(true);
  });
  it('full refund and dispute deny access; partial refund does not revoke the whole period', async () => {
    const f = fixture();
    f.charge.amount_refunded = 100;
    expect((await verifyPaidPeriod(f.m, f.s, f.stripe, 150)).active).toBe(true);
    f.charge.amount_refunded = 999;
    expect((await verifyPaidPeriod(f.m, f.s, f.stripe, 150)).active).toBe(
      false
    );
    f.charge.amount_refunded = 0;
    f.charge.disputed = true;
    expect((await verifyPaidPeriod(f.m, f.s, f.stripe, 150)).status).toBe(
      'disputed'
    );
  });
  it('rejects cross-product, owner, price and live/test contract mismatches', () => {
    for (const change of [
      (f: any) => (f.s.metadata.product_scope = 'webtomind'),
      (f: any) => (f.s.metadata.user_id = 'user-b'),
      (f: any) => (f.s.items.data[0].price.id = 'price_other'),
      (f: any) => (f.s.livemode = true)
    ]) {
      const f = fixture();
      change(f);
      expect(() => verifyMemberContract(f.m, f.s)).toThrow(
        'MEMBERSHIP_MISMATCH'
      );
    }
  });
  it('requires matching amount, customer, paid charge and subscription invoice', async () => {
    for (const change of [
      (f: any) => (f.invoice.amount_paid = 0),
      (f: any) => (f.invoice.customer = 'cus_other'),
      (f: any) =>
        (f.invoice.parent.subscription_details.subscription = 'sub_other'),
      (f: any) => (f.charge.paid = false),
      (f: any) => (f.payments.has_more = true)
    ]) {
      const f = fixture();
      change(f);
      expect((await verifyPaidPeriod(f.m, f.s, f.stripe, 150)).active).toBe(
        false
      );
    }
  });
  it('fails closed on provider outage', async () => {
    const f = fixture();
    vi.mocked(f.stripe.invoices.retrieve).mockRejectedValue(Error('network'));
    await expect(verifyPaidPeriod(f.m, f.s, f.stripe, 150)).rejects.toThrow(
      'network'
    );
  });
});

it('renewal changes cannot address another owner or pass arbitrary subscription IDs', async () => {
  const { changeRenewal } =
    await import('../../apps/siskill/server/membership');
  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    neq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({ data: null, error: null }))
  };
  const update = vi.fn();
  const deps: any = {
    db: { from: vi.fn(() => query) },
    stripe: { subscriptions: { update } }
  };
  await expect(
    changeRenewal('other-user', { cancelAtPeriodEnd: true }, deps)
  ).rejects.toThrow('MEMBERSHIP_NOT_FOUND');
  expect(query.eq).toHaveBeenCalledWith('user_id', 'other-user');
  expect(update).not.toHaveBeenCalled();
  await expect(
    changeRenewal(
      'other-user',
      { cancelAtPeriodEnd: true, subscription: 'sub_victim' },
      deps
    )
  ).rejects.toThrow('INVALID_MEMBERSHIP');
});
