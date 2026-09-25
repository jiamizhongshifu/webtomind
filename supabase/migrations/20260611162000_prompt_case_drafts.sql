-- Admin-reviewed commercial prompt case drafts and attribution fields.

SET search_path = public;

CREATE TABLE IF NOT EXISTS public.prompt_case_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_slug TEXT NOT NULL,
  source_skill TEXT NOT NULL DEFAULT 'zhong-image-director',
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  prompt TEXT NOT NULL,
  negative_prompt TEXT,
  prompt_preview TEXT,
  commercial_intent TEXT,
  generation_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  image_urls TEXT[] NOT NULL DEFAULT '{}',
  selected_image_url TEXT,
  member_only BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'draft',
  review_notes TEXT,
  created_by_email TEXT,
  published_case_id UUID REFERENCES public.prompt_cases(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.prompt_case_drafts
  DROP CONSTRAINT IF EXISTS prompt_case_drafts_status_check,
  ADD CONSTRAINT prompt_case_drafts_status_check
    CHECK (status IN (
      'draft',
      'images_generated',
      'approved',
      'published',
      'rejected'
    )),
  DROP CONSTRAINT IF EXISTS prompt_case_drafts_category_check,
  ADD CONSTRAINT prompt_case_drafts_category_check
    CHECK (category IN (
      'portrait',
      'cover',
      'ecommerce',
      'fashion',
      'character',
      'background',
      'poster',
      'xiaohongshu',
      'wechat-cover',
      'featured'
    ));

CREATE INDEX IF NOT EXISTS idx_prompt_case_drafts_status_created
  ON public.prompt_case_drafts (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_prompt_case_drafts_package_status
  ON public.prompt_case_drafts (package_slug, status, created_at DESC);

ALTER TABLE public.prompt_case_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "prompt_case_drafts_service_role_all" ON public.prompt_case_drafts;
CREATE POLICY "prompt_case_drafts_service_role_all"
ON public.prompt_case_drafts
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.set_prompt_case_drafts_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prompt_case_drafts_updated_at ON public.prompt_case_drafts;
CREATE TRIGGER trg_prompt_case_drafts_updated_at
BEFORE UPDATE ON public.prompt_case_drafts
FOR EACH ROW EXECUTE FUNCTION public.set_prompt_case_drafts_updated_at();

ALTER TABLE public.prompt_cases
  ADD COLUMN IF NOT EXISTS package_slug TEXT,
  ADD COLUMN IF NOT EXISTS commercial_intent TEXT,
  ADD COLUMN IF NOT EXISTS prompt_preview TEXT,
  ADD COLUMN IF NOT EXISTS source_draft_id UUID REFERENCES public.prompt_case_drafts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_prompt_cases_package_slug
  ON public.prompt_cases (package_slug)
  WHERE package_slug IS NOT NULL AND deleted_at IS NULL;
