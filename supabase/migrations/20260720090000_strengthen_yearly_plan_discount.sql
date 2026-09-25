-- Make annual subscriptions the strongest-value commitment option.
-- Prices are stored in USD cents. Pro keeps the 40% annual discount
-- ($240 -> $144); Max annual is $800, the business-guardrail minimum plus a
-- buffer that keeps the flagship plan above the 40% gross-margin floor given
-- the 60,000 monthly credits (about 33% off twelve monthly payments).
-- Clearing the annual Stripe price id is deliberate: checkout will create
-- recurring price_data from these database amounts and therefore cannot
-- accidentally charge a stale static Stripe Price created for the old amount.

UPDATE public.subscription_plans
SET
  price_yearly = CASE
    WHEN name = 'pro' THEN 14400
    WHEN name = 'max' THEN 80000
    ELSE price_yearly
  END,
  stripe_price_yearly = NULL,
  updated_at = NOW()
WHERE name IN ('pro', 'max');

NOTIFY pgrst, 'reload schema';
