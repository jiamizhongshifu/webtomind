-- Track prompt case translation pairs so SEO hreflang points only to real equivalents.

SET search_path = public;

ALTER TABLE public.prompt_cases
  ADD COLUMN IF NOT EXISTS source_case_id UUID REFERENCES public.prompt_cases(id) ON DELETE SET NULL;

UPDATE public.prompt_cases translated
SET source_case_id = source.id
FROM public.prompt_cases source
WHERE translated.locale = 'en-US'
  AND translated.source_case_id IS NULL
  AND translated.slug = (
    'en-case-' || lower(left(regexp_replace(source.id::text, '[^a-zA-Z0-9]', '', 'g'), 12))
  )
  AND source.locale = 'zh-CN'
  AND source.id <> translated.id;

CREATE INDEX IF NOT EXISTS idx_prompt_cases_source_case_id
  ON public.prompt_cases (source_case_id)
  WHERE source_case_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_prompt_cases_source_locale_unique
  ON public.prompt_cases (source_case_id, locale)
  WHERE source_case_id IS NOT NULL AND deleted_at IS NULL;
