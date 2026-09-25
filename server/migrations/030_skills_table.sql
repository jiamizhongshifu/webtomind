-- ============================================
-- Skills 表（快捷指令的迭代版本）
-- 支持 Claude Agent 的 Skill 系统
-- ============================================

-- 创建 skills 表
CREATE TABLE IF NOT EXISTS skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- 基础信息
  name VARCHAR(100) NOT NULL,
  display_name VARCHAR(200),
  description TEXT,
  icon VARCHAR(50) DEFAULT '🔧',
  
  -- Skill 定义（核心）
  triggers TEXT[] NOT NULL DEFAULT '{}',           -- 触发词列表
  core_instructions TEXT NOT NULL,                  -- 核心指令（Markdown）
  
  -- 关联配置
  output_type VARCHAR(50),                          -- 关联的输出类型（如 flashcards, mindmap 等）
  associated_tools TEXT[] DEFAULT '{}',             -- 关联的工具名称
  default_options JSONB DEFAULT '{}',               -- 默认选项
  
  -- 分类和排序
  category VARCHAR(50) DEFAULT 'custom',            -- 类别：custom, content, search, export 等
  priority INTEGER DEFAULT 50,                      -- 优先级（0-100）
  sort_order INTEGER DEFAULT 0,                     -- 排序顺序
  
  -- 状态
  is_active BOOLEAN DEFAULT TRUE,                   -- 是否启用
  is_public BOOLEAN DEFAULT FALSE,                  -- 是否公开（未来社区分享）
  
  -- 统计
  use_count INTEGER DEFAULT 0,                      -- 使用次数
  
  -- 时间戳
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- 唯一约束：同一用户不能有重名 skill
  UNIQUE(user_id, name)
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_skills_user_id ON skills(user_id);
CREATE INDEX IF NOT EXISTS idx_skills_triggers ON skills USING GIN(triggers);
CREATE INDEX IF NOT EXISTS idx_skills_category ON skills(category);
CREATE INDEX IF NOT EXISTS idx_skills_is_active ON skills(is_active);
CREATE INDEX IF NOT EXISTS idx_skills_sort_order ON skills(sort_order ASC);

-- 更新时间触发器
CREATE TRIGGER update_skills_updated_at
  BEFORE UPDATE ON skills
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- RLS 策略
-- ============================================
ALTER TABLE skills ENABLE ROW LEVEL SECURITY;

-- 用户可以查看自己的 skills 和公开的 skills
CREATE POLICY "skills_select" ON skills
  FOR SELECT USING (
    auth.uid() = user_id OR is_public = TRUE
  );

-- 用户只能创建自己的 skills
CREATE POLICY "skills_insert" ON skills
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 用户只能更新自己的 skills
CREATE POLICY "skills_update" ON skills
  FOR UPDATE USING (auth.uid() = user_id);

-- 用户只能删除自己的 skills
CREATE POLICY "skills_delete" ON skills
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- 预设 Skills 模板表（系统提供的模板）
-- ============================================
CREATE TABLE IF NOT EXISTS skill_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  display_name VARCHAR(200) NOT NULL,
  description TEXT,
  icon VARCHAR(50) DEFAULT '📋',
  
  -- 模板内容
  triggers TEXT[] NOT NULL DEFAULT '{}',
  core_instructions TEXT NOT NULL,
  output_type VARCHAR(50),
  associated_tools TEXT[] DEFAULT '{}',
  default_options JSONB DEFAULT '{}',
  category VARCHAR(50) DEFAULT 'template',
  
  -- 排序
  sort_order INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 插入预设模板
INSERT INTO skill_templates (name, display_name, description, icon, triggers, core_instructions, output_type, associated_tools, category, sort_order)
VALUES 
  (
    'tech_flashcards',
    '技术文章闪卡',
    '将技术文章转换为便于记忆的闪卡',
    '💻',
    ARRAY['技术闪卡', '代码闪卡', '编程闪卡', 'tech flashcards'],
    E'## 技术文章闪卡生成\n\n### 处理流程\n1. 提取文章中的核心技术概念\n2. 识别代码示例和最佳实践\n3. 生成问答形式的闪卡\n\n### 闪卡格式要求\n- 问题：简洁明了，聚焦单一概念\n- 答案：包含代码示例（如适用）\n- 每张卡片聚焦一个知识点\n\n### 特殊处理\n- 代码块保持格式\n- 术语使用中英对照',
    'flashcards',
    ARRAY['notebooklm_process', 'extract_url'],
    'content',
    1
  ),
  (
    'paper_report',
    '论文研究报告',
    '将学术论文转换为结构化研究报告',
    '📚',
    ARRAY['论文报告', '研究报告', '学术报告', 'paper report'],
    E'## 论文研究报告生成\n\n### 处理流程\n1. 提取论文摘要和核心论点\n2. 分析研究方法和数据\n3. 总结结论和贡献\n\n### 报告结构\n- 研究背景\n- 核心问题\n- 方法论\n- 主要发现\n- 结论与启示\n\n### 注意事项\n- 保持学术严谨性\n- 标注关键引用',
    'report',
    ARRAY['notebooklm_process', 'extract_url'],
    'analysis',
    2
  ),
  (
    'video_mindmap',
    '视频笔记脑图',
    '将 YouTube 视频转换为思维导图',
    '🎬',
    ARRAY['视频脑图', '视频笔记', 'YouTube脑图', 'video mindmap'],
    E'## 视频笔记脑图生成\n\n### 处理流程\n1. 提取视频字幕/内容\n2. 识别主要话题和子话题\n3. 构建层级结构的思维导图\n\n### 脑图结构\n- 根节点：视频主题\n- 一级节点：主要章节/话题\n- 二级节点：关键要点\n- 三级节点：细节/示例\n\n### 特殊处理\n- 标注时间戳（如可用）\n- 提取关键引用',
    'mindmap',
    ARRAY['notebooklm_process'],
    'content',
    3
  ),
  (
    'exam_quiz',
    '考试复习测验',
    '将学习材料转换为测验题',
    '📝',
    ARRAY['考试测验', '复习题', '练习题', 'exam quiz'],
    E'## 考试复习测验生成\n\n### 处理流程\n1. 识别核心知识点\n2. 生成多种题型\n3. 提供详细解析\n\n### 题目类型\n- 选择题（单选/多选）\n- 判断题\n- 填空题\n\n### 质量要求\n- 覆盖主要知识点\n- 难度适中\n- 解析清晰',
    'quiz',
    ARRAY['notebooklm_process', 'extract_url'],
    'content',
    4
  ),
  (
    'meeting_summary',
    '会议纪要摘要',
    '将会议内容转换为结构化摘要',
    '📋',
    ARRAY['会议摘要', '会议纪要', '会议总结', 'meeting summary'],
    E'## 会议纪要摘要生成\n\n### 处理流程\n1. 识别会议主题和参与者\n2. 提取讨论要点\n3. 整理决议和待办事项\n\n### 摘要结构\n- 会议主题\n- 主要讨论点\n- 决议事项\n- 待办任务（含负责人）\n- 下次会议安排\n\n### 注意事项\n- 保持客观中立\n- 突出行动项',
    'summary',
    ARRAY['notebooklm_process'],
    'analysis',
    5
  )
ON CONFLICT (name) DO NOTHING;
