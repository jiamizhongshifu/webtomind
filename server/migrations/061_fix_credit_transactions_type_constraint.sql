-- 修复 credit_transactions.type 枚举约束
-- ????????????? 'consume' ??

ALTER TABLE public.credit_transactions
DROP CONSTRAINT IF EXISTS credit_transactions_type_check;

ALTER TABLE public.credit_transactions
ADD CONSTRAINT credit_transactions_type_check
CHECK (
  type IN (
    'daily_refresh',
    'subscription_grant',
    'purchase',
    'usage',
    'consume',
    'checkin',
    'referral_reward',
    'admin_adjustment',
    'refund'
  )
);
