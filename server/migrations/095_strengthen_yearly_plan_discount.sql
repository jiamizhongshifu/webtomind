-- Server migration 095; mirrors Supabase migration 20260720090000_strengthen_yearly_plan_discount.
-- Pro keeps the 40% annual discount; Max annual is the business-guardrail
-- minimum plus a buffer ($800) that keeps the flagship plan above the 40%
-- gross-margin floor.

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
