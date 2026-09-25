-- ============================================
-- 任务奖励系统 (Phase 4 扩展)
-- ============================================

-- 1. 奖励任务定义表
CREATE TABLE IF NOT EXISTS reward_tasks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    identifier TEXT UNIQUE NOT NULL, -- e.g. 'star_github'
    type TEXT NOT NULL CHECK (type IN ('social', 'activity', 'onboarding')),
    title JSONB NOT NULL, -- {"zh-CN": "点亮 GitHub Star", "en-US": "Star on GitHub"}
    description JSONB NOT NULL,
    reward_amount INTEGER NOT NULL DEFAULT 500,
    icon TEXT, -- Lucide 图标名称
    action_link TEXT,
    is_active BOOLEAN DEFAULT true,
    is_repeatable BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. 用户任务状态表
CREATE TABLE IF NOT EXISTS user_reward_tasks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    task_id UUID REFERENCES reward_tasks(id) ON DELETE CASCADE NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('completed', 'pending_verification')),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, task_id) -- 假设大部分任务是一个不可重复的
);

-- 3. RLS 安全策略
ALTER TABLE reward_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_reward_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read tasks" ON reward_tasks;
CREATE POLICY "Public read tasks" ON reward_tasks FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "Users view own task status" ON user_reward_tasks;
CREATE POLICY "Users view own task status" ON user_reward_tasks FOR SELECT USING (auth.uid() = user_id);

-- 4. 处理任务完成的存储过程
CREATE OR REPLACE FUNCTION complete_reward_task(
    p_user_id UUID,
    p_task_identifier TEXT
) RETURNS JSONB AS $$
DECLARE
    v_task_id UUID;
    v_reward_amount INTEGER;
    v_already_completed BOOLEAN;
    v_result JSONB;
BEGIN
    -- A. 获取任务详情
    SELECT id, reward_amount INTO v_task_id, v_reward_amount
    FROM reward_tasks
    WHERE identifier = p_task_identifier AND is_active = true;

    IF v_task_id IS NULL THEN
        RETURN jsonb_build_object('error', 'Task not found or inactive');
    END IF;

    -- B. 检查是否已完成 (对于非重复任务)
    SELECT EXISTS (
        SELECT 1 FROM user_reward_tasks 
        WHERE user_id = p_user_id AND task_id = v_task_id
    ) INTO v_already_completed;

    IF v_already_completed THEN
        RETURN jsonb_build_object('error', 'Task already completed');
    END IF;

    -- C. 记录完成状态
    INSERT INTO user_reward_tasks (user_id, task_id, status, completed_at)
    VALUES (p_user_id, v_task_id, 'completed', NOW());

    -- D. 发放奖励
    PERFORM add_bonus_credits(
        p_user_id, 
        v_reward_amount, 
        'task_reward', 
        jsonb_build_object('task_identifier', p_task_identifier)
    );

    RETURN jsonb_build_object('success', true, 'reward_amount', v_reward_amount);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 5. 初始种子任务数据
INSERT INTO reward_tasks (identifier, type, title, description, reward_amount, icon, action_link) VALUES
('star_github', 'social', 
  '{"zh-CN": "Star GitHub 仓库", "en-US": "Star on GitHub"}', 
  '{"zh-CN": "点亮 GitHub Star 即可获得 500 积分奖励", "en-US": "Support us with a Star on GitHub and get 500 credits"}', 
  500, 'star', 'https://github.com/webtomind'),
('join_discord', 'social', 
  '{"zh-CN": "加入 Discord 社区", "en-US": "Join Discord Community"}', 
  '{"zh-CN": "加入我们的 Discord 获取最新动态并赢取奖励", "en-US": "Join our Discord for updates and rewards"}', 
  300, 'message-circle', 'https://discord.gg/webtomind'),
('follow_twitter', 'social', 
  '{"zh-CN": "关注 Twitter", "en-US": "Follow on Twitter"}', 
  '{"zh-CN": "在 X (Twitter) 上关注我们", "en-US": "Follow us on Twitter"}', 
  300, 'twitter', 'https://twitter.com/webtomind')
ON CONFLICT (identifier) DO NOTHING;
