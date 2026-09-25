-- Add first-class observability for visual image generation.
-- The app writes these rows through the service role from server-side API
-- functions; RLS remains enabled so the table is not exposed to clients.

ALTER TABLE public.image_generation_tasks
  ADD COLUMN IF NOT EXISTS first_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS provider_latency_ms INTEGER,
  ADD COLUMN IF NOT EXISTS queue_wait_ms INTEGER,
  ADD COLUMN IF NOT EXISTS total_duration_ms INTEGER,
  ADD COLUMN IF NOT EXISTS failure_category TEXT,
  ADD COLUMN IF NOT EXISTS failure_code TEXT,
  ADD COLUMN IF NOT EXISTS provider_request_id TEXT;

CREATE TABLE IF NOT EXISTS public.image_generation_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES public.image_generation_tasks(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_mode TEXT NOT NULL DEFAULT 'queued',
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  channel TEXT,
  attempt_index INTEGER NOT NULL DEFAULT 1,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  duration_ms INTEGER,
  status TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
  error_category TEXT,
  error_code TEXT,
  error_message TEXT,
  provider_request_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.image_generation_attempts ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS image_generation_attempts_task_id_idx
  ON public.image_generation_attempts(task_id, started_at DESC);

CREATE INDEX IF NOT EXISTS image_generation_attempts_user_id_idx
  ON public.image_generation_attempts(user_id, started_at DESC);

CREATE INDEX IF NOT EXISTS image_generation_attempts_status_idx
  ON public.image_generation_attempts(status, started_at DESC);

CREATE INDEX IF NOT EXISTS image_generation_attempts_error_category_idx
  ON public.image_generation_attempts(error_category, started_at DESC)
  WHERE error_category IS NOT NULL;

CREATE INDEX IF NOT EXISTS image_generation_tasks_failure_category_idx
  ON public.image_generation_tasks(failure_category, created_at DESC)
  WHERE failure_category IS NOT NULL;
