export type CommercialCasePackageSlug =
  | 'xiaohongshu-cover'
  | 'ecommerce-product-photo'
  | 'wechat-cover-poster'
  | 'portrait-character-consistency'
  | 'storefront-marketing-kit';

export interface CommercialCaseDraftInput {
  packageSlug: string;
  businessScene?: string;
  targetAudience?: string;
  deliverable?: string;
  count?: number;
  locale?: 'zh-CN' | 'en-US' | string;
  imageSize?: string;
  memberOnlyDefault?: boolean;
}

export interface CommercialCaseDraftOutput {
  packageSlug: CommercialCasePackageSlug;
  sourceSkill: 'zhong-image-director';
  title: string;
  category: string;
  tags: string[];
  prompt: string;
  negativePrompt: string;
  promptPreview: string;
  commercialIntent: string;
  generationSettings: {
    model: 'gpt-image-2';
    imageSize: string;
    quality: 'auto' | 'low' | 'medium' | 'high';
    imageCount: number;
  };
  skillSeedPrompt: string;
  memberOnly: boolean;
}

interface PackageConfig {
  slug: CommercialCasePackageSlug;
  nameZh: string;
  nameEn: string;
  category: string;
  defaultScene: string;
  defaultAudience: string;
  defaultDeliverable: string;
  defaultImageSize: string;
  tags: string[];
  visualGenes: string[];
  layoutRules: string[];
  copyRules: string[];
  variationAngles: string[];
  caseSeeds: string[];
}

const NEGATIVE_PROMPT = [
  '画面杂乱',
  '构图失衡',
  '只有风格没有排版',
  '文字乱码',
  '错别字',
  '廉价促销模板感',
  '背景复杂场景化',
  '过多装饰',
  '强渐变滥用',
  '主体与文字抢层级',
  '留白不足',
  '阅读路径混乱',
  '信息节点不清',
  '色块只是装饰没有结构作用',
  '主体被文字遮挡',
  '水印',
  '无关 logo',
  '拼图/多图合并'
].join(', ');

export const COMMERCIAL_CASE_PACKAGES: Record<
  CommercialCasePackageSlug,
  PackageConfig
> = {
  'xiaohongshu-cover': {
    slug: 'xiaohongshu-cover',
    nameZh: '小红书封面视觉导演',
    nameEn: 'Xiaohongshu Cover Visual Director',
    category: 'xiaohongshu',
    defaultScene: '知识博主、生活方式品牌或课程主理人发布小红书笔记',
    defaultAudience: '小红书博主、课程运营、品牌内容负责人',
    defaultDeliverable: '一张可直接作为小红书首图的商业封面',
    defaultImageSize: '1024x1536',
    tags: ['xiaohongshu-cover', 'social-cover', 'marketing-creative'],
    visualGenes: [
      '强标题区 + 单一主体 + 清晰卖点标签',
      '高对比但不过度花哨的封面色块',
      '适合手机信息流停留的近景视觉锤'
    ],
    layoutRules: [
      '主标题占画面上方 22%-30%，最多两行',
      '主体位于中下部，给标题和卖点留出稳定安全区',
      '2-4 个信息节点沿阅读路径排列，不做标签堆叠'
    ],
    copyRules: [
      '标题必须短、准、可读，不生成乱码',
      '辅助文字只保留主题、结果或受众，不写长段说明'
    ],
    variationAngles: ['爆款标题封面', '方法论封面', '前后对比封面'],
    caseSeeds: [
      'AI 工具教程笔记首图',
      '个人 IP 咨询服务封面',
      '副业训练营招募笔记',
      '探店攻略收藏型封面',
      '护肤成分科普封面',
      '职场效率方法论封面',
      '亲子教育经验分享封面',
      '留学申请避坑指南封面',
      '健身减脂打卡笔记封面',
      '旅行路线攻略封面'
    ]
  },
  'ecommerce-product-photo': {
    slug: 'ecommerce-product-photo',
    nameZh: '电商主图视觉导演',
    nameEn: 'Ecommerce Product Photo Visual Director',
    category: 'ecommerce',
    defaultScene: '电商商品上新、详情页首屏或广告投放',
    defaultAudience: '电商运营、独立站卖家、品牌主理人',
    defaultDeliverable: '一张高转化电商主图或商品场景图',
    defaultImageSize: '1536x1024',
    tags: ['ecommerce', 'product-photo', 'conversion-creative'],
    visualGenes: [
      '产品为绝对主角，材质、尺寸、功能点清楚',
      '干净商业摄影光线，背景服务商品而不抢戏',
      '卖点信息以结构色块承载，避免廉价贴纸感'
    ],
    layoutRules: [
      '商品占画面 45%-65%，边缘留出平台裁切安全区',
      '卖点模块不超过 3 个，沿商品边缘形成视觉引导',
      '可加入使用场景暗示，但不能削弱商品识别'
    ],
    copyRules: [
      '文字只写规格、核心卖点或使用场景',
      '不捏造品牌、认证、价格和折扣'
    ],
    variationAngles: ['卖点主图', '场景主图', '质感特写主图'],
    caseSeeds: [
      '护肤精华新品主图',
      '咖啡器具独立站首屏图',
      '运动鞋功能卖点主图',
      '露营灯便携场景主图',
      '宠物用品电商广告图',
      '香薰蜡烛礼盒主图',
      '儿童水杯安全材质主图',
      '键盘外设质感主图',
      '家用清洁工具卖点主图',
      '食品礼盒节日销售主图'
    ]
  },
  'wechat-cover-poster': {
    slug: 'wechat-cover-poster',
    nameZh: '公众号封面视觉导演',
    nameEn: 'WeChat Cover Poster Visual Director',
    category: 'wechat-cover',
    defaultScene: '公众号文章、知识专栏或品牌长文发布',
    defaultAudience: '公众号作者、知识 IP、品牌内容团队',
    defaultDeliverable: '一张公众号头图或文章封面海报',
    defaultImageSize: '1536x1024',
    tags: ['wechat-cover', 'editorial-cover', 'article-poster'],
    visualGenes: [
      '编辑部封面感，标题系统比装饰更重要',
      '大留白、强层级、可被缩略图识别的主视觉',
      '主题隐喻清晰但不过度堆概念'
    ],
    layoutRules: [
      '标题位于左侧或上方稳定区域，建立第一阅读点',
      '主视觉作为第二阅读点，和标题形成明确张力',
      '分割线、纸张、窗口或色块必须承担信息组织功能'
    ],
    copyRules: [
      '标题保留完整语义，小字承接文章副标题或栏目名',
      '避免过多装饰字、花字和不可读英文'
    ],
    variationAngles: ['深度长文封面', '观点评论封面', '知识科普封面'],
    caseSeeds: [
      'AI 创业趋势长文封面',
      '个人成长方法论文章封面',
      '商业案例复盘文章封面',
      '消费品牌观察长文封面',
      '职场管理观点文章封面',
      '年度总结复盘封面',
      '行业报告解读封面',
      '心理学科普文章封面',
      '设计趋势观察封面',
      '读书笔记深度文章封面'
    ]
  },
  'portrait-character-consistency': {
    slug: 'portrait-character-consistency',
    nameZh: '人像写真与角色一致性视觉导演',
    nameEn: 'Portrait Character Consistency Visual Director',
    category: 'portrait',
    defaultScene: '个人写真、IP 角色设定或系列头像素材',
    defaultAudience: '内容创作者、摄影师、IP 运营、角色设计师',
    defaultDeliverable: '一张可延展为系列的人像角色视觉样张',
    defaultImageSize: '1024x1536',
    tags: ['portrait', 'character-consistency', 'ai-portrait'],
    visualGenes: [
      '人物身份、发型、服饰、饰品和气质保持稳定',
      '商业写真光线与角色设定板信息密度平衡',
      '自然加入 ZHONG 长条竖向饰品牌作为个人标签'
    ],
    layoutRules: [
      '人物面部和服装关键特征清楚，不被文字或道具遮挡',
      '背景只做角色世界观暗示，不制造无关复杂场景',
      '可加入小型设定标签，但不做拼贴式设定板'
    ],
    copyRules: [
      '如有文字，只用于角色名、系列名或简短设定',
      '不生成真实名人、第三方 IP 或未授权品牌'
    ],
    variationAngles: ['商业头像', '角色海报', '写真样张'],
    caseSeeds: [
      '知识博主专业头像',
      '咖啡店主理人写真',
      '虚拟主播角色海报',
      '游戏原创角色设定',
      '美妆达人系列头像',
      '摄影师个人品牌照',
      '职场顾问形象样张',
      '古风原创角色写真',
      '潮流穿搭博主头像',
      '音乐人宣传写真'
    ]
  },
  'storefront-marketing-kit': {
    slug: 'storefront-marketing-kit',
    nameZh: '门店营销物料包视觉导演',
    nameEn: 'Storefront Marketing Kit Visual Director',
    category: 'poster',
    defaultScene: '线下门店节日促销、新品活动或到店转化',
    defaultAudience: '餐饮、美业、零售、酒吧等本地商家',
    defaultDeliverable: '一张可扩展为海报、桌卡、门贴的营销主视觉',
    defaultImageSize: '1024x1536',
    tags: ['storefront-marketing-kit', 'offline-retail', 'poster'],
    visualGenes: [
      '可打印、可摆放、远距离可读的促销视觉系统',
      '活动主题、主利益点、行动指令三层信息清晰',
      '色块、价格区、图标与主体共同组织阅读路径'
    ],
    layoutRules: [
      '主利益点成为第一视觉中心，门店品类主体成为第二中心',
      '二维码/到店/日期/地址信息预留底部安全区',
      '同一母版可扩展为立牌、桌卡、门贴和社媒图'
    ],
    copyRules: [
      '不捏造真实价格和门店信息，用占位文案表达结构',
      '促销语要清楚直接，但避免廉价模板感'
    ],
    variationAngles: ['新品促销', '节日活动', '会员到店转化'],
    caseSeeds: [
      '咖啡店新品拿铁活动',
      '美甲店夏季套餐促销',
      '烘焙店节日礼盒预订',
      '健身房体验课招募',
      '酒吧周末主题夜海报',
      '花店情人节预售物料',
      '宠物店会员日活动',
      '火锅店工作日引流海报',
      '买手店换季上新门贴',
      '亲子乐园到店转化桌卡'
    ]
  }
};

function clampCount(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.min(20, Math.floor(parsed)));
}

function resolvePackage(slug: string): PackageConfig {
  const packageConfig =
    COMMERCIAL_CASE_PACKAGES[slug as CommercialCasePackageSlug];
  if (!packageConfig) {
    throw new Error(
      `Unsupported commercial case package: ${slug}. Supported packages: ${Object.keys(
        COMMERCIAL_CASE_PACKAGES
      ).join(', ')}`
    );
  }
  return packageConfig;
}

function buildTitle(config: PackageConfig, scene: string, index: number): string {
  const angle = config.variationAngles[(index - 1) % config.variationAngles.length];
  const normalizedScene = scene.replace(/\s+/g, ' ').trim();
  return `${config.nameZh} · ${angle} ${normalizedScene.slice(0, 18)}`;
}

function buildPromptPreview(config: PackageConfig, scene: string, deliverable: string) {
  return [
    `${config.nameZh}：围绕「${scene}」生成${deliverable}。`,
    `公开预览包含商业落点、版式骨架和负面约束；完整 Prompt 解锁后可直接带入 GPT Image 2。`
  ].join('');
}

function buildCommercialIntent(params: {
  scene: string;
  audience: string;
  deliverable: string;
}) {
  return `商业场景：${params.scene}；精准受众：${params.audience}；可交付物料：${params.deliverable}。`;
}

function buildImagePrompt(params: {
  config: PackageConfig;
  scene: string;
  audience: string;
  deliverable: string;
  locale: string;
  imageSize: string;
  index: number;
}) {
  const { config, scene, audience, deliverable, locale, imageSize, index } =
    params;
  const angle = config.variationAngles[(index - 1) % config.variationAngles.length];
  return [
    `为 GPT Image 2 生成一张商用级视觉案例图，语言：${locale}，画幅：${imageSize}。`,
    '',
    `# 商业落点`,
    `商业场景：${scene}`,
    `精准受众：${audience}`,
    `可交付物料：${deliverable}`,
    `本次方向：${angle}`,
    '',
    `# 角色身份`,
    `你是${config.nameZh}，同时具备商业视觉总监、版式设计师、增长创意策划和印刷/投放落地经验。`,
    '',
    `# 总目标`,
    `生成一张完整、可商用、可被案例库收录的视觉作品。重点不是抽象风格词，而是可读的信息结构、明确主体、稳定版式和可复用母版。`,
    '',
    `# 视觉基因`,
    config.visualGenes.map((item) => `- ${item}`).join('\n'),
    '',
    `# 构图与信息密度`,
    config.layoutRules.map((item) => `- ${item}`).join('\n'),
    '',
    `# 文字准确性`,
    config.copyRules.map((item) => `- ${item}`).join('\n'),
    '- 所有可见文字必须准确、清晰、少量，不出现乱码、错别字或伪字母。',
    '',
    `# 最终画面要求`,
    `画面必须像已经可以交付给真实客户的${deliverable}，包含明确阅读顺序、主体层级、结构色块和商业用途。不要输出分析过程，只生成最终画面。`,
    '',
    `# 严格禁止`,
    NEGATIVE_PROMPT
  ].join('\n');
}

function buildSkillSeedPrompt(config: PackageConfig) {
  return [
    `# ${config.nameZh}`,
    '',
    `## 角色身份`,
    `你是${config.nameZh}，负责把用户输入转化为可直接带入 /create 的 GPT Image 2 商业视觉 prompt。`,
    '',
    `## 用户输入槽位`,
    `- 业务场景`,
    `- 目标受众`,
    `- 可交付物料`,
    `- 画幅比例/尺寸`,
    `- 语言`,
    `- 必须出现/必须避免元素`,
    '',
    `## 用途分流`,
    config.variationAngles.map((item) => `- ${item}`).join('\n'),
    '',
    `## 视觉基因`,
    config.visualGenes.map((item) => `- ${item}`).join('\n'),
    '',
    `## 构图与信息密度`,
    config.layoutRules.map((item) => `- ${item}`).join('\n'),
    '',
    `## 文字准确性`,
    config.copyRules.map((item) => `- ${item}`).join('\n'),
    '',
    `## 负面约束`,
    NEGATIVE_PROMPT,
    '',
    `## 最终行为`,
    `收到用户输入后，先给出 3 个商业视觉方向，再输出 1 条完整 GPT Image 2 prompt。不要承诺生成最终品牌全案，不暴露内部草稿审核流程。`
  ].join('\n');
}

export function generateCommercialCaseDrafts(
  input: CommercialCaseDraftInput
): CommercialCaseDraftOutput[] {
  const config = resolvePackage(input.packageSlug);
  const count = clampCount(input.count);
  const fixedScene = input.businessScene?.trim();
  const audience = (input.targetAudience || config.defaultAudience).trim();
  const deliverable = (input.deliverable || config.defaultDeliverable).trim();
  const locale = (input.locale || 'zh-CN').trim() || 'zh-CN';
  const imageSize = (input.imageSize || config.defaultImageSize).trim();
  const memberOnly = input.memberOnlyDefault === true;

  return Array.from({ length: count }, (_, offset) => {
    const index = offset + 1;
    const scene =
      fixedScene || config.caseSeeds[(index - 1) % config.caseSeeds.length];
    return {
      packageSlug: config.slug,
      sourceSkill: 'zhong-image-director',
      title: buildTitle(config, scene, index),
      category: config.category,
      tags: Array.from(new Set([...config.tags, 'gpt-image-2', locale])),
      prompt: buildImagePrompt({
        config,
        scene,
        audience,
        deliverable,
        locale,
        imageSize,
        index
      }),
      negativePrompt: NEGATIVE_PROMPT,
      promptPreview: buildPromptPreview(config, scene, deliverable),
      commercialIntent: buildCommercialIntent({ scene, audience, deliverable }),
      generationSettings: {
        model: 'gpt-image-2',
        imageSize,
        quality: 'auto',
        imageCount: 2
      },
      skillSeedPrompt: buildSkillSeedPrompt(config),
      memberOnly
    };
  });
}
