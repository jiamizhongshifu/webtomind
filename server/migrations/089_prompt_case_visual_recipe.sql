-- Add reusable visual recipe metadata to curated prompt cases and keep
-- prompt asset slots aligned with the current visual prompt editor.

SET search_path = public;

ALTER TABLE public.prompt_assets
  DROP CONSTRAINT IF EXISTS prompt_assets_slot_check;

ALTER TABLE public.prompt_assets
  ADD CONSTRAINT prompt_assets_slot_check
  CHECK (
    slot IN (
      'character',
      'expression',
      'pose',
      'top',
      'bottom',
      'shoes',
      'background',
      'style',
      'lighting',
      'visualEffect',
      'layoutDesign',
      'accessory',
      'prop',
      'lens',
      'shot',
      'makeup'
    )
  );

ALTER TABLE public.prompt_cases
  ADD COLUMN IF NOT EXISTS visual_recipe JSONB;

UPDATE public.prompt_cases
SET visual_recipe = '{}'::jsonb
WHERE visual_recipe IS NULL;

ALTER TABLE public.prompt_cases
  ALTER COLUMN visual_recipe SET DEFAULT '{}'::jsonb,
  ALTER COLUMN visual_recipe SET NOT NULL;
