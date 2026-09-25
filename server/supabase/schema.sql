-- AI Mind Mapper - Supabase 数据库表结构
-- 在 Supabase SQL Editor 中执行此脚本

-- ============================================
-- 总结/笔记表
-- ============================================
CREATE TABLE IF NOT EXISTS summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  url TEXT NOT NULL DEFAULT 'note://local',
  markdown TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  content_type TEXT, -- 内容类型: article, image, video
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_summaries_created_at ON summaries(created_at DESC);

-- 自动更新 updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_summaries_updated_at
  BEFORE UPDATE ON summaries
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 快捷指令表
-- ============================================
CREATE TABLE IF NOT EXISTS shortcuts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  prompt TEXT NOT NULL,
  reference_ids TEXT[] DEFAULT '{}',
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_shortcuts_sort_order ON shortcuts(sort_order ASC);

CREATE TRIGGER update_shortcuts_updated_at
  BEFORE UPDATE ON shortcuts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 笔记保存记录表（Agent 工具使用）
-- ============================================
CREATE TABLE IF NOT EXISTS notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  source_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notes_created_at ON notes(created_at DESC);

-- ============================================
-- 启用 Row Level Security (RLS)
-- ============================================
ALTER TABLE summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE shortcuts ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS 策略配置（用户数据隔离）
-- 注意：完整的 RLS 策略在 migrations/001_auth_tables.sql 中定义
-- ============================================

-- notes 表暂时保持开放（未添加 user_id 字段）
CREATE POLICY "Allow all access to notes" ON notes FOR ALL USING (true);

-- ============================================
-- 插入示例数据
-- ============================================
INSERT INTO summaries (title, url, markdown, tags) VALUES (
  '欢迎使用 AI Mind Mapper',
  'https://example.com',
  '# 欢迎使用 AI Mind Mapper

## 功能介绍

- **智能总结**: 一键将网页内容转换为思维导图
- **AI 对话**: 与 AI 助手交流，深入理解内容
- **笔记管理**: 保存和整理你的知识库

## 开始使用

1. 在任意网页点击扩展图标
2. 点击"总结当前页面"
3. 查看生成的思维导图

祝你使用愉快！',
  ARRAY['教程', '入门']
) ON CONFLICT DO NOTHING;
