-- Make bonus credit grants idempotent at the database boundary.
-- Webhooks and monthly subscription grants can be retried or run concurrently;
-- the credit ledger must be the source of truth for "grant once".

SET search_path = public;

DO $idempotent_credit_grants$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'idx_credit_transactions_idempotency_key'
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM (
        SELECT source, metadata->>'idempotency_key' AS idempotency_key, COUNT(*) AS count
        FROM public.credit_transactions
        WHERE metadata ? 'idempotency_key'
        GROUP BY source, metadata->>'idempotency_key'
        HAVING COUNT(*) > 1
      ) duplicates
    ) THEN
      EXECUTE 'CREATE UNIQUE INDEX idx_credit_transactions_idempotency_key ON public.credit_transactions (source, ((metadata->>''idempotency_key''))) WHERE metadata ? ''idempotency_key''';
    ELSE
      RAISE NOTICE 'Skipped idx_credit_transactions_idempotency_key because duplicate idempotency keys already exist.';
    END IF;
	END IF;
END;
$idempotent_credit_grants$;

CREATE OR REPLACE FUNCTION add_bonus_credits(
    p_user_id UUID,
    p_amount INTEGER,
    p_source TEXT,
    p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS VOID AS $add_bonus_credits$
DECLARE
    v_current_bonus INTEGER;
    v_current_daily INTEGER;
    v_tx_type TEXT;
    v_metadata JSONB := COALESCE(p_metadata, '{}'::jsonb);
    v_idempotency_key TEXT;
    v_order_id TEXT;
    v_invoice_id TEXT;
BEGIN
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'Bonus credit amount must be positive';
    END IF;

    v_tx_type := CASE
        WHEN p_source = 'subscription_reward' THEN 'subscription_grant'
        WHEN p_source IN ('referral_reward', 'referred_welcome') THEN 'referral_reward'
        ELSE 'purchase'
    END;

    v_order_id := NULLIF(v_metadata->>'order_id', '');
    v_invoice_id := NULLIF(v_metadata->>'invoice_id', '');
    v_idempotency_key := NULLIF(v_metadata->>'idempotency_key', '');

    IF v_idempotency_key IS NULL THEN
        IF v_order_id IS NOT NULL THEN
            v_idempotency_key := 'order:' || v_order_id;
        ELSIF v_invoice_id IS NOT NULL THEN
            v_idempotency_key := 'stripe_invoice:' || v_invoice_id;
        END IF;
    END IF;

    IF v_idempotency_key IS NOT NULL THEN
        v_metadata := v_metadata || jsonb_build_object('idempotency_key', v_idempotency_key);

        PERFORM pg_advisory_xact_lock(
            hashtext('add_bonus_credits'),
            hashtext(p_source || ':' || v_idempotency_key)
        );

        IF EXISTS (
            SELECT 1
            FROM public.credit_transactions
            WHERE user_id = p_user_id
              AND source = p_source
              AND (
                metadata->>'idempotency_key' = v_idempotency_key
                OR (v_order_id IS NOT NULL AND metadata->>'order_id' = v_order_id)
                OR (v_invoice_id IS NOT NULL AND metadata->>'invoice_id' = v_invoice_id)
              )
        ) THEN
            RETURN;
        END IF;
    END IF;

    INSERT INTO public.user_credits (
        user_id,
        daily_credits,
        daily_credits_max,
        bonus_credits,
        total_earned
    ) VALUES (
        p_user_id,
        300,
        300,
        p_amount,
        p_amount
    )
    ON CONFLICT (user_id) DO UPDATE SET
        bonus_credits = COALESCE(public.user_credits.bonus_credits, 0) + EXCLUDED.bonus_credits,
        total_earned = COALESCE(public.user_credits.total_earned, 0) + EXCLUDED.bonus_credits,
        updated_at = NOW()
    RETURNING bonus_credits, daily_credits
    INTO v_current_bonus, v_current_daily;

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
        v_tx_type,
        'bonus',
        p_amount,
        COALESCE(v_current_bonus, 0) + COALESCE(v_current_daily, 0),
        p_source,
        v_metadata
    );
END;
$add_bonus_credits$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION grant_subscription_credits_if_due(
  p_user_id UUID
) RETURNS JSONB AS $grant_subscription_credits_if_due$
DECLARE
  v_subscription RECORD;
  v_plan RECORD;
  v_last_grant TIMESTAMPTZ;
  v_effective_now TIMESTAMPTZ;
  v_months_due INTEGER;
  v_amount INTEGER;
  v_grant_key TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtext('grant_subscription_credits'),
    hashtext(p_user_id::text)
  );

  SELECT * INTO v_subscription
  FROM public.user_subscriptions
  WHERE user_id = p_user_id
    AND status IN ('active', 'trialing', 'past_due', 'canceled')
  ORDER BY current_period_start DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('granted', false, 'reason', 'no_subscription');
  END IF;

  IF v_subscription.status = 'canceled'
     AND v_subscription.current_period_end::date < CURRENT_DATE THEN
    RETURN jsonb_build_object('granted', false, 'reason', 'period_ended');
  END IF;

  SELECT * INTO v_plan
  FROM public.subscription_plans
  WHERE id = v_subscription.plan_id;

  IF NOT FOUND OR v_plan.monthly_credits IS NULL OR v_plan.monthly_credits <= 0 THEN
    RETURN jsonb_build_object('granted', false, 'reason', 'no_monthly_credits');
  END IF;

  SELECT MAX(created_at) INTO v_last_grant
  FROM public.credit_transactions
  WHERE user_id = p_user_id
    AND source = 'subscription_reward';

  v_effective_now := LEAST(NOW(), v_subscription.current_period_end);

  IF v_last_grant IS NULL THEN
    v_months_due := 1;
  ELSE
    IF v_effective_now <= v_last_grant + INTERVAL '1 month' THEN
      RETURN jsonb_build_object('granted', false, 'reason', 'not_due');
    END IF;

    v_months_due :=
      (date_part('year', age(v_effective_now, v_last_grant)) * 12
       + date_part('month', age(v_effective_now, v_last_grant)))::INTEGER;

    IF v_months_due < 1 THEN
      RETURN jsonb_build_object('granted', false, 'reason', 'not_due');
    END IF;
  END IF;

  v_amount := v_months_due * v_plan.monthly_credits;
  v_grant_key :=
    'subscription_due:' ||
    v_subscription.id::text ||
    ':' ||
    date_trunc('month', v_effective_now)::date::text;

  PERFORM public.add_bonus_credits(
    p_user_id,
    v_amount,
    'subscription_reward',
    jsonb_build_object(
      'plan_id', v_subscription.plan_id,
      'months', v_months_due,
      'grant_through', v_effective_now,
      'idempotency_key', v_grant_key
    )
  );

  RETURN jsonb_build_object('granted', true, 'months', v_months_due, 'amount', v_amount);
END;
$grant_subscription_credits_if_due$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION add_bonus_credits(UUID, INTEGER, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION grant_subscription_credits_if_due(UUID) TO authenticated;
