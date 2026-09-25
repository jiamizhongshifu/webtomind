-- Allow 'video' as an explicit prompt case category so imported and published
-- video cases are no longer mislabeled as portrait/featured/poster.

SET search_path = public;

ALTER TABLE public.prompt_cases
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
      'video',
      'featured'
    ));

ALTER TABLE public.prompt_case_drafts
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
      'video',
      'featured'
    ));
