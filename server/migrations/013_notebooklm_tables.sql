-- NotebookLM Integration Tables
-- Migration: 013_notebooklm_tables.sql
-- Requirements: 5.1, 9.2, 9.3

-- ============================================
-- NotebookLM Tasks Table
-- Stores processing task records
-- ============================================

CREATE TABLE IF NOT EXISTS notebooklm_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Source information
    source_type VARCHAR(20) NOT NULL CHECK (source_type IN ('url', 'youtube', 'pdf', 'text')),
    source_content TEXT NOT NULL,
    source_file_name VARCHAR(255),
    
    -- Output configuration
    output_type VARCHAR(20) NOT NULL CHECK (output_type IN ('flashcards', 'mindmap', 'report', 'quiz', 'summary')),
    options JSONB DEFAULT '{}',
    
    -- Task status
    status VARCHAR(20) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'cancelled')),
    progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
    
    -- Results
    result JSONB,
    error_message TEXT,
    
    -- Processing metadata
    account_id UUID,
    notebook_id VARCHAR(255),
    trace_id UUID,
    retry_count INTEGER DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for tasks table
CREATE INDEX IF NOT EXISTS idx_notebooklm_tasks_user_id ON notebooklm_tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_notebooklm_tasks_status ON notebooklm_tasks(status);
CREATE INDEX IF NOT EXISTS idx_notebooklm_tasks_created_at ON notebooklm_tasks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notebooklm_tasks_user_status ON notebooklm_tasks(user_id, status);

-- ============================================
-- NotebookLM Accounts Table
-- Stores Google account credentials for NotebookLM access
-- ============================================

CREATE TABLE IF NOT EXISTS notebooklm_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    
    -- Cookie storage (encrypted)
    cookie_encrypted TEXT NOT NULL,
    cookie_expires_at TIMESTAMPTZ,
    
    -- Account status
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cooldown', 'disabled', 'cookie_expired')),
    cooldown_until TIMESTAMPTZ,
    
    -- Load tracking
    current_load INTEGER DEFAULT 0,
    max_concurrent INTEGER DEFAULT 2,
    
    -- Statistics
    total_requests INTEGER DEFAULT 0,
    failed_requests INTEGER DEFAULT 0,
    last_used_at TIMESTAMPTZ,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for accounts table
CREATE INDEX IF NOT EXISTS idx_notebooklm_accounts_status ON notebooklm_accounts(status);
CREATE INDEX IF NOT EXISTS idx_notebooklm_accounts_cooldown ON notebooklm_accounts(cooldown_until) WHERE cooldown_until IS NOT NULL;

-- ============================================
-- Trigger for updated_at
-- ============================================

CREATE OR REPLACE FUNCTION update_notebooklm_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_notebooklm_tasks_updated_at
    BEFORE UPDATE ON notebooklm_tasks
    FOR EACH ROW
    EXECUTE FUNCTION update_notebooklm_updated_at();

CREATE TRIGGER trigger_notebooklm_accounts_updated_at
    BEFORE UPDATE ON notebooklm_accounts
    FOR EACH ROW
    EXECUTE FUNCTION update_notebooklm_updated_at();

-- ============================================
-- Row Level Security (RLS)
-- ============================================

ALTER TABLE notebooklm_tasks ENABLE ROW LEVEL SECURITY;

-- Users can only see their own tasks
CREATE POLICY "Users can view own tasks"
    ON notebooklm_tasks
    FOR SELECT
    USING (auth.uid() = user_id);

-- Users can insert their own tasks
CREATE POLICY "Users can create own tasks"
    ON notebooklm_tasks
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can update their own tasks (for cancellation)
CREATE POLICY "Users can update own tasks"
    ON notebooklm_tasks
    FOR UPDATE
    USING (auth.uid() = user_id);

-- Service role can manage all tasks
CREATE POLICY "Service role full access to tasks"
    ON notebooklm_tasks
    FOR ALL
    USING (auth.role() = 'service_role');

-- Accounts table is admin-only (no RLS for regular users)
ALTER TABLE notebooklm_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to accounts"
    ON notebooklm_accounts
    FOR ALL
    USING (auth.role() = 'service_role');

-- ============================================
-- Helper Functions
-- ============================================

-- Get next available account (lowest load, not in cooldown)
CREATE OR REPLACE FUNCTION get_available_notebooklm_account()
RETURNS UUID AS $$
DECLARE
    account_id UUID;
BEGIN
    SELECT id INTO account_id
    FROM notebooklm_accounts
    WHERE status = 'active'
      AND current_load < max_concurrent
      AND (cooldown_until IS NULL OR cooldown_until < NOW())
    ORDER BY current_load ASC, last_used_at ASC NULLS FIRST
    LIMIT 1
    FOR UPDATE SKIP LOCKED;
    
    IF account_id IS NOT NULL THEN
        UPDATE notebooklm_accounts
        SET current_load = current_load + 1,
            last_used_at = NOW()
        WHERE id = account_id;
    END IF;
    
    RETURN account_id;
END;
$$ LANGUAGE plpgsql;

-- Release account after task completion
CREATE OR REPLACE FUNCTION release_notebooklm_account(p_account_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE notebooklm_accounts
    SET current_load = GREATEST(0, current_load - 1)
    WHERE id = p_account_id;
END;
$$ LANGUAGE plpgsql;

-- Mark account as rate limited
CREATE OR REPLACE FUNCTION mark_account_rate_limited(p_account_id UUID, p_cooldown_seconds INTEGER DEFAULT 300)
RETURNS VOID AS $$
BEGIN
    UPDATE notebooklm_accounts
    SET status = 'cooldown',
        cooldown_until = NOW() + (p_cooldown_seconds || ' seconds')::INTERVAL,
        failed_requests = failed_requests + 1
    WHERE id = p_account_id;
END;
$$ LANGUAGE plpgsql;

-- Cleanup expired cooldowns
CREATE OR REPLACE FUNCTION cleanup_notebooklm_cooldowns()
RETURNS INTEGER AS $$
DECLARE
    updated_count INTEGER;
BEGIN
    UPDATE notebooklm_accounts
    SET status = 'active',
        cooldown_until = NULL
    WHERE status = 'cooldown'
      AND cooldown_until < NOW();
    
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Comments
-- ============================================

COMMENT ON TABLE notebooklm_tasks IS 'Stores NotebookLM content processing tasks';
COMMENT ON TABLE notebooklm_accounts IS 'Stores Google account credentials for NotebookLM access';
COMMENT ON FUNCTION get_available_notebooklm_account() IS 'Returns the ID of an available account with lowest load';
COMMENT ON FUNCTION release_notebooklm_account(UUID) IS 'Decrements the load counter for an account';
COMMENT ON FUNCTION mark_account_rate_limited(UUID, INTEGER) IS 'Marks an account as rate limited with cooldown';
COMMENT ON FUNCTION cleanup_notebooklm_cooldowns() IS 'Reactivates accounts whose cooldown has expired';
