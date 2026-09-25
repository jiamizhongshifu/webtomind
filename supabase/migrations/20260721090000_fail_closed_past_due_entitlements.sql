-- Stripe past_due subscriptions must remain manageable in the billing portal,
-- but they must not receive or consume paid member entitlements.

SET search_path = public;

-- Subscription grants must remain in the revocable, non-rollover wallet.
-- Durable media credits are reserved for one-off package purchases.
CREATE OR REPLACE FUNCTION public.add_subscription_credits(
  p_user_id UUID,
  p_amount INTEGER,
  p_source TEXT DEFAULT 'subscription_reward',
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS VOID AS $add_subscription_credits$
DECLARE
  v_metadata JSONB := COALESCE(p_metadata, '{}'::jsonb);
  v_idempotency_key TEXT := NULLIF(v_metadata->>'idempotency_key', '');
  v_period_start TIMESTAMPTZ;
  v_period_end TIMESTAMPTZ;
  v_balance INTEGER;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Subscription credit amount must be positive';
  END IF;

  IF v_idempotency_key IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(
      hashtext('add_subscription_credits'),
      hashtext(p_user_id::TEXT || ':' || p_source || ':' || v_idempotency_key)
    );

    IF EXISTS (
      SELECT 1
      FROM public.credit_transactions
      WHERE user_id = p_user_id
        AND source = p_source
        AND metadata->>'idempotency_key' = v_idempotency_key
    ) THEN
      RETURN;
    END IF;
  END IF;

  v_period_start := COALESCE(
    NULLIF(v_metadata->>'grant_period_start', '')::TIMESTAMPTZ,
    date_trunc('month', NOW())
  );
  v_period_end := COALESCE(
    NULLIF(v_metadata->>'grant_period_end', '')::TIMESTAMPTZ,
    v_period_start + INTERVAL '1 month'
  );

  INSERT INTO public.user_credits (
    user_id,
    daily_credits,
    daily_credits_max,
    last_daily_refresh,
    daily_image_gen_used,
    daily_image_gen_max,
    subscription_credits,
    subscription_credits_max,
    subscription_credits_period_start,
    subscription_credits_period_end,
    total_earned
  ) VALUES (
    p_user_id,
    0,
    0,
    CURRENT_DATE,
    0,
    -1,
    p_amount,
    p_amount,
    v_period_start,
    v_period_end,
    p_amount
  )
  ON CONFLICT (user_id) DO UPDATE SET
    daily_credits = 0,
    daily_credits_max = 0,
    subscription_credits = EXCLUDED.subscription_credits,
    subscription_credits_max = EXCLUDED.subscription_credits_max,
    subscription_credits_period_start = EXCLUDED.subscription_credits_period_start,
    subscription_credits_period_end = EXCLUDED.subscription_credits_period_end,
    total_earned = COALESCE(public.user_credits.total_earned, 0) + EXCLUDED.subscription_credits,
    updated_at = NOW()
  RETURNING
    COALESCE(daily_credits, 0) +
    COALESCE(subscription_credits, 0) +
    COALESCE(bonus_credits, 0) +
    COALESCE(referral_credits, 0) +
    COALESCE(media_credits, 0) +
    COALESCE(promo_media_credits, 0)
  INTO v_balance;

  INSERT INTO public.credit_transactions (
    user_id,
    type,
    credit_type,
    amount,
    balance_after,
    source,
    metadata
  ) VALUES (
    p_user_id,
    'subscription_grant',
    'subscription',
    p_amount,
    v_balance,
    p_source,
    v_metadata || jsonb_build_object(
      'grant_period_start', v_period_start,
      'grant_period_end', v_period_end
    )
  );
END;
$add_subscription_credits$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.add_subscription_credits(UUID, INTEGER, TEXT, JSONB)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_subscription_credits(UUID, INTEGER, TEXT, JSONB)
TO service_role;

DO $policy$
DECLARE
  v_signature TEXT;
  v_definition TEXT;
  v_rewritten TEXT;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.grant_subscription_credits_if_due(uuid)',
    'public.consume_credits(uuid,text,jsonb)',
    'public.consume_weaving_quota(uuid,text)'
  ]
  LOOP
    IF to_regprocedure(v_signature) IS NULL THEN
      RAISE EXCEPTION 'Required entitlement function is missing: %', v_signature;
    END IF;

    SELECT pg_get_functiondef(to_regprocedure(v_signature))
    INTO v_definition;

    v_rewritten := replace(
      v_definition,
      $$status IN ('active', 'trialing', 'past_due', 'canceled')$$,
      $$status IN ('active', 'trialing', 'canceled')$$
    );
    v_rewritten := replace(
      v_rewritten,
      $$v_subscription.status IN ('active', 'trialing', 'past_due')$$,
      $$v_subscription.status IN ('active', 'trialing')$$
    );
    IF v_signature = 'public.grant_subscription_credits_if_due(uuid)' THEN
      v_rewritten := replace(
        v_rewritten,
        'PERFORM public.add_bonus_credits(',
        'PERFORM public.add_subscription_credits('
      );
    END IF;

    IF v_rewritten = v_definition OR position('past_due' IN v_rewritten) > 0 THEN
      RAISE EXCEPTION 'Could not safely harden entitlement function: %', v_signature;
    END IF;

    EXECUTE v_rewritten;
  END LOOP;
END;
$policy$;

UPDATE public.user_credits AS credits
SET
  subscription_credits = 0,
  subscription_credits_max = 0,
  daily_credits = 100,
  daily_credits_max = 100,
  daily_image_gen_used = 0,
  daily_image_gen_max = 1,
  last_daily_refresh = CURRENT_DATE,
  updated_at = NOW()
WHERE EXISTS (
  SELECT 1
  FROM public.user_subscriptions AS subscriptions
  WHERE subscriptions.user_id = credits.user_id
    AND subscriptions.status = 'past_due'
);

NOTIFY pgrst, 'reload schema';
