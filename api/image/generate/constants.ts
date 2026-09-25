import type {
  ImageProvider,
  ModelId,
  OutputFormat,
  QualityProfile
} from './types.js';

export {
  DEFAULT_IMAGE_GENERATION_ASPECT_RATIO as DEFAULT_ASPECT_RATIO,
  DEFAULT_IMAGE_GENERATION_SIZE as DEFAULT_IMAGE_SIZE,
  MAX_IMAGE_GENERATION_PIXELS as MAX_GPT_IMAGE_PIXELS,
  MAX_IMAGE_GENERATION_SIDE as MAX_GPT_IMAGE_SIDE,
  MIN_IMAGE_GENERATION_PIXELS as MIN_GPT_IMAGE_PIXELS
} from '../../../src/shared/image-generation-output-params.js';

export const MAX_PROMPT_CHARS = 5000;
export const MAX_NEGATIVE_PROMPT_CHARS = 2000;
export const MAX_ASSET_IDS = 16;
export const MAX_SUPPLEMENTAL_IMAGE_ATTEMPTS = 2;
export const MAX_IMAGE_COUNT = 10;
// Gemini 单次预算。3-pro-image-preview 实测 17-29s,60s 给足缓冲。
export const IMAGE_GENERATION_TIMEOUT_MS = 60000;
// Tuzi 默认同步预算。实测高峰单张 40-90s，50s 偏紧导致误超时；
// 提到 90s 给慢通道足够余量。队列模式使用更长预算。
export const TUZI_VIP_TIMEOUT_MS = readEnvNumber('TUZI_VIP_TIMEOUT_MS', 90000);
// 同步 pipeline 总预算（含多通道/多模型串行尝试 + 存储下载）。
// 实测完整链路最长 ~137s，200s 给足余量；队列模式另有 330s 预算。
export const SYNC_PIPELINE_DEADLINE_MS = readEnvNumber(
  'SYNC_PIPELINE_DEADLINE_MS',
  200000
);
export const QUEUED_PIPELINE_DEADLINE_MS = readEnvNumber(
  'QUEUED_PIPELINE_DEADLINE_MS',
  330000
);
// Dedicated redraw jobs regularly need more than the production-wide 240s
// pipeline budget. Keep this scoped so normal generation throughput is unchanged.
export const GPT_IMAGE_2_DENOISE_PIPELINE_DEADLINE_MS = readEnvNumber(
  'GPT_IMAGE_2_DENOISE_PIPELINE_DEADLINE_MS',
  300000
);
export const QUEUED_TUZI_VIP_TIMEOUT_MS = 260000;

function readEnvNumber(key: string, fallback: number): number {
  const processLike = (
    globalThis as unknown as {
      process?: { env?: Record<string, string | undefined> };
    }
  ).process;
  const value = Number(processLike?.env?.[key] || fallback);
  return Number.isFinite(value) ? value : fallback;
}

export const QUEUED_TUZI_FALLBACK_TIMEOUT_MS = readEnvNumber(
  'QUEUED_TUZI_FALLBACK_TIMEOUT_MS',
  120000
);
export const QUEUED_TUZI_DEADLINE_RESERVE_MS = 45000;
export const QUEUED_TUZI_MODEL_TIMEOUT_MS = readEnvNumber(
  'QUEUED_TUZI_MODEL_TIMEOUT_MS',
  120000
);
export const QUEUED_TUZI_PER_IMAGE_TIMEOUT_MS = readEnvNumber(
  'QUEUED_TUZI_PER_IMAGE_TIMEOUT_MS',
  75000
);
export const SYNC_TUZI_MODEL_TIMEOUT_MS = readEnvNumber(
  'SYNC_TUZI_MODEL_TIMEOUT_MS',
  70000
);
export const IMAGE_DOWNLOAD_TIMEOUT_MS = 30000;
export const KRILL_IMAGE_TIMEOUT_MS = readEnvNumber(
  'KRILL_IMAGE_TIMEOUT_MS',
  120000
);
export const QUEUED_KRILL_IMAGE_TIMEOUT_MS = readEnvNumber(
  'QUEUED_KRILL_IMAGE_TIMEOUT_MS',
  240000
);
export const COMPRESSED_OUTPUT_QUALITY = 85;
export const GENERATED_IMAGE_THUMB_MAX_SIZE = 384;
export const GENERATED_IMAGE_PREVIEW_MAX_SIZE = 1152;
export const GENERATED_IMAGE_THUMB_QUALITY = 72;
export const GENERATED_IMAGE_PREVIEW_QUALITY = 78;
// Legacy routing helpers retain this value for historical jobs. New requests
// are migrated to GPT Image 2.5 during request sanitization.
export const PREFERRED_TUZI_IMAGE_MODEL = 'gpt-image-2';
export const GPT_IMAGE_2_LEAN_PLAN_ENV = 'GPT_IMAGE_2_ENABLE_SLOW_FALLBACKS';

export const MODEL_CONFIG: Record<
  ModelId,
  { label: string; provider: ImageProvider }
> = {
  'gpt-image-2': { label: 'GPT Image 2', provider: 'openai' },
  'gpt-image-2.5': {
    label: 'GPT Image 2.5',
    provider: 'tuzi'
  },
  'nano-banana': { label: 'Nano Banana', provider: 'tuzi' },
  'nano-banana-2': { label: 'Nano Banana 2', provider: 'tuzi' },
  'nano-banana-pro': { label: 'Nano Banana Pro', provider: 'tuzi' },
  'midjourney-v7': { label: 'Midjourney', provider: 'tuzi' },
  'midjourney-niji-v7': { label: 'Midjourney Niji', provider: 'tuzi' },
  'seedream-5-pro': { label: 'Seedream 5.0 Pro', provider: 'tuzi' },
  'seedream-5-lite': { label: 'Seedream 5.0 Lite', provider: 'tuzi' },
  'wan-image-2-7-pro': { label: 'WAN Image 2.7 Pro', provider: 'tuzi' }
};

export const QUALITY_CONFIG: Record<QualityProfile, string> = {
  auto: 'auto quality',
  high: 'high quality',
  medium: 'medium quality',
  low: 'low quality fast draft'
};

export const QUALITY_ALIASES: Record<string, QualityProfile> = {
  auto: 'auto',
  自动: 'auto',
  standard: 'auto',
  标准: 'auto',
  '1k': 'auto',
  high: 'high',
  'high-detail': 'high',
  'high detail': 'high',
  高: 'high',
  高细节: 'high',
  '2k': 'high',
  '4k': 'high',
  medium: 'medium',
  中: 'medium',
  中等: 'medium',
  low: 'low',
  fast: 'low',
  快速: 'low',
  draft: 'low'
};

export const OUTPUT_FORMAT_ALIASES: Record<string, OutputFormat> = {
  png: 'png',
  jpeg: 'jpeg',
  jpg: 'jpeg',
  webp: 'webp'
};

export const GENERATED_IMAGE_BUCKET =
  (
    globalThis as unknown as {
      process?: { env?: Record<string, string | undefined> };
    }
  ).process?.env?.GENERATED_IMAGE_BUCKET || 'user-generated-images';
