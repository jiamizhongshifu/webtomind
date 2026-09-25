-- NotebookLM OAuth Accounts Table
-- Stores OAuth refresh tokens for persistent authentication
-- Refresh tokens are long-lived and can be used to get new access tokens

CREATE TABLE IF NOT EXISTS notebooklm_oauth_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    name TEXT,
    
    -- OAuth tokens
    refresh_token TEXT NOT NULL,  -- 永久有效，除非用户撤销
    access_token TEXT,
    access_token_expires_at TIMESTAMPTZ,
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    needs_reauth BOOLEAN DEFAULT false,
    reauth_error TEXT,
    
    -- Usage tracking
    priority INTEGER DEFAULT 0,
    use_count INTEGER DEFAULT 0,
    last_used_at TIMESTAMPTZ,
    last_refreshed_at TIMESTAMPTZ,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_oauth_accounts_active 
    ON notebooklm_oauth_accounts(is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_oauth_accounts_priority 
    ON notebooklm_oauth_accounts(priority DESC, use_count ASC) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_oauth_accounts_needs_reauth 
    ON notebooklm_oauth_accounts(needs_reauth) WHERE needs_reauth = true;

-- Auto-update trigger
CREATE OR REPLACE FUNCTION update_oauth_accounts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_oauth_accounts_updated_at ON notebooklm_oauth_accounts;
CREATE TRIGGER trigger_oauth_accounts_updated_at
    BEFORE UPDATE ON notebooklm_oauth_accounts
    FOR EACH ROW
    EXECUTE FUNCTION update_oauth_accounts_updated_at();

-- RLS
ALTER TABLE notebooklm_oauth_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role can manage oauth accounts" ON notebooklm_oauth_accounts;
CREATE POLICY "Service role can manage oauth accounts"
    ON notebooklm_oauth_accounts
    FOR ALL
    USING (auth.role() = 'service_role');

-- Helper function to increment use count
CREATE OR REPLACE FUNCTION increment_oauth_use_count(account_uuid UUID)
RETURNS void AS $$
BEGIN
    UPDATE notebooklm_oauth_accounts
    SET use_count = use_count + 1,
        last_used_at = NOW()
    WHERE id = account_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comments
COMMENT ON TABLE notebooklm_oauth_accounts IS 'OAuth accounts for NotebookLM with refresh tokens';
COMMENT ON COLUMN notebooklm_oauth_accounts.refresh_token IS 'Google OAuth refresh token - 永久有效除非用户撤销';
COMMENT ON COLUMN notebooklm_oauth_accounts.needs_reauth IS 'True if refresh token is invalid and user needs to re-authorize';
