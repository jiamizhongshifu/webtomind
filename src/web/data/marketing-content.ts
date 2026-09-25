import {
  PINDOU_COLOR_CHART_ROWS,
  PINDOU_COLOR_CHART_SYSTEMS
} from '../../shared/pindou-color-chart-data';

export interface LocalizedText {
  zh: string;
  en: string;
}

export interface ShowcaseSkill {
  id: string;
  name: LocalizedText;
  description: LocalizedText;
  category: LocalizedText;
  badge: string;
}

export interface UseCaseItem {
  id: string;
  slug: string;
  category: LocalizedText;
  coverImage: string;
  title: LocalizedText;
  summary: LocalizedText;
  action: LocalizedText;
  href: string;
}

export interface MarketingCtaLink {
  label: LocalizedText;
  href: LocalizedText;
  variant?: 'primary' | 'secondary';
}

export interface UseCaseTutorial {
  id: string;
  slug: string;
  category: LocalizedText;
  coverImage: string;
  title: LocalizedText;
  summary: LocalizedText;
  audience: LocalizedText;
  duration: LocalizedText;
  difficulty: LocalizedText;
  steps: LocalizedText[];
  outcomes: LocalizedText[];
  ctaLinks?: MarketingCtaLink[];
}

export interface BlogPostItem {
  id: string;
  slug: string;
  coverImage: string;
  title: LocalizedText;
  excerpt: LocalizedText;
  tag: LocalizedText;
  date: string;
  readTime: LocalizedText;
  author: LocalizedText;
  keywords: LocalizedText[];
  content: LocalizedText[];
  colorChart?: {
    systems: string[];
    rows: Array<{ hex: string; codes: string[] }>;
  };
  ctaLinks?: MarketingCtaLink[];
}

export interface UpdateItem {
  id: string;
  version: string;
  date: string;
  title: LocalizedText;
  highlights: LocalizedText[];
}

function createCoverDataUrl(
  title: string,
  subtitle: string,
  start: string,
  end: string
): string {
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="720" viewBox="0 0 1200 720">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${start}" />
      <stop offset="100%" stop-color="${end}" />
    </linearGradient>
  </defs>
  <rect width="1200" height="720" fill="url(#bg)" />
  <circle cx="1020" cy="110" r="220" fill="rgba(255,255,255,0.10)" />
  <circle cx="180" cy="620" r="260" fill="rgba(255,255,255,0.08)" />
  <text x="76" y="320" fill="white" font-family="Arial, sans-serif" font-size="72" font-weight="700">${title}</text>
  <text x="76" y="392" fill="rgba(255,255,255,0.88)" font-family="Arial, sans-serif" font-size="34">${subtitle}</text>
</svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

export const MARKETING_COVERS = {
  useCaseCreator: createCoverDataUrl(
    'Creator Workflow',
    'From trend to publish-ready post',
    '#1e293b',
    '#0ea5e9'
  ),
  useCaseVideo: createCoverDataUrl(
    'Video Script',
    'Convert long video to short script',
    '#0f766e',
    '#22c55e'
  ),
  useCaseNewsletter: createCoverDataUrl(
    'Weekly Brief',
    'Research signals into weekly report',
    '#312e81',
    '#6366f1'
  ),
  useCaseImageToPrompt: createCoverDataUrl(
    'Image To Prompt',
    'Reference images into reusable prompts',
    '#164e63',
    '#22d3ee'
  ),
  useCaseWechat: createCoverDataUrl(
    'Publish Check',
    'Preflight review for WeChat article',
    '#92400e',
    '#f59e0b'
  ),
  useCasePodcast: createCoverDataUrl(
    'Podcast Notes',
    'Turn long audio into issue-ready article',
    '#0f172a',
    '#14b8a6'
  ),
  useCaseRepurpose: createCoverDataUrl(
    'Multi-Channel',
    'Repurpose one draft for 3 channels',
    '#1e1b4b',
    '#2563eb'
  ),
  useCaseProduct: createCoverDataUrl(
    'Product Visuals',
    'AI product image generation workflow',
    '#064e3b',
    '#22c55e'
  ),
  useCaseCharacter: createCoverDataUrl(
    'Character System',
    'Consistent AI character images',
    '#581c87',
    '#a855f7'
  ),
  useCasePromptLibrary: createCoverDataUrl(
    'Prompt Assets',
    'Reusable visual prompt library',
    '#7f1d1d',
    '#fb7185'
  ),
  useCaseHistory: createCoverDataUrl(
    'Re-Edit Loop',
    'Turn every output into a reusable recipe',
    '#172554',
    '#38bdf8'
  ),
  blogSop: createCoverDataUrl(
    'AI Workflow SOP',
    'Stabilize production with process design',
    '#1d4ed8',
    '#38bdf8'
  ),
  blogBlock: createCoverDataUrl(
    'Creative Block',
    'Fix process bottlenecks before writing',
    '#7c3aed',
    '#c084fc'
  ),
  blogLibrary: createCoverDataUrl(
    'Material Library',
    'Build reusable knowledge assets',
    '#0f766e',
    '#34d399'
  ),
  blogMetrics: createCoverDataUrl(
    'Content Metrics',
    'Track performance without vanity noise',
    '#065f46',
    '#10b981'
  ),
  blogChannel: createCoverDataUrl(
    'Channel Fit',
    'Adapt one idea to each platform',
    '#7f1d1d',
    '#f97316'
  ),
  blogCalendar: createCoverDataUrl(
    'Editorial Calendar',
    'Ship weekly cadence with less pressure',
    '#1f2937',
    '#4f46e5'
  ),
  blogPortraitSeo: createCoverDataUrl(
    'AI Portrait Prompt',
    'Reusable portrait prompt workflow',
    '#4c1d95',
    '#c084fc'
  ),
  blogProductSeo: createCoverDataUrl(
    'AI Product Image',
    'Product photo generation system',
    '#14532d',
    '#4ade80'
  ),
  blogRedSeo: createCoverDataUrl(
    'RED Cover AI',
    'Xiaohongshu cover image workflow',
    '#881337',
    '#fb7185'
  ),
  blogCharacterSeo: createCoverDataUrl(
    'Consistent Character',
    'Stable character image generation',
    '#1e3a8a',
    '#60a5fa'
  ),
  blogHistorySeo: createCoverDataUrl(
    'Re-Edit Images',
    'Regenerate from image history',
    '#0f172a',
    '#2dd4bf'
  ),
  blogAiCard: createCoverDataUrl(
    'AI Budget Card',
    'Control AI tool spending',
    '#111827',
    '#22c55e'
  ),
  useCaseCreditBudget: createCoverDataUrl(
    'AI Credit Budget',
    'Plan AI creation costs',
    '#0f172a',
    '#38bdf8'
  ),
  useCaseSpacexai: createCoverDataUrl(
    'spacexai Brief',
    'Turn AI news intent into prompts',
    '#111827',
    '#06b6d4'
  ),
  useCaseAgentHarness: createCoverDataUrl(
    'Agent Harness',
    'Turn agent news into workflows',
    '#0f172a',
    '#8b5cf6'
  ),
  beadPetPortrait: createCoverDataUrl(
    'Bead Pet Portrait',
    'Pet photo into printable chart',
    '#7c2d12',
    '#fb923c'
  ),
  beadAnimeFanart: createCoverDataUrl(
    'Bead Anime',
    'Fan-art into bead chart',
    '#4c1d95',
    '#c084fc'
  ),
  beadKidsCraft: createCoverDataUrl(
    'Bead Kids Craft',
    'Beginner charts for classrooms',
    '#065f46',
    '#34d399'
  ),
  beadPixelArt: createCoverDataUrl(
    'Bead Pixel Art',
    'Sprites into bead grids',
    '#0f172a',
    '#38bdf8'
  ),
  beadBeginnerGuide: createCoverDataUrl(
    'Bead Beginner Guide',
    'First printable chart in 10 minutes',
    '#374151',
    '#f59e0b'
  ),
  beadIroningGuide: createCoverDataUrl(
    'Bead Ironing Guide',
    'Medium heat, even circles, cool flat',
    '#7c2d12',
    '#ef4444'
  ),
  beadMardChart: createCoverDataUrl(
    'MARD Color Chart',
    '291 bead colors, one material list',
    '#0f172a',
    '#a855f7'
  ),
  beadPrintingGuide: createCoverDataUrl(
    'Bead Printing Guide',
    '300 DPI, A4 pages, blueprint tips',
    '#1e3a8a',
    '#38bdf8'
  ),
  beadSizeGuide: createCoverDataUrl(
    'Bead Size Guide',
    '5mm vs 2.6mm for every project',
    '#7c2d12',
    '#fbbf24'
  ),
  fallback: createCoverDataUrl(
    'WebToMind',
    'AI image creation workflow',
    '#334155',
    '#64748b'
  )
};

export const SKILLS_SHOWCASE: ShowcaseSkill[] = [
  {
    id: 'dan-koe',
    name: { zh: 'Dan Koe风格配图', en: 'Dan Koe Style Visuals' },
    description: {
      zh: '将输入内容转为高识别度视觉提示词，适配文章封面与社媒图。',
      en: 'Turn your input into high-signal visual prompts for covers and social creatives.'
    },
    category: { zh: '图片', en: 'Image' },
    badge: '个人'
  },
  {
    id: 'xiaohongshu',
    name: { zh: '小红书生成', en: 'Xiaohongshu Generator' },
    description: {
      zh: '围绕热点素材快速生成标题、结构和正文草稿，降低起稿成本。',
      en: 'Generate title, structure and draft quickly from trends and source materials.'
    },
    category: { zh: '写作', en: 'Writing' },
    badge: '个人'
  },
  {
    id: 'minimal-lines',
    name: { zh: '极简线条', en: 'Minimal Line Art' },
    description: {
      zh: '将复杂概念提炼为简洁线稿风格，适合解释型内容配图。',
      en: 'Convert complex ideas into clean line-art prompts for explanatory visuals.'
    },
    category: { zh: '图片', en: 'Image' },
    badge: '个人'
  },
  {
    id: 'cover-3x4',
    name: { zh: '3:4封面', en: '3:4 Cover Builder' },
    description: {
      zh: '自动适配 3:4 比例封面构图，提升发布平台的一致性和点击率。',
      en: 'Build platform-ready 3:4 covers with consistent composition and style.'
    },
    category: { zh: '图片', en: 'Image' },
    badge: '个人'
  },
  {
    id: 'ui-reverse',
    name: { zh: 'Ui逆向工程', en: 'UI Reverse Engineering' },
    description: {
      zh: '输入截图即可输出界面结构拆解与可复用设计语言。',
      en: 'Extract structure and reusable design language from UI screenshots.'
    },
    category: { zh: '学习', en: 'Learning' },
    badge: '个人'
  },
  {
    id: 'academic-assistant',
    name: { zh: '学术论文深度解读助手', en: 'Academic Paper Deep Reader' },
    description: {
      zh: '快速提炼论文核心结论、方法和实验，输出可读笔记框架。',
      en: 'Summarize thesis, methods and results into concise and readable notes.'
    },
    category: { zh: '学习', en: 'Learning' },
    badge: '已安装'
  },
  {
    id: 'web3-report',
    name: { zh: 'Web3 研究情报聚合', en: 'Web3 Research Aggregator' },
    description: {
      zh: '按研究框架聚合链上与宏观信号，形成结构化日报和周报。',
      en: 'Aggregate on-chain and macro signals into structured daily and weekly briefs.'
    },
    category: { zh: '学习', en: 'Learning' },
    badge: '探索'
  },
  {
    id: 'mindmap',
    name: { zh: '一键思维导图', en: 'Instant Mind Map' },
    description: {
      zh: '将文章、视频、播客内容拆成可视化逻辑树，快速抓住主线。',
      en: 'Transform long-form content into visual logic trees for faster understanding.'
    },
    category: { zh: '学习', en: 'Learning' },
    badge: '探索'
  }
];

export const USE_CASES: UseCaseItem[] = [
  {
    id: 'visual-portrait',
    slug: 'reproducible-portrait-shoot',
    category: { zh: '精选', en: 'Featured' },
    coverImage: MARKETING_COVERS.useCaseCreator,
    title: {
      zh: '可复现的东方女性写真创作',
      en: 'Reproducible Asian portrait photo shoot'
    },
    summary: {
      zh: '从角色、姿态、服装、镜头、写真风格 5 个 slot 起手，组合出杂志感人像并保存为可复用模板。',
      en: 'Start with 5 slots (character / pose / wardrobe / lens / style) to compose magazine-quality portraits, saveable as reusable templates.'
    },
    action: { zh: '进入创作台', en: 'Open Studio' },
    href: '/create'
  },
  {
    id: 'visual-cover',
    slug: 'cover-image-pipeline',
    category: { zh: '配图', en: 'Cover Design' },
    coverImage: MARKETING_COVERS.useCaseCreator,
    title: {
      zh: '公众号 / 视频封面批量产出',
      en: 'Batch cover images for WeChat / video'
    },
    summary: {
      zh: '用项目级指令统一品牌调性,9 个视觉模板一键跳转,自动应用主视觉风格。',
      en: 'Lock brand tone via project instructions; jump from 9 visual templates and auto-apply your main visual style.'
    },
    action: { zh: '进入创作台', en: 'Open Studio' },
    href: '/create'
  },
  {
    id: 'visual-reverse',
    slug: 'reverse-engineer-references',
    category: { zh: '反推', en: 'Reverse Engineering' },
    coverImage: MARKETING_COVERS.useCaseNewsletter,
    title: {
      zh: '参考图一键反推提示词',
      en: 'One-click reverse from any reference image'
    },
    summary: {
      zh: '上传任意女性写真参考图,AI 自动按 slot 拆分出可复用素材,中英双语 prompt 一次到位。',
      en: 'Upload any portrait reference; AI auto-splits it into reusable per-slot assets with bilingual prompts in one pass.'
    },
    action: { zh: '上传反推', en: 'Upload & Reverse' },
    href: '/create'
  },
  {
    id: 'visual-image-to-prompt',
    slug: 'image-to-prompt-generator-workflow',
    category: { zh: '图片转 Prompt', en: 'Image to Prompt' },
    coverImage: MARKETING_COVERS.useCaseImageToPrompt,
    title: {
      zh: 'Image to Prompt Generator 工作流',
      en: 'Image to Prompt Generator workflow'
    },
    summary: {
      zh: '把参考图拆成主体、构图、镜头、光影和风格约束，再转成可复用的 AI image prompt。',
      en: 'Break a reference image into subject, composition, lens, lighting and style constraints, then turn it into a reusable AI image prompt.'
    },
    action: { zh: '生成 Prompt', en: 'Generate Prompt' },
    href: '/create?source=usecase_image_to_prompt'
  },
  {
    id: 'visual-ai-prompt-examples',
    slug: 'ai-image-prompt-examples-guide',
    category: { zh: 'AI Prompt 案例', en: 'AI Prompt Examples' },
    coverImage: MARKETING_COVERS.useCasePromptLibrary,
    title: {
      zh: 'AI 图片提示词案例指南',
      en: 'AI Image Prompt Examples Guide'
    },
    summary: {
      zh: '用主体、场景、构图、镜头、光影、材质、风格和约束拆解可复用的 AI image prompt examples。',
      en: 'Break reusable AI image prompt examples into subject, scene, composition, lens, lighting, material, style and constraints.'
    },
    action: { zh: '查看案例', en: 'View Examples' },
    href: '/en-US/prompts'
  },
  {
    id: 'visual-ai-credit-budget',
    slug: 'ai-tool-credit-budget',
    category: { zh: '积分预算', en: 'Credit Budget' },
    coverImage: MARKETING_COVERS.useCaseCreditBudget,
    title: {
      zh: 'AI 工具积分预算',
      en: 'AI Tool Credit Budget'
    },
    summary: {
      zh: '把 AI 专属卡的限额思路转成可执行的 AI 图片生成积分预算，控制模型、尺寸、参考图和重复试错成本。',
      en: 'Turn the AI dedicated card idea into an actionable credit budget for AI image generation across models, sizes, references and retries.'
    },
    action: { zh: '查看预算方法', en: 'Plan Budget' },
    href: '/blog/ai-tool-credit-budget'
  },
  {
    id: 'trend-spacexai-workflow',
    slug: 'spacexai-ai-workflow-guide',
    category: { zh: '热点研究', en: 'Trend Research' },
    coverImage: MARKETING_COVERS.useCaseSpacexai,
    title: {
      zh: 'spacexai 是什么？SpaceXAI AI 工作流指南',
      en: 'What is spacexai? SpaceXAI AI workflow guide'
    },
    summary: {
      zh: '面向搜索 spacexai、SpaceXAI、SpaceX AI、xAI 和 Grok 的用户，把热点检索意图转成事实核查、资料归档、提示词和视觉创作工作流。',
      en: 'For searches around spacexai, SpaceXAI, SpaceX AI, xAI and Grok, turn hot-topic intent into fact-checking, research notes, prompts and visual workflows.'
    },
    action: { zh: '查看工作流', en: 'View Workflow' },
    href: '/blog/spacexai-ai-workflow-guide'
  },
  {
    id: 'trend-deepseek-harness-workflow',
    slug: 'deepseek-harness-agent-workflow-guide',
    category: { zh: '热点研究', en: 'Trend Research' },
    coverImage: MARKETING_COVERS.useCaseAgentHarness,
    title: {
      zh: 'DeepSeek Harness 是什么？Agent 工作流指南',
      en: 'What is DeepSeek Harness? AI agent workflow guide'
    },
    summary: {
      zh: 'DeepSeek Harness 已上线开发者预览：npm 包 @deepseek-ai/dsh + GitHub 仓库。面向相关关键词搜索，把热点意图转成事实核查、下载指引和 Agent 时代创作工作流。',
      en: 'DeepSeek Harness is live as a developer preview: npm @deepseek-ai/dsh plus the GitHub repo. For related keyword searches, turn hot-topic intent into fact-checking, download guidance and agent-era creation workflows.'
    },
    action: { zh: '查看工作流', en: 'View Workflow' },
    href: '/blog/deepseek-harness-agent-workflow-guide'
  },
  {
    id: 'visual-gpt-image-2-structure',
    slug: 'gpt-image-2-prompt-structure',
    category: { zh: 'GPT Image 2', en: 'GPT Image 2' },
    coverImage: MARKETING_COVERS.useCaseProduct,
    title: {
      zh: 'GPT Image 2 提示词结构指南',
      en: 'GPT Image 2 Prompt Structure'
    },
    summary: {
      zh: '用主体、意图、场景、镜头、光影、风格、材质和约束写出稳定的 GPT Image 2 prompts。',
      en: 'Write reliable GPT Image 2 prompts with subject, intent, scene, camera, lighting, style, material and constraints.'
    },
    action: { zh: '学习结构', en: 'Learn Structure' },
    href: '/gpt-image-2-prompts'
  },
  {
    id: 'visual-mona-lisa-1-structure',
    slug: 'mona-lisa-1-openai-image-model-guide',
    category: { zh: 'mona-lisa-1', en: 'mona-lisa-1' },
    coverImage: MARKETING_COVERS.useCaseProduct,
    title: {
      zh: 'mona-lisa-1 提示词指南：OpenAI 新图像模型',
      en: 'mona-lisa-1 Prompts Guide: OpenAI New Image Model'
    },
    summary: {
      zh: 'mona-lisa-1 已通过 SynthID 水印确认来自 OpenAI，官方尚未官宣。用可迁移的 slot 结构准备好 prompt，等正式发布直接复用。',
      en: 'mona-lisa-1 is verified as OpenAI output via the SynthID watermark, with no official announcement yet. Prepare portable slot prompts and reuse them once it launches.'
    },
    action: { zh: '查看案例', en: 'View Examples' },
    href: '/mona-lisa-1-prompts'
  },
  {
    id: 'visual-product-photography-prompts',
    slug: 'ai-product-photography-prompts-guide',
    category: { zh: '商品摄影 Prompt', en: 'Product Prompts' },
    coverImage: MARKETING_COVERS.useCaseProduct,
    title: {
      zh: 'AI 商品摄影提示词指南',
      en: 'AI Product Photography Prompts Guide'
    },
    summary: {
      zh: '为电商主图、PDP 横幅、场景图和社媒广告编写可复用的 AI product photography prompts。',
      en: 'Write reusable AI product photography prompts for ecommerce hero images, PDP banners, lifestyle scenes and social ads.'
    },
    action: { zh: '生成商品图', en: 'Generate Product Images' },
    href: '/product-photography-prompts'
  },
  {
    id: 'visual-xiaohongshu',
    slug: 'xiaohongshu-cover-series',
    category: { zh: '小红书', en: 'RED / Xiaohongshu' },
    coverImage: MARKETING_COVERS.useCaseWechat,
    title: {
      zh: '小红书 9:16 封面系列产出',
      en: '9:16 Xiaohongshu cover series'
    },
    summary: {
      zh: '锁定写真风格 + 镜头 + 妆容 slot 后,只换姿态和场景,批量产出统一调性的封面图。',
      en: 'Lock photo style + lens + makeup slots; swap only pose and scene to batch-produce on-brand covers.'
    },
    action: { zh: '进入创作台', en: 'Open Studio' },
    href: '/create'
  },
  {
    id: 'visual-asset-library',
    slug: 'personal-asset-library',
    category: { zh: '个人库', en: 'Personal Library' },
    coverImage: MARKETING_COVERS.useCasePodcast,
    title: {
      zh: '构建自己的私有素材库',
      en: 'Build your private prompt asset library'
    },
    summary: {
      zh: '上传作品当素材,一键 AI 重生缩略图,统一风格;素材可编辑、删除、按 slot 子分类筛选。',
      en: 'Upload past works as assets, one-click AI thumbnail regen for consistent look. Editable, deletable, filterable by sub-category.'
    },
    action: { zh: '查看素材库', en: 'Open Library' },
    href: '/create'
  },
  {
    id: 'visual-reedit',
    slug: 'history-reedit-loop',
    category: { zh: '迭代', en: 'Iteration' },
    coverImage: MARKETING_COVERS.useCaseRepurpose,
    title: {
      zh: '历史作品一键重新编辑',
      en: 'Re-edit any past output in one click'
    },
    summary: {
      zh: '点开任意历史图片预览,一键回到当时的 slot 组合 + prompt + 模型参数,继续微调再出图。',
      en: 'Click any past image; jump back to the exact slot combo, prompt and model settings to fine-tune and regenerate.'
    },
    action: { zh: '查看历史', en: 'View History' },
    href: '/create'
  },
  {
    id: 'visual-product',
    slug: 'ai-product-image-generation',
    category: { zh: '电商图', en: 'Product Images' },
    coverImage: MARKETING_COVERS.useCaseProduct,
    title: {
      zh: 'AI 商品图与场景海报生成',
      en: 'AI product image and scene poster generation'
    },
    summary: {
      zh: '把产品主体、模特姿态、背景场景、光影和版式拆成 slot,快速生成电商主图、KV 和社媒海报。',
      en: 'Split product subject, model pose, background, lighting and layout into slots to generate ecommerce hero images, KVs and social posters.'
    },
    action: { zh: '生成商品图', en: 'Generate Product Images' },
    href: '/create'
  },
  {
    id: 'visual-character',
    slug: 'consistent-ai-character-images',
    category: { zh: '角色一致性', en: 'Character Consistency' },
    coverImage: MARKETING_COVERS.useCaseCharacter,
    title: {
      zh: '稳定角色形象的 AI 连续出图',
      en: 'Consistent AI character images for visual series'
    },
    summary: {
      zh: '固定角色脸型、发型、妆容和镜头,只替换表情、姿态、服装或场景,做出统一角色系列图。',
      en: 'Lock face, hair, makeup and lens; swap expression, pose, wardrobe or scene to produce a consistent character image series.'
    },
    action: { zh: '创建角色系列', en: 'Create Character Series' },
    href: '/create'
  },
  {
    id: 'visual-prompt-library',
    slug: 'ai-prompt-asset-library',
    category: { zh: 'Prompt 库', en: 'Prompt Library' },
    coverImage: MARKETING_COVERS.useCasePromptLibrary,
    title: {
      zh: '把好 prompt 沉淀成可复用素材库',
      en: 'Turn good prompts into a reusable AI prompt asset library'
    },
    summary: {
      zh: '把成功出图里的角色、服装、镜头、风格拆成私有素材,团队后续直接组合,减少从零写 prompt。',
      en: 'Save successful character, wardrobe, lens and style prompts as private assets so teams can recombine them instead of writing from scratch.'
    },
    action: { zh: '沉淀 Prompt', en: 'Build Prompt Library' },
    href: '/create'
  },
  {
    id: 'visual-history-seo',
    slug: 'regenerate-ai-images-from-history',
    category: { zh: '历史重编', en: 'History Re-Edit' },
    coverImage: MARKETING_COVERS.useCaseHistory,
    title: {
      zh: '从历史图片继续重编和再生成',
      en: 'Regenerate AI images from previous history'
    },
    summary: {
      zh: '历史作品不只是图库,还能恢复当时的 prompt、slot 和模型参数,继续微调表情、背景或构图。',
      en: 'Image history is not just a gallery: restore the prompt, slots and model settings, then continue tuning expression, background or composition.'
    },
    action: { zh: '继续重编', en: 'Re-Edit From History' },
    href: '/create'
  }
];

export const USE_CASE_TUTORIALS: UseCaseTutorial[] = [
  {
    id: 'visual-portrait-tutorial',
    slug: 'reproducible-portrait-shoot',
    category: { zh: 'AI 写真', en: 'AI Portrait' },
    coverImage: MARKETING_COVERS.useCaseCreator,
    title: {
      zh: '如何生成可复现的 AI 女性写真',
      en: 'How to generate reproducible AI portrait images'
    },
    summary: {
      zh: '用角色、姿态、服装、镜头和写真风格 slot 搭建稳定的人像出图流程。',
      en: 'Use character, pose, wardrobe, lens and photo-style slots to build a stable portrait generation workflow.'
    },
    audience: {
      zh: 'AI 写真创作者、摄影灵感团队',
      en: 'AI portrait creators and photo concept teams'
    },
    duration: { zh: '10 分钟', en: '10 min' },
    difficulty: { zh: '初级', en: 'Beginner' },
    steps: [
      {
        zh: '先选择角色、脸型、妆容和发型素材,锁定人物基础识别度。',
        en: 'Pick character, face, makeup and hair assets first to lock identity.'
      },
      {
        zh: '再组合姿态、服装、镜头和写真风格,让 prompt 结构稳定可复现。',
        en: 'Combine pose, wardrobe, lens and photo-style slots so the prompt stays reproducible.'
      },
      {
        zh: '保存成功组合为模板,后续只替换表情或场景做系列图。',
        en: 'Save the successful combo as a template, then swap expression or scene for a series.'
      }
    ],
    outcomes: [
      {
        zh: '得到一组可重复生成的人像提示词模板。',
        en: 'Get a reusable portrait prompt template.'
      },
      {
        zh: '减少每次从零写 prompt 导致的人物漂移。',
        en: 'Reduce character drift caused by rewriting prompts from scratch.'
      }
    ]
  },
  {
    id: 'visual-cover-tutorial',
    slug: 'cover-image-pipeline',
    category: { zh: 'AI 封面', en: 'AI Cover Design' },
    coverImage: MARKETING_COVERS.useCaseCreator,
    title: {
      zh: '公众号和视频封面的 AI 批量出图流程',
      en: 'AI cover image workflow for WeChat and video thumbnails'
    },
    summary: {
      zh: '用版式、主视觉、场景和镜头 slot 做统一风格的封面图批量生成。',
      en: 'Use layout, key visual, scene and lens slots to batch-generate consistent cover images.'
    },
    audience: {
      zh: '内容团队、封面设计师、短视频运营',
      en: 'Content teams, cover designers and video operators'
    },
    duration: { zh: '12 分钟', en: '12 min' },
    difficulty: { zh: '初级', en: 'Beginner' },
    steps: [
      {
        zh: '固定封面比例、版式和品牌色,避免每张图风格不一致。',
        en: 'Lock ratio, layout and brand color to avoid inconsistent visuals.'
      },
      {
        zh: '选择角色、场景、镜头和风格素材,生成第一批候选封面。',
        en: 'Choose character, scene, lens and style assets to generate the first cover batch.'
      },
      {
        zh: '把表现好的组合保存为模板,下次只换主题和文案方向。',
        en: 'Save winning combos as templates and only swap topic and copy direction next time.'
      }
    ],
    outcomes: [
      {
        zh: '批量得到统一调性的公众号封面、视频封面和社媒海报。',
        en: 'Batch-produce consistent WeChat covers, video thumbnails and social posters.'
      },
      {
        zh: '把封面从临时设计变成可复用工作流。',
        en: 'Turn cover design from ad-hoc work into a reusable workflow.'
      }
    ]
  },
  {
    id: 'visual-reverse-tutorial',
    slug: 'reverse-engineer-references',
    category: { zh: '参考图反推', en: 'Reference Reverse' },
    coverImage: MARKETING_COVERS.useCaseNewsletter,
    title: {
      zh: '参考图反推 AI 提示词的正确做法',
      en: 'How to reverse-engineer prompts from reference images'
    },
    summary: {
      zh: '上传参考图后按 slot 拆出角色、姿态、服装、镜头和风格,让灵感可复用。',
      en: 'Upload a reference image and split it into character, pose, wardrobe, lens and style assets.'
    },
    audience: {
      zh: 'Prompt 工程师、AI 视觉创作者',
      en: 'Prompt engineers and AI visual creators'
    },
    duration: { zh: '8 分钟', en: '8 min' },
    difficulty: { zh: '初级', en: 'Beginner' },
    steps: [
      {
        zh: '上传参考图,让 AI 识别可复用的视觉 slot,而不是生成一整段不可控描述。',
        en: 'Upload a reference and let AI identify reusable visual slots instead of one uncontrolled paragraph.'
      },
      {
        zh: '检查每条素材是否只描述自己的维度,例如只写服装或只写镜头。',
        en: 'Check that each asset describes only one dimension, such as wardrobe or lens.'
      },
      {
        zh: '把高质量素材存入私有库,后续与其他角色、场景和版式混搭。',
        en: 'Save high-quality assets to your private library for future mixing.'
      }
    ],
    outcomes: [
      {
        zh: '把 Pinterest、小红书或作品集里的灵感转成可执行 prompt 资产。',
        en: 'Turn inspiration from Pinterest, RED or portfolios into executable prompt assets.'
      },
      {
        zh: '提升参考图复刻、风格迁移和系列出图的可控性。',
        en: 'Improve control for reference recreation, style transfer and image series.'
      }
    ]
  },
  {
    id: 'visual-image-to-prompt-generator-tutorial',
    slug: 'image-to-prompt-generator-workflow',
    category: { zh: '图片转 Prompt', en: 'Image to Prompt' },
    coverImage: MARKETING_COVERS.useCaseImageToPrompt,
    title: {
      zh: 'Image to Prompt Generator:从参考图生成可复用提示词',
      en: 'Image to Prompt Generator: create reusable prompts from reference images'
    },
    summary: {
      zh: '用参考图提取主体、构图、镜头、光影、材质和风格约束，再编译成适合 GPT Image 2、Flux、Seedream 或 Nano Banana 的 AI image prompt。',
      en: 'Extract subject, composition, lens, lighting, material and style constraints from a reference image, then compile them into AI image prompts for GPT Image 2, Flux, Seedream or Nano Banana.'
    },
    audience: {
      zh: '需要从参考图复刻风格的创作者、营销团队和商品图运营',
      en: 'Creators, marketing teams and product-image operators who need reusable prompts from references'
    },
    duration: { zh: '12 分钟', en: '12 min' },
    difficulty: { zh: '初级', en: 'Beginner' },
    steps: [
      {
        zh: '先上传或选择参考图,只提取可迁移信息:主体结构、构图、镜头、光影、材质和风格,不要直接复制无关细节。',
        en: 'Upload or choose a reference image, then extract only transferable information: subject structure, composition, lens, lighting, material and style instead of copying irrelevant details.'
      },
      {
        zh: '把提取结果改写成 slot:主体、场景、镜头、光影、材质、风格、负面约束和模型偏好。',
        en: 'Rewrite the extraction into slots: subject, scene, lens, lighting, material, style, negative constraints and model preference.'
      },
      {
        zh: '在 WebToMind 创作台生成第一版图片,保存成功 prompt 和图片结果,后续只替换主体或场景做系列图。',
        en: 'Generate the first image in the WebToMind studio, save the successful prompt and result, then swap only subject or scene for future series.'
      },
      {
        zh: '按目标模型微调提示词结构: GPT Image 2 更重视清晰约束,Flux 更重视材质和光影,Seedream 更适合商业场景描述。',
        en: 'Tune the prompt structure for the target model: GPT Image 2 rewards clear constraints, Flux benefits from material and lighting control, and Seedream works well with commercial scene briefs.'
      },
      {
        zh: '把成功版本回链到 AI image prompt generator 和 prompt 案例库,形成可复用的 reference image to prompt 工作流。',
        en: 'Link the winning version back to the AI image prompt generator and prompt library to build a reusable reference image to prompt workflow.'
      }
    ],
    outcomes: [
      {
        zh: '得到一套可复用的 image to prompt 模板,适合商品图、人像写真、角色设定和社媒海报。',
        en: 'Get a reusable image-to-prompt template for product photos, portraits, character designs and social posters.'
      },
      {
        zh: '让参考图复刻从“凭感觉描述”变成可追踪、可修改、可再次生成的工作流。',
        en: 'Turn reference recreation from guesswork into a traceable, editable and repeatable workflow.'
      }
    ]
  },
  {
    id: 'visual-ai-prompt-examples-tutorial',
    slug: 'ai-image-prompt-examples-guide',
    category: { zh: 'AI Prompt 案例', en: 'AI Prompt Examples' },
    coverImage: MARKETING_COVERS.useCasePromptLibrary,
    title: {
      zh: 'AI 图片提示词案例指南',
      en: 'AI Image Prompt Examples Guide'
    },
    summary: {
      zh: '用主体、场景、构图、镜头、光影、材质、风格和约束拆解可复用的 AI image prompt examples。',
      en: 'Break reusable AI image prompt examples into subject, scene, composition, lens, lighting, material, style and constraints.'
    },
    audience: {
      zh: '需要可复制案例的 AI 图片创作者、营销团队和内容运营',
      en: 'AI image creators, marketing teams and content operators who need copyable examples'
    },
    duration: { zh: '12 分钟', en: '12 min' },
    difficulty: { zh: '初级', en: 'Beginner' },
    steps: [
      {
        zh: '先明确图片用途,例如商品图、海报、人像、角色设定或社媒封面。',
        en: 'Start with the output use case, such as product photo, poster, portrait, character design or social cover.'
      },
      {
        zh: '把提示词拆成主体、场景、构图、镜头、光影、材质、风格和负面约束。',
        en: 'Split the prompt into subject, scene, composition, lens, lighting, material, style and negative constraints.'
      },
      {
        zh: '从 WebToMind AI image prompts 案例库选择一个相近案例,只替换一个核心变量。',
        en: 'Pick a close example from the WebToMind AI image prompts library and replace only one core variable.'
      },
      {
        zh: '为 GPT Image 2、Nano Banana、Flux 或 Seedream 保留模型相关关键词,避免通用 prompt 失去控制。',
        en: 'Keep model-specific keywords for GPT Image 2, Nano Banana, Flux or Seedream so generic prompts do not lose control.'
      },
      {
        zh: '保存表现好的 prompt 与图片结果,后续沉淀为团队可复用案例。',
        en: 'Save the best prompt and image result, then turn it into a reusable team example.'
      }
    ],
    outcomes: [
      {
        zh: '获得可直接改写的 AI image prompt examples 结构。',
        en: 'Get a reusable structure for adapting AI image prompt examples.'
      },
      {
        zh: '把免费案例流量导向 AI image prompts 案例库和创作台。',
        en: 'Route free example traffic toward the AI image prompts library and studio.'
      }
    ]
  },
  {
    id: 'visual-ai-credit-budget-tutorial',
    slug: 'ai-tool-credit-budget',
    category: { zh: '积分预算', en: 'Credit Budget' },
    coverImage: MARKETING_COVERS.useCaseCreditBudget,
    title: {
      zh: 'AI 工具积分预算：如何控制 AI 图片生成成本',
      en: 'AI tool credit budget: control AI image generation costs'
    },
    summary: {
      zh: '从 AI 专属卡、Full access 权益和 Agent 授权消费趋势切入，明确这不是微信官方申请入口，WebToMind 不提供微信支付 AI 专属卡，而是用积分、成本预估、历史复用和会员套餐管理 AI 创作预算。',
      en: 'Use AI dedicated cards and Full access membership as signals for controlled agent spending, not as an official application path for any payment card; WebToMind manages AI creation budgets with credits, estimates, history reuse and plans.'
    },
    audience: {
      zh: '关注 AI 专属卡、AI 工具消费、图片生成积分和团队预算管理的创作者',
      en: 'Creators tracking AI dedicated cards, AI tool spending, image generation credits and team budgets'
    },
    duration: { zh: '10 分钟', en: '10 min' },
    difficulty: { zh: '初级', en: 'Beginner' },
    steps: [
      {
        zh: '先确认每次 AI 图片生成的真实成本:模型、尺寸、参考图、数量和失败退还规则。',
        en: 'Start by checking the real cost of each AI image task: model, size, reference image, count and refund behavior.'
      },
      {
        zh: '把 AI 专属卡理解为“授权和限额”概念,而不是微信官方申请入口、办理入口,也不是把 AI 工具当成无限消费入口。',
        en: 'Treat AI dedicated cards as an authorization and spending-limit concept, not as an official application path or permission for every AI tool to spend without controls.'
      },
      {
        zh: '在 WebToMind 创作台生成前查看积分预估,把 GPT Image 2、Nano Banana、Flux 和 Seedream 的成本差异写进任务决策。',
        en: 'Review credit estimates before generating in WebToMind, and include GPT Image 2, Nano Banana, Flux and Seedream cost differences in task decisions.'
      },
      {
        zh: '复用历史图片、prompt 案例和参考图反推结果,减少重复试错造成的积分浪费。',
        en: 'Reuse image history, prompt cases and reference-to-prompt results to reduce repeated trial-and-error credit waste.'
      },
      {
        zh: '用会员 Full access、积分包和充值页设定月度 AI 创作预算,再通过 source 参数追踪热点流量是否转化。',
        en: 'Use Full access membership, credit packages and recharge pages to set a monthly AI creation budget, then track hot-topic traffic with source parameters.'
      }
    ],
    outcomes: [
      {
        zh: '把 AI 专属卡热点流量转成可执行的 AI 创作预算管理需求。',
        en: 'Turn AI dedicated card interest into an actionable AI creation budget workflow.'
      },
      {
        zh: '用 /zh-CN/create?source=seo_ai_zhuanshu_card、/zh-CN/pricing?source=seo_ai_zhuanshu_card 和 /zh-CN/recharge?source=seo_ai_zhuanshu_card 追踪转化。',
        en: 'Track conversion with /en-US/create?source=seo_ai_zhuanshu_card, /en-US/pricing?source=seo_ai_zhuanshu_card and /en-US/recharge?source=seo_ai_zhuanshu_card.'
      }
    ],
    ctaLinks: [
      {
        label: {
          zh: '了解 AI 专属卡热点',
          en: 'Read the AI dedicated card explainer'
        },
        href: {
          zh: '/zh-CN/blog/ai-zhuanshu-card',
          en: '/en-US/blog/ai-zhuanshu-card'
        },
        variant: 'secondary'
      },
      {
        label: {
          zh: '开始创作并查看积分预估',
          en: 'Start creating with cost estimates'
        },
        href: {
          zh: '/zh-CN/create?source=seo_ai_tool_credit_budget_usecase_create',
          en: '/en-US/create?source=seo_ai_tool_credit_budget_usecase_create'
        },
        variant: 'primary'
      },
      {
        label: { zh: '查看套餐与积分', en: 'View plans and credits' },
        href: {
          zh: '/zh-CN/pricing?source=seo_ai_tool_credit_budget_usecase_pricing&returnTo=%2Fzh-CN%2Fblog%2Fai-tool-credit-budget',
          en: '/en-US/pricing?source=seo_ai_tool_credit_budget_usecase_pricing&returnTo=%2Fen-US%2Fblog%2Fai-tool-credit-budget'
        },
        variant: 'secondary'
      },
      {
        label: { zh: '充值积分包', en: 'Recharge credits' },
        href: {
          zh: '/zh-CN/recharge?source=seo_ai_tool_credit_budget_usecase_recharge&returnTo=%2Fzh-CN%2Fblog%2Fai-tool-credit-budget',
          en: '/en-US/recharge?source=seo_ai_tool_credit_budget_usecase_recharge&returnTo=%2Fen-US%2Fblog%2Fai-tool-credit-budget'
        },
        variant: 'secondary'
      }
    ]
  },
  {
    id: 'trend-spacexai-workflow-tutorial',
    slug: 'spacexai-ai-workflow-guide',
    category: { zh: '热点研究', en: 'Trend Research' },
    coverImage: MARKETING_COVERS.useCaseSpacexai,
    title: {
      zh: 'spacexai 是什么？SpaceXAI AI 工作流指南',
      en: 'What is spacexai? SpaceXAI keyword and AI workflow guide'
    },
    summary: {
      zh: '当用户搜索 spacexai、SpaceXAI、SpaceX AI、xAI、Grok 或轨道 AI 算力时，WebToMind 帮你把零散新闻意图整理成可复用的资料卡、事实核查清单、提示词模板和视觉创作 brief。WebToMind 与 SpaceXAI、SpaceX、xAI 或 Grok 无关联。',
      en: 'When people search spacexai, SpaceXAI, SpaceX AI, xAI, Grok or orbital AI compute, WebToMind helps turn scattered news intent into reusable research cards, fact-checking lists, prompt templates and visual briefs. WebToMind is not affiliated with SpaceXAI, SpaceX, xAI or Grok.'
    },
    audience: {
      zh: 'AI 研究者、SEO 编辑、热点内容创作者和视觉创意团队',
      en: 'AI researchers, SEO editors, trend creators and visual creative teams'
    },
    duration: { zh: '15 分钟', en: '15 min' },
    difficulty: { zh: '初级', en: 'Beginner' },
    steps: [
      {
        zh: '先把 spacexai、SpaceXAI、SpaceX AI、xAI、Grok、Colossus、orbital compute 等变体列成关键词组，区分官方信息、媒体报道和社媒猜测。',
        en: 'Start by grouping variants such as spacexai, SpaceXAI, SpaceX AI, xAI, Grok, Colossus and orbital compute, then separate official sources, reporting and social speculation.'
      },
      {
        zh: '为每条资料保留来源、发布日期、原文链接和不确定点，避免把尚未确认的 SpaceXAI 传闻写成事实。',
        en: 'Keep source, publish date, original link and uncertainty notes for each item so unconfirmed SpaceXAI rumors do not become facts.'
      },
      {
        zh: '把搜索意图拆成解释型、时间线型、投资/商业型、技术型和视觉创作型，再分别生成标题、摘要和 prompt brief。',
        en: 'Split intent into explainer, timeline, business, technical and visual-creation angles, then generate titles, summaries and prompt briefs for each.'
      },
      {
        zh: '用 WebToMind 将资料卡转成 AI image prompt、短视频脚本、博客大纲或社媒视觉 brief，并保留“非官方、无关联”的品牌边界说明。',
        en: 'Use WebToMind to turn research cards into AI image prompts, short-video scripts, blog outlines or social visual briefs while keeping the non-affiliation disclaimer visible.'
      },
      {
        zh: '把表现好的 spacexai 研究模板保存为可复用案例，后续只替换新来源、新发布日期和新问题。',
        en: 'Save the best spacexai research template as a reusable case, then swap in new sources, publish dates and questions later.'
      }
    ],
    outcomes: [
      {
        zh: '获得一套承接 spacexai 长尾关键词的中立解释页和内容生产流程。',
        en: 'Get a neutral explainer and content workflow for capturing the spacexai long-tail keyword.'
      },
      {
        zh: '把热点搜索流量导向 WebToMind 的 prompt 案例库、创作台和资料复用工作流。',
        en: 'Route hot-topic search traffic toward the WebToMind prompt library, studio and reusable research workflow.'
      }
    ],
    ctaLinks: [
      {
        label: {
          zh: '进入创意工作台整理选题',
          en: 'Open Creative Workspace'
        },
        href: {
          zh: '/zh-CN/create?source=seo_spacexai_usecase_create',
          en: '/en-US/create?source=seo_spacexai_usecase_create'
        },
        variant: 'primary'
      },
      {
        label: { zh: '浏览 AI Prompt 案例', en: 'Browse AI prompt examples' },
        href: {
          zh: '/zh-CN/prompts?source=seo_spacexai_usecase_prompts',
          en: '/en-US/prompts?source=seo_spacexai_usecase_prompts'
        },
        variant: 'secondary'
      }
    ]
  },
  {
    id: 'trend-deepseek-harness-workflow-tutorial',
    slug: 'deepseek-harness-agent-workflow-guide',
    category: { zh: '热点研究', en: 'Trend Research' },
    coverImage: MARKETING_COVERS.useCaseAgentHarness,
    title: {
      zh: 'DeepSeek Harness 是什么？Agent 与代码智能体工作流指南',
      en: 'What is DeepSeek Harness? AI agent workflow guide'
    },
    summary: {
      zh: '当用户搜索 DeepSeek Harness、DeepSeek Code Harness、DeepSeek Agent 和 Model+Harness=Agent 时，WebToMind 帮你把热点检索意图整理成上线事实、下载方式、关键词组和 Agent 时代创作工作流。WebToMind 与 DeepSeek 无关联。',
      en: 'When people search DeepSeek Harness, DeepSeek Code Harness, DeepSeek Agent and Model + Harness = Agent, WebToMind helps turn hot-topic intent into verified launch facts, download steps, keyword groups and agent-era creation workflows. WebToMind is not affiliated with DeepSeek.'
    },
    audience: {
      zh: 'AI 研究者、SEO 编辑、开发者内容创作者和关注智能体赛道的团队',
      en: 'AI researchers, SEO editors, developer-focused creators and agent-curious teams'
    },
    duration: { zh: '15 分钟', en: '15 min' },
    difficulty: { zh: '初级', en: 'Beginner' },
    steps: [
      {
        zh: '先核查事实：2026 年 8 月 13 日 DeepSeek 官方上线 GitHub 仓库 deepseek-ai/deepseek-harness 与 npm 包 @deepseek-ai/dsh（0.1.0-rc.6，开发者预览）；官方招聘定义 Model+Harness=Agent；5 月组建 Harness 团队，8 月初开放内测征集。',
        en: 'Verify the facts first: on August 13, 2026 DeepSeek officially launched the GitHub repo deepseek-ai/deepseek-harness and the npm package @deepseek-ai/dsh (0.1.0-rc.6, developer preview); official recruiting defines Model + Harness = Agent; the team formed in May and internal testing sign-ups opened in early August.'
      },
      {
        zh: '把关键词组成组：deepseek harness、deepseek harness 是什么、deepseek code harness、deepseek agent、model + harness = agent、deepseek 智能体、deepseek v4 pro，再区分官方信息、媒体报道和社区猜测。',
        en: 'Group the keyword set: deepseek harness, what is deepseek harness, deepseek code harness, deepseek agent, model + harness = agent, deepseek agent framework and deepseek v4 pro, then separate official sources, reporting and community speculation.'
      },
      {
        zh: '拆搜索意图：解释型（Harness 是什么）、动态型（公众号/上线/发布）、对比型（vs Claude Code、OpenAI Codex）、工具型（怎么下载、怎么用）和创作型（Agent 时代的提示词与内容生产）。',
        en: 'Split intent into explainer, news, comparison (vs Claude Code and OpenAI Codex), tooling (how to install and use) and creation angles, then produce titles, summaries and prompt briefs for each.'
      },
      {
        zh: '用 WebToMind 承接 Agent 时代工作流：把新闻、代码片段、提示词模板和任务反馈沉淀成可复用素材，用 slot 化结构管理 Agent 任务描述，避免每次都从空白开始。',
        en: 'Use WebToMind to run agent-era workflows: archive news, code snippets, prompt templates and task feedback as reusable assets, and manage agent task descriptions with a slot structure instead of starting blank every time.'
      },
      {
        zh: '保存表现好的研究模板为案例，后续只替换新来源、新日期和新问题，并始终保留“非官方、无关联”的品牌边界说明。',
        en: 'Save winning research templates as reusable cases, swap in new sources, dates and questions later, and keep the non-affiliation disclaimer visible.'
      }
    ],
    outcomes: [
      {
        zh: '获得一套承接 DeepSeek Harness 长尾关键词的中立解释页和内容生产流程。',
        en: 'Get a neutral explainer and content workflow for capturing the DeepSeek Harness long-tail keyword.'
      },
      {
        zh: '把热点搜索流量导向 WebToMind 的博客聚合页、Prompt 案例库和创作台。',
        en: 'Route hot-topic search traffic toward the WebToMind blog hub, prompt library and studio.'
      }
    ],
    ctaLinks: [
      {
        label: {
          zh: '进入创意工作台整理选题',
          en: 'Open Creative Workspace'
        },
        href: {
          zh: '/zh-CN/create?source=seo_deepseek_harness_usecase_create',
          en: '/en-US/create?source=seo_deepseek_harness_usecase_create'
        },
        variant: 'primary'
      },
      {
        label: { zh: '浏览 AI Prompt 案例', en: 'Browse AI prompt examples' },
        href: {
          zh: '/zh-CN/prompts?source=seo_deepseek_harness_usecase_prompts',
          en: '/en-US/prompts?source=seo_deepseek_harness_usecase_prompts'
        },
        variant: 'secondary'
      },
      {
        label: {
          zh: '下载 dsh（npm）',
          en: 'Install dsh (npm)'
        },
        href: {
          zh: 'https://www.npmjs.com/package/@deepseek-ai/dsh',
          en: 'https://www.npmjs.com/package/@deepseek-ai/dsh'
        },
        variant: 'secondary'
      },
      {
        label: {
          zh: 'GitHub 官方仓库（中文文档）',
          en: 'Official GitHub repo (docs)'
        },
        href: {
          zh: 'https://github.com/deepseek-ai/deepseek-harness/blob/master/README.zh.md',
          en: 'https://github.com/deepseek-ai/deepseek-harness/blob/master/README.zh.md'
        },
        variant: 'secondary'
      }
    ]
  },
  {
    id: 'visual-gpt-image-2-structure-tutorial',
    slug: 'gpt-image-2-prompt-structure',
    category: { zh: 'GPT Image 2', en: 'GPT Image 2' },
    coverImage: MARKETING_COVERS.useCaseProduct,
    title: {
      zh: 'GPT Image 2 提示词结构指南',
      en: 'GPT Image 2 Prompt Structure'
    },
    summary: {
      zh: '用主体、意图、场景、镜头、光影、风格、材质和约束写出稳定的 GPT Image 2 prompts。',
      en: 'Write reliable GPT Image 2 prompts with subject, intent, scene, camera, lighting, style, material and constraints.'
    },
    audience: {
      zh: '正在搜索 GPT Image 2 prompts、free GPT Image 2 prompts 和提示词结构的创作者',
      en: 'Creators searching for GPT Image 2 prompts, free GPT Image 2 prompts and prompt structure'
    },
    duration: { zh: '15 分钟', en: '15 min' },
    difficulty: { zh: '初级', en: 'Beginner' },
    steps: [
      {
        zh: '先写清楚生成目标和商业用途,例如电商主图、人物头像、广告 KV 或角色设定。',
        en: 'Define the generation goal and business use, such as ecommerce hero, founder portrait, ad KV or character concept.'
      },
      {
        zh: '用固定公式组织 prompt:主体、场景、镜头、光影、材质、风格、构图、限制。',
        en: 'Use a stable formula: subject, scene, camera, lighting, material, style, composition and constraints.'
      },
      {
        zh: '把不想出现的内容写成清晰限制,例如不要 logo、不要可读文字、不要水印。',
        en: 'Write unwanted elements as clear constraints, such as no logos, no readable text and no watermarks.'
      },
      {
        zh: '把表现好的 GPT Image 2 prompt 存成案例,再为不同产品或角色替换主体。',
        en: 'Save strong GPT Image 2 prompts as cases, then swap the subject for different products or characters.'
      },
      {
        zh: '把 prompt 详情页回链到 GPT Image 2 prompts 专题和 AI image prompt generator。',
        en: 'Link prompt detail pages back to the GPT Image 2 prompts topic and the AI image prompt generator.'
      }
    ],
    outcomes: [
      {
        zh: '得到一套稳定的 GPT Image 2 prompt 写法。',
        en: 'Get a stable GPT Image 2 prompt writing structure.'
      },
      {
        zh: '让 GPT Image 2 流量自然回流到模型专题和创作台。',
        en: 'Route GPT Image 2 search traffic back to the model topic page and studio.'
      }
    ]
  },
  {
    id: 'visual-product-photography-prompts-tutorial',
    slug: 'ai-product-photography-prompts-guide',
    category: { zh: '商品摄影 Prompt', en: 'Product Prompts' },
    coverImage: MARKETING_COVERS.useCaseProduct,
    title: {
      zh: 'AI 商品摄影提示词指南',
      en: 'AI Product Photography Prompts Guide'
    },
    summary: {
      zh: '为电商主图、PDP 横幅、场景图和社媒广告编写可复用的 AI product photography prompts。',
      en: 'Write reusable AI product photography prompts for ecommerce hero images, PDP banners, lifestyle scenes and social ads.'
    },
    audience: {
      zh: '电商运营、独立品牌、商品图设计师和广告素材团队',
      en: 'Ecommerce operators, indie brands, product image designers and ad creative teams'
    },
    duration: { zh: '16 分钟', en: '16 min' },
    difficulty: { zh: '中级', en: 'Intermediate' },
    steps: [
      {
        zh: '先锁定商品类型、材质、形状、卖点和画面用途,避免 AI 把产品改形。',
        en: 'Lock product type, material, shape, selling point and output use before AI changes the product.'
      },
      {
        zh: '选择产品摄影光型,例如柔光箱、轮廓光、自然窗光、高级棚拍或生活方式场景光。',
        en: 'Choose a product photography lighting recipe, such as softbox, rim light, natural window light, premium studio or lifestyle scene light.'
      },
      {
        zh: '控制背景和道具:服务产品卖点,但不要制造品牌混淆或假标签。',
        en: 'Control background and props so they support the product benefit without brand confusion or fake labels.'
      },
      {
        zh: '为 PDP、广告、社媒和邮件分别保留不同构图版本。',
        en: 'Keep separate composition variants for PDP, ads, social posts and email creatives.'
      },
      {
        zh: '把成功的商品图 prompt 回链到 product photography prompts 专题和 image to prompt generator。',
        en: 'Link successful product prompts back to the product photography prompts topic and the image to prompt generator.'
      }
    ],
    outcomes: [
      {
        zh: '得到适合商品主图、PDP、广告和社媒的 prompt 结构。',
        en: 'Get prompt structures for product hero images, PDP assets, ads and social posts.'
      },
      {
        zh: '把高商业意图关键词流量导向商品摄影专题和创作台。',
        en: 'Route high-commercial-intent keyword traffic to the product photography topic and studio.'
      }
    ]
  },
  {
    id: 'visual-red-tutorial',
    slug: 'xiaohongshu-cover-series',
    category: { zh: '小红书封面', en: 'RED Cover' },
    coverImage: MARKETING_COVERS.useCaseWechat,
    title: {
      zh: '小红书 9:16 AI 封面系列怎么做',
      en: 'How to make 9:16 Xiaohongshu cover image series with AI'
    },
    summary: {
      zh: '固定写真风格和镜头,只换姿态、背景和主题,快速做统一调性的封面系列。',
      en: 'Lock photo style and lens, then swap pose, background and topic for consistent RED covers.'
    },
    audience: {
      zh: '小红书博主、品牌内容运营',
      en: 'RED creators and brand content operators'
    },
    duration: { zh: '15 分钟', en: '15 min' },
    difficulty: { zh: '初级', en: 'Beginner' },
    steps: [
      {
        zh: '选择 9:16 竖图构图,确定封面主体和留白区域。',
        en: 'Choose a 9:16 vertical composition and define subject and whitespace.'
      },
      {
        zh: '锁定镜头、光影和风格 slot,让系列封面视觉一致。',
        en: 'Lock lens, lighting and style slots for consistent cover visuals.'
      },
      {
        zh: '批量替换场景和姿态,生成多张可 A/B 测试的封面。',
        en: 'Batch-swap scenes and poses to generate cover options for A/B testing.'
      }
    ],
    outcomes: [
      {
        zh: '得到更稳定的小红书封面图生产流程。',
        en: 'Get a more stable RED cover image production workflow.'
      },
      {
        zh: '提升封面系列一致性,减少重复调 prompt 时间。',
        en: 'Improve cover consistency and reduce repeated prompt tuning.'
      }
    ]
  },
  {
    id: 'visual-asset-library-tutorial',
    slug: 'personal-asset-library',
    category: { zh: '素材库', en: 'Asset Library' },
    coverImage: MARKETING_COVERS.useCasePodcast,
    title: {
      zh: '如何搭建个人 AI 图片 Prompt 素材库',
      en: 'How to build a personal AI image prompt asset library'
    },
    summary: {
      zh: '把角色、服装、镜头、风格和版式拆成长期可复用的私有素材。',
      en: 'Turn characters, wardrobe, lenses, styles and layouts into long-term reusable private assets.'
    },
    audience: {
      zh: '高频 AI 图片创作者、设计团队',
      en: 'High-frequency AI image creators and design teams'
    },
    duration: { zh: '20 分钟', en: '20 min' },
    difficulty: { zh: '中级', en: 'Intermediate' },
    steps: [
      {
        zh: '按 slot 建立素材分类,不要把所有 prompt 混在一个文件夹里。',
        en: 'Organize assets by slot instead of mixing all prompts in one folder.'
      },
      {
        zh: '上传成功作品或参考图,用 AI 反推生成可编辑素材。',
        en: 'Upload successful outputs or references and reverse them into editable assets.'
      },
      {
        zh: '定期删除低质量素材,保留可稳定复现的组合。',
        en: 'Prune low-quality assets and keep combinations that reproduce reliably.'
      }
    ],
    outcomes: [
      {
        zh: '形成自己的 AI 图片生成知识库和素材复用系统。',
        en: 'Build your own AI image generation knowledge base and reuse system.'
      },
      {
        zh: '团队成员能共享高质量 prompt,减少重复试错。',
        en: 'Team members can share high-quality prompts and reduce duplicate trial-and-error.'
      }
    ]
  },
  {
    id: 'visual-reedit-tutorial',
    slug: 'history-reedit-loop',
    category: { zh: '历史重编', en: 'History Re-Edit' },
    coverImage: MARKETING_COVERS.useCaseRepurpose,
    title: {
      zh: '如何从历史 AI 图片继续编辑和再生成',
      en: 'How to re-edit and regenerate AI images from history'
    },
    summary: {
      zh: '从历史作品恢复 slot、prompt 和模型参数,继续微调表情、背景、构图或风格。',
      en: 'Restore slots, prompt and model settings from history, then tune expression, background, composition or style.'
    },
    audience: {
      zh: '需要反复改稿的创作者和商业设计团队',
      en: 'Creators and commercial design teams with frequent revisions'
    },
    duration: { zh: '6 分钟', en: '6 min' },
    difficulty: { zh: '初级', en: 'Beginner' },
    steps: [
      {
        zh: '打开历史图库,选择接近目标效果的一张图片。',
        en: 'Open image history and choose an output close to your target.'
      },
      {
        zh: '恢复当时的 slot 组合、prompt 和模型参数,不要重新手写。',
        en: 'Restore the exact slots, prompt and model settings instead of rewriting.'
      },
      {
        zh: '只修改一个变量,例如表情、背景或镜头,再重新生成。',
        en: 'Change one variable, such as expression, background or lens, then regenerate.'
      }
    ],
    outcomes: [
      {
        zh: '改稿时保留原图优点,避免每次重新开始。',
        en: 'Keep what worked in the original image instead of starting over.'
      },
      {
        zh: '让 AI 图片历史成为可复用的创作配方库。',
        en: 'Turn image history into a reusable recipe library.'
      }
    ]
  },
  {
    id: 'visual-product-tutorial',
    slug: 'ai-product-image-generation',
    category: { zh: '电商图', en: 'Product Images' },
    coverImage: MARKETING_COVERS.useCaseProduct,
    title: {
      zh: 'AI 商品图生成:从产品主体到场景海报',
      en: 'AI product image generation from subject to scene poster'
    },
    summary: {
      zh: '把商品主体、模特、场景、光影和版式拆开控制,快速生成电商图。',
      en: 'Control product subject, model, scene, lighting and layout separately to generate ecommerce visuals.'
    },
    audience: {
      zh: '电商运营、独立品牌、产品设计团队',
      en: 'Ecommerce operators, indie brands and product design teams'
    },
    duration: { zh: '18 分钟', en: '18 min' },
    difficulty: { zh: '中级', en: 'Intermediate' },
    steps: [
      {
        zh: '先固定商品主体描述和材质关键词,保证产品不漂移。',
        en: 'Lock product subject and material keywords first to reduce drift.'
      },
      {
        zh: '再选择场景、光影、镜头和版式,生成不同营销场景图。',
        en: 'Select scene, lighting, lens and layout to create different marketing visuals.'
      },
      {
        zh: '把表现好的商品图 prompt 存成模板,用于后续 SKU 复用。',
        en: 'Save winning product prompts as templates for future SKU reuse.'
      }
    ],
    outcomes: [
      {
        zh: '更快产出商品主图、场景图、KV 和社媒海报。',
        en: 'Produce product hero images, scene shots, KVs and social posters faster.'
      },
      {
        zh: '降低每个 SKU 单独试 prompt 的成本。',
        en: 'Reduce prompt experimentation cost for each SKU.'
      }
    ]
  },
  {
    id: 'visual-character-consistency-tutorial',
    slug: 'consistent-ai-character-images',
    category: { zh: '角色一致性', en: 'Character Consistency' },
    coverImage: MARKETING_COVERS.useCaseCharacter,
    title: {
      zh: '稳定角色一致性的 AI 图片工作流',
      en: 'AI image workflow for consistent character generation'
    },
    summary: {
      zh: '通过固定角色核心 slot,批量生成表情、姿态和场景变化。',
      en: 'Lock core character slots and batch-generate expression, pose and scene variations.'
    },
    audience: {
      zh: 'IP 角色创作者、游戏概念设计、漫画分镜团队',
      en: 'IP creators, game concept artists and comic storyboard teams'
    },
    duration: { zh: '16 分钟', en: '16 min' },
    difficulty: { zh: '中级', en: 'Intermediate' },
    steps: [
      {
        zh: '把角色核心拆成脸型、发型、妆容、服装和风格素材。',
        en: 'Split the character core into face, hair, makeup, wardrobe and style assets.'
      },
      {
        zh: '每次只改表情、姿态或场景,不要同时改所有维度。',
        en: 'Change only expression, pose or scene each time instead of every dimension.'
      },
      {
        zh: '保存稳定组合,作为角色系列图的默认配方。',
        en: 'Save stable combos as default recipes for the character series.'
      }
    ],
    outcomes: [
      {
        zh: '提高 AI 连续出图的人物一致性。',
        en: 'Improve character consistency across AI image batches.'
      },
      {
        zh: '减少角色脸变形、风格跑偏和服装混乱。',
        en: 'Reduce face drift, style drift and wardrobe confusion.'
      }
    ]
  },
  {
    id: 'visual-prompt-library-tutorial',
    slug: 'ai-prompt-asset-library',
    category: { zh: 'Prompt 库', en: 'Prompt Library' },
    coverImage: MARKETING_COVERS.useCasePromptLibrary,
    title: {
      zh: 'AI Prompt 素材库如何提升出图效率',
      en: 'How an AI prompt asset library improves image generation efficiency'
    },
    summary: {
      zh: '把好 prompt 拆成可组合资产,让团队从“重新写”变成“选择和组合”。',
      en: 'Split good prompts into composable assets so teams choose and combine instead of rewriting.'
    },
    audience: {
      zh: 'Prompt 工程团队、品牌视觉团队',
      en: 'Prompt engineering and brand visual teams'
    },
    duration: { zh: '14 分钟', en: '14 min' },
    difficulty: { zh: '初级', en: 'Beginner' },
    steps: [
      {
        zh: '从成功作品中提取角色、风格、镜头、版式等高复用片段。',
        en: 'Extract reusable character, style, lens and layout fragments from successful outputs.'
      },
      {
        zh: '给素材加上清晰分类和名称,方便搜索和组合。',
        en: 'Name and categorize assets clearly for search and recombination.'
      },
      {
        zh: '把常用组合保存成模板,作为团队默认工作流。',
        en: 'Save common combinations as templates for the team workflow.'
      }
    ],
    outcomes: [
      {
        zh: '提升 AI 图片生成速度和 prompt 复用率。',
        en: 'Increase generation speed and prompt reuse rate.'
      },
      {
        zh: '让新成员也能快速复用团队最佳 prompt。',
        en: 'Help new team members reuse the best team prompts quickly.'
      }
    ]
  },
  {
    id: 'visual-history-seo-tutorial',
    slug: 'regenerate-ai-images-from-history',
    category: { zh: '历史重编', en: 'History Re-Edit' },
    coverImage: MARKETING_COVERS.useCaseHistory,
    title: {
      zh: '如何从历史记录重新生成 AI 图片',
      en: 'How to regenerate AI images from generation history'
    },
    summary: {
      zh: '用历史记录恢复 prompt 和参数,让每一次出图都能成为下一次迭代的起点。',
      en: 'Restore prompts and parameters from history so every output can become the starting point for the next iteration.'
    },
    audience: {
      zh: '高频改稿用户、商业视觉团队',
      en: 'High-frequency revision users and commercial visual teams'
    },
    duration: { zh: '8 分钟', en: '8 min' },
    difficulty: { zh: '初级', en: 'Beginner' },
    steps: [
      {
        zh: '打开完整历史图库,按最近作品快速找到可继续编辑的图片。',
        en: 'Open the full history gallery and find a recent image worth continuing.'
      },
      {
        zh: '恢复原始 prompt、参考图、slot 组合和生成参数。',
        en: 'Restore the original prompt, references, slot combo and generation settings.'
      },
      {
        zh: '只调整一个核心变量并重新生成,保持结果可控。',
        en: 'Adjust one core variable and regenerate to keep the result controlled.'
      }
    ],
    outcomes: [
      {
        zh: '让 AI 图片修改更像版本管理,而不是反复碰运气。',
        en: 'Make AI image revision feel like versioning instead of guessing.'
      },
      {
        zh: '提升客户改稿、封面迭代和系列图生产效率。',
        en: 'Improve client revisions, cover iteration and series production.'
      }
    ]
  },
  {
    id: 'creator-workflow',
    slug: 'creator-workflow-30-min',
    category: { zh: '精选', en: 'Featured' },
    coverImage: MARKETING_COVERS.useCaseCreator,
    title: {
      zh: '从热点素材到可发布图文（30 分钟）',
      en: 'From trend source to publishable post in 30 minutes'
    },
    summary: {
      zh: '以 X 和网页素材为例，搭建可复用的采集-整理-写作-配图闭环。',
      en: 'Build a reusable capture-organize-write-visualize loop from X and web sources.'
    },
    audience: {
      zh: '面向自媒体博主与内容运营团队',
      en: 'For creators and content operations teams'
    },
    duration: { zh: '30 分钟', en: '30 min' },
    difficulty: { zh: '中级', en: 'Intermediate' },
    steps: [
      {
        zh: '采集：批量保存热点链接，标记争议点、数据点和引用来源。',
        en: 'Capture links in batch and annotate key claims, data points and citations.'
      },
      {
        zh: '整理：将素材转成结构化卡片，按选题视角分组。',
        en: 'Convert materials into structured cards and group them by story angle.'
      },
      {
        zh: '创作：先产出提纲再扩写正文，减少 AI 味和返工。',
        en: 'Draft outline first, then expand into full text to reduce rewrite cycles.'
      },
      {
        zh: '发布：统一检查标题、配图比例、引用完整性后发布。',
        en: 'Run final checks on title, cover ratio and citation integrity before publishing.'
      }
    ],
    outcomes: [
      {
        zh: '输出一篇可发布图文（含封面图、摘要、引用链接）。',
        en: 'Produce a publish-ready post with cover visual, summary and citations.'
      },
      {
        zh: '沉淀可复用的选题结构模板，下一次写作更快。',
        en: 'Create a reusable angle template to accelerate future drafting.'
      },
      {
        zh: '把散落素材转为结构化资产，便于团队协作接力。',
        en: 'Convert fragmented sources into structured assets for team handoff.'
      }
    ]
  },
  {
    id: 'video-script',
    slug: 'video-to-script-storyboard',
    category: { zh: '创作', en: 'Creation' },
    coverImage: MARKETING_COVERS.useCaseVideo,
    title: {
      zh: '视频转口播稿与分镜脚本',
      en: 'Convert video into narration and storyboard'
    },
    summary: {
      zh: '从长视频中提炼叙事主线，输出短视频可执行脚本。',
      en: 'Extract narrative backbone from long videos and output executable short-form scripts.'
    },
    audience: {
      zh: '面向短视频创作者与视频编辑',
      en: 'For short-form video creators and editors'
    },
    duration: { zh: '45 分钟', en: '45 min' },
    difficulty: { zh: '初级', en: 'Beginner' },
    steps: [
      {
        zh: '提炼主线：用一句话定义视频核心观点，明确受众。',
        en: 'Define the central claim in one sentence and lock target audience.'
      },
      {
        zh: '脚本拆分：将内容拆成开场钩子、论点段落、结尾 CTA。',
        en: 'Split into hook, argument segments and closing CTA.'
      },
      {
        zh: '分镜生成：按镜头时长映射素材、字幕和旁白节奏。',
        en: 'Map scene duration to footage, subtitles and narration pacing.'
      }
    ],
    outcomes: [
      {
        zh: '得到 60-90 秒短视频脚本与口播提词稿。',
        en: 'Get a 60-90 second script with narration-ready teleprompter copy.'
      },
      {
        zh: '输出可执行分镜清单，降低拍摄与剪辑沟通成本。',
        en: 'Generate an executable storyboard list and reduce editing handoff friction.'
      }
    ]
  },
  {
    id: 'newsletter',
    slug: 'weekly-newsletter-automation',
    category: { zh: '学习与研究', en: 'Learning & Research' },
    coverImage: MARKETING_COVERS.useCaseNewsletter,
    title: {
      zh: '每周资讯简报自动化生产',
      en: 'Build a weekly newsletter workflow'
    },
    summary: {
      zh: '多源信息聚合后自动提炼主题，稳定输出周报。',
      en: 'Aggregate multi-source signals and produce consistent weekly briefings.'
    },
    audience: {
      zh: '面向研究团队与资讯型账号',
      en: 'For research teams and information-driven accounts'
    },
    duration: { zh: '每周 60 分钟', en: '60 min weekly' },
    difficulty: { zh: '中级', en: 'Intermediate' },
    steps: [
      {
        zh: '定义主题桶：按行业、产品、监管三类建立追踪清单。',
        en: 'Create tracking buckets for industry, product and policy.'
      },
      {
        zh: '自动筛选：根据关键词和信号强度聚合本周候选素材。',
        en: 'Filter candidates by keyword relevance and signal strength.'
      },
      {
        zh: '成文发布：生成固定结构周报并保留引用源链接。',
        en: 'Generate fixed-format weekly reports with source links.'
      }
    ],
    outcomes: [
      {
        zh: '稳定输出周报并保留可追溯引用，提升可信度。',
        en: 'Ship weekly briefings with traceable sources and stronger credibility.'
      },
      {
        zh: '减少重复检索时间，把精力集中在观点提炼。',
        en: 'Spend less time searching and more time synthesizing insight.'
      }
    ]
  },
  {
    id: 'wechat-adapt',
    slug: 'wechat-publish-readiness-check',
    category: { zh: '写作', en: 'Writing' },
    coverImage: MARKETING_COVERS.useCaseWechat,
    title: {
      zh: '公众号排版发布前检查',
      en: 'Pre-publish check for WeChat article'
    },
    summary: {
      zh: '发布前统一检查结构、配图与引用，减少返工。',
      en: 'Run final checks on structure, visuals and citations before publishing.'
    },
    audience: {
      zh: '面向公众号编辑与品牌内容团队',
      en: 'For WeChat editors and brand content teams'
    },
    duration: { zh: '15 分钟', en: '15 min' },
    difficulty: { zh: '初级', en: 'Beginner' },
    steps: [
      {
        zh: '结构校验：段落层级、逻辑衔接、标题可读性检查。',
        en: 'Validate paragraph hierarchy, transitions and headline readability.'
      },
      {
        zh: '素材校验：检查图片比例、清晰度和图注。',
        en: 'Validate image ratio, clarity and captions.'
      },
      {
        zh: '合规校验：核对数据引用和来源可追溯性。',
        en: 'Verify source traceability and citation completeness.'
      }
    ],
    outcomes: [
      {
        zh: '发布前一次性发现格式和引用问题，降低返工率。',
        en: 'Catch formatting and citation issues before publish to reduce rework.'
      },
      {
        zh: '形成团队统一发布检查清单，保证内容质量稳定。',
        en: 'Standardize publish checklists for consistent editorial quality.'
      }
    ]
  },
  {
    id: 'podcast-summary',
    slug: 'podcast-to-article-sprint',
    category: { zh: '学习与研究', en: 'Learning & Research' },
    coverImage: MARKETING_COVERS.useCasePodcast,
    title: {
      zh: '播客内容提炼成周报文章',
      en: 'Turn podcast episodes into weekly article'
    },
    summary: {
      zh: '把播客中的观点、证据和案例拆成结构化卡片，快速产出周报。',
      en: 'Extract claims, evidence and examples from podcast audio into a weekly brief.'
    },
    audience: {
      zh: '面向播客创作者与行业研究账号',
      en: 'For podcast creators and research-driven content teams'
    },
    duration: { zh: '35 分钟', en: '35 min' },
    difficulty: { zh: '初级', en: 'Beginner' },
    steps: [
      {
        zh: '转录与粗筛：先标出高信息密度片段，剔除寒暄内容。',
        en: 'Transcribe and highlight high-density segments before drafting.'
      },
      {
        zh: '观点归类：按主题将片段归入结论、证据、案例三类。',
        en: 'Classify snippets into claims, evidence, and examples.'
      },
      {
        zh: '模板成文：按固定周报结构生成标题、摘要和正文。',
        en: 'Draft title, summary and body with a fixed weekly template.'
      }
    ],
    outcomes: [
      {
        zh: '得到一篇可发布周报草稿，并保留核心观点来源。',
        en: 'Ship a publish-ready briefing draft with traceable source points.'
      },
      {
        zh: '沉淀可复用的“播客转文章”模板，后续效率更高。',
        en: 'Create a reusable podcast-to-article template for future runs.'
      }
    ]
  },
  {
    id: 'multi-channel-repurpose',
    slug: 'single-draft-multi-channel-repurpose',
    category: { zh: '创作', en: 'Creation' },
    coverImage: MARKETING_COVERS.useCaseRepurpose,
    title: {
      zh: '一篇长文拆成多平台内容',
      en: 'Repurpose one long draft to multiple channels'
    },
    summary: {
      zh: '同一篇核心长文，拆成不同平台可直接发布的版本。',
      en: 'Repurpose one core long-form draft into platform-ready derivatives.'
    },
    audience: {
      zh: '面向个人创作者与品牌内容团队',
      en: 'For solo creators and brand content teams'
    },
    duration: { zh: '40 分钟', en: '40 min' },
    difficulty: { zh: '中级', en: 'Intermediate' },
    steps: [
      {
        zh: '提炼母稿骨架：明确一个主观点与三个支持论点。',
        en: 'Lock one main claim and three support points from the source draft.'
      },
      {
        zh: '匹配渠道规则：按平台字数、语气和结构要求重写。',
        en: 'Rewrite by platform constraints: tone, format and length.'
      },
      {
        zh: '统一校验：核对关键信息一致性，避免跨平台表达冲突。',
        en: 'Run consistency checks to avoid cross-channel messaging conflicts.'
      }
    ],
    outcomes: [
      {
        zh: '一次写作可产出 3 种渠道内容，减少重复投入。',
        en: 'Produce three channel variants from one writing cycle.'
      },
      {
        zh: '形成跨平台内容矩阵，保持品牌表达一致。',
        en: 'Build a multi-channel content matrix with consistent brand voice.'
      }
    ]
  },
  {
    id: 'bead-pet-portrait',
    slug: 'bead-pattern-pet-portrait',
    category: { zh: '拼豆图纸', en: 'Bead Pattern' },
    coverImage: MARKETING_COVERS.beadPetPortrait,
    title: {
      zh: '拼豆宠物肖像图纸怎么做',
      en: 'How to make a bead pattern from a pet photo'
    },
    summary: {
      zh: '把宠物照片转成拼豆肖像图纸：选色板、控制珠子宽度、清理背景，生成可打印图纸与材料清单。',
      en: 'Turn a pet photo into a printable bead portrait with palette matching, grid control, background cleanup and a material list.'
    },
    audience: { zh: '宠物家长、拼豆新手', en: 'Pet owners and bead beginners' },
    duration: { zh: '8 分钟', en: '8 min' },
    difficulty: { zh: '初级', en: 'Beginner' },
    steps: [
      {
        zh: '选一张主体清晰、背景简单的宠物照片，上传到拼豆图案生成器。',
        en: 'Upload a clear pet photo with a simple background to the bead pattern maker.'
      },
      {
        zh: '选择品牌色板（如 MARD 291 色）并把宽度珠子数设在 50-100，开启主色模式保留毛发细节。',
        en: 'Pick a brand palette like MARD 291 and set the width to 50-100 beads with dominant-color pixelation.'
      },
      {
        zh: '背景复杂时开启自动去背景，再用画笔和连通擦除清理杂色。',
        en: 'Turn on background removal for busy photos, then clean noise with the paint and erase tools.'
      },
      {
        zh: '下载带色号和坐标的 PNG 图纸，按材料清单采购珠子。',
        en: 'Download the PNG chart with color codes and coordinates, then buy beads from the material list.'
      }
    ],
    outcomes: [
      {
        zh: '得到一张可直接打印的宠物拼豆肖像图纸。',
        en: 'Get a printable bead portrait chart of your pet.'
      },
      {
        zh: '材料清单按色号列出，采购一次到位。',
        en: 'Buy beads in one pass with the color-coded material list.'
      }
    ],
    ctaLinks: [
      {
        label: { zh: '打开拼豆图案生成器', en: 'Open the bead pattern maker' },
        href: {
          zh: '/zh-CN/tools/pindou-pattern-maker',
          en: '/en-US/tools/pindou-pattern-maker'
        },
        variant: 'primary'
      }
    ]
  },
  {
    id: 'bead-anime-fanart',
    slug: 'bead-pattern-anime-fanart',
    category: { zh: '拼豆图纸', en: 'Bead Pattern' },
    coverImage: MARKETING_COVERS.beadAnimeFanart,
    title: {
      zh: '拼豆同人角色图纸怎么做',
      en: 'How to make an anime or fan-art bead pattern'
    },
    summary: {
      zh: '把动漫角色、像素画或周边图案转成拼豆图纸，用主色像素化和色板匹配还原角色配色。',
      en: 'Convert anime characters, pixel art or icon designs into bead charts with faithful brand-palette colors.'
    },
    audience: {
      zh: '同人创作者、二次元手作玩家',
      en: 'Fan creators and anime crafters'
    },
    duration: { zh: '10 分钟', en: '10 min' },
    difficulty: { zh: '初级', en: 'Beginner' },
    steps: [
      {
        zh: '选择线条清晰、纯色背景的角色图，避免复杂光影干扰。',
        en: 'Pick a clean character image with flat colors and a solid background.'
      },
      {
        zh: '用主色像素化模式并开启去背景，优先保留角色轮廓。',
        en: 'Use dominant-color pixelation with background removal to keep the character silhouette.'
      },
      {
        zh: '用整色替换把边缘杂色统一成最近的角色配色。',
        en: 'Use color replace to snap edge noise to the nearest character color.'
      },
      {
        zh: '导出带色号的图纸，按角色色系分批采购珠子。',
        en: 'Export the chart with color codes and buy beads by character palette.'
      }
    ],
    outcomes: [
      {
        zh: '角色配色还原度高，可直接开工拼装。',
        en: 'Faithful character colors ready to assemble.'
      },
      {
        zh: '图纸带坐标与色号，适合打印后逐区拼装。',
        en: 'Coordinates and color codes make printed assembly easy.'
      }
    ],
    ctaLinks: [
      {
        label: { zh: '打开拼豆图案生成器', en: 'Open the bead pattern maker' },
        href: {
          zh: '/zh-CN/tools/pindou-pattern-maker',
          en: '/en-US/tools/pindou-pattern-maker'
        },
        variant: 'primary'
      }
    ]
  },
  {
    id: 'bead-kids-craft',
    slug: 'bead-pattern-kids-craft',
    category: { zh: '拼豆图纸', en: 'Bead Pattern' },
    coverImage: MARKETING_COVERS.beadKidsCraft,
    title: {
      zh: '拼豆亲子手工和课堂图纸怎么做',
      en: 'Bead patterns for kids crafts and classrooms'
    },
    summary: {
      zh: '为孩子或课堂准备低难度拼豆图纸：降低颜色数、控制图纸尺寸，打印带色号的图纸直接上手。',
      en: 'Prepare beginner-friendly bead charts for kids and classrooms: fewer colors, smaller grids and printable coded charts.'
    },
    audience: {
      zh: '家长、幼教老师、手工老师',
      en: 'Parents, teachers and craft instructors'
    },
    duration: { zh: '6 分钟', en: '6 min' },
    difficulty: { zh: '初级', en: 'Beginner' },
    steps: [
      {
        zh: '选择卡通动物、水果或字母等简单图案作为素材。',
        en: 'Start with simple shapes like cartoon animals, fruit or letters.'
      },
      {
        zh: '把最多颜色数降到 6-10，宽度珠子数控制在 30-50。',
        en: 'Lower the max color count to 6-10 and keep the width at 30-50 beads.'
      },
      {
        zh: '打印带坐标的图纸，方便孩子按行拼装。',
        en: 'Print the chart with coordinates so kids can work row by row.'
      },
      {
        zh: '完成熨烫后用重物压平冷却，作品更整齐。',
        en: 'Iron evenly and cool under weight for a flat finish.'
      }
    ],
    outcomes: [
      {
        zh: '低门槛图纸，孩子可以独立完成大部分拼装。',
        en: 'Low-barrier charts kids can mostly assemble alone.'
      },
      {
        zh: '一次生成班级同主题图纸，批量备料更省心。',
        en: 'Generate a class set in one pass for easy batch prep.'
      }
    ],
    ctaLinks: [
      {
        label: { zh: '打开拼豆图案生成器', en: 'Open the bead pattern maker' },
        href: {
          zh: '/zh-CN/tools/pindou-pattern-maker',
          en: '/en-US/tools/pindou-pattern-maker'
        },
        variant: 'primary'
      }
    ]
  },
  {
    id: 'bead-pixel-art',
    slug: 'bead-pattern-pixel-art',
    category: { zh: '拼豆图纸', en: 'Bead Pattern' },
    coverImage: MARKETING_COVERS.beadPixelArt,
    title: {
      zh: '拼豆像素画图纸怎么做',
      en: 'How to make a pixel-art bead pattern'
    },
    summary: {
      zh: '把像素画或点阵图还原成拼豆图纸，用平均色与主色模式保持像素边界，适合游戏角色和复古图案。',
      en: 'Rebuild pixel art and sprite images as bead charts while keeping crisp pixel edges for game characters and retro designs.'
    },
    audience: { zh: '游戏玩家、像素画爱好者', en: 'Gamers and pixel-art fans' },
    duration: { zh: '7 分钟', en: '7 min' },
    difficulty: { zh: '初级', en: 'Beginner' },
    steps: [
      {
        zh: '选择 8-bit 游戏角色、图标或点阵图案。',
        en: 'Use 8-bit game characters, icons or dot-matrix designs.'
      },
      {
        zh: '保持低宽度（24-48 珠），用主色模式避免像素边界被模糊。',
        en: 'Keep the grid small (24-48 beads) with dominant-color mode to preserve pixel edges.'
      },
      {
        zh: '关闭自动去背景，保留图案原本的黑边轮廓。',
        en: 'Keep background removal off so the original outline stays.'
      },
      {
        zh: '导出图纸后按色号分袋装珠，方便逐色拼装。',
        en: 'Export the chart and sort beads by color code before assembling.'
      }
    ],
    outcomes: [
      {
        zh: '像素边界清晰，还原游戏原图质感。',
        en: 'Crisp pixel edges that match the original sprite.'
      },
      {
        zh: '色号分袋后拼装效率明显提升。',
        en: 'Pre-sorted colors speed up assembly.'
      }
    ],
    ctaLinks: [
      {
        label: { zh: '打开拼豆图案生成器', en: 'Open the bead pattern maker' },
        href: {
          zh: '/zh-CN/tools/pindou-pattern-maker',
          en: '/en-US/tools/pindou-pattern-maker'
        },
        variant: 'primary'
      }
    ]
  }
];

export const BLOG_POSTS: BlogPostItem[] = [
  {
    id: 'seo-ai-zhuanshu-card',
    slug: 'ai-zhuanshu-card',
    coverImage: MARKETING_COVERS.blogAiCard,
    title: {
      zh: 'AI专属卡是什么？从 AI 支付到 AI 工具消费预算',
      en: 'What is an AI dedicated card? From AI payments to AI tool budgets'
    },
    excerpt: {
      zh: 'AI专属卡的核心不是“再办一张卡”,而是给 AI Agent 设定授权、限额、Full access 权益和可追踪预算。WebToMind 不提供微信支付 AI 专属卡，只承接 AI 创作积分和成本管理需求。',
      en: 'An AI dedicated card is less about issuing another card and more about authorization, limits, Full access membership and traceable budgets. WebToMind is not a payment-card provider; it handles AI creation credits and budgets.'
    },
    tag: { zh: 'AI 支付趋势', en: 'AI Payments' },
    date: '2026-06-17',
    readTime: { zh: '5 分钟阅读', en: '5 min read' },
    author: { zh: 'WebToMind 产品团队', en: 'WebToMind Product Team' },
    keywords: [
      { zh: 'AI专属卡', en: 'AI dedicated card' },
      { zh: 'AI工具积分', en: 'AI tool credits' },
      { zh: 'AI创作预算', en: 'AI creation budget' },
      { zh: 'AI Agent支付', en: 'AI agent payment' },
      { zh: 'Full access会员', en: 'Full access membership' }
    ],
    content: [
      {
        zh: 'AI专属卡这个词突然变热,本质上不是让用户再办一张普通银行卡,而是给 AI Agent 一个受限、可授权、可追踪的消费边界。它解决的问题是:当 AI 能代表用户完成更多任务时,谁来确认授权、谁来设定限额、谁来记录每次消费。',
        en: 'The phrase AI dedicated card is heating up because AI agents need a controlled spending boundary. The key questions are authorization, spending limits and traceability when an AI system starts acting on a users behalf.'
      },
      {
        zh: 'WebToMind 不提供微信支付 AI 专属卡,也不是任何支付卡的申请入口。我们更适合承接的是另一个真实需求:AI 工具越来越多,图片生成、参考图反推、模型切换和批量创作都会消耗积分或订阅预算,创作者需要在生成前知道成本,在生成后能复盘消耗。',
        en: 'WebToMind does not provide a WeChat Pay AI dedicated card and is not an application portal for any payment card. The related need we do serve is AI tool budget control: image generation, reference-to-prompt, model switching and batch creation all consume credits or subscriptions.'
      },
      {
        zh: '在 WebToMind 里,这个问题被落到积分和预算管理上:生成前查看模型、尺寸、数量和参考图带来的积分预估;生成失败时自动处理退还;用历史记录和 prompt 案例复用成功方案,减少重复试错。你可以从 /zh-CN/blog/ai-tool-credit-budget 查看完整预算方法,也可以从 /zh-CN/create?source=seo_ai_zhuanshu_card 开始一次可追踪的 AI 图片创作。',
        en: 'In WebToMind this becomes a credit and budget workflow: review model, size, count and reference-image cost before generation; handle refunds on failures; reuse history and prompt cases to reduce repeated trial and error. Start from /en-US/blog/ai-tool-credit-budget or /en-US/create?source=seo_ai_zhuanshu_card.'
      },
      {
        zh: '如果你是团队负责人,更实际的做法不是追逐一个支付热词,而是把 AI 创作预算拆成三层:免费额度用于试方向,积分包用于短期高峰,Full access 会员套餐用于稳定月度生产。对应入口是 /zh-CN/pricing?source=seo_ai_zhuanshu_card 和 /zh-CN/recharge?source=seo_ai_zhuanshu_card。',
        en: 'For teams, the practical move is to split AI creation budget into three layers: free quota for exploration, credit packages for short spikes and Full access membership plans for steady monthly production. Use /en-US/pricing?source=seo_ai_zhuanshu_card and /en-US/recharge?source=seo_ai_zhuanshu_card.'
      }
    ],
    ctaLinks: [
      {
        label: {
          zh: '查看 AI 工具积分预算方法',
          en: 'View AI tool credit budget workflow'
        },
        href: {
          zh: '/zh-CN/blog/ai-tool-credit-budget',
          en: '/en-US/blog/ai-tool-credit-budget'
        },
        variant: 'primary'
      },
      {
        label: { zh: '开始一次可追踪创作', en: 'Start a tracked creation' },
        href: {
          zh: '/zh-CN/create?source=seo_ai_zhuanshu_card_blog_create',
          en: '/en-US/create?source=seo_ai_zhuanshu_card_blog_create'
        },
        variant: 'secondary'
      },
      {
        label: { zh: '查看套餐与积分', en: 'View plans and credits' },
        href: {
          zh: '/zh-CN/pricing?source=seo_ai_zhuanshu_card_blog_pricing&returnTo=%2Fzh-CN%2Fblog%2Fai-zhuanshu-card',
          en: '/en-US/pricing?source=seo_ai_zhuanshu_card_blog_pricing&returnTo=%2Fen-US%2Fblog%2Fai-zhuanshu-card'
        },
        variant: 'secondary'
      },
      {
        label: { zh: '充值积分包', en: 'Recharge credits' },
        href: {
          zh: '/zh-CN/recharge?source=seo_ai_zhuanshu_card_blog_recharge&returnTo=%2Fzh-CN%2Fblog%2Fai-zhuanshu-card',
          en: '/en-US/recharge?source=seo_ai_zhuanshu_card_blog_recharge&returnTo=%2Fen-US%2Fblog%2Fai-zhuanshu-card'
        },
        variant: 'secondary'
      }
    ]
  },
  {
    id: 'visual-1',
    slug: 'why-ai-image-generation-needs-slots',
    coverImage: MARKETING_COVERS.blogSop,
    title: {
      zh: '为什么 AI 出图要从「看图选 slot」开始',
      en: 'Why AI image generation should start with picking visual slots'
    },
    excerpt: {
      zh: '从手写 prompt 到看图组合,什么变了?为什么 slot 化是 AI 视觉创作可复现的关键。',
      en: 'From hand-crafted prompts to visual slot picking — why slotting is the key to reproducible AI image work.'
    },
    tag: { zh: '方法论', en: 'Method' },
    date: '2026-05-20',
    readTime: { zh: '5 分钟阅读', en: '5 min read' },
    author: { zh: 'WebToMind 产品团队', en: 'WebToMind Product Team' },
    keywords: [
      { zh: '视觉提示词', en: 'visual prompts' },
      { zh: 'AI 图片生成', en: 'AI image generation' },
      { zh: 'prompt 工程', en: 'prompt engineering' }
    ],
    content: [
      {
        zh: '过去一年大家都在写 prompt,但很少有人能稳定地"再次生成同一张图"。问题不在模型,而在 prompt 本身——一段自由文本难以拆解、难以复用,改一个词整张图就跑偏。',
        en: 'Last year everyone was writing prompts, but few could reliably reproduce the same image twice. The bottleneck is not the model — it is the prompt itself: free text is hard to decompose, hard to reuse, and one word change can derail the whole output.'
      },
      {
        zh: 'WebToMind 视觉提示词工作台的核心假设是:把"一段长 prompt"拆成 16 个可视化 slot——角色 / 表情 / 姿态 / 服装 / 鞋履 / 配饰 / 道具 / 场景 / 写真风格 / 光影 / 画面影响 / 版式 / 镜头 / 景别 / 妆容,每个 slot 可独立选、可重复用。',
        en: 'The core hypothesis of the WebToMind Visual Prompt Studio: split "one long prompt" into 16 visualizable slots — character / expression / pose / wardrobe / shoes / accessory / prop / scene / photo style / lighting / image effects / layout / lens / framing / makeup. Each slot is independently pickable and reusable.'
      },
      {
        zh: '这套结构让创作变得「拼乐高」:换一只鞋,其他 15 个 slot 都不动,出图保持一致;换一个表情或版式,人物姿态延续上次的好结果。每次成功的组合都能被保存为模板,变成你私有的视觉资产。',
        en: 'This structure turns image generation into "Lego building" — swap one shoe slot while keeping the other 15 fixed and the output stays consistent. Swap the expression or layout while the pose carries over. Every successful combo becomes a saveable template — your private visual asset.'
      },
      {
        zh: '更重要的是:slot 化让"反推"成为可能。上传一张参考图,AI 自动把它拆成 6-10 个 slot 素材入库,后续可以混搭其他人的素材组合出新风格。这是从"AI 生图工具"到"AI 视觉创作系统"的关键差异。',
        en: 'More importantly, slotting makes reverse-engineering possible. Upload a reference image and AI auto-splits it into 6-10 slot assets that go straight into your library, ready to mix with anyone elses. This is the key difference between an "AI image tool" and an "AI visual creation system".'
      }
    ]
  },
  {
    id: 'visual-2',
    slug: 'reverse-engineer-any-portrait-reference',
    coverImage: MARKETING_COVERS.blogBlock,
    title: {
      zh: '上传一张参考图,30 秒拿到 8 条可复用的提示词素材',
      en: 'Upload a reference, get 8 reusable prompt assets in 30 seconds'
    },
    excerpt: {
      zh: '反推到底是什么?它解决了什么过去 prompt 工程做不到的事?一篇讲透。',
      en: 'What exactly is reverse engineering, and what does it solve that traditional prompt engineering cannot?'
    },
    tag: { zh: '功能解读', en: 'Feature Deep-dive' },
    date: '2026-05-18',
    readTime: { zh: '6 分钟阅读', en: '6 min read' },
    author: { zh: 'WebToMind 产品团队', en: 'WebToMind Product Team' },
    keywords: [
      { zh: '参考图反推', en: 'reference reverse' },
      { zh: 'VLM', en: 'VLM' },
      { zh: '视觉创作', en: 'visual creation' }
    ],
    content: [
      {
        zh: '看到 X / Pinterest / 小红书上一张好图想还原?以前你需要肉眼分析、手写 prompt、试 N 次。现在上传到 WebToMind,30 秒得到 8 条按 slot 拆分好的素材,中英双语 prompt 直接入库。',
        en: 'Spotted a great image on X / Pinterest / RED and want to recreate the vibe? You used to eyeball it, write the prompt by hand, and iterate N times. Now: upload it to WebToMind and 30 seconds later you have 8 slot-split assets with bilingual prompts already in your library.'
      },
      {
        zh: '反推的关键不是"识别图片里有什么",而是"按 slot 维度结构化拆分"。我们的 VLM 提示词约束模型只输出 16 个固定 slot 内的内容,角色 / 表情 / 姿态 / 服装 / 镜头 / 写真风格 / 版式...每条只描述自己负责的部分,不复述全图。',
        en: 'The key insight is not "describing what is in the image", but "decomposing along slot dimensions". Our VLM system prompt constrains the model to only output content for one of 16 predefined slots — character / expression / pose / wardrobe / lens / style / layout... Each entry describes only its dedicated dimension, never repeats the full scene.'
      },
      {
        zh: '这样拆出来的素材有两个特性:第一,可独立替换——单独换一个 pose 不影响其他 slot;第二,可跨参考图混搭——别人参考图反推出的"清冷高级脸"素材,可以直接和你反推出的"米白西装"素材组合。',
        en: 'Assets produced this way have two key properties: (1) Independent substitutability — swap a single pose without affecting other slots; (2) Cross-reference mixability — a "cool refined face" slot reverse-engineered from someone elses reference image can directly combine with your "cream blazer" slot.'
      },
      {
        zh: '一句话总结:反推让"视觉灵感"变成"可执行素材",让"看到的好图"变成"明天可以复用的资产"。这是视觉创意从手工活变成生产系统的关键一步。',
        en: 'In one line: reverse engineering turns "visual inspiration" into "executable assets", and "good images you saw" into "reusable assets for tomorrow". This is the key step from artisan-mode visual creation to a production system.'
      }
    ]
  },
  {
    id: 'visual-3',
    slug: 'project-instructions-power-user-guide',
    coverImage: MARKETING_COVERS.blogLibrary,
    title: {
      zh: '项目指令实战:让 Agent 真正成为「你的创作助理」',
      en: 'Project Instructions in Practice: Turn the Agent into Your Creative Assistant'
    },
    excerpt: {
      zh: '为什么 ChatGPT-style 项目指令是 WebToMind 最被低估的功能?5 个实战模板告诉你怎么用。',
      en: 'Why ChatGPT-style project instructions are WebToMind\\u2019s most underrated feature, with 5 ready-to-use templates.'
    },
    tag: { zh: '高级技巧', en: 'Power User' },
    date: '2026-05-25',
    readTime: { zh: '7 分钟阅读', en: '7 min read' },
    author: { zh: 'WebToMind 产品团队', en: 'WebToMind Product Team' },
    keywords: [
      { zh: '项目指令', en: 'project instructions' },
      { zh: 'Agent 定制', en: 'agent customization' },
      { zh: '工作流模板', en: 'workflow templates' }
    ],
    content: [
      {
        zh: '大部分用户进 WebToMind 都先用对话功能,问一句答一句。但用得越久越会发现:每次都要重复告诉 Agent"我做小红书风格""我偏好极简调性""不要带 emoji"——这些重复的偏好,本可以一次设定终身生效。',
        en: 'Most users start with the chat — ask once, get one answer. But the longer you stay, the more you notice yourself repeating "I do RED-style content / I prefer minimalist tone / no emojis" every single time. These repeated preferences could be set once and stick forever.'
      },
      {
        zh: '这就是项目指令的价值:在项目设置里写一段 markdown,所有该项目内的对话都会自动加载这段作为 system prompt。一次配置,所有提问 Agent 都"知道你是谁、要做什么、按什么标准输出"。',
        en: 'That is exactly what project instructions solve: write a markdown block in project settings, and every chat in that project auto-loads it as the system prompt. Configure once, and every conversation knows who you are, what you want, and what output standards to follow.'
      },
      {
        zh: '5 个实战模板:(1) **品牌一致性**:写明配色 / 字体 / 调性禁忌,所有配图都符合品牌指南;(2) **目标用户**:固定写"我面向 25-35 岁都市女性",AI 不会跑偏到通用方向;(3) **输出格式**:规定"任何回答先 3 句话总结再展开",所有交互节省时间;(4) **领域知识**:把行业术语 / 内部缩写预置,避免 Agent 用错词;(5) **创作禁忌**:写明"不写广告腔 / 不堆形容词 / 不强求押韵",输出更干净。',
        en: 'Five practical templates: (1) **Brand consistency** — colors / fonts / banned tones, so all assets match brand guidelines; (2) **Target audience** — lock in "25-35 yo urban women" so AI never drifts generic; (3) **Output format** — "always lead with a 3-sentence summary then expand"; (4) **Domain vocabulary** — preload industry jargon / internal acronyms so the Agent gets terminology right; (5) **Creative constraints** — "no ad-speak / no adjective stacking / no forced rhyme" for cleaner output.'
      },
      {
        zh: '配置位置:打开任意项目设置弹窗 → 找到"指令"textarea(8000 字符上限) → 粘贴模板 → 保存。**ChatGPT 用户应该秒懂**,这就是项目级 custom GPT。',
        en: 'Where to set: open any project settings modal → find the "Instructions" textarea (8000 char limit) → paste a template → save. ChatGPT users will get it instantly — this is project-scoped custom GPT.'
      },
      {
        zh: '一个反直觉的发现:项目指令越短越好。我们测试过,1000 字的"完美 system prompt"反而不如 200 字的关键约束。模型注意力有限,关键约束第一句话写明,后面只补例子。',
        en: 'A counter-intuitive finding: shorter project instructions perform better. In our tests, a "perfect" 1000-word system prompt loses to a 200-word constraint set. Model attention is finite — put the hard constraints in the first line, only follow with examples.'
      }
    ]
  },
  {
    id: 'visual-4',
    slug: 'thumbnail-consistency-secret',
    coverImage: MARKETING_COVERS.blogMetrics,
    title: {
      zh: '同一个素材库,为什么有些缩略图看着「不像一伙的」?',
      en: 'Why Some Thumbnails in Your Library Look "Off-Brand" — and How to Fix Them'
    },
    excerpt: {
      zh: '上传原图 vs AI 重生缩略图,视觉一致性的核心机制 + 一键批量统一风格的工程细节。',
      en: 'Uploaded originals vs AI-regenerated thumbnails — the mechanics of visual consistency and how one-click batch regen unifies your library.'
    },
    tag: { zh: '功能解读', en: 'Feature Deep-dive' },
    date: '2026-05-22',
    readTime: { zh: '5 分钟阅读', en: '5 min read' },
    author: { zh: 'WebToMind 产品团队', en: 'WebToMind Product Team' },
    keywords: [
      { zh: '缩略图', en: 'thumbnail' },
      { zh: '视觉一致性', en: 'visual consistency' },
      { zh: '批量生成', en: 'batch generation' }
    ],
    content: [
      {
        zh: '打开"我的素材"会发现一个尴尬:你上传的原图缩略图(姿态人偶、服装平铺、参考照)和公开运营库的素材(精修风格统一的缩略图)放在一起,**像两个图层叠出来的拼贴感**——清晰可见的风格断层。',
        en: 'Open your library and you will spot an awkward mix: your uploaded thumbnails (figure mannequins, flat-lay clothes, reference photos) sitting next to the curated public library (uniformly polished thumbnails) — it looks like two layers collaged together, with an obvious style break.'
      },
      {
        zh: '这不是 bug,是设计取舍:上传时如果强制 AI 生成统一缩略图,会增加 30 秒等待 + 一次积分扣费,大多数人选择"先把素材存进来,以后再说"。结果就是库内风格混杂。',
        en: 'This is by design, not a bug: forcing AI to regenerate a uniform thumbnail at upload time adds 30s of wait + one credit charge. Most users would rather "park the asset and deal later". The trade-off shows up as a mixed-style library.'
      },
      {
        zh: '解决方案是异步批量重生:工具条会自动检测哪些缩略图还没 AI 化(URL 包含 `thumb-` 前缀的是已生成的),给出"一键 AI 生成 (N)"按钮。点击 → 串行队列驱动 → 一张一张生成 → 进度面板实时显示。失败的项目可单独重试。',
        en: 'The fix is async batch regeneration: a toolbar auto-detects which thumbnails are not yet AI-styled (URLs with the `thumb-` prefix are done), and surfaces a "Regenerate all (N)" button. Click it → serial queue driver → one at a time → live progress panel. Failed items can be retried individually.'
      },
      {
        zh: '风格统一的关键在于**每个 slot 用不同的"提示词主轴"**:姿态用线稿 croquis,服装用白底产品图,场景用空镜实拍,人脸用影棚肖像,写真风格用半身样张。一刀切只会让"产品图变成线稿"或"人脸变成空镜"的灾难输出。',
        en: 'The trick to visual consistency is **different "prompt axes" per slot**: poses use line croquis, garments use white-background product shots, scenes use empty location photos, faces use studio portraits, photo-styles use half-body samples. Using one prompt for all slots leads to disasters like "product photo turned into line art" or "face turned into empty location".'
      },
      {
        zh: '细节做到位之后,你会发现"我的素材"和公开库无缝衔接,选素材时不需要在脑子里"翻译风格差异",而是直接按内容挑选。这是从"素材箱"到"作品库"的本质升级。',
        en: 'When details are dialed in, your private and public libraries blend seamlessly — you can pick assets by content without mentally translating style gaps. This is the substantive upgrade from "an asset bin" to "a work library".'
      }
    ]
  },
  {
    id: 'seo-portrait-prompt',
    slug: 'ai-portrait-prompt-generator-workflow',
    coverImage: MARKETING_COVERS.blogPortraitSeo,
    title: {
      zh: 'AI 写真提示词生成器怎么用:从参考图到稳定出片',
      en: 'How to use an AI portrait prompt generator'
    },
    excerpt: {
      zh: '用 WebToMind 把角色、表情、姿态、服装和镜头拆成可复用 slot,让 AI 写真不再靠玄学试词。',
      en: 'Split character, expression, pose, wardrobe and lens into reusable slots so AI portrait generation becomes repeatable.'
    },
    tag: { zh: 'AI 写真', en: 'AI Portraits' },
    date: '2026-06-08',
    readTime: { zh: '3 分钟阅读', en: '3 min read' },
    author: { zh: 'WebToMind 产品团队', en: 'WebToMind Product Team' },
    keywords: [
      { zh: 'AI 写真提示词', en: 'AI portrait prompt generator' },
      { zh: 'AI 图片生成', en: 'AI image generation' },
      { zh: '参考图反推', en: 'reference image to prompt' }
    ],
    content: [
      {
        zh: 'AI 写真最常见的问题不是模型不会画,而是 prompt 把人物、姿态、服装、镜头和光影混在一段话里。WebToMind 的做法是先把参考图反推成多个 slot,再用可视化素材组合出稳定提示词。',
        en: 'The common AI portrait problem is not that models cannot draw; it is that the prompt mixes character, pose, wardrobe, lens and lighting into one paragraph. WebToMind reverse-engineers references into slots, then combines visual assets into stable prompts.'
      },
      {
        zh: '推荐流程很短:上传参考图,保留人物气质和镜头语言;替换服装或场景 slot;选择尺寸和模型;生成后把效果最好的组合保存到历史。下次只改一个变量,不用重写整段 prompt。',
        en: 'The workflow is short: upload a reference, keep the character feel and lens language, swap wardrobe or scene slots, choose size and model, then save the best combo in history. Next time you change one variable instead of rewriting the whole prompt.'
      },
      {
        zh: '这让 WebToMind 更像 AI 写真提示词生成器和视觉素材库的组合,适合头像、写真样片、品牌人物图和系列化封面。',
        en: 'That makes WebToMind a blend of AI portrait prompt generator and visual asset library for profile photos, portrait samples, brand character images and serial covers.'
      }
    ]
  },
  {
    id: 'seo-product-image',
    slug: 'ai-product-image-generation-workflow',
    coverImage: MARKETING_COVERS.blogProductSeo,
    title: {
      zh: 'AI 商品图生成工作流:不用重拍也能统一风格',
      en: 'AI product image generation workflow for consistent visuals'
    },
    excerpt: {
      zh: '用参考图反推、产品 slot 和历史重编辑,快速生成同一系列的电商图、详情页图和社媒素材。',
      en: 'Use reference reverse-engineering, product slots and history re-editing to create consistent ecommerce and social visuals.'
    },
    tag: { zh: '商品图', en: 'Product Images' },
    date: '2026-06-08',
    readTime: { zh: '3 分钟阅读', en: '3 min read' },
    author: { zh: 'WebToMind 产品团队', en: 'WebToMind Product Team' },
    keywords: [
      { zh: 'AI 商品图生成', en: 'AI product image generation' },
      { zh: '电商产品图', en: 'ecommerce product images' },
      { zh: 'AI 产品摄影', en: 'AI product photography' }
    ],
    content: [
      {
        zh: '电商图最怕每张都像不同摄影棚拍的:背景、光线、构图和道具不统一。WebToMind 用产品、场景、光影、版式、镜头等 slot 把商品图拆开管理,让每次生成都沿用同一套视觉规则。',
        en: 'Ecommerce visuals fail when every image looks like it came from a different studio. WebToMind manages product, scene, lighting, layout and lens as separate slots, so every generation follows the same visual rules.'
      },
      {
        zh: '你可以先用一张理想产品图反推提示词素材,再替换产品或背景。生成第一张满意图后,用历史继续编辑功能复用同一组 prompt 和模型设置,批量做同系列详情页图。',
        en: 'Start by reverse-engineering one ideal product visual, then swap product or background slots. Once the first image works, use history re-editing to reuse the same prompt and model settings for a full detail-page series.'
      },
      {
        zh: '这类文章能明确覆盖 AI product image generation、AI product photography、ecommerce product image generator 等搜索意图,也把产品能力和真实使用场景绑定起来。',
        en: 'This directly addresses AI product image generation, AI product photography and ecommerce product image generator intent while tying product capability to a concrete workflow.'
      }
    ]
  },
  {
    id: 'seo-xiaohongshu-cover',
    slug: 'xiaohongshu-ai-cover-image-guide',
    coverImage: MARKETING_COVERS.blogRedSeo,
    title: {
      zh: '小红书 AI 封面怎么做:统一封面风格的 3 个 slot',
      en: 'Make Xiaohongshu AI cover images with three reusable slots'
    },
    excerpt: {
      zh: '把人物、版式和文字留白拆开管理,让小红书封面更容易系列化。',
      en: 'Manage character, layout and text-safe space separately to make Xiaohongshu cover images easier to serialize.'
    },
    tag: { zh: '小红书封面', en: 'Xiaohongshu Covers' },
    date: '2026-06-08',
    readTime: { zh: '3 分钟阅读', en: '3 min read' },
    author: { zh: 'WebToMind 产品团队', en: 'WebToMind Product Team' },
    keywords: [
      { zh: '小红书 AI 封面', en: 'Xiaohongshu AI cover' },
      { zh: 'AI 封面图生成', en: 'AI cover image generator' },
      { zh: '社媒封面', en: 'social media cover image' }
    ],
    content: [
      {
        zh: '小红书封面不是单张好看就够,关键是系列感。建议固定三个 slot:人物或主体、版式构图、文字留白区域。这样每期只换选题和道具,封面仍然属于同一套账号视觉。',
        en: 'A Xiaohongshu cover is not just one good image; it needs series consistency. Lock three slots: subject, layout and text-safe space. Then each issue can change topic and props while staying in the same account style.'
      },
      {
        zh: 'WebToMind 适合用来先反推爆款封面的视觉结构,再把结构拆成自己的素材库。生成时选择 3:4 或适合平台的比例,并把标题区域作为版式约束写进 prompt。',
        en: 'WebToMind is useful for reverse-engineering high-performing cover structure, then turning that structure into your own asset library. Generate in 3:4 or platform-ready ratios and include the title area as a layout constraint.'
      },
      {
        zh: '这种内容能覆盖小红书 AI 封面、AI cover image generator、social media cover image workflow 等搜索词,同时让用户看到 WebToMind 是封面生产系统。',
        en: 'This content covers Xiaohongshu AI cover, AI cover image generator and social media cover image workflow searches while showing WebToMind as a cover production system.'
      }
    ]
  },
  {
    id: 'seo-character-consistency',
    slug: 'consistent-ai-character-image-workflow',
    coverImage: MARKETING_COVERS.blogCharacterSeo,
    title: {
      zh: '如何生成一致的 AI 角色图:把角色资产保存成 prompt slot',
      en: 'Generate consistent AI character images with reusable prompt slots'
    },
    excerpt: {
      zh: '角色一致性的关键是把脸、发型、服装、姿态和镜头拆开,每次只改需要变化的部分。',
      en: 'Character consistency comes from separating face, hair, wardrobe, pose and lens, then changing only the part that should vary.'
    },
    tag: { zh: '角色一致性', en: 'Character Consistency' },
    date: '2026-06-08',
    readTime: { zh: '3 分钟阅读', en: '3 min read' },
    author: { zh: 'WebToMind 产品团队', en: 'WebToMind Product Team' },
    keywords: [
      { zh: 'AI 角色一致性', en: 'consistent AI character' },
      { zh: 'AI 角色图生成', en: 'AI character image generator' },
      { zh: '角色 prompt', en: 'character prompt' }
    ],
    content: [
      {
        zh: '如果每次重新写 prompt,AI 角色很容易换脸、换气质、换服装。WebToMind 的策略是把角色设定保存成固定 slot,再把场景、表情、姿态作为可变 slot 迭代。',
        en: 'If you rewrite the prompt every time, an AI character easily changes face, vibe and wardrobe. WebToMind saves character definition as fixed slots, then iterates scene, expression and pose as variable slots.'
      },
      {
        zh: '实际操作是先选一张满意角色图,用参考图反推拆出人物、发型、妆容、镜头等素材;之后每次生成只替换动作或场景。历史重编辑会保留上一次成功的参数,减少角色漂移。',
        en: 'In practice, pick one strong character image, reverse-engineer it into character, hair, makeup and lens assets, then only swap action or scene in future generations. History re-editing keeps successful parameters and reduces drift.'
      },
      {
        zh: '这类文章面向 consistent AI character、AI character image generator、character prompt workflow 等搜索需求,也解释素材库为什么比普通 prompt 收藏更适合长期角色项目。',
        en: 'This targets consistent AI character, AI character image generator and character prompt workflow intent, and explains why asset libraries are better for long-term character projects than plain prompt bookmarks.'
      }
    ]
  },
  {
    id: 'seo-history-reedit',
    slug: 'regenerate-ai-images-from-history-guide',
    coverImage: MARKETING_COVERS.blogHistorySeo,
    title: {
      zh: 'AI 图片历史记录怎么用:从旧图继续生成新版本',
      en: 'Regenerate AI images from history and continue editing'
    },
    excerpt: {
      zh: '不要让满意的旧图只停留在相册里。用历史重编辑复用 prompt、模型、尺寸和参考素材。',
      en: 'Do not leave a good image trapped in the gallery. Use history re-editing to reuse prompt, model, size and reference assets.'
    },
    tag: { zh: '历史重编辑', en: 'History Re-Edit' },
    date: '2026-06-08',
    readTime: { zh: '3 分钟阅读', en: '3 min read' },
    author: { zh: 'WebToMind 产品团队', en: 'WebToMind Product Team' },
    keywords: [
      { zh: 'AI 图片历史记录', en: 'AI image history' },
      { zh: '重新生成 AI 图片', en: 'regenerate AI images' },
      { zh: 'AI 图片继续编辑', en: 'continue editing AI images' }
    ],
    content: [
      {
        zh: '很多 AI 图片工具把历史记录当相册,只能查看和下载。WebToMind 更关注继续编辑:从历史图回到当时的 prompt、slot、模型、尺寸和参考图状态,再继续微调。',
        en: 'Many AI image tools treat history as a gallery for viewing and downloading. WebToMind treats it as an editing surface: return from an old image to its prompt, slots, model, size and references, then keep refining.'
      },
      {
        zh: '近期历史图库增加了分页和加载更多,适合长期项目保存大量生成结果。找到旧图后点击继续编辑,只改一个变量,比如背景、服装或画幅,就能保留上一版的成功结构。',
        en: 'The recent history gallery adds pagination and load-more behavior for long-running projects. Find an old image, continue editing, and change one variable such as background, wardrobe or ratio while keeping the successful structure.'
      },
      {
        zh: '这正好覆盖 AI image history、regenerate AI images、continue editing AI images 等 SEO 搜索意图,并把更新日志里的产品迭代转化为可被搜索发现的使用教程。',
        en: 'This maps to AI image history, regenerate AI images and continue editing AI images SEO intent while turning product updates into searchable usage education.'
      }
    ]
  },
  {
    id: 'seo-pindou-beginner-guide',
    slug: 'pindou-beginner-guide',
    coverImage: MARKETING_COVERS.beadBeginnerGuide,
    title: {
      zh: '拼豆新手入门指南：从选色板到第一张图纸',
      en: 'Bead pattern beginner guide: from palette choice to your first chart'
    },
    excerpt: {
      zh: '第一次玩拼豆怎么选色板、设图纸宽度、控制颜色数量？这篇入门指南带你 10 分钟做出第一张可打印图纸。',
      en: 'New to fuse beads? Learn how to pick a palette, set grid width and control color count, then make your first printable chart in 10 minutes.'
    },
    tag: { zh: '拼豆入门', en: 'Bead Beginner' },
    date: '2026-08-11',
    readTime: { zh: '5 分钟阅读', en: '5 min read' },
    author: { zh: 'WebToMind 产品团队', en: 'WebToMind Product Team' },
    keywords: [
      { zh: '拼豆新手入门', en: 'fuse bead beginner' },
      { zh: '拼豆图纸怎么做', en: 'make a bead pattern' },
      { zh: '拼豆色板选择', en: 'bead palette guide' },
      { zh: '拼豆工具教程', en: 'bead pattern tool tutorial' }
    ],
    content: [
      {
        zh: '第一步是选色板。新手建议先用 Perler 或 Hama 基础色板（16 色）快速出稿；想还原照片或角色配色时，再切换到 MARD、COCO、漫漫、盼盼或咪小窝 291 色板，细节和色阶会丰富很多。',
        en: 'Start with the palette. Beginners can draft quickly with the Perler or Hama basic palettes; switch to MARD, COCO, 漫漫, 盼盼 or 咪小窝 291-color palettes when you need photo-faithful detail.'
      },
      {
        zh: '第二步定图纸尺寸和颜色数。新手的甜点位是宽度 30-50 珠、最多颜色 6-10 个：足够表达图案，又不会让备料和拼装失控。想挑战细节作品再慢慢加到 80-140 珠。',
        en: 'Next, choose grid width and color count. A beginner-friendly sweet spot is 30-50 beads wide with 6-10 max colors, then grow toward 80-140 beads for detailed pieces.'
      },
      {
        zh: '第三步处理背景和杂色。背景简单的照片直接上传；背景复杂时开启“自动去背景”，再用“主色（推荐）”像素化模式避免边缘灰色毛边。如果图纸还有散点杂色，把“杂色合并阈值”调高一点。',
        en: 'Then clean the background and noise. Turn on background removal for busy photos and use dominant-color pixelation to avoid gray edges. Raise the color-merge threshold to snap away leftover speckles.'
      },
      {
        zh: '第四步导出并开工。下载带坐标和每格色号的 PNG 图纸直接打印，CSV 作为采购清单，PDF 方便留存制作说明。按色号分袋装珠，逐色拼装，最后中温熨烫并压平冷却。',
        en: 'Finally, export and start. Download the PNG chart with coordinates and per-cell color codes, use the CSV as a shopping list and keep the PDF as your build notes. Sort beads by code, assemble row by row, iron at medium heat and cool under weight.'
      }
    ],
    ctaLinks: [
      {
        label: { zh: '打开拼豆图案生成器', en: 'Open the bead pattern maker' },
        href: {
          zh: '/zh-CN/tools/pindou-pattern-maker?source=seo_pindou_beginner_guide',
          en: '/en-US/tools/pindou-pattern-maker?source=seo_pindou_beginner_guide'
        },
        variant: 'primary'
      }
    ]
  },
  {
    id: 'seo-pindou-ironing-guide',
    slug: 'pindou-ironing-guide',
    coverImage: MARKETING_COVERS.beadIroningGuide,
    title: {
      zh: '拼豆怎么熨：熨烫技巧与常见问题',
      en: 'How to iron fuse beads: techniques and common mistakes'
    },
    excerpt: {
      zh: '拼豆熨烫最容易翻车：温度太高会糊、太低不粘合、冷却太快会卷边。这份熨烫指南覆盖温度、手法和常见问题。',
      en: 'Ironing is where fuse-bead projects usually go wrong: too hot melts, too cool falls apart and fast cooling warps. This guide covers temperature, technique and fixes.'
    },
    tag: { zh: '拼豆技巧', en: 'Bead Technique' },
    date: '2026-08-11',
    readTime: { zh: '4 分钟阅读', en: '4 min read' },
    author: { zh: 'WebToMind 产品团队', en: 'WebToMind Product Team' },
    keywords: [
      { zh: '拼豆怎么熨', en: 'how to iron fuse beads' },
      { zh: '拼豆熨烫温度', en: 'fuse bead ironing temperature' },
      { zh: '拼豆卷边怎么办', en: 'fuse bead warping fix' }
    ],
    content: [
      {
        zh: '温度：用中温档（约 145-165°C），不要用高温蒸汽档。每批珠子的熔点略有差异，先在图纸角落试一小块，确认珠子表面微微融化、孔洞开始闭合，再大面积熨烫。',
        en: 'Temperature: use a medium setting around 145-165°C, never high steam. Melting points vary by batch, so test a corner first until bead tops fuse and holes just start to close.'
      },
      {
        zh: '手法：铺一层烘焙纸（不要用普通塑料保鲜膜），以画小圈的方式均匀移动熨斗，每处停留 8-15 秒，重复 2-3 次。不要长时间压在同一处，否则局部过融会堵塞孔洞。',
        en: 'Technique: cover with parchment paper, move the iron in small circles, holding each spot 8-15 seconds for 2-3 passes. Avoid lingering on one spot, which melts holes shut.'
      },
      {
        zh: '冷却：熨完后趁热把整块图纸连同底板一起放到平整桌面，压一本厚书或砧板等待完全冷却，再取下底板。没有压平就直接掀开，是最常见的卷边原因。',
        en: 'Cooling: while still warm, press the whole board flat under a heavy book or cutting board and wait until fully cool before lifting. Skipping this step is the most common cause of warping.'
      },
      {
        zh: '常见问题：卷边多因冷却过快，重压冷却即可缓解；局部未粘合说明温度偏低或时间太短，可以补熨；孔洞完全堵死说明过烫，只能下次降低温度。想换纸再熨另一面时，等作品完全冷却后再翻面。',
        en: 'Common issues: warping means cooling too fast — press and cool fully; unfused spots mean too cool or too short — iron a bit more; fully sealed holes mean too hot — lower the temperature next time. Flip for the second side only after the piece cools completely.'
      }
    ],
    ctaLinks: [
      {
        label: { zh: '打开拼豆图案生成器', en: 'Open the bead pattern maker' },
        href: {
          zh: '/zh-CN/tools/pindou-pattern-maker?source=seo_pindou_ironing_guide',
          en: '/en-US/tools/pindou-pattern-maker?source=seo_pindou_ironing_guide'
        },
        variant: 'primary'
      }
    ]
  },
  {
    id: 'seo-mard-bead-color-chart',
    slug: 'mard-bead-color-chart',
    coverImage: MARKETING_COVERS.beadMardChart,
    title: {
      zh: 'MARD 拼豆色号对照表（291 色）怎么用',
      en: 'MARD bead color chart (291 colors): how to read and use it'
    },
    excerpt: {
      zh: 'MARD 是拼豆圈常用的大色号体系，共 291 色。了解色号规则，配合拼豆图案生成器按色号精确备料。',
      en: 'MARD is a widely used 291-color fuse-bead system. Learn the code rules and use the bead pattern maker to buy exactly the colors you need.'
    },
    tag: { zh: '拼豆色号', en: 'Bead Color Codes' },
    date: '2026-08-11',
    readTime: { zh: '4 分钟阅读', en: '4 min read' },
    author: { zh: 'WebToMind 产品团队', en: 'WebToMind Product Team' },
    keywords: [
      { zh: 'MARD 拼豆色号', en: 'MARD bead color codes' },
      { zh: '拼豆色号对照表', en: 'bead color code chart' },
      { zh: 'MARD 291 色', en: 'MARD 291 colors' }
    ],
    content: [
      {
        zh: 'MARD 色号以字母加数字命名，例如 A01、B12、D07。字母大致对应色系分组，数字在组内按颜色深浅或色相排列，看到号段就能大致判断颜色类型，方便在货架或色卡上快速定位。',
        en: 'MARD codes combine a letter with a number, such as A01, B12 or D07. The letter roughly groups the color family and the number orders shades within the group, so the code itself hints at the color.'
      },
      {
        zh: '在拼豆图案生成器里选择 MARD 色板（291 色）后，上传照片会自动把每个格子匹配到最近的 MARD 色号；切换“色号系统”不会改变配色，只影响格子标号、材料清单和导出标注，方便你按手里的品牌采购。',
        en: 'After selecting the MARD palette in the bead pattern maker, every cell snaps to its nearest MARD code. Switching color systems only changes labels and material lists, not the mapping, so you can buy whichever brand you have.'
      },
      {
        zh: '备料时以图纸底部的材料清单为准：每个色号对应一个数量，按清单一次采购即可。注意不同批次、不同品牌同一色号会有轻微色差，同一件作品尽量用同一批次。',
        en: 'Shop from the material list at the bottom of the chart: one quantity per color code, bought in one pass. Different batches or brands can shift slightly for the same code, so keep one batch per project.'
      },
      {
        zh: '想直接生成一张 MARD 图纸，打开拼豆图案生成器，选择 MARD 色板，上传图片并导出 PNG/CSV 即可；材料清单会自动按 291 色号体系输出。',
        en: 'To generate a MARD chart now, open the bead pattern maker, pick the MARD palette, upload an image and export PNG or CSV — the material list uses the 291-code system automatically.'
      }
    ],
    colorChart: {
      systems: [...PINDOU_COLOR_CHART_SYSTEMS],
      rows: PINDOU_COLOR_CHART_ROWS.map((row) => ({
        hex: row.hex,
        codes: PINDOU_COLOR_CHART_SYSTEMS.map((system) => row.systems[system])
      }))
    },
    ctaLinks: [
      {
        label: { zh: '打开拼豆图案生成器', en: 'Open the bead pattern maker' },
        href: {
          zh: '/zh-CN/tools/pindou-pattern-maker?source=seo_mard_color_chart',
          en: '/en-US/tools/pindou-pattern-maker?source=seo_mard_color_chart'
        },
        variant: 'primary'
      }
    ]
  },
  {
    id: 'seo-pindou-printing-guide',
    slug: 'pindou-printing-guide',
    coverImage: MARKETING_COVERS.beadPrintingGuide,
    title: {
      zh: '拼豆图纸怎么打印：300 DPI、A4 分页与蓝图技巧',
      en: 'How to print bead patterns: 300 DPI, A4 pagination and blueprint tips'
    },
    excerpt: {
      zh: '拼豆图纸打印不清楚、格子线糊、色号看不清，都会让拼装返工。这篇指南讲清 300 DPI、A4 分页和蓝图使用方法。',
      en: 'Blurry grids and unreadable color codes cause rework. This guide covers 300 DPI printing, A4 pagination and blueprint tips for bead charts.'
    },
    tag: { zh: '拼豆打印', en: 'Bead Printing' },
    date: '2026-08-11',
    readTime: { zh: '4 分钟阅读', en: '4 min read' },
    author: { zh: 'WebToMind 产品团队', en: 'WebToMind Product Team' },
    keywords: [
      { zh: '拼豆图纸打印', en: 'print bead pattern' },
      { zh: '拼豆图纸 A4', en: 'bead pattern A4' },
      { zh: '拼豆蓝图打印', en: 'bead blueprint printing' },
      { zh: '拼豆分页打印', en: 'bead pattern pagination' }
    ],
    content: [
      {
        zh: '打印前先确认图纸来源。用拼豆生成器导出的 PNG 图纸自带网格与每格色号；大图建议导出 PDF，工具会按每页 50×50 格自动分页，每页带坐标和色号，直接逐页打印即可。',
        en: 'Start from a print-ready source. PNG charts from the bead pattern maker already include grids and per-cell codes; for large grids export the PDF, which paginates at 50x50 cells per page with coordinates and codes.'
      },
      {
        zh: '打印设置里关闭“适合页面”，选择实际大小或 100% 缩放，纸张选 A4，分辨率按 300 DPI 打印。颜色管理建议选“纸张”或“普通”，避免驱动自动加深颜色，导致图纸色块和实际珠子对不上。',
        en: 'In the print dialog, turn off fit-to-page and print at actual size or 100%, on A4 at 300 DPI. Pick a paper or normal color profile so the driver does not darken colors and shift the chart away from your beads.'
      },
      {
        zh: '多页蓝图按坐标顺序打印，例如“列 1-50 · 行 1-50”。小作品直接把单页垫在透明拼板下对照摆豆；大作品用胶带把相邻页拼合，或把每页对应到拼板分区，先铺大面积色块再铺细节。',
        en: 'Print multi-page blueprints in coordinate order, for example “columns 1-50 · rows 1-50”. For small pieces, slip the page under a transparent pegboard; for large builds, tape adjacent pages together or map each page to a board section, placing large color areas before details.'
      },
      {
        zh: '常见问题：格子线糊，多半是缩放或 DPI 太低，改为实际大小 + 300 DPI；色号看不清，用 PNG 放大查看或改用分页 PDF；打印比例不对，先打印一页小样和拼板对比，确认后再整卷打印。',
        en: 'Common fixes: blurry grid lines usually mean scaling or low DPI, so print actual size at 300 DPI; unreadable codes can be zoomed in the PNG or replaced with the paginated PDF; wrong scale can be caught with a one-page test print against the pegboard.'
      }
    ],
    ctaLinks: [
      {
        label: { zh: '打开拼豆图案生成器', en: 'Open the bead pattern maker' },
        href: {
          zh: '/zh-CN/tools/pindou-pattern-maker?source=seo_pindou_printing_guide',
          en: '/en-US/tools/pindou-pattern-maker?source=seo_pindou_printing_guide'
        },
        variant: 'primary'
      }
    ]
  },
  {
    id: 'seo-pindou-bead-size-guide',
    slug: 'pindou-bead-size-guide',
    coverImage: MARKETING_COVERS.beadSizeGuide,
    title: {
      zh: '拼豆尺寸怎么选：5mm 与 2.6mm 的区别',
      en: 'Which bead size should I pick: 5mm vs 2.6mm'
    },
    excerpt: {
      zh: '5mm 和 2.6mm 拼豆在底板孔径、作品细腻度和难度上差别很大。这篇指南帮你按人群和作品选对尺寸。',
      en: '5mm and 2.6mm beads differ in pegboard size, detail and difficulty. This guide helps you choose the right size for your audience and project.'
    },
    tag: { zh: '拼豆选材', en: 'Bead Sizing' },
    date: '2026-08-11',
    readTime: { zh: '4 分钟阅读', en: '4 min read' },
    author: { zh: 'WebToMind 产品团队', en: 'WebToMind Product Team' },
    keywords: [
      { zh: '拼豆尺寸怎么选', en: 'choose bead size' },
      { zh: '5mm 拼豆', en: '5mm fuse beads' },
      { zh: '2.6mm 拼豆', en: '2.6mm fuse beads' },
      { zh: '拼豆新手选材', en: 'fuse bead beginner materials' }
    ],
    content: [
      {
        zh: '规格差别：5mm 拼豆颗粒大、孔径大、容错率高，适合儿童、新手和课堂教学；2.6mm 拼豆颗粒小、像素密度高，能表现更细腻的渐变和细节，适合 16 岁以上、进阶或展示级作品。两种尺寸的拼板不通用，不能混放。',
        en: 'Size differences: 5mm beads are larger, easier to handle and forgiving, ideal for children, beginners and classrooms; 2.6mm beads have higher pixel density for fine gradients and detail, suited to advanced or display pieces. The pegboards are not interchangeable.'
      },
      {
        zh: '怎么选：儿童、入门用户选 5mm + 基础色板；想还原照片、角色或复杂渐变时选 2.6mm + 291 色板。同一张图纸在生成器里用同一套色板即可，切换尺寸只影响成品物理大小，不影响配色和数量。',
        en: 'How to choose: kids and beginners start with 5mm beads and a basic palette; use 2.6mm beads with a 291-color palette for photos, characters and complex gradients. The same chart works with either size — switching sizes changes the physical result, not the colors or counts.'
      },
      {
        zh: '颜色规划：简单图案用基础色板就够；照片、渐变和肤色建议用 MARD、COCO、漫漫、盼盼或咪小窝 291 色板，过渡更自然。图纸生成后以色号清单为准采购，避免凭印象配错色。',
        en: 'Color planning: basic palettes cover simple patterns; switch to 291-color MARD, COCO, Manman, Panpan or Mixiaowo palettes for photos, gradients and skin tones. Buy from the generated color-code list instead of guessing.'
      },
      {
        zh: '备料提醒：同一件作品尽量用同一品牌、同一批次；不同批次同一色号会有轻微色差。把导出 CSV 当采购清单，按色号和数量一次买齐，开工时按色号分袋装珠。',
        en: 'Material tips: keep one brand and batch per project, since the same code can shift slightly between batches. Use the exported CSV as a shopping list, buy every color in one pass, and sort beads by code before you start.'
      }
    ],
    ctaLinks: [
      {
        label: { zh: '打开拼豆图案生成器', en: 'Open the bead pattern maker' },
        href: {
          zh: '/zh-CN/tools/pindou-pattern-maker?source=seo_pindou_bead_size_guide',
          en: '/en-US/tools/pindou-pattern-maker?source=seo_pindou_bead_size_guide'
        },
        variant: 'primary'
      }
    ]
  }
];

export const PRODUCT_UPDATES: UpdateItem[] = [
  {
    id: 'v1-5-1',
    version: 'v1.5.1',
    date: '2026-06-08',
    title: {
      zh: '历史图库分页与继续编辑优化',
      en: 'History gallery pagination and re-edit improvements'
    },
    highlights: [
      {
        zh: '图片历史图库支持分页加载,长时间创作积累的作品可以稳定浏览,不再一次性拉取过多历史记录。',
        en: 'Image history now supports paginated loading, so long-running projects can browse accumulated outputs without fetching everything at once.'
      },
      {
        zh: '历史图继续编辑链路强化:从旧图回到当时的 prompt、参考素材、尺寸和模型设置,更适合做系列图微调。',
        en: 'Re-edit from history is stronger: return to the original prompt, references, size and model settings for easier series iteration.'
      },
      {
        zh: '生成图加载与缓存体验优化,减少历史预览、详情切换和重复进入创作台时的等待。',
        en: 'Generated image loading and cache behavior improved across history previews, detail navigation and repeated studio visits.'
      }
    ]
  },
  {
    id: 'v1-5-0',
    version: 'v1.5.0',
    date: '2026-06-08',
    title: {
      zh: '官网聚焦 AI 图片创作与 SEO 基础优化',
      en: 'Website repositioned around AI image creation and SEO'
    },
    highlights: [
      {
        zh: '官网首页、使用场景、博客和更新页文案转向 AI 图片生成、参考图反推、AI 写真、商品图和小红书封面等核心业务关键词。',
        en: 'Homepage, use cases, blog and updates now focus on AI image generation, reference-to-prompt, AI portraits, product images and Xiaohongshu covers.'
      },
      {
        zh: 'Use cases 详情补齐为可点击教程,每个场景都有执行步骤、预期结果和结构化 SEO 数据。',
        en: 'Use case detail pages now have clickable tutorials with steps, expected outcomes and structured SEO data.'
      },
      {
        zh: 'Blog 列表改为短篇精选,新增多篇面向搜索意图的 AI 图片创作文章,降低页面冗长感。',
        en: 'Blog listing now uses a shorter curated set with new SEO-focused AI image creation articles.'
      }
    ]
  },
  {
    id: 'v1-4-8',
    version: 'v1.4.8',
    date: '2026-06-06',
    title: {
      zh: 'Prompt 素材库同步与移动端编译器优化',
      en: 'Prompt asset sync and mobile prompt compiler optimization'
    },
    highlights: [
      {
        zh: '创作台 prompt 素材库支持跨设备同步,个人素材、公开素材和已选 slot 状态更稳定。',
        en: 'Creator prompt libraries now sync across devices with more stable personal assets, public assets and selected slot state.'
      },
      {
        zh: '移动端 prompt 编译器布局优化,核心生成控件、素材选择和参数设置更适合小屏操作。',
        en: 'Mobile prompt compiler layout improved for small-screen generation controls, asset selection and parameter settings.'
      },
      {
        zh: '创作控制区合并进 prompt 编译器,减少从选素材到出图之间的操作跳转。',
        en: 'Creator controls merged into the prompt compiler to reduce navigation between asset selection and image generation.'
      }
    ]
  },
  {
    id: 'v1-4-7',
    version: 'v1.4.7',
    date: '2026-06-05',
    title: {
      zh: '失败任务重试与分享卡片稳定性',
      en: 'Failed task retry and prompt share card stability'
    },
    highlights: [
      {
        zh: '失败的图片生成任务增加更清晰的恢复入口,支持回到原任务继续调整或重新发起。',
        en: 'Failed image generation tasks now expose clearer recovery actions for editing or retrying the original task.'
      },
      {
        zh: 'Prompt 分享卡片文案和路由稳定性优化,外部打开时更聚焦真实预览和单一行动入口。',
        en: 'Prompt share cards and routing were tightened for cleaner previews and a single external call to action.'
      },
      {
        zh: '图片创作链路的异常提示、路由兜底和缓存状态继续加固,降低用户遇到空状态的概率。',
        en: 'Image creation error states, routing fallbacks and cache handling were further hardened to reduce empty states.'
      }
    ]
  },
  {
    id: 'v1-4-3',
    version: 'v1.4.3',
    date: '2026-05-29',
    title: {
      zh: '官网全面改版 · 无色精密视觉系统',
      en: 'Full site redesign · achromatic precision system'
    },
    highlights: [
      {
        zh: '首页升级为「无色精密」视觉系统:黑白灰基调 + Bebas Neue / Inter / IBM Plex Mono 字体,32px 卡片、扁平无阴影,绿 / 黄仅作功能强调色。',
        en: 'Homepage rebuilt as an achromatic precision system: black/white/gray base with Bebas Neue / Inter / IBM Plex Mono, 32px flat shadowless cards, green/yellow used only as functional accents.'
      },
      {
        zh: 'Hero 重做为「模块化方块拼装」等距 SVG:中心结构 + 漂浮卫星方块沿虚线组合,呼应按 slot 拼装素材。',
        en: 'Hero reworked into a modular isometric "block assembly" SVG: a central structure with floating satellite cubes joining along dashed connectors — echoing slot-based asset assembly.'
      },
      {
        zh: '社会证明 / 方法论 / 为什么选择 / 信任 / FAQ 全模块组件化迭代:统一白卡黑描边、mono 强调标签、自定义列表标记、可折叠 FAQ。',
        en: 'Social proof / methodology / why-us / trust / FAQ modules all redesigned: unified white cards with black borders, mono accent tags, custom list markers, collapsible FAQ.'
      },
      {
        zh: '区块标题排版收敛:解除字宽限制、放大主标题、强化 eyebrow 小标签对比,整体层级更清晰。',
        en: 'Section typography tightened (removed width cap, enlarged titles, higher-contrast eyebrow labels) for clearer hierarchy.'
      }
    ]
  },
  {
    id: 'v1-4-2',
    version: 'v1.4.2',
    date: '2026-05-28',
    title: {
      zh: '官网产品定位升级 · 围绕视觉提示词工作台',
      en: 'Site rebrand · centered around the Visual Prompt Studio'
    },
    highlights: [
      {
        zh: '首页 Hero / Features / CTA 全面改版,以"看图选择 → AI 生成可复现提示词"为主线。',
        en: 'Hero / Features / CTA rewritten around "pick visuals → reproducible prompts".'
      },
      {
        zh: 'TopNav 创作台升为主入口,技能模块暂时下线等待重新规划。',
        en: 'Studio promoted to primary nav entry; Skills temporarily archived for rework.'
      },
      {
        zh: 'Use Cases 6 卡全面替换为视觉创作场景(写真 / 封面 / 反推 / 小红书 / 私库 / 重新编辑)。',
        en: 'Six use cases switched to visual scenarios (portrait / cover / reverse / RED / private library / re-edit).'
      }
    ]
  },
  {
    id: 'v1-4-0',
    version: 'v1.4.0',
    date: '2026-05-15',
    title: {
      zh: '视觉提示词工作台正式发布 + 个人素材库',
      en: 'Visual Prompt Studio launched + personal asset library'
    },
    highlights: [
      {
        zh: '/create 视觉提示词工作台上线,支持 16 个 slot(角色 / 表情 / 姿态 / 服装 / 镜头 / 写真风格 / 画面影响 / 版式 / 妆容...) 可视化拼组合。',
        en: '/create studio shipped: 16 slots (character / expression / pose / wardrobe / lens / style / image effects / layout / makeup...) for visual prompt assembly.'
      },
      {
        zh: '参考图 AI 反推 — 上传任意图片自动拆出多 slot 素材,中英双语 prompt 一次到位。',
        en: 'AI reverse engineering — upload any image to auto-split multi-slot assets with bilingual prompts.'
      },
      {
        zh: '个人素材库 + 一键 AI 重生缩略图(批量串行,失败重试,实时进度面板)。',
        en: 'Personal asset library + one-click AI thumbnail regen (serial batch, retry on failure, live progress panel).'
      },
      {
        zh: '多模型图片生成链路:自动调度、内部重试、兜底生成,失败积分自动退还。',
        en: 'Multi-model image generation: automatic routing, internal retry, fallback generation, and credit refunds on failure.'
      },
      {
        zh: '历史预览 + 一键重新编辑:任意作品都能跳回当时的 slot 组合 + prompt + 模型设置继续微调。',
        en: 'History preview + one-click re-edit: jump back to exact slot combo, prompt and model settings for any past output.'
      },
      {
        zh: 'ChatGPT-style 项目指令:每个项目可设自定义指令,所有对话 Agent 自动注入。',
        en: 'ChatGPT-style project instructions: per-project custom instructions auto-injected into all agent conversations.'
      }
    ]
  },
  {
    id: 'v1-4-1',
    version: 'v1.4.1',
    date: '2026-05-22',
    title: {
      zh: '生图链路稳定性提升 · 多模型 fallback 预算重排',
      en: 'Image generation stability · multi-model fallback budget rebalanced'
    },
    highlights: [
      {
        zh: '主链路超时预算重排,留足后续模型兜底窗口,180s 内尽量完成全链路。',
        en: 'Primary route timeout budget rebalanced to preserve fallback windows and complete the full chain within 180s where possible.'
      },
      {
        zh: '反推主路径切到 gemini-3.5-flash（约 9 秒出结果），备路径为 gemini-3.1-pro-preview，并补充三级稳定性兜底。',
        en: 'Reverse engineering now uses gemini-3.5-flash as the primary path (about 9 seconds), gemini-3.1-pro-preview as backup, plus a third stability fallback.'
      },
      {
        zh: '缩略图风格按 slot 精细化分流:pose 出线稿、服装/道具出产品照、写真风格/镜头/景别出人像样张,告别"清一色卡通画风"。',
        en: 'Thumbnail style dispatched per slot: poses render as croquis line art, garments/props as product shots, photo-style/lens/framing as portrait samples — no more uniform cartoon look.'
      },
      {
        zh: '反推 tags 严格收敛到子分类:只允许"包/饮品/书"等 slot 内二级分类,颜色/材质/情绪一律进 prompt 不进 tag。',
        en: 'Reverse-engineered tags strictly converged to sub-categories: only sub-types like "bag / drink / book" within a slot; colors / materials / moods go into prompt text not tags.'
      }
    ]
  },
  {
    id: 'v1-3-5',
    version: 'v1.3.5',
    date: '2026-04-20',
    title: {
      zh: '主对话模型升级 + 项目指令双路径注入',
      en: 'Main chat model upgrade + project instructions injected on both paths'
    },
    highlights: [
      {
        zh: '对话主模型切换到 gemini-3.5-flash + 强制 thinkingBudget=0,响应速度提升 2-3x,输出 token 不被 thinking 吞噬。',
        en: 'Main chat model switched to gemini-3.5-flash with forced thinkingBudget=0 — 2-3x faster response, output tokens no longer eaten by thinking.'
      },
      {
        zh: '项目指令统一进入 Cloudflare Worker 上的 smart-chat 链路；旧 skill-chat Node 路径已停用并由兼容层降级处理。',
        en: 'Project instructions now flow through the Cloudflare Worker smart-chat path; the old skill-chat Node path is disabled and handled by a compatibility layer.'
      },
      {
        zh: '生图历史签名 URL TTL 从 1h 延长到 24h,避免用户长时间停留后图片失效需要重新加载。',
        en: 'Generated image history signed URL TTL extended from 1h to 24h — no more broken images after lingering on the page.'
      }
    ]
  }
];
