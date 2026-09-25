-- Curated image prompt cases for the visual prompt studio Prompts tab.

SET search_path = public;

CREATE TABLE IF NOT EXISTS public.prompt_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  image_url TEXT NOT NULL,
  prompt TEXT NOT NULL,
  author_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_published BOOLEAN NOT NULL DEFAULT true,
  deleted_at TIMESTAMPTZ,
  created_by_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP INDEX IF EXISTS public.idx_prompt_cases_public_order;
CREATE INDEX idx_prompt_cases_public_order
  ON public.prompt_cases (is_published, deleted_at, created_at DESC);

ALTER TABLE public.prompt_cases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "prompt_cases_public_read" ON public.prompt_cases;
CREATE POLICY "prompt_cases_public_read"
ON public.prompt_cases
FOR SELECT
TO anon, authenticated
USING (is_published = true AND deleted_at IS NULL);

DROP POLICY IF EXISTS "prompt_cases_service_role_all" ON public.prompt_cases;
CREATE POLICY "prompt_cases_service_role_all"
ON public.prompt_cases
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.set_prompt_cases_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prompt_cases_updated_at ON public.prompt_cases;
CREATE TRIGGER trg_prompt_cases_updated_at
BEFORE UPDATE ON public.prompt_cases
FOR EACH ROW EXECUTE FUNCTION public.set_prompt_cases_updated_at();
