-- Persist workspace long-running task state so Studio and export jobs can be
-- refreshed, cancelled, retried, and later drained by a background executor.

SET search_path = public;

CREATE TABLE IF NOT EXISTS public.workspace_task_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'workspace_skill',
  type TEXT NOT NULL,
  skill_id TEXT,
  tool_id TEXT,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN (
      'queued',
      'preparing',
      'running',
      'waiting_confirm',
      'writing_back',
      'succeeded',
      'failed',
      'cancelled'
    )),
  progress JSONB NOT NULL DEFAULT '{}'::jsonb,
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_payload JSONB,
  error_message TEXT,
  retry_of UUID REFERENCES public.workspace_task_runs(id) ON DELETE SET NULL,
  idempotency_key TEXT,
  executor TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS workspace_task_runs_user_idempotency_idx
  ON public.workspace_task_runs(user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS workspace_task_runs_user_status_idx
  ON public.workspace_task_runs(user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS workspace_task_runs_retry_of_idx
  ON public.workspace_task_runs(retry_of)
  WHERE retry_of IS NOT NULL;

CREATE OR REPLACE FUNCTION public.set_workspace_task_runs_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_workspace_task_runs_updated_at
  ON public.workspace_task_runs;
CREATE TRIGGER trg_workspace_task_runs_updated_at
BEFORE UPDATE ON public.workspace_task_runs
FOR EACH ROW EXECUTE FUNCTION public.set_workspace_task_runs_updated_at();

ALTER TABLE public.workspace_task_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workspace_task_runs_owner_select"
  ON public.workspace_task_runs;
CREATE POLICY "workspace_task_runs_owner_select"
ON public.workspace_task_runs
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "workspace_task_runs_service_role_all"
  ON public.workspace_task_runs;
CREATE POLICY "workspace_task_runs_service_role_all"
ON public.workspace_task_runs
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

GRANT SELECT ON public.workspace_task_runs TO authenticated;
GRANT ALL ON public.workspace_task_runs TO service_role;
