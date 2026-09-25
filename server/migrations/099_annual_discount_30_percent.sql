-- Server migration 099; mirrors Supabase migration
-- 20260812100000_annual_discount_30_percent.
-- Annual commitment discount standardized at 30% off twelve monthly payments:
--   Pro: $20/mo  -> $240/yr list  -> $168/yr
--   Max: $100/mo -> $1200/yr list -> $840/yr

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
