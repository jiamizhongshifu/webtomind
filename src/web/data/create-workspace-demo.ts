import type {
  DiscoveryImage,
  DiscoverySearchResult
} from '@/services/create-workspace-v2-api';
import type { VisualMoodboard } from '@/shared/create-workspace-v2';
import { KREA_PUBLIC_MOODBOARDS_FEED } from '@/shared/krea-moodboards-feed';
import { isLoopbackHostname } from '@/utils/env';

const NOW = '2026-07-16T00:00:00.000Z';

export function isCreateWorkspaceDemoEnabled(): boolean {
  if (import.meta.env.DEV) return true;
  if (typeof window === 'undefined') return false;
  return isLoopbackHostname(window.location.hostname.toLowerCase());
}

interface MoodboardCaseBlueprint {
  id: string;
  name: string;
  keywords: string[];
  sourcePresetName?: string;
  assetPrefix?: string;
  discoveryImageIds?: string[];
  tasteProfile: string;
  avoids: string[];
  guidelines: string[];
  isOfficial: boolean;
}

const MOODBOARD_CASE_BLUEPRINTS: MoodboardCaseBlueprint[] = [
  {
    id: 'demo-personal-film',
    name: '复古网页噪点',
    keywords: ['早期网页', '扫描噪点', '像素故障', '蓝绿限色'],
    sourcePresetName: 'Retro Web',
    assetPrefix: 'retro-web',
    discoveryImageIds: ['f7176600-1320-571b-851f-ab4e9e64a9f9'],
    tasteProfile:
      '早期网页图形、扫描网点与轻微 RGB 错位构成带有互联网考古感的视觉语言。蓝绿限色保持系列统一，像素光标、粗糙印刷边缘和超现实拼贴让数字媒介显得真实可触。',
    avoids: ['光滑企业插画', '无颗粒渐变', '现代极简排版'],
    guidelines: [],
    isOfficial: true
  },
  {
    id: 'demo-personal-editorial',
    name: '未来魅影',
    keywords: ['未来妆容', '金属高光', '闪光摄影', '编辑人像'],
    sourcePresetName: 'Futurist Glam',
    assetPrefix: 'futurist-glam',
    discoveryImageIds: ['ff1123b3-744c-57e9-8f96-b658e44f09ab'],
    tasteProfile:
      '高反差闪光、金属妆面与冷暖偏色共同建立未来编辑感。人物近景强调眼妆、湿润高光和锐利轮廓，偶尔穿插复古电子设备，让千禧年代对未来的想象保持华丽而陌生。',
    avoids: ['自然光写真', '平淡裸妆', '柔焦糖水质感'],
    guidelines: [],
    isOfficial: true
  },
  {
    id: 'demo-preset-golden-hour',
    name: 'Coquette 花园',
    keywords: ['浅粉蕾丝', '蝴蝶结', '玫瑰', '复古茶具'],
    sourcePresetName: 'Coquette',
    assetPrefix: 'coquette',
    discoveryImageIds: ['fabc5e0a-fa8c-5f84-b57b-206d141a92a0'],
    tasteProfile:
      '浅粉、奶油白、蕾丝和缎带共同形成柔软精致的 Coquette 氛围。玫瑰、珍珠、瓷器与花园喷泉维持复古女性化的收藏感，柔和逆光让材质细节保持轻盈。',
    avoids: ['荧光色', '工业硬边', '高对比黑色背景'],
    guidelines: [
      '围绕粉白色阶展开',
      '优先展示蕾丝与瓷器材质',
      '保持柔和自然光和浅景深'
    ],
    isOfficial: true
  },
  {
    id: 'demo-preset-neon-night',
    name: '赛博杂志',
    keywords: ['旧电脑界面', '电路拼贴', '扫描故障', '赛博出版物'],
    sourcePresetName: 'Cyber Zine',
    assetPrefix: 'cyber-zine',
    discoveryImageIds: ['fbc7f178-5aaa-5cfb-8d5d-6fc953fc32c6'],
    tasteProfile:
      '旧电脑窗口、电路板纹理和扫描故障被组织成粗粝的独立出版物版面。米白纸色与黑色高对比构成基础，少量警示红和像素蓝负责建立信息焦点。',
    avoids: ['光滑科幻 3D', '大面积霓虹渐变', '规整企业网格'],
    guidelines: [
      '保留纸张和复印机噪点',
      '用窗口叠层组织信息',
      '强调黑白与单一强调色'
    ],
    isOfficial: true
  },
  {
    id: 'demo-preset-quiet-window',
    name: '蓝晒夜梦',
    keywords: ['蓝晒工艺', '深蓝单色', '失焦光晕', '梦境拼贴'],
    sourcePresetName: 'Lo-Fi Cyanotype',
    assetPrefix: 'cyanotype',
    discoveryImageIds: ['fc98c59c-fff5-5c85-b5a8-894a2f728e0e'],
    tasteProfile:
      '深蓝单色、曝光不均和漂浮白影复现手工蓝晒的偶然性。人物、建筑与文字像从记忆里短暂显影，柔软边缘和局部过曝让系列保持安静、神秘且具有实验摄影质感。',
    avoids: ['全彩照片', '锐利数码边缘', '干净矢量图形'],
    guidelines: [
      '坚持深蓝与白色',
      '允许边缘失焦和曝光漂移',
      '使用孤立主体与大面积暗部'
    ],
    isOfficial: true
  },
  {
    id: 'demo-preset-candle',
    name: '极简线稿',
    keywords: ['连续线条', '黑白速写', '大面积留白', '手绘轮廓'],
    sourcePresetName: 'Minimalist Sketch',
    assetPrefix: 'minimalist-sketch',
    discoveryImageIds: ['fd1f786a-8dd7-598b-ad13-8e0fdb682d1b'],
    tasteProfile:
      '少量连续黑线在温暖白纸上勾勒人物、室内和远景，依靠节奏而非细节表达对象。极大的留白、自然断笔和不完美比例，让画面兼具编辑感与即时速写的松弛。',
    avoids: ['复杂上色', '写实阴影', '密集交叉线'],
    guidelines: [
      '让单条线承担主要轮廓',
      '至少保留一半留白',
      '接受自然断笔和轻微比例偏差'
    ],
    isOfficial: true
  },
  {
    id: 'demo-preset-rain-room',
    name: '黑色电影',
    keywords: ['黑白高反差', '孤独剪影', '硬光阴影', '经典电影'],
    sourcePresetName: 'Film Noir',
    assetPrefix: 'film-noir',
    discoveryImageIds: ['fcd69feb-aeea-55c3-ac46-381a7c7f0d81'],
    tasteProfile:
      '纯黑剪影、大片负空间和切割画面的硬光构成经典黑色电影语言。人物、旧车与雾中街景保持疏离距离，以极简场面调度放大悬疑和孤独感。',
    avoids: ['彩色灯光', '柔和低对比', '拥挤群像'],
    guidelines: [
      '优先使用单一硬光',
      '让剪影与负空间对抗',
      '保留电影时代的服装和道具轮廓'
    ],
    isOfficial: true
  },
  {
    id: 'demo-preset-listening-bar',
    name: '复古波普图形',
    keywords: ['粗线插画', '高饱和色块', '俏皮角色', '复古广告'],
    sourcePresetName: 'Vintage Pop Graphic',
    assetPrefix: 'vintage-pop',
    discoveryImageIds: ['ffffaa51-090b-5747-9951-5c745317e46e'],
    tasteProfile:
      '粗黑轮廓、明亮色块和俏皮角色构成七十年代广告式的波普图形。番茄、花朵、女孩与怪趣动物都被压缩成清晰的大形状，用少量星芒点缀强化欢乐的印刷节奏。',
    avoids: ['照片写实', '低饱和灰调', '复杂材质渲染'],
    guidelines: [
      '使用粗黑轮廓',
      '限制为高饱和扁平色块',
      '让主体占据画面主要面积'
    ],
    isOfficial: true
  },
  {
    id: 'demo-krea-impasto-expressionism',
    name: '厚涂表现主义',
    keywords: ['厚涂笔触', '表现主义', '颜料肌理', '城市意象'],
    sourcePresetName: 'Impasto Expressionism',
    tasteProfile:
      '厚重颜料、可见刮刀痕迹与表现主义色彩共同构成具有强烈触觉的绘画语言，城市、人物和静物在堆叠笔触中保持情绪张力。',
    avoids: ['光滑数码渐变', '无纹理矢量图', '照片级干净表面'],
    guidelines: [],
    isOfficial: true
  },
  {
    id: 'demo-krea-expressive-marker',
    name: '表现性马克笔',
    keywords: ['马克笔', '快速排线', '手绘轮廓', '鲜明色块'],
    sourcePresetName: 'Expressive Marker',
    tasteProfile:
      '直接的马克笔线条、快速排线和不完全填满的色块保留手部动作感，以高对比轮廓和有限色板形成即时、活泼的编辑插画。',
    avoids: ['精细 3D 渲染', '完全平滑填色', '写实摄影材质'],
    guidelines: [],
    isOfficial: true
  },
  {
    id: 'demo-krea-thermal-airbrush',
    name: '热成像喷枪',
    keywords: ['热成像色谱', '喷枪渐变', '荧光轮廓', '梦幻肖像'],
    sourcePresetName: 'Thermal Airbrush',
    tasteProfile:
      '热成像般的紫红、橙黄与电蓝通过柔软喷枪过渡包裹主体，发光轮廓和低细节背景让人物与物体呈现梦境式能量场。',
    avoids: ['自然肤色纪实', '硬边扁平矢量', '低饱和灰调'],
    guidelines: [],
    isOfficial: true
  },
  {
    id: 'demo-preset-architectural-poetry',
    name: '建筑诗性',
    keywords: ['野兽派建筑', '几何空间', '材质肌理', '自然硬光'],
    discoveryImageIds: [
      'fff43f7a-69bd-5094-a937-8378a9a060a5',
      'ff5f8362-b031-59f8-9e2b-e9d040ec9e2f',
      'fe923706-f7aa-5872-85a2-ba9949be06ee',
      'fd843b4e-262b-53f3-a20a-22d001597927',
      'fca08452-00df-53d0-b82b-05c88801d0bd'
    ],
    tasteProfile:
      '粗粝混凝土、清晰几何切面和强烈自然光共同构成具有雕塑感的建筑叙事。画面强调结构尺度、负空间与材料触感，并用少量植被或人物建立空间参照。',
    avoids: ['装饰堆叠', '柔焦糖水滤镜', '拥挤商业街景'],
    guidelines: [],
    isOfficial: true
  },
  {
    id: 'demo-preset-commercial-still-life',
    name: '静物物语',
    keywords: ['商业静物', '材质对比', '硬边阴影', '编辑构图'],
    discoveryImageIds: [
      'fe4b7160-efd1-53d7-92f3-ff9df362f42a',
      'f9b3eeed-0d5f-5672-a9a6-956155c96436',
      'f7d9a03b-933c-5bfb-9b62-ff756b0e9fd7',
      'fee2ebe4-8a00-55a4-898d-e885f78cc301',
      'f9179a45-6fb2-5305-9dd3-489c2d6429fd'
    ],
    tasteProfile:
      '日常器物被置于克制的布景中，通过玻璃、陶瓷、金属与有机材质的并置获得商业编辑感。光线既可以锋利地切割背景，也可以柔和地保留器物表面细节。',
    avoids: ['杂乱生活记录', '无主次陈列', '过度镜面反射'],
    guidelines: [],
    isOfficial: true
  },
  {
    id: 'demo-preset-wild-landscape',
    name: '荒野地景',
    keywords: ['辽阔地貌', '极端尺度', '自然色阶', '环境摄影'],
    discoveryImageIds: [
      'ffe26a33-01a0-5729-9451-8cc59956e398',
      'ff50dff7-09a1-565e-a0e6-d14c9d39f337',
      'ffb49528-dc7a-5689-96bb-77377ca1aecd',
      'ff50b5de-78ac-5c1d-ba9b-e03892934df4',
      '9213fd64-7c0f-5858-afd0-8ef441bc9f51'
    ],
    tasteProfile:
      '峡谷、雪原、海岸与森林以宏大的尺度占据画面，人物和建筑只作为微小参照。自然光与气候决定色彩，强调地貌层次、空气透视和孤独的探索感。',
    avoids: ['棚拍背景', '过多人群', '虚假霓虹色'],
    guidelines: [],
    isOfficial: true
  },
  {
    id: 'demo-preset-surreal-object',
    name: '超现实物件',
    keywords: ['尺度错位', '悬浮物体', '单色背景', '触觉材质'],
    discoveryImageIds: [
      'f99a267f-c6b6-5cd4-a76a-5f5be967bdea',
      '00878e15-ecab-57ed-80b4-b749b205cc84',
      '9805905f-bd4e-5965-9a03-0956f976881b',
      'a8384b3a-fcc5-522e-bcc0-a434e5447645',
      '0d5843e7-27be-519f-9874-2a0196329747'
    ],
    tasteProfile:
      '熟悉物件通过悬浮、拉伸、巨大化或几何化变得陌生。纯色布景和清晰棚拍光让形态成为唯一焦点，同时保留绒布、晶体、果皮与半透明织物的触觉细节。',
    avoids: ['复杂叙事场景', '写实生活快照', '多余文字'],
    guidelines: [],
    isOfficial: true
  },
  {
    id: 'demo-preset-natural-macro',
    name: '自然微观',
    keywords: ['微距摄影', '生物细节', '自然纹理', '浅景深'],
    discoveryImageIds: [
      'fabc5e0a-fa8c-5f84-b57b-206d141a92a0',
      'f968e5f7-d5b3-57c3-a313-b17c1635b52d',
      'bf2f2ddc-b1e0-5783-ae6f-b992bca1ad02',
      'fb59cc39-7027-5c95-a87b-d6e2303fc77e',
      '0e2be222-82a0-5bb9-9ebe-65774e538e96'
    ],
    tasteProfile:
      '花瓣、浆果、羽毛与微小生物被放大到具有雕塑感的尺度。浅景深和柔和散景隔离主体，高分辨率纹理与自然色彩让细微结构成为视觉中心。',
    avoids: ['广角环境照', '塑料质感', '过度锐化轮廓'],
    guidelines: [],
    isOfficial: true
  },
  {
    id: 'demo-preset-urban-after-dark',
    name: '城市夜行',
    keywords: ['夜间城市', '雨后反光', '电影色彩', '动态光迹'],
    discoveryImageIds: [
      'f7176600-1320-571b-851f-ab4e9e64a9f9',
      'fb2ce599-93d6-5450-923a-757640a7252e',
      'd2b1812f-17dc-5d41-a7b0-60f3ffc07891',
      'ff1123b3-744c-57e9-8f96-b658e44f09ab',
      'fe7324db-ecaa-59d6-a831-bdad805b3a7d'
    ],
    tasteProfile:
      '湿润街道、冷色建筑和局部橙红光源组成夜间电影感。运动模糊、玻璃反射与深色负空间保持城市的不确定性，人物常被压缩为光线中的瞬间。',
    avoids: ['均匀白天照明', '旅游明信片构图', '无阴影平光'],
    guidelines: [],
    isOfficial: true
  },
  {
    id: 'demo-preset-quiet-residence',
    name: '静谧住宅',
    keywords: ['现代住宅', '温润木材', '自然采光', '安静秩序'],
    discoveryImageIds: [
      'fc11ca74-3048-5754-9b50-9bee1bb0eddc',
      'fb4f0b54-f081-5c35-b324-8569d6bd5e19',
      'fa8034cd-d010-50e1-904d-33d41f0387d0',
      'f7a84c73-427d-5cf1-bb2a-6fac3c9420f1',
      'f8dc3be1-1eda-5d96-97f6-0804422bd060'
    ],
    tasteProfile:
      '木材、石材、玻璃和柔软织物构成克制的居住空间。自然采光沿结构线进入室内，低饱和配色与明确秩序让住宅呈现安静、真实且可居住的质感。',
    avoids: ['夸张豪宅炫光', '杂乱软装', '高饱和装饰色'],
    guidelines: [],
    isOfficial: true
  },
  {
    id: 'demo-preset-graphic-experiments',
    name: '图形实验',
    keywords: ['几何色块', '拼贴系统', '平面节奏', '鲜明对比'],
    discoveryImageIds: [
      'ff687bc7-3309-5f71-a48c-8c92e244d66c',
      'fd1f786a-8dd7-598b-ad13-8e0fdb682d1b',
      'fbc7f178-5aaa-5cfb-8d5d-6fc953fc32c6',
      'ffffaa51-090b-5747-9951-5c745317e46e',
      'f58524bd-c3ca-559e-b1cb-558a462f5e10'
    ],
    tasteProfile:
      '几何模块、剪贴人像与扁平色块建立高辨识度的平面系统。清晰轮廓和有限色板负责秩序，错位拼贴与比例变化提供实验性，适合海报和品牌视觉探索。',
    avoids: ['无结构照片堆叠', '灰暗同色调', '默认模板排版'],
    guidelines: [],
    isOfficial: true
  }
];

function makeMoodboard(blueprint: MoodboardCaseBlueprint): VisualMoodboard {
  const sourcePreset = blueprint.sourcePresetName
    ? KREA_PUBLIC_MOODBOARDS_FEED.find(
        (board) => board.name === blueprint.sourcePresetName
      )
    : undefined;
  const sourceImages = sourcePreset
    ? sourcePreset.images.slice(0, 8).map((image) => image.imageUrl)
    : [];
  const curatedImages = blueprint.assetPrefix
    ? Array.from(
        { length: 4 },
        (_, index) =>
          `/moodboards/curated/${blueprint.assetPrefix}-${index + 1}.webp`
      )
    : [];
  // Open-source build: third-party discovery images are not shipped.
  const discoveryImages: string[] = [];
  const fallbackImages = [...curatedImages, ...discoveryImages].slice(0, 5);
  const images = sourceImages.length >= 4 ? sourceImages : fallbackImages;
  const keywords = Array.from(
    new Set([...blueprint.keywords, ...(sourcePreset?.positiveKeywords || [])])
  );
  return {
    id: blueprint.id,
    name: blueprint.name,
    description: `${blueprint.keywords.join('、')}的独立视觉参考集合`,
    visibility: blueprint.isOfficial ? 'public' : 'private',
    isOfficial: blueprint.isOfficial,
    isOwner: !blueprint.isOfficial,
    coverImageUrl: images[0],
    itemCount: images.length,
    analysisStatus: 'ready',
    tasteProfile: sourcePreset?.tasteProfile || blueprint.tasteProfile,
    keywords,
    avoids: blueprint.avoids,
    // Official presets describe the shared visual language. Guidelines are a
    // separate, user-owned instruction layer and start empty on a preset.
    guidelines: blueprint.isOfficial ? [] : blueprint.guidelines,
    representativeAssetIds: [],
    analysisVersion: 1,
    items: images.map((imageUrl, index) => ({
      id: `${blueprint.id}-item-${index + 1}`,
      moodboardId: blueprint.id,
      source: 'preset',
      imageUrl,
      title: `${blueprint.name} ${index + 1}`,
      sortOrder: index,
      isRepresentative: true,
      createdAt: NOW
    })),
    createdAt: sourcePreset?.createdAt || NOW,
    updatedAt: sourcePreset?.updatedAt || NOW
  };
}

export function createCaseMoodboardPreviews(): VisualMoodboard[] {
  // Open-source build: keep only presets backed by bundled images.
  return MOODBOARD_CASE_BLUEPRINTS.map(makeMoodboard).filter(
    (board) => (board.items?.length ?? 0) > 0
  );
}

export const createWorkspaceDemoMoodboards: VisualMoodboard[] =
  createCaseMoodboardPreviews();

export function withCreateWorkspaceDiscoveryFallback(
  result: DiscoverySearchResult | null,
  query: string
): DiscoverySearchResult {
  const images = result?.images || [];
  const curatedMoodboards = createCaseMoodboardPreviews();
  const liveMoodboards = result?.moodboards || [];
  return {
    query: result?.query ?? query,
    images,
    moodboards: [
      ...curatedMoodboards,
      ...liveMoodboards.filter(
        (board) => !curatedMoodboards.some((curated) => curated.id === board.id)
      )
    ]
  };
}

export function withCreateWorkspaceMoodboardFallback(
  boards: VisualMoodboard[],
  _cases: DiscoveryImage[] = []
): VisualMoodboard[] {
  const caseMoodboards = createCaseMoodboardPreviews();
  if (boards.length) {
    return [
      ...boards.filter((board) => !board.isOfficial),
      ...caseMoodboards.filter((board) => board.isOfficial)
    ];
  }
  if (caseMoodboards.length) return caseMoodboards;
  return isCreateWorkspaceDemoEnabled() ? createWorkspaceDemoMoodboards : [];
}

export function getCreateWorkspaceMoodboardFallback(
  id: string
): VisualMoodboard | null {
  if (!isCreateWorkspaceDemoEnabled()) return null;
  return createWorkspaceDemoMoodboards.find((board) => board.id === id) || null;
}
