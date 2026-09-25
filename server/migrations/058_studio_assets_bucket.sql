-- v1.3: Studio assets storage bucket

SET search_path = public;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'studio-assets',
  'studio-assets',
  true,
  20971520,
  ARRAY[
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
    'image/svg+xml'
  ]
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Public read access for studio assets" ON storage.objects;
CREATE POLICY "Public read access for studio assets"
ON storage.objects FOR SELECT
USING (bucket_id = 'studio-assets');

DROP POLICY IF EXISTS "Authenticated users can upload studio assets" ON storage.objects;
CREATE POLICY "Authenticated users can upload studio assets"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'studio-assets'
  AND auth.role() = 'authenticated'
);

DROP POLICY IF EXISTS "Users can delete own studio assets" ON storage.objects;
CREATE POLICY "Users can delete own studio assets"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'studio-assets'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

