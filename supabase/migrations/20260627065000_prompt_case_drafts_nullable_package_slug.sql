-- Prompt case drafts are review inbox items, not package-owned records.

SET search_path = public;

ALTER TABLE public.prompt_case_drafts
  ALTER COLUMN package_slug DROP NOT NULL;

UPDATE public.prompt_case_drafts
SET package_slug = NULL
WHERE package_slug IS NOT NULL;
