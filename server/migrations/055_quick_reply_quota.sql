-- Quick reply daily quota (free users: 2/day, members: unlimited)

SET search_path = public;

CREATE OR REPLACE FUNCTION consume_quick_reply_quota(
  p_user_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_today DATE := CURRENT_DATE;
  v_subscription RECORD;
  v_is_member BOOLEAN := false;
  v_used INTEGER := 0;
  v_max INTEGER := 2;
  v_user_credits RECORD;
  v_balance_after INTEGER := 0;
BEGIN
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

  IF v_is_member THEN
    RETURN jsonb_build_object(
      'success', true,
      'is_member', true,
      'used', 0,
      'max', -1
    );
  END IF;

  SELECT COUNT(*)::INTEGER INTO v_used
  FROM credit_transactions
  WHERE user_id = p_user_id
    AND source = 'quick_reply_generation'
    AND created_at::date = v_today;

  IF v_used >= v_max THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'QUOTA_EXCEEDED',
      'feature', 'quick_reply_generation',
      'used', v_used,
      'max', v_max
    );
  END IF;

  SELECT * INTO v_user_credits
  FROM user_credits
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF FOUND THEN
    v_balance_after := COALESCE(v_user_credits.daily_credits, 0) + COALESCE(v_user_credits.bonus_credits, 0);
  END IF;

  INSERT INTO credit_transactions (
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
    'quick_reply_generation',
    jsonb_build_object('quotaOnly', true)
  );

  RETURN jsonb_build_object(
    'success', true,
    'is_member', false,
    'used', v_used + 1,
    'max', v_max
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION consume_quick_reply_quota(UUID) TO authenticated;
