-- Lower referral rewards to 500 credits, equivalent to five base image generations.

SET search_path = '';

ALTER TABLE public.referrals
ALTER COLUMN reward_amount SET DEFAULT 500;

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
  v_reward_amount INTEGER := 500;
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

REVOKE EXECUTE ON FUNCTION public.process_referral_reward(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_referral_reward(UUID, UUID) TO service_role;

NOTIFY pgrst, 'reload schema';
