-- Close the Stripe checkout-expiration lifecycle and make purchase activation
-- metrics order-based instead of event-row-based.

SET search_path = public;

ALTER TABLE public.payment_orders
  DROP CONSTRAINT IF EXISTS payment_orders_status_check;

ALTER TABLE public.payment_orders
  ADD CONSTRAINT payment_orders_status_check
  CHECK (
    status = ANY (
      ARRAY[
        'pending'::text,
        'processing'::text,
        'succeeded'::text,
        'failed'::text,
        'expired'::text,
        'refunded'::text
      ]
    )
  );

-- Keep only the earliest purchase and earliest post-purchase activation for
-- each order. Events without an order_id are intentionally excluded from the
-- order conversion metrics because they cannot be reconciled to a purchase.
CREATE OR REPLACE VIEW public.conversion_funnel_daily AS
WITH first_purchase_events AS (
  SELECT DISTINCT ON (order_id)
    id,
    event_name,
    user_id,
    order_id,
    cta_source,
    occurred_at
  FROM public.conversion_events
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
  FROM public.conversion_events activation
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
  FROM public.conversion_events
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
incomplete_orders AS (
  SELECT DISTINCT ON (user_id)
    user_id,
    id AS order_id,
    product_type,
    product_id,
    created_at AS checkout_started_at,
    metadata
  FROM public.payment_orders
  WHERE status IN ('pending', 'processing')
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
  io.user_id,
  'checkout_started_no_purchase' AS segment_key,
  io.checkout_started_at AS last_signal_at,
  jsonb_build_object(
    'order_id', io.order_id,
    'product_type', io.product_type,
    'product_id', io.product_id,
    'checkout_attribution', io.metadata->'checkout_attribution'
  ) AS metadata
FROM incomplete_orders io
LEFT JOIN successful_orders so
  ON so.user_id = io.user_id
 AND so.last_purchase_at >= io.checkout_started_at
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

ALTER VIEW public.conversion_funnel_daily
  SET (security_invoker = true);
ALTER VIEW public.conversion_reengagement_segments
  SET (security_invoker = true);

REVOKE ALL ON public.conversion_funnel_daily
  FROM anon, authenticated, PUBLIC;
REVOKE ALL ON public.conversion_reengagement_segments
  FROM anon, authenticated, PUBLIC;

GRANT SELECT ON public.conversion_funnel_daily TO service_role;
GRANT SELECT ON public.conversion_reengagement_segments TO service_role;
