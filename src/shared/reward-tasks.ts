export interface RewardTaskDisplay {
  id: string;
  identifier: string;
  type: string;
  title: Record<string, string>;
  description: Record<string, string>;
  reward_amount: number;
  icon: string;
  action_link: string;
  is_completed: boolean;
}

export const STARTER_REWARD_TASKS: RewardTaskDisplay[] = [
  {
    id: 'fallback-generate-first-commercial-image',
    identifier: 'generate_first_commercial_image',
    type: 'onboarding',
    title: {
      'zh-CN': '完成第一张商业图',
      'en-US': 'Create your first commercial image'
    },
    description: {
      'zh-CN': '从图像创作台生成一张封面、产品图或营销主视觉。',
      'en-US':
        'Generate a cover, product image, or marketing visual in the image studio.'
    },
    reward_amount: 15,
    icon: 'image',
    action_link: '/image',
    is_completed: false
  },
  {
    id: 'fallback-save-prompt-case-or-prompt-asset',
    identifier: 'save_prompt_case_or_prompt_asset',
    type: 'onboarding',
    title: {
      'zh-CN': '复用一个 Prompt 案例',
      'en-US': 'Reuse one Prompt case'
    },
    description: {
      'zh-CN': '从可复现案例中选择结构，并带回创作台继续调整。',
      'en-US': 'Pick a reproducible case and send its structure into the studio.'
    },
    reward_amount: 10,
    icon: 'book-open-text',
    action_link: '/create#prompt-cases',
    is_completed: false
  },
  {
    id: 'fallback-use-reference-image',
    identifier: 'use_reference_image',
    type: 'onboarding',
    title: {
      'zh-CN': '使用参考图或角色',
      'en-US': 'Use a reference image or character'
    },
    description: {
      'zh-CN': '上传或导入参考图，让画面风格、产品或角色保持稳定。',
      'en-US':
        'Upload or import a reference to keep style, products, or characters consistent.'
    },
    reward_amount: 10,
    icon: 'gallery-horizontal-end',
    action_link: '/image',
    is_completed: false
  },
  {
    id: 'fallback-reuse-gallery-generation',
    identifier: 'reuse_gallery_generation',
    type: 'onboarding',
    title: {
      'zh-CN': '从图库继续创作',
      'en-US': 'Continue from your gallery'
    },
    description: {
      'zh-CN': '把历史生成图导入为新图参考，形成迭代链路。',
      'en-US':
        'Import a previous generation as a new reference and keep iterating.'
    },
    reward_amount: 10,
    icon: 'sparkles',
    action_link: '/gallery',
    is_completed: false
  },
  {
    id: 'fallback-launch-create-app',
    identifier: 'launch_create_app',
    type: 'onboarding',
    title: {
      'zh-CN': '使用一个商业应用',
      'en-US': 'Run one creator app'
    },
    description: {
      'zh-CN': '选择小红书封面、电商主图或图片编辑应用，完成一次定向生成。',
      'en-US':
        'Run a focused app for covers, product images, or image editing.'
    },
    reward_amount: 10,
    icon: 'layout-dashboard',
    action_link: '/apps',
    is_completed: false
  },
  {
    id: 'fallback-create-or-open-board',
    identifier: 'create_or_open_board',
    type: 'onboarding',
    title: {
      'zh-CN': '打开或创建 Board',
      'en-US': 'Open or create a Board'
    },
    description: {
      'zh-CN': '把 Prompt、图片和素材沉淀到项目工作台，方便后续复用。',
      'en-US':
        'Collect prompts, images, and materials in a project board for reuse.'
    },
    reward_amount: 5,
    icon: 'layout-dashboard',
    action_link: '/boards',
    is_completed: false
  }
];

export function cloneStarterRewardTasks(): RewardTaskDisplay[] {
  return STARTER_REWARD_TASKS.map((task) => ({ ...task }));
}
