SET search_path = public;

ALTER TABLE public.visual_moodboards
  ADD COLUMN IF NOT EXISTS source_moodboard_id UUID
  REFERENCES public.visual_moodboards(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS visual_moodboards_user_source_unique
  ON public.visual_moodboards(user_id, source_moodboard_id);

CREATE INDEX IF NOT EXISTS visual_moodboards_source_lookup
  ON public.visual_moodboards(source_moodboard_id)
  WHERE source_moodboard_id IS NOT NULL;

COMMENT ON COLUMN public.visual_moodboards.source_moodboard_id IS
  'Preset or public moodboard used to create this user-owned copy.';
