SET search_path = public;

CREATE TABLE IF NOT EXISTS public.image_creator_recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  recipe_type TEXT NOT NULL DEFAULT 'character_scene_pack',
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  selection JSONB NOT NULL DEFAULT '{}'::jsonb,
  character_card_ids UUID[] NOT NULL DEFAULT '{}'::uuid[],
  character_reference_groups JSONB NOT NULL DEFAULT '[]'::jsonb,
  scenes JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT image_creator_recipes_name_check
    CHECK (char_length(trim(name)) BETWEEN 1 AND 100),
  CONSTRAINT image_creator_recipes_type_check
    CHECK (recipe_type IN ('character_scene_pack')),
  CONSTRAINT image_creator_recipes_groups_check
    CHECK (jsonb_typeof(character_reference_groups) = 'array'),
  CONSTRAINT image_creator_recipes_scenes_check
    CHECK (jsonb_typeof(scenes) = 'array')
);

CREATE INDEX IF NOT EXISTS image_creator_recipes_user_updated_idx
  ON public.image_creator_recipes (user_id, updated_at DESC)
  WHERE deleted_at IS NULL;

ALTER TABLE public.image_creator_recipes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "image_creator_recipes_owner_select"
  ON public.image_creator_recipes;
CREATE POLICY "image_creator_recipes_owner_select"
ON public.image_creator_recipes
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "image_creator_recipes_owner_insert"
  ON public.image_creator_recipes;
CREATE POLICY "image_creator_recipes_owner_insert"
ON public.image_creator_recipes
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "image_creator_recipes_owner_update"
  ON public.image_creator_recipes;
CREATE POLICY "image_creator_recipes_owner_update"
ON public.image_creator_recipes
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "image_creator_recipes_owner_delete"
  ON public.image_creator_recipes;
CREATE POLICY "image_creator_recipes_owner_delete"
ON public.image_creator_recipes
FOR DELETE
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "image_creator_recipes_service_role_all"
  ON public.image_creator_recipes;
CREATE POLICY "image_creator_recipes_service_role_all"
ON public.image_creator_recipes
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.set_image_creator_recipes_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_image_creator_recipes_updated_at
  ON public.image_creator_recipes;
CREATE TRIGGER trg_image_creator_recipes_updated_at
BEFORE UPDATE ON public.image_creator_recipes
FOR EACH ROW EXECUTE FUNCTION public.set_image_creator_recipes_updated_at();
