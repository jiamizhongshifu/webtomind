-- Stripe checkout expiration is the durable abandonment state. Keep expired
-- orders in the high-intent recovery segment after pending orders are closed.

SET search_path = public;

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
abandoned_orders AS (
  SELECT DISTINCT ON (user_id)
    user_id,
    id AS order_id,
    status AS checkout_status,
    product_type,
    product_id,
    created_at AS checkout_started_at,
    metadata
  FROM public.payment_orders
  WHERE status IN ('pending', 'processing', 'expired')
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
  ao.user_id,
  'checkout_started_no_purchase' AS segment_key,
  ao.checkout_started_at AS last_signal_at,
  jsonb_build_object(
    'order_id', ao.order_id,
    'checkout_status', ao.checkout_status,
    'product_type', ao.product_type,
    'product_id', ao.product_id,
    'checkout_attribution', ao.metadata->'checkout_attribution'
  ) AS metadata
FROM abandoned_orders ao
LEFT JOIN successful_orders so
  ON so.user_id = ao.user_id
 AND so.last_purchase_at >= ao.checkout_started_at
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

ALTER VIEW public.conversion_reengagement_segments
  SET (security_invoker = true);

REVOKE ALL ON public.conversion_reengagement_segments
  FROM anon, authenticated, PUBLIC;
GRANT SELECT ON public.conversion_reengagement_segments TO service_role;
