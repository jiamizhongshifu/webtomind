import type {
  ImagePromptAsset,
  ImagePromptSlot
} from '../../data/image-prompt-core';

export type PromptDiagnosticSeverity = 'warning' | 'suggestion' | 'ok';

export interface PromptDiagnosticItem {
  id: string;
  severity: PromptDiagnosticSeverity;
  title: string;
  description: string;
  suggestion: string;
}

export interface PromptDiagnosticResult {
  score: number;
  aiTasteScore: number;
  aiTasteLevel: 'low' | 'medium' | 'high';
  summary: string;
  items: PromptDiagnosticItem[];
  missingSlots: ImagePromptSlot[];
}

type PromptLocale = 'zh-CN' | 'en-US';

interface AnalyzePromptStructureInput {
  prompt: string;
  negativePrompt: string;
  promptMode: 'composed' | 'custom';
  selectedAssets: ImagePromptAsset[];
  locale: PromptLocale;
}

const CORE_SLOTS: ImagePromptSlot[] = [
  'character',
  'productSubject',
  'pose',
  'background',
  'composition',
  'titleArea',
  'shot',
  'lens',
  'lighting'
];

const ABSTRACT_AESTHETIC_MARKERS =
  /高级感|氛围感|电影感|大片感|质感|精致感|未来感|赛博感|梦幻|唯美|震撼|惊艳|aesthetic|cinematic|beautiful|epic|masterpiece|best quality|ultra detailed|trending on/i;

const CONCRETE_VISUAL_MARKERS =
  /主体|人物|角色|产品|道具|前景|中景|背景|左侧|右侧|上方|下方|中央|偏左|偏右|留白|边距|标题|副标题|注释|标签|色块|色场|分栏|网格|材质|纸张|金属|布料|玻璃|光源|阴影|镜头|焦段|subject|foreground|background|negative space|margin|headline|subhead|label|color block|grid|material|lighting|shadow|lens/i;

const COMMERCIAL_INTENT_MARKERS =
  /海报|封面|主视觉|KV|菜单|桌牌|立牌|电商|商品|品牌|提案|物料|社媒|朋友圈|小红书|课程|信息图|poster|cover|key visual|campaign|menu|product|brand|proposal|social post|infographic|deliverable/i;

const LAYOUT_FUNCTION_MARKERS =
  /阅读路径|视觉中心|层级|分区|承载|组织|引导|区分|舞台|信息区|标题层级|边距系统|reading path|visual hierarchy|information area|content block|stage|organize|guide|anchor/i;

const FUNCTIONAL_COLOR_MARKERS =
  /色块|色场|色带|面板|窗口|卡片|分栏|color block|color field|panel|window|card|column/i;

const NEGATIVE_TEXT_MARKERS =
  /水印|乱码|错别字|文字错误|签名|logo|unreadable text|garbled text|watermark|signature|bad text|misspelled/i;

const NEGATIVE_ANATOMY_MARKERS =
  /肢体|手指|畸形|变形|多余|bad anatomy|deformed|extra fingers|extra limbs|distorted/i;

const SLOT_TEXT_MARKERS: Record<ImagePromptSlot, RegExp> = {
  style: /风格|style|render|photography|illustration|anime|realistic/i,
  character: /人物|角色|主体|adult|model|character|subject|person|portrait/i,
  expression: /表情|expression|smile|eyes|face|mood|emoji/i,
  hairstyle: /发型|盘发|束发|髻|马尾|hairstyle|chignon|bun|ponytail|topknot/i,
  makeup: /妆|makeup|lip|skin|brow|eyeliner|beauty/i,
  pose: /姿势|姿态|动作|pose|gesture|standing|sitting|body/i,
  prop: /道具|prop|held|holding|object/i,
  top: /上装|外套|衬衫|top|blouse|jacket|cardigan|shirt/i,
  bottom: /下装|裙|裤|bottom|skirt|trousers|pants|shorts/i,
  outfit: /套装|成套|配套|outfit|matching set|coordinated set|lounge set/i,
  onePiece: /一体式|连衣裙|连体裤|dress|jumpsuit|romper|one-piece/i,
  shoes: /鞋|shoes|boots|sneakers|flats/i,
  accessory: /配饰|耳环|眼镜|丝巾|包|accessory|earrings|glasses|scarf|bag/i,
  background: /背景|场景|环境|background|scene|setting|environment|studio/i,
  productSubject:
    /产品|商品|物件|食物|甜品|建筑|空间|主图|product|packshot|item|object|food|dessert|architecture/i,
  productSurface:
    /台面|桌面|展台|橱窗|承托|背景材质|surface|tabletop|display|pedestal|counter|set/i,
  composition:
    /构图|主视觉|KV|视觉重心|主体占比|主图|封面|composition|key visual|hero layout|visual weight/i,
  titleArea:
    /标题区|留白|文案区|信息区|安全区|title area|copy space|safe area|headline zone|negative space/i,
  shot: /景别|构图|特写|半身|全身|framing|shot|close-up|full-body|composition/i,
  viewpoint:
    /机位|视角|俯拍|仰拍|顶视|侧面|越肩|荷兰角|viewpoint|camera angle|high-angle|low-angle|overhead|profile|over-shoulder|dutch/i,
  lens: /镜头|焦段|35mm|85mm|lens|wide|telephoto|anamorphic|selfie/i,
  lighting: /光|光影|照明|阴影|lighting|light|shadow|highlight|backlight/i,
  visualEffect:
    /效果|叠影|速度线|景深|色散|颗粒|effect|grain|bloom|haze|glitch|rgb/i,
  layoutDesign: /版式|文字|标题|海报|排版|layout|typography|title|poster|grid/i
};

const zhSlotNames: Record<ImagePromptSlot, string> = {
  style: '风格',
  character: '人物主体',
  expression: '表情',
  hairstyle: '发型',
  makeup: '妆容',
  pose: '姿态',
  prop: '道具',
  top: '上装',
  bottom: '下装',
  outfit: '套装',
  onePiece: '一体式服装',
  shoes: '鞋履',
  accessory: '配饰',
  background: '背景',
  productSubject: '产品主体',
  productSurface: '台面环境',
  composition: '构图方式',
  titleArea: '标题区',
  shot: '景别',
  viewpoint: '机位与视角',
  lens: '镜头质感',
  lighting: '光线',
  visualEffect: '画面影响',
  layoutDesign: '版式设计'
};

const enSlotNames: Record<ImagePromptSlot, string> = {
  style: 'style',
  character: 'subject',
  expression: 'expression',
  hairstyle: 'hairstyle',
  makeup: 'makeup',
  pose: 'pose',
  prop: 'prop',
  top: 'top',
  bottom: 'bottom',
  outfit: 'outfit',
  onePiece: 'one-piece garment',
  shoes: 'shoes',
  accessory: 'accessory',
  background: 'background',
  productSubject: 'product subject',
  productSurface: 'surface',
  composition: 'composition',
  titleArea: 'title area',
  shot: 'framing',
  viewpoint: 'viewpoint',
  lens: 'lens character',
  lighting: 'lighting',
  visualEffect: 'visual effect',
  layoutDesign: 'layout design'
};

function hasSlotSignal(
  slot: ImagePromptSlot,
  selectedSlots: Set<ImagePromptSlot>,
  prompt: string
) {
  return selectedSlots.has(slot) || SLOT_TEXT_MARKERS[slot].test(prompt);
}

function getSlotName(slot: ImagePromptSlot, locale: PromptLocale) {
  return locale === 'zh-CN' ? zhSlotNames[slot] : enSlotNames[slot];
}

function countMatches(text: string, pattern: RegExp): number {
  const flags = pattern.flags.includes('g')
    ? pattern.flags
    : `${pattern.flags}g`;
  return text.match(new RegExp(pattern.source, flags))?.length || 0;
}

function getAiTasteLevel(
  score: number
): PromptDiagnosticResult['aiTasteLevel'] {
  if (score >= 55) return 'high';
  if (score >= 28) return 'medium';
  return 'low';
}

function createItem(
  locale: PromptLocale,
  item: {
    id: string;
    severity: PromptDiagnosticSeverity;
    zh: [string, string, string];
    en: [string, string, string];
  }
): PromptDiagnosticItem {
  const [title, description, suggestion] =
    locale === 'zh-CN' ? item.zh : item.en;
  return {
    id: item.id,
    severity: item.severity,
    title,
    description,
    suggestion
  };
}

export function analyzeImagePromptStructure({
  prompt,
  negativePrompt,
  promptMode,
  selectedAssets,
  locale
}: AnalyzePromptStructureInput): PromptDiagnosticResult {
  const normalizedPrompt = prompt.trim();
  const selectedSlots = new Set(selectedAssets.map((asset) => asset.slot));
  const items: PromptDiagnosticItem[] = [];

  if (!normalizedPrompt) {
    return {
      score: 0,
      aiTasteScore: 0,
      aiTasteLevel: 'low',
      summary:
        locale === 'zh-CN'
          ? '先选择素材或输入提示词，结构检测会实时给出建议。'
          : 'Pick assets or write a prompt to start the structure check.',
      items: [
        createItem(locale, {
          id: 'empty-prompt',
          severity: 'warning',
          zh: [
            '提示词为空',
            '当前没有可用于生成的主体、画面或风格描述。',
            '至少补齐人物主体、姿态、场景、景别和光线。'
          ],
          en: [
            'Prompt is empty',
            'There is no usable subject, scene, or style description yet.',
            'Add at least subject, pose, scene, framing, and lighting.'
          ]
        })
      ],
      missingSlots: CORE_SLOTS
    };
  }

  const missingSlots = CORE_SLOTS.filter(
    (slot) => !hasSlotSignal(slot, selectedSlots, normalizedPrompt)
  );

  if (missingSlots.length > 0) {
    const names = missingSlots
      .map((slot) => getSlotName(slot, locale))
      .join(locale === 'zh-CN' ? '、' : ', ');
    items.push(
      createItem(locale, {
        id: 'missing-core-slots',
        severity: 'warning',
        zh: [
          '核心结构不完整',
          `缺少 ${names}，生成时容易变成随机审美或不可复现。`,
          '优先补齐缺失类别，让主体、空间、镜头和光线形成闭环。'
        ],
        en: [
          'Core structure is incomplete',
          `Missing ${names}. The result may become random and hard to reproduce.`,
          'Fill the missing categories so subject, space, camera, and lighting work together.'
        ]
      })
    );
  }

  if (normalizedPrompt.length < (locale === 'zh-CN' ? 90 : 140)) {
    items.push(
      createItem(locale, {
        id: 'short-prompt',
        severity: 'warning',
        zh: [
          '描述密度偏低',
          '提示词较短，模型可能只能抓到风格词，难以稳定复现画面。',
          '补充主体细节、构图位置、材质、光线、背景层次和负面约束。'
        ],
        en: [
          'Prompt is thin',
          'The prompt is short, so the model may only follow broad style words.',
          'Add subject details, composition, material, lighting, background depth, and constraints.'
        ]
      })
    );
  }

  const abstractMarkerCount = countMatches(
    normalizedPrompt,
    ABSTRACT_AESTHETIC_MARKERS
  );
  const concreteMarkerCount = countMatches(
    normalizedPrompt,
    CONCRETE_VISUAL_MARKERS
  );

  if (abstractMarkerCount >= 2 && concreteMarkerCount < 5) {
    items.push(
      createItem(locale, {
        id: 'ai-taste-abstract-style',
        severity: 'warning',
        zh: [
          'AI 味偏重：抽象风格词过多',
          '提示词依赖“高级感、电影感、氛围感”等泛词，但缺少能约束画面的具体结构。',
          '把抽象词改成主体位置、留白比例、材质、光源方向、标题层级和阅读路径。'
        ],
        en: [
          'AI taste risk: abstract style words',
          'The prompt leans on broad words like cinematic or aesthetic without enough concrete visual structure.',
          'Replace them with subject placement, negative space, material, light direction, title hierarchy, and reading path.'
        ]
      })
    );
  }

  if (!COMMERCIAL_INTENT_MARKERS.test(normalizedPrompt)) {
    items.push(
      createItem(locale, {
        id: 'missing-commercial-deliverable',
        severity: 'suggestion',
        zh: [
          '商业落点不明确',
          '没有说明这张图用作海报、封面、商品主视觉、品牌提案还是社媒物料。',
          '补一句“用于什么生意、给谁看、最终交付什么物料”，模型会更容易形成完整画面。'
        ],
        en: [
          'Commercial deliverable is unclear',
          'The prompt does not say whether this is a poster, cover, product key visual, brand proposal, or social asset.',
          'Add what business use it serves, who reads it, and what deliverable it should become.'
        ]
      })
    );
  }

  if (!LAYOUT_FUNCTION_MARKERS.test(normalizedPrompt)) {
    items.push(
      createItem(locale, {
        id: 'missing-layout-function',
        severity: 'suggestion',
        zh: [
          '版式功能不足',
          '没有写清视觉中心、分区占比、信息层级或阅读路径，容易只剩装饰风格。',
          '加入主标题位置、主体占比、信息区位置、边距系统和先看哪里后看哪里。'
        ],
        en: [
          'Layout function is underspecified',
          'Visual center, area ratio, hierarchy, or reading path is missing, so the result may become decorative only.',
          'Add headline position, subject ratio, information area, margin system, and viewing order.'
        ]
      })
    );
  }

  if (
    FUNCTIONAL_COLOR_MARKERS.test(normalizedPrompt) &&
    !LAYOUT_FUNCTION_MARKERS.test(normalizedPrompt)
  ) {
    items.push(
      createItem(locale, {
        id: 'decorative-color-blocks',
        severity: 'suggestion',
        zh: [
          '色块像装饰，缺少功能',
          '提示词提到了色块/面板，但没有说明它承载内容、组织阅读还是给主体做舞台。',
          '明确每个色块负责什么：标题区、卖点区、主体舞台、注释区或留白收束。'
        ],
        en: [
          'Color blocks lack function',
          'The prompt mentions blocks or panels but does not say whether they carry content, guide reading, or stage the subject.',
          'Define what each block does: headline area, selling-point area, subject stage, notes, or negative-space closure.'
        ]
      })
    );
  }

  if (!SLOT_TEXT_MARKERS.shot.test(normalizedPrompt)) {
    items.push(
      createItem(locale, {
        id: 'missing-composition-language',
        severity: 'warning',
        zh: [
          '构图语言不足',
          '没有明确景别、裁切或主体在画面中的位置。',
          '加入特写/半身/全身、主体位置、留白比例或阅读路径。'
        ],
        en: [
          'Composition is underspecified',
          'There is no clear framing, crop, or subject placement.',
          'Add close-up/half-body/full-body framing, subject position, negative space, or reading path.'
        ]
      })
    );
  }

  if (!SLOT_TEXT_MARKERS.lighting.test(normalizedPrompt)) {
    items.push(
      createItem(locale, {
        id: 'missing-lighting-language',
        severity: 'suggestion',
        zh: [
          '光线还不明确',
          '缺少光源方向、阴影层次或高光质感，画面容易变平。',
          '补充柔光箱、逆光轮廓、金色时刻、阴天漫反射等具体光线。'
        ],
        en: [
          'Lighting is not explicit',
          'Light direction, shadow depth, or highlight quality is missing.',
          'Add concrete lighting such as softbox, rim backlight, golden hour, or overcast daylight.'
        ]
      })
    );
  }

  const normalizedNegativePrompt = negativePrompt.trim();
  if (!normalizedNegativePrompt) {
    items.push(
      createItem(locale, {
        id: 'missing-negative-prompt',
        severity: 'suggestion',
        zh: [
          '负向约束为空',
          '没有约束水印、乱码文字、肢体错误或构图杂乱等常见问题。',
          '加入“水印、乱码、错别字、肢体异常、过度锐化、构图杂乱”等负面词。'
        ],
        en: [
          'Negative prompt is empty',
          'Common failures like watermark, bad text, anatomy issues, or clutter are not constrained.',
          'Add negatives such as watermark, unreadable text, bad anatomy, oversharpening, and clutter.'
        ]
      })
    );
  } else if (
    !NEGATIVE_TEXT_MARKERS.test(normalizedNegativePrompt) ||
    !NEGATIVE_ANATOMY_MARKERS.test(normalizedNegativePrompt)
  ) {
    items.push(
      createItem(locale, {
        id: 'thin-negative-constraints',
        severity: 'suggestion',
        zh: [
          '负向约束不完整',
          '负面提示词存在，但没有同时覆盖文字乱码/水印和肢体结构错误。',
          '补上“水印、乱码、错别字、无关 logo、畸形肢体、多余手指、构图杂乱”。'
        ],
        en: [
          'Negative constraints are thin',
          'A negative prompt exists, but it does not cover both bad text/watermarks and anatomy errors.',
          'Add watermark, garbled text, misspellings, unrelated logos, bad anatomy, extra fingers, and clutter.'
        ]
      })
    );
  }

  if (
    selectedSlots.has('layoutDesign') &&
    !/标题|文字|排版|信息|title|text|typography|layout|poster/i.test(
      normalizedPrompt
    )
  ) {
    items.push(
      createItem(locale, {
        id: 'layout-needs-text-system',
        severity: 'suggestion',
        zh: [
          '版式素材需要文字系统',
          '已选择版式设计，但提示词里没有明确标题层级或信息位置。',
          '说明主标题、副标题、边缘注释、标签和主体之间的遮挡关系。'
        ],
        en: [
          'Layout asset needs a text system',
          'A layout asset is selected, but title hierarchy or information placement is unclear.',
          'Specify headline, subhead, edge notes, labels, and how text layers relate to the subject.'
        ]
      })
    );
  }

  if (
    promptMode === 'custom' &&
    selectedAssets.length > 0 &&
    !selectedAssets.some(
      (asset) =>
        normalizedPrompt.includes(asset.prompt) ||
        (asset.promptZh && normalizedPrompt.includes(asset.promptZh))
    )
  ) {
    items.push(
      createItem(locale, {
        id: 'custom-disconnected-assets',
        severity: 'suggestion',
        zh: [
          '自定义文本可能脱离素材',
          '当前仍选择了素材，但自定义提示词没有明显引用这些素材描述。',
          '确认是完全手写，或把关键素材描述复制进自定义提示词。'
        ],
        en: [
          'Custom text may ignore selected assets',
          'Assets are selected, but the custom prompt does not clearly include their descriptions.',
          'Confirm this is intentional, or copy key asset descriptions into the custom prompt.'
        ]
      })
    );
  }

  const warningCount = items.filter(
    (item) => item.severity === 'warning'
  ).length;
  const suggestionCount = items.filter(
    (item) => item.severity === 'suggestion'
  ).length;
  const aiTastePenalty = items.reduce((total, item) => {
    if (
      !item.id.startsWith('ai-taste') &&
      !item.id.includes('commercial') &&
      !item.id.includes('layout') &&
      !item.id.includes('color')
    ) {
      return total;
    }
    return total + (item.severity === 'warning' ? 24 : 12);
  }, 0);
  const aiTasteScore = Math.max(
    0,
    Math.min(100, aiTastePenalty + Math.max(0, abstractMarkerCount - 1) * 8)
  );
  const aiTasteLevel = getAiTasteLevel(aiTasteScore);
  const score = Math.max(0, 100 - warningCount * 18 - suggestionCount * 8);
  const summary =
    items.length === 0
      ? locale === 'zh-CN'
        ? '结构完整，AI 味风险较低；如果要更稳定，可继续增加商业落点和版式细节。'
        : 'The structure is complete with low AI-taste risk. Add business context and layout details for more control.'
      : locale === 'zh-CN'
        ? `发现 ${items.length} 个可优化点，AI 味风险 ${aiTasteLevel === 'high' ? '偏高' : aiTasteLevel === 'medium' ? '中等' : '较低'}，优先处理红色警告项。`
        : `${items.length} improvement point${items.length === 1 ? '' : 's'} found. AI-taste risk is ${aiTasteLevel}. Fix warnings first.`;

  return {
    score,
    aiTasteScore,
    aiTasteLevel,
    summary,
    items: items.length
      ? items
      : [
          createItem(locale, {
            id: 'structure-ok',
            severity: 'ok',
            zh: [
              '结构完整',
              '主体、构图、场景、镜头和光线都有明确描述。',
              '可以生成，或继续加入更具体的材质和版式细节。'
            ],
            en: [
              'Structure looks complete',
              'Subject, composition, scene, camera, and lighting are clearly described.',
              'Generate now, or add more material and layout details for tighter control.'
            ]
          })
        ],
    missingSlots
  };
}
