-- ============================================
-- 基础设施工具积分配置 + 动态计费支持
-- 注册 grok_x_search 和 e2b_execute 的积分消耗
-- ============================================

SET search_path = public;

-- ============================================
-- 0. ??? pricing_type ????? dynamic
-- ============================================

DO $$
BEGIN
  ALTER TABLE credit_costs DROP CONSTRAINT IF EXISTS credit_costs_pricing_type_check;
  ALTER TABLE credit_costs ADD CONSTRAINT credit_costs_pricing_type_check
    CHECK (pricing_type IN ('fixed', 'token_based', 'dynamic'));
EXCEPTION
  WHEN others THEN
    NULL;
END $$;



-- ============================================
-- 1. 工具积分配置
-- ============================================

-- Grok X 搜索（使用 grok-3-mini 模型，固定 15 积分/次）
-- 成本估算: 500 input + 2000 output tokens ≈ $0.01/次
INSERT INTO credit_costs (action, cost, description, category, is_active, pricing_type, base_cost, input_token_rate, output_token_rate, min_cost, max_cost)
VALUES ('grok_x_search', 15, 'Twitter/X 热帖搜索', 'ai', true, 'fixed', 15, 0, 0, 15, 15)
ON CONFLICT (action) DO UPDATE SET
  cost = EXCLUDED.cost,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  is_active = EXCLUDED.is_active,
  pricing_type = EXCLUDED.pricing_type,
  base_cost = EXCLUDED.base_cost,
  min_cost = EXCLUDED.min_cost,
  max_cost = EXCLUDED.max_cost;

-- E2B 脚本执行（动态计费：基础 2 积分 + 0.2 积分/秒，最低 3，最高 50）
-- 成本估算: E2B $0.000128/秒，30秒执行 ≈ $0.004
-- 计费公式: base(2) + seconds * 0.2, min=3, max=50
-- 实际计费在中间件中计算，数据库只存储基础配置
INSERT INTO credit_costs (action, cost, description, category, is_active, pricing_type, base_cost, input_token_rate, output_token_rate, min_cost, max_cost)
VALUES ('e2b_execute', 3, '云端脚本执行（按时长计费）', 'ai', true, 'dynamic', 2, 0.2, 0, 3, 50)
ON CONFLICT (action) DO UPDATE SET
  cost = EXCLUDED.cost,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  is_active = EXCLUDED.is_active,
  pricing_type = EXCLUDED.pricing_type,
  base_cost = EXCLUDED.base_cost,
  input_token_rate = EXCLUDED.input_token_rate,  -- 复用为 perSecondCredits
  output_token_rate = EXCLUDED.output_token_rate,
  min_cost = EXCLUDED.min_cost,
  max_cost = EXCLUDED.max_cost;

-- 图片生成（动态计费：按尺寸收费，降价 30%）
-- 成本估算: Gemini 3 Pro Image
--   1K/2K: 1120 tokens → $0.134/张 → 原 225 积分，降 30% → 160 积分
--   4K: 2000 tokens → $0.24/张 → 原 400 积分，降 30% → 280 积分
-- 数据库存储默认值，实际计费在中间件中根据 imageSize 动态计算
UPDATE credit_costs SET
  cost = 160,
  description = '图片生成（按尺寸计费：1K/2K=160, 4K=280）',
  pricing_type = 'dynamic',
  base_cost = 160,
  min_cost = 160,
  max_cost = 280
WHERE action = 'image_generation';

-- ============================================
-- 2. 更新 consume_credits RPC 支持动态计费
-- ============================================

CREATE OR REPLACE FUNCTION consume_credits(
  p_user_id UUID,
  p_action TEXT,
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS JSONB AS $$
DECLARE
  v_config RECORD;
  v_user_credits RECORD;
  v_cost INTEGER;
  v_input_tokens INTEGER;
  v_output_tokens INTEGER;
  v_dynamic_credits INTEGER;
  v_credit_type TEXT;
  v_new_daily INTEGER;
  v_new_bonus INTEGER;
BEGIN
  -- 1. Get pricing config
  SELECT * INTO v_config FROM credit_costs WHERE action = p_action AND is_active = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_ACTION', 'message', '无效的操作类型');
  END IF;

  -- 2. Extract dynamic credits from metadata (for tools like e2b_execute)
  v_dynamic_credits := (p_metadata->>'dynamicCredits')::INTEGER;

  -- 3. Calculate cost
  IF v_dynamic_credits IS NOT NULL AND v_dynamic_credits > 0 THEN
    -- 使用中间件计算的动态积分，但仍受 min/max 限制
    v_cost := LEAST(GREATEST(v_dynamic_credits, v_config.min_cost), COALESCE(v_config.max_cost, v_dynamic_credits));
  ELSE
    -- 使用原有的 token 计费逻辑
    v_input_tokens := COALESCE((p_metadata->>'inputTokens')::INTEGER, 0);
    v_output_tokens := COALESCE((p_metadata->>'outputTokens')::INTEGER, 0);
    v_cost := calculate_credit_cost(p_action, v_input_tokens, v_output_tokens);
  END IF;

  -- 4. Get user credits
  SELECT * INTO v_user_credits FROM user_credits WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'USER_NOT_FOUND', 'message', '用户不存在');
  END IF;

  -- 5. Check if user has enough credits
  IF (v_user_credits.daily_credits + v_user_credits.bonus_credits) < v_cost THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INSUFFICIENT_CREDITS',
      'required', v_cost,
      'current', v_user_credits.daily_credits + v_user_credits.bonus_credits
    );
  END IF;

  -- 6. Check quota for image generation
  IF p_action = 'image_generation' THEN
    IF v_user_credits.daily_image_gen_used >= v_user_credits.daily_image_gen_max THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'QUOTA_EXCEEDED',
        'feature', 'image_generation',
        'used', v_user_credits.daily_image_gen_used,
        'max', v_user_credits.daily_image_gen_max
      );
    END IF;
  END IF;

  -- 7. Deduct credits (daily first, then bonus)
  IF v_user_credits.daily_credits >= v_cost THEN
    v_new_daily := v_user_credits.daily_credits - v_cost;
    v_new_bonus := v_user_credits.bonus_credits;
    v_credit_type := 'daily';
  ELSE
    v_new_daily := 0;
    v_new_bonus := v_user_credits.bonus_credits - (v_cost - v_user_credits.daily_credits);
    v_credit_type := 'bonus';
  END IF;

  -- 8. Update user credits
  UPDATE user_credits SET
    daily_credits = v_new_daily,
    bonus_credits = v_new_bonus,
    total_consumed = total_consumed + v_cost,
    daily_image_gen_used = CASE WHEN p_action = 'image_generation' THEN daily_image_gen_used + 1 ELSE daily_image_gen_used END,
    updated_at = NOW()
  WHERE user_id = p_user_id;

  -- 9. Record transaction
  INSERT INTO credit_transactions (
    user_id, type, credit_type, amount, balance_after, source, metadata
  ) VALUES (
    p_user_id, 'usage', v_credit_type, -v_cost, v_new_daily + v_new_bonus, p_action,
    jsonb_build_object(
      'calculatedCost', v_cost,
      'pricingType', v_config.pricing_type,
      'isDynamic', v_dynamic_credits IS NOT NULL
    ) || COALESCE(p_metadata, '{}'::jsonb)
  );

  RETURN jsonb_build_object(
    'success', true,
    'consumed', v_cost,
    'credit_type', v_credit_type,
    'balance', jsonb_build_object(
      'daily', v_new_daily,
      'bonus', v_new_bonus,
      'total', v_new_daily + v_new_bonus
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION consume_credits TO authenticated;
