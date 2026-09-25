import {
  buildPortraitPhotographicExecution,
  formatPortraitPhotographicExecution
} from './portrait-photographic-execution';
import {
  filterAssetsForPortraitRecipeRandomContext,
  filterSecondaryVisualSingularities,
  getPortraitVisualSingularityKind,
  getPortraitRecipeSamplingWeight,
  getPortraitRecipeWardrobeSlots,
  getPortraitRecipeSoftConflicts,
  inferPortraitRecipeProfile,
  pickPortraitRecipeProfile,
  portraitRecipeProfiles,
  type PortraitRecipeProfile
} from './portrait-recipe-compatibility';
import {
  getPortraitExpressionConflicts,
  hasPortraitExpressionCameraConflict
} from './portrait-expression-compatibility';
import {
  IMAGE_PROMPT_RECIPE_AUDIT_SCHEMA_VERSION,
  type ImagePromptRecipeAudit
} from '../../shared/image-prompt-recipe-audit';
import {
  applyWardrobeMaterialPrefix,
  normalizeWardrobeMaterialSelection,
  type WardrobeMaterialSelection
} from './wardrobe-materials';
// 所有 slot 的"户口本"——加新 slot 只改这里 + 加 i18n key + DB migration
// visual 复用既有 shape 枚举；defaultAssetId 保留给样例/预设场景，工作台默认不预选素材
const SLOT_REGISTRY = [
  {
    id: 'character',
    randomInclusionRate: 1,
    visual: { tone: '#f2ecff', accent: '#7c5cff', shape: 'portrait' },
    labelZh: '主体人设',
    hintZh: '人物设定 / 五官 / 气质，不平均但协调',
    directorRole: '人物、年龄边界、五官、妆容与气质',
    defaultAssetId: 'character-violet-anime-girl'
  },
  {
    id: 'expression',
    randomInclusionRate: 1,
    visual: { tone: '#fff4df', accent: '#f0a934', shape: 'portrait' },
    labelZh: '表情与眼神',
    hintZh: '眼神 / 嘴角 / 面部肌肉 / 情绪强度',
    directorRole: '面部表情、眼神、嘴角和情绪强度',
    defaultAssetId: null
  },
  {
    id: 'hairstyle',
    randomInclusionRate: 0.8,
    visual: { tone: '#f1e8e3', accent: '#6f4b3e', shape: 'portrait' },
    labelZh: '发型',
    hintZh: '盘发 / 束发 / 刘海 / 发丝结构',
    directorRole: '发型轮廓、分缝、盘发与束发结构、发丝走向和时代气质',
    defaultAssetId: null
  },
  {
    id: 'pose',
    randomInclusionRate: 1,
    visual: { tone: '#eef7fb', accent: '#54a7bd', shape: 'pose' },
    labelZh: '姿势动作',
    hintZh: '身体重心与肢体动作',
    directorRole: '时间切片、主事件、姿态、动作链与视线落点',
    defaultAssetId: 'pose-relaxed-standing'
  },
  {
    id: 'top',
    randomInclusionRate: 1,
    visual: { tone: '#f7f0e7', accent: '#c5a98c', shape: 'outfit' },
    labelZh: '上装',
    hintZh: '剪裁 / 面料 / 颜色',
    directorRole: '上半身服装结构、材质、颜色与肩颈线条',
    defaultAssetId: 'top-cream-oversized-blazer'
  },
  {
    id: 'bottom',
    randomInclusionRate: 1,
    visual: { tone: '#eef1f8', accent: '#344b7a', shape: 'outfit' },
    labelZh: '下装',
    hintZh: '廓形与腰胯线',
    directorRole: '下装结构、腰胯转折、腿部比例与材质',
    defaultAssetId: 'bottom-navy-pleated-skirt'
  },
  {
    id: 'outfit',
    randomInclusionRate: 0.35,
    visual: { tone: '#f3edf7', accent: '#77558c', shape: 'outfit' },
    labelZh: '套装',
    hintZh: '成套上装与下装 / 连体造型',
    directorRole: '完整服装组合、上下装配套关系、整体廓形与材质协调',
    defaultAssetId: null
  },
  {
    id: 'onePiece',
    randomInclusionRate: 0.2,
    visual: { tone: '#f6eee8', accent: '#986a50', shape: 'outfit' },
    labelZh: '一体式服装',
    hintZh: '连衣裙 / 连体裤 / 单件完整廓形',
    directorRole: '覆盖躯干与下半身的单件服装、连续廓形、材质与长度',
    defaultAssetId: null
  },
  {
    id: 'shoes',
    randomInclusionRate: 0.65,
    visual: { tone: '#f7ece7', accent: '#1d1b1b', shape: 'shoe' },
    labelZh: '鞋履',
    hintZh: '款式 / 颜色 / 材质',
    directorRole: '鞋履款式、材质与全身造型收束',
    defaultAssetId: 'shoes-black-mary-jane'
  },
  {
    id: 'background',
    randomInclusionRate: 1,
    visual: { tone: '#fbf7ef', accent: '#d7c4ad', shape: 'landscape' },
    labelZh: '场景',
    hintZh: '空间与环境氛围',
    directorRole: '场景、前中后景、环境细节与人物关系',
    defaultAssetId: 'background-warm-studio'
  },
  {
    id: 'productSubject',
    randomInclusionRate: 0,
    visibleInComposer: false,
    visual: { tone: '#f4f7f8', accent: '#4d7c8a', shape: 'prop' },
    labelZh: '产品主体',
    hintZh: '商品 / 食物 / 建筑 / 物件本体',
    directorRole: '非人物主体、产品形态、材质、卖点和可识别轮廓',
    defaultAssetId: null
  },
  {
    id: 'productSurface',
    randomInclusionRate: 0,
    visibleInComposer: false,
    visual: { tone: '#f5f1ea', accent: '#9b7a54', shape: 'landscape' },
    labelZh: '台面环境',
    hintZh: '承托面 / 道具环境 / 商业背景',
    directorRole: '商品承托面、环境关系、背景材质和空间深度',
    defaultAssetId: null
  },
  {
    id: 'composition',
    randomInclusionRate: 0.35,
    visual: { tone: '#eef2ff', accent: '#5262d6', shape: 'style' },
    labelZh: '构图方式',
    hintZh: 'KV / 主图 / 封面 / 视觉重心',
    directorRole: '主体占比、构图骨架、视觉重心、留白和阅读路径',
    defaultAssetId: null
  },
  {
    id: 'titleArea',
    randomInclusionRate: 0,
    visibleInComposer: false,
    visual: { tone: '#f7f7ec', accent: '#8a8f3d', shape: 'style' },
    labelZh: '标题区',
    hintZh: '文案留白 / 标题安全区 / 信息承载',
    directorRole: '标题留白、安全区、文案位置和信息承载空间',
    defaultAssetId: null
  },
  {
    id: 'style',
    randomInclusionRate: 1,
    visual: { tone: '#eef6ff', accent: '#6e9bd6', shape: 'style' },
    labelZh: '视觉风格',
    hintZh: '画面气质与叙事方向',
    directorRole: '主 route、整体摄影风格、气质与平台语境',
    defaultAssetId: 'style-delicate-anime-watercolor'
  },
  {
    id: 'lighting',
    randomInclusionRate: 1,
    visual: { tone: '#fff8e8', accent: '#f0c35b', shape: 'style' },
    labelZh: '光影',
    hintZh: '光线方向与影调',
    directorRole: '光源方向、落点、高光、阴影、滤镜与质感',
    defaultAssetId: 'lighting-large-softbox'
  },
  {
    id: 'visualEffect',
    randomInclusionRate: 0.3,
    visual: { tone: '#f0f4ff', accent: '#6f7dff', shape: 'style' },
    labelZh: '视觉效果',
    hintZh: '叠影 / 速度线 / 雾 / 色散',
    directorRole: '后期效果、动态视觉、镜头缺陷和氛围增强',
    defaultAssetId: null
  },
  {
    id: 'layoutDesign',
    randomInclusionRate: 0,
    visibleInComposer: false,
    visual: { tone: '#f2f0ea', accent: '#27272a', shape: 'style' },
    labelZh: '版式设计',
    hintZh: '标题 / 字体 / 标签 / 信息区',
    directorRole: '版式骨架、阅读路径、文字系统、信息层级和装饰符号',
    defaultAssetId: null
  },
  // —— 以下 slot 仍可由用户/运营继续扩展；当前内置少量官方预设 ——
  {
    id: 'accessory',
    randomInclusionRate: 0.45,
    visual: { tone: '#f8e9f0', accent: '#c4528b', shape: 'outfit' },
    labelZh: '配饰',
    hintZh: '项链 / 手包 / 帽子',
    directorRole: '发饰、首饰、点缀色、细节丰富度',
    defaultAssetId: null
  },
  {
    id: 'prop',
    randomInclusionRate: 0.35,
    visual: { tone: '#f1f3e8', accent: '#7d8c46', shape: 'outfit' },
    labelZh: '道具',
    hintZh: '手中物 / 互动道具',
    directorRole: '手中物、互动事件和动作链支点',
    defaultAssetId: null
  },
  {
    id: 'lens',
    randomInclusionRate: 1,
    visual: { tone: '#e8eef5', accent: '#465e85', shape: 'style' },
    labelZh: '镜头质感',
    hintZh: '介质 / 光学渲染 / 颗粒 / 炫光',
    directorRole:
      '拍摄介质、光学渲染、颗粒、炫光、畸变和影调响应；不控制景别与机位',
    defaultAssetId: null
  },
  {
    id: 'shot',
    randomInclusionRate: 1,
    visual: { tone: '#f0ede4', accent: '#7d6a4a', shape: 'style' },
    labelZh: '景别',
    hintZh: '裁切边界 / 主体占比 / 拍摄距离',
    directorRole:
      '人物裁切边界、主体占比与拍摄距离；不控制机位、视角和镜头质感',
    defaultAssetId: null
  },
  {
    id: 'viewpoint',
    randomInclusionRate: 1,
    visual: { tone: '#edf0f5', accent: '#596579', shape: 'style' },
    labelZh: '机位与视角',
    hintZh: '俯仰 / 环绕方位 / 画面滚转',
    directorRole:
      '相机相对主体的高度、俯仰、水平环绕方位和画面滚转；不控制景别、构图、镜头质感或动作',
    defaultAssetId: null
  },
  {
    id: 'makeup',
    randomInclusionRate: 1,
    visual: { tone: '#f6e4e3', accent: '#a8615c', shape: 'portrait' },
    labelZh: '妆容与肤质',
    hintZh: '眼妆 / 唇妆 / 皮肤高光 / 真实纹理',
    directorRole: '妆容、肤质、眼唇色彩和脸部风格稳定性',
    defaultAssetId: null
  }
] as const;

export type ImagePromptSlot = (typeof SLOT_REGISTRY)[number]['id'];

const imagePromptSlotIdSet = new Set<string>(
  SLOT_REGISTRY.map((slot) => slot.id)
);

export function isImagePromptSlot(value: string): value is ImagePromptSlot {
  return imagePromptSlotIdSet.has(value);
}

export const multiSelectImagePromptSlots = [
  'lighting',
  'visualEffect',
  'accessory',
  'prop'
] as const satisfies readonly ImagePromptSlot[];

const multiSelectImagePromptSlotSet = new Set<ImagePromptSlot>(
  multiSelectImagePromptSlots
);

export type ImagePromptSelectionValue = string | string[] | null;
export type ImagePromptSelection = Record<
  ImagePromptSlot,
  ImagePromptSelectionValue
>;

const legacyCameraAssetIdAliases: Readonly<Record<string, string>> = {
  'lens-35mm-documentary': 'lens-35mm-color-negative',
  'lens-85mm-portrait': 'lens-medium-format-editorial',
  'lens-anamorphic-cinematic': 'lens-anamorphic-rendering',
  'lens-phone-selfie': 'lens-smartphone-computational',
  'lens-disposable-flash': 'lens-disposable-direct-flash',
  'lens-vintage-film': 'lens-35mm-color-negative',
  'lens-fisheye-street': 'lens-fisheye-optical',
  'lens-iphone-depth-lockscreen': 'lens-smartphone-computational',
  'lens-24mm-environmental': 'lens-clean-digital',
  'lens-135mm-telephoto': 'lens-medium-format-editorial',
  'lens-macro-beauty': 'lens-clean-digital',
  'lens-soft-focus-dream': 'lens-vintage-diffusion',
  'shot-extreme-eye-closeup': 'shot-extreme-detail-eyes',
  'shot-half-body': 'shot-waist-up',
  'shot-cowboy-three-quarter': 'shot-knee-up',
  'shot-wide-environmental': 'shot-long',
  'shot-profile-closeup': 'shot-face-closeup',
  'shot-over-shoulder': 'shot-head-shoulders',
  'shot-top-down-portrait': 'shot-head-shoulders',
  'shot-low-angle-hero': 'shot-full-body',
  'shot-phone-mirror-selfie': 'shot-knee-up',
  'shot-dutch-angle': 'shot-waist-up'
};

const portraitPhotographicStyleAssetIds = new Set([
  'style-clean-product-editorial',
  'style-cinematic-rainy-film',
  'style-delicate-anime-watercolor',
  'style-direct-flash-paparazzi',
  'style-dreamy-backlit-outdoor',
  'style-game-character-concept',
  'style-glossy-idol-magazine',
  'style-high-contrast-noir',
  'style-high-end-fashion-photo',
  'style-japanese-street-snap',
  'style-live-action-anime-cosplay-editorial',
  'style-medium-format-fine-art',
  'style-neon-open-world-poster',
  'style-pastel-lookbook-photo',
  'style-phone-raw-snapshot',
  'style-retro-pop-album-cover',
  'style-soft-3d-clay',
  'style-tungsten-documentary'
]);

export function isMultiSelectImagePromptSlot(slot: ImagePromptSlot): boolean {
  return multiSelectImagePromptSlotSet.has(slot);
}

export function normalizeImagePromptSelection(
  rawSelection?: Partial<
    Record<ImagePromptSlot, ImagePromptSelectionValue>
  > | null
): ImagePromptSelection {
  const source =
    rawSelection && typeof rawSelection === 'object' ? rawSelection : {};
  const typedSource = source as Partial<
    Record<ImagePromptSlot, ImagePromptSelectionValue>
  >;

  const normalized = Object.fromEntries(
    SLOT_REGISTRY.map((slot) => {
      const rawValue = typedSource[slot.id];
      const ids = (
        Array.isArray(rawValue)
          ? rawValue.filter(
              (value): value is string =>
                typeof value === 'string' && value.trim().length > 0
            )
          : typeof rawValue === 'string' && rawValue.trim()
            ? [rawValue]
            : []
      ).map((id) => legacyCameraAssetIdAliases[id] || id);

      return [
        slot.id,
        isMultiSelectImagePromptSlot(slot.id) ? ids : ids[0] || null
      ];
    })
  ) as ImagePromptSelection;

  if (normalized.onePiece) {
    return { ...normalized, top: null, bottom: null, outfit: null };
  }
  return normalized.outfit
    ? { ...normalized, top: null, bottom: null, onePiece: null }
    : normalized;
}

function enforceWardrobeMutualExclusion(
  selection: ImagePromptSelection,
  selectedSlot: ImagePromptSlot
): ImagePromptSelection {
  if (selectedSlot === 'outfit' && selection.outfit) {
    return { ...selection, top: null, bottom: null, onePiece: null };
  }
  if (selectedSlot === 'onePiece' && selection.onePiece) {
    return { ...selection, top: null, bottom: null, outfit: null };
  }
  if (
    (selectedSlot === 'top' || selectedSlot === 'bottom') &&
    selection[selectedSlot]
  ) {
    return { ...selection, outfit: null, onePiece: null };
  }
  return selection;
}

export function getSelectedAssetIds(
  selection: ImagePromptSelection,
  slot: ImagePromptSlot
): string[] {
  const value = selection[slot];
  if (Array.isArray(value)) {
    return value.filter(Boolean);
  }
  return value ? [value] : [];
}

export function getPrimarySelectedAssetId(
  selection: ImagePromptSelection,
  slot: ImagePromptSlot
): string | null {
  return getSelectedAssetIds(selection, slot)[0] || null;
}

export function isImagePromptAssetSelected(
  selection: ImagePromptSelection,
  asset: Pick<ImagePromptAsset, 'id' | 'slot'>
): boolean {
  return getSelectedAssetIds(selection, asset.slot).includes(asset.id);
}

export function toggleImagePromptAssetSelection(
  selection: ImagePromptSelection,
  asset: Pick<ImagePromptAsset, 'id' | 'slot'>
): ImagePromptSelection {
  const normalized = normalizeImagePromptSelection(selection);
  if (!isMultiSelectImagePromptSlot(asset.slot)) {
    return enforceWardrobeMutualExclusion(
      {
        ...normalized,
        [asset.slot]: normalized[asset.slot] === asset.id ? null : asset.id
      },
      asset.slot
    );
  }

  const selectedIds = getSelectedAssetIds(normalized, asset.slot);
  const nextIds = selectedIds.includes(asset.id)
    ? selectedIds.filter((id) => id !== asset.id)
    : [...selectedIds, asset.id];
  return {
    ...normalized,
    [asset.slot]: nextIds
  };
}

export function setImagePromptAssetSelection(
  selection: ImagePromptSelection,
  asset: Pick<ImagePromptAsset, 'id' | 'slot'>
): ImagePromptSelection {
  const normalized = normalizeImagePromptSelection(selection);
  if (!isMultiSelectImagePromptSlot(asset.slot)) {
    return enforceWardrobeMutualExclusion(
      {
        ...normalized,
        [asset.slot]: asset.id
      },
      asset.slot
    );
  }

  const selectedIds = getSelectedAssetIds(normalized, asset.slot);
  return {
    ...normalized,
    [asset.slot]: selectedIds.includes(asset.id)
      ? selectedIds
      : [...selectedIds, asset.id]
  };
}

export function replaceImagePromptAssetSelectionId(
  selection: ImagePromptSelection,
  slot: ImagePromptSlot,
  currentId: string,
  nextId: string
): ImagePromptSelection {
  const normalized = normalizeImagePromptSelection(selection);
  if (!isMultiSelectImagePromptSlot(slot)) {
    return {
      ...normalized,
      [slot]: normalized[slot] === currentId ? nextId : normalized[slot]
    };
  }

  return {
    ...normalized,
    [slot]: getSelectedAssetIds(normalized, slot).map((id) =>
      id === currentId ? nextId : id
    )
  };
}

export function removeImagePromptSelectionId(
  selection: ImagePromptSelection,
  id: string
): ImagePromptSelection {
  const normalized = normalizeImagePromptSelection(selection);
  return Object.fromEntries(
    imagePromptSlots.map((slot) => {
      if (!isMultiSelectImagePromptSlot(slot.id)) {
        return [
          slot.id,
          normalized[slot.id] === id ? null : normalized[slot.id]
        ];
      }
      return [
        slot.id,
        getSelectedAssetIds(normalized, slot.id).filter(
          (selectedId) => selectedId !== id
        )
      ];
    })
  ) as ImagePromptSelection;
}

export function clearImagePromptSelectionSlot(
  selection: ImagePromptSelection,
  slot: ImagePromptSlot
): ImagePromptSelection {
  return {
    ...normalizeImagePromptSelection(selection),
    [slot]: isMultiSelectImagePromptSlot(slot) ? [] : null
  };
}

export function buildRandomImagePromptSelection(
  assets: ImagePromptAsset[],
  random: () => number = Math.random
): ImagePromptSelection {
  return buildRandomImagePromptSelectionForProfile(
    assets,
    pickPortraitRecipeProfile(random),
    random
  );
}

export function buildRandomImagePromptSelectionForProfile(
  assets: ImagePromptAsset[],
  profile: PortraitRecipeProfile,
  random: () => number = Math.random
): ImagePromptSelection {
  return buildRandomImagePromptSelectionForProfileInternal(
    assets,
    profile,
    random
  ).selection;
}

type RandomCompatibilityAdjustment =
  | 'cleared_shoes_outside_frame'
  | 'cleared_prop_hands_outside_frame'
  | 'cleared_prop_pose_occupies_hands'
  | 'cleared_pose_outside_frame'
  | 'cleared_wardrobe_outside_frame'
  | 'cleared_face_detail_outside_frame'
  | 'normalized_mirror_selfie_viewpoint';

interface RandomSelectionResult {
  selection: ImagePromptSelection;
  constraintAdjustments: RandomCompatibilityAdjustment[];
}

export interface AuditedRandomImagePromptSelectionResult extends RandomSelectionResult {
  audit: ImagePromptRecipeAudit;
}

function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function pickWeightedPortraitRecipeAsset<T extends ImagePromptAsset>(
  candidates: T[],
  profile: PortraitRecipeProfile,
  selectedAssets: ImagePromptAsset[],
  random: () => number
): T {
  const weighted = candidates.map((asset) => ({
    asset,
    weight: getPortraitRecipeSamplingWeight(asset, profile, selectedAssets)
  }));
  const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0);
  let cursor = Math.max(0, Math.min(0.999999999999, random())) * totalWeight;
  for (const item of weighted) {
    cursor -= item.weight;
    if (cursor < 0) return item.asset;
  }
  return weighted[weighted.length - 1].asset;
}

export function createImagePromptRecipeSeed(): number {
  const values = new Uint32Array(1);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(values);
    return values[0];
  }
  return (Date.now() ^ Math.floor(Math.random() * 0x100000000)) >>> 0;
}

function getSelectionAssetIds(selection: ImagePromptSelection): string[] {
  return imagePromptSlots.flatMap((slot) =>
    getSelectedAssetIds(selection, slot.id)
  );
}

const recipeCompilerVersionCache = new WeakMap<ImagePromptAsset[], string>();
const portraitRandomCandidatesCache = new WeakMap<
  ImagePromptAsset[],
  Map<ImagePromptSlot, ImagePromptAsset[]>
>();

function getPortraitRandomCandidates(
  assets: ImagePromptAsset[],
  slot: ImagePromptSlot
): ImagePromptAsset[] {
  let candidatesBySlot = portraitRandomCandidatesCache.get(assets);
  if (!candidatesBySlot) {
    candidatesBySlot = new Map();
    portraitRandomCandidatesCache.set(assets, candidatesBySlot);
  }
  const cached = candidatesBySlot.get(slot);
  if (cached) return cached;
  const candidates = assets.filter(
    (asset) => asset.slot === slot && isPortraitRandomEligible(asset)
  );
  candidatesBySlot.set(slot, candidates);
  return candidates;
}

function hashRecipeCompilerContract(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function getImagePromptRecipeCompilerVersion(
  assets: ImagePromptAsset[]
): string {
  const cached = recipeCompilerVersionCache.get(assets);
  if (cached) return cached;
  const contractSeeds = [0x28580675, 0x5f3759df, 0x9e3779b9, 0xc0decafe];
  const contract = portraitRecipeProfiles.flatMap((profile, profileIndex) =>
    contractSeeds.map((seed) => {
      const random = createSeededRandom(seed + profileIndex * 0x9e3779b9);
      const result = buildRandomImagePromptSelectionForProfileInternal(
        assets,
        profile,
        random
      );
      return `${profile}:${seed}:${getSelectionAssetIds(result.selection).join(',')}:${result.constraintAdjustments.join(',')}`;
    })
  );
  contract.push(
    assets
      .map((asset) =>
        [
          asset.id,
          asset.slot,
          asset.prompt,
          asset.promptZh || '',
          ...asset.tags
        ].join('\u001f')
      )
      .sort()
      .join('\u001e')
  );
  const version = `portrait-recipe-${hashRecipeCompilerContract(contract.join('|'))}`;
  recipeCompilerVersionCache.set(assets, version);
  return version;
}

export function buildAuditedRandomImagePromptSelection(
  assets: ImagePromptAsset[],
  seed = createImagePromptRecipeSeed()
): AuditedRandomImagePromptSelectionResult {
  const random = createSeededRandom(seed);
  const profile = pickPortraitRecipeProfile(random);
  const result = buildRandomImagePromptSelectionForProfileInternal(
    assets,
    profile,
    random
  );
  return {
    ...result,
    audit: {
      schemaVersion: IMAGE_PROMPT_RECIPE_AUDIT_SCHEMA_VERSION,
      compilerVersion: getImagePromptRecipeCompilerVersion(assets),
      selectionSource: 'random_recipe',
      selectedAssetIds: getSelectionAssetIds(result.selection),
      profile,
      seed,
      constraintAdjustments: result.constraintAdjustments
    }
  };
}

function buildRandomImagePromptSelectionForProfileInternal(
  assets: ImagePromptAsset[],
  profile: PortraitRecipeProfile,
  random: () => number
): RandomSelectionResult {
  let selection = defaultImagePromptSelection;
  const wardrobeSlots = getPortraitRecipeWardrobeSlots(profile);
  // A route's clothing world must exist before hair, setting, makeup and
  // objects are sampled; otherwise those earlier slots cannot apply their
  // same-dynasty or same-route affinity rules.
  const routeAwareSlotOrder = [
    ...imagePromptSlots.filter((slot) =>
      wardrobeSlots.includes(slot.id as (typeof wardrobeSlots)[number])
    ),
    ...imagePromptSlots.filter(
      (slot) => !['top', 'bottom', 'outfit', 'onePiece'].includes(slot.id)
    )
  ];

  routeAwareSlotOrder.forEach((slot) => {
    if (
      ['top', 'bottom', 'outfit', 'onePiece'].includes(slot.id) &&
      !wardrobeSlots.includes(slot.id as (typeof wardrobeSlots)[number])
    ) {
      return;
    }
    if (
      slot.id === 'bottom' &&
      getSelectedAssetIds(selection, 'top').some((id) => {
        const top = getAssetById(id, assets);
        return top ? getOutfitCoverage(top) !== 'separates' : false;
      })
    ) {
      return;
    }

    const eligibleCandidates = getPortraitRandomCandidates(assets, slot.id);
    const compatibleCandidates = filterRandomCandidatesBySelection(
      slot.id,
      eligibleCandidates,
      selection,
      assets
    );
    const selectedAssets = imagePromptSlots
      .flatMap((item) =>
        getSelectedAssetIds(selection, item.id).map((id) =>
          getAssetById(id, assets)
        )
      )
      .filter((asset): asset is ImagePromptAsset => Boolean(asset));
    const profileCandidates = filterAssetsForPortraitRecipeRandomContext(
      compatibleCandidates,
      profile,
      selectedAssets
    );
    const candidates = profileCandidates;
    if (candidates.length === 0) return selection;
    const isRequiredRouteWardrobe =
      wardrobeSlots.length === 1 && wardrobeSlots[0] === slot.id;
    if (
      !isRequiredRouteWardrobe &&
      slot.randomInclusionRate < 1 &&
      random() >= slot.randomInclusionRate
    ) {
      return;
    }
    selection = setImagePromptAssetSelection(
      selection,
      pickWeightedPortraitRecipeAsset(
        candidates,
        profile,
        selectedAssets,
        random
      )
    );
  });

  const constraintAdjustments: RandomCompatibilityAdjustment[] = [];
  return {
    selection: reconcileRandomSelectionCompatibility(
      selection,
      assets,
      constraintAdjustments
    ),
    constraintAdjustments
  };
}

function reconcileRandomSelectionCompatibility(
  selection: ImagePromptSelection,
  assets: ImagePromptAsset[],
  adjustments?: RandomCompatibilityAdjustment[]
): ImagePromptSelection {
  let reconciled = selection;
  const selectedShot = getAssetById(
    getPrimarySelectedAssetId(reconciled, 'shot'),
    assets
  );
  if (selectedShot && !shotShowsFootwear(selectedShot)) {
    if (getSelectedAssetIds(reconciled, 'shoes').length > 0) {
      adjustments?.push('cleared_shoes_outside_frame');
    }
    reconciled = clearImagePromptSelectionSlot(reconciled, 'shoes');
  }
  if (selectedShot && !shotShowsHands(selectedShot)) {
    if (getSelectedAssetIds(reconciled, 'prop').length > 0) {
      adjustments?.push('cleared_prop_hands_outside_frame');
    }
    reconciled = clearImagePromptSelectionSlot(reconciled, 'prop');
  }
  if (
    selectedShot &&
    shotRequiresPoseRemoval(selectedShot) &&
    getSelectedAssetIds(reconciled, 'pose').length > 0
  ) {
    adjustments?.push('cleared_pose_outside_frame');
    reconciled = clearImagePromptSelectionSlot(reconciled, 'pose');
  }
  if (selectedShot && shotRequiresPoseRemoval(selectedShot)) {
    const wardrobeSlots: ImagePromptSlot[] = [
      'top',
      'bottom',
      'outfit',
      'onePiece'
    ];
    if (
      wardrobeSlots.some(
        (slot) => getSelectedAssetIds(reconciled, slot).length > 0
      )
    ) {
      adjustments?.push('cleared_wardrobe_outside_frame');
      wardrobeSlots.forEach((slot) => {
        reconciled = clearImagePromptSelectionSlot(reconciled, slot);
      });
    }
  }
  if (selectedShot?.id === 'shot-extreme-long') {
    const faceDetailSlots: ImagePromptSlot[] = ['expression', 'makeup'];
    if (
      faceDetailSlots.some(
        (slot) => getSelectedAssetIds(reconciled, slot).length > 0
      )
    ) {
      adjustments?.push('cleared_face_detail_outside_frame');
      faceDetailSlots.forEach((slot) => {
        reconciled = clearImagePromptSelectionSlot(reconciled, slot);
      });
    }
  }

  const selectedPose = getAssetById(
    getPrimarySelectedAssetId(reconciled, 'pose'),
    assets
  );
  const selectedViewpoint = getAssetById(
    getPrimarySelectedAssetId(reconciled, 'viewpoint'),
    assets
  );
  if (
    selectedPose &&
    poseRequiresMirrorSelfieViewpoint(selectedPose) &&
    selectedViewpoint &&
    !viewpointSupportsMirrorSelfie(selectedViewpoint)
  ) {
    adjustments?.push('normalized_mirror_selfie_viewpoint');
    const eyeLevel = assets.find(
      (asset) =>
        asset.slot === 'viewpoint' && viewpointSupportsMirrorSelfie(asset)
    );
    reconciled = eyeLevel
      ? setImagePromptAssetSelection(reconciled, eyeLevel)
      : clearImagePromptSelectionSlot(reconciled, 'viewpoint');
  }
  if (selectedPose && poseOccupiesHands(selectedPose)) {
    if (getSelectedAssetIds(reconciled, 'prop').length > 0) {
      adjustments?.push('cleared_prop_pose_occupies_hands');
    }
    reconciled = clearImagePromptSelectionSlot(reconciled, 'prop');
  }

  return reconciled;
}

export function randomizeImagePromptSelectionSlot(
  selection: ImagePromptSelection,
  slot: ImagePromptSlot,
  assets: ImagePromptAsset[],
  random: () => number = Math.random,
  adjustments?: RandomCompatibilityAdjustment[]
): ImagePromptSelection {
  const normalized = normalizeImagePromptSelection(selection);
  const eligibleCandidates = getPortraitRandomCandidates(assets, slot);
  const selectedIds = new Set(getSelectedAssetIds(normalized, slot));
  const rerollCandidates = eligibleCandidates.filter(
    (asset) => !selectedIds.has(asset.id)
  );
  if (rerollCandidates.length === 0) {
    return reconcileRandomSelectionCompatibility(
      normalized,
      assets,
      adjustments
    );
  }
  const compatibleCandidates = filterRandomCandidatesBySelection(
    slot,
    rerollCandidates,
    normalized,
    assets,
    slot !== 'shot'
  );
  const selectedAssets = imagePromptSlots
    .filter((item) => item.id !== slot)
    .flatMap((item) =>
      getSelectedAssetIds(normalized, item.id).map((id) =>
        getAssetById(id, assets)
      )
    )
    .filter((asset): asset is ImagePromptAsset => Boolean(asset));
  const profile = inferPortraitRecipeProfile(selectedAssets);
  const profileCandidates = profile
    ? filterAssetsForPortraitRecipeRandomContext(
        compatibleCandidates,
        profile,
        selectedAssets
      )
    : compatibleCandidates;
  const candidates = profileCandidates;
  if (candidates.length === 0) {
    return reconcileRandomSelectionCompatibility(
      normalized,
      assets,
      adjustments
    );
  }
  const selected = profile
    ? pickWeightedPortraitRecipeAsset(
        candidates,
        profile,
        selectedAssets,
        random
      )
    : candidates[
        Math.min(
          candidates.length - 1,
          Math.floor(Math.max(0, random()) * candidates.length)
        )
      ];
  const randomized = isMultiSelectImagePromptSlot(slot)
    ? { ...normalized, [slot]: [selected.id] }
    : setImagePromptAssetSelection(normalized, selected);

  return reconcileRandomSelectionCompatibility(randomized, assets, adjustments);
}

export function buildAuditedRandomizedImagePromptSelectionSlot(
  selection: ImagePromptSelection,
  slot: ImagePromptSlot,
  assets: ImagePromptAsset[],
  seed = createImagePromptRecipeSeed()
): AuditedRandomImagePromptSelectionResult {
  const random = createSeededRandom(seed);
  const normalized = normalizeImagePromptSelection(selection);
  const selectedAssets = imagePromptSlots
    .filter((item) => item.id !== slot)
    .flatMap((item) =>
      getSelectedAssetIds(normalized, item.id).map((id) =>
        getAssetById(id, assets)
      )
    )
    .filter((asset): asset is ImagePromptAsset => Boolean(asset));
  const profile = inferPortraitRecipeProfile(selectedAssets);
  const constraintAdjustments: RandomCompatibilityAdjustment[] = [];
  const randomized = randomizeImagePromptSelectionSlot(
    normalized,
    slot,
    assets,
    random,
    constraintAdjustments
  );
  return {
    selection: randomized,
    constraintAdjustments,
    audit: {
      schemaVersion: IMAGE_PROMPT_RECIPE_AUDIT_SCHEMA_VERSION,
      compilerVersion: getImagePromptRecipeCompilerVersion(assets),
      selectionSource: 'random_slot',
      selectedAssetIds: getSelectionAssetIds(randomized),
      inputAssetIds: getSelectionAssetIds(normalized),
      ...(profile ? { profile } : {}),
      seed,
      randomizedSlot: slot,
      constraintAdjustments
    }
  };
}

export type OutfitCoverage = 'separates' | 'one-piece' | 'complete-set';
export type PortraitShotFamily =
  | 'close-up'
  | 'half-body'
  | 'full-body'
  | 'selfie'
  | 'dynamic'
  | 'other';

export interface ImagePromptAssetCompatibility {
  portraitRandomEligible: boolean;
  outfitCoverage: OutfitCoverage;
  shotFamily: PortraitShotFamily;
  compatibleShotFamilies: PortraitShotFamily[];
  occupiesHands: boolean;
  showsFootwear: boolean;
  showsHands: boolean;
}

export function getOutfitCoverage(asset: ImagePromptAsset): OutfitCoverage {
  if (asset.compatibility?.outfitCoverage) {
    return asset.compatibility.outfitCoverage;
  }
  return inferOutfitCoverage(asset);
}

function inferOutfitCoverage(asset: ImagePromptAsset): OutfitCoverage {
  const text =
    `${asset.id} ${asset.title} ${asset.prompt} ${asset.promptZh || ''} ${asset.tags.join(' ')}`.toLowerCase();
  if (/\btop-dress\b|连衣裙|midi dress|maxi dress|mini dress/.test(text)) {
    return 'one-piece';
  }
  if (
    /\bmatching\b|\bcomplete set\b|\beditorial set\b|\bskort\b|\bshorts\b|\bskirt\b|套装|成套|裙裤|短裤|半裙|百褶裙|热裤|安全短裤/.test(
      text
    )
  ) {
    return 'complete-set';
  }
  return 'separates';
}

export function isPortraitRandomEligible(asset: ImagePromptAsset): boolean {
  if (typeof asset.compatibility?.portraitRandomEligible === 'boolean') {
    return asset.compatibility.portraitRandomEligible;
  }
  return inferPortraitRandomEligibility(asset);
}

function inferPortraitRandomEligibility(asset: ImagePromptAsset): boolean {
  const text =
    `${asset.id} ${asset.title} ${asset.prompt} ${asset.promptZh || ''} ${asset.tags.join(' ')}`.toLowerCase();
  if (asset.id === 'composition-ecommerce-kv-hero') return false;
  if (asset.slot === 'character') {
    if (
      /\b(boy|butler|male|man)\b|男生|男性|少年|少女|二次元|anime/.test(text)
    ) {
      return false;
    }
    if (
      /\b(girl|apprentice|trainee|heroine)\b|少女|学徒|练习生|魔法少女/.test(
        text
      ) &&
      !/\badult\b|成年/.test(text)
    ) {
      return false;
    }
    return /\b(woman|women|female|girl|heroine|model|beauty|actress)\b|女性|女孩|女主角|美人|模特|女伶|辣妹|通勤者/.test(
      text
    );
  }
  if (
    asset.slot === 'background' &&
    /classroom|school|campus|校园|教室|学校/.test(text)
  ) {
    return false;
  }
  if (asset.slot === 'style') {
    if (portraitPhotographicStyleAssetIds.has(asset.id)) return true;
    return !/product|产品|watercolor|水彩|anime|二次元|game|游戏|3d|clay|软陶|poster|海报|album cover|专辑封面/.test(
      text
    );
  }
  return true;
}

function filterRandomCandidatesBySelection(
  slot: ImagePromptSlot,
  candidates: ImagePromptAsset[],
  selection: ImagePromptSelection,
  assets: ImagePromptAsset[],
  allowPoseClearingCloseups = true
): ImagePromptAsset[] {
  const selectedAssets = imagePromptSlots
    .filter((item) => item.id !== slot)
    .flatMap((item) =>
      getSelectedAssetIds(selection, item.id).map((id) =>
        getAssetById(id, assets)
      )
    )
    .filter((asset): asset is ImagePromptAsset => Boolean(asset));
  const singularityCompatible = filterSecondaryVisualSingularities(
    candidates,
    selectedAssets
  );
  const colorModeCompatible = filterRandomColorModeCompatibility(
    singularityCompatible,
    selectedAssets
  );
  const selectedShot = getAssetById(
    getPrimarySelectedAssetId(selection, 'shot'),
    assets
  );
  let expressionCameraCompatible = colorModeCompatible;
  if (
    slot === 'expression' &&
    selectedShot?.id === 'shot-extreme-detail-eyes'
  ) {
    expressionCameraCompatible = colorModeCompatible.filter(
      (expression) => !expressionRequiresMouthVisibility(expression)
    );
  }
  const selectedViewpoint = getAssetById(
    getPrimarySelectedAssetId(selection, 'viewpoint'),
    assets
  );
  if (slot === 'expression' && selectedViewpoint) {
    const compatible = expressionCameraCompatible.filter(
      (expression) =>
        !hasPortraitExpressionCameraConflict(expression, selectedViewpoint)
    );
    expressionCameraCompatible =
      compatible.length > 0 ? compatible : expressionCameraCompatible;
  }
  let poseViewpointCompatible = expressionCameraCompatible;
  if (
    slot === 'pose' &&
    selectedViewpoint &&
    !viewpointSupportsMirrorSelfie(selectedViewpoint)
  ) {
    const compatible = colorModeCompatible.filter(
      (pose) => !poseRequiresMirrorSelfieViewpoint(pose)
    );
    poseViewpointCompatible =
      compatible.length > 0 ? compatible : colorModeCompatible;
  }
  if (slot === 'pose' && selectedViewpoint?.id === 'viewpoint-over-shoulder') {
    return poseViewpointCompatible.filter(poseSupportsOverShoulderViewpoint);
  }
  if (slot === 'viewpoint') {
    const selectedPose = getAssetById(
      getPrimarySelectedAssetId(selection, 'pose'),
      assets
    );
    const selectedExpression = getAssetById(
      getPrimarySelectedAssetId(selection, 'expression'),
      assets
    );
    let expressionCompatibleViewpoints = colorModeCompatible;
    if (selectedExpression) {
      const compatible = colorModeCompatible.filter(
        (viewpoint) =>
          !hasPortraitExpressionCameraConflict(selectedExpression, viewpoint)
      );
      expressionCompatibleViewpoints =
        compatible.length > 0 ? compatible : colorModeCompatible;
    }
    if (selectedPose && poseRequiresMirrorSelfieViewpoint(selectedPose)) {
      const compatible = expressionCompatibleViewpoints.filter(
        viewpointSupportsMirrorSelfie
      );
      return compatible.length > 0
        ? compatible
        : expressionCompatibleViewpoints;
    }
    if (selectedPose && !poseSupportsOverShoulderViewpoint(selectedPose)) {
      return expressionCompatibleViewpoints.filter(
        (viewpoint) => viewpoint.id !== 'viewpoint-over-shoulder'
      );
    }
    return expressionCompatibleViewpoints;
  }
  if (slot !== 'shot') return poseViewpointCompatible;
  const selectedExpression = getAssetById(
    getPrimarySelectedAssetId(selection, 'expression'),
    assets
  );
  const frameCompatible =
    selectedExpression && expressionRequiresMouthVisibility(selectedExpression)
      ? colorModeCompatible.filter(
          (shot) => shot.id !== 'shot-extreme-detail-eyes'
        )
      : colorModeCompatible;
  const pose = getAssetById(
    getPrimarySelectedAssetId(selection, 'pose'),
    assets
  );
  if (!pose) return frameCompatible;
  const compatibleFamilies =
    resolveAssetCompatibility(pose).compatibleShotFamilies;
  const familyCompatible =
    compatibleFamilies.length > 0
      ? frameCompatible.filter((shot) =>
          compatibleFamilies.includes(
            resolveAssetCompatibility(shot).shotFamily
          )
        )
      : frameCompatible;
  const lowerBodyCompatible = poseRequiresCompleteLowerBodyVisibility(pose)
    ? familyCompatible.filter((shot) =>
        /shot-(?:full-body|loose-full-body|environmental-quarter|long|extreme-long)/.test(
          shot.id
        )
      )
    : familyCompatible;
  const poseClearingCloseups = allowPoseClearingCloseups
    ? frameCompatible.filter(shotRequiresPoseRemoval)
    : [];
  let poseCompatible =
    lowerBodyCompatible.length > 0 ? lowerBodyCompatible : familyCompatible;
  if (poseRequiresNearFaceHandVisibility(pose)) {
    const visibleGestureShots = familyCompatible.filter(
      shotSupportsNearFaceHandGesture
    );
    poseCompatible =
      visibleGestureShots.length > 0 ? visibleGestureShots : familyCompatible;
  } else if (poseOccupiesHands(pose)) {
    const visibleHandShots = familyCompatible.filter(shotShowsHands);
    poseCompatible =
      visibleHandShots.length > 0 ? visibleHandShots : familyCompatible;
  }
  if (getSelectedAssetIds(selection, 'prop').length > 0) {
    const propVisibleShots = poseCompatible.filter(shotShowsHands);
    if (propVisibleShots.length > 0) return propVisibleShots;
  }
  return [
    ...new Map(
      [...poseCompatible, ...poseClearingCloseups].map((shot) => [
        shot.id,
        shot
      ])
    ).values()
  ];
}

type PortraitColorMode = 'monochrome' | 'explicit-color' | 'neutral';

const portraitColorModeCache = new WeakMap<
  ImagePromptAsset,
  PortraitColorMode
>();

function inferPortraitColorMode(asset: ImagePromptAsset): PortraitColorMode {
  const cached = portraitColorModeCache.get(asset);
  if (cached) return cached;
  const text =
    `${asset.id} ${asset.title} ${asset.prompt} ${asset.promptZh || ''} ${asset.tags.join(' ')}`.toLowerCase();
  let mode: PortraitColorMode = 'neutral';
  if (
    /black-and-white|monochrome|silver-gelatin|黑白|银盐黑白|单色颗粒/.test(
      text
    )
  ) {
    mode = 'monochrome';
  } else if (
    /colored gel|split gel|warm amber side key.*cool blue|golden hour|sunset key|pastel studio color|analog color separation|studio color rhythm|vivid color|双色凝胶|左右分色|金色时刻/.test(
      text
    ) ||
    (['top', 'bottom', 'outfit', 'onePiece', 'makeup', 'background'].includes(
      asset.slot
    ) &&
      /crimson|scarlet|burgundy|violet|purple|lavender|magenta|cyan|turquoise|coral|emerald|mint|cobalt|sapphire|rose[- ]?(?:pink|red)|绛红|猩红|酒红|紫罗兰|淡紫|薰衣草|洋红|青色|湖蓝|薄荷绿|珊瑚|翡翠|玫红|玫瑰粉/.test(
        text
      ))
  ) {
    mode = 'explicit-color';
  }
  portraitColorModeCache.set(asset, mode);
  return mode;
}

/**
 * Random recipes must not ask the model to preserve strong color cues and
 * render them as monochrome at the same time. Manual combinations remain
 * available for intentional experiments.
 */
function filterRandomColorModeCompatibility(
  candidates: ImagePromptAsset[],
  selectedAssets: ImagePromptAsset[]
): ImagePromptAsset[] {
  if (!['style', 'lighting', 'lens'].includes(candidates[0]?.slot || '')) {
    return candidates;
  }
  const selectedModes = new Set(selectedAssets.map(inferPortraitColorMode));
  const incompatibleMode = selectedModes.has('monochrome')
    ? 'explicit-color'
    : selectedModes.has('explicit-color')
      ? 'monochrome'
      : null;
  if (!incompatibleMode) return candidates;
  const compatible = candidates.filter(
    (candidate) => inferPortraitColorMode(candidate) !== incompatibleMode
  );
  return compatible.length > 0 ? compatible : candidates;
}

function expressionRequiresMouthVisibility(asset: ImagePromptAsset): boolean {
  const text =
    `${asset.id} ${asset.title} ${asset.prompt} ${asset.promptZh || ''} ${asset.tags.join(' ')}`.toLowerCase();
  return /laugh|smile|grin|tongue|teeth|lip|mouth|大笑|笑|露齿|吐舌|嘴|唇/.test(
    text
  );
}

function poseSupportsOverShoulderViewpoint(asset: ImagePromptAsset): boolean {
  const text =
    `${asset.id} ${asset.title} ${asset.prompt} ${asset.promptZh || ''} ${asset.tags.join(' ')}`.toLowerCase();
  return /lookback|look.back|turning|turned|torso rotation|twist|回望|回眸|转身|回身|躯干旋转|扭转/.test(
    text
  );
}

function poseRequiresMirrorSelfieViewpoint(asset: ImagePromptAsset): boolean {
  const text =
    `${asset.id} ${asset.title} ${asset.prompt} ${asset.promptZh || ''} ${asset.tags.join(' ')}`.toLowerCase();
  return /mirror.selfie|镜面自拍/.test(text);
}

function viewpointSupportsMirrorSelfie(asset: ImagePromptAsset): boolean {
  return asset.id === 'viewpoint-eye-level-frontal';
}

function shotRequiresPoseRemoval(asset: ImagePromptAsset): boolean {
  return /shot-(?:extreme-detail-eyes|face-closeup|lower-face-detail)/.test(
    asset.id
  );
}

function poseRequiresNearFaceHandVisibility(asset: ImagePromptAsset): boolean {
  const text =
    `${asset.id} ${asset.title} ${asset.prompt} ${asset.promptZh || ''}`.toLowerCase();
  return /hand-near-face|facepalm|touch.cheek|手靠近脸|扶额|托腮/.test(text);
}

function poseRequiresCompleteLowerBodyVisibility(
  asset: ImagePromptAsset
): boolean {
  const text =
    `${asset.id} ${asset.title} ${asset.prompt} ${asset.promptZh || ''}`.toLowerCase();
  return /pose-yoga|upright kneeling|both knees|cross-legged|floor-w-sit|seated-on-heels|prone-elbows|side-recline|supine-knees|chair-reverse-straddle|seated-pillow-hug|chair-edge-forward|冥想坐姿|直身跪姿|双膝落地|盘腿|w形地坐|跪坐脚跟|俯卧|侧卧|仰卧屈膝|反坐椅背|坐姿抱枕|椅沿前倾/.test(
    text
  );
}

function shotSupportsNearFaceHandGesture(asset: ImagePromptAsset): boolean {
  const text =
    `${asset.id} ${asset.title} ${asset.prompt} ${asset.promptZh || ''}`.toLowerCase();
  return !/shot-(?:extreme-detail-eyes|face-closeup|lower-face-detail)|眼部极特写|面部特写|下半脸细节特写/.test(
    text
  );
}

function shotShowsFootwear(asset: ImagePromptAsset): boolean {
  return resolveAssetCompatibility(asset).showsFootwear;
}

function shotShowsHands(asset: ImagePromptAsset): boolean {
  return resolveAssetCompatibility(asset).showsHands;
}

function poseOccupiesHands(asset: ImagePromptAsset): boolean {
  return resolveAssetCompatibility(asset).occupiesHands;
}

export function resolveAssetCompatibility(
  asset: ImagePromptAsset
): ImagePromptAssetCompatibility {
  if (asset.compatibility) return asset.compatibility;
  return inferAssetCompatibility(asset);
}

function inferAssetCompatibility(
  asset: ImagePromptAsset
): ImagePromptAssetCompatibility {
  const text = `${asset.id} ${asset.title} ${asset.prompt} ${
    asset.promptZh || ''
  } ${asset.tags.join(' ')}`.toLowerCase();
  let shotFamily: PortraitShotFamily = 'other';
  if (/selfie|mirror|自拍|镜面/.test(text)) shotFamily = 'selfie';
  else if (
    /shot-(?:extreme-detail-eyes|face-closeup|head-shoulders|lower-face-detail|clavicle-closeup)|眼部极特写|面部特写|头肩|下半脸细节特写|锁骨近景/.test(
      text
    )
  ) {
    shotFamily = 'close-up';
  } else if (
    /shot-(?:chest-up|waist-up|ribcage-up|elbow-up|hip-up)|胸上|腰上|肋下|肘上|臀上/.test(
      text
    )
  ) {
    shotFamily = 'half-body';
  } else if (
    /shot-(?:knee-up|full-body|long|extreme-long|mid-thigh|mid-calf|loose-full-body|environmental-quarter)|膝上|全身|中全景|远景|大远景|七分身|小腿|环境全景/.test(
      text
    )
  ) {
    shotFamily = 'full-body';
  } else if (
    /full-body|three-quarter|cowboy|wide|low-angle|全身|七分身|远景|低机位/.test(
      text
    )
  ) {
    shotFamily = 'full-body';
  } else if (/half-body|半身/.test(text)) shotFamily = 'half-body';
  else if (/close-up|closeup|profile|eye|特写|近景|侧脸/.test(text)) {
    shotFamily = 'close-up';
  } else if (/dutch|倾斜/.test(text)) shotFamily = 'dynamic';

  const compatibleShotFamilies: PortraitShotFamily[] = [];
  if (asset.slot === 'pose') {
    if (/selfie|mirror|自拍|镜面/.test(text)) {
      compatibleShotFamilies.push('selfie', 'half-body');
    } else if (
      /pose-yoga|upright kneeling|both knees|floor-w-sit|seated-on-heels|prone-elbows|side-recline|supine-knees|chair-reverse-straddle|seated-pillow-hug|chair-edge-forward|冥想坐姿|直身跪姿|双膝落地|w形地坐|跪坐脚跟|俯卧|侧卧|仰卧屈膝|反坐椅背|坐姿抱枕|椅沿前倾/.test(
        text
      )
    ) {
      compatibleShotFamilies.push('full-body');
    } else if (
      /hand-near-face|facepalm|touch.cheek|手靠近脸|扶额|托腮/.test(text)
    ) {
      compatibleShotFamilies.push('close-up', 'half-body');
    } else if (
      /jump|walk|run|cartwheel|climb|surf|arms-up|overhead-stretch|跃|行走|跑|攀|冲浪|侧手翻|双臂上|上伸|伸展/.test(
        text
      )
    ) {
      compatibleShotFamilies.push('full-body', 'dynamic');
    } else {
      compatibleShotFamilies.push('half-body', 'full-body');
    }
  }

  const showsHands =
    asset.slot !== 'shot' ||
    /shot-(?:waist-up|hip-up|mid-thigh|mid-calf|knee-up|full-body|loose-full-body|environmental-quarter|long|extreme-long)|腰上|臀上|七分身|小腿|膝上|全身|中全景|环境全景|远景|大远景/.test(
      text
    );

  return {
    portraitRandomEligible: inferPortraitRandomEligibility(asset),
    outfitCoverage: inferOutfitCoverage(asset),
    shotFamily,
    compatibleShotFamilies,
    occupiesHands:
      /hands-on-hips|crossed-arms|palms|clapping|facepalm|hand-near-face|call-me|arms raised|arms-up|overhead-stretch|floor-w-sit|seated-on-heels|prone-elbows|side-recline|chair-reverse-straddle|seated-pillow-hug|chair-edge-forward|双手叉腰|双臂交叉|双手占用|扶额|手靠近脸|撑膝|举手|挥手|鼓掌|双臂上扬|双臂上举|上伸|w形地坐|跪坐脚跟|俯卧撑肘|侧卧托头|反坐椅背|坐姿抱枕|椅沿前倾/.test(
        text
      ),
    showsFootwear:
      /shot-(?:full-body|loose-full-body|environmental-quarter|long|extreme-long)|full-body|wide|low-angle|mirror-selfie|全身景|宽松全身|环境全景|远景|大远景|低机位|镜面自拍/.test(
        text
      ),
    showsHands
  };
}

export interface ImagePromptAsset {
  id: string;
  slot: ImagePromptSlot;
  title: string;
  subtitle: string;
  prompt: string;
  promptZh?: string;
  negativePrompt?: string;
  negativePromptZh?: string;
  tags: string[];
  /** Search-only synonyms. They must not be rendered as category facets. */
  searchAliases?: string[];
  thumbnailUrl?: string;
  thumbnailEmoji?: string;
  compatibility?: ImagePromptAssetCompatibility;
  visual: {
    tone: string;
    accent: string;
    shape: 'portrait' | 'pose' | 'outfit' | 'landscape' | 'style' | 'shoe';
  };
}

export interface ImagePromptSettings {
  aspectRatio: string;
  imageSize: string;
  quality: string;
  outputFormat: string;
  model: string;
  imageCount: number;
  customPrompt: string;
}

export const imagePromptSlots: Array<{
  id: ImagePromptSlot;
  label: string;
  hint: string;
  directorRole: string;
  randomInclusionRate: number;
  visibleInComposer?: boolean;
}> = SLOT_REGISTRY.map((slot) => ({
  id: slot.id,
  label: slot.labelZh,
  hint: slot.hintZh,
  directorRole: slot.directorRole,
  randomInclusionRate: slot.randomInclusionRate,
  visibleInComposer: 'visibleInComposer' in slot ? slot.visibleInComposer : true
}));

/**
 * 公开组合器只展示面向当前人像工作流的类别。隐藏类别仍保留在完整
 * registry 中，以便历史预设、旧分享和已保存组合继续正常读取与编译。
 */
export const composerImagePromptSlots = imagePromptSlots.filter(
  (slot) => slot.visibleInComposer !== false
);

export const slotVisualDefaults: Record<
  ImagePromptSlot,
  ImagePromptAsset['visual']
> = Object.fromEntries(
  SLOT_REGISTRY.map((slot) => [slot.id, slot.visual])
) as Record<ImagePromptSlot, ImagePromptAsset['visual']>;

export const SLOT_LABEL_KEYS: Record<ImagePromptSlot, string> =
  Object.fromEntries(
    SLOT_REGISTRY.map((slot) => [slot.id, `slots.${slot.id}`])
  ) as Record<ImagePromptSlot, string>;

type CorePromptAssetInput = Omit<
  ImagePromptAsset,
  'visual' | 'compatibility' | 'thumbnailUrl'
> & {
  thumbnailUrl: string;
};

function createCorePromptAsset(asset: CorePromptAssetInput): ImagePromptAsset {
  const hydrated: ImagePromptAsset = {
    ...asset,
    visual: slotVisualDefaults[asset.slot]
  };
  return {
    ...hydrated,
    compatibility: resolveAssetCompatibility(hydrated)
  };
}

/**
 * The creation workspace needs enough local material to react immediately,
 * even before the complete catalog arrives or while the device is offline.
 * Keep this list deliberately small: one neutral, photographic option for
 * every required recipe/theme-card role. The async catalog owns breadth.
 */
export const imagePromptAssets: ImagePromptAsset[] = [
  createCorePromptAsset({
    id: 'character-refined-model',
    slot: 'character',
    title: '时装模特',
    subtitle: '成年商业成片主体',
    prompt:
      'an adult woman fashion model with refined features and a composed editorial presence',
    promptZh: '成年女性时装模特，五官精致，神态沉稳，具有杂志编辑感',
    tags: ['成年女性', '写实', '时装', '商业'],
    thumbnailUrl: new URL(
      '../assets/prompt-library/character/character-refined-model.webp',
      import.meta.url
    ).href
  }),
  createCorePromptAsset({
    id: 'expression-calm-direct',
    slot: 'expression',
    title: '平静直视',
    subtitle: '克制而清晰',
    prompt:
      'calm direct gaze toward the camera, relaxed eyelids and mouth corners',
    promptZh: '平静直视镜头，眼睑与嘴角自然放松，情绪克制清晰',
    tags: ['平静', '直视镜头'],
    thumbnailUrl: new URL(
      '../assets/prompt-library/expression/expression-calm-direct.webp',
      import.meta.url
    ).href
  }),
  createCorePromptAsset({
    id: 'hairstyle-cloud-perm-lob',
    slot: 'hairstyle',
    title: '云朵纹理中长发',
    subtitle: '自然蓬松',
    prompt: 'soft cloud-textured shoulder-length hair with natural volume',
    promptZh: '自然蓬松的云朵纹理中长发，发丝结构清晰',
    tags: ['现代时尚发型', '中长发'],
    thumbnailUrl: new URL(
      '../assets/prompt-library/hairstyle/hairstyle-cloud-perm-lob.webp',
      import.meta.url
    ).href
  }),
  createCorePromptAsset({
    id: 'pose-relaxed-standing',
    slot: 'pose',
    title: '自然站姿',
    subtitle: '松弛稳定',
    prompt: 'one relaxed standing pose with balanced weight and natural arms',
    promptZh: '一个自然站立动作，重心稳定，双臂放松，肢体关系连贯',
    tags: ['站姿', '自然'],
    thumbnailUrl: new URL(
      '../assets/prompt-library/pose/pose-relaxed-standing.webp',
      import.meta.url
    ).href
  }),
  createCorePromptAsset({
    id: 'top-cream-oversized-blazer',
    slot: 'top',
    title: '奶油色宽松西装',
    subtitle: '柔和利落',
    prompt: 'cream oversized blazer with clean tailoring',
    promptZh: '奶油色宽松西装，剪裁干净，肩线自然',
    tags: ['现代时尚服装', '西装'],
    thumbnailUrl: new URL(
      '../assets/prompt-library/top/top-cream-oversized-blazer.webp',
      import.meta.url
    ).href
  }),
  createCorePromptAsset({
    id: 'bottom-navy-pleated-skirt',
    slot: 'bottom',
    title: '海军蓝百褶裙',
    subtitle: '清晰垂坠',
    prompt: 'navy pleated skirt with a clean waistline and soft drape',
    promptZh: '海军蓝百褶裙，腰线清晰，面料自然垂坠',
    tags: ['现代时尚服装', '半裙'],
    thumbnailUrl: new URL(
      '../assets/prompt-library/bottom/bottom-navy-pleated-skirt.webp',
      import.meta.url
    ).href
  }),
  createCorePromptAsset({
    id: 'outfit-white-shirt-bermuda',
    slot: 'outfit',
    title: '白衬衫百慕大套装',
    subtitle: '中性编辑感',
    prompt: 'white shirt and tailored bermuda complete outfit',
    promptZh: '白衬衫与利落百慕大裤成套造型，整体廓形协调',
    tags: ['现代时尚服装', '套装'],
    thumbnailUrl: new URL(
      '../assets/prompt-library/outfit/outfit-white-shirt-bermuda.webp',
      import.meta.url
    ).href
  }),
  createCorePromptAsset({
    id: 'shoes-black-mary-jane',
    slot: 'shoes',
    title: '黑色玛丽珍鞋',
    subtitle: '经典收束',
    prompt: 'black leather Mary Jane shoes with a restrained finish',
    promptZh: '黑色皮革玛丽珍鞋，造型克制，完整收束全身搭配',
    tags: ['鞋履', '皮革'],
    thumbnailUrl: new URL(
      '../assets/prompt-library/shoes/shoes-black-mary-jane.webp',
      import.meta.url
    ).href
  }),
  createCorePromptAsset({
    id: 'background-warm-studio',
    slot: 'background',
    title: '暖色摄影棚',
    subtitle: '干净有层次',
    prompt: 'warm neutral photo studio with subtle spatial depth',
    promptZh: '暖色中性摄影棚，背景干净并保留轻微空间层次',
    tags: ['现代场景', '影棚'],
    thumbnailUrl: new URL(
      '../assets/prompt-library/background/background-warm-studio.webp',
      import.meta.url
    ).href
  }),
  createCorePromptAsset({
    id: 'composition-ecommerce-kv-hero',
    slot: 'composition',
    title: '中心主视觉',
    subtitle: '主体明确',
    prompt: 'clean centered hero composition with deliberate negative space',
    promptZh: '干净的中心主视觉构图，主体明确，留白有意识',
    tags: ['构图', '主视觉'],
    thumbnailUrl: new URL(
      '../assets/prompt-library/composition/composition-ecommerce-kv-hero.webp',
      import.meta.url
    ).href
  }),
  createCorePromptAsset({
    id: 'style-high-end-fashion-photo',
    slot: 'style',
    title: '高端时尚摄影',
    subtitle: '克制杂志感',
    prompt: 'high-end fashion editorial photography with restrained polish',
    promptZh: '高端时尚编辑摄影，质感克制，成片精致',
    tags: ['写实', '摄影', '时装'],
    thumbnailUrl: new URL(
      '../assets/prompt-library/style/style-high-end-fashion-photo.webp',
      import.meta.url
    ).href
  }),
  createCorePromptAsset({
    id: 'lighting-large-softbox',
    slot: 'lighting',
    title: '大型柔光箱',
    subtitle: '柔和塑形',
    prompt: 'large softbox key light with gentle facial modeling',
    promptZh: '大型柔光箱主光，面部塑形柔和，阴影过渡自然',
    tags: ['影棚光', '柔光'],
    thumbnailUrl: new URL(
      '../assets/prompt-library/lighting/lighting-large-softbox.webp',
      import.meta.url
    ).href
  }),
  createCorePromptAsset({
    id: 'layoutDesign-magazine-cover-grid',
    slot: 'layoutDesign',
    title: '干净编辑版式',
    subtitle: '层级清晰',
    prompt: 'clean editorial layout with a clear reading hierarchy',
    promptZh: '干净的编辑版式，阅读层级清晰，信息区留白充足',
    tags: ['版式', '编辑'],
    thumbnailUrl: new URL(
      '../assets/prompt-library/layoutDesign/layoutDesign-magazine-cover-grid.webp',
      import.meta.url
    ).href
  }),
  createCorePromptAsset({
    id: 'shot-waist-up',
    slot: 'shot',
    title: '腰上景别',
    subtitle: '兼顾神态与动作',
    prompt: 'waist-up portrait framing with hands available in frame',
    promptZh: '腰上人像景别，兼顾面部神态与手部动作',
    tags: ['腰上', '人像景别'],
    thumbnailUrl: new URL(
      '../assets/prompt-library/shot/shot-waist-up.webp',
      import.meta.url
    ).href
  }),
  createCorePromptAsset({
    id: 'viewpoint-eye-level-frontal',
    slot: 'viewpoint',
    title: '平视正面机位',
    subtitle: '稳定直接',
    prompt: 'eye-level frontal camera viewpoint',
    promptZh: '相机保持平视正面机位，空间关系稳定直接',
    tags: ['平视', '正面'],
    thumbnailUrl: new URL(
      '../assets/prompt-library/viewpoint/viewpoint-eye-level-frontal.webp',
      import.meta.url
    ).href
  }),
  createCorePromptAsset({
    id: 'lens-clean-digital',
    slot: 'lens',
    title: '干净数字镜头',
    subtitle: '真实清晰',
    prompt: 'clean digital lens rendering with natural detail',
    promptZh: '干净的数字镜头呈现，细节自然，透视克制',
    tags: ['数字镜头', '自然'],
    thumbnailUrl: new URL(
      '../assets/prompt-library/lens/lens-clean-digital.webp',
      import.meta.url
    ).href
  }),
  createCorePromptAsset({
    id: 'makeup-cream-luminous',
    slot: 'makeup',
    title: '奶油光泽妆',
    subtitle: '自然通透',
    prompt: 'one cream-luminous makeup anchor with natural skin texture',
    promptZh: '一个奶油光泽妆容锚点，肤质自然通透，眼唇色彩协调',
    tags: ['现代妆容', '自然肤质'],
    thumbnailUrl: new URL(
      '../assets/prompt-library/makeup/makeup-cream-luminous.webp',
      import.meta.url
    ).href
  })
];

export const defaultImagePromptSelection: ImagePromptSelection =
  normalizeImagePromptSelection();

export const defaultImagePromptSettings: ImagePromptSettings = {
  aspectRatio: 'auto',
  imageSize: 'auto',
  quality: 'auto',
  outputFormat: 'png',
  model: 'gpt-image-2.5',
  imageCount: 1,
  customPrompt: ''
};

const imagePromptAssetIndexes = new WeakMap<
  ImagePromptAsset[],
  Map<string, ImagePromptAsset>
>();
// Catalog arrays are immutable snapshots. Callers replace the array when an
// asset changes, which naturally gives the WeakMap a fresh cache key.
imagePromptAssetIndexes.set(
  imagePromptAssets,
  new Map(imagePromptAssets.map((asset) => [asset.id, asset]))
);

function getImagePromptAssetIndex(
  assets: ImagePromptAsset[]
): Map<string, ImagePromptAsset> {
  const cached = imagePromptAssetIndexes.get(assets);
  if (cached) return cached;
  const index = new Map(assets.map((asset) => [asset.id, asset]));
  imagePromptAssetIndexes.set(assets, index);
  return index;
}

export function getAssetById(
  id: string | null | undefined,
  assets: ImagePromptAsset[] = imagePromptAssets
): ImagePromptAsset | undefined {
  if (!id) return undefined;
  return getImagePromptAssetIndex(assets).get(id);
}

export type PromptLocale = 'zh-CN' | 'en-US';

interface PromptLocaleStrings {
  aspectRatio: (ratio: string) => string;
  imageSize: (size: string, ratio: string) => string;
  qualityProfile: (quality: string) => string;
  qualityHigh: string;
  modelOptimized: (model: string) => string;
  warnings: {
    highEndFashionAnimeConflict: string;
    watercolorRealismConflict: string;
  };
  qualityLabel: Record<string, string>;
  negativeFallback: string[];
}

const PROMPT_LOCALE_STRINGS: Record<PromptLocale, PromptLocaleStrings> = {
  'zh-CN': {
    aspectRatio: (ratio) => `${ratio} 比例`,
    imageSize: (size, ratio) =>
      size === 'auto' ? '自动尺寸' : `${size} 尺寸（${ratio}）`,
    qualityProfile: (quality) => `${quality} 画质档位`,
    qualityHigh: '高质量、肢体协调、构图整洁',
    modelOptimized: (model) => `针对 ${model} 模型优化`,
    warnings: {
      highEndFashionAnimeConflict:
        '写实时装摄影和二次元角色可能冲突，建议改成时装模特角色或换二次元风格。',
      watercolorRealismConflict:
        '水彩二次元风格会弱化写实主体，可换成二次元角色以提高一致性。'
    },
    qualityLabel: {
      auto: '自动',
      high: '高质量',
      medium: '中等质量',
      low: '快速草稿',
      standard: '自动',
      'high-detail': '高质量',
      fast: '快速草稿'
    },
    negativeFallback: ['画质低', '多余手指', '手部变形', '解剖错误', '水印文字']
  },
  'en-US': {
    aspectRatio: (ratio) => `${ratio} aspect ratio`,
    imageSize: (size, ratio) =>
      size === 'auto' ? 'auto image size' : `${size} image size (${ratio})`,
    qualityProfile: (quality) => `${quality} quality profile`,
    qualityHigh: 'high quality, coherent anatomy, clean composition',
    modelOptimized: (model) => `optimized for model ${model}`,
    warnings: {
      highEndFashionAnimeConflict:
        'High-end fashion photography may clash with anime characters — consider a fashion-model character or switch to an anime style.',
      watercolorRealismConflict:
        'Watercolor anime style softens realistic subjects — pair it with an anime character for consistency.'
    },
    qualityLabel: {
      auto: 'auto',
      high: 'high',
      medium: 'medium',
      low: 'low draft',
      standard: 'auto',
      'high-detail': 'high',
      fast: 'low draft'
    },
    negativeFallback: [
      'low quality',
      'extra fingers',
      'distorted hands',
      'bad anatomy',
      'text watermark'
    ]
  }
};

function pickAssetPrompt(
  asset: ImagePromptAsset,
  locale: PromptLocale
): string {
  if (locale === 'zh-CN' && asset.promptZh) return asset.promptZh;
  return asset.prompt;
}

function pickAssetNegative(
  asset: ImagePromptAsset,
  locale: PromptLocale
): string | undefined {
  if (locale === 'zh-CN' && asset.negativePromptZh) {
    return asset.negativePromptZh;
  }
  return asset.negativePrompt;
}

function splitPromptFragments(value: string, locale: PromptLocale): string[] {
  const splitter = locale === 'zh-CN' ? /[，,]/ : /,/;
  return value
    .split(splitter)
    .map((fragment) => fragment.trim())
    .filter(Boolean);
}

function normalizePromptFragment(value: string): string {
  return value
    .trim()
    .replace(/[，,。.!！;；:：]+$/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function uniquePromptFragments(
  values: Array<string | undefined>,
  locale: PromptLocale
): string[] {
  const seen = new Set<string>();
  const fragments: string[] = [];

  values.forEach((value) => {
    if (!value) return;

    splitPromptFragments(value, locale).forEach((fragment) => {
      const key = normalizePromptFragment(fragment);
      if (!key || seen.has(key)) return;

      seen.add(key);
      fragments.push(fragment);
    });
  });

  return fragments;
}

function joinFragments(values: Array<string | undefined>): string {
  return values
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .join('；');
}

const portraitVisualSingularityPriority = {
  'visual-effect': 4,
  'extreme-viewpoint': 3,
  'strong-lens': 2,
  'statement-makeup': 1
} as const;

function buildPortraitVisualHierarchy(
  selectedAssets: ImagePromptAsset[],
  locale: PromptLocale
): { prompt: string; warning: string } {
  const highIntensityAssets = selectedAssets
    .map((asset) => ({
      asset,
      kind: getPortraitVisualSingularityKind(asset)
    }))
    .filter(
      (
        item
      ): item is {
        asset: ImagePromptAsset;
        kind: keyof typeof portraitVisualSingularityPriority;
      } => Boolean(item.kind)
    )
    .sort(
      (left, right) =>
        portraitVisualSingularityPriority[right.kind] -
        portraitVisualSingularityPriority[left.kind]
    );
  if (highIntensityAssets.length === 0) return { prompt: '', warning: '' };

  const [primary, ...supporting] = highIntensityAssets;
  const supportingNames = supporting.map((item) => item.asset.title);
  if (locale === 'zh-CN') {
    return {
      prompt: supportingNames.length
        ? `视觉主次：“${primary.asset.title}”是唯一高强度视觉中心；${supportingNames.map((name) => `“${name}”`).join('、')}只保留辅助强度，不再增加新的视觉事件`
        : `视觉主次：“${primary.asset.title}”是唯一高强度视觉中心，其余镜头、妆容与效果保持辅助强度`,
      warning: supportingNames.length
        ? `多个高强度素材同时启用；已保留手动选择，并将“${primary.asset.title}”设为主视觉，其余降为辅助。`
        : ''
    };
  }
  return {
    prompt: supportingNames.length
      ? `visual hierarchy: “${primary.asset.title}” is the only high-intensity focal device; ${supportingNames.map((name) => `“${name}”`).join(', ')} stay at supporting strength and add no further visual event`
      : `visual hierarchy: “${primary.asset.title}” is the only high-intensity focal device; all other lens, makeup, and effects stay supportive`,
    warning: supportingNames.length
      ? `Multiple high-intensity assets are active. Manual choices are preserved, “${primary.asset.title}” is primary, and the rest are reduced to supporting strength.`
      : ''
  };
}

function buildPortraitShootingThesis(
  selectedAssets: ImagePromptAsset[],
  locale: PromptLocale
): string {
  const highIntensityAnchor = selectedAssets
    .map((asset) => ({
      asset,
      kind: getPortraitVisualSingularityKind(asset)
    }))
    .filter(
      (
        item
      ): item is {
        asset: ImagePromptAsset;
        kind: keyof typeof portraitVisualSingularityPriority;
      } => Boolean(item.kind)
    )
    .sort(
      (left, right) =>
        portraitVisualSingularityPriority[right.kind] -
        portraitVisualSingularityPriority[left.kind]
    )[0]?.asset;
  const structuralAnchor = [
    'background',
    'pose',
    'lighting',
    'expression',
    'style'
  ]
    .map((slot) => selectedAssets.find((asset) => asset.slot === slot))
    .find(Boolean);
  const anchor = highIntensityAnchor || structuralAnchor;
  if (locale === 'zh-CN') {
    return `成片成立点：${anchor ? `以“${anchor.title}”作为照片成立的主导因素；` : ''}妆容、服装、道具、场景、光线与镜头只沿一条色彩或材质呼应、一个动作理由和同一成像世界共同服务画面，不新增第二主题`;
  }
  return `shooting thesis: ${anchor ? `“${anchor.title}” is the dominant reason the photograph works; ` : ''}makeup, wardrobe, props, scene, light, and camera serve one color or material echo, one action purpose, and one imaging world without adding a second concept`;
}

function buildControlledVariationContract(
  selection: ImagePromptSelection,
  imageCount: number,
  locale: PromptLocale
): string {
  if (imageCount <= 1) return '';
  const variationAxes = [
    getSelectedAssetIds(selection, 'shot').length === 0
      ? locale === 'zh-CN'
        ? '镜头距离'
        : 'camera distance'
      : locale === 'zh-CN'
        ? '同一景别内的裁切微差'
        : 'crop variation within the selected shot',
    getSelectedAssetIds(selection, 'viewpoint').length === 0
      ? locale === 'zh-CN'
        ? '机位高度'
        : 'camera height'
      : locale === 'zh-CN'
        ? '同一机位内的轻微位置变化'
        : 'small position changes within the selected viewpoint',
    locale === 'zh-CN' ? '前景遮挡' : 'foreground occlusion',
    getSelectedAssetIds(selection, 'pose').length === 0
      ? locale === 'zh-CN'
        ? '单一动作骨架'
        : 'single-action skeleton'
      : locale === 'zh-CN'
        ? '同一动作的自然微时刻'
        : 'natural microtiming within the selected action',
    getSelectedAssetIds(selection, 'expression').length === 0
      ? locale === 'zh-CN'
        ? '表情与是否看镜头'
        : 'expression and camera contact'
      : locale === 'zh-CN'
        ? '同一表情内的视线落点微差'
        : 'gaze-target variation within the selected expression'
  ];
  const axes = variationAxes.join(locale === 'zh-CN' ? '、' : ', ');
  if (locale === 'zh-CN') {
    return `同组变化合同：${imageCount} 张共享已选人物、妆造、场景、光线和成像主线，只在不改写已选素材的前提下变化${axes}；优先让任意两张至少四个未锁定维度不同，锁定维度不为凑数而改写，不随机化主题方向`;
  }
  return `controlled set variation: all ${imageCount} images share the selected subject, styling, scene, light, and imaging thesis; vary only ${axes} without rewriting selected assets; prefer at least four unlocked differences between any pair, never alter locked dimensions merely to reach the count, and do not randomize the theme`;
}

function buildPortraitPropPrompt(
  props: ImagePromptAsset[] | undefined,
  locale: PromptLocale
): string {
  if (!props?.length) return '';
  const prompts = props.map((asset) => pickAssetPrompt(asset, locale));
  if (props.length <= 2) {
    return prompts.join(locale === 'zh-CN' ? '，' : ', ');
  }
  const pool = prompts.join(locale === 'zh-CN' ? '、' : ', ');
  return locale === 'zh-CN'
    ? `道具候选池：${pool}；按构图只选二至四件，不要求全部出现，只有与当前动作有关的一件进入任务手`
    : `prop atmosphere pool: ${pool}; use only two to four as composition needs, do not force every item to appear, and let only the action-relevant item enter the task hand`;
}

function adaptBackgroundPromptForPortrait(value: string): string {
  return value
    .replace(/\bno people\b/gi, 'no background bystanders')
    .replace(/无人物/g, '无背景路人');
}

function inferOrientation(ratio: string, locale: PromptLocale): string {
  if (ratio === 'auto') {
    return locale === 'zh-CN' ? '由模型决定画幅' : 'model-decided framing';
  }
  const [w, h] = ratio.split(':').map((part) => Number(part));
  if (!w || !h || w === h) {
    return locale === 'zh-CN' ? '方形画幅' : 'square frame';
  }
  if (w > h) {
    return locale === 'zh-CN' ? '横版画幅' : 'landscape frame';
  }
  return locale === 'zh-CN' ? '竖版画幅' : 'portrait frame';
}

function buildOpeningSentence(
  settings: ImagePromptSettings,
  locale: PromptLocale,
  mode: 'portrait' | 'commercial' = 'portrait'
): string {
  const ratio = settings.aspectRatio || 'auto';
  const size = settings.imageSize || 'auto';
  const orientation = inferOrientation(ratio, locale);
  if (locale === 'zh-CN') {
    const sizeText = size === 'auto' ? '自动尺寸' : `${size} 尺寸`;
    const ratioText = ratio === 'auto' ? '自动比例' : `${ratio} 比例`;
    if (mode === 'commercial') {
      return `生成一张 ${ratioText}、${orientation}、${sizeText} 的商业视觉图。`;
    }
    return `生成一张 ${ratioText}、${orientation}、${sizeText} 的女性人像。`;
  }
  const sizeText = size === 'auto' ? 'auto size' : `${size} size`;
  const ratioText =
    ratio === 'auto' ? 'auto aspect ratio' : `${ratio} aspect ratio`;
  if (mode === 'commercial') {
    return `Create a commercial visual with ${ratioText}, ${orientation}, and ${sizeText}.`;
  }
  return `Create a female portrait with ${ratioText}, ${orientation}, and ${sizeText}.`;
}

function getSelectedBySlot(
  selectedAssets: ImagePromptAsset[]
): Partial<Record<ImagePromptSlot, ImagePromptAsset[]>> {
  return selectedAssets.reduce(
    (bySlot, asset) => {
      bySlot[asset.slot] = [...(bySlot[asset.slot] || []), asset];
      return bySlot;
    },
    {} as Partial<Record<ImagePromptSlot, ImagePromptAsset[]>>
  );
}

function escapePromptRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getPromptSlotLineLabel(
  slot: ImagePromptSlot,
  locale: PromptLocale
): string {
  const slotMeta = SLOT_REGISTRY.find((item) => item.id === slot);
  if (locale === 'zh-CN') return slotMeta?.labelZh || slot;
  return slot
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (char) => char.toUpperCase());
}

function stripSlotLinePrefix(value: string, label: string): string {
  return value
    .trim()
    .replace(new RegExp(`^${escapePromptRegExp(label)}\\s*[:：]\\s*`), '')
    .trim();
}

function buildPromptSelectionLine(
  slot: ImagePromptSlot,
  assets: ImagePromptAsset[],
  locale: PromptLocale,
  materialSelection: WardrobeMaterialSelection = {}
): string {
  const label = getPromptSlotLineLabel(slot, locale);
  if (slot === 'prop' && assets.length > 2) {
    return `${label}：${buildPortraitPropPrompt(assets, locale)}`;
  }
  const separator = locale === 'zh-CN' ? '，' : ', ';
  const originalContent = assets
    .map((asset) => {
      const prompt = pickAssetPrompt(asset, locale);
      return stripSlotLinePrefix(
        slot === 'background'
          ? adaptBackgroundPromptForPortrait(prompt)
          : prompt,
        label
      );
    })
    .filter(Boolean)
    .join(separator);
  const content = applyWardrobeMaterialPrefix(
    slot,
    originalContent,
    materialSelection,
    locale
  );
  return `${label}：${content}`;
}

export function mergeImagePromptSelectionIntoPrompt(
  currentPrompt: string,
  selection: ImagePromptSelection,
  assets: ImagePromptAsset[] = imagePromptAssets,
  locale: PromptLocale = 'en-US',
  materialSelection: WardrobeMaterialSelection = {}
): string {
  const normalizedSelection = normalizeImagePromptSelection(selection);
  const normalizedMaterials = normalizeWardrobeMaterialSelection(
    materialSelection,
    normalizedSelection
  );
  const selectedBySlot = Object.fromEntries(
    imagePromptSlots
      .map((slot) => {
        const selectedAssets = getSelectedAssetIds(normalizedSelection, slot.id)
          .map((id) => getAssetById(id, assets))
          .filter((asset): asset is ImagePromptAsset => Boolean(asset));
        return [slot.id, selectedAssets] as const;
      })
      .filter(([, selectedAssets]) => selectedAssets.length > 0)
  ) as Partial<Record<ImagePromptSlot, ImagePromptAsset[]>>;

  const slotsToApply = imagePromptSlots
    .map((slot) => slot.id)
    .filter((slot) => selectedBySlot[slot]?.length);

  if (slotsToApply.length === 0) return currentPrompt;

  const lines = currentPrompt.trim()
    ? currentPrompt.replace(/\r\n/g, '\n').split('\n')
    : [];

  slotsToApply.forEach((slot) => {
    const selectedAssets = selectedBySlot[slot] || [];
    const line = buildPromptSelectionLine(
      slot,
      selectedAssets,
      locale,
      normalizedMaterials
    );
    const label = getPromptSlotLineLabel(slot, locale);
    const linePattern = new RegExp(
      `^\\s*(?:[-*]\\s*)?${escapePromptRegExp(label)}\\s*[:：]`,
      'i'
    );
    const firstIndex = lines.findIndex((entry) => linePattern.test(entry));

    if (firstIndex >= 0) {
      lines[firstIndex] = line;
      for (let index = lines.length - 1; index > firstIndex; index -= 1) {
        if (linePattern.test(lines[index])) {
          lines.splice(index, 1);
        }
      }
      return;
    }

    lines.push(line);
  });

  return lines.join('\n').trim();
}

/**
 * Distinguishes a complete compiler output from a user's free-form prompt.
 * A compiled prompt must be replaced as one recipe; appending slot lines to it
 * would leave two competing subjects, scenes, and shooting plans in one prompt.
 */
export function isCompiledImagePrompt(prompt: string): boolean {
  const normalized = prompt.trim();
  const isChineseCompilerOutput =
    /^生成一张\s+[^。\n]+的(?:女性人像|商业视觉图)。/.test(normalized) &&
    /画质档位，针对\s+\S+\s+模型优化/.test(normalized);
  const isEnglishCompilerOutput =
    /^Create a (?:female portrait|commercial visual) with [^.]+\./.test(
      normalized
    ) && /quality profile, optimized for model\s+\S+/i.test(normalized);
  return isChineseCompilerOutput || isEnglishCompilerOutput;
}

export function applyImagePromptSelectionToPrompt(
  currentPrompt: string,
  compiledPrompt: string,
  selection: ImagePromptSelection,
  assets: ImagePromptAsset[] = imagePromptAssets,
  locale: PromptLocale = 'en-US',
  materialSelection: WardrobeMaterialSelection = {}
): string {
  if (isCompiledImagePrompt(currentPrompt)) return compiledPrompt.trim();
  return mergeImagePromptSelectionIntoPrompt(
    currentPrompt,
    selection,
    assets,
    locale,
    materialSelection
  );
}

export function compileImagePrompt(
  selection: ImagePromptSelection,
  settings: ImagePromptSettings,
  assets: ImagePromptAsset[] = imagePromptAssets,
  locale: PromptLocale = 'en-US',
  materialSelection: WardrobeMaterialSelection = {}
): {
  prompt: string;
  negativePrompt: string;
  selectedAssets: ImagePromptAsset[];
  warnings: string[];
} {
  const strings =
    PROMPT_LOCALE_STRINGS[locale] || PROMPT_LOCALE_STRINGS['en-US'];
  const normalizedSelection = normalizeImagePromptSelection(selection);
  const normalizedMaterials = normalizeWardrobeMaterialSelection(
    materialSelection,
    normalizedSelection
  );

  const selectedAssets = imagePromptSlots
    .flatMap((slot) =>
      getSelectedAssetIds(normalizedSelection, slot.id).map((id) =>
        getAssetById(id, assets)
      )
    )
    .filter((asset): asset is ImagePromptAsset => Boolean(asset));

  if (selectedAssets.length === 0 && !settings.customPrompt.trim()) {
    return {
      prompt: '',
      negativePrompt: '',
      selectedAssets,
      warnings: []
    };
  }

  const qualityText =
    strings.qualityLabel[settings.quality] || settings.quality;
  const selectedBySlot = getSelectedBySlot(selectedAssets);
  const promptFor = (slot: ImagePromptSlot) => {
    const originalPrompt =
      selectedBySlot[slot]
        ?.map((asset) => pickAssetPrompt(asset, locale))
        .filter(Boolean)
        .join(locale === 'zh-CN' ? '，' : ', ') || '';
    return applyWardrobeMaterialPrefix(
      slot,
      originalPrompt,
      normalizedMaterials,
      locale
    );
  };
  const productSubjectPrompt = promptFor('productSubject');
  const productSurfacePrompt = promptFor('productSurface');
  const compositionPrompt = promptFor('composition');
  const titleAreaPrompt = promptFor('titleArea');
  const stylePrompt = promptFor('style');
  const characterPrompt = promptFor('character');
  const hairstylePrompt = promptFor('hairstyle');
  const expressionPrompt = promptFor('expression');
  const makeupPrompt = promptFor('makeup');
  const posePrompt = promptFor('pose');
  const propPrompt = buildPortraitPropPrompt(selectedBySlot.prop, locale);
  const topPrompt = promptFor('top');
  const bottomPrompt = promptFor('bottom');
  const outfitPrompt = promptFor('outfit');
  const onePiecePrompt = promptFor('onePiece');
  const shoesPrompt = promptFor('shoes');
  const accessoryPrompt = promptFor('accessory');
  const backgroundPrompt = promptFor('background');
  const portraitBackgroundPrompt =
    adaptBackgroundPromptForPortrait(backgroundPrompt);
  const shotPrompt = promptFor('shot');
  const viewpointPrompt = promptFor('viewpoint');
  const lensPrompt = promptFor('lens');
  const lightingPrompt = promptFor('lighting');
  const visualEffectPrompt = promptFor('visualEffect');
  const layoutDesignPrompt = promptFor('layoutDesign');
  const repeatsLowerBodyPose = Boolean(
    selectedBySlot.pose?.some(poseRequiresCompleteLowerBodyVisibility)
  );
  const noUnselectedHandheldProps = propPrompt
    ? ''
    : locale === 'zh-CN'
      ? '双手只执行既定姿态，不凭空增加麦克风、杯子、扇子或其他未选择的手持物'
      : 'hands only perform the specified pose; do not invent microphones, cups, fans, or other unselected handheld objects';
  const portraitExecutionChecklist = joinFragments([
    shotPrompt
      ? locale === 'zh-CN'
        ? `终稿景别验收：${shotPrompt}`
        : `final framing check: ${shotPrompt}`
      : '',
    viewpointPrompt
      ? locale === 'zh-CN'
        ? `终稿机位验收：${viewpointPrompt}`
        : `final viewpoint check: ${viewpointPrompt}`
      : '',
    repeatsLowerBodyPose && posePrompt
      ? locale === 'zh-CN'
        ? `终稿姿态验收：${posePrompt}`
        : `final pose check: ${posePrompt}`
      : ''
  ]);
  // Composition is shared by the portrait and legacy commercial workflows.
  // A portrait composition must not switch the whole recipe into commercial
  // mode, which adds product-first instructions such as avoiding people.
  const hasExplicitCommercialContext = Boolean(
    productSubjectPrompt ||
    productSurfacePrompt ||
    titleAreaPrompt ||
    layoutDesignPrompt
  );
  const portraitVisualHierarchy = hasExplicitCommercialContext
    ? { prompt: '', warning: '' }
    : buildPortraitVisualHierarchy(selectedAssets, locale);
  const portraitShootingThesis = hasExplicitCommercialContext
    ? ''
    : buildPortraitShootingThesis(selectedAssets, locale);
  const controlledVariation = hasExplicitCommercialContext
    ? ''
    : buildControlledVariationContract(
        normalizedSelection,
        settings.imageCount,
        locale
      );
  const photographicExecution = formatPortraitPhotographicExecution(
    buildPortraitPhotographicExecution(selectedAssets, locale),
    locale
  );
  const qualityAndModel =
    locale === 'zh-CN'
      ? `${strings.qualityProfile(qualityText)}，${strings.modelOptimized(settings.model)}，${strings.qualityHigh}`
      : `${strings.qualityProfile(qualityText)}, ${strings.modelOptimized(settings.model)}, ${strings.qualityHigh}`;

  const promptParagraphs = hasExplicitCommercialContext
    ? locale === 'zh-CN'
      ? [
          `${buildOpeningSentence(settings, locale, 'commercial')}${joinFragments(
            [
              productSubjectPrompt ||
                '主体清晰、轮廓明确，材质和核心卖点可被快速识别',
              stylePrompt || '商业成片质感，画面干净可信'
            ]
          )}。`,
          `${joinFragments([
            productSurfacePrompt ||
              backgroundPrompt ||
              '台面、背景和辅助道具服务主体，不喧宾夺主',
            lightingPrompt || '光线方向清楚，材质高光和阴影自然',
            lensPrompt
          ])}。`,
          `${joinFragments([
            compositionPrompt ||
              shotPrompt ||
              '构图稳定，主体占比明确，视觉重心集中',
            titleAreaPrompt,
            layoutDesignPrompt,
            '保留清晰的信息承载空间，适合后续添加标题或卖点文案'
          ])}。`,
          `${joinFragments([
            visualEffectPrompt,
            qualityAndModel,
            '避免人物抢占主体，避免无关装饰干扰商品或主题表达'
          ])}。`
        ]
      : [
          `${buildOpeningSentence(settings, locale, 'commercial')} ${joinFragments(
            [
              productSubjectPrompt ||
                'clear subject silhouette with recognizable material and core selling points',
              stylePrompt || 'clean trustworthy commercial finish'
            ]
          )}.`,
          `${joinFragments([
            productSurfacePrompt ||
              backgroundPrompt ||
              'surface, background, and supporting props serve the subject without competing for attention',
            lightingPrompt ||
              'clear light direction with natural material highlights and shadows',
            lensPrompt
          ])}.`,
          `${joinFragments([
            compositionPrompt ||
              shotPrompt ||
              'stable composition with clear subject scale and focused visual weight',
            titleAreaPrompt,
            layoutDesignPrompt,
            'preserve readable information space for later title or selling-point copy'
          ])}.`,
          `${joinFragments([
            visualEffectPrompt,
            qualityAndModel,
            'avoid people stealing focus from the product or theme, avoid irrelevant decoration'
          ])}.`
        ]
    : locale === 'zh-CN'
      ? [
          `${buildOpeningSentence(settings, locale)}${joinFragments([
            characterPrompt,
            hairstylePrompt,
            expressionPrompt,
            makeupPrompt,
            stylePrompt || '人物气质自然、明确成年，五官协调，画面风格统一'
          ])}。`,
          `${joinFragments([
            posePrompt ||
              '人物处于一个自然可拍摄的时间切片中，动作克制连贯，视线有明确落点',
            propPrompt,
            noUnselectedHandheldProps
          ])}。`,
          `${joinFragments([
            ...(outfitPrompt
              ? [outfitPrompt]
              : onePiecePrompt
                ? [onePiecePrompt]
                : [topPrompt, bottomPrompt]),
            shoesPrompt,
            accessoryPrompt,
            '服装结构、配色、材质和身体重心互相服务，重点呈现完整造型而非局部'
          ])}。`,
          `${joinFragments([
            portraitBackgroundPrompt || '场景简洁但有真实空间层次',
            compositionPrompt,
            shotPrompt,
            viewpointPrompt,
            lensPrompt,
            layoutDesignPrompt,
            '保留前景、中景、后景关系，主体清晰，背景服务人物'
          ])}。`,
          `${joinFragments([
            lightingPrompt || '光线方向清楚，脸部和服装纹理有自然高光与阴影',
            visualEffectPrompt,
            portraitVisualHierarchy.prompt,
            portraitShootingThesis,
            controlledVariation,
            portraitExecutionChecklist,
            qualityAndModel
          ])}。`,
          `${photographicExecution}。`
        ]
      : [
          `${buildOpeningSentence(settings, locale)} ${joinFragments([
            characterPrompt,
            hairstylePrompt,
            expressionPrompt,
            makeupPrompt,
            stylePrompt ||
              'clearly adult subject, coherent facial features, unified portrait direction'
          ])}.`,
          `${joinFragments([
            posePrompt ||
              'a natural photographed time slice with a coherent action chain and clear gaze target',
            propPrompt,
            noUnselectedHandheldProps
          ])}.`,
          `${joinFragments([
            ...(outfitPrompt
              ? [outfitPrompt]
              : onePiecePrompt
                ? [onePiecePrompt]
                : [topPrompt, bottomPrompt]),
            shoesPrompt,
            accessoryPrompt,
            'wardrobe structure, palette, materials, and body balance serve the full silhouette rather than isolated body parts'
          ])}.`,
          `${joinFragments([
            portraitBackgroundPrompt ||
              'a simple scene with believable spatial depth',
            compositionPrompt,
            shotPrompt,
            viewpointPrompt,
            lensPrompt,
            layoutDesignPrompt,
            'clear foreground, midground, and background relationship, subject remains the visual center'
          ])}.`,
          `${joinFragments([
            lightingPrompt ||
              'clear light direction with natural highlights and shadows on the face and clothing texture',
            visualEffectPrompt,
            portraitVisualHierarchy.prompt,
            portraitShootingThesis,
            controlledVariation,
            portraitExecutionChecklist,
            qualityAndModel
          ])}.`,
          `${photographicExecution}.`
        ];
  if (settings.customPrompt.trim()) {
    promptParagraphs.push(settings.customPrompt.trim());
  }

  const negativePrompt = uniquePromptFragments(
    selectedAssets
      .map((asset) => pickAssetNegative(asset, locale))
      .concat(strings.negativeFallback),
    locale
  ).join(locale === 'zh-CN' ? '，' : ', ');

  const selectedStyle = getAssetById(
    getPrimarySelectedAssetId(normalizedSelection, 'style'),
    assets
  );
  const selectedCharacter = getAssetById(
    getPrimarySelectedAssetId(normalizedSelection, 'character'),
    assets
  );
  const warnings: string[] = [];
  if (portraitVisualHierarchy.warning) {
    warnings.push(portraitVisualHierarchy.warning);
  }
  if ((selectedBySlot.prop?.length || 0) > 4) {
    warnings.push(
      locale === 'zh-CN'
        ? '当前选择超过四件道具；已将它们编译为氛围候选池，每张只按构图使用二至四件，避免购物清单式堆叠。'
        : 'More than four props are selected. They are compiled as an atmosphere pool, with only two to four used per image to avoid shopping-list clutter.'
    );
  }
  getPortraitExpressionConflicts(selectedAssets).forEach((conflict) => {
    warnings.push(
      locale === 'zh-CN'
        ? `表情与镜头建议：${conflict.reasonZh}；当前手动选择已保留。`
        : `Expression and camera suggestion: ${conflict.reasonEn} Manual choices are preserved.`
    );
  });
  getPortraitRecipeSoftConflicts(selectedAssets).forEach((conflict) => {
    warnings.push(
      locale === 'zh-CN'
        ? `配方搭配建议：${conflict.reason}；可调整相关素材，但当前手动选择已保留。`
        : `Recipe pairing suggestion: ${conflict.reason}; adjust the related assets if desired. The manual selection is preserved.`
    );
  });
  const selectedShot = selectedBySlot.shot?.[0];
  if (selectedShot) {
    const detailsOutsideFrame: string[] = [];
    if (!shotShowsFootwear(selectedShot) && selectedBySlot.shoes?.length) {
      detailsOutsideFrame.push(locale === 'zh-CN' ? '鞋履' : 'footwear');
    }
    if (!shotShowsHands(selectedShot) && selectedBySlot.prop?.length) {
      detailsOutsideFrame.push(
        locale === 'zh-CN' ? '手持道具' : 'handheld props'
      );
    }
    if (shotRequiresPoseRemoval(selectedShot) && selectedBySlot.pose?.length) {
      detailsOutsideFrame.push(locale === 'zh-CN' ? '身体姿势' : 'body pose');
    }
    if (detailsOutsideFrame.length > 0) {
      warnings.push(
        locale === 'zh-CN'
          ? `景别可见性建议：当前景别不会稳定展示${detailsOutsideFrame.join('、')}；如需保留这些素材，请改用更宽的景别。当前手动选择已保留。`
          : `Framing visibility suggestion: the current shot will not reliably show ${detailsOutsideFrame.join(', ')}. Use a wider shot to retain them. The manual selection is preserved.`
      );
    }
  }
  if (
    selectedStyle?.id === 'style-high-end-fashion-photo' &&
    selectedCharacter?.tags.includes('二次元')
  ) {
    warnings.push(strings.warnings.highEndFashionAnimeConflict);
  }
  if (
    selectedStyle?.id === 'style-delicate-anime-watercolor' &&
    selectedCharacter?.tags.includes('写实')
  ) {
    warnings.push(strings.warnings.watercolorRealismConflict);
  }

  return {
    prompt: promptParagraphs.join('\n\n'),
    negativePrompt,
    selectedAssets,
    warnings
  };
}
