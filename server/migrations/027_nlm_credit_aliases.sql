-- Migration: Add alias credit costs for backward compatibility
-- Keep nlm_* action names working while we have gemini_* as the primary

INSERT INTO credit_costs (action, cost, description, category, is_active, pricing_type, base_cost, min_cost, max_cost)
VALUES 
  ('nlm_flashcards', 5, 'AI 闪卡生成', 'ai', true, 'fixed', 5, 5, 5),
  ('nlm_mindmap', 5, 'AI 思维导图', 'ai', true, 'fixed', 5, 5, 5),
  ('nlm_quiz', 8, 'AI 测验生成', 'ai', true, 'fixed', 8, 8, 8),
  ('nlm_report', 10, 'AI 报告生成', 'ai', true, 'fixed', 10, 10, 10),
  ('nlm_summary', 3, 'AI 摘要生成', 'ai', true, 'fixed', 3, 3, 3)
ON CONFLICT (action) DO UPDATE SET 
  cost = EXCLUDED.cost,
  description = EXCLUDED.description,
  is_active = EXCLUDED.is_active;
