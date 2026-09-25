-- Migration: 031_share_links
-- Description: Create share_links table for public sharing feature
-- Date: 2026-01-26

-- Create share_links table
CREATE TABLE IF NOT EXISTS share_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  summary_id UUID NOT NULL REFERENCES summaries(id) ON DELETE CASCADE,
  token VARCHAR(16) NOT NULL,
  user_id UUID NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  revoked_at TIMESTAMPTZ DEFAULT NULL
);

-- Create unique index on token for fast lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_share_links_token ON share_links(token);

-- Create index on summary_id for finding shares by summary
CREATE INDEX IF NOT EXISTS idx_share_links_summary_id ON share_links(summary_id);

-- Create index on user_id for finding shares by user
CREATE INDEX IF NOT EXISTS idx_share_links_user_id ON share_links(user_id);

-- Create partial index for active shares (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_share_links_active ON share_links(summary_id) WHERE is_active = true;

-- Enable Row Level Security
ALTER TABLE share_links ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own share links
CREATE POLICY "Users can view own share links"
  ON share_links
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can only create share links for their own summaries
CREATE POLICY "Users can create own share links"
  ON share_links
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can only update their own share links
CREATE POLICY "Users can update own share links"
  ON share_links
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Policy: Users can only delete their own share links
CREATE POLICY "Users can delete own share links"
  ON share_links
  FOR DELETE
  USING (auth.uid() = user_id);

-- Policy: Allow public read access for active share links (for public share page)
-- This uses a service role or anon key to read share content
CREATE POLICY "Public can read active share links"
  ON share_links
  FOR SELECT
  USING (is_active = true);

-- Add comment to table
COMMENT ON TABLE share_links IS 'Stores public share links for summaries';
COMMENT ON COLUMN share_links.token IS 'Unique 8-character alphanumeric token for the share URL';
COMMENT ON COLUMN share_links.is_active IS 'Whether the share link is currently active';
COMMENT ON COLUMN share_links.revoked_at IS 'Timestamp when the share was revoked (null if active)';
