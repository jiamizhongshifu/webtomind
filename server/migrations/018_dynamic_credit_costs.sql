-- Dynamic credit costs based on token usage
-- Migration: 018_dynamic_credit_costs.sql

SET search_path = public;

-- 1. Add token-based pricing columns to credit_costs
ALTER TABLE credit_costs 
ADD COLUMN IF NOT EXISTS pricing_type TEXT DEFAULT 'fixed' CHECK (pricing_type IN ('fixed', 'token_based')),
ADD COLUMN IF NOT EXISTS base_cost INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS input_token_rate DECIMAL(10, 6) DEFAULT 0,
ADD COLUMN IF NOT EXISTS output_token_rate DECIMAL(10, 6) DEFAULT 0,
ADD COLUMN IF NOT EXISTS min_cost INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS max_cost INTEGER DEFAULT NULL;

COMMENT ON COLUMN credit_costs.pricing_type IS '定价类型: fixed=固定积分, token_based=按token计费';
COMMENT ON COLUMN credit_costs.base_cost IS '基础积分消耗（token_based模式下的起步价）';
COMMENT ON COLUMN credit_costs.input_token_rate IS '输入token费率（每1000 token消耗的积分）';
COMMENT ON COLUMN credit_costs.output_token_rate IS '输出token费率（每1000 token消耗的积分）';
COMMENT ON COLUMN credit_costs.min_cost IS '最低消耗积分';
COMMENT ON COLUMN credit_costs.max_cost IS '最高消耗积分（NULL表示无上限）';

-- 2. Update existing actions to use token-based pricing for AI features
UPDATE credit_costs SET 
  pricing_type = 'token_based',
  base_cost = 0,
  input_token_rate = 0.001,   -- 1积分/1000输入token
  output_token_rate = 0.003,  -- 3积分/1000输出token
  min_cost = 1,
  max_cost = NULL
WHERE action IN ('ai_chat_basic', 'ai_chat_advanced');

-- AI高级模型费率更高
UPDATE credit_costs SET 
  input_token_rate = 0.005,   -- 5积分/1000输入token
  output_token_rate = 0.015   -- 15积分/1000输出token
WHERE action = 'ai_chat_advanced';

-- 图片生成保持固定价格
UPDATE credit_costs SET 
  pricing_type = 'fixed',
  base_cost = 10,
  min_cost = 10
WHERE action = 'image_generation';

-- 3. Insert NotebookLM feature costs (token-based for text, fixed for media)
INSERT INTO credit_costs (action, cost, description, category, is_active, pricing_type, base_cost, input_token_rate, output_token_rate, min_cost, max_cost) VALUES
-- 文本类功能：按token计费
('nlm_flashcards', 5, 'NotebookLM 闪卡生成', 'notebooklm', true, 'token_based', 2, 0.002, 0.006, 2, 20),
('nlm_mindmap', 5, 'NotebookLM 思维导图', 'notebooklm', true, 'token_based', 2, 0.002, 0.006, 2, 15),
('nlm_quiz', 8, 'NotebookLM 测验生成', 'notebooklm', true, 'token_based', 3, 0.003, 0.009, 3, 25),
('nlm_report', 10, 'NotebookLM 报告生成', 'notebooklm', true, 'token_based', 5, 0.004, 0.012, 5, 50),
('nlm_summary', 5, 'NotebookLM 摘要生成', 'notebooklm', true, 'token_based', 2, 0.002, 0.006, 2, 15),
('nlm_data_table', 8, 'NotebookLM 数据表格', 'notebooklm', true, 'token_based', 3, 0.003, 0.009, 3, 20),
-- 媒体类功能：固定价格（不涉及token）
('nlm_audio', 20, 'NotebookLM 音频概览', 'notebooklm', true, 'fixed', 20, 0, 0, 20, 20),
('nlm_video', 30, 'NotebookLM 视频概览', 'notebooklm', true, 'fixed', 30, 0, 0, 30, 30),
('nlm_infographic', 15, 'NotebookLM 信息图', 'notebooklm', true, 'fixed', 15, 0, 0, 15, 15),
('nlm_slide_deck', 20, 'NotebookLM 演示文稿', 'notebooklm', true, 'fixed', 20, 0, 0, 20, 20)
ON CONFLICT (action) DO UPDATE SET 
  cost = EXCLUDED.cost,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  is_active = EXCLUDED.is_active,
  pricing_type = EXCLUDED.pricing_type,
  base_cost = EXCLUDED.base_cost,
  input_token_rate = EXCLUDED.input_token_rate,
  output_token_rate = EXCLUDED.output_token_rate,
  min_cost = EXCLUDED.min_cost,
  max_cost = EXCLUDED.max_cost;

-- 4. Create function to calculate dynamic credit cost
CREATE OR REPLACE FUNCTION calculate_credit_cost(
  p_action TEXT,
  p_input_tokens INTEGER DEFAULT 0,
  p_output_tokens INTEGER DEFAULT 0
) RETURNS INTEGER AS $$
DECLARE
  v_config RECORD;
  v_calculated_cost DECIMAL;
  v_final_cost INTEGER;
BEGIN
  -- Get pricing config
  SELECT * INTO v_config FROM credit_costs WHERE action = p_action AND is_active = true;
  
  IF NOT FOUND THEN
    RETURN 1; -- Default cost if action not found
  END IF;
  
  -- Calculate based on pricing type
  IF v_config.pricing_type = 'fixed' THEN
    v_final_cost := v_config.cost;
  ELSE
    -- Token-based calculation
    v_calculated_cost := v_config.base_cost 
      + (p_input_tokens / 1000.0 * v_config.input_token_rate)
      + (p_output_tokens / 1000.0 * v_config.output_token_rate);
    
    -- Round up to nearest integer
    v_final_cost := CEIL(v_calculated_cost);
    
    -- Apply min/max constraints
    IF v_final_cost < v_config.min_cost THEN
      v_final_cost := v_config.min_cost;
    END IF;
    
    IF v_config.max_cost IS NOT NULL AND v_final_cost > v_config.max_cost THEN
      v_final_cost := v_config.max_cost;
    END IF;
  END IF;
  
  RETURN v_final_cost;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Update consume_credits RPC to support dynamic pricing
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
  v_credit_type TEXT;
  v_new_daily INTEGER;
  v_new_bonus INTEGER;
BEGIN
  -- 1. Get pricing config
  SELECT * INTO v_config FROM credit_costs WHERE action = p_action AND is_active = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_ACTION', 'message', '无效的操作类型');
  END IF;
  
  -- 2. Extract token counts from metadata (if provided)
  v_input_tokens := COALESCE((p_metadata->>'inputTokens')::INTEGER, 0);
  v_output_tokens := COALESCE((p_metadata->>'outputTokens')::INTEGER, 0);
  
  -- 3. Calculate cost
  v_cost := calculate_credit_cost(p_action, v_input_tokens, v_output_tokens);
  
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
  
  -- 9. Record transaction with token info
  INSERT INTO credit_transactions (
    user_id, type, credit_type, amount, balance_after, source, metadata
  ) VALUES (
    p_user_id, 'consume', v_credit_type, v_cost, v_new_daily + v_new_bonus, p_action,
    jsonb_build_object(
      'inputTokens', v_input_tokens,
      'outputTokens', v_output_tokens,
      'calculatedCost', v_cost,
      'pricingType', v_config.pricing_type
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
    ),
    'tokenUsage', jsonb_build_object(
      'input', v_input_tokens,
      'output', v_output_tokens
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION calculate_credit_cost TO authenticated;
GRANT EXECUTE ON FUNCTION consume_credits TO authenticated;
