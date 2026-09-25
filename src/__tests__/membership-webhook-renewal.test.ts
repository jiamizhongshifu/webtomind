import { describe, expect, it, vi } from 'vitest';
import type Stripe from 'stripe';
import { recordStripeSubscriptionRenewalEvent } from '../../api/membership/webhook';

describe('membership webhook renewal measurement', () => {
  it('records recurring revenue separately from acquisition purchases', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const supabase = { from: vi.fn(() => ({ upsert })) };
    await recordStripeSubscriptionRenewalEvent({
      supabase: supabase as never,
      invoice: {
        id: 'in_renewal_1',
        billing_reason: 'subscription_cycle',
        amount_paid: 2000,
        currency: 'usd'
      } as Stripe.Invoice,
      eventId: 'evt_renewal_1',
      userId: 'user-1',
      planId: 'pro',
      subscriptionId: 'sub-1'
    });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        event_name: 'subscription_renewal_succeeded',
        order_id: null,
        idempotency_key: 'subscription_renewal_succeeded:in_renewal_1'
      }),
      { onConflict: 'idempotency_key', ignoreDuplicates: true }
    );
  });
});
