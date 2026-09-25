-- A successful order is activated by its first subsequent image generation.
-- Keep one durable activation row per order and enforce that invariant in DB.

BEGIN;

SET search_path = public;

DELETE FROM public.conversion_events
WHERE event_name = 'post_purchase_generation_success'
  AND order_id IS NULL;

WITH ranked_activations AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY order_id
      ORDER BY occurred_at ASC, created_at ASC, id ASC
    ) AS activation_rank
  FROM public.conversion_events
  WHERE event_name = 'post_purchase_generation_success'
    AND order_id IS NOT NULL
)
DELETE FROM public.conversion_events activation
USING ranked_activations ranked
WHERE activation.id = ranked.id
  AND ranked.activation_rank > 1;

UPDATE public.conversion_events
SET idempotency_key =
  'post_purchase_generation_success:' || order_id::text
WHERE event_name = 'post_purchase_generation_success'
  AND order_id IS NOT NULL;

ALTER TABLE public.conversion_events
  DROP CONSTRAINT IF EXISTS conversion_events_post_purchase_order_required;

ALTER TABLE public.conversion_events
  ADD CONSTRAINT conversion_events_post_purchase_order_required
  CHECK (
    event_name <> 'post_purchase_generation_success'
    OR order_id IS NOT NULL
  );

CREATE UNIQUE INDEX IF NOT EXISTS
  idx_conversion_events_post_purchase_activation_order
  ON public.conversion_events (order_id)
  WHERE event_name = 'post_purchase_generation_success';

COMMIT;
