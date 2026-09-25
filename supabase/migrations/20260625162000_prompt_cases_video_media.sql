-- Support video prompt cases while preserving image_url/image_urls as covers.

SET search_path = public;

ALTER TABLE public.prompt_cases
  ADD COLUMN IF NOT EXISTS media_type TEXT NOT NULL DEFAULT 'image',
  ADD COLUMN IF NOT EXISTS video_url TEXT,
  ADD COLUMN IF NOT EXISTS video_urls JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE public.prompt_cases
SET media_type = 'video'
WHERE video_url IS NOT NULL
  AND video_url <> '';

UPDATE public.prompt_cases
SET video_urls = jsonb_build_array(video_url)
WHERE video_url IS NOT NULL
  AND video_url <> ''
  AND (video_urls IS NULL OR video_urls = '[]'::jsonb);

ALTER TABLE public.prompt_cases
  DROP CONSTRAINT IF EXISTS prompt_cases_media_type_check,
  ADD CONSTRAINT prompt_cases_media_type_check
    CHECK (media_type IN ('image', 'video'));
