-- Preserve unexpired access from legacy Stripe test-mode subscriptions while
-- allowing the user to convert that entitlement into a real live subscription.
--
-- These rows predate stripe_subscription_id/stripe_customer_id persistence.
-- Marking them canceled keeps access through current_period_end, while the
-- checkout policy allows only unmanaged canceled entitlements to start a new
-- paid Checkout. The completed live webhook then reconciles this same row.

SET search_path = public;

DO $migration$
DECLARE
  migrated_count INTEGER := 0;
BEGIN
  -- provider_subscription_id exists only on databases upgraded from the
  -- original Stripe integration. Keep fresh installs compatible.
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_subscriptions'
      AND column_name = 'provider_subscription_id'
  ) THEN
    EXECUTE $sql$
      UPDATE public.user_subscriptions AS subscription
      SET
        status = 'canceled',
        cancel_at_period_end = TRUE,
        updated_at = NOW()
      WHERE subscription.status = 'active'
        AND subscription.current_period_end > NOW()
        AND subscription.stripe_subscription_id IS NULL
        AND subscription.stripe_customer_id IS NULL
        AND subscription.provider_subscription_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.payment_orders AS payment_order
          WHERE payment_order.user_id = subscription.user_id
            AND payment_order.product_type = 'subscription'
            AND payment_order.product_id = subscription.plan_id
            AND payment_order.status = 'succeeded'
            AND payment_order.provider_order_id LIKE 'cs\_test\_%' ESCAPE '\'
            AND payment_order.created_at BETWEEN
              subscription.created_at - INTERVAL '24 hours'
              AND subscription.created_at + INTERVAL '24 hours'
        )
    $sql$;

    GET DIAGNOSTICS migrated_count = ROW_COUNT;
  END IF;

  RAISE NOTICE
    'Converted % legacy test subscription entitlement(s)',
    migrated_count;
END
$migration$;
