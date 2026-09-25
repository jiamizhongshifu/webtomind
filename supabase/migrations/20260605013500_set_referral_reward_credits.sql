-- Normalize referral rewards and make invite-credit grants reproducible.
-- Current reward policy: both referrer and referee receive 1,000 bonus credits.

SET search_path = '';

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS referral_code TEXT;

CREATE OR REPLACE FUNCTION public.generate_referral_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result TEXT := '';
  i INTEGER;
  found_code TEXT;
BEGIN
  LOOP
    result := '';
    FOR i IN 1..8 LOOP
      result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
    END LOOP;

    SELECT p.referral_code
    INTO found_code
    FROM public.profiles AS p
    WHERE p.referral_code = result;

    IF NOT FOUND THEN
      RETURN result;
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_referral_code(p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_referral_code TEXT;
BEGIN
  SELECT NULLIF(BTRIM(p.referral_code), '')
  INTO v_referral_code
  FROM public.profiles AS p
  WHERE p.id = p_user_id
  FOR UPDATE;

  IF v_referral_code IS NOT NULL THEN
    RETURN v_referral_code;
  END IF;

  v_referral_code := public.generate_referral_code();

  UPDATE public.profiles
  SET referral_code = v_referral_code
  WHERE id = p_user_id;

  RETURN v_referral_code;
END;
$$;

UPDATE public.profiles
SET referral_code = public.generate_referral_code()
WHERE referral_code IS NULL OR BTRIM(referral_code) = '';

CREATE UNIQUE INDEX IF NOT EXISTS profiles_referral_code_key
  ON public.profiles(referral_code)
  WHERE referral_code IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.referrals (
  id UUID DEFAULT extensions.gen_random_uuid() PRIMARY KEY,
  referrer_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  referee_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'fraud')),
  reward_amount INTEGER DEFAULT 1000,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

ALTER TABLE public.referrals
ADD COLUMN IF NOT EXISTS reward_amount INTEGER DEFAULT 1000;

ALTER TABLE public.referrals
ALTER COLUMN reward_amount SET DEFAULT 1000;

CREATE UNIQUE INDEX IF NOT EXISTS idx_referrals_referee
  ON public.referrals(referee_id);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer_created
  ON public.referrals(referrer_id, created_at DESC);

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own referrals" ON public.referrals;
DROP POLICY IF EXISTS referrals_select_own ON public.referrals;

CREATE POLICY referrals_select_own ON public.referrals
  FOR SELECT
  USING (
    referrer_id = (SELECT auth.uid())
    OR referee_id = (SELECT auth.uid())
  );

DROP FUNCTION IF EXISTS public.process_referral_reward(UUID, UUID, INTEGER);

CREATE OR REPLACE FUNCTION public.process_referral_reward(
  p_referrer_id UUID,
  p_referee_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_reward_amount INTEGER := 1000;
  v_referral_id UUID;
BEGIN
  IF p_referrer_id IS NULL OR p_referee_id IS NULL THEN
    RAISE EXCEPTION 'Referral users are required';
  END IF;

  IF p_referrer_id = p_referee_id THEN
    RAISE EXCEPTION 'Cannot refer yourself';
  END IF;

  PERFORM pg_advisory_xact_lock(
    pg_catalog.hashtext('process_referral_reward'),
    pg_catalog.hashtext(p_referee_id::TEXT)
  );

  INSERT INTO public.referrals (
    referrer_id,
    referee_id,
    status,
    reward_amount,
    completed_at
  )
  VALUES (
    p_referrer_id,
    p_referee_id,
    'completed',
    v_reward_amount,
    NOW()
  )
  ON CONFLICT (referee_id) DO NOTHING
  RETURNING id INTO v_referral_id;

  IF v_referral_id IS NULL THEN
    RAISE EXCEPTION 'Already referred';
  END IF;

  PERFORM public.add_bonus_credits(
    p_referrer_id,
    v_reward_amount,
    'referral_reward',
    jsonb_build_object(
      'referee_id', p_referee_id,
      'referral_id', v_referral_id,
      'idempotency_key', 'referral:' || p_referrer_id::TEXT || ':' || p_referee_id::TEXT
    )
  );

  PERFORM public.add_bonus_credits(
    p_referee_id,
    v_reward_amount,
    'referred_welcome',
    jsonb_build_object(
      'referrer_id', p_referrer_id,
      'referral_id', v_referral_id,
      'idempotency_key', 'referred:' || p_referee_id::TEXT || ':' || p_referrer_id::TEXT
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'reward_amount', v_reward_amount,
    'referral_id', v_referral_id
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.generate_referral_code() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ensure_referral_code(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.process_referral_reward(UUID, UUID) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.ensure_referral_code(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.process_referral_reward(UUID, UUID) TO service_role;

NOTIFY pgrst, 'reload schema';
