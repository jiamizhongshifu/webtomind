import {
  getTuziImageModelConfig,
  normalizeTuziImageModelId
} from '../../../src/shared/tuzi-image-models.js';
import {
  MAX_CHARACTER_REFERENCE_GROUPS,
  MAX_CHARACTER_REFERENCES_PER_GROUP,
  MAX_IMAGE_REFERENCE_IDS,
  mergeBillableImageReferenceIds,
  type ImageCharacterReferenceGroup,
  type ImageReferenceMode
} from '../../../src/shared/image-reference-types.js';
import { getStableImageGenerationQuality } from '../../../src/shared/image-generation-pricing.js';
import {
  DEFAULT_IMAGE_GENERATION_ASPECT_RATIO,
  DEFAULT_IMAGE_GENERATION_SIZE,
  deriveImageGenerationAspectRatio,
  detectPromptAspectRatio as detectSharedPromptAspectRatio,
  detectPromptImageSize,
  getDefaultImageGenerationSizeForAspectRatio,
  getImageGenerationSizeForSourceDimensions,
  normalizeImageGenerationAspectRatio,
  validateImageGenerationSize
} from '../../../src/shared/image-generation-output-params.js';
import { sanitizeLegacyAutoNegativePrompt } from '../../../src/shared/image-negative-prompt.js';
import {
  IMAGE_PROMPT_RECIPE_AUDIT_SCHEMA_VERSION,
  imagePromptRecipeSelectionSources,
  type ImagePromptRecipeAudit,
  type ImagePromptRecipeSelectionSource
} from '../../../src/shared/image-prompt-recipe-audit.js';
import {
  MAX_ASSET_IDS,
  MAX_IMAGE_COUNT,
  MAX_NEGATIVE_PROMPT_CHARS,
  MAX_PROMPT_CHARS,
  MODEL_CONFIG,
  OUTPUT_FORMAT_ALIASES,
  QUALITY_ALIASES,
  QUALITY_CONFIG
} from './constants.js';
import type {
  AspectRatio,
  ImageGenerateRequest,
  ModelId,
  OutputFormat,
  PromptMode,
  QualityProfile,
  SanitizedImageGenerateRequest
} from './types.js';
import type {
  ImageCreationContext,
  MoodboardConditioning
} from '../../../src/shared/create-workspace-v2.js';

function normalizeKey(value: string | undefined): string {
  return (value || '').trim().toLowerCase();
}

function resolveModelId(
  modelLabel: string | undefined,
  preserveLegacyGptImage2 = false
): ModelId {
  const resolved = normalizeTuziImageModelId(modelLabel);
  return !preserveLegacyGptImage2 && resolved === 'gpt-image-2'
    ? 'gpt-image-2.5'
    : resolved;
}

/**
 * Seedream 5.0 Pro 官方尺寸约束（图片生成场景，方式 2 指定像素时）：
 * 总像素范围 [1280x720(921600), 2048x2048x1.1025(4624220)]，仅 1K/1.5K/2K 档位。
 * 与全局尺寸校验不同，这里按模型收紧，避免 4K 尺寸穿透到上游被拒。
 */
const SEEDREAM_5_PRO_SIZE_LIMITS = {
  minPixels: 921_600,
  maxPixels: 4_624_220
} as const;

function validateModelImageSize(
  model: ModelId,
  imageSize: string
): { ok: true } | { ok: false; reason: string } {
  if (model !== 'seedream-5-pro' || imageSize === 'auto') {
    return { ok: true };
  }
  const match = imageSize.match(/^(\d+)x(\d+)$/);
  if (!match) return { ok: true };
  const pixels = Number(match[1]) * Number(match[2]);
  if (
    pixels < SEEDREAM_5_PRO_SIZE_LIMITS.minPixels ||
    pixels > SEEDREAM_5_PRO_SIZE_LIMITS.maxPixels
  ) {
    return {
      ok: false,
      reason:
        'Seedream 5.0 Pro 总像素需在 921600-4624220 之间（仅支持 1K/1.5K/2K 档位）'
    };
  }
  return { ok: true };
}

function resolveQuality(value: string | undefined): QualityProfile | null {
  const normalized = normalizeKey(value);
  if (!normalized) return 'auto';
  return QUALITY_ALIASES[normalized] || null;
}

function resolveOutputFormat(value: string | undefined): OutputFormat | null {
  const normalized = normalizeKey(value);
  if (!normalized) return 'png';
  return OUTPUT_FORMAT_ALIASES[normalized] || null;
}

function resolvePromptMode(value: string | undefined): PromptMode {
  return normalizeKey(value) === 'custom' ? 'custom' : 'composed';
}

function resolveReferenceMode(
  value: string | undefined,
  referenceImageIds: string[]
): ImageReferenceMode {
  if (referenceImageIds.length === 0) return 'none';
  const normalized = normalizeKey(value);
  if (normalized === 'character_consistency') return 'character_consistency';
  return 'image_reference';
}

function sanitizeImagePromptRecipeAudit(
  value: unknown,
  assetIds: string[]
): ImagePromptRecipeAudit | undefined {
  if (!value || typeof value !== 'object' || assetIds.length === 0) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== IMAGE_PROMPT_RECIPE_AUDIT_SCHEMA_VERSION) {
    return undefined;
  }
  const selectionSource =
    typeof record.selectionSource === 'string' &&
    imagePromptRecipeSelectionSources.includes(
      record.selectionSource as ImagePromptRecipeSelectionSource
    ) &&
    record.selectionSource !== 'legacy_unknown'
      ? (record.selectionSource as ImagePromptRecipeSelectionSource)
      : undefined;
  const compilerVersion = sanitizeOptionalText(record.compilerVersion, 80);
  const selectedAssetIds = sanitizeImageIdList(
    record.selectedAssetIds,
    MAX_ASSET_IDS
  );
  if (
    !selectionSource ||
    !compilerVersion ||
    selectedAssetIds.length !== assetIds.length ||
    !selectedAssetIds.every((id) => assetIds.includes(id))
  ) {
    return undefined;
  }
  const profile = sanitizeOptionalText(record.profile, 80);
  const randomizedSlot = sanitizeOptionalText(record.randomizedSlot, 40);
  const inputAssetIds = sanitizeImageIdList(
    record.inputAssetIds,
    MAX_ASSET_IDS
  );
  const seed =
    typeof record.seed === 'number' &&
    Number.isInteger(record.seed) &&
    record.seed >= 0 &&
    record.seed <= 0xffffffff
      ? record.seed
      : undefined;
  const constraintAdjustments = Array.isArray(record.constraintAdjustments)
    ? record.constraintAdjustments
        .map((item) => sanitizeOptionalText(item, 80))
        .filter((item): item is string => Boolean(item))
        .slice(0, 20)
    : [];
  return {
    schemaVersion: IMAGE_PROMPT_RECIPE_AUDIT_SCHEMA_VERSION,
    compilerVersion,
    selectionSource,
    selectedAssetIds,
    ...(inputAssetIds.length > 0 ? { inputAssetIds } : {}),
    ...(profile ? { profile } : {}),
    ...(seed !== undefined ? { seed } : {}),
    ...(randomizedSlot ? { randomizedSlot } : {}),
    ...(constraintAdjustments.length > 0 ? { constraintAdjustments } : {})
  };
}

function normalizeAspectRatio(value: string | undefined): AspectRatio | null {
  return normalizeImageGenerationAspectRatio(value) as AspectRatio | null;
}

const validateImageSize = validateImageGenerationSize;

export function deriveAspectRatioFromImageSize(
  size: string
): AspectRatio | undefined {
  return deriveImageGenerationAspectRatio(size) as AspectRatio | undefined;
}

export function getDefaultImageSizeForAspectRatio(
  aspectRatio: AspectRatio
): string {
  return getDefaultImageGenerationSizeForAspectRatio(aspectRatio);
}

export function getImageSizeForSourceDimensions(
  width: number,
  height: number
): string {
  return getImageGenerationSizeForSourceDimensions(width, height);
}

function detectPromptAspectRatio(prompt: string): AspectRatio | undefined {
  return detectSharedPromptAspectRatio(prompt) as AspectRatio | undefined;
}

function splitInlineNegativePrompt(prompt: string): {
  prompt: string;
  negativePrompt?: string;
} {
  const match =
    /(^|[\n\r]|[，。；;]\s*)(?:负面(?:提示词?)?|负向(?:提示词|\s*prompt)?|negative\s*prompt|negative)\s*[：:]\s*/i.exec(
      prompt
    );
  if (!match || match.index < 0) return { prompt };

  const positive = prompt.slice(0, match.index + match[1].length).trim();
  const negative = prompt.slice(match.index + match[0].length).trim();
  return {
    prompt: positive || prompt,
    negativePrompt: negative || undefined
  };
}

function joinNegativePrompts(
  first: string | undefined,
  second: string | undefined
): string | undefined {
  const parts = [first, second]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));
  if (parts.length === 0) return undefined;
  return Array.from(new Set(parts)).join('，');
}

function clampImageCount(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(MAX_IMAGE_COUNT, Math.floor(value)));
}

function parseImageCountValue(value: unknown): number | null {
  if (typeof value === 'number') return clampImageCount(value);
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) return null;
  return clampImageCount(Number(normalized));
}

function parseImageCountToken(token: string | undefined): number | null {
  if (!token) return null;
  const normalized = token.trim().toLowerCase();
  const zhMap: Record<string, number> = {
    二: 2,
    两: 2,
    三: 3,
    四: 4
  };
  if (zhMap[normalized]) return zhMap[normalized];
  if (/^\d+$/.test(normalized)) return clampImageCount(Number(normalized));
  return null;
}

function shouldForceGptImage2ToTuzi(): boolean {
  return /^(1|true|yes|on)$/i.test(
    String(process.env.GPT_IMAGE_2_FORCE_TUZI_PRIMARY || '').trim()
  );
}

export function shouldRouteGptImage2DirectlyToTuzi(_input: {
  imageSize?: string;
  imageCount: number;
}): boolean {
  if (
    /^(1|true|yes|on)$/i.test(
      String(process.env.GPT_IMAGE_2_ALLOW_OPENAI_COMPAT_PRIMARY || '').trim()
    )
  ) {
    return shouldForceGptImage2ToTuzi();
  }
  return true;
}

function detectPromptImageCount(prompt: string): number {
  const normalized = prompt
    .replace(/[，。！？；、]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return 1;

  const countToken = '([2-4]|二|两|三|四)';
  const countPatterns = [
    new RegExp(
      `(?:生成|输出|制作|创作|画|create|generate|make|produce)[^\\n]{0,28}${countToken}\\s*(?:张|幅|个|images?|pictures?|variations?|outputs?)`,
      'i'
    ),
    new RegExp(
      `${countToken}\\s*(?:张|幅|个|images?|pictures?|variations?|outputs?)`,
      'i'
    )
  ];

  for (const pattern of countPatterns) {
    const match = normalized.match(pattern);
    const detected = parseImageCountToken(match?.[1]);
    if (detected && detected > 1) return detected;
  }

  if (
    /(?:多张|多幅|多个版本|多个方案|multiple images?|several images?|a few images?|image set|variations?)/i.test(
      normalized
    )
  ) {
    return 2;
  }

  return 1;
}

function sanitizeImageIdList(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .filter((id): id is string => typeof id === 'string')
        .map((id) => id.trim())
        .filter(Boolean)
    )
  ).slice(0, max);
}

function sanitizeOptionalText(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function sanitizeCharacterReferenceGroups(
  value: unknown
): ImageCharacterReferenceGroup[] {
  if (!Array.isArray(value)) return [];
  const groups: ImageCharacterReferenceGroup[] = [];
  for (const rawGroup of value) {
    if (!rawGroup || typeof rawGroup !== 'object') continue;
    const group = rawGroup as Record<string, unknown>;
    const referenceImageIds = sanitizeImageIdList(
      group.referenceImageIds,
      MAX_CHARACTER_REFERENCES_PER_GROUP
    );
    if (referenceImageIds.length === 0) continue;
    const label =
      sanitizeOptionalText(group.label, 80) ||
      sanitizeOptionalText(group.name, 80) ||
      `Character ${groups.length + 1}`;
    const characterCardId = sanitizeOptionalText(group.characterCardId, 80);
    const description = sanitizeOptionalText(group.description, 300);
    groups.push({
      ...(characterCardId ? { characterCardId } : {}),
      label,
      ...(description ? { description } : {}),
      referenceImageIds
    });
    if (groups.length >= MAX_CHARACTER_REFERENCE_GROUPS) break;
  }
  return groups;
}

function sanitizeMoodboardConditioning(
  value: unknown
): MoodboardConditioning | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  const moodboardId = sanitizeOptionalText(record.moodboardId, 80);
  const shareToken = sanitizeOptionalText(record.shareToken, 120);
  const tasteProfile = sanitizeOptionalText(record.tasteProfile, 2000);
  const analysisVersion =
    typeof record.analysisVersion === 'number' &&
    Number.isInteger(record.analysisVersion)
      ? Math.max(0, record.analysisVersion)
      : 0;
  if (!moodboardId || !tasteProfile || analysisVersion < 1) return undefined;
  const stringList = (input: unknown, limit: number, maxLength: number) =>
    Array.isArray(input)
      ? Array.from(
          new Set(
            input
              .map((item) => sanitizeOptionalText(item, maxLength))
              .filter(Boolean)
          )
        ).slice(0, limit)
      : [];
  return {
    moodboardId,
    ...(shareToken ? { shareToken } : {}),
    analysisVersion,
    tasteProfile,
    keywords: stringList(record.keywords, 16, 80),
    avoids: stringList(record.avoids, 16, 160),
    guidelines: stringList(record.guidelines, 16, 300),
    representativeAssetIds: sanitizeImageIdList(
      record.representativeAssetIds,
      4
    )
  };
}

function sanitizeImageCreationContext(
  value: unknown
): ImageCreationContext | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  const sessionId = sanitizeOptionalText(record.sessionId, 80);
  const recipeId = sanitizeOptionalText(record.recipeId, 80);
  const moodboard = sanitizeMoodboardConditioning(record.moodboard);
  const conversionAttributionRecord =
    record.conversionAttribution &&
    typeof record.conversionAttribution === 'object' &&
    !Array.isArray(record.conversionAttribution)
      ? (record.conversionAttribution as Record<string, unknown>)
      : undefined;
  const conversionSessionId = sanitizeOptionalText(
    conversionAttributionRecord?.sessionId,
    160
  );
  const conversionCanonicalPath = sanitizeOptionalText(
    conversionAttributionRecord?.canonicalPath,
    500
  );
  const conversionCaseId = sanitizeOptionalText(
    conversionAttributionRecord?.caseId,
    160
  );
  const conversionCaseSlug = sanitizeOptionalText(
    conversionAttributionRecord?.caseSlug,
    160
  );
  const conversionSource = sanitizeOptionalText(
    conversionAttributionRecord?.source,
    120
  );
  const conversionCluster = sanitizeOptionalText(
    conversionAttributionRecord?.cluster,
    160
  );
  const conversionContentId = sanitizeOptionalText(
    conversionAttributionRecord?.contentId,
    160
  );
  const conversionCta = sanitizeOptionalText(
    conversionAttributionRecord?.cta,
    240
  );
  const conversionCapturedAt = sanitizeOptionalText(
    conversionAttributionRecord?.capturedAt,
    40
  );
  const conversionCapturedAtMs = conversionCapturedAt
    ? Date.parse(conversionCapturedAt)
    : Number.NaN;
  const conversionAttribution =
    conversionSessionId &&
    conversionCanonicalPath?.startsWith('/') &&
    !conversionCanonicalPath.includes('?') &&
    conversionCaseId &&
    conversionSource &&
    ['prompt_detail_use', 'prompt_preview_use', 'prompt_case_recipe'].includes(
      conversionSource
    ) &&
    Number.isFinite(conversionCapturedAtMs) &&
    Math.abs(Date.now() - conversionCapturedAtMs) <= 30 * 24 * 60 * 60 * 1000
      ? {
          sessionId: conversionSessionId,
          canonicalPath: conversionCanonicalPath,
          caseId: conversionCaseId,
          ...(conversionCaseSlug ? { caseSlug: conversionCaseSlug } : {}),
          source: conversionSource,
          ...(conversionCluster ? { cluster: conversionCluster } : {}),
          ...(conversionContentId ? { contentId: conversionContentId } : {}),
          ...(conversionCta ? { cta: conversionCta } : {}),
          capturedAt: new Date(conversionCapturedAtMs).toISOString()
        }
      : undefined;
  const referenceAssetIds = sanitizeImageIdList(
    record.referenceAssetIds,
    MAX_IMAGE_REFERENCE_IDS
  );
  if (
    !sessionId &&
    !recipeId &&
    !moodboard &&
    !conversionAttribution &&
    referenceAssetIds.length === 0
  )
    return undefined;
  return {
    ...(sessionId ? { sessionId } : {}),
    ...(recipeId ? { recipeId } : {}),
    ...(moodboard ? { moodboard } : {}),
    ...(conversionAttribution ? { conversionAttribution } : {}),
    referenceAssetIds
  };
}

function getFlattenedCharacterReferenceIds(
  groups: ImageCharacterReferenceGroup[]
): string[] {
  return Array.from(
    new Set(groups.flatMap((group) => group.referenceImageIds))
  );
}

function getCharacterCardIdsFromGroups(
  groups: ImageCharacterReferenceGroup[]
): string[] {
  return Array.from(
    new Set(
      groups
        .map((group) => group.characterCardId)
        .filter((id): id is string => Boolean(id))
    )
  );
}

function resolveImageCount(
  input: ImageGenerateRequest,
  prompt: string
): number {
  return (
    parseImageCountValue(input.imageCount) || detectPromptImageCount(prompt)
  );
}

export function sanitizeImageGenerateInput(
  input: ImageGenerateRequest,
  options: { preserveLegacyGptImage2?: boolean } = {}
):
  | {
      ok: true;
      value: SanitizedImageGenerateRequest;
    }
  | {
      ok: false;
      status: number;
      body: Record<string, unknown>;
    } {
  const promptMode = resolvePromptMode(input.promptMode);
  const rawPrompt = input.prompt?.trim() || '';
  const splitPrompt = splitInlineNegativePrompt(rawPrompt);
  const prompt = splitPrompt.prompt;
  if (!prompt) {
    return { ok: false, status: 400, body: { error: 'prompt is required' } };
  }
  if (prompt.length > MAX_PROMPT_CHARS) {
    return {
      ok: false,
      status: 400,
      body: { error: `prompt is too long; max ${MAX_PROMPT_CHARS} characters` }
    };
  }

  const negativePrompt = sanitizeLegacyAutoNegativePrompt(
    joinNegativePrompts(input.negativePrompt, splitPrompt.negativePrompt)
  );
  if (negativePrompt && negativePrompt.length > MAX_NEGATIVE_PROMPT_CHARS) {
    return {
      ok: false,
      status: 400,
      body: {
        error: `negativePrompt is too long; max ${MAX_NEGATIVE_PROMPT_CHARS} characters`
      }
    };
  }

  const requestedAspectRatio = normalizeAspectRatio(
    input.aspectRatio || DEFAULT_IMAGE_GENERATION_ASPECT_RATIO
  );
  if (!requestedAspectRatio) {
    return { ok: false, status: 400, body: { error: 'invalid aspectRatio' } };
  }

  // 比例参数为 Auto 时，优先从提示词中解析比例/尺寸，让提前写好比例的提示词
  // 免手动设置比例；未命中时保持 auto，由 provider 决定画幅。
  const promptImageSize = detectPromptImageSize(prompt);
  const promptAspectRatio = promptImageSize
    ? deriveAspectRatioFromImageSize(promptImageSize)
    : detectPromptAspectRatio(prompt);
  const autoDetectedAspectRatio =
    requestedAspectRatio === 'auto' ? promptAspectRatio : undefined;

  const imageSizeInput =
    input.imageSize && input.imageSize !== 'auto'
      ? input.imageSize
      : requestedAspectRatio === 'auto' && promptImageSize
        ? promptImageSize
        : autoDetectedAspectRatio
          ? getDefaultImageSizeForAspectRatio(autoDetectedAspectRatio)
          : input.imageSize ||
            getDefaultImageSizeForAspectRatio(requestedAspectRatio);
  const imageSize = validateImageSize(imageSizeInput);
  if (!imageSize.ok) {
    return {
      ok: false,
      status: 400,
      body: { error: 'invalid imageSize', message: imageSize.reason }
    };
  }
  const requestedModelKey = normalizeKey(input.model).replace(/\s+/g, '-');
  if (requestedModelKey.startsWith('gpt-image-2.5-')) {
    return {
      ok: false,
      status: 400,
      body: {
        error: 'unsupported model',
        message: `${input.model?.trim()} 尚未在当前图像通道验证，请使用 gpt-image-2.5。`
      }
    };
  }
  const model = resolveModelId(
    input.model,
    options.preserveLegacyGptImage2 === true
  );
  const modelImageSize = validateModelImageSize(model, imageSize.size);
  if (!modelImageSize.ok) {
    return {
      ok: false,
      status: 400,
      body: { error: 'invalid imageSize', message: modelImageSize.reason }
    };
  }
  const aspectRatio =
    deriveAspectRatioFromImageSize(imageSize.size) ||
    autoDetectedAspectRatio ||
    requestedAspectRatio ||
    DEFAULT_IMAGE_GENERATION_ASPECT_RATIO;
  const requestedQuality = resolveQuality(input.quality);
  if (!requestedQuality) {
    return { ok: false, status: 400, body: { error: 'invalid quality' } };
  }
  const quality = getStableImageGenerationQuality({
    model,
    imageSize: imageSize.size,
    quality: requestedQuality
  }) as QualityProfile;
  const outputFormat = resolveOutputFormat(input.outputFormat);
  if (!outputFormat) {
    return { ok: false, status: 400, body: { error: 'invalid outputFormat' } };
  }
  const assetIds = Array.isArray(input.assetIds)
    ? input.assetIds
        .filter((id): id is string => typeof id === 'string')
        .map((id) => id.trim())
        .filter(Boolean)
        .slice(0, MAX_ASSET_IDS)
    : [];
  const recipeAudit = sanitizeImagePromptRecipeAudit(
    input.recipeAudit,
    assetIds
  );
  const characterReferenceGroups = sanitizeCharacterReferenceGroups(
    input.characterReferenceGroups
  );
  const explicitReferenceImageIds = sanitizeImageIdList(
    input.referenceImageIds,
    MAX_IMAGE_REFERENCE_IDS
  );
  const maskImageId = sanitizeOptionalText(input.maskImageId, 80) || undefined;
  const creationContext = sanitizeImageCreationContext(input.creationContext);
  const referenceImageIds = mergeBillableImageReferenceIds(
    explicitReferenceImageIds,
    creationContext?.referenceAssetIds || [],
    creationContext?.moodboard?.representativeAssetIds || [],
    getFlattenedCharacterReferenceIds(characterReferenceGroups)
  );
  const sourceGenerationId = sanitizeOptionalText(input.sourceGenerationId, 80);
  const referenceMode = resolveReferenceMode(
    characterReferenceGroups.length > 0
      ? 'character_consistency'
      : input.referenceMode,
    sourceGenerationId
      ? [...referenceImageIds, sourceGenerationId]
      : referenceImageIds
  );
  const editInstruction = sanitizeOptionalText(input.editInstruction, 1000);
  const editMode =
    input.editMode === 'context_locked' && (sourceGenerationId || referenceImageIds.length > 0)
      ? 'context_locked'
      : undefined;
  const appSlug = sanitizeOptionalText(input.appSlug, 80);
  const appOperation = sanitizeOptionalText(input.appOperation, 80);
  const sourceApp = sanitizeOptionalText(input.sourceApp, 80);
  const characterCardIds = Array.from(
    new Set([
      ...sanitizeImageIdList(
        input.characterCardIds,
        MAX_CHARACTER_REFERENCE_GROUPS
      ),
      ...getCharacterCardIdsFromGroups(characterReferenceGroups)
    ])
  ).slice(0, MAX_CHARACTER_REFERENCE_GROUPS);
  const modelConfig = getTuziImageModelConfig(model);
  const totalReferenceCount =
    referenceImageIds.length + (sourceGenerationId ? 1 : 0);
  if (totalReferenceCount > 0 && !modelConfig.supportsReferenceImage) {
    return {
      ok: false,
      status: 400,
      body: {
        error: 'model does not support reference images yet',
        message: `${modelConfig.label} 的参考图传递方式尚未启用，请先取消参考图或切换到已启用传图的模型。`
      }
    };
  }
  if (
    totalReferenceCount > 0 &&
    modelConfig.maxReferenceImages > 0 &&
    totalReferenceCount > modelConfig.maxReferenceImages
  ) {
    return {
      ok: false,
      status: 400,
      body: {
        error: 'too many reference images',
        message: `最多支持 ${modelConfig.maxReferenceImages} 张参考图`
      }
    };
  }
  const imageCount = resolveImageCount(input, prompt);
  if (imageCount > 1 && !modelConfig.supportsMultipleImages) {
    return {
      ok: false,
      status: 400,
      body: {
        error: 'model does not support multiple images',
        message: `${modelConfig.label} 暂不支持一次生成多张，请将数量改为 1 或切换模型。`
      }
    };
  }
  const providerImageSizeForRouting =
    imageSize.size && imageSize.size !== 'auto'
      ? imageSize.size
      : promptImageSize;
  const provider =
    model === 'gpt-image-2' &&
    shouldRouteGptImage2DirectlyToTuzi({
      imageSize: providerImageSizeForRouting,
      imageCount
    })
      ? 'tuzi'
      : MODEL_CONFIG[model].provider;

  return {
    ok: true,
    value: {
      prompt,
      negativePrompt,
      model,
      modelLabel: modelConfig.label,
      provider,
      aspectRatio,
      imageSize: imageSize.size,
      quality,
      qualityLabel: QUALITY_CONFIG[quality],
      outputFormat,
      assetIds,
      referenceImageIds,
      maskImageId,
      referenceMode,
      characterCardIds,
      characterReferenceGroups,
      sourceGenerationId: sourceGenerationId || undefined,
      editInstruction: editInstruction || undefined,
      editMode,
      appSlug: appSlug || undefined,
      appOperation: appOperation || undefined,
      sourceApp: sourceApp || undefined,
      promptMode,
      imageCount,
      recipeAudit,
      creationContext,
      promptAspectRatio,
      promptImageSize
    }
  };
}

export function getProviderImageSize(
  input: SanitizedImageGenerateRequest
): string | undefined {
  if (input.promptMode === 'custom') {
    if (input.imageSize && input.imageSize !== 'auto') return input.imageSize;
    if (input.promptImageSize) return input.promptImageSize;
    if (input.promptAspectRatio) {
      return getDefaultImageSizeForAspectRatio(input.promptAspectRatio);
    }
    return undefined;
  }
  return input.imageSize && input.imageSize !== 'auto'
    ? input.imageSize
    : undefined;
}

export function getTuziProviderImageSize(
  input: SanitizedImageGenerateRequest
): string | undefined {
  const providerImageSize = getProviderImageSize(input);
  if (providerImageSize && providerImageSize !== 'auto') {
    return providerImageSize;
  }
  return 'auto';
}

export function getKrillProviderImageSize(
  input: SanitizedImageGenerateRequest
): string | undefined {
  const providerImageSize = getProviderImageSize(input);
  if (providerImageSize && providerImageSize !== 'auto') {
    return providerImageSize;
  }
  return undefined;
}

export function getResultAspectRatio(
  input: SanitizedImageGenerateRequest
): AspectRatio {
  if (input.promptMode === 'custom') {
    return (
      deriveAspectRatioFromImageSize(getResultImageSize(input)) ||
      input.promptAspectRatio ||
      'auto'
    );
  }
  return (
    input.promptAspectRatio ||
    deriveAspectRatioFromImageSize(input.imageSize) ||
    input.aspectRatio
  );
}

export function getResultImageSize(
  input: SanitizedImageGenerateRequest
): string {
  if (input.provider === 'krill') {
    return getKrillProviderImageSize(input) || 'auto';
  }
  if (input.provider === 'tuzi') {
    return getTuziProviderImageSize(input) || 'auto';
  }
  if (input.promptMode === 'custom') {
    return getProviderImageSize(input) || 'auto';
  }
  return getProviderImageSize(input) || input.imageSize;
}

export function getZImageSize(input: SanitizedImageGenerateRequest): string {
  const providerSize = getProviderImageSize(input);
  const size =
    providerSize && providerSize !== 'auto' ? providerSize : input.imageSize;
  return (size === 'auto' ? DEFAULT_IMAGE_GENERATION_SIZE : size).replace(
    'x',
    '*'
  );
}
