export type SeedanceVideoModelId =
  | 'seedance-2-5'
  | 'seedance-2-0'
  | 'seedance-2-0-fast'
  | 'seedance-2-0-mini';

export type SeedanceVideoResolution = '480p' | '720p' | '1080p' | '4k';
export type SeedanceVideoOutputFormat = 'mp4' | 'mov';

export type SeedanceVideoModelGroup =
  | 'recommended'
  | 'realistic'
  | 'cinematic'
  | 'commercial'
  | 'experimental';

export interface SeedanceVideoModelConfig {
  id: SeedanceVideoModelId;
  apiModel: string;
  label: string;
  description: string;
  group: SeedanceVideoModelGroup;
  badges: string[];
  supportsTextToVideo: boolean;
  supportsImageToVideo: boolean;
  supportsReferenceVideo: boolean;
  supportsReferenceAudio: boolean;
  supportsGenerateAudio: boolean;
  supportsWebSearch: boolean;
  defaultGenerateAudio: boolean;
  maxReferenceImages: number;
  maxReferenceVideos: number;
  maxReferenceAudios: number;
  maxReferenceMediaDurationSeconds: number;
  supportedDurations: number[];
  defaultDuration: number;
  supportedAspectRatios: string[];
  defaultAspectRatio: string;
  supportedResolutions: SeedanceVideoResolution[];
  defaultResolution: SeedanceVideoResolution;
  supportedOutputFormats: SeedanceVideoOutputFormat[];
  defaultOutputFormat: SeedanceVideoOutputFormat;
  creditMultiplier: number;
  requiresApiModelOverride?: boolean;
  status: 'beta' | 'available' | 'unavailable';
}

const DURATIONS_4_TO_15 = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
const DURATIONS_4_TO_30 = Array.from({ length: 27 }, (_, index) => index + 4);
const ASPECT_RATIOS = ['adaptive', '16:9', '9:16', '4:3', '3:4', '1:1', '21:9'];

export const SEEDANCE_VIDEO_MODEL_CONFIG: Record<
  SeedanceVideoModelId,
  SeedanceVideoModelConfig
> = {
  'seedance-2-5': {
    id: 'seedance-2-5',
    apiModel: 'doubao-seedance-2-5-260628',
    label: 'Doubao Seedance 2.5',
    description:
      '旗舰视频模型，支持 30 秒连贯直出、50 项多模态参考和原生音频。',
    group: 'recommended',
    badges: ['Seedance 2.5', '30s'],
    supportsTextToVideo: true,
    supportsImageToVideo: true,
    supportsReferenceVideo: true,
    supportsReferenceAudio: true,
    supportsGenerateAudio: true,
    supportsWebSearch: true,
    defaultGenerateAudio: true,
    maxReferenceImages: 30,
    maxReferenceVideos: 10,
    maxReferenceAudios: 10,
    maxReferenceMediaDurationSeconds: 30,
    supportedDurations: DURATIONS_4_TO_30,
    defaultDuration: 5,
    supportedAspectRatios: ASPECT_RATIOS,
    defaultAspectRatio: 'adaptive',
    supportedResolutions: ['480p', '720p'],
    defaultResolution: '720p',
    supportedOutputFormats: ['mp4', 'mov'],
    defaultOutputFormat: 'mp4',
    // Official Ark pricing published 2026-07-30: 70 CNY/M tokens without video
    // input, 42 CNY/M with video input. 70/23 (mini rate) = 3.0435, so charge
    // the conservative 3.04x ratio until billed-token history is reconciled.
    creditMultiplier: 3.04,
    status: 'available'
  },
  'seedance-2-0': {
    id: 'seedance-2-0',
    apiModel: 'doubao-seedance-2-0-260128',
    label: 'Doubao Seedance 2.0',
    description: '旗舰视频模型，支持最高 4K、首尾帧和同步音频。',
    group: 'recommended',
    badges: ['Seedance 2.0', '4K'],
    supportsTextToVideo: true,
    supportsImageToVideo: true,
    supportsReferenceVideo: true,
    supportsReferenceAudio: true,
    supportsGenerateAudio: true,
    supportsWebSearch: true,
    defaultGenerateAudio: true,
    maxReferenceImages: 9,
    maxReferenceVideos: 3,
    maxReferenceAudios: 3,
    maxReferenceMediaDurationSeconds: 15,
    supportedDurations: DURATIONS_4_TO_15,
    defaultDuration: 5,
    supportedAspectRatios: ASPECT_RATIOS,
    defaultAspectRatio: 'adaptive',
    supportedResolutions: ['480p', '720p', '1080p', '4k'],
    defaultResolution: '720p',
    supportedOutputFormats: ['mp4'],
    defaultOutputFormat: 'mp4',
    creditMultiplier: 2,
    status: 'available'
  },
  'seedance-2-0-fast': {
    id: 'seedance-2-0-fast',
    apiModel: 'doubao-seedance-2-0-fast-260128',
    label: 'Doubao Seedance 2.0 Fast',
    description: '更快的成片速度，支持 480P/720P、首尾帧和同步音频。',
    group: 'commercial',
    badges: ['Seedance 2.0', 'Fast'],
    supportsTextToVideo: true,
    supportsImageToVideo: true,
    supportsReferenceVideo: true,
    supportsReferenceAudio: true,
    supportsGenerateAudio: true,
    supportsWebSearch: true,
    defaultGenerateAudio: true,
    maxReferenceImages: 9,
    maxReferenceVideos: 3,
    maxReferenceAudios: 3,
    maxReferenceMediaDurationSeconds: 15,
    supportedDurations: DURATIONS_4_TO_15,
    defaultDuration: 5,
    supportedAspectRatios: ASPECT_RATIOS,
    defaultAspectRatio: 'adaptive',
    supportedResolutions: ['480p', '720p'],
    defaultResolution: '720p',
    supportedOutputFormats: ['mp4'],
    defaultOutputFormat: 'mp4',
    creditMultiplier: 1.61,
    status: 'available'
  },
  'seedance-2-0-mini': {
    id: 'seedance-2-0-mini',
    apiModel: 'doubao-seedance-2-0-mini-260615',
    label: 'Doubao Seedance 2.0 Mini',
    description: '适合高频批量创作的轻量模型，支持 480P/720P 和同步音频。',
    group: 'commercial',
    badges: ['Seedance 2.0', 'Mini'],
    supportsTextToVideo: true,
    supportsImageToVideo: true,
    supportsReferenceVideo: true,
    supportsReferenceAudio: true,
    supportsGenerateAudio: true,
    supportsWebSearch: true,
    defaultGenerateAudio: true,
    maxReferenceImages: 9,
    maxReferenceVideos: 3,
    maxReferenceAudios: 3,
    maxReferenceMediaDurationSeconds: 15,
    supportedDurations: DURATIONS_4_TO_15,
    defaultDuration: 5,
    supportedAspectRatios: ASPECT_RATIOS,
    defaultAspectRatio: 'adaptive',
    supportedResolutions: ['480p', '720p'],
    defaultResolution: '720p',
    supportedOutputFormats: ['mp4'],
    defaultOutputFormat: 'mp4',
    creditMultiplier: 1,
    status: 'available'
  }
};

export const SEEDANCE_VIDEO_MODELS = Object.values(SEEDANCE_VIDEO_MODEL_CONFIG);

// Keep the proven 2.0 path as the default until 2.5 billed-token history has
// enough production samples to calibrate its customer credit price.
export const DEFAULT_SEEDANCE_VIDEO_MODEL_ID: SeedanceVideoModelId =
  'seedance-2-0';

const SEEDANCE_VIDEO_MODEL_ALIASES: Record<string, SeedanceVideoModelId> = {
  'seedance-2-5': 'seedance-2-5',
  'seedance 2.5': 'seedance-2-5',
  'doubao-seedance-2-5-260628': 'seedance-2-5',
  seedance: 'seedance-2-0',
  'seedance-2-0': 'seedance-2-0',
  'seedance 2.0': 'seedance-2-0',
  'doubao-seedance-2-0-260128': 'seedance-2-0',
  'seedance-2-0-fast': 'seedance-2-0-fast',
  'seedance 2.0 fast': 'seedance-2-0-fast',
  'doubao-seedance-2-0-fast-260128': 'seedance-2-0-fast',
  'seedance-2-0-mini': 'seedance-2-0-mini',
  'seedance 2.0 mini': 'seedance-2-0-mini',
  'doubao-seedance-2-0-mini-260615': 'seedance-2-0-mini'
};

export function normalizeSeedanceVideoModelId(
  value: string | undefined
): SeedanceVideoModelId {
  const normalized = (value || '').trim().toLowerCase();
  return SEEDANCE_VIDEO_MODEL_ALIASES[normalized] || 'seedance-2-0';
}

export function getSeedanceVideoModelConfig(
  modelId: string | undefined,
  runtimeEnv?: object
): SeedanceVideoModelConfig {
  const model =
    SEEDANCE_VIDEO_MODEL_CONFIG[normalizeSeedanceVideoModelId(modelId)];
  const apiModelOverride = String(
    (runtimeEnv as Record<string, unknown> | undefined)?.[
      getArkVideoApiModelEnvKey(model.id)
    ] || ''
  ).trim();

  if (!apiModelOverride) return model;
  return {
    ...model,
    apiModel: apiModelOverride,
    status: model.requiresApiModelOverride ? 'available' : model.status
  };
}

export function getSeedanceVideoModels(
  runtimeEnv?: object
): SeedanceVideoModelConfig[] {
  return SEEDANCE_VIDEO_MODELS.map((model) =>
    getSeedanceVideoModelConfig(model.id, runtimeEnv)
  );
}

export function getArkVideoApiModelEnvKey(modelId: string | undefined): string {
  return `ARK_VIDEO_API_MODEL_${normalizeSeedanceVideoModelId(modelId)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')}`;
}
