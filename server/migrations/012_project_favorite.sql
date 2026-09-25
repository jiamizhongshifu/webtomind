-- 项目收藏功能
-- 为 workspace_projects 表添加 favorited_at 字段

ALTER TABLE workspace_projects
ADD COLUMN IF NOT EXISTS favorited_at TIMESTAMPTZ DEFAULT NULL;

-- 添加索引以优化按收藏状态查询
CREATE INDEX IF NOT EXISTS idx_workspace_projects_favorited 
ON workspace_projects(user_id, favorited_at);

COMMENT ON COLUMN workspace_projects.favorited_at IS '收藏时间，NULL 表示未收藏';
