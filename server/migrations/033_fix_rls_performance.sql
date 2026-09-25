-- Migration: 033_fix_rls_performance
-- Description: Fix RLS performance warnings by using (select auth.uid()) pattern
-- Date: 2026-01-26
-- 
-- This migration addresses Supabase linter warnings:
-- 1. auth_rls_initplan: auth.uid() re-evaluated for each row
-- 2. multiple_permissive_policies: Multiple SELECT policies on share_links

-- ============================================
-- Fix skills table RLS policies
-- ============================================

-- Drop existing policies
DROP POLICY IF EXISTS "skills_select" ON skills;
DROP POLICY IF EXISTS "skills_insert" ON skills;
DROP POLICY IF EXISTS "skills_update" ON skills;
DROP POLICY IF EXISTS "skills_delete" ON skills;

-- Recreate with optimized (select auth.uid()) pattern
CREATE POLICY "skills_select" ON skills
  FOR SELECT USING (
    (select auth.uid()) = user_id OR is_public = TRUE
  );

CREATE POLICY "skills_insert" ON skills
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "skills_update" ON skills
  FOR UPDATE USING ((select auth.uid()) = user_id);

CREATE POLICY "skills_delete" ON skills
  FOR DELETE USING ((select auth.uid()) = user_id);

-- ============================================
-- Fix share_links table RLS policies
-- ============================================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view own share links" ON share_links;
DROP POLICY IF EXISTS "Users can create own share links" ON share_links;
DROP POLICY IF EXISTS "Users can update own share links" ON share_links;
DROP POLICY IF EXISTS "Users can delete own share links" ON share_links;
DROP POLICY IF EXISTS "Public can read active share links" ON share_links;

-- Recreate with optimized pattern and merged SELECT policy
-- Combined SELECT policy: users can see their own links OR anyone can see active links
CREATE POLICY "share_links_select" ON share_links
  FOR SELECT USING (
    (select auth.uid()) = user_id OR is_active = TRUE
  );

CREATE POLICY "share_links_insert" ON share_links
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "share_links_update" ON share_links
  FOR UPDATE USING ((select auth.uid()) = user_id);

CREATE POLICY "share_links_delete" ON share_links
  FOR DELETE USING ((select auth.uid()) = user_id);

-- Add comments
COMMENT ON POLICY "skills_select" ON skills IS 'Users can view own skills and public skills (optimized)';
COMMENT ON POLICY "share_links_select" ON share_links IS 'Users can view own links, anyone can view active links (optimized)';
