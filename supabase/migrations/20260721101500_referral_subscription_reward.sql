-- Grant a one-time inviter reward after the referred user completes a paid
-- subscription checkout. This extends the existing referral system and keeps
-- payment fulfillment idempotent under webhook retries.

SET search_path = '';

CREATE OR REPLACE FUNCTION public.grant_referral_subscription_reward(
  p_referee_id UUID,
  p_order_id UUID,
  p_amount INTEGER DEFAULT 3000
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_referral public.referrals%ROWTYPE;
BEGIN
  IF p_referee_id IS NULL OR p_order_id IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Valid referee, order, and reward amount are required';
  END IF;

  PERFORM pg_advisory_xact_lock(
    pg_catalog.hashtext('grant_referral_subscription_reward'),
    pg_catalog.hashtext(p_referee_id::TEXT)
  );

  SELECT * INTO v_referral
  FROM public.referrals
  WHERE referee_id = p_referee_id
    AND status <> 'fraud'
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('granted', false, 'reason', 'no_referral');
  END IF;

  IF COALESCE(v_referral.metadata, '{}'::jsonb)
       ? 'subscription_reward_granted_at' THEN
    RETURN jsonb_build_object(
      'granted', false,
      'reason', 'already_granted',
      'referral_id', v_referral.id
    );
  END IF;

  PERFORM public.add_bonus_credits(
    v_referral.referrer_id,
    p_amount,
    'referral_reward',
    jsonb_build_object(
      'referral_id', v_referral.id,
      'referee_id', p_referee_id,
      'order_id', p_order_id,
      'reward_stage', 'first_paid_subscription',
      'idempotency_key', 'referral-subscription:' || v_referral.id::TEXT
    )
  );

  UPDATE public.referrals
  SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
    'subscription_reward_granted_at', NOW(),
    'subscription_reward_order_id', p_order_id,
    'subscription_reward_amount', p_amount
  )
  WHERE id = v_referral.id;

  RETURN jsonb_build_object(
    'granted', true,
    'referral_id', v_referral.id,
    'amount', p_amount
  );
END;
$$;

REVOKE ALL ON FUNCTION public.grant_referral_subscription_reward(UUID, UUID, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_referral_subscription_reward(UUID, UUID, INTEGER)
  TO service_role;

NOTIFY pgrst, 'reload schema';
