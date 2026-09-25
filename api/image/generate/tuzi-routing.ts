import {
  getImageProviderHealthKey,
  getImageProviderRoutingDecision,
  isModelUnavailableBlocked,
  shouldSkipImageProviderFallbackRoute,
  type ImageProviderHealthRecord
} from '../provider-health.js';
import {
  getTuziImageModelConfig,
  isGptImage25Model,
  normalizeTuziImageModelId
} from '../../../src/shared/tuzi-image-models.js';
import { isImageGeneration4KSize } from '../../../src/shared/image-generation-pricing.js';
import { TUZI_DEFAULT_GROUP } from '../../../src/shared/api-marketplace.js';
import {
  isTuziNewApiChannelConnectionConfig,
  parseTuziChannelConnectionConfig,
  stripWrappingQuotes,
  type TuziChannelConnection
} from '../../utils/tuzi-connection.js';
import {
  COMPRESSED_OUTPUT_QUALITY,
  GPT_IMAGE_2_LEAN_PLAN_ENV,
  PREFERRED_TUZI_IMAGE_MODEL,
  QUEUED_PIPELINE_DEADLINE_MS,
  QUEUED_TUZI_DEADLINE_RESERVE_MS,
  QUEUED_TUZI_PER_IMAGE_TIMEOUT_MS,
  SYNC_TUZI_MODEL_TIMEOUT_MS,
  TUZI_VIP_TIMEOUT_MS
} from './constants.js';
import { getTuziProviderImageSize } from './request.js';
import type {
  ImageGenerationRunOptions,
  LockedTuziAttempt,
  ModelId,
  SanitizedImageGenerateRequest,
  TuziImageChannel
} from './types.js';

export interface TuziImageAttempt {
  modelId: ModelId;
  model: string;
  channel: TuziImageChannel;
  apiKey: string;
  apiBaseUrl: string;
}

interface TuziImageAttemptSummary {
  model: string;
  channel: TuziImageChannel;
}

export interface TuziImageRoutingDiagnostics {
  slowGptImage2FallbacksEnabled: boolean;
  imageGroup: string;
  hasUnifiedConnection: boolean;
  hasDefaultKey: boolean;
  hasOfficialDiscountKey: boolean;
  hasOfficialKey: boolean;
  hasOpenAIOriginalKey: boolean;
  officialDiscountFallbackEnabled: boolean;
  disabledChannels: TuziImageChannel[];
  channelOrder: TuziImageChannel[];
  attemptPlanCount: number;
}

const TUZI_IMAGE_CHANNELS: TuziImageChannel[] = [
  'default',
  'official_discount',
  'official',
  'openai_original'
];

function isTruthyEnv(value?: string): boolean {
  return /^(1|true|yes|on)$/i.test(String(value || '').trim());
}

function shouldUseLeanGptImage2Plan(model: ModelId): boolean {
  return (
    model === 'gpt-image-2' &&
    !isTruthyEnv(process.env[GPT_IMAGE_2_LEAN_PLAN_ENV])
  );
}

function normalizeTuziImageChannel(value: string): TuziImageChannel | null {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[-\s]+/g, '_');
  if (TUZI_IMAGE_CHANNELS.includes(normalized as TuziImageChannel)) {
    return normalized as TuziImageChannel;
  }
  if (normalized === 'discount' || normalized === 'officialdiscount') {
    return 'official_discount';
  }
  if (
    normalized === 'openai' ||
    normalized === 'openai_original' ||
    normalized === 'original' ||
    normalized === 'original_price'
  ) {
    return 'openai_original';
  }
  return null;
}

export { parseTuziChannelConnectionConfig } from '../../utils/tuzi-connection.js';

function getUnifiedTuziChannelConnection(): TuziChannelConnection {
  return parseTuziChannelConnectionConfig(
    process.env.TUZI_CHANNEL_CONNECTION ||
      process.env.TUZI_NEWAPI_CHANNEL_CONNECTION ||
      process.env.TUZI_IMAGE_CHANNEL_CONNECTION ||
      (isTuziNewApiChannelConnectionConfig(process.env.TUZI_API_KEY)
        ? process.env.TUZI_API_KEY
        : undefined)
  );
}

function hasUnifiedTuziChannelConnection(): boolean {
  return Boolean(getUnifiedTuziChannelConnection().apiKey);
}

export function getTuziImageGroup(): string {
  if (isTruthyEnv(process.env.TUZI_DISABLE_IMAGE_GROUP)) {
    return '';
  }
  const unifiedConnection = getUnifiedTuziChannelConnection();
  const group = stripWrappingQuotes(
    process.env.TUZI_IMAGE_GROUP ||
      process.env.TUZI_GROUP ||
      unifiedConnection.group ||
      TUZI_DEFAULT_GROUP
  );
  if (/^(0|false|off|disabled|none)$/i.test(group)) return '';
  return group;
}

function getDisabledTuziImageChannels(): Set<TuziImageChannel> {
  const disabled = new Set<TuziImageChannel>();
  const configured =
    process.env.TUZI_DISABLED_IMAGE_CHANNELS ||
    process.env.TUZI_DISABLED_CHANNELS ||
    '';

  for (const channel of configured.split(',')) {
    const normalized = normalizeTuziImageChannel(channel);
    if (normalized) {
      disabled.add(normalized);
    }
  }

  if (
    !hasUnifiedTuziChannelConnection() &&
    !isTruthyEnv(process.env.TUZI_ENABLE_OFFICIAL_DISCOUNT_FALLBACK)
  ) {
    disabled.add('official_discount');
  }

  return disabled;
}

function isTuziImageChannelEnabled(channel: TuziImageChannel): boolean {
  return !getDisabledTuziImageChannels().has(channel);
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, '').replace(/\/v1$/i, '');
}

function getTuziChannelSpecificConnection(
  channel: TuziImageChannel
): TuziChannelConnection {
  switch (channel) {
    case 'default':
      return parseTuziChannelConnectionConfig(process.env.TUZI_API_KEY);
    case 'official_discount':
      return parseTuziChannelConnectionConfig(
        process.env.TUZI_OFFICIAL_DISCOUNT_API_KEY
      );
    case 'official':
      return parseTuziChannelConnectionConfig(
        process.env.TUZI_OFFICIAL_API_KEY
      );
    case 'openai_original':
      return parseTuziChannelConnectionConfig(
        process.env.TUZI_OPENAI_ORIGINAL_API_KEY ||
          process.env.TUZI_OPENAI_API_KEY
      );
  }
}

function getTuziChannelApiBaseUrl(channel: TuziImageChannel): string {
  const channelConnection = getTuziChannelSpecificConnection(channel);
  const unifiedConnection = getUnifiedTuziChannelConnection();
  const imageApiBaseUrl = process.env.TUZI_IMAGE_API_BASE_URL;
  const channelBaseUrl =
    channel === 'default'
      ? process.env.TUZI_API_BASE_URL
      : channel === 'official_discount'
        ? process.env.TUZI_OFFICIAL_DISCOUNT_API_BASE_URL
        : channel === 'official'
          ? process.env.TUZI_OFFICIAL_API_BASE_URL
          : process.env.TUZI_OPENAI_ORIGINAL_API_BASE_URL ||
            process.env.TUZI_OPENAI_API_BASE_URL;

  return normalizeBaseUrl(
    imageApiBaseUrl ||
      channelBaseUrl ||
      channelConnection.apiBaseUrl ||
      unifiedConnection.apiBaseUrl ||
      process.env.TUZI_API_BASE_URL ||
      'https://api.tu-zi.com'
  );
}

function getTuziImageModel(): ModelId {
  return normalizeTuziImageModelId(
    process.env.TUZI_IMAGE_MODEL || PREFERRED_TUZI_IMAGE_MODEL
  );
}

function getTuziApiModelEnvKey(modelId: ModelId): string {
  return `TUZI_IMAGE_API_MODEL_${modelId
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')}`;
}

export function getConfiguredTuziApiModel(modelId: ModelId): string {
  return (
    process.env[getTuziApiModelEnvKey(modelId)] ||
    getTuziImageModelConfig(modelId).apiModel
  );
}

function getTuziFallbackImageModels(): ModelId[] {
  const configured =
    process.env.TUZI_IMAGE_FALLBACK_MODELS ||
    process.env.TUZI_FALLBACK_IMAGE_MODEL ||
    'gpt-image-2';
  return configured
    .split(',')
    .map((model) => normalizeTuziImageModelId(model))
    .filter(Boolean);
}

export function getTuziImageModelCandidates(
  requestedModel?: ModelId
): ModelId[] {
  if (requestedModel && requestedModel !== PREFERRED_TUZI_IMAGE_MODEL) {
    return [requestedModel];
  }
  return Array.from(
    new Set([
      requestedModel || PREFERRED_TUZI_IMAGE_MODEL,
      getTuziImageModel(),
      ...getTuziFallbackImageModels()
    ])
  );
}

function getTuziChannelApiKey(channel: TuziImageChannel): string {
  const channelConnection = getTuziChannelSpecificConnection(channel);
  return channelConnection.apiKey || getUnifiedTuziChannelConnection().apiKey;
}

function getTuziNonDefaultChannelModel(
  channel: TuziImageChannel,
  requestedModel: ModelId
): { modelId: ModelId; apiModel: string } {
  if (requestedModel !== PREFERRED_TUZI_IMAGE_MODEL) {
    return {
      modelId: requestedModel,
      apiModel: getConfiguredTuziApiModel(requestedModel)
    };
  }
  const configured =
    channel === 'official_discount'
      ? process.env.TUZI_OFFICIAL_DISCOUNT_IMAGE_MODEL
      : channel === 'official'
        ? process.env.TUZI_OFFICIAL_IMAGE_MODEL
        : channel === 'openai_original'
          ? process.env.TUZI_OPENAI_ORIGINAL_IMAGE_MODEL ||
            process.env.TUZI_OPENAI_IMAGE_MODEL
          : undefined;
  const modelId = normalizeTuziImageModelId(configured || requestedModel);
  return {
    modelId,
    apiModel: getConfiguredTuziApiModel(modelId)
  };
}

function reorderTuziChannelsForMultiImage(
  channels: TuziImageChannel[],
  requestedModel?: ModelId
): TuziImageChannel[] {
  if (requestedModel === PREFERRED_TUZI_IMAGE_MODEL) {
    return channels;
  }
  const preferred: TuziImageChannel[] = [
    'official',
    'openai_original',
    'official_discount',
    'default'
  ];
  return [
    ...preferred.filter((channel) => channels.includes(channel)),
    ...channels.filter((channel) => !preferred.includes(channel))
  ];
}

function getTuziImageChannelOrder(
  options: {
    requestedModel?: ModelId;
    preferMultiImageStableChannel?: boolean;
    requireOpenAIOriginalChannel?: boolean;
  } = {}
): TuziImageChannel[] {
  if (options.requireOpenAIOriginalChannel) {
    return isTuziImageChannelEnabled('openai_original')
      ? ['openai_original']
      : [];
  }

  const configured = process.env.TUZI_IMAGE_CHANNEL_ORDER || '';
  const normalized = configured
    .split(',')
    .map((channel) => normalizeTuziImageChannel(channel))
    .filter((channel): channel is TuziImageChannel => Boolean(channel));
  const order = normalized.length
    ? normalized
    : hasUnifiedTuziChannelConnection()
      ? ([
          'default',
          'official_discount',
          'official',
          'openai_original'
        ] satisfies TuziImageChannel[])
      : ([
          'default',
          'official_discount',
          'official'
        ] satisfies TuziImageChannel[]);

  const enabledOrder = Array.from(new Set(order)).filter(
    isTuziImageChannelEnabled
  );
  if (
    options.requestedModel &&
    shouldUseLeanGptImage2Plan(options.requestedModel)
  ) {
    return enabledOrder.filter((channel) => channel === 'default');
  }
  return options.preferMultiImageStableChannel
    ? reorderTuziChannelsForMultiImage(enabledOrder, options.requestedModel)
    : enabledOrder;
}

export function buildTuziImageAttemptPlan(
  requestedModel: ModelId,
  options: { imageCount?: number; imageSize?: string } = {}
): TuziImageAttempt[] {
  if (
    isGptImage25Model(requestedModel) &&
    !isTruthyEnv(process.env.TUZI_GPT_IMAGE_25_ENABLED)
  ) {
    return [];
  }
  const attempts: TuziImageAttempt[] = [];
  const requireOpenAIOriginalChannel =
    requestedModel === 'gpt-image-2' &&
    isImageGeneration4KSize(options.imageSize);

  for (const channel of getTuziImageChannelOrder({
    requestedModel,
    preferMultiImageStableChannel: Number(options.imageCount || 1) > 1,
    requireOpenAIOriginalChannel
  })) {
    const apiKey = getTuziChannelApiKey(channel);
    if (!apiKey) continue;

    if (channel === 'default') {
      for (const modelId of getTuziImageModelCandidates(requestedModel)) {
        attempts.push({
          modelId,
          model: getConfiguredTuziApiModel(modelId),
          channel,
          apiKey,
          apiBaseUrl: getTuziChannelApiBaseUrl(channel)
        });
      }
      continue;
    }

    const channelModel = getTuziNonDefaultChannelModel(channel, requestedModel);
    attempts.push({
      modelId: channelModel.modelId,
      model: channelModel.apiModel,
      channel,
      apiKey,
      apiBaseUrl: getTuziChannelApiBaseUrl(channel)
    });
  }

  return attempts;
}

export function getTuziImageRoutingDiagnostics(
  requestedModel: ModelId = PREFERRED_TUZI_IMAGE_MODEL,
  options: { imageCount?: number; imageSize?: string } = {}
): TuziImageRoutingDiagnostics {
  const disabledChannels = Array.from(getDisabledTuziImageChannels());
  const requireOpenAIOriginalChannel =
    requestedModel === 'gpt-image-2' &&
    isImageGeneration4KSize(options.imageSize);
  const channelOrder = getTuziImageChannelOrder({
    requestedModel,
    preferMultiImageStableChannel: Number(options.imageCount || 1) > 1,
    requireOpenAIOriginalChannel
  });
  return {
    slowGptImage2FallbacksEnabled: isTruthyEnv(
      process.env[GPT_IMAGE_2_LEAN_PLAN_ENV]
    ),
    imageGroup: getTuziImageGroup(),
    hasUnifiedConnection: hasUnifiedTuziChannelConnection(),
    hasDefaultKey: Boolean(getTuziChannelSpecificConnection('default').apiKey),
    hasOfficialDiscountKey: Boolean(
      getTuziChannelSpecificConnection('official_discount').apiKey
    ),
    hasOfficialKey: Boolean(
      getTuziChannelSpecificConnection('official').apiKey
    ),
    hasOpenAIOriginalKey: Boolean(
      getTuziChannelSpecificConnection('openai_original').apiKey
    ),
    officialDiscountFallbackEnabled: isTruthyEnv(
      process.env.TUZI_ENABLE_OFFICIAL_DISCOUNT_FALLBACK
    ),
    disabledChannels,
    channelOrder,
    attemptPlanCount: buildTuziImageAttemptPlan(requestedModel, options).length
  };
}

export function filterTuziAttemptsForLock(
  attempts: TuziImageAttempt[],
  lockedTuziAttempt?: LockedTuziAttempt
): TuziImageAttempt[] {
  if (!lockedTuziAttempt) return attempts;
  return attempts.filter(
    (attempt) =>
      attempt.channel === lockedTuziAttempt.channel &&
      attempt.model === lockedTuziAttempt.model &&
      (!lockedTuziAttempt.apiBaseUrl ||
        attempt.apiBaseUrl === lockedTuziAttempt.apiBaseUrl)
  );
}

export function getTuziAttemptHealthRecord(
  attempt: TuziImageAttempt,
  healthLookup?: Map<string, ImageProviderHealthRecord>
): ImageProviderHealthRecord | undefined {
  return healthLookup?.get(
    getImageProviderHealthKey({
      provider: 'tuzi',
      model: attempt.model,
      channel: attempt.channel
    })
  );
}

export function rankTuziAttemptsByProviderHealth(
  attempts: TuziImageAttempt[],
  healthLookup?: Map<string, ImageProviderHealthRecord>
): TuziImageAttempt[] {
  if (!healthLookup || healthLookup.size === 0) {
    return attempts;
  }

  // 模型级熔断优先：某模型跨 channel 累计 unavailable 达阈值时，直接排除该
  // 模型的全部 channel（例如 seedream-5-0-lite / wan-image-2.7-pro 在 Tuzi
  // 上游报 "No available channel" 时，任何 channel 都不值得再试）。
  const attemptsFilteredByModel = attempts.filter(
    (attempt) =>
      !isModelUnavailableBlocked(
        { provider: 'tuzi', model: attempt.model },
        healthLookup
      )
  );

  const rankedAttempts = attemptsFilteredByModel
    .map((attempt, index) => {
      const healthRecord = getTuziAttemptHealthRecord(attempt, healthLookup);
      const decision = getImageProviderRoutingDecision(healthRecord);
      return {
        attempt,
        index,
        decision,
        healthRecord
      };
    })
    .filter(
      ({ decision, healthRecord }) =>
        !decision.blocked && !shouldSkipImageProviderFallbackRoute(healthRecord)
    )
    .sort((left, right) => {
      if (left.decision.deprioritized !== right.decision.deprioritized) {
        return left.decision.deprioritized ? 1 : -1;
      }
      if (left.decision.score !== right.decision.score) {
        return right.decision.score - left.decision.score;
      }
      return left.index - right.index;
    })
    .map(({ attempt }) => attempt);

  return rankedAttempts;
}

export function getTuziImageAttemptPlanSummary(
  requestedModel: ModelId = PREFERRED_TUZI_IMAGE_MODEL,
  options: {
    imageCount?: number;
    imageSize?: string;
    lockedTuziAttempt?: LockedTuziAttempt;
  } = {}
): TuziImageAttemptSummary[] {
  return filterTuziAttemptsForLock(
    buildTuziImageAttemptPlan(requestedModel, options),
    options.lockedTuziAttempt
  ).map(({ model, channel }) => ({
    model,
    channel
  }));
}

export function buildTuziImageGenerationRequestBody(
  model: string,
  prompt: string,
  input: SanitizedImageGenerateRequest
): Record<string, unknown> {
  const providerImageSize = getTuziProviderImageSize(input);
  const outputCompression =
    input.outputFormat === 'jpeg' || input.outputFormat === 'webp'
      ? COMPRESSED_OUTPUT_QUALITY
      : undefined;
  const imageGroup = getTuziImageGroup();

  return {
    model,
    prompt,
    ...(imageGroup ? { group: imageGroup } : {}),
    ...(providerImageSize ? { size: providerImageSize } : {}),
    quality: input.quality,
    output_format: input.outputFormat,
    ...(outputCompression ? { output_compression: outputCompression } : {}),
    n: input.imageCount
  };
}

export function getTuziModelTimeoutMs(
  options: ImageGenerationRunOptions,
  modelCount: number,
  imageCount = 1
): number {
  const normalizedImageCount = Math.max(1, Math.floor(Number(imageCount) || 1));
  const multiImageFloor =
    normalizedImageCount > 1
      ? QUEUED_TUZI_PER_IMAGE_TIMEOUT_MS * normalizedImageCount
      : 0;
  const configured = Math.max(
    options.tuziVipTimeoutMs || TUZI_VIP_TIMEOUT_MS,
    multiImageFloor
  );
  const effectiveBudget =
    options.mode === 'queued'
      ? Math.min(
          configured,
          Math.max(
            30000,
            (options.pipelineDeadlineMs || QUEUED_PIPELINE_DEADLINE_MS) -
              QUEUED_TUZI_DEADLINE_RESERVE_MS
          )
        )
      : configured;
  if (modelCount <= 1 || options.mode === 'queued') {
    return Math.max(10000, effectiveBudget);
  }
  const splitBudget = Math.max(SYNC_TUZI_MODEL_TIMEOUT_MS, multiImageFloor);
  const perAttemptBudget = Math.floor(effectiveBudget / modelCount);
  const attemptBudget =
    normalizedImageCount > 1
      ? Math.max(perAttemptBudget, multiImageFloor)
      : perAttemptBudget;
  return Math.max(10000, Math.min(effectiveBudget, splitBudget, attemptBudget));
}
