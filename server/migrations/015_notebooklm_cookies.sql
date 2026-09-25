-- NotebookLM Cookie Storage Table
-- Stores encrypted Google cookies for NotebookLM access
-- Supports multiple accounts with health tracking

CREATE TABLE IF NOT EXISTS notebooklm_cookies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_email TEXT NOT NULL,
    account_name TEXT,
    cookies_encrypted TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    priority INTEGER DEFAULT 0,
    last_validated_at TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    validation_error TEXT,
    use_count INTEGER DEFAULT 0,
    fail_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_notebooklm_cookies_active 
    ON notebooklm_cookies(is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_notebooklm_cookies_expires 
    ON notebooklm_cookies(expires_at);

CREATE INDEX IF NOT EXISTS idx_notebooklm_cookies_priority 
    ON notebooklm_cookies(priority DESC, use_count ASC) WHERE is_active = true;

-- Unique constraint on email
CREATE UNIQUE INDEX IF NOT EXISTS idx_notebooklm_cookies_email 
    ON notebooklm_cookies(account_email);

-- Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION update_notebooklm_cookies_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_notebooklm_cookies_updated_at ON notebooklm_cookies;
CREATE TRIGGER trigger_notebooklm_cookies_updated_at
    BEFORE UPDATE ON notebooklm_cookies
    FOR EACH ROW
    EXECUTE FUNCTION update_notebooklm_cookies_updated_at();

-- Enable Row Level Security
ALTER TABLE notebooklm_cookies ENABLE ROW LEVEL SECURITY;

-- Only service role can access cookies (security)
DROP POLICY IF EXISTS "Service role can manage cookies" ON notebooklm_cookies;
CREATE POLICY "Service role can manage cookies"
    ON notebooklm_cookies
    FOR ALL
    USING (auth.role() = 'service_role');

-- Comments
COMMENT ON TABLE notebooklm_cookies IS 'Stores encrypted Google cookies for NotebookLM API access';
COMMENT ON COLUMN notebooklm_cookies.cookies_encrypted IS 'AES encrypted JSON cookie data';
COMMENT ON COLUMN notebooklm_cookies.priority IS 'Higher priority accounts are used first';
COMMENT ON COLUMN notebooklm_cookies.expires_at IS 'Estimated cookie expiration time';
