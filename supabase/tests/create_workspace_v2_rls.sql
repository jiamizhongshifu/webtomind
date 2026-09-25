\set ON_ERROR_STOP on

BEGIN;

INSERT INTO auth.users (id)
VALUES
  ('10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000002');

INSERT INTO public.image_reference_assets (
  id, user_id, storage_bucket, storage_path, mime_type, role
)
VALUES
  ('1a000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'generated-images', 'a/reference.webp', 'image/webp', 'style'),
  ('2b000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'generated-images', 'b/reference.webp', 'image/webp', 'style');

INSERT INTO public.media_objects (
  id, user_id, owner_type, kind, provider, bucket, object_key, status
)
VALUES
  ('1c000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'visual_moodboard', 'reference', 'r2', 'media', 'a/reference.webp', 'ready'),
  ('2d000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'visual_moodboard', 'reference', 'r2', 'media', 'b/reference.webp', 'ready');

INSERT INTO public.visual_moodboards (
  id, user_id, name, visibility, is_official, analysis_status, analysis_version
)
VALUES
  ('a0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'A private', 'private', false, 'ready', 1),
  ('a0000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'A secondary', 'private', false, 'idle', 0),
  ('b0000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002', 'B public', 'public', false, 'idle', 0),
  ('f0000000-0000-4000-8000-000000000001', NULL, 'Official preset', 'public', true, 'ready', 1);

INSERT INTO public.visual_moodboard_items (
  id, moodboard_id, source, image_url, title, sort_order
)
VALUES
  ('aa000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'upload', 'https://example.com/a-1.jpg', 'A one', 0),
  ('aa000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000002', 'upload', 'https://example.com/a-2.jpg', 'A secondary item', 0),
  ('bb000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'upload', 'https://example.com/b-1.jpg', 'B one', 0),
  ('ff000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', 'preset', 'https://example.com/official.jpg', 'Official one', 0);

UPDATE public.visual_moodboard_items
SET image_reference_id = '1a000000-0000-4000-8000-000000000001',
    media_object_id = '1c000000-0000-4000-8000-000000000001'
WHERE id = 'aa000000-0000-4000-8000-000000000002';

DO $$
BEGIN
  BEGIN
    UPDATE public.visual_moodboard_items
    SET image_reference_id = '2b000000-0000-4000-8000-000000000002'
    WHERE id = 'aa000000-0000-4000-8000-000000000002';
    RAISE EXCEPTION 'cross-owner image reference was accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'image reference must belong to the moodboard owner' THEN
      RAISE;
    END IF;
  END;

  BEGIN
    UPDATE public.visual_moodboard_items
    SET media_object_id = '2d000000-0000-4000-8000-000000000002'
    WHERE id = 'aa000000-0000-4000-8000-000000000002';
    RAISE EXCEPTION 'cross-owner media object was accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'media object must belong to the moodboard owner' THEN
      RAISE;
    END IF;
  END;
END;
$$;

UPDATE public.visual_moodboards
SET analysis_status = 'ready', analysis_version = 1
WHERE id = 'a0000000-0000-4000-8000-000000000001';

UPDATE public.visual_moodboard_items
SET image_reference_id = '1a000000-0000-4000-8000-000000000001'
WHERE id = 'aa000000-0000-4000-8000-000000000001';

DO $$
BEGIN
  IF (SELECT analysis_status FROM public.visual_moodboards
      WHERE id = 'a0000000-0000-4000-8000-000000000001') <> 'ready' THEN
    RAISE EXCEPTION 'reference materialization incorrectly invalidated analysis';
  END IF;
END;
$$;

INSERT INTO public.image_creation_sessions (id, user_id, title)
VALUES
  ('ca000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'A session'),
  ('cb000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002', 'B session');

DO $$
DECLARE
  missing_rls integer;
  missing_indexes integer;
BEGIN
  SELECT count(*) INTO missing_rls
  FROM (VALUES
    ('visual_moodboards'),
    ('visual_moodboard_items'),
    ('visual_moodboard_shares'),
    ('image_creation_sessions'),
    ('image_creation_turns')
  ) AS expected(name)
  LEFT JOIN pg_class c ON c.relname = expected.name AND c.relnamespace = 'public'::regnamespace
  WHERE c.oid IS NULL OR NOT c.relrowsecurity;

  IF missing_rls <> 0 THEN
    RAISE EXCEPTION 'expected RLS on every create workspace v2 table';
  END IF;

  SELECT count(*) INTO missing_indexes
  FROM (VALUES
    ('visual_moodboards_cover_item_idx'),
    ('visual_moodboard_shares_board_idx'),
    ('visual_moodboard_items_reference_idx'),
    ('visual_moodboard_items_board_sort_idx'),
    ('image_creation_sessions_owner_updated_idx'),
    ('image_creation_turns_session_created_idx')
  ) AS expected(name)
  LEFT JOIN pg_class c ON c.relname = expected.name AND c.relkind = 'i'
  WHERE c.oid IS NULL;

  IF missing_indexes <> 0 THEN
    RAISE EXCEPTION 'expected foreign-key and access-path indexes';
  END IF;
END;
$$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.visual_moodboards
    WHERE id = 'a0000000-0000-4000-8000-000000000001'
  ) THEN
    RAISE EXCEPTION 'owner cannot read private moodboard';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.visual_moodboards
    WHERE id = 'b0000000-0000-4000-8000-000000000001'
      AND visibility <> 'public'
  ) THEN
    RAISE EXCEPTION 'public moodboard visibility contract is invalid';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.visual_moodboards
    WHERE id = 'f0000000-0000-4000-8000-000000000001'
  ) THEN
    RAISE EXCEPTION 'official preset is not readable';
  END IF;
END;
$$;

DO $$
DECLARE affected integer;
BEGIN
  UPDATE public.visual_moodboards
  SET name = 'forbidden'
  WHERE id = 'b0000000-0000-4000-8000-000000000001';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN
    RAISE EXCEPTION 'user A modified user B moodboard';
  END IF;

  DELETE FROM public.visual_moodboards
  WHERE id = 'f0000000-0000-4000-8000-000000000001';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN
    RAISE EXCEPTION 'user A deleted official preset';
  END IF;
END;
$$;

DO $$
BEGIN
  BEGIN
    INSERT INTO public.visual_moodboard_items (moodboard_id, source, image_url)
    VALUES ('b0000000-0000-4000-8000-000000000001', 'upload', 'https://example.com/forbidden.jpg');
    RAISE EXCEPTION 'user A inserted into user B moodboard';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    INSERT INTO public.visual_moodboard_shares (moodboard_id, user_id)
    VALUES ('b0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'user A shared user B moodboard';
  EXCEPTION
    WHEN insufficient_privilege OR foreign_key_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.image_creation_turns (session_id, user_id, prompt)
    VALUES (
      'cb000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      'forbidden turn'
    );
    RAISE EXCEPTION 'user A inserted a turn into user B session';
  EXCEPTION
    WHEN insufficient_privilege OR foreign_key_violation THEN NULL;
  END;
END;
$$;

INSERT INTO public.visual_moodboard_shares (moodboard_id, user_id)
VALUES ('a0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001');

INSERT INTO public.image_creation_turns (session_id, user_id, prompt)
VALUES (
  'ca000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'owner turn'
);

INSERT INTO public.visual_moodboard_items (moodboard_id, source, image_url, sort_order)
VALUES (
  'a0000000-0000-4000-8000-000000000001',
  'upload',
  'https://example.com/a-stale.jpg',
  1
);

DO $$
BEGIN
  IF (SELECT analysis_status FROM public.visual_moodboards
      WHERE id = 'a0000000-0000-4000-8000-000000000001') <> 'stale' THEN
    RAISE EXCEPTION 'item mutation did not mark analysis stale';
  END IF;
END;
$$;

INSERT INTO public.visual_moodboard_items (moodboard_id, source, image_url, sort_order)
SELECT
  'a0000000-0000-4000-8000-000000000001',
  'upload',
  'https://example.com/a-' || n || '.jpg',
  n
FROM generate_series(2, 23) AS n;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.visual_moodboard_items
      WHERE moodboard_id = 'a0000000-0000-4000-8000-000000000001') <> 24 THEN
    RAISE EXCEPTION '24-item setup failed';
  END IF;

  BEGIN
    INSERT INTO public.visual_moodboard_items (moodboard_id, source, image_url)
    VALUES ('a0000000-0000-4000-8000-000000000001', 'upload', 'https://example.com/a-25.jpg');
    RAISE EXCEPTION '25th moodboard item was accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'visual moodboard item limit reached' THEN
      RAISE;
    END IF;
  END;
END;
$$;

SET CONSTRAINTS visual_moodboard_cover_item_contract IMMEDIATE;
DO $$
BEGIN
  BEGIN
    UPDATE public.visual_moodboards
    SET cover_item_id = 'aa000000-0000-4000-8000-000000000002'
    WHERE id = 'a0000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'cross-moodboard cover item was accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'cover item must belong to the same visual moodboard' THEN
      RAISE;
    END IF;
  END;
END;
$$;

SELECT set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000002', true);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.visual_moodboards
    WHERE id = 'a0000000-0000-4000-8000-000000000001'
  ) THEN
    RAISE EXCEPTION 'user B can read user A private moodboard';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.visual_moodboard_shares
    WHERE moodboard_id = 'a0000000-0000-4000-8000-000000000001'
  ) THEN
    RAISE EXCEPTION 'user B can read user A share token';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.image_creation_sessions
    WHERE id = 'ca000000-0000-4000-8000-000000000001'
  ) THEN
    RAISE EXCEPTION 'user B can read user A image session';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.image_creation_turns
    WHERE session_id = 'ca000000-0000-4000-8000-000000000001'
  ) THEN
    RAISE EXCEPTION 'user B can read user A image turn';
  END IF;
END;
$$;

RESET ROLE;
ROLLBACK;

SELECT 'create_workspace_v2_rls_ok' AS result;
