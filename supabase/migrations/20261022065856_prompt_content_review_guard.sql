-- Keep content edits and exact same-language duplicates out of the search
-- index until reviewed. Existing cases are not rewritten by this migration.
SET search_path = public;

-- Match String.trim() used by the page renderer, including Unicode whitespace.
-- Normalize candidates before choosing the locale fallback: a whitespace-only
-- localized field must not hide the base prompt from duplicate detection.
CREATE OR REPLACE FUNCTION public.prompt_case_normalized_content(value text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = public
AS $$
  SELECT NULLIF(btrim(regexp_replace(value,
    U&'[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+',
    ' ', 'g')), '');
$$;

CREATE OR REPLACE FUNCTION public.prompt_case_content_fingerprint(
  case_locale text, base_prompt text, zh_prompt text, en_prompt text
) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = public
AS $$
  SELECT encode(sha256(convert_to(
    CASE WHEN case_locale = 'en-US' THEN
      COALESCE(public.prompt_case_normalized_content(en_prompt),
        public.prompt_case_normalized_content(base_prompt),
        public.prompt_case_normalized_content(zh_prompt), '')
    ELSE
      COALESCE(public.prompt_case_normalized_content(zh_prompt),
        public.prompt_case_normalized_content(base_prompt),
        public.prompt_case_normalized_content(en_prompt), '')
    END, 'UTF8')), 'hex');
$$;

-- A unique claim serializes concurrent publications even at repeatable-read
-- isolation. An advisory lock plus a SELECT alone would not be sufficient.
CREATE TABLE public.prompt_case_content_claims (
  locale text NOT NULL,
  fingerprint text NOT NULL,
  case_id uuid NOT NULL UNIQUE REFERENCES public.prompt_cases(id)
    ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  PRIMARY KEY (locale, fingerprint)
);
ALTER TABLE public.prompt_case_content_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.prompt_case_content_claims FROM PUBLIC, anon, authenticated;

CREATE INDEX idx_prompt_cases_indexable_content_fingerprint
ON public.prompt_cases (
  locale,
  public.prompt_case_content_fingerprint(locale, prompt, prompt_zh, prompt_en)
)
WHERE seo_status = 'indexable' AND is_published = true
  AND deleted_at IS NULL AND COALESCE(members_only, false) = false;

-- Reserve each existing fingerprint once, without silently demoting existing
-- duplicates. The separately reviewed repair plan handles those records.
INSERT INTO public.prompt_case_content_claims (locale, fingerprint, case_id)
SELECT DISTINCT ON (locale, fingerprint) locale, fingerprint, id
FROM (
  SELECT id, locale,
    public.prompt_case_content_fingerprint(locale, prompt, prompt_zh, prompt_en) AS fingerprint
  FROM public.prompt_cases
  WHERE seo_status = 'indexable' AND is_published = true
    AND deleted_at IS NULL AND COALESCE(members_only, false) = false
) eligible
ORDER BY locale, fingerprint, id;

CREATE OR REPLACE FUNCTION public.guard_prompt_case_content_review()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  content_changed boolean := false;
  requires_review boolean;
  fresh_review boolean;
  old_reviewed_at timestamptz;
  content_fields text[] := ARRAY[
    'locale', 'slug', 'title', 'title_zh', 'title_en',
    'prompt', 'prompt_zh', 'prompt_en', 'prompt_preview',
    'prompt_preview_zh', 'prompt_preview_en', 'commercial_intent',
    'model', 'category', 'tags', 'image_url', 'image_urls',
    'media_type', 'video_url', 'video_urls', 'video_duration_seconds',
    'video_upload_date', 'author_url', 'source_case_id', 'source_draft_id'
  ];
  old_content jsonb;
  new_content jsonb;
  other_case uuid;
  content_fingerprint text;
  review_reason text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    SELECT jsonb_object_agg(key, value) INTO old_content
      FROM jsonb_each(to_jsonb(OLD)) WHERE key = ANY(content_fields);
    SELECT jsonb_object_agg(key, value) INTO new_content
      FROM jsonb_each(to_jsonb(NEW)) WHERE key = ANY(content_fields);
    content_changed := old_content IS DISTINCT FROM new_content;
    old_reviewed_at := OLD.seo_reviewed_at;

    -- No-op writes must not demote legacy duplicates or revoke their claims.
    -- Counter/updated_at changes do not enter this trigger in the first place.
    IF NOT content_changed
      AND NEW.seo_status IS NOT DISTINCT FROM OLD.seo_status
      AND NEW.seo_reviewed_at IS NOT DISTINCT FROM OLD.seo_reviewed_at
      AND NEW.seo_evidence IS NOT DISTINCT FROM OLD.seo_evidence
      AND NEW.is_published IS NOT DISTINCT FROM OLD.is_published
      AND NEW.deleted_at IS NOT DISTINCT FROM OLD.deleted_at
      AND NEW.members_only IS NOT DISTINCT FROM OLD.members_only
    THEN
      RETURN NEW;
    END IF;
  END IF;

  requires_review := TG_OP = 'INSERT' OR content_changed
    OR COALESCE(OLD.seo_status, '') <> 'indexable'
    OR OLD.is_published IS DISTINCT FROM true OR OLD.deleted_at IS NOT NULL
    OR COALESCE(OLD.members_only, false)
    OR COALESCE((NEW.seo_evidence->>'content_review_required') = 'true', false);
  fresh_review := NEW.seo_reviewed_at IS NOT NULL
    AND NEW.seo_reviewed_at > COALESCE(old_reviewed_at, '-infinity'::timestamptz)
    AND COALESCE((NEW.seo_evidence->>'content_verified') = 'true', false);

  IF NEW.seo_status = 'indexable' AND requires_review AND NOT fresh_review THEN
    review_reason := 'unreviewed-content';
  END IF;

  IF review_reason IS NULL AND NEW.seo_status = 'indexable'
    AND NEW.is_published = true AND NEW.deleted_at IS NULL
    AND COALESCE(NEW.members_only, false) = false
  THEN
    content_fingerprint := public.prompt_case_content_fingerprint(
      NEW.locale, NEW.prompt, NEW.prompt_zh, NEW.prompt_en
    );
    -- Read-only here: a BEFORE INSERT may be discarded by ON CONFLICT.
    -- Claims are written only after an actual row has been stored.
    -- Covers legacy duplicate members when their original claim owner has
    -- since been retired/deleted. Never compare Chinese to English siblings.
    SELECT id INTO other_case FROM public.prompt_cases
      WHERE id <> NEW.id AND locale = NEW.locale
        AND seo_status = 'indexable' AND is_published = true
        AND deleted_at IS NULL AND COALESCE(members_only, false) = false
        AND public.prompt_case_content_fingerprint(locale, prompt, prompt_zh, prompt_en)
          = content_fingerprint
      LIMIT 1;
    IF other_case IS NOT NULL THEN
      review_reason := 'duplicate-prompt';
    END IF;
  END IF;

  IF review_reason IS NOT NULL THEN
    NEW.seo_status := 'review';
    NEW.seo_reviewed_at := NULL;
    NEW.seo_evidence := (COALESCE(NEW.seo_evidence, '{}'::jsonb) - 'content_verified')
      || jsonb_build_object('content_review_required', true,
        'content_review_reason', review_reason);
  ELSIF NEW.seo_status = 'indexable' AND fresh_review THEN
    NEW.seo_evidence := COALESCE(NEW.seo_evidence, '{}'::jsonb)
      - 'content_review_required' - 'content_review_reason';
  ELSIF content_changed THEN
    -- Editing a draft/review case invalidates an older approval too.
    NEW.seo_reviewed_at := NULL;
    NEW.seo_evidence := (COALESCE(NEW.seo_evidence, '{}'::jsonb) - 'content_verified')
      || jsonb_build_object('content_review_required', true,
        'content_review_reason', 'unreviewed-content');
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_prompt_case_content_review() FROM PUBLIC;

-- Alphabetical BEFORE trigger order runs this before the existing validator.
CREATE TRIGGER trg_prompt_cases_content_review
BEFORE INSERT OR UPDATE OF
  seo_status, seo_reviewed_at, seo_evidence, is_published, deleted_at, members_only,
  locale, slug, title, title_zh, title_en, prompt, prompt_zh, prompt_en,
  prompt_preview, prompt_preview_zh, prompt_preview_en, commercial_intent,
  model, category, tags, image_url, image_urls, media_type, video_url, video_urls,
  video_duration_seconds, video_upload_date, author_url, source_case_id, source_draft_id
ON public.prompt_cases FOR EACH ROW
EXECUTE FUNCTION public.guard_prompt_case_content_review();

-- AFTER runs for the final persisted row, including the UPDATE arm of an
-- upsert. DO NOTHING / DO UPDATE WHERE false cannot mutate claims.
CREATE OR REPLACE FUNCTION public.sync_prompt_case_content_claim()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  content_fingerprint text;
  claimed_by uuid;
  other_case uuid;
BEGIN
  content_fingerprint := public.prompt_case_content_fingerprint(
    NEW.locale, NEW.prompt, NEW.prompt_zh, NEW.prompt_en
  );
  IF TG_OP = 'UPDATE'
    AND NEW.locale IS NOT DISTINCT FROM OLD.locale
    AND content_fingerprint = public.prompt_case_content_fingerprint(
      OLD.locale, OLD.prompt, OLD.prompt_zh, OLD.prompt_en)
    AND NEW.seo_status IS NOT DISTINCT FROM OLD.seo_status
    AND NEW.seo_reviewed_at IS NOT DISTINCT FROM OLD.seo_reviewed_at
    AND NEW.seo_evidence IS NOT DISTINCT FROM OLD.seo_evidence
    AND NEW.is_published IS NOT DISTINCT FROM OLD.is_published
    AND NEW.deleted_at IS NOT DISTINCT FROM OLD.deleted_at
    AND NEW.members_only IS NOT DISTINCT FROM OLD.members_only
  THEN
    RETURN NULL;
  END IF;

  DELETE FROM public.prompt_case_content_claims WHERE case_id = NEW.id;
  IF NEW.seo_status <> 'indexable' OR NEW.is_published IS DISTINCT FROM true
    OR NEW.deleted_at IS NOT NULL OR COALESCE(NEW.members_only, false)
  THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.prompt_case_content_claims (locale, fingerprint, case_id)
    VALUES (NEW.locale, content_fingerprint, NEW.id)
    ON CONFLICT (locale, fingerprint) DO NOTHING;
  SELECT case_id INTO claimed_by FROM public.prompt_case_content_claims
    WHERE locale = NEW.locale AND fingerprint = content_fingerprint FOR UPDATE;
  SELECT id INTO other_case FROM public.prompt_cases
    WHERE id <> NEW.id AND locale = NEW.locale
      AND seo_status = 'indexable' AND is_published = true
      AND deleted_at IS NULL AND COALESCE(members_only, false) = false
      AND public.prompt_case_content_fingerprint(locale, prompt, prompt_zh, prompt_en)
        = content_fingerprint
    LIMIT 1;
  IF claimed_by IS DISTINCT FROM NEW.id OR other_case IS NOT NULL THEN
    -- A concurrent publisher can win after the BEFORE check. Roll back and
    -- retry the transaction: the next BEFORE check then stores it as review.
    -- Do not UPDATE here: SQL RETURNING would expose the pre-downgrade row.
    RAISE EXCEPTION USING ERRCODE = '40001',
      MESSAGE = 'Concurrent prompt publication conflict; retry the transaction';
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_prompt_case_content_claim() FROM PUBLIC;
CREATE TRIGGER trg_prompt_cases_content_claim
AFTER INSERT OR UPDATE OF
  seo_status, seo_reviewed_at, seo_evidence, is_published, deleted_at, members_only,
  locale, slug, title, title_zh, title_en, prompt, prompt_zh, prompt_en,
  prompt_preview, prompt_preview_zh, prompt_preview_en, commercial_intent,
  model, category, tags, image_url, image_urls, media_type, video_url, video_urls,
  video_duration_seconds, video_upload_date, author_url, source_case_id, source_draft_id
ON public.prompt_cases FOR EACH ROW
EXECUTE FUNCTION public.sync_prompt_case_content_claim();

COMMENT ON TABLE public.prompt_case_content_claims IS
  'Internal concurrency guard for same-language indexable prompt content. No public access.';
