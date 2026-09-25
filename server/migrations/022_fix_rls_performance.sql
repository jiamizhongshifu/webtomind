-- 修复 RLS 性能问题
-- 1. 将 auth.uid() 改为 (select auth.uid()) 避免每行重复执行
-- 2. 合并重复的 permissive 策略
-- 
-- 注意：只修复确实存在的表和策略
-- 基于 migrations 001, 004, 009, 013 中定义的表

-- ============================================
-- 1. 修复 profiles 表的 RLS 策略
-- ============================================

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT USING (id = (select auth.uid()));

CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (id = (select auth.uid()));

-- ============================================
-- 2. 修复 summaries 表的 RLS 策略
-- ============================================

DROP POLICY IF EXISTS "Users can delete own summaries" ON public.summaries;
DROP POLICY IF EXISTS "Users can insert own summaries" ON public.summaries;
DROP POLICY IF EXISTS "Users can update own summaries" ON public.summaries;
DROP POLICY IF EXISTS "Users can view own summaries" ON public.summaries;
DROP POLICY IF EXISTS "Users can manage own summaries" ON public.summaries;

CREATE POLICY "summaries_select_own" ON public.summaries
  FOR SELECT USING ((select auth.uid()) = user_id OR user_id IS NULL);

CREATE POLICY "summaries_insert_own" ON public.summaries
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "summaries_update_own" ON public.summaries
  FOR UPDATE USING ((select auth.uid()) = user_id);

CREATE POLICY "summaries_delete_own" ON public.summaries
  FOR DELETE USING ((select auth.uid()) = user_id);

-- ============================================
-- 3. 修复 shortcuts 表的 RLS 策略
-- ============================================

DROP POLICY IF EXISTS "Users can delete own shortcuts" ON public.shortcuts;
DROP POLICY IF EXISTS "Users can insert own shortcuts" ON public.shortcuts;
DROP POLICY IF EXISTS "Users can update own shortcuts" ON public.shortcuts;
DROP POLICY IF EXISTS "Users can view own shortcuts" ON public.shortcuts;
DROP POLICY IF EXISTS "Users can manage own shortcuts" ON public.shortcuts;

CREATE POLICY "shortcuts_select_own" ON public.shortcuts
  FOR SELECT USING ((select auth.uid()) = user_id OR user_id IS NULL);

CREATE POLICY "shortcuts_insert_own" ON public.shortcuts
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "shortcuts_update_own" ON public.shortcuts
  FOR UPDATE USING ((select auth.uid()) = user_id);

CREATE POLICY "shortcuts_delete_own" ON public.shortcuts
  FOR DELETE USING ((select auth.uid()) = user_id);

-- ============================================
-- 4. 修复 user_credits 表的 RLS 策略
-- ============================================

DROP POLICY IF EXISTS "Users can insert own credits" ON public.user_credits;
DROP POLICY IF EXISTS "Users can update own credits" ON public.user_credits;
DROP POLICY IF EXISTS "Users view own credits" ON public.user_credits;

CREATE POLICY "user_credits_select_own" ON public.user_credits
  FOR SELECT USING (user_id = (select auth.uid()));

-- ============================================
-- 5. 修复 user_subscriptions 表的 RLS 策略
-- ============================================

DROP POLICY IF EXISTS "Users view own subscriptions" ON public.user_subscriptions;

CREATE POLICY "user_subscriptions_select_own" ON public.user_subscriptions
  FOR SELECT USING (user_id = (select auth.uid()));

-- ============================================
-- 6. 修复 credit_transactions 表的 RLS 策略
-- ============================================

DROP POLICY IF EXISTS "Users view own transactions" ON public.credit_transactions;

CREATE POLICY "credit_transactions_select_own" ON public.credit_transactions
  FOR SELECT USING (user_id = (select auth.uid()));

-- ============================================
-- 7. 修复 payment_orders 表的 RLS 策略
-- ============================================

DROP POLICY IF EXISTS "Users insert own orders" ON public.payment_orders;
DROP POLICY IF EXISTS "Users view own orders" ON public.payment_orders;

CREATE POLICY "payment_orders_select_own" ON public.payment_orders
  FOR SELECT USING (user_id = (select auth.uid()));

-- ============================================
-- 8. 修复 referrals 表的 RLS 策略
-- ============================================

DROP POLICY IF EXISTS "Users view own referrals" ON public.referrals;

CREATE POLICY "referrals_select_own" ON public.referrals
  FOR SELECT USING (referrer_id = (select auth.uid()) OR referee_id = (select auth.uid()));

-- ============================================
-- 9. 修复 notebooklm_tasks 表的 RLS 策略
-- ============================================

DROP POLICY IF EXISTS "Users can create own tasks" ON public.notebooklm_tasks;
DROP POLICY IF EXISTS "Users can update own tasks" ON public.notebooklm_tasks;
DROP POLICY IF EXISTS "Users can view own tasks" ON public.notebooklm_tasks;
DROP POLICY IF EXISTS "Service role full access to tasks" ON public.notebooklm_tasks;

CREATE POLICY "notebooklm_tasks_select_own" ON public.notebooklm_tasks
  FOR SELECT USING (user_id = (select auth.uid()));

CREATE POLICY "notebooklm_tasks_insert_own" ON public.notebooklm_tasks
  FOR INSERT WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "notebooklm_tasks_update_own" ON public.notebooklm_tasks
  FOR UPDATE USING (user_id = (select auth.uid()));

CREATE POLICY "notebooklm_tasks_service_role" ON public.notebooklm_tasks
  FOR ALL USING ((select auth.role()) = 'service_role');

-- ============================================
-- 10. 修复 notebooklm_accounts 表的 RLS 策略
-- ============================================

DROP POLICY IF EXISTS "Service role full access to accounts" ON public.notebooklm_accounts;

CREATE POLICY "notebooklm_accounts_service_role" ON public.notebooklm_accounts
  FOR ALL USING ((select auth.role()) = 'service_role');

-- ============================================
-- 11. 修复 workspace_projects 表的 RLS 策略
-- ============================================

DROP POLICY IF EXISTS "Users can delete own non-default projects" ON public.workspace_projects;
DROP POLICY IF EXISTS "Users can insert own projects" ON public.workspace_projects;
DROP POLICY IF EXISTS "Users can update own projects" ON public.workspace_projects;
DROP POLICY IF EXISTS "Users can view own projects" ON public.workspace_projects;

CREATE POLICY "workspace_projects_select_own" ON public.workspace_projects
  FOR SELECT USING (user_id = (select auth.uid()));

CREATE POLICY "workspace_projects_insert_own" ON public.workspace_projects
  FOR INSERT WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "workspace_projects_update_own" ON public.workspace_projects
  FOR UPDATE USING (user_id = (select auth.uid()));

CREATE POLICY "workspace_projects_delete_own" ON public.workspace_projects
  FOR DELETE USING (user_id = (select auth.uid()) AND is_default = false);
