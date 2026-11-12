-- Public Skill catalog, entitlements and CLI device authorization.
--
-- The existing public.skills table keeps user-private Skills; this catalog is a
-- separate, WebToMind-authored public directory. Published versions are
-- immutable: their archive (private R2 object) and SHA-256 never change.
-- Entitlements are written only by payment fulfillment (service role) and each
-- row points at the payment order that created it.

SET search_path = public;

-- ---------------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.skill_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE
    CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) <= 80),
  name JSONB NOT NULL DEFAULT '{}'::jsonb,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  description JSONB NOT NULL DEFAULT '{}'::jsonb,
  output_types TEXT[] NOT NULL DEFAULT '{}'
    CHECK (output_types <@ ARRAY['image', 'slides', 'video', 'web']::TEXT[]),
  scene_tags TEXT[] NOT NULL DEFAULT '{}',
  languages TEXT[] NOT NULL DEFAULT '{}',
  tier TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'premium')),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),
  is_featured BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  install_count BIGINT NOT NULL DEFAULT 0 CHECK (install_count >= 0),
  rating_avg NUMERIC(3, 2) CHECK (rating_avg IS NULL OR rating_avg BETWEEN 0 AND 5),
  rating_count INTEGER NOT NULL DEFAULT 0 CHECK (rating_count >= 0),
  latest_version_id UUID,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_skill_catalog_published_sort
  ON public.skill_catalog (is_featured DESC, sort_order, published_at DESC)
  WHERE status = 'published';
CREATE INDEX IF NOT EXISTS idx_skill_catalog_output_types
  ON public.skill_catalog USING GIN (output_types);
CREATE INDEX IF NOT EXISTS idx_skill_catalog_scene_tags
  ON public.skill_catalog USING GIN (scene_tags);

CREATE TABLE IF NOT EXISTS public.skill_catalog_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id UUID NOT NULL REFERENCES public.skill_catalog(id) ON DELETE RESTRICT,
  version TEXT NOT NULL
    CHECK (version ~ '^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$'),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'yanked')),
  r2_object_key TEXT NOT NULL CHECK (char_length(r2_object_key) BETWEEN 1 AND 512),
  archive_format TEXT NOT NULL DEFAULT 'tar.gz' CHECK (archive_format IN ('tar.gz')),
  sha256 TEXT NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  size_bytes BIGINT NOT NULL CHECK (size_bytes > 0),
  compatible_agents TEXT[] NOT NULL DEFAULT '{}'
    CHECK (compatible_agents <@ ARRAY[
      'claude-code', 'codex', 'cursor', 'gemini', 'kimi-code', 'antigravity', 'trae'
    ]::TEXT[]),
  changelog JSONB NOT NULL DEFAULT '{}'::jsonb,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (skill_id, version),
  CHECK (status = 'draft' OR published_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_skill_catalog_versions_skill
  ON public.skill_catalog_versions (skill_id, published_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'skill_catalog_latest_version_fkey'
  ) THEN
    ALTER TABLE public.skill_catalog
      ADD CONSTRAINT skill_catalog_latest_version_fkey
      FOREIGN KEY (latest_version_id)
      REFERENCES public.skill_catalog_versions(id) ON DELETE SET NULL;
  END IF;
END;
$$;

-- Published archives are immutable. The only permitted change to a published
-- version is withdrawing it (published -> yanked); drafts stay editable.
CREATE OR REPLACE FUNCTION public.guard_skill_catalog_version_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'SKILL_VERSION_IMMUTABLE: published versions cannot be deleted'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status = 'draft' THEN
    RETURN NEW;
  END IF;

  IF NEW.skill_id IS DISTINCT FROM OLD.skill_id
    OR NEW.version IS DISTINCT FROM OLD.version
    OR NEW.r2_object_key IS DISTINCT FROM OLD.r2_object_key
    OR NEW.archive_format IS DISTINCT FROM OLD.archive_format
    OR NEW.sha256 IS DISTINCT FROM OLD.sha256
    OR NEW.size_bytes IS DISTINCT FROM OLD.size_bytes
    OR NEW.compatible_agents IS DISTINCT FROM OLD.compatible_agents
    OR NEW.published_at IS DISTINCT FROM OLD.published_at
    OR NOT (
      NEW.status = OLD.status
      OR (OLD.status = 'published' AND NEW.status = 'yanked')
    )
  THEN
    RAISE EXCEPTION 'SKILL_VERSION_IMMUTABLE: published version % cannot be modified', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_skill_catalog_version_immutability
  ON public.skill_catalog_versions;
CREATE TRIGGER guard_skill_catalog_version_immutability
  BEFORE UPDATE OR DELETE ON public.skill_catalog_versions
  FOR EACH ROW EXECUTE FUNCTION public.guard_skill_catalog_version_immutability();

CREATE TABLE IF NOT EXISTS public.skill_catalog_examples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id UUID NOT NULL REFERENCES public.skill_catalog_versions(id) ON DELETE CASCADE,
  media_type TEXT NOT NULL CHECK (media_type IN ('image', 'slides', 'video', 'web')),
  media_url TEXT NOT NULL,
  poster_url TEXT,
  title JSONB NOT NULL DEFAULT '{}'::jsonb,
  description JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_skill_catalog_examples_version
  ON public.skill_catalog_examples (version_id, sort_order);

-- ---------------------------------------------------------------------------
-- Entitlements (written only by payment fulfillment)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.skill_entitlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('subscription', 'lifetime', 'single_purchase')),
  -- NULL skill_id grants every premium Skill (subscription / lifetime).
  skill_id UUID REFERENCES public.skill_catalog(id) ON DELETE RESTRICT,
  payment_order_id UUID NOT NULL REFERENCES public.payment_orders(id) ON DELETE RESTRICT,
  -- Provider subscription id (Stripe sub_..., or the ZPAY trade for prepaid periods).
  external_subscription_id TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'revoked')),
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revoke_reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (source <> 'single_purchase' OR skill_id IS NOT NULL),
  CHECK (source = 'single_purchase' OR skill_id IS NULL),
  CHECK (source <> 'subscription' OR ends_at IS NOT NULL),
  CHECK (source <> 'lifetime' OR ends_at IS NULL),
  CONSTRAINT skill_entitlements_order_skill_key
    UNIQUE NULLS NOT DISTINCT (payment_order_id, skill_id)
);

CREATE INDEX IF NOT EXISTS idx_skill_entitlements_user_active
  ON public.skill_entitlements (user_id, status, ends_at);
CREATE INDEX IF NOT EXISTS idx_skill_entitlements_external_subscription
  ON public.skill_entitlements (external_subscription_id)
  WHERE external_subscription_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- CLI device authorization and credentials (hashes only)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.cli_device_authorizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_code_hash TEXT NOT NULL UNIQUE CHECK (device_code_hash ~ '^[0-9a-f]{64}$'),
  user_code TEXT NOT NULL CHECK (user_code ~ '^[B-DF-HJ-NP-TV-Z]{4}-[B-DF-HJ-NP-TV-Z]{4}$'),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'denied', 'consumed', 'expired')),
  client_name TEXT CHECK (client_name IS NULL OR char_length(client_name) <= 120),
  client_version TEXT CHECK (client_version IS NULL OR char_length(client_version) <= 40),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  interval_seconds INTEGER NOT NULL DEFAULT 5 CHECK (interval_seconds BETWEEN 1 AND 60),
  expires_at TIMESTAMPTZ NOT NULL,
  last_polled_at TIMESTAMPTZ,
  decided_at TIMESTAMPTZ,
  consumed_at TIMESTAMPTZ,
  credential_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (status NOT IN ('approved', 'consumed') OR user_id IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cli_device_authorizations_pending_user_code
  ON public.cli_device_authorizations (user_code)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_cli_device_authorizations_expires
  ON public.cli_device_authorizations (expires_at);

CREATE TABLE IF NOT EXISTS public.cli_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  token_prefix TEXT NOT NULL CHECK (char_length(token_prefix) BETWEEN 4 AND 24),
  scope TEXT NOT NULL DEFAULT 'skills:download' CHECK (scope = 'skills:download'),
  device_authorization_id UUID UNIQUE
    REFERENCES public.cli_device_authorizations(id) ON DELETE SET NULL,
  client_name TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cli_credentials_user
  ON public.cli_credentials (user_id, created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cli_device_authorizations_credential_fkey'
  ) THEN
    ALTER TABLE public.cli_device_authorizations
      ADD CONSTRAINT cli_device_authorizations_credential_fkey
      FOREIGN KEY (credential_id)
      REFERENCES public.cli_credentials(id) ON DELETE SET NULL;
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.skill_installs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES public.skill_catalog(id) ON DELETE CASCADE,
  version_id UUID NOT NULL REFERENCES public.skill_catalog_versions(id) ON DELETE CASCADE,
  agent TEXT CHECK (agent IS NULL OR agent IN (
    'claude-code', 'codex', 'cursor', 'gemini', 'kimi-code', 'antigravity', 'trae'
  )),
  credential_id UUID REFERENCES public.cli_credentials(id) ON DELETE SET NULL,
  entitlement_source TEXT CHECK (entitlement_source IS NULL OR entitlement_source IN (
    'free', 'subscription', 'lifetime', 'single_purchase'
  )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_skill_installs_skill_created
  ON public.skill_installs (skill_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_skill_installs_user_created
  ON public.skill_installs (user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.increment_skill_catalog_install_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.skill_catalog
  SET install_count = install_count + 1
  WHERE id = NEW.skill_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS increment_skill_catalog_install_count ON public.skill_installs;
CREATE TRIGGER increment_skill_catalog_install_count
  AFTER INSERT ON public.skill_installs
  FOR EACH ROW EXECUTE FUNCTION public.increment_skill_catalog_install_count();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

ALTER TABLE public.skill_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skill_catalog_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skill_catalog_examples ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skill_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skill_installs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cli_device_authorizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cli_credentials ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.skill_catalog, public.skill_catalog_versions,
  public.skill_catalog_examples, public.skill_entitlements, public.skill_installs,
  public.cli_device_authorizations, public.cli_credentials
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.skill_catalog, public.skill_catalog_versions,
  public.skill_catalog_examples, public.skill_entitlements, public.skill_installs,
  public.cli_device_authorizations, public.cli_credentials
  TO service_role;

GRANT SELECT ON public.skill_catalog TO anon, authenticated;
DROP POLICY IF EXISTS skill_catalog_public_read ON public.skill_catalog;
CREATE POLICY skill_catalog_public_read ON public.skill_catalog
  FOR SELECT TO anon, authenticated
  USING (status = 'published');

-- The R2 object key is withheld from Data API clients; downloads go through
-- the install API, which checks entitlements and signs a short-lived URL.
GRANT SELECT (
  id, skill_id, version, status, archive_format, sha256, size_bytes,
  compatible_agents, changelog, published_at, created_at
) ON public.skill_catalog_versions TO anon, authenticated;
DROP POLICY IF EXISTS skill_catalog_versions_public_read ON public.skill_catalog_versions;
CREATE POLICY skill_catalog_versions_public_read ON public.skill_catalog_versions
  FOR SELECT TO anon, authenticated
  USING (
    status = 'published'
    AND EXISTS (
      SELECT 1 FROM public.skill_catalog catalog
      WHERE catalog.id = skill_id AND catalog.status = 'published'
    )
  );

GRANT SELECT ON public.skill_catalog_examples TO anon, authenticated;
DROP POLICY IF EXISTS skill_catalog_examples_public_read ON public.skill_catalog_examples;
CREATE POLICY skill_catalog_examples_public_read ON public.skill_catalog_examples
  FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.skill_catalog_versions version
      JOIN public.skill_catalog catalog ON catalog.id = version.skill_id
      WHERE version.id = version_id
        AND version.status = 'published'
        AND catalog.status = 'published'
    )
  );

GRANT SELECT ON public.skill_entitlements TO authenticated;
DROP POLICY IF EXISTS skill_entitlements_owner_read ON public.skill_entitlements;
CREATE POLICY skill_entitlements_owner_read ON public.skill_entitlements
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

GRANT SELECT ON public.skill_installs TO authenticated;
DROP POLICY IF EXISTS skill_installs_owner_read ON public.skill_installs;
CREATE POLICY skill_installs_owner_read ON public.skill_installs
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Owners may list their CLI sessions; the token hash is never exposed.
GRANT SELECT (
  id, user_id, token_prefix, scope, client_name, expires_at, last_used_at,
  revoked_at, created_at
) ON public.cli_credentials TO authenticated;
DROP POLICY IF EXISTS cli_credentials_owner_read ON public.cli_credentials;
CREATE POLICY cli_credentials_owner_read ON public.cli_credentials
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- cli_device_authorizations: service role only (no client policies).

-- ---------------------------------------------------------------------------
-- Catalog search (public)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.search_skill_catalog(
  p_query TEXT DEFAULT NULL,
  p_output_type TEXT DEFAULT NULL,
  p_scene TEXT DEFAULT NULL,
  p_tier TEXT DEFAULT NULL,
  p_sort TEXT DEFAULT 'featured',
  p_limit INTEGER DEFAULT 24,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  slug TEXT,
  name JSONB,
  summary JSONB,
  output_types TEXT[],
  scene_tags TEXT[],
  languages TEXT[],
  tier TEXT,
  is_featured BOOLEAN,
  install_count BIGINT,
  installs_7d BIGINT,
  rating_avg NUMERIC,
  rating_count INTEGER,
  latest_version TEXT,
  compatible_agents TEXT[],
  published_at TIMESTAMPTZ,
  cover_url TEXT,
  total_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH params AS (
    SELECT
      NULLIF(
        replace(replace(replace(btrim(COALESCE(p_query, '')), '\', '\\'), '%', '\%'), '_', '\_'),
        ''
      ) AS pattern,
      LEAST(GREATEST(COALESCE(p_limit, 24), 1), 100) AS row_limit,
      GREATEST(COALESCE(p_offset, 0), 0) AS row_offset
  ),
  filtered AS (
    SELECT
      catalog.*,
      version.version AS latest_version,
      version.compatible_agents,
      (
        SELECT count(*)
        FROM public.skill_installs installs
        WHERE installs.skill_id = catalog.id
          AND installs.created_at > NOW() - INTERVAL '7 days'
      ) AS installs_7d,
      (
        SELECT COALESCE(example.poster_url, example.media_url)
        FROM public.skill_catalog_examples example
        WHERE example.version_id = version.id
        ORDER BY example.sort_order, example.created_at
        LIMIT 1
      ) AS cover_url
    FROM public.skill_catalog catalog
    CROSS JOIN params
    LEFT JOIN public.skill_catalog_versions version
      ON version.id = catalog.latest_version_id AND version.status = 'published'
    WHERE catalog.status = 'published'
      AND (p_output_type IS NULL OR p_output_type = ANY (catalog.output_types))
      AND (p_scene IS NULL OR p_scene = ANY (catalog.scene_tags))
      AND (p_tier IS NULL OR catalog.tier = p_tier)
      AND (
        params.pattern IS NULL
        OR catalog.slug ILIKE '%' || params.pattern || '%'
        OR catalog.name::TEXT ILIKE '%' || params.pattern || '%'
        OR catalog.summary::TEXT ILIKE '%' || params.pattern || '%'
        OR array_to_string(catalog.scene_tags, ' ') ILIKE '%' || params.pattern || '%'
      )
  )
  SELECT
    filtered.id,
    filtered.slug,
    filtered.name,
    filtered.summary,
    filtered.output_types,
    filtered.scene_tags,
    filtered.languages,
    filtered.tier,
    filtered.is_featured,
    filtered.install_count,
    filtered.installs_7d,
    filtered.rating_avg,
    filtered.rating_count,
    filtered.latest_version,
    filtered.compatible_agents,
    filtered.published_at,
    filtered.cover_url,
    count(*) OVER () AS total_count
  FROM filtered
  ORDER BY
    CASE WHEN p_sort = 'trending' THEN filtered.installs_7d END DESC NULLS LAST,
    CASE WHEN p_sort = 'top_rated' THEN filtered.rating_avg END DESC NULLS LAST,
    CASE WHEN p_sort = 'newest' THEN filtered.published_at END DESC NULLS LAST,
    CASE WHEN p_sort = 'featured' OR p_sort IS NULL THEN filtered.is_featured END DESC,
    filtered.sort_order,
    filtered.install_count DESC,
    filtered.slug
  LIMIT (SELECT row_limit FROM params)
  OFFSET (SELECT row_offset FROM params);
$$;

REVOKE EXECUTE ON FUNCTION public.search_skill_catalog(TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_skill_catalog(TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER)
  TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Entitlement checks and payment fulfillment (service role only)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.skill_catalog_user_access(
  p_user_id UUID,
  p_skill_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tier TEXT;
  v_source TEXT;
BEGIN
  SELECT tier INTO v_tier
  FROM public.skill_catalog
  WHERE id = p_skill_id AND status = 'published';

  IF v_tier IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'skill_not_found');
  END IF;
  IF v_tier = 'free' THEN
    RETURN jsonb_build_object('allowed', true, 'source', 'free');
  END IF;

  SELECT source INTO v_source
  FROM public.skill_entitlements
  WHERE user_id = p_user_id
    AND status = 'active'
    AND starts_at <= NOW()
    AND (ends_at IS NULL OR ends_at > NOW())
    AND (skill_id IS NULL OR skill_id = p_skill_id)
  ORDER BY CASE source WHEN 'lifetime' THEN 0 WHEN 'subscription' THEN 1 ELSE 2 END
  LIMIT 1;

  IF v_source IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'entitlement_required');
  END IF;
  RETURN jsonb_build_object('allowed', true, 'source', v_source);
END;
$$;

-- Idempotent per (payment order, skill): a webhook replay or a retried
-- fulfillment extends the same row instead of creating a second grant.
-- Revoked rows (refunds) are never reactivated by a replay.
CREATE OR REPLACE FUNCTION public.grant_skill_entitlement(
  p_user_id UUID,
  p_payment_order_id UUID,
  p_source TEXT,
  p_skill_id UUID DEFAULT NULL,
  p_starts_at TIMESTAMPTZ DEFAULT NOW(),
  p_ends_at TIMESTAMPTZ DEFAULT NULL,
  p_external_subscription_id TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_user UUID;
  v_id UUID;
BEGIN
  SELECT user_id INTO v_order_user
  FROM public.payment_orders
  WHERE id = p_payment_order_id;
  IF v_order_user IS NULL THEN
    RAISE EXCEPTION 'SKILL_ENTITLEMENT_ORDER_NOT_FOUND: %', p_payment_order_id;
  END IF;
  IF v_order_user <> p_user_id THEN
    RAISE EXCEPTION 'SKILL_ENTITLEMENT_ORDER_USER_MISMATCH: %', p_payment_order_id;
  END IF;

  INSERT INTO public.skill_entitlements AS entitlement (
    user_id, source, skill_id, payment_order_id, external_subscription_id,
    status, starts_at, ends_at, metadata
  )
  VALUES (
    p_user_id, p_source, p_skill_id, p_payment_order_id, p_external_subscription_id,
    'active', COALESCE(p_starts_at, NOW()), p_ends_at, COALESCE(p_metadata, '{}'::jsonb)
  )
  ON CONFLICT ON CONSTRAINT skill_entitlements_order_skill_key DO UPDATE
  SET
    ends_at = CASE
      WHEN entitlement.status = 'revoked' THEN entitlement.ends_at
      WHEN entitlement.ends_at IS NULL OR EXCLUDED.ends_at IS NULL THEN EXCLUDED.ends_at
      ELSE GREATEST(entitlement.ends_at, EXCLUDED.ends_at)
    END,
    external_subscription_id = COALESCE(
      entitlement.external_subscription_id, EXCLUDED.external_subscription_id
    ),
    metadata = entitlement.metadata || EXCLUDED.metadata,
    updated_at = NOW()
  RETURNING entitlement.id INTO v_id;

  RETURN v_id;
END;
$$;

-- Mirrors the provider subscription state onto its Skill entitlements:
-- renewals extend ends_at, past_due/canceled-and-expired suspend, recovery
-- reactivates. Refund revocations are terminal and left untouched.
CREATE OR REPLACE FUNCTION public.sync_subscription_skill_entitlements(
  p_external_subscription_id TEXT,
  p_has_access BOOLEAN,
  p_ends_at TIMESTAMPTZ,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  IF p_external_subscription_id IS NULL OR p_external_subscription_id = '' THEN
    RETURN 0;
  END IF;

  UPDATE public.skill_entitlements
  SET
    status = CASE WHEN p_has_access THEN 'active' ELSE 'suspended' END,
    ends_at = COALESCE(p_ends_at, ends_at),
    metadata = metadata || COALESCE(p_metadata, '{}'::jsonb),
    updated_at = NOW()
  WHERE external_subscription_id = p_external_subscription_id
    AND source = 'subscription'
    AND status <> 'revoked';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_skill_entitlements_for_order(
  p_payment_order_id UUID,
  p_reason TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE public.skill_entitlements
  SET
    status = 'revoked',
    revoked_at = NOW(),
    revoke_reason = p_reason,
    updated_at = NOW()
  WHERE payment_order_id = p_payment_order_id
    AND status <> 'revoked';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ---------------------------------------------------------------------------
-- CLI device authorization (RFC 8628) and credential lookup (service role only)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.decide_cli_device_authorization(
  p_user_code TEXT,
  p_user_id UUID,
  p_approve BOOLEAN
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.cli_device_authorizations%ROWTYPE;
BEGIN
  SELECT * INTO v_row
  FROM public.cli_device_authorizations
  WHERE user_code = upper(p_user_code) AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;
  IF v_row.expires_at <= NOW() THEN
    UPDATE public.cli_device_authorizations SET status = 'expired' WHERE id = v_row.id;
    RETURN 'expired';
  END IF;

  UPDATE public.cli_device_authorizations
  SET
    status = CASE WHEN p_approve THEN 'approved' ELSE 'denied' END,
    user_id = p_user_id,
    decided_at = NOW()
  WHERE id = v_row.id;
  RETURN CASE WHEN p_approve THEN 'approved' ELSE 'denied' END;
END;
$$;

-- One-shot token exchange. Returns the RFC 8628 error code, or 'issued' with
-- the credential id after storing the caller-generated token hash.
CREATE OR REPLACE FUNCTION public.poll_cli_device_authorization(
  p_device_code_hash TEXT,
  p_token_hash TEXT,
  p_token_prefix TEXT,
  p_credential_ttl INTERVAL DEFAULT INTERVAL '180 days'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.cli_device_authorizations%ROWTYPE;
  v_now TIMESTAMPTZ := clock_timestamp();
  v_credential_id UUID;
  v_expires_at TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_row
  FROM public.cli_device_authorizations
  WHERE device_code_hash = p_device_code_hash
  FOR UPDATE;

  IF NOT FOUND OR v_row.status = 'consumed' THEN
    RETURN jsonb_build_object('status', 'invalid_grant');
  END IF;
  IF v_row.status = 'denied' THEN
    RETURN jsonb_build_object('status', 'access_denied');
  END IF;
  IF v_row.status = 'expired' OR v_row.expires_at <= v_now THEN
    UPDATE public.cli_device_authorizations SET status = 'expired' WHERE id = v_row.id;
    RETURN jsonb_build_object('status', 'expired_token');
  END IF;

  IF v_row.status = 'pending' THEN
    IF v_row.last_polled_at IS NOT NULL
      AND v_now < v_row.last_polled_at + make_interval(secs => v_row.interval_seconds)
    THEN
      UPDATE public.cli_device_authorizations
      SET last_polled_at = v_now,
          interval_seconds = LEAST(interval_seconds + 5, 60)
      WHERE id = v_row.id;
      RETURN jsonb_build_object(
        'status', 'slow_down',
        'interval', LEAST(v_row.interval_seconds + 5, 60)
      );
    END IF;
    UPDATE public.cli_device_authorizations
    SET last_polled_at = v_now
    WHERE id = v_row.id;
    RETURN jsonb_build_object('status', 'authorization_pending');
  END IF;

  -- approved
  v_expires_at := v_now + p_credential_ttl;
  INSERT INTO public.cli_credentials (
    user_id, token_hash, token_prefix, scope, device_authorization_id,
    client_name, expires_at
  )
  VALUES (
    v_row.user_id, p_token_hash, p_token_prefix, 'skills:download', v_row.id,
    v_row.client_name, v_expires_at
  )
  RETURNING id INTO v_credential_id;

  UPDATE public.cli_device_authorizations
  SET status = 'consumed', consumed_at = v_now, credential_id = v_credential_id
  WHERE id = v_row.id;

  RETURN jsonb_build_object(
    'status', 'issued',
    'credential_id', v_credential_id,
    'user_id', v_row.user_id,
    'expires_at', v_expires_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.authenticate_cli_credential(p_token_hash TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.cli_credentials%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.cli_credentials WHERE token_hash = p_token_hash;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  IF v_row.revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'revoked');
  END IF;
  IF v_row.expires_at <= NOW() THEN
    RETURN jsonb_build_object('status', 'expired');
  END IF;

  IF v_row.last_used_at IS NULL OR v_row.last_used_at < NOW() - INTERVAL '5 minutes' THEN
    UPDATE public.cli_credentials SET last_used_at = NOW() WHERE id = v_row.id;
  END IF;

  RETURN jsonb_build_object(
    'status', 'active',
    'credential_id', v_row.id,
    'user_id', v_row.user_id,
    'scope', v_row.scope,
    'expires_at', v_row.expires_at
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.skill_catalog_user_access(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.grant_skill_entitlement(UUID, UUID, TEXT, UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_subscription_skill_entitlements(TEXT, BOOLEAN, TIMESTAMPTZ, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.revoke_skill_entitlements_for_order(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.decide_cli_device_authorization(TEXT, UUID, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.poll_cli_device_authorization(TEXT, TEXT, TEXT, INTERVAL) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.authenticate_cli_credential(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_skill_catalog_version_immutability() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_skill_catalog_install_count() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.skill_catalog_user_access(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.grant_skill_entitlement(UUID, UUID, TEXT, UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_subscription_skill_entitlements(TEXT, BOOLEAN, TIMESTAMPTZ, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.revoke_skill_entitlements_for_order(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.decide_cli_device_authorization(TEXT, UUID, BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION public.poll_cli_device_authorization(TEXT, TEXT, TEXT, INTERVAL) TO service_role;
GRANT EXECUTE ON FUNCTION public.authenticate_cli_credential(TEXT) TO service_role;

-- ---------------------------------------------------------------------------
-- Plans: Skill Pro subscription and lifetime purchase
-- ---------------------------------------------------------------------------

ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS billing_kind TEXT NOT NULL DEFAULT 'recurring',
  ADD COLUMN IF NOT EXISTS skill_tier_access TEXT NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS price_one_time INTEGER,
  ADD COLUMN IF NOT EXISTS price_cny_monthly INTEGER,
  ADD COLUMN IF NOT EXISTS price_cny_yearly INTEGER,
  ADD COLUMN IF NOT EXISTS price_cny_one_time INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'subscription_plans_billing_kind_check'
  ) THEN
    ALTER TABLE public.subscription_plans
      ADD CONSTRAINT subscription_plans_billing_kind_check
      CHECK (billing_kind IN ('recurring', 'one_time'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'subscription_plans_skill_tier_access_check'
  ) THEN
    ALTER TABLE public.subscription_plans
      ADD CONSTRAINT subscription_plans_skill_tier_access_check
      CHECK (skill_tier_access IN ('free', 'premium'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'subscription_plans_one_time_price_check'
  ) THEN
    ALTER TABLE public.subscription_plans
      ADD CONSTRAINT subscription_plans_one_time_price_check
      CHECK (billing_kind <> 'one_time' OR (price_one_time IS NOT NULL AND price_one_time > 0));
  END IF;
END;
$$;

-- Prices: USD cents (price_*) and CNY fen (price_cny_*). Seeded inactive so the
-- current pricing page and checkout are unchanged until launch; the launch
-- runbook activates them with `UPDATE subscription_plans SET is_active = true`.
-- Skill Pro mirrors the current Pro plan's monthly web-run credits and limits,
-- so subscription fulfillment (which replaces free daily credits with the
-- plan's monthly grant) behaves exactly as it does for Pro.
INSERT INTO public.subscription_plans (
  id, name, display_name, description, price_monthly, price_yearly,
  monthly_credits, features, limits, sort_order, is_active,
  billing_kind, skill_tier_access, price_one_time,
  price_cny_monthly, price_cny_yearly, price_cny_one_time
)
VALUES
  (
    'skill_pro', 'skill_pro',
    '{"zh-CN": "Skill Pro", "en-US": "Skill Pro"}'::jsonb,
    'All premium Skills, updates and new Skills, monthly web-run credits',
    999, 7900,
    COALESCE((SELECT monthly_credits FROM public.subscription_plans WHERE id = 'pro'), 0),
    '["premium_skills", "skill_updates", "web_run_credits"]'::jsonb,
    COALESCE((SELECT limits FROM public.subscription_plans WHERE id = 'pro'), '{}'::jsonb),
    50, false,
    'recurring', 'premium', NULL,
    4900, 39900, NULL
  ),
  (
    'skill_lifetime', 'skill_lifetime',
    '{"zh-CN": "Skill 买断", "en-US": "Skill Lifetime"}'::jsonb,
    'Permanent install and update access to every premium Skill; no monthly credits',
    0, 0, 0,
    '["premium_skills", "skill_updates"]'::jsonb,
    '{}'::jsonb,
    60, false,
    'one_time', 'premium', 16900,
    NULL, NULL, 89900
  )
ON CONFLICT (id) DO NOTHING;

-- Existing paid plans include every premium Skill.
UPDATE public.subscription_plans
SET skill_tier_access = 'premium', updated_at = NOW()
WHERE id IN ('pro', 'max') AND skill_tier_access <> 'premium';

-- ---------------------------------------------------------------------------
-- Backfill: premium Skill access for subscriptions that are paid right now
-- ---------------------------------------------------------------------------

-- Covers only subscriptions with current paid access (active / trialing, or
-- canceled with time left; past_due is excluded, matching
-- hasPaidSubscriptionAccess). Each grant is tied to the paying order:
-- ZPAY by its trade number, Stripe by the user's latest succeeded
-- subscription checkout (same plan first). Subscriptions without a traceable
-- order are reported, never granted. Idempotent; refunded (revoked) grants are
-- never restored. p_apply = false is a dry run.
CREATE OR REPLACE FUNCTION public.backfill_subscription_skill_entitlements(
  p_apply BOOLEAN DEFAULT false,
  p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub RECORD;
  v_order_id UUID;
  v_method TEXT;
  v_external TEXT;
  v_existing public.skill_entitlements%ROWTYPE;
  v_eligible INTEGER := 0;
  v_granted INTEGER := 0;
  v_current INTEGER := 0;
  v_revoked INTEGER := 0;
  v_unmatched JSONB := '[]'::jsonb;
BEGIN
  FOR v_sub IN
    SELECT subscription.*
    FROM public.user_subscriptions subscription
    JOIN public.subscription_plans plan ON plan.id = subscription.plan_id
    WHERE plan.skill_tier_access = 'premium'
      AND subscription.status IN ('active', 'trialing', 'canceled', 'cancelled')
      AND subscription.current_period_end > NOW()
      AND (p_user_id IS NULL OR subscription.user_id = p_user_id)
    ORDER BY subscription.created_at
  LOOP
    v_eligible := v_eligible + 1;
    v_order_id := NULL;
    v_external := COALESCE(v_sub.stripe_subscription_id, v_sub.external_subscription_id);

    IF v_sub.payment_provider = 'zpay' THEN
      v_method := 'zpay_trade_no';
      SELECT id INTO v_order_id
      FROM public.payment_orders
      WHERE user_id = v_sub.user_id
        AND provider = 'zpay'
        AND product_type = 'subscription'
        AND status = 'succeeded'
        AND metadata ->> 'provider_payment_id' = v_sub.external_subscription_id
      LIMIT 1;
    ELSE
      v_method := 'latest_stripe_subscription_order';
      SELECT id INTO v_order_id
      FROM public.payment_orders
      WHERE user_id = v_sub.user_id
        AND COALESCE(provider, 'stripe') = 'stripe'
        AND product_type = 'subscription'
        AND status = 'succeeded'
        AND created_at <= v_sub.current_period_end
      ORDER BY (product_id = v_sub.plan_id) DESC, created_at DESC
      LIMIT 1;
    END IF;

    IF v_order_id IS NULL THEN
      v_unmatched := v_unmatched || jsonb_build_object(
        'user_subscription_id', v_sub.id,
        'user_id', v_sub.user_id,
        'plan_id', v_sub.plan_id,
        'payment_provider', v_sub.payment_provider
      );
      CONTINUE;
    END IF;

    SELECT * INTO v_existing
    FROM public.skill_entitlements
    WHERE payment_order_id = v_order_id AND skill_id IS NULL;

    IF FOUND AND v_existing.status = 'revoked' THEN
      v_revoked := v_revoked + 1;
      CONTINUE;
    END IF;
    IF FOUND
      AND v_existing.status = 'active'
      AND v_existing.ends_at >= v_sub.current_period_end
    THEN
      v_current := v_current + 1;
      CONTINUE;
    END IF;

    v_granted := v_granted + 1;
    IF NOT p_apply THEN
      CONTINUE;
    END IF;

    IF FOUND THEN
      UPDATE public.skill_entitlements
      SET status = 'active',
          ends_at = GREATEST(ends_at, v_sub.current_period_end),
          external_subscription_id = COALESCE(external_subscription_id, v_external),
          updated_at = NOW()
      WHERE id = v_existing.id;
    ELSE
      PERFORM public.grant_skill_entitlement(
        v_sub.user_id,
        v_order_id,
        'subscription',
        NULL,
        v_sub.current_period_start,
        v_sub.current_period_end,
        v_external,
        jsonb_build_object(
          'backfill', true,
          'match_method', v_method,
          'user_subscription_id', v_sub.id,
          'plan_id', v_sub.plan_id
        )
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'applied', p_apply,
    'eligible', v_eligible,
    CASE WHEN p_apply THEN 'granted' ELSE 'would_grant' END, v_granted,
    'already_current', v_current,
    'revoked_skipped', v_revoked,
    'unmatched', v_unmatched
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.backfill_subscription_skill_entitlements(BOOLEAN, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.backfill_subscription_skill_entitlements(BOOLEAN, UUID)
  TO service_role;

-- Allow the lifetime purchase as a payment order product. Historic rows are
-- not re-validated (NOT VALID) so legacy product types cannot block deploys.
DO $$
DECLARE
  v_constraint RECORD;
BEGIN
  FOR v_constraint IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.payment_orders'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%product_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.payment_orders DROP CONSTRAINT %I', v_constraint.conname);
  END LOOP;

  ALTER TABLE public.payment_orders
    ADD CONSTRAINT payment_orders_product_type_check
    CHECK (product_type IN ('subscription', 'credit_package', 'api_credit_package', 'skill_lifetime'))
    NOT VALID;
END;
$$;

NOTIFY pgrst, 'reload schema';
