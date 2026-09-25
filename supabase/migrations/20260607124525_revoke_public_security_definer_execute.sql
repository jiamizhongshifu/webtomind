-- Close direct Data API access to privileged SECURITY DEFINER functions.
-- Server endpoints must call these RPCs with service_role after verifying users.

REVOKE EXECUTE ON FUNCTION public.handle_new_user_marketing_email()
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.consume_credits(UUID, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.consume_quick_reply_quota(UUID)
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.consume_weaving_quota(UUID)
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.get_project_stats(UUID)
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.grant_subscription_credits_if_due(UUID)
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.increment_skill_use_count(UUID)
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.list_workspace_summaries(
  UUID,
  UUID,
  INTEGER,
  INTEGER,
  INTEGER
) FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.refund_image_generation_credit(
  UUID,
  INTEGER,
  TEXT,
  JSONB
) FROM PUBLIC, anon, authenticated;

-- New public-schema functions should be exposed intentionally, not by default.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
