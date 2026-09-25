-- Make weaving quota consumption idempotent per request and refundable on
-- failed generation/save paths.

SET search_path = public;

CREATE OR REPLACE FUNCTION public.consume_weaving_quota(
  p_user_id UUID,
  p_idempotency_key TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_today DATE := CURRENT_DATE;
  v_subscription RECORD;
  v_is_member BOOLEAN := false;
  v_used INTEGER := 0;
  v_max INTEGER := 5;
  v_user_credits RECORD;
  v_balance_after INTEGER := 0;
  v_existing RECORD;
BEGIN
  IF p_idempotency_key IS NOT NULL AND length(trim(p_idempotency_key)) > 0 THEN
    SELECT *
    INTO v_existing
    FROM public.credit_transactions
    WHERE user_id = p_user_id
      AND source = 'weaving_generation'
      AND metadata->>'idempotency_key' = p_idempotency_key
    ORDER BY created_at DESC
    LIMIT 1;

    IF FOUND THEN
      SELECT COUNT(*)::INTEGER INTO v_used
      FROM public.credit_transactions
      WHERE user_id = p_user_id
        AND source = 'weaving_generation'
        AND created_at::date = v_today;

      RETURN jsonb_build_object(
        'success', true,
        'is_member', false,
        'used', v_used,
        'max', v_max,
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
    RETURN jsonb_build_object(
      'success', true,
      'is_member', true,
      'used', 0,
      'max', -1
    );
  END IF;

  SELECT COUNT(*)::INTEGER INTO v_used
  FROM public.credit_transactions
  WHERE user_id = p_user_id
    AND source = 'weaving_generation'
    AND created_at::date = v_today;

  IF v_used >= v_max THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'QUOTA_EXCEEDED',
      'feature', 'weaving_generation',
      'used', v_used,
      'max', v_max
    );
  END IF;

  SELECT * INTO v_user_credits
  FROM public.user_credits
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF FOUND THEN
    v_balance_after :=
      COALESCE(v_user_credits.daily_credits, 0) +
      COALESCE(v_user_credits.bonus_credits, 0);
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
    'usage',
    'daily',
    0,
    v_balance_after,
    'weaving_generation',
    jsonb_build_object(
      'quotaOnly', true,
      'idempotency_key', NULLIF(trim(COALESCE(p_idempotency_key, '')), '')
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'is_member', false,
    'used', v_used + 1,
    'max', v_max,
    'idempotent', false
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.refund_weaving_quota(
  p_user_id UUID,
  p_idempotency_key TEXT
) RETURNS JSONB AS $$
DECLARE
  v_deleted INTEGER := 0;
BEGIN
  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_IDEMPOTENCY_KEY');
  END IF;

  DELETE FROM public.credit_transactions
  WHERE id IN (
    SELECT id
    FROM public.credit_transactions
    WHERE user_id = p_user_id
      AND source = 'weaving_generation'
      AND type = 'usage'
      AND amount = 0
      AND metadata->>'quotaOnly' = 'true'
      AND metadata->>'idempotency_key' = p_idempotency_key
    ORDER BY created_at DESC
    LIMIT 1
  );

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'refunded', v_deleted > 0,
    'deleted', v_deleted
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.consume_weaving_quota(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_weaving_quota(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_weaving_quota(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refund_weaving_quota(UUID, TEXT) TO service_role;

NOTIFY pgrst, 'reload schema';
