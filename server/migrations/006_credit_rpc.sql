-- 积分通过存储过程消耗，确保原子性
-- 用于 AI 对话、图片生成、素材保存等所有扣费场景

SET search_path = public;

CREATE OR REPLACE FUNCTION consume_credits(
    p_user_id UUID,
    p_action TEXT,
    p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS JSONB AS $$
DECLARE
    v_cost INTEGER;
    v_daily_credits INTEGER;
    v_daily_credits_max INTEGER;
    v_bonus_credits INTEGER;
    v_daily_image_gen_used INTEGER;
    v_daily_image_gen_max INTEGER;
    v_last_daily_refresh DATE;
    v_today DATE := CURRENT_DATE;
    v_total_available INTEGER;
    v_daily_deduct INTEGER := 0;
    v_bonus_deduct INTEGER := 0;
    v_has_active_sub BOOLEAN;
    v_new_daily_credits INTEGER;
    v_new_bonus_credits INTEGER;
    v_new_total INTEGER;
    v_credit_type TEXT;
BEGIN
    -- 1. 获取消耗分值
    SELECT cost INTO v_cost FROM credit_costs WHERE action = p_action AND is_active = true;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_ACTION', 'message', '无效的操作类型');
    END IF;

    -- 2. 获取用户余额信息并加锁 (FOR UPDATE)
    SELECT 
        daily_credits, daily_credits_max, bonus_credits, 
        daily_image_gen_used, daily_image_gen_max, last_daily_refresh
    INTO 
        v_daily_credits, v_daily_credits_max, v_bonus_credits, 
        v_daily_image_gen_used, v_daily_image_gen_max, v_last_daily_refresh
    FROM user_credits 
    WHERE user_id = p_user_id 
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'USER_NOT_FOUND', 'message', '用户积分账户不存在');
    END IF;

    -- 3. 判断是否需要跨天刷新
    IF v_last_daily_refresh IS NULL OR v_last_daily_refresh < v_today THEN
        v_daily_credits := v_daily_credits_max;
        v_daily_image_gen_used := 0;
        v_last_daily_refresh := v_today;
    END IF;

    -- 4. 特殊配额检查：图片生成
    IF p_action = 'image_generation' THEN
        -- 检查是否有活跃会员
        SELECT EXISTS (
            SELECT 1 FROM user_subscriptions 
            WHERE user_id = p_user_id AND status = 'active'
        ) INTO v_has_active_sub;

        -- 免费用户检查每日上限
        IF NOT v_has_active_sub AND v_daily_image_gen_used >= v_daily_image_gen_max THEN
            RETURN jsonb_build_object(
                'success', false, 
                'error', 'QUOTA_EXCEEDED', 
                'message', '今日图片生成配额已用尽',
                'used', v_daily_image_gen_used,
                'max', v_daily_image_gen_max
            );
        END IF;
    END IF;

    -- 5. 余额检查
    v_total_available := v_daily_credits + v_bonus_credits;
    IF v_total_available < v_cost THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'INSUFFICIENT_CREDITS', 
            'message', '余额不足',
            'required', v_cost,
            'current', v_total_available
        );
    END IF;

    -- 6. 计算扣除逻辑（每日积分优先）
    IF v_daily_credits >= v_cost THEN
        v_daily_deduct := v_cost;
        v_credit_type := 'daily';
    ELSE
        v_daily_deduct := v_daily_credits;
        v_bonus_deduct := v_cost - v_daily_credits;
        v_credit_type := 'bonus';
    END IF;

    v_new_daily_credits := v_daily_credits - v_daily_deduct;
    v_new_bonus_credits := v_bonus_credits - v_bonus_deduct;
    v_new_total := v_new_daily_credits + v_new_bonus_credits;

    -- 7. 执行更新
    UPDATE user_credits 
    SET 
        daily_credits = v_new_daily_credits,
        bonus_credits = v_new_bonus_credits,
        daily_image_gen_used = CASE WHEN p_action = 'image_generation' THEN v_daily_image_gen_used + 1 ELSE v_daily_image_gen_used END,
        total_consumed = total_consumed + v_cost,
        last_daily_refresh = v_last_daily_refresh,
        updated_at = NOW()
    WHERE user_id = p_user_id;

    -- 8. 记录交易日志
    INSERT INTO credit_transactions (
        user_id, type, credit_type, amount, balance_after, source, metadata
    ) VALUES (
        p_user_id, 'usage', v_credit_type, -v_cost, v_new_total, p_action, p_metadata
    );

    -- 9. 返回成功状态
    RETURN jsonb_build_object(
        'success', true,
        'consumed', v_cost,
        'credit_type', v_credit_type,
        'balance', jsonb_build_object(
            'daily', v_new_daily_credits,
            'bonus', v_new_bonus_credits,
            'total', v_new_total
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
