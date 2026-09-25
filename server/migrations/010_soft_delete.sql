-- Add soft delete support to summaries table
-- This migration adds a deleted_at column for trash/recycle bin functionality

-- Add deleted_at column if it doesn't exist
ALTER TABLE summaries ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- Create index for efficient trash queries
CREATE INDEX IF NOT EXISTS idx_summaries_deleted_at ON summaries(deleted_at) WHERE deleted_at IS NOT NULL;

-- Create index for efficient non-deleted queries
CREATE INDEX IF NOT EXISTS idx_summaries_not_deleted ON summaries(user_id, created_at) WHERE deleted_at IS NULL;
