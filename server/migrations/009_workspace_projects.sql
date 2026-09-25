-- ============================================
-- Phase 7: 项目制架构 (Workspace Projects/Boards)
-- 引入"项目/空间"概念，解决素材分类问题
-- ============================================

-- ============================================
-- 1. 创建 workspace_projects 表
-- ============================================
CREATE TABLE IF NOT EXISTS workspace_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  icon VARCHAR(50) DEFAULT '📁',
  color VARCHAR(20) DEFAULT '#6366f1', -- 项目主题色
  is_default BOOLEAN DEFAULT FALSE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 每用户只能有一个默认项目
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_user_default 
  ON workspace_projects(user_id) WHERE is_default = TRUE;

-- 用户项目列表索引
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON workspace_projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_sort ON workspace_projects(user_id, sort_order);

-- ============================================
-- 2. 为 summaries 添加 project_id
-- ============================================
ALTER TABLE summaries ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES workspace_projects(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_summaries_project_id ON summaries(project_id);

-- ============================================
-- 3. 为 conversations 添加 project_id
-- ============================================
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES workspace_projects(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_project_id ON conversations(project_id);

-- ============================================
-- 4. updated_at 触发器
-- ============================================
DROP TRIGGER IF EXISTS update_workspace_projects_updated_at ON workspace_projects;
CREATE TRIGGER update_workspace_projects_updated_at 
  BEFORE UPDATE ON workspace_projects 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 5. 新用户自动创建默认项目 (Mind)
-- ============================================
CREATE OR REPLACE FUNCTION handle_new_user_default_project()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.workspace_projects (user_id, name, icon, is_default, sort_order)
  VALUES (NEW.id, 'Mind', '🧠', TRUE, 0)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created_default_project ON auth.users;
CREATE TRIGGER on_auth_user_created_default_project
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user_default_project();

-- ============================================
-- 6. 现有用户数据迁移
-- ============================================
-- 为所有现有用户创建 Mind 项目（如果没有）
INSERT INTO workspace_projects (user_id, name, icon, is_default, sort_order)
SELECT DISTINCT user_id, 'Mind', '🧠', TRUE, 0
FROM summaries
WHERE user_id IS NOT NULL
  AND user_id NOT IN (SELECT user_id FROM workspace_projects WHERE is_default = TRUE)
ON CONFLICT DO NOTHING;

-- 将现有素材关联到用户的默认项目
UPDATE summaries s
SET project_id = (
  SELECT id FROM workspace_projects wp 
  WHERE wp.user_id = s.user_id AND wp.is_default = TRUE
)
WHERE s.project_id IS NULL AND s.user_id IS NOT NULL;

-- 将现有对话关联到用户的默认项目
UPDATE conversations c
SET project_id = (
  SELECT id FROM workspace_projects wp 
  WHERE wp.user_id = c.user_id AND wp.is_default = TRUE
)
WHERE c.project_id IS NULL AND c.user_id IS NOT NULL;

-- ============================================
-- 7. RLS 安全策略
-- ============================================
ALTER TABLE workspace_projects ENABLE ROW LEVEL SECURITY;

-- 用户只能查看自己的项目
DROP POLICY IF EXISTS "Users can view own projects" ON workspace_projects;
CREATE POLICY "Users can view own projects" ON workspace_projects
  FOR SELECT USING (auth.uid() = user_id);

-- 用户只能创建自己的项目
DROP POLICY IF EXISTS "Users can insert own projects" ON workspace_projects;
CREATE POLICY "Users can insert own projects" ON workspace_projects
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 用户只能更新自己的项目
DROP POLICY IF EXISTS "Users can update own projects" ON workspace_projects;
CREATE POLICY "Users can update own projects" ON workspace_projects
  FOR UPDATE USING (auth.uid() = user_id);

-- 用户只能删除自己的项目（但不能删除默认项目）
DROP POLICY IF EXISTS "Users can delete own non-default projects" ON workspace_projects;
CREATE POLICY "Users can delete own non-default projects" ON workspace_projects
  FOR DELETE USING (auth.uid() = user_id AND is_default = FALSE);

-- ============================================
-- 8. 统计函数：获取项目素材数量
-- ============================================
CREATE OR REPLACE FUNCTION get_project_stats(p_project_id UUID)
RETURNS TABLE (
  summary_count BIGINT,
  conversation_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    (SELECT COUNT(*) FROM summaries WHERE project_id = p_project_id),
    (SELECT COUNT(*) FROM conversations WHERE project_id = p_project_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
