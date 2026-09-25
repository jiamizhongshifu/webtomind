-- v1.3: Studio documents table

SET search_path = public;

CREATE TABLE IF NOT EXISTS studio_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES workspace_projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '未命名草稿',
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_studio_documents_project_id
  ON studio_documents(project_id);

CREATE INDEX IF NOT EXISTS idx_studio_documents_project_updated_at
  ON studio_documents(project_id, updated_at DESC);

CREATE OR REPLACE FUNCTION set_studio_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_studio_documents_updated_at ON studio_documents;
CREATE TRIGGER trg_studio_documents_updated_at
  BEFORE UPDATE ON studio_documents
  FOR EACH ROW
  EXECUTE FUNCTION set_studio_documents_updated_at();

ALTER TABLE studio_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS studio_documents_select ON studio_documents;
CREATE POLICY studio_documents_select ON studio_documents
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM workspace_projects wp
      WHERE wp.id = studio_documents.project_id
        AND wp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS studio_documents_insert ON studio_documents;
CREATE POLICY studio_documents_insert ON studio_documents
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM workspace_projects wp
      WHERE wp.id = studio_documents.project_id
        AND wp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS studio_documents_update ON studio_documents;
CREATE POLICY studio_documents_update ON studio_documents
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM workspace_projects wp
      WHERE wp.id = studio_documents.project_id
        AND wp.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM workspace_projects wp
      WHERE wp.id = studio_documents.project_id
        AND wp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS studio_documents_delete ON studio_documents;
CREATE POLICY studio_documents_delete ON studio_documents
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM workspace_projects wp
      WHERE wp.id = studio_documents.project_id
        AND wp.user_id = auth.uid()
    )
  );

