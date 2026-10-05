-- Historical tasks remain unknown: never infer their paid cohort from today's
-- subscription status. The server overwrites any caller-provided snapshot.
SET LOCAL lock_timeout = '5s';
CREATE OR REPLACE FUNCTION public.snapshot_image_task_entitlement()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.request_payload := jsonb_set(COALESCE(NEW.request_payload, '{}'::jsonb), '{entitlementAtEnqueue}',
    jsonb_build_object('paidAccess', EXISTS (
      SELECT 1 FROM public.user_subscriptions
      WHERE user_id = NEW.user_id AND status IN ('active','trialing','canceled')
        AND current_period_start <= now() AND current_period_end > now()
        AND plan_id::text <> 'free'
    ), 'observedAt', now()), true);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.snapshot_image_task_entitlement() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS snapshot_image_task_entitlement ON public.image_generation_tasks;
CREATE TRIGGER snapshot_image_task_entitlement BEFORE INSERT ON public.image_generation_tasks
FOR EACH ROW EXECUTE FUNCTION public.snapshot_image_task_entitlement();
