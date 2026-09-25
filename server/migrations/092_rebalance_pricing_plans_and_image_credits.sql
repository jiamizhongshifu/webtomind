-- Rebalance image generation pricing and membership grants after July pricing review.
-- Cost assumptions from current GPT Image 2 supply:
-- 2K output ~= RMB 0.2, 4K output ~= RMB 0.6.

UPDATE public.credit_costs
SET
  cost = 60,
  description = '图片生成（用户侧统一尺寸档位：基础=60, 2K=100, 4K=300）',
  pricing_type = 'dynamic',
  base_cost = 60,
  min_cost = 40,
  max_cost = 420,
  updated_at = NOW()
WHERE action = 'image_generation';

UPDATE public.subscription_plans
SET
  monthly_credits = CASE
    WHEN name = 'pro' THEN 10000
    WHEN name = 'max' THEN 60000
    ELSE monthly_credits
  END,
  limits = CASE
    WHEN name IN ('pro', 'max') THEN
      jsonb_set(
        jsonb_set(COALESCE(limits, '{}'::jsonb), '{dailyCredits}', '-1'::jsonb, true),
        '{dailyImageGeneration}',
        '-1'::jsonb,
        true
      )
    ELSE limits
  END,
  updated_at = NOW()
WHERE name IN ('pro', 'max');

NOTIFY pgrst, 'reload schema';
