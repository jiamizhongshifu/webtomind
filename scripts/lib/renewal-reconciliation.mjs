export function renewalEventRow(invoice, subscription) {
  const subscriptionId =
    typeof invoice.parent?.subscription_details?.subscription === 'string'
      ? invoice.parent.subscription_details.subscription
      : invoice.parent?.subscription_details?.subscription?.id;
  const legacyId =
    typeof invoice.subscription === 'string'
      ? invoice.subscription
      : invoice.subscription?.id;
  if (
    !invoice.livemode ||
    invoice.status !== 'paid' ||
    invoice.billing_reason !== 'subscription_cycle' ||
    (subscriptionId || legacyId) !== subscription.stripe_subscription_id ||
    !subscription.user_id ||
    !subscription.plan_id ||
    !invoice.status_transitions?.paid_at
  )
    return null;
  return {
    event_name: 'subscription_renewal_succeeded',
    event_source: 'stripe_invoice_reconciliation',
    user_id: subscription.user_id,
    entity_type: 'stripe_invoice',
    entity_id: invoice.id,
    product_type: 'subscription',
    product_id: subscription.plan_id,
    cta_source: 'subscription_renewal',
    idempotency_key: `subscription_renewal_succeeded:${invoice.id}`,
    occurred_at: new Date(
      invoice.status_transitions.paid_at * 1000
    ).toISOString(),
    metadata: {
      stripe_invoice_id: invoice.id,
      stripe_subscription_id: subscription.stripe_subscription_id,
      billing_reason: invoice.billing_reason,
      amount_paid: invoice.amount_paid,
      currency: invoice.currency,
      acquisition_event: false,
      reconciliation: true
    }
  };
}
