-- Media credits become the primary wallet for image and video generation.
-- Generic bonus/subscription credits remain available for low-COGS utility actions.

SET search_path = public;

ALTER TABLE public.user_credits
  ADD COLUMN IF NOT EXISTS media_credits INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS promo_media_credits INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.user_credits.media_credits IS
  'Paid or subscription media credits for image and video generation.';
COMMENT ON COLUMN public.user_credits.promo_media_credits IS
  'Promotional media credits for image and video generation; intended for expiring or restricted campaigns.';

ALTER TABLE public.credit_transactions
DROP CONSTRAINT IF EXISTS credit_transactions_credit_type_check;

ALTER TABLE public.credit_transactions
ADD CONSTRAINT credit_transactions_credit_type_check
CHECK (
  credit_type IN (
    'daily',
    'subscription',
    'bonus',
    'referral',
    'media',
    'promo_media',
    'mixed'
  )
);

CREATE OR REPLACE FUNCTION public.add_media_credits(
    p_user_id UUID,
    p_amount INTEGER,
    p_source TEXT,
    p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS VOID AS $add_media_credits$
DECLARE
    v_metadata JSONB := COALESCE(p_metadata, '{}'::jsonb);
    v_idempotency_key TEXT := NULLIF(v_metadata->>'idempotency_key', '');
    v_is_promo BOOLEAN := p_source IN ('promo_media', 'media_promo', 'campaign_media');
    v_credit_type TEXT := CASE WHEN v_is_promo THEN 'promo_media' ELSE 'media' END;
    v_balance INTEGER;
BEGIN
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'Media credit amount must be positive';
    END IF;

    IF v_idempotency_key IS NOT NULL THEN
        PERFORM pg_advisory_xact_lock(
            hashtext('add_media_credits'),
            hashtext(p_user_id::TEXT || ':' || p_source || ':' || v_idempotency_key)
        );

        IF EXISTS (
            SELECT 1
            FROM public.credit_transactions
            WHERE user_id = p_user_id
              AND type IN ('earn', 'purchase', 'subscription_grant')
              AND source = p_source
              AND metadata->>'idempotency_key' = v_idempotency_key
        ) THEN
            RETURN;
        END IF;
    END IF;

    INSERT INTO public.user_credits (
        user_id,
        daily_credits,
        daily_credits_max,
        last_daily_refresh,
        daily_image_gen_used,
        daily_image_gen_max,
        bonus_credits,
        media_credits,
        promo_media_credits,
        total_earned
    )
    VALUES (
        p_user_id,
        100,
        100,
        CURRENT_DATE,
        0,
        1,
        0,
        CASE WHEN v_is_promo THEN 0 ELSE p_amount END,
        CASE WHEN v_is_promo THEN p_amount ELSE 0 END,
        p_amount
    )
    ON CONFLICT (user_id) DO UPDATE SET
        media_credits = COALESCE(public.user_credits.media_credits, 0) + EXCLUDED.media_credits,
        promo_media_credits = COALESCE(public.user_credits.promo_media_credits, 0) + EXCLUDED.promo_media_credits,
        total_earned = COALESCE(public.user_credits.total_earned, 0) + p_amount,
        updated_at = NOW()
    RETURNING
      COALESCE(media_credits, 0) +
      COALESCE(promo_media_credits, 0) +
      COALESCE(daily_credits, 0) +
      COALESCE(subscription_credits, 0) +
      COALESCE(bonus_credits, 0) +
      COALESCE(referral_credits, 0)
    INTO v_balance;

    INSERT INTO public.credit_transactions (
        user_id,
        type,
        credit_type,
        amount,
        balance_after,
        source,
        metadata
    )
    VALUES (
        p_user_id,
        CASE WHEN p_source = 'subscription_reward' THEN 'subscription_grant'
             WHEN p_source = 'package_purchase' THEN 'purchase'
             ELSE 'earn'
        END,
        v_credit_type,
        p_amount,
        v_balance,
        p_source,
        v_metadata || jsonb_build_object(
          'creditBreakdown',
          jsonb_build_object(
            'media', CASE WHEN v_is_promo THEN 0 ELSE p_amount END,
            'promoMedia', CASE WHEN v_is_promo THEN p_amount ELSE 0 END
          )
        )
    );
END;
$add_media_credits$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.add_bonus_credits(
    p_user_id UUID,
    p_amount INTEGER,
    p_source TEXT,
    p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS VOID AS $add_bonus_credits$
DECLARE
    v_metadata JSONB := COALESCE(p_metadata, '{}'::jsonb);
    v_idempotency_key TEXT := NULLIF(v_metadata->>'idempotency_key', '');
    v_is_referral_reward BOOLEAN := p_source IN ('referral_reward', 'referred_welcome');
    v_credit_type TEXT := CASE WHEN v_is_referral_reward THEN 'referral' ELSE 'bonus' END;
    v_balance INTEGER;
BEGIN
    IF p_source IN ('package_purchase', 'subscription_reward') THEN
      PERFORM public.add_media_credits(p_user_id, p_amount, p_source, p_metadata);
      RETURN;
    END IF;

    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'Bonus credit amount must be positive';
    END IF;

    IF v_idempotency_key IS NOT NULL THEN
        PERFORM pg_advisory_xact_lock(
            hashtext('add_bonus_credits'),
            hashtext(p_user_id::TEXT || ':' || p_source || ':' || v_idempotency_key)
        );

        IF EXISTS (
            SELECT 1
            FROM public.credit_transactions
            WHERE user_id = p_user_id
              AND type IN ('earn', 'purchase', 'referral_reward')
              AND source = p_source
              AND metadata->>'idempotency_key' = v_idempotency_key
        ) THEN
            RETURN;
        END IF;
    END IF;

    INSERT INTO public.user_credits (
        user_id,
        daily_credits,
        daily_credits_max,
        last_daily_refresh,
        daily_image_gen_used,
        daily_image_gen_max,
        bonus_credits,
        referral_credits,
        total_earned
    )
    VALUES (
        p_user_id,
        100,
        100,
        CURRENT_DATE,
        0,
        1,
        CASE WHEN v_is_referral_reward THEN 0 ELSE p_amount END,
        CASE WHEN v_is_referral_reward THEN p_amount ELSE 0 END,
        p_amount
    )
    ON CONFLICT (user_id) DO UPDATE SET
        bonus_credits = COALESCE(public.user_credits.bonus_credits, 0) + EXCLUDED.bonus_credits,
        referral_credits = COALESCE(public.user_credits.referral_credits, 0) + EXCLUDED.referral_credits,
        total_earned = COALESCE(public.user_credits.total_earned, 0) + p_amount,
        updated_at = NOW()
    RETURNING
      COALESCE(media_credits, 0) +
      COALESCE(promo_media_credits, 0) +
      COALESCE(daily_credits, 0) +
      COALESCE(subscription_credits, 0) +
      COALESCE(bonus_credits, 0) +
      COALESCE(referral_credits, 0)
    INTO v_balance;

    INSERT INTO public.credit_transactions (
        user_id,
        type,
        credit_type,
        amount,
        balance_after,
        source,
        metadata
    )
    VALUES (
        p_user_id,
        CASE WHEN v_is_referral_reward THEN 'referral_reward' ELSE 'earn' END,
        v_credit_type,
        p_amount,
        v_balance,
        p_source,
        v_metadata || jsonb_build_object(
          'creditBreakdown',
          jsonb_build_object(
            'bonus', CASE WHEN v_is_referral_reward THEN 0 ELSE p_amount END,
            'referral', CASE WHEN v_is_referral_reward THEN p_amount ELSE 0 END
          )
        )
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
  v_is_media_action BOOLEAN := p_action IN ('image_generation', 'video_generation');
  v_new_daily INTEGER;
  v_new_subscription INTEGER;
  v_new_bonus INTEGER;
  v_new_media INTEGER;
  v_new_promo_media INTEGER;
  v_remaining INTEGER;
  v_daily_deduct INTEGER := 0;
  v_subscription_deduct INTEGER := 0;
  v_bonus_deduct INTEGER := 0;
  v_media_deduct INTEGER := 0;
  v_promo_media_deduct INTEGER := 0;
  v_today DATE := CURRENT_DATE;
  v_subscription RECORD;
  v_is_member BOOLEAN := false;
  v_free_daily_max INTEGER := 100;
  v_free_daily_image_gen_max INTEGER := 1;
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

  IF v_is_media_action THEN
    v_available :=
      CASE WHEN p_action = 'image_generation' THEN COALESCE(v_user_credits.daily_credits, 0) ELSE 0 END +
      COALESCE(v_user_credits.promo_media_credits, 0) +
      COALESCE(v_user_credits.media_credits, 0);
  ELSE
    v_available :=
      COALESCE(v_user_credits.daily_credits, 0) +
      COALESCE(v_user_credits.subscription_credits, 0) +
      COALESCE(v_user_credits.bonus_credits, 0);
  END IF;

  IF v_available < v_cost THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', CASE WHEN v_is_media_action THEN 'INSUFFICIENT_MEDIA_CREDITS' ELSE 'INSUFFICIENT_CREDITS' END,
      'required', v_cost,
      'current', v_available,
      'mediaRequired', v_is_media_action
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

    v_subscription_deduct := LEAST(COALESCE(v_user_credits.subscription_credits, 0), v_remaining);
    v_remaining := v_remaining - v_subscription_deduct;

    v_bonus_deduct := LEAST(COALESCE(v_user_credits.bonus_credits, 0), v_remaining);
    v_remaining := v_remaining - v_bonus_deduct;
  END IF;

  v_new_daily := COALESCE(v_user_credits.daily_credits, 0) - v_daily_deduct;
  v_new_subscription := COALESCE(v_user_credits.subscription_credits, 0) - v_subscription_deduct;
  v_new_bonus := COALESCE(v_user_credits.bonus_credits, 0) - v_bonus_deduct;
  v_new_media := COALESCE(v_user_credits.media_credits, 0) - v_media_deduct;
  v_new_promo_media := COALESCE(v_user_credits.promo_media_credits, 0) - v_promo_media_deduct;

  v_credit_type := CASE
    WHEN (CASE WHEN v_daily_deduct > 0 THEN 1 ELSE 0 END) +
         (CASE WHEN v_subscription_deduct > 0 THEN 1 ELSE 0 END) +
         (CASE WHEN v_bonus_deduct > 0 THEN 1 ELSE 0 END) +
         (CASE WHEN v_media_deduct > 0 THEN 1 ELSE 0 END) +
         (CASE WHEN v_promo_media_deduct > 0 THEN 1 ELSE 0 END) > 1 THEN 'mixed'
    WHEN v_daily_deduct > 0 THEN 'daily'
    WHEN v_subscription_deduct > 0 THEN 'subscription'
    WHEN v_bonus_deduct > 0 THEN 'bonus'
    WHEN v_promo_media_deduct > 0 THEN 'promo_media'
    ELSE 'media'
  END;

  UPDATE public.user_credits
  SET
    daily_credits = v_new_daily,
    subscription_credits = v_new_subscription,
    bonus_credits = v_new_bonus,
    media_credits = v_new_media,
    promo_media_credits = v_new_promo_media,
    total_consumed = total_consumed + v_cost,
    daily_image_gen_used = CASE WHEN p_action = 'image_generation' THEN daily_image_gen_used + 1 ELSE daily_image_gen_used END,
    updated_at = NOW()
  WHERE user_id = p_user_id;

  INSERT INTO public.credit_transactions (
    user_id, type, credit_type, amount, balance_after, source, metadata
  ) VALUES (
    p_user_id,
    'usage',
    v_credit_type,
    -v_cost,
    v_new_daily + v_new_subscription + v_new_bonus + v_new_media + v_new_promo_media + COALESCE(v_user_credits.referral_credits, 0),
    p_action,
    jsonb_build_object(
      'calculatedCost', v_cost,
      'pricingType', v_config.pricing_type,
      'isDynamic', v_dynamic_credits IS NOT NULL,
      'allowDynamicCostAboveMaxApplied', v_allow_dynamic_above_max,
      'mediaRequired', v_is_media_action,
      'creditBreakdown', jsonb_build_object(
        'daily', v_daily_deduct,
        'subscription', v_subscription_deduct,
        'bonus', v_bonus_deduct,
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
      'media', v_media_deduct,
      'promoMedia', v_promo_media_deduct
    ),
    'balance', jsonb_build_object(
      'daily', v_new_daily,
      'subscription', v_new_subscription,
      'bonus', v_new_bonus,
      'media', v_new_media,
      'promoMedia', v_new_promo_media,
      'referral', COALESCE(v_user_credits.referral_credits, 0),
      'total', v_new_daily + v_new_subscription + v_new_bonus + v_new_media + v_new_promo_media + COALESCE(v_user_credits.referral_credits, 0)
    )
  );
END;
$consume_credits$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.refund_generation_credit(
  p_user_id UUID,
  p_amount INTEGER,
  p_credit_type TEXT DEFAULT 'bonus',
  p_source TEXT DEFAULT 'generation_refund',
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $refund_generation_credit$
DECLARE
  v_user_credits public.user_credits%ROWTYPE;
  v_existing_transaction public.credit_transactions%ROWTYPE;
  v_breakdown JSONB := COALESCE(p_metadata, '{}'::jsonb)->'creditBreakdown';
  v_daily_refund INTEGER := 0;
  v_subscription_refund INTEGER := 0;
  v_bonus_refund INTEGER := 0;
  v_media_refund INTEGER := 0;
  v_promo_media_refund INTEGER := 0;
  v_new_daily INTEGER;
  v_new_subscription INTEGER;
  v_new_bonus INTEGER;
  v_new_media INTEGER;
  v_new_promo_media INTEGER;
  v_refund_to TEXT;
  v_balance_after INTEGER;
  v_billing_domain TEXT := NULLIF(COALESCE(p_metadata, '{}'::jsonb)->>'billingDomain', '');
  v_metadata JSONB;
  v_idempotency_key TEXT := COALESCE(
    NULLIF(COALESCE(p_metadata, '{}'::jsonb)->>'idempotency_key', ''),
    NULLIF(COALESCE(p_metadata, '{}'::jsonb)->>'idempotencyKey', ''),
    CASE
      WHEN NULLIF(COALESCE(p_metadata, '{}'::jsonb)->>'taskId', '') IS NOT NULL
        THEN 'video_task:' || (COALESCE(p_metadata, '{}'::jsonb)->>'taskId') || ':refund'
      WHEN p_source LIKE 'video_task:%'
        THEN p_source
      ELSE NULL
    END
  );
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_AMOUNT');
  END IF;

  IF v_billing_domain IS NULL AND v_idempotency_key LIKE 'video_task:%' THEN
    v_billing_domain := 'video_task';
  END IF;

  IF v_idempotency_key IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(
      hashtext('refund_generation_credit'),
      hashtext(
        p_user_id::TEXT || ':' ||
        COALESCE(v_billing_domain, p_source) || ':' ||
        v_idempotency_key
      )
    );

    SELECT *
    INTO v_existing_transaction
    FROM public.credit_transactions
    WHERE user_id = p_user_id
      AND type = 'refund'
      AND metadata->>'idempotency_key' = v_idempotency_key
      AND (v_billing_domain = 'video_task' OR source = p_source)
    ORDER BY created_at DESC
    LIMIT 1;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'success', true,
        'refunded', v_existing_transaction.amount,
        'credit_type', v_existing_transaction.credit_type,
        'credit_breakdown', COALESCE(
          v_existing_transaction.metadata->'creditBreakdown',
          '{}'::jsonb
        ),
        'balance_after', v_existing_transaction.balance_after,
        'idempotent', true
      );
    END IF;
  END IF;

  SELECT * INTO v_user_credits
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
    v_media_refund := COALESCE((v_breakdown->>'media')::INTEGER, 0);
    v_promo_media_refund := COALESCE((v_breakdown->>'promoMedia')::INTEGER, 0);
  ELSIF p_credit_type = 'daily' THEN
    v_daily_refund := p_amount;
  ELSIF p_credit_type = 'subscription' THEN
    v_subscription_refund := p_amount;
  ELSIF p_credit_type = 'media' THEN
    v_media_refund := p_amount;
  ELSIF p_credit_type = 'promo_media' THEN
    v_promo_media_refund := p_amount;
  ELSE
    v_bonus_refund := p_amount;
  END IF;

  v_new_daily := LEAST(
    COALESCE(v_user_credits.daily_credits_max, 0),
    COALESCE(v_user_credits.daily_credits, 0) + v_daily_refund
  );
  v_bonus_refund := v_bonus_refund + GREATEST(
    0,
    COALESCE(v_user_credits.daily_credits, 0) +
      v_daily_refund -
      COALESCE(v_user_credits.daily_credits_max, 0)
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
  v_new_media := COALESCE(v_user_credits.media_credits, 0) + v_media_refund;
  v_new_promo_media := COALESCE(v_user_credits.promo_media_credits, 0) + v_promo_media_refund;

  UPDATE public.user_credits
  SET
    daily_credits = v_new_daily,
    subscription_credits = v_new_subscription,
    bonus_credits = v_new_bonus,
    media_credits = v_new_media,
    promo_media_credits = v_new_promo_media,
    total_consumed = GREATEST(0, COALESCE(total_consumed, 0) - p_amount),
    daily_image_gen_used = CASE WHEN p_source LIKE '%image%' THEN GREATEST(0, COALESCE(daily_image_gen_used, 0) - 1) ELSE daily_image_gen_used END,
    updated_at = NOW()
  WHERE user_id = p_user_id;

  v_balance_after :=
    v_new_daily +
    v_new_subscription +
    v_new_bonus +
    v_new_media +
    v_new_promo_media +
    COALESCE(v_user_credits.referral_credits, 0);

  v_refund_to := CASE
    WHEN (CASE WHEN v_daily_refund > 0 THEN 1 ELSE 0 END) +
         (CASE WHEN v_subscription_refund > 0 THEN 1 ELSE 0 END) +
         (CASE WHEN v_bonus_refund > 0 THEN 1 ELSE 0 END) +
         (CASE WHEN v_media_refund > 0 THEN 1 ELSE 0 END) +
         (CASE WHEN v_promo_media_refund > 0 THEN 1 ELSE 0 END) > 1 THEN 'mixed'
    WHEN v_daily_refund > 0 THEN 'daily'
    WHEN v_subscription_refund > 0 THEN 'subscription'
    WHEN v_bonus_refund > 0 THEN 'bonus'
    WHEN v_promo_media_refund > 0 THEN 'promo_media'
    ELSE 'media'
  END;

  v_metadata := COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object(
    'creditBreakdown',
    jsonb_build_object(
      'daily', v_daily_refund,
      'subscription', v_subscription_refund,
      'bonus', v_bonus_refund,
      'media', v_media_refund,
      'promoMedia', v_promo_media_refund
    ),
    'idempotency_key', v_idempotency_key
  );

  IF v_billing_domain IS NOT NULL THEN
    v_metadata := v_metadata || jsonb_build_object('billingDomain', v_billing_domain);
  END IF;

  INSERT INTO public.credit_transactions (
    user_id, type, credit_type, amount, balance_after, source, description, metadata
  )
  VALUES (
    p_user_id,
    'refund',
    v_refund_to,
    p_amount,
    v_balance_after,
    p_source,
    'Generation failed; credits refunded',
    v_metadata || jsonb_build_object(
      'credit_type', v_refund_to
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'refunded', p_amount,
    'credit_type', v_refund_to,
    'credit_breakdown', jsonb_build_object(
      'daily', v_daily_refund,
      'subscription', v_subscription_refund,
      'bonus', v_bonus_refund,
      'media', v_media_refund,
      'promoMedia', v_promo_media_refund
    ),
    'balance_after', v_balance_after
  );
END;
$refund_generation_credit$;

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
BEGIN
  RETURN public.refund_generation_credit(
    p_user_id,
    p_amount,
    p_credit_type,
    'image_generation_refund',
    p_metadata
  );
END;
$refund_image_generation_credit$;

UPDATE public.subscription_plans
SET monthly_credits = CASE
    WHEN name = 'pro' THEN 2000
    WHEN name = 'max' THEN 10000
    ELSE monthly_credits
  END,
  updated_at = NOW()
WHERE name IN ('pro', 'max');

UPDATE public.credit_packages
SET price = CASE id
    WHEN 'pack_1k' THEN 999
    WHEN 'pack_5k' THEN 4900
    WHEN 'pack_20k' THEN 19900
    WHEN 'pack_100k' THEN 99900
    ELSE price
  END,
  name = CASE id
    WHEN 'pack_1k' THEN '1,000 Media Credits'
    WHEN 'pack_5k' THEN '5,000 Media Credits'
    WHEN 'pack_20k' THEN '20,000 Media Credits'
    WHEN 'pack_100k' THEN '100,000 Media Credits'
    ELSE name
  END,
  updated_at = NOW()
WHERE id IN ('pack_1k', 'pack_5k', 'pack_20k', 'pack_100k');

REVOKE EXECUTE ON FUNCTION public.add_media_credits(UUID, INTEGER, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_media_credits(UUID, INTEGER, TEXT, JSONB)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.add_bonus_credits(UUID, INTEGER, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_bonus_credits(UUID, INTEGER, TEXT, JSONB)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.consume_credits(UUID, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_credits(UUID, TEXT, JSONB)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.refund_generation_credit(UUID, INTEGER, TEXT, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refund_generation_credit(UUID, INTEGER, TEXT, TEXT, JSONB)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.refund_image_generation_credit(UUID, INTEGER, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refund_image_generation_credit(UUID, INTEGER, TEXT, JSONB)
  TO service_role;

NOTIFY pgrst, 'reload schema';
