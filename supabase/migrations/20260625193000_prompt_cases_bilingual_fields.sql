-- Store bilingual prompt case copy on one canonical case row.

SET search_path = public;

ALTER TABLE public.prompt_cases
  ADD COLUMN IF NOT EXISTS title_zh TEXT,
  ADD COLUMN IF NOT EXISTS title_en TEXT,
  ADD COLUMN IF NOT EXISTS prompt_zh TEXT,
  ADD COLUMN IF NOT EXISTS prompt_en TEXT,
  ADD COLUMN IF NOT EXISTS prompt_preview_zh TEXT,
  ADD COLUMN IF NOT EXISTS prompt_preview_en TEXT;

UPDATE public.prompt_cases
SET
  title_zh = COALESCE(NULLIF(title_zh, ''), NULLIF(title, '')),
  prompt_zh = COALESCE(NULLIF(prompt_zh, ''), NULLIF(prompt, '')),
  prompt_preview_zh = COALESCE(NULLIF(prompt_preview_zh, ''), NULLIF(prompt_preview, ''))
WHERE locale = 'zh-CN'
  AND deleted_at IS NULL;

UPDATE public.prompt_cases
SET
  title_en = COALESCE(NULLIF(title_en, ''), NULLIF(title, '')),
  prompt_en = COALESCE(NULLIF(prompt_en, ''), NULLIF(prompt, '')),
  prompt_preview_en = COALESCE(NULLIF(prompt_preview_en, ''), NULLIF(prompt_preview, ''))
WHERE locale = 'en-US'
  AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_prompt_cases_bilingual_locale_lookup
  ON public.prompt_cases (locale, is_published, deleted_at, created_at DESC);
