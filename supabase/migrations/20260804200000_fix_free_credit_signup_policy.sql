-- Keep free-account initialization aligned with the canonical 100 daily-credit
-- policy and make any corrective balance change visible in the credit ledger.

SET search_path = public;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE public.user_credits
  ALTER COLUMN daily_credits SET DEFAULT 100,
  ALTER COLUMN daily_credits_max SET DEFAULT 100,
  ALTER COLUMN daily_image_gen_max SET DEFAULT 1;

CREATE OR REPLACE FUNCTION public.handle_new_user_credits()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_credits (
    user_id,
    daily_credits,
    daily_credits_max,
    bonus_credits,
    total_earned,
    daily_image_gen_used,
    daily_image_gen_max
  )
  VALUES (NEW.id, 100, 100, 0, 0, 0, 1)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user_credits() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_credits() FROM anon, authenticated;

-- Older migration chains did not consistently retain admin_adjustment in the
-- transaction type constraint. Add it only when the deployed constraint lacks
-- the value so production avoids an unnecessary table scan and lock.
DO $$
DECLARE
  v_constraint_definition TEXT;
BEGIN
  SELECT pg_get_constraintdef(oid)
  INTO v_constraint_definition
  FROM pg_constraint
  WHERE conrelid = 'public.credit_transactions'::regclass
    AND conname = 'credit_transactions_type_check';

  IF v_constraint_definition IS NULL
     OR POSITION('admin_adjustment' IN v_constraint_definition) = 0 THEN
    ALTER TABLE public.credit_transactions
      DROP CONSTRAINT IF EXISTS credit_transactions_type_check;

    ALTER TABLE public.credit_transactions
      ADD CONSTRAINT credit_transactions_type_check
      CHECK (
        type IN (
          'daily_refresh',
          'subscription_grant',
          'purchase',
          'usage',
          'checkin',
          'referral_reward',
          'admin_adjustment',
          'refund',
          'earn',
          'ai_chat_basic',
          'ai_chat_advanced',
          'image_generation',
          'video_transcription',
          'nlm_flashcards',
          'nlm_mindmap',
          'nlm_quiz',
          'nlm_report',
          'nlm_summary',
          'nlm_audio',
          'nlm_video',
          'nlm_infographic',
          'nlm_slide_deck',
          'nlm_data_table',
          'consume'
        )
      );
  END IF;
END;
$$;

-- This RPC is the atomic safety net used by the balance endpoint. The wallet
-- row lock prevents duplicate adjustment records under concurrent requests.
CREATE OR REPLACE FUNCTION public.reconcile_free_credit_policy(
  p_user_id UUID
)
RETURNS public.user_credits
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet public.user_credits%ROWTYPE;
  v_previous_daily_credits INTEGER;
  v_next_daily_credits INTEGER;
BEGIN
  SELECT *
  INTO v_wallet
  FROM public.user_credits
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.user_subscriptions s
    WHERE s.user_id = p_user_id
      AND s.status IN ('active', 'trialing', 'past_due', 'canceled')
      AND (
        s.status <> 'canceled'
        OR s.current_period_end::date >= CURRENT_DATE
      )
  ) THEN
    RETURN v_wallet;
  END IF;

  IF COALESCE(v_wallet.daily_credits_max, 0) = 100
     AND COALESCE(v_wallet.daily_credits, 0) <= 100
     AND COALESCE(v_wallet.daily_image_gen_max, 0) = 1 THEN
    RETURN v_wallet;
  END IF;

  v_previous_daily_credits := COALESCE(v_wallet.daily_credits, 0);
  v_next_daily_credits := LEAST(v_previous_daily_credits, 100);

  UPDATE public.user_credits
  SET
    daily_credits = v_next_daily_credits,
    daily_credits_max = 100,
    daily_image_gen_max = 1,
    updated_at = NOW()
  WHERE user_id = p_user_id
  RETURNING * INTO v_wallet;

  IF v_next_daily_credits <> v_previous_daily_credits THEN
    INSERT INTO public.credit_transactions (
      user_id,
      amount,
      type,
      credit_type,
      balance_after,
      source,
      description,
      metadata
    )
    VALUES (
      p_user_id,
      v_next_daily_credits - v_previous_daily_credits,
      'admin_adjustment',
      'daily',
      COALESCE(v_wallet.daily_credits, 0)
        + COALESCE(v_wallet.subscription_credits, 0)
        + COALESCE(v_wallet.bonus_credits, 0)
        + COALESCE(v_wallet.referral_credits, 0),
      'free_daily_quota_policy',
      'Free daily credit policy reconciliation (not usage)',
      jsonb_build_object(
        'policy_version', 'free_daily_100_v20260804',
        'previous_daily_credits', v_previous_daily_credits,
        'next_daily_credits', v_next_daily_credits,
        'reason', 'legacy_signup_default'
      )
    );
  END IF;

  RETURN v_wallet;
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_free_credit_policy(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reconcile_free_credit_policy(UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_free_credit_policy(UUID) TO service_role;

-- Reconcile only free wallets. Paid-access rows retain their entitlement
-- values. Each actual balance decrease gets an explicit non-consumption ledger
-- record; max-only corrections intentionally do not create a zero-value row.
WITH candidates AS MATERIALIZED (
  SELECT
    uc.user_id,
    COALESCE(uc.daily_credits, 0) AS previous_daily_credits,
    LEAST(COALESCE(uc.daily_credits, 0), 100) AS next_daily_credits
  FROM public.user_credits uc
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.user_subscriptions s
    WHERE s.user_id = uc.user_id
      AND s.status IN ('active', 'trialing', 'past_due', 'canceled')
      AND (
        s.status <> 'canceled'
        OR s.current_period_end::date >= CURRENT_DATE
      )
  )
  AND (
    COALESCE(uc.daily_credits_max, 0) <> 100
    OR COALESCE(uc.daily_credits, 0) > 100
    OR COALESCE(uc.daily_image_gen_max, 0) <> 1
  )
  FOR UPDATE OF uc
),
updated AS (
  UPDATE public.user_credits uc
  SET
    daily_credits = candidate.next_daily_credits,
    daily_credits_max = 100,
    daily_image_gen_max = 1,
    updated_at = NOW()
  FROM candidates candidate
  WHERE uc.user_id = candidate.user_id
  RETURNING
    uc.user_id,
    candidate.previous_daily_credits,
    candidate.next_daily_credits,
    uc.subscription_credits,
    uc.bonus_credits,
    uc.referral_credits
)
INSERT INTO public.credit_transactions (
  user_id,
  amount,
  type,
  credit_type,
  balance_after,
  source,
  description,
  metadata
)
SELECT
  updated.user_id,
  updated.next_daily_credits - updated.previous_daily_credits,
  'admin_adjustment',
  'daily',
  updated.next_daily_credits
    + COALESCE(updated.subscription_credits, 0)
    + COALESCE(updated.bonus_credits, 0)
    + COALESCE(updated.referral_credits, 0),
  'free_daily_quota_policy',
  'Free daily credit policy reconciliation (not usage)',
  jsonb_build_object(
    'policy_version', 'free_daily_100_v20260804',
    'previous_daily_credits', updated.previous_daily_credits,
    'next_daily_credits', updated.next_daily_credits,
    'reason', 'legacy_signup_default'
  )
FROM updated
WHERE updated.next_daily_credits <> updated.previous_daily_credits;

NOTIFY pgrst, 'reload schema';
