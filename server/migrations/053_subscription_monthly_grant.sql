-- Subscription monthly grants and free daily credits enforcement
-- 1. Add a helper to grant subscription credits if a month is due
-- 2. Update consume_credits to enforce member/free daily rules and monthly grants

SET search_path = public;

-- 1. Grant subscription credits if a month is due
CREATE OR REPLACE FUNCTION grant_subscription_credits_if_due(
  p_user_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_subscription RECORD;
  v_plan RECORD;
  v_last_grant TIMESTAMPTZ;
  v_effective_now TIMESTAMPTZ;
  v_months_due INTEGER;
  v_amount INTEGER;
BEGIN
  -- Latest subscription (including canceled but not yet ended)
  SELECT * INTO v_subscription
  FROM user_subscriptions
  WHERE user_id = p_user_id
    AND status IN ('active', 'trialing', 'past_due', 'canceled')
  ORDER BY current_period_start DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('granted', false, 'reason', 'no_subscription');
  END IF;

  -- If canceled and period already ended, do not grant
  IF v_subscription.status = 'canceled'
     AND v_subscription.current_period_end::date < CURRENT_DATE THEN
    RETURN jsonb_build_object('granted', false, 'reason', 'period_ended');
  END IF;

  SELECT * INTO v_plan FROM subscription_plans WHERE id = v_subscription.plan_id;
  IF NOT FOUND OR v_plan.monthly_credits IS NULL OR v_plan.monthly_credits <= 0 THEN
    RETURN jsonb_build_object('granted', false, 'reason', 'no_monthly_credits');
  END IF;

  -- Last subscription grant time (includes initial checkout grant)
  SELECT MAX(created_at) INTO v_last_grant
  FROM credit_transactions
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

  PERFORM add_bonus_credits(
    p_user_id,
    v_amount,
    'subscription_reward',
    jsonb_build_object(
      'plan_id', v_subscription.plan_id,
      'months', v_months_due,
      'grant_through', v_effective_now
    )
  );

  RETURN jsonb_build_object('granted', true, 'months', v_months_due, 'amount', v_amount);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION grant_subscription_credits_if_due(UUID) TO authenticated;

-- 2. Update consume_credits to enforce free daily rules and subscription grants
CREATE OR REPLACE FUNCTION consume_credits(
  p_user_id UUID,
  p_action TEXT,
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS JSONB AS $$
DECLARE
  v_config RECORD;
  v_user_credits RECORD;
  v_cost INTEGER;
  v_input_tokens INTEGER;
  v_output_tokens INTEGER;
  v_dynamic_credits INTEGER;
  v_credit_type TEXT;
  v_new_daily INTEGER;
  v_new_bonus INTEGER;
  v_today DATE := CURRENT_DATE;
  v_subscription RECORD;
  v_is_member BOOLEAN := false;
  v_free_daily_max INTEGER := 300;
BEGIN
  -- 1. Get pricing config
  SELECT * INTO v_config FROM credit_costs WHERE action = p_action AND is_active = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_ACTION', 'message', 'Invalid action');
  END IF;

  -- 2. Determine membership status (active or canceled but still within period)
  SELECT * INTO v_subscription
  FROM user_subscriptions
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

  -- 3. Grant subscription credits if due (member only)
  IF v_is_member THEN
    PERFORM grant_subscription_credits_if_due(p_user_id);
  END IF;

  -- 4. Get user credits with lock
  SELECT * INTO v_user_credits FROM user_credits WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'USER_NOT_FOUND', 'message', 'User not found');
  END IF;

  -- 5. Enforce daily credits rules
  IF v_is_member THEN
    -- Members do not receive daily credits
    IF v_user_credits.daily_credits <> 0 OR v_user_credits.daily_credits_max <> 0 THEN
      UPDATE user_credits SET
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
    -- Free users receive daily credits
    IF v_user_credits.daily_credits_max IS NULL OR v_user_credits.daily_credits_max = 0 THEN
      UPDATE user_credits SET
        daily_credits_max = v_free_daily_max
      WHERE user_id = p_user_id;
      v_user_credits.daily_credits_max := v_free_daily_max;
    END IF;

    IF v_user_credits.last_daily_refresh IS NULL OR v_user_credits.last_daily_refresh < v_today THEN
      UPDATE user_credits SET
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

  -- 6. Extract dynamic credits from metadata (for tools like e2b_execute)
  v_dynamic_credits := (p_metadata->>'dynamicCredits')::INTEGER;

  -- 7. Calculate cost
  IF v_dynamic_credits IS NOT NULL AND v_dynamic_credits > 0 THEN
    v_cost := LEAST(GREATEST(v_dynamic_credits, v_config.min_cost), COALESCE(v_config.max_cost, v_dynamic_credits));
  ELSE
    v_input_tokens := COALESCE((p_metadata->>'inputTokens')::INTEGER, 0);
    v_output_tokens := COALESCE((p_metadata->>'outputTokens')::INTEGER, 0);
    v_cost := calculate_credit_cost(p_action, v_input_tokens, v_output_tokens);
  END IF;

  -- 8. Check balance
  IF (v_user_credits.daily_credits + v_user_credits.bonus_credits) < v_cost THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INSUFFICIENT_CREDITS',
      'required', v_cost,
      'current', v_user_credits.daily_credits + v_user_credits.bonus_credits
    );
  END IF;

  -- 9. Check quota for image generation (free users only)
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

  -- 10. Deduct credits (daily first, then bonus)
  IF v_user_credits.daily_credits >= v_cost THEN
    v_new_daily := v_user_credits.daily_credits - v_cost;
    v_new_bonus := v_user_credits.bonus_credits;
    v_credit_type := 'daily';
  ELSE
    v_new_daily := 0;
    v_new_bonus := v_user_credits.bonus_credits - (v_cost - v_user_credits.daily_credits);
    v_credit_type := 'bonus';
  END IF;

  -- 11. Update user credits
  UPDATE user_credits SET
    daily_credits = v_new_daily,
    bonus_credits = v_new_bonus,
    total_consumed = total_consumed + v_cost,
    daily_image_gen_used = CASE WHEN p_action = 'image_generation' THEN daily_image_gen_used + 1 ELSE daily_image_gen_used END,
    updated_at = NOW()
  WHERE user_id = p_user_id;

  -- 12. Record transaction
  INSERT INTO credit_transactions (
    user_id, type, credit_type, amount, balance_after, source, metadata
  ) VALUES (
    p_user_id, 'usage', v_credit_type, -v_cost, v_new_daily + v_new_bonus, p_action,
    jsonb_build_object(
      'calculatedCost', v_cost,
      'pricingType', v_config.pricing_type,
      'isDynamic', v_dynamic_credits IS NOT NULL
    ) || COALESCE(p_metadata, '{}'::jsonb)
  );

  RETURN jsonb_build_object(
    'success', true,
    'consumed', v_cost,
    'credit_type', v_credit_type,
    'balance', jsonb_build_object(
      'daily', v_new_daily,
      'bonus', v_new_bonus,
      'total', v_new_daily + v_new_bonus
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION consume_credits TO authenticated;

-- 3. (Legacy) Remove free user image generation limit if related tables/columns exist
-- This section is guarded to avoid errors when legacy tables/columns are missing.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'profiles'
      AND column_name = 'subscription_tier'
  ) THEN
    UPDATE user_credits
    SET daily_image_gen_max = 999999
    WHERE user_id IN (
      SELECT id FROM profiles WHERE subscription_tier = 'free'
    );
  END IF;

  IF to_regclass('public.subscription_limits') IS NOT NULL THEN
    UPDATE subscription_limits
    SET limits = jsonb_set(limits, '{daily_image_gen_max}', '999999')
    WHERE tier = 'free' AND limits ? 'daily_image_gen_max';
  END IF;
EXCEPTION
  WHEN others THEN
    NULL;
END $$;
