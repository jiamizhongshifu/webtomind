export const PROMPT_STYLE_GRID_CANONICAL_PATH = '/ai-image-style-grid';

export const PROMPT_STYLE_GRID_ALIAS_PATHS = [
  '/ai-prompt-style-grid',
  '/ai-image-prompt-style-grid',
  '/gpt-image-2-style-grid',
  '/nano-banana-style-grid',
  '/ai-image-prompt-templates',
  '/gpt-image-2-prompt-grid',
  '/nano-banana-prompt-grid',
  '/ai-portrait-prompt-template',
  '/ai-product-photography-prompt-template',
  '/ai-character-design-prompt-template',
  '/ai-sticker-prompt-generator',
  '/ai-anime-avatar-prompt',
  '/ai-cinematic-poster-prompt'
] as const;

export const PROMPT_STYLE_GRID_ALL_PATHS = [
  PROMPT_STYLE_GRID_CANONICAL_PATH,
  ...PROMPT_STYLE_GRID_ALIAS_PATHS
] as const;

export const PROMPT_STYLE_GRID_TEMPLATE_SEO = [
  {
    slug: 'taste',
    title: 'Personal Taste Theme Card',
    category: 'Starter',
    description:
      'Build a personal taste theme card for visual direction, mood, lighting, layout and assisted image generation.'
  },
  {
    slug: 'portrait',
    title: 'Portrait Theme Card',
    category: 'Portrait',
    description:
      'Create a portrait theme card for styling, lighting, camera language, pose and reusable visual references.'
  },
  {
    slug: 'product',
    title: 'Product Photography Theme Card',
    category: 'Product',
    description:
      'Plan a product photography theme card with studio lighting, ecommerce framing, clean backgrounds and selling-point details.'
  },
  {
    slug: 'character',
    title: 'Character Design Theme Card',
    category: 'Character',
    description:
      'Design a character theme card with subject, world context, pose, lens and layout choices for concept workflows.'
  },
  {
    slug: 'gpt-image-2',
    title: 'GPT Image 2 Theme Card',
    category: 'Model',
    description:
      'Use a GPT Image 2 theme card to organize repeatable visual direction before sending the card into Create.'
  },
  {
    slug: 'nano-banana',
    title: 'Nano Banana Theme Card',
    category: 'Model',
    description:
      'Start a Nano Banana theme card for fast reference-style iterations, lifestyle ideas and shareable visual planning.'
  },
  {
    slug: 'seedream',
    title: 'Seedream Scene Theme Card',
    category: 'Model',
    description:
      'Build a Seedream scene theme card for realistic lighting, spatial context and polished commercial imagery.'
  },
  {
    slug: 'midjourney',
    title: 'Cinematic Mood Theme Card',
    category: 'Cinematic',
    description:
      'Create a cinematic mood theme card for posters, editorial worlds, dramatic lighting and atmosphere-heavy visuals.'
  },
  {
    slug: 'social-cover',
    title: 'Social Cover Theme Card',
    category: 'Social',
    description:
      'Plan a social cover theme card for launch posts, tutorial thumbnails, Xiaohongshu covers and campaign visuals.'
  },
  {
    slug: 'anime-avatar',
    title: 'Anime Avatar Theme Card',
    category: 'Avatar',
    description:
      'Make an anime avatar theme card for profile pictures, character headshots and clean illustrated portrait styles.'
  },
  {
    slug: 'sticker',
    title: 'Sticker Pack Theme Card',
    category: 'Sticker',
    description:
      'Create a sticker pack theme card for cute mascots, reaction packs and simple shareable character ideas.'
  },
  {
    slug: 'cinematic-poster',
    title: 'Movie Poster Theme Card',
    category: 'Poster',
    description:
      'Build a movie poster theme card for key visuals, cinematic composition, title-safe layouts and dramatic image direction.'
  }
] as const;

export type PromptStyleGridTemplateSeo =
  (typeof PROMPT_STYLE_GRID_TEMPLATE_SEO)[number];

export type PromptStyleGridTemplateSeoCopy = {
  title: string;
  category: string;
  description: string;
};

const PROMPT_STYLE_GRID_TEMPLATE_SEO_ZH: Record<
  PromptStyleGridTemplateSeo['slug'],
  PromptStyleGridTemplateSeoCopy
> = {
  taste: {
    title: '个人审美主题卡片',
    category: '入门',
    description:
      '用主题卡片整理个人视觉偏好、情绪、光线、版式和辅助生成方向。'
  },
  portrait: {
    title: '人像主题卡片',
    category: '人像',
    description:
      '创建人像主题卡片，规划造型、光线、镜头语言、姿态和可复用视觉参考。'
  },
  product: {
    title: '商品摄影主题卡片',
    category: '商品',
    description:
      '用主题卡片规划商品摄影的影棚光、构图、干净背景和卖点细节。'
  },
  character: {
    title: '角色设计主题卡片',
    category: '角色',
    description:
      '用主题卡片整理角色主体、世界观、姿态、镜头和版式方向。'
  },
  'gpt-image-2': {
    title: 'GPT Image 2 主题卡片',
    category: '模型',
    description:
      '在进入创作台前，用 GPT Image 2 主题卡片组织可复用视觉方向。'
  },
  'nano-banana': {
    title: 'Nano Banana 主题卡片',
    category: '模型',
    description:
      '为 Nano Banana 工作流准备参考风格、生活方式想法和可分享视觉规划。'
  },
  seedream: {
    title: 'Seedream 场景主题卡片',
    category: '模型',
    description:
      '为 Seedream 场景整理真实光线、空间语境和商业级画面方向。'
  },
  midjourney: {
    title: '电影感情绪主题卡片',
    category: '电影感',
    description:
      '为海报、编辑视觉和氛围型画面创建电影感主题卡片。'
  },
  'social-cover': {
    title: '社媒封面主题卡片',
    category: '社媒',
    description:
      '规划发布帖、教程缩略图、小红书封面和活动视觉的主题卡片。'
  },
  'anime-avatar': {
    title: '动漫头像主题卡片',
    category: '头像',
    description:
      '为头像、角色半身像和干净插画风格制作动漫头像主题卡片。'
  },
  sticker: {
    title: '贴纸包主题卡片',
    category: '贴纸',
    description:
      '为可爱角色、表情包和轻量分享角色想法创建贴纸包主题卡片。'
  },
  'cinematic-poster': {
    title: '电影海报主题卡片',
    category: '海报',
    description:
      '为主视觉、电影构图、标题安全区和戏剧化画面方向创建海报主题卡片。'
  }
};

export const PROMPT_STYLE_GRID_DETAIL_PATHS =
  PROMPT_STYLE_GRID_TEMPLATE_SEO.map(
    (template) => `${PROMPT_STYLE_GRID_CANONICAL_PATH}/${template.slug}`
  );

export const PROMPT_STYLE_GRID_SEO = {
  title: 'Theme Card Plaza | WebToMind',
  h1: 'Theme Card Plaza',
  description:
    'Browse shareable AI theme cards for portraits, products, characters, stickers, covers and posters, then open a card editor with assisted image generation.',
  keywords: [
    'theme card plaza',
    'theme card template',
    'shareable theme cards',
    'AI image style grid',
    'AI prompt style grid',
    'AI image prompt style',
    'AI image prompt templates',
    'GPT Image 2 style grid',
    'GPT Image 2 prompt grid',
    'GPT Image 2 prompt template',
    'Nano Banana style grid',
    'Nano Banana prompts gallery',
    'Nano Banana prompt template',
    'AI portrait style grid',
    'AI portrait prompt template',
    'product photography prompt grid',
    'AI product photography prompt template',
    'AI character design prompt template',
    'Seedream prompts',
    'Midjourney style grid',
    'AI social media cover prompt',
    'AI anime avatar prompt',
    'AI sticker prompt generator',
    'AI cinematic poster prompt'
  ],
  faq: [
    {
      question: 'What is a WebToMind theme card?',
      answer:
        'A WebToMind theme card is a reusable visual card that organizes style, lighting, subject, layout and detail choices before you share the card or use assisted generation.'
    },
    {
      question: 'Can I use theme cards with GPT Image 2 or Nano Banana?',
      answer:
        'Yes. WebToMind can turn the selected card items into a prompt starter for GPT Image 2, Nano Banana and other supported models, but the card itself is the primary object.'
    },
    {
      question: 'Which theme card templates are included?',
      answer:
        'The plaza includes cards for portraits, product photography, character design, anime avatars, stickers, social covers, cinematic posters, Seedream, Midjourney, GPT Image 2 and Nano Banana workflows.'
    },
    {
      question: 'Does the card editor generate images directly?',
      answer:
        'The editor focuses on building the theme card first. When users want help filling the card with visuals, they can send the selected theme into WebToMind Create.'
    },
    {
      question: 'Are shared card URLs indexed as separate pages?',
      answer:
        'Query-based shared URLs canonicalize to the main theme card page, while stable card editor paths can be used as clean internal landing pages.'
    }
  ]
} as const;

export const PROMPT_STYLE_GRID_SEO_ZH = {
  title: '主题卡片广场 | WebToMind',
  h1: '主题卡片广场',
  description:
    '浏览人像、商品、角色、贴纸、封面和海报等可分享主题卡片，并在需要时进入卡片编辑器用 AI 辅助生成内容。',
  keywords: [
    '主题卡片广场',
    '主题卡片模板',
    '可分享主题卡片',
    'AI image style grid',
    'AI prompt style grid',
    'AI image prompt templates',
    'GPT Image 2 style grid',
    'Nano Banana prompts gallery',
    '商品摄影主题卡片',
    '人像主题卡片',
    '角色设计主题卡片',
    '贴纸主题卡片',
    '社媒封面主题卡片',
    '电影海报主题卡片'
  ],
  faq: [
    {
      question: 'WebToMind 主题卡片是什么？',
      answer:
        '主题卡片是一张可复用的视觉卡片，用来整理风格、光线、主体、版式和细节选择，方便分享或在需要时进入创作台辅助生成。'
    },
    {
      question: '主题卡片一定要用 AI 吗？',
      answer:
        '不一定。你可以手动填充作品、案例或上传图片；AI 只是用来在缺少缩略图或需要扩展画面时辅助生成。'
    },
    {
      question: '主题卡片适合哪些内容？',
      answer:
        '适合个人审美、人像、商品摄影、角色设计、社媒封面、头像、贴纸和海报等需要网格整理与分享的内容。'
    }
  ]
} as const;

export function getPromptStyleGridTemplateSeoCopy(
  slug: PromptStyleGridTemplateSeo['slug'],
  locale: 'zh-CN' | 'en-US' = 'en-US'
): PromptStyleGridTemplateSeoCopy {
  const fallback = getPromptStyleGridTemplateSeo(slug);
  if (locale === 'zh-CN') {
    return PROMPT_STYLE_GRID_TEMPLATE_SEO_ZH[slug] || fallback!;
  }
  return fallback!;
}

export type PromptStyleGridSeoCopy = {
  title: string;
  h1: string;
  description: string;
  keywords: readonly string[];
  faq: ReadonlyArray<{ question: string; answer: string }>;
};

export function getPromptStyleGridSeoCopy(
  locale: 'zh-CN' | 'en-US' = 'en-US'
): PromptStyleGridSeoCopy {
  return locale === 'zh-CN' ? PROMPT_STYLE_GRID_SEO_ZH : PROMPT_STYLE_GRID_SEO;
}

export function getPromptStyleGridTemplateSeo(
  slug: string
): PromptStyleGridTemplateSeo | null {
  return (
    PROMPT_STYLE_GRID_TEMPLATE_SEO.find((template) => template.slug === slug) ||
    null
  );
}

export function getPromptStyleGridTemplateSeoFromPath(
  pathname: string
): PromptStyleGridTemplateSeo | null {
  const normalized = pathname.replace(/\/$/, '') || '/';
  const match = normalized.match(/^\/ai-image-style-grid\/([^/]+)$/);
  if (!match) return null;
  return getPromptStyleGridTemplateSeo(match[1]);
}

export function isPromptStyleGridPath(pathname: string): boolean {
  const normalized = pathname.replace(/\/$/, '') || '/';
  return PROMPT_STYLE_GRID_ALL_PATHS.includes(
    normalized as (typeof PROMPT_STYLE_GRID_ALL_PATHS)[number]
  );
}
