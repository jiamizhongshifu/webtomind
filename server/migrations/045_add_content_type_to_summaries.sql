-- 添加 content_type 列到 summaries 表
-- 用于区分文章、图片、视频类型的内容

-- 添加 content_type 列
ALTER TABLE summaries
ADD COLUMN IF NOT EXISTS content_type TEXT;

-- 添加注释
COMMENT ON COLUMN summaries.content_type IS '内容类型: article, image, video';

-- 创建索引以便按类型筛选
CREATE INDEX IF NOT EXISTS idx_summaries_content_type ON summaries(content_type);
