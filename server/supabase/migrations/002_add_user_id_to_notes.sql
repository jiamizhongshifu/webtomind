-- 迁移: 为 notes 表添加 user_id 字段
-- 日期: 2026-01-11
-- 说明: 支持用户级数据隔离，强制登录模式

-- ============================================
-- 1. 添加 user_id 列
-- ============================================
ALTER TABLE notes
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- 添加 updated_at 列
ALTER TABLE notes
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ============================================
-- 2. 创建索引
-- ============================================
CREATE INDEX IF NOT EXISTS idx_notes_user_id ON notes(user_id);
CREATE INDEX IF NOT EXISTS idx_notes_user_created ON notes(user_id, created_at DESC);

-- ============================================
-- 3. 添加自动更新 updated_at 触发器
-- ============================================
CREATE TRIGGER update_notes_updated_at
  BEFORE UPDATE ON notes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 4. 更新 RLS 策略 (强制登录模式)
-- ============================================

-- 删除旧的开放策略
DROP POLICY IF EXISTS "Allow all access to notes" ON notes;

-- 用户只能查看自己的笔记
CREATE POLICY "Users can view own notes" ON notes
  FOR SELECT
  USING (auth.uid() = user_id);

-- 用户只能创建自己的笔记
CREATE POLICY "Users can create own notes" ON notes
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 用户只能更新自己的笔记
CREATE POLICY "Users can update own notes" ON notes
  FOR UPDATE
  USING (auth.uid() = user_id);

-- 用户只能删除自己的笔记
CREATE POLICY "Users can delete own notes" ON notes
  FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- 5. 服务角色访问策略 (后端 API 使用)
-- ============================================

-- 服务角色可以执行所有操作 (用于后端 API)
CREATE POLICY "Service role has full access to notes" ON notes
  FOR ALL
  USING (auth.role() = 'service_role');
