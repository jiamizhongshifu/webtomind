-- 修复 generated-images bucket 的 MIME 类型白名单
-- 添加视频、PPT、PDF 等类型支持
-- 同时增加文件大小限制到 50MB

-- 更新 bucket 配置
UPDATE storage.buckets
SET 
  allowed_mime_types = ARRAY[
    -- 图片类型
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
    'image/heic',
    'image/heif',
    -- 视频类型
    'video/mp4',
    'video/webm',
    'video/quicktime',
    -- 文档类型
    'application/pdf',
    -- Office 文档
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',  -- PPTX
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',    -- DOCX
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',          -- XLSX
    -- 音频类型
    'audio/mpeg',
    'audio/mp3',
    'audio/wav',
    'audio/ogg'
  ],
  file_size_limit = 52428800  -- 50MB
WHERE id = 'generated-images';

-- 如果 bucket 不存在，创建它
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'generated-images',
  'generated-images',
  true,
  52428800,  -- 50MB
  ARRAY[
    'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
    'video/mp4', 'video/webm', 'video/quicktime',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg'
  ]
)
ON CONFLICT (id) DO NOTHING;
