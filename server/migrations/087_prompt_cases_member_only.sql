-- Add per-case prompt visibility control.
-- Default false keeps existing cases visible to any signed-in user.

ALTER TABLE IF EXISTS public.prompt_cases
  ADD COLUMN IF NOT EXISTS members_only BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_prompt_cases_members_only
  ON public.prompt_cases (members_only)
  WHERE deleted_at IS NULL;
