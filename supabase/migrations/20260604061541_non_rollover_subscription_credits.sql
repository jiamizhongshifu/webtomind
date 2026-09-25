-- Separate monthly subscription credits from durable bonus credits.
-- Subscription credits reset on each grant period and do not roll over.

SET search_path = public;

ALTER TABLE public.user_credits
ADD COLUMN IF NOT EXISTS subscription_credits INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS subscription_credits_max INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS subscription_credits_period_start TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS subscription_credits_period_end TIMESTAMPTZ;

COMMENT ON COLUMN public.user_credits.subscription_credits IS
  'Current non-rollover monthly credits from an active subscription.';
COMMENT ON COLUMN public.user_credits.subscription_credits_max IS
  'Monthly subscription credit allowance for the current period.';
COMMENT ON COLUMN public.user_credits.subscription_credits_period_start IS
  'Start of the current subscription credit grant period.';
COMMENT ON COLUMN public.user_credits.subscription_credits_period_end IS
  'End of the current subscription credit grant period.';
COMMENT ON COLUMN public.user_credits.bonus_credits IS
  'Durable purchased, refunded, and non-subscription bonus credits.';

ALTER TABLE public.credit_transactions
DROP CONSTRAINT IF EXISTS credit_transactions_credit_type_check;

ALTER TABLE public.credit_transactions
ADD CONSTRAINT credit_transactions_credit_type_check
CHECK (credit_type IN ('daily', 'subscription', 'bonus', 'mixed'));

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
BEGIN
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'Bonus credit amount must be positive';
    END IF;

    v_tx_type := CASE
        WHEN p_source = 'subscription_reward' THEN 'subscription_grant'
        WHEN p_source IN ('referral_reward', 'referred_welcome') THEN 'referral_reward'
        ELSE 'purchase'
    END;

    v_credit_type := CASE
        WHEN p_source = 'subscription_reward' THEN 'subscription'
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
    ELSE
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

CREATE OR REPLACE FUNCTION public.grant_subscription_credits_if_due(
  p_user_id UUID
) RETURNS JSONB AS $grant_subscription_credits_if_due$
DECLARE
  v_subscription RECORD;
  v_plan RECORD;
  v_period_start TIMESTAMPTZ;
  v_period_end TIMESTAMPTZ;
  v_amount INTEGER;
  v_grant_key TEXT;
  v_legacy_grant_key TEXT;
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
    UPDATE public.user_credits
    SET
      subscription_credits = 0,
      subscription_credits_max = 0,
      updated_at = NOW()
    WHERE user_id = p_user_id;

    RETURN jsonb_build_object('granted', false, 'reason', 'period_ended');
  END IF;

  SELECT * INTO v_plan
  FROM public.subscription_plans
  WHERE id = v_subscription.plan_id;

  IF NOT FOUND OR v_plan.monthly_credits IS NULL OR v_plan.monthly_credits <= 0 THEN
    UPDATE public.user_credits
    SET
      subscription_credits = 0,
      subscription_credits_max = 0,
      updated_at = NOW()
    WHERE user_id = p_user_id;

    RETURN jsonb_build_object('granted', false, 'reason', 'no_monthly_credits');
  END IF;

  v_period_start := GREATEST(
    COALESCE(v_subscription.current_period_start, date_trunc('month', NOW())),
    date_trunc('month', NOW())
  );
  v_period_end := LEAST(
    COALESCE(
      v_subscription.current_period_end,
      date_trunc('month', NOW()) + INTERVAL '1 month'
    ),
    date_trunc('month', NOW()) + INTERVAL '1 month'
  );

  v_amount := v_plan.monthly_credits;
  v_grant_key :=
    'subscription_period:' ||
    v_subscription.id::text ||
    ':' ||
    v_period_start::date::text;
  v_legacy_grant_key :=
    'subscription_due:' ||
    v_subscription.id::text ||
    ':' ||
    date_trunc('month', v_period_start)::date::text;

  IF EXISTS (
    SELECT 1
    FROM public.user_credits
    WHERE user_id = p_user_id
      AND subscription_credits_period_start = v_period_start
      AND subscription_credits_period_end = v_period_end
      AND subscription_credits_max = v_amount
  ) THEN
    RETURN jsonb_build_object(
      'granted', false,
      'reason', 'current_period_already_loaded',
      'period_start', v_period_start,
      'period_end', v_period_end
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.credit_transactions
    WHERE user_id = p_user_id
      AND source = 'subscription_reward'
      AND (
        metadata->>'idempotency_key' IN (v_grant_key, v_legacy_grant_key)
        OR (
          created_at >= v_period_start
          AND created_at < v_period_end
          AND metadata->>'plan_id' = v_subscription.plan_id::text
        )
      )
  ) THEN
    RETURN jsonb_build_object(
      'granted', false,
      'reason', 'current_period_already_granted',
      'period_start', v_period_start,
      'period_end', v_period_end
    );
  END IF;

  PERFORM public.add_bonus_credits(
    p_user_id,
    v_amount,
    'subscription_reward',
    jsonb_build_object(
      'plan_id', v_subscription.plan_id,
      'months', 1,
      'grant_period_start', v_period_start,
      'grant_period_end', v_period_end,
      'grant_through', v_period_end,
      'idempotency_key', v_grant_key
    )
  );

  RETURN jsonb_build_object(
    'granted',
    true,
    'months',
    1,
    'amount',
    v_amount,
    'period_start',
    v_period_start,
    'period_end',
    v_period_end
  );
END;
$grant_subscription_credits_if_due$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.consume_credits(
  p_user_id UUID,
  p_action TEXT,
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS JSONB AS $consume_credits$
DECLARE
  v_config RECORD;
  v_user_credits RECORD;
  v_cost INTEGER;
  v_input_tokens INTEGER;
  v_output_tokens INTEGER;
  v_dynamic_credits INTEGER;
  v_credit_type TEXT;
  v_new_daily INTEGER;
  v_new_subscription INTEGER;
  v_new_bonus INTEGER;
  v_remaining INTEGER;
  v_daily_deduct INTEGER := 0;
  v_subscription_deduct INTEGER := 0;
  v_bonus_deduct INTEGER := 0;
  v_today DATE := CURRENT_DATE;
  v_subscription RECORD;
  v_is_member BOOLEAN := false;
  v_free_daily_max INTEGER := 300;
BEGIN
  SELECT * INTO v_config
  FROM public.credit_costs
  WHERE action = p_action
    AND is_active = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_ACTION', 'message', 'Invalid action');
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

  v_dynamic_credits := (p_metadata->>'dynamicCredits')::INTEGER;

  IF v_dynamic_credits IS NOT NULL AND v_dynamic_credits > 0 THEN
    v_cost := LEAST(
      GREATEST(v_dynamic_credits, v_config.min_cost),
      COALESCE(v_config.max_cost, v_dynamic_credits)
    );
  ELSE
    v_input_tokens := COALESCE((p_metadata->>'inputTokens')::INTEGER, 0);
    v_output_tokens := COALESCE((p_metadata->>'outputTokens')::INTEGER, 0);
    v_cost := public.calculate_credit_cost(p_action, v_input_tokens, v_output_tokens);
  END IF;

  IF (
    COALESCE(v_user_credits.daily_credits, 0) +
    COALESCE(v_user_credits.subscription_credits, 0) +
    COALESCE(v_user_credits.bonus_credits, 0)
  ) < v_cost THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INSUFFICIENT_CREDITS',
      'required', v_cost,
      'current',
        COALESCE(v_user_credits.daily_credits, 0) +
        COALESCE(v_user_credits.subscription_credits, 0) +
        COALESCE(v_user_credits.bonus_credits, 0)
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

  v_bonus_deduct := v_remaining;

  v_new_daily := COALESCE(v_user_credits.daily_credits, 0) - v_daily_deduct;
  v_new_subscription := COALESCE(v_user_credits.subscription_credits, 0) - v_subscription_deduct;
  v_new_bonus := COALESCE(v_user_credits.bonus_credits, 0) - v_bonus_deduct;

  v_credit_type := CASE
    WHEN (CASE WHEN v_daily_deduct > 0 THEN 1 ELSE 0 END) +
         (CASE WHEN v_subscription_deduct > 0 THEN 1 ELSE 0 END) +
         (CASE WHEN v_bonus_deduct > 0 THEN 1 ELSE 0 END) > 1
      THEN 'mixed'
    WHEN v_daily_deduct > 0 THEN 'daily'
    WHEN v_subscription_deduct > 0 THEN 'subscription'
    ELSE 'bonus'
  END;

  UPDATE public.user_credits
  SET
    daily_credits = v_new_daily,
    subscription_credits = v_new_subscription,
    bonus_credits = v_new_bonus,
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
    v_new_daily + v_new_subscription + v_new_bonus + COALESCE(v_user_credits.referral_credits, 0),
    p_action,
    jsonb_build_object(
      'calculatedCost', v_cost,
      'pricingType', v_config.pricing_type,
      'isDynamic', v_dynamic_credits IS NOT NULL,
      'creditBreakdown', jsonb_build_object(
        'daily', v_daily_deduct,
        'subscription', v_subscription_deduct,
        'bonus', v_bonus_deduct
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
      'bonus', v_bonus_deduct
    ),
    'balance', jsonb_build_object(
      'daily', v_new_daily,
      'subscription', v_new_subscription,
      'bonus', v_new_bonus,
      'total', v_new_daily + v_new_subscription + v_new_bonus + COALESCE(v_user_credits.referral_credits, 0)
    )
  );
END;
$consume_credits$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.refund_image_generation_credit(
  p_user_id UUID,
  p_amount INTEGER,
  p_credit_type TEXT DEFAULT 'bonus',
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $refund_image_generation_credit$
DECLARE
  v_user_credits public.user_credits%ROWTYPE;
  v_refund_to TEXT;
  v_daily_refund INTEGER := 0;
  v_subscription_refund INTEGER := 0;
  v_bonus_refund INTEGER := 0;
  v_new_daily INTEGER;
  v_new_subscription INTEGER;
  v_new_bonus INTEGER;
  v_balance INTEGER;
  v_breakdown JSONB := COALESCE(p_metadata, '{}'::jsonb)->'creditBreakdown';
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_AMOUNT');
  END IF;

  SELECT *
  INTO v_user_credits
  FROM public.user_credits
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'USER_NOT_FOUND');
  END IF;

  IF jsonb_typeof(v_breakdown) = 'object' THEN
    v_daily_refund := COALESCE((v_breakdown->>'daily')::INTEGER, 0);
    v_subscription_refund := COALESCE((v_breakdown->>'subscription')::INTEGER, 0);
    v_bonus_refund := COALESCE((v_breakdown->>'bonus')::INTEGER, 0);
  ELSE
    v_refund_to := CASE
      WHEN p_credit_type = 'daily' THEN 'daily'
      WHEN p_credit_type = 'subscription' THEN 'subscription'
      ELSE 'bonus'
    END;

    IF v_refund_to = 'daily' THEN
      v_daily_refund := p_amount;
    ELSIF v_refund_to = 'subscription' THEN
      v_subscription_refund := p_amount;
    ELSE
      v_bonus_refund := p_amount;
    END IF;
  END IF;

  v_new_daily := LEAST(
    COALESCE(v_user_credits.daily_credits_max, 0),
    COALESCE(v_user_credits.daily_credits, 0) + v_daily_refund
  );
  v_bonus_refund := v_bonus_refund + GREATEST(
    0,
    COALESCE(v_user_credits.daily_credits, 0) + v_daily_refund - COALESCE(v_user_credits.daily_credits_max, 0)
  );

  v_new_subscription := LEAST(
    COALESCE(v_user_credits.subscription_credits_max, 0),
    COALESCE(v_user_credits.subscription_credits, 0) + v_subscription_refund
  );
  v_bonus_refund := v_bonus_refund + GREATEST(
    0,
    COALESCE(v_user_credits.subscription_credits, 0) +
      v_subscription_refund -
      COALESCE(v_user_credits.subscription_credits_max, 0)
  );

  v_new_bonus := COALESCE(v_user_credits.bonus_credits, 0) + v_bonus_refund;

  UPDATE public.user_credits
  SET
    daily_credits = v_new_daily,
    subscription_credits = v_new_subscription,
    bonus_credits = v_new_bonus,
    total_consumed = GREATEST(0, total_consumed - p_amount),
    daily_image_gen_used = GREATEST(0, daily_image_gen_used - 1),
    updated_at = NOW()
  WHERE user_id = p_user_id;

  v_balance :=
    v_new_daily +
    v_new_subscription +
    v_new_bonus +
    COALESCE(v_user_credits.referral_credits, 0);

  v_refund_to := CASE
    WHEN (CASE WHEN v_daily_refund > 0 THEN 1 ELSE 0 END) +
         (CASE WHEN v_subscription_refund > 0 THEN 1 ELSE 0 END) +
         (CASE WHEN v_bonus_refund > 0 THEN 1 ELSE 0 END) > 1
      THEN 'mixed'
    WHEN v_daily_refund > 0 THEN 'daily'
    WHEN v_subscription_refund > 0 THEN 'subscription'
    ELSE 'bonus'
  END;

  INSERT INTO public.credit_transactions (
    user_id,
    type,
    credit_type,
    amount,
    balance_after,
    source,
    description,
    metadata
  )
  VALUES (
    p_user_id,
    'refund',
    v_refund_to,
    p_amount,
    v_balance,
    'image_generation_refund',
    'Image generation failed; credits refunded',
    COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'creditBreakdown', jsonb_build_object(
        'daily', v_daily_refund,
        'subscription', v_subscription_refund,
        'bonus', v_bonus_refund
      )
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'refunded', p_amount,
    'credit_type', v_refund_to,
    'credit_breakdown', jsonb_build_object(
      'daily', v_daily_refund,
      'subscription', v_subscription_refund,
      'bonus', v_bonus_refund
    ),
    'balance', v_balance
  );
END;
$refund_image_generation_credit$;

GRANT EXECUTE ON FUNCTION public.add_bonus_credits(UUID, INTEGER, TEXT, JSONB)
TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.grant_subscription_credits_if_due(UUID)
TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.consume_credits(UUID, TEXT, JSONB)
TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.refund_image_generation_credit(UUID, INTEGER, TEXT, JSONB)
TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
