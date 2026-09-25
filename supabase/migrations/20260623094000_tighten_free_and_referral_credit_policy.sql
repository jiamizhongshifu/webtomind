-- Tighten free-trial credits and make referral rewards a slower-use wallet.
-- Policy:
-- 1. Free users refresh 100 daily credits instead of 300.
-- 2. Referral rewards land in referral_credits, not unrestricted bonus_credits.
-- 3. Image generation can spend at most 100 referral credits per user per day.
-- 4. Capped referral credits are spent before durable bonus credits.

SET search_path = public;

UPDATE public.subscription_plans
SET
  monthly_credits = 100,
  limits = jsonb_set(
    jsonb_set(
      COALESCE(limits, '{}'::jsonb) - 'dailyImageGen',
      '{dailyCredits}',
      '100'::jsonb,
      true
    ),
    '{dailyImageGeneration}',
    '10'::jsonb,
    true
  ),
  updated_at = NOW()
WHERE name = 'free'
   OR id::text = 'free';

UPDATE public.user_credits
SET
  daily_credits = LEAST(COALESCE(daily_credits, 0), 100),
  daily_credits_max = 100,
  daily_image_gen_max = 10,
  updated_at = NOW()
WHERE NOT EXISTS (
    SELECT 1
    FROM public.user_subscriptions s
    WHERE s.user_id = public.user_credits.user_id
      AND s.status IN ('active', 'trialing', 'past_due', 'canceled')
      AND (
        s.status <> 'canceled'
        OR s.current_period_end::date >= CURRENT_DATE
      )
  )
  AND (
    COALESCE(daily_credits_max, 0) <> 100
    OR COALESCE(daily_credits, 0) > 100
    OR COALESCE(daily_image_gen_max, 0) <> 10
  );

ALTER TABLE public.credit_transactions
DROP CONSTRAINT IF EXISTS credit_transactions_credit_type_check;

ALTER TABLE public.credit_transactions
ADD CONSTRAINT credit_transactions_credit_type_check
CHECK (credit_type IN ('daily', 'subscription', 'bonus', 'referral', 'mixed'));

CREATE OR REPLACE FUNCTION public.add_bonus_credits(
    p_user_id UUID,
    p_amount INTEGER,
    p_source TEXT,
    p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS VOID AS $add_bonus_credits$
DECLARE
    v_current_bonus INTEGER;
    v_current_daily INTEGER;
    v_current_subscription INTEGER;
    v_current_referral INTEGER;
    v_tx_type TEXT;
    v_credit_type TEXT;
    v_metadata JSONB := COALESCE(p_metadata, '{}'::jsonb);
    v_idempotency_key TEXT;
    v_order_id TEXT;
    v_invoice_id TEXT;
    v_grant_period_start TIMESTAMPTZ;
    v_grant_period_end TIMESTAMPTZ;
    v_is_referral_reward BOOLEAN := p_source IN ('referral_reward', 'referred_welcome');
BEGIN
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'Bonus credit amount must be positive';
    END IF;

    v_tx_type := CASE
        WHEN p_source = 'subscription_reward' THEN 'subscription_grant'
        WHEN v_is_referral_reward THEN 'referral_reward'
        ELSE 'purchase'
    END;

    v_credit_type := CASE
        WHEN p_source = 'subscription_reward' THEN 'subscription'
        WHEN v_is_referral_reward THEN 'referral'
        ELSE 'bonus'
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

    IF p_source = 'subscription_reward' THEN
        v_grant_period_start := COALESCE(
            NULLIF(v_metadata->>'grant_period_start', '')::TIMESTAMPTZ,
            date_trunc('month', NOW())
        );
        v_grant_period_end := COALESCE(
            NULLIF(v_metadata->>'grant_period_end', '')::TIMESTAMPTZ,
            v_grant_period_start + INTERVAL '1 month'
        );

        INSERT INTO public.user_credits (
            user_id,
            daily_credits,
            daily_credits_max,
            daily_image_gen_max,
            bonus_credits,
            subscription_credits,
            subscription_credits_max,
            subscription_credits_period_start,
            subscription_credits_period_end,
            total_earned
        ) VALUES (
            p_user_id,
            0,
            0,
            -1,
            0,
            p_amount,
            p_amount,
            v_grant_period_start,
            v_grant_period_end,
            p_amount
        )
        ON CONFLICT (user_id) DO UPDATE SET
            subscription_credits = EXCLUDED.subscription_credits,
            subscription_credits_max = EXCLUDED.subscription_credits_max,
            subscription_credits_period_start = EXCLUDED.subscription_credits_period_start,
            subscription_credits_period_end = EXCLUDED.subscription_credits_period_end,
            total_earned = COALESCE(public.user_credits.total_earned, 0) + EXCLUDED.subscription_credits,
            updated_at = NOW()
        RETURNING bonus_credits, daily_credits, subscription_credits, COALESCE(referral_credits, 0)
        INTO v_current_bonus, v_current_daily, v_current_subscription, v_current_referral;
    ELSIF v_is_referral_reward THEN
        INSERT INTO public.user_credits (
            user_id,
            daily_credits,
            daily_credits_max,
            daily_image_gen_max,
            bonus_credits,
            referral_credits,
            total_earned
        ) VALUES (
            p_user_id,
            100,
            100,
            10,
            0,
            p_amount,
            p_amount
        )
        ON CONFLICT (user_id) DO UPDATE SET
            referral_credits = COALESCE(public.user_credits.referral_credits, 0) + EXCLUDED.referral_credits,
            total_earned = COALESCE(public.user_credits.total_earned, 0) + EXCLUDED.referral_credits,
            updated_at = NOW()
        RETURNING bonus_credits, daily_credits, subscription_credits, COALESCE(referral_credits, 0)
        INTO v_current_bonus, v_current_daily, v_current_subscription, v_current_referral;
    ELSE
        INSERT INTO public.user_credits (
            user_id,
            daily_credits,
            daily_credits_max,
            daily_image_gen_max,
            bonus_credits,
            total_earned
        ) VALUES (
            p_user_id,
            100,
            100,
            10,
            p_amount,
            p_amount
        )
        ON CONFLICT (user_id) DO UPDATE SET
            bonus_credits = COALESCE(public.user_credits.bonus_credits, 0) + EXCLUDED.bonus_credits,
            total_earned = COALESCE(public.user_credits.total_earned, 0) + EXCLUDED.bonus_credits,
            updated_at = NOW()
        RETURNING bonus_credits, daily_credits, subscription_credits, COALESCE(referral_credits, 0)
        INTO v_current_bonus, v_current_daily, v_current_subscription, v_current_referral;
    END IF;

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
        v_credit_type,
        p_amount,
        COALESCE(v_current_bonus, 0) +
          COALESCE(v_current_daily, 0) +
          COALESCE(v_current_subscription, 0) +
          COALESCE(v_current_referral, 0),
        p_source,
        v_metadata
    );
END;
$add_bonus_credits$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.consume_credits(
  p_user_id UUID,
  p_action TEXT,
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS JSONB AS $consume_credits$
DECLARE
  v_config RECORD;
  v_user_credits RECORD;
  v_existing_transaction RECORD;
  v_cost INTEGER;
  v_input_tokens INTEGER;
  v_output_tokens INTEGER;
  v_dynamic_credits INTEGER;
  v_allow_dynamic_above_max BOOLEAN := COALESCE((COALESCE(p_metadata, '{}'::jsonb)->>'allowDynamicCostAboveMax')::BOOLEAN, false);
  v_credit_type TEXT;
  v_idempotency_key TEXT := NULLIF(COALESCE(p_metadata, '{}'::jsonb)->>'idempotency_key', '');
  v_new_daily INTEGER;
  v_new_subscription INTEGER;
  v_new_bonus INTEGER;
  v_new_referral INTEGER;
  v_remaining INTEGER;
  v_daily_deduct INTEGER := 0;
  v_subscription_deduct INTEGER := 0;
  v_bonus_deduct INTEGER := 0;
  v_referral_deduct INTEGER := 0;
  v_today DATE := CURRENT_DATE;
  v_subscription RECORD;
  v_is_member BOOLEAN := false;
  v_free_daily_max INTEGER := 100;
  v_free_daily_image_gen_max INTEGER := 10;
  v_referral_daily_image_spend_limit INTEGER := 100;
  v_referral_spent_today INTEGER := 0;
  v_referral_available INTEGER := 0;
BEGIN
  SELECT * INTO v_config
  FROM public.credit_costs
  WHERE action = p_action
    AND is_active = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_ACTION', 'message', 'Invalid action');
  END IF;

  IF v_idempotency_key IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(
      hashtext('consume_credits'),
      hashtext(p_user_id::TEXT || ':' || p_action || ':' || v_idempotency_key)
    );

    SELECT *
    INTO v_existing_transaction
    FROM public.credit_transactions
    WHERE user_id = p_user_id
      AND source = p_action
      AND type = 'usage'
      AND metadata->>'idempotency_key' = v_idempotency_key
    ORDER BY created_at DESC
    LIMIT 1;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'success', true,
        'consumed', ABS(v_existing_transaction.amount),
        'credit_type', v_existing_transaction.credit_type,
        'credit_breakdown', COALESCE(
          v_existing_transaction.metadata->'creditBreakdown',
          '{}'::jsonb
        ),
        'balance', jsonb_build_object('total', v_existing_transaction.balance_after),
        'idempotent', true
      );
    END IF;
  END IF;

  SELECT * INTO v_subscription
  FROM public.user_subscriptions
  WHERE user_id = p_user_id
    AND status IN ('active', 'trialing', 'past_due', 'canceled')
  ORDER BY current_period_start DESC
  LIMIT 1;

  IF FOUND THEN
    IF v_subscription.status IN ('active', 'trialing', 'past_due') THEN
      v_is_member := true;
    ELSIF v_subscription.status = 'canceled'
      AND v_subscription.current_period_end::date >= v_today THEN
      v_is_member := true;
    END IF;
  END IF;

  IF v_is_member THEN
    PERFORM public.grant_subscription_credits_if_due(p_user_id);
  END IF;

  SELECT * INTO v_user_credits
  FROM public.user_credits
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'USER_NOT_FOUND', 'message', 'User not found');
  END IF;

  IF v_is_member THEN
    IF v_user_credits.daily_credits <> 0 OR v_user_credits.daily_credits_max <> 0 THEN
      UPDATE public.user_credits
      SET
        daily_credits = 0,
        daily_credits_max = 0,
        last_daily_refresh = v_today,
        updated_at = NOW()
      WHERE user_id = p_user_id;

      v_user_credits.daily_credits := 0;
      v_user_credits.daily_credits_max := 0;
      v_user_credits.last_daily_refresh := v_today;
    END IF;
  ELSE
    IF COALESCE(v_user_credits.subscription_credits, 0) <> 0
       OR COALESCE(v_user_credits.subscription_credits_max, 0) <> 0 THEN
      UPDATE public.user_credits
      SET
        subscription_credits = 0,
        subscription_credits_max = 0,
        updated_at = NOW()
      WHERE user_id = p_user_id;

      v_user_credits.subscription_credits := 0;
      v_user_credits.subscription_credits_max := 0;
    END IF;

    IF v_user_credits.daily_credits_max IS NULL OR v_user_credits.daily_credits_max = 0 THEN
      UPDATE public.user_credits
      SET daily_credits_max = v_free_daily_max
      WHERE user_id = p_user_id;

      v_user_credits.daily_credits_max := v_free_daily_max;
    ELSIF v_user_credits.daily_credits_max > v_free_daily_max THEN
      UPDATE public.user_credits
      SET
        daily_credits_max = v_free_daily_max,
        daily_credits = LEAST(COALESCE(daily_credits, 0), v_free_daily_max),
        updated_at = NOW()
      WHERE user_id = p_user_id;

      v_user_credits.daily_credits_max := v_free_daily_max;
      v_user_credits.daily_credits := LEAST(COALESCE(v_user_credits.daily_credits, 0), v_free_daily_max);
    END IF;

    IF v_user_credits.daily_image_gen_max IS NULL
       OR v_user_credits.daily_image_gen_max <> v_free_daily_image_gen_max THEN
      UPDATE public.user_credits
      SET
        daily_image_gen_max = v_free_daily_image_gen_max,
        updated_at = NOW()
      WHERE user_id = p_user_id;

      v_user_credits.daily_image_gen_max := v_free_daily_image_gen_max;
    END IF;

    IF v_user_credits.last_daily_refresh IS NULL OR v_user_credits.last_daily_refresh < v_today THEN
      UPDATE public.user_credits
      SET
        daily_credits = v_user_credits.daily_credits_max,
        daily_image_gen_used = 0,
        last_daily_refresh = v_today,
        updated_at = NOW()
      WHERE user_id = p_user_id;

      v_user_credits.daily_credits := v_user_credits.daily_credits_max;
      v_user_credits.daily_image_gen_used := 0;
      v_user_credits.last_daily_refresh := v_today;
    END IF;
  END IF;

  v_dynamic_credits := (COALESCE(p_metadata, '{}'::jsonb)->>'dynamicCredits')::INTEGER;

  IF v_dynamic_credits IS NOT NULL AND v_dynamic_credits > 0 THEN
    IF v_allow_dynamic_above_max THEN
      v_cost := GREATEST(v_dynamic_credits, v_config.min_cost);
    ELSE
      v_cost := LEAST(
        GREATEST(v_dynamic_credits, v_config.min_cost),
        COALESCE(v_config.max_cost, v_dynamic_credits)
      );
    END IF;
  ELSE
    v_input_tokens := COALESCE((COALESCE(p_metadata, '{}'::jsonb)->>'inputTokens')::INTEGER, 0);
    v_output_tokens := COALESCE((COALESCE(p_metadata, '{}'::jsonb)->>'outputTokens')::INTEGER, 0);
    v_cost := public.calculate_credit_cost(p_action, v_input_tokens, v_output_tokens);
  END IF;

  IF p_action = 'image_generation' THEN
    SELECT COALESCE(SUM((metadata->'creditBreakdown'->>'referral')::INTEGER), 0)
    INTO v_referral_spent_today
    FROM public.credit_transactions
    WHERE user_id = p_user_id
      AND type = 'usage'
      AND source = 'image_generation'
      AND amount < 0
      AND created_at >= date_trunc('day', NOW());

    v_referral_available := LEAST(
      COALESCE(v_user_credits.referral_credits, 0),
      GREATEST(0, v_referral_daily_image_spend_limit - COALESCE(v_referral_spent_today, 0))
    );
  END IF;

  IF (
    COALESCE(v_user_credits.daily_credits, 0) +
    COALESCE(v_user_credits.subscription_credits, 0) +
    COALESCE(v_user_credits.bonus_credits, 0) +
    COALESCE(v_referral_available, 0)
  ) < v_cost THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INSUFFICIENT_CREDITS',
      'required', v_cost,
      'current',
        COALESCE(v_user_credits.daily_credits, 0) +
        COALESCE(v_user_credits.subscription_credits, 0) +
        COALESCE(v_user_credits.bonus_credits, 0) +
        COALESCE(v_referral_available, 0)
    );
  END IF;

  IF p_action = 'image_generation' AND NOT v_is_member THEN
    IF v_user_credits.daily_image_gen_used >= v_user_credits.daily_image_gen_max THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'QUOTA_EXCEEDED',
        'feature', 'image_generation',
        'used', v_user_credits.daily_image_gen_used,
        'max', v_user_credits.daily_image_gen_max
      );
    END IF;
  END IF;

  v_remaining := v_cost;

  v_daily_deduct := LEAST(COALESCE(v_user_credits.daily_credits, 0), v_remaining);
  v_remaining := v_remaining - v_daily_deduct;

  v_subscription_deduct := LEAST(COALESCE(v_user_credits.subscription_credits, 0), v_remaining);
  v_remaining := v_remaining - v_subscription_deduct;

  v_referral_deduct := LEAST(COALESCE(v_referral_available, 0), v_remaining);
  v_remaining := v_remaining - v_referral_deduct;

  v_bonus_deduct := LEAST(COALESCE(v_user_credits.bonus_credits, 0), v_remaining);
  v_remaining := v_remaining - v_bonus_deduct;

  v_new_daily := COALESCE(v_user_credits.daily_credits, 0) - v_daily_deduct;
  v_new_subscription := COALESCE(v_user_credits.subscription_credits, 0) - v_subscription_deduct;
  v_new_bonus := COALESCE(v_user_credits.bonus_credits, 0) - v_bonus_deduct;
  v_new_referral := COALESCE(v_user_credits.referral_credits, 0) - v_referral_deduct;

  v_credit_type := CASE
    WHEN (CASE WHEN v_daily_deduct > 0 THEN 1 ELSE 0 END) +
         (CASE WHEN v_subscription_deduct > 0 THEN 1 ELSE 0 END) +
         (CASE WHEN v_bonus_deduct > 0 THEN 1 ELSE 0 END) +
         (CASE WHEN v_referral_deduct > 0 THEN 1 ELSE 0 END) > 1
      THEN 'mixed'
    WHEN v_daily_deduct > 0 THEN 'daily'
    WHEN v_subscription_deduct > 0 THEN 'subscription'
    WHEN v_bonus_deduct > 0 THEN 'bonus'
    ELSE 'referral'
  END;

  UPDATE public.user_credits
  SET
    daily_credits = v_new_daily,
    subscription_credits = v_new_subscription,
    bonus_credits = v_new_bonus,
    referral_credits = v_new_referral,
    total_consumed = total_consumed + v_cost,
    daily_image_gen_used = CASE
      WHEN p_action = 'image_generation' THEN daily_image_gen_used + 1
      ELSE daily_image_gen_used
    END,
    updated_at = NOW()
  WHERE user_id = p_user_id;

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
    'usage',
    v_credit_type,
    -v_cost,
    v_new_daily + v_new_subscription + v_new_bonus + v_new_referral,
    p_action,
    jsonb_build_object(
      'calculatedCost', v_cost,
      'pricingType', v_config.pricing_type,
      'isDynamic', v_dynamic_credits IS NOT NULL,
      'allowDynamicCostAboveMaxApplied', v_allow_dynamic_above_max,
      'creditBreakdown', jsonb_build_object(
        'daily', v_daily_deduct,
        'subscription', v_subscription_deduct,
        'bonus', v_bonus_deduct,
        'referral', v_referral_deduct
      )
    ) || COALESCE(p_metadata, '{}'::jsonb)
  );

  RETURN jsonb_build_object(
    'success', true,
    'consumed', v_cost,
    'credit_type', v_credit_type,
    'credit_breakdown', jsonb_build_object(
      'daily', v_daily_deduct,
      'subscription', v_subscription_deduct,
      'bonus', v_bonus_deduct,
      'referral', v_referral_deduct
    ),
    'balance', jsonb_build_object(
      'daily', v_new_daily,
      'subscription', v_new_subscription,
      'bonus', v_new_bonus,
      'referral', v_new_referral,
      'total', v_new_daily + v_new_subscription + v_new_bonus + v_new_referral
    )
  );
END;
$consume_credits$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

NOTIFY pgrst, 'reload schema';
