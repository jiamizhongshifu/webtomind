-- First-class video generation task and history storage.

SET search_path = public;

INSERT INTO public.credit_costs (
  action,
  description,
  category,
  cost,
  base_cost,
  min_cost,
  max_cost,
  pricing_type,
  is_active
)
VALUES (
  'video_generation',
  'AI 视频生成',
  'media',
  300,
  300,
  300,
  20000,
  'dynamic',
  true
)
ON CONFLICT (action) DO UPDATE
SET
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  cost = EXCLUDED.cost,
  base_cost = EXCLUDED.base_cost,
  min_cost = EXCLUDED.min_cost,
  max_cost = EXCLUDED.max_cost,
  pricing_type = EXCLUDED.pricing_type,
  is_active = true,
  updated_at = NOW();

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'user-generated-videos',
  'user-generated-videos',
  false,
  524288000,
  ARRAY['video/mp4', 'video/webm', 'video/quicktime', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE TABLE IF NOT EXISTS public.video_generation_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  provider TEXT NOT NULL DEFAULT 'tuzi',
  provider_task_id TEXT,
  request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_payload JSONB,
  error_message TEXT,
  refund_failed BOOLEAN NOT NULL DEFAULT false,
  generation_id UUID,
  attempt_count INTEGER NOT NULL DEFAULT 1,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.video_generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id UUID REFERENCES public.video_generation_tasks(id) ON DELETE SET NULL,
  video_url TEXT,
  poster_url TEXT,
  prompt TEXT NOT NULL,
  model_label TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_model TEXT NOT NULL,
  provider_task_id TEXT,
  aspect_ratio TEXT,
  duration INTEGER,
  storage_bucket TEXT,
  storage_path TEXT,
  poster_storage_path TEXT,
  byte_size INTEGER,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.video_generation_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_generations ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS video_generation_tasks_user_status_idx
  ON public.video_generation_tasks(user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS video_generation_tasks_provider_task_idx
  ON public.video_generation_tasks(provider_task_id)
  WHERE provider_task_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS video_generations_user_created_idx
  ON public.video_generations(user_id, created_at DESC);

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
  v_daily_refund INTEGER := 0;
  v_subscription_refund INTEGER := 0;
  v_bonus_refund INTEGER := 0;
  v_new_daily INTEGER;
  v_new_subscription INTEGER;
  v_new_bonus INTEGER;
  v_balance_after INTEGER;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_AMOUNT');
  END IF;

  SELECT * INTO v_user_credits
  FROM public.user_credits
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'USER_NOT_FOUND');
  END IF;

  IF p_credit_type = 'daily' THEN
    v_daily_refund := p_amount;
  ELSIF p_credit_type = 'subscription' THEN
    v_subscription_refund := p_amount;
  ELSIF p_credit_type = 'mixed' THEN
    v_daily_refund := COALESCE((p_metadata->'creditBreakdown'->>'daily')::INTEGER, 0);
    v_subscription_refund := COALESCE((p_metadata->'creditBreakdown'->>'subscription')::INTEGER, 0);
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
  v_new_subscription := LEAST(
    COALESCE(v_user_credits.subscription_credits_max, 0),
    COALESCE(v_user_credits.subscription_credits, 0) + v_subscription_refund
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
    CASE WHEN p_credit_type IN ('daily', 'subscription', 'mixed') THEN p_credit_type ELSE 'bonus' END,
    p_amount,
    v_balance_after,
    p_source,
    'Generation failed; credits refunded',
    jsonb_build_object(
      'refunded', p_amount,
      'credit_type', p_credit_type,
      'creditBreakdown', jsonb_build_object(
        'daily', v_daily_refund,
        'subscription', v_subscription_refund,
        'bonus', v_bonus_refund
      )
    ) || COALESCE(p_metadata, '{}'::jsonb)
  );

  RETURN jsonb_build_object(
    'success', true,
    'refunded', p_amount,
    'balance_after', v_balance_after
  );
END;
$refund_generation_credit$;

GRANT EXECUTE ON FUNCTION public.refund_generation_credit(UUID, INTEGER, TEXT, TEXT, JSONB)
  TO authenticated, service_role;
