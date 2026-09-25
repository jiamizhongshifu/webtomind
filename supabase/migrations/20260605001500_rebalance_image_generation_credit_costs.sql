-- Rebalance image generation credits after pricing review.
-- Keep subscription grants unchanged, but make the credits meaningfully usable:
-- Pro 20,000 credits ~= 200 base images, Max 200,000 credits ~= 2,000 base images.

UPDATE public.credit_costs
SET
  cost = 100,
  description = '图片生成（用户侧统一尺寸档位：基础=100, 2K=150, 4K=250）',
  pricing_type = 'dynamic',
  base_cost = 100,
  min_cost = 100,
  max_cost = 250,
  updated_at = NOW()
WHERE action = 'image_generation';

NOTIFY pgrst, 'reload schema';
