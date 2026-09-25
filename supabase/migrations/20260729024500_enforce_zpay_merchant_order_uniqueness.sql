-- ZPAY callbacks use a provider-scoped merchant order number. Enforce its
-- uniqueness before checkout so a theoretical deterministic-id collision
-- fails closed instead of ever resolving to the wrong payment order.

SET search_path = public;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_orders_zpay_merchant_order
  ON public.payment_orders (provider_order_id)
  WHERE provider = 'zpay'
    AND provider_order_id IS NOT NULL;
