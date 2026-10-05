import { describe, it, expect, vi } from 'vitest';
import { resolvePendingSubscriptionCheckout } from '../../api/membership/pending-checkout';
function mockOrder(overrides = {}) {
  const order = {
    id: 'order-1',
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
    in: vi.fn(),
    order: vi.fn().mockResolvedValue({ data: [order], error: null })
  };
  q.select.mockReturnValue(q);
  q.eq.mockReturnValue(q);
  q.in.mockReturnValue(q);
  return { from: vi.fn(() => q) };
}
describe('serialized pending checkout recovery', () => {
  it('reuses an open same-plan provider session without creating another', async () => {
    const retrieve = vi
      .fn()
      .mockResolvedValue({
        id: 'cs_1',
        status: 'open',
        url: 'https://checkout.stripe.com/test'
      });
    const result = await resolvePendingSubscriptionCheckout(
      mockOrder() as never,
      { checkout: { sessions: { retrieve } } } as never,
      'user-1',
      'pro',
      'monthly'
    );
    expect(result).toMatchObject({
      id: 'order-1',
      sessionId: 'cs_1',
      reused: true
    });
    expect(retrieve).toHaveBeenCalledWith('cs_1');
  });
  it('keeps unknown external creation reserved for reconciliation', async () => {
    const result = await resolvePendingSubscriptionCheckout(
      mockOrder({ provider_order_id: null }) as never,
      null,
      'user-1',
      'pro',
      'monthly'
    );
    expect(result.errorCode).toBe('SUBSCRIPTION_CHECKOUT_IN_PROGRESS');
    expect(result.url).toBeUndefined();
  });
});
