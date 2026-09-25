-- Give dresses and jumpsuits a single-garment whole-body axis instead of
-- misclassifying them as tops or coordinated two-piece outfits.

SET search_path = public;

ALTER TABLE public.prompt_assets
  DROP CONSTRAINT IF EXISTS prompt_assets_slot_check;

ALTER TABLE public.prompt_assets
  ADD CONSTRAINT prompt_assets_slot_check
  CHECK (
    slot IN (
      'character', 'expression', 'pose', 'top', 'bottom', 'outfit',
      'onePiece', 'shoes', 'background', 'productSubject', 'productSurface',
      'composition', 'titleArea', 'style', 'lighting', 'visualEffect',
      'layoutDesign', 'accessory', 'prop', 'lens', 'shot', 'viewpoint', 'makeup'
    )
  );

ALTER TABLE public.prompt_asset_production_batches
  DROP CONSTRAINT IF EXISTS prompt_asset_production_batches_slot_check;

ALTER TABLE public.prompt_asset_production_batches
  ADD CONSTRAINT prompt_asset_production_batches_slot_check
  CHECK (
    slot IN (
      'character', 'expression', 'pose', 'top', 'bottom', 'outfit',
      'onePiece', 'shoes', 'background', 'productSubject', 'productSurface',
      'composition', 'titleArea', 'style', 'lighting', 'visualEffect',
      'layoutDesign', 'accessory', 'prop', 'lens', 'shot', 'viewpoint', 'makeup',
      'mixed'
    )
  );
