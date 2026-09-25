-- Refresh create-workspace onboarding tasks to match the image-first creator flow.

SET search_path = '';

UPDATE public.reward_tasks
SET
  is_active = FALSE,
  updated_at = NOW()
WHERE identifier IN (
  'first_image_generation',
  'first_prompt_case_use',
  'first_gallery_reference',
  'first_character_card',
  'first_save_to_board',
  'invite_friend'
);

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
    'generate_first_commercial_image',
    'onboarding',
    '{"zh-CN":"完成第一张商业图","en-US":"Create your first commercial image"}'::jsonb,
    '{"zh-CN":"从图像创作台生成一张封面、产品图或营销主视觉。","en-US":"Generate a cover, product image, or marketing visual in the image studio."}'::jsonb,
    20,
    'image',
    '/create/image',
    TRUE
  ),
  (
    'save_prompt_case_or_prompt_asset',
    'onboarding',
    '{"zh-CN":"复用一个 Prompt 案例","en-US":"Reuse one Prompt case"}'::jsonb,
    '{"zh-CN":"从可复现案例中选择结构，并带回创作台继续调整。","en-US":"Pick a reproducible case and send its structure into the studio."}'::jsonb,
    20,
    'book-open-text',
    '/create#prompt-cases',
    TRUE
  ),
  (
    'use_reference_image',
    'onboarding',
    '{"zh-CN":"使用参考图或角色","en-US":"Use a reference image or character"}'::jsonb,
    '{"zh-CN":"上传或导入参考图，让画面风格、产品或角色保持稳定。","en-US":"Upload or import a reference to keep style, products, or characters consistent."}'::jsonb,
    15,
    'gallery-horizontal-end',
    '/create/image',
    TRUE
  ),
  (
    'reuse_gallery_generation',
    'onboarding',
    '{"zh-CN":"从图库继续创作","en-US":"Continue from your gallery"}'::jsonb,
    '{"zh-CN":"把历史生成图导入为新图参考，形成迭代链路。","en-US":"Import a previous generation as a new reference and keep iterating."}'::jsonb,
    15,
    'sparkles',
    '/create/gallery',
    TRUE
  ),
  (
    'launch_create_app',
    'onboarding',
    '{"zh-CN":"使用一个商业应用","en-US":"Run one creator app"}'::jsonb,
    '{"zh-CN":"选择小红书封面、电商主图或图片编辑应用，完成一次定向生成。","en-US":"Run a focused app for covers, product images, or image editing."}'::jsonb,
    15,
    'layout-dashboard',
    '/create/apps',
    TRUE
  ),
  (
    'create_or_open_board',
    'onboarding',
    '{"zh-CN":"打开或创建 Board","en-US":"Open or create a Board"}'::jsonb,
    '{"zh-CN":"把 Prompt、图片和素材沉淀到项目工作台，方便后续复用。","en-US":"Collect prompts, images, and materials in a project board for reuse."}'::jsonb,
    15,
    'layout-dashboard',
    '/create/boards',
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
