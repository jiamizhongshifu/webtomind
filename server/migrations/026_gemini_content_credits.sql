-- Migration: Add credit costs for Gemini-based content generation
-- This replaces the NotebookLM-based features with Gemini API

-- Text-based content generation
INSERT INTO credit_costs (action, cost, description, category, is_active, pricing_type, base_cost, min_cost, max_cost)
VALUES 
  ('gemini_flashcards', 5, 'AI 闪卡生成', 'ai', true, 'fixed', 5, 5, 5),
  ('gemini_mindmap', 5, 'AI 思维导图', 'ai', true, 'fixed', 5, 5, 5),
  ('gemini_quiz', 8, 'AI 测验生成', 'ai', true, 'fixed', 8, 8, 8),
  ('gemini_report', 10, 'AI 报告生成', 'ai', true, 'fixed', 10, 10, 10),
  ('gemini_summary', 3, 'AI 摘要生成', 'ai', true, 'fixed', 3, 3, 3)
ON CONFLICT (action) DO UPDATE SET 
  cost = EXCLUDED.cost,
  description = EXCLUDED.description,
  is_active = EXCLUDED.is_active;

-- Media content generation
INSERT INTO credit_costs (action, cost, description, category, is_active, pricing_type, base_cost, min_cost, max_cost)
VALUES 
  ('veo_video', 50, 'Veo3 视频生成', 'media', true, 'fixed', 50, 50, 50),
  ('gemini_infographic', 15, 'AI 信息图生成', 'media', true, 'fixed', 15, 15, 15)
ON CONFLICT (action) DO UPDATE SET 
  cost = EXCLUDED.cost,
  description = EXCLUDED.description,
  is_active = EXCLUDED.is_active;
