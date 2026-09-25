-- Keep public API execution grants explicit instead of relying on PUBLIC.

SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.search_prompt_cases_public(
  INTEGER,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  BOOLEAN,
  BOOLEAN
) FROM PUBLIC;

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

REVOKE EXECUTE ON FUNCTION public.set_workspace_canvas_states_updated_at()
  FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.set_workspace_canvas_templates_updated_at()
  FROM PUBLIC;

NOTIFY pgrst, 'reload schema';
