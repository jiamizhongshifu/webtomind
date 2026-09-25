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
