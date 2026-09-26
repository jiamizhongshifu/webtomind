-- Payment orders drive fulfillment: product_type, product_id, amount and
-- metadata (billingCycle, apiCreditCents) decide what a paid order grants.
-- server/migrations/023 let users INSERT and UPDATE their own rows through the
-- Data API, so a user could create a cheap checkout and then rewrite the order
-- (e.g. raise metadata.apiCreditCents or switch product_id) before paying.
-- Checkout now writes orders with the service role; users keep read access.
--
-- Deploy the Worker (service-role checkout writes) before applying this.

DROP POLICY IF EXISTS "payment_orders_insert_own" ON public.payment_orders;
DROP POLICY IF EXISTS "payment_orders_update_own" ON public.payment_orders;
DROP POLICY IF EXISTS "Users insert own orders" ON public.payment_orders;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.payment_orders
  FROM PUBLIC, anon, authenticated;

-- Public buckets accepted uploads from any signed-in user at any path
-- (studio-assets also allows SVG). All uploads go through server endpoints
-- using the service role, so direct client uploads are not needed.
DROP POLICY IF EXISTS "Authenticated users can upload generated images"
  ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload studio assets"
  ON storage.objects;

NOTIFY pgrst, 'reload schema';
