-- 007_add_stripe_columns.sql
-- 为会员套餐和积分包增加 Stripe 价格 ID 列

SET search_path = public;

-- 1. 为 subscription_plans 增加列
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'subscription_plans' AND column_name = 'stripe_price_monthly') THEN
        ALTER TABLE subscription_plans ADD COLUMN stripe_price_monthly TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'subscription_plans' AND column_name = 'stripe_price_yearly') THEN
        ALTER TABLE subscription_plans ADD COLUMN stripe_price_yearly TEXT;
    END IF;
END $$;

-- 2. 为 credit_packages 增加列
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'credit_packages' AND column_name = 'stripe_price_id') THEN
        ALTER TABLE credit_packages ADD COLUMN stripe_price_id TEXT;
    END IF;
END $$;

-- 3. 更新现有的默认套餐（如果需要）
-- 注意：这里的价格 ID 需要在生产环境下填入实际的 Stripe Price ID
UPDATE subscription_plans SET stripe_price_monthly = NULL, stripe_price_yearly = NULL WHERE id = 'free';
