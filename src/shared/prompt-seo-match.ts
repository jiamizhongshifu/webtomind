export type PromptSeoCaseLike = {
  title?: unknown;
  title_zh?: unknown;
  titleZh?: unknown;
  title_en?: unknown;
  titleEn?: unknown;
  prompt?: unknown;
  prompt_zh?: unknown;
  promptZh?: unknown;
  prompt_en?: unknown;
  promptEn?: unknown;
  model?: unknown;
  category?: unknown;
  tags?: unknown;
  package_slug?: unknown;
  packageSlug?: unknown;
  commercial_intent?: unknown;
  commercial_intent_zh?: unknown;
  commercialIntentZh?: unknown;
  commercial_intent_en?: unknown;
  commercialIntentEn?: unknown;
  commercialIntent?: unknown;
  prompt_preview?: unknown;
  prompt_preview_zh?: unknown;
  promptPreviewZh?: unknown;
  prompt_preview_en?: unknown;
  promptPreviewEn?: unknown;
  promptPreview?: unknown;
};

export type PromptSeoPublicCase = {
  title: string;
  slug: string;
  locale: 'zh-CN' | 'en-US';
  model: string;
  category: string;
  tags: string[];
  packageSlug?: string;
  commercialIntent?: string;
  promptPreview?: string;
  imageUrl?: string;
};

type PromptSeoPageKind = 'category' | 'model' | 'package';

type CategoryMatcher = {
  legacyCategories: string[];
  tags: string[];
  terms: string[];
};

const MODEL_ALIASES: Record<string, string[]> = {
  'gpt-image-2': [
    'gpt-image-2',
    'gpt image 2',
    'gpt image2',
    'gpt-image2',
    'chatgpt image 2',
    'chatgpt image2',
    'chatgpt image prompts',
    'chatgpt image prompt examples',
    'chatgpt images 2.0',
    'gpt image 2.0'
  ],
  'nano-banana': ['nano-banana', 'nano banana', 'nanobanana'],
  flux: ['flux', 'flux ai', 'flux.1', 'flux1', 'flux prompts'],
  seedream: [
    'seedream',
    'sea dream',
    'seedream 4.5',
    'seedream 5',
    'seedream 5 lite',
    'seedream-5-lite',
    'seedream-5.0-lite',
    'seedream prompts'
  ],
  'mona-lisa-1': [
    'mona-lisa-1',
    'mona lisa 1',
    'monalisa 1',
    'mona-lisa',
    'mona lisa',
    'monalisa',
    'mona lisa prompts',
    'mona-lisa-1 prompts',
    'openai mona lisa'
  ],
  'seedance-2-0': [
    'seedance-2-0',
    'seedance 2.0',
    'seedance 2',
    'seedance',
    'seedance prompts',
    'seedance video prompts',
    'seedance ai video'
  ],
  'grok-imagine': [
    'grok-imagine',
    'grok imagine',
    'grok imagine image 2.0',
    'grok imagine image 2',
    'imagine image 2.0',
    'imagine image 2',
    'imagine-image-2-0',
    'xai imagine image 2.0',
    'imagine image 2.0 prompts',
    'imagine image 2 prompts'
  ],
  'midjourney-alternative': ['midjourney', 'mid journey', 'mj']
};

const CATEGORY_MATCHERS: Record<string, CategoryMatcher> = {
  'ai-portrait': {
    legacyCategories: ['portrait', 'fashion'],
    tags: ['ai-portrait', 'portrait', 'ai-photo-prompts', 'photo-prompts'],
    terms: [
      '人像',
      '写真',
      '真人',
      '手机摄影',
      '摄影照片',
      'cosplay',
      '约会',
      'portrait',
      'personal branding portrait',
      'boudoir',
      'glamour',
      'swimwear',
      'lingerie',
      '私房',
      '泳装',
      '晚礼服',
      '红毯'
    ]
  },
  'sref-prompts': {
    legacyCategories: ['background'],
    tags: ['sref', 'sref-prompts', 'style-reference', 'midjourney'],
    terms: ['sref', '--sref', 'style reference', '风格参考', 'midjourney']
  },
  'product-images': {
    legacyCategories: ['ecommerce'],
    tags: ['product-images', 'product-photography', 'ecommerce'],
    terms: [
      '商品',
      '产品',
      '电商',
      '主图',
      '护肤',
      '品牌',
      '广告',
      '饮料',
      '甜点',
      '蛋糕',
      '食品',
      'kv',
      'product',
      'ecommerce',
      'skincare',
      'advertisement',
      'commercial photography',
      'product photo',
      'product photography',
      'beverage',
      'dessert',
      'bakery',
      'food'
    ]
  },
  'xiaohongshu-cover': {
    legacyCategories: ['cover', 'xiaohongshu', 'wechat-cover', 'poster'],
    tags: ['xiaohongshu-cover', 'xiaohongshu', 'social-cover'],
    terms: ['小红书', '封面', '9:16', '竖版', 'cover', 'poster', 'social']
  },
  'character-consistency': {
    legacyCategories: ['character'],
    tags: ['character-consistency', 'character-design', 'character'],
    terms: [
      '角色',
      '指定角色',
      '一致性',
      '动漫',
      '卡通',
      'Q版',
      '涂鸦',
      'cosplay',
      'character',
      'identity',
      'anime',
      'cartoon',
      'chibi',
      'doodle'
    ]
  },
  'comfyui-prompts': {
    legacyCategories: ['background'],
    tags: ['comfyui', 'workflow'],
    terms: ['comfyui', 'workflow', '工作流', '节点']
  },
  'portrait-photography': {
    legacyCategories: [],
    tags: [
      'ai-portrait',
      'portrait',
      'portrait-photography',
      'influencer-model',
      'photo-prompts'
    ],
    terms: [
      '人像',
      '写真',
      '自拍',
      '头像',
      '半身照',
      '证件照',
      '职业照',
      '棚拍',
      '街拍',
      '手机摄影',
      '真人摄影',
      'portrait',
      'selfie',
      'headshot',
      'profile photo',
      'studio portrait',
      'street photo',
      'photorealistic portrait',
      'model portrait',
      'fashion portrait',
      'editorial portrait'
    ]
  },
  'product-commercial': {
    legacyCategories: [],
    tags: [
      'product-photography',
      'product-commercial',
      'food-drink'
    ],
    terms: [
      '商品',
      '产品',
      '电商',
      '主图',
      '详情页',
      '包装',
      '护肤',
      '香水',
      '饮料',
      '食品',
      '餐饮',
      '卖点',
      '商业摄影',
      '广告图',
      '场景图',
      'product',
      'ecommerce',
      'hero image',
      'product hero',
      'product shot',
      'product photo',
      'product photography',
      'commercial photo',
      'commercial photography',
      'packaging',
      'skincare',
      'perfume',
      'beverage',
      'food'
    ]
  },
  'poster-key-visual': {
    legacyCategories: [],
    tags: ['poster', 'poster-flyer', 'wechat-cover', 'key-visual'],
    terms: [
      '海报',
      '主视觉',
      'kv',
      '封面海报',
      '电影海报',
      '杂志封面',
      '宣传图',
      '活动海报',
      'poster',
      'key visual',
      'campaign visual',
      'magazine cover',
      'movie poster',
      'cover art',
      'typography'
    ]
  },
  'social-cover-thumbnail': {
    legacyCategories: [],
    tags: [
      'xiaohongshu-cover',
      'xiaohongshu',
      'social-cover',
      'youtube-thumbnail',
      'social-media-post'
    ],
    terms: [
      '小红书',
      '封面',
      '公众号封面',
      '视频封面',
      '缩略图',
      '社媒',
      '社交媒体',
      '封面图',
      'thumbnail',
      'youtube thumbnail',
      'social cover',
      'social thumbnail',
      'social media post',
      'social media',
      'instagram post',
      'rednote'
    ]
  },
  'character-design': {
    legacyCategories: [],
    tags: [
      'character',
      'character-design',
      'character-consistency',
      'anime-manga',
      'chibi-q-style',
      'game-asset'
    ],
    terms: [
      '角色',
      '指定角色',
      '角色设定',
      '设定集',
      '三视图',
      '转身图',
      '立绘',
      'q版',
      '动漫',
      '漫画',
      '游戏角色',
      'character',
      'character design',
      'character sheet',
      'turnaround',
      'model sheet',
      'anime',
      'manga',
      'chibi',
      'game character',
      'sprite'
    ]
  },
  'ui-infographic': {
    legacyCategories: [],
    tags: [
      'app-web-design',
      'diagram-chart',
      'infographic-edu-visual',
      'isometric'
    ],
    terms: [
      '信息图',
      '图标',
      '图标网格',
      '图标包',
      '界面',
      '操作界面',
      '信息架构',
      '应用界面',
      '仪表盘',
      '数据图',
      '流程图',
      '说明图',
      'UI',
      'infographic',
      'icon grid',
      'icon set',
      'app icon',
      'app interface',
      'interface',
      'dashboard',
      'app mockup',
      'app ui',
      'product ui',
      'wireframe',
      'diagram',
      'chart',
      'isometric'
    ]
  },
  'interior-architecture': {
    legacyCategories: [],
    tags: [
      'architecture-interior',
      'cityscape-street',
      'storefront-marketing-kit'
    ],
    terms: [
      '建筑',
      '空间',
      '室内',
      '门店',
      '店铺',
      '橱窗',
      '展厅',
      '城市',
      '街景',
      '空间设计',
      'architecture',
      'interior',
      'room',
      'storefront',
      'retail space',
      'showroom',
      'cityscape',
      'street',
      'spatial design'
    ]
  },
  'style-remix-reference': {
    legacyCategories: [],
    tags: [
      'sref',
      'sref-prompts',
      'style-reference',
      'illustration',
      'watercolor',
      'oil-painting',
      'retro-vintage',
      'minimalism'
    ],
    terms: [
      '风格参考',
      '风格迁移',
      '参考图',
      '改写',
      '重绘',
      '反推',
      'style reference',
      'style transfer',
      'reference image',
      'image to prompt',
      'remix',
      'recreate',
      'redraw',
      '--sref'
    ]
  },
  'video-motion': {
    legacyCategories: [],
    tags: ['seedance', 'video-prompt', 'comic-storyboard'],
    terms: [
      '视频',
      '短片',
      '镜头运动',
      '运镜',
      '分镜',
      '故事板',
      '动画',
      '动态',
      'video',
      'motion',
      'camera movement',
      'storyboard',
      'animation',
      'cinematic sequence',
      'seedance'
    ]
  }
};

const UI_INFOGRAPHIC_TITLE_ALLOW_TERMS = [
  'UI',
  '信息图',
  '图标',
  '图标网格',
  '图标包',
  '界面',
  '仪表盘',
  '看板',
  '数据图',
  '流程图',
  '说明图',
  '地图',
  '模板',
  '演示',
  'ui',
  'infographic',
  'icon',
  'interface',
  'dashboard',
  'chart',
  'map',
  'template',
  'mockup',
  'wireframe'
];

const UI_INFOGRAPHIC_TITLE_BLOCK_TERMS = [
  '人像',
  '肖像',
  '写真',
  '模特',
  '时尚',
  '礼服',
  '产品',
  '商品',
  '主图',
  '海报',
  '广告',
  '新品',
  '香水',
  '护肤',
  '口红',
  '唇膏',
  '米粒',
  '刻字',
  '拼贴画',
  'portrait',
  'fashion',
  'product',
  'poster',
  'advertising',
  'advertisement',
  'lip balm',
  'perfume',
  'skincare',
  'collage'
];

const PROMPT_SEO_PUBLIC_CASES: PromptSeoPublicCase[] = [
  {
    title: 'GPT Image 2 电商耳机主图 Prompt',
    slug: 'zh-gpt-image-2-ecommerce-hero-image-prompt',
    locale: 'zh-CN',
    model: 'gpt-image-2',
    category: 'ecommerce',
    packageSlug: 'gpt-image-2-prompts',
    commercialIntent:
      'Use GPT Image 2 to create ecommerce hero images and paid social product visuals from a reusable product photography prompt structure.',
    promptPreview:
      'Free GPT Image 2 prompt example for ecommerce hero images: product, material, backdrop, lighting, camera angle, negative constraints and crop-safe composition.',
    tags: ['gpt-image-2', 'gpt-image-2-prompts', 'AI图片提示词', '电商主图']
  },
  {
    title: 'GPT Image 2 Ecommerce Hero Image Prompt',
    slug: 'gpt-image-2-ecommerce-hero-image-prompt',
    locale: 'en-US',
    model: 'gpt-image-2',
    category: 'ecommerce',
    packageSlug: 'gpt-image-2-prompts',
    commercialIntent:
      'Use GPT Image 2 to create ecommerce hero images and paid social product visuals from a reusable product photography prompt structure.',
    promptPreview:
      'Free GPT Image 2 prompt example for ecommerce hero images: product, material, backdrop, lighting, camera angle, negative constraints and crop-safe composition.',
    tags: [
      'gpt-image-2-prompts',
      'free GPT Image 2 prompts',
      'ecommerce hero image',
      'product photography prompts'
    ]
  },
  {
    title: 'GPT Image 2 创始人肖像 Prompt',
    slug: 'zh-gpt-image-2-founder-portrait-prompt',
    locale: 'zh-CN',
    model: 'gpt-image-2',
    category: 'portrait',
    packageSlug: 'gpt-image-2-prompts',
    commercialIntent:
      'Use GPT Image 2 to generate professional founder portraits for LinkedIn, about pages, press kits and personal-brand content.',
    promptPreview:
      'GPT Image 2 founder portrait prompt with role, environment, lighting, expression, wardrobe, crop and authenticity constraints.',
    tags: ['gpt-image-2', 'gpt-image-2-prompts', 'AI肖像提示词']
  },
  {
    title: 'GPT Image 2 Founder Portrait Prompt',
    slug: 'gpt-image-2-founder-portrait-prompt',
    locale: 'en-US',
    model: 'gpt-image-2',
    category: 'portrait',
    packageSlug: 'gpt-image-2-prompts',
    commercialIntent:
      'Use GPT Image 2 to generate professional founder portraits for LinkedIn, about pages, press kits and personal-brand content.',
    promptPreview:
      'GPT Image 2 founder portrait prompt with role, environment, lighting, expression, wardrobe, crop and authenticity constraints.',
    tags: ['gpt-image-2-prompts', 'AI portrait prompts', 'founder portrait']
  },
  {
    title: 'GPT Image 2 编辑写真 Prompt',
    slug: 'zh-gpt-image-2-editorial-portrait-example-prompt',
    locale: 'zh-CN',
    model: 'gpt-image-2',
    category: 'portrait',
    packageSlug: 'gpt-image-2-prompts',
    commercialIntent:
      'Use GPT Image 2 to create reusable editorial portraits, profile covers and personal-brand images from a structured portrait prompt.',
    promptPreview:
      'Free GPT Image 2 portrait prompt example with adult subject, wardrobe, lens, lighting, background, skin texture and safety constraints.',
    tags: [
      'gpt-image-2',
      'gpt-image-2-prompts',
      'free GPT Image 2 prompts',
      'AI portrait prompts',
      'portrait prompt examples'
    ]
  },
  {
    title: 'GPT Image 2 Editorial Portrait Example Prompt',
    slug: 'gpt-image-2-editorial-portrait-example-prompt',
    locale: 'en-US',
    model: 'gpt-image-2',
    category: 'portrait',
    packageSlug: 'gpt-image-2-prompts',
    commercialIntent:
      'Use GPT Image 2 to create reusable editorial portraits, profile covers and personal-brand images from a structured portrait prompt.',
    promptPreview:
      'Free GPT Image 2 portrait prompt example with adult subject, wardrobe, lens, lighting, background, skin texture and safety constraints.',
    tags: [
      'gpt-image-2-prompts',
      'free GPT Image 2 prompts',
      'AI portrait prompts',
      'portrait prompt examples',
      'GPT Image 2 portrait prompts'
    ]
  },
  {
    title: 'GPT Image 2 商业头像 Prompt',
    slug: 'zh-gpt-image-2-commercial-headshot-prompt',
    locale: 'zh-CN',
    model: 'gpt-image-2',
    category: 'portrait',
    packageSlug: 'gpt-image-2-prompts',
    commercialIntent:
      'Create professional headshots, founder photos and about-page portraits with a repeatable GPT Image 2 prompt structure.',
    promptPreview:
      'Portrait prompt example for business headshots: clean background, natural expression, realistic skin, complete wardrobe and crop-safe framing.',
    tags: [
      'gpt-image-2',
      'AI portrait prompts',
      'portrait prompt examples',
      'commercial headshot'
    ]
  },
  {
    title: 'GPT Image 2 Commercial Headshot Prompt',
    slug: 'gpt-image-2-commercial-headshot-prompt',
    locale: 'en-US',
    model: 'gpt-image-2',
    category: 'portrait',
    packageSlug: 'gpt-image-2-prompts',
    commercialIntent:
      'Create professional headshots, founder photos and about-page portraits with a repeatable GPT Image 2 prompt structure.',
    promptPreview:
      'Portrait prompt example for business headshots: clean background, natural expression, realistic skin, complete wardrobe and crop-safe framing.',
    tags: [
      'gpt-image-2-prompts',
      'AI portrait prompts',
      'portrait prompt examples',
      'free AI portrait prompts'
    ]
  },
  {
    title: 'Nano Banana 图库封面 GPT Image 2 Prompt',
    slug: 'zh-nano-banana-social-cover-gallery-gpt-image-2-prompt',
    locale: 'zh-CN',
    model: 'gpt-image-2',
    category: 'poster',
    packageSlug: 'nano-banana-prompts',
    commercialIntent:
      'Use a GPT Image 2 prompt structure to create Nano Banana prompts gallery-style social covers, creator thumbnails and reusable visual variants for SEO discovery.',
    promptPreview:
      'Nano Banana prompts gallery example powered by GPT Image 2: mobile-first social cover, image variation cards, yellow visual system and no-text constraints.',
    tags: ['nano-banana-prompts', 'Nano Banana prompts gallery']
  },
  {
    title: 'Nano Banana Prompts Gallery GPT Image 2 Prompt',
    slug: 'nano-banana-social-cover-gallery-gpt-image-2-prompt',
    locale: 'en-US',
    model: 'gpt-image-2',
    category: 'poster',
    packageSlug: 'nano-banana-prompts',
    commercialIntent:
      'Use a GPT Image 2 prompt structure to create Nano Banana prompts gallery-style social covers, creator thumbnails and reusable visual variants for SEO discovery.',
    promptPreview:
      'Nano Banana prompts gallery example powered by GPT Image 2: mobile-first social cover, image variation cards, yellow visual system and no-text constraints.',
    tags: [
      'nano-banana-prompts',
      'Nano Banana prompts gallery',
      'Nano Banana prompt examples'
    ]
  },
  {
    title: 'Nano Banana 编辑肖像 GPT Image 2 Prompt',
    slug: 'zh-nano-banana-editorial-portrait-gpt-image-2-prompt',
    locale: 'zh-CN',
    model: 'gpt-image-2',
    category: 'portrait',
    packageSlug: 'nano-banana-prompts',
    commercialIntent:
      'Use a GPT Image 2-compatible prompt structure under the Nano Banana prompts package for editorial portraits and personal-brand examples.',
    promptPreview:
      'Nano Banana prompt example for editorial portraits: adult subject, courtyard light, professional wardrobe, realistic skin and no-logo constraints.',
    tags: [
      'nano-banana-prompts',
      'Nano Banana prompt examples',
      'AI portrait prompts',
      'portrait prompt examples'
    ]
  },
  {
    title: 'Nano Banana Editorial Portrait GPT Image 2 Prompt',
    slug: 'nano-banana-editorial-portrait-gpt-image-2-prompt',
    locale: 'en-US',
    model: 'gpt-image-2',
    category: 'portrait',
    packageSlug: 'nano-banana-prompts',
    commercialIntent:
      'Use a GPT Image 2-compatible prompt structure under the Nano Banana prompts package for editorial portraits and personal-brand examples.',
    promptPreview:
      'Nano Banana prompt example for editorial portraits: adult subject, courtyard light, professional wardrobe, realistic skin and no-logo constraints.',
    tags: [
      'nano-banana-prompts',
      'Nano Banana prompt examples',
      'AI portrait prompts',
      'portrait prompt examples'
    ]
  },
  {
    title: 'Nano Banana 商品组合 GPT Image 2 Prompt',
    slug: 'zh-nano-banana-product-bundle-gpt-image-2-prompt',
    locale: 'zh-CN',
    model: 'gpt-image-2',
    category: 'ecommerce',
    packageSlug: 'nano-banana-prompts',
    commercialIntent:
      'Use a GPT Image 2-compatible prompt structure under the Nano Banana prompts package for gallery-ready product bundle examples.',
    promptPreview:
      'Nano Banana prompts gallery product example: unbranded bundle, warm studio, material clarity, crop-safe ecommerce composition and no readable text.',
    tags: [
      'nano-banana-prompts',
      'Nano Banana prompts gallery',
      'Nano Banana prompt examples',
      'product photography prompts'
    ]
  },
  {
    title: 'Nano Banana Product Bundle GPT Image 2 Prompt',
    slug: 'nano-banana-product-bundle-gpt-image-2-prompt',
    locale: 'en-US',
    model: 'gpt-image-2',
    category: 'ecommerce',
    packageSlug: 'nano-banana-prompts',
    commercialIntent:
      'Use a GPT Image 2-compatible prompt structure under the Nano Banana prompts package for gallery-ready product bundle examples.',
    promptPreview:
      'Nano Banana prompts gallery product example: unbranded bundle, warm studio, material clarity, crop-safe ecommerce composition and no readable text.',
    tags: [
      'nano-banana-prompts',
      'Nano Banana prompts gallery',
      'Nano Banana prompt examples',
      'product photography prompts'
    ]
  },
  {
    title: '开放世界游戏封面 GPT Image 2 Prompt',
    slug: 'zh-open-world-crime-game-cover-art-prompt',
    locale: 'zh-CN',
    model: 'gpt-image-2',
    category: 'poster',
    packageSlug: 'wechat-cover-poster',
    commercialIntent:
      'GPT Image 2 prompt example for original open-world crime game cover art, cinematic game key art, fictional city posters and mobile-ready campaign visuals.',
    promptPreview:
      'Original game cover art prompt with fictional neon coastal city, adult character trio, sports car foreground, helicopter searchlight, sunset palette, no text and no recognizable IP.',
    tags: [
      'gpt-image-2',
      'game-cover-art',
      'poster',
      'cinematic-key-art',
      'open-world-game'
    ]
  },
  {
    title: 'Open World Crime Game Cover Art Prompt',
    slug: 'open-world-crime-game-cover-art-prompt',
    locale: 'en-US',
    model: 'gpt-image-2',
    category: 'poster',
    packageSlug: 'wechat-cover-poster',
    commercialIntent:
      'GPT Image 2 prompt example for original open-world crime game cover art, cinematic game key art, fictional city posters and mobile-ready campaign visuals.',
    promptPreview:
      'Original game cover art prompt with fictional neon coastal city, adult character trio, sports car foreground, helicopter searchlight, sunset palette, no text and no recognizable IP.',
    tags: [
      'gpt-image-2',
      'game-cover-art',
      'poster',
      'cinematic-key-art',
      'open-world-game'
    ]
  },
  {
    title: '女性主角游戏封面 GPT Image 2 Prompt',
    slug: 'zh-female-protagonist-game-cover-art-prompt',
    locale: 'zh-CN',
    model: 'gpt-image-2',
    category: 'poster',
    packageSlug: 'wechat-cover-poster',
    commercialIntent:
      'GPT Image 2 prompt example for original female protagonist game cover art, cinematic character posters and mobile-ready game key visuals.',
    promptPreview:
      'Original female protagonist game cover prompt with neon coastal city, unbranded sports car, helicopter searchlight, sunset palette, cover-safe spacing and no recognizable IP.',
    tags: [
      'gpt-image-2',
      'game-cover-art',
      'female-protagonist',
      'poster',
      'cinematic-key-art'
    ]
  },
  {
    title: 'Female Protagonist Game Cover Art Prompt',
    slug: 'female-protagonist-game-cover-art-prompt',
    locale: 'en-US',
    model: 'gpt-image-2',
    category: 'poster',
    packageSlug: 'wechat-cover-poster',
    commercialIntent:
      'GPT Image 2 prompt example for original female protagonist game cover art, cinematic character posters and mobile-ready game key visuals.',
    promptPreview:
      'Original female protagonist game cover prompt with neon coastal city, unbranded sports car, helicopter searchlight, sunset palette, cover-safe spacing and no recognizable IP.',
    tags: [
      'gpt-image-2',
      'game-cover-art',
      'female-protagonist',
      'poster',
      'cinematic-key-art'
    ]
  },
  {
    title: '霓虹开放世界游戏主视觉 GPT Image 2 Prompt',
    slug: 'zh-neon-open-world-game-key-art-prompt',
    locale: 'zh-CN',
    model: 'gpt-image-2',
    category: 'poster',
    packageSlug: 'wechat-cover-poster',
    commercialIntent:
      'GPT Image 2 prompt example for neon open-world game key art, fictional city posters, campaign visuals and video game box art exploration.',
    promptPreview:
      'Original neon open-world game key art prompt with rainy coastal metropolis, elevated highway, teal-magenta city lights, small adult silhouettes and no recognizable IP.',
    tags: [
      'gpt-image-2',
      'open-world-game',
      'game-key-art',
      'poster',
      'video-game-box-art'
    ]
  },
  {
    title: 'Neon Open World Game Key Art Prompt',
    slug: 'neon-open-world-game-key-art-prompt',
    locale: 'en-US',
    model: 'gpt-image-2',
    category: 'poster',
    packageSlug: 'wechat-cover-poster',
    commercialIntent:
      'GPT Image 2 prompt example for neon open-world game key art, fictional city posters, campaign visuals and video game box art exploration.',
    promptPreview:
      'Original neon open-world game key art prompt with rainy coastal metropolis, elevated highway, teal-magenta city lights, small adult silhouettes and no recognizable IP.',
    tags: [
      'gpt-image-2',
      'open-world-game',
      'game-key-art',
      'poster',
      'video-game-box-art'
    ]
  },
  {
    title: "GTA 6's Cover Girls 夕阳女主游戏封面 Prompt",
    slug: 'zh-gta-6-cover-girls-sunset-protagonist-prompt',
    locale: 'zh-CN',
    model: 'gpt-image-2',
    category: 'poster',
    packageSlug: 'gta-6-cover-girls-prompts',
    commercialIntent:
      "GPT Image 2 prompt example for GTA 6's cover girls search intent, original adult female protagonist game cover art and open-world poster exploration.",
    promptPreview:
      "GTA 6's cover girls prompt structure with an original adult female protagonist, fictional neon coastal city, sunset skyline, unbranded sports cars, title-safe sky space and no recognizable IP.",
    imageUrl:
      '/prompt-cases/2026-06-25-gta-6-cover-girls/sunset-cover-girl-game-key-art.webp',
    tags: [
      'gpt-image-2',
      'gta-6-cover-girls',
      'game-cover-art',
      'female-protagonist',
      'open-world-game'
    ]
  },
  {
    title: "GTA 6's Cover Girls Sunset Protagonist Prompt",
    slug: 'gta-6-cover-girls-sunset-protagonist-prompt',
    locale: 'en-US',
    model: 'gpt-image-2',
    category: 'poster',
    packageSlug: 'gta-6-cover-girls-prompts',
    commercialIntent:
      "GPT Image 2 prompt example for GTA 6's cover girls search intent, original adult female protagonist game cover art and open-world poster exploration.",
    promptPreview:
      "GTA 6's cover girls prompt structure with an original adult female protagonist, fictional neon coastal city, sunset skyline, unbranded sports cars, title-safe sky space and no recognizable IP.",
    imageUrl:
      '/prompt-cases/2026-06-25-gta-6-cover-girls/sunset-cover-girl-game-key-art.webp',
    tags: [
      'gpt-image-2',
      'gta-6-cover-girls',
      'game-cover-art',
      'female-protagonist',
      'open-world-game'
    ]
  },
  {
    title: "GTA 6's Cover Girls 霓虹双女主游戏封面 Prompt",
    slug: 'zh-gta-6-cover-girls-neon-duo-prompt',
    locale: 'zh-CN',
    model: 'gpt-image-2',
    category: 'poster',
    packageSlug: 'gta-6-cover-girls-prompts',
    commercialIntent:
      "GPT Image 2 prompt example for GTA 6's cover girls searches, fictional duo character cover art, neon beach city posters and campaign key visuals.",
    promptPreview:
      "GTA 6's cover girls duo prompt with two original adult female protagonists, neon beach-city nightlife, unbranded motorcycle and coupe, helicopter silhouettes, and no text or logos.",
    imageUrl:
      '/prompt-cases/2026-06-25-gta-6-cover-girls/neon-duo-cover-girls-game-key-art.webp',
    tags: [
      'gpt-image-2',
      'gta-6-cover-girls',
      'game-cover-art',
      'cover-girls',
      'cinematic-key-art'
    ]
  },
  {
    title: "GTA 6's Cover Girls Neon Duo Prompt",
    slug: 'gta-6-cover-girls-neon-duo-prompt',
    locale: 'en-US',
    model: 'gpt-image-2',
    category: 'poster',
    packageSlug: 'gta-6-cover-girls-prompts',
    commercialIntent:
      "GPT Image 2 prompt example for GTA 6's cover girls searches, fictional duo character cover art, neon beach city posters and campaign key visuals.",
    promptPreview:
      "GTA 6's cover girls duo prompt with two original adult female protagonists, neon beach-city nightlife, unbranded motorcycle and coupe, helicopter silhouettes, and no text or logos.",
    imageUrl:
      '/prompt-cases/2026-06-25-gta-6-cover-girls/neon-duo-cover-girls-game-key-art.webp',
    tags: [
      'gpt-image-2',
      'gta-6-cover-girls',
      'game-cover-art',
      'cover-girls',
      'cinematic-key-art'
    ]
  },
  {
    title: "GTA 6's Cover Girls 三人组游戏封面 Prompt",
    slug: 'zh-gta-6-cover-girls-ensemble-prompt',
    locale: 'zh-CN',
    model: 'gpt-image-2',
    category: 'poster',
    packageSlug: 'gta-6-cover-girls-prompts',
    commercialIntent:
      "GPT Image 2 prompt example for GTA 6's cover girls long-tail SEO, original female ensemble game cover art, marina city posters and box-art concepts.",
    promptPreview:
      "GTA 6's cover girls ensemble prompt with three original adult female protagonists, tropical marina skyline, unbranded convertible, sunset reflections, and cover-safe composition.",
    imageUrl:
      '/prompt-cases/2026-06-25-gta-6-cover-girls/marina-cover-girls-ensemble-game-key-art.webp',
    tags: [
      'gpt-image-2',
      'gta-6-cover-girls',
      'game-cover-art',
      'female-ensemble',
      'video-game-box-art'
    ]
  },
  {
    title: "GTA 6's Cover Girls Ensemble Prompt",
    slug: 'gta-6-cover-girls-ensemble-prompt',
    locale: 'en-US',
    model: 'gpt-image-2',
    category: 'poster',
    packageSlug: 'gta-6-cover-girls-prompts',
    commercialIntent:
      "GPT Image 2 prompt example for GTA 6's cover girls long-tail SEO, original female ensemble game cover art, marina city posters and box-art concepts.",
    promptPreview:
      "GTA 6's cover girls ensemble prompt with three original adult female protagonists, tropical marina skyline, unbranded convertible, sunset reflections, and cover-safe composition.",
    imageUrl:
      '/prompt-cases/2026-06-25-gta-6-cover-girls/marina-cover-girls-ensemble-game-key-art.webp',
    tags: [
      'gpt-image-2',
      'gta-6-cover-girls',
      'game-cover-art',
      'female-ensemble',
      'video-game-box-art'
    ]
  },
  {
    title: 'Seedream 写实人像 Prompt 案例',
    slug: 'zh-seedream-editorial-portrait-prompt',
    locale: 'zh-CN',
    model: 'seedream-5-lite',
    category: 'portrait',
    packageSlug: 'ai-image-prompt-examples',
    commercialIntent:
      'Seedream portrait prompt example for editorial profile images, personal branding and commercial creator portraits.',
    promptPreview:
      'Seedream portrait prompt with adult subject, soft directional key light, natural skin texture, neutral studio background and editorial composition.',
    tags: ['seedream', 'seedream-prompts', 'ai-portrait', 'portrait']
  },
  {
    title: 'Seedream Editorial Portrait Prompt',
    slug: 'seedream-editorial-portrait-prompt',
    locale: 'en-US',
    model: 'seedream-5-lite',
    category: 'portrait',
    packageSlug: 'ai-image-prompt-examples',
    commercialIntent:
      'Seedream portrait prompt example for editorial profile images, personal branding and commercial creator portraits.',
    promptPreview:
      'Seedream portrait prompt with adult subject, soft directional key light, natural skin texture, neutral studio background and editorial composition.',
    tags: ['seedream', 'seedream-prompts', 'ai-portrait', 'portrait']
  },
  {
    title: 'Seedream 护肤品主图 Prompt 案例',
    slug: 'zh-seedream-skincare-product-prompt',
    locale: 'zh-CN',
    model: 'seedream-5-lite',
    category: 'ecommerce',
    packageSlug: 'ecommerce-product-photo',
    commercialIntent:
      'Seedream product photography prompt example for skincare hero shots and ecommerce visual testing.',
    promptPreview:
      'Seedream product prompt with skincare jar, serum bottle, acrylic blocks, warm morning light, water droplets and premium ecommerce composition.',
    tags: ['seedream', 'seedream-prompts', 'product-images', 'ecommerce']
  },
  {
    title: 'Seedream Skincare Product Prompt',
    slug: 'seedream-skincare-product-prompt',
    locale: 'en-US',
    model: 'seedream-5-lite',
    category: 'ecommerce',
    packageSlug: 'ecommerce-product-photo',
    commercialIntent:
      'Seedream product photography prompt example for skincare hero shots and ecommerce visual testing.',
    promptPreview:
      'Seedream product prompt with skincare jar, serum bottle, acrylic blocks, warm morning light, water droplets and premium ecommerce composition.',
    tags: ['seedream', 'seedream-prompts', 'product-images', 'ecommerce']
  },
  {
    title: 'Flux 材质光影 Prompt 案例',
    slug: 'zh-flux-material-lighting-prompt',
    locale: 'zh-CN',
    model: 'flux',
    category: 'ecommerce',
    packageSlug: 'ai-image-prompt-examples',
    commercialIntent:
      'Flux prompt example for material rendering, controlled lighting and product concept visualization.',
    promptPreview:
      'Flux prompt with ceramic speaker object, brushed metal accents, dark stone surface, caustic reflections and precise material control.',
    tags: ['flux', 'flux-prompts', 'product-images', 'material-study']
  },
  {
    title: 'Flux Material Lighting Prompt',
    slug: 'flux-material-lighting-prompt',
    locale: 'en-US',
    model: 'flux',
    category: 'ecommerce',
    packageSlug: 'ai-image-prompt-examples',
    commercialIntent:
      'Flux prompt example for material rendering, controlled lighting and product concept visualization.',
    promptPreview:
      'Flux prompt with ceramic speaker object, brushed metal accents, dark stone surface, caustic reflections and precise material control.',
    tags: ['flux', 'flux-prompts', 'product-images', 'material-study']
  }
];

function toText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function getTags(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .map((tag) => (typeof tag === 'string' ? tag.trim() : ''))
        .filter(Boolean)
    : [];
}

function normalizeText(value: unknown): string {
  return toText(value).toLowerCase();
}

export function compactSeoToken(value: unknown): string {
  return normalizeText(value).replace(/[^a-z0-9]+/g, '');
}

function compactMany(values: string[]): string[] {
  return values.map(compactSeoToken).filter(Boolean);
}

function getCaseSearchText(caseItem: PromptSeoCaseLike): string {
  return [
    toText(caseItem.title),
    toText(caseItem.title_zh),
    toText(caseItem.titleZh),
    toText(caseItem.title_en),
    toText(caseItem.titleEn),
    toText(caseItem.prompt),
    toText(caseItem.prompt_zh),
    toText(caseItem.promptZh),
    toText(caseItem.prompt_en),
    toText(caseItem.promptEn),
    toText(caseItem.model),
    toText(caseItem.category),
    toText(caseItem.package_slug),
    toText(caseItem.packageSlug),
    toText(caseItem.commercial_intent),
    toText(caseItem.commercial_intent_zh),
    toText(caseItem.commercialIntentZh),
    toText(caseItem.commercial_intent_en),
    toText(caseItem.commercialIntentEn),
    toText(caseItem.commercialIntent),
    toText(caseItem.prompt_preview),
    toText(caseItem.prompt_preview_zh),
    toText(caseItem.promptPreviewZh),
    toText(caseItem.prompt_preview_en),
    toText(caseItem.promptPreviewEn),
    toText(caseItem.promptPreview),
    ...getTags(caseItem.tags)
  ]
    .join(' ')
    .toLowerCase();
}

function getCaseContentSearchText(caseItem: PromptSeoCaseLike): string {
  return [
    toText(caseItem.title),
    toText(caseItem.title_zh),
    toText(caseItem.titleZh),
    toText(caseItem.title_en),
    toText(caseItem.titleEn),
    toText(caseItem.prompt),
    toText(caseItem.prompt_zh),
    toText(caseItem.promptZh),
    toText(caseItem.prompt_en),
    toText(caseItem.promptEn),
    toText(caseItem.commercial_intent),
    toText(caseItem.commercial_intent_zh),
    toText(caseItem.commercialIntentZh),
    toText(caseItem.commercial_intent_en),
    toText(caseItem.commercialIntentEn),
    toText(caseItem.commercialIntent),
    toText(caseItem.prompt_preview),
    toText(caseItem.prompt_preview_zh),
    toText(caseItem.promptPreviewZh),
    toText(caseItem.prompt_preview_en),
    toText(caseItem.promptPreviewEn),
    toText(caseItem.promptPreview)
  ]
    .join(' ')
    .toLowerCase();
}

function containsCjk(value: string): boolean {
  return /[\u3400-\u9fff]/.test(value);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchesSearchTerm(searchText: string, term: string): boolean {
  const normalizedTerm = term.trim().toLowerCase();
  if (!normalizedTerm) return false;
  if (containsCjk(normalizedTerm)) {
    return searchText.includes(normalizedTerm);
  }

  const phrasePattern = escapeRegExp(normalizedTerm).replace(
    /\s+/g,
    '[\\s_-]+'
  );
  return new RegExp(`(^|[^a-z0-9])${phrasePattern}([^a-z0-9]|$)`, 'i').test(
    searchText
  );
}

function matchesAnySearchTerm(searchText: string, terms: string[]): boolean {
  return terms.some((term) => matchesSearchTerm(searchText, term));
}

function matchesAnyCompact(value: unknown, candidates: string[]): boolean {
  const normalizedValue = compactSeoToken(value);
  return Boolean(
    normalizedValue && compactMany(candidates).includes(normalizedValue)
  );
}

export function getPromptSeoModelAliases(slug: string): string[] {
  return MODEL_ALIASES[normalizeText(slug)] || [];
}

export function getPromptSeoModelSlugs(): string[] {
  return Object.keys(MODEL_ALIASES);
}

export function hasPromptSeoModelMatcher(slug: string | undefined): boolean {
  return Boolean(slug && getPromptSeoModelAliases(slug).length > 0);
}

export function hasPromptSeoCategoryMatcher(slug: string | undefined): boolean {
  return Boolean(slug && CATEGORY_MATCHERS[normalizeText(slug)]);
}

export function getPromptSeoCategoryAliases(slug: string): string[] {
  const matcher = CATEGORY_MATCHERS[normalizeText(slug)];
  if (!matcher) return [];
  return [slug, ...matcher.legacyCategories, ...matcher.tags];
}

export function getPromptSeoCategorySlugs(): string[] {
  return Object.keys(CATEGORY_MATCHERS);
}

export function promptSeoCaseMatches(
  caseItem: PromptSeoCaseLike,
  kind: PromptSeoPageKind,
  slug: string
): boolean {
  if (kind === 'package') {
    return (
      matchesAnyCompact(caseItem.package_slug, [slug]) ||
      matchesAnyCompact(caseItem.packageSlug, [slug]) ||
      getTags(caseItem.tags).some((tag) => matchesAnyCompact(tag, [slug]))
    );
  }

  if (kind === 'model') {
    const aliases = getPromptSeoModelAliases(slug);
    if (!aliases.length) return matchesAnyCompact(caseItem.model, [slug]);
    const searchText = compactSeoToken(getCaseSearchText(caseItem));
    return (
      matchesAnyCompact(caseItem.model, aliases) ||
      getTags(caseItem.tags).some((tag) => matchesAnyCompact(tag, aliases)) ||
      compactMany(aliases).some((alias) => searchText.includes(alias))
    );
  }

  const matcher = CATEGORY_MATCHERS[normalizeText(slug)];
  if (!matcher) {
    return (
      matchesAnyCompact(caseItem.category, [slug]) ||
      getTags(caseItem.tags).some((tag) => matchesAnyCompact(tag, [slug]))
    );
  }

  const searchText = getCaseContentSearchText(caseItem);
  const titleText = normalizeText(caseItem.title);
  const categoryMatches = matchesAnyCompact(caseItem.category, [
    slug,
    ...matcher.legacyCategories
  ]);
  const tagMatches = getTags(caseItem.tags).some((tag) =>
    matchesAnyCompact(tag, [slug, ...matcher.tags])
  );
  if (
    normalizeText(slug) === 'ui-infographic' &&
    !categoryMatches &&
    !tagMatches &&
    !matchesAnySearchTerm(titleText, UI_INFOGRAPHIC_TITLE_ALLOW_TERMS)
  ) {
    return false;
  }
  if (
    normalizeText(slug) === 'ui-infographic' &&
    !matchesAnySearchTerm(titleText, UI_INFOGRAPHIC_TITLE_ALLOW_TERMS) &&
    matchesAnySearchTerm(titleText, UI_INFOGRAPHIC_TITLE_BLOCK_TERMS)
  ) {
    return false;
  }
  return (
    categoryMatches ||
    tagMatches ||
    matcher.terms.some((term) => matchesSearchTerm(searchText, term))
  );
}

export function getPromptSeoPublicCases(params: {
  kind: PromptSeoPageKind;
  slug: string;
  locale?: 'zh-CN' | 'en-US';
  limit?: number;
}): PromptSeoPublicCase[] {
  const limit = Math.max(1, params.limit || 4);
  const localeMatches = PROMPT_SEO_PUBLIC_CASES.filter(
    (caseItem) =>
      (!params.locale || caseItem.locale === params.locale) &&
      promptSeoCaseMatches(caseItem, params.kind, params.slug)
  );
  const fallbackMatches = PROMPT_SEO_PUBLIC_CASES.filter((caseItem) =>
    promptSeoCaseMatches(caseItem, params.kind, params.slug)
  );

  return (localeMatches.length > 0 ? localeMatches : fallbackMatches).slice(
    0,
    limit
  );
}

export function getPromptSeoPublicCaseBySlug(params: {
  slug: string;
  locale: 'zh-CN' | 'en-US';
}): PromptSeoPublicCase | undefined {
  const slug = params.slug.trim();
  if (!slug) return undefined;
  return PROMPT_SEO_PUBLIC_CASES.find(
    (caseItem) => caseItem.locale === params.locale && caseItem.slug === slug
  );
}

export function getPromptSeoStaticLibraryCases(params: {
  locale: 'zh-CN' | 'en-US';
  limit?: number;
}): PromptSeoPublicCase[] {
  const limit = Math.max(1, params.limit || 12);
  return PROMPT_SEO_PUBLIC_CASES.filter(
    (caseItem) => caseItem.locale === params.locale
  ).slice(0, limit);
}
