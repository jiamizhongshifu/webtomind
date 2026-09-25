\set ON_ERROR_STOP on

-- Minimal Supabase-compatible foundation for the isolated create workspace
-- migration rehearsal. Production migrations remain the source of truth; this
-- fixture only supplies the legacy objects that predate supabase/migrations.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
END;
$$;

CREATE SCHEMA IF NOT EXISTS auth;

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::UUID;
$$;

CREATE OR REPLACE FUNCTION auth.role()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.role', true), '');
$$;

GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS auth.users (
  id UUID PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS public.media_objects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  owner_type TEXT NOT NULL,
  owner_id UUID,
  kind TEXT NOT NULL CHECK (kind IN ('original', 'thumbnail', 'preview', 'poster', 'reference', 'asset')),
  provider TEXT NOT NULL CHECK (provider IN ('supabase', 'r2')),
  bucket TEXT NOT NULL,
  object_key TEXT NOT NULL,
  content_type TEXT,
  byte_size BIGINT,
  width INTEGER,
  height INTEGER,
  duration INTEGER,
  checksum_sha256 TEXT,
  etag TEXT,
  status TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('ready', 'orphaned', 'deleted', 'failed')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
