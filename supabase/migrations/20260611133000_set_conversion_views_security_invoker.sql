-- Supabase linter remediation for conversion observability views.
-- Keep these diagnostic views invoker-secured; production access is through
-- service-role APIs, not direct anon/authenticated client reads.

ALTER VIEW public.conversion_funnel_daily
  SET (security_invoker = true);

ALTER VIEW public.conversion_reengagement_segments
  SET (security_invoker = true);

REVOKE ALL ON public.conversion_funnel_daily
  FROM anon, authenticated, PUBLIC;
REVOKE ALL ON public.conversion_reengagement_segments
  FROM anon, authenticated, PUBLIC;

GRANT SELECT ON public.conversion_funnel_daily TO service_role;
GRANT SELECT ON public.conversion_reengagement_segments TO service_role;
