-- Visual image prompt asset library
-- Public read model for /api/content/prompt-assets and operator-managed seed data.

SET search_path = public;

CREATE TABLE IF NOT EXISTS public.prompt_assets (
  id TEXT PRIMARY KEY,
  slot TEXT NOT NULL CHECK (
    slot IN (
      'character',
      'pose',
      'top',
      'bottom',
      'shoes',
      'background',
      'style',
      'lighting'
    )
  ),
  title TEXT NOT NULL,
  subtitle TEXT NOT NULL DEFAULT '',
  prompt TEXT NOT NULL,
  negative_prompt TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}'::text[],
  thumbnail_url TEXT NOT NULL,
  source_batch_id TEXT,
  provider TEXT NOT NULL DEFAULT 'operator',
  visual JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_published BOOLEAN NOT NULL DEFAULT true,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prompt_assets_public_slot_order
  ON public.prompt_assets (slot, is_published, sort_order ASC, published_at DESC);

CREATE INDEX IF NOT EXISTS idx_prompt_assets_tags
  ON public.prompt_assets USING GIN (tags);

ALTER TABLE public.prompt_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "prompt_assets_public_read" ON public.prompt_assets;
CREATE POLICY "prompt_assets_public_read"
ON public.prompt_assets
FOR SELECT
TO anon, authenticated
USING (is_published = true AND published_at <= now());

DROP POLICY IF EXISTS "prompt_assets_service_role_all" ON public.prompt_assets;
CREATE POLICY "prompt_assets_service_role_all"
ON public.prompt_assets
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.set_prompt_assets_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prompt_assets_updated_at ON public.prompt_assets;
CREATE TRIGGER trg_prompt_assets_updated_at
BEFORE UPDATE ON public.prompt_assets
FOR EACH ROW EXECUTE FUNCTION public.set_prompt_assets_updated_at();
