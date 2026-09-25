-- Migration: Fix image quota daily refresh and increase free user limit to 10
-- 1. consume_credits was missing daily refresh logic (lost in 028 migration)
-- 2. Free users should have 10 daily image generations, not 2

SET search_path = public;

-- 1. Update all existing free users to have daily_image_gen_max = 10
UPDATE public.user_credits 
SET daily_image_gen_max = 10
WHERE daily_image_gen_max = 2
  AND user_id NOT IN (
    SELECT user_id FROM public.user_subscriptions WHERE status = 'active'
  );

-- 2. Fix consume_credits to include daily refresh logic
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
  v_has_active_sub BOOLEAN;
  v_today DATE := CURRENT_DATE;
  v_daily_credits INTEGER;
  v_daily_image_gen_used INTEGER;
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
  
  -- 4. Get user credits with lock
  SELECT * INTO v_user_credits FROM public.user_credits WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'USER_NOT_FOUND', 'message', '用户不存在');
  END IF;
  
  -- 5. Check if daily refresh is needed (NEW DAY)
  v_daily_credits := v_user_credits.daily_credits;
  v_daily_image_gen_used := v_user_credits.daily_image_gen_used;
  
  IF v_user_credits.last_daily_refresh IS NULL OR v_user_credits.last_daily_refresh < v_today THEN
    -- Reset daily credits and image gen count
    v_daily_credits := v_user_credits.daily_credits_max;
    v_daily_image_gen_used := 0;
    
    -- Update the refresh date immediately
    UPDATE public.user_credits SET
      daily_credits = v_daily_credits,
      daily_image_gen_used = 0,
      last_daily_refresh = v_today,
      updated_at = NOW()
    WHERE user_id = p_user_id;
  END IF;
  
  -- 6. Check if user has enough credits
  IF (v_daily_credits + v_user_credits.bonus_credits) < v_cost THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'INSUFFICIENT_CREDITS',
      'required', v_cost,
      'current', v_daily_credits + v_user_credits.bonus_credits
    );
  END IF;
  
  -- 7. Check quota for image generation (FREE USERS ONLY)
  IF p_action = 'image_generation' THEN
    -- Check if user has active subscription
    SELECT EXISTS (
      SELECT 1 FROM public.user_subscriptions 
      WHERE user_id = p_user_id AND status = 'active'
    ) INTO v_has_active_sub;
    
    -- Only enforce quota for free users
    IF NOT v_has_active_sub AND v_daily_image_gen_used >= v_user_credits.daily_image_gen_max THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'QUOTA_EXCEEDED',
        'feature', 'image_generation',
        'used', v_daily_image_gen_used,
        'max', v_user_credits.daily_image_gen_max
      );
    END IF;
  END IF;
  
  -- 8. Deduct credits (daily first, then bonus)
  IF v_daily_credits >= v_cost THEN
    v_new_daily := v_daily_credits - v_cost;
    v_new_bonus := v_user_credits.bonus_credits;
    v_credit_type := 'daily';
  ELSE
    v_new_daily := 0;
    v_new_bonus := v_user_credits.bonus_credits - (v_cost - v_daily_credits);
    v_credit_type := 'bonus';
  END IF;
  
  -- 9. Update user credits
  UPDATE public.user_credits SET
    daily_credits = v_new_daily,
    bonus_credits = v_new_bonus,
    total_consumed = total_consumed + v_cost,
    daily_image_gen_used = CASE WHEN p_action = 'image_generation' THEN v_daily_image_gen_used + 1 ELSE v_daily_image_gen_used END,
    last_daily_refresh = v_today,
    updated_at = NOW()
  WHERE user_id = p_user_id;
  
  -- 10. Record transaction with token info
  INSERT INTO public.credit_transactions (
    user_id, type, credit_type, amount, balance_after, source, metadata
  ) VALUES (
    p_user_id, 'consume', v_credit_type, v_cost, v_new_daily + v_new_bonus, p_action,
    jsonb_build_object(
      'input_tokens', v_input_tokens,
      'output_tokens', v_output_tokens,
      'calculated_cost', v_cost
    ) || p_metadata
  );
  
  -- 11. Return success
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
