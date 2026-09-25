-- Migration: 032_skill_templates_rls
-- Description: Enable RLS on skill_templates table
-- Date: 2026-01-26

-- Enable Row Level Security on skill_templates
ALTER TABLE skill_templates ENABLE ROW LEVEL SECURITY;

-- Policy: Allow public read access to skill templates (they are public templates)
CREATE POLICY "Public can read skill templates"
  ON skill_templates
  FOR SELECT
  USING (true);

-- Policy: Only admins can insert/update/delete (via service role key)
-- No explicit policy needed - service role bypasses RLS

-- Add comment
COMMENT ON TABLE skill_templates IS 'Public skill templates available to all users';
