-- Keep privileged credit RPCs behind server-side endpoints.
-- Browser clients should never call these SECURITY DEFINER functions directly:
-- each one accepts p_user_id and mutates balances or reward state.

SET search_path = public;

CREATE OR REPLACE FUNCTION public.set_workspace_task_runs_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_daily_login_reward(
  UUID,
  INTEGER,
  INTEGER,
  DATE
) FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.consume_credits(
  UUID,
  TEXT,
  JSONB
) FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.refund_image_generation_credit(
  UUID,
  INTEGER,
  TEXT,
  JSONB
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_daily_login_reward(
  UUID,
  INTEGER,
  INTEGER,
  DATE
) TO service_role;

GRANT EXECUTE ON FUNCTION public.consume_credits(
  UUID,
  TEXT,
  JSONB
) TO service_role;

GRANT EXECUTE ON FUNCTION public.refund_image_generation_credit(
  UUID,
  INTEGER,
  TEXT,
  JSONB
) TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
