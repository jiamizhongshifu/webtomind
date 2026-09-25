-- 增加 bonus 积分的存储过程
-- 用于支付完成、邀请奖励、手动充值等场景

SET search_path = public;

CREATE OR REPLACE FUNCTION add_bonus_credits(
    p_user_id UUID,
    p_amount INTEGER,
    p_source TEXT,
    p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS VOID AS $$
DECLARE
    v_current_bonus INTEGER;
BEGIN
    -- 1. 获取当前 bonus 积分并更新
    UPDATE user_credits 
    SET 
        bonus_credits = bonus_credits + p_amount,
        updated_at = NOW()
    WHERE user_id = p_user_id
    RETURNING bonus_credits INTO v_current_bonus;

    -- 2. 记录交易
    INSERT INTO credit_transactions (
        user_id,
        type,
        credit_type,
        amount,
        balance_after,
        source,
        metadata
    ) VALUES (
        p_user_id,
        'recharge',
        'bonus',
        p_amount,
        v_current_bonus + (SELECT daily_credits FROM user_credits WHERE user_id = p_user_id),
        p_source,
        p_metadata
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 邀请系统扩展
-- ============================================

-- 1. 为 profiles 增加邀请码列
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'referral_code') THEN
        ALTER TABLE profiles ADD COLUMN referral_code TEXT UNIQUE;
    END IF;
END $$;

-- 2. 生成唯一的 8 位邀请码函数
CREATE OR REPLACE FUNCTION generate_referral_code() RETURNS TEXT AS $$
DECLARE
    chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- 排除容易混淆的字符
    result TEXT := '';
    i INTEGER;
    found_code TEXT;
BEGIN
    LOOP
        result := '';
        FOR i IN 1..8 LOOP
            result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
        END LOOP;
        
        -- 检查是否重复
        SELECT referral_code INTO found_code FROM profiles WHERE referral_code = result;
        IF NOT FOUND THEN
            RETURN result;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 3. 确保新用户自动分配邀请码 (更新 existing handle_new_user)
-- 注意：这里假设 handle_new_user 在 001_auth_tables.sql 或 003_member_number.sql 中已定义
-- 我们重新定义它以包含邀请码
CREATE OR REPLACE FUNCTION handle_new_user() 
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, avatar_url, member_number, referral_code)
  VALUES (
    NEW.id, 
    NEW.raw_user_meta_data->>'full_name', 
    NEW.raw_user_meta_data->>'avatar_url',
    (SELECT COALESCE(MAX(member_number), 0) + 1 FROM public.profiles),
    generate_referral_code()
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 4. 处理邀请奖励的存储过程
CREATE OR REPLACE FUNCTION process_referral_reward(
    p_referrer_id UUID,
    p_referee_id UUID,
    p_reward_amount INTEGER
) RETURNS VOID AS $$
BEGIN
    -- A. 插入邀请记录
    INSERT INTO referrals (referrer_id, referee_id, status, reward_amount, completed_at)
    VALUES (p_referrer_id, p_referee_id, 'completed', p_reward_amount, NOW());

    -- B. 给邀请人加分
    PERFORM add_bonus_credits(
        p_referrer_id, 
        p_reward_amount, 
        'referral_reward', 
        jsonb_build_object('referee_id', p_referee_id)
    );

    -- C. 给被邀请人加分
    PERFORM add_bonus_credits(
        p_referee_id, 
        p_reward_amount, 
        'referred_welcome', 
        jsonb_build_object('referrer_id', p_referrer_id)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
