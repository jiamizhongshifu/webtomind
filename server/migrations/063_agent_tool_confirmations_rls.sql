-- Harden agent_tool_confirmations: enable RLS and restrict API roles.
-- Fixes:
-- - rls_disabled_in_public
-- - sensitive_columns_exposed (session_id)

set search_path = public;

alter table if exists public.agent_tool_confirmations
  enable row level security;

-- Keep this table backend-only. Only service_role may operate on it.
drop policy if exists "agent_tool_confirmations_service_role_only"
  on public.agent_tool_confirmations;

create policy "agent_tool_confirmations_service_role_only"
  on public.agent_tool_confirmations
  for all
  to service_role
  using (true)
  with check (true);

-- Explicitly block direct access from API-facing roles.
revoke all on table public.agent_tool_confirmations from anon;
revoke all on table public.agent_tool_confirmations from authenticated;
grant all on table public.agent_tool_confirmations to service_role;

-- Identity sequence privileges (for inserts via service_role).
revoke all on sequence public.agent_tool_confirmations_id_seq from anon;
revoke all on sequence public.agent_tool_confirmations_id_seq from authenticated;
grant usage, select on sequence public.agent_tool_confirmations_id_seq to service_role;

comment on table public.agent_tool_confirmations is
  'Backend-only tool confirmation decisions; RLS enabled; service_role access only.';
