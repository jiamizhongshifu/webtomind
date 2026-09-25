-- Seed create-workspace onboarding reward tasks used by /create flows.

SET search_path = '';

CREATE TABLE IF NOT EXISTS public.reward_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('social', 'activity', 'onboarding')),
  title JSONB NOT NULL,
  description JSONB NOT NULL,
  reward_amount INTEGER NOT NULL DEFAULT 100,
  icon TEXT,
  action_link TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  is_repeatable BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.user_reward_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  task_id UUID REFERENCES public.reward_tasks(id) ON DELETE CASCADE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('completed', 'pending_verification')),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, task_id)
);

ALTER TABLE public.reward_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_reward_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read tasks" ON public.reward_tasks;
CREATE POLICY "Public read tasks"
ON public.reward_tasks
FOR SELECT
USING (is_active = TRUE);

DROP POLICY IF EXISTS "Users view own task status" ON public.user_reward_tasks;
CREATE POLICY "Users view own task status"
ON public.user_reward_tasks
FOR SELECT
USING ((SELECT auth.uid()) = user_id);

CREATE OR REPLACE FUNCTION public.complete_reward_task(
  p_user_id UUID,
  p_task_identifier TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_task_id UUID;
  v_reward_amount INTEGER;
  v_already_completed BOOLEAN;
BEGIN
  SELECT id, reward_amount
  INTO v_task_id, v_reward_amount
  FROM public.reward_tasks
  WHERE identifier = p_task_identifier
    AND is_active = TRUE;

  IF v_task_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Task not found or inactive');
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.user_reward_tasks
    WHERE user_id = p_user_id
      AND task_id = v_task_id
  )
  INTO v_already_completed;

  IF v_already_completed THEN
    RETURN jsonb_build_object('error', 'Task already completed');
  END IF;

  INSERT INTO public.user_reward_tasks (
    user_id,
    task_id,
    status,
    completed_at
  )
  VALUES (
    p_user_id,
    v_task_id,
    'completed',
    NOW()
  );

  PERFORM public.add_bonus_credits(
    p_user_id,
    v_reward_amount,
    'task_reward',
    jsonb_build_object(
      'task_identifier', p_task_identifier,
      'idempotency_key', 'task:' || p_user_id::TEXT || ':' || p_task_identifier
    )
  );

  RETURN jsonb_build_object(
    'success', TRUE,
    'reward_amount', v_reward_amount
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.complete_reward_task(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_reward_task(UUID, TEXT) TO service_role;

INSERT INTO public.reward_tasks (
  identifier,
  type,
  title,
  description,
  reward_amount,
  icon,
  action_link,
  is_active
)
VALUES
  (
    'first_image_generation',
    'onboarding',
    '{"zh-CN":"首次创作图片","en-US":"Create your first image"}'::jsonb,
    '{"zh-CN":"使用图像创作台生成第一张 AI 图片。","en-US":"Generate your first AI image in the image studio."}'::jsonb,
    100,
    'image',
    '/create/image',
    TRUE
  ),
  (
    'first_prompt_case_use',
    'onboarding',
    '{"zh-CN":"首次使用 Prompt Case","en-US":"Use your first Prompt Case"}'::jsonb,
    '{"zh-CN":"从案例库选择一个 Prompt 并带入创作台。","en-US":"Pick a prompt case and send it into the studio."}'::jsonb,
    80,
    'book-open-text',
    '/create/prompts',
    TRUE
  ),
  (
    'first_gallery_reference',
    'onboarding',
    '{"zh-CN":"首次从图库引用","en-US":"Reference from your gallery"}'::jsonb,
    '{"zh-CN":"把历史生成图导入为新创作的参考图。","en-US":"Use a previous generation as a new reference image."}'::jsonb,
    80,
    'gallery-horizontal-end',
    '/create/gallery',
    TRUE
  ),
  (
    'first_character_card',
    'onboarding',
    '{"zh-CN":"首次创建角色卡","en-US":"Create your first character card"}'::jsonb,
    '{"zh-CN":"保存一个角色卡，用于后续保持角色一致性。","en-US":"Save a character card for consistent future generations."}'::jsonb,
    120,
    'user-round',
    '/create/characters',
    TRUE
  ),
  (
    'first_save_to_board',
    'onboarding',
    '{"zh-CN":"首次保存到 Board","en-US":"Save to a Board"}'::jsonb,
    '{"zh-CN":"把一张生成图和 Prompt 保存到 Board 项目。","en-US":"Save a generated image and prompt into a Board project."}'::jsonb,
    80,
    'layout-dashboard',
    '/create/gallery',
    TRUE
  ),
  (
    'invite_friend',
    'social',
    '{"zh-CN":"邀请好友","en-US":"Invite a friend"}'::jsonb,
    '{"zh-CN":"分享你的邀请码，好友完成有效生成后获得邀请奖励。","en-US":"Share your referral code and earn rewards after a valid generation."}'::jsonb,
    0,
    'share-2',
    '/boards?openSettings=membership',
    TRUE
  )
ON CONFLICT (identifier) DO UPDATE
SET
  type = EXCLUDED.type,
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  reward_amount = EXCLUDED.reward_amount,
  icon = EXCLUDED.icon,
  action_link = EXCLUDED.action_link,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

NOTIFY pgrst, 'reload schema';
