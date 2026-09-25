-- Referral anti-abuse guards: pending activation, risk evidence, reward caps,
-- and manual fraud marking.

SET search_path = '';

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

ALTER TABLE public.referrals
ADD COLUMN IF NOT EXISTS qualified_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS reward_granted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS activation_event TEXT,
ADD COLUMN IF NOT EXISTS risk_score INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS risk_reason TEXT,
ADD COLUMN IF NOT EXISTS fraud_reason TEXT,
ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS referee_email_domain TEXT,
ADD COLUMN IF NOT EXISTS referee_ip_hash TEXT,
ADD COLUMN IF NOT EXISTS referee_user_agent_hash TEXT,
ADD COLUMN IF NOT EXISTS qualification_attempts INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_qualification_check_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_referrals_referrer_status_created
  ON public.referrals(referrer_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_referrals_status_created
  ON public.referrals(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_referrals_reward_granted_at
  ON public.referrals(referrer_id, reward_granted_at DESC)
  WHERE reward_granted_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_referrals_ip_hash_created
  ON public.referrals(referee_ip_hash, created_at DESC)
  WHERE referee_ip_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_referrals_email_domain_created
  ON public.referrals(referee_email_domain, created_at DESC)
  WHERE referee_email_domain IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.referral_risk_events (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  referral_id UUID REFERENCES public.referrals(id) ON DELETE CASCADE,
  referrer_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  referee_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  risk_score INTEGER NOT NULL DEFAULT 0,
  reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.referral_risk_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS referral_risk_events_service_role_all
  ON public.referral_risk_events;
CREATE POLICY referral_risk_events_service_role_all
  ON public.referral_risk_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_referral_risk_events_referral_created
  ON public.referral_risk_events(referral_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_referral_risk_events_referrer_created
  ON public.referral_risk_events(referrer_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.is_disposable_referral_domain(p_domain TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT lower(coalesce(p_domain, '')) = ANY (ARRAY[
    '10minutemail.com',
    '20minutemail.com',
    'anonbox.net',
    'dispostable.com',
    'fakeinbox.com',
    'guerrillamail.com',
    'guerrillamail.net',
    'maildrop.cc',
    'mailinator.com',
    'moakt.com',
    'sharklasers.com',
    'temp-mail.org',
    'tempmail.com',
    'tempmail.dev',
    'throwawaymail.com',
    'trashmail.com',
    'yopmail.com'
  ]);
$$;

CREATE OR REPLACE FUNCTION public.create_referral_claim(
  p_referrer_id UUID,
  p_referee_id UUID,
  p_referee_email TEXT DEFAULT NULL,
  p_referee_ip_hash TEXT DEFAULT NULL,
  p_referee_user_agent_hash TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_reward_amount INTEGER := 500;
  v_referral_id UUID;
  v_status TEXT := 'pending';
  v_email_domain TEXT := lower(NULLIF(split_part(coalesce(p_referee_email, ''), '@', 2), ''));
  v_ip_hash TEXT := NULLIF(BTRIM(coalesce(p_referee_ip_hash, '')), '');
  v_user_agent_hash TEXT := NULLIF(BTRIM(coalesce(p_referee_user_agent_hash, '')), '');
  v_risk_score INTEGER := 0;
  v_risk_reasons TEXT[] := ARRAY[]::TEXT[];
  v_referrer_claims_today INTEGER := 0;
  v_referrer_claims_month INTEGER := 0;
  v_ip_claims_today INTEGER := 0;
  v_user_agent_claims_today INTEGER := 0;
  v_reason TEXT;
BEGIN
  IF p_referrer_id IS NULL OR p_referee_id IS NULL THEN
    RAISE EXCEPTION 'Referral users are required';
  END IF;

  IF p_referrer_id = p_referee_id THEN
    RAISE EXCEPTION 'Cannot refer yourself';
  END IF;

  PERFORM pg_advisory_xact_lock(
    pg_catalog.hashtext('create_referral_claim'),
    pg_catalog.hashtext(p_referee_id::TEXT)
  );

  IF v_email_domain IS NOT NULL
     AND public.is_disposable_referral_domain(v_email_domain) THEN
    v_risk_score := v_risk_score + 90;
    v_risk_reasons := array_append(v_risk_reasons, 'disposable_email_domain');
  END IF;

  SELECT COUNT(*) INTO v_referrer_claims_today
  FROM public.referrals
  WHERE referrer_id = p_referrer_id
    AND created_at >= NOW() - INTERVAL '1 day';

  SELECT COUNT(*) INTO v_referrer_claims_month
  FROM public.referrals
  WHERE referrer_id = p_referrer_id
    AND created_at >= date_trunc('month', NOW());

  IF v_referrer_claims_today >= 20 THEN
    v_risk_score := v_risk_score + 80;
    v_risk_reasons := array_append(v_risk_reasons, 'referrer_daily_claim_velocity');
  END IF;

  IF v_referrer_claims_month >= 100 THEN
    v_risk_score := v_risk_score + 80;
    v_risk_reasons := array_append(v_risk_reasons, 'referrer_monthly_claim_velocity');
  END IF;

  IF v_ip_hash IS NOT NULL THEN
    SELECT COUNT(*) INTO v_ip_claims_today
    FROM public.referrals
    WHERE referee_ip_hash = v_ip_hash
      AND created_at >= NOW() - INTERVAL '1 day';

    IF v_ip_claims_today >= 5 THEN
      v_risk_score := v_risk_score + 85;
      v_risk_reasons := array_append(v_risk_reasons, 'ip_referral_velocity');
    END IF;
  END IF;

  IF v_user_agent_hash IS NOT NULL THEN
    SELECT COUNT(*) INTO v_user_agent_claims_today
    FROM public.referrals
    WHERE referee_user_agent_hash = v_user_agent_hash
      AND created_at >= NOW() - INTERVAL '1 day';

    IF v_user_agent_claims_today >= 40 THEN
      v_risk_score := v_risk_score + 35;
      v_risk_reasons := array_append(v_risk_reasons, 'user_agent_referral_velocity');
    END IF;
  END IF;

  IF v_risk_score >= 80 THEN
    v_status := 'fraud';
  END IF;

  v_reason := NULLIF(array_to_string(v_risk_reasons, ','), '');

  INSERT INTO public.referrals (
    referrer_id,
    referee_id,
    status,
    reward_amount,
    completed_at,
    risk_score,
    risk_reason,
    fraud_reason,
    reviewed_at,
    referee_email_domain,
    referee_ip_hash,
    referee_user_agent_hash,
    metadata
  )
  VALUES (
    p_referrer_id,
    p_referee_id,
    v_status,
    v_reward_amount,
    NULL,
    v_risk_score,
    v_reason,
    CASE WHEN v_status = 'fraud' THEN v_reason ELSE NULL END,
    CASE WHEN v_status = 'fraud' THEN NOW() ELSE NULL END,
    v_email_domain,
    v_ip_hash,
    v_user_agent_hash,
    jsonb_build_object(
      'created_by', 'create_referral_claim',
      'requires_activation', v_status = 'pending',
      'risk_counts', jsonb_build_object(
        'referrer_claims_today', v_referrer_claims_today,
        'referrer_claims_month', v_referrer_claims_month,
        'ip_claims_today', v_ip_claims_today,
        'user_agent_claims_today', v_user_agent_claims_today
      )
    ) || COALESCE(p_metadata, '{}'::jsonb)
  )
  ON CONFLICT (referee_id) DO NOTHING
  RETURNING id INTO v_referral_id;

  IF v_referral_id IS NULL THEN
    RAISE EXCEPTION 'Already referred';
  END IF;

  IF v_risk_score > 0 THEN
    INSERT INTO public.referral_risk_events (
      referral_id,
      referrer_id,
      referee_id,
      event_type,
      risk_score,
      reason,
      metadata
    )
    VALUES (
      v_referral_id,
      p_referrer_id,
      p_referee_id,
      CASE WHEN v_status = 'fraud' THEN 'claim_blocked' ELSE 'claim_flagged' END,
      v_risk_score,
      v_reason,
      COALESCE(p_metadata, '{}'::jsonb)
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'status', v_status,
    'requires_activation', v_status = 'pending',
    'reward_amount', v_reward_amount,
    'referral_id', v_referral_id,
    'risk_score', v_risk_score,
    'risk_reason', v_reason
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.qualify_pending_referral(
  p_referee_id UUID,
  p_activation_event TEXT DEFAULT 'image_generation_success'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_referral public.referrals%ROWTYPE;
  v_reward_amount INTEGER;
  v_user_created_at TIMESTAMPTZ;
  v_email_confirmed_at TIMESTAMPTZ;
  v_generation_count INTEGER := 0;
  v_image_usage_credits INTEGER := 0;
  v_completed_today INTEGER := 0;
  v_completed_month INTEGER := 0;
  v_reason TEXT;
BEGIN
  IF p_referee_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'qualified', false, 'reason', 'missing_referee');
  END IF;

  PERFORM pg_advisory_xact_lock(
    pg_catalog.hashtext('qualify_pending_referral'),
    pg_catalog.hashtext(p_referee_id::TEXT)
  );

  SELECT *
  INTO v_referral
  FROM public.referrals
  WHERE referee_id = p_referee_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'qualified', false, 'reason', 'no_referral');
  END IF;

  IF v_referral.status = 'completed' THEN
    RETURN jsonb_build_object(
      'success', true,
      'qualified', true,
      'already_completed', true,
      'reward_amount', v_referral.reward_amount,
      'referral_id', v_referral.id
    );
  END IF;

  IF v_referral.status = 'fraud' THEN
    RETURN jsonb_build_object(
      'success', false,
      'qualified', false,
      'reason', 'fraud',
      'fraud_reason', v_referral.fraud_reason,
      'referral_id', v_referral.id
    );
  END IF;

  SELECT u.created_at, u.email_confirmed_at
  INTO v_user_created_at, v_email_confirmed_at
  FROM auth.users AS u
  WHERE u.id = p_referee_id;

  IF NOT FOUND THEN
    v_reason := 'missing_auth_user';
  ELSIF v_email_confirmed_at IS NULL THEN
    v_reason := 'email_not_confirmed';
  ELSIF v_user_created_at > NOW() - INTERVAL '10 minutes' THEN
    v_reason := 'account_age_too_new';
  END IF;

  IF v_reason IS NULL THEN
    SELECT COUNT(*) INTO v_generation_count
    FROM public.image_generations
    WHERE user_id = p_referee_id
      AND created_at >= v_referral.created_at;

    SELECT COALESCE(SUM(ABS(amount)), 0)::INTEGER
    INTO v_image_usage_credits
    FROM public.credit_transactions
    WHERE user_id = p_referee_id
      AND type = 'usage'
      AND source = 'image_generation'
      AND amount < 0
      AND created_at >= v_referral.created_at;

    IF v_generation_count < 1 OR v_image_usage_credits < 100 THEN
      v_reason := 'activation_required';
    END IF;
  END IF;

  IF v_reason IS NULL THEN
    SELECT COUNT(*) INTO v_completed_today
    FROM public.referrals
    WHERE referrer_id = v_referral.referrer_id
      AND status = 'completed'
      AND reward_granted_at >= date_trunc('day', NOW());

    SELECT COUNT(*) INTO v_completed_month
    FROM public.referrals
    WHERE referrer_id = v_referral.referrer_id
      AND status = 'completed'
      AND reward_granted_at >= date_trunc('month', NOW());

    IF v_completed_today >= 5 THEN
      v_reason := 'daily_reward_cap_reached';
    ELSIF v_completed_month >= 20 THEN
      UPDATE public.referrals
      SET
        status = 'fraud',
        fraud_reason = 'monthly_reward_cap_exceeded',
        reviewed_at = NOW(),
        qualification_attempts = qualification_attempts + 1,
        last_qualification_check_at = NOW(),
        metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
          'last_qualification_reason', 'monthly_reward_cap_exceeded',
          'last_qualification_checked_at', NOW()
        )
      WHERE id = v_referral.id;

      INSERT INTO public.referral_risk_events (
        referral_id,
        referrer_id,
        referee_id,
        event_type,
        risk_score,
        reason,
        metadata
      )
      VALUES (
        v_referral.id,
        v_referral.referrer_id,
        v_referral.referee_id,
        'qualification_blocked',
        90,
        'monthly_reward_cap_exceeded',
        jsonb_build_object('activation_event', p_activation_event)
      );

      RETURN jsonb_build_object(
        'success', false,
        'qualified', false,
        'reason', 'monthly_reward_cap_exceeded',
        'referral_id', v_referral.id
      );
    END IF;
  END IF;

  IF v_reason IS NOT NULL THEN
    UPDATE public.referrals
    SET
      qualification_attempts = qualification_attempts + 1,
      last_qualification_check_at = NOW(),
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
        'last_qualification_reason', v_reason,
        'last_qualification_checked_at', NOW(),
        'activation_generation_count', v_generation_count,
        'activation_image_usage_credits', v_image_usage_credits
      )
    WHERE id = v_referral.id;

    RETURN jsonb_build_object(
      'success', true,
      'qualified', false,
      'reason', v_reason,
      'referral_id', v_referral.id,
      'generation_count', v_generation_count,
      'image_usage_credits', v_image_usage_credits
    );
  END IF;

  v_reward_amount := COALESCE(NULLIF(v_referral.reward_amount, 0), 500);

  PERFORM public.add_bonus_credits(
    v_referral.referrer_id,
    v_reward_amount,
    'referral_reward',
    jsonb_build_object(
      'referee_id', v_referral.referee_id,
      'referral_id', v_referral.id,
      'activation_event', p_activation_event,
      'idempotency_key', 'referral:' || v_referral.referrer_id::TEXT || ':' || v_referral.referee_id::TEXT
    )
  );

  PERFORM public.add_bonus_credits(
    v_referral.referee_id,
    v_reward_amount,
    'referred_welcome',
    jsonb_build_object(
      'referrer_id', v_referral.referrer_id,
      'referral_id', v_referral.id,
      'activation_event', p_activation_event,
      'idempotency_key', 'referred:' || v_referral.referee_id::TEXT || ':' || v_referral.referrer_id::TEXT
    )
  );

  UPDATE public.referrals
  SET
    status = 'completed',
    qualified_at = NOW(),
    completed_at = NOW(),
    reward_granted_at = NOW(),
    activation_event = p_activation_event,
    qualification_attempts = qualification_attempts + 1,
    last_qualification_check_at = NOW(),
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
      'qualified_by', 'qualify_pending_referral',
      'activation_event', p_activation_event,
      'activation_generation_count', v_generation_count,
      'activation_image_usage_credits', v_image_usage_credits
    )
  WHERE id = v_referral.id;

  INSERT INTO public.referral_risk_events (
    referral_id,
    referrer_id,
    referee_id,
    event_type,
    risk_score,
    reason,
    metadata
  )
  VALUES (
    v_referral.id,
    v_referral.referrer_id,
    v_referral.referee_id,
    'reward_granted',
    0,
    'activation_qualified',
    jsonb_build_object(
      'activation_event', p_activation_event,
      'reward_amount', v_reward_amount
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'qualified', true,
    'reward_amount', v_reward_amount,
    'referral_id', v_referral.id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_referral_fraud(
  p_referral_id UUID,
  p_reason TEXT,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_referral public.referrals%ROWTYPE;
  v_reason TEXT := COALESCE(NULLIF(BTRIM(p_reason), ''), 'manual_review');
BEGIN
  IF p_referral_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'missing_referral');
  END IF;

  UPDATE public.referrals
  SET
    status = 'fraud',
    fraud_reason = v_reason,
    reviewed_at = NOW(),
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
      'fraud_marked_at', NOW(),
      'fraud_marked_by', 'mark_referral_fraud'
    ) || COALESCE(p_metadata, '{}'::jsonb)
  WHERE id = p_referral_id
  RETURNING * INTO v_referral;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_found');
  END IF;

  INSERT INTO public.referral_risk_events (
    referral_id,
    referrer_id,
    referee_id,
    event_type,
    risk_score,
    reason,
    metadata
  )
  VALUES (
    v_referral.id,
    v_referral.referrer_id,
    v_referral.referee_id,
    'manual_fraud_mark',
    GREATEST(v_referral.risk_score, 80),
    v_reason,
    COALESCE(p_metadata, '{}'::jsonb)
  );

  RETURN jsonb_build_object(
    'success', true,
    'status', 'fraud',
    'reason', v_reason,
    'referral_id', v_referral.id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.process_referral_reward(
  p_referrer_id UUID,
  p_referee_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN public.create_referral_claim(
    p_referrer_id,
    p_referee_id,
    NULL,
    NULL,
    NULL,
    jsonb_build_object('compatibility_wrapper', true)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.is_disposable_referral_domain(TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_referral_claim(UUID, UUID, TEXT, TEXT, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.qualify_pending_referral(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_referral_fraud(UUID, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.process_referral_reward(UUID, UUID)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_referral_claim(UUID, UUID, TEXT, TEXT, TEXT, JSONB)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.qualify_pending_referral(UUID, TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_referral_fraud(UUID, TEXT, JSONB)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.process_referral_reward(UUID, UUID)
  TO service_role;

GRANT ALL ON public.referral_risk_events TO service_role;

NOTIFY pgrst, 'reload schema';
