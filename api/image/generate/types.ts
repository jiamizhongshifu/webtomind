import type { ImageProviderHealthRecord } from '../provider-health.js';
import type {
  ImageCharacterReferenceGroup,
  ImageReferenceMode
} from '../../../src/shared/image-reference-types.js';
import type { TuziImageModelId } from '../../../src/shared/tuzi-image-models.js';
import type { ImagePromptRecipeAudit } from '../../../src/shared/image-prompt-recipe-audit.js';
import type { ImageCreationContext } from '../../../src/shared/create-workspace-v2.js';

export type {
  ImageCharacterReferenceGroup,
  ImageReferenceMode
} from '../../../src/shared/image-reference-types.js';

export type ImageProvider = 'krill' | 'tuzi' | 'openai' | 'gemini' | 'z-image';

export type ModelId = TuziImageModelId;
export type AspectRatio = string;
export type QualityProfile = 'auto' | 'high' | 'medium' | 'low';
export type OutputFormat = 'png' | 'jpeg' | 'webp';
export type PromptMode = 'composed' | 'custom';

export interface ImageGenerateRequest {
  prompt?: string;
  negativePrompt?: string;
  model?: string;
  aspectRatio?: string;
  imageSize?: string;
  quality?: string;
  outputFormat?: string;
  assetIds?: string[];
  referenceImageIds?: string[];
  /** Auto-Mask 生成的蒙版参考图 ID（与 referenceImageIds 同表，仅编辑链路使用） */
  maskImageId?: string;
  referenceMode?: string;
  characterCardIds?: string[];
  characterReferenceGroups?: unknown;
  sourceGenerationId?: string;
  editInstruction?: string;
  editMode?: string;
  appSlug?: string;
  appOperation?: string;
  sourceApp?: string;
  promptMode?: string;
  imageCount?: number | string;
  recipeAudit?: unknown;
  creationContext?: unknown;
  async?: boolean;
}

export interface SanitizedImageGenerateRequest {
  prompt: string;
  negativePrompt?: string;
  model: ModelId;
  modelLabel: string;
  provider: ImageProvider;
  aspectRatio: AspectRatio;
  imageSize: string;
  quality: QualityProfile;
  qualityLabel: string;
  outputFormat: OutputFormat;
  assetIds: string[];
  referenceImageIds: string[];
  /** 参考图宽高（计费用，按官方输入图 token 换算）；未提供时按张回退。 */
  referenceImageSizes?: Array<{ width: number; height: number }>;
  maskImageId?: string;
  referenceMode: ImageReferenceMode;
  characterCardIds: string[];
  characterReferenceGroups: ImageCharacterReferenceGroup[];
  sourceGenerationId?: string;
  editInstruction?: string;
  editMode?: 'context_locked';
  appSlug?: string;
  appOperation?: string;
  sourceApp?: string;
  promptMode: PromptMode;
  imageCount: number;
  recipeAudit?: ImagePromptRecipeAudit;
  creationContext?: ImageCreationContext;
  promptAspectRatio?: AspectRatio;
  promptImageSize?: string;
}

export type TuziImageChannel =
  | 'default'
  | 'official_discount'
  | 'official'
  | 'openai_original';

export interface GeneratedImage {
  dataUrl: string;
  mimeType: string;
  provider: ImageProvider;
  model: string;
  modelLabel?: string;
  usedFallback?: boolean;
  tuziChannel?: TuziImageChannel;
  providerApiBaseUrl?: string;
  providerOriginalWidth?: number;
  providerOriginalHeight?: number;
  requestedOutputSize?: string;
  outputImageSizeConformed?: boolean;
  cloudflareUpscaled?: boolean;
  cloudflareUpscaleSourceWidth?: number;
  cloudflareUpscaleSourceHeight?: number;
  cloudflareUpscaleTargetWidth?: number;
  cloudflareUpscaleTargetHeight?: number;
  cloudflareUpscaleContentType?: string;
}

export type ImageGenerationFailureCategory =
  | 'pipeline_deadline'
  | 'provider_timeout'
  | 'provider_unavailable'
  | 'provider_rate_limit'
  | 'provider_policy'
  | 'provider_http'
  | 'credit'
  | 'invalid_request'
  | 'unknown';

export interface ImageGenerationFailureDetails {
  code: string;
  category: ImageGenerationFailureCategory;
  retryable: boolean;
  httpStatus?: number;
  provider?: string;
  model?: string;
}

export interface LockedTuziAttempt {
  model: string;
  channel: TuziImageChannel;
  apiBaseUrl?: string;
}

export interface ImageGenerationAttemptLogInput {
  provider: ImageProvider;
  model: string;
  channel?: string;
  attemptIndex: number;
  startedAt: Date;
  finishedAt: Date;
  status: 'succeeded' | 'failed';
  errorDetails?: ImageGenerationFailureDetails;
  errorMessage?: string;
  providerRequestId?: string;
  metadata?: Record<string, unknown>;
}

export interface ImageGenerationAttemptDiagnostic {
  provider: ImageProvider;
  model: string;
  channel?: string;
  attemptIndex: number;
  phase?: string;
  status: 'running' | 'succeeded' | 'failed';
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  errorCategory?: ImageGenerationFailureCategory;
  errorCode?: string;
  errorMessage?: string;
  httpStatus?: number;
  retryable?: boolean;
  providerRequestId?: string;
  requestedImageCount?: number;
  effectiveImageCount?: number;
  providerRequestImageCount?: number;
  accumulatedImageCount?: number;
  usedFallback?: boolean;
  rescueProvider?: ImageProvider;
}

export interface ImageGenerationTaskDiagnostics {
  requested: {
    provider: ImageProvider;
    model: string;
    imageCount: number;
    imageSize: string;
    aspectRatio: AspectRatio;
    quality: QualityProfile;
    outputFormat: OutputFormat;
  };
  attempts: ImageGenerationAttemptDiagnostic[];
  final?: {
    status: 'succeeded' | 'failed';
    provider?: ImageProvider;
    model?: string;
    imageCount?: number;
    requestedImageCount: number;
    imageSize?: string;
    width?: number;
    height?: number;
    usedFallback?: boolean;
    usedSingleImageRescue?: boolean;
    skippedCrossChannelSupplement?: boolean;
    failureCategory?: ImageGenerationFailureCategory;
    failureCode?: string;
  };
  billing: {
    chargedCredits: number;
    consumedCredits: number;
    refundedCredits: number;
    creditType?: string;
    refundFailed: boolean;
    skipCreditCharge: boolean;
    prepaid: boolean;
    creditWaiverReason?: string;
  };
}

export interface ImageGenerationRunOptions {
  mode?: 'sync' | 'queued';
  taskId?: string;
  cloudDenoiseTask?: boolean;
  pipelineDeadlineMs?: number;
  tuziVipTimeoutMs?: number;
  openAICompatibleTimeoutMs?: number;
  lockedTuziAttempt?: LockedTuziAttempt;
  lockTuziModelToRequested?: boolean;
  disableTuziRetries?: boolean;
  providerHealthLookup?: Map<string, ImageProviderHealthRecord>;
  disableProviderFallback?: boolean;
  policyFallbackBudget?: {
    consume(input: {
      fromProvider: string;
      toProvider: string;
      messageKind: 'explicit' | 'output_safety' | 'other';
    }): Promise<boolean>;
  };
  attemptMetadata?: Record<string, unknown>;
  skipCreditCharge?: boolean;
  creditWaiverReason?: string;
  attemptLogger?: (attempt: ImageGenerationAttemptLogInput) => Promise<void>;
  prepaidCredit?: {
    consumed: number;
    creditType?: string;
    creditBreakdown?: Record<string, number>;
  };
}
