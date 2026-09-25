-- Add growth-loop metadata and lightweight conversion counters for prompt cases.

SET search_path = public;

ALTER TABLE public.prompt_cases
  ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS slug TEXT,
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'featured',
  ADD COLUMN IF NOT EXISTS tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS model TEXT NOT NULL DEFAULT 'gemini-image',
  ADD COLUMN IF NOT EXISTS locale TEXT NOT NULL DEFAULT 'zh-CN',
  ADD COLUMN IF NOT EXISTS featured BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS view_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS copy_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS generate_count INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS idx_prompt_cases_slug_unique
  ON public.prompt_cases (slug)
  WHERE slug IS NOT NULL AND slug <> '';

DROP INDEX IF EXISTS public.idx_prompt_cases_public_growth_order;
CREATE INDEX idx_prompt_cases_public_growth_order
  ON public.prompt_cases (is_published, deleted_at, featured DESC, created_at DESC);

ALTER TABLE public.prompt_cases
  DROP CONSTRAINT IF EXISTS prompt_cases_slug_format,
  ADD CONSTRAINT prompt_cases_slug_format
    CHECK (slug IS NULL OR slug = '' OR slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  DROP CONSTRAINT IF EXISTS prompt_cases_category_check,
  ADD CONSTRAINT prompt_cases_category_check
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
    )),
  DROP CONSTRAINT IF EXISTS prompt_cases_locale_check,
  ADD CONSTRAINT prompt_cases_locale_check
    CHECK (locale IN ('zh-CN', 'en-US')),
  DROP CONSTRAINT IF EXISTS prompt_cases_counters_nonnegative,
  ADD CONSTRAINT prompt_cases_counters_nonnegative
    CHECK (view_count >= 0 AND copy_count >= 0 AND generate_count >= 0);

CREATE OR REPLACE FUNCTION public.increment_prompt_case_event(
  case_id UUID,
  event_name TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF event_name = 'view' THEN
    UPDATE public.prompt_cases
    SET view_count = view_count + 1
    WHERE id = case_id AND is_published = true AND deleted_at IS NULL;
  ELSIF event_name = 'copy' THEN
    UPDATE public.prompt_cases
    SET copy_count = copy_count + 1
    WHERE id = case_id AND is_published = true AND deleted_at IS NULL;
  ELSIF event_name = 'generate' THEN
    UPDATE public.prompt_cases
    SET generate_count = generate_count + 1
    WHERE id = case_id AND is_published = true AND deleted_at IS NULL;
  ELSE
    RAISE EXCEPTION 'Unsupported prompt case event: %', event_name;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_prompt_case_event(UUID, TEXT)
  TO anon, authenticated, service_role;
