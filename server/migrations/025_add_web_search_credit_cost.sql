-- Add web search credit cost
-- Migration: 025_add_web_search_credit_cost.sql

SET search_path = public;

-- Add web_search action to credit_costs table
INSERT INTO credit_costs (action, cost, description, category, is_active, pricing_type, base_cost, input_token_rate, output_token_rate, min_cost, max_cost) 
VALUES ('web_search', 5, '联网搜索', 'ai', true, 'fixed', 5, 0, 0, 5, 5)
ON CONFLICT (action) DO UPDATE SET 
  cost = EXCLUDED.cost,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  is_active = EXCLUDED.is_active,
  pricing_type = EXCLUDED.pricing_type,
  base_cost = EXCLUDED.base_cost,
  min_cost = EXCLUDED.min_cost,
  max_cost = EXCLUDED.max_cost;
