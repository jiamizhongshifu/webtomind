-- Enable RLS for notebooklm_oauth_accounts table
-- Migration: 019_oauth_accounts_rls.sql

SET search_path = public;

-- 1. Enable RLS on the table
ALTER TABLE notebooklm_oauth_accounts ENABLE ROW LEVEL SECURITY;

-- 2. Create policy: Only service role can access (no direct API access)
-- This table should only be accessed by backend services, not directly by users
CREATE POLICY "Service role only access" ON notebooklm_oauth_accounts
  FOR ALL
  USING (false)
  WITH CHECK (false);

-- 3. Grant access to service role (bypasses RLS)
-- Service role is used by backend servers and has full access
GRANT ALL ON notebooklm_oauth_accounts TO service_role;

-- 4. Revoke direct access from authenticated users
REVOKE ALL ON notebooklm_oauth_accounts FROM authenticated;
REVOKE ALL ON notebooklm_oauth_accounts FROM anon;

COMMENT ON TABLE notebooklm_oauth_accounts IS 'OAuth accounts for NotebookLM - access restricted to service role only for security';
