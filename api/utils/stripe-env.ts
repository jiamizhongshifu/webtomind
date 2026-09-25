type StripeRuntimeMode = 'live' | 'test';

function getExplicitStripeMode(): StripeRuntimeMode | null {
  const rawMode = (
    process.env.STRIPE_MODE ||
    process.env.PAYMENT_STRIPE_MODE ||
    ''
  )
    .trim()
    .toLowerCase();

  if (rawMode === 'test') return 'test';
  if (rawMode === 'live') return 'live';
  return null;
}

export function getStripeSecretKey(): string {
  const mode = getExplicitStripeMode();
  if (mode === 'test') return process.env.STRIPE_SECRET_KEY_TEST || '';
  if (mode === 'live') return process.env.STRIPE_SECRET_KEY || '';
  return (
    process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY_TEST || ''
  );
}

export function getStripeWebhookSecret(): string {
  const mode = getExplicitStripeMode();
  if (mode === 'test') return process.env.STRIPE_WEBHOOK_SECRET_TEST || '';
  if (mode === 'live') return process.env.STRIPE_WEBHOOK_SECRET || '';
  return (
    process.env.STRIPE_WEBHOOK_SECRET ||
    process.env.STRIPE_WEBHOOK_SECRET_TEST ||
    ''
  );
}

export function hasStripeCheckoutConfig(): boolean {
  const explicitlyDisabled =
    (process.env.STRIPE_CHECKOUT_ENABLED || '').trim().toLowerCase() ===
    'false';
  // The public plans endpoint must not advertise a payment method that the
  // checkout handler cannot actually initialize. The feature flag remains a
  // kill switch, while the secret key is the source of truth for readiness.
  return !explicitlyDisabled && Boolean(getStripeSecretKey());
}
