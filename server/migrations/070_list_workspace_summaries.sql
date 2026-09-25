-- Lightweight paginated summary list for workspace views.
-- Detail reads should continue using the single-summary endpoint for full markdown.

SET search_path = public;

CREATE OR REPLACE FUNCTION list_workspace_summaries(
  p_user_id UUID DEFAULT NULL,
  p_project_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0,
  p_preview_chars INTEGER DEFAULT 1200
) RETURNS TABLE (
  id UUID,
  title TEXT,
  url TEXT,
  markdown_preview TEXT,
  tags TEXT[],
  project_id UUID,
  content_type TEXT,
  created_at TIMESTAMPTZ,
  total_count BIGINT
) AS $$
  SELECT
    s.id,
    s.title,
    s.url,
    LEFT(s.markdown, GREATEST(p_preview_chars, 0)) AS markdown_preview,
    s.tags,
    s.project_id,
    s.content_type,
    s.created_at,
    COUNT(*) OVER() AS total_count
  FROM public.summaries s
  WHERE s.deleted_at IS NULL
    AND s.user_id = p_user_id
    AND (p_project_id IS NULL OR s.project_id = p_project_id)
  ORDER BY s.created_at DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 100)
  OFFSET GREATEST(p_offset, 0);
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION list_workspace_summaries(UUID, UUID, INTEGER, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION list_workspace_summaries(UUID, UUID, INTEGER, INTEGER, INTEGER) TO service_role;
