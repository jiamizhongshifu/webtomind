-- Supabase linter remediation for media credit operational reporting.
-- This admin diagnostic view is read through service-role APIs after admin auth,
-- so it should execute with invoker privileges instead of definer privileges.

SET search_path = public;

ALTER VIEW public.media_credit_daily_summary
  SET (security_invoker = true);

REVOKE ALL ON public.media_credit_daily_summary
  FROM anon, authenticated, PUBLIC;

GRANT SELECT ON public.media_credit_daily_summary
  TO service_role;

NOTIFY pgrst, 'reload schema';
