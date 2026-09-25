-- 会员系统与积分系统数据库迁移
-- 对应开发计划阶段一：数据库与基础API

-- ============================================
-- 1. 基础配置表
-- ============================================

-- 1.1 套餐定义表
CREATE TABLE IF NOT EXISTS subscription_plans (
  id TEXT PRIMARY KEY, -- free, pro, max
  name TEXT NOT NULL,
  display_name JSONB DEFAULT '{}'::jsonb, -- {"zh-CN": "专业版", "en-US": "Pro"}
  description TEXT,
  price_monthly INTEGER NOT NULL, -- 单位: 分 (cents)
  price_yearly INTEGER NOT NULL, -- 单位: 分
  monthly_credits INTEGER NOT NULL,
  features JSONB DEFAULT '[]'::jsonb, -- 权益列表
  limits JSONB DEFAULT '{}'::jsonb, -- 限制项: {"maxMaterials": 1000, "dailyCredits": 300}
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 1.2 积分消耗配置表
CREATE TABLE IF NOT EXISTS credit_costs (
  action TEXT PRIMARY KEY, -- ai_chat_basic, image_generation, etc.
  cost INTEGER NOT NULL DEFAULT 1,
  description TEXT,
  category TEXT, -- ai, media, system
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 1.3 积分包产品表
CREATE TABLE IF NOT EXISTS credit_packages (
  id TEXT PRIMARY KEY, -- package_1k, package_5k
  name TEXT NOT NULL,
  price INTEGER NOT NULL, -- 单位: 分
  credits INTEGER NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- 2. 用户数据表
-- ============================================

-- 2.1 用户积分表
CREATE TABLE IF NOT EXISTS user_credits (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  daily_credits INTEGER NOT NULL DEFAULT 300, -- 每日重置的积分
  daily_credits_max INTEGER NOT NULL DEFAULT 300, -- 每日积分上限
  bonus_credits INTEGER NOT NULL DEFAULT 0, -- 额外赠送/购买的累积积分
  last_daily_refresh DATE DEFAULT CURRENT_DATE,
  last_checkin_date DATE,
  consecutive_checkin_days INTEGER DEFAULT 0,
  daily_image_gen_used INTEGER DEFAULT 0,
  daily_image_gen_max INTEGER DEFAULT 2,
  total_earned INTEGER DEFAULT 0, -- 历史总获得
  total_consumed INTEGER DEFAULT 0, -- 历史总消耗
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2.2 用户订阅表
CREATE TABLE IF NOT EXISTS user_subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  plan_id TEXT REFERENCES subscription_plans(id) NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'canceled', 'past_due', 'incomplete', 'trialing')),
  billing_cycle TEXT CHECK (billing_cycle IN ('monthly', 'yearly')),
  current_period_start TIMESTAMP WITH TIME ZONE NOT NULL,
  current_period_end TIMESTAMP WITH TIME ZONE NOT NULL,
  cancel_at_period_end BOOLEAN DEFAULT false,
  stripe_subscription_id TEXT,
  stripe_customer_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
-- 确保每个用户只有一个活跃订阅
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_subscriptions_active ON user_subscriptions(user_id) WHERE status = 'active';

-- 2.3 积分交易记录表
CREATE TABLE IF NOT EXISTS credit_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  amount INTEGER NOT NULL, -- 正数为获得，负数为消耗
  type TEXT NOT NULL CHECK (type IN ('daily_refresh', 'subscription_grant', 'purchase', 'usage', 'checkin', 'referral_reward', 'admin_adjustment', 'refund')),
  credit_type TEXT CHECK (credit_type IN ('daily', 'bonus')),
  balance_after INTEGER NOT NULL, -- 交易后余额快照 (通常指总余额)
  source TEXT, -- 来源标识: ai_chat, checkin, etc.
  description TEXT,
  metadata JSONB DEFAULT '{}'::jsonb, -- 关联的 usage_id, order_id 等
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_created ON credit_transactions(user_id, created_at DESC);

-- 2.4 支付订单表
CREATE TABLE IF NOT EXISTS payment_orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  amount INTEGER NOT NULL, -- 单位: 分
  currency TEXT DEFAULT 'usd',
  status TEXT NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded')),
  provider TEXT DEFAULT 'stripe', -- stripe, paypal
  provider_order_id TEXT,
  product_type TEXT CHECK (product_type IN ('subscription', 'credit_package')),
  product_id TEXT, -- plan_id or package_id
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payment_orders_user ON payment_orders(user_id);

-- 2.5 邀请记录表
CREATE TABLE IF NOT EXISTS referrals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  referrer_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL, -- 邀请人
  referee_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL, -- 被邀请人
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'fraud')),
  reward_amount INTEGER DEFAULT 200,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_referrals_referee ON referrals(referee_id); -- 每个人只能被邀请一次

-- ============================================
-- 3. 触发器与自动化
-- ============================================

-- 3.1 通用 updated_at 触发器
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
        CREATE FUNCTION update_updated_at_column() RETURNS TRIGGER AS $_$
        BEGIN
            NEW.updated_at = NOW();
            RETURN NEW;
        END;
        $_$ LANGUAGE plpgsql SET search_path = public;
    END IF;
END $$;

DROP TRIGGER IF EXISTS update_subscription_plans_updated_at ON subscription_plans;
CREATE TRIGGER update_subscription_plans_updated_at BEFORE UPDATE ON subscription_plans FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_credit_costs_updated_at ON credit_costs;
CREATE TRIGGER update_credit_costs_updated_at BEFORE UPDATE ON credit_costs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_credit_packages_updated_at ON credit_packages;
CREATE TRIGGER update_credit_packages_updated_at BEFORE UPDATE ON credit_packages FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_credits_updated_at ON user_credits;
CREATE TRIGGER update_user_credits_updated_at BEFORE UPDATE ON user_credits FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_subscriptions_updated_at ON user_subscriptions;
CREATE TRIGGER update_user_subscriptions_updated_at BEFORE UPDATE ON user_subscriptions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_payment_orders_updated_at ON payment_orders;
CREATE TRIGGER update_payment_orders_updated_at BEFORE UPDATE ON payment_orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 3.2 新用户自动初始化积分账户
CREATE OR REPLACE FUNCTION handle_new_user_credits()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_credits (user_id, daily_credits, daily_credits_max, bonus_credits, total_earned)
  VALUES (NEW.id, 300, 300, 0, 0) -- 新用户默认 300 每日积分，无 bonus
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created_credits ON auth.users;
CREATE TRIGGER on_auth_user_created_credits
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user_credits();

-- ============================================
-- 4. RLS 安全策略
-- ============================================

-- 启用 RLS
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;

-- 公共只读表
DROP POLICY IF EXISTS "Public read plans" ON subscription_plans;
CREATE POLICY "Public read plans" ON subscription_plans FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read costs" ON credit_costs;
CREATE POLICY "Public read costs" ON credit_costs FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read packages" ON credit_packages;
CREATE POLICY "Public read packages" ON credit_packages FOR SELECT USING (true);

-- 用户私有表
DROP POLICY IF EXISTS "Users view own credits" ON user_credits;
CREATE POLICY "Users view own credits" ON user_credits FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users view own subscriptions" ON user_subscriptions;
CREATE POLICY "Users view own subscriptions" ON user_subscriptions FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users view own transactions" ON credit_transactions;
CREATE POLICY "Users view own transactions" ON credit_transactions FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users view own orders" ON payment_orders;
CREATE POLICY "Users view own orders" ON payment_orders FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users view own referrals" ON referrals;
CREATE POLICY "Users view own referrals" ON referrals FOR SELECT USING (auth.uid() = referrer_id OR auth.uid() = referee_id);

-- ============================================
-- 5. 初始数据填充 (Seed Data)
-- ============================================

-- 插入默认套餐
INSERT INTO subscription_plans (id, name, display_name, description, price_monthly, price_yearly, monthly_credits, features, limits, sort_order) VALUES
('free', 'free', '{"zh-CN": "免费版", "en-US": "Free"}', '基础功能体验', 0, 0, 300, '["有限AI模型", "保存100素材", "每日积分重置"]'::jsonb, '{"maxMaterials": 100, "dailyCredits": 300, "dailyImageGen": 2}'::jsonb, 0),
('pro', 'pro', '{"zh-CN": "Pro版", "en-US": "Pro"}', '解锁全部能力', 2000, 20000, 20000, '["所有AI模型", "不限存储", "图片/音频生成"]'::jsonb, '{"maxMaterials": 10000, "dailyCredits": 20000, "dailyImageGen": 50}'::jsonb, 1),
('max', 'max', '{"zh-CN": "Max版", "en-US": "Max"}', '专业创作者首选', 10000, 100000, 200000, '["超大资料解析", "高级定制", "优先体验"]'::jsonb, '{"maxMaterials": -1, "dailyCredits": 200000, "dailyImageGen": 500}'::jsonb, 2)
ON CONFLICT (id) DO UPDATE SET 
  display_name = EXCLUDED.display_name,
  price_monthly = EXCLUDED.price_monthly,
  price_yearly = EXCLUDED.price_yearly,
  monthly_credits = EXCLUDED.monthly_credits,
  limits = EXCLUDED.limits;

-- 插入基础积分消耗配置
INSERT INTO credit_costs (action, cost, description, category) VALUES
('ai_chat_basic', 1, 'AI对话(基础模型)', 'ai'),
('ai_chat_advanced', 5, 'AI对话(高级模型)', 'ai'),
('image_generation', 10, '图片生成', 'media'),
('video_transcription_min', 2, '视频转录(每分钟)', 'media'),
('save_card', 1, '保存内容卡片', 'system'),
('mindmap_generation', 3, '思维导图生成', 'system')
ON CONFLICT (action) DO UPDATE SET cost = EXCLUDED.cost;

-- 插入积分包
INSERT INTO credit_packages (id, name, price, credits) VALUES
('pack_1k', '1,000 积分', 500, 1000),
('pack_5k', '5,000 积分', 2000, 5000),
('pack_20k', '20,000 积分', 6000, 20000),
('pack_100k', '100,000 积分', 25000, 100000)
ON CONFLICT (id) DO UPDATE SET price = EXCLUDED.price;
