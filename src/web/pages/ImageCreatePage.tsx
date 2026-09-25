import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  BookImage,
  Check,
  ChevronDown,
  Image as ImageIcon,
  Sparkles,
  X,
  Zap
} from 'lucide-react';
import '../styles/image-create.css';
import '../styles/image-create-mobile.css';
import '../styles/create-studio-theme.css';
import { useAuth } from '../contexts/AuthContext';
import { useAuthModal } from '../components/AuthModal';
import { useLanguage } from '@/i18n/hooks/useLanguage';
import { useActivationStatus } from '../lib/use-activation-status';
import {
  hasActivationReturnVisit,
  hasSeenActivationTeachingHint,
  markActivationReturnVisit,
  markActivationTeachingHintSeen,
  recordActivationTeachingHintShown,
  type ActivationTeachingHintId
} from '../lib/activation-teaching-hints';
import { ActivationTeachingHint } from '../components/image-create/ActivationTeachingHint';
import { canRetryImageGenerationFailure } from '@/shared/image-generation-failure';
import { applySeo } from '../lib/seo';
import { isCreateWorkspaceFeatureEnabled } from '../lib/create-workspace-flags';
import { trackImageGenerationEvent } from '../lib/analytics';
import {
  isSeoPromptUseSource,
  readSeoConversionAttribution
} from '../lib/seo-conversion-attribution';
import { getVisualImageDisplayUrl } from '@/shared/visual-image-display';
import {
  CREATE_WORKSPACE_FEATURE_FLAGS,
  toMoodboardConditioning,
  type ImageCreationContext,
  type ImageCreationTurn,
  type VisualMoodboard
} from '@/shared/create-workspace-v2';
import {
  createImageSession,
  createImageSessionTurn,
  getMoodboard,
  getSharedMoodboard,
  isPersistedMoodboardId,
  listImageSessionTurns,
  listMoodboards,
  addMoodboardItems,
  materializeMoodboardForUse
} from '@/services/create-workspace-v2-api';
import { getCreateWorkspaceMoodboardFallback } from '../data/create-workspace-demo';
import { sanitizeLegacyAutoNegativePrompt } from '@/shared/image-negative-prompt';
import {
  checkImageConsistency,
  optimizeImagePrompt,
  getImageCreatorUserLibrary,
  getVisualImageHistoryResult,
  getVisualVideoHistoryResult,
  getPublicPromptCase,
  importGenerationAsReference,
  listImageReferences,
  saveImageCreatorUserLibrary,
  saveUserPromptAsset,
  setVisualImageFavorite,
  uploadImageReference,
  type ImageCreatorRecipe,
  type ImageCreatorUserLibraryPayload,
  type PromptCase,
  type UserPromptAssetSaveInput,
  type VisualImageGenerationResult,
  type VisualImageGenerationRequest,
  type VisualImageHistoryItem,
  type VisualVideoGenerationItem,
  getAuthToken
} from '@/services/agent-api';
import { getApiBaseUrl } from '@/utils/env';
import {
  PORTRAIT_SKILL_ID,
  extractSkillToolResult,
  parseSkillSseBuffer
} from '../components/image-create/skill-image-chat/constants';
import {
  buildManualImagePromptRecipeAudit,
  hasMatchingImagePromptRecipeSelection,
  type ImagePromptRecipeAudit
} from '@/shared/image-prompt-recipe-audit';
import {
  completeRewardTaskOnce,
  REWARD_TASK_IDENTIFIERS
} from '@/services/reward-task-events';
import type { ProgressTask } from '../components/image-create/GenerationProgressPanel';
import { CreateSideNav } from '../components/image-create/CreateSideNav';
import {
  DeepFeaturePaywallModal,
  type DeepFeaturePaywallKind
} from '../components/image-create/DeepFeaturePaywallModal';
import { HistoryPreviewModal } from '../components/image-create/HistoryPreviewModal';
import type { ResolvedVisualRecipeAsset } from '../components/image-create/assetLibraryResolver';
import { resolveHistoryVisualRecipeAssets } from '../components/image-create/historyVisualRecipe';
import { HistoryGalleryModal } from '../components/image-create/HistoryGalleryModal';
import { AssetEditModal } from '../components/image-create/AssetEditModal';
import { UploadReverseModal } from '../components/image-create/UploadReverseModal';
import { PromptImportModal } from '../components/image-create/PromptImportModal';
import { useThumbnailQueue } from '../components/image-create/useThumbnailQueue';
import {
  useAssetUpload,
  type ReverseSessionDraft
} from '../components/image-create/useAssetUpload';
import { useAssetLibrary } from '../components/image-create/useAssetLibrary';
import {
  normalizeVisualRecipeSelection,
  readImagePromptSlot
} from '../data/visual-recipe-selection';
import { AssetPicker } from '../components/image-create/AssetPicker';
import { CharacterReferencePickerModal } from '../components/image-create/CharacterReferencePickerModal';
import { ImageCreateCharacterWorkflowModal } from '../components/image-create/ImageCreateCharacterWorkflowModal';
import { UpgradePromptModal } from '../components/image-create/UpgradePromptModal';
import { RecipePresetGallery } from '../components/image-create/RecipePresetGallery';
import {
  buildImageStudioStarterCaseCommit,
  useImageStudioStarterCases,
  type ImageStudioStarterCase
} from '../components/image-create/useImageStudioStarterCases';
import type {
  PromptReferenceMention,
  ReferenceUploadPreviewItem
} from '../components/image-create/PromptCompilerPanel';
import type { GenerationRecordTask } from '../components/image-create/GenerationRecordsRail';
import {
  ImageStudioComposer,
  type ImageStudioConditioningMode,
  type ImageStudioRecipeSlot
} from '../components/image-create/ImageStudioComposer';
import {
  ImageSessionConversation,
  type FirstCreationMilestone
} from '../components/image-create/ImageSessionConversation';
import {
  useImageSessionConversation,
  type CreationSessionHistoryItem
} from '../components/image-create/useImageSessionConversation';
import { createImageEditorEntryState } from '../components/image-editor/editor-entry';
import { localizeCreateHref } from '../data/create-workspace';
import { selectSessionProgressTasks } from '../components/image-create/imageSessionProgress';
import {
  updateCachedImageCreationSessionCover,
  upsertCachedImageCreationSession
} from '../components/image-create/useImageCreationSessions';
import { VideoHistoryPreviewDialog } from '../components/image-create/VideoHistoryPreviewDialog';
import { PhotoSwipeViewer } from '../components/image-create/PhotoSwipeViewer';
import { useOverlayBehavior } from '@/shared/ui';
import { triggerImageDownload } from '../components/image-create/downloadImage';
import { fileToDataUrl } from '../components/image-create/referenceFileUtils';
import { analyzeImagePromptStructure } from '../components/image-create/promptDiagnostics';
import { removeAndReindexPromptReferenceMention } from '../components/image-create/imagePromptReferenceTokens';
import { useCreditsEstimate } from '../components/image-create/useCreditsEstimate';
import {
  useImageGeneration,
  type ImageGenerationQueueItem
} from '../components/image-create/useImageGeneration';
import { useMembershipStatus } from '../components/image-create/useMembershipStatus';
import { useImageTaskCenter } from '../components/image-create/useImageTaskCenter';
import { buildImageProgressTasks } from '../components/image-create/imageTaskProgressTasks';
import {
  buildReverseSessionAssets,
  formatPromptForClipboard,
  getCreateEntrySourceFromSearch,
  getCreateLocalePrefix,
  getSharedPromptCaseId,
  inferPromptTitle,
  isWeakPromptTitle,
  pickPromptLocale,
  sanitizeCreateEntrySource
} from '../components/image-create/imageCreatePromptUtils';
import {
  applyImagePromptSelectionToPrompt,
  compileImagePrompt,
  composerImagePromptSlots,
  buildAuditedRandomImagePromptSelection,
  buildAuditedRandomizedImagePromptSelectionSlot,
  clearImagePromptSelectionSlot,
  defaultImagePromptSelection,
  defaultImagePromptSettings,
  getSelectedAssetIds,
  getImagePromptRecipeCompilerVersion,
  imagePromptSlots,
  normalizeImagePromptSelection,
  replaceImagePromptAssetSelectionId,
  setImagePromptAssetSelection,
  SLOT_LABEL_KEYS,
  toggleImagePromptAssetSelection,
  type ImagePromptAsset,
  type ImagePromptSelection,
  type ImagePromptSettings,
  type ImagePromptSlot,
  type PromptLocale
} from '../data/image-prompt-core';
import { loadImagePromptAssetCatalog } from '../data/image-prompt-asset-catalog-loader';
import {
  buildRecipeConditionedPrompt,
  shouldDetachRecipeForPromptEdit
} from '../components/image-create/imageStudioConditioning';
import {
  buildPromptStyleGridPrompt,
  parsePromptStyleGridParam
} from '../data/prompt-style-grid';
import {
  defaultWardrobeMaterialSelection,
  normalizeWardrobeMaterialSelection,
  type WardrobeMaterialSelection,
  type WardrobeMaterialSlot
} from '../data/wardrobe-materials';
import { pickNextRandomImagePrompt } from '../data/image-random-prompts';
import {
  derivePromptCaseRouteImport,
  getImageGenerateGateDecision,
  resolvePromptCaseRouteImport,
  type PromptCaseRouteImportPayload
} from './image-create-route-import';
import { consumeDiscoveryRecreatePayload } from '../lib/discovery-recreate';
import { withReferralParam } from '../lib/referral-share';
import type {
  ImageCharacterCard,
  ImageCharacterReferenceGroup,
  ImageConsistencyCheckResult,
  ImageReferenceAsset
} from '@/shared/image-reference-types';
import {
  MAX_IMAGE_REFERENCE_IDS,
  mergeBillableImageReferenceIds
} from '@/shared/image-reference-types';
import {
  clampImageCountForModel,
  getAspectRatioForImageSize,
  getImageSizeForAspectRatio,
  imageSizeOptions,
  modelOptions as fallbackModelOptions,
  outputFormatOptions,
  qualityOptions,
  resolveRecommendedImageSettingsForModel
} from '../data/image-creator-options';
import { useRuntimeImageModels } from '../hooks/useRuntimeImageModels';

const CreatorCanvas = lazy(() =>
  import('../components/image-create/CreatorCanvas').then((module) => ({
    default: module.CreatorCanvas
  }))
);
const PromptCompilerPanel = lazy(() =>
  import('../components/image-create/PromptCompilerPanel').then((module) => ({
    default: module.PromptCompilerPanel
  }))
);
const ImageGenerationRecordsPanel = lazy(() =>
  import('../components/image-create/ImageGenerationRecordsPanel').then(
    (module) => ({ default: module.ImageGenerationRecordsPanel })
  )
);

const PRESETS_STORAGE_KEY = 'webtomind:image-creator-presets';
const PROMPT_LIBRARY_STORAGE_KEY = 'webtomind:image-creator-prompt-library';
const PROMPT_EDITOR_DRAFT_STORAGE_KEY =
  'webtomind:image-create-prompt-editor-draft:v2';
const LEGACY_PROMPT_EDITOR_DRAFT_STORAGE_KEY =
  'webtomind:image-create-prompt-editor-draft';
const PROMPT_EDITOR_DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const AUTO_OPTIMIZE_PROMPT_STORAGE_KEY =
  'webtomind:image-create-auto-optimize-prompt';
const CREATE_ENTRY_ATTRIBUTION_STORAGE_KEY =
  'webtomind:image-create-entry-attribution';
const ACKNOWLEDGED_PROGRESS_TASKS_STORAGE_KEY =
  'webtomind:image-create-acknowledged-progress-tasks';
const ACKNOWLEDGED_PROGRESS_TASKS_LIMIT = 120;
const CREATE_ENTRY_ATTRIBUTION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const LOW_BALANCE_TOP_UP_MULTIPLIER = 3;
const PROMPT_CASE_SHARE_CARD_VERSION = '20260607-clean-cta-mask';
const HISTORY_GALLERY_PAGE_SIZE = 24;
const HISTORY_GALLERY_CACHE_TTL_MS = 2 * 60 * 1000;

/**
 * 技能图像创作开关：仅本地调试开启（.env.local 设 VITE_ENABLE_SKILL_IMAGE_CREATION=1），
 * 生产默认关闭，技能入口不渲染、不发请求。
 */
const SKILL_IMAGE_CREATION_ENABLED =
  import.meta.env.VITE_ENABLE_SKILL_IMAGE_CREATION === '1';

function readAcknowledgedProgressTaskKeys() {
  if (typeof window === 'undefined') return new Set<string>();
  try {
    const raw = window.localStorage.getItem(
      ACKNOWLEDGED_PROGRESS_TASKS_STORAGE_KEY
    );
    if (!raw) return new Set<string>();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set<string>();
    return new Set(
      parsed.filter((value): value is string => typeof value === 'string')
    );
  } catch {
    return new Set<string>();
  }
}

function persistAcknowledgedProgressTaskKeys(keys: Set<string>) {
  if (typeof window === 'undefined') return;
  try {
    const entries = Array.from(keys).slice(-ACKNOWLEDGED_PROGRESS_TASKS_LIMIT);
    window.localStorage.setItem(
      ACKNOWLEDGED_PROGRESS_TASKS_STORAGE_KEY,
      JSON.stringify(entries)
    );
  } catch {
    // Best-effort UI preference; ignore storage failures.
  }
}

const createReferenceUploadClientId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `reference-upload-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;
};

function escapePromptReferenceRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizePromptReferenceAlias(value: string) {
  return value.trim().replace(/\s+/g, '').toLowerCase();
}

function translatePromptReferenceMentions(
  prompt: string,
  mentions: PromptReferenceMention[],
  locale: PromptLocale
) {
  if (!prompt || mentions.length === 0) return prompt;
  let translatedPrompt = prompt;
  const matchedMentions: PromptReferenceMention[] = [];
  mentions.forEach((mention) => {
    const aliases = new Set([
      mention.token,
      normalizePromptReferenceAlias(mention.token),
      mention.label,
      normalizePromptReferenceAlias(mention.label)
    ]);
    const replacement =
      locale === 'zh-CN'
        ? `参考素材「${mention.label}」（${mention.kind} reference, id: ${mention.id}）`
        : `reference asset "${mention.label}" (${mention.kind} reference, id: ${mention.id})`;
    let matched = false;
    aliases.forEach((alias) => {
      if (!alias) return;
      const pattern = new RegExp(
        `@${escapePromptReferenceRegExp(alias)}(?=$|\\s|[,.!?;:，。！？；：、)])`,
        'gi'
      );
      translatedPrompt = translatedPrompt.replace(pattern, () => {
        matched = true;
        return replacement;
      });
    });
    if (matched) matchedMentions.push(mention);
  });
  if (matchedMentions.length === 0) return translatedPrompt;
  const referenceMap =
    locale === 'zh-CN'
      ? matchedMentions
          .map(
            (mention, index) =>
              `${index + 1}. ${mention.label}: ${mention.kind} reference, id=${mention.id}`
          )
          .join('\n')
      : matchedMentions
          .map(
            (mention, index) =>
              `${index + 1}. ${mention.label}: ${mention.kind} reference, id=${mention.id}`
          )
          .join('\n');
  return `${translatedPrompt}\n\nReference mapping for API:\n${referenceMap}`;
}

const visuallyHiddenHeadingStyle: CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  width: 1,
  height: 1,
  padding: 0,
  margin: 0,
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0
};

interface CreatorPreset {
  id: string;
  name: string;
  selection: ImagePromptSelection;
  settings: ImagePromptSettings;
  createdAt: number;
}

type PromptCaseRecreatePayload = PromptCaseRouteImportPayload;

interface RemixSource {
  id?: string;
  title?: string;
  slug?: string;
  source?: string;
}

export interface PromptEditorDraft {
  ownerId: string;
  promptMode: 'composed' | 'custom';
  customPromptText: string;
  customNegativePromptText: string;
  settings?: Pick<
    ImagePromptSettings,
    | 'model'
    | 'imageSize'
    | 'quality'
    | 'outputFormat'
    | 'aspectRatio'
    | 'imageCount'
  >;
  savedAt: number;
}

interface CustomPromptLibraryItem {
  id: string;
  title: string;
  prompt: string;
  negativePrompt: string;
  createdAt: number;
}

interface ReverseSession {
  id: string;
  thumbnailUrl: string;
  source: 'image' | 'prompt';
  sourcePrompt?: string;
  fullPrompt: string;
  negativePrompt: string;
  routeHint?: string;
  assets: ImagePromptAsset[];
  imported: boolean;
}

export function normalizePromptEditorDraft(
  value: unknown,
  ownerId: string
): PromptEditorDraft | null {
  if (!value || typeof value !== 'object') return null;
  const draft = value as Partial<PromptEditorDraft>;
  const promptMode =
    draft.promptMode === 'composed' || draft.promptMode === 'custom'
      ? draft.promptMode
      : 'custom';
  const customPromptText =
    typeof draft.customPromptText === 'string' ? draft.customPromptText : '';
  const customNegativePromptText =
    typeof draft.customNegativePromptText === 'string'
      ? draft.customNegativePromptText
      : '';
  const savedAt =
    typeof draft.savedAt === 'number' && Number.isFinite(draft.savedAt)
      ? draft.savedAt
      : Date.now();
  if (Date.now() - savedAt > PROMPT_EDITOR_DRAFT_TTL_MS) return null;
  const storedOwnerId =
    typeof draft.ownerId === 'string' ? draft.ownerId : 'anonymous';
  const canAdoptAnonymousDraft =
    storedOwnerId === 'anonymous' && ownerId !== 'anonymous';
  if (storedOwnerId !== ownerId && !canAdoptAnonymousDraft) return null;
  const rawSettings =
    draft.settings && typeof draft.settings === 'object'
      ? (draft.settings as Partial<ImagePromptSettings>)
      : null;
  const settings = rawSettings
    ? normalizeCreatorSettings({
        ...defaultImagePromptSettings,
        ...rawSettings
      })
    : undefined;
  return {
    ownerId,
    promptMode,
    customPromptText,
    customNegativePromptText,
    ...(settings
      ? {
          settings: {
            model: settings.model,
            imageSize: settings.imageSize,
            quality: settings.quality,
            outputFormat: settings.outputFormat,
            aspectRatio: settings.aspectRatio,
            imageCount: settings.imageCount
          }
        }
      : {}),
    savedAt
  };
}

function loadPromptEditorDraft(ownerId: string): PromptEditorDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    window.localStorage.removeItem(LEGACY_PROMPT_EDITOR_DRAFT_STORAGE_KEY);
    const storageKey = `${PROMPT_EDITOR_DRAFT_STORAGE_KEY}:${ownerId}`;
    const anonymousStorageKey = `${PROMPT_EDITOR_DRAFT_STORAGE_KEY}:anonymous`;
    const raw =
      window.sessionStorage.getItem(storageKey) ||
      (ownerId !== 'anonymous'
        ? window.sessionStorage.getItem(anonymousStorageKey)
        : null);
    if (!raw) return null;
    const draft = normalizePromptEditorDraft(JSON.parse(raw), ownerId);
    if (!draft) {
      window.sessionStorage.removeItem(storageKey);
    }
    return draft;
  } catch {
    return null;
  }
}

function savePromptEditorDraft(draft: PromptEditorDraft): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(
      `${PROMPT_EDITOR_DRAFT_STORAGE_KEY}:${draft.ownerId}`,
      JSON.stringify(draft)
    );
  } catch {
    // Prompt draft persistence is best-effort; editing should never be blocked.
  }
}

function normalizeCreatorSettings(
  settings: ImagePromptSettings
): ImagePromptSettings {
  const legacyModelMap: Record<string, string> = {
    'gpt-image': 'gpt-image-2.5',
    'gpt-image-2': 'gpt-image-2.5',
    'GPT Image 2': 'gpt-image-2.5',
    'gemini-image': 'nano-banana'
  };
  const modelValue =
    fallbackModelOptions.find((model) => model.value === settings.model)
      ?.value ||
    legacyModelMap[settings.model] ||
    fallbackModelOptions.find((model) => model.label === settings.model)
      ?.value ||
    defaultImagePromptSettings.model;
  const qualityValue =
    qualityOptions.find((quality) => quality.value === settings.quality)
      ?.value ||
    (settings.quality === '1K'
      ? 'auto'
      : settings.quality === '2K' || settings.quality === '4K'
        ? 'high'
        : settings.quality === 'standard'
          ? 'auto'
          : settings.quality === 'high-detail'
            ? 'high'
            : settings.quality === 'fast'
              ? 'low'
              : defaultImagePromptSettings.quality);
  const outputFormatValue =
    outputFormatOptions.find((format) => format.value === settings.outputFormat)
      ?.value || defaultImagePromptSettings.outputFormat;
  const imageSizeValue =
    imageSizeOptions.find((size) => size.value === settings.imageSize)?.value ||
    getImageSizeForAspectRatio(settings.aspectRatio) ||
    defaultImagePromptSettings.imageSize;
  const aspectRatioValue = getAspectRatioForImageSize(imageSizeValue);
  const imageCountValue = clampImageCountForModel(
    modelValue,
    settings.imageCount
  );

  return {
    ...settings,
    model: modelValue,
    imageSize: imageSizeValue,
    aspectRatio: aspectRatioValue,
    quality: qualityValue,
    outputFormat: outputFormatValue,
    imageCount: imageCountValue
  };
}

/**
 * 图像创作新会话的默认设置：比例 Auto（优先从提示词中的比例自动出图），
 * 尺寸同样交给 Auto（服务端按提示词比例解析具体尺寸）。
 * 新建会话与“重置”都回到该默认。
 */
export const defaultStudioImageSettings: ImagePromptSettings =
  normalizeCreatorSettings({
    ...defaultImagePromptSettings,
    aspectRatio: 'auto',
    imageSize: 'auto'
  });

function normalizeCreatorPresetItem(raw: unknown): CreatorPreset | null {
  if (!raw || typeof raw !== 'object') return null;
  const preset = raw as Partial<CreatorPreset>;
  const name =
    typeof preset.name === 'string' && preset.name.trim()
      ? preset.name.trim().slice(0, 120)
      : 'Untitled preset';
  return {
    id:
      typeof preset.id === 'string' && preset.id
        ? preset.id
        : crypto.randomUUID(),
    name,
    selection: normalizeImagePromptSelection(preset.selection),
    settings: normalizeCreatorSettings({
      ...defaultImagePromptSettings,
      ...(preset.settings || {})
    }),
    createdAt:
      typeof preset.createdAt === 'number' ? preset.createdAt : Date.now()
  };
}

function normalizeCreatorPresetList(value: unknown): CreatorPreset[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(normalizeCreatorPresetItem)
    .filter((item): item is CreatorPreset => Boolean(item))
    .slice(0, 8);
}

function loadPresets(): CreatorPreset[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(PRESETS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return normalizeCreatorPresetList(parsed);
  } catch {
    return [];
  }
}

function savePresets(presets: CreatorPreset[]) {
  try {
    localStorage.setItem(
      PRESETS_STORAGE_KEY,
      JSON.stringify(presets.slice(0, 8))
    );
  } catch {
    // Ignore unavailable storage; remote sync still remains the source of truth.
  }
}

function normalizePromptLibraryItem(
  raw: unknown
): CustomPromptLibraryItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as Partial<CustomPromptLibraryItem>;
  if (typeof item.prompt !== 'string' || !item.prompt.trim()) return null;
  const prompt = item.prompt.trim();
  const rawTitle =
    typeof item.title === 'string' && item.title.trim()
      ? item.title.trim()
      : '';
  const title = isWeakPromptTitle(rawTitle)
    ? inferPromptTitle(prompt, 'Untitled prompt')
    : rawTitle;
  return {
    id: typeof item.id === 'string' ? item.id : crypto.randomUUID(),
    title,
    prompt,
    negativePrompt: sanitizeLegacyAutoNegativePrompt(item.negativePrompt) || '',
    createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now()
  };
}

function loadPromptLibrary(): CustomPromptLibraryItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(PROMPT_LIBRARY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return normalizePromptLibraryList(parsed);
  } catch {
    return [];
  }
}

function normalizePromptLibraryList(value: unknown): CustomPromptLibraryItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(normalizePromptLibraryItem)
    .filter((item): item is CustomPromptLibraryItem => Boolean(item))
    .slice(0, 50);
}

function savePromptLibrary(items: CustomPromptLibraryItem[]) {
  try {
    localStorage.setItem(
      PROMPT_LIBRARY_STORAGE_KEY,
      JSON.stringify(items.slice(0, 50))
    );
  } catch {
    // Ignore unavailable storage; remote sync still remains the source of truth.
  }
}

function mergeCreatorPresets(
  localItems: CreatorPreset[],
  remoteItems: unknown
): CreatorPreset[] {
  const merged = new Map<string, CreatorPreset>();
  for (const item of [
    ...normalizeCreatorPresetList(remoteItems),
    ...normalizeCreatorPresetList(localItems)
  ]) {
    const existing = merged.get(item.id);
    if (!existing || item.createdAt >= existing.createdAt) {
      merged.set(item.id, item);
    }
  }
  return Array.from(merged.values())
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 8);
}

function mergePromptLibraryItems(
  localItems: CustomPromptLibraryItem[],
  remoteItems: unknown
): CustomPromptLibraryItem[] {
  const byId = new Map<string, CustomPromptLibraryItem>();
  const seenContent = new Set<string>();
  const candidates = [
    ...normalizePromptLibraryList(remoteItems),
    ...normalizePromptLibraryList(localItems)
  ].sort((a, b) => b.createdAt - a.createdAt);

  for (const item of candidates) {
    const contentKey = `${item.prompt}\n---negative---\n${sanitizeLegacyAutoNegativePrompt(item.negativePrompt) || ''}`;
    if (seenContent.has(contentKey)) continue;
    const existing = byId.get(item.id);
    if (existing && existing.createdAt > item.createdAt) continue;
    byId.set(item.id, item);
    seenContent.add(contentKey);
  }

  return Array.from(byId.values())
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 50);
}

function toUserLibraryPayload(
  presets: CreatorPreset[],
  promptLibrary: CustomPromptLibraryItem[]
): ImageCreatorUserLibraryPayload {
  return {
    presets: presets.slice(0, 8).map((preset) => ({
      id: preset.id,
      name: preset.name,
      selection: { ...preset.selection },
      settings: { ...preset.settings },
      createdAt: preset.createdAt
    })),
    promptLibrary: promptLibrary.slice(0, 50)
  };
}

type HistoryGalleryMode = 'preview' | 'reference-picker';

interface HistoryGalleryCache {
  items: VisualImageHistoryItem[];
  total: number;
  cachedAt: number;
}

function readRemixSource(value: unknown): RemixSource | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const source: RemixSource = {};
  if (typeof record.id === 'string' && record.id.trim()) {
    source.id = record.id.trim();
  }
  if (typeof record.title === 'string' && record.title.trim()) {
    source.title = record.title.trim().slice(0, 80);
  }
  if (typeof record.slug === 'string' && record.slug.trim()) {
    source.slug = record.slug.trim().slice(0, 120);
  }
  if (typeof record.source === 'string' && record.source.trim()) {
    source.source = record.source.trim().slice(0, 120);
  }
  return Object.keys(source).length > 0 ? source : null;
}

function readStoredCreateEntrySource(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const raw = window.localStorage.getItem(
      CREATE_ENTRY_ATTRIBUTION_STORAGE_KEY
    );
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { source?: unknown; savedAt?: unknown };
    const savedAt = typeof parsed.savedAt === 'number' ? parsed.savedAt : 0;
    if (Date.now() - savedAt > CREATE_ENTRY_ATTRIBUTION_TTL_MS) {
      window.localStorage.removeItem(CREATE_ENTRY_ATTRIBUTION_STORAGE_KEY);
      return undefined;
    }
    return typeof parsed.source === 'string'
      ? sanitizeCreateEntrySource(parsed.source)
      : undefined;
  } catch {
    return undefined;
  }
}

function writeStoredCreateEntrySource(source: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      CREATE_ENTRY_ATTRIBUTION_STORAGE_KEY,
      JSON.stringify({ source, savedAt: Date.now() })
    );
  } catch {
    // Attribution is best-effort; creation should never depend on storage.
  }
}

export function ImageCreatePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation('imageCreate');
  const {
    isAuthenticated,
    isLoading: authLoading,
    getAccessToken,
    user
  } = useAuth();
  const { openAuthModal } = useAuthModal();
  const membership = useMembershipStatus();
  const {
    models: modelOptions,
    selectableModels: selectableModelOptions,
    loaded: runtimeModelsLoaded
  } = useRuntimeImageModels();
  const runtimeGenerationDisabled =
    !runtimeModelsLoaded || selectableModelOptions.length === 0;
  const runtimeModelAvailabilityError =
    runtimeModelsLoaded && selectableModelOptions.length === 0
      ? '当前没有可用的图像模型，请稍后重试。'
      : '';
  const { language, changeLanguage } = useLanguage();
  const journeyEnabled = isCreateWorkspaceFeatureEnabled(
    CREATE_WORKSPACE_FEATURE_FLAGS.activationJourneyV1
  );
  const activation = useActivationStatus(user?.id || null);
  const activationRefresh = activation.refresh;
  const imageStudioV2Enabled = isCreateWorkspaceFeatureEnabled(
    CREATE_WORKSPACE_FEATURE_FLAGS.imageStudioV2
  );
  const promptLocale = pickPromptLocale(language);
  const createLocalePrefix = useMemo(
    () => getCreateLocalePrefix(location.pathname),
    [location.pathname]
  );
  const sharedPromptCaseId = useMemo(
    () => getSharedPromptCaseId(location.pathname),
    [location.pathname]
  );
  const hasApiAuth =
    isAuthenticated && !authLoading && Boolean(getAccessToken());
  const requestLogin = useCallback(
    (source = 'image_create_gate') => {
      openAuthModal({
        redirectTo: `${location.pathname}${location.search}`,
        source
      });
    },
    [location.pathname, location.search, openAuthModal]
  );
  const promptDraftOwnerId = user?.id || 'anonymous';
  const [initialPromptEditorDraft] = useState<PromptEditorDraft | null>(() =>
    authLoading ? null : loadPromptEditorDraft(promptDraftOwnerId)
  );
  const [activeSlot, setActiveSlot] = useState<ImagePromptSlot>('character');
  const [selection, setSelection] = useState(defaultImagePromptSelection);
  const [recipeDraftSelection, setRecipeDraftSelection] = useState(
    defaultImagePromptSelection
  );
  const [recipeOpenSignal, setRecipeOpenSignal] = useState(0);
  const [wardrobeMaterials, setWardrobeMaterials] =
    useState<WardrobeMaterialSelection>(defaultWardrobeMaterialSelection);
  const [randomRecipeAudit, setRandomRecipeAudit] =
    useState<ImagePromptRecipeAudit | null>(null);
  const setManualSelection = useCallback(
    (update: Parameters<typeof setSelection>[0]) => {
      setRandomRecipeAudit(null);
      setSelection(update);
    },
    []
  );
  const [settings, setSettings] = useState<ImagePromptSettings>(() =>
    initialPromptEditorDraft?.settings
      ? normalizeCreatorSettings({
          ...defaultImagePromptSettings,
          ...initialPromptEditorDraft.settings
        })
      : defaultStudioImageSettings
  );
  useEffect(() => {
    if (!runtimeModelsLoaded) return;
    const currentModel = modelOptions.find(
      (model) => model.value === settings.model
    );
    if (currentModel?.status !== 'unavailable') return;
    const fallbackModel = selectableModelOptions[0];
    if (!fallbackModel) return;
    setSettings((current) => ({
      ...current,
      model: fallbackModel.value,
      ...resolveRecommendedImageSettingsForModel(
        fallbackModel,
        current.imageSize
      )
    }));
  }, [
    modelOptions,
    runtimeModelsLoaded,
    selectableModelOptions,
    settings.model
  ]);
  const [toastText, setToastText] = useState('');
  const [toastTone, setToastTone] = useState<'info' | 'error'>('info');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [promptCatalogLoadScope, setPromptCatalogLoadScope] = useState<
    'none' | 'active-slot' | 'full'
  >('none');
  const requestPromptCatalogSlot = useCallback((slot: ImagePromptSlot) => {
    setActiveSlot(slot);
    setPromptCatalogLoadScope((current) =>
      current === 'full' ? 'full' : 'active-slot'
    );
  }, []);
  const requestFullPromptCatalog = useCallback(
    () => setPromptCatalogLoadScope('full'),
    []
  );
  const [isPromptExpanded, setIsPromptExpanded] = useState(false);
  const [presets, setPresets] = useState<CreatorPreset[]>(() => loadPresets());
  const [promptLibrary, setPromptLibrary] = useState<CustomPromptLibraryItem[]>(
    () => loadPromptLibrary()
  );
  const [presetSaved, setPresetSaved] = useState(false);
  const [, setPromptMode] = useState<'composed' | 'custom'>(
    () => initialPromptEditorDraft?.promptMode || 'custom'
  );
  const [customPromptText, setCustomPromptText] = useState(
    () => initialPromptEditorDraft?.customPromptText || ''
  );
  const [starterCasePreviewPrompt, setStarterCasePreviewPrompt] = useState<
    string | null
  >(null);
  // Skill 图像创作（Agent 模式，替换式）：入口在输入框底部，发送按钮切换为普通按钮，积分静默扣除
  const [skillActive, setSkillActive] = useState(false);
  const [activeSkillModeId, setActiveSkillModeId] = useState('');
  const [skillGenerating, setSkillGenerating] = useState(false);
  const skillAbortRef = useRef<AbortController | null>(null);
  const [committedRecipeId, setCommittedRecipeId] = useState('');
  const [sessionTurns, setSessionTurns] = useState<ImageCreationTurn[]>([]);
  const [customNegativePromptText, setCustomNegativePromptText] = useState(
    () => initialPromptEditorDraft?.customNegativePromptText || ''
  );
  const routeImportUserEditVersionRef = useRef(0);
  const [activePromptDraftOwnerId, setActivePromptDraftOwnerId] = useState<
    string | null
  >(authLoading ? null : promptDraftOwnerId);
  const [selectedReferenceIds, setSelectedReferenceIds] = useState<string[]>(
    []
  );
  const [referenceAssetsById, setReferenceAssetsById] = useState<
    Record<string, ImageReferenceAsset>
  >({});
  const [activeMoodboard, setActiveMoodboard] =
    useState<VisualMoodboard | null>(null);
  const [moodboards, setMoodboards] = useState<VisualMoodboard[]>([]);
  const [moodboardsLoading, setMoodboardsLoading] = useState(false);
  const [conditioningMode, setConditioningMode] =
    useState<ImageStudioConditioningMode>('none');
  const [activeSessionId, setActiveSessionId] = useState<string | undefined>();
  const [pendingSessionSubmission, setPendingSessionSubmission] =
    useState<GenerationRecordTask | null>(null);
  const [pendingRouteAutoGenerate, setPendingRouteAutoGenerate] = useState<{
    key: string;
    prompt: string;
  } | null>(null);
  const consumedRouteAutoGenerateRef = useRef<string | null>(null);
  const activeSessionPromiseRef = useRef<Promise<string> | null>(null);
  const [referenceUploadItems, setReferenceUploadItems] = useState<
    ReferenceUploadPreviewItem[]
  >([]);
  useEffect(() => {
    if (!imageStudioV2Enabled) return;
    const params = new URLSearchParams(location.search);
    if (params.get('newSession') === '1') {
      setActiveSessionId(undefined);
      setSessionTurns([]);
      setActiveMoodboard(null);
      setConditioningMode('none');
      setSelection(defaultImagePromptSelection);
      setRecipeDraftSelection(defaultImagePromptSelection);
      setCommittedRecipeId('');
      setStarterCasePreviewPrompt(null);
      setCustomPromptText('');
      setPendingSessionSubmission(null);
      return;
    }
    const sessionId = params.get('sessionId');
    if (sessionId) setActiveSessionId(sessionId);
  }, [imageStudioV2Enabled, location.search]);
  const referenceUploadItemsRef = useRef<ReferenceUploadPreviewItem[]>([]);
  const removedReferenceUploadIdsRef = useRef(new Set<string>());
  const [selectedCharacterIds, setSelectedCharacterIds] = useState<string[]>(
    []
  );
  const [autoOptimizePrompt, setAutoOptimizePrompt] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return (
        window.localStorage.getItem(AUTO_OPTIMIZE_PROMPT_STORAGE_KEY) === '1'
      );
    } catch {
      return false;
    }
  });
  useEffect(() => {
    if (!imageStudioV2Enabled || !hasApiAuth) {
      setMoodboards([]);
      return;
    }
    let cancelled = false;
    setMoodboardsLoading(true);
    listMoodboards()
      .then((items) => {
        if (!cancelled) setMoodboards(items);
      })
      .catch(() => {
        if (!cancelled) setMoodboards([]);
      })
      .finally(() => {
        if (!cancelled) setMoodboardsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [hasApiAuth, imageStudioV2Enabled]);

  useEffect(() => {
    if (!imageStudioV2Enabled || !hasApiAuth) {
      setActiveMoodboard(null);
      return;
    }
    const params = new URLSearchParams(location.search);
    const moodboardId = params.get('moodboardId');
    const shareToken = params.get('shareToken');
    if (!moodboardId) {
      setActiveMoodboard(null);
      setConditioningMode((current) =>
        current === 'moodboard' ? 'none' : current
      );
      return;
    }
    let cancelled = false;
    const fallback = isPersistedMoodboardId(moodboardId)
      ? null
      : getCreateWorkspaceMoodboardFallback(moodboardId);
    const request = shareToken
      ? getSharedMoodboard(shareToken)
      : fallback
        ? materializeMoodboardForUse(fallback)
        : isPersistedMoodboardId(moodboardId)
          ? getMoodboard(moodboardId)
          : Promise.reject(new Error('情绪板链接无效，请从情绪板页重新选择。'));
    request
      .then((moodboard) => {
        if (cancelled) return;
        setActiveMoodboard(moodboard);
        setConditioningMode('moodboard');
        if (moodboard.id !== moodboardId) {
          const nextParams = new URLSearchParams(location.search);
          nextParams.set('moodboardId', moodboard.id);
          navigate(`${location.pathname}?${nextParams.toString()}`, {
            replace: true
          });
        }
      })
      .catch((moodboardError) => {
        if (!cancelled) {
          setError(
            moodboardError instanceof Error
              ? moodboardError.message
              : 'Moodboard 加载失败'
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [
    hasApiAuth,
    imageStudioV2Enabled,
    location.pathname,
    location.search,
    navigate
  ]);
  const [promptOptimizingBeforeGenerate, setPromptOptimizingBeforeGenerate] =
    useState(false);
  const [characterPickerOpen, setCharacterPickerOpen] = useState(false);
  const [characterWorkflowOpen, setCharacterWorkflowOpen] = useState(false);
  const [characterReferenceGroups, setCharacterReferenceGroups] = useState<
    ImageCharacterReferenceGroup[]
  >([]);
  const [consistencyChecking, setConsistencyChecking] = useState(false);
  const [consistencyResult, setConsistencyResult] =
    useState<ImageConsistencyCheckResult | null>(null);
  const [promptEditorOpenSignal, setPromptEditorOpenSignal] = useState(0);
  const [reverseSession, setReverseSession] = useState<ReverseSession | null>(
    null
  );
  const [reverseImporting, setReverseImporting] = useState(false);
  const [reverseImportingAssetIds, setReverseImportingAssetIds] = useState<
    Set<string>
  >(new Set());
  const [previewItem, setPreviewItem] = useState<VisualImageHistoryItem | null>(
    null
  );
  const [previewVideoItem, setPreviewVideoItem] =
    useState<VisualVideoGenerationItem | null>(null);
  const [videoGenerationHistory, setVideoGenerationHistory] = useState<
    VisualVideoGenerationItem[]
  >([]);
  const [historyLightboxItems, setHistoryLightboxItems] = useState<
    VisualImageHistoryItem[]
  >([]);
  const [historyLightboxIndex, setHistoryLightboxIndex] = useState(0);
  const [historyGalleryOpen, setHistoryGalleryOpen] = useState(false);
  const [historyGalleryMode, setHistoryGalleryMode] =
    useState<HistoryGalleryMode>('preview');
  const [historyReferenceGenerationIds, setHistoryReferenceGenerationIds] =
    useState<string[]>([]);
  const [
    historyReferenceAssetByGeneration,
    setHistoryReferenceAssetByGeneration
  ] = useState<Record<string, string>>({});
  const [historyReferenceImportingId, setHistoryReferenceImportingId] =
    useState<string | null>(null);
  const [historyReferenceConfirming, setHistoryReferenceConfirming] =
    useState(false);
  const [fullGenerationHistory, setFullGenerationHistory] = useState<
    VisualImageHistoryItem[]
  >([]);
  const [fullGenerationHistoryLoading, setFullGenerationHistoryLoading] =
    useState(false);
  const [
    fullGenerationHistoryLoadingMore,
    setFullGenerationHistoryLoadingMore
  ] = useState(false);
  const [fullGenerationHistoryTotal, setFullGenerationHistoryTotal] =
    useState(0);
  const [fullGenerationHistoryError, setFullGenerationHistoryError] =
    useState('');
  const historyGalleryCacheRef = useRef<HistoryGalleryCache | null>(null);
  const historyGalleryRequestSeqRef = useRef(0);
  const [favoriteLoadingIds, setFavoriteLoadingIds] = useState<Set<string>>(
    () => new Set()
  );
  const [upgradePromptOpen, setUpgradePromptOpen] = useState(false);
  const [upgradePromptMessage, setUpgradePromptMessage] = useState('');
  const [firstCreationMilestone, setFirstCreationMilestone] =
    useState<FirstCreationMilestone | null>(null);
  const [milestoneMoodboards, setMilestoneMoodboards] = useState<
    VisualMoodboard[] | null
  >(null);
  const [milestoneMoodboardSelectedId, setMilestoneMoodboardSelectedId] =
    useState('');
  const [milestoneMoodboardSaving, setMilestoneMoodboardSaving] =
    useState(false);
  const [milestoneMoodboardSaved, setMilestoneMoodboardSaved] = useState(false);
  const [teachingHint, setTeachingHint] =
    useState<ActivationTeachingHintId | null>(null);
  const referenceHintShownRef = useRef(false);
  const moodboardHintShownRef = useRef(false);
  const historyHintShownRef = useRef(false);
  const [failureFeedbackByTaskKey, setFailureFeedbackByTaskKey] = useState<
    Record<string, string>
  >({});
  const [acknowledgedProgressTaskKeys, setAcknowledgedProgressTaskKeys] =
    useState<Set<string>>(() => readAcknowledgedProgressTaskKeys());
  const [deepPaywall, setDeepPaywall] = useState<{
    kind: DeepFeaturePaywallKind;
    source: string;
    onContinue?: () => void;
  } | null>(null);
  /**
   * 正在编辑的素材(原始 asset 对象);null 表示编辑弹窗关闭。
   * 表单态 + saving/error 已下沉到 AssetEditModal 内部,这里只存"打开信号 + 初值"。
   */
  const [editingAsset, setEditingAsset] = useState<ImagePromptAsset | null>(
    null
  );
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const referenceUploadInputRef = useRef<HTMLInputElement>(null);
  const toastTimerRef = useRef<number | null>(null);
  const lowBalanceUpsellViewKeyRef = useRef('');
  const firstSuccessEligibleRef = useRef(false);
  const firstGenerateCtaViewTrackedRef = useRef(false);
  const activationContextReadyTrackedRef = useRef(false);
  const firstMilestoneItemRef = useRef<{
    id: string;
    imageUrl: string;
    prompt: string;
  } | null>(null);
  const favoriteCountRef = useRef(0);
  const userLibrarySyncOwnerRef = useRef<string | null>(null);
  const promptEditorDraftLoadedRef = useRef(true);
  const createEntryViewKeyRef = useRef('');
  const creatorCenterColumnRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const centerColumn = creatorCenterColumnRef.current;
    if (!centerColumn) return;

    let scheduledFrame: number | null = null;

    const syncPromptActionDock = () => {
      if (scheduledFrame !== null) return;

      const flush = () => {
        scheduledFrame = null;
        const rect = centerColumn.getBoundingClientRect();
        const left = `${Math.round(rect.left)}px`;
        const width = `${Math.round(rect.width)}px`;

        // The fixed prompt dock is positioned from these variables. Avoid
        // writing unchanged values back to the observed layout tree, which
        // can create a ResizeObserver feedback loop in Chromium.
        if (
          centerColumn.style.getPropertyValue('--creator-center-fixed-left') !==
          left
        ) {
          centerColumn.style.setProperty('--creator-center-fixed-left', left);
        }
        if (
          centerColumn.style.getPropertyValue('--creator-center-fixed-width') !==
          width
        ) {
          centerColumn.style.setProperty('--creator-center-fixed-width', width);
        }
      };

      scheduledFrame =
        typeof window.requestAnimationFrame === 'function'
          ? window.requestAnimationFrame(flush)
          : window.setTimeout(flush, 0);
    };

    syncPromptActionDock();
    const resizeObserver = new ResizeObserver(syncPromptActionDock);
    resizeObserver.observe(centerColumn);
    window.addEventListener('resize', syncPromptActionDock);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', syncPromptActionDock);
      if (scheduledFrame !== null) {
        if (typeof window.cancelAnimationFrame === 'function') {
          window.cancelAnimationFrame(scheduledFrame);
        } else {
          window.clearTimeout(scheduledFrame);
        }
      }
    };
  }, []);
  const [storedCreateEntrySource, setStoredCreateEntrySource] = useState<
    string | undefined
  >(() => readStoredCreateEntrySource());
  const routeCreateEntrySource = useMemo(
    () => getCreateEntrySourceFromSearch(location.search),
    [location.search]
  );
  const createEntrySource =
    routeCreateEntrySource || storedCreateEntrySource || 'direct_create';
  const createEntrySourceOrigin = routeCreateEntrySource
    ? 'url'
    : storedCreateEntrySource
      ? 'stored'
      : 'none';
  const createEntryPath = `${location.pathname}${location.search}`;

  const showToast = useCallback(
    (
      message: string,
      options: { tone?: 'info' | 'error'; durationMs?: number } = {}
    ) => {
      const normalized = message.trim();
      if (!normalized) return;
      const tone = options.tone || 'info';
      setToastText(normalized);
      setToastTone(tone);
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
      toastTimerRef.current = window.setTimeout(
        () => {
          setToastText('');
          toastTimerRef.current = null;
        },
        options.durationMs || (tone === 'error' ? 4200 : 1800)
      );
    },
    []
  );

  // Legacy page actions still report short-lived feedback through
  // setStatusText. Keep that call surface stable while routing it into the
  // single visible/live-region notification channel. Generation progress is
  // rendered separately by the task rail and must not be duplicated here.
  const setStatusText = useCallback(
    (message: string) => {
      if (!message.trim()) {
        if (toastTimerRef.current) {
          window.clearTimeout(toastTimerRef.current);
          toastTimerRef.current = null;
        }
        setToastText('');
        return;
      }
      showToast(message);
    },
    [showToast]
  );

  const setGenerationError = useCallback(
    (message: string) => {
      const normalized = message.trim();
      setError(message);
      if (!normalized) {
        if (toastTimerRef.current) {
          window.clearTimeout(toastTimerRef.current);
          toastTimerRef.current = null;
        }
        setToastText('');
        return;
      }
      showToast(normalized, { tone: 'error' });
    },
    [showToast]
  );

  useEffect(() => {
    if (!routeCreateEntrySource) return;
    writeStoredCreateEntrySource(routeCreateEntrySource);
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setStoredCreateEntrySource(routeCreateEntrySource);
    });
    return () => {
      cancelled = true;
    };
  }, [routeCreateEntrySource]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(
        AUTO_OPTIMIZE_PROMPT_STORAGE_KEY,
        autoOptimizePrompt ? '1' : '0'
      );
    } catch {
      // 自动优化偏好只影响下次默认值，持久化失败不影响生成。
    }
  }, [autoOptimizePrompt]);

  useEffect(() => {
    const viewKey = `${createEntryPath}|${createEntrySource}`;
    if (createEntryViewKeyRef.current === viewKey) return;
    createEntryViewKeyRef.current = viewKey;
    trackImageGenerationEvent('create_entry_view', {
      cta_source: createEntrySource,
      source_origin: createEntrySourceOrigin,
      entry_path: createEntryPath,
      locale: language,
      authenticated: hasApiAuth,
      referrer:
        typeof document !== 'undefined'
          ? document.referrer || undefined
          : undefined
    });
  }, [
    createEntryPath,
    createEntrySource,
    createEntrySourceOrigin,
    hasApiAuth,
    language
  ]);

  const navigateImageStudio = useCallback(
    (options: { replace?: boolean } = {}) => {
      navigate(`${createLocalePrefix}/image`, options);
    },
    [createLocalePrefix, navigate]
  );

  const buildPromptCaseShareUrl = useCallback(
    (caseItem: PromptCase) => {
      const caseLocalePrefix =
        caseItem.locale === 'zh-CN' || caseItem.locale === 'en-US'
          ? `/${caseItem.locale}`
          : '';
      const shareLocalePrefix =
        caseLocalePrefix || createLocalePrefix || `/${promptLocale}`;
      const path = caseItem.slug
        ? `${shareLocalePrefix}/prompts/${encodeURIComponent(caseItem.slug)}`
        : `${shareLocalePrefix}/create/prompts/share/${encodeURIComponent(
            caseItem.id
          )}`;
      const versionedPath = `${path}?card=${encodeURIComponent(
        PROMPT_CASE_SHARE_CARD_VERSION
      )}`;
      if (typeof window === 'undefined') return versionedPath;
      return withReferralParam(`${window.location.origin}${versionedPath}`);
    },
    [createLocalePrefix, promptLocale]
  );

  const clearSharedPromptCase = useCallback(() => {
    if (!sharedPromptCaseId) return;
    navigateImageStudio({ replace: true });
  }, [navigateImageStudio, sharedPromptCaseId]);

  const openDeepPaywall = useCallback(
    (kind: DeepFeaturePaywallKind, source: string, onContinue?: () => void) => {
      setDeepPaywall({ kind, source, onContinue });
    },
    []
  );

  const openCharacterPickerWithPaywall = useCallback(() => {
    if (membership.loading || membership.isMember) {
      setCharacterPickerOpen(true);
      return;
    }
    openDeepPaywall('characters', 'image_reference_character_picker', () =>
      setCharacterPickerOpen(true)
    );
  }, [membership.isMember, membership.loading, openDeepPaywall]);

  const handleImageCountChange = useCallback(
    (imageCount: number) => {
      if (imageCount >= 4 && !membership.isMember) {
        openDeepPaywall('workflow', 'image_batch_count');
        return;
      }
      routeImportUserEditVersionRef.current += 1;
      setSettings((current) =>
        normalizeCreatorSettings({
          ...current,
          imageCount
        })
      );
    },
    [membership.isMember, openDeepPaywall]
  );

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(async () => {
      if (cancelled) return;

      const routeParams = new URLSearchParams(location.search);
      const recreateKey = routeParams.get('recreateKey') || '';
      const discoveryRecreatePayload = recreateKey
        ? consumeDiscoveryRecreatePayload(recreateKey)
        : null;
      const shouldAutoGenerate = routeParams.get('autoGenerate') === '1';
      const routeState =
        typeof location.state === 'object' && location.state
          ? location.state
          : null;
      const routeRemixSource =
        routeState && 'remixSource' in routeState
          ? readRemixSource(routeState.remixSource)
          : null;
      const routeVisualRecipeSelection =
        routeState && 'visualRecipeSelection' in routeState
          ? normalizeVisualRecipeSelection({
              selection: routeState.visualRecipeSelection
            })
          : null;
      const routeOpenAssetSlot =
        routeState && 'openAssetSlot' in routeState
          ? readImagePromptSlot(routeState.openAssetSlot)
          : null;
      const workflowPrompt =
        routeState &&
        'workflowPrompt' in routeState &&
        typeof routeState.workflowPrompt === 'string'
          ? routeState.workflowPrompt
          : '';
      if (workflowPrompt.trim()) {
        setPromptMode('custom');
        setCustomPromptText(workflowPrompt.trim());
        setCustomNegativePromptText('');
        setIsPromptExpanded(true);
        setPromptEditorOpenSignal((value) => value + 1);
        setError('');
        setStatusText(
          language === 'en-US'
            ? 'ComfyUI prompt imported into the editor'
            : '已从 ComfyUI workflow 填入 Prompt'
        );
        navigate(location.pathname, { replace: true, state: null });
        return;
      }
      const referenceImageIds =
        routeState &&
        'referenceImageIds' in routeState &&
        Array.isArray(routeState.referenceImageIds)
          ? (routeState.referenceImageIds as unknown[]).filter(
              (id): id is string => typeof id === 'string' && Boolean(id.trim())
            )
          : (routeParams.get('referenceImageIds') || '')
              .split(',')
              .map((id) => id.trim())
              .filter(Boolean);
      if (referenceImageIds.length > 0) {
        setSelectedReferenceIds(referenceImageIds.slice(0, 4));
        const characterCardIds =
          routeState &&
          'characterCardIds' in routeState &&
          Array.isArray(routeState.characterCardIds)
            ? (routeState.characterCardIds as unknown[]).filter(
                (id): id is string =>
                  typeof id === 'string' && Boolean(id.trim())
              )
            : [];
        const routeCharacterGroups =
          routeState &&
          'characterReferenceGroups' in routeState &&
          Array.isArray(routeState.characterReferenceGroups)
            ? (routeState.characterReferenceGroups as ImageCharacterReferenceGroup[])
            : [];
        if (characterCardIds.length > 0) {
          setSelectedCharacterIds(characterCardIds.slice(0, 2));
        }
        if (routeCharacterGroups.length > 0) {
          setCharacterReferenceGroups(routeCharacterGroups.slice(0, 2));
        }
        setStatusText(
          characterCardIds.length > 0
            ? `已带入 ${Math.min(characterCardIds.length, 2)} 个角色和 ${Math.min(referenceImageIds.length, 4)} 张参考图`
            : `已带入 ${Math.min(referenceImageIds.length, 4)} 张参考图`
        );
      }
      const routeImageSize =
        routeState &&
        'imageSize' in routeState &&
        typeof routeState.imageSize === 'string'
          ? routeState.imageSize
          : routeParams.get('imageSize') || '';
      const routeModel =
        routeState &&
        'model' in routeState &&
        typeof routeState.model === 'string'
          ? routeState.model
          : routeParams.get('model') || '';
      const routeQuality =
        routeState &&
        'quality' in routeState &&
        typeof routeState.quality === 'string'
          ? routeState.quality
          : routeParams.get('quality') || '';
      const routeOutputFormat =
        routeState &&
        'outputFormat' in routeState &&
        typeof routeState.outputFormat === 'string'
          ? routeState.outputFormat
          : routeParams.get('outputFormat') || '';
      const routeAspectRatio =
        routeState &&
        'aspectRatio' in routeState &&
        typeof routeState.aspectRatio === 'string'
          ? routeState.aspectRatio
          : routeParams.get('aspectRatio') || routeParams.get('ratio') || '';
      const styleGridParam =
        routeState &&
        'styleGrid' in routeState &&
        typeof routeState.styleGrid === 'string'
          ? routeState.styleGrid
          : routeParams.get('styleGrid') || '';
      const styleGridAssets = styleGridParam
        ? await loadImagePromptAssetCatalog().catch((loadError) => {
            console.warn(
              '[ImageCreate] theme-card catalog unavailable; using core fallback:',
              loadError
            );
            return undefined;
          })
        : undefined;
      if (cancelled) return;
      const styleGridState = parsePromptStyleGridParam(
        styleGridParam,
        styleGridAssets
      );
      if (styleGridState) {
        const styleGridPrompt = buildPromptStyleGridPrompt(
          styleGridState.template.slug,
          styleGridState.assetIds,
          promptLocale,
          styleGridAssets
        );
        setPromptMode('custom');
        setCustomPromptText(styleGridPrompt);
        setCustomNegativePromptText('');
        setIsPromptExpanded(true);
        setPromptEditorOpenSignal((value) => value + 1);
        setSettings(
          normalizeCreatorSettings({
            ...settings,
            model:
              routeModel ||
              styleGridState.template.recommendedModel ||
              settings.model,
            imageSize:
              routeImageSize ||
              styleGridState.template.recommendedImageSize ||
              settings.imageSize,
            quality: routeQuality || settings.quality,
            outputFormat: routeOutputFormat || settings.outputFormat,
            aspectRatio:
              routeAspectRatio ||
              getAspectRatioForImageSize(
                routeImageSize || styleGridState.template.recommendedImageSize
              ) ||
              settings.aspectRatio
          })
        );
        setError('');
        setStatusText(
          language === 'en-US'
            ? 'Theme card imported into the editor'
            : '已从主题卡片填入 Prompt'
        );
        navigate(location.pathname, { replace: true, state: null });
        return;
      }
      const promptCasePrompt = discoveryRecreatePayload?.prompt
        ? discoveryRecreatePayload.prompt
        : routeState &&
            'promptCasePrompt' in routeState &&
            typeof routeState.promptCasePrompt === 'string'
          ? routeState.promptCasePrompt
          : routeParams.get('prompt') ||
            routeParams.get('promptCasePrompt') ||
            '';
      const routeCaseId =
        routeParams.get('caseId') || routeParams.get('case') || '';
      const routeCaseSlug =
        routeParams.get('caseSlug') || routeParams.get('slug') || '';
      const hasRouteSettings =
        Boolean(routeImageSize) ||
        Boolean(routeModel) ||
        Boolean(routeQuality) ||
        Boolean(routeOutputFormat) ||
        Boolean(routeAspectRatio);
      if (routeVisualRecipeSelection || routeOpenAssetSlot) {
        if (promptCasePrompt.trim()) {
          handleRecreatePromptCase(
            {
              prompt: promptCasePrompt,
              model: routeModel || undefined,
              imageSize: routeImageSize || undefined,
              quality: routeQuality || undefined,
              outputFormat: routeOutputFormat || undefined,
              aspectRatio: routeAspectRatio || undefined,
              remixSource: routeRemixSource || undefined,
              ...(routeVisualRecipeSelection
                ? { visualRecipeSelection: routeVisualRecipeSelection }
                : {}),
              ...(routeOpenAssetSlot
                ? { openAssetSlot: routeOpenAssetSlot }
                : {})
            },
            { scrollPromptIntoView: false }
          );
        } else {
          if (routeVisualRecipeSelection) {
            setReverseSession(null);
            setRandomRecipeAudit(null);
            setRecipeDraftSelection(routeVisualRecipeSelection);
            setWardrobeMaterials(defaultWardrobeMaterialSelection);
            setRecipeOpenSignal((value) => value + 1);
          }
          if (routeOpenAssetSlot) {
            setActiveSlot(routeOpenAssetSlot);
            setLibrarySource('public');
            if (!routeVisualRecipeSelection) {
              setRecipeOpenSignal((value) => value + 1);
            }
          }
          if (hasRouteSettings) {
            setSettings(
              normalizeCreatorSettings({
                ...settings,
                model: routeModel || settings.model,
                imageSize: routeImageSize || settings.imageSize,
                quality: routeQuality || settings.quality,
                outputFormat: routeOutputFormat || settings.outputFormat,
                aspectRatio:
                  routeAspectRatio ||
                  (routeImageSize
                    ? getAspectRatioForImageSize(routeImageSize)
                    : settings.aspectRatio)
              })
            );
          }
          setStatusText(
            language === 'en-US'
              ? 'Visual recipe ready. Apply it when you are done editing.'
              : '案例配方已载入，调整后点击「应用配方」'
          );
        }
        navigate(location.pathname, { replace: true, state: null });
        return;
      }
      if (!promptCasePrompt.trim() && (routeCaseId || routeCaseSlug)) {
        const lookup = routeCaseId || routeCaseSlug;
        const lookupMode = routeCaseId ? 'id' : 'slug';
        const source =
          routeParams.get('source') ||
          routeParams.get('refSource') ||
          'prompt_case_url';
        const editVersionAtImportStart = routeImportUserEditVersionRef.current;

        setStatusText(
          language === 'en-US'
            ? 'Importing prompt case data...'
            : '正在导入案例信息...'
        );
        resolvePromptCaseRouteImport({
          lookup,
          lookupMode,
          locale: promptLocale,
          source,
          getCase: getPublicPromptCase
        })
          .then((routeImportResult) => {
            if (cancelled) return;
            if (
              routeImportUserEditVersionRef.current !== editVersionAtImportStart
            ) {
              setStatusText(
                language === 'en-US'
                  ? 'Prompt case import skipped to keep your edits'
                  : '已跳过案例导入，保留你刚刚编辑的内容'
              );
              navigate(location.pathname, { replace: true, state: null });
              return;
            }
            if (routeImportResult.status !== 'ready') {
              setStatusText(
                language === 'en-US'
                  ? 'Prompt case could not be imported'
                  : '案例信息暂时无法导入'
              );
              navigate(location.pathname, { replace: true, state: null });
              return;
            }
            handleRecreatePromptCase(routeImportResult.payload, {
              scrollPromptIntoView: false
            });
            if (routeImportResult.payload.promptSource === 'preview') {
              setStatusText(
                language === 'en-US'
                  ? 'Imported the public prompt preview and visual recipe'
                  : '已导入公开 Prompt 预览和可视化配方'
              );
            }
            navigate(location.pathname, { replace: true, state: null });
          })
          .catch((error) => {
            if (cancelled) return;
            console.warn('[ImageCreate] prompt case import failed:', error);
            setStatusText(
              language === 'en-US'
                ? 'Prompt case import failed'
                : '案例 Prompt 导入失败'
            );
            navigate(location.pathname, { replace: true, state: null });
          });

        return;
      }
      if (hasRouteSettings && !promptCasePrompt.trim()) {
        const nextSettings = normalizeCreatorSettings({
          ...settings,
          model: routeModel || settings.model,
          imageSize: routeImageSize || settings.imageSize,
          quality: routeQuality || settings.quality,
          outputFormat: routeOutputFormat || settings.outputFormat,
          aspectRatio:
            routeAspectRatio ||
            (routeImageSize
              ? getAspectRatioForImageSize(routeImageSize)
              : settings.aspectRatio)
        });
        setSettings(nextSettings);
        navigate(location.pathname, { replace: true, state: null });
        return;
      }
      if (!promptCasePrompt.trim()) {
        if (
          referenceImageIds.length > 0 ||
          routeVisualRecipeSelection ||
          routeOpenAssetSlot
        ) {
          navigate(location.pathname, { replace: true, state: null });
        }
        return;
      }
      handleRecreatePromptCase(
        {
          prompt: promptCasePrompt,
          model: routeModel || undefined,
          imageSize: routeImageSize || undefined,
          quality: routeQuality || undefined,
          outputFormat: routeOutputFormat || undefined,
          aspectRatio: routeAspectRatio || undefined,
          remixSource: routeRemixSource || undefined
        },
        { scrollPromptIntoView: false }
      );
      if (shouldAutoGenerate) {
        setPendingRouteAutoGenerate({
          key: recreateKey || `route-${Date.now()}`,
          prompt: promptCasePrompt.trim()
        });
      }
      navigate(location.pathname, { replace: true, state: null });
    });
    return () => {
      cancelled = true;
    };
    // handleRecreatePromptCase intentionally stays out; it only writes local UI state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    language,
    location.pathname,
    location.search,
    location.state,
    navigate,
    promptLocale
  ]);

  useEffect(() => {
    if (authLoading || activePromptDraftOwnerId === promptDraftOwnerId) return;
    const params = new URLSearchParams(location.search);
    const hasRouteDraft = Boolean(
      params.get('prompt') ||
      params.get('promptCasePrompt') ||
      params.get('caseId') ||
      params.get('caseSlug') ||
      (location.state && typeof location.state === 'object')
    );
    const draft = loadPromptEditorDraft(promptDraftOwnerId);
    if (!hasRouteDraft) {
      setCustomPromptText(draft?.customPromptText || '');
      setCustomNegativePromptText(draft?.customNegativePromptText || '');
      setSettings(
        draft?.settings
          ? normalizeCreatorSettings({
              ...defaultImagePromptSettings,
              ...draft.settings
            })
          : defaultStudioImageSettings
      );
    }
    setActivePromptDraftOwnerId(promptDraftOwnerId);
  }, [
    activePromptDraftOwnerId,
    authLoading,
    location.search,
    location.state,
    promptDraftOwnerId
  ]);

  useEffect(() => {
    if (
      !promptEditorDraftLoadedRef.current ||
      authLoading ||
      activePromptDraftOwnerId !== promptDraftOwnerId
    )
      return;
    savePromptEditorDraft({
      ownerId: promptDraftOwnerId,
      promptMode: 'custom',
      customPromptText,
      customNegativePromptText,
      settings: {
        model: settings.model,
        imageSize: settings.imageSize,
        quality: settings.quality,
        outputFormat: settings.outputFormat,
        aspectRatio: settings.aspectRatio,
        imageCount: settings.imageCount
      },
      savedAt: Date.now()
    });
  }, [
    customPromptText,
    customNegativePromptText,
    settings.aspectRatio,
    settings.imageCount,
    settings.imageSize,
    settings.model,
    settings.outputFormat,
    settings.quality,
    promptDraftOwnerId,
    activePromptDraftOwnerId,
    authLoading
  ]);

  const getSlotLabel = useCallback(
    (slot: ImagePromptSlot): string => {
      return t(SLOT_LABEL_KEYS[slot], {
        defaultValue:
          imagePromptSlots.find((item) => item.id === slot)?.label || slot
      });
    },
    [t]
  );

  // URL 前缀同步：/zh-CN/create 或 /en-US/create 直达时强制对齐 i18n.language
  useEffect(() => {
    const pathname = location.pathname;
    let targetLang: 'zh-CN' | 'en-US' | null = null;
    if (pathname.startsWith('/en-US')) targetLang = 'en-US';
    else if (pathname === '/ai-image-generator') targetLang = 'en-US';
    else if (pathname.startsWith('/zh-CN')) targetLang = 'zh-CN';
    if (targetLang && language !== targetLang) {
      void changeLanguage(targetLang);
    }
  }, [location.pathname, language, changeLanguage]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('openCharacters') === '1') {
      queueMicrotask(() => setCharacterWorkflowOpen(true));
    }
    if (params.get('openGalleryReferences') === '1') {
      void openHistoryGallery('reference-picker');
    }
    if (params.get('openReferenceUpload') === '1') {
      if (authLoading) return;
      if (!hasApiAuth) {
        requestLogin('image_reference_upload');
        return;
      }
      window.setTimeout(() => referenceUploadInputRef.current?.click(), 0);
    }
    // openHistoryGallery is intentionally omitted so query-driven open only
    // runs when URL changes, not when auth/loading state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    authLoading,
    hasApiAuth,
    location.pathname,
    location.search,
    requestLogin
  ]);

  useEffect(() => {
    if (location.pathname === '/ai-image-generator') {
      return applySeo({
        title: 'AI Image Generator with Copy-Ready Prompts | WebToMind',
        description:
          'Generate AI images from prompts, reference images and reusable prompt cases in the WebToMind image creation studio.',
        canonical: 'https://webtomind.com/ai-image-generator',
        htmlLang: 'en'
      });
    }

    return applySeo({
      title: t('hero.title', 'WebToMind 图像创作台'),
      description: t('hero.description'),
      robots: 'noindex,nofollow',
      htmlLang: language === 'en-US' ? 'en' : 'zh-CN'
    });
  }, [location.pathname, t, language]);

  const persistUserLibraryRemote = useCallback(
    (
      nextPresets: CreatorPreset[],
      nextPromptLibrary: CustomPromptLibraryItem[]
    ) => {
      if (!hasApiAuth) return;
      void saveImageCreatorUserLibrary(
        toUserLibraryPayload(nextPresets, nextPromptLibrary)
      ).catch((caught) => {
        console.warn('[ImageCreate] user library sync failed:', caught);
      });
    },
    [hasApiAuth]
  );

  const persistPresets = useCallback(
    (
      nextPresets: CreatorPreset[],
      nextPromptLibrary: CustomPromptLibraryItem[] = promptLibrary
    ) => {
      savePresets(nextPresets);
      persistUserLibraryRemote(nextPresets, nextPromptLibrary);
    },
    [persistUserLibraryRemote, promptLibrary]
  );

  const persistPromptLibrary = useCallback(
    (
      nextPromptLibrary: CustomPromptLibraryItem[],
      nextPresets: CreatorPreset[] = presets
    ) => {
      savePromptLibrary(nextPromptLibrary);
      persistUserLibraryRemote(nextPresets, nextPromptLibrary);
    },
    [persistUserLibraryRemote, presets]
  );

  useEffect(() => {
    if (!hasApiAuth) {
      userLibrarySyncOwnerRef.current = null;
      return;
    }

    const ownerKey = user?.id || user?.email || 'authenticated';
    if (userLibrarySyncOwnerRef.current === ownerKey) return;
    userLibrarySyncOwnerRef.current = ownerKey;

    let cancelled = false;
    void (async () => {
      try {
        const remote = await getImageCreatorUserLibrary();
        if (cancelled) return;
        const mergedPresets = mergeCreatorPresets(
          loadPresets(),
          remote.presets
        );
        const mergedPromptLibrary = mergePromptLibraryItems(
          loadPromptLibrary(),
          remote.promptLibrary
        );
        setPresets(mergedPresets);
        setPromptLibrary(mergedPromptLibrary);
        savePresets(mergedPresets);
        savePromptLibrary(mergedPromptLibrary);
        await saveImageCreatorUserLibrary(
          toUserLibraryPayload(mergedPresets, mergedPromptLibrary)
        );
      } catch (caught) {
        console.warn('[ImageCreate] user library initial sync failed:', caught);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hasApiAuth, user?.email, user?.id]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  /**
   * 素材库领域:公开库 + 个人库的加载 / 合并 / 浏览筛选。
   * composer 态(activeSlot / selection)仍由页面持有,作为入参传入。
   */
  const library = useAssetLibrary({
    isAuthenticated: hasApiAuth,
    loadScope: promptCatalogLoadScope,
    activeSlot,
    setSelection: setManualSelection,
    setError
  });
  // 页面仍需直接消费的字段(大图选择器和上传流程共享同一素材筛选状态)
  const {
    librarySource,
    assetSource,
    assetLoadError,
    setUserAssets,
    setUserAssetsLoaded,
    userAssetsAsPromptAssets,
    mergedAssets,
    filteredAssets,
    slotTags,
    query,
    setQuery,
    activeTag,
    setActiveTag,
    setLibrarySource
  } = library;

  const composerAssets = useMemo<ImagePromptAsset[]>(() => {
    if (!reverseSession?.assets.length) return mergedAssets;
    return [...mergedAssets, ...reverseSession.assets];
  }, [mergedAssets, reverseSession]);

  useEffect(() => {
    setRecipeDraftSelection(selection);
  }, [selection]);

  const starterCasesRefreshKey = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get('newSession') === '1'
      ? `new-session:${location.key}`
      : 'current-session';
  }, [location.key, location.search]);

  const {
    cases: imageStudioStarterCases,
    loading: imageStudioStarterCasesLoading
  } = useImageStudioStarterCases({
    enabled: imageStudioV2Enabled,
    locale: promptLocale,
    refreshKey: starterCasesRefreshKey
  });

  const previewRecipeAssets = useMemo<ResolvedVisualRecipeAsset[]>(() => {
    if (!previewItem) return [];
    return resolveHistoryVisualRecipeAssets(previewItem, mergedAssets);
  }, [mergedAssets, previewItem]);

  /**
   * 个人素材"AI 缩略图"批量生成队列(单点 + 批量统一串行)。
   * 状态机、worker、缩略图风格表全部内聚到 useThumbnailQueue。
   */
  const queue = useThumbnailQueue({
    userAssetsAsPromptAssets,
    setUserAssets,
    promptLocale,
    setError,
    setStatusText
  });
  // progressTasks 需要这几项
  const { batchRunning, batchStats, currentProcessingAsset } = queue;

  const applyReverseSessionDraft = useCallback(
    (draft: ReverseSessionDraft) => {
      const sessionId = crypto.randomUUID();
      const sessionAssets = buildReverseSessionAssets(draft, sessionId);
      const nextSession: ReverseSession = {
        id: sessionId,
        thumbnailUrl: draft.thumbnailUrl,
        source: draft.source,
        sourcePrompt: draft.sourcePrompt,
        fullPrompt: draft.fullPrompt,
        negativePrompt: draft.negativePrompt,
        routeHint: draft.routeHint,
        assets: sessionAssets,
        imported: false
      };
      setReverseSession(nextSession);
      setReverseImportingAssetIds(new Set());
      if (sessionAssets.length > 0) {
        setRandomRecipeAudit(null);
        setWardrobeMaterials(defaultWardrobeMaterialSelection);
        setSelection((current) => {
          return sessionAssets.reduce(
            (nextSelection, asset) =>
              setImagePromptAssetSelection(nextSelection, asset),
            normalizeImagePromptSelection(current)
          );
        });
        setActiveSlot(sessionAssets[0].slot);
      }
      setPromptMode('custom');
      setCustomPromptText(draft.fullPrompt || '');
      setCustomNegativePromptText('');
      setStatusText(
        draft.ok
          ? '已完成图片反推，素材已临时套入当前配方'
          : '图片反推未完全成功，请检查临时素材后再导入'
      );
    },
    [setStatusText]
  );

  /**
   * 上传图片 → VLM 反推 → 多行确认入库流程的状态机(与 UploadReverseModal 配对)。
   * 保存成功后的跨域副作用(写回 userAssets / 自动选中 slot / 成功 toast)通过回调上抛。
   */
  const {
    uploadStage,
    uploadError,
    uploadDraft,
    promptImportOpen,
    promptImportText,
    setPromptImportText,
    handleOpenPromptImport,
    handleCancelPromptImport,
    handleSubmitPromptImport,
    handlePickUploadFile,
    updateUploadRow,
    removeUploadRow,
    addBlankUploadRow,
    handleSaveUploadDraft,
    handleCancelUploadDraft
  } = useAssetUpload({
    isAuthenticated: hasApiAuth,
    onRequireLogin: () => requestLogin('image_asset_upload_gate'),
    setUserAssets,
    setUserAssetsLoaded,
    setActiveSlot,
    setSelection: setManualSelection,
    setStatusText,
    onReverseSessionReady: applyReverseSessionDraft,
    promptLocale
  });

  useEffect(() => {
    setWardrobeMaterials((current) => {
      const normalized = normalizeWardrobeMaterialSelection(current, selection);
      return JSON.stringify(normalized) === JSON.stringify(current)
        ? current
        : normalized;
    });
  }, [selection]);

  const compiled = useMemo(
    () =>
      compileImagePrompt(
        selection,
        settings,
        composerAssets,
        promptLocale,
        wardrobeMaterials
      ),
    [composerAssets, selection, settings, promptLocale, wardrobeMaterials]
  );
  const recipeDraftCompiled = useMemo(
    () =>
      compileImagePrompt(
        recipeDraftSelection,
        settings,
        composerAssets,
        promptLocale,
        wardrobeMaterials
      ),
    [
      composerAssets,
      promptLocale,
      recipeDraftSelection,
      settings,
      wardrobeMaterials
    ]
  );

  const effectiveCompiled = useMemo(
    () =>
      reverseSession?.fullPrompt
        ? {
            ...compiled,
            prompt: reverseSession.fullPrompt,
            negativePrompt:
              reverseSession.negativePrompt || compiled.negativePrompt
          }
        : compiled,
    [compiled, reverseSession]
  );
  const selectionSignature = useMemo(
    () => JSON.stringify({ selection, wardrobeMaterials }),
    [selection, wardrobeMaterials]
  );
  const [appliedSelectionSignature, setAppliedSelectionSignature] =
    useState(selectionSignature);
  const hasUnappliedSelectionChanges =
    effectiveCompiled.selectedAssets.length > 0 &&
    selectionSignature !== appliedSelectionSignature;
  const generationRecipeAssetIds = useMemo(
    () =>
      imageStudioV2Enabled && conditioningMode === 'recipe'
        ? effectiveCompiled.selectedAssets.map((asset) => asset.id)
        : hasUnappliedSelectionChanges
          ? []
          : effectiveCompiled.selectedAssets.map((asset) => asset.id),
    [
      conditioningMode,
      effectiveCompiled.selectedAssets,
      hasUnappliedSelectionChanges,
      imageStudioV2Enabled
    ]
  );
  const recipeConditionedPrompt = useMemo(() => {
    if (conditioningMode !== 'recipe') return customPromptText;
    return buildRecipeConditionedPrompt({
      prompt: customPromptText,
      selection,
      assets: composerAssets,
      locale: promptLocale,
      getSlotLabel
    });
  }, [
    composerAssets,
    conditioningMode,
    customPromptText,
    getSlotLabel,
    promptLocale,
    selection
  ]);
  const generationRecipeAudit = useMemo(() => {
    if (generationRecipeAssetIds.length === 0) return undefined;
    if (
      randomRecipeAudit &&
      hasMatchingImagePromptRecipeSelection(
        randomRecipeAudit,
        generationRecipeAssetIds
      )
    ) {
      return randomRecipeAudit;
    }
    return buildManualImagePromptRecipeAudit(
      generationRecipeAssetIds,
      getImagePromptRecipeCompilerVersion(composerAssets)
    );
  }, [composerAssets, generationRecipeAssetIds, randomRecipeAudit]);

  useEffect(() => {
    if (
      customPromptText.trim() === effectiveCompiled.prompt.trim() &&
      selectionSignature !== appliedSelectionSignature
    ) {
      setAppliedSelectionSignature(selectionSignature);
    }
  }, [
    appliedSelectionSignature,
    customPromptText,
    effectiveCompiled.prompt,
    selectionSignature
  ]);

  const handleSelectedCharactersChange = useCallback(
    (characters: ImageCharacterCard[]) => {
      setCharacterReferenceGroups(
        characters.slice(0, 2).map((character, index) => ({
          characterCardId: character.id,
          label:
            index === 0
              ? `Character A - ${character.name}`
              : `Character B - ${character.name}`,
          description: character.description,
          referenceImageIds: character.referenceImageIds.slice(0, 3)
        }))
      );
    },
    []
  );

  const handleRandomPrompt = useCallback(() => {
    const nextPrompt = pickNextRandomImagePrompt(
      promptLocale,
      customPromptText
    );
    setPromptMode('custom');
    setCustomPromptText(nextPrompt);
    setPromptEditorOpenSignal((value) => value + 1);
  }, [customPromptText, promptLocale]);

  useEffect(() => {
    referenceUploadItemsRef.current = referenceUploadItems;
  }, [referenceUploadItems]);

  useEffect(() => {
    if (!hasApiAuth || selectedReferenceIds.length === 0) return;
    let cancelled = false;
    listImageReferences()
      .then((references) => {
        if (cancelled) return;
        setReferenceAssetsById((current) => {
          const next = { ...current };
          references.forEach((reference) => {
            next[reference.id] = reference;
          });
          return next;
        });
      })
      .catch(() => {
        // The selected IDs remain valid for generation; previews can fall back
        // to the source upload or gallery image when the library is unavailable.
      });
    return () => {
      cancelled = true;
    };
  }, [hasApiAuth, selectedReferenceIds]);

  useEffect(() => {
    return () => {
      referenceUploadItemsRef.current.forEach((item) => {
        URL.revokeObjectURL(item.previewUrl);
      });
    };
  }, []);

  const handleRemoveReferenceUpload = useCallback(
    (clientId: string) => {
      removedReferenceUploadIdsRef.current.add(clientId);
      setReferenceUploadItems((current) => {
        const item = current.find((entry) => entry.clientId === clientId);
        if (item) {
          URL.revokeObjectURL(item.previewUrl);
          if (item.referenceId) {
            setSelectedReferenceIds((ids) =>
              ids.filter((id) => id !== item.referenceId)
            );
          }
        }
        return current.filter((entry) => entry.clientId !== clientId);
      });
    },
    [setSelectedReferenceIds]
  );

  const handleOpenReferenceUpload = useCallback(() => {
    if (!hasApiAuth) {
      requestLogin('image_reference_upload');
      return;
    }
    referenceUploadInputRef.current?.click();
  }, [hasApiAuth, requestLogin]);

  const handleReferenceFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      if (!hasApiAuth) {
        requestLogin('image_reference_upload');
        return;
      }
      const activeUploadingCount = referenceUploadItems.filter(
        (item) => item.status === 'uploading'
      ).length;
      const remaining =
        MAX_IMAGE_REFERENCE_IDS -
        selectedReferenceIds.length -
        activeUploadingCount;
      if (remaining <= 0) {
        setError(
          t('references.maxImages', {
            count: MAX_IMAGE_REFERENCE_IDS
          }) as string
        );
        return;
      }
      const selectedFiles = files
        .filter((file) => file.type.startsWith('image/'))
        .slice(0, remaining);
      if (selectedFiles.length === 0) {
        setError(t('references.upload.invalidType') as string);
        return;
      }
      setError('');
      setStatusText(t('references.upload.uploading') as string);
      const uploadItems = selectedFiles.map((file, index) => ({
        clientId: createReferenceUploadClientId(),
        file,
        fileName: file.name || `clipboard-image-${index + 1}`,
        previewUrl: URL.createObjectURL(file)
      }));
      setReferenceUploadItems((current) => [
        ...current,
        ...uploadItems.map(({ clientId, fileName, previewUrl }) => ({
          clientId,
          fileName,
          previewUrl,
          status: 'uploading' as const
        }))
      ]);

      const results = await Promise.all(
        uploadItems.map(async (item) => {
          try {
            if (removedReferenceUploadIdsRef.current.has(item.clientId)) {
              return { status: 'removed' as const };
            }
            const imageBase64 = await fileToDataUrl(item.file);
            const reference = await uploadImageReference({
              imageBase64,
              mimeType: item.file.type || 'image/png',
              role: 'style',
              label: item.fileName.replace(/\.[^.]+$/, '').slice(0, 80)
            });
            setReferenceAssetsById((current) => ({
              ...current,
              [reference.id]: reference
            }));
            if (removedReferenceUploadIdsRef.current.has(item.clientId)) {
              return { status: 'removed' as const };
            }
            setReferenceUploadItems((current) =>
              current.map((entry) =>
                entry.clientId === item.clientId
                  ? (() => {
                      const nextPreviewUrl =
                        reference.thumbnailUrl || entry.previewUrl;
                      if (
                        nextPreviewUrl !== entry.previewUrl &&
                        entry.previewUrl.startsWith('blob:')
                      ) {
                        URL.revokeObjectURL(entry.previewUrl);
                      }
                      return {
                        ...entry,
                        referenceId: reference.id,
                        previewUrl: nextPreviewUrl,
                        status: 'uploaded' as const,
                        error: undefined
                      };
                    })()
                  : entry
              )
            );
            setSelectedReferenceIds((current) =>
              current.includes(reference.id)
                ? current
                : [...current, reference.id].slice(0, MAX_IMAGE_REFERENCE_IDS)
            );
            return { status: 'uploaded' as const };
          } catch (uploadError) {
            const message =
              uploadError instanceof Error
                ? uploadError.message
                : (t('references.upload.failed') as string);
            if (removedReferenceUploadIdsRef.current.has(item.clientId)) {
              return { status: 'removed' as const };
            }
            setReferenceUploadItems((current) =>
              current.map((entry) =>
                entry.clientId === item.clientId
                  ? { ...entry, status: 'failed' as const, error: message }
                  : entry
              )
            );
            return { status: 'failed' as const };
          }
        })
      );

      const uploadedCount = results.filter(
        (result) => result.status === 'uploaded'
      ).length;
      const failedCount = results.filter(
        (result) => result.status === 'failed'
      ).length;
      if (uploadedCount > 0) {
        void completeRewardTaskOnce(REWARD_TASK_IDENTIFIERS.useReferenceImage);
        setStatusText(
          t('references.upload.uploaded', {
            count: uploadedCount
          }) as string
        );
      } else {
        setStatusText('');
      }
      if (failedCount > 0) {
        setError(
          t('references.upload.failedWithCount', {
            count: failedCount
          }) as string
        );
      }
    },
    [
      hasApiAuth,
      requestLogin,
      referenceUploadItems,
      selectedReferenceIds.length,
      setError,
      setStatusText,
      t
    ]
  );

  const handlePickReferenceFiles = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.currentTarget.files || []);
      event.currentTarget.value = '';
      await handleReferenceFiles(files);
    },
    [handleReferenceFiles]
  );

  const promptReferenceMentions = useMemo<PromptReferenceMention[]>(() => {
    const mentions: PromptReferenceMention[] = [];
    const usedReferenceIds = new Set<string>();
    const characterReferenceIds = new Set(
      characterReferenceGroups.flatMap((group) => group.referenceImageIds)
    );
    const historyPreviewById = new Map(
      fullGenerationHistory.map((item) => [
        item.id,
        item.thumbnailUrl || item.previewUrl || item.imageUrl
      ])
    );
    const imageLabelPrefix = promptLocale === 'zh-CN' ? '图片' : 'Image';
    const galleryLabelPrefix = promptLocale === 'zh-CN' ? '图库' : 'Gallery';
    const characterLabelPrefix =
      promptLocale === 'zh-CN' ? '角色' : 'Character';
    const imageMentionCount = () =>
      mentions.filter((item) => item.kind !== 'character').length;

    const pushImageMention = (
      referenceId: string,
      label: string,
      kind: PromptReferenceMention['kind'],
      detail?: string,
      previewUrl?: string
    ) => {
      if (!referenceId || usedReferenceIds.has(referenceId)) return;
      const token = `image${imageMentionCount() + 1}`;
      mentions.push({
        id: referenceId,
        token,
        label,
        detail,
        previewUrl,
        kind
      });
      usedReferenceIds.add(referenceId);
    };

    referenceUploadItems.forEach((item) => {
      if (
        item.status !== 'uploaded' ||
        !item.referenceId ||
        !selectedReferenceIds.includes(item.referenceId)
      ) {
        return;
      }
      pushImageMention(
        item.referenceId,
        `${imageLabelPrefix} ${imageMentionCount() + 1}`,
        'image',
        item.fileName,
        item.previewUrl
      );
    });

    historyReferenceGenerationIds.forEach((generationId) => {
      const referenceId = historyReferenceAssetByGeneration[generationId];
      if (!referenceId || !selectedReferenceIds.includes(referenceId)) return;
      pushImageMention(
        referenceId,
        `${imageLabelPrefix} ${imageMentionCount() + 1}`,
        'gallery',
        galleryLabelPrefix,
        historyPreviewById.get(generationId) ||
          referenceAssetsById[referenceId]?.thumbnailUrl
      );
    });

    selectedReferenceIds.forEach((referenceId) => {
      if (characterReferenceIds.has(referenceId)) return;
      pushImageMention(
        referenceId,
        `${imageLabelPrefix} ${imageMentionCount() + 1}`,
        'image',
        promptLocale === 'zh-CN' ? '参考图' : 'Reference',
        referenceAssetsById[referenceId]?.thumbnailUrl
      );
    });

    characterReferenceGroups.forEach((group, index) => {
      const id =
        group.characterCardId ||
        group.referenceImageIds.join(',') ||
        `character-${index + 1}`;
      mentions.push({
        id,
        token: `character${index + 1}`,
        label: group.label || `${characterLabelPrefix} ${index + 1}`,
        detail: group.description || characterLabelPrefix,
        previewUrl:
          referenceAssetsById[group.referenceImageIds[0]]?.thumbnailUrl,
        kind: 'character'
      });
    });

    if (characterReferenceGroups.length === 0) {
      selectedCharacterIds.forEach((id, index) => {
        mentions.push({
          id,
          token: `character${index + 1}`,
          label: `${characterLabelPrefix} ${index + 1}`,
          detail: characterLabelPrefix,
          kind: 'character'
        });
      });
    }

    return mentions;
  }, [
    characterReferenceGroups,
    fullGenerationHistory,
    historyReferenceAssetByGeneration,
    historyReferenceGenerationIds,
    promptLocale,
    referenceAssetsById,
    referenceUploadItems,
    selectedCharacterIds,
    selectedReferenceIds
  ]);

  const hasUnsavedCreatorData = useMemo(() => {
    const hasMaterialSelection = imagePromptSlots.some(
      (slot) => getSelectedAssetIds(selection, slot.id).length > 0
    );
    const hasCustomPromptDraft = customPromptText.trim().length > 0;
    const hasReverseDraft =
      Boolean(reverseSession?.fullPrompt?.trim()) ||
      Boolean(reverseSession?.assets.length);

    return (
      hasMaterialSelection ||
      hasCustomPromptDraft ||
      hasReverseDraft ||
      selectedReferenceIds.length > 0 ||
      selectedCharacterIds.length > 0
    );
  }, [
    customPromptText,
    reverseSession,
    selectedCharacterIds.length,
    selectedReferenceIds.length,
    selection
  ]);

  useEffect(() => {
    if (!hasUnsavedCreatorData) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedCreatorData]);

  const moodboardReferenceIds = useMemo(() => {
    if (!activeMoodboard || conditioningMode !== 'moodboard') return [];
    return Array.from(
      new Set(
        [
          ...activeMoodboard.representativeAssetIds,
          ...(activeMoodboard.items || []).map(
            (item) => item.imageReferenceId || ''
          )
        ].filter(Boolean)
      )
    );
  }, [activeMoodboard, conditioningMode]);

  const effectiveReferenceIds = useMemo(
    () =>
      Array.from(new Set([...selectedReferenceIds, ...moodboardReferenceIds])),
    [moodboardReferenceIds, selectedReferenceIds]
  );

  const billingReferenceImageCount = useMemo(
    () =>
      mergeBillableImageReferenceIds(
        effectiveReferenceIds,
        characterReferenceGroups.flatMap((group) => group.referenceImageIds)
      ).length,
    [characterReferenceGroups, effectiveReferenceIds]
  );

  // 参考图按像素计费：尺寸与计费集合（去重 + 上限）保持一致，缺失尺寸的按张回退。
  const billingReferenceImageSizes = useMemo(
    () =>
      mergeBillableImageReferenceIds(
        effectiveReferenceIds,
        characterReferenceGroups.flatMap((group) => group.referenceImageIds)
      )
        .map((id) => referenceAssetsById[id])
        .filter(
          (asset): asset is ImageReferenceAsset =>
            Boolean(asset) && Boolean(asset.width) && Boolean(asset.height)
        )
        .map((asset) => ({
          width: asset.width as number,
          height: asset.height as number
        })),
    [characterReferenceGroups, effectiveReferenceIds, referenceAssetsById]
  );

  // 生成前积分预估 + 余额不足校验
  const {
    estimatedCost,
    unitCost,
    imageCount: estimatedImageCount,
    insufficientCredits,
    creditsBalance,
    creditsBalanceLoaded,
    creditShortfall
  } = useCreditsEstimate({
    isAuthenticated: hasApiAuth,
    settings,
    prompt: recipeConditionedPrompt,
    referenceImageCount: billingReferenceImageCount,
    referenceImageSizes: billingReferenceImageSizes,
    referenceMode:
      characterReferenceGroups.length > 0
        ? 'character_consistency'
        : effectiveReferenceIds.length > 0
          ? 'image_reference'
          : 'none'
  });

  const showLowBalanceTopUp = useMemo(
    () =>
      hasApiAuth &&
      creditsBalanceLoaded &&
      creditsBalance !== null &&
      estimatedCost > 0 &&
      !insufficientCredits &&
      creditsBalance < estimatedCost * LOW_BALANCE_TOP_UP_MULTIPLIER,
    [
      creditsBalance,
      creditsBalanceLoaded,
      estimatedCost,
      hasApiAuth,
      insufficientCredits
    ]
  );

  const lowBalanceUpsellKey = [
    settings.model,
    settings.imageSize,
    settings.quality,
    estimatedImageCount,
    estimatedCost,
    creditsBalance ?? 'unknown'
  ].join(':');

  const costPanelEventKey = [
    hasApiAuth ? 'auth' : 'guest',
    settings.model,
    settings.imageSize,
    settings.quality,
    selectedReferenceIds.length,
    characterReferenceGroups.length,
    estimatedImageCount,
    estimatedCost,
    creditsBalanceLoaded ? creditsBalance : 'loading'
  ].join(':');
  const lastCostPanelEventKeyRef = useRef('');

  useEffect(() => {
    if (lastCostPanelEventKeyRef.current === costPanelEventKey) return;
    lastCostPanelEventKeyRef.current = costPanelEventKey;
    trackImageGenerationEvent('cost_panel_view', {
      authenticated: hasApiAuth,
      model: settings.model,
      image_size: settings.imageSize,
      quality: settings.quality,
      image_count: estimatedImageCount,
      unit_credits: unitCost,
      estimated_credits: estimatedCost,
      credits_balance_loaded: creditsBalanceLoaded,
      credits_balance: creditsBalance,
      insufficient_credits: insufficientCredits,
      credit_shortfall: creditShortfall
    });
  }, [
    costPanelEventKey,
    creditShortfall,
    creditsBalance,
    creditsBalanceLoaded,
    estimatedCost,
    estimatedImageCount,
    hasApiAuth,
    insufficientCredits,
    settings.imageSize,
    settings.model,
    settings.quality,
    unitCost
  ]);

  useEffect(() => {
    if (!showLowBalanceTopUp) return;
    if (lowBalanceUpsellViewKeyRef.current === lowBalanceUpsellKey) return;
    lowBalanceUpsellViewKeyRef.current = lowBalanceUpsellKey;
    trackImageGenerationEvent('low_balance_upsell_view', {
      model: settings.model,
      image_size: settings.imageSize,
      quality: settings.quality,
      image_count: estimatedImageCount,
      unit_credits: unitCost,
      estimated_credits: estimatedCost,
      credits_balance: creditsBalance,
      balance_to_cost_ratio:
        creditsBalance !== null && estimatedCost > 0
          ? creditsBalance / estimatedCost
          : undefined
    });
  }, [
    creditsBalance,
    estimatedCost,
    estimatedImageCount,
    lowBalanceUpsellKey,
    settings.imageSize,
    settings.model,
    settings.quality,
    showLowBalanceTopUp,
    unitCost
  ]);

  const openUpgradePrompt = useCallback(
    (message?: string) => {
      setUpgradePromptMessage(message || (t('upgrade.description') as string));
      setUpgradePromptOpen(true);
    },
    [t]
  );

  const handleLowBalanceTopUp = useCallback(() => {
    trackImageGenerationEvent('low_balance_upsell_click', {
      model: settings.model,
      image_size: settings.imageSize,
      quality: settings.quality,
      image_count: estimatedImageCount,
      unit_credits: unitCost,
      estimated_credits: estimatedCost,
      credits_balance: creditsBalance,
      balance_to_cost_ratio:
        creditsBalance !== null && estimatedCost > 0
          ? creditsBalance / estimatedCost
          : undefined
    });
    const returnTo = `${location.pathname}${location.search}${location.hash}`;
    navigate(
      `${createLocalePrefix}/create/pricing?source=low_balance&returnTo=${encodeURIComponent(returnTo)}`,
      {
        state: { returnTo }
      }
    );
  }, [
    createLocalePrefix,
    creditsBalance,
    estimatedCost,
    estimatedImageCount,
    location.hash,
    location.pathname,
    location.search,
    navigate,
    settings.imageSize,
    settings.model,
    settings.quality,
    unitCost
  ]);

  const persistCreationTurn = useCallback(
    async (input: {
      taskId?: string;
      request: VisualImageGenerationRequest;
      result?: VisualImageGenerationResult;
      errorMessage?: string;
    }) => {
      const sessionId = input.request.creationContext?.sessionId;
      if (!sessionId) return;
      const generationIds = (input.result?.images || [])
        .map((image) => image.generationId)
        .filter((id): id is string => Boolean(id));
      const requested =
        input.result?.requestedImageCount || input.request.imageCount || 1;
      const actual = input.result?.actualImageCount || generationIds.length;
      const turn = await createImageSessionTurn(sessionId, {
        taskId: input.taskId,
        prompt: input.request.prompt,
        negativePrompt: input.request.negativePrompt,
        status: input.errorMessage
          ? 'failed'
          : actual < requested
            ? 'partial'
            : 'succeeded',
        context: input.request.creationContext,
        generationIds,
        errorMessage: input.errorMessage
      });
      setSessionTurns((current) =>
        current.some((item) => item.id === turn.id)
          ? current.map((item) => (item.id === turn.id ? turn : item))
          : [...current, turn]
      );
      window.dispatchEvent(new CustomEvent('image-session-changed'));
    },
    []
  );

  useEffect(() => {
    if (!imageStudioV2Enabled || !activeSessionId || !hasApiAuth) {
      setSessionTurns([]);
      return;
    }
    let cancelled = false;
    listImageSessionTurns(activeSessionId)
      .then((turns) => {
        if (!cancelled) setSessionTurns(turns);
      })
      .catch((sessionError) => {
        if (!cancelled) {
          console.warn('[ImageCreate] load session turns failed', sessionError);
          setSessionTurns([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeSessionId, hasApiAuth, imageStudioV2Enabled]);

  const handleGenerationSuccess = useCallback(
    (params: {
      result: VisualImageGenerationResult;
      request: VisualImageGenerationRequest;
      taskId?: string;
    }) => {
      const isFirstSuccess = firstSuccessEligibleRef.current;
      firstSuccessEligibleRef.current = false;
      const generationIds = params.result.images
        .map((image) => image.generationId)
        .filter((id): id is string => Boolean(id));
      if (generationIds.length === 0 && params.result.generationId) {
        generationIds.push(params.result.generationId);
      }
      if (isFirstSuccess && generationIds.length > 0 && journeyEnabled) {
        setFirstCreationMilestone({
          generationIds,
          rewardStatus: 'pending'
        });
      }
      void completeRewardTaskOnce(
        REWARD_TASK_IDENTIFIERS.generateFirstCommercialImage
      ).then((rewardGranted) => {
        if (!isFirstSuccess || generationIds.length === 0 || !journeyEnabled) {
          return;
        }
        setFirstCreationMilestone({
          generationIds,
          rewardStatus: rewardGranted ? 'granted' : 'unavailable'
        });
        if (rewardGranted) activationRefresh();
      });
      const sessionId = params.request.creationContext?.sessionId;
      const firstImage = params.result.images[0];
      const coverGenerationId =
        firstImage?.generationId || params.result.generationId || undefined;
      const coverImageUrl = firstImage
        ? getVisualImageDisplayUrl(firstImage, 'thumbnail') || undefined
        : params.result.imageUrl || undefined;
      if (isFirstSuccess && coverGenerationId) {
        firstMilestoneItemRef.current = {
          id: coverGenerationId,
          imageUrl: coverImageUrl || params.result.imageUrl || '',
          prompt: params.request.prompt || ''
        };
      }
      if (sessionId && (coverGenerationId || coverImageUrl)) {
        updateCachedImageCreationSessionCover(promptDraftOwnerId, sessionId, {
          coverGenerationId,
          coverImageUrl
        });
        window.dispatchEvent(
          new CustomEvent('image-session-changed', {
            detail: { refresh: false }
          })
        );
      }
      void persistCreationTurn(params).catch((turnError) => {
        console.warn('[ImageCreate] persist creation turn failed', turnError);
      });
    },
    [activationRefresh, journeyEnabled, persistCreationTurn, promptDraftOwnerId]
  );

  const handleGenerationFailure = useCallback(
    (params: {
      message: string;
      request: VisualImageGenerationRequest;
      taskId?: string;
    }) => {
      void persistCreationTurn({
        taskId: params.taskId,
        request: params.request,
        errorMessage: params.message
      }).catch((turnError) => {
        console.warn(
          '[ImageCreate] persist failed creation turn failed',
          turnError
        );
      });
    },
    [persistCreationTurn]
  );

  const ensureCreationSession = useCallback(async (): Promise<string> => {
    if (activeSessionId) return activeSessionId;
    if (activeSessionPromiseRef.current) return activeSessionPromiseRef.current;
    const promise = createImageSession(recipeConditionedPrompt)
      .then((session) => {
        upsertCachedImageCreationSession(promptDraftOwnerId, session);
        setActiveSessionId(session.id);
        const params = new URLSearchParams(location.search);
        params.delete('newSession');
        params.delete('autoGenerate');
        params.delete('recreateKey');
        if (params.get('source') === 'discovery_recreate') {
          params.delete('source');
        }
        params.set('sessionId', session.id);
        navigate(`${location.pathname}?${params.toString()}`, {
          replace: true
        });
        window.dispatchEvent(new CustomEvent('image-session-changed'));
        return session.id;
      })
      .finally(() => {
        activeSessionPromiseRef.current = null;
      });
    activeSessionPromiseRef.current = promise;
    return promise;
  }, [
    activeSessionId,
    location.pathname,
    location.search,
    navigate,
    promptDraftOwnerId,
    recipeConditionedPrompt
  ]);

  const creationContext = useMemo<ImageCreationContext>(() => {
    const moodboard =
      imageStudioV2Enabled &&
      conditioningMode === 'moodboard' &&
      activeMoodboard
        ? toMoodboardConditioning(activeMoodboard)
        : undefined;
    const conversionAttribution = isSeoPromptUseSource(createEntrySource)
      ? readSeoConversionAttribution({ source: createEntrySource })
      : undefined;
    return {
      ...(imageStudioV2Enabled && activeSessionId
        ? { sessionId: activeSessionId }
        : {}),
      ...(moodboard ? { moodboard } : {}),
      ...(conditioningMode === 'recipe'
        ? { recipeId: committedRecipeId || 'custom-visual-recipe' }
        : {}),
      ...(conversionAttribution ? { conversionAttribution } : {}),
      referenceAssetIds: effectiveReferenceIds
    };
  }, [
    activeMoodboard,
    activeSessionId,
    committedRecipeId,
    conditioningMode,
    createEntrySource,
    effectiveReferenceIds,
    imageStudioV2Enabled
  ]);

  /**
   * 视觉图片生成:提交 + 结果态 + 历史列表。
   * compiled / settings / promptMode / customPromptText 由 composer 态传入。
   */
  const {
    generationQueue,
    setResultImageUrl,
    setResultImageUrls,
    generationHistory,
    generationHistoryTotal,
    generationHistoryLoaded,
    updateGenerationHistoryItem,
    activeGenerationId,
    setActiveGenerationId,
    handleGenerate,
    enqueueGenerationRequests,
    cancelQueuedGeneration,
    cancelServerQueuedGeneration,
    cancelRunningGeneration,
    cancelServerRunningGeneration,
    retryGenerationTask,
    retryServerGenerationTask,
    dismissGenerationTask,
    deleteGenerationTask,
    deleteServerGenerationTask,
    deleteGenerationFromHistory
  } = useImageGeneration({
    isAuthenticated: hasApiAuth,
    onRequireLogin: () => requestLogin('image_generate_gate'),
    settings,
    promptMode: 'custom',
    customPromptText,
    customNegativePromptText: '',
    selectedReferenceIds: effectiveReferenceIds,
    selectedCharacterCardIds: selectedCharacterIds,
    characterReferenceGroups,
    compiled: effectiveCompiled,
    recipeAssetIds: generationRecipeAssetIds,
    recipeAudit: generationRecipeAudit,
    creationContext,
    setError: setGenerationError,
    setStatusText,
    trackingSource: createEntrySource,
    trackingEntryPath: createEntryPath,
    onCreditBlocked: openUpgradePrompt,
    onGenerationSuccess: handleGenerationSuccess,
    onGenerationFailure: handleGenerationFailure
  });

  const loadVideoGenerationHistory = useCallback(async () => {
    if (!hasApiAuth) {
      setVideoGenerationHistory([]);
      return;
    }
    try {
      const result = await getVisualVideoHistoryResult({ limit: 24 });
      setVideoGenerationHistory(result.items);
    } catch {
      setVideoGenerationHistory([]);
    }
  }, [hasApiAuth]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => {
      void loadVideoGenerationHistory();
    }, 0);
    window.addEventListener(
      'visual-generation-history-changed',
      loadVideoGenerationHistory
    );
    return () => {
      window.clearTimeout(initialLoad);
      window.removeEventListener(
        'visual-generation-history-changed',
        loadVideoGenerationHistory
      );
    };
  }, [loadVideoGenerationHistory]);
  const imageTaskCenter = useImageTaskCenter({ enabled: hasApiAuth });
  const {
    tasks: imageTaskCenterTasks,
    removeTask: removeImageTaskFromCenter,
    dismissTask: dismissImageTaskFromCenter,
    refresh: refreshImageTaskCenter
  } = imageTaskCenter;

  const executeGenerateRequest = useCallback(
    async (creationContextOverride?: ImageCreationContext) => {
      setConsistencyResult(null);
      if (!autoOptimizePrompt) {
        const promptToGenerate = recipeConditionedPrompt.trim();
        await handleGenerate({
          promptOverride: translatePromptReferenceMentions(
            promptToGenerate,
            promptReferenceMentions,
            promptLocale
          ),
          negativePromptOverride: '',
          creationContextOverride
        });
        return;
      }

      const promptToOptimize = recipeConditionedPrompt.trim();
      if (!promptToOptimize) {
        await handleGenerate({
          negativePromptOverride: '',
          creationContextOverride
        });
        return;
      }

      const diagnostics = analyzeImagePromptStructure({
        prompt: promptToOptimize,
        negativePrompt: '',
        promptMode: 'custom',
        selectedAssets: effectiveCompiled.selectedAssets,
        locale: promptLocale
      });
      setPromptOptimizingBeforeGenerate(true);
      setStatusText(t('prompt.autoOptimize.status') as string);
      try {
        const translatedPromptToOptimize = translatePromptReferenceMentions(
          promptToOptimize,
          promptReferenceMentions,
          promptLocale
        );
        const optimized = await optimizeImagePrompt({
          prompt: translatedPromptToOptimize,
          negativePrompt: '',
          promptMode: 'custom',
          locale: promptLocale,
          aiTasteScore: diagnostics.aiTasteScore,
          aiTasteLevel: diagnostics.aiTasteLevel,
          selectedAssets: effectiveCompiled.selectedAssets.map((asset) => ({
            id: asset.id,
            slot: asset.slot,
            title: asset.title,
            prompt: asset.prompt,
            promptZh: asset.promptZh
          })),
          diagnostics: diagnostics.items.filter(
            (item) => item.id !== 'structure-ok'
          )
        });
        setPromptMode('custom');
        setCustomPromptText(optimized.optimizedPrompt);
        setCustomNegativePromptText('');
        await handleGenerate({
          promptOverride: optimized.optimizedPrompt,
          negativePromptOverride: '',
          creationContextOverride
        });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : (t('prompt.autoOptimize.error') as string);
        setError(`${t('prompt.autoOptimize.error')}: ${message}`);
        setStatusText('');
      } finally {
        setPromptOptimizingBeforeGenerate(false);
      }
    },
    [
      autoOptimizePrompt,
      effectiveCompiled.selectedAssets,
      handleGenerate,
      promptReferenceMentions,
      promptLocale,
      recipeConditionedPrompt,
      setStatusText,
      t
    ]
  );

  const handleGenerateRequest = useCallback(async () => {
    if (runtimeGenerationDisabled) {
      setGenerationError(
        runtimeModelsLoaded
          ? '当前没有可用的图像模型，请稍后重试。'
          : '正在检查图像模型状态，请稍候。'
      );
      return;
    }
    trackImageGenerationEvent('generate_click', {
      cta_source: createEntrySource,
      source_origin: createEntrySourceOrigin,
      entry_path: createEntryPath,
      authenticated: hasApiAuth,
      blocked_reason: !hasApiAuth
        ? 'login_required'
        : insufficientCredits
          ? 'insufficient_credits'
          : undefined,
      model: settings.model,
      prompt_mode: 'custom',
      image_size: settings.imageSize,
      quality: settings.quality,
      output_format: settings.outputFormat,
      asset_count: 0,
      reference_count: effectiveReferenceIds.length,
      character_card_count: selectedCharacterIds.length,
      estimated_credits: estimatedCost,
      credits_balance: creditsBalance
    });
    if (
      journeyEnabled &&
      activation.activated &&
      effectiveReferenceIds.length === 0 &&
      selectedCharacterIds.length === 0 &&
      !hasSeenActivationTeachingHint('reference') &&
      !referenceHintShownRef.current &&
      recordActivationTeachingHintShown('reference')
    ) {
      referenceHintShownRef.current = true;
      setTeachingHint('reference');
    }
    const gateDecision = getImageGenerateGateDecision({
      hasApiAuth,
      imageCount: settings.imageCount,
      isMember: membership.isMember,
      insufficientCredits
    });
    if (gateDecision === 'login_required') {
      requestLogin('image_generate_gate');
      return;
    }
    if (gateDecision === 'membership_required') {
      openDeepPaywall('workflow', 'image_batch_count');
      return;
    }
    if (gateDecision === 'insufficient_credits') {
      trackImageGenerationEvent('credit_blocked', {
        cta_source: createEntrySource,
        source_origin: createEntrySourceOrigin,
        entry_path: createEntryPath,
        model: settings.model,
        image_size: settings.imageSize,
        quality: settings.quality,
        image_count: estimatedImageCount,
        unit_credits: unitCost,
        estimated_credits: estimatedCost,
        credits_balance: creditsBalance,
        credit_shortfall: creditShortfall
      });
      openUpgradePrompt(
        t('upgrade.insufficientMessage', {
          credits: estimatedCost,
          balance: creditsBalance ?? 0
        }) as string
      );
      return;
    }
    setPendingSessionSubmission({
      key: `client-submission-${Date.now()}`,
      prompt: recipeConditionedPrompt.trim(),
      modelLabel: settings.model,
      aspectRatio: settings.aspectRatio,
      imageCount: settings.imageCount,
      label: t('progress.detailSubmitted') as string,
      status: 'queued',
      detail: t('progress.detailSubmitted') as string
    });
    try {
      const sessionId = await ensureCreationSession();
      submissionScrollRef.current = true;
      await executeGenerateRequest({ ...creationContext, sessionId });
      setCustomPromptText('');
      setStarterCasePreviewPrompt(null);
    } catch (sessionError) {
      setGenerationError(
        sessionError instanceof Error
          ? sessionError.message
          : '创作会话创建失败'
      );
    } finally {
      setPendingSessionSubmission(null);
    }
  }, [
    creditsBalance,
    creditShortfall,
    createEntryPath,
    createEntrySource,
    createEntrySourceOrigin,
    estimatedCost,
    estimatedImageCount,
    ensureCreationSession,
    executeGenerateRequest,
    hasApiAuth,
    insufficientCredits,
    journeyEnabled,
    activation.activated,
    membership.isMember,
    requestLogin,
    openDeepPaywall,
    openUpgradePrompt,
    setGenerationError,
    creationContext,
    recipeConditionedPrompt,
    runtimeGenerationDisabled,
    runtimeModelsLoaded,
    selectedCharacterIds.length,
    effectiveReferenceIds.length,
    settings.imageSize,
    settings.aspectRatio,
    settings.imageCount,
    settings.model,
    settings.outputFormat,
    settings.quality,
    t,
    unitCost
  ]);

  useEffect(() => {
    if (!pendingRouteAutoGenerate) return;
    if (!runtimeModelsLoaded) return;
    if (customPromptText.trim() !== pendingRouteAutoGenerate.prompt) return;
    if (consumedRouteAutoGenerateRef.current === pendingRouteAutoGenerate.key) {
      return;
    }
    consumedRouteAutoGenerateRef.current = pendingRouteAutoGenerate.key;
    setPendingRouteAutoGenerate(null);
    void handleGenerateRequest();
  }, [
    customPromptText,
    handleGenerateRequest,
    pendingRouteAutoGenerate,
    runtimeModelsLoaded
  ]);

  const clearMoodboardContext = useCallback(() => {
    setActiveMoodboard(null);
    setConditioningMode((current) =>
      current === 'moodboard' ? 'none' : current
    );
    const params = new URLSearchParams(location.search);
    params.delete('moodboardId');
    params.delete('shareToken');
    navigate(
      `${location.pathname}${params.size > 0 ? `?${params.toString()}` : ''}`,
      { replace: true }
    );
  }, [location.pathname, location.search, navigate]);

  const activateRecipeConditioning = useCallback(
    (slot = activeSlot) => {
      requestPromptCatalogSlot(slot);
      if (conditioningMode === 'moodboard' || activeMoodboard) {
        clearMoodboardContext();
      }
      setConditioningMode('recipe');
    },
    [
      activeMoodboard,
      activeSlot,
      clearMoodboardContext,
      conditioningMode,
      requestPromptCatalogSlot
    ]
  );

  const handleSelectMoodboard = useCallback(
    (moodboard: VisualMoodboard) => {
      setReverseSession(null);
      setSelection(defaultImagePromptSelection);
      setRandomRecipeAudit(null);
      setCommittedRecipeId('');
      setStarterCasePreviewPrompt(null);
      setActiveMoodboard(moodboard);
      setConditioningMode('moodboard');
      const params = new URLSearchParams(location.search);
      params.set('moodboardId', moodboard.id);
      params.delete('shareToken');
      navigate(`${location.pathname}?${params.toString()}`, { replace: true });
    },
    [location.pathname, location.search, navigate]
  );

  const handleSelectAsset = (asset: ImagePromptAsset) => {
    activateRecipeConditioning(asset.slot);
    setReverseSession(null);
    setRandomRecipeAudit(null);
    setCommittedRecipeId('custom-visual-recipe');
    setSelection((current) => toggleImagePromptAssetSelection(current, asset));
  };

  const handleSelectRecipeDraftAsset = (asset: ImagePromptAsset) => {
    requestPromptCatalogSlot(asset.slot);
    setRecipeDraftSelection((current) =>
      toggleImagePromptAssetSelection(current, asset)
    );
  };

  const handleClearRecipeDraft = () => {
    setRecipeDraftSelection(defaultImagePromptSelection);
  };

  const handleClearSlot = (slot: ImagePromptSlot) => {
    setReverseSession(null);
    setRandomRecipeAudit(null);
    setSelection((current) => clearImagePromptSelectionSlot(current, slot));
    setWardrobeMaterials((current) => {
      if (!(slot in current)) return current;
      const next = { ...current };
      delete next[slot as WardrobeMaterialSlot];
      return next;
    });
  };

  const handleClearSelection = () => {
    setReverseSession(null);
    setRandomRecipeAudit(null);
    setCommittedRecipeId('');
    setConditioningMode((current) => (current === 'recipe' ? 'none' : current));
    setSelection(defaultImagePromptSelection);
    setWardrobeMaterials(defaultWardrobeMaterialSelection);
  };

  const handleStudioPromptChange = useCallback(
    (value: string) => {
      routeImportUserEditVersionRef.current += 1;
      setStarterCasePreviewPrompt(null);
      setPromptMode('custom');

      if (shouldDetachRecipeForPromptEdit(conditioningMode)) {
        setRandomRecipeAudit(null);
        setCommittedRecipeId('');
        setSelection(defaultImagePromptSelection);
        setConditioningMode('none');
      }

      setCustomPromptText(value);
    },
    [conditioningMode]
  );

  const handleSkillModeChange = useCallback((modeId: string) => {
    setActiveSkillModeId(modeId);
    setSkillActive(true);
    setError('');
  }, []);

  const handleExitSkillMode = useCallback(() => {
    skillAbortRef.current?.abort();
    setSkillActive(false);
    setError('');
  }, []);

  const handleSkillGenerate = useCallback(async () => {
    if (!SKILL_IMAGE_CREATION_ENABLED) return;
    const prompt = (
      starterCasePreviewPrompt ??
      recipeConditionedPrompt ??
      ''
    ).trim();
    if (!prompt || skillGenerating) return;

    setSkillGenerating(true);
    setError('');

    const abort = new AbortController();
    skillAbortRef.current = abort;
    // 与普通对话一致：先创建/复用图像创作会话，出图任务挂到该 session。
    const sessionId = await ensureCreationSession().catch(() => undefined);
    let skillGenerationIds: string[] = [];
    let skillTaskId: string | undefined;
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/agent/skill-image-chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAuthToken() || ''}`
        },
        signal: abort.signal,
        body: JSON.stringify({
          prompt,
          skillId: PORTRAIT_SKILL_ID,
          mode: activeSkillModeId || undefined,
          aspectRatio:
            settings.aspectRatio && settings.aspectRatio !== 'auto'
              ? settings.aspectRatio
              : undefined,
          imageSize:
            settings.imageSize && settings.imageSize !== 'auto'
              ? settings.imageSize
              : undefined,
          referenceImageIds:
            selectedReferenceIds.length > 0 ? selectedReferenceIds : undefined,
          characterCardIds:
            selectedCharacterIds.length > 0 ? selectedCharacterIds : undefined,
          characterReferenceGroups:
            characterReferenceGroups.length > 0
              ? characterReferenceGroups
              : undefined,
          referenceMode:
            characterReferenceGroups.length > 0 || selectedCharacterIds.length > 0
              ? 'character_consistency'
              : selectedReferenceIds.length > 0
                ? 'image_reference'
                : undefined,
          context: sessionId
            ? { sessionId, referenceAssetIds: effectiveReferenceIds }
            : undefined
        })
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(body?.error || `请求失败（HTTP ${res.status}）`);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setError('无法读取流式响应');
        return;
      }
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const { events, rest } = parseSkillSseBuffer(buffer);
        buffer = rest;
        for (const event of events) {
          if (event.event === 'tool_result') {
            const { taskId, generationIds } = extractSkillToolResult(
              event.data.result
            );
            if (taskId) skillTaskId = taskId;
            const ids = generationIds;
            if (ids.length > 0) {
              skillGenerationIds = [...skillGenerationIds, ...ids];
            }
          } else if (event.event === 'error') {
            setError(event.data.message);
          }
        }
      }

      // 与普通对话一致：生成成功后记录 session turn（含 generationId），刷新会话列表。
      if (sessionId && skillGenerationIds.length > 0) {
        try {
          const turn = await createImageSessionTurn(sessionId, {
            taskId: skillTaskId,
            prompt,
            status: 'succeeded',
            context: { sessionId, referenceAssetIds: effectiveReferenceIds },
            generationIds: skillGenerationIds
          });
          setSessionTurns((current) =>
            current.some((item) => item.id === turn.id)
              ? current.map((item) => (item.id === turn.id ? turn : item))
              : [...current, turn]
          );
          window.dispatchEvent(new CustomEvent('image-session-changed'));
        } catch (error) {
          console.warn('[SkillImageChat] persist session turn failed:', error);
        }
      }
    } catch (error) {
      if (!abort.signal.aborted) {
        setError(error instanceof Error ? error.message : String(error));
      }
    } finally {
      setSkillGenerating(false);
      skillAbortRef.current = null;
    }
  }, [
    activeSkillModeId,
    characterReferenceGroups,
    effectiveReferenceIds,
    ensureCreationSession,
    recipeConditionedPrompt,
    selectedCharacterIds,
    selectedReferenceIds,
    settings,
    skillGenerating,
    starterCasePreviewPrompt
  ]);

  const handleMentionStudioReference = useCallback(
    (mention: PromptReferenceMention) => {
      const sourcePrompt =
        starterCasePreviewPrompt ?? recipeConditionedPrompt ?? '';
      const token = `@${mention.token}`;
      const pattern = new RegExp(
        `${escapePromptReferenceRegExp(token)}(?=$|\\s|[,.!?;:，。！？；：、)])`,
        'i'
      );
      if (pattern.test(sourcePrompt)) return;
      handleStudioPromptChange(
        `${sourcePrompt.trimEnd()}${sourcePrompt.trim() ? '\n' : ''}${token} `
      );
    },
    [
      handleStudioPromptChange,
      recipeConditionedPrompt,
      starterCasePreviewPrompt
    ]
  );

  const handleRemoveStudioReference = useCallback(
    (mention: PromptReferenceMention) => {
      const uploadItem = referenceUploadItems.find(
        (item) => item.referenceId === mention.id
      );
      if (uploadItem) {
        handleRemoveReferenceUpload(uploadItem.clientId);
      } else if (mention.kind === 'character') {
        const removedGroup = characterReferenceGroups.find(
          (group) =>
            group.characterCardId === mention.id ||
            group.referenceImageIds.join(',') === mention.id
        );
        setSelectedCharacterIds((current) =>
          current.filter((id) => id !== mention.id)
        );
        setCharacterReferenceGroups((current) =>
          current.filter(
            (group) =>
              group.characterCardId !== mention.id &&
              group.referenceImageIds.join(',') !== mention.id
          )
        );
        if (removedGroup) {
          setSelectedReferenceIds((current) =>
            current.filter((id) => !removedGroup.referenceImageIds.includes(id))
          );
        }
      } else {
        setSelectedReferenceIds((current) =>
          current.filter((id) => id !== mention.id)
        );
        setHistoryReferenceGenerationIds((current) =>
          current.filter(
            (generationId) =>
              historyReferenceAssetByGeneration[generationId] !== mention.id
          )
        );
      }

      const sourcePrompt =
        starterCasePreviewPrompt ?? recipeConditionedPrompt ?? '';
      handleStudioPromptChange(
        removeAndReindexPromptReferenceMention(
          sourcePrompt,
          promptReferenceMentions,
          mention
        )
      );
    },
    [
      characterReferenceGroups,
      handleRemoveReferenceUpload,
      handleStudioPromptChange,
      historyReferenceAssetByGeneration,
      promptReferenceMentions,
      recipeConditionedPrompt,
      referenceUploadItems,
      starterCasePreviewPrompt
    ]
  );

  const handleMaterialChange = useCallback(
    (slot: WardrobeMaterialSlot, materialId?: string) => {
      setReverseSession(null);
      setRandomRecipeAudit(null);
      setWardrobeMaterials((current) => {
        const next = { ...current };
        if (materialId) next[slot] = materialId;
        else delete next[slot];
        return next;
      });
    },
    []
  );

  const handleRandomizeSelection = () => {
    requestFullPromptCatalog();
    activateRecipeConditioning();
    setReverseSession(null);
    const result = buildAuditedRandomImagePromptSelection(composerAssets);
    setSelection(result.selection);
    setRandomRecipeAudit(result.audit);
    setCommittedRecipeId(
      result.audit.seed
        ? `random-visual-recipe-${result.audit.seed}`
        : 'random-visual-recipe'
    );
  };

  const handleRandomizeRecipeDraft = () => {
    requestFullPromptCatalog();
    const result = buildAuditedRandomImagePromptSelection(composerAssets);
    setRecipeDraftSelection(result.selection);
  };

  const handleRandomizeSlot = (slot: ImagePromptSlot) => {
    activateRecipeConditioning(slot);
    setReverseSession(null);
    const result = buildAuditedRandomizedImagePromptSelectionSlot(
      selection,
      slot,
      composerAssets
    );
    if (JSON.stringify(result.selection) === JSON.stringify(selection)) {
      showToast(
        t('canvas.randomizeSlotNoAlternative', {
          slot: getSlotLabel(slot)
        }) as string,
        { durationMs: 2600 }
      );
      return;
    }
    setSelection(result.selection);
    setRandomRecipeAudit(result.audit);
    setCommittedRecipeId('custom-visual-recipe');
  };

  const handleRandomizeRecipeDraftSlot = (slot: ImagePromptSlot) => {
    requestPromptCatalogSlot(slot);
    const result = buildAuditedRandomizedImagePromptSelectionSlot(
      recipeDraftSelection,
      slot,
      composerAssets
    );
    if (
      JSON.stringify(result.selection) === JSON.stringify(recipeDraftSelection)
    ) {
      showToast(
        t('canvas.randomizeSlotNoAlternative', {
          slot: getSlotLabel(slot)
        }) as string,
        { durationMs: 2600 }
      );
      return;
    }
    setRecipeDraftSelection(result.selection);
  };

  const handleApplyRecipeDraft = useCallback(() => {
    if (recipeDraftCompiled.selectedAssets.length === 0) {
      const message =
        language === 'en-US'
          ? 'Choose at least one recipe asset first.'
          : '请先选择至少一个配方素材';
      setStatusText(message);
      showToast(message);
      return false;
    }
    activateRecipeConditioning(activeSlot);
    setReverseSession(null);
    setStarterCasePreviewPrompt(null);
    setRandomRecipeAudit(null);
    setSelection(recipeDraftSelection);
    setPromptMode('custom');
    setCustomPromptText('');
    setCustomNegativePromptText('');
    setCommittedRecipeId('custom-visual-recipe');
    setAppliedSelectionSignature(
      JSON.stringify({
        selection: recipeDraftSelection,
        wardrobeMaterials
      })
    );
    setIsPromptExpanded(true);
    setPromptEditorOpenSignal((value) => value + 1);
    const message =
      language === 'en-US'
        ? 'Visual recipe applied to the prompt.'
        : '已应用配方并更新提示词';
    setStatusText(message);
    showToast(message);
    return true;
  }, [
    activateRecipeConditioning,
    activeSlot,
    language,
    recipeDraftCompiled.selectedAssets.length,
    recipeDraftSelection,
    setStatusText,
    showToast,
    wardrobeMaterials
  ]);

  const handleReset = () => {
    setReverseSession(null);
    setReverseImporting(false);
    setReverseImportingAssetIds(new Set());
    setSelection(defaultImagePromptSelection);
    setWardrobeMaterials(defaultWardrobeMaterialSelection);
    setRandomRecipeAudit(null);
    setCommittedRecipeId('');
    setStarterCasePreviewPrompt(null);
    setConditioningMode('none');
    clearMoodboardContext();
    setSettings(defaultStudioImageSettings);
    setSelectedReferenceIds([]);
    setReferenceUploadItems((current) => {
      current.forEach((item) => URL.revokeObjectURL(item.previewUrl));
      return [];
    });
    removedReferenceUploadIdsRef.current.clear();
    setSelectedCharacterIds([]);
    setCharacterReferenceGroups([]);
    setActiveSlot('character');
    setQuery('');
    setActiveTag(null);
    setResultImageUrl(null);
    setResultImageUrls([]);
    setActiveGenerationId(null);
    setSelectedCharacterIds([]);
    setCharacterReferenceGroups([]);
    setError('');
    setStatusText('');
    setPromptMode('custom');
    setCustomPromptText('');
    setCustomNegativePromptText('');
  };

  const handleSavePreset = () => {
    if (!hasApiAuth) {
      requestLogin('preset_save_gate');
      return;
    }
    const prompt = customPromptText.trim();
    const negativePrompt = '';
    if (!prompt) {
      setError(t('errors.emptyPrompt'));
      return;
    }
    const item: CustomPromptLibraryItem = {
      id: crypto.randomUUID(),
      title: inferPromptTitle(prompt, t('promptLibrary.untitled') as string),
      prompt,
      negativePrompt,
      createdAt: Date.now()
    };
    const nextLibrary = [
      item,
      ...promptLibrary.filter(
        (saved) =>
          saved.prompt !== prompt || saved.negativePrompt !== negativePrompt
      )
    ].slice(0, 50);
    setPromptLibrary(nextLibrary);
    persistPromptLibrary(nextLibrary);
    setPresetSaved(true);
    setStatusText(t('promptLibrary.savedToast') as string);
    window.setTimeout(() => setPresetSaved(false), 1400);
  };

  const handleImportReverseSession = async () => {
    if (!reverseSession || reverseSession.imported || reverseImporting) return;
    if (!hasApiAuth) {
      requestLogin('reverse_session_import_gate');
      return;
    }
    if (reverseSession.assets.length === 0) {
      setError('当前没有可导入的反推素材');
      return;
    }

    setReverseImporting(true);
    setError('');
    try {
      const savedPairs: Array<{
        tempId: string;
        savedId: string;
        slot: ImagePromptSlot;
      }> = [];
      for (const asset of reverseSession.assets) {
        const saved = await saveUserPromptAsset({
          slot: asset.slot,
          title: asset.title,
          subtitle: asset.subtitle,
          prompt: asset.prompt,
          promptZh: null,
          negativePrompt: asset.negativePrompt || null,
          negativePromptZh: null,
          tags: asset.tags,
          thumbnailUrl: '',
          source: 'user_upload',
          sourcePrompt: reverseSession.fullPrompt
        });
        savedPairs.push({
          tempId: asset.id,
          savedId: saved.id,
          slot: saved.slot as ImagePromptSlot
        });
        setUserAssets((prev) => [
          saved,
          ...prev.filter((item) => item.id !== saved.id)
        ]);
      }
      void completeRewardTaskOnce(
        REWARD_TASK_IDENTIFIERS.savePromptCaseOrPromptAsset
      );
      setUserAssetsLoaded(true);
      setRandomRecipeAudit(null);
      setSelection((current) => {
        return savedPairs.reduce(
          (nextSelection, pair) =>
            replaceImagePromptAssetSelectionId(
              nextSelection,
              pair.slot,
              pair.tempId,
              pair.savedId
            ),
          normalizeImagePromptSelection(current)
        );
      });
      setLibrarySource('mine');
      setReverseSession((current) =>
        current?.id === reverseSession.id
          ? { ...current, imported: true }
          : current
      );
      setStatusText(`已导入 ${savedPairs.length} 项反推素材到我的素材`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '导入反推素材失败');
    } finally {
      setReverseImporting(false);
    }
  };

  const handleImportReverseAsset = async (asset: ImagePromptAsset) => {
    if (!reverseSession || !asset.id.startsWith('reverse-')) return;
    if (!hasApiAuth) {
      requestLogin('reverse_asset_import_gate');
      return;
    }
    if (reverseImportingAssetIds.has(asset.id)) return;

    setReverseImportingAssetIds((current) => new Set(current).add(asset.id));
    setError('');
    try {
      const saved = await saveUserPromptAsset({
        slot: asset.slot,
        title: asset.title,
        subtitle: asset.subtitle,
        prompt: asset.prompt,
        promptZh: null,
        negativePrompt: asset.negativePrompt || null,
        negativePromptZh: null,
        tags: asset.tags,
        thumbnailUrl: '',
        source: 'user_upload',
        sourcePrompt: reverseSession.fullPrompt
      });
      setUserAssets((prev) => [
        saved,
        ...prev.filter((item) => item.id !== saved.id)
      ]);
      void completeRewardTaskOnce(
        REWARD_TASK_IDENTIFIERS.savePromptCaseOrPromptAsset
      );
      setUserAssetsLoaded(true);
      setRandomRecipeAudit(null);
      setSelection((current) =>
        replaceImagePromptAssetSelectionId(
          current,
          asset.slot,
          asset.id,
          saved.id
        )
      );
      setReverseSession((current) => {
        if (!current || current.id !== reverseSession.id) return current;
        const remainingAssets = current.assets.filter(
          (item) => item.id !== asset.id
        );
        return {
          ...current,
          assets: remainingAssets,
          imported: remainingAssets.length === 0
        };
      });
      setLibrarySource('mine');
      setStatusText(`已导入「${asset.title}」到我的素材`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '导入素材失败');
    } finally {
      setReverseImportingAssetIds((current) => {
        const next = new Set(current);
        next.delete(asset.id);
        return next;
      });
    }
  };

  const handleApplyPreset = (preset: CreatorPreset) => {
    setReverseSession(null);
    setRandomRecipeAudit(null);
    setSelection(normalizeImagePromptSelection(preset.selection));
    setWardrobeMaterials(defaultWardrobeMaterialSelection);
    setSettings(normalizeCreatorSettings(preset.settings));
    setActiveSlot('character');
    setResultImageUrl(null);
    setResultImageUrls([]);
    setActiveGenerationId(null);
    setConsistencyResult(null);
    setError('');
    setStatusText('');
    setPromptMode('custom');
    setCustomPromptText('');
    setCustomNegativePromptText('');
  };

  const handleDeletePreset = (presetId: string) => {
    const nextPresets = presets.filter((preset) => preset.id !== presetId);
    setPresets(nextPresets);
    persistPresets(nextPresets);
  };

  const handleApplySelectionToPrompt = useCallback(() => {
    const nextPrompt = applyImagePromptSelectionToPrompt(
      customPromptText,
      effectiveCompiled.prompt,
      selection,
      composerAssets,
      promptLocale,
      wardrobeMaterials
    );
    if (nextPrompt === customPromptText) {
      setAppliedSelectionSignature(selectionSignature);
      const message = t('canvas.applyToPromptEmpty') as string;
      setStatusText(message);
      showToast(message);
      return;
    }
    setPromptMode('custom');
    setCustomPromptText(nextPrompt);
    setAppliedSelectionSignature(selectionSignature);
    setIsPromptExpanded(true);
    setPromptEditorOpenSignal((value) => value + 1);
    const message = t('canvas.applyToPromptDone') as string;
    setStatusText(message);
    showToast(message);
  }, [
    composerAssets,
    customPromptText,
    effectiveCompiled.prompt,
    promptLocale,
    selection,
    selectionSignature,
    wardrobeMaterials,
    setStatusText,
    showToast,
    t
  ]);

  const handleReplacePromptWithSelection = useCallback(() => {
    setPromptMode('custom');
    setCustomPromptText(effectiveCompiled.prompt.trim());
    setAppliedSelectionSignature(selectionSignature);
    setIsPromptExpanded(true);
    setPromptEditorOpenSignal((value) => value + 1);
  }, [effectiveCompiled.prompt, selectionSignature]);

  const handleCommitStarterCase = useCallback(
    (recipe: ImageStudioStarterCase) => {
      const commit = buildImageStudioStarterCaseCommit(
        recipe,
        conditioningMode
      );
      setReverseSession(null);
      setManualSelection(commit.selection);
      setWardrobeMaterials(defaultWardrobeMaterialSelection);
      setConditioningMode(commit.conditioningMode);
      setPromptMode('custom');
      setCustomPromptText(commit.prompt);
      setAppliedSelectionSignature('');
      setStarterCasePreviewPrompt(null);
      setCommittedRecipeId(recipe.id);
      setActiveSlot('character');
      setStatusText(`已应用案例：${recipe.title}`);
    },
    [conditioningMode, setManualSelection, setStatusText]
  );

  const handleApplyPromptLibraryItem = (itemId: string): boolean => {
    const item = promptLibrary.find((saved) => saved.id === itemId);
    if (!item) return false;
    if (!window.confirm(t('promptLibrary.applyConfirm'))) {
      return false;
    }
    setPromptMode('custom');
    setCustomPromptText(item.prompt);
    setCustomNegativePromptText('');
    setResultImageUrl(null);
    setResultImageUrls([]);
    setActiveGenerationId(null);
    setConsistencyResult(null);
    setError('');
    setStatusText(t('promptLibrary.appliedToast') as string);
    return true;
  };

  function handleRecreatePromptCase(
    payloadOrPrompt: string | PromptCaseRecreatePayload,
    options: { scrollPromptIntoView?: boolean } = {}
  ) {
    const payload =
      typeof payloadOrPrompt === 'string'
        ? { prompt: payloadOrPrompt }
        : payloadOrPrompt;
    const routeImport = derivePromptCaseRouteImport(settings, payload);
    const prompt = routeImport.prompt;
    setSettings((current) =>
      normalizeCreatorSettings(
        derivePromptCaseRouteImport(current, payload).settings
      )
    );
    setPromptMode('custom');
    setCustomPromptText(prompt);
    setCustomNegativePromptText('');
    if (routeImport.visualRecipeSelection) {
      requestFullPromptCatalog();
      setRandomRecipeAudit(null);
      setRecipeDraftSelection(routeImport.visualRecipeSelection);
      setWardrobeMaterials(defaultWardrobeMaterialSelection);
      setRecipeOpenSignal((value) => value + 1);
    }
    if (routeImport.openAssetSlot) {
      requestFullPromptCatalog();
      setActiveSlot(routeImport.openAssetSlot);
      setLibrarySource('public');
      if (!routeImport.visualRecipeSelection) {
        setRecipeOpenSignal((value) => value + 1);
      }
    }
    setResultImageUrl(null);
    setResultImageUrls([]);
    setActiveGenerationId(null);
    setError('');
    setStatusText(
      routeImport.visualRecipeSelection || routeImport.openAssetSlot
        ? language === 'en-US'
          ? 'Prompt imported. Adjust the visual recipe, then apply it.'
          : '案例 Prompt 已填入，调整配方后点击「应用配方」'
        : (t('promptCases.recreateApplied') as string)
    );
    setIsPromptExpanded(true);
    setPromptEditorOpenSignal((value) => value + 1);
    if (options.scrollPromptIntoView !== false) {
      window.requestAnimationFrame(() => {
        document.querySelector('.creator-prompt-inline')?.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      });
    }
  }

  const handleEditGenerationTask = useCallback(
    (task: ImageGenerationQueueItem) => {
      if (task.status === 'queued') {
        cancelQueuedGeneration(task.id);
      }

      const request = task.request;
      navigateImageStudio();
      setSettings(
        normalizeCreatorSettings({
          ...defaultImagePromptSettings,
          model: request.model || defaultImagePromptSettings.model,
          aspectRatio:
            request.aspectRatio || defaultImagePromptSettings.aspectRatio,
          imageSize: request.imageSize || defaultImagePromptSettings.imageSize,
          quality: request.quality || defaultImagePromptSettings.quality,
          outputFormat:
            request.outputFormat || defaultImagePromptSettings.outputFormat,
          imageCount:
            typeof request.imageCount === 'number'
              ? request.imageCount
              : defaultImagePromptSettings.imageCount,
          customPrompt: ''
        })
      );
      setPromptMode('custom');
      setCustomPromptText(request.prompt || '');
      setCustomNegativePromptText('');
      setSelectedReferenceIds(request.referenceImageIds || []);
      setSelectedCharacterIds(request.characterCardIds || []);
      setCharacterReferenceGroups(request.characterReferenceGroups || []);
      setResultImageUrl(null);
      setResultImageUrls([]);
      setActiveGenerationId(null);
      setError('');
      setStatusText(t('progress.loadedForEdit') as string);
      setIsPromptExpanded(true);
      setPromptEditorOpenSignal((value) => value + 1);
      window.setTimeout(() => {
        document
          .querySelector('.creator-prompt-inline')
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 80);
    },
    [
      cancelQueuedGeneration,
      setActiveGenerationId,
      setResultImageUrl,
      setResultImageUrls,
      setError,
      setStatusText,
      navigateImageStudio,
      t
    ]
  );

  const failureFeedbackOptions = useMemo(
    () => [
      {
        id: 'result_mismatch',
        label: t('progress.feedback.options.resultMismatch') as string
      },
      {
        id: 'quality_low',
        label: t('progress.feedback.options.qualityLow') as string
      },
      {
        id: 'wait_too_long',
        label: t('progress.feedback.options.waitTooLong') as string
      },
      {
        id: 'billing_unclear',
        label: t('progress.feedback.options.billingUnclear') as string
      }
    ],
    [t]
  );

  const safetyFailureFeedbackOptions = useMemo(
    () => [
      {
        id: 'safety_false_positive',
        label: t('progress.feedback.options.safetyFalsePositive') as string
      },
      ...failureFeedbackOptions
    ],
    [failureFeedbackOptions, t]
  );

  const handleFailureFeedback = useCallback(
    (
      taskKey: string,
      reason: string,
      params: {
        taskId?: string;
        model?: string;
        imageSize?: string;
        quality?: string;
        referenceMode?: string;
        source: 'server_task' | 'local_queue';
      }
    ) => {
      setFailureFeedbackByTaskKey((current) => {
        if (current[taskKey]) return current;
        return { ...current, [taskKey]: reason };
      });
      trackImageGenerationEvent('failure_feedback_submit', {
        task_key: taskKey,
        task_id: params.taskId,
        reason,
        model: params.model,
        image_size: params.imageSize,
        quality: params.quality,
        reference_mode: params.referenceMode,
        source: params.source
      });
      setStatusText(t('progress.feedback.thanks') as string);
    },
    [setStatusText, t]
  );

  const handleDeletePromptLibraryItem = (itemId: string) => {
    const nextLibrary = promptLibrary.filter((item) => item.id !== itemId);
    setPromptLibrary(nextLibrary);
    persistPromptLibrary(nextLibrary);
    setStatusText(t('promptLibrary.deletedToast') as string);
  };

  const handleRenamePromptLibraryItem = (itemId: string) => {
    const item = promptLibrary.find((saved) => saved.id === itemId);
    if (!item) return;
    const nextTitle = window
      .prompt(t('promptLibrary.renameDialog') as string, item.title)
      ?.trim();
    if (!nextTitle || nextTitle === item.title) return;

    const nextLibrary = promptLibrary.map((saved) =>
      saved.id === itemId ? { ...saved, title: nextTitle } : saved
    );
    setPromptLibrary(nextLibrary);
    persistPromptLibrary(nextLibrary);
    setStatusText(t('promptLibrary.renamedToast') as string);
  };

  const handleCopyPromptLibraryItem = async (itemId: string) => {
    const item = promptLibrary.find((saved) => saved.id === itemId);
    if (!item) return;
    const text = formatPromptForClipboard(
      item.prompt,
      sanitizeLegacyAutoNegativePrompt(item.negativePrompt) || ''
    );
    const ok = await writeToClipboard(text);
    if (ok) {
      const message = t('promptLibrary.copiedToast') as string;
      setStatusText(message);
      showToast(message);
    }
  };

  const writeToClipboard = useCallback(
    async (text: string) => {
      try {
        if (!navigator.clipboard?.writeText) {
          throw new Error('clipboard API unavailable');
        }
        await navigator.clipboard.writeText(text);
        return true;
      } catch (copyError) {
        console.warn('[ImageCreate] clipboard write failed:', copyError);
        setError(t('errors.clipboardFailed'));
        return false;
      }
    },
    [t]
  );

  const handleCopyPrompt = async () => {
    const promptText = customPromptText;
    const negativeText = '';
    const text = formatPromptForClipboard(promptText, negativeText);
    const ok = await writeToClipboard(text);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    }
  };

  const handleCheckConsistency = useCallback(async () => {
    if (!activeGenerationId) {
      setError('请先完成一次图片生成');
      return;
    }
    setConsistencyChecking(true);
    setError('');
    try {
      const result = await checkImageConsistency({
        generationId: activeGenerationId,
        prompt: customPromptText,
        characterCardIds: selectedCharacterIds,
        characterReferenceGroups
      });
      setConsistencyResult(result);
      setStatusText(
        result.usedFallback
          ? '已生成一致性修复建议'
          : `一致性评分 ${(result.score * 100).toFixed(0)}%`
      );
    } catch (error) {
      setError(error instanceof Error ? error.message : '一致性检查失败');
    } finally {
      setConsistencyChecking(false);
    }
  }, [
    activeGenerationId,
    characterReferenceGroups,
    customPromptText,
    selectedCharacterIds,
    setError,
    setStatusText
  ]);

  const getRecipeReferenceIds = useCallback((recipe: ImageCreatorRecipe) => {
    const metadataReferenceIds = Array.isArray(
      recipe.metadata?.selectedReferenceIds
    )
      ? recipe.metadata.selectedReferenceIds.filter(
          (id): id is string => typeof id === 'string' && id.trim().length > 0
        )
      : [];
    const groupReferenceIds = recipe.characterReferenceGroups.flatMap(
      (group) => group.referenceImageIds || []
    );
    return Array.from(new Set([...metadataReferenceIds, ...groupReferenceIds]));
  }, []);

  const handleApplyRecipe = useCallback(
    (recipe: ImageCreatorRecipe) => {
      const firstScene = recipe.scenes[0];
      const nextSettings = normalizeCreatorSettings({
        ...defaultImagePromptSettings,
        ...(recipe.settings as Partial<ImagePromptSettings>),
        imageCount:
          firstScene?.imageCount ||
          Number(recipe.settings.imageCount) ||
          defaultImagePromptSettings.imageCount
      });
      setSettings(nextSettings);
      setRandomRecipeAudit(null);
      setWardrobeMaterials(defaultWardrobeMaterialSelection);
      setSelection(
        normalizeImagePromptSelection(
          recipe.selection as Partial<ImagePromptSelection>
        )
      );
      setSelectedReferenceIds(getRecipeReferenceIds(recipe));
      setSelectedCharacterIds(recipe.characterCardIds || []);
      setCharacterReferenceGroups(recipe.characterReferenceGroups || []);
      if (firstScene) {
        setPromptMode('custom');
        setCustomPromptText(firstScene.prompt);
        setCustomNegativePromptText('');
        setIsPromptExpanded(true);
        setPromptEditorOpenSignal((value) => value + 1);
      }
      trackImageGenerationEvent('recipe_apply', {
        recipe_type: recipe.recipeType,
        scene_count: recipe.scenes.length,
        source: 'creator_recipe_panel'
      });
      setStatusText(
        recipe.recipeType === 'style_batch_pack'
          ? '已应用风格批量套件'
          : '已应用角色场景套件'
      );
    },
    [getRecipeReferenceIds, setStatusText]
  );

  const handleRunRecipe = useCallback(
    async (recipe: ImageCreatorRecipe) => {
      if (!hasApiAuth) {
        requestLogin('recipe_run_gate');
        return;
      }
      const referenceImageIds = getRecipeReferenceIds(recipe);
      const characterGroups = recipe.characterReferenceGroups || [];
      const baseSettings = normalizeCreatorSettings({
        ...defaultImagePromptSettings,
        ...(recipe.settings as Partial<ImagePromptSettings>)
      });
      const requests: VisualImageGenerationRequest[] = recipe.scenes.map(
        (scene) => ({
          prompt: scene.prompt,
          negativePrompt: undefined,
          model: baseSettings.model,
          aspectRatio: baseSettings.aspectRatio,
          imageSize: baseSettings.imageSize,
          quality: baseSettings.quality,
          outputFormat: baseSettings.outputFormat,
          imageCount: scene.imageCount,
          assetIds: [],
          promptMode: 'custom',
          referenceImageIds,
          referenceMode:
            characterGroups.length > 0
              ? 'character_consistency'
              : referenceImageIds.length > 0
                ? 'image_reference'
                : 'none',
          characterCardIds: recipe.characterCardIds || [],
          characterReferenceGroups: characterGroups
        })
      );
      if (requests.length === 0) {
        setError('场景套件没有可生成的场景');
        return;
      }
      trackImageGenerationEvent('recipe_run', {
        recipe_type: recipe.recipeType,
        scene_count: requests.length,
        image_count: requests.reduce(
          (total, request) => total + (request.imageCount || 1),
          0
        ),
        source: 'creator_recipe_panel'
      });
      await enqueueGenerationRequests(requests, {
        statusText:
          recipe.recipeType === 'style_batch_pack'
            ? `已提交 ${requests.length} 个风格批量任务`
            : `已提交 ${requests.length} 个场景任务`
      });
    },
    [
      enqueueGenerationRequests,
      getRecipeReferenceIds,
      hasApiAuth,
      requestLogin,
      setError
    ]
  );

  const handleLocalEditFromHistory = useCallback((item: VisualImageHistoryItem) => {
    const entry = createImageEditorEntryState(item);
    if (!entry) return;
    setPreviewItem(null);
    navigate(localizeCreateHref('/tools/image-editor', createLocalePrefix), {
      state: { ...entry, initialTool: 'region' }
    });
  }, [createLocalePrefix, navigate]);

  const regenerateFromHistory = useCallback(
    async (item: VisualImageHistoryItem) => {
      if (!hasApiAuth) {
        requestLogin('history_regenerate_gate');
        return;
      }

      const referenceImageIds = item.referenceImageIds || [];
      const characterGroups = item.characterReferenceGroups || [];
      const imageCount =
        typeof item.requestedImageCount === 'number'
          ? item.requestedImageCount
          : typeof item.imageCount === 'number'
            ? item.imageCount
            : defaultImagePromptSettings.imageCount;
      const request: VisualImageGenerationRequest = {
        prompt: item.prompt || '',
        negativePrompt: undefined,
        model: item.model || defaultImagePromptSettings.model,
        aspectRatio: item.aspectRatio || defaultImagePromptSettings.aspectRatio,
        imageSize:
          item.imageSize ||
          item.requestedImageSize ||
          defaultImagePromptSettings.imageSize,
        quality: item.quality || defaultImagePromptSettings.quality,
        outputFormat:
          item.outputFormat || defaultImagePromptSettings.outputFormat,
        imageCount: Math.max(1, Math.floor(imageCount)),
        assetIds: item.assetIds || [],
        promptMode: 'custom',
        referenceImageIds,
        referenceMode:
          item.referenceMode ||
          (characterGroups.length > 0
            ? 'character_consistency'
            : referenceImageIds.length > 0
              ? 'image_reference'
              : undefined),
        characterCardIds: item.characterCardIds || [],
        characterReferenceGroups: characterGroups
      };

      setPreviewItem(null);
      setError('');
      navigateImageStudio();
      await enqueueGenerationRequests([request], {
        statusText: t('historyRail.regenerateSubmitted') as string
      });
    },
    [
      enqueueGenerationRequests,
      hasApiAuth,
      navigateImageStudio,
      requestLogin,
      setError,
      t
    ]
  );

  const retryFailedTurn = useCallback(
    async (turn: ImageCreationTurn) => {
      if (!hasApiAuth) {
        requestLogin('session_turn_retry_gate');
        return;
      }
      const taskId = turn.context?.taskId || turn.id;
      const serverTask = imageTaskCenterTasks.find(
        (item) => item.taskId === taskId
      );
      const storedRequest =
        serverTask?.status === 'failed' && serverTask.request
          ? serverTask.request
          : null;
      const fallbackRequest: VisualImageGenerationRequest = {
        prompt: turn.prompt || '',
        negativePrompt: turn.negativePrompt,
        model: settings.model,
        aspectRatio: settings.aspectRatio,
        imageSize: settings.imageSize,
        quality: settings.quality,
        outputFormat: settings.outputFormat,
        imageCount: settings.imageCount,
        promptMode: 'custom',
        assetIds: turn.context?.referenceAssetIds || [],
        referenceImageIds: turn.context?.referenceAssetIds || [],
        creationContext: {
          sessionId: turn.sessionId,
          recipeId: turn.context?.recipeId,
          moodboard: turn.context?.moodboard,
          referenceAssetIds: turn.context?.referenceAssetIds || []
        }
      };
      const request = storedRequest || fallbackRequest;
      if (!request.prompt.trim()) {
        setGenerationError('该失败任务没有可重试的提示词。');
        return;
      }
      setPreviewItem(null);
      setError('');
      trackImageGenerationEvent('retry_click', {
        task_id: taskId,
        task_key: `session-turn-${turn.id}`,
        model: request.model,
        image_size: request.imageSize,
        quality: request.quality,
        source: storedRequest
          ? 'session_turn_server_task'
          : 'session_turn_fallback'
      });
      if (
        storedRequest &&
        serverTask &&
        canRetryImageGenerationFailure(serverTask)
      ) {
        retryServerGenerationTask(serverTask.taskId, storedRequest);
        return;
      }
      await enqueueGenerationRequests([request], {
        statusText: t('historyRail.regenerateSubmitted') as string
      });
    },
    [
      enqueueGenerationRequests,
      hasApiAuth,
      imageTaskCenterTasks,
      requestLogin,
      retryServerGenerationTask,
      setError,
      setGenerationError,
      settings,
      t
    ]
  );

  const handleUseRepairPrompt = useCallback(
    (repairPrompt: string) => {
      if (!repairPrompt.trim()) return;
      setPromptMode('custom');
      setCustomPromptText(repairPrompt.trim());
      setIsPromptExpanded(true);
      setPromptEditorOpenSignal((value) => value + 1);
      setStatusText('修复提示词已填入编辑器');
      window.setTimeout(() => {
        document
          .querySelector('.creator-prompt-inline')
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 80);
    },
    [setStatusText]
  );

  const reeditFromHistory = (item: VisualImageHistoryItem) => {
    setReverseSession(null);
    // 1. 反推 selection：按 slot 重建
    let nextSelection = normalizeImagePromptSelection(
      defaultImagePromptSelection
    );
    let missingCount = 0;
    for (const assetId of item.assetIds || []) {
      const asset = mergedAssets.find((a) => a.id === assetId);
      if (asset) {
        nextSelection = setImagePromptAssetSelection(nextSelection, asset);
      } else {
        missingCount += 1;
      }
    }
    setRandomRecipeAudit(item.recipeAudit || null);
    setSelection(nextSelection);
    setWardrobeMaterials(defaultWardrobeMaterialSelection);
    // 2. 恢复 settings
    setSettings(
      normalizeCreatorSettings({
        model: item.model || defaultImagePromptSettings.model,
        aspectRatio: item.aspectRatio || defaultImagePromptSettings.aspectRatio,
        imageSize: item.imageSize || defaultImagePromptSettings.imageSize,
        quality: item.quality || defaultImagePromptSettings.quality,
        outputFormat:
          item.outputFormat || defaultImagePromptSettings.outputFormat,
        imageCount:
          typeof item.requestedImageCount === 'number'
            ? item.requestedImageCount
            : typeof item.imageCount === 'number'
              ? item.imageCount
              : defaultImagePromptSettings.imageCount,
        customPrompt: ''
      })
    );
    // 3. 进入 custom 模式，灌历史 prompt
    setPromptMode('custom');
    setCustomPromptText(item.prompt || '');
    setCustomNegativePromptText('');
    setSelectedReferenceIds(item.referenceImageIds || []);
    setSelectedCharacterIds(item.characterCardIds || []);
    setCharacterReferenceGroups(item.characterReferenceGroups || []);
    // 4. 关闭弹窗 + 提示
    setPreviewItem(null);
    setError('');
    if (missingCount > 0) {
      setStatusText(
        t('history.assetsMissing', { count: missingCount }) as string
      );
    } else {
      setStatusText(
        t('history.loadedFromHistory', {
          model: item.modelLabel || item.model || ''
        }) as string
      );
    }
  };

  const createFromHistoryRecipe = (
    item: VisualImageHistoryItem,
    assets: ResolvedVisualRecipeAsset[]
  ) => {
    reeditFromHistory({
      ...item,
      assetIds: assets.map(({ asset }) => asset.id)
    });
  };

  const deleteFromHistory = async (item: VisualImageHistoryItem) => {
    await deleteGenerationFromHistory(item);
    setFullGenerationHistory((current) =>
      current.filter((historyItem) => historyItem.id !== item.id)
    );
    setPreviewItem(null);
    setStatusText(t('history.deleted') as string);
  };

  const openHistoryGallery = useCallback(
    async (mode: HistoryGalleryMode = 'preview') => {
      if (!hasApiAuth) {
        requestLogin('history_gallery_gate');
        return;
      }

      const cached = historyGalleryCacheRef.current;
      const cacheFresh =
        cached && Date.now() - cached.cachedAt < HISTORY_GALLERY_CACHE_TTL_MS;
      const seedItems = cacheFresh ? cached.items : generationHistory;
      const seedTotal = cacheFresh
        ? cached.total
        : Math.max(generationHistoryTotal, generationHistory.length);

      setHistoryGalleryMode(mode);
      setHistoryGalleryOpen(true);
      setFullGenerationHistory(seedItems);
      setFullGenerationHistoryTotal(seedTotal);
      setFullGenerationHistoryLoading(!cacheFresh);
      setFullGenerationHistoryLoadingMore(false);
      setFullGenerationHistoryError('');
      if (cacheFresh) {
        return;
      }

      const requestSeq = historyGalleryRequestSeqRef.current + 1;
      historyGalleryRequestSeqRef.current = requestSeq;
      try {
        const result = await getVisualImageHistoryResult(
          HISTORY_GALLERY_PAGE_SIZE
        );
        if (historyGalleryRequestSeqRef.current !== requestSeq) return;
        historyGalleryCacheRef.current = {
          items: result.items,
          total: result.total,
          cachedAt: Date.now()
        };
        setFullGenerationHistory(result.items);
        setFullGenerationHistoryTotal(result.total);
      } catch (historyError) {
        if (historyGalleryRequestSeqRef.current !== requestSeq) return;
        setFullGenerationHistoryError(
          historyError instanceof Error
            ? historyError.message
            : (t('history.loadFailed') as string)
        );
      } finally {
        if (historyGalleryRequestSeqRef.current === requestSeq) {
          setFullGenerationHistoryLoading(false);
        }
      }
    },
    [generationHistory, generationHistoryTotal, hasApiAuth, requestLogin, t]
  );

  useEffect(() => {
    if (!imageStudioV2Enabled) return;
    const params = new URLSearchParams(location.search);
    if (params.get('legacyHistory') !== '1') return;
    void openHistoryGallery('preview');
  }, [imageStudioV2Enabled, location.search, openHistoryGallery]);

  const openHistoryReferencePickerWithPaywall = useCallback(() => {
    if (membership.loading || membership.isMember) {
      void openHistoryGallery('reference-picker');
      return;
    }
    openDeepPaywall(
      'gallery',
      'image_history_reference_picker',
      () => void openHistoryGallery('reference-picker')
    );
  }, [
    membership.isMember,
    membership.loading,
    openDeepPaywall,
    openHistoryGallery
  ]);

  const handleToggleHistoryReference = useCallback(
    (generationId: string) => {
      const existingReferenceId =
        historyReferenceAssetByGeneration[generationId];
      if (historyReferenceGenerationIds.includes(generationId)) {
        setHistoryReferenceGenerationIds((current) =>
          current.filter((id) => id !== generationId)
        );
        if (existingReferenceId) {
          setSelectedReferenceIds((current) =>
            current.filter((id) => id !== existingReferenceId)
          );
        }
        return;
      }

      const pendingReferenceCount = historyReferenceGenerationIds.filter(
        (id) => {
          const referenceId = historyReferenceAssetByGeneration[id];
          return !referenceId || !selectedReferenceIds.includes(referenceId);
        }
      ).length;
      const addsReference =
        !existingReferenceId ||
        !selectedReferenceIds.includes(existingReferenceId);

      if (
        selectedReferenceIds.length +
          pendingReferenceCount +
          (addsReference ? 1 : 0) >
        4
      ) {
        setError('本次最多选择 4 张参考图');
        return;
      }

      setError('');
      setHistoryReferenceGenerationIds((current) =>
        current.includes(generationId) ? current : [...current, generationId]
      );
      if (existingReferenceId) {
        setSelectedReferenceIds((current) =>
          current.includes(existingReferenceId)
            ? current
            : [...current, existingReferenceId]
        );
      }
    },
    [
      historyReferenceAssetByGeneration,
      historyReferenceGenerationIds,
      selectedReferenceIds
    ]
  );

  const confirmHistoryReferences = useCallback(async () => {
    if (historyReferenceGenerationIds.length === 0) {
      setHistoryGalleryOpen(false);
      setStatusText('未选择图库参考图');
      return;
    }

    setHistoryReferenceConfirming(true);
    setHistoryReferenceImportingId(null);
    setError('');

    const resolvedReferenceIds: string[] = [];
    try {
      const nextReferenceByGeneration = {
        ...historyReferenceAssetByGeneration
      };

      for (const generationId of historyReferenceGenerationIds) {
        let referenceId = nextReferenceByGeneration[generationId];
        if (!referenceId) {
          setHistoryReferenceImportingId(generationId);
          const reference = await importGenerationAsReference({
            generationId,
            role: 'style',
            label: '图库参考图'
          });
          referenceId = reference.id;
          setReferenceAssetsById((current) => ({
            ...current,
            [reference.id]: reference
          }));
          nextReferenceByGeneration[generationId] = referenceId;
          setHistoryReferenceAssetByGeneration((current) => ({
            ...current,
            [generationId]: referenceId
          }));
        }
        resolvedReferenceIds.push(referenceId);
      }

      setHistoryReferenceAssetByGeneration(nextReferenceByGeneration);
      setSelectedReferenceIds((current) => {
        const next = [...current];
        resolvedReferenceIds.forEach((referenceId) => {
          if (!next.includes(referenceId)) next.push(referenceId);
        });
        return next.slice(0, 4);
      });
      void completeRewardTaskOnce(REWARD_TASK_IDENTIFIERS.useReferenceImage);
      setHistoryGalleryOpen(false);
      setStatusText(`已选择 ${resolvedReferenceIds.length} 张图库参考图`);
    } catch (error) {
      setError(error instanceof Error ? error.message : '图库参考图导入失败');
    } finally {
      setHistoryReferenceImportingId(null);
      setHistoryReferenceConfirming(false);
    }
  }, [
    historyReferenceAssetByGeneration,
    historyReferenceGenerationIds,
    setStatusText
  ]);

  const loadMoreHistoryGallery = useCallback(async () => {
    if (
      fullGenerationHistoryLoading ||
      fullGenerationHistoryLoadingMore ||
      fullGenerationHistory.length >= fullGenerationHistoryTotal
    ) {
      return;
    }

    setFullGenerationHistoryLoadingMore(true);
    setFullGenerationHistoryError('');
    try {
      const result = await getVisualImageHistoryResult(
        HISTORY_GALLERY_PAGE_SIZE,
        fullGenerationHistory.length
      );
      const existingIds = new Set(fullGenerationHistory.map((item) => item.id));
      const nextItems = result.items.filter(
        (item) => !existingIds.has(item.id)
      );
      const mergedItems = [...fullGenerationHistory, ...nextItems];
      historyGalleryCacheRef.current = {
        items: mergedItems,
        total: result.total,
        cachedAt: Date.now()
      };
      setFullGenerationHistory(mergedItems);
      setFullGenerationHistoryTotal(result.total);
    } catch (historyError) {
      setFullGenerationHistoryError(
        historyError instanceof Error
          ? historyError.message
          : (t('history.loadFailed') as string)
      );
    } finally {
      setFullGenerationHistoryLoadingMore(false);
    }
  }, [
    fullGenerationHistory,
    fullGenerationHistoryLoading,
    fullGenerationHistoryLoadingMore,
    fullGenerationHistoryTotal,
    t
  ]);

  const openHistoryLightbox = useCallback(
    (item: VisualImageHistoryItem, items: VisualImageHistoryItem[]) => {
      const nextItems = items.length > 0 ? items : [item];
      const index = nextItems.findIndex(
        (historyItem) => historyItem.id === item.id
      );
      setHistoryLightboxItems(nextItems);
      setHistoryLightboxIndex(index >= 0 ? index : 0);
    },
    []
  );

  const selectFromHistoryGallery = useCallback(
    (item: VisualImageHistoryItem) => {
      setPreviewItem(item);
      setHistoryLightboxItems([]);
    },
    []
  );

  const previewNavigationItems = useMemo(() => {
    const baseItems =
      historyGalleryOpen && fullGenerationHistory.length > 0
        ? fullGenerationHistory
        : generationHistory;

    if (!previewItem) return baseItems;
    return baseItems.some((historyItem) => historyItem.id === previewItem.id)
      ? baseItems
      : [previewItem, ...baseItems];
  }, [
    fullGenerationHistory,
    generationHistory,
    historyGalleryOpen,
    previewItem
  ]);

  const previewItemIndex = useMemo(() => {
    if (!previewItem) return -1;
    return previewNavigationItems.findIndex(
      (historyItem) => historyItem.id === previewItem.id
    );
  }, [previewItem, previewNavigationItems]);

  const goPreviewHistoryItem = useCallback(
    (direction: -1 | 1) => {
      if (previewNavigationItems.length < 2 || previewItemIndex < 0) return;
      const nextIndex =
        (previewItemIndex + direction + previewNavigationItems.length) %
        previewNavigationItems.length;
      const nextItem = previewNavigationItems[nextIndex];
      if (!nextItem) return;
      setPreviewItem(nextItem);
      if (historyLightboxItems.length > 0) {
        setHistoryLightboxItems(previewNavigationItems);
        setHistoryLightboxIndex(nextIndex);
      }
    },
    [historyLightboxItems.length, previewItemIndex, previewNavigationItems]
  );

  const activeHistoryLightboxItem =
    historyLightboxItems[
      Math.min(
        historyLightboxIndex,
        Math.max(0, historyLightboxItems.length - 1)
      )
    ] || null;

  const historyLightboxPhotoItems = useMemo(
    () =>
      historyLightboxItems.map((historyItem) => ({
        src:
          getVisualImageDisplayUrl(historyItem, 'preview') ||
          historyItem.imageUrl,
        width: historyItem.width,
        height: historyItem.height,
        alt: historyItem.prompt || ''
      })),
    [historyLightboxItems]
  );

  const downloadHistoryLightboxItem = useCallback(
    (index: number) => {
      const target = historyLightboxItems[index];
      if (!target?.imageUrl) return;
      triggerImageDownload(
        target.imageUrl,
        `generated-image-${target.id || 'image'}`
      );
    },
    [historyLightboxItems]
  );

  const downloadHistoryOriginalImage = useCallback(
    (item: VisualImageHistoryItem) => {
      if (!item.imageUrl) return;
      triggerImageDownload(
        item.imageUrl,
        `generated-image-${item.id || 'image'}`
      );
    },
    []
  );

  const acknowledgeProgressTask = useCallback((taskKey: string) => {
    setAcknowledgedProgressTaskKeys((prev) => {
      if (prev.has(taskKey)) return prev;
      const next = new Set(prev);
      next.add(taskKey);
      persistAcknowledgedProgressTaskKeys(next);
      return next;
    });
  }, []);
  const translateImageTaskProgress = useCallback(
    (key: string, options?: Record<string, unknown>) =>
      (
        t as unknown as (
          key: string,
          options?: Record<string, unknown>
        ) => string
      )(key, options),
    [t]
  );
  const trackImageTaskProgressEvent = useCallback(
    (eventName: string, payload?: Record<string, unknown>) => {
      (
        trackImageGenerationEvent as unknown as (
          eventName: string,
          payload?: Record<string, unknown>
        ) => void
      )(eventName, payload);
    },
    []
  );

  /**
   * 全局进度面板派生数据。把页面里生图任务合并成统一 tasks 数组,
   * 让右下角浮动卡片只关心"任务列表"而不需要去看各种 state。
   */
  const progressTasks = useMemo(
    () =>
      buildImageProgressTasks({
        generationQueue,
        imageTaskCenterTasks,
        acknowledgedProgressTaskKeys,
        acknowledgeProgressTask,
        cancelQueuedGeneration,
        cancelServerQueuedGeneration,
        cancelRunningGeneration,
        cancelServerRunningGeneration,
        handleEditGenerationTask,
        retryGenerationTask,
        retryServerGenerationTask,
        dismissGenerationTask,
        deleteGenerationTask,
        deleteServerGenerationTask,
        failureFeedbackByTaskKey,
        failureFeedbackOptions,
        safetyFailureFeedbackOptions,
        handleFailureFeedback,
        removeImageTaskFromCenter,
        dismissImageTaskFromCenter,
        refreshImageTaskCenter,
        setStatusText,
        batchRunning,
        batchStats,
        currentProcessingAsset,
        t: translateImageTaskProgress,
        trackImageGenerationEvent: trackImageTaskProgressEvent
      }),
    [
      generationQueue,
      imageTaskCenterTasks,
      acknowledgedProgressTaskKeys,
      acknowledgeProgressTask,
      cancelQueuedGeneration,
      cancelServerQueuedGeneration,
      cancelRunningGeneration,
      cancelServerRunningGeneration,
      handleEditGenerationTask,
      retryGenerationTask,
      retryServerGenerationTask,
      dismissGenerationTask,
      deleteGenerationTask,
      deleteServerGenerationTask,
      failureFeedbackByTaskKey,
      failureFeedbackOptions,
      safetyFailureFeedbackOptions,
      handleFailureFeedback,
      removeImageTaskFromCenter,
      dismissImageTaskFromCenter,
      refreshImageTaskCenter,
      setStatusText,
      batchRunning,
      batchStats,
      currentProcessingAsset,
      translateImageTaskProgress,
      trackImageTaskProgressEvent
    ]
  );
  const activeProgressTaskCount = useMemo(
    () =>
      progressTasks.filter(
        (task) =>
          task.status === 'running' ||
          task.status === 'queued' ||
          Boolean(task.onRetry && task.status === 'succeeded')
      ).length,
    [progressTasks]
  );
  const visibleProgressTaskCount = progressTasks.length;
  const sessionProgressTasks = useMemo(() => {
    const tasks = selectSessionProgressTasks(
      progressTasks,
      activeSessionId,
      sessionTurns
    );
    return pendingSessionSubmission && tasks.length === 0
      ? [pendingSessionSubmission, ...tasks]
      : tasks;
  }, [activeSessionId, pendingSessionSubmission, progressTasks, sessionTurns]);

  // 发送成功后清空输入框，并让页面跟随新的创作内容滚动展示。
  const submissionScrollRef = useRef(false);
  const previousSessionContentCountRef = useRef(-1);

  const scrollToNewestSessionTurn = useCallback(
    (behavior: ScrollBehavior = 'smooth') => {
      window.requestAnimationFrame(() => {
        const turns = Array.from(
          document.querySelectorAll<HTMLElement>('.image-session-turn')
        );
        const target =
          turns[turns.length - 1] ||
          document.querySelector<HTMLElement>('.creator-session-transcript');
        target?.scrollIntoView({ behavior, block: 'center' });
      });
    },
    []
  );

  useEffect(() => {
    const contentCount = sessionTurns.length + sessionProgressTasks.length;
    const previous = previousSessionContentCountRef.current;
    previousSessionContentCountRef.current = contentCount;
    if (previous < 0 || contentCount <= previous) return;
    const nearBottom =
      window.innerHeight + window.scrollY >=
      document.documentElement.scrollHeight - 320;
    if (submissionScrollRef.current || nearBottom) {
      scrollToNewestSessionTurn();
    }
    submissionScrollRef.current = false;
  }, [
    scrollToNewestSessionTurn,
    sessionProgressTasks.length,
    sessionTurns.length
  ]);
  const legacyProgressTasks = useMemo(
    () =>
      progressTasks.reduce<ProgressTask[]>((items, task) => {
        if (task.status === 'dismissed') return items;
        items.push({
          ...task,
          status: task.status === 'running' ? 'processing' : task.status
        });
        return items;
      }, []),
    [progressTasks]
  );

  const handleOpenAssetPicker = useCallback(
    (slot?: ImagePromptSlot) => {
      if (slot) setActiveSlot(slot);
      requestFullPromptCatalog();
      setIsPickerOpen(true);
    },
    [requestFullPromptCatalog]
  );

  // 保存:AssetEditModal 已做表单校验 + tags 解析,这里只负责持久化 + 刷新列表
  const saveEditedAsset = useCallback(
    async (payload: UserPromptAssetSaveInput) => {
      const updated = await saveUserPromptAsset(payload);
      setUserAssets((prev) =>
        prev.map((item) => (item.id === updated.id ? updated : item))
      );
      void completeRewardTaskOnce(
        REWARD_TASK_IDENTIFIERS.savePromptCaseOrPromptAsset
      );
      setStatusText(t('mine.editSaved') as string);
    },
    [setStatusText, setUserAssets, t]
  );

  const dateLocale = language === 'en-US' ? 'en-US' : 'zh-CN';
  const studioRecipeSlots = useMemo<ImageStudioRecipeSlot[]>(() => {
    const getGroup = (
      slot: ImagePromptSlot
    ): ImageStudioRecipeSlot['group'] => {
      if (['character', 'expression', 'hairstyle', 'makeup'].includes(slot)) {
        return '人物';
      }
      if (
        ['top', 'bottom', 'outfit', 'onePiece', 'shoes', 'accessory'].includes(
          slot
        )
      ) {
        return '穿搭';
      }
      if (['pose', 'shot', 'viewpoint'].includes(slot)) return '动作';
      if (['background', 'prop'].includes(slot)) return '场景';
      if (slot === 'lens') return '镜头';
      return '画面';
    };
    return composerImagePromptSlots
      .filter((slot) => composerAssets.some((asset) => asset.slot === slot.id))
      .map((slot) => ({
        id: slot.id,
        label: getSlotLabel(slot.id),
        group: getGroup(slot.id),
        optional: slot.randomInclusionRate < 1
      }));
  }, [composerAssets, getSlotLabel]);
  const sessionConversation = useImageSessionConversation(sessionTurns);
  const toggleHistoryFavorite = useCallback(
    async (item: VisualImageHistoryItem) => {
      if (!hasApiAuth) {
        requestLogin('image_favorite_gate');
        return;
      }
      if (favoriteLoadingIds.has(item.id)) return;
      setFavoriteLoadingIds((current) => new Set(current).add(item.id));
      try {
        const result = await setVisualImageFavorite(item.id, !item.isFavorite);
        const updated = { ...item, isFavorite: result.isFavorite };
        updateGenerationHistoryItem(updated);
        sessionConversation.updateHistoryItem(updated);
        setPreviewItem((current) =>
          current?.id === updated.id ? { ...current, ...updated } : current
        );
        setFullGenerationHistory((current) =>
          current.map((entry) =>
            entry.id === updated.id ? { ...entry, ...updated } : entry
          )
        );
        setHistoryLightboxItems((current) =>
          current.map((entry) =>
            entry.id === updated.id ? { ...entry, ...updated } : entry
          )
        );
        if (historyGalleryCacheRef.current) {
          historyGalleryCacheRef.current = {
            ...historyGalleryCacheRef.current,
            items: historyGalleryCacheRef.current.items.map((entry) =>
              entry.id === updated.id ? { ...entry, ...updated } : entry
            )
          };
        }
        const message = result.isFavorite ? '已加入收藏' : '已取消收藏';
        if (result.isFavorite && journeyEnabled && activation.activated) {
          favoriteCountRef.current += 1;
          if (
            favoriteCountRef.current >= 2 &&
            !hasSeenActivationTeachingHint('moodboard') &&
            !moodboardHintShownRef.current &&
            recordActivationTeachingHintShown('moodboard')
          ) {
            moodboardHintShownRef.current = true;
            setTeachingHint('moodboard');
          }
        }
        setStatusText(message);
        showToast(message);
      } catch (favoriteError) {
        setGenerationError(
          favoriteError instanceof Error
            ? favoriteError.message
            : '收藏状态更新失败'
        );
      } finally {
        setFavoriteLoadingIds((current) => {
          const next = new Set(current);
          next.delete(item.id);
          return next;
        });
      }
    },
    [
      favoriteLoadingIds,
      hasApiAuth,
      journeyEnabled,
      activation.activated,
      requestLogin,
      sessionConversation,
      setGenerationError,
      setStatusText,
      showToast,
      updateGenerationHistoryItem
    ]
  );
  const handleCopySessionPrompt = useCallback(
    async (prompt: string) => {
      const copied = await writeToClipboard(prompt);
      if (copied) showToast('提示词已复制');
      return copied;
    },
    [showToast, writeToClipboard]
  );
  const openImageEditorFromSessionItem = useCallback(
    (item: CreationSessionHistoryItem) => {
      const entry = createImageEditorEntryState(item);
      if (!entry) return;
      navigate(localizeCreateHref('/tools/image-editor', createLocalePrefix), {
        state: entry
      });
    },
    [createLocalePrefix, navigate]
  );
  const selectedStudioModel =
    modelOptions.find((model) => model.value === settings.model) ||
    modelOptions[0];
  const isPromptCaseAdmin =
    user?.email?.trim().toLowerCase() === 'admin@example.com';
  const sharedGenerationHistory = useMemo(
    () =>
      [...generationHistory, ...videoGenerationHistory].sort((left, right) => {
        const leftTime = new Date(left.createdAt || 0).getTime();
        const rightTime = new Date(right.createdAt || 0).getTime();
        return rightTime - leftTime;
      }),
    [generationHistory, videoGenerationHistory]
  );
  const shouldShowGenerationRecordsRail =
    generationHistoryTotal > 0 ||
    generationHistory.length > 0 ||
    videoGenerationHistory.length > 0 ||
    progressTasks.length > 0;
  const firstCreationMode =
    journeyEnabled &&
    generationHistoryLoaded &&
    generationHistoryTotal === 0 &&
    generationHistory.length === 0 &&
    sessionTurns.length === 0 &&
    sessionProgressTasks.length === 0 &&
    (activation.unavailable || !activation.activated);
  const committedStarterCaseTitle = imageStudioStarterCases.find(
    (caseItem) => caseItem.id === committedRecipeId
  )?.title;
  const activationContextLabel =
    journeyEnabled && firstCreationMode
      ? committedRecipeId && committedStarterCaseTitle
        ? `正在复刻案例「${committedStarterCaseTitle}」`
        : activeMoodboard
          ? `正在使用情绪板「${activeMoodboard.name}」`
          : effectiveReferenceIds.length > 0
            ? `正在使用 ${Math.min(effectiveReferenceIds.length, 4)} 张参考图`
            : selectedCharacterIds.length > 0
              ? `正在使用 ${Math.min(selectedCharacterIds.length, 2)} 个角色`
              : ''
      : '';
  useEffect(() => {
    if (!generationHistoryLoaded) return;
    firstSuccessEligibleRef.current =
      generationHistoryTotal === 0 && generationHistory.length === 0;
  }, [
    generationHistory.length,
    generationHistoryLoaded,
    generationHistoryTotal
  ]);
  useEffect(() => {
    if (!firstCreationMode) return;
    if (!firstGenerateCtaViewTrackedRef.current) {
      firstGenerateCtaViewTrackedRef.current = true;
      trackImageGenerationEvent('first_generate_cta_view', {
        cta_source: createEntrySource,
        entry_path: createEntryPath,
        estimated_credits: estimatedCost
      });
    }
    const hasCreationContext = Boolean(
      customPromptText.trim() ||
      effectiveReferenceIds.length > 0 ||
      committedRecipeId ||
      activeMoodboard
    );
    if (hasCreationContext && !activationContextReadyTrackedRef.current) {
      activationContextReadyTrackedRef.current = true;
      trackImageGenerationEvent('activation_context_ready', {
        cta_source: createEntrySource,
        entry_path: createEntryPath,
        context_kind: activeMoodboard
          ? 'moodboard'
          : committedRecipeId
            ? 'recipe'
            : effectiveReferenceIds.length > 0
              ? 'reference'
              : 'prompt',
        estimated_credits: estimatedCost
      });
    }
  }, [
    activeMoodboard,
    committedRecipeId,
    createEntryPath,
    createEntrySource,
    customPromptText,
    effectiveReferenceIds.length,
    estimatedCost,
    firstCreationMode
  ]);

  useEffect(() => {
    if (!firstCreationMilestone || milestoneMoodboards !== null) return;
    let cancelled = false;
    listMoodboards()
      .then((boards) => {
        if (cancelled) return;
        setMilestoneMoodboards(boards);
        setMilestoneMoodboardSelectedId(
          (current) => current || boards[0]?.id || ''
        );
      })
      .catch(() => {
        if (!cancelled) setMilestoneMoodboards([]);
      });
    return () => {
      cancelled = true;
    };
  }, [firstCreationMilestone, milestoneMoodboards]);

  useEffect(() => {
    if (
      !journeyEnabled ||
      activation.loading ||
      !activation.activated ||
      !generationHistoryLoaded
    ) {
      return;
    }
    if (hasActivationReturnVisit()) {
      const hasRealHistory =
        generationHistoryTotal > 0 || generationHistory.length > 0;
      if (
        hasRealHistory &&
        !hasSeenActivationTeachingHint('history') &&
        !historyHintShownRef.current &&
        recordActivationTeachingHintShown('history')
      ) {
        historyHintShownRef.current = true;
        const timer = window.setTimeout(() => {
          setTeachingHint('history');
        }, 1600);
        return () => window.clearTimeout(timer);
      }
    } else {
      markActivationReturnVisit();
    }
    return undefined;
  }, [
    activation.activated,
    activation.loading,
    generationHistory.length,
    generationHistoryLoaded,
    generationHistoryTotal,
    journeyEnabled
  ]);

  const handleMilestoneMoodboardSave = useCallback(async () => {
    const item = firstMilestoneItemRef.current;
    const boardId = milestoneMoodboardSelectedId;
    if (!boardId) {
      navigate(`${createLocalePrefix}/moodboards/new`);
      return;
    }
    if (!item || milestoneMoodboardSaving || milestoneMoodboardSaved) return;
    setMilestoneMoodboardSaving(true);
    try {
      await addMoodboardItems(boardId, [
        {
          source: 'generation',
          imageUrl: item.imageUrl,
          title: item.prompt.slice(0, 60),
          prompt: item.prompt,
          imageGenerationId: item.id
        }
      ]);
      setMilestoneMoodboardSaved(true);
      setStatusText('已加入情绪板');
    } catch (saveError) {
      setGenerationError(
        saveError instanceof Error ? saveError.message : '加入情绪板失败'
      );
    } finally {
      setMilestoneMoodboardSaving(false);
    }
  }, [
    createLocalePrefix,
    milestoneMoodboardSaved,
    milestoneMoodboardSaving,
    milestoneMoodboardSelectedId,
    navigate,
    setGenerationError,
    setStatusText
  ]);

  const characterWorkflowModalRef = useOverlayBehavior<HTMLElement>({
    open: characterWorkflowOpen,
    onClose: () => setCharacterWorkflowOpen(false)
  });
  const upgradePromptModalRef = useOverlayBehavior<HTMLElement>({
    open: upgradePromptOpen,
    onClose: () => setUpgradePromptOpen(false)
  });

  return (
    <div
      className={`image-create-page image-create-page-with-side-nav image-create-page-without-mininav${imageStudioV2Enabled ? ' image-studio-v2' : ''}`}
    >
      <CreateSideNav />

      <main className="image-create-shell creator-image-studio-shell">
        <h1 style={visuallyHiddenHeadingStyle}>
          {t('hero.title', 'WebToMind 图像创作台') as string}
        </h1>
        <section
          className="creator-workbench creator-workbench-tricolumn"
          aria-label={t('studioTabs.visual') as string}
          data-has-records={shouldShowGenerationRecordsRail ? 'true' : 'false'}
        >
          <section
            ref={creatorCenterColumnRef}
            className="creator-center-column"
            aria-label="提示词与当前配方"
          >
            {!imageStudioV2Enabled ? (
              <div className="creator-studio-model-switch">
                <details
                  className="creator-model-picker"
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      event.currentTarget.removeAttribute('open');
                    }
                  }}
                  onBlur={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget)) {
                      event.currentTarget.removeAttribute('open');
                    }
                  }}
                >
                  <summary
                    aria-label={
                      language === 'en-US' ? 'Choose model' : '选择模型'
                    }
                  >
                    <span>{language === 'en-US' ? 'Model' : '模型'}</span>
                    <strong>{selectedStudioModel?.label}</strong>
                    {selectedStudioModel?.badges?.[0] ? (
                      <em>{selectedStudioModel.badges[0]}</em>
                    ) : null}
                    <ChevronDown aria-hidden="true" />
                  </summary>
                  <div
                    className="creator-model-menu"
                    role="listbox"
                    aria-label={
                      language === 'en-US' ? 'Image models' : '图像模型'
                    }
                  >
                    <header>
                      <div>
                        <span>
                          {language === 'en-US' ? 'Image models' : '图像模型'}
                        </span>
                        <strong>
                          {language === 'en-US'
                            ? 'Choose for this generation'
                            : '选择本轮创作模型'}
                        </strong>
                      </div>
                      <small>
                        {selectableModelOptions.length}{' '}
                        {language === 'en-US' ? 'available' : '个可用模型'}
                      </small>
                    </header>
                    <div className="creator-model-menu-list">
                      {modelOptions.map((model) => (
                        <button
                          key={model.value}
                          type="button"
                          role="option"
                          aria-selected={model.value === settings.model}
                          disabled={model.status === 'unavailable'}
                          onClick={(event) => {
                            routeImportUserEditVersionRef.current += 1;
                            setSettings((current) => ({
                              ...current,
                              model: model.value,
                              ...resolveRecommendedImageSettingsForModel(
                                model,
                                current.imageSize
                              )
                            }));
                            event.currentTarget
                              .closest('details')
                              ?.removeAttribute('open');
                          }}
                        >
                          <span className="creator-model-menu-icon">
                            {model.supportsReferenceImage ? (
                              <ImageIcon />
                            ) : (
                              <Sparkles />
                            )}
                          </span>
                          <span className="creator-model-menu-copy">
                            <strong>{model.label}</strong>
                            <small>{model.description}</small>
                            <em>
                              <Zap aria-hidden="true" />×
                              {model.creditMultiplier || 1}{' '}
                              {language === 'en-US' ? 'credits' : '积分倍率'}
                              {model.supportsReferenceImage
                                ? ` · ${language === 'en-US' ? 'Reference image' : '支持参考图'}`
                                : ''}
                            </em>
                          </span>
                          {model.value === settings.model ? (
                            <Check
                              className="creator-model-menu-check"
                              aria-hidden="true"
                            />
                          ) : null}
                        </button>
                      ))}
                    </div>
                  </div>
                </details>
                <small>
                  {selectedStudioModel?.description ||
                    (language === 'en-US'
                      ? 'Choose the model for this generation.'
                      : '选择本轮创作使用的图像模型。')}
                </small>
              </div>
            ) : null}
            {!imageStudioV2Enabled && activeMoodboard ? (
              <section className="creator-moodboard-context" role="status">
                <BookImage aria-hidden="true" />
                <div>
                  <span>Moodboard</span>
                  <strong>{activeMoodboard.name}</strong>
                  <small>
                    {activeMoodboard.analysisStatus === 'ready'
                      ? activeMoodboard.keywords.slice(0, 3).join(' / ')
                      : language === 'en-US'
                        ? 'References attached'
                        : '已引用视觉参考'}
                  </small>
                </div>
                <button
                  type="button"
                  aria-label={
                    language === 'en-US' ? 'Remove moodboard' : '移除 Moodboard'
                  }
                  onClick={() => {
                    setActiveMoodboard(null);
                    const moodboardReferenceIds = new Set(
                      [
                        ...activeMoodboard.representativeAssetIds,
                        ...(activeMoodboard.items || []).map(
                          (item) => item.imageReferenceId
                        )
                      ].filter(Boolean)
                    );
                    setSelectedReferenceIds((current) =>
                      current.filter((id) => !moodboardReferenceIds.has(id))
                    );
                    const params = new URLSearchParams(location.search);
                    params.delete('moodboardId');
                    params.delete('shareToken');
                    navigate(
                      `${location.pathname}${params.size ? `?${params}` : ''}`,
                      { replace: true }
                    );
                  }}
                >
                  <X aria-hidden="true" />
                </button>
              </section>
            ) : null}

            {!imageStudioV2Enabled &&
            activeSessionId &&
            sessionTurns.length > 0 ? (
              <section
                className="creator-session-transcript"
                aria-label={
                  language === 'en-US'
                    ? 'Current creation session'
                    : '当前创作会话'
                }
              >
                <header>
                  <span>
                    {language === 'en-US' ? 'Current session' : '当前会话'}
                  </span>
                  <small>
                    {sessionTurns.length}{' '}
                    {language === 'en-US' ? 'turns' : '轮创作'}
                  </small>
                </header>
                <ol>
                  {sessionTurns.slice(-4).map((turn) => (
                    <li key={turn.id} data-status={turn.status}>
                      <span>{turn.prompt}</span>
                      <em>{turn.status}</em>
                    </li>
                  ))}
                </ol>
              </section>
            ) : null}

            {imageStudioV2Enabled &&
            !skillActive &&
            sessionTurns.length === 0 &&
            sessionProgressTasks.length === 0 ? (
              <RecipePresetGallery
                cases={imageStudioStarterCases}
                loading={imageStudioStarterCasesLoading}
                activeRecipeId={committedRecipeId}
                onPreview={setStarterCasePreviewPrompt}
                onCommit={handleCommitStarterCase}
              />
            ) : null}

            {imageStudioV2Enabled &&
            (sessionTurns.length > 0 || sessionProgressTasks.length > 0) ? (
              <ImageSessionConversation
                turns={sessionTurns}
                progressTasks={sessionProgressTasks}
                historyById={sessionConversation.historyById}
                missingIds={sessionConversation.missingIds}
                loading={sessionConversation.loading}
                isEnglish={language === 'en-US'}
                onEditInEditor={openImageEditorFromSessionItem}
                onPreview={(item) => {
                  if ('videoUrl' in item) return;
                  setPreviewItem(item);
                  setHistoryLightboxItems([]);
                }}
                onDownload={(item) => {
                  if (!('videoUrl' in item)) downloadHistoryOriginalImage(item);
                }}
                onRegenerate={(item) => {
                  if (!('videoUrl' in item)) void regenerateFromHistory(item);
                }}
                onReedit={(item) => {
                  if (!('videoUrl' in item)) reeditFromHistory(item);
                }}
                onRetryTurn={(turn) => void retryFailedTurn(turn)}
                onFavorite={(item) => {
                  if (!('videoUrl' in item)) void toggleHistoryFavorite(item);
                }}
                onDelete={async (item) => {
                  if ('videoUrl' in item) return;
                  await deleteFromHistory(item);
                  sessionConversation.removeHistoryItems([item.id]);
                }}
                onCopyPrompt={handleCopySessionPrompt}
                activationMilestone={firstCreationMilestone}
                onActivationAction={(action) => {
                  trackImageGenerationEvent('first_result_next_action', {
                    action,
                    cta_source: createEntrySource,
                    entry_path: createEntryPath
                  });
                }}
                moodboardSave={
                  journeyEnabled && firstCreationMilestone
                    ? {
                        boards: milestoneMoodboards || [],
                        selectedBoardId: milestoneMoodboardSelectedId,
                        prefix: createLocalePrefix,
                        isEnglish: language === 'en-US',
                        saved: milestoneMoodboardSaved,
                        saving: milestoneMoodboardSaving,
                        onSelectBoard: setMilestoneMoodboardSelectedId,
                        onSave: () => void handleMilestoneMoodboardSave()
                      }
                    : null
                }
              />
            ) : null}

            {!imageStudioV2Enabled ? (
              <Suspense
                fallback={
                  <div className="creator-legacy-panel-loading" role="status">
                    正在加载创作器…
                  </div>
                }
              >
                <CreatorCanvas
                  compiled={effectiveCompiled}
                  selection={selection}
                  mergedAssets={composerAssets}
                  activeSlot={activeSlot}
                  onActiveSlotChange={setActiveSlot}
                  getSlotLabel={getSlotLabel}
                  onClearSlot={handleClearSlot}
                  onClearSelection={handleClearSelection}
                  onOpenPicker={handleOpenAssetPicker}
                  onApplySelectionToPrompt={handleApplySelectionToPrompt}
                  emphasizeApplyToPrompt={hasUnappliedSelectionChanges}
                  onRandomizeSelection={handleRandomizeSelection}
                  onRandomizeSlot={handleRandomizeSlot}
                  materialSelection={wardrobeMaterials}
                  onMaterialChange={handleMaterialChange}
                  onImportAsset={(asset) =>
                    void handleImportReverseAsset(asset)
                  }
                  importingAssetIds={reverseImportingAssetIds}
                />

                <PromptCompilerPanel
                  compiled={effectiveCompiled}
                  copied={copied}
                  onCopyPrompt={handleCopyPrompt}
                  autoOptimizePrompt={autoOptimizePrompt}
                  autoOptimizePending={promptOptimizingBeforeGenerate}
                  onAutoOptimizePromptChange={setAutoOptimizePrompt}
                  customPromptText={
                    starterCasePreviewPrompt ?? customPromptText
                  }
                  combinationPromptPending={hasUnappliedSelectionChanges}
                  onApplyCombinationPrompt={handleReplacePromptWithSelection}
                  customNegativePromptText=""
                  onCustomPromptChange={(value) => {
                    routeImportUserEditVersionRef.current += 1;
                    setCustomPromptText(value);
                  }}
                  onCustomNegativePromptChange={() => undefined}
                  isPromptExpanded={isPromptExpanded}
                  openSignal={promptEditorOpenSignal}
                  onToggleExpand={() => setIsPromptExpanded((value) => !value)}
                  isAuthenticated={hasApiAuth}
                  settings={settings}
                  models={modelOptions}
                  onSettingsChange={(nextSettings) => {
                    routeImportUserEditVersionRef.current += 1;
                    setSettings(nextSettings);
                  }}
                  imageCount={settings.imageCount}
                  onImageCountChange={handleImageCountChange}
                  estimatedCost={estimatedCost}
                  insufficientCredits={insufficientCredits}
                  showLowBalanceTopUp={showLowBalanceTopUp}
                  onLowBalanceTopUp={handleLowBalanceTopUp}
                  onGenerate={() => void handleGenerateRequest()}
                  uploadStage={uploadStage}
                  uploadError={!promptImportOpen ? uploadError : ''}
                  generationError={error || runtimeModelAvailabilityError}
                  generationDisabled={runtimeGenerationDisabled}
                  onOpenReverseUpload={() => {
                    if (!hasApiAuth) {
                      requestLogin('reverse_upload_gate');
                      return;
                    }
                    uploadInputRef.current?.click();
                  }}
                  onOpenReferenceUpload={handleOpenReferenceUpload}
                  referenceUploadItems={referenceUploadItems}
                  referenceMentions={promptReferenceMentions}
                  onRemoveReferenceUpload={handleRemoveReferenceUpload}
                  selectedGalleryReferenceCount={
                    historyReferenceGenerationIds.length
                  }
                  selectedCharacterCount={selectedCharacterIds.length}
                  onOpenCharacterWorkflow={openCharacterPickerWithPaywall}
                  onOpenHistoryReferencePicker={
                    openHistoryReferencePickerWithPaywall
                  }
                  onRandomPrompt={handleRandomPrompt}
                  showReverseImport={Boolean(
                    reverseSession && !reverseSession.imported
                  )}
                  reverseImporting={reverseImporting}
                  reverseImportDisabled={
                    reverseImporting || reverseImportingAssetIds.size > 0
                  }
                  reverseImported={Boolean(reverseSession?.imported)}
                  onImportReverseSession={() =>
                    void handleImportReverseSession()
                  }
                  presetSaved={presetSaved}
                  onSavePreset={handleSavePreset}
                  onReset={handleReset}
                  presets={presets}
                  promptLibrary={promptLibrary}
                  progressTasks={legacyProgressTasks}
                  progressTaskCount={visibleProgressTaskCount}
                  progressActiveTaskCount={activeProgressTaskCount}
                  isMember={membership.isMember}
                  membershipLoading={membership.loading}
                  onRequestMembership={(source) =>
                    openDeepPaywall('workflow', source)
                  }
                  onApplyPreset={(id) => {
                    const preset = presets.find((item) => item.id === id);
                    if (preset) handleApplyPreset(preset);
                  }}
                  onDeletePreset={handleDeletePreset}
                  onApplyPromptLibraryItem={handleApplyPromptLibraryItem}
                  onRenamePromptLibraryItem={handleRenamePromptLibraryItem}
                  onDeletePromptLibraryItem={handleDeletePromptLibraryItem}
                  onCopyPromptLibraryItem={(id) =>
                    void handleCopyPromptLibraryItem(id)
                  }
                  dateLocale={dateLocale}
                  promptLocale={promptLocale}
                  presentation="inline"
                />
              </Suspense>
            ) : null}

            {imageStudioV2Enabled ? (
              <>
                {activationContextLabel ? (
                  <div
                    className="activation-context-banner"
                    role="status"
                    aria-label="创作上下文"
                  >
                    <Sparkles aria-hidden="true" />
                    <span>{activationContextLabel}</span>
                  </div>
                ) : null}
                <ImageStudioComposer
                  prompt={starterCasePreviewPrompt ?? recipeConditionedPrompt}
                  promptPreviewActive={starterCasePreviewPrompt !== null}
                  onPromptChange={handleStudioPromptChange}
                  settings={settings}
                  models={modelOptions}
                  onSettingsChange={(update) => {
                    routeImportUserEditVersionRef.current += 1;
                    setSettings(update);
                  }}
                  conditioningMode={conditioningMode}
                  boards={moodboards}
                  boardsLoading={moodboardsLoading}
                  activeMoodboard={activeMoodboard}
                  onSelectMoodboard={handleSelectMoodboard}
                  onClearMoodboard={clearMoodboardContext}
                  onCreateMoodboard={() =>
                    navigate(`${createLocalePrefix}/moodboards/new`)
                  }
                  recipeSlots={studioRecipeSlots}
                  assets={composerAssets}
                  selection={recipeDraftSelection}
                  recipeOpenSignal={recipeOpenSignal}
                  requestedRecipeSlot={activeSlot}
                  onRandomizeRecipe={handleRandomizeRecipeDraft}
                  onRandomizeSlot={handleRandomizeRecipeDraftSlot}
                  onToggleRecipeAsset={handleSelectRecipeDraftAsset}
                  onRequestRecipeAssets={requestPromptCatalogSlot}
                  onPrefetchRecipeAssets={library.prefetchPublicSlot}
                  onClearRecipe={handleClearRecipeDraft}
                  onApplyRecipe={handleApplyRecipeDraft}
                  referenceUploadItems={referenceUploadItems}
                  referenceMentions={promptReferenceMentions}
                  selectedReferenceCount={selectedReferenceIds.length}
                  selectedCharacterCount={selectedCharacterIds.length}
                  onMentionReference={handleMentionStudioReference}
                  onRemoveReference={handleRemoveStudioReference}
                  onOpenReferenceUpload={handleOpenReferenceUpload}
                  onPasteReferenceImages={handleReferenceFiles}
                  onOpenHistoryReferencePicker={
                    openHistoryReferencePickerWithPaywall
                  }
                  onOpenCharacterWorkflow={openCharacterPickerWithPaywall}
                  autoOptimizePrompt={autoOptimizePrompt}
                  autoOptimizePending={promptOptimizingBeforeGenerate}
                  onAutoOptimizePromptChange={setAutoOptimizePrompt}
                  promptLibrary={promptLibrary}
                  onApplyPromptLibraryItem={handleApplyPromptLibraryItem}
                  onSavePrompt={handleSavePreset}
                  onReset={handleReset}
                  onImageCountChange={handleImageCountChange}
                  isMember={membership.isMember}
                  membershipLoading={membership.loading}
                  onRequestMembership={(source) =>
                    openDeepPaywall('workflow', source)
                  }
                  onGenerate={() => void handleGenerateRequest()}
                  generating={
                    promptOptimizingBeforeGenerate ||
                    activeProgressTaskCount > 0
                  }
                  generationDisabled={runtimeGenerationDisabled}
                  firstCreationMode={firstCreationMode}
                  estimatedCost={estimatedCost}
                  estimatedUnitCost={unitCost}
                  error={
                    error ||
                    runtimeModelAvailabilityError ||
                    (toastTone === 'error' ? toastText : '')
                  }
                  statusText={toastTone === 'info' ? toastText : ''}
                  skillActive={skillActive}
                  skillEnabled={SKILL_IMAGE_CREATION_ENABLED}
                  activeSkillModeId={activeSkillModeId}
                  onSkillModeChange={handleSkillModeChange}
                  onExitSkillMode={handleExitSkillMode}
                  onSkillGenerate={() => void handleSkillGenerate()}
                  skillGenerating={skillGenerating}
                />
              </>
            ) : null}
          </section>

          {!imageStudioV2Enabled && shouldShowGenerationRecordsRail ? (
            <Suspense fallback={null}>
              <ImageGenerationRecordsPanel
                showGenerationRecords={shouldShowGenerationRecordsRail}
                tasks={progressTasks}
                historyItems={sharedGenerationHistory}
                historyTotal={
                  generationHistoryTotal + videoGenerationHistory.length
                }
                activeGenerationId={activeGenerationId}
                dateLocale={dateLocale}
                onPreview={(item) => {
                  setPreviewItem(item);
                  setHistoryLightboxItems([]);
                }}
                onPreviewVideo={setPreviewVideoItem}
                onRegenerate={(item) => void regenerateFromHistory(item)}
                onFavorite={(item) => void toggleHistoryFavorite(item)}
                onDownload={downloadHistoryOriginalImage}
                onViewMoreHistory={() => void openHistoryGallery('preview')}
                promptCasesProps={{
                  isAuthenticated: hasApiAuth,
                  isPromptCaseAdmin,
                  onRequireLogin: (source = 'prompt_cases_panel') =>
                    requestLogin(source),
                  onRecreate: handleRecreatePromptCase,
                  variant: 'rail',
                  shareCaseId: sharedPromptCaseId,
                  buildShareUrl: buildPromptCaseShareUrl,
                  shareAccessToken: getAccessToken(),
                  onClearSharedCase: clearSharedPromptCase,
                  onOpenMembershipUpsell: (source) =>
                    openDeepPaywall('prompt_case', source)
                }}
              />
            </Suspense>
          ) : null}
        </section>
      </main>

      <DeepFeaturePaywallModal
        open={Boolean(deepPaywall)}
        kind={deepPaywall?.kind || 'workflow'}
        source={deepPaywall?.source}
        localePrefix={createLocalePrefix}
        isAuthenticated={hasApiAuth}
        onClose={() => setDeepPaywall(null)}
        onContinue={() => deepPaywall?.onContinue?.()}
      />

      <input
        ref={uploadInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        aria-label={t('upload.button') as string}
        onChange={handlePickUploadFile}
      />
      <input
        ref={referenceUploadInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        aria-label={t('references.upload.label') as string}
        onChange={(event) => void handlePickReferenceFiles(event)}
      />

      {characterPickerOpen && (
        <CharacterReferencePickerModal
          isAuthenticated={hasApiAuth}
          selectedCharacterIds={selectedCharacterIds}
          onSelectedCharacterIdsChange={setSelectedCharacterIds}
          onSelectedCharactersChange={handleSelectedCharactersChange}
          onSelectedReferenceIdsChange={setSelectedReferenceIds}
          onRequireLogin={() => requestLogin('character_picker_gate')}
          setError={setError}
          setStatusText={setStatusText}
          onClose={() => setCharacterPickerOpen(false)}
        />
      )}

      {characterWorkflowOpen && (
        <ImageCreateCharacterWorkflowModal
          modalRef={characterWorkflowModalRef}
          ariaLabel={t('controls.characterWorkflow.entry') as string}
          title={t('controls.characterWorkflow.entry') as string}
          hint={t('controls.characterWorkflow.entryHint') as string}
          closeLabel="关闭角色一致性工作流"
          isAuthenticated={hasApiAuth}
          onRequireLogin={() => requestLogin('character_workflow_gate')}
          selectedReferenceIds={selectedReferenceIds}
          selectedCharacterIds={selectedCharacterIds}
          onSelectedReferenceIdsChange={setSelectedReferenceIds}
          onSelectedCharacterIdsChange={setSelectedCharacterIds}
          onSelectedCharactersChange={handleSelectedCharactersChange}
          setError={setError}
          setStatusText={setStatusText}
          onClose={() => setCharacterWorkflowOpen(false)}
          onCharacterCreated={() =>
            void completeRewardTaskOnce(
              REWARD_TASK_IDENTIFIERS.useReferenceImage
            )
          }
          canCheckConsistency={
            Boolean(activeGenerationId) &&
            (characterReferenceGroups.length > 0 ||
              selectedReferenceIds.length > 0)
          }
          consistencyChecking={consistencyChecking}
          consistencyResult={consistencyResult}
          onCheckConsistency={() => void handleCheckConsistency()}
          onUseRepairPrompt={handleUseRepairPrompt}
          settings={settings as unknown as Record<string, unknown>}
          selection={selection as unknown as Record<string, unknown>}
          currentCharacterReferenceGroups={characterReferenceGroups}
          currentPrompt={customPromptText}
          currentNegativePrompt=""
          onApplyRecipe={handleApplyRecipe}
          onRunRecipe={(recipe) => void handleRunRecipe(recipe)}
        />
      )}

      {isPickerOpen && (
        <AssetPicker
          librarySource={librarySource}
          onLibrarySourceChange={setLibrarySource}
          assetSource={assetSource}
          assetLoadError={assetLoadError}
          isAuthenticated={hasApiAuth}
          onRequireLogin={() => requestLogin('asset_library_gate')}
          uploadStage={uploadStage}
          onOpenPromptImport={handleOpenPromptImport}
          activeSlot={activeSlot}
          onActiveSlotChange={setActiveSlot}
          getSlotLabel={getSlotLabel}
          query={query}
          onQueryChange={setQuery}
          activeTag={activeTag}
          onActiveTagChange={setActiveTag}
          slotTags={slotTags}
          filteredAssets={filteredAssets}
          selection={selection}
          onSelectAsset={handleSelectAsset}
          onClose={() => setIsPickerOpen(false)}
        />
      )}

      {historyGalleryOpen && (
        <HistoryGalleryModal
          mode={historyGalleryMode}
          items={fullGenerationHistory}
          total={fullGenerationHistoryTotal}
          loading={fullGenerationHistoryLoading}
          loadingMore={fullGenerationHistoryLoadingMore}
          error={fullGenerationHistoryError}
          dateLocale={dateLocale}
          onClose={() => setHistoryGalleryOpen(false)}
          onSelect={selectFromHistoryGallery}
          selectedIds={historyReferenceGenerationIds}
          importingId={historyReferenceImportingId}
          confirmingReferences={historyReferenceConfirming}
          onToggleReference={handleToggleHistoryReference}
          onConfirmReferences={confirmHistoryReferences}
          onLoadMore={() => void loadMoreHistoryGallery()}
        />
      )}

      {previewItem && (
        <HistoryPreviewModal
          item={previewItem}
          dateLocale={dateLocale}
          onClose={() => setPreviewItem(null)}
          onRegenerate={(item) => void regenerateFromHistory(item)}
          onReedit={reeditFromHistory}
          onDelete={deleteFromHistory}
          onCopyPrompt={writeToClipboard}
          onFavorite={(item) => void toggleHistoryFavorite(item)}
          favoriteLoading={favoriteLoadingIds.has(previewItem.id)}
          onDownloadOriginal={downloadHistoryOriginalImage}
          onLocalEdit={handleLocalEditFromHistory}
          onOpenImage={(item) =>
            openHistoryLightbox(
              item,
              previewNavigationItems.length > 0
                ? previewNavigationItems
                : [item]
            )
          }
          canNavigate={
            previewNavigationItems.length > 1 && previewItemIndex >= 0
          }
          onPrevious={() => goPreviewHistoryItem(-1)}
          onNext={() => goPreviewHistoryItem(1)}
          recipeAssets={previewRecipeAssets}
          getRecipeSlotLabel={getSlotLabel}
          onCreateFromRecipe={createFromHistoryRecipe}
        />
      )}

      {previewVideoItem && (
        <VideoHistoryPreviewDialog
          item={previewVideoItem}
          dateLocale={dateLocale}
          onClose={() => setPreviewVideoItem(null)}
        />
      )}

      {activeHistoryLightboxItem && (
        <PhotoSwipeViewer
          items={historyLightboxPhotoItems}
          index={historyLightboxIndex}
          onClose={() => setHistoryLightboxItems([])}
          onIndexChange={(nextIndex) => {
            setHistoryLightboxIndex(nextIndex);
            const nextItem = historyLightboxItems[nextIndex];
            if (nextItem) setPreviewItem(nextItem);
          }}
          onDownload={downloadHistoryLightboxItem}
        />
      )}

      {uploadDraft && (
        <UploadReverseModal
          thumbnailUrl={uploadDraft.thumbnailUrl}
          sourcePrompt={uploadDraft.sourcePrompt}
          rows={uploadDraft.rows}
          saving={uploadStage === 'saving'}
          error={uploadError}
          slots={composerImagePromptSlots}
          getSlotLabel={getSlotLabel}
          onUpdateRow={updateUploadRow}
          onRemoveRow={removeUploadRow}
          onAddRow={addBlankUploadRow}
          onCancel={handleCancelUploadDraft}
          onSave={() => void handleSaveUploadDraft()}
        />
      )}

      {promptImportOpen && (
        <PromptImportModal
          value={promptImportText}
          analyzing={uploadStage === 'analyzing'}
          error={uploadError}
          onChange={setPromptImportText}
          onCancel={handleCancelPromptImport}
          onSubmit={() => void handleSubmitPromptImport()}
        />
      )}

      <UpgradePromptModal
        ref={upgradePromptModalRef}
        open={upgradePromptOpen}
        message={upgradePromptMessage}
        estimatedCost={estimatedCost}
        creditsBalance={creditsBalance}
        onClose={() => setUpgradePromptOpen(false)}
        onUpgrade={({ plan, billing }) => {
          const returnTo = `${location.pathname}${location.search}${location.hash}`;
          navigate(
            `${createLocalePrefix}/create/pricing?source=credit_blocked&plan=${plan}&mode=${billing}&returnTo=${encodeURIComponent(returnTo)}`,
            {
              state: { returnTo }
            }
          );
        }}
      />

      {toastText && (
        <div
          className={`creator-toast ${
            toastTone === 'error' ? 'is-error' : 'is-info'
          }`}
          role={toastTone === 'error' ? 'alert' : 'status'}
          aria-live={toastTone === 'error' ? 'assertive' : 'polite'}
        >
          {toastText}
        </div>
      )}

      {journeyEnabled && teachingHint ? (
        <ActivationTeachingHint
          hint={teachingHint}
          onClose={() => {
            markActivationTeachingHintSeen(teachingHint);
            setTeachingHint(null);
          }}
          onDismiss={() => setTeachingHint(null)}
        />
      ) : null}

      {editingAsset && (
        <AssetEditModal
          key={editingAsset.id}
          initialAsset={editingAsset}
          slots={composerImagePromptSlots}
          getSlotLabel={getSlotLabel}
          onClose={() => setEditingAsset(null)}
          onSave={saveEditedAsset}
        />
      )}
    </div>
  );
}
