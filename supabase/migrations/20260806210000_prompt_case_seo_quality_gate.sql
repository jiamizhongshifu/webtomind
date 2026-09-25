-- Editorial SEO quality state for public image and video prompt cases.
-- New cases remain draft until an administrator verifies source and media.

SET search_path = public;

ALTER TABLE public.prompt_cases
  ADD COLUMN IF NOT EXISTS seo_status TEXT NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS seo_reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS seo_evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS video_duration_seconds INTEGER,
  ADD COLUMN IF NOT EXISTS video_upload_date TIMESTAMPTZ;

ALTER TABLE public.prompt_cases
  DROP CONSTRAINT IF EXISTS prompt_cases_seo_status_check,
  ADD CONSTRAINT prompt_cases_seo_status_check
    CHECK (seo_status IN ('draft', 'review', 'indexable', 'retired')),
  DROP CONSTRAINT IF EXISTS prompt_cases_video_duration_check,
  ADD CONSTRAINT prompt_cases_video_duration_check
    CHECK (
      video_duration_seconds IS NULL
      OR video_duration_seconds > 0
    );

CREATE INDEX IF NOT EXISTS idx_prompt_cases_public_seo_status
  ON public.prompt_cases (seo_status, locale, created_at DESC)
  WHERE is_published = true
    AND deleted_at IS NULL;

UPDATE public.prompt_cases
SET
  seo_status = 'review',
  video_upload_date = CASE
    WHEN media_type = 'video' AND video_upload_date IS NULL
      THEN created_at
    ELSE video_upload_date
  END
WHERE is_published = true
  AND deleted_at IS NULL
  AND seo_status = 'draft';

-- Preserve only already-public image cases that satisfy the objective legacy
-- evidence checks. Video cases stay in review until duration is verified.
UPDATE public.prompt_cases
SET
  seo_status = 'indexable',
  seo_reviewed_at = COALESCE(seo_reviewed_at, now()),
  seo_evidence = COALESCE(seo_evidence, '{}'::jsonb) || jsonb_build_object(
    'source_verified', true,
    'media_verified', true,
    'legacy_backfill', true,
    'review_version', '2026-08-seo-quality-v1'
  )
WHERE is_published = true
  AND deleted_at IS NULL
  AND COALESCE(members_only, false) = false
  AND COALESCE(media_type, 'image') = 'image'
  AND NULLIF(BTRIM(COALESCE(slug, '')), '') IS NOT NULL
  AND NULLIF(BTRIM(COALESCE(title_zh, title, title_en, '')), '') IS NOT NULL
  AND NULLIF(BTRIM(COALESCE(prompt_zh, prompt, prompt_en, '')), '') IS NOT NULL
  AND NULLIF(BTRIM(COALESCE(
    commercial_intent,
    prompt_preview_zh,
    prompt_preview,
    prompt_preview_en,
    ''
  )), '') IS NOT NULL
  AND NULLIF(BTRIM(COALESCE(model, '')), '') IS NOT NULL
  AND NULLIF(BTRIM(COALESCE(image_url, '')), '') ~ '^https?://'
  AND COALESCE(image_url, '') !~* '/object/sign/'
  AND COALESCE(image_url, '') !~* '([?&](token|signature|expires|x-amz-signature|x-amz-expires)=)'
  AND (
    NULLIF(BTRIM(COALESCE(author_url, '')), '') IS NOT NULL
    OR source_draft_id IS NOT NULL
    OR NULLIF(BTRIM(COALESCE(created_by_email, '')), '') IS NOT NULL
  );

COMMENT ON COLUMN public.prompt_cases.seo_status IS
  'Editorial search visibility state. Only indexable cases may enter SEO snapshots and sitemaps.';
COMMENT ON COLUMN public.prompt_cases.seo_evidence IS
  'Non-sensitive verification flags such as source_verified, media_verified, and generation_verified.';

CREATE OR REPLACE FUNCTION public.validate_prompt_case_seo_indexable()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.seo_status <> 'indexable' THEN
    RETURN NEW;
  END IF;

  IF NEW.is_published IS DISTINCT FROM true
    OR NEW.deleted_at IS NOT NULL
    OR COALESCE(NEW.members_only, false)
    OR NULLIF(BTRIM(COALESCE(NEW.slug, '')), '') IS NULL
    OR NULLIF(BTRIM(COALESCE(NEW.title_zh, NEW.title, NEW.title_en, '')), '') IS NULL
    OR NULLIF(BTRIM(COALESCE(NEW.prompt_zh, NEW.prompt, NEW.prompt_en, '')), '') IS NULL
    OR NULLIF(BTRIM(COALESCE(
      NEW.commercial_intent,
      NEW.prompt_preview_zh,
      NEW.prompt_preview,
      NEW.prompt_preview_en,
      ''
    )), '') IS NULL
    OR NULLIF(BTRIM(COALESCE(NEW.model, '')), '') IS NULL
    OR NEW.seo_reviewed_at IS NULL
    OR LOWER(COALESCE(NEW.seo_evidence->>'source_verified', '')) <> 'true'
    OR LOWER(COALESCE(NEW.seo_evidence->>'media_verified', '')) <> 'true'
  THEN
    RAISE EXCEPTION 'prompt case does not satisfy the SEO indexable quality gate';
  END IF;

  IF COALESCE(NEW.media_type, 'image') = 'video' THEN
    IF NULLIF(BTRIM(COALESCE(NEW.image_url, '')), '') IS NULL
      OR NULLIF(BTRIM(COALESCE(NEW.video_url, '')), '') IS NULL
      OR NEW.video_duration_seconds IS NULL
      OR NEW.video_upload_date IS NULL
    THEN
      RAISE EXCEPTION 'video prompt case is missing poster, video, duration, or upload date';
    END IF;
  ELSIF NULLIF(BTRIM(COALESCE(NEW.image_url, '')), '') IS NULL THEN
    RAISE EXCEPTION 'image prompt case is missing its public image';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prompt_cases_validate_seo_indexable
  ON public.prompt_cases;
CREATE TRIGGER trg_prompt_cases_validate_seo_indexable
BEFORE INSERT OR UPDATE OF
  seo_status,
  is_published,
  deleted_at,
  members_only,
  slug,
  title,
  title_zh,
  title_en,
  prompt,
  prompt_zh,
  prompt_en,
  prompt_preview,
  prompt_preview_zh,
  prompt_preview_en,
  commercial_intent,
  model,
  image_url,
  video_url,
  video_duration_seconds,
  video_upload_date,
  seo_reviewed_at,
  seo_evidence
ON public.prompt_cases
FOR EACH ROW
EXECUTE FUNCTION public.validate_prompt_case_seo_indexable();
