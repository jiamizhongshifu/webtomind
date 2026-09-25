-- Give visual moodboard items an explicit reference into the image creation
-- reference domain. media_object_id remains available for durable media
-- metadata; it must not be overloaded with image_reference_assets ids.

SET search_path = public;

ALTER TABLE public.visual_moodboard_items
  ADD COLUMN IF NOT EXISTS image_reference_id UUID
  REFERENCES public.image_reference_assets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS visual_moodboard_items_reference_idx
  ON public.visual_moodboard_items(image_reference_id)
  WHERE image_reference_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.enforce_visual_moodboard_asset_ownership()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.image_reference_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.visual_moodboards board
    JOIN public.image_reference_assets asset
      ON asset.user_id = board.user_id
    WHERE board.id = NEW.moodboard_id
      AND asset.id = NEW.image_reference_id
      AND asset.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'image reference must belong to the moodboard owner';
  END IF;

  IF NEW.media_object_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.visual_moodboards board
    JOIN public.media_objects media
      ON media.user_id = board.user_id
    WHERE board.id = NEW.moodboard_id
      AND media.id = NEW.media_object_id
      AND media.status = 'ready'
  ) THEN
    RAISE EXCEPTION 'media object must belong to the moodboard owner';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS visual_moodboard_item_asset_ownership
  ON public.visual_moodboard_items;
CREATE TRIGGER visual_moodboard_item_asset_ownership
BEFORE INSERT OR UPDATE OF moodboard_id, image_reference_id, media_object_id
ON public.visual_moodboard_items
FOR EACH ROW EXECUTE FUNCTION public.enforce_visual_moodboard_asset_ownership();

-- Materializing a previously validated source into image_reference_assets is
-- storage bookkeeping, not a visual-content change. Keep an active analysis
-- claim intact for reference-only updates while all semantic item mutations
-- continue to invalidate the analysis.
DROP TRIGGER IF EXISTS visual_moodboard_items_stale
  ON public.visual_moodboard_items;
CREATE TRIGGER visual_moodboard_items_stale
AFTER INSERT OR DELETE OR UPDATE OF
  source,
  image_url,
  title,
  prompt,
  media_object_id,
  image_generation_id,
  prompt_case_id,
  sort_order,
  is_representative,
  metadata
ON public.visual_moodboard_items
FOR EACH ROW EXECUTE FUNCTION public.mark_visual_moodboard_analysis_stale();
