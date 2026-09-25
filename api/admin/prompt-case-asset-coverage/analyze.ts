import { type SupabaseClient } from '@supabase/supabase-js';
import { getCorsHeadersForRequest } from '../../utils/auth';
import { assertPromptCaseAdmin, getSupabaseAdmin } from '../prompt-case-auth';

export const config = { runtime: 'edge' };

const SLOT_ORDER = [
  'character',
  'expression',
  'hairstyle',
  'pose',
  'top',
  'bottom',
  'outfit',
  'onePiece',
  'shoes',
  'background',
  'productSubject',
  'productSurface',
  'composition',
  'titleArea',
  'style',
  'lighting',
  'visualEffect',
  'layoutDesign',
  'accessory',
  'prop',
  'lens',
  'shot',
  'makeup'
];
const COMMERCIAL_GAP_SLOTS = new Set([
  'productSubject',
  'productSurface',
  'composition',
  'titleArea'
]);
const COMMERCIAL_CASE_CATEGORIES = new Set([
  'ecommerce',
  'poster',
  'wechat-cover',
  'background',
  'featured'
]);
const COMMERCIAL_RECIPE_SLOTS = new Set([
  'productSubject',
  'productSurface',
  'composition',
  'titleArea'
]);
const PORTRAIT_ONLY_SLOTS = new Set([
  'character',
  'expression',
  'pose',
  'top',
  'bottom',
  'shoes',
  'makeup'
]);
const RECIPE_SLOT_POLICIES = {
  product: {
    maxAssets: 8,
    slots: [
      'productSubject',
      'productSurface',
      'composition',
      'titleArea',
      'background',
      'style',
      'lighting',
      'layoutDesign',
      'visualEffect',
      'prop',
      'lens',
      'shot'
    ]
  },
  fashion: {
    maxAssets: 8,
    slots: [
      'character',
      'expression',
      'pose',
      'top',
      'bottom',
      'shoes',
      'background',
      'style',
      'lighting',
      'shot',
      'lens',
      'accessory',
      'makeup'
    ]
  },
  portrait: {
    maxAssets: 9,
    slots: [
      'character',
      'expression',
      'pose',
      'top',
      'bottom',
      'background',
      'style',
      'lighting',
      'shot',
      'lens',
      'makeup',
      'accessory'
    ]
  },
  character: {
    maxAssets: 8,
    slots: [
      'character',
      'pose',
      'top',
      'bottom',
      'shoes',
      'accessory',
      'prop',
      'background',
      'style',
      'lighting',
      'visualEffect',
      'shot'
    ]
  },
  posterPerson: {
    maxAssets: 8,
    slots: [
      'character',
      'expression',
      'pose',
      'top',
      'background',
      'composition',
      'titleArea',
      'style',
      'lighting',
      'layoutDesign',
      'visualEffect',
      'shot',
      'lens'
    ]
  },
  background: {
    maxAssets: 6,
    slots: [
      'background',
      'style',
      'lighting',
      'visualEffect',
      'lens',
      'layoutDesign',
      'composition',
      'titleArea'
    ]
  }
} as const;

const CASE_FALLBACK_RECIPES = [
  {
    id: 'glass-ecosystem-science',
    categories: ['featured'],
    triggers: [
      '玻璃生态球',
      '温室生态系统',
      '微型温室',
      'ecosystem',
      'greenhouse'
    ],
    selection: {
      productSubject: 'productSubject-glass-ecosystem-sphere',
      productSurface: 'productSurface-clean-commercial-tabletop',
      background: 'background-warm-studio',
      style: 'style-soft-3d-clay',
      lighting: 'lighting-large-softbox',
      layoutDesign: 'layoutDesign-translucent-ui-cards'
    }
  },
  {
    id: 'pisa-forced-perspective-travel',
    categories: ['portrait'],
    triggers: [
      '比萨斜塔',
      '错位摄影',
      '强制透视',
      '冰淇淋甜筒',
      'forced perspective'
    ],
    selection: {
      character: 'character-black-hair-boy',
      expression: 'expression-tongue',
      pose: 'pose-side-lookback',
      background: 'background-summer-beach-07',
      style: 'style-phone-raw-snapshot',
      lighting: 'lighting-golden-hour',
      lens: 'lens-iphone-depth-lockscreen'
    }
  },
  {
    id: 'surreal-meadow-cloud-face',
    categories: ['portrait'],
    triggers: [
      '云之面',
      '云组成的巨大',
      '暴风雨天空',
      '草原青年',
      'surreal fantasy meadow'
    ],
    selection: {
      pose: 'pose-raised-hands',
      background: 'background-garden-path',
      style: 'style-cinematic-rainy-film',
      lighting: 'lighting-soft-backlit',
      visualEffect: [
        'visualEffect-volumetric-haze',
        'visualEffect-subtle-double-exposure'
      ],
      lens: 'lens-anamorphic-cinematic'
    }
  },
  {
    id: 'minimal-3d-earrings-character',
    categories: ['portrait'],
    triggers: ['欣赏耳环', '可爱女性', '3d角色插图', '3d图标', 'earrings'],
    selection: {
      character: 'character-refined-model',
      expression: 'expression-natural-soft-smile',
      pose: 'pose-relaxed-standing',
      background: 'background-warm-studio',
      style: 'style-soft-3d-clay',
      accessory: 'accessory-pearl-earrings'
    }
  },
  {
    id: '2000s-cartoon-portrait-collage',
    categories: ['portrait'],
    triggers: ['2000年代', '卡通风格', '2x3', '拼贴画', 'iconic cartoon'],
    selection: {
      character: 'character-violet-anime-girl',
      expression: 'expression-beaming-smile',
      background: 'background-soft-bedroom',
      style: 'style-retro-pop-album-cover',
      layoutDesign: 'layoutDesign-lookbook-callout-grid',
      visualEffect: ['visualEffect-rgb-split', 'visualEffect-fine-film-grain']
    }
  }
] as const;

const KEY_SLOT_AUGMENTATION_RULES = [
  {
    slot: 'top',
    triggers: [
      '比基尼',
      '泳装',
      '泳衣',
      '吊带',
      '背心',
      '上装',
      '上衣',
      '衬衫',
      '外套',
      '夹克',
      'bikini',
      'swimwear',
      'swimsuit',
      'shirt',
      'jacket',
      'jersey'
    ]
  },
  {
    slot: 'bottom',
    triggers: [
      '比基尼',
      '泳装',
      '泳衣',
      '短裤',
      '热裤',
      '裙',
      '裤',
      '下装',
      'bikini',
      'swimwear',
      'swimsuit',
      'briefs',
      'shorts',
      'skirt',
      'pants'
    ]
  }
] as const;

const MULTI_SELECT_SLOTS = new Set(['accessory', 'prop', 'visualEffect']);
const STOP_TERMS = new Set([
  'prompt',
  'image',
  'photo',
  'portrait',
  'style',
  'with',
  'and',
  'the',
  'for',
  'from',
  'into',
  'near',
  'over',
  'under',
  'on',
  'of',
  'in',
  'to',
  'at',
  'by',
  'as',
  'is',
  'are',
  'be',
  'or',
  'one',
  'two',
  'no',
  'not',
  'ai',
  'gpt',
  'gemini',
  'feature',
  'featured',
  'single',
  'clear',
  'clean',
  'soft',
  'subtle',
  'premium',
  'polished',
  'color',
  'graphic',
  'small',
  'strong',
  'deep',
  '真实',
  '摄影',
  '写真',
  '提示词',
  '生成',
  '一张',
  '画面',
  '主体',
  '风格',
  '高端',
  '质感',
  '女性',
  '角色',
  '成人',
  '明确',
  '真实摄影'
]);

const GAP_RULES = [
  {
    id: 'productSubject-consumer-product-packshot',
    slot: 'productSubject',
    title: '消费品主体',
    subtitle: '商品主视觉本体',
    prompt:
      'single consumer product hero subject, crisp silhouette, clear material and selling-point details, premium ecommerce packshot direction',
    tags: ['产品', '商品', '主图', '包装', '电商'],
    triggers: [
      '产品',
      '商品',
      '主图',
      '电商',
      '耳机',
      '水壶',
      '护肤品',
      '香薰',
      '蜡烛'
    ]
  },
  {
    id: 'productSubject-food-dessert-hero',
    slot: 'productSubject',
    title: '食物甜品主体',
    subtitle: '餐饮商业主角',
    prompt:
      'single food or dessert hero subject, appetizing texture, clean edges, premium commercial food photography subject',
    tags: ['食物', '甜品', '餐饮', '商业摄影'],
    triggers: ['食物', '甜品', '美食', '蛋糕', '挞', '饮品', '餐饮']
  },
  {
    id: 'productSubject-architecture-space-hero',
    slot: 'productSubject',
    title: '建筑空间主体',
    subtitle: '空间视觉焦点',
    prompt:
      'architectural or spatial hero subject, clear structural silhouette, premium design visualization focus, readable volume and material',
    tags: ['建筑', '空间', '舞台', '结构', '场景主体'],
    triggers: ['建筑', '空间', '舞台', '图书馆', '展台', '室内设计']
  },
  {
    id: 'productSurface-clean-commercial-tabletop',
    slot: 'productSurface',
    title: '干净商业台面',
    subtitle: '产品承托环境',
    prompt:
      'clean commercial tabletop or display surface, neutral premium material, subtle supporting props, product remains dominant',
    tags: ['台面', '展示', '商业', '产品摄影'],
    triggers: [
      '产品',
      '商品',
      '电商',
      '主图',
      '台面',
      '商品摄影',
      '护肤品',
      '香薰',
      '蜡烛',
      '美食'
    ]
  },
  {
    id: 'composition-ecommerce-kv-hero',
    slot: 'composition',
    title: '电商 KV 构图',
    subtitle: '大主体卖点图',
    prompt:
      'ecommerce key visual composition, large clear hero subject, controlled negative space, direct selling-point hierarchy',
    tags: ['电商', 'KV', '主图', '卖点', '广告'],
    triggers: ['电商', '主图', 'KV', '广告', '商品', '卖点', '宣发']
  },
  {
    id: 'titleArea-cover-copy-safe-zone',
    slot: 'titleArea',
    title: '封面标题安全区',
    subtitle: '文案留白结构',
    prompt:
      'cover composition with a clear title safe area, intentional blank space, readable copy zone, clean editorial hierarchy',
    tags: ['封面', '标题', '留白', '文案', '公众号'],
    triggers: ['封面', '公众号', '海报', '标题', '留白', '文案', '信息区']
  },
  {
    id: 'style-live-action-anime-cosplay-editorial',
    slot: 'style',
    title: '真人化 ACG 写真',
    subtitle: '动漫角色转写实摄影',
    prompt:
      'live-action anime character editorial portrait style, realistic human model interpretation, polished cosplay-inspired fashion photography without cheap costume feel',
    tags: ['真人化', 'ACG', 'cosplay', '写实', '角色'],
    triggers: ['真人化', 'cosplay', '动漫', '日漫', 'ACG', '二次元', '指定角色']
  },
  {
    id: 'style-phone-raw-snapshot',
    slot: 'style',
    title: '手机 RAW 快照',
    subtitle: '社交平台随手拍',
    prompt:
      'raw smartphone snapshot aesthetic, casual social media photo, natural imperfect framing, realistic handheld capture',
    tags: ['手机', 'RAW', '快照', '社交平台', '真实'],
    triggers: ['手机写真', '手机快照', 'RAW', '社交平台', 'iPhone', '自拍']
  },
  {
    id: 'style-neon-open-world-poster',
    slot: 'style',
    title: '霓虹开放世界海报',
    subtitle: '夜景游戏封面感',
    prompt:
      'neon open-world promotional poster style, saturated nightlife colors, glossy game-cover energy, cinematic urban advertising look',
    tags: ['霓虹', '游戏封面', '开放世界', '宣传海报'],
    triggers: ['GTA', '迈阿密', '开放世界', '霓虹', '锁屏壁纸']
  },
  {
    id: 'background-premium-fitting-room',
    slot: 'background',
    title: '高级试衣间',
    subtitle: '镜面与暖光更衣空间',
    prompt:
      'premium fashion fitting room with tall mirror, warm indirect lighting, clean wardrobe wall, boutique dressing suite background, no people',
    tags: ['试衣间', '镜面', '服装', '室内', '暖光'],
    triggers: ['试衣间', '试穿会', '镜面自拍', '穿着确认照']
  },
  {
    id: 'background-clean-bathroom-vanity',
    slot: 'background',
    title: '高级浴室镜台',
    subtitle: '干净浴室与镜面自拍背景',
    prompt:
      'clean premium bathroom vanity with large mirror, soft neutral tiles, warm hotel lighting, elegant private interior background, no people',
    tags: ['浴室', '镜子', '室内', '酒店', '自拍'],
    triggers: ['浴室', '浴缸', '镜面', '洗手台']
  },
  {
    id: 'background-esports-bedroom',
    slot: 'background',
    title: '电竞卧室',
    subtitle: '桌面设备与氛围灯',
    prompt:
      'modern esports bedroom with gaming desk, monitor glow, LED ambient lighting, tidy personal room background, no people',
    tags: ['电竞', '卧室', '游戏', '氛围灯', '室内'],
    triggers: ['电竞房', '游戏房', '机甲驾驶舱', '游戏UI', '显示器']
  },
  {
    id: 'background-fantasy-teahouse',
    slot: 'background',
    title: '异世界茶屋',
    subtitle: '茶屋甜品店生活场景',
    prompt:
      'cozy fantasy teahouse dessert shop interior, warm wooden tables, soft lanterns, pastry display, gentle slice-of-life mood, no people',
    tags: ['茶屋', '甜品店', '幻想', '室内', '生活感'],
    triggers: ['茶屋', '甜品店', '料理店', '异世界']
  },
  {
    id: 'background-luxury-brand-event',
    slot: 'background',
    title: '品牌宣发现场',
    subtitle: '发布会与商业大片背景',
    prompt:
      'premium brand launch event background, clean stage lighting, subtle logo-free display wall, commercial campaign atmosphere, no people',
    tags: ['品牌', '宣发', '商业', '发布会', '影棚'],
    triggers: ['品牌宣发', '宣传海报', '商业海报', 'KV', '广告']
  },
  {
    id: 'pose-mirror-selfie',
    slot: 'pose',
    title: '镜面自拍姿态',
    subtitle: '一手持手机',
    prompt:
      'mirror selfie pose, one hand holding phone near face, relaxed fashion fitting posture, natural body angle',
    tags: ['自拍', '镜面', '手机', '姿态'],
    triggers: ['镜面自拍', '自拍', '手机拍下', '确认照']
  },
  {
    id: 'pose-seated-relaxed',
    slot: 'pose',
    title: '松弛坐姿',
    subtitle: '地面或床边自然坐姿',
    prompt:
      'relaxed seated pose, natural knees and arms placement, casual lifestyle portrait body language',
    tags: ['坐姿', '松弛', '生活方式'],
    triggers: ['坐在', '坐姿', '床上', '地面', '沙发']
  },
  {
    id: 'shot-phone-mirror-selfie',
    slot: 'shot',
    title: '手机镜面自拍',
    subtitle: '真实近距离构图',
    prompt:
      'smartphone mirror selfie framing, close vertical composition, phone partly visible, candid dressing room perspective',
    tags: ['手机', '镜面', '自拍', '近景'],
    triggers: ['镜面自拍', '手机自拍', '手机拍下', 'RAW 照片']
  },
  {
    id: 'lens-iphone-depth-lockscreen',
    slot: 'lens',
    title: 'iPhone 景深锁屏',
    subtitle: '主体边缘清晰',
    prompt:
      'iPhone depth-effect lock screen composition, clean subject separation, crisp silhouette edges, mobile wallpaper perspective',
    tags: ['iPhone', '景深', '锁屏', '手机'],
    triggers: ['iPhone', '景深锁屏', '锁屏壁纸']
  },
  {
    id: 'layoutDesign-social-lockscreen-depth',
    slot: 'layoutDesign',
    title: '锁屏景深构图',
    subtitle: '前景人物与时间区留白',
    prompt:
      'mobile lock screen depth layout, strong foreground subject separation, clear top time area, vertical wallpaper composition',
    tags: ['锁屏', '景深', '壁纸', '留白'],
    triggers: ['锁屏', '壁纸', '景深效果']
  },
  {
    id: 'layoutDesign-brand-campaign-poster',
    slot: 'layoutDesign',
    title: '品牌宣发海报',
    subtitle: '商业 KV 版式',
    prompt:
      'brand campaign key visual layout, bold headline zone, polished commercial poster hierarchy, premium social advertising composition',
    tags: ['品牌', 'KV', '海报', '商业'],
    triggers: ['品牌宣发', '宣传海报', 'KV', '广告', '海报大片']
  },
  {
    id: 'character-silver-fantasy-mage',
    slot: 'character',
    title: '银发幻想法师',
    subtitle: '冷静魔法师气质',
    prompt:
      'adult silver-haired fantasy mage heroine, calm intelligent expression, refined magical traveler styling, original non-IP character archetype',
    tags: ['幻想', '银发', '法师', '角色', '原创'],
    triggers: ['芙莉莲', '魔法', '法师', '幻想']
  },
  {
    id: 'character-twintail-magical-heroine',
    slot: 'character',
    title: '双马尾魔法少女',
    subtitle: '明亮经典偶像感',
    prompt:
      'adult twin-tail magical heroine archetype, bright hopeful expression, elegant fantasy idol styling, original non-IP character design',
    tags: ['魔法少女', '双马尾', '偶像', '原创'],
    triggers: ['月野兔', '魔法少女', '双马尾']
  },
  {
    id: 'character-blue-fantasy-adept',
    slot: 'character',
    title: '蓝发仙术少女',
    subtitle: '东方幻想角色',
    prompt:
      'adult blue-haired eastern fantasy adept heroine, elegant calm face, refined celestial costume language, original non-IP character archetype',
    tags: ['东方幻想', '蓝发', '仙术', '原创'],
    triggers: ['甘雨', '原神', '仙侠', '仙术']
  },
  {
    id: 'top-premium-cosplay-jacket',
    slot: 'top',
    title: '高级角色感外套',
    subtitle: '非廉价 cosplay 质感',
    prompt:
      'premium character-inspired fashion jacket, tailored fantasy details, elegant cosplay-inspired styling without cheap costume texture',
    tags: ['cosplay', '角色服装', '外套', '高级'],
    triggers: ['cosplay', '角色服装', '代表色', '标志性服装']
  },
  {
    id: 'accessory-character-symbol-pins',
    slot: 'accessory',
    title: '角色符号发饰',
    subtitle: '可替换世界观符号',
    prompt:
      'small character-symbol hair accessories and pins, subtle fantasy motif accents, polished wearable detail',
    tags: ['发饰', '符号', '角色', '世界观'],
    triggers: ['标志性饰品', '世界观符号', '代表色', '发饰']
  },
  {
    id: 'expression-natural-soft-smile',
    slot: 'expression',
    title: '自然柔和微笑',
    subtitle: '亲近轻松表情',
    prompt:
      'natural soft smile expression reference, relaxed eyes, friendly approachable portrait mood, reusable expression asset',
    tags: ['微笑', '自然', '亲近', '元气', '表情'],
    triggers: ['微笑', '笑容', '嘴角', '元气', '亲近', '甜甜笑意']
  },
  {
    id: 'expression-coy-downward-gaze',
    slot: 'expression',
    title: '低头暧昧眼神',
    subtitle: '下看镜头与轻微撒娇',
    prompt:
      'coy downward gaze expression reference, eyes looking slightly down toward camera, subtle playful intimacy, reusable expression asset',
    tags: ['暧昧', '低头', '撒娇', '眼神', '表情'],
    triggers: ['眼神暧昧', '向下看镜头', '下看镜头', '撒娇', '头部低下']
  },
  {
    id: 'pose-low-angle-forward-lean',
    slot: 'pose',
    title: '低机位前探',
    subtitle: '靠近镜头互动姿态',
    prompt:
      'low-angle forward-lean pose reference, subject naturally leaning toward camera, knees or hands in foreground, interactive portrait body language',
    tags: ['低机位', '前探', '互动', '姿态'],
    triggers: ['低机位', '仰拍', '前探', '靠近镜头', '身体自然前倾']
  },
  {
    id: 'top-sculptural-silver-raincoat',
    slot: 'top',
    title: '雕塑感银色雨衣',
    subtitle: '反光未来感外套',
    prompt:
      'sculptural silver raincoat fashion garment, reflective waterproof material, dramatic editorial silhouette, no logo',
    tags: ['银色雨衣', '反光', '时尚大片', '外套'],
    triggers: ['银色雨衣', '反光水面', '雨衣', '高级时尚大片']
  },
  {
    id: 'background-reflective-shallow-water-dusk',
    slot: 'background',
    title: '黄昏浅水反光',
    subtitle: '时尚大片水面场景',
    prompt:
      'minimal reflective shallow water fashion editorial background at dusk, distant concrete pavilion, cyan coral sky, no people, no logo',
    tags: ['浅水', '反光', '黄昏', '时尚大片'],
    triggers: ['反光水面', '黄昏浅水', '黄昏天空', '浅水中', '混凝土亭']
  },
  {
    id: 'background-urban-laundromat-night',
    slot: 'background',
    title: '都市自助洗衣房',
    subtitle: '夜晚玻璃窗与滚筒机',
    prompt:
      'urban self-service laundromat at night, washing machines, glass window reflections, soft casual lifestyle lighting, no people',
    tags: ['洗衣房', '都市生活', '玻璃窗', '夜晚'],
    triggers: ['自助洗衣房', '滚筒洗衣机', '夜晚玻璃窗', '洗衣房']
  },
  {
    id: 'top-cropped-tank-denim-shorts',
    slot: 'top',
    title: '短背心牛仔热裤',
    subtitle: '元气生活感穿搭',
    prompt:
      'cropped fitted tank top with light shirt layer and denim shorts outfit reference, fresh casual youthful styling',
    tags: ['短背心', '牛仔短裤', '清爽', '生活感'],
    triggers: ['短款背心', '牛仔短裤', '轻薄衬衫', '元气', '清爽']
  },
  {
    id: 'top-football-fan-jersey',
    slot: 'top',
    title: '足球应援球衣',
    subtitle: '世界杯甜酷穿搭',
    prompt:
      'stylish football fan jersey outfit reference, cropped sporty top, energetic social media portrait styling, no logos',
    tags: ['足球', '球衣', '世界杯', '运动'],
    triggers: ['世界杯', '足球宝贝', '球衣', '足球少女', '足球']
  },
  {
    id: 'prop-small-football-foreground',
    slot: 'prop',
    title: '近景小足球',
    subtitle: '手持前景道具',
    prompt:
      'small football prop held close to camera as foreground focus, clean reusable sports portrait prop, no logos',
    tags: ['足球', '道具', '前景', '世界杯'],
    triggers: ['足球', '小型足球', '贴在脸侧', '前景焦点']
  },
  {
    id: 'productSubject-retro-enamel-toy-robot',
    slot: 'productSubject',
    title: '复古珐琅玩具机器人',
    subtitle: '圆润机器人角色主体',
    prompt:
      'retro teal enamel toy robot hero subject, rounded body silhouette, black panel face, small antenna, brass joints, no logo',
    tags: ['机器人', '玩具', '复古', '珐琅'],
    triggers: ['玩具机器人', '复古机器人', '黑色面板脸', '小天线', '黄铜关节']
  },
  {
    id: 'prop-robot-workbench-tools',
    slot: 'prop',
    title: '机器人工作台道具',
    subtitle: '工具与背包零件',
    prompt:
      'small robot workbench props, brass tools, backpack parts, repair table details, reusable prop asset, no text',
    tags: ['机器人', '工具', '工作台', '零件'],
    triggers: ['背包工具', '工作台道具', '黄铜关节', '工具']
  },
  {
    id: 'productSubject-glass-ecosystem-sphere',
    slot: 'productSubject',
    title: '玻璃生态球',
    subtitle: '科普视觉核心主体',
    prompt:
      'transparent glass ecosystem sphere hero subject, miniature greenhouse plants inside, scientific educational visual focus, no text',
    tags: ['生态球', '玻璃', '科普', '温室'],
    triggers: ['玻璃生态球', '生态球', 'greenhouse', '科普视觉']
  },
  {
    id: 'background-cozy-reading-nook',
    slot: 'background',
    title: '温暖阅读角',
    subtitle: '书架窗边生活空间',
    prompt:
      'cozy reading nook background, warm window light, bookshelves, comfortable chair, quiet home interior, no people',
    tags: ['阅读角', '书架', '窗边', '温暖'],
    triggers: ['阅读角', '书架', 'reading nook']
  },
  {
    id: 'productSubject-home-fragrance-set',
    slot: 'productSubject',
    title: '家居香氛套装',
    subtitle: '蜡烛与藤条香薰组合',
    prompt:
      'home fragrance product set hero subject, frosted glass candle, amber reed diffuser bottle, ceramic match jar, no label, no text',
    tags: ['香薰', '蜡烛', '家居香氛', '商品'],
    triggers: [
      '香薰蜡烛',
      '藤条香薰',
      '磨砂玻璃蜡烛',
      '琥珀色藤条香薰瓶',
      '家居香氛'
    ]
  },
  {
    id: 'productSurface-linen-spa-tabletop',
    slot: 'productSurface',
    title: '亚麻 SPA 台面',
    subtitle: '香氛产品承托面',
    prompt:
      'linen spa tabletop product surface, lavender and eucalyptus accents, warm window light, calm premium home fragrance setting',
    tags: ['亚麻', 'SPA', '台面', '香氛'],
    triggers: ['米色亚麻', '薰衣草', '尤加利', 'spa', '暖光']
  }
];

type DbRecord = Record<string, unknown>;

function jsonResponse(
  data: unknown,
  corsHeaders: Record<string, string>,
  status = 200
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders }
  });
}

function normalizeText(value: unknown) {
  return String(value || '')
    .toLowerCase()
    .replace(/[，。；：、（）【】《》“”]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasCjk(value: string) {
  return /[\u3400-\u9fff]/.test(value);
}

function isAsciiTerm(value: string) {
  return /^[a-z0-9]+$/.test(value);
}

function termMatches(text: string, term: string) {
  if (!term) return false;
  if (hasCjk(term)) return text.includes(term);
  if (isAsciiTerm(term)) {
    if (term.length <= 2) return false;
    return new RegExp(`(^|[^a-z0-9])${escapeRegExp(term)}([^a-z0-9]|$)`).test(
      text
    );
  }
  return text.includes(term);
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
}

function caseText(caseItem: DbRecord) {
  return normalizeText(
    [
      caseItem.title,
      caseItem.title_zh,
      caseItem.title_en,
      caseItem.category,
      JSON.stringify(caseItem.tags || []),
      caseItem.prompt_preview,
      caseItem.prompt_preview_zh,
      caseItem.prompt_preview_en,
      caseItem.prompt,
      caseItem.prompt_zh,
      caseItem.prompt_en
    ]
      .filter(Boolean)
      .join(' ')
  );
}

function assetTerms(asset: DbRecord) {
  const rawTerms = [
    asset.id,
    asset.title,
    asset.subtitle,
    asset.prompt,
    asset.negative_prompt,
    ...normalizeStringArray(asset.tags)
  ]
    .filter(Boolean)
    .flatMap((value) =>
      String(value)
        .split(/[\s,，、/|()（）【】《》:：;；.-]+/g)
        .map((term) => term.trim())
    )
    .filter(Boolean);
  return Array.from(
    new Set(
      rawTerms
        .map((term) => normalizeText(term))
        .filter(
          (term) =>
            term.length >= 2 && !STOP_TERMS.has(term) && !/^[0-9]+$/.test(term)
        )
    )
  );
}

function scoreAsset(text: string, asset: DbRecord) {
  let score = 0;
  const hits: string[] = [];
  for (const term of assetTerms(asset)) {
    if (termMatches(text, term)) {
      score += term.length >= 4 ? 2 : 1;
      hits.push(term);
    }
  }
  return { score, hits: hits.slice(0, 8) };
}

function countKeywordHits(text: string, keywords: string[]) {
  return keywords.reduce(
    (count, keyword) => count + (text.includes(normalizeText(keyword)) ? 1 : 0),
    0
  );
}

function commercialIntentScore(text: string) {
  return countKeywordHits(text, [
    '产品',
    '商品',
    '主图',
    '广告',
    'KV',
    '封面',
    '海报',
    '标题',
    '公众号',
    '文案',
    '留白',
    '美食',
    '甜品',
    '水壶',
    '护肤',
    '香薰',
    '蜡烛',
    '建筑',
    '图书馆',
    '舞台',
    'brand',
    'product',
    'packshot',
    'advertising',
    'poster',
    'cover',
    'title',
    'copy',
    'food',
    'dessert',
    'architecture'
  ]);
}

function productIntentScore(text: string) {
  return countKeywordHits(text, [
    '产品',
    '商品',
    '主图',
    '电商',
    '商品摄影',
    '产品摄影',
    '包装',
    '包装盒',
    '护肤',
    '香薰',
    '蜡烛',
    '耳机',
    '水壶',
    '键盘',
    '背包',
    '香水',
    '饮品',
    '咖啡',
    '茶饮',
    '美食',
    '甜品',
    '瓶',
    '罐',
    'packshot',
    'product',
    'ecommerce',
    'skincare',
    'perfume',
    'packaging',
    'bottle',
    'keyboard',
    'backpack'
  ]);
}

function personIntentScore(text: string) {
  return countKeywordHits(text, [
    '人像',
    '写真',
    '女子',
    '少女',
    '美女',
    '女性',
    '角色',
    'cosplay',
    '自拍',
    'portrait',
    'girl',
    'woman',
    'female',
    'character',
    'selfie'
  ]);
}

function strongPersonIntentScore(text: string) {
  return countKeywordHits(text, [
    '人像',
    '写真',
    '自拍',
    '少女',
    '女孩',
    '女子',
    '美女',
    '女性',
    '女主',
    '女仆',
    '汉服',
    'cosplay',
    'portrait',
    'selfie',
    'girl',
    'woman',
    'female',
    'maid',
    'model'
  ]);
}

function shouldUseCommercialSlots(category: unknown, text: string) {
  const commercialScore = commercialIntentScore(text);
  const personScore = personIntentScore(text);
  return (
    COMMERCIAL_CASE_CATEGORIES.has(String(category || '')) &&
    (commercialScore >= 2 || (commercialScore >= 1 && personScore === 0))
  );
}

function shouldSuppressPortraitSlots(category: unknown, text: string) {
  if (!shouldUseCommercialSlots(category, text)) return false;
  const commercialScore = commercialIntentScore(text);
  const personScore = personIntentScore(text);
  return commercialScore >= 2 && personScore <= 1;
}

function recipeSlotPolicy(category: unknown, text: string) {
  const normalizedCategory = String(category || '');
  const productScore = productIntentScore(text);
  const strongPersonScore = strongPersonIntentScore(text);
  if (normalizedCategory === 'ecommerce') {
    if (productScore >= 2 && strongPersonScore < 2) {
      return RECIPE_SLOT_POLICIES.product;
    }
    return strongPersonScore > 0
      ? RECIPE_SLOT_POLICIES.fashion
      : RECIPE_SLOT_POLICIES.background;
  }
  if (normalizedCategory === 'fashion') return RECIPE_SLOT_POLICIES.fashion;
  if (normalizedCategory === 'portrait') return RECIPE_SLOT_POLICIES.portrait;
  if (normalizedCategory === 'character') return RECIPE_SLOT_POLICIES.character;
  if (
    ['poster', 'cover', 'xiaohongshu', 'wechat-cover', 'featured'].includes(
      normalizedCategory
    )
  ) {
    if (productScore >= 2 && strongPersonScore < 2) {
      return RECIPE_SLOT_POLICIES.product;
    }
    if (strongPersonScore > 0) return RECIPE_SLOT_POLICIES.posterPerson;
    return RECIPE_SLOT_POLICIES.background;
  }
  if (normalizedCategory === 'background')
    return RECIPE_SLOT_POLICIES.background;
  return null;
}

function pruneSelectionByPolicy(
  selection: Record<string, unknown>,
  matches: Array<Record<string, unknown>>,
  policy:
    | (typeof RECIPE_SLOT_POLICIES)[keyof typeof RECIPE_SLOT_POLICIES]
    | null
) {
  if (!policy) return { selection, matches };
  const nextSelection: Record<string, unknown> = {};
  const nextMatches: Array<Record<string, unknown>> = [];
  let selectedAssetCount = 0;

  for (const slot of policy.slots) {
    const value = selection[slot];
    if (!value) continue;
    const values = Array.isArray(value) ? value : [value];
    if (selectedAssetCount + values.length > policy.maxAssets) continue;
    nextSelection[slot] = value;
    selectedAssetCount += values.length;
    nextMatches.push(...matches.filter((match) => match.slot === slot));
  }

  return { selection: nextSelection, matches: nextMatches };
}

function buildAssetById(assetsBySlot: Map<string, DbRecord[]>) {
  const assetById = new Map<string, DbRecord>();
  for (const assets of assetsBySlot.values()) {
    for (const asset of assets) assetById.set(String(asset.id), asset);
  }
  return assetById;
}

function fallbackSelectionForCase(
  text: string,
  category: unknown,
  assetsBySlot: Map<string, DbRecord[]>
) {
  const normalizedCategory = String(category || '');
  const rule = CASE_FALLBACK_RECIPES.find((item) => {
    if (!item.categories.includes(normalizedCategory as never)) return false;
    return item.triggers.some((trigger) =>
      text.includes(normalizeText(trigger))
    );
  });
  if (!rule) return null;

  const assetById = buildAssetById(assetsBySlot);
  const selection: Record<string, unknown> = {};
  const matches: Array<Record<string, unknown>> = [];

  for (const [slot, rawValue] of Object.entries(rule.selection)) {
    const requestedIds = Array.isArray(rawValue) ? rawValue : [rawValue];
    const validIds = requestedIds.filter((assetId) =>
      assetById.has(String(assetId))
    );
    if (validIds.length === 0) continue;
    selection[slot] = Array.isArray(rawValue) ? validIds : validIds[0];
    matches.push(
      ...validIds.map((assetId) => {
        const asset = assetById.get(String(assetId)) || {};
        return {
          slot,
          assetId,
          title: asset.title,
          thumbnailUrl: asset.thumbnail_url,
          score: 2,
          hits: [`fallback:${rule.id}`]
        };
      })
    );
  }

  return Object.keys(selection).length > 0 ? { selection, matches } : null;
}

function recipeAssetIds(selection: Record<string, unknown>) {
  return Object.values(selection || {}).flatMap((value) =>
    Array.isArray(value) ? value : value ? [value] : []
  );
}

function selectionHasSlot(selection: Record<string, unknown>, slot: string) {
  return recipeAssetIds({ [slot]: selection?.[slot] }).length > 0;
}

function slotNeedsAugmentation(text: string, slot: string) {
  const rule = KEY_SLOT_AUGMENTATION_RULES.find((item) => item.slot === slot);
  if (!rule) return false;
  return rule.triggers.some((trigger) =>
    termMatches(text, normalizeText(trigger))
  );
}

function matchHasAugmentationTrigger(
  match: Record<string, unknown>,
  rule: (typeof KEY_SLOT_AUGMENTATION_RULES)[number]
) {
  const hits = Array.isArray(match.hits) ? match.hits : [];
  return hits.some((hit) =>
    rule.triggers.some(
      (trigger) => normalizeText(String(hit)) === normalizeText(trigger)
    )
  );
}

function augmentExistingSelection({
  existingSelection,
  matchedSelection,
  matches,
  text
}: {
  existingSelection: Record<string, unknown>;
  matchedSelection: Record<string, unknown>;
  matches: Array<Record<string, unknown>>;
  text: string;
}) {
  const selection = { ...existingSelection };
  const augmentationMatches: Array<Record<string, unknown>> = [];

  for (const rule of KEY_SLOT_AUGMENTATION_RULES) {
    if (selectionHasSlot(selection, rule.slot)) continue;
    if (!slotNeedsAugmentation(text, rule.slot)) continue;
    const value = matchedSelection?.[rule.slot];
    if (!value) continue;
    const slotMatches = matches.filter(
      (match) =>
        match.slot === rule.slot && matchHasAugmentationTrigger(match, rule)
    );
    if (slotMatches.length === 0) continue;
    selection[rule.slot] = value;
    augmentationMatches.push(
      ...slotMatches.map((match) => ({
        ...match,
        hits: [
          ...((match.hits as unknown[]) || []),
          'augmentation:missing-key-slot'
        ]
      }))
    );
  }

  return {
    selection,
    augmentationMatches,
    wasAugmented:
      recipeAssetIds(selection).length >
      recipeAssetIds(existingSelection).length
  };
}

function existingRecipeSelection(caseItem: DbRecord) {
  const recipe = caseItem.visual_recipe;
  if (!recipe || typeof recipe !== 'object' || Array.isArray(recipe)) return {};
  const selection = (recipe as Record<string, unknown>).selection;
  return selection && typeof selection === 'object' && !Array.isArray(selection)
    ? (selection as Record<string, unknown>)
    : {};
}

function matchAssets(
  text: string,
  assetsBySlot: Map<string, DbRecord[]>,
  category: unknown
) {
  const selection: Record<string, unknown> = {};
  const matches: Array<Record<string, unknown>> = [];
  const useCommercialSlots = shouldUseCommercialSlots(category, text);
  const suppressPortraitSlots = shouldSuppressPortraitSlots(category, text);
  for (const slot of SLOT_ORDER) {
    if (COMMERCIAL_RECIPE_SLOTS.has(slot) && !useCommercialSlots) continue;
    if (PORTRAIT_ONLY_SLOTS.has(slot) && suppressPortraitSlots) continue;
    const scored = (assetsBySlot.get(slot) || [])
      .map((asset) => ({ asset, ...scoreAsset(text, asset) }))
      .filter((item) => item.score > 0)
      .sort(
        (a, b) =>
          b.score - a.score ||
          String(a.asset.id).localeCompare(String(b.asset.id))
      );
    const max = MULTI_SELECT_SLOTS.has(slot) ? 2 : 1;
    const picked = scored.slice(0, max).filter((item) => item.score >= 2);
    if (picked.length === 0) continue;
    selection[slot] = MULTI_SELECT_SLOTS.has(slot)
      ? picked.map((item) => item.asset.id)
      : picked[0].asset.id;
    matches.push(
      ...picked.map((item) => ({
        slot,
        assetId: item.asset.id,
        title: item.asset.title,
        thumbnailUrl: item.asset.thumbnail_url,
        score: item.score,
        hits: item.hits
      }))
    );
  }
  const pruned = pruneSelectionByPolicy(
    selection,
    matches,
    recipeSlotPolicy(category, text)
  );
  if (Object.keys(pruned.selection).length > 0) return pruned;
  return fallbackSelectionForCase(text, category, assetsBySlot) || pruned;
}

function detectGaps(
  text: string,
  matchedSelection: Record<string, unknown>,
  existingAssetIds: Set<string>,
  category: unknown
) {
  const matchedIds = new Set(recipeAssetIds(matchedSelection).map(String));
  const matchedSlots = new Set(Object.keys(matchedSelection));
  return GAP_RULES.filter((rule) => {
    if (
      COMMERCIAL_GAP_SLOTS.has(rule.slot) &&
      !COMMERCIAL_CASE_CATEGORIES.has(String(category || ''))
    ) {
      return false;
    }
    if (existingAssetIds.has(rule.id)) return false;
    if (matchedIds.has(rule.id)) return false;
    if (
      !rule.triggers.some((trigger) => text.includes(normalizeText(trigger)))
    ) {
      return false;
    }
    const slotAlreadyHasStrongGeneric =
      matchedSlots.has(rule.slot) &&
      ![
        'background',
        'style',
        'layoutDesign',
        'character',
        'expression',
        'pose',
        'top',
        'productSubject',
        'productSurface',
        'prop'
      ].includes(rule.slot);
    return !slotAlreadyHasStrongGeneric;
  }).map((rule) => ({
    id: rule.id,
    slot: rule.slot,
    title: rule.title,
    subtitle: rule.subtitle,
    prompt: rule.prompt,
    tags: rule.tags,
    triggers: rule.triggers.filter((trigger) =>
      text.includes(normalizeText(trigger))
    )
  }));
}

function scoreCase(caseItem: DbRecord) {
  return (
    Number(caseItem.generate_count || 0) * 5 +
    Number(caseItem.copy_count || 0) * 2 +
    Number(caseItem.view_count || 0)
  );
}

function uniqueRowsById(rows: DbRecord[]) {
  const seen = new Set<string>();
  const unique: DbRecord[] = [];
  for (const row of rows) {
    const id = String(row?.id || '');
    if (!id || seen.has(id)) continue;
    seen.add(id);
    unique.push(row);
  }
  return unique;
}

function summarizeCase(
  caseItem: DbRecord,
  assetsBySlot: Map<string, DbRecord[]>,
  existingAssetIds: Set<string>
) {
  const text = caseText(caseItem);
  const existingSelection = existingRecipeSelection(caseItem);
  const hasExistingRecipe = recipeAssetIds(existingSelection).length > 0;
  const { selection, matches } = matchAssets(
    text,
    assetsBySlot,
    caseItem.category
  );
  const augmented = hasExistingRecipe
    ? augmentExistingSelection({
        existingSelection,
        matchedSelection: selection,
        matches,
        text
      })
    : null;
  const effectiveSelection = hasExistingRecipe
    ? augmented?.selection || existingSelection
    : selection;
  const missingAssetSuggestions = detectGaps(
    text,
    effectiveSelection,
    existingAssetIds,
    caseItem.category
  );
  return {
    id: caseItem.id,
    slug: caseItem.slug,
    title: caseItem.title || caseItem.title_zh || caseItem.title_en || '',
    category: caseItem.category,
    popularity: {
      score: scoreCase(caseItem),
      views: Number(caseItem.view_count || 0),
      copies: Number(caseItem.copy_count || 0),
      generates: Number(caseItem.generate_count || 0)
    },
    hasExistingRecipe,
    recipeWasAugmented: Boolean(augmented?.wasAugmented),
    suggestedSelection: effectiveSelection,
    matchedAssets: hasExistingRecipe
      ? augmented?.augmentationMatches || []
      : matches,
    missingAssetSuggestions,
    coverageScore:
      recipeAssetIds(effectiveSelection).length +
      Math.max(0, 4 - missingAssetSuggestions.length) +
      (hasExistingRecipe ? 3 : 0),
    promptSnippet: text.slice(0, 320)
  };
}

function gridForAssetCount(count: number) {
  if (count <= 4) return { columns: Math.max(1, count), rows: 1 };
  if (count === 6) return { columns: 3, rows: 2 };
  if (count === 8) return { columns: 4, rows: 2 };
  if (count === 9) return { columns: 3, rows: 3 };
  if (count === 10) return { columns: 5, rows: 2 };
  if (count === 12) return { columns: 4, rows: 3 };
  if (count === 15) return { columns: 5, rows: 3 };
  if (count === 16) return { columns: 4, rows: 4 };
  return { columns: count, rows: 1 };
}

function buildBatchDrafts(missingSuggestions: Array<Record<string, unknown>>) {
  const bySlot = new Map<string, Map<string, Record<string, unknown>>>();
  for (const suggestion of missingSuggestions) {
    const slot = String(suggestion.slot || '');
    const id = String(suggestion.id || '');
    if (!slot || !id) continue;
    if (!bySlot.has(slot)) bySlot.set(slot, new Map());
    bySlot.get(slot)?.set(id, suggestion);
  }

  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return [...bySlot.entries()].map(([slot, itemsById]) => {
    const assets = [...itemsById.values()].slice(0, 16);
    const { columns, rows } = gridForAssetCount(assets.length);
    return {
      id: `${slot}-case-gap-${date}`,
      slot,
      grid: { columns, rows },
      size: '2048x2048',
      outputSize: 768,
      prompt: `Create a ${columns}x${rows} contact sheet for a WebToMind AI image prompt asset library. Slot: ${slot}. Create reusable, non-IP-specific visual assets based on the listed titles. Each cell must be clearly separated, centered, polished, no text, no numbers, no logos, no watermark.`,
      assets: assets.map((asset) => ({
        id: asset.id,
        slot: asset.slot,
        title: asset.title,
        subtitle: asset.subtitle,
        prompt: asset.prompt,
        tags: asset.tags || []
      })),
      notes: []
    };
  });
}

async function readAssets(sb: SupabaseClient) {
  const { data, error } = await sb
    .from('prompt_assets')
    .select(
      'id, slot, title, subtitle, prompt, negative_prompt, tags, thumbnail_url'
    )
    .eq('is_published', true)
    .order('slot', { ascending: true })
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data || [];
}

async function readCases(
  sb: SupabaseClient,
  input: {
    caseId?: string;
    caseQuery?: string;
    limit: number;
    includeRecipes: boolean;
    includeUnpublished: boolean;
  }
) {
  const selectFields =
    'id, slug, title, title_zh, title_en, category, tags, view_count, copy_count, generate_count, prompt, prompt_zh, prompt_en, prompt_preview, prompt_preview_zh, prompt_preview_en, visual_recipe, created_at';

  const queryText = String(input.caseQuery || input.caseId || '').trim();
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      queryText
    );

  if (queryText) {
    let singleQuery = sb
      .from('prompt_cases')
      .select(selectFields)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (!input.includeUnpublished) {
      singleQuery = singleQuery.eq('is_published', true);
    }

    if (isUuid) {
      singleQuery = singleQuery.eq('id', queryText).limit(1);
    } else {
      singleQuery = singleQuery.limit(300);
    }

    const { data, error } = await singleQuery;
    if (error) throw error;

    const normalizedQuery = normalizeText(queryText);
    const filtered = uniqueRowsById(data || []).filter((item) => {
      if (isUuid) return true;
      const slug = normalizeText(item.slug);
      if (slug === normalizedQuery) return true;
      return [
        item.title,
        item.title_zh,
        item.title_en,
        item.prompt_preview,
        item.prompt_preview_zh,
        item.prompt_preview_en
      ]
        .map(normalizeText)
        .some((value) => value.includes(normalizedQuery));
    });

    return filtered
      .filter((item) => {
        if (input.includeRecipes) return true;
        return recipeAssetIds(existingRecipeSelection(item)).length === 0;
      })
      .sort((a, b) => scoreCase(b) - scoreCase(a))
      .slice(0, input.limit);
  }

  let query = sb
    .from('prompt_cases')
    .select(selectFields)
    .is('deleted_at', null)
    .is('source_case_id', null)
    .order('generate_count', { ascending: false })
    .order('view_count', { ascending: false })
    .order('id', { ascending: true })
    .limit(Math.max(input.limit * 3, input.limit));

  if (!input.includeUnpublished) {
    query = query.eq('is_published', true);
  }

  const { data, error } = await query;
  if (error) throw error;
  return uniqueRowsById(data || [])
    .filter((item) => {
      if (input.includeRecipes) return true;
      return recipeAssetIds(existingRecipeSelection(item)).length === 0;
    })
    .sort((a, b) => scoreCase(b) - scoreCase(a))
    .slice(0, input.limit);
}

export default async function handler(request: Request) {
  const corsHeaders = getCorsHeadersForRequest(request);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, corsHeaders, 405);
  }

  const admin = await assertPromptCaseAdmin(request);
  if (!admin.ok) {
    return jsonResponse(
      { error: admin.error || 'Prompt case admin access required' },
      corsHeaders,
      admin.status
    );
  }

  const sb = getSupabaseAdmin();
  if (!sb) {
    return jsonResponse(
      { error: 'Supabase admin is not configured' },
      corsHeaders,
      500
    );
  }

  const input = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const limit = Math.min(Math.max(Number(input.limit || 30) || 30, 1), 100);
  const caseId = typeof input.caseId === 'string' ? input.caseId.trim() : '';
  const caseQuery =
    typeof input.caseQuery === 'string' ? input.caseQuery.trim() : '';

  try {
    const [assets, cases] = await Promise.all([
      readAssets(sb),
      readCases(sb, {
        caseId,
        caseQuery,
        limit,
        includeRecipes: Boolean(input.includeRecipes),
        includeUnpublished: Boolean(input.includeUnpublished)
      })
    ]);
    const existingAssetIds = new Set(assets.map((asset) => String(asset.id)));
    const assetsBySlot = new Map<string, DbRecord[]>();
    for (const asset of assets) {
      const slot = String(asset.slot || '');
      if (!assetsBySlot.has(slot)) assetsBySlot.set(slot, []);
      assetsBySlot.get(slot)?.push(asset);
    }

    const caseReports = cases.map((item) =>
      summarizeCase(item, assetsBySlot, existingAssetIds)
    );
    const missingSuggestions = caseReports.flatMap(
      (item) => item.missingAssetSuggestions
    );
    const topMissingBySlot = missingSuggestions.reduce(
      (acc: Record<string, Record<string, unknown>>, item) => {
        const slot = String(item.slot);
        const id = String(item.id);
        acc[slot] = acc[slot] || {};
        const previous = (acc[slot][id] || {}) as Record<string, unknown>;
        acc[slot][id] = {
          title: item.title,
          occurrences: Number(previous.occurrences || 0) + 1,
          triggers: Array.from(
            new Set([
              ...((previous.triggers as string[] | undefined) || []),
              ...item.triggers
            ])
          )
        };
        return acc;
      },
      {}
    );

    return jsonResponse(
      {
        generatedAt: new Date().toISOString(),
        analyzedCaseCount: caseReports.length,
        assetCount: assets.length,
        assetCountsBySlot: Object.fromEntries(
          SLOT_ORDER.map((slot) => [
            slot,
            (assetsBySlot.get(slot) || []).length
          ])
        ),
        topMissingBySlot,
        cases: caseReports,
        batchDrafts: buildBatchDrafts(missingSuggestions)
      },
      corsHeaders
    );
  } catch (error) {
    console.error('[AdminPromptCaseAssetCoverage] analyze failed:', error);
    return jsonResponse(
      { error: 'Failed to analyze prompt case asset coverage' },
      corsHeaders,
      500
    );
  }
}
