-- App Configuration Table
-- Migration: 014_app_config_table.sql
-- Stores application configuration for online config management

-- ============================================
-- App Config Table
-- Key-value store for application settings
-- ============================================

CREATE TABLE IF NOT EXISTS app_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category VARCHAR(50) NOT NULL,
    key VARCHAR(100) NOT NULL,
    value JSONB NOT NULL,
    description TEXT,
    is_secret BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(category, key)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_app_config_category ON app_config(category);
CREATE INDEX IF NOT EXISTS idx_app_config_category_key ON app_config(category, key);

-- Trigger for updated_at
CREATE TRIGGER trigger_app_config_updated_at
    BEFORE UPDATE ON app_config
    FOR EACH ROW
    EXECUTE FUNCTION update_notebooklm_updated_at();

-- ============================================
-- Row Level Security
-- ============================================

ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;

-- Only service role can manage config
CREATE POLICY "Service role full access to config"
    ON app_config
    FOR ALL
    USING (auth.role() = 'service_role');

-- Authenticated users can read non-secret config
CREATE POLICY "Authenticated users can read non-secret config"
    ON app_config
    FOR SELECT
    USING (auth.role() = 'authenticated' AND is_secret = FALSE);

-- ============================================
-- Insert Default NotebookLM Config
-- ============================================

INSERT INTO app_config (category, key, value, description, is_secret) VALUES
    ('notebooklm', 'host', '"0.0.0.0"', 'Worker host address', FALSE),
    ('notebooklm', 'port', '8000', 'Worker port', FALSE),
    ('notebooklm', 'debug', 'false', 'Debug mode', FALSE),
    ('notebooklm', 'allowed_origins', '["http://localhost:3000", "http://localhost:5173"]', 'CORS allowed origins', FALSE),
    ('notebooklm', 'encryption_key', '""', 'Cookie encryption key (set in production)', TRUE),
    ('notebooklm', 'notebook_prefix', '"webtomind_temp_"', 'Temporary notebook name prefix', FALSE),
    ('notebooklm', 'notebook_cleanup_hours', '24', 'Hours before cleaning up temp notebooks', FALSE),
    ('notebooklm', 'max_concurrent_per_account', '2', 'Max concurrent tasks per account', FALSE),
    ('notebooklm', 'cooldown_seconds', '300', 'Account cooldown duration in seconds', FALSE),
    ('notebooklm', 'cookie_storage_path', '"./data/cookies"', 'Path for cookie storage', FALSE),
    ('notebooklm', 'cookie_refresh_hours', '24', 'Hours before cookie refresh', FALSE),
    ('notebooklm', 'max_retries', '3', 'Maximum retry attempts', FALSE),
    ('notebooklm', 'retry_delay_seconds', '5', 'Delay between retries in seconds', FALSE),
    ('notebooklm', 'worker_url', '"http://localhost:8000"', 'Python Worker URL', FALSE)
ON CONFLICT (category, key) DO NOTHING;

-- ============================================
-- Helper Functions
-- ============================================

-- Get config value by category and key
CREATE OR REPLACE FUNCTION get_config(p_category VARCHAR, p_key VARCHAR)
RETURNS JSONB AS $$
DECLARE
    result JSONB;
BEGIN
    SELECT value INTO result
    FROM app_config
    WHERE category = p_category AND key = p_key;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Set config value
CREATE OR REPLACE FUNCTION set_config(p_category VARCHAR, p_key VARCHAR, p_value JSONB)
RETURNS VOID AS $$
BEGIN
    INSERT INTO app_config (category, key, value)
    VALUES (p_category, p_key, p_value)
    ON CONFLICT (category, key) 
    DO UPDATE SET value = p_value, updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get all config for a category
CREATE OR REPLACE FUNCTION get_config_by_category(p_category VARCHAR)
RETURNS TABLE(key VARCHAR, value JSONB) AS $$
BEGIN
    RETURN QUERY
    SELECT ac.key, ac.value
    FROM app_config ac
    WHERE ac.category = p_category
      AND (ac.is_secret = FALSE OR auth.role() = 'service_role');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Comments
-- ============================================

COMMENT ON TABLE app_config IS 'Application configuration key-value store';
COMMENT ON FUNCTION get_config(VARCHAR, VARCHAR) IS 'Get a single config value';
COMMENT ON FUNCTION set_config(VARCHAR, VARCHAR, JSONB) IS 'Set a config value';
COMMENT ON FUNCTION get_config_by_category(VARCHAR) IS 'Get all config for a category';
