export type LocalizedText = {
  zh: string;
  en: string;
};

export type PromptSeoPageType = 'category' | 'model' | 'package';

export type PromptSeoKeywordSet = {
  zh: string[];
  en: string[];
};

export type PromptSeoFaqItem = {
  question: LocalizedText;
  answer: LocalizedText;
};

export type PromptSeoContentSection = {
  title: LocalizedText;
  body?: LocalizedText;
  items: LocalizedText[];
};

export type PromptSeoRelatedLink = {
  path: string;
  title: LocalizedText;
  description: LocalizedText;
};

export type PromptSeoPage = {
  type: PromptSeoPageType;
  slug: string;
  title: LocalizedText;
  description: LocalizedText;
  badge: LocalizedText;
  intent: LocalizedText;
  keywords: PromptSeoKeywordSet;
  workflow: LocalizedText[];
  examples: LocalizedText[];
  sections?: PromptSeoContentSection[];
  relatedLinks?: PromptSeoRelatedLink[];
  faq: PromptSeoFaqItem[];
};

export type PromptSeoAliasTarget = {
  type: PromptSeoPageType;
  slug: string;
};

export type PromptSeoAlias = {
  path: string;
  canonicalPath: string;
  title: LocalizedText;
  description: LocalizedText;
  target?: PromptSeoAliasTarget;
  caseTarget?: PromptSeoAliasTarget;
  badge?: LocalizedText;
  intent?: LocalizedText;
  keywords?: PromptSeoKeywordSet;
  workflow?: LocalizedText[];
  examples?: LocalizedText[];
  sections?: PromptSeoContentSection[];
  relatedLinks?: PromptSeoRelatedLink[];
  faq?: PromptSeoFaqItem[];
};

export const PROMPT_SEO_ALIASES: PromptSeoAlias[] = [
  {
    path: '/ai-image-prompts',
    canonicalPath: '/en-US/prompts',
    caseTarget: { type: 'package', slug: 'ai-image-prompt-examples' },
    title: {
      zh: 'WebToMind AI 图片 Prompt 案例库',
      en: 'AI Image Prompts Library'
    },
    description: {
      zh: '按模型和场景筛选可复用 AI 图片 Prompt，复制后直接进入创作。',
      en: 'Filter reusable AI image prompts by model and use case, then copy or generate.'
    },
    badge: { zh: 'Prompt 案例库', en: 'Prompt library' },
    intent: {
      zh: '面向正在搜索 AI image prompts、AI 图片提示词案例、text to image prompts 和可复用生图模板的用户。',
      en: 'Built for users searching AI image prompts, AI image prompt examples, text to image prompts and reusable image-generation templates.'
    },
    keywords: {
      zh: [
        'AI image prompts',
        'AI 图片提示词',
        'text to image prompts',
        '图片生成 prompt'
      ],
      en: [
        'AI image prompts',
        'AI image prompt examples',
        'text to image prompts',
        'image generator prompts'
      ]
    },
    workflow: [
      {
        zh: '先从案例图或业务目标出发，明确主体、用途、比例和模型，不直接从空白 prompt 开始。',
        en: 'Start from a reference case or business goal, then define subject, use, aspect ratio and model instead of writing from a blank prompt.'
      },
      {
        zh: '把优秀 prompt 拆成主体、场景、镜头、光影、材质、风格和负面约束，后续只替换关键变量。',
        en: 'Split a strong prompt into subject, scene, lens, lighting, texture, style and negative constraints, then replace only key variables later.'
      },
      {
        zh: '保存生成结果、模型参数和 prompt 版本，让成功案例可以再次编辑、分享和复用。',
        en: 'Save generated images, model settings and prompt versions so successful cases can be edited, shared and reused.'
      }
    ],
    examples: [
      {
        zh: '真实 AI 写真 prompt：固定成年人物、镜头、光影和皮肤质感，只替换服装与场景。',
        en: 'Realistic AI portrait prompt: lock adult subject, lens, lighting and skin texture while swapping wardrobe and scene.'
      },
      {
        zh: '商品摄影 prompt：固定产品主体和卖点，快速测试背景材质、构图和广告版式。',
        en: 'Product photography prompt: lock product and selling point, then test background material, composition and ad layout.'
      },
      {
        zh: '角色一致性 prompt：固定识别点、服装、姿态和世界观，批量生成系列图。',
        en: 'Character consistency prompt: lock identity cues, wardrobe, pose and world setting to create a series of images.'
      }
    ],
    sections: [
      {
        title: {
          zh: 'Prompt 结构模板',
          en: 'Prompt structure template'
        },
        body: {
          zh: '一个可复用的 AI image prompt 不只是形容词堆叠，而是一组稳定 slot。',
          en: 'A reusable AI image prompt is a stable set of slots, not a pile of adjectives.'
        },
        items: [
          {
            zh: '主体：人物、商品、角色、场景物件，以及必须保留的识别点。',
            en: 'Subject: person, product, character, scene objects and identity cues that must stay fixed.'
          },
          {
            zh: '画面：比例、构图、镜头、景别、背景层次和移动端可读性。',
            en: 'Frame: aspect ratio, composition, lens, shot size, background hierarchy and mobile readability.'
          },
          {
            zh: '质感：光源、材质、色彩、摄影语境、渲染风格和需要避免的 AI 味。',
            en: 'Texture: light source, materials, color, photographic context, rendering style and unwanted AI artifacts.'
          }
        ]
      },
      {
        title: {
          zh: '适合优先沉淀的案例',
          en: 'Best cases to save first'
        },
        items: [
          {
            zh: '能直接带来业务价值的图：商品图、广告素材、社媒封面、头像和系列角色图。',
            en: 'Images with direct business value: product shots, ad creatives, social covers, avatars and character series.'
          },
          {
            zh: '能复用的风格系统：稳定镜头、光影、背景材质和品牌色。',
            en: 'Reusable style systems: stable lens, lighting, background material and brand colors.'
          },
          {
            zh: '能说明失败边界的案例：手部、文字、过度磨皮、人物漂移和构图拥挤。',
            en: 'Failure-boundary cases: hands, text, over-smoothed skin, identity drift and crowded composition.'
          }
        ]
      },
      {
        title: {
          zh: 'WebToMind AI Image Prompts 导航',
          en: 'WebToMind AI Image Prompts map'
        },
        body: {
          zh: '这个 Hub 负责汇总 WebToMind 的 AI image prompts、prompt generator、模型 prompt 和商业场景 prompt。',
          en: 'This hub connects WebToMind AI Image Prompts, the prompt generator, model prompt pages and commercial use-case prompts.'
        },
        items: [
          {
            zh: '需要从参考图反推提示词时，进入 AI Image Prompt Generator 页面。',
            en: 'Use the AI Image Prompt Generator page when turning reference images into reusable prompts.'
          },
          {
            zh: '需要按模型查找时，优先进入 GPT Image 2、Nano Banana、Flux 或 Seedream prompts 页面。',
            en: 'For model-specific prompts, open GPT Image 2, Nano Banana, Flux or Seedream prompt pages.'
          },
          {
            zh: '需要商业图片时，进入商品摄影、人像写真、角色设计和营销创意 prompt 页面。',
            en: 'For commercial visuals, use product photography, portrait, character design and marketing creative prompt pages.'
          }
        ]
      }
    ],
    faq: [
      {
        question: {
          zh: 'AI image prompts 应该写英文还是中文？',
          en: 'Should AI image prompts be written in English or Chinese?'
        },
        answer: {
          zh: '两种都可以。英文更利于覆盖全球搜索和多模型复用，中文适合团队协作和业务说明。WebToMind 更建议保存结构化案例，而不是只保存单段文字。',
          en: 'Both work. English is useful for global search and cross-model reuse, while Chinese helps team collaboration and business context. WebToMind works best when prompts are saved as structured cases, not only plain text.'
        }
      },
      {
        question: {
          zh: '为什么需要案例库，而不是只收藏 prompt？',
          en: 'Why use a prompt library instead of only saving prompt text?'
        },
        answer: {
          zh: '因为真正可复现的结果还依赖模型、尺寸、质量、参考图和生成历史。案例库能把这些信息一起保存，后续才能稳定迭代。',
          en: 'Repeatable results also depend on model, size, quality, references and generation history. A library keeps those details together so future iterations stay stable.'
        }
      },
      {
        question: {
          zh: 'WebToMind AI Image Prompts 是免费的吗？',
          en: 'Are WebToMind AI Image Prompts free?'
        },
        answer: {
          zh: '公开案例可以免费浏览。完整 prompt、会员案例或继续生成图片可能需要登录、积分或会员权限。',
          en: 'Public cases can be browsed for free. Full prompts, member-only cases or image generation may require login, credits or membership.'
        }
      }
    ]
  },
  {
    path: '/free-ai-image-prompts',
    canonicalPath: '/en-US/prompts',
    caseTarget: { type: 'package', slug: 'ai-image-prompt-examples' },
    title: {
      zh: '免费 AI 图片 Prompt 案例',
      en: 'Free AI Image Prompts'
    },
    description: {
      zh: '浏览 WebToMind 免费 AI image prompts，查找可复用的人像、商品图、角色设计和社媒封面提示词案例。',
      en: 'Browse free WebToMind AI image prompts for portraits, product images, character design and social cover examples.'
    },
    badge: { zh: '免费案例入口', en: 'Free prompt examples' },
    intent: {
      zh: '承接 free AI image prompts、免费 AI 图片提示词和可复制 prompt 案例搜索。',
      en: 'For users searching free AI image prompts, copy-ready image prompt examples and reusable image-generation prompts.'
    },
    keywords: {
      zh: ['free AI image prompts', '免费 AI 图片提示词', '可复制 prompt 案例'],
      en: [
        'free AI image prompts',
        'copy ready AI prompts',
        'AI image prompt examples'
      ]
    },
    workflow: [
      {
        zh: '先选择最接近用途的免费案例，再复制结构而不是照搬主体。',
        en: 'Start with the closest free example and copy the structure, not the exact subject.'
      },
      {
        zh: '替换主体、场景、比例和模型，保持镜头、光影和材质 slot 稳定。',
        en: 'Replace subject, scene, aspect ratio and model while keeping lens, lighting and texture slots stable.'
      },
      {
        zh: '把有效版本保存为自己的 WebToMind prompt case，后续继续迭代。',
        en: 'Save useful variants as your own WebToMind prompt cases for later iteration.'
      }
    ],
    examples: [
      {
        zh: '免费人像 prompt：复用镜头、光影和人物质感结构。',
        en: 'Free portrait prompt: reuse lens, lighting and subject texture structure.'
      },
      {
        zh: '免费商品图 prompt：复用产品主体、背景材质和广告留白结构。',
        en: 'Free product prompt: reuse product subject, background material and ad whitespace structure.'
      }
    ],
    faq: [
      {
        question: {
          zh: '免费 AI image prompts 可以商用吗？',
          en: 'Can free AI image prompts be used commercially?'
        },
        answer: {
          zh: 'Prompt 结构可以作为创作参考。正式商用前仍需检查生成图片、素材来源、人物肖像和品牌元素的授权。',
          en: 'Prompt structures can be used as creative references. Before commercial use, still review generated images, asset sources, likeness rights and brand elements.'
        }
      }
    ]
  },
  {
    path: '/best-ai-image-prompts',
    canonicalPath: '/en-US/prompts',
    caseTarget: { type: 'package', slug: 'ai-image-prompt-examples' },
    title: {
      zh: '最佳 AI 图片 Prompt 案例',
      en: 'Best AI Image Prompts'
    },
    description: {
      zh: '按模型、用途和复用价值筛选最佳 AI image prompts，用于商品摄影、人像写真、角色设计和营销视觉。',
      en: 'Find the best AI image prompts by model, use case and reuse value for product photography, portraits, character design and marketing visuals.'
    },
    badge: { zh: '精选 Prompt', en: 'Best prompt examples' },
    intent: {
      zh: '承接 best AI image prompts、AI image prompt examples 和高质量图片生成 prompt 搜索。',
      en: 'Targets best AI image prompts, AI image prompt examples and high-quality image generator prompt searches.'
    },
    keywords: {
      zh: [
        'best AI image prompts',
        '高质量 AI 图片 prompt',
        'AI image prompt examples'
      ],
      en: [
        'best AI image prompts',
        'AI image prompt examples',
        'high quality image prompts'
      ]
    },
    workflow: [
      {
        zh: '优先选择有清晰用途的 prompt：商品图、人像、角色、封面或广告图。',
        en: 'Choose prompts with a clear use first: product images, portraits, characters, covers or ads.'
      },
      {
        zh: '判断 prompt 是否可复用，看它是否拆清楚主体、画面、光影、风格和限制。',
        en: 'Judge reuse by checking whether subject, frame, lighting, style and constraints are clearly separated.'
      },
      {
        zh: '把最佳案例放入团队素材库，并为每个模型保留成功版本。',
        en: 'Keep the best examples in the team library and preserve winning versions per model.'
      }
    ],
    examples: [
      {
        zh: '最佳商品摄影 prompt 通常包含卖点、材质、光源、背景和画面用途。',
        en: 'Strong product photography prompts usually include selling point, material, light source, background and output use.'
      },
      {
        zh: '最佳人像 prompt 通常包含成年主体、镜头语言、光影、服装和真实摄影语境。',
        en: 'Strong portrait prompts usually include adult subject, lens language, lighting, wardrobe and photographic context.'
      }
    ],
    faq: [
      {
        question: {
          zh: '什么样的 AI image prompt 算好？',
          en: 'What makes an AI image prompt good?'
        },
        answer: {
          zh: '好 prompt 不是形容词越多越好，而是结构清楚、变量可替换、结果可复现，并且适合具体输出用途。',
          en: 'A good prompt is not just more adjectives. It has clear structure, replaceable variables, repeatable results and a concrete output use.'
        }
      }
    ]
  },
  {
    path: '/ai-image-prompt-examples',
    canonicalPath: '/en-US/prompts',
    caseTarget: { type: 'package', slug: 'ai-image-prompt-examples' },
    title: {
      zh: 'AI 图片 Prompt Examples',
      en: 'AI Image Prompt Examples'
    },
    description: {
      zh: '查看 AI image prompt examples，学习如何把人物、商品、角色、封面和广告视觉拆成可复用提示词。',
      en: 'Explore AI image prompt examples and learn how to turn portraits, products, characters, covers and ad visuals into reusable prompts.'
    },
    badge: { zh: 'Prompt 示例', en: 'Prompt examples' },
    intent: {
      zh: '面向搜索 AI image prompt examples、图片生成 prompt 示例和 prompt 案例拆解的用户。',
      en: 'For users searching AI image prompt examples, image generation prompt samples and reusable prompt breakdowns.'
    },
    keywords: {
      zh: [
        'AI image prompt examples',
        '图片生成 prompt 示例',
        'AI prompt 案例'
      ],
      en: [
        'AI image prompt examples',
        'image generation prompt examples',
        'AI prompt cases'
      ]
    },
    workflow: [
      {
        zh: '先看示例图和用途，再读 prompt 的主体、场景、镜头、光影和风格 slot。',
        en: 'Start from the example image and use case, then read the subject, scene, lens, lighting and style slots.'
      },
      {
        zh: '用同一个示例结构生成 2-3 个变体，确认哪些描述真正影响结果。',
        en: 'Generate two or three variants from the same structure to identify which descriptions actually affect results.'
      },
      {
        zh: '把成功示例链接回模型页和场景页，形成自己的 prompt 学习路径。',
        en: 'Link successful examples back to model and use-case pages to build your own prompt learning path.'
      }
    ],
    examples: [
      {
        zh: 'AI 写真示例：主体身份、镜头、背景、光影和皮肤质感分开写。',
        en: 'AI portrait example: separate subject identity, lens, background, lighting and skin texture.'
      },
      {
        zh: '营销创意示例：先写画面目标，再写商品、场景、留白和版式层级。',
        en: 'Marketing creative example: write output goal first, then product, scene, whitespace and layout hierarchy.'
      }
    ],
    faq: [
      {
        question: {
          zh: '可以直接复制这些 prompt examples 吗？',
          en: 'Can I copy these prompt examples directly?'
        },
        answer: {
          zh: '可以复制结构，但更建议替换主体、品牌、用途和风格变量，避免生成和业务无关的图片。',
          en: 'You can copy the structure, but should replace subject, brand, use case and style variables so outputs fit your own work.'
        }
      }
    ]
  },
  {
    path: '/ai-image-prompt-library',
    canonicalPath: '/en-US/prompts',
    caseTarget: { type: 'package', slug: 'ai-image-prompt-examples' },
    title: {
      zh: 'AI 图片 Prompt 案例库',
      en: 'AI Image Prompt Library'
    },
    description: {
      zh: '按模型和场景筛选可复用 AI 图片 Prompt，复制后直接进入创作。',
      en: 'Filter reusable AI image prompts by model and use case, then copy or generate.'
    },
    badge: { zh: 'Prompt 案例库', en: 'Prompt library' },
    intent: {
      zh: '面向需要按模型、场景和图片用途检索 AI image prompt library 的创作者。',
      en: 'For creators who need an AI image prompt library organized by model, use case and output purpose.'
    },
    keywords: {
      zh: [
        'AI image prompt library',
        'AI 图片 prompt 案例库',
        'prompt library'
      ],
      en: ['AI image prompt library', 'AI image prompts', 'prompt examples']
    },
    workflow: [
      {
        zh: '先按模型或创作场景筛选案例，再查看 prompt、参数和预览图。',
        en: 'Filter cases by model or use case first, then inspect prompt, settings and preview image.'
      },
      {
        zh: '复制可复用结构，不直接照搬与业务无关的主体和场景。',
        en: 'Copy the reusable structure instead of blindly copying subjects and scenes unrelated to your business.'
      },
      {
        zh: '把改好的版本保存回案例库，沉淀团队自己的素材资产。',
        en: 'Save edited versions back to the library to build your own prompt assets.'
      }
    ],
    examples: [
      {
        zh: '按 GPT Image 2、Nano Banana、Flux、Seedream 快速比较同一 prompt 的结果。',
        en: 'Compare the same prompt across GPT Image 2, Nano Banana, Flux and Seedream.'
      },
      {
        zh: '按 AI 写真、商品图、角色一致性、营销创意检索可复用案例。',
        en: 'Find reusable cases by AI portraits, product images, character consistency and marketing creatives.'
      }
    ],
    sections: [
      {
        title: { zh: '案例库使用方式', en: 'How to use the library' },
        items: [
          {
            zh: '先找相近用途，再替换主体、比例、品牌色和输出渠道。',
            en: 'Find a similar use case first, then replace subject, aspect ratio, brand color and publishing channel.'
          },
          {
            zh: '优先复用已验证的结构，减少每次重新试错的成本。',
            en: 'Reuse validated structures first to reduce repeated trial-and-error.'
          },
          {
            zh: '把成功案例继续拆成团队内部的 prompt 模板。',
            en: 'Turn successful cases into internal prompt templates.'
          }
        ]
      }
    ],
    faq: [
      {
        question: {
          zh: '这个页面和 /en-US/prompts 有什么关系？',
          en: 'How is this related to /en-US/prompts?'
        },
        answer: {
          zh: '两者服务同一组搜索意图，canonical 指向 /en-US/prompts，避免重复内容分散权重。',
          en: 'They serve the same search intent, and the canonical points to /en-US/prompts to avoid splitting ranking signals.'
        }
      }
    ]
  },
  {
    path: '/ai-image-prompts-gallery',
    canonicalPath: '/en-US/prompts',
    caseTarget: { type: 'package', slug: 'ai-image-prompt-examples' },
    title: {
      zh: 'AI 图片 Prompts Gallery',
      en: 'AI Image Prompts Gallery'
    },
    description: {
      zh: '浏览 WebToMind AI image prompts gallery，按模型、场景和商业用途查找可复用图片提示词案例。',
      en: 'Browse the WebToMind AI image prompts gallery by model, use case and commercial image workflow.'
    },
    badge: { zh: 'Prompt Gallery', en: 'Prompt gallery' },
    intent: {
      zh: '承接 AI image prompts gallery、AI prompt gallery 和图片生成提示词图库搜索。',
      en: 'Targets AI image prompts gallery, AI prompt gallery and image generation prompt gallery searches.'
    },
    keywords: {
      zh: ['AI image prompts gallery', 'AI prompt gallery', '图片提示词图库'],
      en: [
        'AI image prompts gallery',
        'AI prompt gallery',
        'image prompt gallery'
      ]
    },
    workflow: [
      {
        zh: '先按模型或输出场景浏览 gallery，找到接近自己业务目标的案例。',
        en: 'Browse the gallery by model or output scenario, then choose a case close to your business goal.'
      },
      {
        zh: '复制 prompt 结构并替换主体、品牌、比例和发布渠道。',
        en: 'Copy the prompt structure and replace subject, brand, aspect ratio and publishing channel.'
      },
      {
        zh: '把稳定结果保存为自己的 prompt case，后续继续生成和分享。',
        en: 'Save stable results as your own prompt cases for later generation and sharing.'
      }
    ],
    examples: [
      {
        zh: 'Gallery 示例：GPT Image 2 商品 KV、Nano Banana 人像、角色一致性和社媒海报。',
        en: 'Gallery examples: GPT Image 2 product KVs, Nano Banana portraits, character consistency and social posters.'
      }
    ],
    faq: [
      {
        question: {
          zh: 'AI image prompts gallery 和 prompt library 有区别吗？',
          en: 'Is an AI image prompts gallery different from a prompt library?'
        },
        answer: {
          zh: 'Gallery 更强调图片预览和快速浏览；library 更强调结构化保存、模型参数和后续复用。WebToMind 用同一个 canonical 页面承接两种搜索意图。',
          en: 'A gallery emphasizes visual browsing, while a library emphasizes structured saving, model settings and reuse. WebToMind uses the same canonical page for both intents.'
        }
      }
    ]
  },
  {
    path: '/free-ai-image-prompts-gallery',
    canonicalPath: '/en-US/prompts',
    caseTarget: { type: 'package', slug: 'ai-image-prompt-examples' },
    title: {
      zh: '免费 AI 图片 Prompts Gallery',
      en: 'Free AI Image Prompts Gallery'
    },
    description: {
      zh: '免费浏览 AI image prompts gallery，复制适合 GPT Image 2、Nano Banana、商品图、人像和角色设计的提示词结构。',
      en: 'Browse a free AI image prompts gallery with reusable structures for GPT Image 2, Nano Banana, product images, portraits and character design.'
    },
    badge: { zh: '免费 Prompt Gallery', en: 'Free prompt gallery' },
    intent: {
      zh: '承接 free AI image prompts gallery、免费 AI prompt gallery 和可复制图片 prompt 搜索。',
      en: 'Targets free AI image prompts gallery, free AI prompt gallery and copy-ready image prompt searches.'
    },
    keywords: {
      zh: [
        'free AI image prompts gallery',
        '免费 AI prompt gallery',
        '免费图片 prompt'
      ],
      en: [
        'free AI image prompts gallery',
        'free AI prompt gallery',
        'copy ready image prompts'
      ]
    },
    workflow: [
      {
        zh: '先从免费案例中选择图片用途，再复制可复用结构。',
        en: 'Pick the image use case from free examples first, then copy the reusable structure.'
      },
      {
        zh: '替换业务主体和视觉限制，避免只复制示例里的具体对象。',
        en: 'Replace business subjects and visual constraints instead of copying the exact object from the example.'
      },
      {
        zh: '进入 WebToMind 创作台继续测试模型、尺寸和变体。',
        en: 'Open the WebToMind studio to test model, size and variations.'
      }
    ],
    examples: [
      {
        zh: '免费 gallery 示例：社媒封面、商品图、AI 写真和 3D 角色参考。',
        en: 'Free gallery examples: social covers, product visuals, AI portraits and 3D character references.'
      }
    ],
    faq: [
      {
        question: {
          zh: '免费 gallery 会进入 sitemap 吗？',
          en: 'Does the free gallery alias appear in the sitemap?'
        },
        answer: {
          zh: '不会。它 canonical 到 /en-US/prompts，sitemap 只保留主页面，避免重复页面分散权重。',
          en: 'No. It canonicalizes to /en-US/prompts, and the sitemap keeps only the main page to avoid splitting ranking signals.'
        }
      }
    ]
  },
  {
    path: '/image-to-prompt-generator',
    canonicalPath: '/ai-image-prompt-generator',
    caseTarget: { type: 'package', slug: 'reference-image-to-prompt' },
    title: {
      zh: '图片转 Prompt 生成器',
      en: 'Image to Prompt Generator'
    },
    description: {
      zh: '把参考图拆解为主体、场景、镜头、光影、材质和风格，生成可编辑的 AI image prompt。',
      en: 'Turn a reference image into editable AI image prompt slots for subject, scene, lens, lighting, texture and style.'
    },
    badge: { zh: '图片转 Prompt', en: 'Image to prompt' },
    intent: {
      zh: '承接 image to prompt generator、图片转 prompt、从图片生成提示词等长尾搜索。',
      en: 'Targets image to prompt generator, image to prompt and prompt from image search intent.'
    },
    keywords: {
      zh: ['image to prompt generator', '图片转 prompt', '从图片生成提示词'],
      en: ['image to prompt generator', 'image to prompt', 'prompt from image']
    },
    workflow: [
      {
        zh: '上传或选择参考图，先识别画面主体和业务用途。',
        en: 'Upload or select a reference image, then identify the subject and business use.'
      },
      {
        zh: '把画面拆成可编辑 slot，不把原图当作需要复制的最终结果。',
        en: 'Break the image into editable slots instead of treating it as a final image to copy.'
      },
      {
        zh: '进入 WebToMind 创作台生成新图，并保存有效 prompt 版本。',
        en: 'Open the WebToMind studio to generate a new image and save useful prompt versions.'
      }
    ],
    examples: [
      {
        zh: '从商品参考图生成产品摄影 prompt。',
        en: 'Generate a product photography prompt from a product reference image.'
      },
      {
        zh: '从人像参考图生成真实摄影 prompt。',
        en: 'Generate a realistic portrait prompt from a portrait reference image.'
      }
    ],
    faq: [
      {
        question: {
          zh: 'Image to prompt 和普通 prompt generator 有什么区别？',
          en: 'How is image to prompt different from a normal prompt generator?'
        },
        answer: {
          zh: 'Image to prompt 从已有图片提取视觉结构；普通 prompt generator 也可以从文字目标开始生成结构。',
          en: 'Image to prompt extracts visual structure from an existing image, while a normal prompt generator can also start from a written goal.'
        }
      }
    ]
  },
  {
    path: '/reference-image-to-prompt-generator',
    canonicalPath: '/reference-image-to-prompt-generator',
    caseTarget: { type: 'package', slug: 'reference-image-to-prompt' },
    title: {
      zh: '参考图转 Prompt 生成器',
      en: 'Reference Image to Prompt Generator & Examples'
    },
    description: {
      zh: '从参考图提取主体、构图、镜头、光影、风格和限制条件，生成适合 AI 图片生成的结构化 prompt。',
      en: 'Extract subject, composition, lens, lighting, style and constraints from a reference image to create a structured AI image prompt.'
    },
    badge: { zh: '参考图反推', en: 'Reference to prompt' },
    intent: {
      zh: '承接 reference image to prompt generator、参考图反推提示词和图片风格复用搜索。',
      en: 'Targets reference image to prompt generator, reference-to-prompt and visual style reuse searches.'
    },
    keywords: {
      zh: [
        'reference image to prompt generator',
        '参考图反推提示词',
        '参考图生成 prompt'
      ],
      en: [
        'reference image to prompt generator',
        'reference to prompt',
        'image prompt generator'
      ]
    },
    workflow: [
      {
        zh: '先判断参考图里要复用的是主体、风格、构图还是商业用途。',
        en: 'Decide whether the reference is useful for subject, style, composition or commercial purpose.'
      },
      {
        zh: '提取可复用描述后，替换品牌、人物和业务场景，避免复制原图。',
        en: 'After extracting reusable descriptions, replace brand, people and business context to avoid copying the original image.'
      },
      {
        zh: '把稳定结果保存为 prompt case，并链接到模型页和场景页。',
        en: 'Save stable results as prompt cases and connect them to model and use-case pages.'
      }
    ],
    examples: [
      {
        zh: '从广告参考图提取版式、留白、产品光影和背景质感。',
        en: 'Extract layout, whitespace, product lighting and background texture from an ad reference.'
      },
      {
        zh: '从风格参考图提取色彩、材质、镜头和画面节奏。',
        en: 'Extract color, material, lens and visual rhythm from a style reference.'
      }
    ],
    faq: [
      {
        question: {
          zh: '参考图反推会不会侵犯原图？',
          en: 'Can reference-image prompt generation infringe the original image?'
        },
        answer: {
          zh: '工具目标是提取通用视觉结构。正式发布前仍应替换受保护元素，并检查版权、肖像和品牌授权。',
          en: 'The goal is to extract general visual structure. Before publishing, replace protected elements and review copyright, likeness and brand permissions.'
        }
      }
    ]
  },
  {
    path: '/ai-image-prompt-generator',
    canonicalPath: '/ai-image-prompt-generator',
    caseTarget: { type: 'package', slug: 'reference-image-to-prompt' },
    title: {
      zh: 'AI 图片 Prompt 生成器',
      en: 'AI Image Prompt Generator from Reference Images'
    },
    description: {
      zh: '上传参考图或选择视觉素材，把主体、场景、镜头、光影和风格拆成可复用的 AI image prompt。',
      en: 'Upload a reference image or choose visual assets to turn subject, scene, lens, lighting and style into a reusable AI image prompt.'
    },
    badge: { zh: 'Prompt 生成器', en: 'Prompt generator' },
    intent: {
      zh: '面向搜索 AI image prompt generator、image to prompt、参考图反推提示词和图片生成器 prompt 的用户。',
      en: 'For users searching AI image prompt generator, image to prompt, reference image to prompt and image generator prompt workflows.'
    },
    keywords: {
      zh: [
        'AI image prompt generator',
        'image to prompt',
        '参考图反推提示词',
        'AI 图片生成器 prompt'
      ],
      en: [
        'AI image prompt generator',
        'image to prompt',
        'reference image to prompt',
        'AI image generator prompts'
      ]
    },
    workflow: [
      {
        zh: '上传参考图或选择精选案例，先识别主体、风格、构图、光源和用途。',
        en: 'Upload a reference image or choose a curated case, then identify subject, style, composition, light source and use.'
      },
      {
        zh: '把识别结果转换为可编辑 prompt slot，人工确认关键描述和禁止项。',
        en: 'Convert the analysis into editable prompt slots, then manually confirm key descriptions and exclusions.'
      },
      {
        zh: '用同一结构继续出图、保存版本，并把稳定结果加入 Prompt 案例库。',
        en: 'Generate with the same structure, save versions and add stable results to the prompt library.'
      }
    ],
    examples: [
      {
        zh: '参考图转商品 prompt：提取产品形态、材质、背景、灯光和广告版式。',
        en: 'Reference image to product prompt: extract product shape, material, background, lighting and ad layout.'
      },
      {
        zh: '参考图转写真 prompt：提取镜头、光影、姿态、服装和真实摄影语境。',
        en: 'Reference image to portrait prompt: extract lens, lighting, pose, wardrobe and photographic context.'
      },
      {
        zh: '参考图转风格 prompt：提取色彩、材质、画面节奏和可复用风格约束。',
        en: 'Reference image to style prompt: extract color, texture, visual rhythm and reusable style constraints.'
      }
    ],
    sections: [
      {
        title: {
          zh: '生成器输出应该包含什么',
          en: 'What the generator should produce'
        },
        body: {
          zh: '好的 prompt generator 不能只输出一句描述，需要给出可编辑、可复用、可验证的结构。',
          en: 'A useful prompt generator should produce an editable, reusable and testable structure, not just one sentence.'
        },
        items: [
          {
            zh: '正向 prompt：主体、场景、镜头、光影、材质、风格和输出比例。',
            en: 'Positive prompt: subject, scene, lens, lighting, texture, style and aspect ratio.'
          },
          {
            zh: '负向约束：不要的构图、质感、文字错误、人物漂移和低质量细节。',
            en: 'Negative constraints: unwanted composition, texture, text errors, identity drift and low-quality details.'
          },
          {
            zh: '复用建议：哪些 slot 可以替换，哪些变量应该保持不变。',
            en: 'Reuse guidance: which slots can be replaced and which variables should stay fixed.'
          }
        ]
      },
      {
        title: {
          zh: '更适合 WebToMind 的使用场景',
          en: 'Best WebToMind use cases'
        },
        items: [
          {
            zh: '从竞品图、灵感图或历史图反推结构，再生成自己的原创版本。',
            en: 'Reverse structure from competitor images, inspiration or history, then create your own original version.'
          },
          {
            zh: '把一次性出图变成可保存、可复用、可分享的 prompt 资产。',
            en: 'Turn one-off generation into prompt assets that can be saved, reused and shared.'
          },
          {
            zh: '为英文 SEO 页面、案例详情页和社媒投放沉淀稳定视觉素材。',
            en: 'Create stable visual assets for English SEO pages, case detail pages and social promotion.'
          }
        ]
      }
    ],
    faq: [
      {
        question: {
          zh: 'AI image prompt generator 能直接保证出图一致吗？',
          en: 'Can an AI image prompt generator guarantee consistent images?'
        },
        answer: {
          zh: '不能完全保证。它能降低从零写 prompt 的成本，但一致性还需要模型参数、参考图、历史版本和人工筛选共同控制。',
          en: 'Not completely. It reduces the cost of writing prompts from scratch, but consistency also depends on model settings, references, version history and human selection.'
        }
      },
      {
        question: {
          zh: '参考图反推 prompt 是否会复制原图？',
          en: 'Does reference-to-prompt copy the original image?'
        },
        answer: {
          zh: '目标不是复制原图，而是提取可复用的视觉结构。实际使用时应该替换主体、品牌元素和业务语境，生成自己的版本。',
          en: 'The goal is not to copy the original image, but to extract a reusable visual structure. In practice, replace subjects, brand elements and business context to create your own version.'
        }
      }
    ]
  },
  {
    path: '/gpt-image-2-prompts',
    canonicalPath: '/gpt-image-2-prompts',
    title: {
      zh: 'GPT Image 2 Prompt Examples 案例库',
      en: 'GPT Image 2 Prompt Examples'
    },
    description: {
      zh: '浏览 free GPT Image 2 prompts 和可复用 GPT Image 2 prompt examples，覆盖商品图、人像、角色设计、参考图改写和电商主视觉。',
      en: 'Browse free GPT Image 2 prompts and reusable examples for product photos, portraits, character design, reference remixes and ecommerce heroes.'
    },
    badge: { zh: 'GPT Image 2 案例', en: 'GPT Image 2 examples' },
    intent: {
      zh: '承接 free GPT Image 2 prompts、GPT Image 2 prompt examples、gpt image examples 和可复现模型提示词搜索。',
      en: 'Targets free GPT Image 2 prompts, GPT Image 2 prompt examples, gpt image examples and reproducible model-specific prompt searches.'
    },
    keywords: {
      zh: [
        'free GPT Image 2 prompts',
        'GPT Image 2 prompt examples',
        'gpt image examples',
        '免费 GPT Image 2 prompt'
      ],
      en: [
        'free GPT Image 2 prompts',
        'GPT Image 2 prompt examples',
        'gpt image examples',
        'GPT Image 2 image prompts'
      ]
    },
    target: { type: 'model', slug: 'gpt-image-2' }
  },
  {
    path: '/free-gpt-image-2-prompts',
    canonicalPath: '/gpt-image-2-prompts',
    title: {
      zh: '免费 GPT Image 2 Prompts',
      en: 'Free GPT Image 2 Prompts'
    },
    description: {
      zh: '免费浏览 GPT Image 2 prompts，查找适合商品图、人像、海报、UI mockup 和角色设计的可复用提示词。',
      en: 'Browse free GPT Image 2 prompts for product images, portraits, posters, UI mockups and character design.'
    },
    badge: { zh: '免费 GPT Image 2', en: 'Free GPT Image 2 prompts' },
    intent: {
      zh: '承接 free GPT Image 2 prompts、GPT Image 2 prompt examples 和免费模型提示词搜索。',
      en: 'Targets free GPT Image 2 prompts, GPT Image 2 prompt examples and free model-specific prompt searches.'
    },
    keywords: {
      zh: [
        'free GPT Image 2 prompts',
        'GPT Image 2 prompt examples',
        '免费 GPT Image 2 prompt'
      ],
      en: [
        'free GPT Image 2 prompts',
        'GPT Image 2 prompt examples',
        'GPT Image 2 image prompts'
      ]
    },
    target: { type: 'model', slug: 'gpt-image-2' }
  },
  {
    path: '/gpt-image-2-prompts-gallery',
    canonicalPath: '/gpt-image-2-prompts',
    title: {
      zh: 'GPT Image 2 Prompts Gallery',
      en: 'GPT Image 2 Prompts Gallery'
    },
    description: {
      zh: '浏览 GPT Image 2 prompts gallery，通过图片案例快速比较人像、商品摄影、海报和角色设计提示词。',
      en: 'Browse a GPT Image 2 prompts gallery with visual examples for portraits, product photography, posters and character design.'
    },
    badge: { zh: 'GPT Image 2 Gallery', en: 'GPT Image 2 gallery' },
    intent: {
      zh: '承接 GPT Image 2 prompts gallery、GPT Image 2 prompt library 和模型案例图库搜索。',
      en: 'Targets GPT Image 2 prompts gallery, GPT Image 2 prompt library and model example gallery searches.'
    },
    keywords: {
      zh: [
        'GPT Image 2 prompts gallery',
        'GPT Image 2 prompt library',
        'GPT Image 2 案例图库'
      ],
      en: [
        'GPT Image 2 prompts gallery',
        'GPT Image 2 prompt library',
        'GPT Image 2 examples'
      ]
    },
    target: { type: 'model', slug: 'gpt-image-2' }
  },
  {
    path: '/imagine-image-2-0-prompts',
    canonicalPath: '/imagine-image-2-0-prompts',
    title: {
      zh: 'Imagine Image 2.0 Prompts 案例库',
      en: 'Imagine Image 2.0 Prompts'
    },
    description: {
      zh: '整理 Imagine Image 2.0、Grok Imagine 与 xAI 图像生成的热点搜索承接页：结构化提示词、跨图一致性方法和可复用案例。',
      en: 'Browse Imagine Image 2.0 and Grok Imagine prompt examples with structured slots, cross-image consistency methods and reusable cases for posters, product heroes and character work.'
    },
    badge: { zh: 'Grok Imagine 案例', en: 'Grok Imagine examples' },
    intent: {
      zh: '承接 Imagine Image 2.0 prompts、Grok Imagine Image 2.0、imagine image 2.0 prompt examples 与 xAI 图像生成搜索。',
      en: 'Targets Imagine Image 2.0 prompts, Grok Imagine Image 2.0, imagine image 2.0 prompt examples and xAI image generation searches.'
    },
    keywords: {
      zh: [
        'Imagine Image 2.0 prompts',
        'Grok Imagine Image 2.0',
        'imagine image 2.0 prompt examples',
        '免费 Imagine Image 2.0 prompt'
      ],
      en: [
        'Imagine Image 2.0 prompts',
        'Grok Imagine Image 2.0',
        'imagine image 2.0 prompt examples',
        'free Imagine Image 2.0 prompts',
        'Grok Imagine image prompts',
        'xAI image generation prompts'
      ]
    },
    target: { type: 'model', slug: 'grok-imagine' }
  },
  {
    path: '/grok-imagine-image-2-0-prompts',
    canonicalPath: '/imagine-image-2-0-prompts',
    title: {
      zh: 'Grok Imagine Image 2.0 Prompts',
      en: 'Grok Imagine Image 2.0 Prompts'
    },
    description: {
      zh: 'Grok Imagine Image 2.0 提示词与可复用案例，覆盖海报、电商主图、角色一致性和图像编辑工作流。',
      en: 'Grok Imagine Image 2.0 prompts and reusable cases for posters, ecommerce heroes, character consistency and image editing workflows.'
    },
    badge: { zh: 'Grok Imagine', en: 'Grok Imagine' },
    intent: {
      zh: '承接 Grok Imagine Image 2.0、Grok Imagine prompts 和 Imagine Image 2.0 提示词搜索。',
      en: 'Targets Grok Imagine Image 2.0, Grok Imagine prompts and Imagine Image 2.0 prompt searches.'
    },
    keywords: {
      zh: ['Grok Imagine Image 2.0', 'Grok Imagine prompts', 'Imagine Image 2.0 提示词'],
      en: [
        'Grok Imagine Image 2.0',
        'Grok Imagine prompts',
        'Imagine Image 2.0 prompts'
      ]
    },
    target: { type: 'model', slug: 'grok-imagine' }
  },
  {
    path: '/nano-banana-prompts',
    canonicalPath: '/nano-banana-prompts',
    title: {
      zh: 'Nano Banana Prompts 案例库',
      en: 'Nano Banana Prompts'
    },
    description: {
      zh: '整理 Nano Banana prompts、模型设置和可复用案例，适合社媒封面、AI 写真和角色图。',
      en: 'Nano Banana prompts, model settings and reusable examples for social covers, AI portraits and character images.'
    },
    target: { type: 'model', slug: 'nano-banana' }
  },
  {
    path: '/nano-banana-prompts-gallery',
    canonicalPath: '/nano-banana-prompts',
    title: {
      zh: 'Nano Banana Prompts Gallery',
      en: 'Nano Banana Prompts Gallery'
    },
    description: {
      zh: '浏览 Nano Banana prompts gallery，查找适合社媒封面、AI 写真、角色图和风格测试的提示词案例。',
      en: 'Browse a Nano Banana prompts gallery for social covers, AI portraits, character images and style tests.'
    },
    badge: { zh: 'Nano Banana Gallery', en: 'Nano Banana gallery' },
    intent: {
      zh: '承接 Nano Banana prompts gallery、Nano Banana prompt examples 和模型案例图库搜索。',
      en: 'Targets Nano Banana prompts gallery, Nano Banana prompt examples and model-specific gallery searches.'
    },
    keywords: {
      zh: [
        'Nano Banana prompts gallery',
        'Nano Banana prompt examples',
        'Nano Banana 提示词图库'
      ],
      en: [
        'Nano Banana prompts gallery',
        'Nano Banana prompt examples',
        'Nano Banana image prompts'
      ]
    },
    target: { type: 'model', slug: 'nano-banana' }
  },
  {
    path: '/nano-banana-2-prompts',
    canonicalPath: '/nano-banana-prompts',
    title: {
      zh: 'Nano Banana 2 Prompts',
      en: 'Nano Banana 2 Prompts'
    },
    description: {
      zh: '浏览 Nano Banana 2 prompts 搜索意图下的可复用图片提示词案例，并统一进入 WebToMind Nano Banana prompts 专题。',
      en: 'Browse reusable image prompt examples for Nano Banana 2 search intent, consolidated under the WebToMind Nano Banana prompts page.'
    },
    badge: { zh: 'Nano Banana 2', en: 'Nano Banana 2 prompts' },
    intent: {
      zh: '承接 Nano Banana 2 prompts 和新模型版本提示词搜索。',
      en: 'Targets Nano Banana 2 prompts and new model-version prompt searches.'
    },
    keywords: {
      zh: ['Nano Banana 2 prompts', 'Nano Banana 2 prompt examples'],
      en: ['Nano Banana 2 prompts', 'Nano Banana 2 prompt examples']
    },
    target: { type: 'model', slug: 'nano-banana' }
  },
  {
    path: '/nano-banana-pro-prompts',
    canonicalPath: '/nano-banana-prompts',
    title: {
      zh: 'Nano Banana Pro Prompts',
      en: 'Nano Banana Pro Prompts'
    },
    description: {
      zh: '浏览 Nano Banana Pro prompts 搜索意图下的图片提示词案例，适合人像、角色、社媒和商业视觉测试。',
      en: 'Browse image prompt examples for Nano Banana Pro search intent, useful for portraits, characters, social covers and commercial visuals.'
    },
    badge: { zh: 'Nano Banana Pro', en: 'Nano Banana Pro prompts' },
    intent: {
      zh: '承接 Nano Banana Pro prompts 和模型升级提示词搜索。',
      en: 'Targets Nano Banana Pro prompts and upgraded model prompt searches.'
    },
    keywords: {
      zh: ['Nano Banana Pro prompts', 'Nano Banana Pro prompt examples'],
      en: ['Nano Banana Pro prompts', 'Nano Banana Pro prompt examples']
    },
    target: { type: 'model', slug: 'nano-banana' }
  },
  {
    path: '/flux-prompts',
    canonicalPath: '/flux-prompts',
    title: {
      zh: 'Flux Prompts 与 AI 图片生成案例',
      en: 'Flux Prompts for AI Image Generation'
    },
    description: {
      zh: '浏览 Flux prompts、风格迁移案例和可复用图片生成工作流。',
      en: 'Browse Flux prompts, style-transfer examples and reusable AI image-generation workflows.'
    },
    target: { type: 'model', slug: 'flux' }
  },
  {
    path: '/seedream-prompts',
    canonicalPath: '/seedream-prompts',
    title: {
      zh: 'Seedream Prompts 与图片生成案例',
      en: 'Seedream Prompts for AI Image Generation'
    },
    description: {
      zh: '浏览 Seedream prompts、模型设置和可复用图片案例，快速测试人像、商品图和海报。',
      en: 'Browse Seedream prompts, model settings and reusable examples for portraits, product images and posters.'
    },
    target: { type: 'model', slug: 'seedream' }
  },
  {
    path: '/mona-lisa-1-prompts',
    canonicalPath: '/mona-lisa-1-prompts',
    title: {
      zh: 'mona-lisa-1 Prompt 案例与提示词',
      en: 'mona-lisa-1 Prompts & Examples'
    },
    description: {
      zh: '浏览 mona-lisa-1 prompt 案例和提示词结构。mona-lisa-1 是 2026 年 8 月出现在 LMArena 的 OpenAI 图像模型（SynthID 水印验证，官方尚未官宣）。',
      en: 'Browse mona-lisa-1 prompt examples and structure. mona-lisa-1 is the OpenAI image model found on LMArena in August 2026, verified by SynthID watermark and not yet officially announced.'
    },
    badge: { zh: 'mona-lisa-1 案例', en: 'mona-lisa-1 examples' },
    intent: {
      zh: '承接 mona-lisa-1 prompt、mona-lisa-1 提示词、OpenAI mona-lisa-1 和 GPT Image 2.5 相关的模型提示词搜索。',
      en: 'Targets mona-lisa-1 prompts, mona lisa 1 prompt examples, OpenAI mona-lisa-1 and GPT Image 2.5 related model prompt searches.'
    },
    keywords: {
      zh: [
        'mona-lisa-1 prompt',
        'mona-lisa-1 提示词',
        'OpenAI mona-lisa-1',
        'GPT Image 2.5 prompt',
        'AI 图片提示词'
      ],
      en: [
        'mona-lisa-1 prompts',
        'mona lisa 1 prompts',
        'mona-lisa-1 prompt examples',
        'OpenAI mona-lisa-1',
        'GPT Image 2.5 prompts'
      ]
    },
    target: { type: 'model', slug: 'mona-lisa-1' }
  },
  {
    path: '/mona-lisa-prompts',
    canonicalPath: '/mona-lisa-1-prompts',
    title: {
      zh: 'Mona Lisa AI 提示词案例',
      en: 'Mona Lisa AI Prompts'
    },
    description: {
      zh: '浏览 Mona Lisa AI 图片提示词案例，mona-lisa-1 的模型动态与可复用 prompt 结构。',
      en: 'Browse Mona Lisa AI image prompt examples, mona-lisa-1 model news and reusable prompt structure.'
    },
    badge: { zh: 'Mona Lisa Prompts', en: 'Mona Lisa prompts' },
    intent: {
      zh: '承接 mona lisa prompt、Mona Lisa AI image model 和 OpenAI 新图像模型的提示词搜索。',
      en: 'Targets mona lisa prompts, Mona Lisa AI image model and OpenAI new image model prompt searches.'
    },
    keywords: {
      zh: ['mona lisa prompt', 'Mona Lisa AI', 'OpenAI 新图像模型 prompt'],
      en: [
        'mona lisa prompts',
        'mona lisa AI image model',
        'OpenAI new image model prompts'
      ]
    },
    target: { type: 'model', slug: 'mona-lisa-1' }
  },
  {
    path: '/gpt-image-2-5-prompts',
    canonicalPath: '/gpt-image-2-5-prompts',
    title: {
      zh: 'GPT Image 2.5 Prompt 案例与提示词',
      en: 'GPT Image 2.5 Prompts & Examples'
    },
    description: {
      zh: '浏览 GPT Image 2.5 prompt 案例和提示词结构。GPT Image 2.5 是社区对 OpenAI 下一代图像模型的候选名称，官方尚未宣布，先在 GPT Image 2 上跑通同一套结构。',
      en: 'Browse GPT Image 2.5 prompt examples and structure. GPT Image 2.5 is the community candidate name for OpenAI\'s next image model, not an announced product; prove the same structure on GPT Image 2 today.'
    },
    badge: { zh: 'GPT Image 2.5 案例', en: 'GPT Image 2.5 examples' },
    intent: {
      zh: '承接 GPT Image 2.5 prompt、GPT Image 2.5 提示词、GPT-Image-2.5 API 和 OpenAI 新图像模型相关的提示词搜索。',
      en: 'Targets GPT Image 2.5 prompts, GPT-Image-2.5 API and OpenAI next image model prompt searches.'
    },
    keywords: {
      zh: [
        'GPT Image 2.5 prompt',
        'GPT Image 2.5 提示词',
        'OpenAI 新图像模型',
        'GPT-Image-2.5'
      ],
      en: [
        'GPT Image 2.5 prompts',
        'GPT Image 2.5 prompt examples',
        'GPT-Image-2.5',
        'OpenAI next image model'
      ]
    },
    target: { type: 'model', slug: 'gpt-image-2-5' }
  },
  {
    path: '/luna-lisa-alpha-prompts',
    canonicalPath: '/luna-lisa-alpha-prompts',
    title: {
      zh: 'Luna Lisa Alpha Prompt 案例与提示词',
      en: 'Luna Lisa Alpha Prompts & Examples'
    },
    description: {
      zh: '浏览 Luna Lisa Alpha（luna-lisa-alpha）prompt 案例和提示词结构。该模型目前只有社区测试与二手报道，尚未官宣，相关信息未经验证。',
      en: 'Browse Luna Lisa Alpha (luna-lisa-alpha) prompt examples and structure. The model is community-reported and unconfirmed, with no official announcement yet.'
    },
    badge: { zh: 'Luna Lisa Alpha 案例', en: 'Luna Lisa Alpha examples' },
    intent: {
      zh: '承接 luna-lisa-alpha prompt、Luna Lisa Alpha 提示词、Luna Lisa AI image model 和 OpenAI 新图像模型传闻相关的提示词搜索。',
      en: 'Targets luna-lisa-alpha prompts, Luna Lisa Alpha prompt examples, Luna Lisa AI image model and OpenAI image model rumor searches.'
    },
    keywords: {
      zh: [
        'luna-lisa-alpha 提示词',
        'Luna Lisa Alpha 图像模型',
        'Luna Lisa prompts',
        'OpenAI 新图像模型传闻'
      ],
      en: [
        'luna-lisa-alpha',
        'Luna Lisa Alpha prompts',
        'luna lisa alpha prompts',
        'Luna Lisa AI image model',
        'OpenAI image model rumor'
      ]
    },
    target: { type: 'model', slug: 'luna-lisa-alpha' }
  },
  {
    path: '/astra-prompts',
    canonicalPath: '/astra-prompts',
    title: {
      zh: 'Astra Prompt 案例与提示词（GPT-6 Astra）',
      en: 'Astra Prompts & Examples (GPT-6 Astra)'
    },
    description: {
      zh: '浏览 Astra（GPT-6 Astra）prompt 案例和提示词结构。OpenAI 已公开提及 Astra 处于内部测试，尚未发布，能力信息以官方公告为准。',
      en: 'Browse Astra (GPT-6 Astra) prompt examples and structure. OpenAI has acknowledged Astra is in internal testing but has not released it; capability info follows official announcements.'
    },
    badge: { zh: 'Astra 案例', en: 'Astra examples' },
    intent: {
      zh: '承接 Astra prompt、Astra 提示词、OpenAI Astra 模型和 GPT-6-Astra 图像与编程模型相关的提示词搜索。',
      en: 'Targets Astra prompts, OpenAI Astra model and GPT-6-Astra image and coding model prompt searches.'
    },
    keywords: {
      zh: [
        'Astra prompt',
        'Astra 提示词',
        'OpenAI Astra',
        'GPT-6-Astra',
        'AI 图片提示词'
      ],
      en: [
        'Astra prompts',
        'Astra prompt examples',
        'OpenAI Astra',
        'GPT-6-Astra prompts',
        'Astra AI model'
      ]
    },
    target: { type: 'model', slug: 'gpt-6-astra' }
  },
  {
    path: '/gpt-6-astra-prompts',
    canonicalPath: '/astra-prompts',
    title: {
      zh: 'GPT-6 Astra Prompt 案例与提示词',
      en: 'GPT-6 Astra Prompts & Examples'
    },
    description: {
      zh: '浏览 GPT-6 Astra（Astra）prompt 案例和提示词结构。该模型处于内部测试、尚未发布，本页汇总社区报道并区分官方信息。',
      en: 'Browse GPT-6 Astra (Astra) prompt examples and structure. The model is in internal testing and unreleased; this page separates community reports from official info.'
    },
    badge: { zh: 'GPT-6 Astra 案例', en: 'GPT-6 Astra examples' },
    intent: {
      zh: '承接 GPT-6-Astra、GPT 6 Astra prompt 和 GPT-6 Astra 提示词搜索，统一到 Astra 专题页。',
      en: 'Targets GPT-6-Astra, GPT 6 Astra prompt and GPT-6 Astra prompt example searches, consolidated into the Astra page.'
    },
    keywords: {
      zh: ['GPT-6-Astra', 'GPT-6 Astra prompt', 'GPT-6 Astra 提示词', 'A6TRA'],
      en: [
        'GPT-6-Astra prompts',
        'GPT 6 Astra prompts',
        'GPT-6 Astra prompt examples',
        'A6TRA prompts'
      ]
    },
    target: { type: 'model', slug: 'gpt-6-astra' }
  },
  {
    path: '/sref-prompts',
    canonicalPath: '/sref-prompts',
    title: {
      zh: 'SREF Prompts 与 Midjourney 风格参考案例库',
      en: 'SREF Prompts Library for Midjourney Style References'
    },
    description: {
      zh: '浏览 SREF prompts、style reference prompt 和 Midjourney 风格参考案例，并把稳定风格迁移到 WebToMind 工作流。',
      en: 'Browse SREF prompts, style reference prompts and Midjourney style-reference examples, then reuse stable style systems in WebToMind.'
    },
    target: { type: 'category', slug: 'sref-prompts' }
  },
  {
    path: '/ai-photo-prompts',
    canonicalPath: '/ai-photo-prompts',
    title: {
      zh: 'AI Photo Prompts 与真实摄影提示词',
      en: 'AI Photo Prompt Examples for Realistic Images'
    },
    description: {
      zh: '浏览 AI photo prompts、真实人像摄影 prompt 和可复用的镜头、光影、质感结构。',
      en: 'Copy AI photo prompt examples for realistic portraits, natural lighting, camera angles and detailed image textures, then adapt them in WebToMind.'
    },
    target: { type: 'category', slug: 'ai-portrait' }
  },
  {
    path: '/portrait-prompts',
    canonicalPath: '/portrait-prompts',
    title: {
      zh: 'Portrait Prompts 与 AI 写真案例',
      en: 'Portrait Prompt Examples for Realistic AI Photos'
    },
    description: {
      zh: '精选 portrait prompts，覆盖真人摄影、人像光影、姿态、服装和角色写真。',
      en: 'Copy portrait prompt examples for realistic AI photos, including camera, lighting, pose, expression and wardrobe details for consistent results.'
    },
    target: { type: 'category', slug: 'ai-portrait' }
  },
  {
    path: '/boudoir-prompts',
    canonicalPath: '/portrait-prompts',
    caseTarget: { type: 'category', slug: 'ai-portrait' },
    title: {
      zh: 'Boudoir Prompts 与私房写真提示词',
      en: 'Boudoir Prompts for Tasteful AI Portraits'
    },
    description: {
      zh: '浏览 boudoir prompts、私房写真提示词和丝缎晨光等非露骨审美向案例，复制后在 WebToMind 继续生成。',
      en: 'Browse boudoir prompts and tasteful, non-explicit AI portrait examples - satin, morning light and editorial framing you can copy and generate in WebToMind.'
    },
    badge: { zh: '私房写真 Prompt', en: 'Boudoir prompts' },
    intent: {
      zh: '承接 boudoir prompts、私房写真提示词、闺房写真提示词和非露骨审美向人像搜索。',
      en: 'Targets boudoir prompts, boudoir photography prompts and tasteful non-explicit AI portrait searches.'
    },
    keywords: {
      zh: [
        'boudoir prompts',
        '私房写真提示词',
        '闺房写真提示词',
        '丝缎睡衣 prompt'
      ],
      en: [
        'boudoir prompts',
        'boudoir photography prompts',
        'tasteful boudoir AI portrait',
        'satin portrait prompts'
      ]
    },
    workflow: [
      {
        zh: '先固定明确成年主体、完整衣着和非露骨边界，再谈氛围。',
        en: 'Lock an adult subject, fully covered wardrobe and a non-explicit boundary before styling the mood.'
      },
      {
        zh: '用光与材质表达亲密感：丝缎、纱帘、晨光、胶片颗粒和克制表情。',
        en: 'Express intimacy with light and fabric: satin, sheer curtains, morning light, film grain and a restrained expression.'
      },
      {
        zh: '把「避免儿童感、露骨、水印、可读文字」等约束放进 negative prompt。',
        en: 'Keep constraints like avoid childlike appearance, explicit content, watermarks and readable text in the negative prompt.'
      }
    ],
    examples: [
      {
        zh: '丝缎睡衣 + 晨光纱帘的私房写真，4:5 竖图，完整衣着、非露骨。',
        en: 'A satin pajama and silk robe look in warm window light, 4:5 vertical, fully covered and non-explicit.'
      }
    ],
    faq: [
      {
        question: {
          zh: '私房写真怎么保持非露骨？',
          en: 'How do boudoir prompts stay non-explicit?'
        },
        answer: {
          zh: '靠光、材质和构图表达氛围，而不是靠裸露：丝缎、纱帘、晨光、浅景深和克制表情。明确成年主体、完整衣着，并把「避免儿童感/露骨/水印」写进 negative prompt。',
          en: 'Express the mood with light, fabric and framing instead of nudity: satin, sheer curtains, morning light, shallow depth of field and a restrained expression. Keep an adult subject and fully covered wardrobe, and put avoid childlike or explicit content in the negative prompt.'
        }
      },
      {
        question: {
          zh: 'Boudoir prompts 和普通写真的区别？',
          en: 'How are boudoir prompts different from regular portraits?'
        },
        answer: {
          zh: '主要差别是氛围语境：boudoir 强调私密空间、柔和光线和睡衣/睡袍类材质，但 WebToMind 只生成非露骨版本。',
          en: 'The main difference is the mood context: boudoir leans on intimate spaces, soft light and sleepwear fabrics, but WebToMind only generates non-explicit versions.'
        }
      }
    ],
    sections: [
      {
        title: {
          zh: '私房写真 prompt 结构',
          en: 'Tasteful boudoir prompt structure'
        },
        body: {
          zh: '把私房写真拆成可替换 slot：主体、着装、空间、光线、镜头和负面约束，一次只换一个变量。',
          en: 'Split a boudoir prompt into replaceable slots: subject, wardrobe, space, light, lens and negative constraints, then change one variable at a time.'
        },
        items: [
          {
            zh: '主体：明确成年女性，表情克制、姿态自然，强调自信与松弛感。',
            en: 'Subject: a clearly adult woman with a restrained expression and natural, relaxed pose.'
          },
          {
            zh: '着装：丝缎睡衣、睡袍、针织套装等完整衣着，避免露骨表达。',
            en: 'Wardrobe: satin pajamas, robes or knit sets that are fully covered and non-explicit.'
          },
          {
            zh: '空间与光线：纱帘、晨光、暖调、浅景深和胶片颗粒塑造氛围。',
            en: 'Space and light: sheer curtains, morning light, warm palette, shallow depth of field and film grain.'
          }
        ]
      },
      {
        title: {
          zh: '不会翻车的私房写真场景',
          en: 'Boudoir scenes that stay reliable'
        },
        body: {
          zh: '以下场景按固定结构写，生成稳定且始终非露骨。',
          en: 'These scenes use a fixed structure that generates reliably and stays non-explicit.'
        },
        items: [
          {
            zh: '晨光丝缎：窗边、纱帘、丝缎睡衣，4:5 竖图。',
            en: 'Satin morning light: by a window with sheer curtains, satin pajamas, 4:5 vertical.'
          },
          {
            zh: '私房杂志编辑：暖调棚光、素色床品、编辑级构图。',
            en: 'Editorial boudoir: warm studio light, neutral bedding, editorial composition.'
          },
          {
            zh: '氛围侧影：深色背景、侧窗光、侧影剪影式构图。',
            en: 'Moody profile: dark backdrop, side window light and an elegant side-profile composition.'
          }
        ]
      }
    ],
    relatedLinks: [
      {
        path: '/blog/nsfw-prompts-guide',
        title: {
          zh: 'NSFW Prompts 是什么意思？AI 生图平台能做什么、不能做什么',
          en: 'What Are NSFW Prompts? What AI Image Platforms Can and Cannot Do'
        },
        description: {
          zh: '了解 NSFW 提示词的真实含义、平台内容边界，以及如何用非露骨审美向 prompt 获得稳定结果。',
          en: 'Learn what NSFW prompts really mean, platform content boundaries, and how to get stable results with non-explicit, tasteful prompts.'
        }
      }
    ]
  },
  {
    path: '/glamour-prompts',
    canonicalPath: '/ai-photo-prompts',
    caseTarget: { type: 'category', slug: 'ai-portrait' },
    title: {
      zh: 'Glamour Prompts 与魅力写真提示词',
      en: 'Glamour Prompts for AI Portrait Photography'
    },
    description: {
      zh: '浏览 glamour prompts、晚礼服写真和红毯风棚拍提示词，覆盖光影、镜头与造型结构。',
      en: 'Browse glamour prompts for AI portrait photography - evening gown, red carpet and studio editorial looks with lighting, lens and styling structure.'
    },
    badge: { zh: '魅力写真 Prompt', en: 'Glamour prompts' },
    intent: {
      zh: '承接 glamour prompts、晚礼服写真提示词、红毯风写真和棚拍人像提示词搜索。',
      en: 'Targets glamour prompts, glamour photoshoot prompts, red carpet portrait prompts and evening gown prompt searches.'
    },
    keywords: {
      zh: [
        'glamour prompts',
        '晚礼服写真提示词',
        '红毯风写真',
        '魅力写真'
      ],
      en: [
        'glamour prompts',
        'glamour photoshoot prompts',
        'red carpet portrait prompts',
        'evening gown prompts'
      ]
    },
    workflow: [
      {
        zh: '先定造型与场景：晚礼服、红毯、棚拍或杂志编辑，再写光线。',
        en: 'Start with the styling and scene: evening gown, red carpet, studio or editorial, then write the lighting.'
      },
      {
        zh: '用棚光和镜头语言表达高质感：轮廓光、85mm 定焦、干净背景、真实皮肤质感。',
        en: 'Use studio light and lens language for a premium feel: rim light, 85mm prime, clean backdrop and realistic skin texture.'
      },
      {
        zh: '完整礼服造型、非露骨；负面约束统一放 negative prompt。',
        en: 'Keep the look fully dressed and non-explicit; put negative constraints in the negative prompt.'
      }
    ],
    examples: [
      {
        zh: '祖母绿晚礼服棚拍、红毯闪光灯柔光、黑色丝绒长礼服三种魅力写真结构。',
        en: 'Three glamour structures: emerald evening gown studio, red-carpet soft flash and black velvet gown portrait.'
      }
    ],
    faq: [
      {
        question: {
          zh: 'Glamour 写真和普通写真有什么区别？',
          en: 'How is a glamour portrait different from a regular portrait?'
        },
        answer: {
          zh: 'Glamour 更强调造型完成度和光线氛围：晚礼服、红毯、棚拍、轮廓光和高质感修图；主体仍要求完整衣着、非露骨。',
          en: 'Glamour emphasizes styling completeness and light atmosphere: evening gowns, red carpet, studio, rim light and premium retouch; the subject must stay fully dressed and non-explicit.'
        }
      },
      {
        question: {
          zh: '晚礼服写真怎么避免 AI 味？',
          en: 'How do evening gown prompts avoid the AI look?'
        },
        answer: {
          zh: '加入真实摄影语境：具体焦段、真实皮肤质感、自然表情和电影感打光，而不是只写「超高清、完美」。',
          en: 'Add real photography context: a concrete focal length, realistic skin texture, natural expression and cinematic light instead of only ultra-HD or perfect.'
        }
      }
    ],
    sections: [
      {
        title: {
          zh: '魅力写真 prompt 结构',
          en: 'Glamour prompt structure'
        },
        body: {
          zh: '魅力写真的关键是造型完成度和光线氛围：先定造型与场景，再写棚光、镜头和修图质感。',
          en: 'Glamour is about styling completeness and light atmosphere: define the look and scene first, then write studio light, lens and retouch quality.'
        },
        items: [
          {
            zh: '造型：晚礼服、丝绒、珠宝、红毯或棚拍场景，完整衣着。',
            en: 'Styling: evening gowns, velvet, jewelry, red carpet or studio scenes, fully dressed.'
          },
          {
            zh: '光线：轮廓光、柔光反射、闪光灯加反光板，电影感高光控制。',
            en: 'Light: rim light, soft bounce, flash with a reflector, cinematic highlight control.'
          },
          {
            zh: '镜头与质感：85mm 定焦、干净背景、真实皮肤质感、杂志级修图。',
            en: 'Lens and texture: 85mm prime, clean backdrop, realistic skin texture and magazine-level retouch.'
          }
        ]
      },
      {
        title: {
          zh: '可直接复用的魅力写真造型',
          en: 'Reusable glamour looks'
        },
        body: {
          zh: '以下造型覆盖不同棚拍结构，可套用到形象照、红毯风与时尚媒体素材。',
          en: 'These looks cover different studio structures for personal branding, red-carpet style and fashion media assets.'
        },
        items: [
          {
            zh: '祖母绿晚礼服：中性背景 + 柔和棚光 + 轮廓光。',
            en: 'Emerald evening gown: neutral backdrop, soft studio light and a gentle rim.'
          },
          {
            zh: '红毯闪光灯：黑色丝绒 + 珠宝 + 柔光反射 + 干净活动背景。',
            en: 'Red-carpet flash: black velvet, jewelry, soft-bounced flash and a clean event backdrop.'
          },
          {
            zh: '黑色丝绒长礼服：高对比、深色背景、优雅站姿。',
            en: 'Black velvet gown: high contrast, dark backdrop and an elegant standing pose.'
          }
        ]
      }
    ],
    relatedLinks: [
      {
        path: '/blog/nsfw-prompts-guide',
        title: {
          zh: 'NSFW Prompts 是什么意思？AI 生图平台能做什么、不能做什么',
          en: 'What Are NSFW Prompts? What AI Image Platforms Can and Cannot Do'
        },
        description: {
          zh: '了解 NSFW 提示词的真实含义、平台内容边界，以及如何用非露骨审美向 prompt 获得稳定结果。',
          en: 'Learn what NSFW prompts really mean, platform content boundaries, and how to get stable results with non-explicit, tasteful prompts.'
        }
      }
    ]
  },
  {
    path: '/product-photography-prompts',
    canonicalPath: '/product-photography-prompts',
    title: {
      zh: 'Product Photography Prompts 与 AI 商品图案例',
      en: 'Product Photography Prompts for AI Images'
    },
    description: {
      zh: '浏览 product photography prompts，把商品主体、光影、背景、版式和卖点拆成可复用结构。',
      en: 'Browse product photography prompts that split product, lighting, background, layout and selling points into reusable structures.'
    },
    target: { type: 'category', slug: 'product-images' }
  },
  {
    path: '/character-design-prompts',
    canonicalPath: '/character-design-prompts',
    title: {
      zh: 'Character Design Prompts 与角色一致性案例',
      en: 'Character Design Prompts for AI Images'
    },
    description: {
      zh: '浏览 character design prompts，固定角色识别点、服装、镜头和场景，降低系列图漂移。',
      en: 'Browse character design prompts that lock identity cues, wardrobe, lens and scenes to reduce drift across image series.'
    },
    target: { type: 'category', slug: 'character-consistency' }
  },
  {
    path: '/text-to-image-prompts',
    canonicalPath: '/text-to-image-prompts',
    title: {
      zh: 'Text to Image Prompts 案例库',
      en: 'Text to Image Prompts Library'
    },
    description: {
      zh: '按模型和场景浏览 text to image prompts，复制提示词并在 WebToMind 中继续生成。',
      en: 'Browse text to image prompts by model and use case, copy prompts and generate from them in WebToMind.'
    }
  },
  {
    path: '/marketing-creative-prompts',
    canonicalPath: '/marketing-creative-prompts',
    title: {
      zh: 'Marketing Creative Prompts 与广告素材案例',
      en: 'Marketing Creative Prompts for AI Images'
    },
    description: {
      zh: '浏览适合营销海报、广告视觉、商品 KV 和社媒封面的 AI image prompts。',
      en: 'Browse AI image prompts for marketing posters, ad visuals, product KVs and social media covers.'
    }
  },
  {
    path: '/poster-design-prompts',
    canonicalPath: '/marketing-creative-prompts',
    caseTarget: { type: 'package', slug: 'wechat-cover-poster' },
    title: {
      zh: 'Poster Design Prompts',
      en: 'Poster Design Prompts'
    },
    description: {
      zh: '浏览适合 AI 海报设计、活动封面、社媒广告和品牌内容的 poster design prompts。',
      en: 'Browse poster design prompts for AI event posters, social ads, brand posts and campaign visuals.'
    },
    badge: { zh: '海报 Prompt', en: 'Poster prompts' },
    intent: {
      zh: '承接 poster design prompts、AI poster prompts 和活动海报提示词搜索。',
      en: 'Targets poster design prompts, AI poster prompts and event poster prompt searches.'
    },
    keywords: {
      zh: ['poster design prompts', 'AI poster prompts', '海报设计 prompt'],
      en: ['poster design prompts', 'AI poster prompts', 'event poster prompts']
    },
    workflow: [
      {
        zh: '先定义海报用途、受众、比例和信息层级，再写视觉风格。',
        en: 'Define poster purpose, audience, aspect ratio and information hierarchy before styling.'
      },
      {
        zh: '把主体、背景、留白、标题区和 CTA 区拆成可替换 slot。',
        en: 'Split subject, background, whitespace, headline area and CTA area into replaceable slots.'
      },
      {
        zh: '先生成无文字版视觉，再用设计工具补精确文字。',
        en: 'Generate a no-text visual first, then add exact copy in a design tool.'
      }
    ],
    examples: [
      {
        zh: '活动海报 prompt：人物或产品主体、强标题留白、品牌色和移动端可读构图。',
        en: 'Event poster prompt: person or product subject, strong headline whitespace, brand color and mobile-readable composition.'
      }
    ],
    faq: [
      {
        question: {
          zh: 'AI 海报 prompt 需要直接生成文字吗？',
          en: 'Should AI poster prompts generate final text?'
        },
        answer: {
          zh: '不建议依赖模型生成精确文字。更稳的方法是生成视觉底图，保留标题和 CTA 留白，再后期排版。',
          en: 'Do not rely on the model for exact text. A safer workflow is to generate the visual base, keep headline and CTA whitespace, then typeset later.'
        }
      }
    ]
  },
  {
    path: '/gta-vi-cover-prompts',
    canonicalPath: '/gta-vi-cover-prompts',
    caseTarget: { type: 'package', slug: 'wechat-cover-poster' },
    title: {
      zh: 'GTA VI Cover AI Prompt 案例',
      en: 'GTA VI Cover AI Prompt Examples'
    },
    description: {
      zh: '围绕 GTA VI Cover、GTA 6 cover art 和开放世界游戏封面搜索意图，整理可复用的 GPT Image 2 游戏封面 Prompt 案例。',
      en: 'Browse GPT Image 2 prompt examples for GTA VI Cover, GTA 6 cover art and open-world game cover search intent.'
    },
    badge: { zh: 'GTA VI Cover Prompt', en: 'GTA VI Cover Prompt' },
    intent: {
      zh: '承接 GTA VI Cover、GTA 6 cover art、game cover art prompt 和 open-world game key art 搜索，帮助用户用 WebToMind 生成同类开放世界游戏封面视觉。',
      en: 'Targets GTA VI Cover, GTA 6 cover art, game cover art prompt and open-world game key art searches for users who want reusable AI game cover prompts.'
    },
    keywords: {
      zh: [
        'GTA VI Cover',
        'GTA 6 cover art',
        'game cover art prompt',
        'open-world game key art'
      ],
      en: [
        'GTA VI Cover',
        'GTA 6 cover art',
        'game cover art prompt',
        'open-world game key art'
      ]
    },
    workflow: [
      {
        zh: '先确定 GTA VI Cover 这类开放世界游戏封面的核心结构：城市、角色、载具、夕阳或霓虹光影。',
        en: 'Start from the GTA VI Cover style search intent: city backdrop, characters, vehicles, sunset or neon lighting.'
      },
      {
        zh: '用 GPT Image 2 Prompt 固定封面比例、标题留白、主体层级和电影感关键视觉。',
        en: 'Use a GPT Image 2 prompt to lock cover ratio, title-safe space, subject hierarchy and cinematic key art structure.'
      },
      {
        zh: '生成无文字封面底图，再在设计工具中补标题、logo 和最终排版。',
        en: 'Generate a no-text cover base first, then add title, logo and final typography in a design tool.'
      }
    ],
    examples: [
      {
        zh: '开放世界游戏封面：霓虹海滨城市、成人角色组合、跑车前景、直升机探照灯和夕阳色彩。',
        en: 'Open-world game cover: neon coastal city, adult character group, sports-car foreground, helicopter searchlight and sunset palette.'
      },
      {
        zh: '女性主角游戏封面：街头服装、跑车、棕榈树、城市天际线和可放标题的封面留白。',
        en: 'Female protagonist game cover: streetwear, sports car, palm trees, city skyline and cover-safe title space.'
      },
      {
        zh: '霓虹开放世界主视觉：雨夜城市、高架道路、港口、载具和青紫色灯光。',
        en: 'Neon open-world key art: rainy city, elevated highway, harbor, vehicles and teal-magenta lighting.'
      }
    ],
    sections: [
      {
        title: {
          zh: 'GTA VI Cover 搜索意图怎么承接？',
          en: 'How this page covers GTA VI Cover search intent'
        },
        body: {
          zh: '用户搜索 GTA VI Cover 或 GTA 6 cover art 时，通常想找的是开放世界游戏封面的构图、角色、城市、载具和高饱和电影感视觉。WebToMind 用可复用 Prompt 案例承接这类需求。',
          en: 'When users search GTA VI Cover or GTA 6 cover art, they usually need composition, character, city, vehicle and cinematic color structures for open-world game cover visuals. WebToMind answers that intent with reusable prompt cases.'
        },
        items: [
          {
            zh: '适合做游戏封面概念、社媒主视觉、宣传海报和视频封面底图。',
            en: 'Useful for game cover concepts, social key visuals, campaign posters and video cover bases.'
          },
          {
            zh: '重点不是复制单张封面，而是复用封面结构并生成新的视觉方向。',
            en: 'The goal is not one fixed cover copy, but reusable cover structure and new visual directions.'
          }
        ]
      }
    ],
    faq: [
      {
        question: {
          zh: 'GTA VI Cover Prompt 能直接生成最终封面吗？',
          en: 'Can a GTA VI Cover prompt generate a final cover directly?'
        },
        answer: {
          zh: '更稳的做法是先生成无文字游戏封面底图，再用设计工具补标题、logo 和精确文字。',
          en: 'A more reliable workflow is to generate a no-text game cover base first, then add title, logo and exact typography in a design tool.'
        }
      },
      {
        question: {
          zh: '这些案例适合 GTA 6 cover art 搜索吗？',
          en: 'Do these examples fit GTA 6 cover art searches?'
        },
        answer: {
          zh: '适合。页面提供开放世界城市、角色、载具、霓虹光影和封面留白等结构化 Prompt，可用于同类游戏封面视觉探索。',
          en: 'Yes. The page provides structured prompts for open-world cities, characters, vehicles, neon lighting and cover-safe space for similar game cover exploration.'
        }
      }
    ]
  },
  {
    path: '/gta-6-cover-girls-prompts',
    canonicalPath: '/gta-6-cover-girls-prompts',
    caseTarget: { type: 'package', slug: 'gta-6-cover-girls-prompts' },
    title: {
      zh: "GTA 6's Cover Girls AI Prompt 案例",
      en: "GTA 6's Cover Girls AI Prompt Examples"
    },
    description: {
      zh: "围绕 GTA 6's cover girls、GTA 6 cover girl 和开放世界游戏女主封面搜索意图，整理可复用的 GPT Image 2 女主游戏封面 Prompt 案例。",
      en: "Browse GPT Image 2 prompt examples for GTA 6's cover girls, GTA 6 cover girl and open-world female protagonist game cover search intent."
    },
    badge: {
      zh: "GTA 6's Cover Girls Prompt",
      en: "GTA 6's Cover Girls Prompt"
    },
    intent: {
      zh: "承接 GTA 6's cover girls、GTA 6 cover girl、female protagonist game cover 和 open-world game cover girl 搜索，帮助用户用 WebToMind 生成同类原创女主游戏封面视觉。",
      en: "Targets GTA 6's cover girls, GTA 6 cover girl, female protagonist game cover and open-world game cover girl searches for users who want reusable AI game cover prompts."
    },
    keywords: {
      zh: [
        "GTA 6's cover girls",
        'GTA 6 cover girl',
        'female protagonist game cover',
        'open-world game cover girl'
      ],
      en: [
        "GTA 6's cover girls",
        'GTA 6 cover girl',
        'female protagonist game cover',
        'open-world game cover girl'
      ]
    },
    workflow: [
      {
        zh: "先拆解 GTA 6's cover girls 这类搜索的核心需求：成人女性主角、海滨城市、载具、霓虹或夕阳色彩和封面留白。",
        en: "Start from the GTA 6's cover girls search intent: adult female protagonist, coastal city, vehicles, neon or sunset color and cover-safe whitespace."
      },
      {
        zh: '用 GPT Image 2 Prompt 固定原创角色身份、封面比例、城市层次、载具前景和无文字输出。',
        en: 'Use a GPT Image 2 prompt to lock original character identity, cover ratio, city depth, vehicle foreground and no-text output.'
      },
      {
        zh: '生成原创女主游戏封面底图后，再在设计工具中补标题、平台规格和活动文案。',
        en: 'Generate an original female protagonist game cover base first, then add title, platform specs and campaign copy in a design tool.'
      }
    ],
    examples: [
      {
        zh: '夕阳女主封面：原创成人女性主角、霓虹海滨城市、跑车前景、湿地反光和顶部标题留白。',
        en: 'Sunset cover girl: original adult female protagonist, neon coastal city, sports-car foreground, wet reflections and title-safe sky.'
      },
      {
        zh: '霓虹双女主封面：两位原创成人女性、机车与跑车、夜生活街区、青紫灯光和电影感边缘光。',
        en: 'Neon duo cover girls: two original adult women, motorcycle and car, nightlife district, teal-magenta lighting and cinematic rim light.'
      },
      {
        zh: '三人组封面：原创女性主角阵容、码头天际线、敞篷车、晚霞反光和游戏盒封面构图。',
        en: 'Ensemble cover girls: original female cast, marina skyline, convertible, sunset reflections and video game box-art composition.'
      }
    ],
    sections: [
      {
        title: {
          zh: "GTA 6's Cover Girls 搜索意图怎么承接？",
          en: "How this page covers GTA 6's Cover Girls search intent"
        },
        body: {
          zh: "用户搜索 GTA 6's cover girls 时，通常想找的是开放世界游戏封面里的女性主角构图、城市氛围、载具、海滨霓虹和高饱和宣传视觉。WebToMind 用原创角色 Prompt 案例承接这类需求。",
          en: "When users search GTA 6's cover girls, they usually need female protagonist composition, city atmosphere, vehicles, coastal neon and saturated campaign visuals for open-world game covers. WebToMind answers that intent with original character prompt cases."
        },
        items: [
          {
            zh: '适合做原创游戏封面概念、角色海报、社媒主视觉和视频封面底图。',
            en: 'Useful for original game cover concepts, character posters, social key visuals and video cover bases.'
          },
          {
            zh: '重点是复用搜索背后的女主封面结构，而不是复制真实游戏角色或官方封面。',
            en: 'The goal is to reuse the female protagonist cover structure behind the search, not to copy real game characters or official covers.'
          }
        ]
      }
    ],
    faq: [
      {
        question: {
          zh: "GTA 6's Cover Girls Prompt 应该直接写真实游戏名吗？",
          en: "Should a GTA 6's Cover Girls prompt use the real game name directly?"
        },
        answer: {
          zh: '做 SEO 承接时页面可以覆盖搜索词；实际生成图片时建议写成原创开放世界女主封面，避免 logo、真实角色和可识别商标。',
          en: 'The page can cover the search term for SEO. For image generation, write an original open-world female protagonist cover prompt and avoid logos, real characters and recognizable trademarks.'
        }
      },
      {
        question: {
          zh: '这些案例适合做游戏封面女主图吗？',
          en: 'Are these examples suitable for female protagonist game cover art?'
        },
        answer: {
          zh: '适合。页面提供单女主、双女主和三人组封面结构，覆盖城市、载具、海滨霓虹、夕阳光影和标题留白。',
          en: 'Yes. The page provides single-protagonist, duo and ensemble cover structures with city, vehicle, coastal neon, sunset lighting and title-safe whitespace.'
        }
      }
    ]
  },
  {
    path: '/brand-identity-prompts',
    canonicalPath: '/marketing-creative-prompts',
    caseTarget: { type: 'package', slug: 'storefront-marketing-kit' },
    title: {
      zh: 'Brand Identity Prompts',
      en: 'Brand Identity Prompts'
    },
    description: {
      zh: '浏览适合品牌视觉、广告 KV、门店物料和社媒内容的 brand identity prompts。',
      en: 'Browse brand identity prompts for campaign KVs, storefront materials, social posts and consistent brand visuals.'
    },
    badge: { zh: '品牌视觉 Prompt', en: 'Brand identity prompts' },
    intent: {
      zh: '承接 brand identity prompts、AI brand prompts 和品牌视觉提示词搜索。',
      en: 'Targets brand identity prompts, AI brand prompts and brand visual prompt searches.'
    },
    keywords: {
      zh: ['brand identity prompts', 'AI brand prompts', '品牌视觉 prompt'],
      en: ['brand identity prompts', 'AI brand prompts', 'brand visual prompts']
    },
    workflow: [
      {
        zh: '先确定品牌调性、核心受众、色彩方向和输出渠道。',
        en: 'Define brand tone, core audience, color direction and output channel first.'
      },
      {
        zh: '把品牌元素转成可复用视觉约束，不要求模型直接生成准确 logo。',
        en: 'Turn brand elements into reusable visual constraints instead of asking the model for exact logos.'
      },
      {
        zh: '用同一 prompt 结构测试多张 KV、门店物料和社媒视觉。',
        en: 'Use the same prompt structure to test campaign KVs, storefront materials and social visuals.'
      }
    ],
    examples: [
      {
        zh: '品牌 KV prompt：产品主体、品牌色、材质语气、背景层次和广告留白。',
        en: 'Brand KV prompt: product subject, brand colors, material tone, background hierarchy and ad whitespace.'
      }
    ],
    faq: [
      {
        question: {
          zh: 'Brand identity prompt 可以生成 logo 吗？',
          en: 'Can a brand identity prompt generate a logo?'
        },
        answer: {
          zh: '可以做方向探索，但不要把 AI 生成图直接当最终商标。正式使用前需要人工设计、版权检查和商标检索。',
          en: 'It can explore directions, but AI output should not be treated as a final trademark. Use human design, rights checks and trademark search before launch.'
        }
      }
    ]
  },
  {
    path: '/3d-figurine-prompts',
    canonicalPath: '/character-design-prompts',
    caseTarget: { type: 'category', slug: 'character-consistency' },
    title: {
      zh: '3D Figurine Prompts',
      en: '3D Figurine Prompts'
    },
    description: {
      zh: '浏览适合 3D figurine、潮玩角色、桌面手办和角色一致性测试的 AI image prompts。',
      en: 'Browse 3D figurine prompts for collectible characters, desktop toys and character consistency tests.'
    },
    badge: { zh: '3D 手办 Prompt', en: '3D figurine prompts' },
    intent: {
      zh: '承接 3D figurine prompts、AI toy figure prompts 和角色手办提示词搜索。',
      en: 'Targets 3D figurine prompts, AI toy figure prompts and collectible character prompt searches.'
    },
    keywords: {
      zh: ['3D figurine prompts', 'AI toy figure prompts', '手办 prompt'],
      en: [
        '3D figurine prompts',
        'AI toy figure prompts',
        'collectible character prompts'
      ]
    },
    workflow: [
      {
        zh: '先固定角色识别点、比例、服装、姿态和材质。',
        en: 'Lock identity cues, proportions, outfit, pose and material first.'
      },
      {
        zh: '明确是玩具摄影、3D 渲染、盲盒风格还是产品展示图。',
        en: 'Specify whether the output is toy photography, 3D render, blind-box style or product display.'
      },
      {
        zh: '用同一角色约束生成多角度和多场景版本。',
        en: 'Generate multiple angles and scenes with the same character constraints.'
      }
    ],
    examples: [
      {
        zh: '3D 手办 prompt：Q 版比例、软胶材质、透明展示盒、棚拍灯光和桌面场景。',
        en: '3D figurine prompt: chibi proportions, vinyl material, clear display box, studio lighting and desktop scene.'
      }
    ],
    faq: [
      {
        question: {
          zh: '3D figurine prompt 和 character design prompt 有什么区别？',
          en: 'How is a 3D figurine prompt different from a character design prompt?'
        },
        answer: {
          zh: '3D figurine 更强调玩具材质、产品展示、包装和可收藏感；character design 更强调角色识别点和系列一致性。',
          en: '3D figurine prompts emphasize toy material, product display, packaging and collectibility, while character design focuses on identity cues and series consistency.'
        }
      }
    ]
  },
  {
    path: '/clay-aesthetic-prompts',
    canonicalPath: '/en-US/prompts',
    caseTarget: { type: 'package', slug: 'ai-image-prompt-examples' },
    title: {
      zh: 'Clay Aesthetic Prompts',
      en: 'Clay Aesthetic Prompts'
    },
    description: {
      zh: '浏览 clay aesthetic prompts，复用软陶、黏土、3D 手工质感和可爱商业视觉的提示词结构。',
      en: 'Browse clay aesthetic prompts for soft clay, handmade 3D textures and playful commercial visuals.'
    },
    badge: { zh: 'Clay Aesthetic', en: 'Clay aesthetic' },
    intent: {
      zh: '承接 clay aesthetic prompts、claymation prompts 和软陶风格图片提示词搜索。',
      en: 'Targets clay aesthetic prompts, claymation prompts and soft 3D clay image prompt searches.'
    },
    keywords: {
      zh: ['clay aesthetic prompts', 'claymation prompts', '软陶风格 prompt'],
      en: [
        'clay aesthetic prompts',
        'claymation prompts',
        'soft clay 3D prompts'
      ]
    },
    workflow: [
      {
        zh: '先明确 clay 风格用于角色、商品、图标还是社媒视觉。',
        en: 'Decide whether the clay style is for characters, products, icons or social visuals.'
      },
      {
        zh: '固定软陶材质、圆润边缘、棚拍灯光和低复杂度背景。',
        en: 'Lock soft clay material, rounded edges, studio lighting and low-complexity background.'
      },
      {
        zh: '用同一材质约束生成系列化视觉，保持品牌统一感。',
        en: 'Use the same material constraints to create a consistent visual series.'
      }
    ],
    examples: [
      {
        zh: 'Clay aesthetic prompt：圆润 3D 商品图、柔和阴影、手工黏土质感和简洁背景。',
        en: 'Clay aesthetic prompt: rounded 3D product visual, soft shadows, handmade clay texture and clean background.'
      }
    ],
    faq: [
      {
        question: {
          zh: 'Clay aesthetic prompts 适合商业图吗？',
          en: 'Are clay aesthetic prompts useful for commercial images?'
        },
        answer: {
          zh: '适合轻量品牌、社媒视觉、图标、儿童向产品和可爱风格商品图，但不适合需要真实材质还原的严肃产品图。',
          en: 'They work for lightweight brands, social visuals, icons, kids products and playful product images, but not for serious product shots requiring realistic material accuracy.'
        }
      }
    ]
  }
];

const COMMERCIAL_PACKAGE_SEO_PAGES: PromptSeoPage[] = [
  {
    type: 'package',
    slug: 'xiaohongshu-cover',
    title: {
      zh: '小红书封面商业 Prompt 模板包',
      en: 'Xiaohongshu cover commercial prompt pack'
    },
    description: {
      zh: '20 个面向小红书封面、课程首图、探店攻略和个人 IP 内容的 GPT Image 2 商业 Prompt 案例。',
      en: '20 GPT Image 2 commercial prompt cases for Xiaohongshu covers, course thumbnails, local guides and personal-brand content.'
    },
    badge: { zh: '商业模板包', en: 'Commercial pack' },
    intent: {
      zh: '适合需要快速生产小红书封面、9:16 内容首图和移动端高点击封面的创作者。',
      en: 'For creators who need fast Xiaohongshu covers, 9:16 content thumbnails and mobile-first social cover images.'
    },
    keywords: {
      zh: ['小红书封面 Prompt', '小红书首图 AI', '9:16 商业封面'],
      en: [
        'Xiaohongshu cover prompt',
        'AI social cover',
        '9:16 commercial cover'
      ]
    },
    workflow: [
      {
        zh: '先选接近业务场景的封面案例，再替换主题、受众和标题留白。',
        en: 'Pick the closest cover case first, then replace topic, audience and title-safe space.'
      },
      {
        zh: '保留 9:16、移动端首屏识别和封面信息密度约束。',
        en: 'Keep the 9:16 ratio, mobile-first readability and cover information-density constraints.'
      },
      {
        zh: '用完整 Prompt 进入创作台继续出变体，把高点击风格沉淀成 Skill。',
        en: 'Open the full prompt in the studio, generate variants and turn high-performing patterns into Skills.'
      }
    ],
    examples: [
      {
        zh: '健身减脂打卡、AI 工具教程、职场效率方法论、探店攻略收藏型封面。',
        en: 'Fitness check-ins, AI tool tutorials, workplace productivity methods and save-worthy local guide covers.'
      }
    ],
    faq: [
      {
        question: {
          zh: '这些案例适合直接发布到小红书吗？',
          en: 'Can these cases be published directly to Xiaohongshu?'
        },
        answer: {
          zh: '它们更适合作为封面视觉底图和版式方向，标题文字建议后期排版，稳定性更高。',
          en: 'They work best as cover base visuals and layout directions. Add exact title text later for better reliability.'
        }
      }
    ]
  },
  {
    type: 'package',
    slug: 'ecommerce-product-photo',
    title: {
      zh: '电商主图商业 Prompt 模板包',
      en: 'Ecommerce product photo commercial prompt pack'
    },
    description: {
      zh: '20 个覆盖产品卖点主图、质感特写、独立站首屏和场景 KV 的 GPT Image 2 商品图案例。',
      en: '20 GPT Image 2 product-image cases for selling-point hero shots, texture closeups, storefront hero visuals and scene KVs.'
    },
    badge: { zh: '商业模板包', en: 'Commercial pack' },
    intent: {
      zh: '面向电商品牌、独立站运营和商品视觉外包，快速测试主图方向和广告视觉。',
      en: 'For ecommerce brands, DTC operators and product-visual teams testing hero images and ad visuals quickly.'
    },
    keywords: {
      zh: ['电商主图 Prompt', 'AI 商品图', '产品摄影 AI'],
      en: ['ecommerce product prompt', 'AI product photo', 'product hero image']
    },
    workflow: [
      {
        zh: '明确产品品类、卖点和使用场景，再选择主图、特写或场景图结构。',
        en: 'Define product category, selling point and use scenario, then choose hero, closeup or scene structure.'
      },
      {
        zh: '保留材质、光影、背景和广告留白，避免每张图像不同摄影棚。',
        en: 'Lock material, lighting, background and ad whitespace so images do not feel like different studios.'
      },
      {
        zh: '把高转化图继续拆成产品视觉 Skill，用于同系列 SKU 扩展。',
        en: 'Turn high-converting visuals into product Skills for same-series SKU expansion.'
      }
    ],
    examples: [
      {
        zh: '护肤精华新品、运动鞋功能卖点、香薰礼盒、咖啡器具独立站首屏。',
        en: 'Skincare serum launches, running-shoe selling points, candle gift boxes and coffee gear hero sections.'
      }
    ],
    faq: [
      {
        question: {
          zh: '商品图案例是否需要上传参考商品图？',
          en: 'Do product cases require a reference product image?'
        },
        answer: {
          zh: '首轮可用文字测试视觉方向；正式生产同款 SKU 时建议加参考图锁定外观。',
          en: 'Use text first to test visual direction; add references for production SKU work to lock product appearance.'
        }
      }
    ]
  },
  {
    type: 'package',
    slug: 'wechat-cover-poster',
    title: {
      zh: '公众号封面商业 Prompt 模板包',
      en: 'WeChat article cover commercial prompt pack'
    },
    description: {
      zh: '公众号封面商业 Prompt 模板包：20 个适合深度长文、行业报告、知识科普的 GPT Image 2 封面案例，复制后直接进入创作。',
      en: '20 GPT Image 2 cover cases for WeChat long reads, industry reports, explainers and opinion articles.'
    },
    badge: { zh: '商业模板包', en: 'Commercial pack' },
    intent: {
      zh: '帮助内容团队快速生成公众号封面主视觉，减少每篇文章重新找图和试风格。',
      en: 'Helps content teams generate WeChat article cover visuals faster without restarting visual exploration every time.'
    },
    keywords: {
      zh: ['公众号封面 Prompt', '文章封面 AI', '知识科普封面'],
      en: ['WeChat cover prompt', 'AI article cover', 'explainer cover image']
    },
    workflow: [
      {
        zh: '按文章类型选择深度长文、科普、报告解读或观点评论结构。',
        en: 'Choose the structure by article type: long read, explainer, report analysis or opinion piece.'
      },
      {
        zh: '固定横版比例、标题空间、视觉隐喻和信息密度。',
        en: 'Lock horizontal ratio, title space, visual metaphor and information density.'
      },
      {
        zh: '发布后按阅读率和点击率筛选可孵化为公众号封面 Skill 的案例。',
        en: 'After publishing, use read and click rates to identify cases worth turning into WeChat cover Skills.'
      }
    ],
    examples: [
      {
        zh: 'AI 创业趋势、年度总结复盘、消费品牌观察、心理学科普文章封面。',
        en: 'AI startup trends, annual reviews, consumer-brand analysis and psychology explainer covers.'
      }
    ],
    faq: [
      {
        question: {
          zh: '公众号封面应该生成带字图吗？',
          en: 'Should WeChat covers generate final text inside the image?'
        },
        answer: {
          zh: '建议先生成无字或弱文字底图，再用设计工具叠加标题，避免文字错误。',
          en: 'Generate a no-text or low-text base visual first, then add exact titles in a design tool to avoid text errors.'
        }
      }
    ]
  },
  {
    type: 'package',
    slug: 'portrait-character-consistency',
    title: {
      zh: '人像写真与角色一致性商业 Prompt 模板包',
      en: 'Portrait and character consistency commercial pack'
    },
    description: {
      zh: '20 个面向商业头像、个人品牌照、角色海报和系列写真样张的 GPT Image 2 案例。',
      en: '20 GPT Image 2 cases for commercial avatars, personal-brand portraits, character posters and consistent portrait series.'
    },
    badge: { zh: '商业模板包', en: 'Commercial pack' },
    intent: {
      zh: '适合用 AI 快速探索人物形象、角色样张和可复用的人像视觉系统。',
      en: 'For fast exploration of personal images, character samples and reusable portrait visual systems.'
    },
    keywords: {
      zh: ['AI 商业头像', '角色一致性 Prompt', 'AI 写真样张'],
      en: [
        'AI commercial avatar',
        'character consistency prompt',
        'AI portrait samples'
      ]
    },
    workflow: [
      {
        zh: '先确定人物身份、职业气质、镜头语言和必须保留的识别点。',
        en: 'Define identity, professional tone, lens language and identity anchors first.'
      },
      {
        zh: '每次只替换背景、姿态、服装或海报用途中的一个变量。',
        en: 'Change only one variable at a time: background, pose, outfit or poster use.'
      },
      {
        zh: '把稳定结果沉淀成角色 Skill，供后续系列图复用。',
        en: 'Turn stable results into character Skills for later image-series reuse.'
      }
    ],
    examples: [
      {
        zh: '摄影师个人品牌照、咖啡店主理人写真、虚拟主播角色海报、知识博主头像。',
        en: 'Photographer brand portraits, cafe-owner photos, virtual streamer posters and expert creator avatars.'
      }
    ],
    faq: [
      {
        question: {
          zh: '没有参考图能做到角色一致吗？',
          en: 'Can character consistency work without references?'
        },
        answer: {
          zh: '可以做风格和身份设定的一致，但正式系列生产建议加入参考图或角色卡。',
          en: 'You can keep style and identity direction consistent, but production series should use references or character cards.'
        }
      }
    ]
  },
  {
    type: 'package',
    slug: 'storefront-marketing-kit',
    title: {
      zh: '门店营销物料商业 Prompt 模板包',
      en: 'Storefront marketing kit commercial prompt pack'
    },
    description: {
      zh: '20 个适合门店促销、会员日、节日活动、桌卡门贴和到店转化的 GPT Image 2 物料案例。',
      en: '20 GPT Image 2 marketing-material cases for storefront promos, member days, seasonal campaigns, table cards and in-store conversion.'
    },
    badge: { zh: '商业模板包', en: 'Commercial pack' },
    intent: {
      zh: '帮助单店和小团队快速做出可投放的门店活动视觉，降低设计外包和反复改稿成本。',
      en: 'Helps single-store teams and small businesses create campaign visuals faster with less outsourcing and revision cost.'
    },
    keywords: {
      zh: ['门店营销物料 AI', '促销海报 Prompt', '到店转化海报'],
      en: [
        'storefront marketing prompt',
        'promo poster AI',
        'in-store conversion poster'
      ]
    },
    workflow: [
      {
        zh: '先明确门店类型、活动目标、优惠形式和使用载体。',
        en: 'Define store type, campaign goal, offer format and physical/digital placement first.'
      },
      {
        zh: '把门贴、桌卡、海报和社媒图作为不同交付物处理。',
        en: 'Treat door stickers, table cards, posters and social images as separate deliverables.'
      },
      {
        zh: '保留品牌调性和活动信息层级，后期再叠加准确文案。',
        en: 'Preserve brand tone and campaign hierarchy, then add exact copy later.'
      }
    ],
    examples: [
      {
        zh: '咖啡店新品拿铁、花店情人节预售、健身房体验课、火锅店工作日引流。',
        en: 'New latte launches, flower-shop Valentine preorders, gym trial classes and weekday hotpot traffic campaigns.'
      }
    ],
    faq: [
      {
        question: {
          zh: '门店物料能直接用于印刷吗？',
          en: 'Are these storefront materials print-ready?'
        },
        answer: {
          zh: 'v1 更适合生成视觉方向和底图；印刷前仍应做尺寸、出血、文字和品牌规范检查。',
          en: 'v1 is best for visual direction and base images; check size, bleed, text and brand rules before printing.'
        }
      }
    ]
  }
];

export const PROMPT_SEO_PAGES: PromptSeoPage[] = [
  ...COMMERCIAL_PACKAGE_SEO_PAGES,
  {
    type: 'model',
    slug: 'gpt-image-2',
    title: {
      zh: 'GPT Image 2 提示词案例与生成器',
      en: 'GPT Image 2 prompt examples and generator'
    },
    description: {
      zh: '浏览可复用 GPT Image 2 提示词案例，把人像、商品图、商业摄影、封面海报和角色图拆成可复现的创作结构。',
      en: 'Reusable GPT Image 2 prompt examples for portraits, product visuals, commercial photography, poster covers and character images with reproducible structure.'
    },
    badge: { zh: '模型专题', en: 'Model guide' },
    intent: {
      zh: '适合正在搜索 GPT Image 2 prompt examples、提示词模板和可复现图片生成方法的用户。',
      en: 'Built for users searching GPT Image 2 prompt examples, prompt templates and repeatable image-generation workflows.'
    },
    keywords: {
      zh: [
        'free GPT Image 2 prompts',
        'GPT Image 2 prompt examples',
        'GPT Image 2 提示词',
        'AI 图片生成 prompt',
        '可复现 AI 写真',
        '参考图改写 prompt',
        '商品图 prompt examples',
        '商业摄影 prompt',
        'AI 海报 prompt',
        'Q版涂鸦 prompt'
      ],
      en: [
        'free GPT Image 2 prompts',
        'GPT Image 2 prompt examples',
        'gpt image examples',
        'AI portrait prompts',
        'portrait prompt examples',
        'GPT Image 2 prompts',
        'GPT Image 2 product photo prompts',
        'GPT Image 2 commercial photography prompts',
        'GPT Image 2 portrait prompts',
        'GPT Image 2 character design prompts',
        'GPT Image 2 cinematic poster prompts',
        'chibi doodle prompt examples',
        'reference image to prompt',
        'AI image prompt generator',
        'reproducible AI portraits'
      ]
    },
    workflow: [
      {
        zh: '先确定主体、镜头、光影、材质和画面用途，避免只写一段松散描述。',
        en: 'Start with subject, lens, lighting, texture and output purpose instead of one loose paragraph.'
      },
      {
        zh: '把成功案例拆成 slot，后续只替换角色、服装、场景或版式。',
        en: 'Split successful cases into slots so later runs only swap character, wardrobe, scene or layout.'
      },
      {
        zh: '用 WebToMind 保存模型、尺寸、质量和张数，让同一 prompt 能继续迭代。',
        en: 'Save model, size, quality and count in WebToMind so the same prompt can be iterated.'
      },
      {
        zh: '把公开免费案例作为结构参考，再替换主体、品牌、场景和输出渠道，避免复制第三方产品名或竞品语境。',
        en: 'Use free public examples as structural references, then replace subject, brand, scene and output channel instead of copying third-party product names or competitor context.'
      }
    ],
    examples: [
      {
        zh: '9:16 真实摄影人像，固定脸型、镜头和光影，只替换服装与场景。',
        en: '9:16 realistic portrait with locked face, lens and lighting, swapping only wardrobe and scene.'
      },
      {
        zh: '电商商品图，固定产品主体和卖点，生成不同背景和版式候选。',
        en: 'Ecommerce product image with locked product subject and selling point, generating background and layout variants.'
      },
      {
        zh: '参考图改写 prompt，把灵感图拆成构图、光影、材质和输出用途，再替换成自己的商品或角色。',
        en: 'Reference-image remix prompt that turns an inspiration image into composition, lighting, material and output-purpose slots, then replaces it with your own product or character.'
      },
      {
        zh: 'AI portrait prompt examples：先固定成年人物、镜头、光线方向和皮肤质感，再替换职业、服装、背景和发布渠道。',
        en: 'AI portrait prompt examples: lock adult subject, lens, light direction and skin texture first, then swap role, wardrobe, background and publishing channel.'
      },
      {
        zh: '角色设计 prompt，固定识别点、服装、姿态和世界观，用于角色设定板和系列图。',
        en: 'Character design prompt with locked identity cues, wardrobe, pose and world setting for turnarounds and image series.'
      },
      {
        zh: '电商首屏主视觉 prompt，定义商品、卖点、背景层次、CTA 留白和移动端裁切安全区。',
        en: 'Ecommerce hero image prompt defining product, selling point, background hierarchy, CTA whitespace and mobile crop-safe area.'
      },
      {
        zh: '商业摄影 prompt，用俯拍、棚拍、食品、饮料和生活方式场景承接广告素材搜索。',
        en: 'Commercial photography prompt for top-down shots, studio setups, food, beverages and lifestyle ad visuals.'
      },
      {
        zh: '电影海报与 Q 版涂鸦 prompt，把 typography、silhouette、anime、chibi 等风格词拆成稳定视觉约束。',
        en: 'Cinematic poster and chibi doodle prompt structures that turn typography, silhouette, anime and chibi style terms into stable visual constraints.'
      }
    ],
    sections: [
      {
        title: {
          zh: 'Free GPT Image 2 prompt examples',
          en: 'Free GPT Image 2 prompt examples'
        },
        body: {
          zh: '这些免费案例适合作为结构模板：复制 prompt slot，不复制第三方产品名、竞品页面或不属于自己的品牌元素。',
          en: 'Use these free examples as structure templates: copy the prompt slots, not third-party product names, competitor pages or brand elements you do not own.'
        },
        items: [
          {
            zh: '商品图：主体、卖点、材质、棚拍灯光、背景层次和广告留白。',
            en: 'Product photo: subject, selling point, material, studio lighting, background hierarchy and ad whitespace.'
          },
          {
            zh: '人像图：成年主体、镜头、光线方向、服装质感、背景语境和真实摄影限制。',
            en: 'Portrait: adult subject, lens, light direction, wardrobe texture, background context and realistic photography constraints.'
          },
          {
            zh: 'Portrait prompt examples：把头像、创始人照、编辑写真和社媒封面拆成同一套人像 slot。',
            en: 'Portrait prompt examples: use the same portrait slots for headshots, founder photos, editorial portraits and social covers.'
          },
          {
            zh: '角色图：识别点、服装、轮廓、姿态、表情和系列一致性约束。',
            en: 'Character image: identity cues, outfit, silhouette, pose, expression and series-consistency constraints.'
          },
          {
            zh: '广告与商业摄影：产品、食物、饮料、俯拍构图、棚拍材质和留白版式。',
            en: 'Ads and commercial photography: products, food, beverages, top-down composition, studio material and whitespace layout.'
          },
          {
            zh: '海报与插画：typography、silhouette、anime、chibi、doodle 等风格词需要转成主体、轮廓和版式约束。',
            en: 'Posters and illustration: typography, silhouette, anime, chibi and doodle terms should become subject, silhouette and layout constraints.'
          }
        ]
      },
      {
        title: {
          zh: '已验证长尾词的承接方式',
          en: 'How this page handles validated long-tail searches'
        },
        body: {
          zh: '当 free GPT Image 2 prompts、GPT Image 2 prompt examples、AI portrait prompts 和 portrait prompt examples 都成立时，优先强化同一个 canonical 页面，再用人像、商品图和图库案例做内链分流。',
          en: 'When free GPT Image 2 prompts, GPT Image 2 prompt examples, AI portrait prompts and portrait prompt examples are all valid, strengthen one canonical page first, then route users into portrait, product and gallery examples.'
        },
        items: [
          {
            zh: '主页面回答模型与免费案例意图：哪些 slot 可复制，哪些主体、品牌和第三方语境必须替换。',
            en: 'The main page answers model and free-example intent: which slots can be copied, and which subjects, brands and third-party context must be replaced.'
          },
          {
            zh: '人像意图通过 portrait prompts 补足：主体、姿态、服装完整性、镜头、光影和真实皮肤质感。',
            en: 'Portrait intent is supported by portrait prompts: subject, pose, wardrobe completeness, lens, lighting and realistic skin texture.'
          },
          {
            zh: '图库意图通过可视化案例承接：优先展示有明确用途的 prompt cases，而不是堆砌同义词。',
            en: 'Gallery intent is handled through visual cases with clear use, not by stuffing synonyms.'
          }
        ]
      },
      {
        title: {
          zh: 'GPT Image 2 更适合的任务',
          en: 'Best GPT Image 2 use cases'
        },
        body: {
          zh: 'GPT Image 2 页面优先承接“可复现案例”和“模型 prompt 模板”搜索，不把它写成泛 AI 图片生成器介绍。',
          en: 'This page focuses on reproducible examples and model-specific prompt templates instead of a generic AI image generator description.'
        },
        items: [
          {
            zh: '真实人像、商品视觉、海报草图、角色设定和需要较强 prompt adherence 的任务。',
            en: 'Realistic portraits, product visuals, poster drafts, character concepts and tasks that need stronger prompt adherence.'
          },
          {
            zh: '需要保留构图、镜头和输出用途的系列图，而不是一次性灵感图。',
            en: 'Image series that must preserve composition, lens and output use, not only one-off inspiration images.'
          },
          {
            zh: '适合把成功图保存成案例，再围绕主体、服装、背景、光影做小步迭代。',
            en: 'Useful when saving winning results as cases and iterating subject, wardrobe, background and lighting in small steps.'
          }
        ]
      },
      {
        title: {
          zh: 'GPT Image 2 prompt structure',
          en: 'GPT Image 2 prompt structure'
        },
        body: {
          zh: '稳定的 GPT Image 2 prompt 应该先说明输出目标，再拆主体、画面、光影和约束。',
          en: 'A stable GPT Image 2 prompt should define the output goal first, then break down subject, frame, lighting and constraints.'
        },
        items: [
          {
            zh: '输出目标：商品主图、肖像、角色设定板、参考图改写、广告 KV 或落地页 hero。',
            en: 'Output goal: product hero, portrait, character sheet, reference-image remix, ad KV or landing-page hero.'
          },
          {
            zh: '画面骨架：比例、构图、景别、镜头、主体大小、前中后景和留白。',
            en: 'Frame structure: aspect ratio, composition, shot size, lens, subject scale, foreground/background and whitespace.'
          },
          {
            zh: '控制项：光源、材质、色彩、真实程度、不要出现的文字错误、变形和品牌混淆。',
            en: 'Controls: light source, material, color, realism level, unwanted text errors, distortion and brand confusion.'
          }
        ]
      },
      {
        title: {
          zh: '从 GPT Image 2 拆到人像、风格和商品图',
          en: 'Map GPT Image 2 prompts into portrait, style and product workflows'
        },
        body: {
          zh: '搜索 GPT Image 2 prompt examples 的用户通常不是只要一段文字，而是想知道同一个结构如何迁移到人像、风格参考和商业图片。',
          en: 'People searching GPT Image 2 prompt examples usually need more than one copyable paragraph; they need a structure that can move across portraits, style references and commercial images.'
        },
        items: [
          {
            zh: '做人像时，先进入 portrait prompts 思路：固定成年主体、镜头、光线方向、服装完整性和真实摄影限制。',
            en: 'For portraits, use the portrait prompts workflow first: lock adult subject, lens, light direction, wardrobe completeness and realistic-photo constraints.'
          },
          {
            zh: '做风格迁移时，把 SREF 或 style reference 拆成色彩、材质、颗粒、构图和镜头距离，不把来源名称写进最终 prompt。',
            en: 'For style transfer, turn SREF or style references into color, material, grain, composition and lens-distance slots instead of copying the source name into the final prompt.'
          },
          {
            zh: '做商品图时，优先写清楚商品主体、卖点、材质、背景层次、广告留白和移动端裁切安全区。',
            en: 'For product images, define product subject, selling point, material, background hierarchy, ad whitespace and mobile crop-safe areas first.'
          }
        ]
      },
      {
        title: {
          zh: '限制与设置建议',
          en: 'Limitations and settings'
        },
        items: [
          {
            zh: '不要同时替换太多变量；如果主体、镜头、风格和比例都变，难以判断失败原因。',
            en: 'Avoid changing too many variables at once; changing subject, lens, style and ratio together makes failures hard to diagnose.'
          },
          {
            zh: '保存尺寸、质量、张数和负面约束，方便和 Nano Banana、Flux、Seedream 横向比较。',
            en: 'Save size, quality, count and negative constraints so results can be compared against Nano Banana, Flux and Seedream.'
          },
          {
            zh: '对商业图优先描述画面用途和层级，而不是只写“高质量、高清、真实”。',
            en: 'For commercial images, describe output use and visual hierarchy before vague terms like high quality or realistic.'
          }
        ]
      }
    ],
    faq: [
      {
        question: {
          zh: 'GPT Image 2 提示词要写很长吗？',
          en: 'Do GPT Image 2 prompts need to be long?'
        },
        answer: {
          zh: '不一定。更关键的是结构清楚：主体、环境、镜头、光影、材质、约束和输出用途都要分明。',
          en: 'Not always. Clear structure matters more: subject, environment, lens, lighting, texture, constraints and output use should be explicit.'
        }
      },
      {
        question: {
          zh: '如何减少每次生成结果漂移？',
          en: 'How do I reduce result drift?'
        },
        answer: {
          zh: '固定角色和镜头等核心 slot，只改一个变量，并保存成功组合为可复用案例。',
          en: 'Lock core slots such as identity and lens, change one variable at a time, and save winning combinations as reusable cases.'
        }
      },
      {
        question: {
          zh: '哪里可以找到 free GPT Image 2 prompts？',
          en: 'Where can I find free GPT Image 2 prompts?'
        },
        answer: {
          zh: '这个页面提供免费公开案例和结构示例。建议复制主体、场景、镜头、光影、材质和负面约束这些 slot，再替换成自己的商品、人物或角色。',
          en: 'This page includes free public examples and prompt structures. Copy slots such as subject, scene, lens, lighting, material and negative constraints, then replace them with your own product, person or character.'
        }
      },
      {
        question: {
          zh: 'GPT Image 2 prompt examples、AI portrait prompts 和 portrait prompt examples 应该分开建页吗？',
          en: 'Should GPT Image 2 prompt examples, AI portrait prompts and portrait prompt examples be separate pages?'
        },
        answer: {
          zh: '不优先分开。模型意图先由 GPT Image 2 canonical 页面承接；当用户明显在找人物、镜头、姿态和写真质感时，再通过 portrait prompts 内链补足。',
          en: 'Not by default. Model intent should land on the GPT Image 2 canonical page first; when the user clearly needs subject, lens, pose and portrait texture, internal links route them to portrait prompts.'
        }
      },
      {
        question: {
          zh: 'GPT Image 2 prompt examples 可以直接商用吗？',
          en: 'Can GPT Image 2 prompt examples be reused commercially?'
        },
        answer: {
          zh: 'Prompt 结构可以复用，但正式商用前仍需要检查生成图片、参考素材、人物肖像、商标、品牌元素和平台规则。',
          en: 'Prompt structures can be reused, but before commercial use you still need to review generated images, references, likeness rights, trademarks, brand elements and platform rules.'
        }
      },
      {
        question: {
          zh: 'GPT Image 2 prompt examples 和 image to prompt generator 怎么配合？',
          en: 'How do GPT Image 2 prompt examples work with an image to prompt generator?'
        },
        answer: {
          zh: '先用 image to prompt generator 从参考图提取构图、光影和材质，再把结果套入 GPT Image 2 prompt examples 的结构，生成自己的原创版本。',
          en: 'Use the image to prompt generator to extract composition, lighting and material from a reference image, then fit that output into GPT Image 2 prompt example structures to create your own original version.'
        }
      },
      {
        question: {
          zh: '什么时候应该从 GPT Image 2 prompts 跳到 portrait prompts？',
          en: 'When should I use portrait prompts with GPT Image 2 prompts?'
        },
        answer: {
          zh: '当搜索意图已经从模型本身转向人物、镜头、光影、姿态和真实摄影质感时，应该用 portrait prompts 补足人像结构，再回到 GPT Image 2 页面选择模型和生成设置。',
          en: 'Use portrait prompts when the intent shifts from the model itself to subject, lens, lighting, pose and realistic photo texture, then return to the GPT Image 2 page for model and generation settings.'
        }
      },
      {
        question: {
          zh: 'SREF prompts 可以直接放进 GPT Image 2 prompt 吗？',
          en: 'Can SREF prompts be used directly inside GPT Image 2 prompts?'
        },
        answer: {
          zh: '更稳妥的做法是把 SREF 或 style reference 拆成可解释的风格 slot，例如色彩、材质、颗粒、镜头距离和构图，而不是直接复制第三方名称、页面标题或不可验证代码。',
          en: 'A safer workflow is to translate SREF or style references into explainable style slots such as color, material, grain, lens distance and composition instead of copying third-party names, page titles or opaque codes.'
        }
      }
    ]
  },
  {
    type: 'model',
    slug: 'nano-banana',
    title: {
      zh: 'Nano Banana 提示词案例与模型设置',
      en: 'Nano Banana prompt examples and model settings'
    },
    description: {
      zh: '整理 Nano Banana 图片生成提示词的结构、参数和案例，适合快速做社媒封面、写真和角色图。',
      en: 'Explore Nano Banana prompt structure, settings and examples for social covers, portraits and character images.'
    },
    badge: { zh: '模型专题', en: 'Model guide' },
    intent: {
      zh: '面向想比较 Nano Banana 与 GPT Image 2、Flux 等模型的创作者。',
      en: 'For creators comparing Nano Banana with GPT Image 2, Flux and other image models.'
    },
    keywords: {
      zh: [
        'Nano Banana prompts gallery',
        'Nano Banana prompt examples',
        'Nano Banana prompt',
        'Nano Banana AI 图片',
        'AI 生图模型设置'
      ],
      en: [
        'Nano Banana prompts gallery',
        'Nano Banana prompt examples',
        'Nano Banana prompts',
        'Nano Banana AI images',
        'free Nano Banana prompts',
        'AI image model settings'
      ]
    },
    workflow: [
      {
        zh: '先选择模型和尺寸，再用 prompt 固定主体、风格和输出比例。',
        en: 'Choose model and size first, then use the prompt to lock subject, style and output ratio.'
      },
      {
        zh: '用案例库记录适合 Nano Banana 的措辞和失败约束。',
        en: 'Use the case library to preserve Nano Banana phrasing and failure constraints.'
      },
      {
        zh: '对比同一 prompt 在不同模型下的视觉差异，再决定主力模型。',
        en: 'Compare the same prompt across models before choosing the primary model.'
      },
      {
        zh: '如果目标是 SEO 图库和案例发现，优先保存可被 GPT Image 2 兼容执行的通用 prompt 结构，再用 Nano Banana 标签承接搜索意图。',
        en: 'For SEO gallery and case discovery, save a general prompt structure that can also run in GPT Image 2, then use Nano Banana tagging to capture the search intent.'
      }
    ],
    examples: [
      {
        zh: '小红书封面，明亮背景、清晰主体、移动端可读构图。',
        en: 'Xiaohongshu cover with bright background, clear subject and mobile-readable composition.'
      },
      {
        zh: '角色图系列，固定角色识别点，批量替换姿态和背景。',
        en: 'Character image series with locked identity cues and swapped poses/backgrounds.'
      },
      {
        zh: 'Nano Banana prompts gallery：用一组社媒封面、人像、商品图和角色图案例，让用户先看图再复制结构。',
        en: 'Nano Banana prompts gallery: use social cover, portrait, product and character examples so users can inspect the image before copying the structure.'
      },
      {
        zh: 'Nano Banana prompt examples：每个案例都写清楚主体、画幅、光影、失败约束和可替换变量。',
        en: 'Nano Banana prompt examples: each case should spell out subject, crop, lighting, failure constraints and replaceable variables.'
      }
    ],
    sections: [
      {
        title: {
          zh: 'Nano Banana prompts gallery 承接策略',
          en: 'Nano Banana prompts gallery strategy'
        },
        body: {
          zh: '图库搜索意图更接近“先看可用案例”，所以页面应优先展示有图、有用途、有可复制结构的 prompt cases。',
          en: 'Gallery searches usually mean the user wants usable examples first, so this page should prioritize cases with images, clear use and copyable structure.'
        },
        items: [
          {
            zh: '首屏案例优先覆盖社媒封面、AI 写真、商品组合和角色变化。',
            en: 'Top examples should cover social covers, AI portraits, product bundles and character variations.'
          },
          {
            zh: '每个案例都避免第三方产品名，使用通用主体、无品牌商品和原创人物。',
            en: 'Each case avoids third-party product names and uses generic subjects, unbranded products and original people.'
          },
          {
            zh: '同一结构可以进入 GPT Image 2、Nano Banana 或其他模型测试，页面只负责承接搜索意图和案例浏览。',
            en: 'The same structure can be tested in GPT Image 2, Nano Banana or other models; the page handles search intent and case browsing.'
          }
        ]
      },
      {
        title: {
          zh: 'Nano Banana 更适合的任务',
          en: 'Best Nano Banana use cases'
        },
        body: {
          zh: 'Nano Banana 页面的重点是快速创意测试和轻量生产，而不是承诺每个复杂场景都稳定。',
          en: 'This page positions Nano Banana for fast creative testing and lightweight production instead of promising stability for every complex scene.'
        },
        items: [
          {
            zh: '社媒封面、头像、轻量写真、角色变化和需要快速多版本比较的图。',
            en: 'Social covers, avatars, lightweight portraits, character variations and images that need fast variant comparison.'
          },
          {
            zh: '适合先跑方向，再把稳定结构迁移到更正式的模型/参数组合。',
            en: 'Useful for exploring direction first, then moving stable structures to a more formal model and settings combination.'
          },
          {
            zh: '适合把“失败约束”写进案例，比如脸部漂移、构图拥挤、文字不可控。',
            en: 'Good for recording failure constraints such as face drift, crowded composition and unreliable text.'
          }
        ]
      },
      {
        title: {
          zh: '设置与复用建议',
          en: 'Settings and reuse tips'
        },
        items: [
          {
            zh: '移动端内容优先测试 9:16 或 4:5，确保主体足够大、层级足够清晰。',
            en: 'For mobile content, test 9:16 or 4:5 first so the subject is large and hierarchy is readable.'
          },
          {
            zh: '同一 prompt 至少保存 2-3 个候选结果，避免只凭单张结果判断模型能力。',
            en: 'Save at least two or three candidates from the same prompt before judging the model.'
          },
          {
            zh: '将可复用措辞沉淀为 WebToMind 案例，后续替换角色、场景、服装和背景。',
            en: 'Preserve reusable phrasing as WebToMind cases, then swap character, scene, wardrobe and background later.'
          }
        ]
      }
    ],
    faq: [
      {
        question: {
          zh: 'Nano Banana 适合什么图片？',
          en: 'What is Nano Banana best for?'
        },
        answer: {
          zh: '更适合快速测试创意、封面图和角色变化。正式生产时建议与保存的 prompt 案例一起管理。',
          en: 'It is useful for fast creative tests, covers and character variations. For production, manage it together with saved prompt cases.'
        }
      },
      {
        question: {
          zh: 'Nano Banana prompts gallery 应该放哪些案例？',
          en: 'What should a Nano Banana prompts gallery include?'
        },
        answer: {
          zh: '优先放用户能直接复用的图：社媒封面、AI 写真、商品组合、角色变化和风格测试。每个案例都要说明可替换变量和不应复制的品牌/第三方语境。',
          en: 'Prioritize images users can reuse: social covers, AI portraits, product bundles, character variations and style tests. Each case should explain replaceable variables and brand or third-party context that should not be copied.'
        }
      },
      {
        question: {
          zh: '能手动输入其他模型名吗？',
          en: 'Can I enter another model name manually?'
        },
        answer: {
          zh: '可以。WebToMind 的案例管理支持下拉选择常用模型，也保留手动输入。',
          en: 'Yes. WebToMind case management supports common model options and manual model entry.'
        }
      }
    ]
  },
  {
    type: 'model',
    slug: 'flux',
    title: {
      zh: 'Flux AI 提示词案例与图片生成工作流',
      en: 'Flux AI prompt examples and image workflow'
    },
    description: {
      zh: '围绕 Flux AI 图片生成整理 prompt 结构、风格迁移和批量变体案例。',
      en: 'Prompt structure, style transfer and batch-variation examples for Flux AI image generation.'
    },
    badge: { zh: '模型专题', en: 'Model guide' },
    intent: {
      zh: '承接 Flux prompt、Flux AI image generator 和风格迁移相关搜索。',
      en: 'Targets Flux prompt, Flux AI image generator and style-transfer search intent.'
    },
    keywords: {
      zh: ['Flux prompt', 'Flux AI 图片生成', 'AI 风格迁移'],
      en: [
        'Flux prompts',
        'Flux AI image generator',
        'AI style transfer prompts'
      ]
    },
    workflow: [
      {
        zh: '把风格拆成镜头、光影、材质和色彩，而不是只写一个风格名。',
        en: 'Break style into lens, lighting, texture and color instead of only naming a style.'
      },
      {
        zh: '保留负面约束，减少塑料感、过度磨皮和默认 AI 味。',
        en: 'Keep negative constraints to reduce plastic texture, over-smoothing and default AI look.'
      },
      {
        zh: '把表现好的 Flux prompt 转成可复用 WebToMind 案例。',
        en: 'Turn strong Flux prompts into reusable WebToMind cases.'
      }
    ],
    examples: [
      {
        zh: '品牌海报风格迁移：同一产品主体，生成 4 组场景和灯光。',
        en: 'Brand poster style transfer: same product subject with four scene and lighting variants.'
      },
      {
        zh: '角色写真：保留角色识别点，替换摄影风格和背景。',
        en: 'Character portrait: keep identity cues while swapping photographic style and background.'
      }
    ],
    sections: [
      {
        title: {
          zh: 'Flux 更适合的任务',
          en: 'Best Flux use cases'
        },
        body: {
          zh: 'Flux 页面的核心是风格迁移、质感控制和批量变体，适合承接 Flux prompts 和 Flux AI image generator 搜索。',
          en: 'This page focuses on style transfer, texture control and batch variants for Flux prompts and Flux AI image generator searches.'
        },
        items: [
          {
            zh: '品牌视觉、风格海报、材质测试、角色写真和需要横向比较的创意候选。',
            en: 'Brand visuals, style posters, material tests, character portraits and creative candidates that need side-by-side comparison.'
          },
          {
            zh: '适合把“风格名”拆成镜头、光影、材质、色彩和后期质感。',
            en: 'Useful for breaking style names into lens, lighting, material, color and post-processing texture.'
          },
          {
            zh: '适合做同一主体的多背景、多光源、多构图探索。',
            en: 'Useful for exploring multiple backgrounds, light sources and compositions for the same subject.'
          }
        ]
      },
      {
        title: {
          zh: '限制与排错',
          en: 'Limitations and troubleshooting'
        },
        items: [
          {
            zh: '如果结果有默认 AI 味，优先补真实摄影语境、具体材质和负面约束。',
            en: 'If results feel too generic, add photographic context, concrete materials and negative constraints first.'
          },
          {
            zh: '风格词不要过多叠加；多个强风格会互相抵消或导致画面混乱。',
            en: 'Avoid stacking too many strong style terms; they can cancel each other or make the image chaotic.'
          },
          {
            zh: '把稳定的 Flux prompt 保存成案例，再用于 GPT Image 2 或 Seedream 的横向测试。',
            en: 'Save stable Flux prompts as cases, then test them against GPT Image 2 or Seedream.'
          }
        ]
      }
    ],
    faq: [
      {
        question: {
          zh: 'Flux prompt 和 GPT Image 2 prompt 能共用吗？',
          en: 'Can Flux prompts and GPT Image 2 prompts be reused?'
        },
        answer: {
          zh: '可以复用结构，但模型对词序、约束和风格词敏感度不同，建议保存模型参数一起测试。',
          en: 'The structure can be reused, but models differ in sensitivity to order, constraints and style words, so save model settings together.'
        }
      },
      {
        question: {
          zh: 'Flux 更适合批量风格测试吗？',
          en: 'Is Flux good for batch style tests?'
        },
        answer: {
          zh: '适合。把风格拆成 slot 后，可以快速做多版本比较。',
          en: 'Yes. Splitting style into slots makes it easier to compare multiple variants quickly.'
        }
      }
    ]
  },
  {
    type: 'model',
    slug: 'midjourney-alternative',
    title: {
      zh: 'Midjourney 工作流：可复现 Prompt 案例',
      en: 'Midjourney workflow with reproducible prompts'
    },
    description: {
      zh: '把 Midjourney 风格灵感转成可保存、可复用、可重新编辑的 WebToMind prompt 工作流。',
      en: 'Turn Midjourney-style inspiration into saveable, reusable and re-editable WebToMind prompt workflows.'
    },
    badge: { zh: 'Midjourney', en: 'Midjourney' },
    intent: {
      zh: '面向在搜索 Midjourney prompt、prompt adherence 和角色一致性的用户。',
      en: 'For users searching Midjourney prompts, prompt adherence and character consistency.'
    },
    keywords: {
      zh: ['Midjourney', 'Midjourney prompt 案例', '角色一致性 prompt'],
      en: [
        'Midjourney',
        'Midjourney prompt examples',
        'character consistency prompts'
      ]
    },
    workflow: [
      {
        zh: '从参考图或成功图反推视觉 slot，减少从零写 prompt。',
        en: 'Reverse visual slots from references or successful images instead of starting from scratch.'
      },
      {
        zh: '保存模型和参数，后续能按历史图继续重编。',
        en: 'Save model and settings so previous images can be re-edited later.'
      },
      {
        zh: '用案例库沉淀风格，而不是依赖一次性 Discord prompt。',
        en: 'Preserve styles in a case library instead of one-off Discord prompts.'
      }
    ],
    examples: [
      {
        zh: '把一张 Midjourney 风格参考拆成构图、光影、材质和负面约束。',
        en: 'Split a Midjourney-style reference into composition, lighting, material and negative constraints.'
      },
      {
        zh: '同一角色多场景图，逐步替换背景并控制角色漂移。',
        en: 'Same-character multi-scene images with background swaps and drift control.'
      }
    ],
    faq: [
      {
        question: {
          zh: 'WebToMind 是 Midjourney 吗？',
          en: 'Is WebToMind Midjourney?'
        },
        answer: {
          zh: '不是。WebToMind 更强调 prompt 案例、视觉 slot 和可复现工作流，可配合不同模型使用。',
          en: 'No. WebToMind focuses on prompt cases, visual slots and reproducible workflows across different models.'
        }
      },
      {
        question: {
          zh: '为什么要做替代工作流？',
          en: 'Why use an alternative workflow?'
        },
        answer: {
          zh: '很多用户需要更强的编辑、保存、复用和角色一致性，而不只是一次性生成漂亮图。',
          en: 'Many users need editing, saving, reuse and character consistency, not just one-off beautiful images.'
        }
      }
    ]
  },
  {
    type: 'model',
    slug: 'grok-imagine',
    title: {
      zh: 'Grok Imagine Image 2.0 Prompt 案例与工作流',
      en: 'Grok Imagine Image 2.0 prompts and workflows'
    },
    description: {
      zh: '承接 Imagine Image 2.0、Grok Imagine 和 xAI 图像生成的热点搜索，用可复现的 prompt 结构、参考图反推与视觉 slot 把灵感变成可保存、可编辑、可复用的创作工作流。',
      en: 'Reusable Imagine Image 2.0 and Grok Imagine prompts with structured slots, reference-image reverse engineering and cross-image consistency.'
    },
    badge: { zh: '模型专题', en: 'Model guide' },
    intent: {
      zh: '面向正在搜索 Imagine Image 2.0、Grok Imagine Image 2.0、imagine image 2.0 prompts 和 xAI 图像编辑的用户，提供结构化提示词、跨图一致性方法和可复用案例。',
      en: 'Built for users searching Imagine Image 2.0, Grok Imagine Image 2.0, imagine image 2.0 prompts and xAI image editing, with structured prompts, cross-image consistency methods and reusable cases.'
    },
    keywords: {
      zh: [
        'Imagine Image 2.0',
        'Grok Imagine Image 2.0',
        'imagine image 2.0 prompts',
        'Grok 图像生成 prompt',
        'xAI 图片编辑'
      ],
      en: [
        'Imagine Image 2.0 prompts',
        'Grok Imagine Image 2.0',
        'imagine image 2.0 prompt examples',
        'Grok Imagine prompts',
        'xAI image generation prompts',
        'free imagine image 2.0 prompts',
        'AI image editing prompts'
      ]
    },
    workflow: [
      {
        zh: '先确认主体、场景、镜头、光影和输出用途，把 prompt 拆成 slot，不写一段松散描述。',
        en: 'Define subject, scene, lens, lighting and output purpose first, then split the prompt into slots instead of writing one loose paragraph.'
      },
      {
        zh: '利用模型的多参考图能力：用最多 5 张输入图锁定角色、产品或版式，再替换场景与镜头。',
        en: 'Leverage multi-reference support: use up to five input images to lock character, product or layout, then swap scene and lens.'
      },
      {
        zh: '把稳定结果保存为可复用案例，后续只替换一个变量继续生成，记录模型与参数差异。',
        en: 'Save stable results as reusable cases and change one variable at a time, tracking model and parameter differences.'
      }
    ],
    examples: [
      {
        zh: '海报与封面：固定 9:16 或 2.35:1 版式，用清晰文字层级生成可读标题与主体。',
        en: 'Poster and cover: lock a 9:16 or 2.35:1 layout and generate readable headline hierarchy with crisp text.'
      },
      {
        zh: '电商主图：用参考图锁定产品主体和卖点，批量测试背景、灯光和版式候选。',
        en: 'Ecommerce hero: lock the product subject and selling point with references, then test background, lighting and layout variants.'
      },
      {
        zh: '人物跨场景一致：用同一组参考图固定角色识别点，替换职业、服装和拍摄地点。',
        en: 'Cross-scene character consistency: fix identity cues with the same reference set, then swap role, wardrobe and location.'
      }
    ],
    faq: [
      {
        question: {
          zh: 'Imagine Image 2.0 是什么？',
          en: 'What is Imagine Image 2.0?'
        },
        answer: {
          zh: 'Imagine Image 2.0 是 xAI（Grok）于 2026 年 8 月发布的图像生成与编辑模型，作为 Quality Mode 在 Grok 网页端、iOS 和 Android 上线，并开放开发者 API。据公开评测，其在文生图与图像编辑两项上排名全球第 2，仅次于 GPT Image 2。',
          en: 'Imagine Image 2.0 is xAI (Grok)\'s image generation and editing model released in August 2026 as a Quality Mode on Grok web, iOS and Android, with a developer API. Public arena rankings place it second globally in both text-to-image and image editing, behind GPT Image 2.'
        }
      },
      {
        question: {
          zh: 'Imagine Image 2.0 能做什么？',
          en: 'What can Imagine Image 2.0 do?'
        },
        answer: {
          zh: '官方宣传重点包括更精准的提示词遵循、清晰文字渲染、背景移除、智能选择与智能调整大小，并支持最多 5 张输入图用于跨图一致性，同时提供多种应用模板。',
          en: 'Official highlights include stronger prompt adherence, crisp text rendering, background removal, smart selection and resize, up to five input images for cross-image consistency, plus application templates.'
        }
      },
      {
        question: {
          zh: 'WebToMind 能直接用 Imagine Image 2.0 生成吗？',
          en: 'Can WebToMind generate with Imagine Image 2.0 directly?'
        },
        answer: {
          zh: '不能。WebToMind 未接入 xAI/Grok 的 Imagine Image 2.0 API，也不与其关联。本页的价值是承接该关键词的搜索意图：提供结构化提示词、参考图反推与可复用案例，并用 WebToMind 支持的模型完成实际生成。',
          en: 'No. WebToMind is not integrated with xAI/Grok\'s Imagine Image 2.0 API and is not affiliated with them. This page serves the search intent with structured prompts, reference reverse-engineering and reusable cases, and runs actual generation on WebToMind-supported models.'
        }
      },
      {
        question: {
          zh: '怎么写出更适合 Imagine Image 2.0 的 prompt？',
          en: 'How do I write prompts that work well with Imagine Image 2.0?'
        },
        answer: {
          zh: '按主体、场景、镜头、光影、材质、风格和负面约束拆成 slot；需要文字时明确文案内容、字体层级和版式；需要角色或产品一致时，用多张参考图锁定识别点。',
          en: 'Split the prompt into subject, scene, lens, lighting, material, style and negative-constraint slots; state copy, type hierarchy and layout explicitly when text is needed; lock identity with multiple references for character or product consistency.'
        }
      }
    ]
  },
  {
    type: 'model',
    slug: 'seedream',
    title: {
      zh: 'Seedream Prompts 与图片生成案例',
      en: 'Seedream prompts and image examples'
    },
    description: {
      zh: '整理 Seedream prompts、模型设置和可复用图片案例，适合快速测试人像、商品图、海报和角色设计。',
      en: 'Browse Seedream prompts, model settings and reusable image examples for portraits, product images, posters and character design.'
    },
    badge: { zh: '模型专题', en: 'Model guide' },
    intent: {
      zh: '面向正在搜索 Seedream prompt、Seedream AI image generator 和多模型提示词案例的创作者。',
      en: 'For creators searching Seedream prompt, Seedream AI image generator and multi-model prompt examples.'
    },
    keywords: {
      zh: ['Seedream prompt', 'Seedream AI 图片', 'AI image prompts'],
      en: [
        'Seedream prompts',
        'Seedream AI image generator',
        'AI image prompts'
      ]
    },
    workflow: [
      {
        zh: '先用清晰主体、场景、镜头和输出用途建立 prompt 骨架。',
        en: 'Start with a clear subject, scene, lens and output purpose.'
      },
      {
        zh: '保留模型、尺寸、质量和负面约束，方便和 GPT Image 2、Nano Banana 横向比较。',
        en: 'Save model, size, quality and negative constraints so results can be compared with GPT Image 2 and Nano Banana.'
      },
      {
        zh: '把稳定结果保存成案例，后续只替换一个变量继续生成。',
        en: 'Save stable results as cases and change one variable at a time for later generations.'
      }
    ],
    examples: [
      {
        zh: '商业商品图：固定产品主体，测试不同材质背景和灯光。',
        en: 'Commercial product image: lock the product subject and test different material backgrounds and lighting.'
      },
      {
        zh: '移动端封面：固定 9:16 构图，生成清晰主体和可读层级。',
        en: 'Mobile cover: lock a 9:16 composition with clear subject and readable hierarchy.'
      }
    ],
    sections: [
      {
        title: {
          zh: 'Seedream 更适合的任务',
          en: 'Best Seedream use cases'
        },
        body: {
          zh: 'Seedream 页面的定位是多模型 prompt 案例和快速生产测试，重点帮助用户判断同一结构能否迁移。',
          en: 'This page positions Seedream as a multi-model prompt case and fast production test page, focused on whether the same structure can transfer.'
        },
        items: [
          {
            zh: '人像、商品图、营销海报、角色设计和需要较快验证的商业素材。',
            en: 'Portraits, product images, marketing posters, character design and commercial assets that need fast validation.'
          },
          {
            zh: '适合和 GPT Image 2、Nano Banana、Flux 使用同一 prompt 做横向对比。',
            en: 'Useful for comparing the same prompt against GPT Image 2, Nano Banana and Flux.'
          },
          {
            zh: '适合沉淀模型差异：哪些词在 Seedream 上更稳定，哪些约束需要调整。',
            en: 'Useful for documenting model differences: which phrases are stable in Seedream and which constraints need adjustment.'
          }
        ]
      },
      {
        title: {
          zh: '设置与质量检查',
          en: 'Settings and quality checks'
        },
        items: [
          {
            zh: '保存尺寸、质量和负面词，尤其记录商品图中的材质、反光、阴影和背景层级。',
            en: 'Save size, quality and negatives, especially material, reflection, shadow and background hierarchy in product images.'
          },
          {
            zh: '移动端封面要检查主体是否足够清晰，避免 prompt 生成过多小物件。',
            en: 'For mobile covers, check whether the subject stays readable and avoid prompts that create too many small objects.'
          },
          {
            zh: '把通过质量检查的 Seedream 结果保存为案例，再进入后续版本迭代。',
            en: 'Save Seedream results that pass quality checks as cases before continuing later iterations.'
          }
        ]
      }
    ],
    faq: [
      {
        question: {
          zh: 'Seedream prompt 能直接复用到其他模型吗？',
          en: 'Can Seedream prompts be reused in other models?'
        },
        answer: {
          zh: '可以复用结构，但不同模型对风格词、负面词和细节顺序的敏感度不同，建议保留模型参数一起测试。',
          en: 'The structure can be reused, but models differ in sensitivity to style words, negatives and detail order, so keep model settings with each test.'
        }
      },
      {
        question: {
          zh: '为什么要保存 Seedream 案例？',
          en: 'Why save Seedream prompt cases?'
        },
        answer: {
          zh: '保存案例能复用成功的主体、镜头、灯光和约束，减少每次从零调 prompt。',
          en: 'Saved cases preserve successful subject, lens, lighting and constraints, reducing the need to rewrite prompts from scratch.'
        }
      }
    ]
  },
  {
    type: 'model',
    slug: 'mona-lisa-1',
    title: {
      zh: 'mona-lisa-1 提示词与图片生成案例',
      en: 'mona-lisa-1 prompts and image examples'
    },
    description: {
      zh: '整理 mona-lisa-1 提示词、模型动态和可复用图片案例。mona-lisa-1 是 2026 年 8 月匿名出现在 LMArena 的 OpenAI 图像模型，经 SynthID 水印验证，官方尚未官宣。',
      en: 'Reusable mona-lisa-1 prompts, model updates and image examples. mona-lisa-1 is the OpenAI image model found anonymously on LMArena in August 2026, verified by SynthID watermark and not yet officially announced.'
    },
    badge: { zh: '模型专题', en: 'Model guide' },
    intent: {
      zh: '面向正在搜索 mona-lisa-1 prompt、mona-lisa-1 提示词、OpenAI 新图像模型和 GPT Image 2.5 动态的创作者。',
      en: 'For creators searching mona-lisa-1 prompts, mona lisa 1 prompt examples, the new OpenAI image model and GPT Image 2.5 news.'
    },
    keywords: {
      zh: [
        'mona-lisa-1 prompt',
        'mona-lisa-1 提示词',
        'OpenAI mona-lisa-1',
        'GPT Image 2.5 prompt',
        'AI 图片提示词案例'
      ],
      en: [
        'mona-lisa-1 prompts',
        'mona lisa 1 prompts',
        'mona-lisa-1 prompt examples',
        'OpenAI mona-lisa-1',
        'GPT Image 2.5 prompts'
      ]
    },
    workflow: [
      {
        zh: '先区分事实与传闻：mona-lisa-1 已通过 SynthID 水印确认为 OpenAI 出品，但官方尚未发布正式公告或 API 文档。',
        en: 'Separate facts from speculation first: mona-lisa-1 is verified as OpenAI output through the SynthID watermark, but there is no official announcement or API documentation yet.'
      },
      {
        zh: '用 slot 结构写 prompt：主体、场景、镜头、光影、材质、风格和负面约束分开维护，等模型正式开放后可直接迁移。',
        en: 'Write prompts with a slot structure: subject, scene, lens, lighting, material, style and negative constraints, so the same structure can be reused once the model officially launches.'
      },
      {
        zh: '保留模型、尺寸、质量和负面词，重点和 GPT Image 2 对比真实感、塑料感、细节和复杂信息图表现。',
        en: 'Save model, size, quality and negatives, and compare against GPT Image 2 on realism, plastic look, detail and complex infographic performance.'
      },
      {
        zh: '把稳定结果保存成案例，官方发布后直接复用成功的主体、镜头和约束，而不是重新调 prompt。',
        en: 'Save stable results as cases so winning subjects, lenses and constraints can be reused after the official release instead of tuning from scratch.'
      }
    ],
    examples: [
      {
        zh: '真实人像 prompt：锁定成年主体、镜头、光线方向和皮肤质感，替换职业、服装和背景。',
        en: 'Realistic portrait prompt: lock adult subject, lens, light direction and skin texture, then swap role, wardrobe and background.'
      },
      {
        zh: '复杂信息图与艺术画 prompt：把信息层级、配色和排版约束写清楚，验证模型细节处理能力。',
        en: 'Complex infographic and art prompt: define information hierarchy, palette and layout constraints to test detail handling.'
      },
      {
        zh: '商品图 prompt：固定产品主体和卖点，测试材质背景、反光和广告留白。',
        en: 'Product image prompt: lock product subject and selling point, then test material backgrounds, reflections and ad whitespace.'
      },
      {
        zh: '角色一致性 prompt：固定识别点、服装和世界观，验证跨角度一致性是否比 GPT Image 2 更稳。',
        en: 'Character consistency prompt: lock identity cues, wardrobe and world setting to check whether cross-angle consistency beats GPT Image 2.'
      }
    ],
    sections: [
      {
        title: {
          zh: 'mona-lisa-1 已知信息',
          en: 'What is known about mona-lisa-1'
        },
        body: {
          zh: 'mona-lisa-1 于 2026 年 8 月 9 日前后匿名出现在 LMArena 图像竞技场，网友通过 OpenAI SynthID 校验工具确认生成图带 SynthID 水印，因此判断它来自 OpenAI。截至 2026 年 8 月 13 日，OpenAI 官方公开的最新图像模型仍是 GPT Image 2，mona-lisa-1 尚未出现在正式产品和 API 文档中。',
          en: 'mona-lisa-1 appeared anonymously on the LMArena image arena around August 9, 2026. Users verified its outputs carry the OpenAI SynthID watermark, indicating it comes from OpenAI. As of August 13, 2026, OpenAI\'s latest publicly documented image model is still GPT Image 2; mona-lisa-1 has not appeared in official products or API docs.'
        },
        items: [
          {
            zh: '已确认：SynthID 水印验证显示模型输出来自 OpenAI。',
            en: 'Confirmed: SynthID watermark verification shows outputs come from OpenAI.'
          },
          {
            zh: '已确认：社区实测反馈真实感提升，过去的“塑料感”皮肤明显减少，细节更丰富。',
            en: 'Confirmed: community tests report improved realism, greatly reduced plastic-looking skin and richer detail.'
          },
          {
            zh: '传闻：知识截止时间与 GPT Image 2 相同（2025 年 12 月），推测是同地基上的新 checkpoint，可能是 GPT Image 2.5 的“中杯”版本。',
            en: 'Speculation: knowledge cutoff matches GPT Image 2 (December 2025), suggesting a new checkpoint on the same foundation, possibly a mid-size GPT Image 2.5.'
          },
          {
            zh: '未确认：官方发布时间、正式名称和 API 价格均未公布。',
            en: 'Unconfirmed: official release date, final name and API pricing are not announced.'
          }
        ]
      },
      {
        title: {
          zh: 'mona-lisa-1 与 GPT Image 2 的差异',
          en: 'mona-lisa-1 vs GPT Image 2'
        },
        body: {
          zh: '社区盲测反馈集中在真实感与细节：皮肤质感更自然、光影更真实，绘制艺术作品和复杂信息图的表现突出。',
          en: 'Blind-test feedback focuses on realism and detail: more natural skin texture, more realistic lighting, and strong performance on art and complex infographics.'
        },
        items: [
          {
            zh: '真实感：人像皮肤“塑料感”减少，接近手机拍摄质感。',
            en: 'Realism: portrait skin has less plastic feel and looks closer to phone photography.'
          },
          {
            zh: '细节：图像细节更丰富，复杂构图下的信息层级更稳。',
            en: 'Detail: richer image detail and more stable hierarchy in complex compositions.'
          },
          {
            zh: '一致性：部分测试者反馈动漫/角色跨角度一致性比 GPT Image 2 更强。',
            en: 'Consistency: some testers report stronger anime and character consistency across angles than GPT Image 2.'
          },
          {
            zh: '结论：这些差异来自匿名盲测反馈，正式版能力以 OpenAI 官方说明为准。',
            en: 'Note: these differences come from anonymous blind tests; final capabilities follow OpenAI\'s official documentation.'
          }
        ]
      },
      {
        title: {
          zh: 'mona-lisa-1 更适合的任务',
          en: 'Best mona-lisa-1 use cases'
        },
        body: {
          zh: '该页面重点承接“模型 prompt 模板”和“可复现案例”搜索，先把提示词结构准备好，等模型开放即可直接产出。',
          en: 'This page focuses on model-specific prompt templates and reproducible cases, so prompts are ready before the model opens.'
        },
        items: [
          {
            zh: '真实人像、艺术画、复杂信息图、商品视觉和角色一致性任务。',
            en: 'Realistic portraits, art, complex infographics, product visuals and character-consistency tasks.'
          },
          {
            zh: '需要和 GPT Image 2 横向对比的系列图，用同一 prompt 结构测试差异。',
            en: 'Image series that compare against GPT Image 2 using the same prompt structure.'
          },
          {
            zh: '适合把成功图保存成案例，官方发布后再做小步迭代。',
            en: 'Useful for saving winning images as cases and iterating in small steps after the official release.'
          }
        ]
      },
      {
        title: {
          zh: 'mona-lisa-1 prompt 结构',
          en: 'mona-lisa-1 prompt structure'
        },
        body: {
          zh: '稳定的 mona-lisa-1 prompt 应该先写输出目标，再拆主体、画面、光影、材质、风格和约束，和 GPT Image 2 保持同一套 slot 便于对比。',
          en: 'A stable mona-lisa-1 prompt defines the output goal first, then breaks down subject, frame, lighting, material, style and constraints, using the same slots as GPT Image 2 for comparison.'
        },
        items: [
          {
            zh: '输出目标：真实人像、艺术画、信息图、商品图、角色设定或广告 KV。',
            en: 'Output goal: realistic portrait, art, infographic, product image, character sheet or ad key visual.'
          },
          {
            zh: '画面骨架：比例、构图、景别、镜头、主体大小和留白。',
            en: 'Frame structure: aspect ratio, composition, shot size, lens, subject scale and whitespace.'
          },
          {
            zh: '质感约束：皮肤、材质、反光、阴影和后期处理要写清楚，减少塑料感。',
            en: 'Texture constraints: describe skin, material, reflections, shadows and post-processing to reduce the plastic look.'
          },
          {
            zh: '负面约束：不要可读文字、logo、水印、多余肢体、畸形手和过度磨皮。',
            en: 'Negative constraints: no readable text, logos, watermarks, extra limbs, distorted hands or over-smoothed skin.'
          }
        ]
      }
    ],
    faq: [
      {
        question: {
          zh: 'mona-lisa-1 是什么模型？',
          en: 'What is mona-lisa-1?'
        },
        answer: {
          zh: 'mona-lisa-1 是 2026 年 8 月匿名出现在 LMArena 图像竞技场的模型，生成图经 SynthID 水印验证确认来自 OpenAI，OpenAI 官方尚未发布公告。',
          en: 'mona-lisa-1 is a model found anonymously on the LMArena image arena in August 2026. Its outputs carry the SynthID watermark, confirming OpenAI origin, with no official announcement yet.'
        }
      },
      {
        question: {
          zh: 'mona-lisa-1 正式发布了吗？',
          en: 'Has mona-lisa-1 been officially released?'
        },
        answer: {
          zh: '截至 2026 年 8 月 13 日没有。OpenAI 官方最新公开模型仍是 GPT Image 2，mona-lisa-1 未出现在正式产品或 API 文档中。',
          en: 'As of August 13, 2026, no. OpenAI\'s latest publicly documented model is still GPT Image 2; mona-lisa-1 is not in official products or API docs.'
        }
      },
      {
        question: {
          zh: '在哪里能试用 mona-lisa-1？',
          en: 'Where can I try mona-lisa-1?'
        },
        answer: {
          zh: '目前只能在 LMArena 等匿名盲测平台参与投票试用，OpenAI 官方产品渠道尚未开放。',
          en: 'For now it can only be tried through anonymous blind-test platforms like LMArena; official OpenAI channels are not open yet.'
        }
      },
      {
        question: {
          zh: 'mona-lisa-1 是 GPT Image 2.5 吗？',
          en: 'Is mona-lisa-1 GPT Image 2.5?'
        },
        answer: {
          zh: '社区推测它可能是 GPT Image 2.5 的“中杯”版本或同地基上的新 checkpoint，目前只是传闻，未经 OpenAI 证实。',
          en: 'The community speculates it may be a mid-size GPT Image 2.5 or a new checkpoint on the same foundation. This is unconfirmed by OpenAI.'
        }
      },
      {
        question: {
          zh: '现在怎么写 mona-lisa-1 prompt？',
          en: 'How should I write mona-lisa-1 prompts now?'
        },
        answer: {
          zh: '用可迁移的 slot 结构写：目标、主体、场景、镜头、光影、材质、风格和负面约束分开维护，官方开放后直接复用。',
          en: 'Use a portable slot structure: goal, subject, scene, lens, lighting, material, style and negative constraints kept separate, then reuse once the model opens.'
        }
      },
      {
        question: {
          zh: '这里的 prompt 案例能用于其他模型吗？',
          en: 'Can these prompt cases be used in other models?'
        },
        answer: {
          zh: '可以。案例按模型标注，同一结构可跨 GPT Image 2、Nano Banana、Flux 等模型测试，实际效果以各模型输出为准。',
          en: 'Yes. Cases are tagged by model, and the same structure can be tested across GPT Image 2, Nano Banana, Flux and others; actual results depend on each model.'
        }
      }
    ]
  },
  {
    type: 'model',
    slug: 'luna-lisa-alpha',
    title: {
      zh: 'Luna Lisa Alpha 提示词与图片生成案例',
      en: 'Luna Lisa Alpha prompts and image examples'
    },
    description: {
      zh: '整理 Luna Lisa Alpha（luna-lisa-alpha）提示词、社区传闻与可复用图片案例。该模型尚未官宣，相关信息来自社区测试与二手报道，均未经验证。',
      en: 'Reusable Luna Lisa Alpha (luna-lisa-alpha) prompts, community reports and image examples. The model is not officially announced; all information comes from community tests and secondary reports and is unverified.'
    },
    badge: { zh: '模型专题', en: 'Model guide' },
    intent: {
      zh: '面向正在搜索 luna-lisa-alpha 提示词、Luna Lisa Alpha 图像模型、Luna Lisa prompts 和 OpenAI 新图像模型传闻的创作者。',
      en: 'For creators searching luna-lisa-alpha prompts, Luna Lisa Alpha image model, Luna Lisa prompts and OpenAI image model rumors.'
    },
    keywords: {
      zh: [
        'luna-lisa-alpha 提示词',
        'Luna Lisa Alpha 图像模型',
        'Luna Lisa prompts',
        'OpenAI 新图像模型传闻',
        'AI 图片提示词案例'
      ],
      en: [
        'luna-lisa-alpha',
        'Luna Lisa Alpha',
        'Luna Lisa prompts',
        'luna lisa alpha prompts',
        'Luna Lisa AI image model',
        'OpenAI image model rumor'
      ]
    },
    workflow: [
      {
        zh: '先区分事实与传闻：luna-lisa-alpha 目前只有社区测试和二手报道，没有 OpenAI 官方公告、model card、API ID 或公开可选入口。',
        en: 'Separate facts from rumors first: luna-lisa-alpha has only community tests and secondary reports, with no official announcement, model card, API ID or public selectable entry.'
      },
      {
        zh: '用可迁移的 slot 结构写 prompt：主体、场景、镜头、光影、材质、风格和负面约束分开维护，等官方信息确认后直接复用。',
        en: 'Write prompts with a portable slot structure: subject, scene, lens, lighting, material, style and negative constraints kept separate, so the same structure can be reused once official information is confirmed.'
      },
      {
        zh: '今天先用已公开模型测试同一套 prompt：与 GPT Image 2 对比真实感、文字渲染和细节表现，对比结论只作为参考。',
        en: 'Test the same prompt structure on public models today: compare realism, text rendering and detail against GPT Image 2, treating any comparison as unverified.'
      },
      {
        zh: '把稳定结果保存成案例并标注所用模型，官方发布后再迁移到新模型，而不是提前假设能力。',
        en: 'Save stable results as cases tagged with the model used, then migrate to the new model after an official release instead of assuming capabilities early.'
      }
    ],
    examples: [
      {
        zh: '真实人像 prompt：锁定成年主体、镜头、光线方向和皮肤质感，替换职业、服装和背景。',
        en: 'Realistic portrait prompt: lock adult subject, lens, light direction and skin texture, then swap role, wardrobe and background.'
      },
      {
        zh: '文字渲染测试 prompt：把需要可读的标题、排版层级和留白写清楚，验证模型对文字的把握。',
        en: 'Text rendering test prompt: define readable headings, layout hierarchy and whitespace to check how the model handles text.'
      },
      {
        zh: '商品图 prompt：固定产品主体和卖点，测试材质背景、反光和广告留白。',
        en: 'Product image prompt: lock product subject and selling point, then test material backgrounds, reflections and ad whitespace.'
      },
      {
        zh: '角色一致性 prompt：固定识别点、服装和世界观，在 GPT Image 2 上验证跨角度稳定性。',
        en: 'Character consistency prompt: lock identity cues, wardrobe and world setting, and verify cross-angle stability on GPT Image 2.'
      }
    ],
    sections: [
      {
        title: {
          zh: 'luna-lisa-alpha 的模型状态',
          en: 'What is known about luna-lisa-alpha'
        },
        body: {
          zh: 'luna-lisa-alpha 目前只有社区测试和二手报道，被推测可能是 OpenAI 即将推出的新图像生成模型。截至 2026 年 8 月，没有 OpenAI 官方公告、model card、API ID 或公开可选入口，相关信息均未经验证。',
          en: 'luna-lisa-alpha currently has only community tests and secondary reports, and is suspected to be an upcoming OpenAI image generation model. As of August 2026 there is no official OpenAI announcement, model card, API ID or public selectable entry; all related information is unverified.'
        },
        items: [
          {
            zh: '未确认：社区报道称它可能是 OpenAI 即将推出的图像生成模型。',
            en: 'Unconfirmed: community reports suggest it may be an upcoming OpenAI image generation model.'
          },
          {
            zh: '未确认：没有官方名称、发布时间、能力说明或价格信息。',
            en: 'Unconfirmed: no official name, release date, capability notes or pricing.'
          },
          {
            zh: '未确认：WebToMind 和任何公开产品渠道目前都无法直接选择该模型。',
            en: 'Unconfirmed: WebToMind and other public product channels cannot select this model directly today.'
          }
        ]
      },
      {
        title: {
          zh: '已报道的潜在线索（社区报告，未验证）',
          en: 'Reported signals (community reports, unverified)'
        },
        body: {
          zh: '社区测试与二手报道提到知识截止更新、文字渲染更强、真实感与提示词遵循提升等线索，但这些都来自非官方渠道，不能当作模型能力依据。',
          en: 'Community tests and secondary reports mention a newer knowledge cutoff, stronger text rendering, and gains in realism and prompt following, but these come from unofficial sources and should not be treated as model capabilities.'
        },
        items: [
          {
            zh: '社区报告：知识截止时间可能比 GPT Image 2 更新。',
            en: 'Community reports: knowledge cutoff may be newer than GPT Image 2.'
          },
          {
            zh: '社区报告：对可读文字的渲染能力可能更强。',
            en: 'Community reports: rendering of readable text may be stronger.'
          },
          {
            zh: '社区报告：真实感和提示词遵循可能有所提升。',
            en: 'Community reports: realism and prompt following may improve.'
          },
          {
            zh: '结论：以上均为传闻，最终以 OpenAI 官方说明为准。',
            en: 'Note: all of the above are rumors; follow OpenAI official announcements.'
          }
        ]
      },
      {
        title: {
          zh: '与 GPT Image 2 的比较（未验证）',
          en: 'Luna Lisa Alpha vs GPT Image 2 (unverified)'
        },
        body: {
          zh: '网上流传的对比大多来自社区测试，没有官方基准。真正发布前，任何“比 GPT Image 2 更强”的说法都不能作为选型依据。',
          en: 'Most comparisons online come from community tests without official benchmarks. Before any release, claims that it beats GPT Image 2 cannot be used for model selection.'
        },
        items: [
          {
            zh: '未验证：社区反馈集中在真实感、文字和细节，但没有可复现基准。',
            en: 'Unverified: community feedback focuses on realism, text and detail, but there are no reproducible benchmarks.'
          },
          {
            zh: '建议：用同一套 slot prompt 在 GPT Image 2 上跑对比，先积累自己的基线。',
            en: 'Suggestion: run the same slot prompts on GPT Image 2 to build your own baseline first.'
          }
        ]
      },
      {
        title: {
          zh: '今天可以做什么',
          en: 'What you can do today'
        },
        body: {
          zh: '在模型官宣前，最有价值的动作是准备好可迁移的通用 prompt 结构，并用现有公开模型继续测试，不依赖传闻中的能力。',
          en: 'Before the model is announced, the most valuable move is preparing portable generic prompt structures and continuing to test on existing public models, without relying on rumored capabilities.'
        },
        items: [
          {
            zh: '用 GPT Image 2 等已公开模型测试人像、商品、信息图和文字排版 prompt。',
            en: 'Test portrait, product, infographic and typography prompts on public models like GPT Image 2.'
          },
          {
            zh: '把稳定结果保存成带模型标注的案例，官方发布后小步迁移。',
            en: 'Save stable results as model-tagged cases and migrate in small steps after an official release.'
          },
          {
            zh: '关注 OpenAI 官方公告与文档，不把社区传闻当事实。',
            en: 'Follow OpenAI official announcements and docs, and do not treat community rumors as facts.'
          }
        ]
      }
    ],
    relatedLinks: [
      {
        path: '/gpt-image-2-prompts',
        title: {
          zh: 'GPT Image 2 Prompts 与案例',
          en: 'GPT Image 2 Prompts & Examples'
        },
        description: {
          zh: '浏览 GPT Image 2 提示词与可复用案例，当前可直接使用的公开模型。',
          en: 'Browse GPT Image 2 prompts and reusable examples, the public model available today.'
        }
      },
      {
        path: '/mona-lisa-1-prompts',
        title: {
          zh: 'mona-lisa-1 Prompt 案例与提示词',
          en: 'mona-lisa-1 Prompts & Examples'
        },
        description: {
          zh: '另一个尚未官宣的 OpenAI 图像模型专题，包含社区信息与可迁移 prompt 结构。',
          en: 'Another not-yet-announced OpenAI image model topic with community info and portable prompt structure.'
        }
      },
      {
        path: '/ai-image-prompt-generator',
        title: {
          zh: 'AI Image Prompt Generator 与案例',
          en: 'AI Image Prompt Generator & Examples'
        },
        description: {
          zh: '从参考图生成可复用 prompt，并快速在公开模型上测试。',
          en: 'Generate reusable prompts from reference images and test them on public models.'
        }
      }
    ],
    faq: [
      {
        question: {
          zh: 'Luna Lisa Alpha 是什么模型？',
          en: 'What is Luna Lisa Alpha?'
        },
        answer: {
          zh: 'luna-lisa-alpha 目前只有社区测试和二手报道，被推测可能是 OpenAI 即将推出的图像生成模型，尚未经官方确认。',
          en: 'luna-lisa-alpha has only community tests and secondary reports. It is suspected to be an upcoming OpenAI image model, but nothing is officially confirmed.'
        }
      },
      {
        question: {
          zh: 'Luna Lisa Alpha 正式发布了吗？',
          en: 'Has Luna Lisa Alpha been officially released?'
        },
        answer: {
          zh: '截至 2026 年 8 月没有。OpenAI 尚未发布公告、model card、API ID 或公开可选入口。',
          en: 'As of August 2026, no. OpenAI has not published an announcement, model card, API ID or public selectable entry.'
        }
      },
      {
        question: {
          zh: 'WebToMind 能直接调用 luna-lisa-alpha 吗？',
          en: 'Can WebToMind generate with luna-lisa-alpha?'
        },
        answer: {
          zh: '不能。luna-lisa-alpha 尚未官宣，也不是 WebToMind 可选模型；请使用 GPT Image 2 等已公开模型生成。',
          en: 'No. luna-lisa-alpha is not announced and is not a selectable model in WebToMind; use public models such as GPT Image 2.'
        }
      },
      {
        question: {
          zh: 'Luna Lisa Alpha 比 GPT Image 2 更强吗？',
          en: 'Is Luna Lisa Alpha better than GPT Image 2?'
        },
        answer: {
          zh: '网上流传的对比来自社区测试，未经验证也没有官方基准，正式发布前不能作为选型依据。',
          en: 'Comparisons online come from community tests, are unverified and lack official benchmarks, so they cannot guide model selection before a release.'
        }
      },
      {
        question: {
          zh: '现在怎么写 luna-lisa-alpha prompt？',
          en: 'How should I write luna-lisa-alpha prompts now?'
        },
        answer: {
          zh: '用可迁移的 slot 结构写：目标、主体、场景、镜头、光影、材质、风格和负面约束分开维护，先在 GPT Image 2 等公开模型上验证。',
          en: 'Use a portable slot structure: goal, subject, scene, lens, lighting, material, style and negative constraints kept separate, and validate on public models like GPT Image 2 first.'
        }
      },
      {
        question: {
          zh: '这里的 prompt 案例能用于其他模型吗？',
          en: 'Can these prompt cases be used in other models?'
        },
        answer: {
          zh: '可以。案例按模型标注，同一结构可跨 GPT Image 2、Nano Banana、Flux 等模型测试，实际效果以各模型输出为准。',
          en: 'Yes. Cases are tagged by model, and the same structure can be tested across GPT Image 2, Nano Banana, Flux and others; actual results depend on each model.'
        }
      }
    ]
  },
  {
    type: 'model',
    slug: 'gpt-image-2-5',
    title: {
      zh: 'GPT Image 2.5 提示词与发布状态',
      en: 'GPT Image 2.5 prompts and release status'
    },
    description: {
      zh: '整理 GPT Image 2.5 提示词结构、发布状态证据与可复用案例。该名称尚未被 OpenAI 官方确认，页面区分事实、传闻与今天的可用替代方案。',
      en: 'GPT Image 2.5 prompt structures, release-status evidence and reusable cases. The name is not officially confirmed by OpenAI; this page separates facts, rumors and what works today.'
    },
    badge: { zh: '模型专题', en: 'Model guide' },
    intent: {
      zh: '面向正在搜索 GPT Image 2.5 prompt、GPT-Image-2.5 API、发布日期和 OpenAI 下一代图像模型的创作者与开发者。',
      en: 'For creators and developers searching GPT Image 2.5 prompts, the GPT-Image-2.5 API, release dates and OpenAI\'s next image model.'
    },
    keywords: {
      zh: [
        'GPT Image 2.5 prompt',
        'GPT Image 2.5 发布时间',
        'GPT-Image-2.5 API',
        'OpenAI 新图像模型',
        'GPT Image 2.5 提示词'
      ],
      en: [
        'GPT Image 2.5 prompts',
        'GPT Image 2.5 release date',
        'GPT-Image-2.5 API',
        'OpenAI next image model',
        'GPT Image 2.5 prompt examples'
      ]
    },
    workflow: [
      {
        zh: '先核对官方来源：截至 2026 年 9 月初，OpenAI 官网、开发者文档和 API 模型列表都没有名为 GPT Image 2.5 的产品；官网当前公开模型仍是 GPT Image 2。',
        en: 'Check official sources first: as of early September 2026, OpenAI\'s site, developer docs and API model lists include no product named GPT Image 2.5; the current public model remains GPT Image 2.'
      },
      {
        zh: '把传闻分级记录：LMArena 上的匿名模型 mona-lisa-1 经 SynthID 验证来自 OpenAI，社区推测它可能是 GPT Image 2.5 的前身或“中杯”版本，这只是假设，不是官方命名。',
        en: 'Grade the rumors: mona-lisa-1, an anonymous LMArena model verified as OpenAI via SynthID, is speculated to be a precursor or mid-size GPT Image 2.5, but that is a hypothesis, not an official mapping.'
      },
      {
        zh: '用可迁移的 slot 结构写 prompt：目标、主体、场景、镜头、光影、材质、风格和负面约束分开维护，2.5 开放后直接复用。',
        en: 'Write prompts with a portable slot structure: goal, subject, scene, lens, lighting, material, style and negative constraints kept separate, then reuse once 2.5 opens.'
      },
      {
        zh: '今天就在 GPT Image 2 上验证同一套 prompt，并把稳定输出保存成带模型标注的案例，形成自己的基线。',
        en: 'Validate the same prompts on GPT Image 2 today and save stable outputs as model-tagged cases to build your own baseline.'
      }
    ],
    examples: [
      {
        zh: '真实人像 prompt：锁定成年主体、镜头、光线方向、皮肤质感和背景层次，替换职业与服装即可批量测试。',
        en: 'Realistic portrait prompt: lock adult subject, lens, light direction, skin texture and background depth, then swap role and wardrobe for batch testing.'
      },
      {
        zh: '可读文字 prompt：把标题、排版层级和留白写清楚，测试信息图和中英文小字渲染。',
        en: 'Readable-text prompt: define headings, layout hierarchy and whitespace, then test infographics and small Latin/CJK type.'
      },
      {
        zh: '商品图 prompt：固定产品、卖点、材质背景和反光，输出可直接用于详情页的构图。',
        en: 'Product prompt: lock product, selling point, material background and reflections for listing-ready compositions.'
      },
      {
        zh: '角色一致性 prompt：固定识别点、服装和世界观，跨角度验证后再迁移到新模型。',
        en: 'Character-consistency prompt: lock identity cues, wardrobe and world setting, verify across angles, then migrate to the new model.'
      }
    ],
    sections: [
      {
        title: {
          zh: 'GPT Image 2.5 目前知道什么',
          en: 'What is known about GPT Image 2.5'
        },
        body: {
          zh: '“GPT Image 2.5” 是社区对 OpenAI 下一代图像模型的候选称呼。OpenAI 尚未发布或确认这个名字：官网、开发者文档和 API 模型列表中不存在 gpt-image-2.5，公开的最新图像模型仍是 GPT Image 2。',
          en: '"GPT Image 2.5" is the community\'s candidate name for OpenAI\'s next image model. OpenAI has not released or confirmed the name: gpt-image-2.5 does not exist on the site, developer docs or API model list, and the latest public image model remains GPT Image 2.'
        },
        items: [
          {
            zh: '事实：OpenAI 公开的当前图像模型是 GPT Image 2（ChatGPT Images 2.0，2026 年 4 月起）。',
            en: 'Fact: OpenAI\'s current public image model is GPT Image 2 (ChatGPT Images 2.0, since April 2026).'
          },
          {
            zh: '事实：API 文档模型列表中没有 gpt-image-2.5，也没有任何官方公告使用该名称。',
            en: 'Fact: the API docs model list has no gpt-image-2.5 and no official announcement uses the name.'
          },
          {
            zh: '传闻：LMArena 匿名模型 mona-lisa-1 经 SynthID 水印验证来自 OpenAI，被推测与下一代图像模型相关。',
            en: 'Rumor: mona-lisa-1, an anonymous LMArena model, was verified as OpenAI via SynthID watermark and is speculated to relate to the next image model.'
          },
          {
            zh: '假设：社区把 mona-lisa-1 称为可能的 GPT Image 2.5“中杯”版本，这是猜测而非官方映射。',
            en: 'Hypothesis: the community calls mona-lisa-1 a possible mid-size GPT Image 2.5, which is speculation rather than an official mapping.'
          }
        ]
      },
      {
        title: {
          zh: 'GPT Image 2.5、GPT Image 2 与 mona-lisa-1 的关系',
          en: 'GPT Image 2.5 vs GPT Image 2 vs mona-lisa-1'
        },
        body: {
          zh: '三者目前只有一个是确定存在的：GPT Image 2 是官方公开模型；mona-lisa-1 是真实出现但未官宣的竞技场模型；“GPT Image 2.5” 目前只是候选名称，不要把三者混为同一个东西。',
          en: 'Only one of the three is confirmed to exist today: GPT Image 2 is the official public model; mona-lisa-1 is real but unannounced (arena model); "GPT Image 2.5" is currently just a candidate name. Do not conflate the three.'
        },
        items: [
          {
            zh: 'GPT Image 2：可直接调用，本页所有案例今天就能跑。',
            en: 'GPT Image 2: callable today; every case on this page runs on it now.'
          },
          {
            zh: 'mona-lisa-1：只出现在 LMArena 盲测，不能在产品或 API 中选择。',
            en: 'mona-lisa-1: seen only in LMArena blind tests; not selectable in products or the API.'
          },
          {
            zh: 'GPT Image 2.5：未确认的候选名称，等官方文档出现后再按事实更新本页。',
            en: 'GPT Image 2.5: unconfirmed candidate name; this page updates with facts once official docs appear.'
          }
        ]
      },
      {
        title: {
          zh: '发布时间与 API 传闻怎么判断',
          en: 'How to judge release-date and API rumors'
        },
        body: {
          zh: '判断标准很简单：以 OpenAI 官网公告、开发者文档模型页和 API 模型列表为准。任何第三方“已上线”“可调用”的说法，都应要求给出官方文档链接，否则视为传闻。',
          en: 'The test is simple: trust OpenAI\'s site announcements, developer docs model pages and the API model list. Any third-party "live and callable" claim needs an official docs link, otherwise treat it as rumor.'
        },
        items: [
          {
            zh: '已核实（2026-09-04）：无官方 2.5 文档、无 API ID、无公告。',
            en: 'Verified (2026-09-04): no official 2.5 docs, no API ID, no announcement.'
          },
          {
            zh: '第三方工具站已出现“GPT Image 2.5 生成器”，但实际后端都是现有模型，属于蹭名称的营销页。',
            en: 'Third-party "GPT Image 2.5 generator" pages already exist, but their backends are existing models — name-borrowing marketing.'
          },
          {
            zh: 'OpenAI 官方确认发布后，本页会第一时间把状态、FAQ 和迁移建议改为事实描述。',
            en: 'Once OpenAI officially announces it, this page will switch status, FAQ and migration advice to confirmed facts.'
          }
        ]
      }
    ],
    relatedLinks: [
      {
        path: '/gpt-image-2-prompts',
        title: {
          zh: 'GPT Image 2 Prompts 与案例',
          en: 'GPT Image 2 Prompts & Examples'
        },
        description: {
          zh: '当前官方公开、可直接调用的模型，本页全部案例今天可用。',
          en: 'The officially public, callable model today; every case here runs on it now.'
        }
      },
      {
        path: '/mona-lisa-1-prompts',
        title: {
          zh: 'mona-lisa-1 Prompt 案例与提示词',
          en: 'mona-lisa-1 Prompts & Examples'
        },
        description: {
          zh: 'LMArena 匿名 OpenAI 图像模型专题，被社区推测与 2.5 相关。',
          en: 'The anonymous OpenAI LMArena image model, speculated by the community to relate to 2.5.'
        }
      },
      {
        path: '/ai-image-prompt-generator',
        title: {
          zh: 'AI Image Prompt Generator 与案例',
          en: 'AI Image Prompt Generator & Examples'
        },
        description: {
          zh: '从参考图生成可复用 prompt，并在公开模型上快速测试。',
          en: 'Generate reusable prompts from reference images and test them on public models quickly.'
        }
      }
    ],
    faq: [
      {
        question: {
          zh: 'GPT Image 2.5 发布了吗？',
          en: 'Has GPT Image 2.5 been released?'
        },
        answer: {
          zh: '没有。截至 2026 年 9 月初，OpenAI 未发布公告，API 文档和模型列表中也没有 gpt-image-2.5，当前公开模型仍是 GPT Image 2。',
          en: 'No. As of early September 2026, OpenAI has made no announcement and the API docs and model list contain no gpt-image-2.5; the current public model remains GPT Image 2.'
        }
      },
      {
        question: {
          zh: 'GPT Image 2.5 发布日期是什么时候？',
          en: 'What is the GPT Image 2.5 release date?'
        },
        answer: {
          zh: '官方没有给出任何日期。网上的时间表都是推测，判断依据应以 OpenAI 官网公告和开发者文档为准。',
          en: 'OpenAI has given no date. Online timelines are speculation; trust only OpenAI\'s site announcements and developer docs.'
        }
      },
      {
        question: {
          zh: 'mona-lisa-1 是 GPT Image 2.5 吗？',
          en: 'Is mona-lisa-1 GPT Image 2.5?'
        },
        answer: {
          zh: '这是社区假设，不是官方映射。可以确认的是 mona-lisa-1 经 SynthID 验证来自 OpenAI 且尚未官宣；它是否叫 GPT Image 2.5 没有证据。',
          en: 'That is a community hypothesis, not an official mapping. What is confirmed: mona-lisa-1 is OpenAI (SynthID-verified) and unannounced; there is no evidence it is named GPT Image 2.5.'
        }
      },
      {
        question: {
          zh: '现在能用 GPT Image 2.5 生成图片吗？',
          en: 'Can I generate images with GPT Image 2.5 now?'
        },
        answer: {
          zh: '不能。第三方网站上的“GPT Image 2.5 生成器”实际调用的是现有模型；OpenAI 渠道不存在这个模型 ID。',
          en: 'No. Third-party "GPT Image 2.5 generator" pages actually call existing models; the model ID does not exist in OpenAI channels.'
        }
      },
      {
        question: {
          zh: '现在怎么准备 GPT Image 2.5 prompt？',
          en: 'How should I prepare GPT Image 2.5 prompts now?'
        },
        answer: {
          zh: '用可迁移的 slot 结构写，并先在 GPT Image 2 上验证。2.5 若开放，同一结构可直接复用并横向对比。',
          en: 'Use a portable slot structure and validate on GPT Image 2 first. If 2.5 opens, the same structure migrates directly for comparison.'
        }
      },
      {
        question: {
          zh: 'WebToMind 能用 GPT Image 2.5 吗？',
          en: 'Does WebToMind support GPT Image 2.5?'
        },
        answer: {
          zh: '目前不能，因为该模型不存在于 OpenAI 官方渠道。WebToMind 当前可直接使用 GPT Image 2；官方发布 2.5 后会评估接入。',
          en: 'Not currently, because the model does not exist in official OpenAI channels. WebToMind runs GPT Image 2 today and will evaluate 2.5 after an official release.'
        }
      }
    ]
  },
  {
    type: 'model',
    slug: 'gpt-6-astra',
    title: {
      zh: 'GPT-6 Astra（Astra）提示词与模型动态',
      en: 'GPT-6 Astra prompts and model updates'
    },
    description: {
      zh: '整理 GPT-6 Astra（Astra）提示词结构、官方确认信息与社区报道。模型处于内部测试、尚未发布，页面明确区分官方信息与未验证传闻。',
      en: 'GPT-6 Astra (Astra) prompt structures, officially acknowledged updates and community reports. The model is in internal testing and unreleased; this page separates official info from unverified rumors.'
    },
    badge: { zh: '模型专题', en: 'Model guide' },
    intent: {
      zh: '面向正在搜索 Astra prompt、GPT-6-Astra、OpenAI Astra 模型和 Astra 能力传闻的开发者与创作者。',
      en: 'For developers and creators searching Astra prompts, GPT-6-Astra, the OpenAI Astra model and Astra capability rumors.'
    },
    keywords: {
      zh: [
        'Astra prompt',
        'GPT-6-Astra',
        'OpenAI Astra',
        'Astra 提示词',
        'A6TRA'
      ],
      en: [
        'Astra prompts',
        'GPT-6-Astra',
        'OpenAI Astra',
        'GPT 6 Astra prompt examples',
        'A6TRA'
      ]
    },
    workflow: [
      {
        zh: '先区分官方与社区信息：OpenAI 已公开确认 Astra 是即将推出的模型并处于内部测试，但未公布发布日期；mozaik-alpha-fdm 等细节均来自社区报道。',
        en: 'Separate official from community info: OpenAI has publicly acknowledged Astra as an upcoming model in internal testing, but has not announced a release date; details like mozaik-alpha-fdm come from community reports.'
      },
      {
        zh: '按输出目标拆 prompt：Astra 的已泄露示例集中在编程与视觉软件创建，把目标、技术栈、交互和验收标准写成明确约束。',
        en: 'Structure prompts by output goal: leaked Astra examples focus on coding and visual software creation, so define goal, stack, interactions and acceptance criteria as explicit constraints.'
      },
      {
        zh: '把图像类需求先落到 GPT Image 2 等公开模型，用同一套 slot 结构积累可迁移的案例。',
        en: 'Run image requests on public models like GPT Image 2 today, building portable cases with the same slot structure.'
      },
      {
        zh: '把稳定结果保存成带模型标注的案例，Astra 正式开放后再小步迁移并重新验证。',
        en: 'Save stable results as model-tagged cases, then migrate to Astra in small steps and re-verify once it opens.'
      }
    ],
    examples: [
      {
        zh: '视觉软件 prompt：一句话目标 + 功能清单 + 交互细节 + 技术约束，验证单次生成的完整度。',
        en: 'Visual software prompt: one-line goal plus feature list, interaction details and technical constraints, checking single-shot completeness.'
      },
      {
        zh: '3D / 体素场景 prompt：固定主题、体素密度、配色和渲染角度，用于对比模型的空间一致性。',
        en: '3D / voxel scene prompt: lock theme, voxel density, palette and render angle to compare spatial consistency.'
      },
      {
        zh: '真实人像与商品图 prompt：沿用 GPT Image 2 的 slot 结构，Astra 开放后可直接迁移对比。',
        en: 'Portrait and product prompts: reuse the GPT Image 2 slot structure so they migrate directly when Astra opens.'
      },
      {
        zh: '长任务 agent prompt：把目标、步骤、工具权限和停止条件写清楚，适合 Astra 主打的 agentic coding 场景。',
        en: 'Long-task agent prompt: define goal, steps, tool permissions and stop conditions for the agentic coding scenarios Astra targets.'
      }
    ],
    sections: [
      {
        title: {
          zh: 'GPT-6 Astra 的官方与社区信息',
          en: 'Official vs community info on GPT-6 Astra'
        },
        body: {
          zh: 'OpenAI 已官方承认 Astra 是即将推出的模型，称内部评估显示 agentic coding 和网络安全能力有重大进展，并因安全评估暂停过部分工作负载；政府机构和 AI 安全组织将参与测试。截至 2026 年 8 月底，官方未公布发布日期、正式命名和 API 信息。',
          en: 'OpenAI has officially acknowledged Astra as an upcoming model, saying internal evaluations show major advances in agentic coding and cyber security, with some workloads paused for safety reviews; government agencies and AI safety organizations will participate in testing. As of late August 2026, no release date, final name or API details are announced.'
        },
        items: [
          {
            zh: '官方确认：Astra 是 OpenAI 即将推出的模型，处于内部测试阶段。',
            en: 'Official: Astra is an upcoming OpenAI model currently in internal testing.'
          },
          {
            zh: '官方确认：内部评估显示 agentic coding 与网络安全能力显著提升，相关工作曾因安全评估暂停。',
            en: 'Official: internal evaluations show major agentic coding and cyber security gains, with some workloads paused for safety review.'
          },
          {
            zh: '未确认：发布日期、正式名称与价格均未公布；GPT-6 Astra 是社区对模型代号的称呼。',
            en: 'Unconfirmed: release date, final name and pricing are not announced; GPT-6 Astra is the community name for the codename.'
          },
          {
            zh: '社区报道：泄露示例集中在编程与视觉软件创建，checkpoint 代号 mozaik-alpha-fdm 来自二手渠道，未经官方证实。',
            en: 'Community reports: leaked examples focus on coding and visual software creation; the mozaik-alpha-fdm checkpoint name comes from unofficial channels.'
          }
        ]
      },
      {
        title: {
          zh: 'Astra 与 GPT Image 2 / mona-lisa-1 的关系',
          en: 'Astra vs GPT Image 2 / mona-lisa-1'
        },
        body: {
          zh: 'Astra 的已泄露示例以编程和视觉软件创建为主，与聚焦图像生成的 GPT Image 2 定位不同；mona-lisa-1 是另一个出现在 LMArena 的未发布图像模型。三者的公开信息都有限，选型仍应以官方文档为准。',
          en: 'Leaked Astra examples center on coding and visual software creation, unlike image-focused GPT Image 2; mona-lisa-1 is a separate unreleased image model found on LMArena. Public info on all three is limited, so follow official docs for decisions.'
        },
        items: [
          {
            zh: 'GPT Image 2：当前可直接使用的公开图像模型。',
            en: 'GPT Image 2: the public image model available today.'
          },
          {
            zh: 'mona-lisa-1：2026 年 8 月出现在 LMArena 的未发布图像模型，经 SynthID 验证来自 OpenAI。',
            en: 'mona-lisa-1: an unreleased image model found on LMArena in August 2026, verified as OpenAI via SynthID.'
          },
          {
            zh: 'Astra：官方确认在内部测试、尚未发布的模型，社区示例以编程与视觉软件为主。',
            en: 'Astra: officially acknowledged as in internal testing and unreleased, with community examples focused on coding and visual software.'
          }
        ]
      },
      {
        title: {
          zh: '今天可以做什么',
          en: 'What you can do today'
        },
        body: {
          zh: 'Astra 未开放前，先用公开模型把 prompt 结构和案例跑通；等官方发布后再用同一结构迁移，避免基于传闻做能力假设。',
          en: 'Before Astra opens, prove your prompt structures and cases on public models; migrate with the same structure after the official release instead of assuming rumored capabilities.'
        },
        items: [
          {
            zh: '在 GPT Image 2 上测试图像类需求，在现有模型上验证长任务 agent 结构。',
            en: 'Test image requests on GPT Image 2 and validate long-task agent structures on current models.'
          },
          {
            zh: '把稳定输出保存成案例并标注模型与日期，便于发布后横向对比。',
            en: 'Save stable outputs as cases tagged with model and date for post-release comparison.'
          },
          {
            zh: '只依据 OpenAI 官方公告更新能力认知，不把泄露示例当基准。',
            en: 'Update capability understanding only from OpenAI official announcements; do not treat leaked examples as benchmarks.'
          }
        ]
      }
    ],
    relatedLinks: [
      {
        path: '/gpt-image-2-prompts',
        title: {
          zh: 'GPT Image 2 Prompts 与案例',
          en: 'GPT Image 2 Prompts & Examples'
        },
        description: {
          zh: '当前可直接使用的公开图像模型，用同一套 slot 结构先跑通案例。',
          en: 'The public image model available today; prove the same slot structures first.'
        }
      },
      {
        path: '/mona-lisa-1-prompts',
        title: {
          zh: 'mona-lisa-1 Prompt 案例与提示词',
          en: 'mona-lisa-1 Prompts & Examples'
        },
        description: {
          zh: '另一个未官宣的 OpenAI 图像模型专题，含 LMArena 社区信息与 prompt 结构。',
          en: 'Another unannounced OpenAI image model topic with LMArena community info and prompt structures.'
        }
      },
      {
        path: '/ai-image-prompt-generator',
        title: {
          zh: 'AI Image Prompt Generator 与案例',
          en: 'AI Image Prompt Generator & Examples'
        },
        description: {
          zh: '从参考图生成可复用 prompt，并在公开模型上快速测试。',
          en: 'Generate reusable prompts from reference images and test them on public models quickly.'
        }
      }
    ],
    faq: [
      {
        question: {
          zh: 'GPT-6 Astra 是什么？',
          en: 'What is GPT-6 Astra?'
        },
        answer: {
          zh: 'Astra 是 OpenAI 已公开承认、正在内部测试的即将推出模型；“GPT-6 Astra” 是社区对它的称呼，官方尚未公布正式名称和发布日期。',
          en: 'Astra is an upcoming model OpenAI has publicly acknowledged and is testing internally; "GPT-6 Astra" is the community name, with no official final name or release date yet.'
        }
      },
      {
        question: {
          zh: 'A6TRA 是什么？',
          en: 'What is A6TRA?'
        },
        answer: {
          zh: 'A6TRA 是 GPT-6-ASTRA 在社交平台常见的变体写法（A6TRA ≈ ASTRA 的字形转写），指同一个未发布模型，不是独立的新模型。',
          en: 'A6TRA is a common social-media variant spelling of GPT-6-ASTRA (A6TRA approximates the ASTRA letterforms); it refers to the same unreleased model, not a separate one.'
        }
      },
      {
        question: {
          zh: 'Astra 正式发布了吗？',
          en: 'Has Astra been officially released?'
        },
        answer: {
          zh: '截至 2026 年 8 月底没有。OpenAI 只确认它在内部测试并接受安全评估，未公布发布日期，公开产品与 API 均无法选择 Astra。',
          en: 'As of late August 2026, no. OpenAI only confirms internal testing and safety evaluation; there is no release date and Astra is not selectable in public products or APIs.'
        }
      },
      {
        question: {
          zh: 'Astra 是图像模型吗？',
          en: 'Is Astra an image model?'
        },
        answer: {
          zh: '不全是。已泄露示例集中在编程与视觉软件创建（如一次性生成小游戏和 3D 场景），图像生成只是其中一部分，不要按纯图像模型预期它的能力。',
          en: 'Not exactly. Leaked examples center on coding and visual software creation (single-shot games and 3D scenes); image generation is only part of it, so do not treat it as a pure image model.'
        }
      },
      {
        question: {
          zh: 'WebToMind 能直接调用 Astra 吗？',
          en: 'Can WebToMind generate with Astra?'
        },
        answer: {
          zh: '不能。Astra 尚未发布，也不是 WebToMind 可选模型；请先用 GPT Image 2 等公开模型完成图像生成。',
          en: 'No. Astra is unreleased and not a selectable model in WebToMind; use public models like GPT Image 2 for image generation today.'
        }
      },
      {
        question: {
          zh: '现在怎么准备 Astra prompt？',
          en: 'How should I prepare Astra prompts now?'
        },
        answer: {
          zh: '用可迁移的 slot 结构写：输出目标、主体/技术栈、交互、镜头或界面、约束和验收标准分开维护，先在公开模型上验证，开放后直接复用。',
          en: 'Use a portable slot structure: output goal, subject/stack, interactions, lens or UI, constraints and acceptance criteria kept separate; validate on public models and reuse when it opens.'
        }
      }
    ]
  },
  {
    type: 'model',
    slug: 'seedance-2-0',
    title: {
      zh: 'Seedance 2.0 视频 Prompt 案例',
      en: 'Seedance 2.0 video prompt examples'
    },
    description: {
      zh: '整理 Seedance 2.0 视频生成提示词、分镜结构和可复用案例，适合短视频、商品带货、剧情镜头和动作转场。',
      en: 'Browse Seedance 2.0 video prompts, shot structures and reusable cases for short videos, product demos, narrative scenes and motion transitions.'
    },
    badge: { zh: '视频模型专题', en: 'Video model guide' },
    intent: {
      zh: '面向正在搜索 Seedance 2.0 prompt、AI 视频提示词和可复用短视频分镜案例的创作者。',
      en: 'For creators searching Seedance 2.0 prompts, AI video prompts and reusable short-video storyboard cases.'
    },
    keywords: {
      zh: ['Seedance 2.0 prompt', 'AI 视频提示词', '视频生成 prompt'],
      en: [
        'Seedance 2.0 prompts',
        'AI video prompts',
        'video generation prompt examples'
      ]
    },
    workflow: [
      {
        zh: '先明确视频目标：带货、剧情、动作展示、舞蹈或产品演示，不把所有动作塞进一句话。',
        en: 'Start with the video goal: commerce, narrative, action showcase, dance or product demo instead of packing every motion into one sentence.'
      },
      {
        zh: '把提示词拆成主体、动作、镜头、时间节奏、场景和参考素材，让模型更容易保持连续性。',
        en: 'Split the prompt into subject, motion, camera, timing, scene and reference inputs so the model can maintain continuity.'
      },
      {
        zh: '保存成功案例的封面、模型、提示词和原作者来源，后续复用结构再替换主体。',
        en: 'Save cover, model, prompt and original source for successful cases, then reuse the structure while replacing the subject.'
      }
    ],
    examples: [
      {
        zh: '直播带货视频：固定人物、商品、口播动作和镜头推近节奏。',
        en: 'Livestream commerce video: lock presenter, product, spoken-action beats and camera push timing.'
      },
      {
        zh: '剧情短片：按镜头拆动作、情绪和环境变化，避免人物漂移。',
        en: 'Narrative short: split action, emotion and environment changes by shot to reduce identity drift.'
      }
    ],
    sections: [
      {
        title: {
          zh: 'Seedance 2.0 Prompt 结构',
          en: 'Seedance 2.0 prompt structure'
        },
        body: {
          zh: '视频 prompt 的关键不是更多形容词，而是更清楚的时间、动作和镜头约束。',
          en: 'A video prompt works through clearer timing, motion and camera constraints, not more adjectives.'
        },
        items: [
          {
            zh: '主体：人物、商品或场景必须明确，并说明需要保持一致的识别点。',
            en: 'Subject: define the person, product or scene and the identity cues that must remain stable.'
          },
          {
            zh: '动作：写连续动作链，避免同时要求多个互相冲突的动作。',
            en: 'Motion: write a continuous action chain and avoid conflicting simultaneous actions.'
          },
          {
            zh: '镜头：标注推、拉、摇、移、跟拍、慢动作或定格，让视频节奏可控。',
            en: 'Camera: specify push, pull, pan, dolly, tracking, slow motion or hold to control pacing.'
          }
        ]
      }
    ],
    faq: [
      {
        question: {
          zh: 'Seedance 2.0 案例和图片 prompt 案例有什么不同？',
          en: 'How are Seedance 2.0 cases different from image prompt cases?'
        },
        answer: {
          zh: 'Seedance 2.0 案例更重视动作、镜头和时间节奏。WebToMind 会把封面、模型和提示词保存下来，方便按视频结构复用。',
          en: 'Seedance 2.0 cases focus more on motion, camera and timing. WebToMind saves the cover, model and prompt so the video structure can be reused.'
        }
      },
      {
        question: {
          zh: '可以把 Seedance 2.0 prompt 复用到其他视频模型吗？',
          en: 'Can Seedance 2.0 prompts be reused in other video models?'
        },
        answer: {
          zh: '可以复用主体、动作和镜头结构，但不建议照搬全部语法。不同视频模型对素材引用、时长和镜头词的支持不同。',
          en: 'The subject, motion and camera structure can transfer, but the exact syntax should be adapted because video models differ in reference, duration and camera support.'
        }
      }
    ]
  },
  {
    type: 'category',
    slug: 'ai-portrait',
    title: {
      zh: 'AI 写真提示词案例库',
      en: 'AI portrait prompt examples'
    },
    description: {
      zh: '精选 AI 写真、人像摄影和角色写真 prompt 案例，覆盖姿态、服装、光影、镜头和真实皮肤质感。',
      en: 'Curated AI portrait and character-photo prompts covering pose, wardrobe, lighting, lens and realistic skin texture.'
    },
    badge: { zh: '场景专题', en: 'Use case' },
    intent: {
      zh: '承接 AI portrait prompt、AI 写真提示词和真人摄影风格 prompt 查询。',
      en: 'Targets AI portrait prompt, realistic photo prompt and character portrait prompt searches.'
    },
    relatedLinks: [
      {
        path: '/blog/nsfw-prompts-guide',
        title: {
          zh: 'NSFW Prompts 是什么意思？AI 生图平台能做什么、不能做什么',
          en: 'What Are NSFW Prompts? What AI Image Platforms Can and Cannot Do'
        },
        description: {
          zh: '了解 NSFW 提示词的真实含义、平台内容边界，以及如何用非露骨审美向 prompt 获得稳定结果。',
          en: 'Learn what NSFW prompts really mean, platform content boundaries, and how to get stable results with non-explicit, tasteful prompts.'
        }
      }
    ],
    keywords: {
      zh: [
        'AI portrait prompts',
        'portrait prompt examples',
        'AI 写真提示词',
        'AI 人像 prompt',
        '真实摄影 prompt',
        'boudoir prompts',
        '私房写真提示词',
        '魅力写真提示词',
        '泳装写真提示词',
        '杂志风人像提示词',
        '氛围感人像提示词'
      ],
      en: [
        'AI portrait prompts',
        'portrait prompt examples',
        'free AI portrait prompts',
        'GPT Image 2 portrait prompts',
        'realistic portrait prompts',
        'AI photo prompt examples',
        'boudoir prompts',
        'glamour prompts',
        'swimwear photoshoot prompts',
        'editorial portrait prompts',
        'sensual portrait prompts'
      ]
    },
    workflow: [
      {
        zh: '先固定成年人物、姿态、服装完整性和安全边界。',
        en: 'Start by locking adult subject, pose, wardrobe completeness and safety boundaries.'
      },
      {
        zh: '再补镜头、光影、皮肤质感、背景和画面用途。',
        en: 'Then add lens, lighting, skin texture, background and output use.'
      },
      {
        zh: '保存高质量案例，后续只换角色或场景做系列图。',
        en: 'Save high-quality cases and later swap only character or scene for a series.'
      }
    ],
    examples: [
      {
        zh: '真实手机摄影质感 9:16 人像，柔光、自然姿态、商业完成度。',
        en: '9:16 realistic mobile-photo portrait with soft light, natural pose and commercial polish.'
      },
      {
        zh: 'Portrait prompt examples：职业头像、创始人媒体照、编辑写真和社媒封面都使用同一套主体、镜头、光影和服装 slot。',
        en: 'Portrait prompt examples: professional headshots, founder press photos, editorial portraits and social covers all share subject, lens, lighting and wardrobe slots.'
      },
      {
        zh: '角色 cosplay 写真，固定角色识别点并避免像真实名人。',
        en: 'Character cosplay portrait with locked identity cues while avoiding resemblance to real celebrities.'
      }
    ],
    sections: [
      {
        title: {
          zh: 'Free AI portrait prompt examples',
          en: 'Free AI portrait prompt examples'
        },
        body: {
          zh: '免费人像案例应该帮助用户复制结构，而不是复制人物身份。先确认成年主体和用途，再替换职业、服装、场景和发布渠道。',
          en: 'Free portrait examples should help users copy structure, not identity. Confirm adult subject and output use first, then replace role, wardrobe, scene and channel.'
        },
        items: [
          {
            zh: '头像：脸部清晰、背景干净、上半身构图、社媒和关于页都可裁切。',
            en: 'Headshot: clear face, clean background, upper-body crop and safe cropping for social profiles and about pages.'
          },
          {
            zh: '编辑写真：明确镜头、姿态、服装材质、背景层次和光线方向。',
            en: 'Editorial portrait: specify lens, pose, wardrobe material, background depth and light direction.'
          },
          {
            zh: '商业人像：保留真实皮肤、自然表情和完整服装，避免名人脸、过度磨皮和不可用文字。',
            en: 'Commercial portrait: keep realistic skin, natural expression and complete wardrobe while avoiding celebrity likeness, over-smoothing and unusable text.'
          }
        ]
      },
      {
        title: {
          zh: 'GPT Image 2 人像 prompt slot',
          en: 'GPT Image 2 portrait prompt slots'
        },
        body: {
          zh: '人像搜索意图通常需要比“好看照片”更具体的结构，尤其是主体、镜头、光影和安全边界。',
          en: 'Portrait search intent usually needs a more specific structure than a beautiful photo, especially around subject, lens, lighting and safety boundaries.'
        },
        items: [
          {
            zh: '主体：成年人物、身份语境、表情、姿态和服装完整性。',
            en: 'Subject: adult person, role context, expression, pose and wardrobe completeness.'
          },
          {
            zh: '摄影：镜头焦段、景别、光线方向、背景虚化和皮肤真实质感。',
            en: 'Photography: focal length, shot size, light direction, background blur and realistic skin texture.'
          },
          {
            zh: '约束：避免名人脸、过度磨皮、畸形手指、品牌标识和不可用文字。',
            en: 'Constraints: avoid celebrity likeness, over-smoothed skin, distorted fingers, brand marks and unusable text.'
          }
        ]
      }
    ],
    faq: [
      {
        question: {
          zh: 'AI 写真 prompt 最容易失败在哪里？',
          en: 'Where do AI portrait prompts fail most often?'
        },
        answer: {
          zh: '常见失败是姿态、服装、镜头和安全约束混在一起，模型不知道优先级。',
          en: 'Common failures come from mixing pose, wardrobe, lens and safety constraints without clear priority.'
        }
      },
      {
        question: {
          zh: 'Portrait prompt examples 和 GPT Image 2 prompts 怎么配合？',
          en: 'How do portrait prompt examples work with GPT Image 2 prompts?'
        },
        answer: {
          zh: '先在人像页面确定主体、镜头、光影、姿态和安全约束，再回到 GPT Image 2 页面选择模型设置、尺寸和生成数量。',
          en: 'Use the portrait page to define subject, lens, lighting, pose and safety constraints first, then return to the GPT Image 2 page for model settings, size and image count.'
        }
      },
      {
        question: {
          zh: '如何减少 AI 味？',
          en: 'How do I reduce the AI look?'
        },
        answer: {
          zh: '加入真实摄影语境、具体镜头和材质约束，避免只写“超真实、高清、完美”。',
          en: 'Use real photographic context, concrete lens details and texture constraints instead of only saying ultra realistic or perfect.'
        }
      },
      {
        question: {
          zh: '什么是 boudoir / 私房写真 prompt？怎么写不翻车？',
          en: 'What is a boudoir prompt and how do I avoid failure?'
        },
        answer: {
          zh: 'Boudoir（私房写真）prompt 是用光、材质和构图表达亲密氛围的人像提示词，不靠露骨：丝缎、纱帘、晨光、浅景深和克制表情。要求明确成年主体、完整衣着、非露骨，并把「避免儿童感/露骨/水印/可读文字」放进 negative prompt。',
          en: 'A boudoir prompt uses light, fabric and framing to express an intimate mood instead of explicitness: satin, sheer curtains, morning light, shallow depth of field and a restrained expression. Keep an adult subject, fully covered wardrobe and non-explicit output, and put avoid childlike or explicit content in the negative prompt.'
        }
      },
      {
        question: {
          zh: '泳装/度假类写真 prompt 怎么写？',
          en: 'How do I write swimwear or resort portrait prompts?'
        },
        answer: {
          zh: '用品牌编辑或度假 campaign 框架写：明确成年主体、连体或完整泳装、泳池或海滩场景、黄金时刻光线和自然姿态；把「避免露骨/儿童感/水印」放进 negative prompt。这类内容属 medium 风险，可能走保守模型回退。',
          en: 'Write swimwear prompts in an editorial or brand-campaign frame: adult subject, one-piece or fully covered swimwear, a poolside or beach scene, golden-hour light and natural poses; keep avoid explicit or childlike wording in the negative prompt. These are medium-risk and may use a conservative model fallback.'
        }
      },
      {
        question: {
          zh: 'NSFW 提示词和普通提示词的区别？WebToMind 能做什么？',
          en: 'How do NSFW prompts differ from regular prompts, and what can WebToMind do?'
        },
        answer: {
          zh: 'NSFW 常被用来形容「有张力但露骨程度不一」的图片。WebToMind 只生成合法 SFW 内容：泳装、内衣电商、boudoir、glamour 等审美向内容可以生成，但明确色情/裸露、未成年内容和名人肖像会被直接拦截。搜索这类词时请用非露骨审美向描述，结果更稳定。',
          en: 'NSFW is often used loosely for images with varying intensity. WebToMind only generates legal SFW content: swimwear, lingerie e-commerce, boudoir and glamour are supported, but explicit sexual content, underage content and celebrity likeness are blocked. Use non-explicit, tasteful wording for stable results.'
        }
      }
    ]
  },
  {
    type: 'category',
    slug: 'sref-prompts',
    title: {
      zh: 'SREF Prompts 与风格参考案例库',
      en: 'SREF prompts and style reference examples'
    },
    description: {
      zh: '精选 SREF prompts、style reference prompt 和 Midjourney 风格参考案例，把稳定风格拆成可复用的图片生成结构。',
      en: 'Curated SREF prompts, style reference prompts and Midjourney style-reference examples that turn stable styles into reusable image-generation structures.'
    },
    badge: { zh: '风格参考', en: 'Style reference' },
    intent: {
      zh: '承接 sref prompts、Midjourney sref prompts、style reference prompt 和 AI image style references 搜索。',
      en: 'Targets sref prompts, Midjourney sref prompts, style reference prompt and AI image style reference searches.'
    },
    keywords: {
      zh: ['SREF prompts', 'Midjourney sref', 'style reference prompt'],
      en: ['SREF prompts', 'Midjourney SREF prompts', 'style reference prompts']
    },
    workflow: [
      {
        zh: '先记录风格参考来源、视觉气质、色彩、材质和构图锚点。',
        en: 'Start by recording the style reference source, visual mood, color, texture and composition anchors.'
      },
      {
        zh: '把风格拆成 prompt slot，而不是只保留一串不可解释的 code。',
        en: 'Split the style into prompt slots instead of keeping only an opaque code.'
      },
      {
        zh: '在 WebToMind 中保存案例和生成结果，后续替换主体也能保留风格方向。',
        en: 'Save the case and results in WebToMind so future subject swaps keep the same style direction.'
      }
    ],
    examples: [
      {
        zh: '复古胶片海报风格：固定颗粒、色温、字体层级和人物占比。',
        en: 'Vintage film poster style with locked grain, color temperature, typography hierarchy and subject scale.'
      },
      {
        zh: '高端时装摄影风格：固定镜头距离、硬光轮廓和低饱和色彩。',
        en: 'High-fashion photography style with locked lens distance, hard rim light and muted color palette.'
      }
    ],
    sections: [
      {
        title: {
          zh: '把 SREF 转成可复用风格 slot',
          en: 'Turn SREF into reusable style slots'
        },
        body: {
          zh: 'SREF 页面不应该堆来源名称，而是帮助用户把风格参考拆成 WebToMind 可以保存和复用的结构。',
          en: 'The SREF page should not collect source names; it should help users translate style references into structures WebToMind can save and reuse.'
        },
        items: [
          {
            zh: '视觉气质：年代、媒介、色彩温度、对比度、颗粒和材质。',
            en: 'Visual mood: era, medium, color temperature, contrast, grain and materials.'
          },
          {
            zh: '构图方式：主体比例、镜头距离、背景层级、留白和边缘裁切。',
            en: 'Composition: subject scale, lens distance, background layers, whitespace and edge crop.'
          },
          {
            zh: '迁移规则：保留风格 slot，替换主体、品牌、人物身份和商业场景。',
            en: 'Transfer rule: keep style slots while replacing subject, brand, identity and commercial context.'
          }
        ]
      }
    ],
    faq: [
      {
        question: {
          zh: 'SREF prompt 和普通 prompt 有什么区别？',
          en: 'How are SREF prompts different from normal prompts?'
        },
        answer: {
          zh: 'SREF 更偏风格参考和视觉一致性，普通 prompt 更偏主体、场景和任务描述。稳定工作流需要两者配合。',
          en: 'SREF focuses on style reference and visual consistency, while normal prompts describe subject, scene and task. Stable workflows use both.'
        }
      },
      {
        question: {
          zh: '没有 Midjourney 也能用 SREF 思路吗？',
          en: 'Can I use the SREF workflow without Midjourney?'
        },
        answer: {
          zh: '可以。WebToMind 会把风格参考拆成可读 prompt 结构，用于多模型图片生成和案例复用。',
          en: 'Yes. WebToMind turns style references into readable prompt structures for multi-model image generation and case reuse.'
        }
      }
    ]
  },
  {
    type: 'category',
    slug: 'product-images',
    title: {
      zh: 'AI 商品图 Prompt 生成工作流',
      en: 'AI product image prompt workflow'
    },
    description: {
      zh: 'AI 商品图 Prompt 案例与生成工作流：用产品、场景、光影、版式和卖点 slot 生成可复用的电商主图、KV 与社媒海报。',
      en: 'Generate reusable product image, KV and social poster prompts with product, scene, lighting, layout and selling-point slots.'
    },
    badge: { zh: '场景专题', en: 'Use case' },
    intent: {
      zh: '面向 AI product image generator、商品图 prompt 和电商主图生成搜索。',
      en: 'For AI product image generator, ecommerce prompt and product hero image searches.'
    },
    keywords: {
      zh: ['AI 商品图生成', '商品图 prompt', '电商主图 AI'],
      en: [
        'AI product image generator',
        'product image prompts',
        'ecommerce AI images'
      ]
    },
    workflow: [
      {
        zh: '明确产品主体、品牌调性和核心卖点。',
        en: 'Define product subject, brand tone and core selling point.'
      },
      {
        zh: '把背景、光影、模特、构图和留白拆成独立 slot。',
        en: 'Split background, lighting, model, composition and whitespace into separate slots.'
      },
      {
        zh: '批量生成不同版式，用于主图、KV、广告和社媒测试。',
        en: 'Batch-generate layout variants for hero images, KVs, ads and social tests.'
      }
    ],
    examples: [
      {
        zh: '护肤品主图：透明瓶身、湿润高光、干净背景、右侧标题留白。',
        en: 'Skincare hero image: transparent bottle, wet highlight, clean background and right-side title whitespace.'
      },
      {
        zh: '穿搭商品图：固定服装主体，生成街拍、棚拍和旅行场景版本。',
        en: 'Fashion product image: lock wardrobe subject and create street, studio and travel scene versions.'
      }
    ],
    faq: [
      {
        question: {
          zh: 'AI 商品图 prompt 是否要包含文案？',
          en: 'Should product prompts include copy text?'
        },
        answer: {
          zh: '建议只描述留白和版式，具体文字可后期叠加，除非模型支持稳定文字。',
          en: 'Usually describe whitespace and layout only, then add exact copy later unless the model handles text reliably.'
        }
      },
      {
        question: {
          zh: '如何让商品图更像商业拍摄？',
          en: 'How do I make AI product images look commercial?'
        },
        answer: {
          zh: '写清光源、材质反射、背景用途和画面层级，不要只堆“高级、质感”。',
          en: 'Specify light source, material reflection, background use and visual hierarchy instead of vague premium wording.'
        }
      }
    ]
  },
  {
    type: 'category',
    slug: 'xiaohongshu-cover',
    title: {
      zh: '小红书 AI 封面提示词',
      en: 'Xiaohongshu AI cover prompts'
    },
    description: {
      zh: '整理适合小红书 9:16 封面、真人写真封面和生活方式海报的 AI prompt 案例。',
      en: 'AI prompt examples for 9:16 Xiaohongshu covers, realistic portrait covers and lifestyle posters.'
    },
    badge: { zh: '增长专题', en: 'Growth use case' },
    intent: {
      zh: '承接小红书封面 AI、9:16 prompt 和社媒封面生成器相关搜索。',
      en: 'Targets Xiaohongshu cover AI, 9:16 prompt and social cover generator searches.'
    },
    keywords: {
      zh: ['小红书 AI 封面', '9:16 AI prompt', '社媒封面生成'],
      en: ['Xiaohongshu AI cover', '9:16 AI prompts', 'social cover generator']
    },
    workflow: [
      {
        zh: '先固定 9:16 比例、主体位置和标题留白。',
        en: 'Lock 9:16 ratio, subject position and title whitespace first.'
      },
      {
        zh: '选择能被手机首屏快速识别的主体、背景和色彩对比。',
        en: 'Choose subject, background and color contrast that read quickly on mobile.'
      },
      {
        zh: '保存封面风格模板，后续只换主题和场景。',
        en: 'Save cover style templates and later swap only topic and scene.'
      }
    ],
    examples: [
      {
        zh: '生活方式封面：人物居中、上方留标题区、明亮自然光。',
        en: 'Lifestyle cover: centered subject, title whitespace at top and bright natural light.'
      },
      {
        zh: '穿搭封面：全身构图、背景干净、主体轮廓清晰。',
        en: 'Outfit cover: full-body composition, clean background and clear subject silhouette.'
      }
    ],
    faq: [
      {
        question: {
          zh: '小红书封面 prompt 需要写标题文字吗？',
          en: 'Should Xiaohongshu cover prompts include title text?'
        },
        answer: {
          zh: '通常先生成无字图，prompt 只控制留白位置，标题后期排版更稳定。',
          en: 'Usually generate without text, use the prompt to reserve whitespace, and add title layout later.'
        }
      },
      {
        question: { zh: '为什么要固定 9:16？', en: 'Why lock 9:16?' },
        answer: {
          zh: '小红书和短视频封面强依赖移动端首屏，比例不稳定会影响裁切和点击。',
          en: 'Social covers depend on mobile first-screen cropping; unstable ratios hurt framing and clicks.'
        }
      }
    ]
  },
  {
    type: 'category',
    slug: 'character-consistency',
    title: {
      zh: 'AI 角色一致性 Prompt 案例',
      en: 'AI character consistency prompt examples'
    },
    description: {
      zh: '学习如何固定角色脸型、发型、妆容、镜头和世界观，生成同一角色的连续图片。',
      en: 'Learn how to lock face, hair, makeup, lens and world context for consistent character image series.'
    },
    badge: { zh: '角色专题', en: 'Character guide' },
    intent: {
      zh: '面向 consistent character AI、角色一致性 prompt 和连续出图工作流搜索。',
      en: 'For consistent character AI, character prompt and visual-series workflow searches.'
    },
    keywords: {
      zh: ['AI 角色一致性', '角色 prompt', '连续出图'],
      en: [
        'AI character consistency',
        'consistent character prompts',
        'AI image series'
      ]
    },
    workflow: [
      {
        zh: '先写角色识别信息：脸型、发型、妆容、体态、服装锚点。',
        en: 'Start with identity anchors: face, hair, makeup, body cues and wardrobe anchors.'
      },
      {
        zh: '每次只替换姿态、表情、背景或镜头中的一个变量。',
        en: 'Change only one variable at a time: pose, expression, background or lens.'
      },
      {
        zh: '把稳定组合保存为角色模板和案例。',
        en: 'Save stable combinations as character templates and cases.'
      }
    ],
    examples: [
      {
        zh: '同一角色三张图：站姿、坐姿、近景，只改变姿态。',
        en: 'Three images of one character: standing, sitting and close-up, changing only pose.'
      },
      {
        zh: '同一 IP 角色跨场景：教室、街头、海边，保持脸和发型一致。',
        en: 'Same IP character across classroom, street and beach while keeping face and hair consistent.'
      }
    ],
    faq: [
      {
        question: {
          zh: '角色一致性最重要的变量是什么？',
          en: 'What matters most for character consistency?'
        },
        answer: {
          zh: '脸型、发型、妆容、镜头距离和核心服装锚点比泛泛写“same character”更重要。',
          en: 'Face, hair, makeup, lens distance and wardrobe anchors matter more than simply writing same character.'
        }
      },
      {
        question: {
          zh: '可以完全保证同一张脸吗？',
          en: 'Can AI guarantee the exact same face?'
        },
        answer: {
          zh: '不能完全保证，但通过 slot、参考图和历史重编可以明显降低漂移。',
          en: 'Not perfectly, but slots, references and history re-editing can significantly reduce drift.'
        }
      }
    ]
  },
  {
    type: 'category',
    slug: 'comfyui-prompts',
    title: {
      zh: 'ComfyUI Prompt 案例与 Workflow 检查器',
      en: 'ComfyUI Prompt Examples & Workflow Checker'
    },
    description: {
      zh: '浏览 ComfyUI prompt 案例，并检查 workflow JSON 中的 positive/negative prompt、模型、LoRA、VAE 和 custom node 风险。',
      en: 'Browse ComfyUI prompt examples, then check workflow JSON for positive and negative prompts, models, LoRAs, VAEs and custom node risks.'
    },
    badge: { zh: 'ComfyUI 专题', en: 'ComfyUI guide' },
    intent: {
      zh: '承接 ComfyUI workflow checker、缺失节点、模型迁移和 prompt 提取相关搜索。',
      en: 'Targets ComfyUI workflow checker, missing nodes, model migration and prompt extraction searches.'
    },
    keywords: {
      zh: ['ComfyUI prompt', 'ComfyUI workflow 检查', 'ComfyUI 缺失节点'],
      en: [
        'ComfyUI prompts',
        'ComfyUI workflow checker',
        'ComfyUI missing nodes'
      ]
    },
    workflow: [
      {
        zh: '上传或粘贴 workflow JSON，先检查 checkpoint、LoRA、VAE 和 custom node。',
        en: 'Upload or paste workflow JSON and inspect checkpoint, LoRA, VAE and custom nodes first.'
      },
      {
        zh: '提取 positive/negative prompt，整理成可读的图片生成指令。',
        en: 'Extract positive and negative prompts into readable image-generation instructions.'
      },
      {
        zh: '把高风险依赖换成更轻的 WebToMind prompt 案例，降低环境维护成本。',
        en: 'Replace high-risk dependencies with lighter WebToMind prompt cases to reduce environment maintenance.'
      }
    ],
    examples: [
      {
        zh: '从 CLIPTextEncode 节点提取主体、风格、光影和负面词。',
        en: 'Extract subject, style, lighting and negative terms from CLIPTextEncode nodes.'
      },
      {
        zh: '检查缺失模型和 custom node 后，生成迁移清单和重新出图入口。',
        en: 'After missing models and custom nodes are detected, generate a migration checklist and re-creation entry.'
      }
    ],
    relatedLinks: [
      {
        path: '/tools/comfyui-workflow-checker',
        title: {
          zh: '打开 ComfyUI Workflow 检查器',
          en: 'Open the ComfyUI Workflow Checker'
        },
        description: {
          zh: '在浏览器中检查 workflow JSON，不上传原始工作流。',
          en: 'Inspect workflow JSON in the browser without uploading the raw workflow.'
        }
      }
    ],
    faq: [
      {
        question: {
          zh: 'WebToMind 会运行 ComfyUI workflow 吗？',
          en: 'Does WebToMind run ComfyUI workflows?'
        },
        answer: {
          zh: '不会。当前工具侧重检查、提取和迁移 prompt，不托管用户本地 ComfyUI 环境。',
          en: 'No. The current tool focuses on checking, extracting and migrating prompts, not hosting local ComfyUI environments.'
        }
      },
      {
        question: {
          zh: '为什么不直接修复我的 ComfyUI 环境？',
          en: 'Why not directly fix my ComfyUI environment?'
        },
        answer: {
          zh: '本地依赖差异太大，直接修复售后成本高；先给风险报告和可迁移 prompt 更稳定。',
          en: 'Local dependency states vary too much. A risk report and portable prompt are more reliable for a web product.'
        }
      }
    ]
  }
];

export function getPromptSeoPage(
  type: PromptSeoPageType,
  slug: string
): PromptSeoPage | undefined {
  return PROMPT_SEO_PAGES.find(
    (page) => page.type === type && page.slug === slug
  );
}
