-- The Stripe webhook locks an order by moving it through a short-lived
-- processing state before marking it succeeded or failed. The production
-- constraint did not allow that value, so checkout.session.completed could be
-- received but fail before fulfillment.

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
        'refunded'::text
      ]
    )
  );
