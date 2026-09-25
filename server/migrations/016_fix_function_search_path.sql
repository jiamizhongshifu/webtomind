-- Fix Function Search Path Security Warning
-- Migration: 016_fix_function_search_path.sql
-- Sets search_path for all functions to prevent search_path injection attacks

-- ============================================
-- Fix update_notebooklm_updated_at
-- ============================================
CREATE OR REPLACE FUNCTION public.update_notebooklm_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = public;

-- ============================================
-- Fix update_notebooklm_cookies_updated_at
-- ============================================
CREATE OR REPLACE FUNCTION public.update_notebooklm_cookies_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = public;

-- ============================================
-- Fix get_available_notebooklm_account
-- ============================================
CREATE OR REPLACE FUNCTION public.get_available_notebooklm_account()
RETURNS UUID AS $$
DECLARE
    account_id UUID;
BEGIN
    SELECT id INTO account_id
    FROM public.notebooklm_accounts
    WHERE status = 'active'
      AND current_load < max_concurrent
      AND (cooldown_until IS NULL OR cooldown_until < NOW())
    ORDER BY current_load ASC, last_used_at ASC NULLS FIRST
    LIMIT 1
    FOR UPDATE SKIP LOCKED;
    
    IF account_id IS NOT NULL THEN
        UPDATE public.notebooklm_accounts
        SET current_load = current_load + 1,
            last_used_at = NOW()
        WHERE id = account_id;
    END IF;
    
    RETURN account_id;
END;
$$ LANGUAGE plpgsql
SET search_path = public;

-- ============================================
-- Fix release_notebooklm_account
-- ============================================
CREATE OR REPLACE FUNCTION public.release_notebooklm_account(p_account_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE public.notebooklm_accounts
    SET current_load = GREATEST(0, current_load - 1)
    WHERE id = p_account_id;
END;
$$ LANGUAGE plpgsql
SET search_path = public;

-- ============================================
-- Fix mark_account_rate_limited
-- ============================================
CREATE OR REPLACE FUNCTION public.mark_account_rate_limited(p_account_id UUID, p_cooldown_seconds INTEGER DEFAULT 300)
RETURNS VOID AS $$
BEGIN
    UPDATE public.notebooklm_accounts
    SET status = 'cooldown',
        cooldown_until = NOW() + (p_cooldown_seconds || ' seconds')::INTERVAL,
        failed_requests = failed_requests + 1
    WHERE id = p_account_id;
END;
$$ LANGUAGE plpgsql
SET search_path = public;

-- ============================================
-- Fix cleanup_notebooklm_cooldowns
-- ============================================
CREATE OR REPLACE FUNCTION public.cleanup_notebooklm_cooldowns()
RETURNS INTEGER AS $$
DECLARE
    updated_count INTEGER;
BEGIN
    UPDATE public.notebooklm_accounts
    SET status = 'active',
        cooldown_until = NULL
    WHERE status = 'cooldown'
      AND cooldown_until < NOW();
    
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RETURN updated_count;
END;
$$ LANGUAGE plpgsql
SET search_path = public;

-- ============================================
-- Fix get_config
-- ============================================
CREATE OR REPLACE FUNCTION public.get_config(p_category VARCHAR, p_key VARCHAR)
RETURNS JSONB AS $$
DECLARE
    result JSONB;
BEGIN
    SELECT value INTO result
    FROM public.app_config
    WHERE category = p_category AND key = p_key;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- ============================================
-- Fix set_config
-- ============================================
CREATE OR REPLACE FUNCTION public.set_config(p_category VARCHAR, p_key VARCHAR, p_value JSONB)
RETURNS VOID AS $$
BEGIN
    INSERT INTO public.app_config (category, key, value)
    VALUES (p_category, p_key, p_value)
    ON CONFLICT (category, key) 
    DO UPDATE SET value = p_value, updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- ============================================
-- Fix get_config_by_category
-- ============================================
CREATE OR REPLACE FUNCTION public.get_config_by_category(p_category VARCHAR)
RETURNS TABLE(key VARCHAR, value JSONB) AS $$
BEGIN
    RETURN QUERY
    SELECT ac.key, ac.value
    FROM public.app_config ac
    WHERE ac.category = p_category
      AND (ac.is_secret = FALSE OR auth.role() = 'service_role');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;
