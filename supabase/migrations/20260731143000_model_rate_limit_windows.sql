BEGIN;

CREATE TABLE IF NOT EXISTS public.model_rate_limit_windows (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bucket TEXT NOT NULL CHECK (char_length(bucket) BETWEEN 1 AND 80),
  window_started_at TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, bucket, window_started_at)
);

ALTER TABLE public.model_rate_limit_windows ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.model_rate_limit_windows FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.model_rate_limit_windows TO service_role;

CREATE OR REPLACE FUNCTION public.consume_model_rate_limit(
  p_user_id UUID,
  p_bucket TEXT,
  p_window_seconds INTEGER,
  p_max_requests INTEGER,
  p_now TIMESTAMPTZ DEFAULT NOW()
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $consume_model_rate_limit$
DECLARE
  v_window_start TIMESTAMPTZ;
  v_count INTEGER;
  v_retry_after INTEGER;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role required' USING ERRCODE = '42501';
  END IF;
  IF p_user_id IS NULL OR NULLIF(BTRIM(p_bucket), '') IS NULL THEN
    RAISE EXCEPTION 'user and bucket are required' USING ERRCODE = '22023';
  END IF;
  IF p_window_seconds < 1 OR p_window_seconds > 86400
     OR p_max_requests < 1 OR p_max_requests > 10000 THEN
    RAISE EXCEPTION 'invalid rate limit bounds' USING ERRCODE = '22023';
  END IF;

  v_window_start := TO_TIMESTAMP(
    FLOOR(EXTRACT(EPOCH FROM p_now) / p_window_seconds) * p_window_seconds
  );

  INSERT INTO public.model_rate_limit_windows (
    user_id, bucket, window_started_at, request_count, updated_at
  ) VALUES (
    p_user_id, BTRIM(p_bucket), v_window_start, 1, p_now
  )
  ON CONFLICT (user_id, bucket, window_started_at)
  DO UPDATE SET
    request_count = model_rate_limit_windows.request_count + 1,
    updated_at = EXCLUDED.updated_at
  WHERE model_rate_limit_windows.request_count < p_max_requests
  RETURNING request_count INTO v_count;

  v_retry_after := GREATEST(
    1,
    CEIL(EXTRACT(EPOCH FROM (v_window_start + make_interval(secs => p_window_seconds) - p_now)))::INTEGER
  );

  IF v_count IS NULL THEN
    SELECT request_count INTO v_count
    FROM public.model_rate_limit_windows
    WHERE user_id = p_user_id
      AND bucket = BTRIM(p_bucket)
      AND window_started_at = v_window_start;
    RETURN jsonb_build_object(
      'allowed', false,
      'count', COALESCE(v_count, p_max_requests),
      'limit', p_max_requests,
      'retry_after', v_retry_after
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'count', v_count,
    'limit', p_max_requests,
    'remaining', GREATEST(0, p_max_requests - v_count),
    'retry_after', v_retry_after
  );
END;
$consume_model_rate_limit$;

REVOKE ALL ON FUNCTION public.consume_model_rate_limit(UUID, TEXT, INTEGER, INTEGER, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_model_rate_limit(UUID, TEXT, INTEGER, INTEGER, TIMESTAMPTZ)
  TO service_role;

COMMENT ON FUNCTION public.consume_model_rate_limit(UUID, TEXT, INTEGER, INTEGER, TIMESTAMPTZ)
  IS 'Atomically consumes a per-user model request slot. Fails closed outside service_role.';

COMMIT;
