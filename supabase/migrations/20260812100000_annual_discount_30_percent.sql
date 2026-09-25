-- Standardize the annual commitment discount at 30% off twelve monthly
-- payments. Prices are stored in USD cents.
--   Pro: $20/mo  -> $240/yr list  -> $168/yr (30% off)
--   Max: $100/mo -> $1200/yr list -> $840/yr (30% off)
-- Clearing the annual Stripe price id is deliberate: checkout will create
-- recurring price_data from these database amounts and therefore cannot
-- accidentally charge a stale static Stripe Price created for the old amount.

UPDATE public.subscription_plans
SET
  price_yearly = CASE
    WHEN name = 'pro' THEN 16800
    WHEN name = 'max' THEN 84000
    ELSE price_yearly
  END,
  stripe_price_yearly = NULL,
  updated_at = NOW()
WHERE name IN ('pro', 'max');

NOTIFY pgrst, 'reload schema';
