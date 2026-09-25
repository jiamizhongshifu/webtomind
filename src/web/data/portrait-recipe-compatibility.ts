export const portraitRecipeProfiles = [
  'sns-candid',
  'fashion-editorial',
  'night-glamour',
  'guofeng-historical',
  'guofeng-wuxia',
  'guofeng-new-chinese',
  'active-sport',
  'soft-lifestyle',
  'character-cosplay'
] as const;

export type PortraitRecipeProfile = (typeof portraitRecipeProfiles)[number];

export type PortraitRecipeWardrobeSlot =
  | 'top'
  | 'bottom'
  | 'outfit'
  | 'onePiece';

const wardrobeSlotsByProfile: Record<
  PortraitRecipeProfile,
  readonly PortraitRecipeWardrobeSlot[]
> = {
  'sns-candid': ['top', 'bottom', 'outfit', 'onePiece'],
  'fashion-editorial': ['top', 'bottom', 'outfit', 'onePiece'],
  'night-glamour': ['top', 'bottom', 'outfit', 'onePiece'],
  'guofeng-historical': ['outfit'],
  'guofeng-wuxia': ['outfit'],
  'guofeng-new-chinese': ['outfit'],
  'active-sport': ['top', 'bottom', 'outfit'],
  'soft-lifestyle': ['top', 'bottom', 'outfit', 'onePiece'],
  'character-cosplay': ['top', 'bottom', 'outfit', 'onePiece']
};

export function getPortraitRecipeWardrobeSlots(
  profile: PortraitRecipeProfile
): readonly PortraitRecipeWardrobeSlot[] {
  return wardrobeSlotsByProfile[profile];
}

export interface PortraitRecipeAssetLike {
  id: string;
  slot: string;
  title: string;
  subtitle?: string;
  prompt: string;
  promptZh?: string;
  tags: string[];
}

export type PortraitVisualSingularityKind =
  | 'visual-effect'
  | 'surreal-background'
  | 'strong-lens'
  | 'extreme-viewpoint'
  | 'statement-makeup';

export function getPortraitVisualSingularityKind(
  asset: PortraitRecipeAssetLike
): PortraitVisualSingularityKind | null {
  const text = assetText(asset);
  if (asset.slot === 'visualEffect') return 'visual-effect';
  if (
    asset.slot === 'background' &&
    /超现实悖论场景|surreal paradox/i.test(text)
  ) {
    return 'surreal-background';
  }
  if (
    asset.slot === 'lens' &&
    /fisheye|anamorphic|disposable|鱼眼|变形宽银幕|一次性相机/i.test(text)
  ) {
    return 'strong-lens';
  }
  if (
    asset.slot === 'viewpoint' &&
    /top.down|top.view|ground.upward|dutch|ankle.*upward|ceiling.*oblique|overhead.*nadir|floor.*upward|floor.*surge|ceiling.*plunge|shoulder.*plunge|vertical.*rise|oblique.*roll|below.*glass|full.*roll|顶视|地面仰视|斜俯|垂直俯视|极低仰拍|台下视角|九十度滚转|荷兰角|漫画式大透视|贴地冲仰|顶角俯冲|侧向俯冲|斜滚转/i.test(
      text
    )
  ) {
    return 'extreme-viewpoint';
  }
  if (
    asset.slot === 'makeup' &&
    /metallic|silver|smoky|graphic|金属|银色|烟熏|图形/i.test(text)
  ) {
    return 'statement-makeup';
  }
  return null;
}

const profileSignals: Record<
  PortraitRecipeProfile,
  { positive: RegExp; negative?: RegExp }
> = {
  'sns-candid': {
    positive:
      /手机|自拍|随拍|抓拍|生活感|街拍|咖啡|城市|酒店|直闪|ccd|raw|快照|社交平台|smartphone|selfie|snapshot|street|candid|direct flash|disposable/i,
    negative: /中国古装|唐风|宋风|明风|汉风|魏晋|武侠|仙侠|cosplay|角色参考/i
  },
  'fashion-editorial': {
    positive:
      /时装|编辑|杂志|品牌|发布会|试衣间|棚拍|中画幅|雕塑|超模|镜面齐线|超现实|editorial|fashion|magazine|brand|fitting|studio|medium.format|supermodel|glass bob|surreal/i
  },
  'night-glamour': {
    positive:
      /夜间时尚|夜景|霓虹|雨夜|天台|酒店|湿发|烟熏|红唇|金属眼妆|丝绒|镂空|露背|直闪|night|neon|rooftop|hotel|wet.look|smoky|red.lip|velvet|cutout|backless/i,
    negative: /运动|羽毛球|古装|唐风|宋风|明风|汉风|魏晋/i
  },
  'guofeng-historical': {
    positive:
      /中国古装|中国古风|先秦|隋代|五代十国|元代|晚清|清代|唐风|唐制|宋风|宋制|明风|明制|汉风|魏晋|齐胸襦裙|褙子|马面裙|堕马髻|高云髻|双环髻|茶屋|园林|屏风|historical|\b(?:pre[- ]?qin|sui|five[- ]?dynasties|yuan|late[- ]?qing|qing|tang|song|ming|han|hanfu)\b|\bwei[- ]?jin\b/i,
    negative: /武侠|仙侠|新中式|夜间时尚|运动|cosplay/i
  },
  'guofeng-wuxia': {
    positive:
      /武侠|仙侠|敦煌|劲装|圆领袍|高马尾|半束|动态|跃起|行走|全身|轮廓光|薄雾|wuxia|xianxia|dunhuang|high ponytail|half.up|dynamic|full.body|rim light|haze/i,
    negative: /通勤|办公室|居家|羽毛球/i
  },
  'guofeng-new-chinese': {
    positive:
      /新中式|旗袍领|现代马面|波纹低髻|东方|品牌|酒店|城市夜景|编辑妆|new chinese|qipao.collar|modern mamian|glossy wave|oriental|\bbrand\b|\bhotel\b/i,
    negative: /运动|羽毛球|校园|二次元/i
  },
  'active-sport': {
    positive:
      /运动|羽毛球|网球|球衣|活力|行走|伸展|跃起|高马尾|精灵短发|球鞋|硬光|干净数码|\b(?:sport|active|badminton|tennis|jersey|walking|stretch|jump|ponytail|pixie|sneakers?)\b|clean digital/i,
    negative: /古装|唐风|宋风|明风|汉风|魏晋|武侠|仙侠|丝绒晚装|夜间时尚/i
  },
  'soft-lifestyle': {
    positive:
      /花园|日式庭院|枯山水|茶庭|缘侧|阅读角|咖啡|海滨|度假|针织|亚麻|自然微笑|看向画外|困倦|近素颜|蜜桃|蝶翼|长波浪|低马尾|窗光|阴天|逆光|garden|japanese courtyard|karesansui|tea garden|engawa|reading|cafe|beach|resort|knit|linen|soft smile|bare skin|peach|butterfly|waves|low ponytail|window light|overcast|backlit/i,
    negative: /赛博|cosplay|夜间时尚|烟熏|速度线/i
  },
  'character-cosplay': {
    positive:
      /角色|真人化|cosplay|acg|游戏|幻想|超现实|魔法|秘术|赛博|仙侠|太空|轨道|月球|土星环|角色服装|character|live.action|game|fantasy|surreal|magic|arcane|adept|cyber|space|orbital|lunar|saturn/i,
    negative: /产品式|通勤套装|办公室/i
  }
};

type SlotSignals = { positive: RegExp; negative?: RegExp };

const slotProfileSignals: Partial<
  Record<PortraitRecipeProfile, Partial<Record<string, SlotSignals>>>
> = {
  'sns-candid': {
    character: {
      positive:
        /street|raincoat|commuter|detective|街头|雨衣|通勤|摄影|复古港风/i,
      negative: /engineer|mage|archer|elf|cosplay|魔法|幻想|仙侠/i
    },
    background: {
      positive:
        /city|street|cafe|hotel|rooftop|convenience|train|tram|airport|terminal|motel|城市|街角|咖啡|酒店|天台|便利店|海景露台|列车|电车|机场|车站|旅馆/i,
      negative: /电竞|幻想茶屋|古代|影棚/i
    },
    style: {
      positive:
        /phone-raw|street-snap|direct-flash|tungsten-documentary|手机|街拍|直闪|纪实/i,
      negative: /game-character|cosplay|产品式|游戏设定/i
    },
    hairstyle: {
      positive:
        /glass-bob|butterfly|wolf-cut|low-ponytail|textured-pixie|镜面齐线|蝶翼|狼尾|低马尾|精灵短发/i,
      negative: /中国古风|唐风|宋风|明风|汉风|魏晋|武侠|仙侠/i
    },
    outfit: {
      positive:
        /quiet-luxury|moto-column|deconstructed|denim-bustier|silver-cropped|ballet-wrap|techwear|breton-knit|suede-vest|sfw-daywear|静奢|解构|时尚套装|经典套装|经典复兴|sfw日常时尚/i
    },
    accessory: {
      positive:
        /clear-glasses|canvas-tote|mini-shoulder-bag|silk-scarf|phone-pouch|透明方框眼镜|帆布托特|迷你肩包|小丝巾|手机袋/i
    },
    shoes: {
      positive:
        /white-sneakers|ballet-flats|ankle-boots|loafers|mary-jane|白色球鞋|芭蕾鞋|短靴|乐福鞋|玛丽珍/i
    },
    makeup: {
      positive:
        /bare|natural-clean|soft-peach|dewy|latte|近素颜|自然淡妆|蜜桃|水光|拿铁/i
    },
    lens: { positive: /smartphone|disposable|35mm|手机|一次性|负片/i },
    shot: {
      positive: /shot-(?:head-shoulders|waist-up|knee-up)|头肩|腰上|膝上/i,
      negative: /extreme-detail|extreme-long|眼部极特写|大远景/i
    }
  },
  'fashion-editorial': {
    character: { positive: /refined-model|idol|fashion|时装模特|偶像|高级/i },
    background: {
      positive:
        /brand|fitting|event|studio|desert|canyon|salt.mirror|volcanic|seafloor|kelp.forest|abyssal|blue.ice|aurora|frozen.lake|selenite|lava.tube|travertine|turbine|stormwater|dry.dock|retrofuture|planetary|prismatic|suspended.fabric|mirrored.monolith|algae.glass|mycelium|mangrove.tidal|rainchain|windcatcher|tidal.retention|cloudforest|cliffside.elevator|skytower.windcourt|surreal.paradox|品牌|试衣间|发布会|影棚|荒漠|峡谷|盐镜|火山|海底|海藻森林|深渊|蓝冰|极光|冻湖|透石膏|熔岩洞|石灰华|涡轮|蓄洪|干船坞|复古未来|行星控制室|棱彩玻璃|悬布|镜面独石|藻类玻璃|菌丝|红树林潮汐|雨链|捕风|潮汐滞洪|云雾林冠|悬崖升降机|高塔风庭|超现实悖论场景/i
    },
    style: {
      positive:
        /fashion|editorial|magazine|medium-format|时装|编辑|杂志|中画幅/i
    },
    hairstyle: {
      positive:
        /supermodel|glass-bob|slick|sculpted|jellyfish|microbraid|braided-crown|undercut|crimped|超模|镜面齐线|光泽后梳|雕塑|水母|微辫|编发冠|底削|压纹/i,
      negative: /中国古风|唐风|宋风|明风|汉风|魏晋|武侠|仙侠/i
    },
    lens: {
      positive: /medium-format|clean-digital|diffusion|中画幅|现代数码|柔光/i
    },
    lighting: { positive: /softbox|window|separation|柔箱|窗光|主体分离/i },
    outfit: {
      positive: /kpop|k-pop|idol-stage|韩流舞台|偶像舞台|舞台时装/i
    }
  },
  'night-glamour': {
    character: {
      positive: /rain|street|refined-model|港风|雨夜|街头|时装模特/i
    },
    background: {
      positive:
        /neon|night|rooftop|hotel|rain|turbine|stormwater|dry.dock|abyssal|霓虹|夜景|天台|酒店|雨|涡轮|蓄洪|干船坞|深渊/i
    },
    style: {
      positive:
        /direct-flash|cinematic-rain|high-contrast|glossy|直闪|雨夜电影|高反差|杂志/i
    },
    hairstyle: {
      positive: /wet-look|supermodel|slick|湿发|超模|光洁/i,
      negative: /中国古风|唐风|宋风|明风|汉风|魏晋/i
    },
    lens: {
      positive:
        /disposable|35mm|anamorphic|diffusion|一次性|负片|变形宽银幕|柔光/i
    },
    lighting: {
      positive:
        /neon|gel|low-key|warm-cool|candle|ccd|霓虹|凝胶|低调|冷暖|烛感|夜间柔闪/i
    },
    makeup: { positive: /smoky|red-lip|silver|berry|烟熏|红唇|银色|莓果/i },
    outfit: {
      positive:
        /night-glamour|kpop|k-pop|idol-stage|satin|velvet|chainmail|sequin|patent|corset|夜间时尚|韩流舞台|偶像舞台|缎面|丝绒|链甲|亮片|漆皮|束身/i
    }
  },
  'guofeng-historical': {
    character: {
      positive: /refined-model|fashion-model|时装模特|古典|东方/i,
      negative:
        /commuter|skater|engineer|producer|cyber|通勤|滑板|工程师|制作人|赛博/i
    },
    background: {
      positive:
        /中国古代场景|先秦|隋代|五代十国|元代|晚清|清代|汉风|魏晋|唐风|宋风|明风|teahouse|garden|茶屋|花园/i,
      negative:
        /武侠|仙侠|新中式|japanese|karesansui|engawa|日式|枯山水|缘侧|beach|pool|esports|neon|rooftop|seafloor|kelp.forest|abyssal|polar|blue.ice|frozen.lake|selenite|lava.tube|travertine|turbine|stormwater|dry.dock|retrofuture|planetary|prismatic|suspended.fabric|mirrored.monolith|海边|泳池|电竞|霓虹|天台|海底|海藻森林|深渊|极地|蓝冰|冻湖|透石膏|熔岩洞|石灰华|涡轮|蓄洪|干船坞|复古未来|行星控制室|棱彩玻璃|悬布|镜面独石/i
    },
    style: {
      positive:
        /medium-format|fine-art|high-end-fashion|中画幅|艺术人像|时装摄影/i
    },
    hairstyle: {
      positive:
        /中国古风|先秦|隋代|五代十国|元代|晚清|清代|唐风|宋风|明风|汉风|魏晋|堕马髻|高云髻|双环髻/i,
      negative: /武侠|仙侠|新中式|现代时尚/i
    },
    outfit: {
      positive:
        /中国古装|先秦|隋代|五代十国|元代|晚清|清代|唐制|宋制|明制|魏晋|齐胸襦裙|褙子|袄裙/i,
      negative: /武侠|仙侠|新中式|运动/i
    },
    lens: { positive: /medium-format|35mm|diffusion|中画幅|负片|柔光/i },
    lighting: {
      positive:
        /中国古代光影|oil.lamp|paper.lantern|moon.window|lattice.window|courtyard|eave|window|candle|softbox|overcast|油灯|纸灯|月窗|格窗|庭院天光|檐下|窗光|烛|柔箱|漫射/i
    },
    makeup: {
      positive: /oriental|natural|red-brown|berry|东方|自然|红棕|莓果/i
    },
    expression: {
      positive: /中国古典表情|清贵柔眼|含羞侧目|娇贵微抬眼|花影出神|闺阁私语/i,
      negative: /武侠|仙侠|新中式/i
    }
  },
  'guofeng-wuxia': {
    character: { positive: /heroine|mage|archer|scout|女主角|法师|弓手|侦察/i },
    background: {
      positive:
        /武侠|仙侠|山关客栈|云海石台|fantasy.teahouse|garden|异世界茶屋|花园/i,
      negative:
        /japanese|karesansui|engawa|日式|枯山水|缘侧|convenience|city|neon|rooftop|seafloor|kelp.forest|abyssal|turbine|stormwater|dry.dock|retrofuture|planetary|prismatic|suspended.fabric|mirrored.monolith|便利店|城市|霓虹|天台|海底|海藻森林|深渊|涡轮|蓄洪|干船坞|复古未来|行星控制室|棱彩玻璃|悬布|镜面独石/i
    },
    style: {
      positive: /cinematic|cosplay|high-end-fashion|电影|真人化|时装摄影/i
    },
    hairstyle: {
      positive: /武侠|仙侠|高马尾|半束/i,
      negative: /唐风|宋风|明风|汉风/i
    },
    outfit: { positive: /武侠|仙侠|敦煌|劲装|圆领袍/i, negative: /通勤|运动/i },
    pose: { positive: /walk|jump|turn|hair|行走|跃|转身|甩发/i },
    shot: { positive: /knee-up|full-body|long|膝上|全身|中全景|远景/i },
    lighting: { positive: /rim|backlit|haze|轮廓|逆光|薄雾/i },
    expression: { positive: /武侠|仙侠|警觉侧听|沉着决意|悲悯远望/i }
  },
  'guofeng-new-chinese': {
    character: { positive: /refined-model|fashion|港风|时装模特|高级/i },
    background: {
      positive: /新中式|brand|hotel|city|studio|品牌|酒店|城市|影棚/i
    },
    style: { positive: /fashion|editorial|medium-format|时装|编辑|中画幅/i },
    hairstyle: {
      positive: /新中式|波纹低髻|sleek-low|glass-bob|低马尾|镜面齐线/i
    },
    outfit: { positive: /new-chinese|新中式|旗袍领|现代马面/i },
    makeup: { positive: /oriental|red-brown|editorial|东方|红棕|编辑/i },
    expression: { positive: /新中式表情|新中式冷静审视|编辑感/i }
  },
  'active-sport': {
    character: { positive: /tennis|skater|sport|网球|滑板|运动/i },
    background: {
      positive: /city|street|beach|pool|garden|城市|街道|海边|泳池|花园/i,
      negative: /esports|bedroom|电竞|卧室/i
    },
    style: {
      positive:
        /phone-raw|street-snap|direct-flash|clean-product|手机|街拍|直闪|干净/i
    },
    hairstyle: {
      positive:
        /sculpted-high-ponytail|textured-pixie|glass-bob|现代时尚发型|高马尾|精灵短发|镜面齐线/i,
      negative: /武侠|仙侠|中国古风|唐风|宋风|明风|汉风|魏晋/i
    },
    pose: { positive: /walk|jump|stretch|行走|跃|伸展/i },
    shot: { positive: /knee-up|full-body|long|膝上|全身|中全景|远景/i },
    lens: { positive: /clean-digital|smartphone|现代数码|手机/i },
    lighting: {
      positive:
        /softbox|golden|golden.hour|overcast|\bhard\b|柔箱|金色时刻|金色阳光|漫射|硬光/i
    },
    makeup: { positive: /sun-kissed|natural|日晒|自然|清透/i },
    outfit: {
      positive: /swim-two-piece|athletic-swim|bikini|泳装套装|运动泳装|比基尼/i
    }
  },
  'soft-lifestyle': {
    character: {
      positive: /bookstore|refined-model|书店|时装模特|温柔/i,
      negative:
        /rain|cyber|gothic|elf|fantasy|mage|雨夜|赛博|哥特|精灵|幻想|法师/i
    },
    background: {
      positive:
        /garden|japanese.courtyard|karesansui|tea.garden|engawa|reading|cafe|beach|resort|sleeper|ferry|cable.car|funicular|frozen.lake.glass.pavilion|mangrove.tidal.library|rainchain.cistern|cloudforest.canopy|lauterbrunnen|geirangerfjord|alhambra|seongsan|halong|ha.long|fuji.kawaguchi|machu.picchu|moraine.lake|milford.sound|花园|日式庭院|枯山水|茶庭|缘侧|阅读|咖啡|海边|度假|卧铺|渡轮|缆车|冻湖玻璃亭|红树林潮汐图书|雨链蓄水庭|云雾林冠|劳特布龙嫩|盖朗厄尔|阿尔罕布拉|城山日出峰|下龙湾|河口湖富士山|马丘比丘|梦莲湖|米尔福德峡湾/i,
      negative: /orbital|lunar|saturn|space.station|轨道|月球|土星环|太空/i
    },
    style: {
      positive: /dreamy|pastel|phone-raw|medium-format|梦感|柔和|手机|中画幅/i
    },
    hairstyle: {
      positive: /butterfly|mermaid|low-ponytail|loose|蝶翼|人鱼|低马尾|松散/i,
      negative: /中国古风|唐风|宋风|明风|汉风|魏晋|武侠|仙侠/i
    },
    lighting: {
      positive: /window|overcast|backlit|softbox|窗光|漫射|逆光|柔箱/i
    },
    makeup: { positive: /bare|peach|natural|dewy|近素颜|蜜桃|自然|水光/i },
    accessory: {
      positive:
        /canvas-tote|silk-scarf|pearl-earrings|mini-shoulder-bag|帆布托特|小丝巾|珍珠耳钉|迷你肩包/i
    },
    shoes: {
      positive:
        /ballet-flats|white-sneakers|brown-vintage-oxfords|mary-jane|芭蕾鞋|白色球鞋|棕色牛津鞋|玛丽珍/i
    },
    outfit: {
      positive:
        /sfw-daywear|swim-two-piece|resort-swim|sfw日常时尚|泳装套装|度假泳装/i
    },
    onePiece: {
      positive: /onepiece-swim|one-piece swimsuit|一体式泳装|连体泳装/i
    }
  },
  'character-cosplay': {
    character: {
      positive:
        /mage|archer|engineer|scout|\belf\b|heroine|arcane|adept|赛博|法师|弓手|精灵|女主角|秘术/i
    },
    background: {
      positive:
        /fantasy|esports|neon|rain|orbital|lunar|saturn|space.station|seafloor|kelp.forest|abyssal|retrofuture|planetary|prismatic|mirrored.monolith|algae.glass|mycelium|cliffside.elevator|skytower.windcourt|surreal.paradox|幻想|电竞|霓虹|雨|太空|轨道|月球|土星环|海底|海藻森林|深渊|复古未来|行星控制室|棱彩玻璃|镜面独石|藻类玻璃|菌丝|悬崖升降机|高塔风庭|超现实悖论场景/i
    },
    style: { positive: /cosplay|game|neon|cinematic|真人化|游戏|霓虹|电影/i },
    hairstyle: {
      positive: /xianxia|wuxia|high-ponytail|halfup|仙侠|武侠|高马尾|半束/i
    },
    outfit: {
      positive:
        /original-(?:starlight|cyber|alchemist|mecha|space|gothic|hologram|urban-shinobi|creature)|original adult|原创acg/i
    },
    onePiece: {
      positive:
        /original-(?:astral|botanical|lunar|archive|mecha|deepsea|timekeeper|storm|prism)|original adult|原创acg/i
    },
    prop: {
      positive:
        /prop-original|original hand-held|original palm-sized|原创acg道具/i
    },
    lighting: { positive: /gel|neon|rim|backlit|凝胶|霓虹|轮廓|逆光/i }
  }
};

// Prompt assets are immutable snapshots; edits replace the object identity.
// That contract keeps these WeakMap caches both safe and automatically bounded.
const portraitRecipeAssetTextCache = new WeakMap<object, string>();

function assetText(asset: PortraitRecipeAssetLike): string {
  const cached = portraitRecipeAssetTextCache.get(asset);
  if (cached) return cached;
  const text = [
    asset.id,
    asset.title,
    asset.subtitle || '',
    asset.prompt,
    asset.promptZh || '',
    ...asset.tags
  ]
    .join(' ')
    .toLowerCase();
  portraitRecipeAssetTextCache.set(asset, text);
  return text;
}

type WardrobePairingFamily =
  | 'swim'
  | 'sport'
  | 'academy'
  | 'tailoring'
  | 'denim'
  | 'utility'
  | 'evening'
  | 'romantic'
  | 'street'
  | 'resort';

const wardrobePairingSignals: Record<WardrobePairingFamily, RegExp> = {
  swim: /swimwear|bikini|swimsuit|泳装|比基尼/i,
  sport:
    /\b(?:sport|active|tennis|football|badminton|jersey|track)\b|运动|网球|足球|羽毛球|球衣|训练/i,
  academy: /academy|varsity|sailor|pleated|学院|百褶|水手领|棒球夹克|蝴蝶结/i,
  tailoring:
    /blazer|tailored|pinstripe|bermuda|trench|suit|西装|细条纹|百慕大|风衣|锥形裤/i,
  denim: /denim|牛仔/i,
  utility:
    /utility|cargo|military|anorak|cosplay|technical|工装|军装|伞裤|风帽|角色感|角色服装|机能/i,
  evening:
    /satin|velvet|metallic|silver|corset|drape|缎面|天鹅绒|金属感|银色|束身|垂褶|一字肩/i,
  romantic: /lace|tulle|organza|floral|蕾丝|薄纱|欧根纱|花朵|柔粉|粉色/i,
  street: /hoodie|leather|baseball|bomber|卫衣|皮革|街头|棒球/i,
  resort: /linen|crochet|resort|亚麻|钩针|度假/i
};

const wardrobePairingFamiliesCache = new WeakMap<
  object,
  Set<WardrobePairingFamily>
>();

function inferWardrobePairingFamilies(
  asset: PortraitRecipeAssetLike
): Set<WardrobePairingFamily> {
  if (asset.slot !== 'top' && asset.slot !== 'bottom') return new Set();
  const cached = wardrobePairingFamiliesCache.get(asset);
  if (cached) return cached;
  const text = assetText(asset);
  const families = new Set(
    (
      Object.entries(wardrobePairingSignals) as Array<
        [WardrobePairingFamily, RegExp]
      >
    )
      .filter(([, signal]) => signal.test(text))
      .map(([family]) => family)
  );
  wardrobePairingFamiliesCache.set(asset, families);
  return families;
}

function findWardrobeCounterpart(
  candidateSlot: string | undefined,
  selectedAssets: PortraitRecipeAssetLike[]
): PortraitRecipeAssetLike | undefined {
  if (candidateSlot !== 'top' && candidateSlot !== 'bottom') return undefined;
  return selectedAssets.find(
    (asset) => asset.slot === (candidateSlot === 'top' ? 'bottom' : 'top')
  );
}

/** Hard structure gate: a swim separate may only randomize with swim. */
function filterWardrobeStructuralCompatibility<
  T extends PortraitRecipeAssetLike
>(candidates: T[], selectedAssets: PortraitRecipeAssetLike[]): T[] {
  const slot = candidates[0]?.slot;
  const counterpart = findWardrobeCounterpart(slot, selectedAssets);
  if (!counterpart) return candidates;

  const counterpartIsSwim =
    inferWardrobePairingFamilies(counterpart).has('swim');
  const swimCompatible = candidates.filter(
    (candidate) =>
      inferWardrobePairingFamilies(candidate).has('swim') === counterpartIsSwim
  );
  return swimCompatible.length > 0 ? swimCompatible : candidates;
}

/**
 * Soft preference after route affinity: reuse a clothing-world family when the
 * current route has one, otherwise keep every structurally valid candidate.
 */
function filterWardrobeFamilyAffinity<T extends PortraitRecipeAssetLike>(
  candidates: T[],
  selectedAssets: PortraitRecipeAssetLike[]
): T[] {
  const counterpart = findWardrobeCounterpart(
    candidates[0]?.slot,
    selectedAssets
  );
  if (!counterpart) return candidates;
  const counterpartFamilies = inferWardrobePairingFamilies(counterpart);

  const sharedFamilyCandidates = candidates.filter((candidate) => {
    const families = inferWardrobePairingFamilies(candidate);
    return [...counterpartFamilies].some(
      (family) => family !== 'swim' && families.has(family)
    );
  });
  return sharedFamilyCandidates.length > 0
    ? sharedFamilyCandidates
    : candidates;
}

function getChineseRouteSignal(text: string): RegExp | null {
  if (/武侠/i.test(text)) return /武侠/i;
  if (/仙侠|敦煌/i.test(text)) return /仙侠/i;
  if (/新中式/i.test(text)) return /新中式/i;
  return null;
}

function filterSameHistoricalWorld<T extends PortraitRecipeAssetLike>(
  candidates: T[],
  wardrobe: PortraitRecipeAssetLike
): T[] | null {
  const era = inferHistoricalEra(wardrobe);
  if (era) {
    const sameEra = candidates.filter(
      (candidate) => inferHistoricalEra(candidate) === era
    );
    if (sameEra.length > 0) return sameEra;
  }

  const routeSignal = getChineseRouteSignal(assetText(wardrobe));
  if (!routeSignal) return null;
  const sameRoute = candidates.filter((candidate) =>
    routeSignal.test(assetText(candidate))
  );
  return sameRoute.length > 0 ? sameRoute : null;
}

/** Prefer visually neutral footwear when a random recipe already uses historical dress. */
function filterHistoricalFootwearAffinity<T extends PortraitRecipeAssetLike>(
  candidates: T[],
  selectedAssets: PortraitRecipeAssetLike[]
): T[] {
  if (candidates[0]?.slot !== 'shoes') return candidates;
  const wardrobe = selectedAssets.find((asset) =>
    ['top', 'bottom', 'outfit', 'onePiece'].includes(asset.slot)
  );
  if (!wardrobe) return candidates;
  const wardrobeText = assetText(wardrobe);
  if (
    !/中国古装|唐制|宋制|明制|魏晋|汉风|武侠|仙侠|敦煌|齐胸襦裙|褙子|袄裙|马面裙|新中式/i.test(
      wardrobeText
    )
  ) {
    return candidates;
  }

  const sameWorld = filterSameHistoricalWorld(candidates, wardrobe);
  if (sameWorld) return sameWorld;

  const neutralCandidates = candidates.filter(
    (candidate) =>
      !/sneakers?|platform|jelly|rain boots?|运动鞋|球鞋|厚底|果冻|雨靴|未来舞台|银色厚底/i.test(
        assetText(candidate)
      )
  );
  return neutralCandidates.length > 0 ? neutralCandidates : candidates;
}

/** Keep random face, object and environment details inside the selected historical world. */
function filterHistoricalDetailAffinity<T extends PortraitRecipeAssetLike>(
  candidates: T[],
  selectedAssets: PortraitRecipeAssetLike[]
): T[] {
  const slot = candidates[0]?.slot;
  if (
    slot !== 'accessory' &&
    slot !== 'prop' &&
    slot !== 'makeup' &&
    slot !== 'expression' &&
    slot !== 'background' &&
    slot !== 'lighting'
  ) {
    return candidates;
  }
  const wardrobe = selectedAssets.find((asset) =>
    ['top', 'bottom', 'outfit', 'onePiece'].includes(asset.slot)
  );
  if (!wardrobe) return candidates;
  const wardrobeText = assetText(wardrobe);
  if (
    !/中国古装|唐制|宋制|明制|清代|魏晋|汉风|武侠|仙侠|敦煌|齐胸襦裙|褙子|袄裙|马面裙|新中式/i.test(
      wardrobeText
    )
  ) {
    return candidates;
  }

  const sameWorld = filterSameHistoricalWorld(candidates, wardrobe);
  if (sameWorld) return sameWorld;

  if (slot === 'prop') {
    const historicalProps = candidates.filter((candidate) =>
      /中国古代道具|新中式道具/i.test(assetText(candidate))
    );
    if (historicalProps.length > 0) return historicalProps;
    const periodNeutral = candidates.filter((candidate) =>
      /纸扇|折扇|书|花束|paper fan|book|bouquet/i.test(assetText(candidate))
    );
    return periodNeutral.length > 0 ? periodNeutral : candidates;
  }

  if (slot === 'makeup') {
    const historicalMakeup = candidates.filter((candidate) =>
      /中国古代妆容|新中式妆容|东方古典妆/i.test(assetText(candidate))
    );
    return historicalMakeup.length > 0 ? historicalMakeup : candidates;
  }

  if (slot === 'expression') {
    const historicalExpressions = candidates.filter((candidate) =>
      /中国古典表情|中国古代表情|新中式表情/i.test(assetText(candidate))
    );
    return historicalExpressions.length > 0
      ? historicalExpressions
      : candidates;
  }

  if (slot === 'background') {
    const historicalBackgrounds = candidates.filter((candidate) =>
      /中国古代场景|新中式场景/i.test(assetText(candidate))
    );
    return historicalBackgrounds.length > 0
      ? historicalBackgrounds
      : candidates;
  }

  if (slot === 'lighting') {
    const historicalLighting = candidates.filter((candidate) => {
      const text = assetText(candidate);
      return /中国古代光影/i.test(text) && !/武侠|仙侠/i.test(text);
    });
    return historicalLighting.length > 0 ? historicalLighting : candidates;
  }

  const historicalAccessories = candidates.filter((candidate) =>
    /中国古代发饰|新中式发饰/i.test(assetText(candidate))
  );
  return historicalAccessories.length > 0 ? historicalAccessories : candidates;
}

const portraitRecipeAffinityCache = new WeakMap<
  object,
  Map<PortraitRecipeProfile, number>
>();

export function getPortraitRecipeAffinity(
  asset: PortraitRecipeAssetLike,
  profile: PortraitRecipeProfile
): number {
  let affinityByProfile = portraitRecipeAffinityCache.get(asset);
  if (!affinityByProfile) {
    affinityByProfile = new Map();
    portraitRecipeAffinityCache.set(asset, affinityByProfile);
  }
  const cached = affinityByProfile.get(profile);
  if (cached !== undefined) return cached;
  const text = assetText(asset);
  const signals =
    slotProfileSignals[profile]?.[asset.slot] || profileSignals[profile];
  let score = signals.positive.test(text) ? 2 : 0;
  if (signals.negative?.test(text)) score -= 2;

  if (asset.slot === 'shot' || asset.slot === 'viewpoint') {
    if (
      profile === 'guofeng-wuxia' &&
      /全身|中全景|full.body|long shot/i.test(text)
    ) {
      score += 2;
    }
    if (profile === 'sns-candid' && /腰上|膝上|waist|knee/i.test(text)) {
      score += 1;
    }
  }

  affinityByProfile.set(profile, score);
  return score;
}

export function filterAssetsForPortraitRecipeProfile<
  T extends PortraitRecipeAssetLike
>(assets: T[], profile: PortraitRecipeProfile): T[] {
  if (assets.length < 2) return assets;
  const scored = assets.map((asset) => ({
    asset,
    score: getPortraitRecipeAffinity(asset, profile)
  }));
  const positive = scored.filter(({ score }) => score > 0);
  if (positive.length > 0) return positive.map(({ asset }) => asset);
  const nonNegative = scored.filter(({ score }) => score >= 0);
  return nonNegative.length > 0
    ? nonNegative.map(({ asset }) => asset)
    : assets;
}

const strictRandomProfileAffinity = new Set<PortraitRecipeProfile>([
  'guofeng-historical',
  'guofeng-wuxia',
  'character-cosplay'
]);

// Only historically exclusive or fantasy-character worlds are barred from
// neutral modern routes. New Chinese, sport and night fashion can also be
// valid editorial subjects, so their affinity must not become a hidden gate.
const exclusiveRandomProfileAffinity = new Set<PortraitRecipeProfile>([
  'guofeng-historical',
  'guofeng-wuxia',
  'character-cosplay'
]);

function hasExplicitExclusiveRouteSignal(
  asset: PortraitRecipeAssetLike,
  profile: PortraitRecipeProfile
): boolean {
  const text = assetText(asset);
  if (profile === 'guofeng-historical') {
    return /中国古装|中国古风|中国古代|先秦|战国|隋代|五代十国|元代|晚清|清代|唐风|唐制|宋风|宋制|明风|明制|汉风|汉制|魏晋|historical|\b(?:pre[- ]?qin|sui|five[- ]?dynasties|yuan|late[- ]?qing|qing|tang|song|ming|han|hanfu)\b|\bwei[- ]?jin\b/i.test(
      text
    );
  }
  if (profile === 'guofeng-wuxia') {
    return /武侠|仙侠|敦煌|wuxia|xianxia|dunhuang/i.test(text);
  }
  if (profile === 'character-cosplay') {
    return /角色|真人化|cosplay|acg|game character|fantasy|magic|mage|archer|\belf\b|heroine|arcane|adept|cyber|超现实悖论场景|surreal.paradox/i.test(
      text
    );
  }
  return false;
}

function filterRandomWorldCompatibility<T extends PortraitRecipeAssetLike>(
  assets: T[],
  profile: PortraitRecipeProfile
): T[] {
  if (profile === 'guofeng-historical') {
    const historical = assets.filter(
      (asset) => !hasExplicitExclusiveRouteSignal(asset, 'guofeng-wuxia')
    );
    return historical.length > 0 ? historical : assets;
  }
  if (profile === 'guofeng-wuxia') {
    const wuxia = assets.filter(
      (asset) =>
        !hasExplicitExclusiveRouteSignal(asset, 'guofeng-historical') ||
        hasExplicitExclusiveRouteSignal(asset, 'guofeng-wuxia')
    );
    return wuxia.length > 0 ? wuxia : assets;
  }
  const compatible = assets.filter((asset) => {
    const historical = hasExplicitExclusiveRouteSignal(
      asset,
      'guofeng-historical'
    );
    const wuxia = hasExplicitExclusiveRouteSignal(asset, 'guofeng-wuxia');
    const characterWorld = hasExplicitExclusiveRouteSignal(
      asset,
      'character-cosplay'
    );
    if (
      historical &&
      !(profile === 'character-cosplay' && (wuxia || characterWorld))
    ) {
      return false;
    }
    if (profile !== 'character-cosplay' && wuxia) {
      return false;
    }
    if (profile !== 'character-cosplay' && characterWorld) {
      return false;
    }
    return true;
  });
  return compatible.length > 0 ? compatible : assets;
}

type CharacterRecipeWorld = 'chinese-fantasy' | 'cyber-game';

function inferCharacterRecipeWorld(
  asset: PortraitRecipeAssetLike
): CharacterRecipeWorld | null {
  const text = assetText(asset);
  if (/武侠|仙侠|敦煌|wuxia|xianxia|dunhuang/i.test(text)) {
    return 'chinese-fantasy';
  }
  if (/赛博|霓虹|电竞|街机|cyber|neon|esports|arcade|game/i.test(text)) {
    return 'cyber-game';
  }
  return null;
}

function filterCharacterRecipeWorldAffinity<T extends PortraitRecipeAssetLike>(
  assets: T[],
  profile: PortraitRecipeProfile,
  selectedAssets: PortraitRecipeAssetLike[]
): T[] {
  if (profile !== 'character-cosplay') return assets;
  const anchorWorld = selectedAssets
    .map(inferCharacterRecipeWorld)
    .find((world): world is CharacterRecipeWorld => Boolean(world));
  if (!anchorWorld) return assets;
  const compatible = assets.filter((asset) => {
    const world = inferCharacterRecipeWorld(asset);
    return world === null || world === anchorWorld;
  });
  return compatible.length > 0 ? compatible : assets;
}

/**
 * Random recipes treat route affinity as a weight, not as an unpublished
 * allow-list. Strongly themed routes still require a positive route signal;
 * the three general photographic routes also admit neutral assets so valid
 * everyday garments, faces and props do not become permanently unreachable.
 */
function filterAssetsForRandomProfile<T extends PortraitRecipeAssetLike>(
  assets: T[],
  profile: PortraitRecipeProfile
): T[] {
  if (assets.length < 2 || strictRandomProfileAffinity.has(profile)) {
    return filterAssetsForPortraitRecipeProfile(assets, profile);
  }

  const scored = assets.map((asset) => ({
    asset,
    score: getPortraitRecipeAffinity(asset, profile),
    belongsToSpecializedRoute: [...exclusiveRandomProfileAffinity].some(
      (specializedProfile) => {
        const wardrobeSlots =
          getPortraitRecipeWardrobeSlots(specializedProfile);
        const routeCanSelectSlot =
          !['top', 'bottom', 'outfit', 'onePiece'].includes(asset.slot) ||
          wardrobeSlots.includes(asset.slot as PortraitRecipeWardrobeSlot);
        return (
          routeCanSelectSlot &&
          hasExplicitExclusiveRouteSignal(asset, specializedProfile) &&
          getPortraitRecipeAffinity(asset, specializedProfile) > 0
        );
      }
    )
  }));
  const compatible = scored.filter(
    ({ score, belongsToSpecializedRoute }) =>
      score >= 0 && (score > 0 || !belongsToSpecializedRoute)
  );
  return compatible.length > 0
    ? compatible.map(({ asset }) => asset)
    : filterAssetsForPortraitRecipeProfile(assets, profile);
}

export function getPortraitRecipeSamplingWeight(
  asset: PortraitRecipeAssetLike,
  profile: PortraitRecipeProfile,
  selectedAssets: PortraitRecipeAssetLike[] = []
): number {
  const affinity = getPortraitRecipeAffinity(asset, profile);
  let weight = affinity > 0 ? 4 : affinity < 0 ? 0.25 : 1;
  const counterpart = findWardrobeCounterpart(asset.slot, selectedAssets);
  if (!counterpart) return weight;

  const counterpartFamilies = inferWardrobePairingFamilies(counterpart);
  const families = inferWardrobePairingFamilies(asset);
  const sharedNonSwimFamily = [...counterpartFamilies].some(
    (family) => family !== 'swim' && families.has(family)
  );
  if (sharedNonSwimFamily) weight *= 3;
  else if ([...counterpartFamilies].some((family) => family !== 'swim')) {
    weight *= 0.5;
  }
  return weight;
}

type HistoricalEra =
  | 'preqin'
  | 'han'
  | 'weijin'
  | 'sui'
  | 'tang'
  | 'five-dynasties'
  | 'song'
  | 'yuan'
  | 'ming'
  | 'qing'
  | 'late-qing'
  | '1920s'
  | '1980s'
  | '1990s';

const historicalEraCache = new WeakMap<object, HistoricalEra | null>();

function inferHistoricalEra(
  asset: PortraitRecipeAssetLike
): HistoricalEra | null {
  if (historicalEraCache.has(asset)) {
    return historicalEraCache.get(asset) ?? null;
  }
  const text = assetText(asset);
  let era: HistoricalEra | null = null;
  if (/先秦|战国|pre[- ]?qin/i.test(text)) era = 'preqin';
  else if (/汉风|汉制|\bhan\b/i.test(text)) era = 'han';
  else if (/魏晋|\bwei[- ]?jin\b/i.test(text)) era = 'weijin';
  else if (/隋代|隋风|\bsui\b/i.test(text)) era = 'sui';
  else if (/唐风|唐制|\btang\b/i.test(text)) era = 'tang';
  else if (/五代十国|五代|five[- ]?dynasties/i.test(text)) {
    era = 'five-dynasties';
  } else if (/宋风|宋制|\bsong\b/i.test(text)) era = 'song';
  else if (/元代|元风|\byuan\b/i.test(text)) era = 'yuan';
  else if (/明风|明制|\bming\b/i.test(text)) era = 'ming';
  else if (/晚清|late[- ]?qing/i.test(text)) era = 'late-qing';
  else if (/清代|清制|\bqing\b/i.test(text)) era = 'qing';
  else if (/1920年代|1920s/i.test(text)) era = '1920s';
  else if (/1980年代|1980s/i.test(text)) era = '1980s';
  else if (/1990年代|1990s/i.test(text)) era = '1990s';
  historicalEraCache.set(asset, era);
  return era;
}

const ERA_AFFINITY_SLOTS = new Set([
  'outfit',
  'hairstyle',
  'background',
  'makeup',
  'accessory',
  'prop'
]);

/**
 * Cross-axis era affinity for the theme-defining slots. This is a soft
 * random-candidate preference: it narrows only when the library contains an
 * exact era counterpart and never removes a manual selection.
 */
function filterSameEraAffinity<T extends PortraitRecipeAssetLike>(
  candidates: T[],
  selectedAssets: PortraitRecipeAssetLike[]
): T[] {
  const slot = candidates[0]?.slot;
  if (!slot || !ERA_AFFINITY_SLOTS.has(slot)) {
    return candidates;
  }
  const eraAnchor = selectedAssets.find(
    (asset) =>
      asset.slot !== slot &&
      ERA_AFFINITY_SLOTS.has(asset.slot) &&
      inferHistoricalEra(asset)
  );
  const era = eraAnchor ? inferHistoricalEra(eraAnchor) : null;
  if (!era) return candidates;
  const sameEra = candidates.filter(
    (candidate) => inferHistoricalEra(candidate) === era
  );
  return sameEra.length > 0 ? sameEra : candidates;
}

function filterHistoricalModernDevicePoses<T extends PortraitRecipeAssetLike>(
  candidates: T[],
  profile: PortraitRecipeProfile
): T[] {
  if (profile !== 'guofeng-historical' || candidates[0]?.slot !== 'pose') {
    return candidates;
  }
  return candidates.filter(
    (candidate) =>
      !/smartphone|mobile phone|phone selfie|mirror selfie|手机|自拍/i.test(
        assetText(candidate)
      )
  );
}

export function filterSecondaryVisualSingularities<
  T extends PortraitRecipeAssetLike
>(candidates: T[], selectedAssets: PortraitRecipeAssetLike[]): T[] {
  const primarySingularity = selectedAssets.find((asset) =>
    getPortraitVisualSingularityKind(asset)
  );
  if (!primarySingularity) return candidates;
  return candidates.filter(
    (candidate) => !getPortraitVisualSingularityKind(candidate)
  );
}

export function filterAssetsForPortraitRecipeContext<
  T extends PortraitRecipeAssetLike
>(
  assets: T[],
  profile: PortraitRecipeProfile,
  selectedAssets: PortraitRecipeAssetLike[]
): T[] {
  const periodCompatible = filterHistoricalModernDevicePoses(assets, profile);
  const structurallyCompatible = filterWardrobeStructuralCompatibility(
    periodCompatible,
    selectedAssets
  );
  const footwearCandidates = filterHistoricalFootwearAffinity(
    structurallyCompatible,
    selectedAssets
  );
  const detailCandidates = filterHistoricalDetailAffinity(
    footwearCandidates,
    selectedAssets
  );
  const eraCandidates = filterSameEraAffinity(detailCandidates, selectedAssets);
  const singularityCandidates = filterSecondaryVisualSingularities(
    eraCandidates,
    selectedAssets
  );
  const profileCandidates = filterAssetsForPortraitRecipeProfile(
    singularityCandidates,
    profile
  );
  const contextCandidates = filterWardrobeFamilyAffinity(
    profileCandidates,
    selectedAssets
  );
  if (
    profile !== 'guofeng-historical' ||
    contextCandidates[0]?.slot !== 'outfit'
  ) {
    return contextCandidates;
  }

  const hairstyle = selectedAssets.find((asset) => asset.slot === 'hairstyle');
  const era = hairstyle ? inferHistoricalEra(hairstyle) : null;
  if (!era) return contextCandidates;
  const sameEra = contextCandidates.filter(
    (candidate) => inferHistoricalEra(candidate) === era
  );
  return sameEra.length > 0 ? sameEra : contextCandidates;
}

/**
 * Random-only context filtering. Hard structure, historical-world, era and
 * singularity gates remain filters; route and non-swim clothing-family
 * affinity become weighted preferences in the caller.
 */
export function filterAssetsForPortraitRecipeRandomContext<
  T extends PortraitRecipeAssetLike
>(
  assets: T[],
  profile: PortraitRecipeProfile,
  selectedAssets: PortraitRecipeAssetLike[]
): T[] {
  const worldCompatible = filterRandomWorldCompatibility(assets, profile);
  const characterWorldCompatible = filterCharacterRecipeWorldAffinity(
    worldCompatible,
    profile,
    selectedAssets
  );
  const periodCompatible = filterHistoricalModernDevicePoses(
    characterWorldCompatible,
    profile
  );
  const structurallyCompatible = filterWardrobeStructuralCompatibility(
    periodCompatible,
    selectedAssets
  );
  const footwearCandidates = filterHistoricalFootwearAffinity(
    structurallyCompatible,
    selectedAssets
  );
  const detailCandidates = filterHistoricalDetailAffinity(
    footwearCandidates,
    selectedAssets
  );
  const eraCandidates = filterSameEraAffinity(detailCandidates, selectedAssets);
  const singularityCandidates = filterSecondaryVisualSingularities(
    eraCandidates,
    selectedAssets
  );
  const profileCandidates = filterAssetsForRandomProfile(
    singularityCandidates,
    profile
  );
  if (
    profile !== 'guofeng-historical' ||
    profileCandidates[0]?.slot !== 'outfit'
  ) {
    return profileCandidates;
  }

  const hairstyle = selectedAssets.find((asset) => asset.slot === 'hairstyle');
  const era = hairstyle ? inferHistoricalEra(hairstyle) : null;
  if (!era) return profileCandidates;
  const sameEra = profileCandidates.filter(
    (candidate) => inferHistoricalEra(candidate) === era
  );
  return sameEra.length > 0 ? sameEra : profileCandidates;
}

export function inferPortraitRecipeProfile(
  assets: PortraitRecipeAssetLike[]
): PortraitRecipeProfile | null {
  if (assets.length === 0) return null;
  const scores = portraitRecipeProfiles.map((profile) => ({
    profile,
    score: assets.reduce(
      (sum, asset) =>
        sum + Math.max(0, getPortraitRecipeAffinity(asset, profile)),
      0
    )
  }));
  scores.sort((a, b) => b.score - a.score);
  return scores[0].score > 0 ? scores[0].profile : null;
}

export function pickPortraitRecipeProfile(
  random: () => number
): PortraitRecipeProfile {
  const index = Math.min(
    portraitRecipeProfiles.length - 1,
    Math.floor(Math.max(0, random()) * portraitRecipeProfiles.length)
  );
  return portraitRecipeProfiles[index];
}

export function getPortraitRecipeSoftConflicts(
  assets: PortraitRecipeAssetLike[]
): Array<{ leftId: string; rightId: string; reason: string }> {
  const conflicts: Array<{ leftId: string; rightId: string; reason: string }> =
    [];
  const hairstyle = assets.find((asset) => asset.slot === 'hairstyle');
  const wardrobe = assets.find((asset) =>
    ['top', 'bottom', 'outfit', 'onePiece'].includes(asset.slot)
  );
  const top = assets.find((asset) => asset.slot === 'top');
  const bottom = assets.find((asset) => asset.slot === 'bottom');
  const background = assets.find((asset) => asset.slot === 'background');
  const pose = assets.find((asset) => asset.slot === 'pose');

  if (top && bottom) {
    const topIsSwim = inferWardrobePairingFamilies(top).has('swim');
    const bottomIsSwim = inferWardrobePairingFamilies(bottom).has('swim');
    if (topIsSwim !== bottomIsSwim) {
      conflicts.push({
        leftId: top.id,
        rightId: bottom.id,
        reason:
          '泳装上装与泳装下装应成套选择；当前跨家族手动搭配已保留，随机配方会自动避开。'
      });
    }
  }

  const swimWardrobe = assets.find(
    (asset) =>
      ['top', 'bottom', 'outfit', 'onePiece'].includes(asset.slot) &&
      inferWardrobePairingFamilies(asset).has('swim')
  );
  if (swimWardrobe && background && pose) {
    const backgroundText = assetText(background);
    const poseText = assetText(pose);
    const isPrivateBedroom = /bedroom|bed\b|卧室|床铺|床边/i.test(
      backgroundText
    );
    const isIntimateRestingPose =
      /seated-pillow-hug|hugging.+pillow|side-recline|supine|prone|坐姿抱枕|侧卧|仰卧|俯卧/i.test(
        poseText
      );
    if (isPrivateBedroom && isIntimateRestingPose) {
      conflicts.push({
        leftId: swimWardrobe.id,
        rightId: background.id,
        reason:
          '泳装、私密卧室与贴近床品的休憩姿势叠加后容易触发模型策略限制；建议改用泳池、海滩或影棚场景，或换成中性站姿。'
      });
    }
  }

  if (!hairstyle || !wardrobe) return conflicts;

  const hairText = assetText(hairstyle);
  const wardrobeText = assetText(wardrobe);
  const historicalHair = /中国古风|唐风|宋风|明风|汉风|魏晋|武侠|仙侠/.test(
    hairText
  );
  const historicalWardrobe =
    /中国古装|唐制|宋制|明制|魏晋|武侠|仙侠|新中式/.test(wardrobeText);
  const sportWardrobe =
    /运动|羽毛球|网球|球衣|sport|badminton|tennis|jersey/i.test(wardrobeText);

  if (historicalHair && !historicalWardrobe) {
    conflicts.push({
      leftId: hairstyle.id,
      rightId: wardrobe.id,
      reason: sportWardrobe
        ? '古风发型与现代运动服缺少共同叙事路线'
        : '古风发型与现代服装存在时代亲和偏差'
    });
  }
  const hairEra = inferHistoricalEra(hairstyle);
  const wardrobeEra = inferHistoricalEra(wardrobe);
  if (hairEra && wardrobeEra && hairEra !== wardrobeEra) {
    conflicts.push({
      leftId: hairstyle.id,
      rightId: wardrobe.id,
      reason: '发型与服装时代不一致；随机配方会优先同一时代，手动选择仍予保留。'
    });
  }
  return conflicts;
}
