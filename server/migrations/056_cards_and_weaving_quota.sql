-- v1.3: Cards table + weaving quota

SET search_path = public;

CREATE TABLE IF NOT EXISTS cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES workspace_projects(id) ON DELETE CASCADE,
  type VARCHAR(32) NOT NULL CHECK (type IN ('source', 'note', 'ai_gen', 'insight')),
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  meta_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  position DOUBLE PRECISION NOT NULL DEFAULT 0,
  parent_id UUID NULL REFERENCES cards(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cards_project_id ON cards(project_id);
CREATE INDEX IF NOT EXISTS idx_cards_project_position ON cards(project_id, position);
CREATE INDEX IF NOT EXISTS idx_cards_parent_id ON cards(parent_id);

CREATE OR REPLACE FUNCTION set_cards_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cards_updated_at ON cards;
CREATE TRIGGER trg_cards_updated_at
  BEFORE UPDATE ON cards
  FOR EACH ROW
  EXECUTE FUNCTION set_cards_updated_at();

ALTER TABLE cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cards_select ON cards;
CREATE POLICY cards_select ON cards
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM workspace_projects wp
      WHERE wp.id = cards.project_id
        AND wp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS cards_insert ON cards;
CREATE POLICY cards_insert ON cards
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM workspace_projects wp
      WHERE wp.id = cards.project_id
        AND wp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS cards_update ON cards;
CREATE POLICY cards_update ON cards
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM workspace_projects wp
      WHERE wp.id = cards.project_id
        AND wp.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM workspace_projects wp
      WHERE wp.id = cards.project_id
        AND wp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS cards_delete ON cards;
CREATE POLICY cards_delete ON cards
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM workspace_projects wp
      WHERE wp.id = cards.project_id
        AND wp.user_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION consume_weaving_quota(
  p_user_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_today DATE := CURRENT_DATE;
  v_subscription RECORD;
  v_is_member BOOLEAN := false;
  v_used INTEGER := 0;
  v_max INTEGER := 5;
  v_user_credits RECORD;
  v_balance_after INTEGER := 0;
BEGIN
  SELECT * INTO v_subscription
  FROM user_subscriptions
  WHERE user_id = p_user_id
    AND status IN ('active', 'trialing', 'past_due', 'canceled')
  ORDER BY current_period_start DESC
  LIMIT 1;

  IF FOUND THEN
    IF v_subscription.status IN ('active', 'trialing', 'past_due') THEN
      v_is_member := true;
    ELSIF v_subscription.status = 'canceled'
      AND v_subscription.current_period_end::date >= v_today THEN
      v_is_member := true;
    END IF;
  END IF;

  IF v_is_member THEN
    RETURN jsonb_build_object(
      'success', true,
      'is_member', true,
      'used', 0,
      'max', -1
    );
  END IF;

  SELECT COUNT(*)::INTEGER INTO v_used
  FROM credit_transactions
  WHERE user_id = p_user_id
    AND source = 'weaving_generation'
    AND created_at::date = v_today;

  IF v_used >= v_max THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'QUOTA_EXCEEDED',
      'feature', 'weaving_generation',
      'used', v_used,
      'max', v_max
    );
  END IF;

  SELECT * INTO v_user_credits
  FROM user_credits
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF FOUND THEN
    v_balance_after := COALESCE(v_user_credits.daily_credits, 0) + COALESCE(v_user_credits.bonus_credits, 0);
  END IF;

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
    'usage',
    'daily',
    0,
    v_balance_after,
    'weaving_generation',
    jsonb_build_object('quotaOnly', true)
  );

  RETURN jsonb_build_object(
    'success', true,
    'is_member', false,
    'used', v_used + 1,
    'max', v_max
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION consume_weaving_quota(UUID) TO authenticated;
