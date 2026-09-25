-- 067_user_skill_settings.sql
-- 用户技能配置持久化表
-- 用于保存用户对特定技能的个性化设置（如 Builders Daily Brief 的订阅配置）

CREATE TABLE IF NOT EXISTS user_skill_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  skill_id TEXT NOT NULL,
  settings JSONB NOT NULL DEFAULT '{}',
  enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, skill_id)
);

CREATE INDEX IF NOT EXISTS idx_user_skill_settings_user_id
  ON user_skill_settings(user_id);

CREATE INDEX IF NOT EXISTS idx_user_skill_settings_skill_enabled
  ON user_skill_settings(skill_id, enabled) WHERE enabled = true;

-- RLS 策略：用户只能读写自己的设置
ALTER TABLE user_skill_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_skill_settings_select ON user_skill_settings
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY user_skill_settings_insert ON user_skill_settings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY user_skill_settings_update ON user_skill_settings
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY user_skill_settings_delete ON user_skill_settings
  FOR DELETE USING (auth.uid() = user_id);

-- 自动更新 updated_at
CREATE OR REPLACE FUNCTION update_user_skill_settings_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_user_skill_settings_updated_at
  BEFORE UPDATE ON user_skill_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_user_skill_settings_updated_at();
