-- Bounded maintenance: preserve row ownership and trigger behavior.
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

ALTER FUNCTION public.touch_create_workspace_v2_updated_at() SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.enforce_visual_moodboard_asset_ownership() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_visual_moodboard_cover_item() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_visual_moodboard_item_limit() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_visual_moodboard_analysis_stale() FROM PUBLIC, anon, authenticated;

-- Cache the per-request identity without changing which rows a user can read.
ALTER POLICY image_generation_tasks_owner_read ON public.image_generation_tasks
  USING ((SELECT auth.uid()) = user_id);
ALTER POLICY video_generation_tasks_owner_select ON public.video_generation_tasks
  USING (user_id = (SELECT auth.uid()));

-- Existing session_created index already covers image_creation_turns.session_id.
CREATE INDEX IF NOT EXISTS image_generation_tasks_generation_id_idx
  ON public.image_generation_tasks (generation_id);
CREATE INDEX IF NOT EXISTS image_creation_turns_user_id_idx
  ON public.image_creation_turns (user_id);
CREATE INDEX IF NOT EXISTS user_subscriptions_plan_id_idx
  ON public.user_subscriptions (plan_id);
