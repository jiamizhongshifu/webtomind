-- Allow prompt asset production workers to claim queued batches safely.

SET search_path = public;

ALTER TABLE public.prompt_asset_production_batches
  DROP CONSTRAINT IF EXISTS prompt_asset_production_batches_status_check;

ALTER TABLE public.prompt_asset_production_batches
  ADD CONSTRAINT prompt_asset_production_batches_status_check
  CHECK (
    status IN (
      'draft',
      'approved',
      'queued',
      'running',
      'generated',
      'cropped',
      'synced',
      'applied',
      'failed',
      'cancelled'
    )
  );
