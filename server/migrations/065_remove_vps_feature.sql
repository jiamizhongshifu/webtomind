-- Remove deprecated VPS feature tables, views, and helper functions.

DROP VIEW IF EXISTS public.vps_usage_summary;

DROP TABLE IF EXISTS public.vps_agent_configs CASCADE;
DROP TABLE IF EXISTS public.vps_api_usage CASCADE;
DROP TABLE IF EXISTS public.vps_tokens CASCADE;
DROP TABLE IF EXISTS public.user_vps_subscriptions CASCADE;
DROP TABLE IF EXISTS public.vps_task_history CASCADE;
DROP TABLE IF EXISTS public.vps_knowledge_items CASCADE;
DROP TABLE IF EXISTS public.vps_skills CASCADE;
DROP TABLE IF EXISTS public.vps_scheduled_tasks CASCADE;
DROP TABLE IF EXISTS public.user_vps_instances CASCADE;

DROP FUNCTION IF EXISTS public.record_vps_api_usage(
  UUID,
  UUID,
  TEXT,
  TEXT,
  INTEGER,
  INTEGER,
  TEXT,
  INTEGER,
  TEXT,
  TEXT,
  JSONB
);
DROP FUNCTION IF EXISTS public.check_vps_subscription(UUID);
DROP FUNCTION IF EXISTS public.update_vps_updated_at_column();
