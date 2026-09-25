-- api_marketplace per-user gateway rate limiting for the public /v1 relay.
-- A single counter row per user keeps this O(1) and transactional.
-- Fail-open is implemented at the caller; the RPC itself never throws.

SET search_path = public;

CREATE TABLE IF NOT EXISTS public.api_gateway_rate_limits (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  minute_window TIMESTAMPTZ NOT NULL DEFAULT now(),
  minute_count INTEGER NOT NULL DEFAULT 0 CHECK (minute_count >= 0),
  day_window DATE NOT NULL DEFAULT CURRENT_DATE,
  day_count INTEGER NOT NULL DEFAULT 0 CHECK (day_count >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.api_gateway_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.api_gateway_rate_limits FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.api_gateway_rate_limits TO service_role;

CREATE OR REPLACE FUNCTION public.check_api_gateway_rate_limit(
  p_user_id UUID,
  p_per_minute INTEGER,
  p_per_day INTEGER
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $check_api_gateway_rate_limit$
DECLARE
  v_row public.api_gateway_rate_limits%ROWTYPE;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'limited', false);
  END IF;

  INSERT INTO public.api_gateway_rate_limits (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO v_row
  FROM public.api_gateway_rate_limits
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF v_row.minute_window < now() - interval '60 seconds' THEN
    UPDATE public.api_gateway_rate_limits
    SET minute_window = now(), minute_count = 1, updated_at = now()
    WHERE user_id = p_user_id;
    v_row.minute_window := now();
    v_row.minute_count := 1;
  ELSE
    UPDATE public.api_gateway_rate_limits
    SET minute_count = minute_count + 1, updated_at = now()
    WHERE user_id = p_user_id;
    v_row.minute_count := v_row.minute_count + 1;
  END IF;

  IF v_row.day_window < CURRENT_DATE THEN
    UPDATE public.api_gateway_rate_limits
    SET day_window = CURRENT_DATE, day_count = 1, updated_at = now()
    WHERE user_id = p_user_id;
  ELSE
    UPDATE public.api_gateway_rate_limits
    SET day_count = day_count + 1, updated_at = now()
    WHERE user_id = p_user_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'limited',
      v_row.minute_count > p_per_minute OR v_row.day_count > p_per_day,
    'minute_count', v_row.minute_count,
    'day_count',
      CASE WHEN v_row.day_window < CURRENT_DATE THEN 1 ELSE v_row.day_count END
  );
END;
$check_api_gateway_rate_limit$;

REVOKE ALL ON FUNCTION public.check_api_gateway_rate_limit(UUID, INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_api_gateway_rate_limit(UUID, INTEGER, INTEGER)
  TO service_role;
