-- Async task state for the visual image creator.

SET search_path = public;

CREATE TABLE IF NOT EXISTS public.image_generation_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
  request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_payload JSONB,
  error_message TEXT,
  refund_failed BOOLEAN NOT NULL DEFAULT false,
  generation_id UUID REFERENCES public.image_generations(id) ON DELETE SET NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_image_generation_tasks_user_created
  ON public.image_generation_tasks (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_image_generation_tasks_claim
  ON public.image_generation_tasks (status, locked_until, created_at);

ALTER TABLE public.image_generation_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "image_generation_tasks_owner_read" ON public.image_generation_tasks;
CREATE POLICY "image_generation_tasks_owner_read"
ON public.image_generation_tasks
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "image_generation_tasks_service_role_all" ON public.image_generation_tasks;
CREATE POLICY "image_generation_tasks_service_role_all"
ON public.image_generation_tasks
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
