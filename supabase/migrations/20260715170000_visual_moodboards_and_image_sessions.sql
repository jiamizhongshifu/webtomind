-- Krea-inspired visual creation workspace. Visual moodboards remain a separate
-- bounded context from knowledge workspace_projects.

SET search_path = public;

CREATE TABLE IF NOT EXISTS public.visual_moodboards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  description TEXT,
  visibility TEXT NOT NULL DEFAULT 'private'
    CHECK (visibility IN ('private', 'unlisted', 'public')),
  is_official BOOLEAN NOT NULL DEFAULT FALSE,
  cover_item_id UUID,
  analysis_status TEXT NOT NULL DEFAULT 'idle'
    CHECK (analysis_status IN ('idle', 'analyzing', 'ready', 'stale', 'failed')),
  taste_profile TEXT NOT NULL DEFAULT '',
  keywords JSONB NOT NULL DEFAULT '[]'::jsonb,
  avoids JSONB NOT NULL DEFAULT '[]'::jsonb,
  guidelines JSONB NOT NULL DEFAULT '[]'::jsonb,
  representative_asset_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  analysis_version INTEGER NOT NULL DEFAULT 0 CHECK (analysis_version >= 0),
  analysis_error TEXT,
  analysis_started_at TIMESTAMPTZ,
  analyzed_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  moderation_status TEXT NOT NULL DEFAULT 'active'
    CHECK (moderation_status IN ('active', 'under_review', 'hidden', 'removed')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT visual_moodboards_owner_contract CHECK (
    (is_official AND user_id IS NULL) OR (NOT is_official AND user_id IS NOT NULL)
  ),
  CONSTRAINT visual_moodboards_id_user_unique UNIQUE (id, user_id)
);

CREATE TABLE IF NOT EXISTS public.visual_moodboard_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  moodboard_id UUID NOT NULL REFERENCES public.visual_moodboards(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('upload', 'gallery', 'generation', 'prompt_case', 'preset')),
  image_url TEXT NOT NULL CHECK (char_length(image_url) BETWEEN 1 AND 4096),
  title TEXT,
  prompt TEXT,
  media_object_id UUID REFERENCES public.media_objects(id) ON DELETE SET NULL,
  image_generation_id UUID,
  prompt_case_id UUID,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_representative BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.visual_moodboards
  DROP CONSTRAINT IF EXISTS visual_moodboards_cover_item_id_fkey;
ALTER TABLE public.visual_moodboards
  ADD CONSTRAINT visual_moodboards_cover_item_id_fkey
  FOREIGN KEY (cover_item_id) REFERENCES public.visual_moodboard_items(id)
  ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;

CREATE OR REPLACE FUNCTION public.enforce_visual_moodboard_cover_item()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.cover_item_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.visual_moodboard_items item
    WHERE item.id = NEW.cover_item_id
      AND item.moodboard_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'cover item must belong to the same visual moodboard';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS visual_moodboard_cover_item_contract ON public.visual_moodboards;
CREATE CONSTRAINT TRIGGER visual_moodboard_cover_item_contract
AFTER INSERT OR UPDATE OF cover_item_id ON public.visual_moodboards
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.enforce_visual_moodboard_cover_item();

CREATE TABLE IF NOT EXISTS public.visual_moodboard_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  moodboard_id UUID NOT NULL REFERENCES public.visual_moodboards(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', ''),
  revoked_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT visual_moodboard_shares_owner_fkey
    FOREIGN KEY (moodboard_id, user_id)
    REFERENCES public.visual_moodboards(id, user_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS visual_moodboards_cover_item_idx
  ON public.visual_moodboards(cover_item_id);
CREATE INDEX IF NOT EXISTS visual_moodboard_shares_board_idx
  ON public.visual_moodboard_shares(moodboard_id);
CREATE UNIQUE INDEX IF NOT EXISTS visual_moodboard_active_share_idx
  ON public.visual_moodboard_shares(moodboard_id)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS public.image_creation_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '未命名创作' CHECK (char_length(title) BETWEEN 1 AND 160),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  last_turn_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT image_creation_sessions_id_user_unique UNIQUE (id, user_id)
);

CREATE TABLE IF NOT EXISTS public.image_creation_turns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.image_creation_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL DEFAULT '',
  negative_prompt TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'partial', 'succeeded', 'failed')),
  context JSONB NOT NULL DEFAULT '{"referenceAssetIds":[]}'::jsonb,
  generation_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT image_creation_turns_session_owner_fkey
    FOREIGN KEY (session_id, user_id)
    REFERENCES public.image_creation_sessions(id, user_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS visual_moodboards_owner_updated_idx
  ON public.visual_moodboards(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS visual_moodboards_discovery_idx
  ON public.visual_moodboards(visibility, moderation_status, published_at DESC)
  WHERE visibility = 'public' AND moderation_status = 'active';
CREATE INDEX IF NOT EXISTS visual_moodboard_items_board_sort_idx
  ON public.visual_moodboard_items(moodboard_id, sort_order, created_at);
CREATE INDEX IF NOT EXISTS image_creation_sessions_owner_updated_idx
  ON public.image_creation_sessions(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS image_creation_turns_session_created_idx
  ON public.image_creation_turns(session_id, created_at);

CREATE OR REPLACE FUNCTION public.enforce_visual_moodboard_item_limit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Serialize inserts for one moodboard so concurrent requests cannot both
  -- observe 23 items and commit a 25th row.
  PERFORM pg_advisory_xact_lock(hashtext(NEW.moodboard_id::text));
  IF (SELECT count(*) FROM public.visual_moodboard_items WHERE moodboard_id = NEW.moodboard_id) >= 24 THEN
    RAISE EXCEPTION 'visual moodboard item limit reached';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS visual_moodboard_item_limit ON public.visual_moodboard_items;
CREATE TRIGGER visual_moodboard_item_limit
BEFORE INSERT ON public.visual_moodboard_items
FOR EACH ROW EXECUTE FUNCTION public.enforce_visual_moodboard_item_limit();

CREATE OR REPLACE FUNCTION public.mark_visual_moodboard_analysis_stale()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target_id UUID;
BEGIN
  target_id := COALESCE(NEW.moodboard_id, OLD.moodboard_id);
  UPDATE public.visual_moodboards
  SET analysis_status = CASE WHEN analysis_version > 0 THEN 'stale' ELSE 'idle' END,
      updated_at = NOW()
  WHERE id = target_id;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS visual_moodboard_items_stale ON public.visual_moodboard_items;
CREATE TRIGGER visual_moodboard_items_stale
AFTER INSERT OR UPDATE OR DELETE ON public.visual_moodboard_items
FOR EACH ROW EXECUTE FUNCTION public.mark_visual_moodboard_analysis_stale();

CREATE OR REPLACE FUNCTION public.touch_create_workspace_v2_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS visual_moodboards_touch ON public.visual_moodboards;
CREATE TRIGGER visual_moodboards_touch BEFORE UPDATE ON public.visual_moodboards
FOR EACH ROW EXECUTE FUNCTION public.touch_create_workspace_v2_updated_at();
DROP TRIGGER IF EXISTS visual_moodboard_items_touch ON public.visual_moodboard_items;
CREATE TRIGGER visual_moodboard_items_touch BEFORE UPDATE ON public.visual_moodboard_items
FOR EACH ROW EXECUTE FUNCTION public.touch_create_workspace_v2_updated_at();
DROP TRIGGER IF EXISTS image_creation_sessions_touch ON public.image_creation_sessions;
CREATE TRIGGER image_creation_sessions_touch BEFORE UPDATE ON public.image_creation_sessions
FOR EACH ROW EXECUTE FUNCTION public.touch_create_workspace_v2_updated_at();
DROP TRIGGER IF EXISTS image_creation_turns_touch ON public.image_creation_turns;
CREATE TRIGGER image_creation_turns_touch BEFORE UPDATE ON public.image_creation_turns
FOR EACH ROW EXECUTE FUNCTION public.touch_create_workspace_v2_updated_at();

ALTER TABLE public.visual_moodboards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visual_moodboard_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visual_moodboard_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.image_creation_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.image_creation_turns ENABLE ROW LEVEL SECURITY;

CREATE POLICY visual_moodboards_select ON public.visual_moodboards FOR SELECT USING (
  is_official OR user_id = (SELECT auth.uid()) OR
  (visibility = 'public' AND moderation_status = 'active')
);
CREATE POLICY visual_moodboards_owner_insert ON public.visual_moodboards FOR INSERT
WITH CHECK (user_id = (SELECT auth.uid()) AND NOT is_official);
CREATE POLICY visual_moodboards_owner_update ON public.visual_moodboards FOR UPDATE
USING (user_id = (SELECT auth.uid()) AND NOT is_official)
WITH CHECK (user_id = (SELECT auth.uid()) AND NOT is_official);
CREATE POLICY visual_moodboards_owner_delete ON public.visual_moodboards FOR DELETE
USING (user_id = (SELECT auth.uid()) AND NOT is_official);

CREATE POLICY visual_moodboard_items_select ON public.visual_moodboard_items FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.visual_moodboards b WHERE b.id = moodboard_id AND
    (b.is_official OR b.user_id = (SELECT auth.uid()) OR
      (b.visibility = 'public' AND b.moderation_status = 'active')))
);
CREATE POLICY visual_moodboard_items_owner_write ON public.visual_moodboard_items FOR ALL
USING (EXISTS (SELECT 1 FROM public.visual_moodboards b WHERE b.id = moodboard_id AND b.user_id = (SELECT auth.uid()) AND NOT b.is_official))
WITH CHECK (EXISTS (SELECT 1 FROM public.visual_moodboards b WHERE b.id = moodboard_id AND b.user_id = (SELECT auth.uid()) AND NOT b.is_official));

CREATE POLICY visual_moodboard_shares_owner_all ON public.visual_moodboard_shares FOR ALL
USING (
  user_id = (SELECT auth.uid()) AND
  EXISTS (SELECT 1 FROM public.visual_moodboards b
    WHERE b.id = moodboard_id AND b.user_id = (SELECT auth.uid()) AND NOT b.is_official)
)
WITH CHECK (
  user_id = (SELECT auth.uid()) AND
  EXISTS (SELECT 1 FROM public.visual_moodboards b
    WHERE b.id = moodboard_id AND b.user_id = (SELECT auth.uid()) AND NOT b.is_official)
);
CREATE POLICY image_creation_sessions_owner_all ON public.image_creation_sessions FOR ALL
USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY image_creation_turns_owner_all ON public.image_creation_turns FOR ALL
USING (
  user_id = (SELECT auth.uid()) AND
  EXISTS (SELECT 1 FROM public.image_creation_sessions s
    WHERE s.id = session_id AND s.user_id = (SELECT auth.uid()))
)
WITH CHECK (
  user_id = (SELECT auth.uid()) AND
  EXISTS (SELECT 1 FROM public.image_creation_sessions s
    WHERE s.id = session_id AND s.user_id = (SELECT auth.uid()))
);

CREATE POLICY visual_moodboards_service_all ON public.visual_moodboards FOR ALL
USING ((SELECT auth.role()) = 'service_role') WITH CHECK ((SELECT auth.role()) = 'service_role');
CREATE POLICY visual_moodboard_items_service_all ON public.visual_moodboard_items FOR ALL
USING ((SELECT auth.role()) = 'service_role') WITH CHECK ((SELECT auth.role()) = 'service_role');
CREATE POLICY visual_moodboard_shares_service_all ON public.visual_moodboard_shares FOR ALL
USING ((SELECT auth.role()) = 'service_role') WITH CHECK ((SELECT auth.role()) = 'service_role');
CREATE POLICY image_creation_sessions_service_all ON public.image_creation_sessions FOR ALL
USING ((SELECT auth.role()) = 'service_role') WITH CHECK ((SELECT auth.role()) = 'service_role');
CREATE POLICY image_creation_turns_service_all ON public.image_creation_turns FOR ALL
USING ((SELECT auth.role()) = 'service_role') WITH CHECK ((SELECT auth.role()) = 'service_role');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.visual_moodboards TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.visual_moodboard_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.visual_moodboard_shares TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.image_creation_sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.image_creation_turns TO authenticated;
GRANT ALL ON public.visual_moodboards, public.visual_moodboard_items,
  public.visual_moodboard_shares, public.image_creation_sessions,
  public.image_creation_turns TO service_role;
