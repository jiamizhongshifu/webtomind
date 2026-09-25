-- Allow logged-in users to upload their own prompt assets into a private slice
-- of prompt_assets, while keeping the public operator-managed library untouched.
--
-- Adds:
--   * 5 new slot values: accessory / prop / lens / shot / makeup
--   * owner_user_id column (NULL means operator-curated public asset)
--   * RLS policies so authenticated users can CRUD their own rows;
--     the existing anon/authenticated read policy is tightened to
--     only expose rows where owner_user_id IS NULL.

SET search_path = public;

-- 1. Extend slot CHECK constraint
ALTER TABLE public.prompt_assets
  DROP CONSTRAINT IF EXISTS prompt_assets_slot_check;

ALTER TABLE public.prompt_assets
  ADD CONSTRAINT prompt_assets_slot_check
  CHECK (
    slot IN (
      'character',
      'pose',
      'top',
      'bottom',
      'shoes',
      'background',
      'style',
      'lighting',
      'accessory',
      'prop',
      'lens',
      'shot',
      'makeup'
    )
  );

-- 2. Owner column + index
ALTER TABLE public.prompt_assets
  ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_prompt_assets_owner_user
  ON public.prompt_assets(owner_user_id)
  WHERE owner_user_id IS NOT NULL;

-- 3. Tighten the public-read policy to operator-curated rows only.
DROP POLICY IF EXISTS "prompt_assets_public_read" ON public.prompt_assets;
CREATE POLICY "prompt_assets_public_read"
ON public.prompt_assets
FOR SELECT
TO anon, authenticated
USING (
  is_published = true
  AND published_at <= now()
  AND owner_user_id IS NULL
);

-- 4. Authenticated users can CRUD their own uploads.
DROP POLICY IF EXISTS "prompt_assets_owner_select" ON public.prompt_assets;
CREATE POLICY "prompt_assets_owner_select"
ON public.prompt_assets
FOR SELECT
TO authenticated
USING (owner_user_id = auth.uid());

DROP POLICY IF EXISTS "prompt_assets_owner_insert" ON public.prompt_assets;
CREATE POLICY "prompt_assets_owner_insert"
ON public.prompt_assets
FOR INSERT
TO authenticated
WITH CHECK (owner_user_id = auth.uid());

DROP POLICY IF EXISTS "prompt_assets_owner_update" ON public.prompt_assets;
CREATE POLICY "prompt_assets_owner_update"
ON public.prompt_assets
FOR UPDATE
TO authenticated
USING (owner_user_id = auth.uid())
WITH CHECK (owner_user_id = auth.uid());

DROP POLICY IF EXISTS "prompt_assets_owner_delete" ON public.prompt_assets;
CREATE POLICY "prompt_assets_owner_delete"
ON public.prompt_assets
FOR DELETE
TO authenticated
USING (owner_user_id = auth.uid());
