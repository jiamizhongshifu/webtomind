-- 创建生成图片的存储桶
-- 用于存储 AI 生成的图片，对话中只存储 URL 引用

-- 创建 bucket（如果不存在）
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'generated-images',
  'generated-images',
  true,  -- 公开访问
  10485760,  -- 10MB 限制
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- 设置公开访问策略（允许所有人读取）
CREATE POLICY "Public read access for generated images"
ON storage.objects FOR SELECT
USING (bucket_id = 'generated-images');

-- 设置上传策略（只允许已认证用户上传）
CREATE POLICY "Authenticated users can upload generated images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'generated-images'
  AND auth.role() = 'authenticated'
);

-- 设置删除策略（用户只能删除自己上传的图片）
CREATE POLICY "Users can delete own generated images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'generated-images'
  AND auth.uid()::text = (storage.foldername(name))[1]
);
