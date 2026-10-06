import { describe, it, expect, vi } from 'vitest';
import {
  findOrphanCheckoutSession,
  resolvePendingSubscriptionCheckout
} from '../../api/membership/pending-checkout';
const oldOrder = {
  id: 'order-1',
  user_id: 'user-1',
  created_at: '2026-08-21T06:42:22Z'
};
function mockOrder(overrides = {}, updated: unknown = { id: 'order-1' }) {
  const order = {
    ...oldOrder,
    provider: 'stripe',
    provider_order_id: 'cs_1',
    product_id: 'pro',
    metadata: { billingCycle: 'monthly' },
    status: 'pending',
    ...overrides
  };
  const q = {
    select: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    in: vi.fn(),
    update: vi.fn(),
    order: vi.fn().mockResolvedValue({ data: [order], error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: updated, error: null })
  };
  for (const key of ['select', 'eq', 'is', 'in', 'update'] as const)
    q[key].mockReturnValue(q);
  return { from: vi.fn(() => q), q };
}
const openSession = {
  id: 'cs_1',
  status: 'open',
  mode: 'subscription',
  url: 'https://checkout.stripe.com/test',
  metadata: { order_id: 'order-1', user_id: 'user-1' }
};
function provider(data: unknown[] = [], has_more = false) {
  const list = vi.fn().mockResolvedValue({ data, has_more });
  const retrieve = vi.fn().mockResolvedValue(openSession);
  return { checkout: { sessions: { list, retrieve } } };
}
const resolve = (
  db: ReturnType<typeof mockOrder>,
  stripe: ReturnType<typeof provider> | null
) =>
  resolvePendingSubscriptionCheckout(
    db as never,
    stripe as never,
    'user-1',
    'pro',
    'monthly'
  );
describe('serialized pending checkout recovery', () => {
  it('reuses the existing same-plan open session', async () => {
    const stripe = provider();
    expect(await resolve(mockOrder(), stripe)).toMatchObject({
      sessionId: 'cs_1',
      reused: true
    });
    expect(stripe.checkout.sessions.retrieve).toHaveBeenCalledWith('cs_1');
  });
  it('keeps unknown external creation reserved without a provider', async () => {
    expect(
      (await resolve(mockOrder({ provider_order_id: null }), null)).errorCode
    ).toBe('SUBSCRIPTION_CHECKOUT_IN_PROGRESS');
  });
  it('links a lost session and reuses it without creating another', async () => {
    const db = mockOrder({ provider_order_id: null });
    expect(await resolve(db, provider([openSession]))).toMatchObject({
      reused: true,
      sessionId: 'cs_1'
    });
    expect(db.q.update).toHaveBeenCalledWith(
      expect.objectContaining({ provider_order_id: 'cs_1' })
    );
    expect(db.q.is).toHaveBeenCalledWith('provider_order_id', null);
  });
  it('expires only after a complete empty scan and a successful conditional write', async () => {
    const db = mockOrder({ provider_order_id: null });
    expect((await resolve(db, provider())).errorCode).toBe('CHECKOUT_EXPIRED');
    expect(db.q.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'expired' })
    );
    const raced = mockOrder({ provider_order_id: null }, null);
    expect((await resolve(raced, provider())).errorCode).toBe(
      'SUBSCRIPTION_CHECKOUT_IN_PROGRESS'
    );
  });
  it('does not return an open URL when a webhook won the link race', async () => {
    expect(
      (
        await resolve(
          mockOrder({ provider_order_id: null }, null),
          provider([openSession])
        )
      ).url
    ).toBeUndefined();
  });
  it.each(['complete', 'processing'])(
    'never releases a %s checkout/order',
    async (status) => {
      const db = mockOrder({
        provider_order_id: null,
        ...(status === 'processing' ? { status } : {})
      });
      const stripe = provider([
        { ...openSession, status: 'complete', payment_status: 'paid' }
      ]);
      expect((await resolve(db, stripe)).errorCode).toBe(
        'SUBSCRIPTION_CHECKOUT_IN_PROGRESS'
      );
      expect(db.q.update.mock.calls.every(([value]) => !value.status)).toBe(
        true
      );
    }
  );
  it('does not reuse another plan', async () => {
    expect(
      (await resolve(mockOrder({ product_id: 'max' }), provider())).url
    ).toBeUndefined();
  });
  it('does not release on provider failure', async () => {
    const db = mockOrder({ provider_order_id: null });
    const stripe = provider();
    stripe.checkout.sessions.list.mockRejectedValue(new Error('network'));
    await expect(resolve(db, stripe)).rejects.toThrow('network');
    expect(db.q.update).not.toHaveBeenCalled();
  });
});
describe('bounded provider evidence', () => {
  it('waits for in-flight creation before querying', async () => {
    const stripe = provider();
    expect(
      await findOrphanCheckoutSession(stripe as never, {
        ...oldOrder,
        created_at: new Date().toISOString()
      })
    ).toEqual({ complete: false, session: null });
    expect(stripe.checkout.sessions.list).not.toHaveBeenCalled();
  });
  it('follows pagination to discover a later match', async () => {
    const stripe = provider();
    stripe.checkout.sessions.list
      .mockResolvedValueOnce({ data: [{ id: 'unrelated' }], has_more: true })
      .mockResolvedValueOnce({ data: [openSession], has_more: false });
    expect(
      (await findOrphanCheckoutSession(stripe as never, oldOrder)).session?.id
    ).toBe('cs_1');
    expect(stripe.checkout.sessions.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ starting_after: 'unrelated' }),
      expect.objectContaining({
        maxNetworkRetries: 0,
        timeout: expect.any(Number)
      })
    );
  });
  it.each([
    { data: [{ id: 'unrelated' }], has_more: true },
    { data: [openSession, { ...openSession, id: 'cs_2' }], has_more: false },
    {
      data: [
        { ...openSession, metadata: { order_id: 'order-1', user_id: 'other' } }
      ],
      has_more: false
    }
  ])(
    'retains reservation for partial/ambiguous/mismatched evidence',
    async ({ data, has_more }) => {
      const stripe = provider(data, has_more);
      const db = mockOrder({ provider_order_id: null });
      expect((await resolve(db, stripe)).errorCode).toBe(
        'SUBSCRIPTION_CHECKOUT_IN_PROGRESS'
      );
      expect(db.q.update).not.toHaveBeenCalled();
      expect(
        stripe.checkout.sessions.list.mock.calls.length
      ).toBeLessThanOrEqual(5);
    }
  );
});
