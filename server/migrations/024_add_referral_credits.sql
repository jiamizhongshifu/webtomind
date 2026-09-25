-- 024_add_referral_credits.sql
-- 添加邀请积分字段，与会员积分分开记录

-- 1. 添加 referral_credits 字段
ALTER TABLE user_credits ADD COLUMN IF NOT EXISTS referral_credits INTEGER DEFAULT 0;

-- 2. 添加注释说明字段用途
COMMENT ON COLUMN user_credits.referral_credits IS '通过邀请好友获得的积分';
COMMENT ON COLUMN user_credits.bonus_credits IS '会员订阅赠送积分 + 其他奖励积分';

-- 3. 对于现有用户，如果 bonus_credits 小于等于 300，可能是邀请积分，迁移到 referral_credits
-- 注意：这里只是初始化为 0，之后的邀请积分会正确累加
-- UPDATE user_credits SET referral_credits = 0 WHERE referral_credits IS NULL;
