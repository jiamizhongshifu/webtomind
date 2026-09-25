-- Migration: 034_sync_skill_templates.sql
-- Description: 同步 skill_templates 表，确保覆盖所有 6 个内置技能
-- Date: 2026-01-27

-- 使用 UPSERT 模式同步模板数据
-- 如果 name 已存在则更新，否则插入

-- 1. 内容理解技能模板
INSERT INTO skill_templates (
  name, display_name, description, icon, triggers, 
  core_instructions, output_type, associated_tools, 
  default_options, category, sort_order
) VALUES (
  'content_understanding',
  '网页内容理解',
  '提取和理解网页内容，生成结构化总结',
  '📖',
  ARRAY['阅读', '提取', '总结', '理解', '分析', '网页', '文章', 'url', '链接'],
  '## 网页内容理解

### 处理流程
1. 使用 extract_url 工具提取网页内容
2. 分析内容结构和核心观点
3. 生成结构化总结

### 输出格式
- 标题和核心观点
- 详细分析
- 关键词提取',
  NULL,
  ARRAY['extract_url'],
  '{}',
  'content',
  1
) ON CONFLICT (name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  triggers = EXCLUDED.triggers,
  core_instructions = EXCLUDED.core_instructions,
  output_type = EXCLUDED.output_type,
  associated_tools = EXCLUDED.associated_tools,
  default_options = EXCLUDED.default_options,
  category = EXCLUDED.category,
  sort_order = EXCLUDED.sort_order;

-- 2. 知识管理技能模板
INSERT INTO skill_templates (
  name, display_name, description, icon, triggers, 
  core_instructions, output_type, associated_tools, 
  default_options, category, sort_order
) VALUES (
  'knowledge_management',
  '知识笔记管理',
  '保存和管理知识笔记',
  '📝',
  ARRAY['保存', '记录', '笔记', '记下', '存储', '收藏'],
  '## 知识笔记管理

### 处理流程
1. 整理用户提供的内容
2. 提炼核心要点
3. 使用 save_note 工具保存

### 保存格式
- 简洁有意义的标题
- Markdown 格式化内容
- 合适的标签分类',
  NULL,
  ARRAY['save_note'],
  '{}',
  'history',
  2
) ON CONFLICT (name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  triggers = EXCLUDED.triggers,
  core_instructions = EXCLUDED.core_instructions,
  output_type = EXCLUDED.output_type,
  associated_tools = EXCLUDED.associated_tools,
  default_options = EXCLUDED.default_options,
  category = EXCLUDED.category,
  sort_order = EXCLUDED.sort_order;

-- 3. 信息搜索技能模板
INSERT INTO skill_templates (
  name, display_name, description, icon, triggers, 
  core_instructions, output_type, associated_tools, 
  default_options, category, sort_order
) VALUES (
  'information_search',
  '网络信息搜索',
  '搜索网络获取最新信息',
  '🔍',
  ARRAY['搜索', '查询', '查找', '找一下', '搜一下', '最新', '新闻', '了解', '什么是'],
  '## 网络信息搜索

### 处理流程
1. 优化用户问题为搜索关键词
2. 使用 web_search 工具搜索
3. 整合结果并标注来源

### 搜索策略
- 事实性问题：精确关键词
- 概念性问题：相关术语组合
- 时效性问题：添加时间限定词',
  NULL,
  ARRAY['web_search'],
  '{}',
  'search',
  3
) ON CONFLICT (name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  triggers = EXCLUDED.triggers,
  core_instructions = EXCLUDED.core_instructions,
  output_type = EXCLUDED.output_type,
  associated_tools = EXCLUDED.associated_tools,
  default_options = EXCLUDED.default_options,
  category = EXCLUDED.category,
  sort_order = EXCLUDED.sort_order;

-- 4. 技术文章闪卡模板 (更新已有)
INSERT INTO skill_templates (
  name, display_name, description, icon, triggers, 
  core_instructions, output_type, associated_tools, 
  default_options, category, sort_order
) VALUES (
  'tech_flashcards',
  '技术文章闪卡',
  '将技术文章转换为便于记忆的闪卡',
  '💻',
  ARRAY['技术闪卡', '代码闪卡', '编程闪卡', 'tech flashcards'],
  '## 技术文章闪卡生成

### 处理流程
1. 提取文章中的核心技术概念
2. 识别代码示例和最佳实践
3. 生成问答形式的闪卡

### 闪卡格式要求
- 问题：简洁明了，聚焦单一概念
- 答案：包含代码示例（如适用）
- 每张卡片聚焦一个知识点

### 特殊处理
- 代码块保持格式
- 术语使用中英对照',
  'flashcards',
  ARRAY['notebooklm_process', 'extract_url'],
  '{}',
  'content',
  4
) ON CONFLICT (name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  triggers = EXCLUDED.triggers,
  core_instructions = EXCLUDED.core_instructions,
  output_type = EXCLUDED.output_type,
  associated_tools = EXCLUDED.associated_tools,
  default_options = EXCLUDED.default_options,
  category = EXCLUDED.category,
  sort_order = EXCLUDED.sort_order;


-- 5. 论文研究报告模板 (更新已有)
INSERT INTO skill_templates (
  name, display_name, description, icon, triggers, 
  core_instructions, output_type, associated_tools, 
  default_options, category, sort_order
) VALUES (
  'paper_report',
  '论文研究报告',
  '将学术论文转换为结构化研究报告',
  '📚',
  ARRAY['论文报告', '研究报告', '学术报告', 'paper report'],
  '## 论文研究报告生成

### 处理流程
1. 提取论文摘要和核心论点
2. 分析研究方法和数据
3. 总结结论和贡献

### 报告结构
- 研究背景
- 核心问题
- 方法论
- 主要发现
- 结论与启示

### 注意事项
- 保持学术严谨性
- 标注关键引用',
  'report',
  ARRAY['notebooklm_process', 'extract_url'],
  '{}',
  'analysis',
  5
) ON CONFLICT (name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  triggers = EXCLUDED.triggers,
  core_instructions = EXCLUDED.core_instructions,
  output_type = EXCLUDED.output_type,
  associated_tools = EXCLUDED.associated_tools,
  default_options = EXCLUDED.default_options,
  category = EXCLUDED.category,
  sort_order = EXCLUDED.sort_order;

-- 6. 视频笔记脑图模板 (更新已有)
INSERT INTO skill_templates (
  name, display_name, description, icon, triggers, 
  core_instructions, output_type, associated_tools, 
  default_options, category, sort_order
) VALUES (
  'video_mindmap',
  '视频笔记脑图',
  '将 YouTube 视频转换为思维导图',
  '🎬',
  ARRAY['视频脑图', '视频笔记', 'YouTube脑图', 'video mindmap'],
  '## 视频笔记脑图生成

### 处理流程
1. 提取视频字幕/内容
2. 识别主要话题和子话题
3. 构建层级结构的思维导图

### 脑图结构
- 根节点：视频主题
- 一级节点：主要章节/话题
- 二级节点：关键要点
- 三级节点：细节/示例

### 特殊处理
- 标注时间戳（如可用）
- 提取关键引用',
  'mindmap',
  ARRAY['notebooklm_process'],
  '{}',
  'content',
  6
) ON CONFLICT (name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  triggers = EXCLUDED.triggers,
  core_instructions = EXCLUDED.core_instructions,
  output_type = EXCLUDED.output_type,
  associated_tools = EXCLUDED.associated_tools,
  default_options = EXCLUDED.default_options,
  category = EXCLUDED.category,
  sort_order = EXCLUDED.sort_order;

-- 7. 考试复习测验模板 (更新已有)
INSERT INTO skill_templates (
  name, display_name, description, icon, triggers, 
  core_instructions, output_type, associated_tools, 
  default_options, category, sort_order
) VALUES (
  'exam_quiz',
  '考试复习测验',
  '将学习材料转换为测验题',
  '📝',
  ARRAY['考试测验', '复习题', '练习题', 'exam quiz'],
  '## 考试复习测验生成

### 处理流程
1. 识别核心知识点
2. 生成多种题型
3. 提供详细解析

### 题目类型
- 选择题（单选/多选）
- 判断题
- 填空题

### 质量要求
- 覆盖主要知识点
- 难度适中
- 解析清晰',
  'quiz',
  ARRAY['notebooklm_process', 'extract_url'],
  '{}',
  'content',
  7
) ON CONFLICT (name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  triggers = EXCLUDED.triggers,
  core_instructions = EXCLUDED.core_instructions,
  output_type = EXCLUDED.output_type,
  associated_tools = EXCLUDED.associated_tools,
  default_options = EXCLUDED.default_options,
  category = EXCLUDED.category,
  sort_order = EXCLUDED.sort_order;

-- 8. 会议纪要摘要模板 (更新已有)
INSERT INTO skill_templates (
  name, display_name, description, icon, triggers, 
  core_instructions, output_type, associated_tools, 
  default_options, category, sort_order
) VALUES (
  'meeting_summary',
  '会议纪要摘要',
  '将会议内容转换为结构化摘要',
  '📋',
  ARRAY['会议摘要', '会议纪要', '会议总结', 'meeting summary'],
  '## 会议纪要摘要生成

### 处理流程
1. 识别会议主题和参与者
2. 提取讨论要点
3. 整理决议和待办事项

### 摘要结构
- 会议主题
- 主要讨论点
- 决议事项
- 待办任务（含负责人）
- 下次会议安排

### 注意事项
- 保持客观中立
- 突出行动项',
  'summary',
  ARRAY['notebooklm_process'],
  '{}',
  'analysis',
  8
) ON CONFLICT (name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  triggers = EXCLUDED.triggers,
  core_instructions = EXCLUDED.core_instructions,
  output_type = EXCLUDED.output_type,
  associated_tools = EXCLUDED.associated_tools,
  default_options = EXCLUDED.default_options,
  category = EXCLUDED.category,
  sort_order = EXCLUDED.sort_order;


-- 9. PPT 演示文稿生成模板 (新增)
INSERT INTO skill_templates (
  name, display_name, description, icon, triggers, 
  core_instructions, output_type, associated_tools, 
  default_options, category, sort_order
) VALUES (
  'slide_deck_generation',
  'PPT 演示文稿',
  '将内容转换为专业的 PPT 演示文稿',
  '📊',
  ARRAY['PPT', 'ppt', '幻灯片', '演示文稿', 'slides', 'presentation'],
  '## PPT 演示文稿生成

### 处理流程
1. 分析内容结构
2. 确定风格和页数
3. 使用 slide_deck_generate 工具生成

### 支持的风格
blueprint, notion, corporate, minimal, sketch-notes, chalkboard, bold-editorial, dark-atmospheric, watercolor, pixel-art, scientific, vintage

### 输出
- 可下载的 PPTX 文件
- 24 小时有效的下载链接',
  'slide_deck',
  ARRAY['slide_deck_generate'],
  '{"style": "blueprint", "slideCount": 10}',
  'export',
  9
) ON CONFLICT (name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  triggers = EXCLUDED.triggers,
  core_instructions = EXCLUDED.core_instructions,
  output_type = EXCLUDED.output_type,
  associated_tools = EXCLUDED.associated_tools,
  default_options = EXCLUDED.default_options,
  category = EXCLUDED.category,
  sort_order = EXCLUDED.sort_order;

-- 10. NotebookLM 学习内容模板 (新增)
INSERT INTO skill_templates (
  name, display_name, description, icon, triggers, 
  core_instructions, output_type, associated_tools, 
  default_options, category, sort_order
) VALUES (
  'notebooklm_learning',
  'AI 学习内容生成',
  '使用 NotebookLM 生成多种学习内容格式',
  '🎓',
  ARRAY['闪卡', '脑图', '测验', '报告', '摘要', '音频', '视频', '信息图'],
  '## AI 学习内容生成

### 支持的输出类型
1. 闪卡 (flashcards) - 问答形式学习卡片
2. 脑图 (mindmap) - 树形知识图谱
3. 测验 (quiz) - 选择题测验
4. 报告 (report) - 结构化摘要报告
5. 摘要 (summary) - 简洁内容总结
6. 音频 (audio) - 播客式音频讨论
7. 视频 (video) - 视频摘要
8. 信息图 (infographic) - 可视化图表
9. 演示文稿 (slide_deck) - PPT 格式
10. 数据表格 (data_table) - CSV 格式

### 使用流程
1. 识别用户想要的输出类型
2. 获取内容来源
3. 调用 notebooklm_process 工具',
  NULL,
  ARRAY['notebooklm_process', 'notebooklm_status', 'notebooklm_health'],
  '{}',
  'content',
  10
) ON CONFLICT (name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  triggers = EXCLUDED.triggers,
  core_instructions = EXCLUDED.core_instructions,
  output_type = EXCLUDED.output_type,
  associated_tools = EXCLUDED.associated_tools,
  default_options = EXCLUDED.default_options,
  category = EXCLUDED.category,
  sort_order = EXCLUDED.sort_order;

-- 验证迁移结果
-- SELECT name, display_name, category, sort_order FROM skill_templates ORDER BY sort_order;
