-- Emergency product policy: image generation requires an unexpired paid plan.
-- Preserve balances, refunds, and all non-image spending. No customer data.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE OR REPLACE FUNCTION public.has_paid_image_membership(p_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_subscriptions s
    JOIN public.subscription_plans p ON p.id = s.plan_id
    WHERE s.user_id = p_user_id
      AND s.status IN ('active', 'canceled')
      AND s.current_period_start <= now()
      AND s.current_period_end > now()
      AND p.id <> 'free'
      AND (p.price_monthly > 0 OR p.price_yearly > 0)
  );
$$;
REVOKE ALL ON FUNCTION public.has_paid_image_membership(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_paid_image_membership(UUID) TO service_role;

-- Insert before idempotency lookup as old charges must not grant new access.
-- Retain the deployed billing implementation and its existing ACLs.
DO $policy$
DECLARE
  v_definition TEXT;
  v_begin INTEGER;
BEGIN
  SELECT pg_get_functiondef('public.consume_credits(uuid,text,jsonb)'::regprocedure)
    INTO v_definition;
  IF position('paid_image_membership_gate_v1' IN v_definition) > 0 THEN
    RETURN;
  END IF;
  v_begin := position(E'\nBEGIN\n' IN v_definition);
  IF v_begin = 0 THEN
    RAISE EXCEPTION 'consume_credits body changed; review before migrating';
  END IF;
  EXECUTE overlay(v_definition placing $gate$
BEGIN
  -- paid_image_membership_gate_v1
  IF p_action = 'image_generation' AND NOT public.has_paid_image_membership(p_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'PAID_MEMBERSHIP_REQUIRED',
      'message', '生图功能仅限有效付费会员使用，请开通或续费会员');
  END IF;
$gate$ from v_begin for length(E'\nBEGIN\n'));
END;
$policy$;

-- Also block new retry/waiver tasks that bypass normal credit charging.
CREATE OR REPLACE FUNCTION public.snapshot_image_task_entitlement()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_paid_image_membership(NEW.user_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PAID_MEMBERSHIP_REQUIRED',
      DETAIL = 'Image generation requires an unexpired paid membership';
  END IF;
  NEW.request_payload := jsonb_set(COALESCE(NEW.request_payload, '{}'::jsonb), '{entitlementAtEnqueue}',
    jsonb_build_object('paidAccess', true, 'observedAt', now()), true);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.snapshot_image_task_entitlement() FROM PUBLIC, anon, authenticated;
NOTIFY pgrst, 'reload schema';
