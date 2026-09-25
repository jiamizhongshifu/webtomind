-- Generated image records for the visual image creator.

SET search_path = public;

CREATE TABLE IF NOT EXISTS public.image_generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  prompt TEXT NOT NULL,
  negative_prompt TEXT,
  model_label TEXT NOT NULL DEFAULT '',
  provider TEXT NOT NULL DEFAULT '',
  provider_model TEXT NOT NULL DEFAULT '',
  aspect_ratio TEXT NOT NULL DEFAULT '',
  quality TEXT NOT NULL DEFAULT '',
  asset_ids TEXT[] NOT NULL DEFAULT '{}'::text[],
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_image_generations_user_created
  ON public.image_generations (user_id, created_at DESC);

ALTER TABLE public.image_generations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "image_generations_owner_read" ON public.image_generations;
CREATE POLICY "image_generations_owner_read"
ON public.image_generations
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "image_generations_owner_insert" ON public.image_generations;
CREATE POLICY "image_generations_owner_insert"
ON public.image_generations
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "image_generations_service_role_all" ON public.image_generations;
CREATE POLICY "image_generations_service_role_all"
ON public.image_generations
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
