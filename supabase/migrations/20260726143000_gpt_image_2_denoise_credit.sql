-- Charge GPT Image 2 redraw denoising from the media wallet at a fixed cost of
-- exactly one credit. This is intentionally separate from image_generation so
-- the generic pricing floor and free daily generation quota cannot affect it.

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
  v_promo_media_deduct INTEGER := 0;
  v_media_deduct INTEGER := 0;
  v_new_promo_media INTEGER;
  v_new_media INTEGER;
  v_balance_after INTEGER;
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

  IF COALESCE(v_user_credits.promo_media_credits, 0) +
     COALESCE(v_user_credits.media_credits, 0) < 1 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INSUFFICIENT_MEDIA_CREDITS',
      'required', 1,
      'current',
        COALESCE(v_user_credits.promo_media_credits, 0) +
        COALESCE(v_user_credits.media_credits, 0),
      'mediaRequired', true
    );
  END IF;

  v_promo_media_deduct := LEAST(COALESCE(v_user_credits.promo_media_credits, 0), 1);
  v_media_deduct := 1 - v_promo_media_deduct;
  v_new_promo_media := COALESCE(v_user_credits.promo_media_credits, 0) - v_promo_media_deduct;
  v_new_media := COALESCE(v_user_credits.media_credits, 0) - v_media_deduct;
  v_balance_after :=
    COALESCE(v_user_credits.daily_credits, 0) +
    COALESCE(v_user_credits.subscription_credits, 0) +
    COALESCE(v_user_credits.bonus_credits, 0) +
    v_new_media +
    v_new_promo_media +
    COALESCE(v_user_credits.referral_credits, 0);
  v_credit_type := CASE
    WHEN v_promo_media_deduct = 1 THEN 'promo_media'
    ELSE 'media'
  END;
  v_breakdown := jsonb_build_object(
    'daily', 0,
    'subscription', 0,
    'bonus', 0,
    'media', v_media_deduct,
    'promoMedia', v_promo_media_deduct
  );

  UPDATE public.user_credits
  SET
    media_credits = v_new_media,
    promo_media_credits = v_new_promo_media,
    total_consumed = total_consumed + 1,
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
      'mediaRequired', true,
      'creditBreakdown', v_breakdown
    ) || COALESCE(p_metadata, '{}'::jsonb)
  );

  RETURN jsonb_build_object(
    'success', true,
    'consumed', 1,
    'credit_type', v_credit_type,
    'credit_breakdown', v_breakdown,
    'balance', jsonb_build_object(
      'media', v_new_media,
      'promoMedia', v_new_promo_media,
      'total', v_balance_after
    )
  );
END;
$consume_gpt_image_2_denoise_credit$;

REVOKE ALL ON FUNCTION public.consume_gpt_image_2_denoise_credit(UUID, JSONB)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_gpt_image_2_denoise_credit(UUID, JSONB)
TO service_role;

NOTIFY pgrst, 'reload schema';
