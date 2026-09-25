-- Supabase linter remediation for public prompt search and workspace canvas
-- helper functions.

SET search_path = public;

ALTER FUNCTION public.set_workspace_canvas_states_updated_at()
  SET search_path = public;

ALTER FUNCTION public.set_workspace_canvas_templates_updated_at()
  SET search_path = public;

-- Public prompt cases already have an anon/authenticated SELECT RLS policy.
-- Run this read-only search RPC as the caller instead of bypassing RLS.
ALTER FUNCTION public.search_prompt_cases_public(
  INTEGER,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  BOOLEAN,
  BOOLEAN
)
  SECURITY INVOKER;

GRANT EXECUTE ON FUNCTION public.search_prompt_cases_public(
  INTEGER,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  BOOLEAN,
  BOOLEAN
) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
