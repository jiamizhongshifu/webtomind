-- Keep media credits as the preferred wallet for image/video generation, but
-- do not strand pre-existing legacy balances. Media generation now consumes
-- daily/promo media/media first, then falls back to subscription/referral/bonus.

SET search_path = public;

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
  v_is_media_action BOOLEAN := p_action IN ('image_generation', 'video_generation');
  v_new_daily INTEGER;
  v_new_subscription INTEGER;
  v_new_bonus INTEGER;
  v_new_referral INTEGER;
  v_new_media INTEGER;
  v_new_promo_media INTEGER;
  v_remaining INTEGER;
  v_daily_deduct INTEGER := 0;
  v_subscription_deduct INTEGER := 0;
  v_bonus_deduct INTEGER := 0;
  v_referral_deduct INTEGER := 0;
  v_media_deduct INTEGER := 0;
  v_promo_media_deduct INTEGER := 0;
  v_today DATE := CURRENT_DATE;
  v_subscription RECORD;
  v_is_member BOOLEAN := false;
  v_free_daily_max INTEGER := 100;
  v_free_daily_image_gen_max INTEGER := 1;
  v_referral_daily_image_spend_limit INTEGER := 100;
  v_referral_spent_today INTEGER := 0;
  v_referral_available INTEGER := 0;
  v_available INTEGER := 0;
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
        'credit_breakdown', COALESCE(v_existing_transaction.metadata->'creditBreakdown', '{}'::jsonb),
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
    IF COALESCE(v_user_credits.daily_credits, 0) <> 0 OR COALESCE(v_user_credits.daily_credits_max, 0) <> 0 THEN
      UPDATE public.user_credits
      SET daily_credits = 0, daily_credits_max = 0, last_daily_refresh = v_today, updated_at = NOW()
      WHERE user_id = p_user_id;
      v_user_credits.daily_credits := 0;
      v_user_credits.daily_credits_max := 0;
      v_user_credits.last_daily_refresh := v_today;
    END IF;
  ELSE
    IF COALESCE(v_user_credits.subscription_credits, 0) <> 0 OR COALESCE(v_user_credits.subscription_credits_max, 0) <> 0 THEN
      UPDATE public.user_credits
      SET subscription_credits = 0, subscription_credits_max = 0, updated_at = NOW()
      WHERE user_id = p_user_id;
      v_user_credits.subscription_credits := 0;
      v_user_credits.subscription_credits_max := 0;
    END IF;

    IF v_user_credits.daily_credits_max IS NULL OR v_user_credits.daily_credits_max <> v_free_daily_max THEN
      UPDATE public.user_credits
      SET
        daily_credits_max = v_free_daily_max,
        daily_credits = LEAST(COALESCE(daily_credits, 0), v_free_daily_max),
        daily_image_gen_max = v_free_daily_image_gen_max,
        updated_at = NOW()
      WHERE user_id = p_user_id;
      v_user_credits.daily_credits_max := v_free_daily_max;
      v_user_credits.daily_credits := LEAST(COALESCE(v_user_credits.daily_credits, 0), v_free_daily_max);
      v_user_credits.daily_image_gen_max := v_free_daily_image_gen_max;
    END IF;

    IF v_user_credits.last_daily_refresh IS NULL OR v_user_credits.last_daily_refresh < v_today THEN
      UPDATE public.user_credits
      SET daily_credits = v_user_credits.daily_credits_max,
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
      v_cost := LEAST(GREATEST(v_dynamic_credits, v_config.min_cost), COALESCE(v_config.max_cost, v_dynamic_credits));
    END IF;
  ELSE
    v_input_tokens := COALESCE((COALESCE(p_metadata, '{}'::jsonb)->>'inputTokens')::INTEGER, 0);
    v_output_tokens := COALESCE((COALESCE(p_metadata, '{}'::jsonb)->>'outputTokens')::INTEGER, 0);
    v_cost := public.calculate_credit_cost(p_action, v_input_tokens, v_output_tokens);
  END IF;

  IF p_action = 'image_generation' AND NOT v_is_member THEN
    IF COALESCE(v_user_credits.daily_image_gen_used, 0) >= COALESCE(v_user_credits.daily_image_gen_max, 0) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'QUOTA_EXCEEDED',
        'feature', 'image_generation',
        'used', COALESCE(v_user_credits.daily_image_gen_used, 0),
        'max', COALESCE(v_user_credits.daily_image_gen_max, 0)
      );
    END IF;
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
  ELSE
    v_referral_available := COALESCE(v_user_credits.referral_credits, 0);
  END IF;

  IF v_is_media_action THEN
    v_available :=
      CASE WHEN p_action = 'image_generation' THEN COALESCE(v_user_credits.daily_credits, 0) ELSE 0 END +
      COALESCE(v_user_credits.promo_media_credits, 0) +
      COALESCE(v_user_credits.media_credits, 0) +
      COALESCE(v_user_credits.subscription_credits, 0) +
      COALESCE(v_referral_available, 0) +
      COALESCE(v_user_credits.bonus_credits, 0);
  ELSE
    v_available :=
      COALESCE(v_user_credits.daily_credits, 0) +
      COALESCE(v_user_credits.subscription_credits, 0) +
      COALESCE(v_referral_available, 0) +
      COALESCE(v_user_credits.bonus_credits, 0);
  END IF;

  IF v_available < v_cost THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INSUFFICIENT_CREDITS',
      'required', v_cost,
      'current', v_available,
      'mediaPreferred', v_is_media_action
    );
  END IF;

  v_remaining := v_cost;

  IF v_is_media_action THEN
    IF p_action = 'image_generation' THEN
      v_daily_deduct := LEAST(COALESCE(v_user_credits.daily_credits, 0), v_remaining);
      v_remaining := v_remaining - v_daily_deduct;
    END IF;

    v_promo_media_deduct := LEAST(COALESCE(v_user_credits.promo_media_credits, 0), v_remaining);
    v_remaining := v_remaining - v_promo_media_deduct;

    v_media_deduct := LEAST(COALESCE(v_user_credits.media_credits, 0), v_remaining);
    v_remaining := v_remaining - v_media_deduct;
  ELSE
    v_daily_deduct := LEAST(COALESCE(v_user_credits.daily_credits, 0), v_remaining);
    v_remaining := v_remaining - v_daily_deduct;
  END IF;

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
  v_new_media := COALESCE(v_user_credits.media_credits, 0) - v_media_deduct;
  v_new_promo_media := COALESCE(v_user_credits.promo_media_credits, 0) - v_promo_media_deduct;

  v_credit_type := CASE
    WHEN (CASE WHEN v_daily_deduct > 0 THEN 1 ELSE 0 END) +
         (CASE WHEN v_subscription_deduct > 0 THEN 1 ELSE 0 END) +
         (CASE WHEN v_bonus_deduct > 0 THEN 1 ELSE 0 END) +
         (CASE WHEN v_referral_deduct > 0 THEN 1 ELSE 0 END) +
         (CASE WHEN v_media_deduct > 0 THEN 1 ELSE 0 END) +
         (CASE WHEN v_promo_media_deduct > 0 THEN 1 ELSE 0 END) > 1 THEN 'mixed'
    WHEN v_daily_deduct > 0 THEN 'daily'
    WHEN v_subscription_deduct > 0 THEN 'subscription'
    WHEN v_bonus_deduct > 0 THEN 'bonus'
    WHEN v_referral_deduct > 0 THEN 'referral'
    WHEN v_promo_media_deduct > 0 THEN 'promo_media'
    ELSE 'media'
  END;

  UPDATE public.user_credits
  SET
    daily_credits = v_new_daily,
    subscription_credits = v_new_subscription,
    bonus_credits = v_new_bonus,
    referral_credits = v_new_referral,
    media_credits = v_new_media,
    promo_media_credits = v_new_promo_media,
    total_consumed = total_consumed + v_cost,
    daily_image_gen_used = CASE
      WHEN p_action = 'image_generation' THEN COALESCE(daily_image_gen_used, 0) + 1
      ELSE daily_image_gen_used
    END,
    updated_at = NOW()
  WHERE user_id = p_user_id;

  INSERT INTO public.credit_transactions (
    user_id, type, credit_type, amount, balance_after, source, metadata
  ) VALUES (
    p_user_id,
    'usage',
    v_credit_type,
    -v_cost,
    v_new_daily + v_new_subscription + v_new_bonus + v_new_referral + v_new_media + v_new_promo_media,
    p_action,
    jsonb_build_object(
      'calculatedCost', v_cost,
      'pricingType', v_config.pricing_type,
      'isDynamic', v_dynamic_credits IS NOT NULL,
      'allowDynamicCostAboveMaxApplied', v_allow_dynamic_above_max,
      'mediaPreferred', v_is_media_action,
      'creditBreakdown', jsonb_build_object(
        'daily', v_daily_deduct,
        'subscription', v_subscription_deduct,
        'bonus', v_bonus_deduct,
        'referral', v_referral_deduct,
        'media', v_media_deduct,
        'promoMedia', v_promo_media_deduct
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
      'referral', v_referral_deduct,
      'media', v_media_deduct,
      'promoMedia', v_promo_media_deduct
    ),
    'balance', jsonb_build_object(
      'daily', v_new_daily,
      'subscription', v_new_subscription,
      'bonus', v_new_bonus,
      'referral', v_new_referral,
      'media', v_new_media,
      'promoMedia', v_new_promo_media,
      'total', v_new_daily + v_new_subscription + v_new_bonus + v_new_referral + v_new_media + v_new_promo_media
    )
  );
END;
$consume_credits$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.consume_credits(UUID, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_credits(UUID, TEXT, JSONB)
  TO service_role;
