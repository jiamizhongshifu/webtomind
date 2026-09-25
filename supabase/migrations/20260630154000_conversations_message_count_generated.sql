-- Avoid reading full conversation message JSON when only list metadata is
-- needed. The count is derived by Postgres whenever messages changes.

SET search_path = public;

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS message_count INTEGER
  GENERATED ALWAYS AS (
    jsonb_array_length(COALESCE(messages, '[]'::jsonb))
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_conversations_user_updated
  ON public.conversations (user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversations_session_updated
  ON public.conversations (session_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversations_project_user_updated
  ON public.conversations (project_id, user_id, updated_at DESC);
