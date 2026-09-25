-- 项目归档功能
-- 为 workspace_projects 表添加 archived_at 字段

ALTER TABLE workspace_projects
ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ DEFAULT NULL;

-- 添加索引以优化按归档状态查询
CREATE INDEX IF NOT EXISTS idx_workspace_projects_archived 
ON workspace_projects(user_id, archived_at);

COMMENT ON COLUMN workspace_projects.archived_at IS '归档时间，NULL 表示未归档';
