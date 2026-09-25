-- API recharge catalog: make USD the canonical customer-facing unit.
--
-- price_cents remains the provider settlement amount in CNY fen for the
-- current configured rate. The immutable USD amount is stored in metadata so
-- the API can recalculate the CNY amount when the settlement rate changes.

SET search_path = public;

UPDATE public.api_credit_packages
SET
  name = '$10 充值',
  price_cents = 7200,
  credit_cents = 1000,
  sort_order = 10,
  metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
    'price_currency', 'CNY',
    'credit_currency', 'USD',
    'kind', 'api_balance',
    'api_credit_usd_cents', 1000
  ),
  updated_at = now()
WHERE id = 'api_cny_10';

INSERT INTO public.api_credit_packages (
  id, name, price_cents, credit_cents, sort_order, metadata
)
VALUES (
  'api_usd_20', '$20 充值', 14400, 2000, 20,
  '{"price_currency":"CNY","credit_currency":"USD","kind":"api_balance","api_credit_usd_cents":2000}'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  price_cents = EXCLUDED.price_cents,
  credit_cents = EXCLUDED.credit_cents,
  sort_order = EXCLUDED.sort_order,
  metadata = EXCLUDED.metadata,
  is_active = true,
  updated_at = now();

UPDATE public.api_credit_packages
SET
  name = '$50 充值',
  price_cents = 36000,
  credit_cents = 5000,
  sort_order = 30,
  metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
    'price_currency', 'CNY',
    'credit_currency', 'USD',
    'kind', 'api_balance',
    'api_credit_usd_cents', 5000
  ),
  updated_at = now()
WHERE id = 'api_cny_50';

UPDATE public.api_credit_packages
SET
  name = '$100 充值',
  price_cents = 72000,
  credit_cents = 10000,
  sort_order = 40,
  metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
    'price_currency', 'CNY',
    'credit_currency', 'USD',
    'kind', 'api_balance',
    'api_credit_usd_cents', 10000
  ),
  updated_at = now()
WHERE id = 'api_cny_100';
