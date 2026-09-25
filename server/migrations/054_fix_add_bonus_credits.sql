-- Fix add_bonus_credits to ensure balance_after is never NULL
-- and to handle missing user_credits rows safely.

SET search_path = public;

-- Drop first to allow signature/default changes
DROP FUNCTION IF EXISTS add_bonus_credits(UUID, INTEGER, TEXT, JSONB);

CREATE OR REPLACE FUNCTION add_bonus_credits(
    p_user_id UUID,
    p_amount INTEGER,
    p_source TEXT,
    p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS VOID AS $$
DECLARE
    v_current_bonus INTEGER;
    v_current_daily INTEGER;
    v_tx_type TEXT;
BEGIN
    -- Map source to a valid transaction type
    v_tx_type := CASE
        WHEN p_source = 'subscription_reward' THEN 'subscription_grant'
        WHEN p_source IN ('referral_reward', 'referred_welcome') THEN 'referral_reward'
        ELSE 'purchase'
    END;

    -- Update existing credits row
    UPDATE user_credits
    SET
        bonus_credits = bonus_credits + p_amount,
        updated_at = NOW()
    WHERE user_id = p_user_id
    RETURNING bonus_credits, daily_credits
    INTO v_current_bonus, v_current_daily;

    -- If no row exists, initialize credits for this user
    IF NOT FOUND THEN
        INSERT INTO user_credits (
            user_id,
            daily_credits,
            daily_credits_max,
            bonus_credits,
            total_earned
        ) VALUES (
            p_user_id,
            300,
            300,
            p_amount,
            p_amount
        )
        RETURNING bonus_credits, daily_credits
        INTO v_current_bonus, v_current_daily;
    END IF;

    -- Record transaction with non-null balance_after
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
        v_tx_type,
        'bonus',
        p_amount,
        COALESCE(v_current_bonus, 0) + COALESCE(v_current_daily, 0),
        p_source,
        p_metadata
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

ALTER FUNCTION add_bonus_credits(UUID, INTEGER, TEXT, JSONB)
  SET search_path = public;
