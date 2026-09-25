-- Admin-reviewed prompt asset production batches.

SET search_path = public;

CREATE TABLE IF NOT EXISTS public.prompt_asset_production_batches (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'draft',
  slot TEXT NOT NULL,
  grid JSONB NOT NULL DEFAULT '{}'::jsonb,
  size TEXT NOT NULL DEFAULT '2048x2048',
  output_size INTEGER NOT NULL DEFAULT 768,
  prompt TEXT NOT NULL,
  assets JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes TEXT[] NOT NULL DEFAULT '{}',
  case_ids UUID[] NOT NULL DEFAULT '{}',
  analysis_result JSONB NOT NULL DEFAULT '{}'::jsonb,
  result JSONB NOT NULL DEFAULT '{}'::jsonb,
  run_command TEXT,
  created_by_email TEXT,
  updated_by_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.prompt_asset_production_batches
  DROP CONSTRAINT IF EXISTS prompt_asset_production_batches_status_check,
  ADD CONSTRAINT prompt_asset_production_batches_status_check
    CHECK (status IN (
      'draft',
      'approved',
      'queued',
      'generated',
      'cropped',
      'synced',
      'applied',
      'failed',
      'cancelled'
    )),
  DROP CONSTRAINT IF EXISTS prompt_asset_production_batches_slot_check,
  ADD CONSTRAINT prompt_asset_production_batches_slot_check
    CHECK (slot IN (
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
      'makeup',
      'mixed'
    )),
  DROP CONSTRAINT IF EXISTS prompt_asset_production_batches_assets_array_check,
  ADD CONSTRAINT prompt_asset_production_batches_assets_array_check
    CHECK (jsonb_typeof(assets) = 'array'),
  DROP CONSTRAINT IF EXISTS prompt_asset_production_batches_grid_object_check,
  ADD CONSTRAINT prompt_asset_production_batches_grid_object_check
    CHECK (jsonb_typeof(grid) = 'object');

CREATE INDEX IF NOT EXISTS idx_prompt_asset_production_batches_status_created
  ON public.prompt_asset_production_batches (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_prompt_asset_production_batches_case_ids
  ON public.prompt_asset_production_batches USING gin (case_ids);

ALTER TABLE public.prompt_asset_production_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "prompt_asset_production_batches_service_role_all"
  ON public.prompt_asset_production_batches;
CREATE POLICY "prompt_asset_production_batches_service_role_all"
ON public.prompt_asset_production_batches
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.set_prompt_asset_production_batches_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prompt_asset_production_batches_updated_at
  ON public.prompt_asset_production_batches;
CREATE TRIGGER trg_prompt_asset_production_batches_updated_at
BEFORE UPDATE ON public.prompt_asset_production_batches
FOR EACH ROW EXECUTE FUNCTION public.set_prompt_asset_production_batches_updated_at();
