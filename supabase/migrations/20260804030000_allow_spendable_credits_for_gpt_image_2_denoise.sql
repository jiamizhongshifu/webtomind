-- Keep GPT Image 2 redraw denoising at a fixed cost of exactly one credit,
-- while preferring media wallets without stranding other paid/spendable
-- balances. Daily credits remain excluded so this tool cannot consume the
-- free daily image-generation quota.

CREATE OR REPLACE FUNCTION public.consume_gpt_image_2_denoise_credit(
  p_user_id UUID,
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $consume_gpt_image_2_denoise_credit$
DECLARE
  v_user_credits public.user_credits%ROWTYPE;
  v_existing_transaction public.credit_transactions%ROWTYPE;
  v_idempotency_key TEXT := NULLIF(COALESCE(p_metadata, '{}'::jsonb)->>'idempotency_key', '');
  v_remaining INTEGER := 1;
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
    hashtext('consume_gpt_image_2_denoise_credit'),
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

  IF v_available < 1 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INSUFFICIENT_CREDITS',
      'required', 1,
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
    WHEN v_promo_media_deduct = 1 THEN 'promo_media'
    WHEN v_media_deduct = 1 THEN 'media'
    WHEN v_subscription_deduct = 1 THEN 'subscription'
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
    total_consumed = COALESCE(total_consumed, 0) + 1,
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
    -1,
    v_balance_after,
    'gpt_image_2_denoise',
    jsonb_build_object(
      'calculatedCost', 1,
      'pricingType', 'fixed',
      'mediaPreferred', true,
      'creditBreakdown', v_breakdown
    ) || COALESCE(p_metadata, '{}'::jsonb)
  );

  RETURN jsonb_build_object(
    'success', true,
    'consumed', 1,
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
$consume_gpt_image_2_denoise_credit$;

-- Dedicated refund keeps the one-credit redraw path isolated from generic
-- generation refunds and restores every wallet supported by the charge above.
CREATE OR REPLACE FUNCTION public.refund_gpt_image_2_denoise_credit(
  p_user_id UUID,
  p_amount INTEGER,
  p_credit_type TEXT DEFAULT 'bonus',
  p_source TEXT DEFAULT 'gpt_denoise_refund',
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $refund_gpt_image_2_denoise_credit$
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
  IF p_amount IS DISTINCT FROM 1 THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_AMOUNT');
  END IF;
  IF v_idempotency_key IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'IDEMPOTENCY_KEY_REQUIRED');
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext('refund_gpt_image_2_denoise_credit'),
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
     v_media_refund + v_promo_media_refund <> 1 THEN
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
    WHEN v_promo_media_refund = 1 THEN 'promo_media'
    WHEN v_media_refund = 1 THEN 'media'
    WHEN v_subscription_refund = 1 THEN 'subscription'
    WHEN v_referral_refund = 1 THEN 'referral'
    ELSE 'bonus'
  END;

  UPDATE public.user_credits
  SET
    subscription_credits = v_new_subscription,
    bonus_credits = v_new_bonus,
    referral_credits = v_new_referral,
    media_credits = v_new_media,
    promo_media_credits = v_new_promo_media,
    total_consumed = GREATEST(0, COALESCE(total_consumed, 0) - 1),
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
    1,
    v_balance_after,
    p_source,
    'GPT Image 2 redraw failed; credit refunded',
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
    'refunded', 1,
    'credit_type', v_refund_to,
    'credit_breakdown', v_breakdown,
    'balance_after', v_balance_after
  );
END;
$refund_gpt_image_2_denoise_credit$;

COMMENT ON FUNCTION public.consume_gpt_image_2_denoise_credit(UUID, JSONB)
IS 'Charges exactly one credit for GPT Image 2 redraw. Media wallets are preferred; subscription and bonus balances are safe fallbacks. Daily and referral credits are excluded.';

COMMENT ON FUNCTION public.refund_gpt_image_2_denoise_credit(UUID, INTEGER, TEXT, TEXT, JSONB)
IS 'Idempotently restores a failed GPT Image 2 redraw charge to its original wallet.';

REVOKE ALL ON FUNCTION public.consume_gpt_image_2_denoise_credit(UUID, JSONB)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_gpt_image_2_denoise_credit(UUID, JSONB)
TO service_role;

REVOKE ALL ON FUNCTION public.refund_gpt_image_2_denoise_credit(UUID, INTEGER, TEXT, TEXT, JSONB)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refund_gpt_image_2_denoise_credit(UUID, INTEGER, TEXT, TEXT, JSONB)
TO service_role;

NOTIFY pgrst, 'reload schema';
