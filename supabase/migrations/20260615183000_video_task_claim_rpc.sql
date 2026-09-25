-- Atomic service-role-only claim/lease for video queue workers.

SET search_path = public;

CREATE OR REPLACE FUNCTION public.claim_video_generation_task(
  p_task_id UUID,
  p_expected_phase TEXT,
  p_expected_status TEXT,
  p_lease_seconds INTEGER DEFAULT 120
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $claim_video_generation_task$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_lease_seconds INTEGER := LEAST(GREATEST(COALESCE(p_lease_seconds, 120), 10), 600);
  v_locked_until TIMESTAMPTZ;
  v_task public.video_generation_tasks%ROWTYPE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'claim_video_generation_task requires service_role'
      USING ERRCODE = '42501';
  END IF;

  IF p_expected_phase NOT IN ('create', 'poll') THEN
    RETURN jsonb_build_object(
      'claimed', false,
      'reason', 'invalid_phase'
    );
  END IF;

  IF p_expected_status NOT IN ('queued', 'running') THEN
    RETURN jsonb_build_object(
      'claimed', false,
      'reason', 'invalid_expected_status'
    );
  END IF;

  v_locked_until := v_now + make_interval(secs => v_lease_seconds);

  UPDATE public.video_generation_tasks
  SET
    status = CASE
      WHEN p_expected_phase = 'create' AND status = 'queued' THEN 'running'
      ELSE status
    END,
    locked_until = v_locked_until,
    first_started_at = CASE
      WHEN first_started_at IS NULL AND p_expected_phase = 'create' THEN v_now
      ELSE first_started_at
    END,
    started_at = CASE
      WHEN started_at IS NULL THEN v_now
      ELSE started_at
    END,
    last_attempt_at = v_now,
    queue_message_count = COALESCE(queue_message_count, 0) + 1,
    updated_at = v_now
  WHERE id = p_task_id
    AND status = p_expected_status
    AND status IN ('queued', 'running')
    AND (locked_until IS NULL OR locked_until <= v_now)
    AND (
      (p_expected_phase = 'create' AND provider_task_id IS NULL)
      OR
      (p_expected_phase = 'poll' AND provider_task_id IS NOT NULL)
    )
  RETURNING *
  INTO v_task;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'claimed', true,
      'taskId', v_task.id,
      'status', v_task.status,
      'phase', p_expected_phase,
      'providerTaskId', v_task.provider_task_id,
      'lockedUntil', v_task.locked_until,
      'queueMessageCount', v_task.queue_message_count
    );
  END IF;

  SELECT *
  INTO v_task
  FROM public.video_generation_tasks
  WHERE id = p_task_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'claimed', false,
      'reason', 'not_found',
      'taskId', p_task_id
    );
  END IF;

  RETURN jsonb_build_object(
    'claimed', false,
    'reason', CASE
      WHEN v_task.status IS DISTINCT FROM p_expected_status THEN 'status_mismatch'
      WHEN v_task.status NOT IN ('queued', 'running') THEN 'terminal_status'
      WHEN v_task.locked_until IS NOT NULL AND v_task.locked_until > v_now THEN 'locked'
      WHEN p_expected_phase = 'create' AND v_task.provider_task_id IS NOT NULL THEN 'phase_mismatch'
      WHEN p_expected_phase = 'poll' AND v_task.provider_task_id IS NULL THEN 'phase_mismatch'
      ELSE 'not_claimable'
    END,
    'taskId', v_task.id,
    'status', v_task.status,
    'providerTaskId', v_task.provider_task_id,
    'lockedUntil', v_task.locked_until
  );
END;
$claim_video_generation_task$;

REVOKE EXECUTE ON FUNCTION public.claim_video_generation_task(UUID, TEXT, TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_video_generation_task(UUID, TEXT, TEXT, INTEGER)
  TO service_role;

NOTIFY pgrst, 'reload schema';
