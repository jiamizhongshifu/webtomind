SET search_path = public;

CREATE OR REPLACE FUNCTION public.admin_adjust_media_credits(
  p_user_id UUID,
  p_delta INTEGER,
  p_credit_type TEXT DEFAULT 'media',
  p_source TEXT DEFAULT 'admin_media_adjustment',
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $admin_adjust_media_credits$
DECLARE
  v_user_credits public.user_credits%ROWTYPE;
  v_metadata JSONB := COALESCE(p_metadata, '{}'::jsonb);
  v_idempotency_key TEXT := NULLIF(v_metadata->>'idempotency_key', '');
  v_wallet TEXT := CASE
    WHEN p_credit_type = 'promo_media' THEN 'promo_media'
    ELSE 'media'
  END;
  v_current_wallet INTEGER;
  v_new_wallet INTEGER;
  v_balance_after INTEGER;
BEGIN
  IF p_delta IS NULL OR p_delta = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_DELTA');
  END IF;

  IF p_credit_type NOT IN ('media', 'promo_media') THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_CREDIT_TYPE');
  END IF;

  IF v_idempotency_key IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(
      hashtext('admin_adjust_media_credits'),
      hashtext(p_user_id::TEXT || ':' || p_source || ':' || v_idempotency_key)
    );

    IF EXISTS (
      SELECT 1
      FROM public.credit_transactions
      WHERE user_id = p_user_id
        AND source = p_source
        AND metadata->>'idempotency_key' = v_idempotency_key
    ) THEN
      SELECT * INTO v_user_credits
      FROM public.user_credits
      WHERE user_id = p_user_id;

      RETURN jsonb_build_object(
        'success', true,
        'idempotent', true,
        'credit_type', p_credit_type,
        'delta', p_delta,
        'balance', jsonb_build_object(
          'media', COALESCE(v_user_credits.media_credits, 0),
          'promoMedia', COALESCE(v_user_credits.promo_media_credits, 0)
        )
      );
    END IF;
  END IF;

  SELECT * INTO v_user_credits
  FROM public.user_credits
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    IF p_delta < 0 THEN
      RETURN jsonb_build_object('success', false, 'error', 'USER_NOT_FOUND');
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
      CASE WHEN v_wallet = 'media' THEN p_delta ELSE 0 END,
      CASE WHEN v_wallet = 'promo_media' THEN p_delta ELSE 0 END,
      p_delta
    )
    RETURNING * INTO v_user_credits;
  ELSE
    v_current_wallet := CASE
      WHEN v_wallet = 'promo_media' THEN COALESCE(v_user_credits.promo_media_credits, 0)
      ELSE COALESCE(v_user_credits.media_credits, 0)
    END;
    v_new_wallet := v_current_wallet + p_delta;

    IF v_new_wallet < 0 THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'INSUFFICIENT_MEDIA_WALLET',
        'current', v_current_wallet,
        'requested', ABS(p_delta),
        'credit_type', p_credit_type
      );
    END IF;

    UPDATE public.user_credits
    SET
      media_credits = CASE
        WHEN v_wallet = 'media' THEN v_new_wallet
        ELSE COALESCE(media_credits, 0)
      END,
      promo_media_credits = CASE
        WHEN v_wallet = 'promo_media' THEN v_new_wallet
        ELSE COALESCE(promo_media_credits, 0)
      END,
      total_earned = COALESCE(total_earned, 0) + GREATEST(p_delta, 0),
      total_consumed = COALESCE(total_consumed, 0) + GREATEST(-p_delta, 0),
      updated_at = NOW()
    WHERE user_id = p_user_id
    RETURNING * INTO v_user_credits;
  END IF;

  v_balance_after :=
    COALESCE(v_user_credits.daily_credits, 0) +
    COALESCE(v_user_credits.subscription_credits, 0) +
    COALESCE(v_user_credits.bonus_credits, 0) +
    COALESCE(v_user_credits.referral_credits, 0) +
    COALESCE(v_user_credits.media_credits, 0) +
    COALESCE(v_user_credits.promo_media_credits, 0);

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
    CASE WHEN p_delta > 0 THEN 'earn' ELSE 'usage' END,
    p_credit_type,
    p_delta,
    v_balance_after,
    p_source,
    CASE WHEN p_delta > 0 THEN 'Admin media credit grant' ELSE 'Admin media credit adjustment' END,
    v_metadata || jsonb_build_object(
      'creditBreakdown',
      jsonb_build_object(
        'media', CASE WHEN v_wallet = 'media' THEN p_delta ELSE 0 END,
        'promoMedia', CASE WHEN v_wallet = 'promo_media' THEN p_delta ELSE 0 END
      )
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'credit_type', p_credit_type,
    'delta', p_delta,
    'balance_after', v_balance_after,
    'balance', jsonb_build_object(
      'media', COALESCE(v_user_credits.media_credits, 0),
      'promoMedia', COALESCE(v_user_credits.promo_media_credits, 0)
    )
  );
END;
$admin_adjust_media_credits$;

CREATE OR REPLACE VIEW public.media_credit_daily_summary AS
WITH raw_transactions AS (
  SELECT
    created_at::DATE AS summary_date,
    user_id,
    type,
    credit_type,
    source,
    amount,
    metadata->'creditBreakdown'->>'media' AS media_breakdown_text,
    metadata->'creditBreakdown'->>'promoMedia' AS promo_media_breakdown_text
  FROM public.credit_transactions
),
media_transactions AS (
  SELECT
    summary_date,
    user_id,
    type,
    credit_type,
    source,
    amount,
    CASE
      WHEN media_breakdown_text ~ '^-?[0-9]+$' THEN media_breakdown_text::INTEGER
      ELSE 0
    END AS media_breakdown,
    CASE
      WHEN promo_media_breakdown_text ~ '^-?[0-9]+$' THEN promo_media_breakdown_text::INTEGER
      ELSE 0
    END AS promo_media_breakdown
  FROM raw_transactions
  WHERE credit_type IN ('media', 'promo_media', 'mixed')
     OR COALESCE(media_breakdown_text, '') ~ '^-?[1-9][0-9]*$'
     OR COALESCE(promo_media_breakdown_text, '') ~ '^-?[1-9][0-9]*$'
)
SELECT
  summary_date,
  source,
  COUNT(*)::INTEGER AS transaction_count,
  COUNT(DISTINCT user_id)::INTEGER AS user_count,
  SUM(
    CASE
      WHEN credit_type = 'media' AND media_breakdown = 0 THEN amount
      WHEN credit_type = 'mixed' OR media_breakdown <> 0 THEN
        CASE WHEN type = 'usage' THEN -ABS(media_breakdown) ELSE media_breakdown END
      ELSE 0
    END
  )::INTEGER AS media_delta,
  SUM(
    CASE
      WHEN credit_type = 'promo_media' AND promo_media_breakdown = 0 THEN amount
      WHEN credit_type = 'mixed' OR promo_media_breakdown <> 0 THEN
        CASE WHEN type = 'usage' THEN -ABS(promo_media_breakdown) ELSE promo_media_breakdown END
      ELSE 0
    END
  )::INTEGER AS promo_media_delta,
  SUM(CASE WHEN type IN ('earn', 'purchase', 'subscription_grant') THEN GREATEST(amount, 0) ELSE 0 END)::INTEGER AS granted,
  SUM(CASE WHEN type = 'refund' THEN GREATEST(amount, 0) ELSE 0 END)::INTEGER AS refunded,
  SUM(CASE WHEN type = 'usage' THEN ABS(LEAST(amount, 0)) ELSE 0 END)::INTEGER AS consumed
FROM media_transactions
GROUP BY summary_date, source;

REVOKE EXECUTE ON FUNCTION public.admin_adjust_media_credits(UUID, INTEGER, TEXT, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_adjust_media_credits(UUID, INTEGER, TEXT, TEXT, JSONB)
  TO service_role;

GRANT SELECT ON public.media_credit_daily_summary TO service_role;

NOTIFY pgrst, 'reload schema';
