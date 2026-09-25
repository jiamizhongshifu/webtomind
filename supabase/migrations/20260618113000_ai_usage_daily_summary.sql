-- Read-only daily AI usage summary for admin reporting.
-- The API reads this through the service role after admin authentication.

SET search_path = public;

CREATE OR REPLACE VIEW public.ai_usage_daily_summary AS
WITH normalized_usage AS (
  SELECT
    COALESCE(apu.completed_at, apu.started_at, apu.created_at)::date AS usage_date,
    apu.provider,
    COALESCE(NULLIF(apu.model, ''), 'unknown') AS model,
    COALESCE(NULLIF(apu.source, ''), 'unknown') AS source,
    apu.status,
    COALESCE(apu.input_tokens, 0)::bigint AS input_tokens,
    COALESCE(apu.output_tokens, 0)::bigint AS output_tokens,
    COALESCE(apu.total_tokens, 0)::bigint AS total_tokens,
    CASE
      WHEN apu.status = 'succeeded' THEN GREATEST(COALESCE(apu.image_count, 0), 0)::bigint
      ELSE 0::bigint
    END AS image_count,
    apu.latency_ms
  FROM public.ai_provider_usage apu
  WHERE apu.status IN ('succeeded', 'failed')

  UNION ALL

  SELECT
    COALESCE(iga.finished_at, iga.started_at, iga.created_at)::date AS usage_date,
    iga.provider,
    COALESCE(NULLIF(iga.model, ''), 'unknown') AS model,
    COALESCE(
      NULLIF(iga.metadata->>'source', ''),
      NULLIF(iga.metadata->>'sourceApp', ''),
      NULLIF(igt.request_payload->>'sourceApp', ''),
      NULLIF(igt.request_payload->>'appSlug', ''),
      CASE
        WHEN NULLIF(iga.request_mode, '') IS NOT NULL THEN 'image:' || iga.request_mode
        ELSE 'image_generation'
      END
    ) AS source,
    iga.status,
    0::bigint AS input_tokens,
    0::bigint AS output_tokens,
    0::bigint AS total_tokens,
    CASE
      WHEN iga.status = 'succeeded' THEN
        CASE
          WHEN (iga.metadata->>'effectiveImageCount') ~ '^[0-9]+$'
            THEN GREATEST((iga.metadata->>'effectiveImageCount')::integer, 0)::bigint
          ELSE 1::bigint
        END
      ELSE 0::bigint
    END AS image_count,
    COALESCE(
      iga.duration_ms,
      CASE
        WHEN iga.finished_at IS NOT NULL
          THEN GREATEST(
            0,
            ROUND(EXTRACT(EPOCH FROM (iga.finished_at - iga.started_at)) * 1000)::integer
          )
        ELSE NULL
      END
    ) AS latency_ms
  FROM public.image_generation_attempts iga
  LEFT JOIN public.image_generation_tasks igt
    ON igt.id = iga.task_id
  WHERE iga.status IN ('succeeded', 'failed')
)
SELECT
  usage_date,
  provider,
  model,
  source,
  COUNT(*)::bigint AS event_count,
  COUNT(*) FILTER (WHERE status = 'succeeded')::bigint AS succeeded_count,
  COUNT(*) FILTER (WHERE status = 'failed')::bigint AS failed_count,
  SUM(input_tokens)::bigint AS input_tokens,
  SUM(output_tokens)::bigint AS output_tokens,
  SUM(total_tokens)::bigint AS total_tokens,
  SUM(image_count)::bigint AS image_count,
  ROUND(AVG(latency_ms))::bigint AS avg_latency_ms,
  (
    percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms)
    FILTER (WHERE latency_ms IS NOT NULL)
  )::bigint AS p95_latency_ms
FROM normalized_usage
GROUP BY usage_date, provider, model, source;

ALTER VIEW public.ai_usage_daily_summary
  SET (security_invoker = true);

REVOKE ALL ON public.ai_usage_daily_summary
  FROM anon, authenticated, PUBLIC;

GRANT SELECT ON public.ai_provider_usage TO service_role;
GRANT SELECT ON public.image_generation_attempts TO service_role;
GRANT SELECT ON public.image_generation_tasks TO service_role;
GRANT SELECT ON public.ai_usage_daily_summary TO service_role;
