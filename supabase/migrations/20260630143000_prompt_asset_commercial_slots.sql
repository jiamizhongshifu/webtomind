-- Add commercial/non-portrait prompt asset slots for ecommerce, poster, cover,
-- and background cases.

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
      'productSubject',
      'productSurface',
      'composition',
      'titleArea',
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

ALTER TABLE public.prompt_asset_production_batches
  DROP CONSTRAINT IF EXISTS prompt_asset_production_batches_slot_check;

ALTER TABLE public.prompt_asset_production_batches
  ADD CONSTRAINT prompt_asset_production_batches_slot_check
  CHECK (
    slot IN (
      'character',
      'expression',
      'pose',
      'top',
      'bottom',
      'shoes',
      'background',
      'productSubject',
      'productSurface',
      'composition',
      'titleArea',
      'style',
      'lighting',
      'visualEffect',
      'layoutDesign',
      'accessory',
      'prop',
      'lens',
      'shot',
      'makeup',
      'mixed'
    )
  );
