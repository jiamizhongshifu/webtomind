-- Provider health scoring for image generation routing.
-- This is intentionally read-only and service-role only. The app can use it
-- to demote or temporarily circuit-break noisy provider/model/channel routes.

CREATE INDEX IF NOT EXISTS image_generation_attempts_provider_health_idx
  ON public.image_generation_attempts(
    provider,
    model,
    (COALESCE(channel, '')),
    started_at DESC
  );

CREATE OR REPLACE FUNCTION public.get_image_provider_health(
  p_window INTERVAL DEFAULT INTERVAL '1 hour',
  p_min_attempts INTEGER DEFAULT 3,
  p_now TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TABLE (
  provider TEXT,
  model TEXT,
  channel TEXT,
  total_attempts BIGINT,
  succeeded_attempts BIGINT,
  failed_attempts BIGINT,
  running_attempts BIGINT,
  success_rate NUMERIC,
  avg_duration_ms NUMERIC,
  p95_duration_ms INTEGER,
  auth_error_count BIGINT,
  rate_limit_count BIGINT,
  timeout_count BIGINT,
  unavailable_count BIGINT,
  policy_count BIGINT,
  last_failure_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  health_score NUMERIC,
  health_state TEXT,
  circuit_breaker_until TIMESTAMPTZ
)
LANGUAGE SQL
STABLE
SET search_path = public
AS $$
  WITH scoped AS (
    SELECT
      iga.provider,
      iga.model,
      COALESCE(iga.channel, '') AS channel,
      iga.status,
      iga.started_at,
      iga.duration_ms,
      iga.error_category,
      iga.error_code,
      iga.error_message,
      CASE
        WHEN (iga.metadata->>'httpStatus') ~ '^[0-9]+$'
          THEN (iga.metadata->>'httpStatus')::INTEGER
        ELSE NULL
      END AS http_status
    FROM public.image_generation_attempts iga
    WHERE iga.started_at >= p_now - p_window
      AND iga.started_at <= p_now
  ),
  grouped AS (
    SELECT
      scoped.provider,
      scoped.model,
      scoped.channel,
      COUNT(*) AS total_attempts,
      COUNT(*) FILTER (WHERE scoped.status = 'succeeded') AS succeeded_attempts,
      COUNT(*) FILTER (WHERE scoped.status = 'failed') AS failed_attempts,
      COUNT(*) FILTER (WHERE scoped.status = 'running') AS running_attempts,
      COALESCE(
        COUNT(*) FILTER (WHERE scoped.status = 'succeeded')::NUMERIC
          / NULLIF(COUNT(*) FILTER (WHERE scoped.status IN ('succeeded', 'failed')), 0),
        0
      ) AS success_rate,
      AVG(scoped.duration_ms) FILTER (WHERE scoped.duration_ms IS NOT NULL) AS avg_duration_ms,
      PERCENTILE_DISC(0.95) WITHIN GROUP (ORDER BY scoped.duration_ms)
        FILTER (WHERE scoped.duration_ms IS NOT NULL) AS p95_duration_ms,
      COUNT(*) FILTER (
        WHERE scoped.status = 'failed'
          AND (
            scoped.http_status IN (401, 403)
            OR scoped.error_code IN ('PROVIDER_AUTH', 'AUTH_ERROR')
          )
      ) AS auth_error_count,
      COUNT(*) FILTER (
        WHERE scoped.status = 'failed'
          AND (
            scoped.http_status = 429
            OR scoped.error_category = 'provider_rate_limit'
          )
      ) AS rate_limit_count,
      COUNT(*) FILTER (
        WHERE scoped.status = 'failed'
          AND scoped.error_category = 'provider_timeout'
      ) AS timeout_count,
      COUNT(*) FILTER (
        WHERE scoped.status = 'failed'
          AND scoped.error_category = 'provider_unavailable'
      ) AS unavailable_count,
      COUNT(*) FILTER (
        WHERE scoped.status = 'failed'
          AND scoped.error_category = 'provider_policy'
      ) AS policy_count,
      MAX(scoped.started_at) FILTER (WHERE scoped.status = 'failed') AS last_failure_at,
      MAX(scoped.started_at) FILTER (WHERE scoped.status = 'succeeded') AS last_success_at,
      MAX(scoped.started_at) FILTER (
        WHERE scoped.status = 'failed'
          AND (
            scoped.http_status IN (401, 403)
            OR scoped.error_code IN ('PROVIDER_AUTH', 'AUTH_ERROR')
          )
      ) AS last_auth_error_at
    FROM scoped
    GROUP BY scoped.provider, scoped.model, scoped.channel
  ),
  scored AS (
    SELECT
      grouped.*,
      CASE
        WHEN grouped.auth_error_count >= 2
          AND grouped.last_auth_error_at >= p_now - INTERVAL '30 minutes'
          THEN grouped.last_auth_error_at + INTERVAL '30 minutes'
        ELSE NULL
      END AS circuit_breaker_until,
      GREATEST(
        0,
        LEAST(
          100,
          ROUND(
            (grouped.success_rate * 100)
            - CASE WHEN grouped.auth_error_count > 0 THEN 45 ELSE 0 END
            - LEAST(35, grouped.rate_limit_count * 10)
            - LEAST(30, grouped.timeout_count * 12)
            - LEAST(30, grouped.unavailable_count * 10)
            - CASE
                WHEN grouped.p95_duration_ms IS NOT NULL
                  AND grouped.p95_duration_ms > 180000
                  THEN 15
                ELSE 0
              END,
            2
          )
        )
      ) AS health_score
    FROM grouped
  )
  SELECT
    scored.provider,
    scored.model,
    NULLIF(scored.channel, '') AS channel,
    scored.total_attempts,
    scored.succeeded_attempts,
    scored.failed_attempts,
    scored.running_attempts,
    ROUND(scored.success_rate, 4) AS success_rate,
    ROUND(scored.avg_duration_ms, 2) AS avg_duration_ms,
    scored.p95_duration_ms,
    scored.auth_error_count,
    scored.rate_limit_count,
    scored.timeout_count,
    scored.unavailable_count,
    scored.policy_count,
    scored.last_failure_at,
    scored.last_success_at,
    scored.health_score,
    CASE
      WHEN scored.total_attempts < GREATEST(1, p_min_attempts) THEN 'insufficient_data'
      WHEN scored.circuit_breaker_until IS NOT NULL THEN 'circuit_open'
      WHEN scored.rate_limit_count >= 3 THEN 'degraded'
      WHEN scored.timeout_count >= 2
        AND scored.timeout_count::NUMERIC / NULLIF(scored.total_attempts, 0) >= 0.30
        THEN 'degraded'
      WHEN scored.unavailable_count >= 3 THEN 'degraded'
      WHEN scored.health_score < 60 THEN 'degraded'
      ELSE 'healthy'
    END AS health_state,
    scored.circuit_breaker_until
  FROM scored
  ORDER BY
    CASE
      WHEN scored.circuit_breaker_until IS NOT NULL THEN 3
      WHEN scored.health_score < 60 THEN 2
      ELSE 1
    END DESC,
    scored.health_score ASC,
    scored.total_attempts DESC;
$$;

REVOKE ALL ON FUNCTION public.get_image_provider_health(INTERVAL, INTEGER, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_image_provider_health(INTERVAL, INTEGER, TIMESTAMPTZ)
  TO service_role;
