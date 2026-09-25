SET search_path = public;

CREATE OR REPLACE VIEW public.checkout_recovery_candidates AS
WITH latest_incomplete_order AS (
  SELECT DISTINCT ON (orders.user_id)
    orders.id AS order_id,
    orders.user_id,
    orders.product_type,
    orders.product_id,
    orders.provider,
    orders.created_at AS checkout_started_at,
    orders.metadata
  FROM public.payment_orders orders
  WHERE orders.status IN ('pending', 'processing')
    AND orders.created_at <= NOW() - INTERVAL '30 minutes'
    AND orders.created_at >= NOW() - INTERVAL '7 days'
    AND NOT EXISTS (
      SELECT 1 FROM public.payment_orders paid
      WHERE paid.user_id = orders.user_id
        AND paid.status = 'succeeded'
        AND paid.updated_at >= orders.created_at
    )
  ORDER BY orders.user_id, orders.created_at DESC, orders.id DESC
)
SELECT
  order_id,
  user_id,
  product_type,
  product_id,
  provider,
  checkout_started_at,
  CASE
    WHEN checkout_started_at <= NOW() - INTERVAL '6 hours'
      THEN 'followup_6h'
    ELSE 'initial_30m'
  END AS recovery_stage,
  metadata
FROM latest_incomplete_order;

ALTER VIEW public.checkout_recovery_candidates SET (security_invoker = true);
REVOKE ALL ON public.checkout_recovery_candidates FROM anon, authenticated, PUBLIC;
GRANT SELECT ON public.checkout_recovery_candidates TO service_role;
