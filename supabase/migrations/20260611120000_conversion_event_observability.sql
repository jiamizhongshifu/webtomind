-- Durable conversion observability for checkout, purchase, activation, and re-engagement.

SET search_path = public;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.conversion_events (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  event_name TEXT NOT NULL,
  event_source TEXT NOT NULL DEFAULT 'web',
  user_id UUID,
  anonymous_id TEXT,
  session_id TEXT,
  entity_type TEXT,
  entity_id TEXT,
  order_id UUID,
  product_type TEXT,
  product_id TEXT,
  cta_source TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key TEXT,
  occurred_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT conversion_events_name_not_blank
    CHECK (length(trim(event_name)) > 0),
  CONSTRAINT conversion_events_source_not_blank
    CHECK (length(trim(event_source)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversion_events_idempotency_key
  ON public.conversion_events (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_conversion_events_name_occurred
  ON public.conversion_events (event_name, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversion_events_user_occurred
  ON public.conversion_events (user_id, occurred_at DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_conversion_events_order
  ON public.conversion_events (order_id, occurred_at DESC)
  WHERE order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_conversion_events_cta_source
  ON public.conversion_events (cta_source, occurred_at DESC)
  WHERE cta_source IS NOT NULL;

ALTER TABLE public.conversion_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS conversion_events_service_role_all
  ON public.conversion_events;
CREATE POLICY conversion_events_service_role_all
  ON public.conversion_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS conversion_events_authenticated_insert_own
  ON public.conversion_events;
CREATE POLICY conversion_events_authenticated_insert_own
  ON public.conversion_events
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

GRANT ALL ON public.conversion_events TO service_role;
GRANT INSERT ON public.conversion_events TO authenticated;

CREATE OR REPLACE VIEW public.conversion_funnel_daily AS
SELECT
  date_trunc('day', occurred_at)::date AS event_date,
  COALESCE(cta_source, 'unknown') AS cta_source,
  COUNT(*) FILTER (WHERE event_name = 'pricing_view') AS pricing_views,
  COUNT(*) FILTER (WHERE event_name = 'checkout_start') AS checkout_starts,
  COUNT(*) FILTER (WHERE event_name = 'purchase_webhook_succeeded') AS purchases,
  COUNT(*) FILTER (WHERE event_name = 'purchase_webhook_failed') AS purchase_webhook_failures,
  COUNT(*) FILTER (WHERE event_name = 'post_purchase_return') AS post_purchase_returns,
  COUNT(*) FILTER (WHERE event_name = 'post_purchase_generation_success') AS post_purchase_generations,
  COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL) AS known_users
FROM public.conversion_events
GROUP BY 1, 2;

CREATE OR REPLACE VIEW public.conversion_reengagement_segments AS
WITH successful_orders AS (
  SELECT
    user_id,
    MAX(updated_at) AS last_purchase_at,
    COUNT(*) AS purchase_count
  FROM public.payment_orders
  WHERE status = 'succeeded'
  GROUP BY user_id
),
pending_orders AS (
  SELECT DISTINCT ON (user_id)
    user_id,
    id AS order_id,
    product_type,
    product_id,
    created_at AS checkout_started_at,
    metadata
  FROM public.payment_orders
  WHERE status IN ('pending', 'failed')
    AND created_at < NOW() - INTERVAL '30 minutes'
    AND created_at >= NOW() - INTERVAL '30 days'
  ORDER BY user_id, created_at DESC
),
last_generations AS (
  SELECT
    user_id,
    MAX(created_at) AS last_generation_at,
    COUNT(*) AS generation_count
  FROM public.image_generations
  WHERE created_at >= NOW() - INTERVAL '60 days'
  GROUP BY user_id
),
post_purchase_activations AS (
  SELECT
    user_id,
    MAX(occurred_at) AS last_post_purchase_generation_at
  FROM public.conversion_events
  WHERE event_name = 'post_purchase_generation_success'
  GROUP BY user_id
)
SELECT
  po.user_id,
  'checkout_started_no_purchase' AS segment_key,
  po.checkout_started_at AS last_signal_at,
  jsonb_build_object(
    'order_id', po.order_id,
    'product_type', po.product_type,
    'product_id', po.product_id,
    'checkout_attribution', po.metadata->'checkout_attribution'
  ) AS metadata
FROM pending_orders po
LEFT JOIN successful_orders so
  ON so.user_id = po.user_id
 AND so.last_purchase_at >= po.checkout_started_at
WHERE so.user_id IS NULL

UNION ALL

SELECT
  lg.user_id,
  'generated_no_purchase' AS segment_key,
  lg.last_generation_at AS last_signal_at,
  jsonb_build_object(
    'generation_count_60d', lg.generation_count
  ) AS metadata
FROM last_generations lg
LEFT JOIN successful_orders so
  ON so.user_id = lg.user_id
WHERE so.user_id IS NULL

UNION ALL

SELECT
  so.user_id,
  'paid_not_activated' AS segment_key,
  so.last_purchase_at AS last_signal_at,
  jsonb_build_object(
    'purchase_count', so.purchase_count,
    'last_post_purchase_generation_at', ppa.last_post_purchase_generation_at
  ) AS metadata
FROM successful_orders so
LEFT JOIN post_purchase_activations ppa
  ON ppa.user_id = so.user_id
WHERE so.last_purchase_at >= NOW() - INTERVAL '30 days'
  AND (
    ppa.last_post_purchase_generation_at IS NULL
    OR ppa.last_post_purchase_generation_at < so.last_purchase_at
  );

GRANT SELECT ON public.conversion_funnel_daily TO service_role;
GRANT SELECT ON public.conversion_reengagement_segments TO service_role;
