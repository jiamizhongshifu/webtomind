-- First-class generated file assets scaffold.
-- Keeps PPTX/private file outputs out of image_generations.

SET search_path = public;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'user-generated-assets',
  'user-generated-assets',
  false,
  104857600,
  ARRAY[
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/zip'
  ]
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE TABLE IF NOT EXISTS public.asset_generation_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  app_slug TEXT NOT NULL,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('presentation', 'document', 'spreadsheet', 'archive', 'other')),
  output_format TEXT NOT NULL CHECK (output_format IN ('pptx', 'pdf', 'docx', 'xlsx', 'zip')),
  provider TEXT,
  provider_task_id TEXT,
  request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_payload JSONB,
  error_message TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.generated_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id UUID REFERENCES public.asset_generation_tasks(id) ON DELETE SET NULL,
  app_slug TEXT NOT NULL,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('presentation', 'document', 'spreadsheet', 'archive', 'other')),
  title TEXT NOT NULL,
  prompt TEXT,
  output_format TEXT NOT NULL CHECK (output_format IN ('pptx', 'pdf', 'docx', 'xlsx', 'zip')),
  mime_type TEXT,
  storage_bucket TEXT NOT NULL DEFAULT 'user-generated-assets',
  storage_path TEXT,
  download_filename TEXT,
  byte_size BIGINT,
  status TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('ready', 'deleted', 'failed')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.asset_generation_tasks
  ADD COLUMN IF NOT EXISTS result_asset_id UUID REFERENCES public.generated_assets(id) ON DELETE SET NULL;

ALTER TABLE public.asset_generation_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generated_assets ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS asset_generation_tasks_user_status_idx
  ON public.asset_generation_tasks(user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS asset_generation_tasks_provider_task_idx
  ON public.asset_generation_tasks(provider_task_id)
  WHERE provider_task_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS generated_assets_user_created_idx
  ON public.generated_assets(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS generated_assets_task_idx
  ON public.generated_assets(task_id)
  WHERE task_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS generated_assets_storage_object_idx
  ON public.generated_assets(storage_bucket, storage_path)
  WHERE storage_path IS NOT NULL;

DROP POLICY IF EXISTS "asset_generation_tasks_owner_select" ON public.asset_generation_tasks;
CREATE POLICY "asset_generation_tasks_owner_select"
ON public.asset_generation_tasks
FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "asset_generation_tasks_service_role_all" ON public.asset_generation_tasks;
CREATE POLICY "asset_generation_tasks_service_role_all"
ON public.asset_generation_tasks
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "generated_assets_owner_select" ON public.generated_assets;
CREATE POLICY "generated_assets_owner_select"
ON public.generated_assets
FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "generated_assets_service_role_all" ON public.generated_assets;
CREATE POLICY "generated_assets_service_role_all"
ON public.generated_assets
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "user_generated_assets_owner_select" ON storage.objects;
CREATE POLICY "user_generated_assets_owner_select"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'user-generated-assets'
  AND auth.uid()::TEXT = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "user_generated_assets_service_role_all" ON storage.objects;
CREATE POLICY "user_generated_assets_service_role_all"
ON storage.objects
FOR ALL
USING (
  bucket_id = 'user-generated-assets'
  AND auth.role() = 'service_role'
)
WITH CHECK (
  bucket_id = 'user-generated-assets'
  AND auth.role() = 'service_role'
);

GRANT SELECT ON public.asset_generation_tasks TO authenticated;
GRANT SELECT ON public.generated_assets TO authenticated;
GRANT ALL ON public.asset_generation_tasks TO service_role;
GRANT ALL ON public.generated_assets TO service_role;
