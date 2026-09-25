SET search_path = public;

CREATE TABLE IF NOT EXISTS public.image_reference_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  storage_bucket TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size_bytes INTEGER,
  width INTEGER,
  height INTEGER,
  role TEXT NOT NULL DEFAULT 'character',
  label TEXT,
  description TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT image_reference_assets_role_check
    CHECK (role IN ('character', 'style', 'pose', 'scene', 'product'))
);

CREATE INDEX IF NOT EXISTS image_reference_assets_user_created_idx
  ON public.image_reference_assets (user_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS image_reference_assets_user_role_idx
  ON public.image_reference_assets (user_id, role, created_at DESC)
  WHERE deleted_at IS NULL;

ALTER TABLE public.image_reference_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "image_reference_assets_owner_select"
  ON public.image_reference_assets;
CREATE POLICY "image_reference_assets_owner_select"
ON public.image_reference_assets
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "image_reference_assets_owner_insert"
  ON public.image_reference_assets;
CREATE POLICY "image_reference_assets_owner_insert"
ON public.image_reference_assets
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "image_reference_assets_owner_update"
  ON public.image_reference_assets;
CREATE POLICY "image_reference_assets_owner_update"
ON public.image_reference_assets
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "image_reference_assets_owner_delete"
  ON public.image_reference_assets;
CREATE POLICY "image_reference_assets_owner_delete"
ON public.image_reference_assets
FOR DELETE
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "image_reference_assets_service_role_all"
  ON public.image_reference_assets;
CREATE POLICY "image_reference_assets_service_role_all"
ON public.image_reference_assets
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.set_image_reference_assets_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_image_reference_assets_updated_at
  ON public.image_reference_assets;
CREATE TRIGGER trg_image_reference_assets_updated_at
BEFORE UPDATE ON public.image_reference_assets
FOR EACH ROW EXECUTE FUNCTION public.set_image_reference_assets_updated_at();
