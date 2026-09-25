CREATE TABLE IF NOT EXISTS public.ai_provider_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT '',
  endpoint TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('succeeded', 'failed')),
  request_id TEXT,
  fallback_of TEXT,
  fallback_used BOOLEAN NOT NULL DEFAULT FALSE,
  input_tokens INTEGER,
  output_tokens INTEGER,
  total_tokens INTEGER,
  token_usage_source TEXT NOT NULL DEFAULT 'none'
    CHECK (token_usage_source IN ('provider', 'estimated', 'none')),
  prompt_chars INTEGER,
  response_chars INTEGER,
  image_count INTEGER NOT NULL DEFAULT 0,
  latency_ms INTEGER,
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_provider_usage ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS ai_provider_usage_created_at_idx
  ON public.ai_provider_usage(created_at DESC);

CREATE INDEX IF NOT EXISTS ai_provider_usage_provider_model_idx
  ON public.ai_provider_usage(provider, model, created_at DESC);

CREATE INDEX IF NOT EXISTS ai_provider_usage_source_idx
  ON public.ai_provider_usage(source, created_at DESC);

CREATE INDEX IF NOT EXISTS ai_provider_usage_user_created_idx
  ON public.ai_provider_usage(user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

DROP POLICY IF EXISTS "Users view own ai provider usage" ON public.ai_provider_usage;
CREATE POLICY "Users view own ai provider usage"
  ON public.ai_provider_usage
  FOR SELECT
  USING (auth.uid() = user_id);

REVOKE ALL ON public.ai_provider_usage FROM PUBLIC;
GRANT SELECT ON public.ai_provider_usage TO authenticated;
GRANT ALL ON public.ai_provider_usage TO service_role;
