-- Support multi-image generation billing without clamping the total dynamic cost
-- to the single-image 4K ceiling. Also makes image-generation quota/refund count
-- respect metadata.imageCount.

SET search_path = public;

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
  v_image_count INTEGER := 1;
  v_allow_dynamic_above_max BOOLEAN := false;
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

  IF COALESCE(p_metadata->>'imageCount', '') ~ '^\d+$' THEN
    v_image_count := GREATEST(1, LEAST(20, (p_metadata->>'imageCount')::INTEGER));
  END IF;

  IF COALESCE(p_metadata->>'allowDynamicCostAboveMax', '') IN ('true', 'false') THEN
    v_allow_dynamic_above_max := (p_metadata->>'allowDynamicCostAboveMax')::BOOLEAN;
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
    IF v_allow_dynamic_above_max THEN
      v_cost := GREATEST(v_dynamic_credits, v_config.min_cost);
    ELSE
      v_cost := LEAST(
        GREATEST(v_dynamic_credits, v_config.min_cost),
        COALESCE(v_config.max_cost, v_dynamic_credits)
      );
    END IF;
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
    IF v_user_credits.daily_image_gen_used + v_image_count > v_user_credits.daily_image_gen_max THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'QUOTA_EXCEEDED',
        'feature', 'image_generation',
        'used', v_user_credits.daily_image_gen_used,
        'max', v_user_credits.daily_image_gen_max,
        'requested', v_image_count
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
      WHEN p_action = 'image_generation' THEN daily_image_gen_used + v_image_count
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
      'imageCount', v_image_count,
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
    'image_count', v_image_count,
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
  v_image_count INTEGER := 1;
  v_new_daily INTEGER;
  v_new_subscription INTEGER;
  v_new_bonus INTEGER;
  v_balance INTEGER;
  v_breakdown JSONB := COALESCE(p_metadata, '{}'::jsonb)->'creditBreakdown';
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_AMOUNT');
  END IF;

  IF COALESCE(p_metadata->>'imageCount', '') ~ '^\d+$' THEN
    v_image_count := GREATEST(1, LEAST(20, (p_metadata->>'imageCount')::INTEGER));
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
    daily_image_gen_used = GREATEST(0, daily_image_gen_used - v_image_count),
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
      'imageCount', v_image_count,
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
    'image_count', v_image_count,
    'credit_breakdown', jsonb_build_object(
      'daily', v_daily_refund,
      'subscription', v_subscription_refund,
      'bonus', v_bonus_refund
    ),
    'balance', v_balance
  );
END;
$refund_image_generation_credit$;

GRANT EXECUTE ON FUNCTION public.consume_credits(UUID, TEXT, JSONB)
TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.refund_image_generation_credit(UUID, INTEGER, TEXT, JSONB)
TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
