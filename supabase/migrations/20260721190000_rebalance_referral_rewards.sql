-- Rebalance referral rewards against the July 2026 product economy.
--
-- A valid activation already requires at least 100 image-generation credits.
-- Returning 100 credits to both participants makes the activation reward
-- useful without turning referral signups into a credit-minting shortcut.
-- The 1,000-credit paid conversion reward is 10% of Pro's monthly allowance.
-- Existing pending claims keep the amount promised when they were created;
-- only newly created claims and null/zero fallbacks use the new amount.

SET search_path = '';

ALTER TABLE public.referrals
ALTER COLUMN reward_amount SET DEFAULT 100;

DO $rebalance_create_referral_claim$
DECLARE
  v_definition TEXT;
  v_updated_definition TEXT;
BEGIN
  SELECT pg_get_functiondef(
    'public.create_referral_claim(uuid,uuid,text,text,text,jsonb)'::regprocedure
  ) INTO v_definition;

  v_updated_definition := replace(
    replace(
      v_definition,
      'v_reward_amount INTEGER := 500;',
      'v_reward_amount INTEGER := 100;'
    ),
    'v_reward_amount integer := 500;',
    'v_reward_amount integer := 100;'
  );

  IF v_updated_definition = v_definition THEN
    RAISE EXCEPTION 'create_referral_claim reward constant was not found';
  END IF;

  EXECUTE v_updated_definition;
END;
$rebalance_create_referral_claim$;

DO $rebalance_qualify_pending_referral$
DECLARE
  v_definition TEXT;
  v_updated_definition TEXT;
BEGIN
  SELECT pg_get_functiondef(
    'public.qualify_pending_referral(uuid,text)'::regprocedure
  ) INTO v_definition;

  v_updated_definition := replace(
    v_definition,
    'COALESCE(NULLIF(v_referral.reward_amount, 0), 500)',
    'COALESCE(NULLIF(v_referral.reward_amount, 0), 100)'
  );

  IF v_updated_definition = v_definition THEN
    RAISE EXCEPTION 'qualify_pending_referral fallback constant was not found';
  END IF;

  EXECUTE v_updated_definition;
END;
$rebalance_qualify_pending_referral$;

DO $rebalance_subscription_referral_reward$
DECLARE
  v_definition TEXT;
  v_updated_definition TEXT;
BEGIN
  SELECT pg_get_functiondef(
    'public.grant_referral_subscription_reward(uuid,uuid,integer)'::regprocedure
  ) INTO v_definition;

  v_updated_definition := replace(
    v_definition,
    'DEFAULT 3000',
    'DEFAULT 1000'
  );

  IF v_updated_definition = v_definition THEN
    RAISE EXCEPTION 'grant_referral_subscription_reward default was not found';
  END IF;

  EXECUTE v_updated_definition;
END;
$rebalance_subscription_referral_reward$;

NOTIFY pgrst, 'reload schema';
