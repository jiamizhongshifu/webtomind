import {
  PINDOU_COLOR_CHART_ROWS,
  PINDOU_COLOR_CHART_SYSTEMS
} from '../src/shared/pindou-color-chart-data.js';
import type { SeoBlogCtaKind } from '../src/shared/seo-blog-cta.js';

export type LocalizedText = {
  zh: string;
  en: string;
};

export type SeoUseCase = {
  slug: string;
  title: LocalizedText;
  summary: LocalizedText;
  coverImage?: string;
  steps: LocalizedText[];
  faq?: Array<{
    question: LocalizedText;
    answer: LocalizedText;
  }>;
  relatedLinks?: Array<{
    path: string;
    title: LocalizedText;
    description: LocalizedText;
  }>;
};

export type SeoBlogPost = {
  slug: string;
  title: LocalizedText;
  excerpt: LocalizedText;
  body?: LocalizedText[];
  colorChart?: {
    systems: string[];
    rows: Array<{ hex: string; codes: string[] }>;
  };
  cta?: {
    title: LocalizedText;
    href: string;
    kind: SeoBlogCtaKind;
  };
  coverImage?: string;
  date: string;
  author: LocalizedText;
};

export type SeoUpdate = {
  title: LocalizedText;
};

export type SeoPricingContent = {
  title: LocalizedText;
  intro: LocalizedText;
  plans: Array<{
    name: LocalizedText;
    summary: LocalizedText;
  }>;
  creditUses: LocalizedText[];
  faq: Array<{
    question: LocalizedText;
    answer: LocalizedText;
  }>;
};

export const SEO_USE_CASES: SeoUseCase[] = [
  {
    slug: 'creator-workflow-30-min',
    title: {
      zh: '从热点素材到可发布图文（30 分钟）',
      en: 'From trend source to publishable post in 30 minutes'
    },
    summary: {
      zh: '以 X 和网页素材为例，搭建可复用的采集-整理-写作-配图闭环。',
      en: 'Build a reusable capture-organize-write-visualize loop from X and web sources.'
    },
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
    ]
  },
  {
    slug: 'video-to-script-storyboard',
    title: {
      zh: '视频转口播稿与分镜脚本',
      en: 'Convert video into narration and storyboard'
    },
    summary: {
      zh: '从长视频中提炼叙事主线，输出短视频可执行脚本。',
      en: 'Extract narrative backbone from long videos and output executable short-form scripts.'
    },
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
    ]
  },
  {
    slug: 'wechat-publish-readiness-check',
    title: {
      zh: '公众号排版发布前检查',
      en: 'Pre-publish check for WeChat article'
    },
    summary: {
      zh: '发布前统一检查结构、配图与引用，减少返工。',
      en: 'Run final checks on structure, visuals and citations before publishing.'
    },
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
    ]
  },
  {
    slug: 'single-draft-multi-channel-repurpose',
    title: {
      zh: '一篇长文拆成多平台内容',
      en: 'Repurpose one long draft to multiple channels'
    },
    summary: {
      zh: '同一篇核心长文，拆成不同平台可直接发布的版本。',
      en: 'Repurpose one core long-form draft into platform-ready derivatives.'
    },
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
    ]
  },
  {
    slug: 'reproducible-portrait-shoot',
    title: {
      zh: '如何生成可复现的 AI 女性写真',
      en: 'How to generate reproducible AI portrait images'
    },
    summary: {
      zh: '可复现 AI 女性写真工作流：用角色、脸型、姿态、服装、镜头和写真风格 slot 锁定人物识别点，稳定出图并可持续复现。',
      en: 'Use character, pose, wardrobe, lens and photo-style slots to build a stable portrait generation workflow.'
    },
    steps: [
      {
        zh: '先选择角色、脸型、妆容和发型素材，锁定人物基础识别度。',
        en: 'Pick character, face, makeup and hair assets first to lock identity.'
      },
      {
        zh: '再组合姿态、服装、镜头和写真风格，让 prompt 结构稳定可复现。',
        en: 'Combine pose, wardrobe, lens and photo-style slots so the prompt stays reproducible.'
      },
      {
        zh: '保存成功组合为模板，后续只替换表情或场景做系列图。',
        en: 'Save the successful combo as a template, then swap expression or scene for a series.'
      }
    ],
    faq: [
      {
        question: {
          zh: '人像写真最值得固定的字段是什么？',
          en: 'Which fields matter most for portraits?'
        },
        answer: {
          zh: '脸型、发型、妆容和镜头优先，其次才是姿态、服装和场景。',
          en: 'Face shape, hair, makeup and lens first, then pose, wardrobe and scene.'
        }
      },
      {
        question: {
          zh: '怎么避免"网红脸"同质化？',
          en: 'How do I avoid generic AI faces?'
        },
        answer: {
          zh: '用真实参考锁定个人特征，用负向约束控制过度美颜，让识别点优先于风格词。',
          en: 'Use a real reference to lock personal traits and negative constraints to limit over-beautification; identity cues beat style words.'
        }
      },
      {
        question: {
          zh: '一组写真要生成多少张？',
          en: 'How many images per set?'
        },
        answer: {
          zh: '先出 4–6 张验证识别点稳定，再扩展姿态与场景。',
          en: 'Start with 4–6 to verify identity stability, then expand poses and scenes.'
        }
      }
    ]
  },
  {
    slug: 'cover-image-pipeline',
    title: {
      zh: '公众号和视频封面的 AI 批量出图流程',
      en: 'AI cover image workflow for WeChat and video thumbnails'
    },
    summary: {
      zh: '用版式、主视觉、场景和镜头 slot 做统一风格的封面图批量生成。',
      en: 'Use layout, key visual, scene and lens slots to batch-generate consistent cover images.'
    },
    steps: [
      {
        zh: '固定封面比例、版式和品牌色，避免每张图风格不一致。',
        en: 'Lock ratio, layout and brand color to avoid inconsistent visuals.'
      },
      {
        zh: '选择角色、场景、镜头和风格素材，生成第一批候选封面。',
        en: 'Choose character, scene, lens and style assets to generate the first cover batch.'
      },
      {
        zh: '把表现好的组合保存为模板，下次只换主题和文案方向。',
        en: 'Save winning combos as templates and only swap topic and copy direction next time.'
      }
    ],
    faq: [
      {
        question: {
          zh: '封面批量的最小稳定单元是什么？',
          en: 'What is the smallest stable unit for cover batches?'
        },
        answer: {
          zh: '版式模板（主体位置、标题区、留白）加风格基调；先跑 3–5 张验证，再批量。',
          en: 'A layout template (subject position, title area, whitespace) plus a style baseline; validate with 3–5 images before scaling.'
        }
      },
      {
        question: {
          zh: '标题文字要写进 prompt 吗？',
          en: 'Should titles go into the prompt?'
        },
        answer: {
          zh: '建议预留文字空间但不生成真实文案，标题用排版工具叠加，避免 AI 生成错字。',
          en: 'Reserve the space but avoid generating real text; overlay titles in a layout tool to prevent misspellings.'
        }
      },
      {
        question: {
          zh: '不同平台的比例怎么处理？',
          en: 'How do platform ratios work?'
        },
        answer: {
          zh: '按目标平台比例出图（小红书 3:4、公众号 2.35:1），再按版式模板裁切。',
          en: 'Generate at the target ratio (Xiaohongshu 3:4, WeChat 2.35:1) and crop against the layout template.'
        }
      }
    ]
  },
  {
    slug: 'reverse-engineer-references',
    title: {
      zh: '参考图反推 AI 提示词的正确做法',
      en: 'How to reverse-engineer prompts from reference images'
    },
    summary: {
      zh: '上传参考图后按 slot 拆出角色、姿态、服装、镜头和风格，让灵感可复用。',
      en: 'Upload a reference image and split it into character, pose, wardrobe, lens and style assets.'
    },
    steps: [
      {
        zh: '上传参考图，让 AI 识别可复用的视觉 slot。',
        en: 'Upload a reference and let AI identify reusable visual slots.'
      },
      {
        zh: '检查每条素材是否只描述自己的维度，例如只写服装或只写镜头。',
        en: 'Check that each asset describes only one dimension, such as wardrobe or lens.'
      },
      {
        zh: '把高质量素材存入私有库，后续与其他角色、场景和版式混搭。',
        en: 'Save high-quality assets to your private library for future mixing.'
      }
    ],
    faq: [
      {
        question: {
          zh: '参考图反推能做到 100% 复现吗？',
          en: 'Can reference reverse-engineering reproduce exactly?'
        },
        answer: {
          zh: '不能保证像素级复现，但能稳定还原角色、姿态、镜头与风格这些可复用结构。',
          en: 'Not pixel-perfect, but it reliably recovers reusable structure: character, pose, lens and style.'
        }
      },
      {
        question: {
          zh: '哪些参考图不适合反推？',
          en: 'Which references work poorly?'
        },
        answer: {
          zh: '模糊、强滤镜、多主体或遮挡严重的图，先裁切或修复再反推。',
          en: 'Blurry, heavily filtered, multi-subject or heavily occluded images; crop or clean them first.'
        }
      },
      {
        question: {
          zh: '反推结果可以直接商用吗？',
          en: 'Are reverse-engineered results commercial-safe?'
        },
        answer: {
          zh: '反推得到的是 prompt 结构，不代表素材版权转移；请确认原图使用权限。',
          en: 'You recover a prompt structure, not asset rights; confirm permission for the original image.'
        }
      }
    ]
  },
  {
    slug: 'image-to-prompt-generator-workflow',
    title: {
      zh: 'Image to Prompt Generator:从参考图生成可复用提示词',
      en: 'Image to Prompt Generator: reusable prompts from reference images'
    },
    summary: {
      zh: '用参考图提取主体、构图、镜头、光影、材质和风格约束，再编译成适合 GPT Image 2、Flux、Seedream 或 Nano Banana 的 AI image prompt。',
      en: 'Extract subject, composition, lens, lighting, material and style from a reference image, then compile reusable prompts for GPT Image 2, Flux or Seedream.'
    },
    steps: [
      {
        zh: '上传或选择参考图，只提取可迁移信息：主体结构、构图、镜头、光影、材质和风格。',
        en: 'Upload or choose a reference image and extract transferable information: subject structure, composition, lens, lighting, material and style.'
      },
      {
        zh: '把提取结果改写成主体、场景、镜头、光影、材质、风格、负面约束和模型偏好的 prompt slot。',
        en: 'Rewrite the extraction into prompt slots for subject, scene, lens, lighting, material, style, negative constraints and model preference.'
      },
      {
        zh: '在 WebToMind 创作台生成第一版图片，保存成功 prompt 和图片结果，后续只替换主体或场景做系列图。',
        en: 'Generate the first image in the WebToMind studio, save the successful prompt and result, then swap only subject or scene for future series.'
      },
      {
        zh: '按目标模型微调提示词结构：GPT Image 2 更重视清晰约束，Flux 更重视材质和光影，Seedream 更适合商业场景描述。',
        en: 'Tune the prompt structure for the target model: GPT Image 2 rewards clear constraints, Flux benefits from material and lighting control, and Seedream works well with commercial scene briefs.'
      },
      {
        zh: '把成功版本回链到 AI image prompt generator 和 prompt 案例库，形成可复用的 reference image to prompt 工作流。',
        en: 'Link the winning version back to the AI image prompt generator and prompt library to build a reusable reference image to prompt workflow.'
      }
    ]
  },
  {
    slug: 'ai-image-prompt-examples-guide',
    title: {
      zh: 'AI 图片提示词案例指南',
      en: 'AI Image Prompt Examples Guide'
    },
    summary: {
      zh: '用主体、场景、构图、镜头、光影、材质、风格和约束拆解可复用的 AI image prompt examples 与 picture prompt examples。',
      en: 'Break reusable AI image prompt and picture prompt examples into subject, scene, composition, lens, lighting, material, style and constraints.'
    },
    steps: [
      {
        zh: '先明确图片用途，例如商品图、海报、人像、角色设定或社媒封面。',
        en: 'Start with the output use case, such as product photo, poster, portrait, character design or social cover.'
      },
      {
        zh: '把提示词拆成主体、场景、构图、镜头、光影、材质、风格和负面约束。',
        en: 'Split the prompt into subject, scene, composition, lens, lighting, material, style and negative constraints.'
      },
      {
        zh: '从 WebToMind AI image prompts 案例库选择一个相近案例，只替换一个核心变量。',
        en: 'Pick a close example from the WebToMind AI image prompts library and replace only one core variable.'
      },
      {
        zh: '为 GPT Image 2、Nano Banana、Flux 或 Seedream 保留模型相关关键词，避免通用 prompt 失去控制。',
        en: 'Keep model-specific keywords for GPT Image 2, Nano Banana, Flux or Seedream so generic prompts do not lose control.'
      },
      {
        zh: '保存表现好的 prompt 与图片结果，后续沉淀为团队可复用案例。',
        en: 'Save the best prompt and image result, then turn it into a reusable team example.'
      }
    ],
    faq: [
      {
        question: {
          zh: '什么是好的 AI image prompt example？',
          en: 'What makes a good AI image prompt example?'
        },
        answer: {
          zh: '好的案例不是一段长描述，而是可复用的结构：主体、场景、构图、镜头、光影、材质、风格和约束各占一个 slot，改一个变量就能稳定出图。',
          en: 'A good example is a reusable structure, not one long paragraph: subject, scene, composition, lens, lighting, material, style and constraints each fill a slot, so swapping one variable keeps results stable.'
        }
      },
      {
        question: {
          zh: 'image prompt examples 和 prompt 模板有什么区别？',
          en: 'What is the difference between image prompt examples and prompt templates?'
        },
        answer: {
          zh: '案例是「见过效果的真实 prompt」：包含模型、尺寸和生成历史；模板只是留空的骨架。WebToMind 案例把 prompt 与参数一起保存，回放才能稳定复现。',
          en: 'Examples are real prompts with proven output: they keep model, size and generation history; templates are just empty skeletons. WebToMind saves the prompt together with its settings so replay stays reproducible.'
        }
      },
      {
        question: {
          zh: '哪里可以复制免费的 picture prompt examples？',
          en: 'Where can I copy free picture prompt examples?'
        },
        answer: {
          zh: '先在 Prompt 案例库按模型或场景找真实案例，再回到本指南理解 slot 结构；替换成自己的商品、角色或场景后生成，避免直接照搬第三方案例。',
          en: 'Find real cases by model or use case in the prompt library, then use this guide to read their slot structure; replace the product, character or scene before generating instead of copying third-party examples verbatim.'
        }
      }
    ]
  },
  {
    slug: 'gpt-image-2-prompt-structure',
    title: {
      zh: 'GPT Image 2 提示词结构指南',
      en: 'GPT Image 2 Prompt Structure'
    },
    summary: {
      zh: '用主体、意图、场景、镜头、光影、风格、材质和约束写出稳定的 GPT Image 2 prompts。',
      en: 'Write reliable GPT Image 2 prompts with subject, intent, scene, camera, lighting, style, material and constraints.'
    },
    steps: [
      {
        zh: '先写清楚生成目标和商业用途，例如电商主图、人物头像、广告 KV 或角色设定。',
        en: 'Define the generation goal and business use, such as ecommerce hero, founder portrait, ad KV or character concept.'
      },
      {
        zh: '用固定公式组织 prompt：主体、场景、镜头、光影、材质、风格、构图、限制。',
        en: 'Use a stable formula: subject, scene, camera, lighting, material, style, composition and constraints.'
      },
      {
        zh: '把不想出现的内容写成清晰限制，例如不要 logo、不要可读文字、不要水印。',
        en: 'Write unwanted elements as clear constraints, such as no logos, no readable text and no watermarks.'
      },
      {
        zh: '把表现好的 GPT Image 2 prompt 存成案例，再为不同产品或角色替换主体。',
        en: 'Save strong GPT Image 2 prompts as cases, then swap the subject for different products or characters.'
      },
      {
        zh: '把 prompt 详情页回链到 GPT Image 2 prompts 专题和 AI image prompt generator。',
        en: 'Link prompt detail pages back to the GPT Image 2 prompts topic and the AI image prompt generator.'
      }
    ]
  },
  {
    slug: 'ai-product-photography-prompts-guide',
    title: {
      zh: 'AI 商品摄影提示词指南',
      en: 'AI Product Photography Prompts Guide'
    },
    summary: {
      zh: '为电商主图、PDP 横幅、场景图和社媒广告编写可复用的 AI product photography prompts。',
      en: 'Write reusable AI product photography prompts for ecommerce hero images, PDP banners, lifestyle scenes and social ads.'
    },
    steps: [
      {
        zh: '先锁定商品类型、材质、形状、卖点和画面用途，避免 AI 把产品改形。',
        en: 'Lock product type, material, shape, selling point and output use before AI changes the product.'
      },
      {
        zh: '选择产品摄影光型，例如柔光箱、轮廓光、自然窗光、高级棚拍或生活方式场景光。',
        en: 'Choose a product photography lighting recipe, such as softbox, rim light, natural window light, premium studio or lifestyle scene light.'
      },
      {
        zh: '控制背景和道具：服务产品卖点，但不要制造品牌混淆或假标签。',
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
    ]
  },
  {
    slug: 'ai-tool-credit-budget',
    title: {
      zh: 'AI 工具积分预算：如何控制 AI 图片生成成本',
      en: 'AI tool credit budget: control AI image generation costs'
    },
    summary: {
      zh: '从 AI 专属卡、Full access 权益和 Agent 授权消费趋势切入，明确 WebToMind 不提供微信支付 AI 专属卡，而是用积分、成本预估、历史复用和会员套餐管理 AI 创作预算。',
      en: 'Manage AI creation budgets with credits, usage estimates, history reuse and plans; WebToMind is not a payment-card provider or AI dedicated card issuer.'
    },
    steps: [
      {
        zh: '先确认每次 AI 图片生成的真实成本：模型、尺寸、参考图、数量和失败退还规则。',
        en: 'Start by checking the real cost of each AI image task: model, size, reference image, count and refund behavior.'
      },
      {
        zh: '把 AI 专属卡理解为“授权和限额”概念，而不是微信官方申请入口、办理入口，也不是把 AI 工具当成无限消费入口。',
        en: 'Treat AI dedicated cards as an authorization and spending-limit concept, not as an official application path or permission for every AI tool to spend without controls.'
      },
      {
        zh: '在 WebToMind 创作台生成前查看积分预估，把 GPT Image 2、Nano Banana、Flux 和 Seedream 的成本差异写进任务决策。',
        en: 'Review credit estimates before generating in WebToMind, and include GPT Image 2, Nano Banana, Flux and Seedream cost differences in task decisions.'
      },
      {
        zh: '复用历史图片、prompt 案例和参考图反推结果，减少重复试错造成的积分浪费。',
        en: 'Reuse image history, prompt cases and reference-to-prompt results to reduce repeated trial-and-error credit waste.'
      },
      {
        zh: '用会员 Full access、积分包和充值页设定月度 AI 创作预算，再通过 source 参数追踪热点流量是否转化。',
        en: 'Use Full access membership, credit packages and recharge pages to set a monthly AI creation budget, then track hot-topic traffic with source parameters.'
      }
    ],
    faq: [
      {
        question: {
          zh: 'WebToMind 提供 AI 专属卡吗？',
          en: 'Does WebToMind offer an AI payment card?'
        },
        answer: {
          zh: '不提供。我们不做支付卡，而是用积分、成本预估、历史复用和套餐管理 AI 创作预算。',
          en: 'No. We do not issue payment cards; budgets are managed with credits, cost estimates, history reuse and plans.'
        }
      },
      {
        question: {
          zh: '积分成本在哪里预估？',
          en: 'Where can I estimate credit costs?'
        },
        answer: {
          zh: '生成前界面按模型、尺寸、参考图和数量给出预估；失败任务自动退回。',
          en: 'The studio shows an estimate from model, size, references and count before generation, and failed tasks are refunded automatically.'
        }
      },
      {
        question: { zh: '预算超了怎么办？', en: 'What if my budget runs out?' },
        answer: {
          zh: '先复用历史与参考图减少重试，再按需升级套餐或购买一次性积分包。',
          en: 'Reuse history and references to cut retries, then upgrade a plan or buy a one-time credit pack.'
        }
      }
    ]
  },
  {
    slug: 'spacexai-ai-workflow-guide',
    title: {
      zh: 'spacexai 是什么？SpaceXAI AI 工作流指南',
      en: 'What is spacexai? SpaceXAI keyword and AI workflow guide'
    },
    summary: {
      zh: '面向搜索 spacexai、SpaceXAI、SpaceX AI、xAI、Grok 或轨道 AI 算力的用户，把热点检索意图整理成事实核查、资料归档、提示词模板和视觉创作 brief。WebToMind 与 SpaceXAI、SpaceX、xAI 或 Grok 无关联。',
      en: 'Turn spacexai, SpaceXAI, xAI and Grok searches into fact-checked notes and templates. WebToMind is not affiliated with SpaceXAI, SpaceX, xAI or Grok.'
    },
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
        zh: '把搜索意图拆成解释型、时间线型、商业型、技术型和视觉创作型，再分别生成标题、摘要和 prompt brief。',
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
    ]
  },
  {
    slug: 'deepseek-harness-agent-workflow-guide',
    title: {
      zh: 'DeepSeek Harness 是什么？Agent 与代码智能体工作流指南',
      en: 'What is DeepSeek Harness? AI agent workflow guide'
    },
    summary: {
      zh: '面向搜索 DeepSeek Harness、DeepSeek Code Harness、DeepSeek Agent、Model+Harness=Agent 和 DeepSeek 智能体的用户，整理已上线的 npm 包与 GitHub 仓库、下载方式、事实核查和 Agent 时代创作工作流。WebToMind 与 DeepSeek 无关联。',
      en: 'Turn DeepSeek Harness, DeepSeek Code Harness, DeepSeek Agent and Model+Harness=Agent searches into verified launch facts, npm and GitHub download links, keyword groups and agent-era creation workflows. WebToMind is not affiliated with DeepSeek.'
    },
    steps: [
      {
        zh: '先核查事实：2026 年 8 月 13 日 DeepSeek 官方上线 GitHub 仓库 deepseek-ai/deepseek-harness 与 npm 包 @deepseek-ai/dsh（0.1.0-rc.6，开发者预览阶段）；官方招聘定义 Model+Harness=Agent；5 月组建 Harness 团队，8 月初开放内测征集。',
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
    faq: [
      {
        question: {
          zh: 'DeepSeek Harness 是什么？',
          en: 'What is DeepSeek Harness?'
        },
        answer: {
          zh: 'Harness 是 DeepSeek 定义在模型之外的智能体执行框架，负责工具调度、任务状态管理和执行闭环。官方公式是 Model + Harness = Agent：模型负责理解与推理，Harness 负责把能力落到真实任务。',
          en: "Harness is DeepSeek's agent execution framework outside the model: tool scheduling, task state management and the execution loop. The official formula is Model + Harness = Agent: the model reasons, the harness turns that into real task completion."
        }
      },
      {
        question: {
          zh: 'DeepSeek Harness 发布了吗？在哪里下载？',
          en: 'Has DeepSeek Harness been released and where do I download it?'
        },
        answer: {
          zh: '已上线开发者预览（developer preview）。官方下载入口：npm 包 @deepseek-ai/dsh（最新 0.1.0-rc.6，命令 dsh，https://www.npmjs.com/package/@deepseek-ai/dsh）与 GitHub 官方仓库 deepseek-ai/deepseek-harness（https://github.com/deepseek-ai/deepseek-harness，中文 README：https://github.com/deepseek-ai/deepseek-harness/blob/master/README.zh.md）。运行 npx @deepseek-ai/dsh web 会启动 Web UI，默认地址 http://127.0.0.1:3080。rc 阶段快速迭代，可能出现破坏兼容性的变更。',
          en: 'Yes, as a developer preview. Official download: the npm package @deepseek-ai/dsh (latest 0.1.0-rc.6, binary dsh, https://www.npmjs.com/package/@deepseek-ai/dsh) and the official GitHub repo deepseek-ai/deepseek-harness (https://github.com/deepseek-ai/deepseek-harness; Chinese README: https://github.com/deepseek-ai/deepseek-harness/blob/master/README.zh.md). Run npx @deepseek-ai/dsh web to start the Web UI, served at http://127.0.0.1:3080 by default. The rc stage iterates fast and may introduce breaking changes.'
        }
      },
      {
        question: {
          zh: 'DeepSeek Harness 对标谁？',
          en: 'Who is DeepSeek Harness competing with?'
        },
        answer: {
          zh: '媒体报道显示其定位是代码智能体与 AI 生产力工具，对标 Anthropic Claude Code 和 OpenAI Codex，覆盖编程与办公场景。最终能力以发布后的实际表现为准。',
          en: 'Media reports position it as a coding agent and AI productivity tool competing with Anthropic Claude Code and OpenAI Codex across programming and office scenarios. Final capability depends on the shipped product.'
        }
      },
      {
        question: {
          zh: '怎么下载和上手 DeepSeek Harness？',
          en: 'How do I install and try DeepSeek Harness?'
        },
        answer: {
          zh: '先安装 Node.js，然后运行 npx @deepseek-ai/dsh web 启动 Web UI（默认 http://127.0.0.1:3080）；也可以 git clone https://github.com/deepseek-ai/deepseek-harness.git 后按官方 README（https://github.com/deepseek-ai/deepseek-harness/blob/master/README.zh.md）从源码构建。架构为“一切皆插件”，由 Cordis 驱动，官方提供 Web UI 指南和插件开发文档。',
          en: 'Install Node.js first, then run npx @deepseek-ai/dsh web to launch the Web UI (http://127.0.0.1:3080 by default); alternatively git clone https://github.com/deepseek-ai/deepseek-harness.git and build from source per the official README (https://github.com/deepseek-ai/deepseek-harness/blob/master/README.zh.md). The architecture is everything-is-a-plugin, powered by Cordis, with official Web UI and plugin development docs.'
        }
      },
      {
        question: {
          zh: 'WebToMind 和 DeepSeek Harness 是什么关系？',
          en: 'What is the relationship between WebToMind and DeepSeek Harness?'
        },
        answer: {
          zh: '无关联。WebToMind 只承接关键词检索与创作者工作流内容，帮助用户把热点资料转成可复用的研究模板和内容素材。',
          en: 'None. WebToMind only serves the search intent and creator workflows, helping users turn hot-topic research into reusable templates and content assets.'
        }
      }
    ]
  },
  {
    slug: 'xiaohongshu-cover-series',
    title: {
      zh: '小红书 9:16 AI 封面系列怎么做',
      en: 'How to make 9:16 Xiaohongshu cover image series with AI'
    },
    summary: {
      zh: '固定写真风格和镜头，只换姿态、背景和主题，快速做统一调性的封面系列。',
      en: 'Lock photo style and lens, then swap pose, background and topic for consistent RED covers.'
    },
    steps: [
      {
        zh: '选择 9:16 竖图构图，确定封面主体和留白区域。',
        en: 'Choose a 9:16 vertical composition and define subject and whitespace.'
      },
      {
        zh: '锁定镜头、光影和风格 slot，让系列封面视觉一致。',
        en: 'Lock lens, lighting and style slots for consistent cover visuals.'
      },
      {
        zh: '批量替换场景和姿态，生成多张可 A/B 测试的封面。',
        en: 'Batch-swap scenes and poses to generate cover options for A/B testing.'
      }
    ]
  },
  {
    slug: 'personal-asset-library',
    title: {
      zh: '构建自己的私有 AI 图片素材库',
      en: 'Build your private AI image prompt asset library'
    },
    summary: {
      zh: '上传作品当素材，一键 AI 重生缩略图，统一风格，后续按 slot 复用。',
      en: 'Upload past works as assets, regenerate thumbnails, and reuse them by visual slot.'
    },
    steps: [
      {
        zh: '把成功出图或参考图拆成角色、服装、镜头、风格素材。',
        en: 'Split successful outputs or references into character, wardrobe, lens and style assets.'
      },
      {
        zh: '补齐标题、分类和缩略图，保证素材可搜索可识别。',
        en: 'Add titles, categories and thumbnails so assets are searchable and recognizable.'
      },
      {
        zh: '后续创作时直接组合素材，减少从零写 prompt。',
        en: 'Reuse assets in future work instead of writing prompts from scratch.'
      }
    ],
    faq: [
      {
        question: {
          zh: '素材库里的图会一直保留吗？',
          en: 'Are library assets kept forever?'
        },
        answer: {
          zh: '已保存的素材与生成历史按账号保留，作为后续重编和复用的输入。',
          en: 'Saved assets and generation history stay with your account as inputs for future re-editing and reuse.'
        }
      },
      {
        question: {
          zh: '缩略图重生有什么用途？',
          en: 'What is thumbnail regeneration for?'
        },
        answer: {
          zh: '让旧素材统一风格、补充细节或更换比例，再进入新的创作流程。',
          en: 'It unifies style, adds detail or changes the ratio of older assets before new workflows.'
        }
      },
      {
        question: {
          zh: '素材如何按 slot 复用？',
          en: 'How do assets get reused by slot?'
        },
        answer: {
          zh: '把素材归类为主体、参考、场景与风格，生成时按字段取用，避免每次重新找图。',
          en: 'Categorize them as subject, reference, scene or style and pull per field during generation instead of searching anew each time.'
        }
      }
    ]
  },
  {
    slug: 'history-reedit-loop',
    title: {
      zh: '历史作品一键重新编辑',
      en: 'Re-edit any past AI image output in one click'
    },
    summary: {
      zh: '恢复历史图片的 slot、prompt 和模型参数，继续微调再生成。',
      en: 'Restore the slot combo, prompt and model settings from image history to fine-tune and regenerate.'
    },
    steps: [
      {
        zh: '打开历史图片预览，查看当时的 prompt 和参数。',
        en: 'Open a history preview and inspect the original prompt and settings.'
      },
      {
        zh: '一键回填到创作台，保留可复现上下文。',
        en: 'Send it back to the studio while preserving reproducible context.'
      },
      {
        zh: '只修改需要迭代的表情、背景、服装或构图。',
        en: 'Only change the expression, background, wardrobe or composition that needs iteration.'
      }
    ],
    faq: [
      {
        question: {
          zh: '历史重编和重新生成有什么区别？',
          en: 'What is the difference between re-editing and regenerating?'
        },
        answer: {
          zh: '重编复用已通过的 prompt 与参数，只改目标字段，结果更可控、积分消耗更低。',
          en: 'Re-editing reuses an accepted prompt and settings, changing only the target field, which is more controllable and costs fewer credits.'
        }
      },
      {
        question: {
          zh: '什么样的历史值得保存？',
          en: 'What history is worth keeping?'
        },
        answer: {
          zh: '通过验收的结果、参数、参考图和失败样本都值得保存；失败样本用于反推不可行组合。',
          en: 'Accepted results, settings, references and failed samples; failures help you learn which combinations do not work.'
        }
      },
      {
        question: {
          zh: '重编后结果变差了怎么办？',
          en: 'What if the re-edit turns out worse?'
        },
        answer: {
          zh: '回到上一版本对比，单独调整差异字段，而不是一次性大改。',
          en: 'Compare with the previous version and adjust one field at a time instead of sweeping changes.'
        }
      }
    ]
  },
  {
    slug: 'ai-product-image-generation',
    title: {
      zh: 'AI 商品图与场景海报生成',
      en: 'AI product image and scene poster generation'
    },
    summary: {
      zh: '把产品主体、模特姿态、背景场景、光影和版式拆成 slot，快速生成电商主图、KV 和社媒海报。',
      en: 'Split product subject, model pose, background, lighting and layout into slots to generate ecommerce hero images, KVs and social posters.'
    },
    steps: [
      {
        zh: '固定产品主体和卖点，避免画面偏题。',
        en: 'Lock product subject and selling point to keep the image on brief.'
      },
      {
        zh: '选择场景、光影和版式，建立商业图片结构。',
        en: 'Choose scene, lighting and layout to build a commercial image structure.'
      },
      {
        zh: '批量生成不同主题版本，用于主图、KV 和社媒测试。',
        en: 'Generate variations for hero images, KVs and social testing.'
      }
    ],
    faq: [
      {
        question: {
          zh: '商品图生成最容易失败的参数是什么？',
          en: 'What fails most in product image generation?'
        },
        answer: {
          zh: '主体与背景混淆、光影冲突。把产品主体固定，让背景只承担氛围，版式预留文案区，失败率会明显下降。',
          en: 'Mixing subject and background, or conflicting lighting. Keep the product fixed, let the background only set mood, and reserve layout space for copy.'
        }
      },
      {
        question: {
          zh: '一定要用参考图吗？',
          en: 'Do I need a reference image?'
        },
        answer: {
          zh: '有实拍图时强烈建议使用；没有实拍图时先用文字锁定材质与角度，再小批量验证。',
          en: 'Strongly recommended when you have a real photo; otherwise lock material and angle in text and validate in a small batch.'
        }
      },
      {
        question: {
          zh: '如何保证一批商品图风格一致？',
          en: 'How do I keep a batch visually consistent?'
        },
        answer: {
          zh: '固定一套场景加光影加构图模板，每件商品只替换主体与卖点字段。',
          en: 'Keep one scene plus lighting plus composition template and swap only the subject and selling point per product.'
        }
      }
    ]
  },
  {
    slug: 'consistent-ai-character-images',
    title: {
      zh: '稳定角色形象的 AI 连续出图',
      en: 'Consistent AI character images for visual series'
    },
    summary: {
      zh: '固定角色脸型、发型、妆容和镜头，只替换表情、姿态、服装或场景。',
      en: 'Lock face, hair, makeup and lens, then swap expression, pose, wardrobe or scene.'
    },
    steps: [
      {
        zh: '先固定角色识别信息，例如脸型、发型、妆容和镜头。',
        en: 'Lock character identity details such as face, hair, makeup and lens.'
      },
      {
        zh: '只替换单个变量，减少角色漂移。',
        en: 'Change one variable at a time to reduce character drift.'
      },
      {
        zh: '把稳定组合保存为角色模板。',
        en: 'Save stable combinations as character templates.'
      }
    ],
    faq: [
      {
        question: {
          zh: '为什么角色还是会"变脸"？',
          en: 'Why does the character still drift?'
        },
        answer: {
          zh: '多数是因为同时改了多个字段。把脸型、发型、妆容和镜头作为识别点锁定，每次只改一个变量。',
          en: 'Usually because several fields changed at once. Lock face shape, hair, makeup and lens as identity cues and change one variable at a time.'
        }
      },
      {
        question: {
          zh: '角色模板和参考图怎么配合？',
          en: 'How do character templates and references combine?'
        },
        answer: {
          zh: '参考图锁定外观，角色模板保存识别点，生成时两者同时传入，漂移最小。',
          en: 'The reference locks the look, the template stores identity cues, and both are passed in together for minimal drift.'
        }
      },
      {
        question: {
          zh: '系列图需要多一致才算合格？',
          en: 'How much consistency is enough?'
        },
        answer: {
          zh: '对系列用途，识别点（脸型、发型、妆容、镜头）在 4 张以上保持一致，再扩展场景。',
          en: 'For series work, keep identity cues consistent across at least four images before expanding scenes.'
        }
      }
    ]
  },
  {
    slug: 'ai-prompt-asset-library',
    title: {
      zh: '把好 prompt 沉淀成可复用素材库',
      en: 'Turn good prompts into a reusable AI prompt asset library'
    },
    summary: {
      zh: '把成功出图里的角色、服装、镜头、风格拆成私有素材，团队后续直接组合。',
      en: 'Save successful character, wardrobe, lens and style prompts as private assets for future recombination.'
    },
    steps: [
      {
        zh: '从成功作品中提取可复用 prompt 片段。',
        en: 'Extract reusable prompt parts from successful outputs.'
      },
      {
        zh: '按 slot 归档，避免一整段 prompt 难以复用。',
        en: 'Archive by slot instead of storing one long prompt paragraph.'
      },
      {
        zh: '在新作品中组合旧素材，提高稳定性。',
        en: 'Combine existing assets in new work to improve stability.'
      }
    ]
  },
  {
    slug: 'regenerate-ai-images-from-history',
    title: {
      zh: '从历史图片继续重编和再生成',
      en: 'Regenerate AI images from previous history'
    },
    summary: {
      zh: '恢复历史作品的 prompt、slot 和模型参数，继续微调表情、背景或构图。',
      en: 'Restore the prompt, slots and model settings from image history, then continue tuning expression, background or composition.'
    },
    steps: [
      {
        zh: '选择一张历史图，恢复当时的完整创作上下文。',
        en: 'Pick a previous image and restore its full creation context.'
      },
      {
        zh: '保留有效参数，只调整本次目标变量。',
        en: 'Keep effective settings and change only the target variable.'
      },
      {
        zh: '生成新版本后继续沉淀为模板或素材。',
        en: 'Generate a new version and save it as a template or asset.'
      }
    ]
  },
  {
    slug: 'bead-pattern-pet-portrait',
    title: {
      zh: '拼豆宠物肖像图纸怎么做',
      en: 'How to make a bead pattern from a pet photo'
    },
    summary: {
      zh: '把宠物照片转成拼豆肖像图纸：选色板、控制珠子宽度、清理背景，生成可打印图纸与材料清单。',
      en: 'Turn a pet photo into a printable bead portrait with palette matching, grid control, background cleanup and a material list.'
    },
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
    faq: [
      {
        question: {
          zh: '宠物照片用什么尺寸效果最好？',
          en: 'What pet photo size works best?'
        },
        answer: {
          zh: '正方形或 4:3 的正面照最好，宽度建议 50-100 珠；太小的图细节会被合并。',
          en: 'Square or 4:3 front-facing photos work best at 50-100 beads wide.'
        }
      },
      {
        question: {
          zh: '深色毛发的宠物怎么出图更清楚？',
          en: 'How do I get better results for dark fur?'
        },
        answer: {
          zh: '提高图片亮度或选择深色更丰富的色板，并把合并阈值调低，避免黑色毛变成一团。',
          en: 'Brighten the photo, use a palette with more dark tones, and keep the merge threshold low.'
        }
      }
    ]
  },
  {
    slug: 'bead-pattern-anime-fanart',
    title: {
      zh: '拼豆同人角色图纸怎么做',
      en: 'How to make an anime or fan-art bead pattern'
    },
    summary: {
      zh: '把动漫角色、像素画或周边图案转成拼豆图纸，用主色像素化和色板匹配还原角色配色。',
      en: 'Convert anime characters, pixel art or icon designs into bead charts with faithful brand-palette colors.'
    },
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
    faq: [
      {
        question: {
          zh: '同人图可以直接商用吗？',
          en: 'Can fan-art bead patterns be sold?'
        },
        answer: {
          zh: '取决于原作版权与平台规则，自用和送礼通常没问题，商用前请确认授权。',
          en: 'Check the original work license and platform rules before commercial use.'
        }
      }
    ]
  },
  {
    slug: 'bead-pattern-kids-craft',
    title: {
      zh: '拼豆亲子手工和课堂图纸怎么做',
      en: 'Bead patterns for kids crafts and classrooms'
    },
    summary: {
      zh: '为孩子或课堂准备低难度拼豆图纸：降低颜色数、控制图纸尺寸，打印带色号的图纸直接上手。',
      en: 'Prepare beginner-friendly bead charts for kids and classrooms: fewer colors, smaller grids and printable coded charts.'
    },
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
    faq: [
      {
        question: {
          zh: '孩子几岁可以玩拼豆？',
          en: 'What age can start bead crafts?'
        },
        answer: {
          zh: '建议 6 岁以上并在大人陪同下使用，熨烫环节必须由成人完成。',
          en: 'From about age 6 with adult supervision; ironing must be done by an adult.'
        }
      }
    ]
  },
  {
    slug: 'bead-pattern-pixel-art',
    title: {
      zh: '拼豆像素画图纸怎么做',
      en: 'How to make a pixel-art bead pattern'
    },
    summary: {
      zh: '把像素画或点阵图还原成拼豆图纸，用平均色与主色模式保持像素边界，适合游戏角色和复古图案。',
      en: 'Rebuild pixel art and sprite images as bead charts while keeping crisp pixel edges for game characters and retro designs.'
    },
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
    faq: [
      {
        question: {
          zh: '像素画用什么色板更还原？',
          en: 'Which palette suits pixel art best?'
        },
        answer: {
          zh: 'MARD 291 色覆盖最广，复古 8-bit 风格也可以先用 Perler 基础色板快速出稿。',
          en: 'MARD 291 covers the widest range; Perler basics are fine for quick retro drafts.'
        }
      }
    ]
  },
  {
    slug: 'nsfw-prompts-guide',
    title: {
      zh: 'NSFW Prompts 是什么意思？AI 生图平台能做什么、不能做什么',
      en: 'What Are NSFW Prompts? What AI Image Platforms Can and Cannot Do'
    },
    summary: {
      zh: 'NSFW 在 AI 生图语境里常被当作「有张力但不露骨」的宽泛标签。本文说明 NSFW prompt 的真实含义、平台内容边界，以及如何用非露骨审美向 prompt 获得稳定结果。',
      en: 'In AI image generation, NSFW is often used loosely for images with varying intensity. This guide explains what NSFW prompts really mean, platform content boundaries, and how to get stable results with non-explicit, tasteful prompts.'
    },
    steps: [
      {
        zh: '先明确边界：只用明确成年主体、完整衣着和非露骨描述；明确色情、裸露、未成年内容和名人肖像会被平台直接拦截。',
        en: 'Set the boundary first: use only clearly adult subjects, fully covered wardrobe and non-explicit wording; explicit sexual content, nudity, underage content and celebrity likeness are blocked.'
      },
      {
        zh: '用光、材质和氛围表达张力：丝缎、纱帘、晨光、泳装编辑、晚礼服棚拍比露骨描述稳定得多。',
        en: 'Express intensity through light, fabric and atmosphere: satin, sheer curtains, morning light, swimwear editorial and evening-gown studio looks are far more stable than explicit wording.'
      },
      {
        zh: '把「避免」类约束统一放进 negative prompt：避免儿童感、露骨、水印、可读文字和过度磨皮。',
        en: 'Put all avoid-type constraints in the negative prompt: avoid childlike appearance, explicit content, watermarks, readable text and over-smoothing.'
      },
      {
        zh: '保存成功组合为模板，把 NSFW 搜索意图转化为可复用的 boudoir、glamour、泳装等审美向案例。',
        en: 'Save winning combos as templates and turn NSFW search intent into reusable boudoir, glamour or swimwear cases.'
      }
    ],
    faq: [
      {
        question: {
          zh: 'NSFW prompts 是什么意思？',
          en: 'What does NSFW prompts mean?'
        },
        answer: {
          zh: 'NSFW（Not Safe For Work）在 AI 生图里是一个宽泛标签，覆盖从「有张力但不露骨」到「明确色情」的整段区间。真正搜索 NSFW 词的用户，很多其实要的是前者：boudoir、glamour、泳装和氛围感写真。',
          en: 'NSFW (Not Safe For Work) is a loose label in AI image generation covering everything from tasteful-but-intense to explicit. Many people searching NSFW terms actually want the former: boudoir, glamour, swimwear and moody portraits.'
        }
      },
      {
        question: {
          zh: 'WebToMind 能生成 NSFW 内容吗？',
          en: 'Can WebToMind generate NSFW content?'
        },
        answer: {
          zh: '不能。WebToMind 只生成合法 SFW 内容：泳装、内衣电商、boudoir、glamour 等审美向内容可以生成，但明确色情、裸露、未成年内容和名人肖像会被直接拦截。这是模型服务商、支付渠道和平台政策的共同要求。',
          en: 'No. WebToMind only generates legal SFW content: swimwear, lingerie e-commerce, boudoir and glamour are supported, but explicit sexual content, underage content and celebrity likeness are blocked, per model providers, payment processors and platform policy.'
        }
      },
      {
        question: {
          zh: '为什么「性感但不露骨」的 prompt 更稳定？',
          en: 'Why are tasteful-but-intense prompts more reliable?'
        },
        answer: {
          zh: '露骨描述会同时触发输入审核和输出安全判定，结果不稳定；用光、材质和构图表达张力，生成成功率和一致性都更高。',
          en: 'Explicit wording triggers both input moderation and output safety checks, making results unstable; expressing intensity through light, fabric and composition yields much higher success and consistency.'
        }
      },
      {
        question: {
          zh: '怎么写泳装/内衣类 prompt？',
          en: 'How do I write swimwear or lingerie prompts?'
        },
        answer: {
          zh: '用品牌编辑或电商商品图框架：明确成年主体、完整或平铺呈现、具体场景和光线，把「避免露骨/儿童感/水印」放进 negative prompt。这类内容属中等风险，可能走保守模型回退。',
          en: 'Use an editorial or e-commerce framing: adult subject, fully covered or flat-lay presentation, concrete scene and light, with avoid-explicit, childlike and watermark constraints in the negative prompt. These are medium-risk and may use a conservative model fallback.'
        }
      },
      {
        question: {
          zh: '只想要合法内容，应该搜什么词？',
          en: 'Which terms should I search if I only want legal content?'
        },
        answer: {
          zh: '用 boudoir prompts、glamour prompts、swimwear photoshoot prompts、私房写真提示词、泳装写真提示词这类词，结果更稳定，也更接近你真正想要的内容。',
          en: 'Search boudoir prompts, glamour prompts, swimwear photoshoot prompts and editorial portrait prompts instead - results are more stable and closer to what you actually want.'
        }
      }
    ],
    relatedLinks: [
      {
        path: '/boudoir-prompts',
        title: {
          zh: 'Boudoir Prompts 与私房写真提示词',
          en: 'Boudoir Prompts for Tasteful AI Portraits'
        },
        description: {
          zh: '丝缎、晨光、纱帘等非露骨私房写真 prompt 案例。',
          en: 'Tasteful non-explicit boudoir prompt cases with satin, morning light and sheer curtains.'
        }
      },
      {
        path: '/glamour-prompts',
        title: {
          zh: 'Glamour Prompts 与魅力写真提示词',
          en: 'Glamour Prompts for AI Portrait Photography'
        },
        description: {
          zh: '晚礼服、红毯、棚拍等魅力写真 prompt 结构与案例。',
          en: 'Evening gown, red carpet and studio glamour prompt structures and cases.'
        }
      },
      {
        path: '/portrait-prompts',
        title: {
          zh: 'Portrait Prompts 与 AI 写真案例',
          en: 'Portrait Prompt Examples for Realistic AI Photos'
        },
        description: {
          zh: '覆盖真人摄影、人像光影、姿态、服装和角色写真。',
          en: 'Realistic AI portrait prompt examples covering lighting, pose, wardrobe and character photography.'
        }
      },
      {
        path: '/ai-photo-prompts',
        title: {
          zh: 'AI Photo Prompts 与真实摄影提示词',
          en: 'AI Photo Prompt Examples for Realistic Images'
        },
        description: {
          zh: '可复用的镜头、光影、质感结构。',
          en: 'Reusable lens, lighting and texture structures.'
        }
      }
    ]
  }
];

export const SEO_BLOG_POSTS: SeoBlogPost[] = [
  {
    slug: 'ai-zhuanshu-card',
    title: {
      zh: 'AI专属卡是什么？从 AI 支付到 AI 工具消费预算',
      en: 'What is an AI dedicated card? From AI payments to AI tool budgets'
    },
    excerpt: {
      zh: 'AI专属卡的核心不是“再办一张卡”，而是给 AI Agent 设定授权、限额、Full access 权益和可追踪预算。WebToMind 不提供微信支付 AI 专属卡，只承接 AI 创作积分和成本管理需求。',
      en: 'An AI dedicated card is about authorization, limits and traceable budgets, not another payment card. WebToMind handles AI credits, not card issuing.'
    },
    body: [
      {
        zh: '问：AI 专属卡和 WebToMind 积分有什么区别？答：AI 专属卡解决的是给 AI 工具充值的支付通道问题；WebToMind 不发行卡片，直接用积分和会员承接创作消耗，剩余额度和账单都在账户里可见。',
        en: 'Q: What is the difference between an AI dedicated card and WebToMind credits? A: A dedicated card solves the payment channel for AI tools; WebToMind does not issue cards and instead tracks AI creation credits and membership in your account.'
      },
      {
        zh: '问：AI 工具的创作预算怎么管？答：把单次生成成本（按模型和时长）与月度积分上限对齐，先定预算再生成；WebToMind 的积分与会员方案见定价页。',
        en: 'Q: How do I manage an AI creation budget? A: Align the cost per generation (model and duration) with a monthly credit cap, then plan before generating. WebToMind credit and membership plans are on the pricing page.'
      }
    ],
    cta: {
      title: {
        zh: '查看积分与会员方案',
        en: 'View credits & membership plans'
      },
      href: '/pricing',
      kind: 'view_pricing'
    },
    date: '2026-06-17',
    author: { zh: 'WebToMind 团队', en: 'WebToMind Team' }
  },
  {
    slug: 'mona-lisa-1-openai-image-model-guide',
    title: {
      zh: 'mona-lisa-1 是什么？OpenAI 新图像模型提示词指南',
      en: 'What is mona-lisa-1? OpenAI new image model prompt guide'
    },
    excerpt: {
      zh: 'mona-lisa-1 于 2026 年 8 月匿名出现在 LMArena，经 SynthID 水印验证来自 OpenAI，官方尚未官宣。本文整理已知信息、与 GPT Image 2 的差异和可直接迁移的 prompt 结构。',
      en: 'mona-lisa-1 appeared anonymously on LMArena in August 2026 and was verified as OpenAI output through the SynthID watermark, with no official announcement yet. This guide covers what is known, differences from GPT Image 2 and portable prompt structure.'
    },
    body: [
      {
        zh: '问：mona-lisa-1 是官方发布的模型吗？答：不是。它于 2026 年 8 月 9 日前后匿名出现在 LMArena 图像竞技场，网友通过 OpenAI SynthID 校验确认生成图带水印，因此判断来自 OpenAI。截至 2026 年 8 月 13 日，OpenAI 官方公开的最新图像模型仍是 GPT Image 2，mona-lisa-1 不在正式产品和 API 文档中。',
        en: "Q: Is mona-lisa-1 an officially released model? A: No. It appeared anonymously on the LMArena image arena around August 9, 2026. Users verified its outputs carry the OpenAI SynthID watermark, indicating OpenAI origin. As of August 13, 2026, OpenAI's latest publicly documented image model is still GPT Image 2; mona-lisa-1 is not in official products or API docs."
      },
      {
        zh: '问：社区实测说了什么？答：真实感提升、皮肤“塑料感”减少、细节更丰富，绘制艺术作品和复杂信息图表现突出；部分测试者反馈动漫和角色跨角度一致性比 GPT Image 2 更强。这些均来自匿名盲测反馈，正式能力以官方说明为准。',
        en: 'Q: What do community tests say? A: Improved realism, less plastic-looking skin, richer detail, and strong performance on art and complex infographics; some testers report better anime and character consistency across angles than GPT Image 2. These are anonymous blind-test observations; final capability follows official documentation.'
      },
      {
        zh: '问：现在能做什么准备？答：用可迁移的 slot 结构写 prompt，把主体、场景、镜头、光影、材质、风格和负面约束分开维护；保留模型、尺寸、质量和负面词，和 GPT Image 2 用同一结构横向对比。官方发布后，把稳定结果直接复用或继续小步迭代。',
        en: 'Q: What can I prepare now? A: Write prompts with a portable slot structure, keeping subject, scene, lens, lighting, material, style and negative constraints separate; save model, size, quality and negatives, and compare the same structure against GPT Image 2. After the official release, reuse stable results or iterate in small steps.'
      },
      {
        zh: '问：传闻它是 GPT Image 2.5 中杯版本吗？答：社区根据知识截止时间（与 GPT Image 2 相同，2025 年 12 月）推测它是同地基上的新 checkpoint，可能是 GPT Image 2.5 的“中杯”版本，但未经 OpenAI 证实。',
        en: 'Q: Is it rumored to be a mid-size GPT Image 2.5? A: Based on the matching knowledge cutoff (December 2025, same as GPT Image 2), the community speculates it is a new checkpoint on the same foundation, possibly a mid-size GPT Image 2.5. This is not confirmed by OpenAI.'
      }
    ],
    cta: {
      title: {
        zh: '查看 mona-lisa-1 提示词案例',
        en: 'View mona-lisa-1 prompt examples'
      },
      href: '/mona-lisa-1-prompts',
      kind: 'browse_prompts'
    },
    date: '2026-08-13',
    author: { zh: 'WebToMind 团队', en: 'WebToMind Team' }
  },
  {
    slug: 'deepseek-harness-what-is-guide',
    title: {
      zh: 'DeepSeek Harness 是什么？Agent 时代的工作流准备指南',
      en: 'What is DeepSeek Harness? A guide to agent-era workflows'
    },
    excerpt: {
      zh: 'DeepSeek Harness 已上线开发者预览：npm 包 @deepseek-ai/dsh 与 GitHub 仓库 deepseek-ai/deepseek-harness，运行 npx @deepseek-ai/dsh web 即可启动。本文说明 Model+Harness=Agent 的含义、下载方式和 Agent 时代工作流。',
      en: 'DeepSeek Harness is live as a developer preview: the npm package @deepseek-ai/dsh and the GitHub repo deepseek-ai/deepseek-harness; run npx @deepseek-ai/dsh web to start. This guide explains Model + Harness = Agent, how to install it and agent-era workflows.'
    },
    body: [
      {
        zh: '问：Model+Harness=Agent 是什么意思？答：模型只负责理解、推理和生成；把工具调用、上下文管理、任务状态、错误回滚和结果验证接进来的整套执行系统就是 Harness。DeepSeek 官方招聘中明确表示，除模型本身以外的所有工作都属于 Harness 的范畴。',
        en: 'Q: What does Model + Harness = Agent mean? A: The model only understands, reasons and generates; the execution system that adds tool calling, context management, task state, error rollback and result verification is the Harness. DeepSeek official recruiting states that everything besides the model belongs to the Harness.'
      },
      {
        zh: '问：怎么下载 DeepSeek Harness？答：2026 年 8 月 13 日官方上线开发者预览：npm 包 @deepseek-ai/dsh（最新 0.1.0-rc.6，命令 dsh，https://www.npmjs.com/package/@deepseek-ai/dsh）和 GitHub 官方仓库 deepseek-ai/deepseek-harness（https://github.com/deepseek-ai/deepseek-harness，中文文档：https://github.com/deepseek-ai/deepseek-harness/blob/master/README.zh.md）。安装 Node.js 后运行 npx @deepseek-ai/dsh web，Web UI 默认地址是 http://127.0.0.1:3080；也可以从源码构建。',
        en: 'Q: How do I download DeepSeek Harness? A: On August 13, 2026 DeepSeek launched the developer preview: the npm package @deepseek-ai/dsh (latest 0.1.0-rc.6, binary dsh, https://www.npmjs.com/package/@deepseek-ai/dsh) and the official GitHub repo deepseek-ai/deepseek-harness (https://github.com/deepseek-ai/deepseek-harness; Chinese docs: https://github.com/deepseek-ai/deepseek-harness/blob/master/README.zh.md). Install Node.js, run npx @deepseek-ai/dsh web, and the Web UI serves at http://127.0.0.1:3080 by default; building from source is also supported.'
      },
      {
        zh: '问：创作者现在能做什么？答：直接上手试用 dsh，并把 Agent 时代的新词整理成可复用素材：资料卡记录来源和日期，关键词组覆盖解释型、动态型、对比型和工具型意图；用 WebToMind 把资料转成研究模板、提示词 brief 和内容大纲。',
        en: 'Q: What can creators do now? A: Try dsh directly and turn the new agent-era vocabulary into reusable assets: research cards with source and date, keyword groups covering explainer, news, comparison and tooling intent; use WebToMind to turn research into templates, prompt briefs and outlines.'
      },
      {
        zh: '问：现在版本稳定吗？答：当前是开发者预览（rc 版本），官方明确提示快速迭代、未来可能出现破坏兼容性的变更，生产环境使用前请关注版本更新和官方文档。',
        en: 'Q: Is the current version stable? A: It is a developer preview (rc releases); DeepSeek warns that it iterates rapidly and may introduce breaking changes, so check release notes and official docs before production use.'
      }
    ],
    cta: {
      title: {
        zh: '查看 DeepSeek Harness 工作流指南',
        en: 'View the DeepSeek Harness workflow guide'
      },
      href: '/blog/deepseek-harness-agent-workflow-guide',
      kind: 'view_workflow'
    },
    date: '2026-08-13',
    author: { zh: 'WebToMind 团队', en: 'WebToMind Team' }
  },
  {
    slug: 'why-ai-image-generation-needs-slots',
    title: {
      zh: '为什么 AI 图片生成需要 slot 化工作流',
      en: 'Why AI image generation needs a slot-based workflow'
    },
    excerpt: {
      zh: '把角色、服装、镜头、风格拆成可复用 slot，比每次重写 prompt 更稳定。',
      en: 'Splitting character, wardrobe, lens and style into reusable slots is more stable than rewriting prompts every time.'
    },
    body: [
      {
        zh: '每次重写 prompt 的最大问题不是形容词不够多，而是变量失控：角色、镜头、光影、材质和版式混在一起，改一个参数就可能牵动整张图。slot 化把 prompt 拆成稳定字段，每次只替换目标变量。',
        en: 'The biggest problem with rewriting prompts every time is variable drift: subject, lens, lighting, material and layout blur together, so changing one setting can change the whole image. Slotting splits the prompt into stable fields and lets you swap only the variable you want.'
      },
      {
        zh: '一套可复用的 slot 结构至少包含：主体与识别点、场景与背景、镜头与视角、光影与氛围、材质与质感、风格与参考、版式与文字、负面约束。留空的字段也是明确选择，而不是随机漂移。',
        en: 'A reusable slot structure covers at least subject and identity cues, scene and background, lens and angle, lighting and mood, material and texture, style and references, layout and text, and negative constraints. An empty slot is an explicit choice, not random drift.'
      },
      {
        zh: '在 WebToMind 中，slot 化工作流与参考图、角色模板和历史记录配合：先固定角色识别信息，保存有效 prompt 与模型参数，后续从历史继续微调。',
        en: 'In WebToMind, slot-based workflows combine with reference images, character templates and history: lock identity first, save the winning prompt and model settings, then keep editing from history.'
      },
      {
        zh: '长期收益是可复现性：同一套 slot 可以产出系列封面、商品图、角色立绘和分镜，而不是每次从零开始赌一次生成。',
        en: 'The payoff is reproducibility: the same slots can produce cover series, product images, character sheets and storyboard frames instead of gambling on every single generation.'
      }
    ],
    date: '2026-06-01',
    author: { zh: 'WebToMind 团队', en: 'WebToMind Team' }
  },
  {
    slug: 'reverse-engineer-any-portrait-reference',
    title: {
      zh: '如何从参考图反推可复现的人像 prompt',
      en: 'How to reverse-engineer reproducible portrait prompts from references'
    },
    excerpt: {
      zh: '从参考图提取角色、姿态、服装、镜头和光影，让灵感变成可复用提示词资产。',
      en: 'Extract character, pose, wardrobe, lens and lighting from a reference so inspiration becomes reusable prompt assets.'
    },
    date: '2026-06-02',
    author: { zh: 'WebToMind 团队', en: 'WebToMind Team' }
  },
  {
    slug: 'project-instructions-power-user-guide',
    title: {
      zh: '项目级指令如何稳定 AI 图片风格',
      en: 'How project instructions stabilize AI image style'
    },
    excerpt: {
      zh: '用项目级指令沉淀品牌调性、禁忌和输出格式，减少每次生成的随机漂移。',
      en: 'Use project-level instructions to preserve brand tone, constraints and output format across generations.'
    },
    body: [
      {
        zh: '项目级指令解决"每次都要重复交代背景"的问题：品牌调性、画面禁忌、输出格式和参考对象写进项目设置后，后续生成自动继承。',
        en: 'Project-level instructions solve the cost of re-explaining context: brand tone, visual constraints, output format and reference objects live in the project settings and apply to every generation.'
      },
      {
        zh: '好的项目指令通常分三层：风格基线（色调、字体、构图习惯）、内容规则（哪些元素不能出现、产品必须如何呈现）、输出约束（比例、分辨率、命名）。',
        en: 'A strong project instruction has three layers: a style baseline (palette, typography, composition habits), content rules (what must never appear, how products must be shown), and output constraints (aspect ratio, resolution, naming).'
      },
      {
        zh: '把项目指令与角色模板、情绪板组合使用：指令定义"怎么画"，角色模板定义"画谁"，情绪板定义"像什么风格"，三者共同减少随机漂移。',
        en: 'Combine project instructions with character templates and moodboards: instructions define how to draw, characters define who, and moodboards define the visual language. Together they cut drift.'
      },
      {
        zh: '团队协作时，项目指令还承担交接文档的作用：新成员打开项目即可复现同一套视觉语言，而不需要逐条复制聊天记录。',
        en: 'For teams, project instructions double as handover documentation: a new member can reproduce the same visual language without copying chat history line by line.'
      }
    ],
    date: '2026-06-03',
    author: { zh: 'WebToMind 团队', en: 'WebToMind Team' }
  },
  {
    slug: 'thumbnail-consistency-secret',
    title: {
      zh: '封面图一致性的关键不是重写 prompt',
      en: 'The secret to thumbnail consistency is not rewriting prompts'
    },
    excerpt: {
      zh: '固定视觉结构和可替换变量，能让系列封面更稳定、更容易批量产出。',
      en: 'Locking visual structure and replaceable variables makes thumbnail series more stable and scalable.'
    },
    date: '2026-06-04',
    author: { zh: 'WebToMind 团队', en: 'WebToMind Team' }
  },
  {
    slug: 'ai-portrait-prompt-generator-workflow',
    title: {
      zh: 'AI 写真提示词生成器工作流',
      en: 'AI portrait prompt generator workflow'
    },
    excerpt: {
      zh: '用 slot 组合方法生成可复现 AI 写真提示词。',
      en: 'Use slot composition to generate reproducible AI portrait prompts.'
    },
    date: '2026-06-05',
    author: { zh: 'WebToMind 团队', en: 'WebToMind Team' }
  },
  {
    slug: 'ai-product-image-generation-workflow',
    title: {
      zh: 'AI 商品图生成工作流',
      en: 'AI product image generation workflow'
    },
    excerpt: {
      zh: '把商品图拆成主体、场景、光影和版式，提高商业图生成稳定性。',
      en: 'Split product visuals into subject, scene, lighting and layout to stabilize commercial image generation.'
    },
    body: [
      {
        zh: '商品图最容易翻车的地方，是把主体、场景、光影和版式混在一个超长 prompt 里。把商品图拆成四个固定字段：主体与卖点、背景与场景、光影与质感、构图与文字。',
        en: 'Product images fail most often when subject, scene, lighting and layout are merged into one oversized prompt. Split them into fixed fields: subject and selling point, background and scene, lighting and texture, composition and text.'
      },
      {
        zh: '主体字段写清楚产品是什么、核心卖点如何呈现（例如开口角度、材质反光）；背景字段决定氛围；光影决定立体感；版式字段为电商文案预留位置。',
        en: 'The subject field names the product and how the core selling point shows — opening angle, material reflection; the background sets mood; lighting creates depth; the layout field reserves space for e-commerce copy.'
      },
      {
        zh: '参考图优先于文字：先上传一张产品实拍图锁定外观，再让 AI 更换背景、道具和光影，比从纯文字描述更稳定。',
        en: 'A reference image beats text: upload a real product photo to lock the look, then let the model swap background, props and lighting.'
      },
      {
        zh: '批量生产时固定一套"商品图模板"（场景加光影加构图），每件商品只替换主体与卖点字段，保证店铺视觉一致。',
        en: 'For batch work, keep one product template — scene plus lighting plus composition — and swap only subject and selling point per item to keep the storefront visually consistent.'
      }
    ],
    date: '2026-06-06',
    author: { zh: 'WebToMind 团队', en: 'WebToMind Team' }
  },
  {
    slug: 'xiaohongshu-ai-cover-image-guide',
    title: {
      zh: '小红书 AI 封面图指南',
      en: 'Xiaohongshu AI cover image guide'
    },
    excerpt: {
      zh: '用 9:16 构图、留白和统一风格批量生成小红书封面。',
      en: 'Use 9:16 composition, whitespace and consistent style to batch-generate Xiaohongshu covers.'
    },
    body: [
      {
        zh: '小红书封面的核心不是"好看"，而是 9:16 竖版的信息密度：封面要在小图状态下能读出主题，同时留白给标题和互动按钮让位。',
        en: 'A Xiaohongshu cover is about 9:16 vertical information density, not just looks: the theme must read at thumbnail size, with whitespace reserved for titles and interaction buttons.'
      },
      {
        zh: '用 AI 批量出封面时，先固定版式结构：主体位置、标题区、留白比例和色彩倾向，再替换每篇笔记的主题变量，例如商品、场景或文案关键词。',
        en: 'When batch-generating covers, lock the layout first — subject position, title area, whitespace ratio and color tendency — then swap only the topic variables of each note.'
      },
      {
        zh: '提示词里建议写清楚：竖版 9:16、主体与位置、背景与道具、光影风格（如柔和自然光）、色彩基调（如奶油色、高对比），以及"顶部/底部预留文字空间"这类版式约束。',
        en: 'Useful prompt slots include vertical 9:16, subject and position, background and props, lighting style such as soft natural light, color mood such as cream or high contrast, and layout constraints like "leave space for text at the top".'
      },
      {
        zh: '生成后把通过验收的封面加入情绪板或角色模板，后续同类选题直接复用版式，只改主题词，效率比逐张重写高很多。',
        en: 'Save accepted covers to a moodboard or character template so the next similar topic reuses the layout and only the topic word changes.'
      }
    ],
    date: '2026-06-07',
    author: { zh: 'WebToMind 团队', en: 'WebToMind Team' }
  },
  {
    slug: 'consistent-ai-character-image-workflow',
    title: {
      zh: 'AI 角色一致性出图工作流',
      en: 'Consistent AI character image workflow'
    },
    excerpt: {
      zh: '固定角色核心识别信息，只替换单个变量，减少角色漂移。',
      en: 'Lock identity details and change one variable at a time to reduce character drift.'
    },
    body: [
      {
        zh: '角色一致性的关键是锁定识别信息：发型、眼睛颜色、服装等特征固定不变，再只替换场景、表情或角度。每次只改一个变量，角色的漂移会明显减少。',
        en: 'The key to character consistency is locking identity details — hairstyle, eye color, outfit — and changing only one variable such as scene, expression or angle at a time.'
      },
      {
        zh: '建立角色锚点：把角色的核心描述写成一段固定文本，后续所有图都复用这段描述。跨场景变体时保持锚点不变，只改场景、光线或镜头字段。',
        en: 'Build a character anchor: write the core description once and reuse it in every image. For cross-scene variants, keep the anchor unchanged and edit only scene, lighting or lens fields.'
      },
      {
        zh: '批量出图时按维度分组：先出同一角色不同场景，再出同一场景不同表情。分组生成便于对比，哪张漂移了可以直接定位到改动字段。',
        en: 'Batch by dimension: generate the same character across scenes first, then the same scene across expressions. Grouping makes drift easy to trace back to the field that changed.'
      },
      {
        zh: '在 WebToMind 中可以从历史记录继续创作：锁定不变的识别字段，修改目标字段，再对比上一版与新版，逐步收敛到稳定的角色表现。',
        en: 'In WebToMind you can continue from history: lock the identity fields, edit the target field, and compare versions until the character is stable.'
      }
    ],
    date: '2026-06-08',
    author: { zh: 'WebToMind 团队', en: 'WebToMind Team' }
  },
  {
    slug: 'regenerate-ai-images-from-history-guide',
    title: {
      zh: '如何从历史图片继续重编 AI 图',
      en: 'How to regenerate AI images from history'
    },
    excerpt: {
      zh: '把历史图变成可恢复的创作配方，继续微调再生成。',
      en: 'Turn previous images into recoverable recipes for continued editing and regeneration.'
    },
    body: [
      {
        zh: 'AI 生成很少一次到位，重编能力决定产出效率。把每次生成的历史保存为可恢复配方（prompt、模型、参数、参考图），下次微调而不是从零开始。',
        en: 'Rarely does a generation land on the first try, so re-editing ability decides throughput. Save every generation as a recoverable recipe — prompt, model, settings, references — and fine-tune instead of starting over.'
      },
      {
        zh: '重编有三种常见路径：换背景或换场景不动主体；换光影或换质感不动构图；换比例或换版式重新裁切并补齐细节。',
        en: 'Three common re-edit paths: swap background or scene while keeping the subject; swap lighting or texture while keeping composition; change ratio or layout and re-crop.'
      },
      {
        zh: '在 WebToMind 中从历史记录继续创作时，先锁定不变的字段（主体、识别点），只修改目标字段，再对比上一版与新版的结果。',
        en: 'When continuing from history in WebToMind, lock the fields that must not change — subject and identity — edit only the target field, and compare the new version against the previous one.'
      },
      {
        zh: '失败也有价值：保存失败参数可以反推哪些组合不可行，长期积累形成你自己的"有效区间"清单。',
        en: 'Failures are useful too: saving failed settings reveals which combinations do not work, and over time you build your own list of reliable ranges.'
      }
    ],
    date: '2026-06-09',
    author: { zh: 'WebToMind 团队', en: 'WebToMind Team' }
  },
  {
    slug: 'pindou-beginner-guide',
    title: {
      zh: '拼豆新手入门指南：从选色板到第一张图纸',
      en: 'Bead pattern beginner guide: from palette choice to your first chart'
    },
    excerpt: {
      zh: '第一次玩拼豆怎么选色板、设图纸宽度、控制颜色数量？这篇入门指南带你 10 分钟做出第一张可打印图纸。',
      en: 'New to fuse beads? Learn how to pick a palette, set grid width and control color count, then make your first printable chart in 10 minutes.'
    },
    body: [
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
    date: '2026-08-11',
    author: { zh: 'WebToMind 团队', en: 'WebToMind Team' }
  },
  {
    slug: 'pindou-ironing-guide',
    title: {
      zh: '拼豆怎么熨：熨烫技巧与常见问题',
      en: 'How to iron fuse beads: techniques and common mistakes'
    },
    excerpt: {
      zh: '拼豆熨烫最容易翻车：温度太高会糊、太低不粘合、冷却太快会卷边。这份熨烫指南覆盖温度、手法和常见问题。',
      en: 'Ironing is where fuse-bead projects usually go wrong: too hot melts, too cool falls apart and fast cooling warps. This guide covers temperature, technique and fixes.'
    },
    body: [
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
    date: '2026-08-11',
    author: { zh: 'WebToMind 团队', en: 'WebToMind Team' }
  },
  {
    slug: 'pindou-printing-guide',
    title: {
      zh: '拼豆图纸怎么打印：300 DPI、A4 分页与蓝图技巧',
      en: 'How to print bead patterns: 300 DPI, A4 pagination and blueprint tips'
    },
    excerpt: {
      zh: '拼豆图纸打印不清楚、格子线糊、色号看不清，都会让拼装返工。这篇指南讲清 300 DPI、A4 分页和蓝图使用方法。',
      en: 'Blurry grids and unreadable color codes cause rework. This guide covers 300 DPI printing, A4 pagination and blueprint tips for bead charts.'
    },
    body: [
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
    date: '2026-08-11',
    author: { zh: 'WebToMind 团队', en: 'WebToMind Team' }
  },
  {
    slug: 'pindou-bead-size-guide',
    title: {
      zh: '拼豆尺寸怎么选：5mm 与 2.6mm 的区别',
      en: 'Which bead size should I pick: 5mm vs 2.6mm'
    },
    excerpt: {
      zh: '5mm 和 2.6mm 拼豆在底板孔径、作品细腻度和难度上差别很大。这篇指南帮你按人群和作品选对尺寸。',
      en: '5mm and 2.6mm beads differ in pegboard size, detail and difficulty. This guide helps you choose the right size for your audience and project.'
    },
    body: [
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
    date: '2026-08-11',
    author: { zh: 'WebToMind 团队', en: 'WebToMind Team' }
  },
  {
    slug: 'mard-bead-color-chart',
    title: {
      zh: 'MARD 拼豆色号对照表（291 色）怎么用',
      en: 'MARD bead color chart (291 colors): how to read and use it'
    },
    excerpt: {
      zh: 'MARD 是拼豆圈常用的大色号体系，共 291 色。了解色号规则，配合拼豆图案生成器按色号精确备料。',
      en: 'MARD is a widely used 291-color fuse-bead system. Learn the code rules and use the bead pattern maker to buy exactly the colors you need.'
    },
    body: [
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
    date: '2026-08-11',
    author: { zh: 'WebToMind 团队', en: 'WebToMind Team' }
  },
  {
    slug: 'pindou-pattern-library',
    title: {
      zh: '拼豆图案大全：从入门图纸到进阶灵感',
      en: 'Fuse bead pattern ideas: from beginner charts to advanced inspiration'
    },
    excerpt: {
      zh: '拼豆图案不知道怎么选？按难度分级整理入门、进阶与灵感方向，并说明照片转图纸的设置与打印参数。',
      en: 'Not sure which bead pattern to start with? A difficulty-ranked collection plus settings for turning photos into printable charts.'
    },
    body: [
      {
        zh: '第一次接触拼豆，最常卡住的问题不是不会拼，而是不知道拼什么。按主题和难度分级准备图纸能减少试错：先完成第一张，再逐步挑战细节作品。',
        en: 'New to fuse beads, the common blocker is deciding what to make, not how to bead. A difficulty-ranked pattern list cuts trial and error: finish one simple chart first, then grow.'
      },
      {
        zh: '新手先从简单图案开始，控制在 30–50 珠宽、6–10 个颜色：水果、像素小图标、字母数字都很适合，用 Perler 或 Hama 基础色板即可，不需要 291 色板。',
        en: 'Start with simple patterns at 30–50 beads wide and 6–10 colors: fruit, pixel icons and letters work well with the Perler or Hama basic palettes.'
      },
      {
        zh: '照片转图纸取决于照片复杂度：背景简单的直接上传用主色模式；背景复杂时先自动去背景；有渐变或肤色时切到 MARD、COCO、漫漫、盼盼或咪小窝 291 色板，过渡更自然。',
        en: 'Turning a photo into a chart depends on its complexity: clean backgrounds upload directly, busy backgrounds need background removal first, and gradients or skin tones benefit from a 291-color palette.'
      },
      {
        zh: '导出时按 300 DPI、A4 纸打印，大图建议 50×50 珠分页。工具支持 PNG 图纸（带坐标和每格色号）、CSV 采购清单和分页 PDF 制作说明。',
        en: 'Export at 300 DPI on A4, and paginate large charts at 50×50 beads. The tool exports PNG charts with coordinates and per-cell codes, a CSV shopping list and paginated PDF build notes.'
      }
    ],
    cta: {
      title: {
        zh: '打开拼豆图案生成器',
        en: 'Open the bead pattern maker'
      },
      href: '/tools/pindou-pattern-maker',
      kind: 'try_tool'
    },
    date: '2026-08-20',
    author: { zh: 'WebToMind 团队', en: 'WebToMind Team' }
  },
  {
    slug: 'image-prompt-library-guide',
    title: {
      zh: 'Image Prompt Library 是什么：如何找到并复用 AI 图片提示词库',
      en: 'What is an image prompt library and how to reuse AI image prompts'
    },
    excerpt: {
      zh: '提示词库解决什么问题？怎么选、怎么复用？本文说明结构、选择标准与四步复用流程。',
      en: 'Why use an image prompt library, how to choose one, and a four-step flow for reusing prompts.'
    },
    body: [
      {
        zh: 'AI 图片生成的关键往往不在模型，而在提示词。提示词库把经过验证的提示词按主题、模型和用途组织起来，让你不用从空白提示词开始。',
        en: 'The key to AI image generation is often the prompt, not the model. A prompt library organizes verified prompts by topic, model and use case so you never start from a blank box.'
      },
      {
        zh: '一个完整的提示词库通常包含：按用途分类的提示词、按模型区分的提示词、可复制的提示词配方（主体、场景、镜头、光影、材质、风格和负面约束分开维护），以及生成入口。',
        en: 'A complete prompt library usually includes prompts grouped by use case and by model, copyable prompt recipes with subject, scene, lens, lighting, material, style and constraints kept separate, plus a generation entry point.'
      },
      {
        zh: '选库看三个标准：更新频率、分类粒度、可复用性。复用一个提示词按四步走：明确目标、选对模型、按 slot 修改、生成并记录。',
        en: 'Choose a library by update frequency, granularity and reusability. Reuse in four steps: define the goal, pick the model, edit one slot at a time, then generate and record.'
      }
    ],
    cta: {
      title: {
        zh: '浏览并复用图片提示词案例',
        en: 'Browse and reuse image prompt examples'
      },
      href: '/prompts',
      kind: 'browse_prompts'
    },
    date: '2026-08-20',
    author: { zh: 'WebToMind 团队', en: 'WebToMind Team' }
  },
  {
    slug: 'pindou-generator-guide',
    title: {
      zh: '免费在线拼豆图案生成器怎么用：从照片到图纸',
      en: 'How to use a free bead pattern generator: from photo to chart'
    },
    excerpt: {
      zh: '从上传照片到打印图纸的四步完整流程：背景处理、参数设置、色板选择与 PNG/CSV/PDF 导出。',
      en: 'A four-step flow from photo upload to printed chart: background handling, settings, palette choice and PNG/CSV/PDF export.'
    },
    body: [
      {
        zh: '免费在线拼豆图案生成器解决的是把图案变成图纸这一步：上传图片、选色板、生成可打印图纸。按用途决定参数：宠物照片适合进阶图纸，亲子课堂用 6–10 色简单图案。',
        en: 'A free online bead pattern generator covers the chart-making step: upload an image, pick a palette and produce a printable chart. Parameters follow the use case: pet photos suit advanced charts, classroom projects stay at 6–10 colors.'
      },
      {
        zh: '背景复杂的图片先开启自动去背景，再用默认的主色像素化模式避免灰色毛边；零散杂色通过调高杂色合并阈值合并，但阈值太高会损失细节。',
        en: 'For busy backgrounds, run background removal first, then use the default dominant-color pixelation to avoid gray edges; raise the color-merge threshold to clean speckles without losing detail.'
      },
      {
        zh: '新手图纸宽度 30–50 珠、最大颜色 6–10 色；照片级作品用 291 色板并可以放宽颜色数。导出按 300 DPI、A4 打印，大图 50×50 珠分页，工具输出 PNG、CSV 采购清单和分页 PDF。',
        en: 'Beginner charts run 30–50 beads wide with 6–10 colors; photo-grade work uses a 291-color palette with more colors allowed. Export at 300 DPI on A4, paginate large charts, and use the PNG, CSV and PDF outputs.'
      }
    ],
    cta: {
      title: {
        zh: '打开拼豆图案生成器',
        en: 'Open the bead pattern maker'
      },
      href: '/tools/pindou-pattern-maker',
      kind: 'try_tool'
    },
    date: '2026-08-20',
    author: { zh: 'WebToMind 团队', en: 'WebToMind Team' }
  },
  {
    slug: 'ai-image-prompt-examples',
    title: {
      zh: 'AI 图片提示词示例：可复制的 20+ 提示词模板',
      en: 'AI image prompt examples: 20+ copyable prompt templates'
    },
    excerpt: {
      zh: '按人像、商品图、封面、角色一致性分类的 AI 图片提示词示例，附六 slot 结构与 FAQ。',
      en: 'AI image prompt examples grouped by portrait, product, cover and character consistency, with a six-slot structure and FAQ.'
    },
    body: [
      {
        zh: '写 AI 图片提示词最大的障碍是空白页。把提示词拆成六个可替换的部分（主体、场景、镜头、光影、材质风格、约束），每次只改一个 slot，比整段重写更稳定。',
        en: 'The hardest part of writing an AI image prompt is the blank box. Split prompts into six replaceable slots (subject, scene, lens, lighting, material & style, constraints) and change one slot at a time for steadier results.'
      },
      {
        zh: '人像、商品图和封面各有常用结构：人像强调光影和镜头，商品图强调背景干净和负面约束（无文字、无水印、无变形），封面强调构图和留白。',
        en: 'Portrait, product and cover prompts each have a familiar shape: portraits emphasize light and lens, product shots need clean backgrounds and negative constraints (no text, no watermark, no distortion), and covers rely on composition and whitespace.'
      },
      {
        zh: '角色一致性依赖稳定的角色锚点：把发型、眼睛颜色、服装固定下来，跨场景和表情变体时保持这些特征不变。',
        en: 'Character consistency depends on a stable character anchor: fix the hairstyle, eye color and outfit, then keep those features unchanged across scenes and expressions.'
      }
    ],
    cta: {
      title: {
        zh: '打开 WebToMind 提示词库',
        en: 'Open the WebToMind prompt library'
      },
      href: '/prompts',
      kind: 'browse_prompts'
    },
    date: '2026-08-20',
    author: { zh: 'WebToMind 团队', en: 'WebToMind Team' }
  },
  {
    slug: 'free-image-prompts-guide',
    title: {
      zh: '免费 AI 图片提示词去哪找：来源与复用方法',
      en: 'Free Image Prompts: Where to Find Them and How to Reuse Them'
    },
    excerpt: {
      zh: '免费图片提示词去哪找、怎么判断质量、以及四步复用到自己的图片里。',
      en: 'Where to find free image prompts, how to judge quality, and a four-step process to reuse them in your own images.'
    },
    body: [
      {
        zh: 'AI 图片生成的关键往往不在模型，而在提示词。提示词库把经过验证的提示词按主题、模型和用途组织起来，让你不用从空白提示词开始。',
        en: 'The key to AI image generation is often the prompt, not the model. A prompt library organizes verified prompts by topic, model and use case so you never start from a blank box.'
      },
      {
        zh: '可靠的免费来源有四类：公开的提示词库、工具自带的社区画廊、按模型整理的集合、以及经过验证的搜索结果。判断提示词是否值得保存看三点：是否完整（含模型、尺寸、负面约束）、是否有结果图可核对、是否可按 slot 修改。',
        en: 'Reliable free sources fall into four groups: open prompt libraries, community galleries, model-specific collections and verified search results. Judge a prompt by completeness, provenance and reusability.'
      },
      {
        zh: '复用提示词按四步：先匹配模型，再一次只改一个 slot，锁定有效版本，最后按用途整理成自己的小库。',
        en: 'Reuse in four steps: match the model, change one slot at a time, lock what worked, and organize saved prompts by use case.'
      }
    ],
    cta: {
      title: {
        zh: '选择模板并开始改写',
        en: 'Choose a template and start editing'
      },
      href: '/prompts',
      kind: 'use_template'
    },
    date: '2026-08-20',
    author: { zh: 'WebToMind 团队', en: 'WebToMind Team' }
  },
  {
    slug: 'ai-image-prompt-library-comparison',
    title: {
      zh: 'AI 图片提示词库对比：怎么选',
      en: 'AI Image Prompt Library Comparison: How to Choose One'
    },
    excerpt: {
      zh: '按更新频率、模型覆盖、分类粒度和可复现性对比提示词库，附使用场景选择建议。',
      en: 'Compare prompt libraries by update frequency, model coverage, granularity and reproducibility, with use-case picks and a test workflow.'
    },
    body: [
      {
        zh: 'AI 图片提示词库并不等价，差异在更新频率、模型覆盖、分类粒度和可复现性。按这四个维度比较，而不是只看条目数量。',
        en: 'Prompt libraries are not interchangeable. Compare on update frequency, model coverage, granularity and reproducibility rather than entry count.'
      },
      {
        zh: '结构化库的优势是可复现：每条提示词带模型、尺寸和负面约束，能直接生成；社区画廊的优势是可验证：每张图配提示词。按用途选择：电商和封面看重分类和负面约束，人像和角色看重一致性锚点，跨模型实验看重按模型组织。',
        en: 'Structured libraries win on reproducibility; community galleries win on visual verification. Pick by use case: commerce and covers need categories and negative constraints, portraits need identity anchors, and multi-model work needs per-model organization.'
      },
      {
        zh: '确定前先跑通一条：把库里的提示词自己生成一次，核对模型、尺寸、约束是否齐全，结果是否贴合描述。能保存或直接打开到工作台的库，能缩短验证闭环。',
        en: 'Test one entry end to end before committing: run the prompt yourself, check that model, size and constraints are present, and verify the result. Libraries that open into a workspace shorten the loop.'
      }
    ],
    cta: {
      title: {
        zh: '打开 WebToMind 提示词库',
        en: 'Open the WebToMind prompt library'
      },
      href: '/prompts',
      kind: 'browse_prompts'
    },
    date: '2026-08-20',
    author: { zh: 'WebToMind 团队', en: 'WebToMind Team' }
  },
  {
    slug: 'image-prompt-writing-guide',
    title: {
      zh: '图片 Prompt 怎么写：结构、示例与常见错误',
      en: 'How to write an image prompt: structure, examples and common mistakes'
    },
    excerpt: {
      zh: 'AI 图片提示词的基础结构、三个可直接套用的示例和三类常见错误，附 FAQ。',
      en: 'The basic structure of AI image prompts, three ready-to-use examples and three common mistakes, with FAQ.'
    },
    body: [
      {
        zh: 'AI 图片生成的质量很大程度取决于提示词写得是否清楚。把提示词拆成主体、场景、镜头、光影、材质风格和约束六个可替换的部分，比整段自由发挥稳定得多。',
        en: 'Image quality depends heavily on how clearly the prompt is written. Splitting prompts into subject, scene, lens, lighting, material & style and constraints produces steadier results than free-form text.'
      },
      {
        zh: '常见错误有三类：只写形容词不写主体；一次改太多变量；缺少负面约束。修正方法是先写清主体和场景，每轮只改一个 slot，再用「无文字、无水印、无变形」兜底。',
        en: 'Three common mistakes: adjectives without a clear subject, changing too many variables at once, and missing negative constraints. Fix these by naming the subject first, editing one slot per round and adding explicit negatives.'
      },
      {
        zh: '生成后对照三个标准判断提示词质量：主体是否符合预期、风格是否贴近描述、无关元素是否被负面约束拦住。主体漂移回到主体 slot，风格不稳定检查是否混入冲突风格词。',
        en: 'Judge a prompt after generation on three checks: subject matches, style matches, and unwanted elements are blocked by negatives. If the subject drifts, revisit the subject slot; if style is unstable, check for conflicting style words.'
      }
    ],
    cta: {
      title: {
        zh: '选择模板并开始改写',
        en: 'Choose a template and start editing'
      },
      href: '/prompts',
      kind: 'use_template'
    },
    date: '2026-08-20',
    author: { zh: 'WebToMind 团队', en: 'WebToMind Team' }
  },
  {
    slug: 'product-image-ai-guide',
    title: {
      zh: 'AI 商品图生成工作流：从白底图到场景图',
      en: 'AI product image workflow: from white background to scene shots'
    },
    excerpt: {
      zh: '电商商品图怎么用 AI 生成？从素材准备、白底基线图到场景图扩展的完整流程与 FAQ。',
      en: 'How to generate e-commerce product images with AI: material prep, white-background baseline and scene-shot expansion, with FAQ.'
    },
    body: [
      {
        zh: '做电商和内容的人经常被商品图拖慢。AI 商品图生成把商品图拆成可复用流程：准备素材、锁定主体、生成白底基线图、扩展场景图。',
        en: 'Product photography is a bottleneck for e-commerce and content teams. AI product image generation splits the work into a repeatable flow: prepare material, lock the subject, build a white-background baseline, then expand to scene shots.'
      },
      {
        zh: '白底图是后续一切的基础：用纯白背景、柔和漫射光、高细节，并加上无文字、无水印、无变形等负面约束。白底图过关后再做场景图，比每次从零生成稳定。',
        en: 'The white-background shot is the baseline: pure white background, soft diffuse light, high detail, with negatives like no text, no watermark and no distortion. Build scene shots on top of it rather than starting from scratch.'
      },
      {
        zh: '场景图的核心是主体不变、场景变：固定商品描述和光线方向，只替换背景描述。生成后对比主体是否与白底图一致，不一致时回到商品描述检查。',
        en: 'Scene shots keep the subject fixed and change the scene: hold the product description and light direction, swap only the background. Compare the result against the baseline and fix the description when the subject drifts.'
      }
    ],
    cta: {
      title: {
        zh: '浏览商品图提示词并开始生成',
        en: 'Browse product image prompts and create'
      },
      href: '/prompts?label=product-commercial',
      kind: 'use_template'
    },
    date: '2026-08-20',
    author: { zh: 'WebToMind 团队', en: 'WebToMind Team' }
  },
  {
    slug: 'luna-lisa-alpha-guide',
    title: {
      zh: 'luna-lisa-alpha 是什么？OpenAI 新图像测试模型指南',
      en: 'What is luna-lisa-alpha? OpenAI new image test model guide'
    },
    excerpt: {
      zh: 'luna-lisa-alpha 是 2026 年 8 月 19 日经单一泄露来源曝光的 OpenAI 新图像测试模型代号，声称知识截止更新、文字渲染更强。本文整理已知信息、验证缺口与可迁移的 prompt 准备。',
      en: "luna-lisa-alpha is a leaked codename for a possible next OpenAI image checkpoint, claimed to fix mona-lisa-1's stale knowledge cutoff and weak text rendering. This guide covers what is known, what is unverified and portable prompt prep."
    },
    body: [
      {
        zh: '问：luna-lisa-alpha 是 OpenAI 官方发布的模型吗？答：不是，也没有官方信息。它只出现在 X 账号 @chetaslua 于 2026 年 8 月 19 日的一条帖子中，该账号是此前测试 mona-lisa-1 知识截止时间的同一人。截至 2026 年 8 月 20 日，OpenAI 未确认这个代号，它不在任何 API 或文档中，也无法调用。',
        en: "Q: Is luna-lisa-alpha an official OpenAI model? A: No, and there is no official information. It exists only in a single X post from @chetaslua on August 19, 2026, the same tester who pinned mona-lisa-1's knowledge cutoff. As of August 20, 2026, OpenAI has not acknowledged the codename; it is not in any API or docs and cannot be called."
      },
      {
        zh: '问：泄露声称它比 mona-lisa-1 强在哪里？答：泄露帖声称三点：更新的知识截止、很强的文字渲染、超写实输出。最有信息量的是前两点：mona-lisa-1 实测的知识截止约在 2025 年 5 月（查理·柯克测试显示它不知道 2025 年 9 月之后的事件），并且有往图片里加过多文字的问题；如果新 checkpoint 真的修复这两点，意味着 OpenAI 在按正确顺序迭代。但这些都只是单一账号的说法。',
        en: "Q: What does the leak claim is better than mona-lisa-1? A: The post claims a recent knowledge cutoff, great text rendering and super realistic output. The first two carry the signal: mona-lisa-1 tested with a knowledge cutoff around May 2025 (the Charlie Kirk test showed it did not know events after September 2025) and a habit of adding too much text into images. If the new checkpoint fixes both, OpenAI is iterating in the right order. All of it is a single account's report."
      },
      {
        zh: '问：它和 mona-lisa-1、GPT Image 2 是什么关系？答：按泄露者的说法，luna-lisa-alpha 是 mona-lisa-1 之后的同系列新 checkpoint（「上一个叫 monalisa」）。mona-lisa-1 于 2026 年 8 月 9 日匿名出现在 LMArena 图像竞技场，通过 SynthID 水印、tokenizer 指纹和 Arena 出场三条证据被社区判断来自 OpenAI；luna-lisa-alpha 目前这三条证据一条都没有，归属只是从命名主题推断。对照系仍是 2026 年 4 月 21 日发布的 GPT Image 2：LMArena 1393 Elo、知识截止 2025 年 12 月、2K 输出。',
        en: 'Q: How does it relate to mona-lisa-1 and GPT Image 2? A: Per the leaker, luna-lisa-alpha is the next checkpoint in the same lineage, with "the previous one being monalisa." mona-lisa-1 appeared anonymously on LMArena on August 9, 2026 and was tied to OpenAI through three layers of evidence: a SynthID watermark hit, a matching tokenizer and Arena provenance. luna-lisa-alpha currently has none of the three; the link is inferred from the naming theme. The benchmark remains GPT Image 2, shipped April 21, 2026: 1393 LMArena Elo, December 2025 knowledge cutoff, 2K output.'
      },
      {
        zh: '问：现在能做什么准备？答：用可迁移的 slot 结构写 prompt，把主体、场景、镜头、光影、材质、风格和负面约束分开维护，并保存模型、尺寸、质量参数。先在 GPT Image 2 上验证这套结构，模型发布后可直接复用或小步迭代。是否值得迁移，等 luna-lisa-alpha 出现在 Arena、出现水印或指纹证据、或有人测出具体截止日期再判断；在那之前把它当作「有什么要来了」的信号，而不是可用的模型。',
        en: 'Q: What can I prepare now? A: Write prompts with a portable slot structure, keeping subject, scene, lens, lighting, material, style and negatives separate, and save model, size and quality settings. Validate the structure on GPT Image 2 today; when a successor ships, reuse or iterate in small steps. Decide whether to migrate only after luna-lisa-alpha appears on an arena, produces a watermark or fingerprint, or someone measures a concrete cutoff date. Until then, treat it as a signal that something is coming, not a model you can use.'
      }
    ],
    cta: {
      title: {
        zh: '浏览提示词案例库',
        en: 'Browse prompt examples'
      },
      href: '/prompts',
      kind: 'browse_prompts'
    },
    date: '2026-08-20',
    author: { zh: 'WebToMind 团队', en: 'WebToMind Team' }
  },
  {
    slug: 'nano-banana-gemini-image-guide',
    title: {
      zh: 'Nano Banana 是什么？Gemini 图像模型提示词指南',
      en: 'What is Nano Banana? Gemini image model prompt guide'
    },
    excerpt: {
      zh: 'Nano Banana 是 Google Gemini 中图像生成模型 Gemini 2.5 Flash Image 的代号，支持免费体验。本文说明它的真实身份、免费使用方式和可迁移的提示词结构。',
      en: "Nano Banana is the codename for Gemini 2.5 Flash Image, Google's image generation model inside Gemini, free to try. This guide covers what it is, how to use it for free and a portable prompt structure."
    },
    body: [
      {
        zh: '问：Nano Banana 是独立的 AI 绘图产品吗？答：不是。它是 Google Gemini 中图像生成模型 Gemini 2.5 Flash Image 的代号，2025 年 8 月下旬获得 Google 官方确认，并纳入 Gemini 应用与 Google AI Studio。同系列后续版本 Nano Banana 2（Gemini 3.1 Flash Image）于 2026 年 2 月开始向免费用户开放更高级功能。',
        en: "Q: Is Nano Banana a standalone AI drawing product? A: No. It is the codename for Gemini 2.5 Flash Image, Google's image generation model inside Gemini, confirmed by Google in late August 2025 and added to the Gemini app and Google AI Studio. The successor Nano Banana 2 (Gemini 3.1 Flash Image) started rolling out advanced features to free users in February 2026."
      },
      {
        zh: '问：Nano Banana 怎么免费使用？答：两个入口：Gemini 应用在模型列表选 Gemini 2.5 Flash Image，输入提示词或上传参考图即可生成；Google AI Studio 面向开发者，可调试提示词和测试参数。免费用户有每日生成数量限制，超出后回到基础模型或需要升级，具体限额以官方页面为准。',
        en: 'Q: How do I use Nano Banana for free? A: Two entrances: in the Gemini app, pick Gemini 2.5 Flash Image from the model list and generate with text or a reference image; Google AI Studio targets developers for prompt debugging and parameter testing. Free users face daily generation limits and revert to the base model or upgrade after exceeding them; check the official page for exact quotas.'
      },
      {
        zh: '问：Nano Banana 提示词怎么写？答：用 slot 化结构拆分：主体（身份、服装、识别信息）、场景（背景、时间、氛围）、镜头（景别、视角、焦段）、光影（光源、软硬、色温）、材质与风格、版式与文字（是否要文字、位置、层级）、负面约束（无乱码文字、无水印、无畸形手）。这套结构与 GPT Image 2 通用，可横向迁移。',
        en: 'Q: How do I write a Nano Banana prompt? A: Split it into slots: subject (identity, clothing, recognizable cues), scene (background, time, mood), camera (shot size, angle, focal length), lighting (direction, softness, temperature), material and style, layout and text (whether text is needed, position, hierarchy), and negative constraints (no gibberish text, no watermark, no distorted hands). The structure is portable across GPT Image 2.'
      },
      {
        zh: '问：Nano Banana 生成的图片能商用吗？答：Google 服务条款允许将 Gemini 生成的图片用于商业用途，前提是遵守内容政策，不得用于暴力、欺骗、非法等内容。具体以 Google 条款为准。WebToMind 案例库整理了可复用的 Nano Banana 提示词案例。',
        en: "Q: Can Nano Banana images be used commercially? A: Google's terms allow commercial use of Gemini-generated images as long as content policies are respected (no violence, deception or illegal content). Follow Google's terms. WebToMind's library includes reusable Nano Banana prompt examples."
      }
    ],
    cta: {
      title: {
        zh: '查看 Nano Banana 提示词案例',
        en: 'View Nano Banana prompt examples'
      },
      href: '/nano-banana-prompts',
      kind: 'browse_prompts'
    },
    date: '2026-08-22',
    author: { zh: 'WebToMind 团队', en: 'WebToMind Team' }
  },
  {
    slug: 'ai-generated-image-commercial-use-guide',
    title: {
      zh: 'AI 生成图片可以商用吗？版权与商用指南',
      en: 'Can AI-generated images be used commercially? A rights guide'
    },
    excerpt: {
      zh: 'AI 生成图片能不能商用取决于平台与套餐。本文按 OpenAI、Google、Adobe、Ideogram、Midjourney 梳理商用规则与发布前检查清单。',
      en: 'Whether AI-generated images can be used commercially depends on the platform and plan. This guide maps the rules for OpenAI, Google, Adobe, Ideogram and Midjourney, plus a pre-publish checklist.'
    },
    body: [
      {
        zh: '问：OpenAI 生成的图片能商用吗？答：可以。OpenAI 服务条款明确用户拥有输入和输出的所有权，输出可用于任何目的，包括商业用途（出售或发布）。前提是遵守条款：不冒充真人身份欺诈、不违反内容政策、不伪造品牌背书；明显模仿真实人物时仍需注意肖像权。',
        en: "Q: Can images generated by OpenAI be used commercially? A: Yes. OpenAI's terms assign users ownership of their inputs and outputs, and outputs may be used for any purpose, including commercial sale or publication. Follow the terms: no impersonation fraud, no content-policy violations, no forged brand endorsements; portrait rights still apply when output clearly resembles a real person."
      },
      {
        zh: '问：Google Gemini（Nano Banana）生成图能商用吗？答：可以，遵守内容政策即可（不得用于暴力、欺骗、非法内容）。Nano Banana 和 Gemini 系列输出可用于产品包装、广告素材和社媒内容。',
        en: 'Q: Can Google Gemini (Nano Banana) images be used commercially? A: Yes, as long as content policies are followed (no violence, deception or illegal content). Nano Banana and Gemini outputs can be used for packaging, ad creative and social content.'
      },
      {
        zh: '问：Ideogram 和 Midjourney 呢？答：Ideogram 免费版生成结果不可商用，只有付费订阅才允许商业使用。Midjourney 已于 2023 年 3 月暂停免费试用（因滥用），付费订阅用户可将生成图用于商业项目。',
        en: "Q: What about Ideogram and Midjourney? A: Ideogram's free tier is non-commercial; only paid subscriptions allow commercial use. Midjourney suspended free trials in March 2023 over abuse, and paid subscribers may use generated images commercially."
      },
      {
        zh: '问：商用前要检查什么？答：四件事：账号套餐是否允许商用（如 Ideogram 免费版不行）；图片是否带水印或平台标识；是否包含真人肖像或品牌元素（需授权）；平台条款是否有地区限制。重要商业资产建议咨询法律意见，因为各国对 AI 生成内容版权的认定仍在变化。',
        en: 'Q: What should I check before commercial use? A: Four things: whether your plan allows commercial use (Ideogram free does not); whether the image carries a watermark or platform mark; whether it contains real faces or brand elements that need permission; and whether the terms have regional limits. For major commercial assets, consult legal advice because copyright treatment of AI output still varies by country.'
      }
    ],
    cta: {
      title: {
        zh: '浏览提示词案例库',
        en: 'Browse prompt examples'
      },
      href: '/prompts',
      kind: 'browse_prompts'
    },
    date: '2026-08-22',
    author: { zh: 'WebToMind 团队', en: 'WebToMind Team' }
  },
  {
    slug: 'free-ai-image-generators-guide',
    title: {
      zh: '免费 AI 图片生成器对比：2026 年哪些值得用',
      en: 'Free AI image generators compared: what is worth using in 2026'
    },
    excerpt: {
      zh: '免费 AI 图片生成器对比：Nano Banana、Ideogram、Microsoft Designer、Stable Diffusion 的免费额度、文字渲染与商用限制，附场景推荐。',
      en: 'Free AI image generators compared: free limits, text rendering and commercial restrictions for Nano Banana, Ideogram, Microsoft Designer and Stable Diffusion, with scenario picks.'
    },
    body: [
      {
        zh: '问：免费 AI 图片生成器哪个最好？答：没有绝对最好，取决于用途：文字海报选 Ideogram，真实感人像和商品图选 Nano Banana（Gemini 2.5 Flash Image），完全自由可商用选本地 Stable Diffusion，快速社媒图选 Microsoft Designer。',
        en: 'Q: Which free AI image generator is best? A: None is best in absolute terms; it depends on the job: Ideogram for text-heavy posters, Nano Banana (Gemini 2.5 Flash Image) for realistic portraits and product shots, local Stable Diffusion for fully free commercial output, and Microsoft Designer for quick social graphics.'
      },
      {
        zh: '问：免费额度有多少？答：多数平台免费层在每日 10 到 25 次之间：Microsoft Designer 约每日 15 次快速生成；Ideogram 免费版约每日 10 张且不可商用；Leonardo 按每日令牌计算；Midjourney 已无免费试用。额度随政策调整，以官方页面为准。',
        en: 'Q: How much free quota is there? A: Most free tiers run between 10 and 25 generations per day: Microsoft Designer roughly 15 fast generations a day; Ideogram about 10 daily images, non-commercial; Leonardo by daily tokens; Midjourney has no free trial. Limits shift with policy; follow the official pages.'
      },
      {
        zh: '问：免费生成器有隐藏收费吗？答：免费额度本身不收费，但超出每日额度后会变慢、排队或引导升级。部分平台免费版结果不可商用（如 Ideogram），使用前确认条款。',
        en: 'Q: Are there hidden charges in free generators? A: The free quota itself costs nothing, but exceeding daily limits slows generation, queues requests or prompts upgrades. Some free tiers are non-commercial (e.g. Ideogram), so check terms first.'
      },
      {
        zh: '问：不同生成器的提示词能复用吗？答：能。slot 化提示词结构（主体、场景、镜头、光影、材质、风格、负面约束）在 Nano Banana、GPT Image 2、Flux、Seedream 之间通用，只调整少量模型特有参数即可迁移。',
        en: 'Q: Can prompts be reused across generators? A: Yes. A slot-based prompt structure (subject, scene, camera, lighting, material, style, negatives) transfers across Nano Banana, GPT Image 2, Flux and Seedream with only small model-specific tweaks.'
      }
    ],
    cta: {
      title: {
        zh: '浏览提示词案例库',
        en: 'Browse prompt examples'
      },
      href: '/prompts',
      kind: 'browse_prompts'
    },
    date: '2026-08-22',
    author: { zh: 'WebToMind 团队', en: 'WebToMind Team' }
  },
  {
    slug: 'ai-image-prompt-keywords-guide',
    title: {
      zh: 'AI 图片提示词关键词大全：正向与负面分类写法',
      en: 'AI image prompt keywords: positive and negative keyword guide'
    },
    excerpt: {
      zh: 'AI 图片提示词关键词怎么选？正向八类（主体、镜头、光影、风格、材质、细节、氛围、质量）加负面关键词模板，用 slot 化组织，附常见问题。',
      en: 'How to pick AI image prompt keywords? Positive keywords across eight categories plus a negative keyword template, organized in slots, with FAQ.'
    },
    body: [
      {
        zh: '问：AI 图片提示词关键词是什么？答：关键词是描述画面的最小语义单位，告诉模型画面里有什么主体、用什么镜头、什么光、什么风格，以及不要出现什么。关键词不是越多越好，而是每类选一个准确的词，组合成一句话。',
        en: 'Q: What are AI image prompt keywords? A: Keywords are the smallest meaning units describing the image. They tell the model what subject, lens, light and style to use, and what to exclude. More is not better; pick one accurate keyword per category and compose a sentence.'
      },
      {
        zh: '问：正向关键词可以分为哪几类？答：八类：主体（身份、服饰、姿态）、镜头（close-up、medium shot、wide angle）、光影（soft light、golden hour、rim light）、风格（photorealistic、cinematic、watercolor）、材质（glossy、matte、skin texture）、细节（visible pores、bokeh、shallow depth of field）、氛围（cozy、moody、neon-lit）、质量（masterpiece、best quality）。每类挑一个，画面基本就稳了。',
        en: 'Q: How are positive keywords grouped? A: Eight categories: subject (identity, clothing, pose), camera (close-up, medium shot, wide angle), lighting (soft light, golden hour, rim light), style (photorealistic, cinematic, watercolor), material (glossy, matte, skin texture), detail (visible pores, bokeh, shallow depth of field), mood (cozy, moody, neon-lit) and quality (masterpiece, best quality). Pick one per category to stabilize the image.'
      },
      {
        zh: '问：负面关键词怎么用？答：负面关键词拦截不想要的东西。通用类用 watermark、text、low quality、blurry、jpeg artifacts、signature、logo；人物类用 bad anatomy、bad hands、extra fingers、deformed、extra limbs；商业图再加 celebrity likeness、brand name、copyrighted material，避免侵权。',
        en: 'Q: How do I use negative keywords? A: Negative keywords block what you do not want. General ones: watermark, text, low quality, blurry, jpeg artifacts, signature, logo. For figures: bad anatomy, bad hands, extra fingers, deformed, extra limbs. For commercial images add celebrity likeness, brand name and copyrighted material to avoid infringement.'
      },
      {
        zh: '问：关键词怎么组织才稳定？答：按 slot 分组再组装，至少包含主体、场景、镜头、光影、材质、风格、细节、负面约束。每个 slot 放一个关键词，换产品、换角色时只改对应 slot。留空也是明确选择，不是随机漂移，复现性与批量效率会明显提升。',
        en: 'Q: How should keywords be organized for stability? A: Group them into slots, at least subject, scene, camera, lighting, material, style, detail and negatives. Put one keyword per slot and change only the relevant slot when switching product or character. An empty slot is an explicit choice, not random drift, which improves reproducibility and batch efficiency.'
      }
    ],
    cta: {
      title: {
        zh: '浏览提示词案例库',
        en: 'Browse prompt examples'
      },
      href: '/prompts',
      kind: 'browse_prompts'
    },
    date: '2026-08-28',
    author: { zh: 'WebToMind 团队', en: 'WebToMind Team' }
  }
];

export const SEO_UPDATES: SeoUpdate[] = [
  {
    title: { zh: '视觉提示词工作台上线', en: 'Visual prompt studio launched' }
  },
  {
    title: { zh: 'Prompt 案例库优化', en: 'Prompt case library improvements' }
  },
  { title: { zh: 'ComfyUI Workflow 检查器', en: 'ComfyUI Workflow Checker' } }
];

export const SEO_PRICING_CONTENT: SeoPricingContent = {
  title: {
    zh: 'WebToMind 价格与积分套餐',
    en: 'WebToMind pricing and credits'
  },
  intro: {
    zh: 'WebToMind 用积分和会员套餐管理 AI 图片生成、参考图反推、Prompt 复用和历史重编辑成本。免费版适合试用，Pro 适合稳定创作，Max 适合高频团队和批量生产。',
    en: 'WebToMind uses credits and memberships to manage AI image generation, reference-to-prompt extraction, prompt reuse and history re-editing costs. Free is for trials, Pro is for steady creation, and Max is for high-volume teams.'
  },
  plans: [
    {
      name: { zh: '免费版', en: 'Free' },
      summary: {
        zh: '包含每日免费积分和基础图片生成能力，适合验证 prompt、参考图和工作流是否适合你的创作方式。',
        en: 'Includes daily free credits and basic image generation so you can test prompts, references and workflows before upgrading.'
      }
    },
    {
      name: { zh: '专业版', en: 'Pro' },
      summary: {
        zh: '包含更多月度积分、图片生成、参考图反推和 Prompt 案例复用，适合持续产出封面、商品图、人像写真和角色图。',
        en: 'Adds monthly credits, image generation, reference-to-prompt extraction and prompt case reuse for recurring covers, product images, portraits and character visuals.'
      }
    },
    {
      name: { zh: '旗舰版', en: 'Max' },
      summary: {
        zh: '面向高频创作者和团队，提供更高月度积分、优先支持和更适合批量生产的创作余量。',
        en: 'Built for high-frequency creators and teams with larger monthly credit budgets, priority support and more room for batch production.'
      }
    }
  ],
  creditUses: [
    {
      zh: 'AI 图片生成：根据模型、尺寸、数量、参考图和质量设置消耗积分。',
      en: 'AI image generation: credits vary by model, size, quantity, reference images and quality settings.'
    },
    {
      zh: '参考图反推：把图片拆成主体、构图、镜头、光影、材质和风格提示词。',
      en: 'Reference-to-prompt: turn images into subject, composition, lens, lighting, material and style prompts.'
    },
    {
      zh: 'Prompt 案例复用：从案例库进入创作台，减少从零试错造成的成本浪费。',
      en: 'Prompt case reuse: start from library examples in the studio and reduce costly trial and error.'
    },
    {
      zh: '历史重编辑：恢复成功图片的 prompt、参数和上下文，只迭代需要调整的变量。',
      en: 'History re-editing: restore prompt, settings and context from successful images, then change only the target variable.'
    }
  ],
  faq: [
    {
      question: { zh: '积分主要用在哪里？', en: 'What are credits used for?' },
      answer: {
        zh: '积分主要用于 AI 图片生成、参考图解析、图片编辑和需要模型调用的创作流程。生成前应先查看预估成本。',
        en: 'Credits are mainly used for AI image generation, reference analysis, image editing and creative workflows that call AI models. Check the estimate before generating.'
      }
    },
    {
      question: {
        zh: '应该买会员还是额外积分？',
        en: 'Should I choose a membership or extra credits?'
      },
      answer: {
        zh: '稳定月度创作优先选择会员；短期活动、客户改稿或批量测试高峰可以补充额外积分。',
        en: 'Use a membership for steady monthly creation. Add extra credits for campaign spikes, client revisions or short-term batch testing.'
      }
    },
    {
      question: {
        zh: '免费版可以做 SEO 页面里的工作流吗？',
        en: 'Can the Free plan try the workflows described on SEO pages?'
      },
      answer: {
        zh: '可以先用免费额度验证 prompt、参考图和少量生成；高频生成、批量封面或团队复用更适合 Pro 或 Max。',
        en: 'Yes. Use the free allowance to test prompts, references and small generations. High-frequency batches, cover series and team reuse fit Pro or Max better.'
      }
    }
  ]
};
