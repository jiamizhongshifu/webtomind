ALTER TABLE public.summaries
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_summaries_metadata_generation_id
  ON public.summaries ((metadata->>'generationId'))
  WHERE metadata ? 'generationId';
