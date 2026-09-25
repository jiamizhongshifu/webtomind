-- Keep automated smoke and UI-audit traffic out of business conversion metrics.
-- The client marks new test runs in metadata. The CTA-source exclusions retain
-- compatibility with historical release-smoke events written before that marker.

SET search_path = public;

CREATE OR REPLACE VIEW public.conversion_funnel_daily AS
WITH business_events AS (
  SELECT *
  FROM public.conversion_events
  WHERE COALESCE(metadata->>'traffic_type', '') <> 'internal_test'
    AND COALESCE(cta_source, '') NOT IN ('internal_test', 'codex_release_smoke')
),
first_purchase_events AS (
  SELECT DISTINCT ON (order_id)
    id,
    event_name,
    user_id,
    order_id,
    cta_source,
    occurred_at
  FROM business_events
  WHERE event_name = 'purchase_webhook_succeeded'
    AND order_id IS NOT NULL
  ORDER BY order_id, occurred_at, id
),
first_activation_events AS (
  SELECT DISTINCT ON (activation.order_id)
    activation.id,
    activation.event_name,
    activation.user_id,
    activation.order_id,
    COALESCE(activation.cta_source, purchase.cta_source) AS cta_source,
    activation.occurred_at
  FROM business_events activation
  INNER JOIN first_purchase_events purchase
    ON purchase.order_id = activation.order_id
   AND activation.occurred_at >= purchase.occurred_at
  WHERE activation.event_name = 'post_purchase_generation_success'
  ORDER BY activation.order_id, activation.occurred_at, activation.id
),
normalized_events AS (
  SELECT
    id,
    event_name,
    user_id,
    order_id,
    cta_source,
    occurred_at
  FROM business_events
  WHERE event_name NOT IN (
    'purchase_webhook_succeeded',
    'post_purchase_generation_success'
  )

  UNION ALL

  SELECT * FROM first_purchase_events

  UNION ALL

  SELECT * FROM first_activation_events
)
SELECT
  date_trunc('day', occurred_at)::date AS event_date,
  COALESCE(cta_source, 'unknown') AS cta_source,
  COUNT(*) FILTER (WHERE event_name = 'pricing_view') AS pricing_views,
  COUNT(*) FILTER (WHERE event_name = 'checkout_start') AS checkout_starts,
  COUNT(DISTINCT order_id) FILTER (
    WHERE event_name = 'purchase_webhook_succeeded'
  ) AS purchases,
  COUNT(*) FILTER (
    WHERE event_name = 'purchase_webhook_failed'
  ) AS purchase_webhook_failures,
  COUNT(*) FILTER (
    WHERE event_name = 'post_purchase_return'
  ) AS post_purchase_returns,
  COUNT(DISTINCT order_id) FILTER (
    WHERE event_name = 'post_purchase_generation_success'
  ) AS post_purchase_generations,
  COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL) AS known_users
FROM normalized_events
GROUP BY 1, 2;

ALTER VIEW public.conversion_funnel_daily
  SET (security_invoker = true);

REVOKE ALL ON public.conversion_funnel_daily
  FROM anon, authenticated, PUBLIC;
GRANT SELECT ON public.conversion_funnel_daily TO service_role;
