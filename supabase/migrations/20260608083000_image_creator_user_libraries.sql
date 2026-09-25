SET search_path = public;

CREATE TABLE IF NOT EXISTS public.image_creator_user_libraries (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  presets JSONB NOT NULL DEFAULT '[]'::jsonb,
  prompt_library JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT image_creator_user_libraries_presets_is_array CHECK (
    jsonb_typeof(presets) = 'array'
  ),
  CONSTRAINT image_creator_user_libraries_prompt_library_is_array CHECK (
    jsonb_typeof(prompt_library) = 'array'
  )
);

ALTER TABLE public.image_creator_user_libraries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "image_creator_user_libraries_owner_select"
  ON public.image_creator_user_libraries;
CREATE POLICY "image_creator_user_libraries_owner_select"
  ON public.image_creator_user_libraries
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "image_creator_user_libraries_owner_insert"
  ON public.image_creator_user_libraries;
CREATE POLICY "image_creator_user_libraries_owner_insert"
  ON public.image_creator_user_libraries
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "image_creator_user_libraries_owner_update"
  ON public.image_creator_user_libraries;
CREATE POLICY "image_creator_user_libraries_owner_update"
  ON public.image_creator_user_libraries
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "image_creator_user_libraries_owner_delete"
  ON public.image_creator_user_libraries;
CREATE POLICY "image_creator_user_libraries_owner_delete"
  ON public.image_creator_user_libraries
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "image_creator_user_libraries_service_role_all"
  ON public.image_creator_user_libraries;
CREATE POLICY "image_creator_user_libraries_service_role_all"
  ON public.image_creator_user_libraries
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.set_image_creator_user_libraries_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_image_creator_user_libraries_updated_at
  ON public.image_creator_user_libraries;
CREATE TRIGGER trg_image_creator_user_libraries_updated_at
  BEFORE UPDATE ON public.image_creator_user_libraries
  FOR EACH ROW
  EXECUTE FUNCTION public.set_image_creator_user_libraries_updated_at();
