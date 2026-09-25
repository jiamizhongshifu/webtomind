-- Atomically claim image tasks and fence stale workers from terminal writes.

SET search_path = public;

ALTER TABLE public.image_generation_tasks
  ADD COLUMN IF NOT EXISTS lease_token UUID,
  ADD COLUMN IF NOT EXISTS max_attempts INTEGER NOT NULL DEFAULT 24;

ALTER TABLE public.image_generation_tasks
  DROP CONSTRAINT IF EXISTS image_generation_tasks_max_attempts_positive;

ALTER TABLE public.image_generation_tasks
  ADD CONSTRAINT image_generation_tasks_max_attempts_positive
  CHECK (max_attempts BETWEEN 1 AND 100);

CREATE OR REPLACE FUNCTION public.claim_image_generation_task(
  p_task_id UUID,
  p_expected_status TEXT,
  p_user_id UUID,
  p_concurrency INTEGER DEFAULT 1,
  p_lease_seconds INTEGER DEFAULT 345,
  p_max_attempts INTEGER DEFAULT 24
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $claim_image_generation_task$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_task public.image_generation_tasks%ROWTYPE;
  v_active_count INTEGER := 0;
  v_lease_seconds INTEGER := LEAST(GREATEST(COALESCE(p_lease_seconds, 345), 30), 600);
  v_concurrency INTEGER := LEAST(GREATEST(COALESCE(p_concurrency, 1), 1), 8);
  v_max_attempts INTEGER := LEAST(GREATEST(COALESCE(p_max_attempts, 24), 1), 100);
  v_prepaid_credit JSONB;
  v_refund_result JSONB;
  v_refunded INTEGER := 0;
  v_refund_failed BOOLEAN := FALSE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'claim_image_generation_task requires service_role'
      USING ERRCODE = '42501';
  END IF;

  IF p_expected_status NOT IN ('queued', 'running') THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'invalid_status');
  END IF;

  SELECT * INTO v_task
  FROM public.image_generation_tasks
  WHERE id = p_task_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'not_found');
  END IF;

  IF p_user_id IS NOT NULL AND v_task.user_id IS DISTINCT FROM p_user_id THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'owner_mismatch');
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext('claim_image_generation_task'),
    hashtext(v_task.user_id::TEXT)
  );

  IF v_task.status IS DISTINCT FROM p_expected_status
     OR v_task.status NOT IN ('queued', 'running')
     OR (v_task.status = 'running' AND v_task.locked_until > v_now) THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'not_claimable');
  END IF;

  v_max_attempts := LEAST(v_max_attempts, COALESCE(v_task.max_attempts, v_max_attempts));
  IF COALESCE(v_task.attempt_count, 0) >= v_max_attempts THEN
    v_prepaid_credit := COALESCE(v_task.request_payload, '{}'::jsonb)->'prepaidCredit';
    IF jsonb_typeof(v_prepaid_credit) = 'object'
       AND COALESCE((v_prepaid_credit->>'consumed')::INTEGER, 0) > 0 THEN
      BEGIN
        v_refund_result := public.refund_generation_credit(
          v_task.user_id,
          (v_prepaid_credit->>'consumed')::INTEGER,
          COALESCE(NULLIF(v_prepaid_credit->>'creditType', ''), 'bonus'),
          'image_task:' || v_task.id::TEXT || ':max_attempts_refund',
          jsonb_build_object(
            'billingDomain', 'image_task',
            'billingPhase', 'max_attempts_refund',
            'idempotency_key', 'image_task:' || v_task.id::TEXT || ':max_attempts_refund',
            'taskId', v_task.id,
            'creditBreakdown', COALESCE(v_prepaid_credit->'creditBreakdown', '{}'::jsonb)
          )
        );
        v_refund_failed := COALESCE((v_refund_result->>'success')::BOOLEAN, FALSE) IS FALSE;
        IF NOT v_refund_failed THEN
          v_refunded := COALESCE(
            (v_refund_result->>'refunded')::INTEGER,
            (v_prepaid_credit->>'consumed')::INTEGER
          );
        END IF;
      EXCEPTION WHEN OTHERS THEN
        v_refund_failed := TRUE;
        v_refund_result := jsonb_build_object('success', false, 'error', SQLERRM);
      END;
    END IF;

    UPDATE public.image_generation_tasks
    SET
      status = 'failed',
      error_message = '任务重试次数已达上限',
      failure_category = 'worker_timeout',
      failure_code = 'IMAGE_TASK_MAX_ATTEMPTS_EXCEEDED',
      locked_until = NULL,
      lease_token = NULL,
      refund_failed = v_refund_failed,
      completed_at = v_now,
      updated_at = v_now,
      result_payload = jsonb_build_object(
        'success', false,
        'errorDetails', jsonb_build_object(
          'code', 'IMAGE_TASK_MAX_ATTEMPTS_EXCEEDED',
          'category', 'worker_timeout',
          'retryable', false
        ),
        'refunded', v_refunded,
        'refundFailed', v_refund_failed,
        'refundResult', v_refund_result
      )
    WHERE id = v_task.id;
    RETURN jsonb_build_object('claimed', false, 'reason', 'max_attempts');
  END IF;

  IF v_task.status = 'queued' THEN
    SELECT COUNT(*)::INTEGER INTO v_active_count
    FROM public.image_generation_tasks
    WHERE user_id = v_task.user_id
      AND id <> v_task.id
      AND status = 'running'
      AND locked_until > v_now;
    IF v_active_count >= v_concurrency THEN
      RETURN jsonb_build_object('claimed', false, 'reason', 'capacity');
    END IF;
  END IF;

  UPDATE public.image_generation_tasks
  SET
    status = 'running',
    started_at = v_now,
    first_started_at = COALESCE(first_started_at, v_now),
    last_attempt_at = v_now,
    queue_wait_ms = GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (v_now - created_at)) * 1000))::INTEGER,
    locked_until = v_now + make_interval(secs => v_lease_seconds),
    lease_token = gen_random_uuid(),
    attempt_count = COALESCE(attempt_count, 0) + 1,
    updated_at = v_now
  WHERE id = v_task.id
  RETURNING * INTO v_task;

  RETURN jsonb_build_object('claimed', true, 'task', to_jsonb(v_task));
END;
$claim_image_generation_task$;

REVOKE EXECUTE ON FUNCTION public.claim_image_generation_task(UUID, TEXT, UUID, INTEGER, INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_image_generation_task(UUID, TEXT, UUID, INTEGER, INTEGER, INTEGER)
  TO service_role;

NOTIFY pgrst, 'reload schema';
