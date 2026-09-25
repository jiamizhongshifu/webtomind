-- Harden video RLS policies and make daily login rewards transactionally idempotent.

SET search_path = public;

DROP POLICY IF EXISTS "video_generation_tasks_owner_select"
  ON public.video_generation_tasks;
CREATE POLICY "video_generation_tasks_owner_select"
ON public.video_generation_tasks
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "video_generation_tasks_service_role_all"
  ON public.video_generation_tasks;
CREATE POLICY "video_generation_tasks_service_role_all"
ON public.video_generation_tasks
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "video_generations_owner_select"
  ON public.video_generations;
CREATE POLICY "video_generations_owner_select"
ON public.video_generations
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "video_generations_service_role_all"
  ON public.video_generations;
CREATE POLICY "video_generations_service_role_all"
ON public.video_generations
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

GRANT SELECT ON public.video_generation_tasks TO authenticated;
GRANT SELECT ON public.video_generations TO authenticated;
GRANT ALL ON public.video_generation_tasks TO service_role;
GRANT ALL ON public.video_generations TO service_role;

CREATE UNIQUE INDEX IF NOT EXISTS credit_transactions_daily_login_reward_user_date_idx
  ON public.credit_transactions (user_id, ((metadata->>'reward_date')))
  WHERE source = 'daily_login_reward'
    AND metadata ? 'reward_date';

CREATE OR REPLACE FUNCTION public.claim_daily_login_reward(
  p_user_id UUID,
  p_reward_amount INTEGER DEFAULT 20,
  p_monthly_cap INTEGER DEFAULT 300,
  p_today DATE DEFAULT (timezone('utc', now())::date)
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $claim_daily_login_reward$
DECLARE
  v_user_credits public.user_credits%ROWTYPE;
  v_today DATE := COALESCE(p_today, timezone('utc', now())::date);
  v_yesterday DATE := COALESCE(p_today, timezone('utc', now())::date) - 1;
  v_month_start TIMESTAMPTZ := date_trunc('month', COALESCE(p_today, timezone('utc', now())::date)::timestamp) AT TIME ZONE 'UTC';
  v_month_claimed INTEGER := 0;
  v_reward INTEGER := 0;
  v_consecutive_days INTEGER := 0;
  v_balance_after INTEGER := 0;
  v_already_claimed BOOLEAN := false;
  v_cap_reached BOOLEAN := false;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required';
  END IF;

  IF p_reward_amount IS NULL OR p_reward_amount < 0 THEN
    RAISE EXCEPTION 'p_reward_amount must be non-negative';
  END IF;

  IF p_monthly_cap IS NULL OR p_monthly_cap < 0 THEN
    RAISE EXCEPTION 'p_monthly_cap must be non-negative';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext('claim_daily_login_reward'),
    hashtext(p_user_id::text)
  );

  INSERT INTO public.user_credits (
    user_id,
    daily_credits,
    daily_credits_max,
    bonus_credits,
    total_earned
  ) VALUES (
    p_user_id,
    300,
    300,
    0,
    0
  )
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO v_user_credits
  FROM public.user_credits
  WHERE user_id = p_user_id
  FOR UPDATE;

  SELECT COALESCE(SUM(amount), 0)::INTEGER
  INTO v_month_claimed
  FROM public.credit_transactions
  WHERE user_id = p_user_id
    AND source = 'daily_login_reward'
    AND created_at >= v_month_start;

  v_already_claimed :=
    v_user_credits.last_checkin_date = v_today
    OR EXISTS (
      SELECT 1
      FROM public.credit_transactions
      WHERE user_id = p_user_id
        AND source = 'daily_login_reward'
        AND metadata->>'reward_date' = v_today::TEXT
    );

  IF v_already_claimed THEN
    v_balance_after :=
      COALESCE(v_user_credits.daily_credits, 0) +
      COALESCE(v_user_credits.subscription_credits, 0) +
      COALESCE(v_user_credits.bonus_credits, 0) +
      COALESCE(v_user_credits.referral_credits, 0);

    RETURN jsonb_build_object(
      'success', true,
      'alreadyClaimed', true,
      'capReached', false,
      'reward', 0,
      'monthlyCap', p_monthly_cap,
      'monthlyClaimed', LEAST(p_monthly_cap, v_month_claimed),
      'consecutiveDays', COALESCE(v_user_credits.consecutive_checkin_days, 0),
      'balance', jsonb_build_object(
        'daily', COALESCE(v_user_credits.daily_credits, 0),
        'subscription', COALESCE(v_user_credits.subscription_credits, 0),
        'bonus', COALESCE(v_user_credits.bonus_credits, 0),
        'referral', COALESCE(v_user_credits.referral_credits, 0),
        'total', v_balance_after
      )
    );
  END IF;

  v_reward := LEAST(p_reward_amount, GREATEST(0, p_monthly_cap - v_month_claimed));
  v_cap_reached := v_reward <= 0;

  IF v_cap_reached THEN
    v_balance_after :=
      COALESCE(v_user_credits.daily_credits, 0) +
      COALESCE(v_user_credits.subscription_credits, 0) +
      COALESCE(v_user_credits.bonus_credits, 0) +
      COALESCE(v_user_credits.referral_credits, 0);

    RETURN jsonb_build_object(
      'success', true,
      'alreadyClaimed', false,
      'capReached', true,
      'reward', 0,
      'monthlyCap', p_monthly_cap,
      'monthlyClaimed', LEAST(p_monthly_cap, v_month_claimed),
      'consecutiveDays', COALESCE(v_user_credits.consecutive_checkin_days, 0),
      'balance', jsonb_build_object(
        'daily', COALESCE(v_user_credits.daily_credits, 0),
        'subscription', COALESCE(v_user_credits.subscription_credits, 0),
        'bonus', COALESCE(v_user_credits.bonus_credits, 0),
        'referral', COALESCE(v_user_credits.referral_credits, 0),
        'total', v_balance_after
      )
    );
  END IF;

  v_consecutive_days := CASE
    WHEN v_user_credits.last_checkin_date = v_yesterday
      THEN COALESCE(v_user_credits.consecutive_checkin_days, 0) + 1
    ELSE 1
  END;

  UPDATE public.user_credits
  SET
    bonus_credits = COALESCE(bonus_credits, 0) + v_reward,
    total_earned = COALESCE(total_earned, 0) + v_reward,
    last_checkin_date = v_today,
    consecutive_checkin_days = v_consecutive_days,
    updated_at = NOW()
  WHERE user_id = p_user_id
  RETURNING * INTO v_user_credits;

  v_balance_after :=
    COALESCE(v_user_credits.daily_credits, 0) +
    COALESCE(v_user_credits.subscription_credits, 0) +
    COALESCE(v_user_credits.bonus_credits, 0) +
    COALESCE(v_user_credits.referral_credits, 0);

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
    'purchase',
    'bonus',
    v_reward,
    v_balance_after,
    'daily_login_reward',
    'Daily login reward',
    jsonb_build_object(
      'idempotency_key', 'daily_login_reward:' || p_user_id::TEXT || ':' || v_today::TEXT,
      'reward_date', v_today::TEXT,
      'monthly_cap', p_monthly_cap
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'alreadyClaimed', false,
    'capReached', false,
    'reward', v_reward,
    'monthlyCap', p_monthly_cap,
    'monthlyClaimed', LEAST(p_monthly_cap, v_month_claimed + v_reward),
    'consecutiveDays', v_consecutive_days,
    'balance', jsonb_build_object(
      'daily', COALESCE(v_user_credits.daily_credits, 0),
      'subscription', COALESCE(v_user_credits.subscription_credits, 0),
      'bonus', COALESCE(v_user_credits.bonus_credits, 0),
      'referral', COALESCE(v_user_credits.referral_credits, 0),
      'total', v_balance_after
    )
  );
END;
$claim_daily_login_reward$;

GRANT EXECUTE ON FUNCTION public.claim_daily_login_reward(UUID, INTEGER, INTEGER, DATE)
  TO authenticated, service_role;
