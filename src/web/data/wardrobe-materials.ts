import type { ImagePromptSelection } from './image-prompt-core';

export const wardrobeMaterialSlots = [
  'top',
  'bottom',
  'outfit',
  'onePiece',
  'shoes'
] as const;

export type WardrobeMaterialSlot = (typeof wardrobeMaterialSlots)[number];
export type WardrobeMaterialSelection = Partial<
  Record<WardrobeMaterialSlot, string>
>;

export const wardrobeMaterialFamilies = [
  {
    id: 'natural-tailoring',
    label: '天然与裁剪',
    labelEn: 'Natural & tailored'
  },
  {
    id: 'soft-knit',
    label: '柔软与针织',
    labelEn: 'Soft & knitted'
  },
  {
    id: 'sheer-decorative',
    label: '轻透与装饰',
    labelEn: 'Sheer & decorative'
  },
  {
    id: 'technical-experimental',
    label: '科技与实验',
    labelEn: 'Technical & experimental'
  }
] as const;

export type WardrobeMaterialFamilyId =
  (typeof wardrobeMaterialFamilies)[number]['id'];

export interface WardrobeMaterialPreset {
  id: string;
  family: WardrobeMaterialFamilyId;
  label: string;
  labelEn: string;
  description: string;
  descriptionEn: string;
  rendering: string;
  renderingEn: string;
  swatch: readonly [string, string];
}

export const wardrobeMaterialPresets: WardrobeMaterialPreset[] = [
  {
    id: 'cotton-poplin',
    family: 'natural-tailoring',
    label: '高密棉府绸',
    labelEn: 'Cotton poplin',
    description: '干爽哑光，细密织纹与利落折线',
    descriptionEn: 'Dry matte finish with fine weave and crisp folds',
    rendering: '高密棉府绸的细密平纹、干爽哑光表面与利落但可弯折的布料折线',
    renderingEn:
      'the fine plain weave of dense cotton poplin, a dry matte surface, and crisp yet flexible fabric folds',
    swatch: ['#f0ede5', '#a9a294']
  },
  {
    id: 'washed-linen',
    family: 'natural-tailoring',
    label: '水洗亚麻',
    labelEn: 'Washed linen',
    description: '天然竹节纹，松弛褶皱与干燥触感',
    descriptionEn: 'Natural slubs with relaxed wrinkles and a dry hand',
    rendering: '可见亚麻竹节纱、柔和水洗色差、自然松弛褶皱与干燥低反光表面',
    renderingEn:
      'visible linen slubs, soft washed variation, relaxed natural wrinkles, and a dry low-reflection surface',
    swatch: ['#d8ccb7', '#91846f']
  },
  {
    id: 'wool-gabardine',
    family: 'natural-tailoring',
    label: '羊毛华达呢',
    labelEn: 'Wool gabardine',
    description: '细密斜纹，挺括垂坠与干净压线',
    descriptionEn: 'Dense twill with tailored drape and clean pressed lines',
    rendering: '细密羊毛斜纹、克制哑光、挺括垂坠与清楚但不僵硬的压线结构',
    renderingEn:
      'dense wool twill, restrained matte finish, tailored drape, and clean pressed structure without stiffness',
    swatch: ['#7d7b78', '#353638']
  },
  {
    id: 'boucle-tweed',
    family: 'natural-tailoring',
    label: '粗花呢',
    labelEn: 'Bouclé tweed',
    description: '颗粒织纹，挺括而有手工感',
    descriptionEn: 'Tactile weave with structured handmade character',
    rendering: '清晰颗粒织纹、轻微毛边与挺括结构',
    renderingEn:
      'visible granular weave, subtle frayed edges, and structured body',
    swatch: ['#d6c9ba', '#6c6259']
  },
  {
    id: 'washed-denim',
    family: 'natural-tailoring',
    label: '水洗牛仔',
    labelEn: 'Washed denim',
    description: '斜纹可见，边缘自然褪色',
    descriptionEn: 'Visible twill with naturally faded edges',
    rendering: '可见斜纹、自然水洗色差与受力处轻微褪色',
    renderingEn:
      'visible twill, natural wash variation, and softly faded stress points',
    swatch: ['#8fa8b6', '#405b6c']
  },
  {
    id: 'supple-leather',
    family: 'natural-tailoring',
    label: '柔韧皮革',
    labelEn: 'Supple leather',
    description: '细腻皮纹，折痕与反光受控',
    descriptionEn: 'Fine grain with controlled creases and reflections',
    rendering: '细腻真实皮纹、受力折痕与克制半哑光反射',
    renderingEn:
      'fine natural grain, tension creases, and restrained semi-matte reflections',
    swatch: ['#806a59', '#28231f']
  },
  {
    id: 'silk-satin',
    family: 'soft-knit',
    label: '丝光缎面',
    labelEn: 'Silk satin',
    description: '柔滑垂坠，细窄流动高光',
    descriptionEn: 'Fluid drape with narrow moving highlights',
    rendering: '柔滑垂坠、细窄流动高光与真实缝线',
    renderingEn: 'fluid drape, narrow moving highlights, and realistic seams',
    swatch: ['#eee6dd', '#98867f']
  },
  {
    id: 'velvet',
    family: 'soft-knit',
    label: '短绒丝绒',
    labelEn: 'Short-pile velvet',
    description: '深色吸光，转折处浮现绒光',
    descriptionEn: 'Light-absorbing depth with soft pile sheen',
    rendering: '短绒吸光表面、转折处柔和绒光与厚实垂坠',
    renderingEn:
      'light-absorbing short pile, soft directional sheen, and weighty drape',
    swatch: ['#3d2433', '#8d596f']
  },
  {
    id: 'cashmere-knit',
    family: 'soft-knit',
    label: '细绒羊绒针织',
    labelEn: 'Cashmere knit',
    description: '细密针目，柔软绒晕与温润垂坠',
    descriptionEn: 'Fine knit with a soft halo and gentle drape',
    rendering: '细密羊绒针目、克制柔软绒晕、温润哑光与自然重量垂坠',
    renderingEn:
      'fine cashmere stitches, a restrained soft halo, warm matte texture, and naturally weighted drape',
    swatch: ['#d7c8bd', '#8d796d']
  },
  {
    id: 'ribbed-jersey',
    family: 'soft-knit',
    label: '弹力罗纹针织',
    labelEn: 'Ribbed jersey',
    description: '纵向罗纹，弹性回缩与贴合褶皱',
    descriptionEn: 'Vertical ribs with elastic recovery and fitted folds',
    rendering: '清晰纵向罗纹针目、真实弹性回缩与沿身体结构形成的柔和受力褶皱',
    renderingEn:
      'clear vertical rib stitches, realistic elastic recovery, and soft tension folds that follow the garment structure',
    swatch: ['#b5ada2', '#5b5650']
  },
  {
    id: 'brushed-suede',
    family: 'soft-knit',
    label: '磨砂麂皮',
    labelEn: 'Brushed suede',
    description: '短绒哑光，触碰方向产生深浅变化',
    descriptionEn: 'Matte short nap with directional tonal shifts',
    rendering: '均匀麂皮短绒、低反光表面、随绒毛方向变化的细微深浅与柔和折痕',
    renderingEn:
      'even suede nap, a low-reflection surface, subtle directional tonal shifts, and soft creases',
    swatch: ['#ad8060', '#5e4032']
  },
  {
    id: 'layered-organza',
    family: 'sheer-decorative',
    label: '欧根纱叠层',
    labelEn: 'Layered organza',
    description: '轻透叠层，配同色不透明内衬',
    descriptionEn: 'Airy translucent layers over an opaque lining',
    rendering: '轻透欧根纱叠层、清晰薄边与同色不透明内衬',
    renderingEn:
      'airy organza layers, crisp sheer edges, and a same-color opaque lining',
    swatch: ['#e7edf0', '#a7bbc5']
  },
  {
    id: 'silk-chiffon',
    family: 'sheer-decorative',
    label: '真丝雪纺',
    labelEn: 'Silk chiffon',
    description: '轻盈半透，柔软流动并保留内衬',
    descriptionEn: 'Weightless translucency with fluid folds and lining',
    rendering:
      '轻盈半透明雪纺、柔软流动褶皱、细腻哑光薄边与维持原覆盖范围的同色不透明内衬',
    renderingEn:
      'weightless translucent chiffon, fluid soft folds, delicate matte edges, and a same-color opaque lining that preserves the original coverage',
    swatch: ['#e8dfe5', '#b49aaa']
  },
  {
    id: 'corded-lace',
    family: 'sheer-decorative',
    label: '立体绳绣蕾丝',
    labelEn: 'Corded lace',
    description: '低对比浮雕花纹，配同色完整内衬',
    descriptionEn: 'Low-contrast raised motifs over a full tonal lining',
    rendering:
      '低对比同色绳绣蕾丝、清楚浮雕纹理、真实镂空边缘与维持原覆盖范围的不透明内衬',
    renderingEn:
      'low-contrast tonal corded lace, clear raised motifs, realistic openwork edges, and an opaque lining that preserves the original coverage',
    swatch: ['#e6ded5', '#9f8f80']
  },
  {
    id: 'soft-tulle',
    family: 'sheer-decorative',
    label: '柔软薄纱网',
    labelEn: 'Soft tulle',
    description: '细密网眼叠层，轻体积与透明薄边',
    descriptionEn: 'Fine mesh layers with airy volume and sheer edges',
    rendering:
      '细密柔软网眼、多层轻体积、透明薄边与维持原覆盖范围的同色不透明内衬',
    renderingEn:
      'fine soft mesh, airy layered volume, transparent edges, and a same-color opaque lining that preserves the original coverage',
    swatch: ['#e5e7eb', '#a9afb8']
  },
  {
    id: 'sequined-mesh',
    family: 'sheer-decorative',
    label: '同色亮片网布',
    labelEn: 'Tonal sequined mesh',
    description: '细小缝制亮片，柔性底布与克制闪点',
    descriptionEn:
      'Small sewn sequins with flexible backing and controlled sparkle',
    rendering:
      '逐片缝制的细小同色亮片、可弯折网布底层、真实重力垂坠与克制离散闪点',
    renderingEn:
      'individually sewn small tonal sequins, a flexible mesh backing, realistic weighted drape, and restrained discrete sparkle',
    swatch: ['#d5cfbf', '#777265']
  },
  {
    id: 'brocade-jacquard',
    family: 'sheer-decorative',
    label: '低对比织锦提花',
    labelEn: 'Tonal brocade jacquard',
    description: '织入式暗纹，厚度适中且轮廓清楚',
    descriptionEn: 'Woven tonal motifs with moderate body and clear shape',
    rendering:
      '低对比同色织入式提花、细微浮雕经纬纹、适中厚度与稳定轮廓，不使用印花贴图',
    renderingEn:
      'low-contrast tonal woven motifs, subtly raised warp-and-weft texture, moderate body, and a stable silhouette without printed graphics',
    swatch: ['#9e7d62', '#4f3e35']
  },
  {
    id: 'crinkle-taffeta',
    family: 'sheer-decorative',
    label: '皱感塔夫绸',
    labelEn: 'Crinkle taffeta',
    description: '纸感挺度，干脆折面与低调沙沙光泽',
    descriptionEn:
      'Papery body with angular folds and a restrained rustle sheen',
    rendering: '轻量塔夫绸的纸感挺度、细碎永久皱纹、干脆折面与低调干性光泽',
    renderingEn:
      'light taffeta with papery body, fine permanent crinkles, angular folds, and a restrained dry sheen',
    swatch: ['#b9a6aa', '#66565b']
  },
  {
    id: 'metallic-laminate',
    family: 'technical-experimental',
    label: '金属覆膜',
    labelEn: 'Metallic laminate',
    description: '柔性镜面，不变成硬质盔甲',
    descriptionEn: 'Flexible mirror sheen without becoming rigid armor',
    rendering: '可弯折金属覆膜织物、连续镜面高光与真实布料褶皱，避免硬质盔甲感',
    renderingEn:
      'flexible metallic-laminated textile, continuous mirror highlights, and real fabric folds without rigid armor',
    swatch: ['#eef1f2', '#7c858d']
  },
  {
    id: 'technical-nylon',
    family: 'technical-experimental',
    label: '机能尼龙',
    labelEn: 'Technical nylon',
    description: '轻薄防泼水，利落微皱',
    descriptionEn: 'Light water-resistant finish with crisp micro-wrinkles',
    rendering: '轻量防泼水尼龙、利落微皱与低调冷光',
    renderingEn:
      'light water-resistant nylon, crisp micro-wrinkles, and a subdued cool sheen',
    swatch: ['#68737b', '#22282c']
  },
  {
    id: 'iridescent-coated-fabric',
    family: 'technical-experimental',
    label: '虹彩涂层',
    labelEn: 'Iridescent coating',
    description: '随角度变色，仍保留织物结构',
    descriptionEn: 'Angle-shifting color while retaining textile structure',
    rendering: '薄层虹彩涂层、随视角变化的冷暖色泽与清晰织物褶皱',
    renderingEn:
      'a thin iridescent coating, angle-dependent color shifts, and clearly retained textile folds',
    swatch: ['#6ee0d5', '#aa72d5']
  },
  {
    id: 'patent-vinyl',
    family: 'technical-experimental',
    label: '漆光软质涂层',
    labelEn: 'Patent vinyl',
    description: '高光涂层，柔性折痕而非硬塑外壳',
    descriptionEn: 'Glossy coating with flexible creases, not a rigid shell',
    rendering:
      '柔性漆光涂层织物、连续锐利高光、真实压缩折痕与可弯折边缘，避免硬塑外壳感',
    renderingEn:
      'flexible patent-coated textile, continuous sharp highlights, realistic compression creases, and bendable edges without a rigid plastic shell',
    swatch: ['#363438', '#09090a']
  },
  {
    id: 'scuba-neoprene',
    family: 'technical-experimental',
    label: '潜水布氯丁橡胶',
    labelEn: 'Scuba neoprene',
    description: '平滑微弹，适度厚度与雕塑感折面',
    descriptionEn:
      'Smooth stretch with moderate thickness and sculptural folds',
    rendering:
      '平滑微弹潜水布表面、适度海绵厚度、柔和回弹与有重量依据的雕塑感折面',
    renderingEn:
      'a smooth stretch scuba surface, moderate sponge-like thickness, soft recovery, and sculptural folds supported by believable weight',
    swatch: ['#59636a', '#20262b']
  },
  {
    id: 'translucent-tpu',
    family: 'technical-experimental',
    label: '半透明柔性 TPU',
    labelEn: 'Translucent TPU',
    description: '雾面透明膜，保留内衬、接缝与柔性弯折',
    descriptionEn:
      'Frosted translucent film with lining, seams, and flexible bends',
    rendering:
      '雾面半透明柔性 TPU 膜、清楚热压接缝、柔性弯折与维持原覆盖范围的同色不透明内衬',
    renderingEn:
      'frosted translucent flexible TPU film, clear heat-bonded seams, pliable bends, and a same-color opaque lining that preserves the original coverage',
    swatch: ['#d7eceb', '#7b9fa0']
  }
];

const wardrobeMaterialPresetMap = new Map(
  wardrobeMaterialPresets.map((preset) => [preset.id, preset])
);

export const defaultWardrobeMaterialSelection: WardrobeMaterialSelection = {};

export function isWardrobeMaterialSlot(
  slot: string
): slot is WardrobeMaterialSlot {
  return wardrobeMaterialSlots.includes(slot as WardrobeMaterialSlot);
}

export function getWardrobeMaterialPreset(
  id: string | undefined
): WardrobeMaterialPreset | undefined {
  return id ? wardrobeMaterialPresetMap.get(id) : undefined;
}

export function normalizeWardrobeMaterialSelection(
  value: WardrobeMaterialSelection | null | undefined,
  selection?: ImagePromptSelection
): WardrobeMaterialSelection {
  if (!value) return {};
  return wardrobeMaterialSlots.reduce<WardrobeMaterialSelection>(
    (normalized, slot) => {
      const materialId = value[slot];
      const selectedValue = selection?.[slot];
      const hasSelectedGarment =
        !selection ||
        (Array.isArray(selectedValue)
          ? selectedValue.length > 0
          : Boolean(selectedValue));
      if (
        materialId &&
        hasSelectedGarment &&
        wardrobeMaterialPresetMap.has(materialId)
      ) {
        normalized[slot] = materialId;
      }
      return normalized;
    },
    {}
  );
}

function getStructureGuard(
  slot: WardrobeMaterialSlot,
  locale: 'zh-CN' | 'en-US'
): string {
  if (locale === 'zh-CN') {
    if (slot === 'outfit')
      return '保留原有上下装分体结构、版型、颜色、覆盖范围和装饰位置';
    if (slot === 'onePiece')
      return '保留原有连体结构、版型、颜色、覆盖范围和装饰位置';
    if (slot === 'shoes')
      return '保留原有鞋型、鞋面分区、颜色、鞋底结构和装饰位置';
    return '保留原有版型、颜色、覆盖范围、开合方式和装饰位置';
  }
  if (slot === 'outfit') {
    return 'preserve the original separate top-and-bottom structure, silhouette, color, coverage, and trim placement';
  }
  if (slot === 'onePiece') {
    return 'preserve the original connected one-piece structure, silhouette, color, coverage, and trim placement';
  }
  if (slot === 'shoes') {
    return 'preserve the original shoe silhouette, upper paneling, color, sole construction, and trim placement';
  }
  return 'preserve the original silhouette, color, coverage, closure, and trim placement';
}

function getMaterialReplacementTarget(
  slot: WardrobeMaterialSlot,
  locale: 'zh-CN' | 'en-US'
): string {
  if (locale === 'zh-CN') {
    if (slot === 'outfit') return '仅将该套装上下装的原始主面料改为';
    if (slot === 'shoes') return '仅将这双鞋的主要鞋面材质改为';
    return '仅将该服装的原始主面料改为';
  }
  if (slot === 'outfit') {
    return "change only this outfit's primary fabrics to";
  }
  if (slot === 'shoes') {
    return "change only this footwear's primary upper material to";
  }
  return "change only this garment's primary fabric to";
}

export function applyWardrobeMaterialPrefix(
  slot: string,
  prompt: string,
  selection: WardrobeMaterialSelection | null | undefined,
  locale: 'zh-CN' | 'en-US'
): string {
  if (!prompt || !isWardrobeMaterialSlot(slot)) return prompt;
  const preset = getWardrobeMaterialPreset(selection?.[slot]);
  if (!preset) return prompt;

  const guard = getStructureGuard(slot, locale);
  const target = getMaterialReplacementTarget(slot, locale);
  if (locale === 'zh-CN') {
    return `材质替换：${target}“${preset.label}”，${guard}；真实呈现${preset.rendering}。原服装：${prompt}`;
  }
  return `Material replacement: ${target} ${preset.labelEn}; ${guard}; render ${preset.renderingEn}. Original garment: ${prompt}`;
}
