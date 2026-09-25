-- Fix missing is_active column in credit_costs table
-- This column is expected by the consume_credits RPC defined in 006_credit_rpc.sql

SET search_path = public;

-- 1. Add is_active column to credit_costs if it doesn't exist
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'credit_costs' AND column_name = 'is_active') THEN
        ALTER TABLE credit_costs ADD COLUMN is_active BOOLEAN DEFAULT true;
        -- Set existing rows to true
        UPDATE credit_costs SET is_active = true;
        
        COMMENT ON COLUMN credit_costs.is_active IS '是否启用该积分消耗项';
    END IF;
END $$;

-- 2. Ensure all standard actions exist in credit_costs
INSERT INTO credit_costs (action, cost, description, category, is_active) VALUES
('ai_chat_basic', 1, 'AI对话(基础模型)', 'ai', true),
('ai_chat_advanced', 5, 'AI对话(高级模型)', 'ai', true),
('image_generation', 10, '图片生成', 'media', true),
('video_transcription_min', 2, '视频转录(每分钟)', 'media', true),
('save_card', 1, '保存内容卡片', 'system', true),
('mindmap_generation', 3, '思维导图生成', 'system', true)
ON CONFLICT (action) DO UPDATE SET 
    cost = EXCLUDED.cost,
    is_active = EXCLUDED.is_active;
