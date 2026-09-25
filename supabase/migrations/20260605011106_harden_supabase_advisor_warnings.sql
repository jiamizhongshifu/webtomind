-- Harden Supabase Advisor warnings without changing the app's REST/RLS data path.

-- Public buckets do not need broad storage.objects SELECT policies for public
-- object URLs. Keeping those policies lets clients list every object.
DROP POLICY IF EXISTS "Public read access for generated images" ON storage.objects;
DROP POLICY IF EXISTS "Public read access for studio assets" ON storage.objects;

-- The application does not use Supabase GraphQL. Disabling pg_graphql removes
-- GraphQL schema exposure without revoking table grants used by PostgREST/RLS.
DROP EXTENSION IF EXISTS pg_graphql;

-- SECURITY DEFINER functions should not be executable by anonymous users or by
-- PUBLIC. Keep authenticated only where current server endpoints still call the
-- RPC with a verified user JWT.
REVOKE EXECUTE ON FUNCTION public.add_bonus_credits(UUID, INTEGER, TEXT, JSONB)
  FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.calculate_claude_cost(TEXT, INTEGER, INTEGER)
  FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.calculate_credit_cost(TEXT, INTEGER, INTEGER)
  FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.consume_credits(UUID, TEXT, JSONB)
  FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.consume_quick_reply_quota(UUID)
  FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.consume_weaving_quota(UUID)
  FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.copy_skill_from_template(UUID, TEXT)
  FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_config(VARCHAR, VARCHAR)
  FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_config_by_category(VARCHAR)
  FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_project_stats(UUID)
  FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_skill_layer3_metadata(UUID[])
  FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_skill_stats()
  FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.grant_subscription_credits_if_due(UUID)
  FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user()
  FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_credits()
  FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_default_project()
  FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_prompt_case_event(UUID, TEXT)
  FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_skill_use_count(UUID)
  FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.list_workspace_summaries(
  UUID,
  UUID,
  INTEGER,
  INTEGER,
  INTEGER
) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.refund_image_generation_credit(
  UUID,
  INTEGER,
  TEXT,
  JSONB
) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_config(VARCHAR, VARCHAR, JSONB)
  FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_current_timestamp_updated_at()
  FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_skill_references_updated_at()
  FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_skill_scripts_updated_at()
  FROM anon, authenticated, PUBLIC;

-- New functions must be granted intentionally.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated, PUBLIC;
