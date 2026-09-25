\set ON_ERROR_STOP on

BEGIN;

ALTER TABLE public.visual_moodboards
  DROP CONSTRAINT IF EXISTS visual_moodboards_cover_item_id_fkey;

DROP TABLE public.image_creation_turns;
DROP TABLE public.image_creation_sessions;
DROP TABLE public.visual_moodboard_shares;
DROP TABLE public.visual_moodboard_items;
DROP TABLE public.visual_moodboards;

DROP FUNCTION public.enforce_visual_moodboard_cover_item();
DROP FUNCTION public.enforce_visual_moodboard_item_limit();
DROP FUNCTION public.mark_visual_moodboard_analysis_stale();
DROP FUNCTION public.touch_create_workspace_v2_updated_at();
DROP FUNCTION public.enforce_visual_moodboard_asset_ownership();

DO $$
BEGIN
  IF to_regclass('public.visual_moodboards') IS NOT NULL OR
     to_regclass('public.visual_moodboard_items') IS NOT NULL OR
     to_regclass('public.visual_moodboard_shares') IS NOT NULL OR
     to_regclass('public.image_creation_sessions') IS NOT NULL OR
     to_regclass('public.image_creation_turns') IS NOT NULL THEN
    RAISE EXCEPTION 'rollback rehearsal left create workspace v2 tables behind';
  END IF;
END;
$$;

ROLLBACK;

DO $$
BEGIN
  IF to_regclass('public.visual_moodboards') IS NULL OR
     to_regclass('public.visual_moodboard_items') IS NULL OR
     to_regclass('public.visual_moodboard_shares') IS NULL OR
     to_regclass('public.image_creation_sessions') IS NULL OR
     to_regclass('public.image_creation_turns') IS NULL THEN
    RAISE EXCEPTION 'rollback rehearsal did not restore the original transaction';
  END IF;
END;
$$;

SELECT 'create_workspace_v2_rollback_ok' AS result;
