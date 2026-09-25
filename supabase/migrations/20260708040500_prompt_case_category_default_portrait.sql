-- Keep featured status as an explicit boolean, not the default content category.

SET search_path = public;

ALTER TABLE IF EXISTS public.prompt_cases
  ALTER COLUMN category SET DEFAULT 'portrait';

ALTER TABLE IF EXISTS public.prompt_case_drafts
  ALTER COLUMN category SET DEFAULT 'portrait';
