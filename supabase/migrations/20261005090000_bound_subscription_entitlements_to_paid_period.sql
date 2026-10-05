-- Change future entitlement decisions only. Do not reclaim historical grants
-- or alter provider subscription state. Apply after compatible Worker code.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $policy$
DECLARE
  v_signature TEXT;
  v_definition TEXT;
  v_rewritten TEXT;
  v_predicate TEXT;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.grant_subscription_credits_if_due(uuid)',
    'public.consume_credits(uuid,text,jsonb)',
    'public.consume_weaving_quota(uuid,text)',
    'public.reconcile_free_credit_policy(uuid)'
  ] LOOP
    IF to_regprocedure(v_signature) IS NULL THEN
      RAISE EXCEPTION 'Required entitlement function missing: %', v_signature;
    END IF;
    SELECT pg_get_functiondef(to_regprocedure(v_signature)) INTO v_definition;
    -- Keep the deployed billing/idempotency logic, replacing only its member
    -- selection predicate. Abort on drift instead of silently skipping a gate.
    IF v_signature = 'public.reconcile_free_credit_policy(uuid)' THEN
      v_predicate := $$s.status IN ('active', 'trialing', 'past_due', 'canceled')$$;
      v_rewritten := replace(v_definition, v_predicate,
        $$s.status IN ('active', 'trialing', 'canceled') AND s.current_period_end > NOW()$$);
    ELSE
      v_predicate := $$AND status IN ('active', 'trialing', 'canceled')$$;
      v_rewritten := replace(v_definition, v_predicate,
        $$AND status IN ('active', 'trialing', 'canceled') AND current_period_end > NOW()$$);
    END IF;
    IF v_rewritten = v_definition THEN
      RAISE EXCEPTION 'Entitlement function changed; review before migrating: %', v_signature;
    END IF;
    EXECUTE v_rewritten;
  END LOOP;
END;
$policy$;
