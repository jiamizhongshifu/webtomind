-- Support multiple images per curated prompt case while preserving image_url as cover.

SET search_path = public;

ALTER TABLE public.prompt_cases
  ADD COLUMN IF NOT EXISTS image_urls JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE public.prompt_cases
SET image_urls = jsonb_build_array(image_url)
WHERE image_url IS NOT NULL
  AND image_url <> ''
  AND (image_urls IS NULL OR image_urls = '[]'::jsonb);

