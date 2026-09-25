-- Distinguish recurring Stripe subscriptions from fixed-term prepaid
-- entitlements purchased through other verified payment providers.

SET search_path = public;

ALTER TABLE public.user_subscriptions
  ADD COLUMN IF NOT EXISTS payment_provider TEXT,
  ADD COLUMN IF NOT EXISTS external_subscription_id TEXT;

UPDATE public.user_subscriptions
SET payment_provider = 'stripe'
WHERE payment_provider IS NULL
  AND (
    stripe_subscription_id IS NOT NULL
    OR stripe_customer_id IS NOT NULL
  );

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_subscriptions_payment_provider_check'
      AND conrelid = 'public.user_subscriptions'::regclass
  ) THEN
    ALTER TABLE public.user_subscriptions
      ADD CONSTRAINT user_subscriptions_payment_provider_check
      CHECK (
        payment_provider IS NULL
        OR payment_provider = ANY (ARRAY['stripe'::TEXT, 'zpay'::TEXT])
      );
  END IF;
END
$migration$;

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_external_provider
  ON public.user_subscriptions (payment_provider, external_subscription_id)
  WHERE external_subscription_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_orders_provider_order
  ON public.payment_orders (provider, provider_order_id)
  WHERE provider_order_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
