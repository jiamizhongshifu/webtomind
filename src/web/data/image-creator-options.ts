/**
 * /create 视觉工作台的静态选项配置(尺寸 / 画质档位 / 输出格式 / 模型)。
 * 页面(normalizeCreatorSettings 归一化)与 CreatorControls(渲染下拉/分段)共用。
 */

import {
  TUZI_IMAGE_MODELS,
  isGptImage25Model,
  type TuziImageModelId,
  type TuziImageModelGroup
} from '../../shared/tuzi-image-models';
import { getImageGenerationResolutionTier } from '../../shared/image-generation-pricing';

export type RuntimeImageModelStatus = 'available' | 'degraded' | 'unavailable';

export interface ImageCreatorModelOption {
  value: TuziImageModelId;
  label: string;
  group: TuziImageModelGroup;
  description: string;
  badges: string[];
  supportsReferenceImage: boolean;
  supportsMultipleImages: boolean;
  maxImageCount: number;
  maxReferenceImages: number;
  preferredResponseFormat: 'b64_json' | 'url';
  allowProviderFallback: boolean;
  recommendedImageSizes: string[];
  creditMultiplier: number;
  status: RuntimeImageModelStatus;
  availabilityReason?: string;
}

export interface RuntimeImageModelDirectoryEntry {
  id: string;
  status?: RuntimeImageModelStatus;
  availabilityReason?: string;
}

export const imageSizeOptions = [
  {
    value: 'auto',
    aspectRatio: 'auto',
    labelKey: 'controls.sizeOptions.auto.label',
    detailKey: 'controls.sizeOptions.auto.detail'
  },
  {
    value: '1024x1024',
    aspectRatio: '1:1',
    labelKey: 'controls.sizeOptions.square1k.label',
    detailKey: 'controls.sizeOptions.square1k.detail'
  },
  {
    value: '1024x1536',
    aspectRatio: '2:3',
    labelKey: 'controls.sizeOptions.portrait1536.label',
    detailKey: 'controls.sizeOptions.portrait1536.detail'
  },
  {
    value: '1536x1024',
    aspectRatio: '3:2',
    labelKey: 'controls.sizeOptions.landscape1536.label',
    detailKey: 'controls.sizeOptions.landscape1536.detail'
  },
  {
    value: '1152x1536',
    aspectRatio: '3:4',
    labelKey: 'controls.sizeOptions.portrait3x4_1k.label',
    detailKey: 'controls.sizeOptions.portrait3x4_1k.detail'
  },
  {
    value: '1536x1152',
    aspectRatio: '4:3',
    labelKey: 'controls.sizeOptions.landscape4x3_1k.label',
    detailKey: 'controls.sizeOptions.landscape4x3_1k.detail'
  },
  {
    value: '1024x1280',
    aspectRatio: '4:5',
    labelKey: 'controls.sizeOptions.portrait4x5_1k.label',
    detailKey: 'controls.sizeOptions.portrait4x5_1k.detail'
  },
  {
    value: '1280x1024',
    aspectRatio: '5:4',
    labelKey: 'controls.sizeOptions.landscape5x4_1k.label',
    detailKey: 'controls.sizeOptions.landscape5x4_1k.detail'
  },
  {
    value: '864x1536',
    aspectRatio: '9:16',
    labelKey: 'controls.sizeOptions.portrait9x16_1k.label',
    detailKey: 'controls.sizeOptions.portrait9x16_1k.detail'
  },
  {
    value: '1536x864',
    aspectRatio: '16:9',
    labelKey: 'controls.sizeOptions.landscape16x9_1k.label',
    detailKey: 'controls.sizeOptions.landscape16x9_1k.detail'
  },
  {
    value: '1792x768',
    aspectRatio: '21:9',
    labelKey: 'controls.sizeOptions.ultrawide21x9_1k.label',
    detailKey: 'controls.sizeOptions.ultrawide21x9_1k.detail'
  },
  {
    value: '2048x2048',
    aspectRatio: '1:1',
    labelKey: 'controls.sizeOptions.square2k.label',
    detailKey: 'controls.sizeOptions.square2k.detail'
  },
  {
    value: '1344x2016',
    aspectRatio: '2:3',
    labelKey: 'controls.sizeOptions.portrait2x3_2k.label',
    detailKey: 'controls.sizeOptions.portrait2x3_2k.detail'
  },
  {
    value: '2016x1344',
    aspectRatio: '3:2',
    labelKey: 'controls.sizeOptions.landscape3x2_2k.label',
    detailKey: 'controls.sizeOptions.landscape3x2_2k.detail'
  },
  {
    value: '1536x2048',
    aspectRatio: '3:4',
    labelKey: 'controls.sizeOptions.portrait3x4_2k.label',
    detailKey: 'controls.sizeOptions.portrait3x4_2k.detail'
  },
  {
    value: '2048x1536',
    aspectRatio: '4:3',
    labelKey: 'controls.sizeOptions.landscape4x3_2k.label',
    detailKey: 'controls.sizeOptions.landscape4x3_2k.detail'
  },
  {
    value: '1600x2000',
    aspectRatio: '4:5',
    labelKey: 'controls.sizeOptions.portrait4x5_2k.label',
    detailKey: 'controls.sizeOptions.portrait4x5_2k.detail'
  },
  {
    value: '2000x1600',
    aspectRatio: '5:4',
    labelKey: 'controls.sizeOptions.landscape5x4_2k.label',
    detailKey: 'controls.sizeOptions.landscape5x4_2k.detail'
  },
  {
    value: '2048x1152',
    aspectRatio: '16:9',
    labelKey: 'controls.sizeOptions.landscape2k.label',
    detailKey: 'controls.sizeOptions.landscape2k.detail'
  },
  {
    value: '1152x2048',
    aspectRatio: '9:16',
    labelKey: 'controls.sizeOptions.portrait2k.label',
    detailKey: 'controls.sizeOptions.portrait2k.detail'
  },
  {
    value: '2688x1152',
    aspectRatio: '21:9',
    labelKey: 'controls.sizeOptions.ultrawide21x9_2k.label',
    detailKey: 'controls.sizeOptions.ultrawide21x9_2k.detail'
  },
  {
    value: '2880x2880',
    aspectRatio: '1:1',
    labelKey: 'controls.sizeOptions.square4k.label',
    detailKey: 'controls.sizeOptions.square4k.detail'
  },
  {
    value: '2304x3456',
    aspectRatio: '2:3',
    labelKey: 'controls.sizeOptions.portrait2x3_4k.label',
    detailKey: 'controls.sizeOptions.portrait2x3_4k.detail'
  },
  {
    value: '3456x2304',
    aspectRatio: '3:2',
    labelKey: 'controls.sizeOptions.landscape3x2_4k.label',
    detailKey: 'controls.sizeOptions.landscape3x2_4k.detail'
  },
  {
    value: '2304x3072',
    aspectRatio: '3:4',
    labelKey: 'controls.sizeOptions.portrait3x4_4k.label',
    detailKey: 'controls.sizeOptions.portrait3x4_4k.detail'
  },
  {
    value: '3072x2304',
    aspectRatio: '4:3',
    labelKey: 'controls.sizeOptions.landscape4x3_4k.label',
    detailKey: 'controls.sizeOptions.landscape4x3_4k.detail'
  },
  {
    value: '2560x3200',
    aspectRatio: '4:5',
    labelKey: 'controls.sizeOptions.portrait4x5_4k.label',
    detailKey: 'controls.sizeOptions.portrait4x5_4k.detail'
  },
  {
    value: '3200x2560',
    aspectRatio: '5:4',
    labelKey: 'controls.sizeOptions.landscape5x4_4k.label',
    detailKey: 'controls.sizeOptions.landscape5x4_4k.detail'
  },
  {
    value: '3840x2160',
    aspectRatio: '16:9',
    labelKey: 'controls.sizeOptions.landscape4k.label',
    detailKey: 'controls.sizeOptions.landscape4k.detail'
  },
  {
    value: '2160x3840',
    aspectRatio: '9:16',
    labelKey: 'controls.sizeOptions.portrait4k.label',
    detailKey: 'controls.sizeOptions.portrait4k.detail'
  },
  {
    value: '3808x1632',
    aspectRatio: '21:9',
    labelKey: 'controls.sizeOptions.ultrawide21x9_4k.label',
    detailKey: 'controls.sizeOptions.ultrawide21x9_4k.detail'
  }
] as const;

export const aspectRatioOptions = [
  { value: 'auto', label: 'Auto' },
  { value: '1:1', label: '1:1' },
  { value: '2:3', label: '2:3' },
  { value: '3:2', label: '3:2' },
  { value: '3:4', label: '3:4' },
  { value: '4:3', label: '4:3' },
  { value: '4:5', label: '4:5' },
  { value: '5:4', label: '5:4' },
  { value: '16:9', label: '16:9' },
  { value: '9:16', label: '9:16' },
  { value: '21:9', label: '21:9' }
] as const;

export const imageResolutionOptions = [
  { value: '1k', label: '1K' },
  { value: '2k', label: '2K' },
  { value: '4k', label: '4K' }
] as const;

export const PREFERRED_IMAGE_COUNT_OPTIONS = [1, 2, 4, 6, 8, 10] as const;

export function getImageSizeOption(value: string | undefined) {
  return imageSizeOptions.find((option) => option.value === value);
}

export function getAspectRatioForImageSize(value: string | undefined): string {
  return getImageSizeOption(value)?.aspectRatio || '2:3';
}

export function getImageSizeForAspectRatio(
  aspectRatio: string | undefined
): string {
  if (!aspectRatio || aspectRatio === 'auto') return 'auto';
  return (
    imageSizeOptions.find((option) => option.aspectRatio === aspectRatio)
      ?.value || '1024x1536'
  );
}

export function getImageResolutionForImageSize(
  imageSize: string | undefined
): '1k' | '2k' | '4k' {
  const tier = getImageGenerationResolutionTier(imageSize);
  return tier === '4k' ? '4k' : tier === 'large-2k' ? '2k' : '1k';
}

export function getImageSizeForAspectRatioAndResolution(
  aspectRatio: string | undefined,
  resolution: string | undefined
): string {
  if (!aspectRatio || aspectRatio === 'auto') return 'auto';
  const targetRatio =
    aspectRatioOptions.find((option) => option.value === aspectRatio)?.value ||
    '1:1';
  const targetResolution =
    imageResolutionOptions.find((option) => option.value === resolution)
      ?.value || '1k';
  return (
    imageSizeOptions.find(
      (option) =>
        option.aspectRatio === targetRatio &&
        getImageResolutionForImageSize(option.value) === targetResolution
    )?.value || getImageSizeForAspectRatio(targetRatio)
  );
}

export const qualityOptions = [
  {
    value: 'auto',
    labelKey: 'controls.quality.auto' as const
  },
  {
    value: 'high',
    labelKey: 'controls.quality.high' as const
  },
  {
    value: 'medium',
    labelKey: 'controls.quality.medium' as const
  },
  {
    value: 'low',
    labelKey: 'controls.quality.low' as const
  }
];

export const outputFormatOptions = [
  {
    value: 'png',
    labelKey: 'controls.outputFormat.png' as const
  },
  {
    value: 'jpeg',
    labelKey: 'controls.outputFormat.jpeg' as const
  },
  {
    value: 'webp',
    labelKey: 'controls.outputFormat.webp' as const
  }
];

export const modelGroupLabels: Record<TuziImageModelGroup, string> = {
  recommended: '推荐',
  realistic: '写实',
  anime: '动漫',
  commercial: '商业',
  experimental: '实验'
};

export const modelGroupOrder: TuziImageModelGroup[] = [
  'recommended',
  'realistic',
  'anime',
  'commercial',
  'experimental'
];

export const modelOptions: ImageCreatorModelOption[] = TUZI_IMAGE_MODELS.map(
  (model) => ({
    value: model.id,
    label: model.label,
    group: model.group,
    description: model.description,
    badges: model.badges,
    supportsReferenceImage: model.supportsReferenceImage,
    supportsMultipleImages: model.supportsMultipleImages,
    maxImageCount: model.maxImageCount,
    maxReferenceImages: model.maxReferenceImages,
    preferredResponseFormat: model.preferredResponseFormat,
    allowProviderFallback: model.allowProviderFallback,
    recommendedImageSizes: model.recommendedImageSizes,
    creditMultiplier: model.creditMultiplier,
    status: isGptImage25Model(model.id) ? 'unavailable' : 'available',
    ...(isGptImage25Model(model.id)
      ? { availabilityReason: 'feature_disabled' }
      : {})
  })
);

export function mergeRuntimeImageModelOptions(
  runtimeModels: RuntimeImageModelDirectoryEntry[]
): ImageCreatorModelOption[] {
  if (runtimeModels.length === 0) return modelOptions;
  const runtimeById = new Map(runtimeModels.map((model) => [model.id, model]));
  return modelOptions.map((model) => {
    const runtime = runtimeById.get(model.value);
    return runtime
      ? {
          ...model,
          status: runtime.status || 'available',
          availabilityReason: runtime.availabilityReason
        }
      : model;
  });
}

export function getSelectableImageModelOptions(
  options: ImageCreatorModelOption[]
): ImageCreatorModelOption[] {
  return options.filter((model) => model.status !== 'unavailable');
}

export function getImageSizeOptionsForModel(
  model: ImageCreatorModelOption | undefined
) {
  if (!model?.recommendedImageSizes.length) return imageSizeOptions;
  const recommended = new Set(model.recommendedImageSizes);
  return imageSizeOptions.filter(
    (option) => option.value === 'auto' || recommended.has(option.value)
  );
}

export function getAspectRatioOptionsForModel(
  model: ImageCreatorModelOption | undefined
) {
  if (!model?.recommendedImageSizes.length) return aspectRatioOptions;
  const ratios = new Set(
    getImageSizeOptionsForModel(model).map((option) => option.aspectRatio)
  );
  return aspectRatioOptions.filter(
    (option) => option.value === 'auto' || ratios.has(option.value)
  );
}

export function getImageResolutionOptionsForModel(
  model: ImageCreatorModelOption | undefined,
  aspectRatio?: string
) {
  if (!aspectRatio || aspectRatio === 'auto') return imageResolutionOptions;
  if (!model?.recommendedImageSizes.length) return imageResolutionOptions;
  const recommendedSizes = aspectRatio
    ? model.recommendedImageSizes.filter(
        (size) => getAspectRatioForImageSize(size) === aspectRatio
      )
    : model.recommendedImageSizes;
  const resolutions = new Set(
    recommendedSizes.map((size) => getImageResolutionForImageSize(size))
  );
  return imageResolutionOptions.filter((option) =>
    resolutions.has(option.value)
  );
}

export function getImageSizeForModelAspectRatioAndResolution(
  model: ImageCreatorModelOption | undefined,
  aspectRatio: string,
  resolution: string
): string {
  if (!aspectRatio || aspectRatio === 'auto') return 'auto';
  if (!model?.recommendedImageSizes.length) {
    return getImageSizeForAspectRatioAndResolution(aspectRatio, resolution);
  }
  const ratioSizes = model.recommendedImageSizes.filter(
    (size) => getAspectRatioForImageSize(size) === aspectRatio
  );
  return (
    ratioSizes.find(
      (size) => getImageResolutionForImageSize(size) === resolution
    ) ||
    ratioSizes[0] ||
    model.recommendedImageSizes[0]
  );
}

export function resolveRecommendedImageSizeForModel(
  model: ImageCreatorModelOption | undefined,
  currentImageSize: string
): string {
  if (!model?.recommendedImageSizes.length || currentImageSize === 'auto') {
    return currentImageSize;
  }
  if (model.recommendedImageSizes.includes(currentImageSize)) {
    return currentImageSize;
  }
  const currentRatio = getAspectRatioForImageSize(currentImageSize);
  return (
    model.recommendedImageSizes.find(
      (size) => getAspectRatioForImageSize(size) === currentRatio
    ) || model.recommendedImageSizes[0]
  );
}

export function resolveRecommendedImageSettingsForModel(
  model: ImageCreatorModelOption | undefined,
  currentImageSize: string
) {
  const imageSize = resolveRecommendedImageSizeForModel(
    model,
    currentImageSize
  );
  return {
    imageSize,
    aspectRatio:
      imageSize === 'auto' ? 'auto' : getAspectRatioForImageSize(imageSize)
  };
}

export function getModelOption(value: string | undefined) {
  return modelOptions.find((option) => option.value === value);
}

export function getModelMaxImageCount(value: string | undefined): number {
  const option = getModelOption(value);
  if (option?.supportsMultipleImages === false) return 1;
  const maxImageCount = Math.floor(Number(option?.maxImageCount) || 1);
  return Math.max(1, maxImageCount);
}

export function clampImageCountForModel(
  model: string | undefined,
  value: unknown,
  fallback = 1
): number {
  const parsed = Math.floor(Number(value));
  const fallbackParsed = Math.floor(Number(fallback));
  const nextValue =
    Number.isFinite(parsed) && parsed > 0
      ? parsed
      : Number.isFinite(fallbackParsed) && fallbackParsed > 0
        ? fallbackParsed
        : 1;
  return Math.max(1, Math.min(getModelMaxImageCount(model), nextValue));
}

export function getImageCountOptionsForModel(
  model: ImageCreatorModelOption | undefined
): number[] {
  const maxImageCount = getModelMaxImageCount(model?.value);
  return PREFERRED_IMAGE_COUNT_OPTIONS.filter(
    (count) => count <= maxImageCount
  );
}
