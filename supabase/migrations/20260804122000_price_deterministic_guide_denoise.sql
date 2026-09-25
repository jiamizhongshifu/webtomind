-- The denoise guide is now a deterministic Cloudflare Images transform, so
-- only the Nano Banana 2 dual-reference restoration is billable:
-- (60 base + 20 * 2 references) * 1.15 = 115 credits.
-- Version both RPCs so old Workers and already-charged 207-credit tasks remain
-- safe during a rolling deployment.

CREATE OR REPLACE FUNCTION public.consume_gpt_image_2_denoise_credits_v3(
  p_user_id UUID,
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $consume_gpt_image_2_denoise_credits_v3$
DECLARE
  v_cost CONSTANT INTEGER := 115;
  v_user_credits public.user_credits%ROWTYPE;
  v_existing_transaction public.credit_transactions%ROWTYPE;
  v_idempotency_key TEXT := NULLIF(COALESCE(p_metadata, '{}'::jsonb)->>'idempotency_key', '');
  v_remaining INTEGER := v_cost;
  v_promo_media_deduct INTEGER := 0;
  v_media_deduct INTEGER := 0;
  v_subscription_deduct INTEGER := 0;
  v_bonus_deduct INTEGER := 0;
  v_new_promo_media INTEGER;
  v_new_media INTEGER;
  v_new_subscription INTEGER;
  v_new_referral INTEGER;
  v_new_bonus INTEGER;
  v_balance_after INTEGER;
  v_available INTEGER;
  v_credit_type TEXT;
  v_breakdown JSONB;
BEGIN
  IF v_idempotency_key IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'IDEMPOTENCY_KEY_REQUIRED',
      'message', 'A task idempotency key is required'
    );
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext('consume_gpt_image_2_denoise_credits_v3'),
    hashtext(p_user_id::TEXT || ':' || v_idempotency_key)
  );

  SELECT *
  INTO v_existing_transaction
  FROM public.credit_transactions
  WHERE user_id = p_user_id
    AND source = 'gpt_image_2_denoise'
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

  SELECT *
  INTO v_user_credits
  FROM public.user_credits
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'USER_NOT_FOUND');
  END IF;

  v_available :=
    COALESCE(v_user_credits.promo_media_credits, 0) +
    COALESCE(v_user_credits.media_credits, 0) +
    COALESCE(v_user_credits.subscription_credits, 0) +
    COALESCE(v_user_credits.bonus_credits, 0);

  IF v_available < v_cost THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INSUFFICIENT_CREDITS',
      'required', v_cost,
      'current', v_available,
      'mediaPreferred', true
    );
  END IF;

  v_promo_media_deduct := LEAST(COALESCE(v_user_credits.promo_media_credits, 0), v_remaining);
  v_remaining := v_remaining - v_promo_media_deduct;
  v_media_deduct := LEAST(COALESCE(v_user_credits.media_credits, 0), v_remaining);
  v_remaining := v_remaining - v_media_deduct;
  v_subscription_deduct := LEAST(COALESCE(v_user_credits.subscription_credits, 0), v_remaining);
  v_remaining := v_remaining - v_subscription_deduct;
  v_bonus_deduct := LEAST(COALESCE(v_user_credits.bonus_credits, 0), v_remaining);

  v_new_promo_media := COALESCE(v_user_credits.promo_media_credits, 0) - v_promo_media_deduct;
  v_new_media := COALESCE(v_user_credits.media_credits, 0) - v_media_deduct;
  v_new_subscription := COALESCE(v_user_credits.subscription_credits, 0) - v_subscription_deduct;
  v_new_referral := COALESCE(v_user_credits.referral_credits, 0);
  v_new_bonus := COALESCE(v_user_credits.bonus_credits, 0) - v_bonus_deduct;
  v_balance_after :=
    COALESCE(v_user_credits.daily_credits, 0) +
    v_new_subscription +
    v_new_bonus +
    v_new_referral +
    v_new_media +
    v_new_promo_media;
  v_credit_type := CASE
    WHEN v_promo_media_deduct > 0 THEN 'promo_media'
    WHEN v_media_deduct > 0 THEN 'media'
    WHEN v_subscription_deduct > 0 THEN 'subscription'
    ELSE 'bonus'
  END;
  v_breakdown := jsonb_build_object(
    'daily', 0,
    'subscription', v_subscription_deduct,
    'bonus', v_bonus_deduct,
    'referral', 0,
    'media', v_media_deduct,
    'promoMedia', v_promo_media_deduct
  );

  UPDATE public.user_credits
  SET
    subscription_credits = v_new_subscription,
    bonus_credits = v_new_bonus,
    media_credits = v_new_media,
    promo_media_credits = v_new_promo_media,
    total_consumed = COALESCE(total_consumed, 0) + v_cost,
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
    v_balance_after,
    'gpt_image_2_denoise',
    jsonb_build_object(
      'calculatedCost', v_cost,
      'pricingType', 'fixed',
      'pricingVersion', 'deterministic_guide_v3',
      'providerCalls', 1,
      'guideTransform', 'cloudflare_images',
      'mediaPreferred', true,
      'creditBreakdown', v_breakdown
    ) || COALESCE(p_metadata, '{}'::jsonb)
  );

  RETURN jsonb_build_object(
    'success', true,
    'consumed', v_cost,
    'credit_type', v_credit_type,
    'credit_breakdown', v_breakdown,
    'balance', jsonb_build_object(
      'subscription', v_new_subscription,
      'bonus', v_new_bonus,
      'referral', v_new_referral,
      'media', v_new_media,
      'promoMedia', v_new_promo_media,
      'total', v_balance_after
    )
  );
END;
$consume_gpt_image_2_denoise_credits_v3$;

CREATE OR REPLACE FUNCTION public.refund_gpt_image_2_denoise_credits_v3(
  p_user_id UUID,
  p_amount INTEGER,
  p_credit_type TEXT DEFAULT 'bonus',
  p_source TEXT DEFAULT 'gpt_denoise_refund',
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $refund_gpt_image_2_denoise_credits_v3$
DECLARE
  v_user_credits public.user_credits%ROWTYPE;
  v_existing_transaction public.credit_transactions%ROWTYPE;
  v_breakdown JSONB := COALESCE(p_metadata, '{}'::jsonb)->'creditBreakdown';
  v_idempotency_key TEXT := COALESCE(
    NULLIF(COALESCE(p_metadata, '{}'::jsonb)->>'idempotency_key', ''),
    NULLIF(COALESCE(p_metadata, '{}'::jsonb)->>'idempotencyKey', '')
  );
  v_subscription_refund INTEGER := 0;
  v_bonus_refund INTEGER := 0;
  v_referral_refund INTEGER := 0;
  v_media_refund INTEGER := 0;
  v_promo_media_refund INTEGER := 0;
  v_new_subscription INTEGER;
  v_new_bonus INTEGER;
  v_new_referral INTEGER;
  v_new_media INTEGER;
  v_new_promo_media INTEGER;
  v_balance_after INTEGER;
  v_refund_to TEXT;
BEGIN
  IF p_amount IS NULL OR p_amount <> 115 THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_AMOUNT');
  END IF;
  IF v_idempotency_key IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'IDEMPOTENCY_KEY_REQUIRED');
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext('refund_gpt_image_2_denoise_credits_v3'),
    hashtext(p_user_id::TEXT || ':' || p_source || ':' || v_idempotency_key)
  );

  SELECT *
  INTO v_existing_transaction
  FROM public.credit_transactions
  WHERE user_id = p_user_id
    AND source = p_source
    AND type = 'refund'
    AND metadata->>'idempotency_key' = v_idempotency_key
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'refunded', v_existing_transaction.amount,
      'credit_type', v_existing_transaction.credit_type,
      'credit_breakdown', COALESCE(v_existing_transaction.metadata->'creditBreakdown', '{}'::jsonb),
      'balance_after', v_existing_transaction.balance_after,
      'idempotent', true
    );
  END IF;

  IF jsonb_typeof(v_breakdown) IS DISTINCT FROM 'object' THEN
    RETURN jsonb_build_object('success', false, 'error', 'CREDIT_BREAKDOWN_REQUIRED');
  END IF;

  v_subscription_refund := GREATEST(COALESCE((v_breakdown->>'subscription')::INTEGER, 0), 0);
  v_bonus_refund := GREATEST(COALESCE((v_breakdown->>'bonus')::INTEGER, 0), 0);
  v_referral_refund := GREATEST(COALESCE((v_breakdown->>'referral')::INTEGER, 0), 0);
  v_media_refund := GREATEST(COALESCE((v_breakdown->>'media')::INTEGER, 0), 0);
  v_promo_media_refund := GREATEST(COALESCE((v_breakdown->>'promoMedia')::INTEGER, 0), 0);

  IF v_subscription_refund + v_bonus_refund + v_referral_refund +
     v_media_refund + v_promo_media_refund <> p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_CREDIT_BREAKDOWN');
  END IF;

  SELECT *
  INTO v_user_credits
  FROM public.user_credits
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'USER_NOT_FOUND');
  END IF;

  v_new_subscription := COALESCE(v_user_credits.subscription_credits, 0) + v_subscription_refund;
  v_new_bonus := COALESCE(v_user_credits.bonus_credits, 0) + v_bonus_refund;
  v_new_referral := COALESCE(v_user_credits.referral_credits, 0) + v_referral_refund;
  v_new_media := COALESCE(v_user_credits.media_credits, 0) + v_media_refund;
  v_new_promo_media := COALESCE(v_user_credits.promo_media_credits, 0) + v_promo_media_refund;
  v_balance_after :=
    COALESCE(v_user_credits.daily_credits, 0) +
    v_new_subscription +
    v_new_bonus +
    v_new_referral +
    v_new_media +
    v_new_promo_media;
  v_refund_to := CASE
    WHEN v_promo_media_refund > 0 THEN 'promo_media'
    WHEN v_media_refund > 0 THEN 'media'
    WHEN v_subscription_refund > 0 THEN 'subscription'
    WHEN v_referral_refund > 0 THEN 'referral'
    ELSE 'bonus'
  END;

  UPDATE public.user_credits
  SET
    subscription_credits = v_new_subscription,
    bonus_credits = v_new_bonus,
    referral_credits = v_new_referral,
    media_credits = v_new_media,
    promo_media_credits = v_new_promo_media,
    total_consumed = GREATEST(0, COALESCE(total_consumed, 0) - p_amount),
    updated_at = NOW()
  WHERE user_id = p_user_id;

  INSERT INTO public.credit_transactions (
    user_id,
    type,
    credit_type,
    amount,
    balance_after,
    source,
    description,
    metadata
  ) VALUES (
    p_user_id,
    'refund',
    v_refund_to,
    p_amount,
    v_balance_after,
    p_source,
    'GPT Image 2 denoise failed; credits refunded',
    COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'creditBreakdown', jsonb_build_object(
        'daily', 0,
        'subscription', v_subscription_refund,
        'bonus', v_bonus_refund,
        'referral', v_referral_refund,
        'media', v_media_refund,
        'promoMedia', v_promo_media_refund
      )
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'refunded', p_amount,
    'credit_type', v_refund_to,
    'credit_breakdown', v_breakdown,
    'balance_after', v_balance_after
  );
END;
$refund_gpt_image_2_denoise_credits_v3$;

COMMENT ON FUNCTION public.consume_gpt_image_2_denoise_credits_v3(UUID, JSONB)
IS 'Charges 115 credits for one Nano Banana 2 dual-reference restoration. The structure guide is a deterministic Cloudflare Images transform.';

COMMENT ON FUNCTION public.refund_gpt_image_2_denoise_credits_v3(UUID, INTEGER, TEXT, TEXT, JSONB)
IS 'Idempotently restores the current 115-credit deterministic-guide denoise charge to its original wallets.';

REVOKE ALL ON FUNCTION public.consume_gpt_image_2_denoise_credits_v3(UUID, JSONB)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_gpt_image_2_denoise_credits_v3(UUID, JSONB)
TO service_role;

REVOKE ALL ON FUNCTION public.refund_gpt_image_2_denoise_credits_v3(UUID, INTEGER, TEXT, TEXT, JSONB)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refund_gpt_image_2_denoise_credits_v3(UUID, INTEGER, TEXT, TEXT, JSONB)
TO service_role;

NOTIFY pgrst, 'reload schema';
