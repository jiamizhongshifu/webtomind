-- Raise image generation credit tiers to cover Tuzi official-group fallback costs.

UPDATE public.credit_costs
SET
  cost = 900,
  description = '图片生成（按 Tuzi 官方兜底成本计费：基础=900, 2K=1200, 4K=1800）',
  pricing_type = 'dynamic',
  base_cost = 900,
  min_cost = 900,
  max_cost = 1800,
  updated_at = NOW()
WHERE action = 'image_generation';
