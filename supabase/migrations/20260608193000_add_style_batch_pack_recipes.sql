SET search_path = public;

ALTER TABLE public.image_creator_recipes
  DROP CONSTRAINT IF EXISTS image_creator_recipes_type_check;

ALTER TABLE public.image_creator_recipes
  ADD CONSTRAINT image_creator_recipes_type_check
  CHECK (recipe_type IN ('character_scene_pack', 'style_batch_pack'));
