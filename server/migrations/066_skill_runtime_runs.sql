-- 051_skill_runtime_runs.sql
-- Skill Runtime 持久化表

create table if not exists skill_runtime_runs (
  id uuid primary key,
  user_id uuid not null,
  skill_id text,
  mode text not null check (mode in ('sync', 'async', 'hybrid')),
  status text not null check (status in ('queued', 'running', 'waiting_confirmation', 'waiting_async', 'completed', 'failed', 'cancelled')),
  trace_id text not null,
  started_at bigint not null,
  ended_at bigint,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_skill_runtime_runs_user_started_at
  on skill_runtime_runs(user_id, started_at desc);

create table if not exists skill_runtime_steps (
  id uuid primary key,
  run_id uuid not null references skill_runtime_runs(id) on delete cascade,
  step_index integer not null,
  kind text not null,
  status text not null,
  title text not null,
  tool_name text,
  payload jsonb,
  started_at bigint not null,
  ended_at bigint,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists idx_skill_runtime_steps_run_id
  on skill_runtime_steps(run_id, step_index asc);

create table if not exists skill_runtime_artifacts (
  id uuid primary key,
  run_id uuid not null references skill_runtime_runs(id) on delete cascade,
  step_id uuid references skill_runtime_steps(id) on delete set null,
  type text not null,
  title text,
  preview text,
  data jsonb,
  created_at bigint not null,
  inserted_at timestamptz not null default now()
);

create index if not exists idx_skill_runtime_artifacts_run_id
  on skill_runtime_artifacts(run_id, created_at desc);
