import {
  getSeedanceVideoModelConfig,
  type SeedanceVideoModelId,
  type SeedanceVideoResolution
} from './seedance-video-models';

export const VIDEO_GENERATION_BASE_UNIT_CREDIT_COST = 400;
export const VIDEO_GENERATION_BASE_UNIT_SECONDS = 5;
// 参考视频的固定附加费锚点：默认按 5 秒输入视频计 50 积分，并按输入视频时长
// 线性缩放（官方 token 公式里输入视频时长与 token 用量线性相关）。
export const VIDEO_GENERATION_REFERENCE_VIDEO_SURCHARGE = 50;
export const VIDEO_GENERATION_MIN_CREDIT_COST = 300;

// Official Ark billing (火山方舟《模型价格》视频生成模型) prices a video by
// output resolution and by whether the request contains *video* input:
//   token用量 ≈ (输入视频时长 + 输出视频时长) × 宽 × 高 × 帧率 / 1024
// 输入视频时长为 0 的 文生视频 / 首帧 / 首尾帧 / 图片参考 / 音频参考 均不增加
// token 用量，也不切换计费档位（只有“输入包含视频”会切换档位）。因此参考图、
// 首尾帧图、参考音频都不再收取附加积分；只有参考视频（reference_video）会
// 增加“输入视频时长”对应的 token，按其时长线性计费。
export const VIDEO_GENERATION_REFERENCE_IMAGE_SURCHARGE = 0;
export const VIDEO_GENERATION_REFERENCE_AUDIO_SURCHARGE = 0;

// 分辨率倍率按官方《模型价格》价格示例校准（5s 16:9、输入不含视频，相对 480p）：
//   doubao-seedance-2.5:   480p=3.36  720p=7.56  1080p=18.71
//   doubao-seedance-2.0:   480p=2.31  720p=4.97  1080p=12.39  4k=25.27
//   doubao-seedance-2.0-fast: 480p=1.86  720p=4.00
//   doubao-seedance-2.0-mini: 480p=1.16  720p=2.48
// 此前各档统一用 1.8/1.7/1.6（资源包“最高抵扣 1:1.8”的保守上限），既低于按量
// 付费的实际价格比，也没有区分 720p/1080p/4k，已按官方刊例价逐档校准。
// 后续拿到真实 usage.completion_tokens 后，可用该历史再校准。
export const VIDEO_GENERATION_RESOLUTION_MULTIPLIERS: Record<
  SeedanceVideoModelId,
  Partial<Record<SeedanceVideoResolution, number>>
> = {
  'seedance-2-5': { '720p': 2.25, '1080p': 5.57 },
  'seedance-2-0': { '720p': 2.15, '1080p': 5.36, '4k': 10.94 },
  'seedance-2-0-fast': { '720p': 2.15 },
  'seedance-2-0-mini': { '720p': 2.14 }
};

export interface VideoGenerationCreditInput {
  model?: string;
  duration?: number;
  resolution?: SeedanceVideoResolution | string;
  /** 参考图 + 首尾帧图片数量；按官方计费不产生附加积分，仅用于元信息/展示。 */
  referenceImageCount?: number;
  /** 参考视频数量；未提供时长时的兜底计数（按 5 秒/个锚点计费）。 */
  referenceVideoCount?: number;
  /** 参考音频数量；官方计费公式不含音频，不产生附加积分。 */
  referenceAudioCount?: number;
  /** 参考视频时长（秒），与 referenceVideoCount 对应；官方额外 token 与输入时长线性相关。 */
  referenceVideoDurations?: number[];
}

export interface VideoGenerationCreditEstimate {
  cost: number;
  model: SeedanceVideoModelId;
  modelLabel: string;
  modelMultiplier: number;
  duration: number;
  durationUnits: number;
  resolution: SeedanceVideoResolution;
  resolutionMultiplier: number;
  baseUnitCost: number;
  baseCost: number;
  referenceAdjustment: number;
  modelAdjustment: number;
  resolutionAdjustment: number;
}

function normalizeDuration(duration?: number): number {
  if (typeof duration !== 'number' || !Number.isFinite(duration)) {
    return VIDEO_GENERATION_BASE_UNIT_SECONDS;
  }
  return Math.max(1, Math.floor(Number(duration)));
}

function normalizeReferenceImageCount(referenceImageCount?: number): number {
  if (
    typeof referenceImageCount !== 'number' ||
    !Number.isFinite(referenceImageCount)
  ) {
    return 0;
  }
  return Math.max(0, Math.min(15, Math.floor(Number(referenceImageCount))));
}

function normalizeReferenceMediaCount(value?: number, max = 10): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(max, Math.floor(Number(value))));
}

function normalizeReferenceVideoDurations(
  durations: number[] | undefined,
  maxCount: number,
  maxSeconds: number
): number[] {
  if (!Array.isArray(durations)) return [];
  return durations
    .filter((d) => typeof d === 'number' && Number.isFinite(d) && d > 0)
    .slice(0, maxCount)
    .map((d) => Math.min(Math.max(0, d), maxSeconds));
}

function normalizeResolution(
  resolution: VideoGenerationCreditInput['resolution'],
  supportedResolutions: SeedanceVideoResolution[],
  fallback: SeedanceVideoResolution
): SeedanceVideoResolution {
  const normalized = String(resolution || '')
    .trim()
    .toLowerCase() as SeedanceVideoResolution;
  return supportedResolutions.includes(normalized) ? normalized : fallback;
}

export function estimateVideoGenerationCreditCost(
  input: VideoGenerationCreditInput = {}
): VideoGenerationCreditEstimate {
  const model = getSeedanceVideoModelConfig(input.model);
  const duration = normalizeDuration(input.duration || model.defaultDuration);
  const resolution = normalizeResolution(
    input.resolution,
    model.supportedResolutions,
    model.defaultResolution
  );
  const referenceImageCount = normalizeReferenceImageCount(
    input.referenceImageCount
  );
  const referenceVideoCount = normalizeReferenceMediaCount(
    input.referenceVideoCount,
    model.maxReferenceVideos
  );
  const referenceAudioCount = normalizeReferenceMediaCount(
    input.referenceAudioCount,
    model.maxReferenceAudios
  );
  const referenceVideoDurations = normalizeReferenceVideoDurations(
    input.referenceVideoDurations,
    model.maxReferenceVideos,
    model.maxReferenceMediaDurationSeconds
  );
  const durationUnits = Number(
    (duration / VIDEO_GENERATION_BASE_UNIT_SECONDS).toFixed(4)
  );
  const baseCost = Math.ceil(
    VIDEO_GENERATION_BASE_UNIT_CREDIT_COST * durationUnits
  );
  // 官方计费只有“输入包含视频”会增加 token 用量（输入视频时长）：
  // 参考图 / 首尾帧 / 音频参考不增加费用；参考视频按输入时长线性计费，
  // 未提供时长时按“数量 × 5 秒”兜底。
  const referenceVideoSeconds =
    referenceVideoDurations.length > 0
      ? referenceVideoDurations.reduce((sum, seconds) => sum + seconds, 0)
      : referenceVideoCount * VIDEO_GENERATION_BASE_UNIT_SECONDS;
  const referenceAdjustment = Number(
    (
      referenceImageCount * VIDEO_GENERATION_REFERENCE_IMAGE_SURCHARGE +
      (VIDEO_GENERATION_REFERENCE_VIDEO_SURCHARGE * referenceVideoSeconds) /
        VIDEO_GENERATION_BASE_UNIT_SECONDS +
      referenceAudioCount * VIDEO_GENERATION_REFERENCE_AUDIO_SURCHARGE
    ).toFixed(4)
  );
  const subtotal = baseCost + referenceAdjustment;
  const modelSubtotal = Number((subtotal * model.creditMultiplier).toFixed(4));
  const modelAdjustment = modelSubtotal - subtotal;
  const resolutionMultiplier =
    resolution === '480p'
      ? 1
      : (VIDEO_GENERATION_RESOLUTION_MULTIPLIERS[model.id]?.[resolution] ?? 1);
  const multipliedSubtotal = Number(
    (modelSubtotal * resolutionMultiplier).toFixed(4)
  );
  const cost = Math.max(
    VIDEO_GENERATION_MIN_CREDIT_COST,
    Math.ceil(multipliedSubtotal)
  );

  return {
    cost,
    model: model.id,
    modelLabel: model.label,
    modelMultiplier: model.creditMultiplier,
    duration,
    durationUnits,
    resolution,
    resolutionMultiplier,
    baseUnitCost: VIDEO_GENERATION_BASE_UNIT_CREDIT_COST,
    baseCost,
    referenceAdjustment,
    modelAdjustment,
    resolutionAdjustment: cost - modelSubtotal
  };
}

export function getVideoGenerationCreditCostPerSecond(
  estimate: Pick<VideoGenerationCreditEstimate, 'cost' | 'duration'>
): number {
  if (!Number.isFinite(estimate.cost) || estimate.cost <= 0) return 0;
  const duration =
    Number.isFinite(estimate.duration) && estimate.duration > 0
      ? estimate.duration
      : 1;
  return Math.ceil(estimate.cost / duration);
}
