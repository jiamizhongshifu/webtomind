import type Stripe from 'stripe';

// Basil moved billing periods to subscription items. Keep legacy webhook
// compatibility, but never invent a paid period when required data is absent.
export function getStripeSubscriptionPeriod(subscription: Stripe.Subscription) {
  const legacy = subscription as unknown as {
    current_period_start?: number;
    current_period_end?: number;
  };
  const starts =
    subscription.items?.data
      ?.map((item) => item.current_period_start)
      .filter((value) => Number.isFinite(value) && value > 0) || [];
  const ends =
    subscription.items?.data
      ?.map((item) => item.current_period_end)
      .filter((value) => Number.isFinite(value) && value > 0) || [];
  const start = starts.length
    ? Math.max(...starts)
    : legacy.current_period_start;
  const end = ends.length ? Math.min(...ends) : legacy.current_period_end;
  if (
    !start ||
    !end ||
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    end <= start
  ) {
    throw new Error('Stripe subscription billing period is missing or invalid');
  }
  return {
    start: new Date(start * 1000).toISOString(),
    end: new Date(end * 1000).toISOString()
  };
}

export function getStripeInvoiceSubscriptionId(
  invoice: Stripe.Invoice
): string | null {
  const legacy = invoice as unknown as {
    subscription?: string | { id: string } | null;
  };
  const subscription =
    invoice.parent?.subscription_details?.subscription || legacy.subscription;
  return typeof subscription === 'string'
    ? subscription
    : subscription?.id || null;
}
