-- Add Cloudflare-native media metadata and video queue observability fields.
-- This migration is additive and keeps Supabase/Auth/credits as the source of truth.

SET search_path = public;

CREATE TABLE IF NOT EXISTS public.media_objects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  owner_type TEXT NOT NULL,
  owner_id UUID,
  kind TEXT NOT NULL CHECK (kind IN ('original', 'thumbnail', 'preview', 'poster', 'reference', 'asset')),
  provider TEXT NOT NULL CHECK (provider IN ('supabase', 'r2')),
  bucket TEXT NOT NULL,
  object_key TEXT NOT NULL,
  content_type TEXT,
  byte_size BIGINT,
  width INTEGER,
  height INTEGER,
  duration INTEGER,
  checksum_sha256 TEXT,
  etag TEXT,
  status TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('ready', 'orphaned', 'deleted', 'failed')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS media_objects_provider_object_idx
  ON public.media_objects(provider, bucket, object_key);

CREATE INDEX IF NOT EXISTS media_objects_owner_idx
  ON public.media_objects(owner_type, owner_id, kind);

CREATE INDEX IF NOT EXISTS media_objects_user_created_idx
  ON public.media_objects(user_id, created_at DESC);

ALTER TABLE public.media_objects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "media_objects_owner_select" ON public.media_objects;
CREATE POLICY "media_objects_owner_select"
ON public.media_objects
FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "media_objects_service_role_all" ON public.media_objects;
CREATE POLICY "media_objects_service_role_all"
ON public.media_objects
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

GRANT SELECT ON public.media_objects TO authenticated;
GRANT ALL ON public.media_objects TO service_role;

ALTER TABLE public.video_generation_tasks
  ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS first_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS queue_wait_ms INTEGER,
  ADD COLUMN IF NOT EXISTS provider_latency_ms INTEGER,
  ADD COLUMN IF NOT EXISTS total_duration_ms INTEGER,
  ADD COLUMN IF NOT EXISTS failure_category TEXT,
  ADD COLUMN IF NOT EXISTS failure_code TEXT,
  ADD COLUMN IF NOT EXISTS provider_request_id TEXT,
  ADD COLUMN IF NOT EXISTS next_poll_after TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS queue_message_count INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS video_generation_tasks_claim_idx
  ON public.video_generation_tasks(status, locked_until, created_at)
  WHERE status IN ('queued', 'running');

CREATE UNIQUE INDEX IF NOT EXISTS credit_transactions_video_task_idempotency_idx
  ON public.credit_transactions (
    user_id,
    source,
    ((metadata->>'idempotency_key'))
  )
  WHERE metadata->>'billingDomain' = 'video_task'
    AND NULLIF(metadata->>'idempotency_key', '') IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS credit_transactions_video_task_phase_idempotency_idx
  ON public.credit_transactions (
    user_id,
    type,
    ((metadata->>'idempotency_key'))
  )
  WHERE metadata->>'billingDomain' = 'video_task'
    AND NULLIF(metadata->>'idempotency_key', '') IS NOT NULL;

CREATE OR REPLACE FUNCTION public.refund_generation_credit(
  p_user_id UUID,
  p_amount INTEGER,
  p_credit_type TEXT DEFAULT 'bonus',
  p_source TEXT DEFAULT 'generation_refund',
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $refund_generation_credit$
DECLARE
  v_user_credits public.user_credits%ROWTYPE;
  v_existing_transaction public.credit_transactions%ROWTYPE;
  v_breakdown JSONB := COALESCE(p_metadata, '{}'::jsonb)->'creditBreakdown';
  v_daily_refund INTEGER := 0;
  v_subscription_refund INTEGER := 0;
  v_bonus_refund INTEGER := 0;
  v_new_daily INTEGER;
  v_new_subscription INTEGER;
  v_new_bonus INTEGER;
  v_balance_after INTEGER;
  v_refund_to TEXT;
  v_billing_domain TEXT := NULLIF(COALESCE(p_metadata, '{}'::jsonb)->>'billingDomain', '');
  v_metadata JSONB;
  v_idempotency_key TEXT := COALESCE(
    NULLIF(COALESCE(p_metadata, '{}'::jsonb)->>'idempotency_key', ''),
    NULLIF(COALESCE(p_metadata, '{}'::jsonb)->>'idempotencyKey', ''),
    CASE
      WHEN NULLIF(COALESCE(p_metadata, '{}'::jsonb)->>'taskId', '') IS NOT NULL
        THEN 'video_task:' || (COALESCE(p_metadata, '{}'::jsonb)->>'taskId') || ':refund'
      WHEN p_source LIKE 'video_task:%'
        THEN p_source
      ELSE NULL
    END
  );
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_AMOUNT');
  END IF;

  IF v_billing_domain IS NULL AND v_idempotency_key LIKE 'video_task:%' THEN
    v_billing_domain := 'video_task';
  END IF;

  IF v_idempotency_key IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(
      hashtext('refund_generation_credit'),
      hashtext(
        p_user_id::TEXT || ':' ||
        COALESCE(v_billing_domain, p_source) || ':' ||
        v_idempotency_key
      )
    );

    SELECT *
    INTO v_existing_transaction
    FROM public.credit_transactions
    WHERE user_id = p_user_id
      AND type = 'refund'
      AND metadata->>'idempotency_key' = v_idempotency_key
      AND (v_billing_domain = 'video_task' OR source = p_source)
    ORDER BY created_at DESC
    LIMIT 1;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'success', true,
        'refunded', v_existing_transaction.amount,
        'credit_type', v_existing_transaction.credit_type,
        'credit_breakdown', COALESCE(
          v_existing_transaction.metadata->'creditBreakdown',
          '{}'::jsonb
        ),
        'balance_after', v_existing_transaction.balance_after,
        'idempotent', true
      );
    END IF;
  END IF;

  SELECT * INTO v_user_credits
  FROM public.user_credits
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'USER_NOT_FOUND');
  END IF;

  IF jsonb_typeof(v_breakdown) = 'object' THEN
    v_daily_refund := COALESCE((v_breakdown->>'daily')::INTEGER, 0);
    v_subscription_refund := COALESCE((v_breakdown->>'subscription')::INTEGER, 0);
    v_bonus_refund := COALESCE(
      (v_breakdown->>'bonus')::INTEGER,
      GREATEST(0, p_amount - v_daily_refund - v_subscription_refund)
    );
  ELSIF p_credit_type = 'daily' THEN
    v_daily_refund := p_amount;
  ELSIF p_credit_type = 'subscription' THEN
    v_subscription_refund := p_amount;
  ELSIF p_credit_type = 'mixed' THEN
    v_bonus_refund := GREATEST(
      0,
      p_amount - v_daily_refund - v_subscription_refund
    );
  ELSE
    v_bonus_refund := p_amount;
  END IF;

  v_new_daily := LEAST(
    COALESCE(v_user_credits.daily_credits_max, 0),
    COALESCE(v_user_credits.daily_credits, 0) + v_daily_refund
  );
  v_bonus_refund := v_bonus_refund + GREATEST(
    0,
    COALESCE(v_user_credits.daily_credits, 0) +
      v_daily_refund -
      COALESCE(v_user_credits.daily_credits_max, 0)
  );

  v_new_subscription := LEAST(
    COALESCE(v_user_credits.subscription_credits_max, 0),
    COALESCE(v_user_credits.subscription_credits, 0) + v_subscription_refund
  );
  v_bonus_refund := v_bonus_refund + GREATEST(
    0,
    COALESCE(v_user_credits.subscription_credits, 0) +
      v_subscription_refund -
      COALESCE(v_user_credits.subscription_credits_max, 0)
  );

  v_new_bonus := COALESCE(v_user_credits.bonus_credits, 0) + v_bonus_refund;

  UPDATE public.user_credits
  SET
    daily_credits = v_new_daily,
    subscription_credits = v_new_subscription,
    bonus_credits = v_new_bonus,
    total_consumed = GREATEST(0, COALESCE(total_consumed, 0) - p_amount),
    updated_at = NOW()
  WHERE user_id = p_user_id;

  v_balance_after :=
    v_new_daily +
    v_new_subscription +
    v_new_bonus +
    COALESCE(v_user_credits.referral_credits, 0);

  v_refund_to := CASE
    WHEN (CASE WHEN v_daily_refund > 0 THEN 1 ELSE 0 END) +
         (CASE WHEN v_subscription_refund > 0 THEN 1 ELSE 0 END) +
         (CASE WHEN v_bonus_refund > 0 THEN 1 ELSE 0 END) > 1
      THEN 'mixed'
    WHEN v_daily_refund > 0 THEN 'daily'
    WHEN v_subscription_refund > 0 THEN 'subscription'
    ELSE 'bonus'
  END;

  v_metadata := COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object(
    'creditBreakdown', jsonb_build_object(
      'daily', v_daily_refund,
      'subscription', v_subscription_refund,
      'bonus', v_bonus_refund
    ),
    'idempotency_key', v_idempotency_key
  );

  IF v_billing_domain IS NOT NULL THEN
    v_metadata := v_metadata || jsonb_build_object('billingDomain', v_billing_domain);
  END IF;

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
    'refund',
    v_refund_to,
    p_amount,
    v_balance_after,
    p_source,
    'Generation failed; credits refunded',
    v_metadata || jsonb_build_object(
      'refunded', p_amount,
      'credit_type', v_refund_to
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'refunded', p_amount,
    'credit_type', v_refund_to,
    'credit_breakdown', jsonb_build_object(
      'daily', v_daily_refund,
      'subscription', v_subscription_refund,
      'bonus', v_bonus_refund
    ),
    'balance_after', v_balance_after
  );
END;
$refund_generation_credit$;

REVOKE EXECUTE ON FUNCTION public.refund_generation_credit(UUID, INTEGER, TEXT, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.refund_generation_credit(UUID, INTEGER, TEXT, TEXT, JSONB)
  TO service_role;

NOTIFY pgrst, 'reload schema';
