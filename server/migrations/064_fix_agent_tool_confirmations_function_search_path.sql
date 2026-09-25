-- Fix Supabase linter warning:
-- function_search_path_mutable on public.touch_agent_tool_confirmations_updated_at

set search_path = public;

create or replace function public.touch_agent_tool_confirmations_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
