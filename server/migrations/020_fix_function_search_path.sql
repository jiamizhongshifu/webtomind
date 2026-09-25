-- Fix function search_path for security
-- Migration: 020_fix_function_search_path.sql

-- 1. Fix calculate_credit_cost function
CREATE OR REPLACE FUNCTION public.calculate_credit_cost(
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
  SELECT * INTO v_config FROM public.credit_costs WHERE action = p_action AND is_active = true;
  
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2. Fix consume_credits function
CREATE OR REPLACE FUNCTION public.consume_credits(
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
  SELECT * INTO v_config FROM public.credit_costs WHERE action = p_action AND is_active = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_ACTION', 'message', '无效的操作类型');
  END IF;
  
  -- 2. Extract token counts from metadata (if provided)
  v_input_tokens := COALESCE((p_metadata->>'inputTokens')::INTEGER, 0);
  v_output_tokens := COALESCE((p_metadata->>'outputTokens')::INTEGER, 0);
  
  -- 3. Calculate cost
  v_cost := public.calculate_credit_cost(p_action, v_input_tokens, v_output_tokens);
  
  -- 4. Get user credits
  SELECT * INTO v_user_credits FROM public.user_credits WHERE user_id = p_user_id FOR UPDATE;
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
  UPDATE public.user_credits SET
    daily_credits = v_new_daily,
    bonus_credits = v_new_bonus,
    total_consumed = total_consumed + v_cost,
    daily_image_gen_used = CASE WHEN p_action = 'image_generation' THEN daily_image_gen_used + 1 ELSE daily_image_gen_used END,
    updated_at = NOW()
  WHERE user_id = p_user_id;
  
  -- 9. Record transaction with token info
  INSERT INTO public.credit_transactions (
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.calculate_credit_cost TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_credits TO authenticated;
