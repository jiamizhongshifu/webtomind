export type TuziImageModelId =
  | 'gpt-image-2'
  | 'gpt-image-2.5'
  | 'nano-banana'
  | 'nano-banana-2'
  | 'nano-banana-pro'
  | 'midjourney-v7'
  | 'midjourney-niji-v7'
  | 'seedream-5-pro'
  | 'seedream-5-lite'
  | 'wan-image-2-7-pro';

export type TuziReferenceTransport =
  | 'images_generations'
  | 'images_edits'
  | 'chat_image'
  | 'unsupported';

export type TuziImageModelGroup =
  | 'recommended'
  | 'realistic'
  | 'anime'
  | 'commercial'
  | 'experimental';

export type TuziImageResponseFormat = 'b64_json' | 'url';

export interface TuziImageModelConfig {
  id: TuziImageModelId;
  apiModel: string;
  label: string;
  description: string;
  provider: 'tuzi' | 'openai';
  group: TuziImageModelGroup;
  badges: string[];
  supportsTextToImage: boolean;
  supportsReferenceImage: boolean;
  supportsMultipleImages: boolean;
  maxImageCount: number;
  maxReferenceImages: number;
  referenceTransport: TuziReferenceTransport;
  preferredResponseFormat: TuziImageResponseFormat;
  allowProviderFallback: boolean;
  recommendedImageSizes: string[];
  creditMultiplier: number;
}

/**
 * 每个模型至少暴露的 1K 档位尺寸，覆盖全部支持比例
 * （1:1 / 2:3 / 3:2 / 3:4 / 4:3 / 4:5 / 5:4 / 9:16 / 16:9 / 21:9）。
 * 完整尺寸网格见 src/web/data/image-creator-options.ts 的 imageSizeOptions。
 */
const ALL_ASPECT_RATIO_1K_IMAGE_SIZES = [
  '1024x1024', // 1:1
  '1024x1536', // 2:3
  '1536x1024', // 3:2
  '1152x1536', // 3:4
  '1536x1152', // 4:3
  '1024x1280', // 4:5
  '1280x1024', // 5:4
  '864x1536', // 9:16
  '1536x864', // 16:9
  '1792x768' // 21:9
] as const;

function withAllRatioSizes(sizes: string[]): string[] {
  return Array.from(new Set([...ALL_ASPECT_RATIO_1K_IMAGE_SIZES, ...sizes]));
}

export const TUZI_IMAGE_MODEL_CONFIG: Record<
  TuziImageModelId,
  TuziImageModelConfig
> = {
  'gpt-image-2': {
    id: 'gpt-image-2',
    apiModel: 'gpt-image-2',
    label: 'GPT Image 2',
    description:
      '主力 OpenAI-compatible 图像生成通道，适合通用高质量图片生成。',
    provider: 'openai',
    group: 'recommended',
    badges: ['Main', 'GPT Image 2'],
    supportsTextToImage: true,
    supportsReferenceImage: true,
    supportsMultipleImages: true,
    maxImageCount: 10,
    maxReferenceImages: 4,
    referenceTransport: 'images_edits',
    preferredResponseFormat: 'b64_json',
    allowProviderFallback: true,
    recommendedImageSizes: withAllRatioSizes(['1152x2048']),
    creditMultiplier: 1
  },
  'gpt-image-2.5': {
    id: 'gpt-image-2.5',
    apiModel: 'gpt-image-2.5',
    label: 'GPT Image 2.5',
    description: '新一代通用图像生成与编辑模型，适合高质量创作和多方案迭代。',
    provider: 'tuzi',
    group: 'recommended',
    badges: ['New', 'GPT Image 2.5'],
    supportsTextToImage: true,
    supportsReferenceImage: true,
    supportsMultipleImages: true,
    maxImageCount: 10,
    maxReferenceImages: 4,
    referenceTransport: 'images_edits',
    preferredResponseFormat: 'b64_json',
    allowProviderFallback: true,
    recommendedImageSizes: withAllRatioSizes(['1152x2048']),
    creditMultiplier: 1
  },
  'nano-banana': {
    id: 'nano-banana',
    apiModel: 'gemini-3.1-flash-image-preview',
    label: 'Nano Banana',
    description: '轻量、快速、适合参考图改写和稳定迭代。',
    provider: 'tuzi',
    group: 'recommended',
    badges: ['Fast', 'Reference'],
    supportsTextToImage: true,
    supportsReferenceImage: true,
    supportsMultipleImages: true,
    maxImageCount: 4,
    maxReferenceImages: 4,
    referenceTransport: 'images_edits',
    preferredResponseFormat: 'url',
    allowProviderFallback: true,
    recommendedImageSizes: withAllRatioSizes(['1152x2048']),
    creditMultiplier: 1
  },
  'nano-banana-2': {
    id: 'nano-banana-2',
    apiModel: 'gemini-3.1-flash-image-preview',
    label: 'Nano Banana 2',
    description: '更适合日常商业图、参考图续作和快速多方案探索。',
    provider: 'tuzi',
    group: 'recommended',
    badges: ['Fast', 'Reference'],
    supportsTextToImage: true,
    supportsReferenceImage: true,
    supportsMultipleImages: true,
    maxImageCount: 4,
    maxReferenceImages: 4,
    referenceTransport: 'images_edits',
    preferredResponseFormat: 'url',
    allowProviderFallback: true,
    recommendedImageSizes: withAllRatioSizes(['1152x2048']),
    // 与 nano-banana 同一后端模型（gemini-3.1-flash-image-preview），成本一致，
    // 取消此前无成本依据的 1.15 溢价（2026-08-17 计费对齐）。
    creditMultiplier: 1
  },
  'nano-banana-pro': {
    id: 'nano-banana-pro',
    apiModel: 'gemini-3-pro-image-preview',
    label: 'Nano Banana Pro',
    description: '更强的结构、文字和材质一致性，适合 2K/4K 成品图。',
    provider: 'tuzi',
    group: 'commercial',
    badges: ['Pro', '4K'],
    supportsTextToImage: true,
    supportsReferenceImage: true,
    supportsMultipleImages: true,
    maxImageCount: 4,
    maxReferenceImages: 4,
    referenceTransport: 'images_edits',
    preferredResponseFormat: 'url',
    allowProviderFallback: true,
    recommendedImageSizes: withAllRatioSizes([
      '2048x2048',
      '1152x2048',
      '2160x3840'
    ]),
    creditMultiplier: 1.8
  },
  'midjourney-v7': {
    id: 'midjourney-v7',
    apiModel: 'midjourney-v7',
    label: 'Midjourney',
    description: '高审美、强风格化，适合概念视觉、海报和氛围图。',
    provider: 'tuzi',
    group: 'realistic',
    badges: ['Aesthetic', 'Stylized'],
    supportsTextToImage: true,
    supportsReferenceImage: false,
    // Tuzi 的 MJ Imagine 接口每个任务返回一个 imageUrl，不支持 OpenAI
    // images/generations 的 n 参数；多图由上层显式拆成多个任务。
    supportsMultipleImages: false,
    maxImageCount: 1,
    maxReferenceImages: 0,
    referenceTransport: 'unsupported',
    preferredResponseFormat: 'url',
    allowProviderFallback: true,
    recommendedImageSizes: withAllRatioSizes([]),
    creditMultiplier: 2.2
  },
  'midjourney-niji-v7': {
    id: 'midjourney-niji-v7',
    apiModel: 'midjourney-niji-v7',
    label: 'Midjourney Niji',
    description: '动漫和二次元风格模型，适合角色、插画和海报。',
    provider: 'tuzi',
    group: 'anime',
    badges: ['Anime', 'Stylized'],
    supportsTextToImage: true,
    supportsReferenceImage: false,
    // Tuzi 的 MJ Imagine 接口每个任务返回一个 imageUrl，不支持 OpenAI
    // images/generations 的 n 参数；多图由上层显式拆成多个任务。
    supportsMultipleImages: false,
    maxImageCount: 1,
    maxReferenceImages: 0,
    referenceTransport: 'unsupported',
    preferredResponseFormat: 'url',
    allowProviderFallback: true,
    recommendedImageSizes: withAllRatioSizes([]),
    creditMultiplier: 2.2
  },
  'seedream-5-pro': {
    id: 'seedream-5-pro',
    apiModel: 'seedream-5-0-pro',
    label: 'Seedream 5.0 Pro',
    description:
      '写实与商业视觉旗舰模型，支持最多 10 张参考图与精准编辑，出图更精致。',
    provider: 'tuzi',
    group: 'realistic',
    badges: ['Pro', 'Reference'],
    supportsTextToImage: true,
    supportsReferenceImage: true,
    // 官方仅支持单图输出（不支持 sequential_image_generation），参考图最多 10 张。
    supportsMultipleImages: false,
    maxImageCount: 1,
    maxReferenceImages: 10,
    referenceTransport: 'images_edits',
    preferredResponseFormat: 'url',
    allowProviderFallback: true,
    // 官方总像素上限 2048x2048x1.1025（≈462 万），仅 1K/1.5K/2K 档位，无 4K。
    recommendedImageSizes: withAllRatioSizes(['2048x2048', '1152x2048']),
    creditMultiplier: 2
  },
  'seedream-5-lite': {
    id: 'seedream-5-lite',
    apiModel: 'seedream-5-0-lite',
    label: 'Seedream 5.0 Lite',
    description: '高审美写实与商业视觉模型，适合快速出高完成度图片。',
    provider: 'tuzi',
    group: 'realistic',
    badges: ['Aesthetic', 'Fast'],
    supportsTextToImage: true,
    supportsReferenceImage: true,
    supportsMultipleImages: true,
    maxImageCount: 4,
    maxReferenceImages: 4,
    referenceTransport: 'images_edits',
    preferredResponseFormat: 'url',
    allowProviderFallback: true,
    recommendedImageSizes: withAllRatioSizes(['2048x2048']),
    creditMultiplier: 1.5
  },
  'wan-image-2-7-pro': {
    id: 'wan-image-2-7-pro',
    apiModel: 'wan-image-2.7-pro',
    label: 'WAN Image 2.7 Pro',
    description: '稳定构图和精准提示理解，适合产品视觉和批量方案。',
    provider: 'tuzi',
    group: 'commercial',
    badges: ['Pro', 'Stable'],
    supportsTextToImage: true,
    supportsReferenceImage: true,
    supportsMultipleImages: true,
    maxImageCount: 4,
    maxReferenceImages: 4,
    referenceTransport: 'images_edits',
    preferredResponseFormat: 'url',
    allowProviderFallback: true,
    recommendedImageSizes: withAllRatioSizes(['2048x2048']),
    creditMultiplier: 1.6
  }
};

// GPT Image 2 remains in the registry so historical generations keep their
// original label and capability metadata. New creation surfaces only expose
// GPT Image 2.5.
export const TUZI_IMAGE_MODELS = Object.values(TUZI_IMAGE_MODEL_CONFIG).filter(
  (model) => model.id !== 'gpt-image-2'
);

const TUZI_MODEL_ALIASES: Record<string, TuziImageModelId> = {
  'gpt-image-2.5': 'gpt-image-2.5',
  'gpt image 2.5': 'gpt-image-2.5',
  'gpt-image': 'gpt-image-2',
  'gpt-image-2': 'gpt-image-2',
  'gpt-image-2-vip': 'gpt-image-2',
  'gpt image': 'gpt-image-2',
  'gpt image 2': 'gpt-image-2',
  gpt: 'gpt-image-2',
  openai: 'gpt-image-2',
  tuzi: 'gpt-image-2',
  'nano-banana': 'nano-banana',
  'nano banana': 'nano-banana',
  'nano-banana-2': 'nano-banana-2',
  'nano banana 2': 'nano-banana-2',
  'nano-banana-pro': 'nano-banana-pro',
  'nano banana pro': 'nano-banana-pro',
  'gemini-3.1-flash-image-preview': 'nano-banana-2',
  'gemini-3.1-flash-image': 'nano-banana-2',
  'gemini-3-pro-image-preview': 'nano-banana-pro',
  nano: 'nano-banana',
  banana: 'nano-banana',
  gemini: 'nano-banana',
  'gemini-image': 'nano-banana',
  midjourney: 'midjourney-v7',
  'midjourney-v7': 'midjourney-v7',
  'midjourney v7': 'midjourney-v7',
  'mj-v7': 'midjourney-v7',
  'mj v7': 'midjourney-v7',
  niji: 'midjourney-niji-v7',
  'niji-v7': 'midjourney-niji-v7',
  'niji 7': 'midjourney-niji-v7',
  'midjourney-niji-v7': 'midjourney-niji-v7',
  'midjourney niji 7': 'midjourney-niji-v7',
  seedream: 'seedream-5-lite',
  'seedream-5-lite': 'seedream-5-lite',
  'seedream 5 lite': 'seedream-5-lite',
  'seedream-5.0-lite': 'seedream-5-lite',
  'seedream 5.0 lite': 'seedream-5-lite',
  'seedream-5-0-lite': 'seedream-5-lite',
  'seedream-pro': 'seedream-5-pro',
  'seedream-5-pro': 'seedream-5-pro',
  'seedream 5 pro': 'seedream-5-pro',
  'seedream-5.0-pro': 'seedream-5-pro',
  'seedream 5.0 pro': 'seedream-5-pro',
  'seedream-5-0-pro': 'seedream-5-pro',
  wan: 'wan-image-2-7-pro',
  'wan-image-2-7-pro': 'wan-image-2-7-pro',
  'wan image 2.7 pro': 'wan-image-2-7-pro',
  'wan-image-2.7-pro': 'wan-image-2-7-pro'
};

export function isGptImage25Model(
  modelId: string | undefined
): modelId is 'gpt-image-2.5' {
  return modelId === 'gpt-image-2.5';
}

export function isSupportedChaoGptImage25ApiModel(
  apiModel: string | undefined
): boolean {
  const normalized = (apiModel || '').trim().toLowerCase();
  return normalized === 'gpt-image-2' || normalized === 'gpt-image-2.5';
}

export function normalizeTuziImageModelId(
  value: string | undefined
): TuziImageModelId {
  const normalized = (value || '').trim().toLowerCase();
  return TUZI_MODEL_ALIASES[normalized] || 'gpt-image-2';
}

export function getTuziImageModelConfig(
  modelId: string | undefined
): TuziImageModelConfig {
  return TUZI_IMAGE_MODEL_CONFIG[normalizeTuziImageModelId(modelId)];
}

export function getTuziImageModelLabel(modelId: string | undefined): string {
  return getTuziImageModelConfig(modelId).label;
}

export function getTuziImageModelCreditMultiplier(
  modelId: string | undefined
): number {
  return getTuziImageModelConfig(modelId).creditMultiplier;
}
