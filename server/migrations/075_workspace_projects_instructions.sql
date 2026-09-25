-- 075_workspace_projects_instructions.sql
-- 给 workspace_projects 加 instructions 字段,支持 ChatGPT-style 项目级
-- 自定义指令。该项目所有 Agent 对话调用时,该指令会被注入到 system prompt 顶部。
--
-- 设计:
-- - 字段类型 TEXT,允许为空(用户没设指令)
-- - 不加 NOT NULL / 不加 DEFAULT (省得给已有项目刷数据)
-- - 不加索引 (按 id 查 instructions,无需独立索引)
-- - 不改 RLS (现有 "users can update own projects" 已覆盖)

ALTER TABLE workspace_projects
  ADD COLUMN IF NOT EXISTS instructions TEXT;

COMMENT ON COLUMN workspace_projects.instructions IS
  'ChatGPT-style 项目级自定义指令。该项目内所有 Agent 对话会把此文本 prepend 到 system prompt。max 8000 chars 由应用层约束。';
