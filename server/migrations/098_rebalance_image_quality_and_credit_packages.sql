-- Keep the free daily 100-credit promise useful while protecting premium
-- image quality and making non-expiring top-up packs commercially usable.
--
-- Image pricing v2 is calculated in application code:
--   base=60, 2K=100, 4K=300, medium floor=150, high floor=600.
-- Reference and character-consistency adjustments are added after the larger
-- of the resolution and quality floors, then the model multiplier is applied.

SET search_path = public;

UPDATE public.credit_costs
SET
  cost = 60,
  description = '图片生成（基础=60, 2K=100, 4K=300, 中画质下限=150, 高画质下限=600）',
  pricing_type = 'dynamic',
  base_cost = 60,
  min_cost = 40,
  max_cost = 600,
  updated_at = NOW()
WHERE action = 'image_generation';

UPDATE public.subscription_plans
SET
  monthly_credits = CASE
    WHEN name = 'pro' THEN 10000
    WHEN name = 'max' THEN 60000
    ELSE monthly_credits
  END,
  updated_at = NOW()
WHERE name IN ('pro', 'max');

UPDATE public.credit_packages
SET
  price = CASE id
    WHEN 'pack_1k' THEN 499
    WHEN 'pack_5k' THEN 1999
    WHEN 'pack_20k' THEN 6999
    WHEN 'pack_100k' THEN 29999
    ELSE price
  END,
  -- Existing static Stripe Price IDs point at the previous amount. Clearing
  -- them makes checkout create price_data from the authoritative DB price.
  stripe_price_id = NULL,
  updated_at = NOW()
WHERE id IN ('pack_1k', 'pack_5k', 'pack_20k', 'pack_100k');

NOTIFY pgrst, 'reload schema';
