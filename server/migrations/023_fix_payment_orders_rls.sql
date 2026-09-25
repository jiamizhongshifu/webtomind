-- 修复 payment_orders 表缺失的 INSERT 策略
-- 补充 022_fix_rls_performance.sql 中遗漏的策略

-- 添加用户插入自己订单的策略
CREATE POLICY "payment_orders_insert_own" ON public.payment_orders
  FOR INSERT WITH CHECK (user_id = (select auth.uid()));

-- 添加更新策略（用于更新订单状态）
CREATE POLICY "payment_orders_update_own" ON public.payment_orders
  FOR UPDATE USING (user_id = (select auth.uid()));
