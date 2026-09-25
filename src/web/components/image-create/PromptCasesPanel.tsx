import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import type { CSSProperties } from 'react';
import type { ChangeEvent, KeyboardEvent } from 'react';
import type { SyntheticEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ChevronLeft,
  ChevronRight,
  Check,
  CheckCheck,
  Copy,
  ExternalLink,
  ImagePlus,
  Loader2,
  Lock,
  Maximize2,
  Pencil,
  PlayCircle,
  Plus,
  RefreshCw,
  Share2,
  Star,
  Trash2,
  Wand2,
  X
} from 'lucide-react';
import { PhotoSwipeViewer } from './PhotoSwipeViewer';
import { AssetThumb } from './AssetThumb';
import { PromptCaseDraftPublishAllDialog } from './PromptCaseDraftPublishAllDialog';
import { recordClientConversionEvent } from '@/web/lib/client-conversion-events';
import { getReferralShareCode } from '@/web/lib/referral-share';
import { Badge as ShadcnBadge } from '@/shared/ui/radix/badge';
import { Button as ShadcnButton } from '@/shared/ui/radix/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle
} from '@/shared/ui/radix/empty';
import { Input } from '@/shared/ui/radix/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/shared/ui/radix/select';
import { Skeleton } from '@/shared/ui/radix/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/shared/ui/radix/tabs';
import { triggerImageDownload } from './downloadImage';
import {
  trackPromptCaseCta,
  trackPromptCopy,
  trackPromptGenerate,
  trackPromptShareView,
  trackPricingView
} from '../../lib/analytics';
import {
  createAdminPromptCase,
  createAdminPromptCaseDraftFromImport,
  deleteAdminPromptCase,
  deleteAdminPromptCaseDraft,
  extractAdminPromptCaseDraftFromTweet,
  generateAdminPromptCaseDraftImages,
  getAdminPromptCase,
  getAdminPromptCases,
  getAdminPromptCaseDrafts,
  getPublicPromptCase,
  getPublicPromptCases,
  refreshVisualImageHistoryItem,
  publishAdminPromptCaseDraft,
  saveAdminPromptCase,
  saveAdminPromptCaseDraft,
  trackPromptCaseEvent,
  uploadAdminPromptCaseImageFile,
  type PromptCase,
  type PromptCaseDraft,
  type PromptCaseDraftStatus,
  type PromptCaseDraftImportInput,
  type VisualImageHistoryItem
} from '@/services/agent-api';
import { publishAllAdminPromptCaseDrafts } from '@/services/prompt-case-draft-publish';
import {
  getPromptCaseCreateSettings,
  getPromptCasePrimaryVideoUrl,
  getOptimizedPromptCaseImageUrl,
  getPromptCaseResponsiveImageSet,
  isPromptCaseVideo,
  sortPromptCasesByDisplayPriority
} from '@/utils/prompt-case';
import { getPromptCaseModelLabel } from '@/shared/prompt-case-model-labels';
import {
  Button,
  ButtonLink,
  Dialog,
  imageFetchPriority,
  useOverlayBehavior
} from '@/shared/ui';
import {
  completeRewardTaskOnce,
  REWARD_TASK_IDENTIFIERS
} from '@/services/reward-task-events';
import {
  imagePromptAssets,
  type ImagePromptSelection,
  type ImagePromptSlot
} from '../../data/image-prompt-core';
import { useImagePromptAssetCatalog } from '../../hooks/useImagePromptAssetCatalog';
import {
  normalizeVisualRecipeSelection,
  resolveVisualRecipeAssets
} from './assetLibraryResolver';
import { findPromptCasesSharingRecipeAssets } from './promptCaseRecipeExposure';

const PROMPT_CASE_CATEGORIES = [
  'featured',
  'portrait',
  'cover',
  'ecommerce',
  'fashion',
  'character',
  'background',
  'poster',
  'xiaohongshu',
  'wechat-cover',
  'video'
];
const PROMPT_CASE_CONTENT_CATEGORIES = PROMPT_CASE_CATEGORIES.filter(
  (category) => category !== 'featured'
);
const DEFAULT_PROMPT_CASE_CATEGORY = 'portrait';

function normalizeEditablePromptCaseCategory(category?: string): string {
  const normalized = category?.trim();
  return normalized && PROMPT_CASE_CONTENT_CATEGORIES.includes(normalized)
    ? normalized
    : DEFAULT_PROMPT_CASE_CATEGORY;
}

const ADMIN_SORT_MODES = [
  'default',
  'created-desc',
  'created-asc',
  'views',
  'copies',
  'generates',
  'generate-rate'
] as const;

const PROMPT_CASE_MODEL_PRESETS = [
  { value: 'gemini-image', label: 'Gemini Image' },
  { value: 'grok', label: 'Grok' },
  { value: 'grok-imagine', label: 'Grok Imagine' },
  { value: 'gpt-image-2', label: 'GPT Image 2' },
  { value: 'nano-banana', label: 'Nano Banana' },
  { value: 'seedance-2-0', label: 'Seedance 2.0' },
  { value: 'seedream-5-lite', label: 'Seedream 5.0 Lite' },
  { value: 'flux', label: 'Flux' },
  { value: 'z-image-turbo', label: 'Z-Image Turbo' }
];

const PROMPT_CASE_IMAGE_SIZE_PRESETS = [
  '1024x1536',
  '1536x1024',
  '1024x1024',
  '1344x2016',
  '2016x1344',
  '2048x2048'
];

const PROMPT_CASE_MOBILE_QUERY = '(max-width: 760px)';
const PROMPT_CASE_MOBILE_BATCH = 18;
const PROMPT_CASE_MOBILE_BATCH_FULL = 24;

type AdminSortMode = (typeof ADMIN_SORT_MODES)[number];
type AdminPanelTab = 'cases' | 'drafts';
type AdminCaseModalMode = 'create' | 'edit';

function getAdminPanelTabFromUrl(pathname: string, search = ''): AdminPanelTab {
  const queryTab = new URLSearchParams(search).get('tab');
  if (queryTab === 'drafts') return 'drafts';
  return /\/drafts\/?$/i.test(pathname) ? 'drafts' : 'cases';
}

function getPromptCaseAdminBasePath(pathname: string, localePrefix: string) {
  const withoutTab = pathname.replace(/\/(?:cases|drafts)\/?$/i, '');
  return /\/prompts\/admin\/?$/i.test(withoutTab)
    ? withoutTab.replace(/\/$/u, '')
    : `${localePrefix}/prompts/admin`;
}
type AdminFeaturedFilter = 'all' | 'featured';
const ADMIN_PROMPT_CASE_PAGE_SIZE = 100;

const COMMERCIAL_PACKAGE_OPTIONS = [
  'xiaohongshu-cover',
  'ecommerce-product-photo',
  'wechat-cover-poster',
  'portrait-character-consistency',
  'storefront-marketing-kit'
];

const DRAFT_STATUSES: PromptCaseDraftStatus[] = [
  'draft',
  'images_generated',
  'approved',
  'published',
  'rejected'
];

export interface PromptCasesPanelProps {
  isAuthenticated: boolean;
  isPromptCaseAdmin: boolean;
  onRequireLogin: (source?: string) => void;
  onRecreate: (payload: {
    prompt: string;
    model?: string;
    imageSize?: string;
    quality?: string;
    aspectRatio?: string;
    outputFormat?: string;
    visualRecipeSelection?: ImagePromptSelection;
    openAssetSlot?: ImagePromptSlot;
    remixSource?: {
      id?: string;
      title?: string;
      slug?: string;
      source?: string;
    };
  }) => void;
  variant?: 'panel' | 'full' | 'rail';
  forceManageOpen?: boolean;
  adminManageHref?: string;
  shareCaseId?: string | null;
  buildShareUrl?: (caseItem: PromptCase) => string;
  shareAccessToken?: string | null;
  onClearSharedCase?: () => void;
  onOpenMembershipUpsell?: (source: string) => void;
}

interface EditablePromptCase {
  id?: string;
  imageUrls: string[];
  title: string;
  slug: string;
  category: string;
  tags: string[];
  model: string;
  locale: string;
  featured: boolean;
  memberOnly: boolean;
  packageSlug: string;
  commercialIntent: string;
  promptPreview: string;
  visualRecipeText: string;
  prompt: string;
  authorUrl: string;
  isPublished: boolean;
}

interface DraftImportForm {
  tweetUrl: string;
  title: string;
  category: string;
  tagsText: string;
  prompt: string;
  negativePrompt: string;
  commercialIntent: string;
  imageUrls: string[];
  selectedImageUrl: string;
  memberOnly: boolean;
  reviewNotes: string;
  generationSettings: Record<string, unknown>;
}

interface DraftEditorForm {
  id: string;
  title: string;
  packageSlug: string;
  category: string;
  tagsText: string;
  locale: 'zh-CN' | 'en-US';
  prompt: string;
  negativePrompt: string;
  commercialIntent: string;
  imageUrls: string[];
  selectedImageUrl: string;
  memberOnly: boolean;
  status: PromptCaseDraftStatus;
  reviewNotes: string;
  model: string;
  imageSize: string;
  sourceUrl: string;
  generationSettings: PromptCaseDraft['generationSettings'];
}

function createEmptyDraftImportForm(): DraftImportForm {
  return {
    tweetUrl: '',
    title: '',
    category: DEFAULT_PROMPT_CASE_CATEGORY,
    tagsText: '',
    prompt: '',
    negativePrompt: '',
    commercialIntent: '',
    imageUrls: [],
    selectedImageUrl: '',
    memberOnly: false,
    reviewNotes: '',
    generationSettings: {
      model: 'gpt-image-2',
      imageSize: '1024x1536',
      quality: 'auto',
      imageCount: 1
    }
  };
}

function createEmptyDraftEditorForm(): DraftEditorForm {
  return {
    id: '',
    title: '',
    packageSlug: '',
    category: DEFAULT_PROMPT_CASE_CATEGORY,
    tagsText: '',
    locale: 'zh-CN',
    prompt: '',
    negativePrompt: '',
    commercialIntent: '',
    imageUrls: [],
    selectedImageUrl: '',
    memberOnly: false,
    status: 'draft',
    reviewNotes: '',
    model: 'gpt-image-2',
    imageSize: '1024x1536',
    sourceUrl: '',
    generationSettings: {
      model: 'gpt-image-2',
      imageSize: '1024x1536',
      quality: 'auto',
      imageCount: 1
    }
  };
}

function toDraftImportForm(
  draft: PromptCaseDraftImportInput,
  tweetUrl = ''
): DraftImportForm {
  return {
    tweetUrl,
    title: draft.title || '',
    category: normalizeEditablePromptCaseCategory(draft.category),
    tagsText: Array.isArray(draft.tags) ? draft.tags.join(', ') : '',
    prompt: draft.prompt || '',
    negativePrompt: draft.negativePrompt || '',
    commercialIntent: draft.commercialIntent || '',
    imageUrls: Array.isArray(draft.imageUrls) ? draft.imageUrls : [],
    selectedImageUrl:
      draft.selectedImageUrl ||
      (Array.isArray(draft.imageUrls) ? draft.imageUrls[0] : '') ||
      '',
    memberOnly: draft.memberOnly === true,
    reviewNotes: draft.reviewNotes || '',
    generationSettings: draft.generationSettings || {
      model: 'gpt-image-2',
      imageSize: '1024x1536',
      quality: 'auto',
      imageCount: draft.imageUrls?.length || 1
    }
  };
}

function toDraftEditorForm(draft?: PromptCaseDraft): DraftEditorForm {
  if (!draft) return createEmptyDraftEditorForm();
  return {
    id: draft.id,
    title: draft.title || '',
    packageSlug: draft.packageSlug || '',
    category: normalizeEditablePromptCaseCategory(draft.category),
    tagsText: draft.tags
      .filter((tag) => tag !== 'zh-CN' && tag !== 'en-US')
      .join(', '),
    locale: getDraftLocale(draft),
    prompt: draft.prompt || '',
    negativePrompt: draft.negativePrompt || '',
    commercialIntent: draft.commercialIntent || '',
    imageUrls: Array.isArray(draft.imageUrls) ? draft.imageUrls : [],
    selectedImageUrl:
      draft.selectedImageUrl ||
      (Array.isArray(draft.imageUrls) ? draft.imageUrls[0] : '') ||
      '',
    memberOnly: draft.memberOnly === true,
    status: draft.status,
    reviewNotes: draft.reviewNotes || '',
    model: getDraftModel(draft),
    imageSize: getDraftImageSize(draft),
    sourceUrl: getDraftSourceUrl(draft),
    generationSettings: draft.generationSettings || {
      model: 'gpt-image-2',
      imageSize: '1024x1536',
      quality: 'auto',
      imageCount: draft.imageUrls?.length || 1
    }
  };
}

function getDraftImportSourceUrl(form: DraftImportForm): string {
  const value = form.generationSettings.sourceUrl;
  return typeof value === 'string' && value.trim()
    ? value.trim()
    : form.tweetUrl.trim();
}

function buildDraftImportPayload(
  form: DraftImportForm
): PromptCaseDraftImportInput {
  const sourceUrl = getDraftImportSourceUrl(form);
  return {
    title: form.title.trim(),
    category: form.category,
    tags: form.tagsText
      .split(/[,，\n]/)
      .map((tag) => tag.trim())
      .filter(Boolean),
    prompt: form.prompt.trim(),
    negativePrompt: form.negativePrompt.trim() || undefined,
    commercialIntent: form.commercialIntent.trim() || undefined,
    generationSettings: {
      ...form.generationSettings,
      ...(sourceUrl ? { sourceUrl } : {}),
      imageCount: form.imageUrls.length || 1
    },
    imageUrls: form.imageUrls.map((url) => url.trim()).filter(Boolean),
    selectedImageUrl:
      form.selectedImageUrl && form.imageUrls.includes(form.selectedImageUrl)
        ? form.selectedImageUrl
        : form.imageUrls[0],
    memberOnly: form.memberOnly,
    reviewNotes: form.reviewNotes.trim() || undefined
  };
}

function isVideoDraftImportPayload(
  payload: PromptCaseDraftImportInput
): boolean {
  const settings = payload.generationSettings || {};
  const videoUrls = [
    ...(Array.isArray(settings.videoUrls) ? settings.videoUrls : []),
    ...(Array.isArray(settings.sourceVideoUrls)
      ? settings.sourceVideoUrls
      : []),
    settings.videoUrl,
    settings.sourceVideoUrl
  ]
    .map((url) => (typeof url === 'string' ? url.trim() : ''))
    .filter(Boolean);
  return settings.mediaType === 'video' || videoUrls.length > 0;
}

function getDraftImportExtractionWarning(
  draft: PromptCaseDraftImportInput
): string {
  const warning = draft.generationSettings?.extractionWarning;
  return typeof warning === 'string' ? warning.trim() : '';
}

function getGenerationSettingsVideoUrls(
  settings?: Record<string, unknown> | null
): string[] {
  if (!settings || typeof settings !== 'object') return [];
  return sortVideoUrlsByPlaybackPreference(
    Array.from(
      new Set(
        [
          ...(Array.isArray(settings.videoUrls) ? settings.videoUrls : []),
          ...(Array.isArray(settings.sourceVideoUrls)
            ? settings.sourceVideoUrls
            : []),
          settings.videoUrl,
          settings.sourceVideoUrl
        ]
          .map((url) => (typeof url === 'string' ? url.trim() : ''))
          .filter(Boolean)
      )
    )
  );
}

function sortVideoUrlsByPlaybackPreference(urls: string[]): string[] {
  const score = (url: string): number => {
    if (/\.mp4(?:$|[?#])/i.test(url)) return 0;
    if (/\.webm(?:$|[?#])/i.test(url)) return 1;
    if (/\.mov(?:$|[?#])/i.test(url)) return 2;
    if (/\.m3u8(?:$|[?#])/i.test(url)) return 10;
    return 5;
  };
  return [...urls].sort((a, b) => score(a) - score(b));
}

function getDraftFormVideoUrls(
  form: Pick<DraftImportForm | DraftEditorForm, 'generationSettings'>
): string[] {
  return getGenerationSettingsVideoUrls(form.generationSettings);
}

function getPromptCaseDraftVideoUrls(draft?: PromptCaseDraft | null): string[] {
  return getGenerationSettingsVideoUrls(draft?.generationSettings);
}

function buildDraftEditorPatch(
  form: DraftEditorForm
): Parameters<typeof saveAdminPromptCaseDraft>[1] {
  const imageUrls = form.imageUrls.map((url) => url.trim()).filter(Boolean);
  const selectedImageUrl =
    form.selectedImageUrl && imageUrls.includes(form.selectedImageUrl)
      ? form.selectedImageUrl
      : imageUrls[0] || '';
  const tags = form.tagsText
    .split(/[,，\n]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
  const localizedTags =
    form.locale === 'en-US' && !tags.includes('en-US')
      ? [...tags, 'en-US']
      : tags.filter((tag) => tag !== 'zh-CN');
  const generationSettings = {
    ...form.generationSettings,
    model: form.model.trim() || 'gpt-image-2',
    imageSize: form.imageSize.trim() || '1024x1536',
    imageCount: imageUrls.length || 1,
    ...(form.sourceUrl.trim() ? { sourceUrl: form.sourceUrl.trim() } : {})
  };

  if (!form.sourceUrl.trim() && 'sourceUrl' in generationSettings) {
    delete (generationSettings as Record<string, unknown>).sourceUrl;
  }

  return {
    title: form.title.trim(),
    packageSlug: form.packageSlug.trim(),
    category: form.category,
    tags: localizedTags,
    prompt: form.prompt.trim(),
    promptPreview: derivePromptPreview(form.prompt),
    negativePrompt: form.negativePrompt.trim() || undefined,
    commercialIntent: form.commercialIntent.trim() || undefined,
    generationSettings,
    imageUrls,
    selectedImageUrl,
    memberOnly: form.memberOnly,
    status: form.status,
    reviewNotes: form.reviewNotes.trim() || undefined
  };
}

function normalizePromptCaseImages(caseItem?: PromptCase | null): string[] {
  const urls = [
    ...(Array.isArray(caseItem?.imageUrls) ? caseItem.imageUrls : []),
    caseItem?.imageUrl || ''
  ]
    .map((url) => url.trim())
    .filter(Boolean);
  return Array.from(new Set(urls));
}

function derivePromptPreview(prompt: string): string {
  const normalized = prompt.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  return normalized.length > 140
    ? `${normalized.slice(0, 140)}...`
    : normalized;
}

function deriveCommercialIntent(editor: EditablePromptCase): string {
  const label =
    editor.packageSlug || editor.category || editor.model || 'AI image prompt';
  const promptPreview = derivePromptPreview(editor.prompt);
  if (!promptPreview) return '';
  return `${label} reusable image-generation case: ${promptPreview}`;
}

function stringifyVisualRecipe(caseItem?: PromptCase): string {
  const recipe = (
    caseItem as (PromptCase & { visualRecipe?: unknown }) | undefined
  )?.visualRecipe;
  if (!recipe || typeof recipe !== 'object' || Array.isArray(recipe)) return '';
  return JSON.stringify(recipe, null, 2);
}

function getPromptCaseVisualRecipeSelection(
  caseItem?: PromptCase | null
): ImagePromptSelection | null {
  return normalizeVisualRecipeSelection(
    (caseItem as (PromptCase & { visualRecipe?: unknown }) | undefined)
      ?.visualRecipe
  );
}

function getPromptCaseVisualRecipeAssets(
  caseItem: PromptCase,
  limit: number,
  assets = imagePromptAssets
) {
  const selection = getPromptCaseVisualRecipeSelection(caseItem);
  if (!selection) return [];
  return resolveVisualRecipeAssets(selection, assets).slice(0, limit);
}

function parseVisualRecipe(value: string): Record<string, unknown> | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = JSON.parse(trimmed) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('visualRecipe 必须是 JSON 对象');
  }
  return parsed as Record<string, unknown>;
}

function getPromptCasePreviewImages(caseItem?: PromptCase | null): string[] {
  const urls = normalizePromptCaseImages(caseItem);
  if (!isRecentGenerationPromptCase(caseItem)) return urls;
  const bestUrl = urls[urls.length - 1] || urls[0] || '';
  return bestUrl ? [bestUrl] : [];
}

function isPromptCaseFeatured(caseItem: PromptCase): boolean {
  return Boolean(caseItem.featured);
}

function PromptCaseDraftImage({ url, title }: { url: string; title: string }) {
  const candidates = useMemo(
    () =>
      Array.from(
        new Set(
          [
            getOptimizedPromptCaseImageUrl(url, { width: 96, quality: 72 }),
            url
          ].filter(Boolean)
        )
      ),
    [url]
  );
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [failed, setFailed] = useState(false);
  const sourceUrl = candidates[candidateIndex] || '';

  useEffect(() => {
    setCandidateIndex(0);
    setFailed(false);
  }, [url]);

  const handleError = useCallback(() => {
    if (candidateIndex < candidates.length - 1) {
      setCandidateIndex((current) => current + 1);
      return;
    }
    setFailed(true);
  }, [candidateIndex, candidates.length]);

  if (!sourceUrl || failed) {
    return (
      <span className="creator-prompt-case-draft-image-placeholder">
        <ImagePlus size={15} />
      </span>
    );
  }

  return (
    <img
      src={sourceUrl}
      alt={title}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={handleError}
    />
  );
}

function PromptCaseDraftMediaThumb({
  imageUrl,
  videoUrl,
  title
}: {
  imageUrl: string;
  videoUrl?: string;
  title: string;
}) {
  return (
    <span className="creator-prompt-case-draft-media-thumb">
      <PromptCaseDraftImage url={imageUrl} title={title} />
      {videoUrl ? (
        <span
          className="creator-prompt-case-draft-video-badge"
          aria-hidden="true"
        >
          <PlayCircle size={16} />
        </span>
      ) : null}
    </span>
  );
}

function PromptCaseAdminListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, index) => (
        <article
          key={`prompt-case-admin-skeleton-${index}`}
          className="creator-prompt-case-admin-row"
          aria-hidden="true"
        >
          <Skeleton className="creator-prompt-case-admin-row-cover" />
          <div className="creator-prompt-case-admin-row-main">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3 w-3/5" />
            <Skeleton className="h-3 w-4/5" />
          </div>
          <div className="creator-prompt-case-admin-row-metrics">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
          <div className="creator-prompt-case-admin-row-actions">
            <Skeleton className="size-8" />
            <Skeleton className="size-8" />
            <Skeleton className="size-8" />
          </div>
        </article>
      ))}
    </>
  );
}

function PromptCaseDraftVideoPreview({
  videoUrls,
  posterUrl,
  title
}: {
  videoUrls: string[];
  posterUrl?: string;
  title: string;
}) {
  const videoUrlsKey = videoUrls.join('\n');
  const candidates = useMemo(
    () =>
      sortVideoUrlsByPlaybackPreference(
        videoUrlsKey ? videoUrlsKey.split('\n') : []
      ),
    [videoUrlsKey]
  );
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [failed, setFailed] = useState(false);
  const videoUrl = candidates[candidateIndex] || '';

  useEffect(() => {
    setCandidateIndex(0);
    setFailed(false);
  }, [videoUrlsKey]);

  if (!videoUrl) return null;
  return (
    <div className="creator-prompt-case-form-video-preview">
      <video
        key={videoUrl}
        src={videoUrl}
        poster={posterUrl || undefined}
        controls
        muted
        playsInline
        preload="metadata"
        aria-label={title}
        onCanPlay={() => setFailed(false)}
        onError={() => {
          if (candidateIndex < candidates.length - 1) {
            setCandidateIndex((current) => current + 1);
            return;
          }
          setFailed(true);
        }}
      />
      {failed ? (
        <span className="creator-prompt-case-form-video-error">
          视频源无法直接播放，请打开来源地址核对或重新导入。
        </span>
      ) : null}
    </div>
  );
}

function PromptCaseDraftVideoLightbox({
  videoUrls,
  posterUrl,
  title,
  closeLabel,
  onClose
}: {
  videoUrls: string[];
  posterUrl?: string;
  title: string;
  closeLabel: string;
  onClose: () => void;
}) {
  const dialogRef = useOverlayBehavior<HTMLElement>({
    open: true,
    onClose
  });
  const videoUrlsKey = videoUrls.join('\n');
  const candidates = useMemo(
    () =>
      sortVideoUrlsByPlaybackPreference(
        videoUrlsKey ? videoUrlsKey.split('\n') : []
      ),
    [videoUrlsKey]
  );
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [failed, setFailed] = useState(false);
  const videoUrl = candidates[candidateIndex] || '';

  useEffect(() => {
    setCandidateIndex(0);
    setFailed(false);
  }, [videoUrlsKey]);

  return (
    <div
      className="creator-preview-backdrop create-gallery-preview-backdrop"
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        ref={dialogRef}
        className="creator-preview create-gallery-preview-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="creator-preview-head">
          <span>{title}</span>
          <ShadcnButton
            type="button"
            variant="ghost"
            size="icon"
            className="creator-preview-close-button"
            aria-label={closeLabel}
            onClick={onClose}
          >
            <X />
          </ShadcnButton>
        </div>
        <div className="creator-preview-body">
          <div className="creator-preview-image">
            <video
              key={videoUrl}
              className="creator-preview-video"
              src={videoUrl}
              poster={posterUrl || undefined}
              autoPlay
              muted
              loop
              playsInline
              controls
              preload="auto"
              aria-label={title}
              onCanPlay={() => setFailed(false)}
              onError={() => {
                if (candidateIndex < candidates.length - 1) {
                  setCandidateIndex((current) => current + 1);
                  return;
                }
                setFailed(true);
              }}
            />
            {failed ? (
              <span className="creator-prompt-case-form-video-error">
                视频源无法直接播放，请打开来源地址核对或重新导入。
              </span>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}

function toEditable(caseItem?: PromptCase): EditablePromptCase {
  return {
    id: caseItem?.id,
    imageUrls: normalizePromptCaseImages(caseItem),
    title: caseItem?.title || '',
    slug: caseItem?.slug || '',
    category: normalizeEditablePromptCaseCategory(caseItem?.category),
    tags: Array.isArray(caseItem?.tags) ? caseItem.tags : [],
    model: caseItem?.model || 'gpt-image-2',
    locale: caseItem?.locale || 'zh-CN',
    featured: Boolean(caseItem?.featured),
    memberOnly: Boolean(caseItem?.memberOnly),
    packageSlug: caseItem?.packageSlug || '',
    commercialIntent: caseItem?.commercialIntent || '',
    promptPreview: caseItem?.promptPreview || '',
    visualRecipeText: stringifyVisualRecipe(caseItem),
    prompt: caseItem?.prompt || '',
    authorUrl: caseItem?.authorUrl || '',
    isPublished: caseItem?.isPublished !== false
  };
}

function getPromptCaseDraftTime(draft: PromptCaseDraft): number {
  const value = draft.createdAt ? Date.parse(draft.createdAt) : 0;
  return Number.isFinite(value) ? value : 0;
}

function sortPromptCaseDrafts(items: PromptCaseDraft[]): PromptCaseDraft[] {
  return [...items].sort((a, b) => {
    const statusDiff =
      a.status === 'published' ? 1 : b.status === 'published' ? -1 : 0;
    if (statusDiff !== 0) return statusDiff;
    const createdDiff = getPromptCaseDraftTime(b) - getPromptCaseDraftTime(a);
    if (createdDiff !== 0) return createdDiff;
    return a.id.localeCompare(b.id);
  });
}

function sortPromptCasesByDefaultOrder(items: PromptCase[]): PromptCase[] {
  return sortPromptCasesByDisplayPriority(items);
}

function getPromptCaseCreatedTime(caseItem: PromptCase): number {
  const value = caseItem.createdAt ? Date.parse(caseItem.createdAt) : 0;
  return Number.isFinite(value) ? value : 0;
}

function getPromptCaseColumnCount(
  width: number,
  options: { isFull: boolean; isRail: boolean }
): number {
  if (!Number.isFinite(width) || width <= 0) return 1;
  if (options.isRail) {
    if (width >= 580) return 5;
    if (width >= 460) return 4;
    if (width >= 340) return 3;
    if (width >= 220) return 2;
    return 1;
  }
  const gap = options.isFull ? 14 : 16;
  const minWidth = options.isFull ? 190 : 150;
  return Math.max(1, Math.floor((width + gap) / (minWidth + gap)));
}

function splitPromptCasesIntoColumns(
  items: PromptCase[],
  columnCount: number
): Array<Array<{ caseItem: PromptCase; index: number }>> {
  const safeColumnCount = Math.max(
    1,
    Math.min(columnCount, Math.max(items.length, 1))
  );
  const columns: Array<Array<{ caseItem: PromptCase; index: number }>> =
    Array.from({ length: safeColumnCount }, () => []);
  items.forEach((caseItem, index) => {
    columns[index % safeColumnCount]?.push({ caseItem, index });
  });
  return columns;
}

const RECENT_GENERATION_CASE_ID_PREFIX = 'recent-generation:';

function isRecentGenerationPromptCase(caseItem?: PromptCase | null): boolean {
  return Boolean(caseItem?.id.startsWith(RECENT_GENERATION_CASE_ID_PREFIX));
}

function getRecentGenerationId(caseItem?: PromptCase | null): string {
  const id = caseItem?.id || '';
  return id.startsWith(RECENT_GENERATION_CASE_ID_PREFIX)
    ? id.slice(RECENT_GENERATION_CASE_ID_PREFIX.length)
    : '';
}

function getHistoryImageCandidates(item: VisualImageHistoryItem): string[] {
  return Array.from(
    new Set(
      [item.thumbnailUrl, item.previewUrl, item.imageUrl]
        .map((url) => url?.trim() || '')
        .filter(Boolean)
    )
  );
}

function getPromptCaseCover(caseItem: PromptCase): string {
  return normalizePromptCaseImages(caseItem)[0] || '';
}

function getPromptCaseCardImage(caseItem: PromptCase, width: number): string {
  return getOptimizedPromptCaseImageUrl(getPromptCaseCover(caseItem), {
    width,
    quality: 72
  });
}

function readPromptCaseGenerationSize(caseItem: PromptCase): string {
  return getPromptCaseCreateSettings(caseItem).imageSize || '';
}

function parsePromptCaseAspectRatio(value: string): string | null {
  const normalized = value.trim();
  const sizeMatch = normalized.match(/(\d{3,5})\s*[xX×]\s*(\d{3,5})/u);
  if (sizeMatch) {
    const width = Number(sizeMatch[1]);
    const height = Number(sizeMatch[2]);
    return width > 0 && height > 0 ? `${width} / ${height}` : null;
  }
  const ratioMatch = normalized.match(
    /(^|[^\d])(\d{1,2})\s*:\s*(\d{1,2})([^\d]|$)/u
  );
  if (ratioMatch) {
    const width = Number(ratioMatch[2]);
    const height = Number(ratioMatch[3]);
    return width > 0 && height > 0 ? `${width} / ${height}` : null;
  }
  return null;
}

function getPromptCaseCardAspectRatio(
  caseItem: PromptCase,
  index: number
): string {
  const historyMeta = caseItem as PromptCase & {
    width?: number;
    height?: number;
    actualImageSize?: string;
    requestedImageSize?: string;
    imageSize?: string;
    aspectRatio?: string;
  };
  if (
    typeof historyMeta.width === 'number' &&
    typeof historyMeta.height === 'number' &&
    historyMeta.width > 0 &&
    historyMeta.height > 0
  ) {
    return `${historyMeta.width} / ${historyMeta.height}`;
  }
  const candidates = [
    historyMeta.actualImageSize || '',
    historyMeta.requestedImageSize || '',
    historyMeta.imageSize || '',
    historyMeta.aspectRatio || '',
    readPromptCaseGenerationSize(caseItem),
    caseItem.promptPreview || '',
    caseItem.prompt || '',
    caseItem.title || '',
    caseItem.category || ''
  ];
  for (const candidate of candidates) {
    const parsed = parsePromptCaseAspectRatio(candidate);
    if (parsed) return parsed;
  }
  const category =
    `${caseItem.category || ''} ${caseItem.packageSlug || ''}`.toLowerCase();
  if (category.includes('xiaohongshu') || category.includes('poster')) {
    return '2 / 3';
  }
  if (category.includes('wechat') || category.includes('ecommerce')) {
    return '3 / 2';
  }
  return ['1 / 1', '3 / 4', '4 / 5', '4 / 3'][index % 4];
}

function PromptCaseCardImage({
  caseItem,
  index,
  variant
}: {
  caseItem: PromptCase;
  index: number;
  variant: 'panel' | 'full' | 'rail';
}) {
  const initialCandidates = useMemo(
    () => normalizePromptCaseImages(caseItem),
    [caseItem]
  );
  const initialCandidatesKey = useMemo(
    () => initialCandidates.join('|'),
    [initialCandidates]
  );
  const cardWidth = variant === 'full' ? 520 : variant === 'rail' ? 240 : 360;
  const responsiveWidths =
    variant === 'rail' ? [180, 280, 420] : [320, 640, 960];
  const fallbackAspectRatio = getPromptCaseCardAspectRatio(caseItem, index);
  const [naturalAspectRatio, setNaturalAspectRatio] = useState<string | null>(
    null
  );
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [refreshedCandidates, setRefreshedCandidates] = useState<string[]>([]);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const refreshedGenerationRef = useRef<string | null>(null);
  const candidates =
    refreshedCandidates.length > 0 ? refreshedCandidates : initialCandidates;
  const sourceUrl = candidates[candidateIndex] || '';
  const historyId = getRecentGenerationId(caseItem);

  useEffect(() => {
    setCandidateIndex(0);
    setRefreshedCandidates([]);
    setFailed(false);
    setRefreshing(false);
    setNaturalAspectRatio(null);
    refreshedGenerationRef.current = null;
  }, [caseItem.id, initialCandidatesKey]);

  const handleLoad = useCallback((event: SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth, naturalHeight } = event.currentTarget;
    if (naturalWidth > 0 && naturalHeight > 0) {
      setNaturalAspectRatio(`${naturalWidth} / ${naturalHeight}`);
    }
  }, []);
  const handleError = useCallback(() => {
    if (candidateIndex < candidates.length - 1) {
      setCandidateIndex((current) => current + 1);
      return;
    }

    if (historyId && refreshedGenerationRef.current !== historyId) {
      refreshedGenerationRef.current = historyId;
      setRefreshing(true);
      void refreshVisualImageHistoryItem({ generationId: historyId })
        .then((item) => {
          if (!item) {
            setFailed(true);
            return;
          }
          const nextCandidates = getHistoryImageCandidates(item);
          if (nextCandidates.length === 0) {
            setFailed(true);
            return;
          }
          setRefreshedCandidates(nextCandidates);
          setCandidateIndex(0);
          setFailed(false);
        })
        .catch(() => setFailed(true))
        .finally(() => setRefreshing(false));
      return;
    }

    setFailed(true);
  }, [candidateIndex, candidates.length, historyId]);

  return (
    <span
      className="creator-prompt-case-card-media"
      style={
        {
          '--prompt-case-card-aspect-ratio':
            naturalAspectRatio || fallbackAspectRatio
        } as CSSProperties
      }
    >
      {!sourceUrl || failed ? (
        <span className="creator-prompt-case-image-placeholder">
          <ImagePlus size={18} />
        </span>
      ) : (
        <img
          src={getOptimizedPromptCaseImageUrl(sourceUrl, {
            width: cardWidth,
            quality: 72
          })}
          srcSet={getPromptCaseResponsiveImageSet(sourceUrl, responsiveWidths)}
          sizes={
            variant === 'full'
              ? '(max-width: 560px) 50vw, (max-width: 1040px) 33vw, 20vw'
              : variant === 'rail'
                ? '(max-width: 560px) calc((100vw - 48px) / 2), (max-width: 920px) 22vw, 160px'
                : '(max-width: 560px) 50vw, 180px'
          }
          alt=""
          loading={index < 8 ? 'eager' : 'lazy'}
          decoding="async"
          {...imageFetchPriority(index < 4 ? 'high' : 'auto')}
          referrerPolicy="no-referrer"
          onLoad={handleLoad}
          onError={handleError}
        />
      )}
      {refreshing && (
        <span className="creator-prompt-case-image-refreshing" aria-hidden>
          <Loader2 size={16} />
        </span>
      )}
    </span>
  );
}

function getPromptCaseViews(caseItem: PromptCase): number {
  return Math.max(0, Number(caseItem.viewCount || 0));
}

function openUrlInNewTab(url: string) {
  const normalized = url.trim();
  if (!normalized) return;
  window.open(normalized, '_blank', 'noopener,noreferrer');
}

function getPromptCaseCopies(caseItem: PromptCase): number {
  return Math.max(0, Number(caseItem.copyCount || 0));
}

function getPromptCaseGenerates(caseItem: PromptCase): number {
  return Math.max(0, Number(caseItem.generateCount || 0));
}

function formatPromptCaseRate(numerator: number, denominator: number): string {
  if (denominator <= 0) return '0%';
  const rate = Math.round((numerator / denominator) * 1000) / 10;
  return `${rate.toLocaleString()}%`;
}

function getPromptCaseGenerateRate(caseItem: PromptCase): number {
  const views = getPromptCaseViews(caseItem);
  if (views <= 0) return 0;
  return getPromptCaseGenerates(caseItem) / views;
}

function getPromptCasePromptText(
  caseItem: PromptCase | null,
  locale: 'zh-CN' | 'en-US'
): string {
  if (!caseItem) return '';
  const candidates =
    locale === 'en-US'
      ? [caseItem.promptEn, caseItem.prompt, caseItem.promptZh]
      : [caseItem.promptZh, caseItem.prompt, caseItem.promptEn];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }
  return '';
}

function canReadPromptCasePrompt(
  caseItem: PromptCase | null,
  promptText: string,
  isAuthenticated: boolean,
  isAdmin: boolean
): caseItem is PromptCase {
  if (!caseItem || !promptText) return false;
  if (isAdmin) return true;
  return isAuthenticated && caseItem?.promptLocked !== true;
}

function getDraftSourceUrl(draft: PromptCaseDraft): string {
  const value = draft.generationSettings?.sourceUrl;
  if (typeof value === 'string') return value.trim();
  const noteMatch = draft.reviewNotes?.match(/sourceUrl:\s*(https?:\/\/\S+)/i);
  return noteMatch?.[1]?.trim() || '';
}

function getDraftModel(draft: PromptCaseDraft): string {
  const value = draft.generationSettings?.model;
  return typeof value === 'string' && value.trim()
    ? value.trim()
    : 'gpt-image-2';
}

function getDraftImageSize(draft: PromptCaseDraft): string {
  const value = draft.generationSettings?.imageSize;
  return typeof value === 'string' && value.trim() ? value.trim() : '1024x1536';
}

function getDraftLocale(draft: PromptCaseDraft): 'zh-CN' | 'en-US' {
  return draft.tags.includes('en-US') ? 'en-US' : 'zh-CN';
}

function sortPromptCasesByAdminMode(
  items: PromptCase[],
  mode: AdminSortMode
): PromptCase[] {
  if (mode === 'default') {
    return [...items].sort((a, b) => {
      const createdDiff =
        getPromptCaseCreatedTime(b) - getPromptCaseCreatedTime(a);
      if (createdDiff !== 0) return createdDiff;
      return a.id.localeCompare(b.id);
    });
  }
  return [...items].sort((a, b) => {
    if (mode === 'created-desc' || mode === 'created-asc') {
      const createdDiff =
        mode === 'created-desc'
          ? getPromptCaseCreatedTime(b) - getPromptCaseCreatedTime(a)
          : getPromptCaseCreatedTime(a) - getPromptCaseCreatedTime(b);
      if (createdDiff !== 0) return createdDiff;
      return a.id.localeCompare(b.id);
    }
    const metricDiff =
      mode === 'views'
        ? getPromptCaseViews(b) - getPromptCaseViews(a)
        : mode === 'copies'
          ? getPromptCaseCopies(b) - getPromptCaseCopies(a)
          : mode === 'generates'
            ? getPromptCaseGenerates(b) - getPromptCaseGenerates(a)
            : getPromptCaseGenerateRate(b) - getPromptCaseGenerateRate(a);
    if (metricDiff !== 0) return metricDiff;
    return sortPromptCasesByDefaultOrder([a, b])[0].id === a.id ? -1 : 1;
  });
}

export function PromptCasesPanel({
  isAuthenticated,
  isPromptCaseAdmin,
  onRequireLogin,
  onRecreate,
  variant = 'panel',
  forceManageOpen = false,
  adminManageHref,
  shareCaseId = null,
  buildShareUrl,
  shareAccessToken = null,
  onClearSharedCase,
  onOpenMembershipUpsell
}: PromptCasesPanelProps) {
  const { t } = useTranslation('imageCreate');
  const td = t as (
    key: string,
    options?: Record<string, unknown> & { defaultValue?: string }
  ) => string;
  const location = useLocation();
  const navigate = useNavigate();
  const [cases, setCases] = useState<PromptCase[]>([]);
  const [adminCases, setAdminCases] = useState<PromptCase[]>([]);
  const [adminDrafts, setAdminDrafts] = useState<PromptCaseDraft[]>([]);
  const [selectedCase, setSelectedCase] = useState<PromptCase | null>(null);
  const promptAssetCatalog = useImagePromptAssetCatalog(Boolean(selectedCase));
  const [activeRecipeAssetId, setActiveRecipeAssetId] = useState<string | null>(
    null
  );
  const [editor, setEditor] = useState<EditablePromptCase>(() => toEditable());
  const [adminTab, setAdminTab] = useState<AdminPanelTab>(() =>
    getAdminPanelTabFromUrl(location.pathname, location.search)
  );
  const [adminFeaturedFilter, setAdminFeaturedFilter] =
    useState<AdminFeaturedFilter>('all');
  const [adminModalMode, setAdminModalMode] =
    useState<AdminCaseModalMode | null>(null);
  const [isDraftImportOpen, setIsDraftImportOpen] = useState(false);
  const [draftImportForm, setDraftImportForm] = useState<DraftImportForm>(() =>
    createEmptyDraftImportForm()
  );
  const [isDraftImportExtracting, setIsDraftImportExtracting] = useState(false);
  const [draftImportExtractProgress, setDraftImportExtractProgress] =
    useState('');
  const [isDraftImportSaving, setIsDraftImportSaving] = useState(false);
  const [isDraftImportUploading, setIsDraftImportUploading] = useState(false);
  const [isDraftImportGenerating, setIsDraftImportGenerating] = useState(false);
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [draftEditor, setDraftEditor] = useState<DraftEditorForm>(() =>
    createEmptyDraftEditorForm()
  );
  const [isDraftEditorSaving, setIsDraftEditorSaving] = useState(false);
  const [isDraftEditorUploading, setIsDraftEditorUploading] = useState(false);
  const [isDraftEditorGenerating, setIsDraftEditorGenerating] = useState(false);
  const [draftPendingPublish, setDraftPendingPublish] =
    useState<PromptCaseDraft | null>(null);
  const [isDraftPublishAllOpen, setIsDraftPublishAllOpen] = useState(false);
  const [isDraftPublishAllBusy, setIsDraftPublishAllBusy] = useState(false);
  const [draftPublishAllProgress, setDraftPublishAllProgress] = useState({
    completed: 0,
    total: 0
  });
  const [draftPendingReject, setDraftPendingReject] =
    useState<PromptCaseDraft | null>(null);
  const [draftRejectNotes, setDraftRejectNotes] = useState('');
  const [draftPendingDelete, setDraftPendingDelete] =
    useState<PromptCaseDraft | null>(null);
  const [casePendingDelete, setCasePendingDelete] = useState<PromptCase | null>(
    null
  );
  const [draftPublishMessage, setDraftPublishMessage] = useState('');
  const [isManaging, setIsManaging] = useState(
    () => forceManageOpen && isPromptCaseAdmin && isAuthenticated
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isAdminLoading, setIsAdminLoading] = useState(false);
  const [isAdminLoadingMore, setIsAdminLoadingMore] = useState(false);
  const [adminCasesTotal, setAdminCasesTotal] = useState(0);
  const [adminCasesNextOffset, setAdminCasesNextOffset] = useState<
    number | null
  >(null);
  const [adminCaseDetailLoadingId, setAdminCaseDetailLoadingId] = useState<
    string | null
  >(null);
  const [isDraftLoading, setIsDraftLoading] = useState(false);
  const [draftBusyId, setDraftBusyId] = useState<string | null>(null);
  const [activeDraftPreview, setActiveDraftPreview] = useState<{
    draftId: string;
    url: string;
    mediaType: 'image' | 'video';
    posterUrl?: string;
    videoUrls?: string[];
  } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [statusText, setStatusText] = useState('');
  const [copiedPreviewPrompt, setCopiedPreviewPrompt] = useState(false);
  const [copiedShareUrl, setCopiedShareUrl] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const promptCaseGridRef = useRef<HTMLDivElement | null>(null);
  const adminCasesRequestIdRef = useRef(0);
  const [promptCaseColumnCount, setPromptCaseColumnCount] = useState(1);
  const [activeCategory, setActiveCategory] = useState('all');
  const [adminSortMode, setAdminSortMode] = useState<AdminSortMode>('default');
  const [isMobilePromptCaseViewport, setIsMobilePromptCaseViewport] =
    useState(false);
  const [visiblePromptCaseCount, setVisiblePromptCaseCount] = useState(
    PROMPT_CASE_MOBILE_BATCH
  );
  const deferredQuery = useDeferredValue(query);
  const publishableDrafts = useMemo(
    () =>
      adminDrafts.filter(
        (draft) =>
          draft.status !== 'published' &&
          draft.status !== 'rejected' &&
          draft.imageUrls.length > 0 &&
          Boolean(draft.prompt.trim())
      ),
    [adminDrafts]
  );
  const incompleteDraftCount = adminDrafts.length - publishableDrafts.length;
  const localePrefix = location.pathname.startsWith('/en-US')
    ? '/en-US'
    : location.pathname.startsWith('/zh-CN')
      ? '/zh-CN'
      : '/zh-CN';
  const activeLocale = localePrefix === '/en-US' ? 'en-US' : 'zh-CN';
  const activePackageSlug = useMemo(() => {
    const value = new URLSearchParams(location.search).get('packageSlug');
    return value?.trim() || '';
  }, [location.search]);
  const isFull = variant === 'full';
  const isRail = variant === 'rail';
  const canRenderAdminWorkspace =
    isPromptCaseAdmin && (!isRail || forceManageOpen);
  const isStandaloneAdmin = forceManageOpen && canRenderAdminWorkspace;
  const adminBasePath = useMemo(
    () => getPromptCaseAdminBasePath(location.pathname, localePrefix),
    [localePrefix, location.pathname]
  );
  const selectAdminTab = useCallback(
    (tab: AdminPanelTab) => {
      setAdminTab(tab);
      if (!forceManageOpen || !canRenderAdminWorkspace) return;
      if (location.pathname.startsWith('/__dev/')) return;
      const nextPath =
        tab === 'drafts' ? `${adminBasePath}/drafts` : adminBasePath;
      const currentUrl = `${location.pathname}${location.search}${location.hash}`;
      const nextUrl = `${nextPath}${location.search}${location.hash}`;
      if (nextUrl !== currentUrl) {
        navigate(nextUrl);
      }
    },
    [
      adminBasePath,
      canRenderAdminWorkspace,
      forceManageOpen,
      location.hash,
      location.pathname,
      location.search,
      navigate
    ]
  );
  const getPricingHref = useCallback(
    (caseItem?: PromptCase | null) => {
      const params = new URLSearchParams();
      params.set('source', 'prompt_case_unlock');
      params.set('returnTo', `${location.pathname}${location.search}`);
      if (caseItem?.id) params.set('caseId', caseItem.id);
      if (caseItem?.packageSlug)
        params.set('packageSlug', caseItem.packageSlug);
      return `${localePrefix}/pricing?${params.toString()}`;
    },
    [localePrefix, location.pathname, location.search]
  );
  const pricingHref = getPricingHref(selectedCase);
  const getCategoryLabel = useCallback(
    (category: string) =>
      category === 'recent-generation'
        ? td('promptCases.categories.recentGeneration', {
            defaultValue: '刚生成'
          })
        : td(`promptCases.categories.${category}`, { defaultValue: category }),
    [td]
  );

  const loadPublicCases = async (force = false) => {
    setIsLoading(true);
    setError('');
    try {
      setCases(
        sortPromptCasesByDefaultOrder(
          await getPublicPromptCases(120, {
            force,
            locale: activeLocale,
            packageSlug: activePackageSlug || undefined
          })
        )
      );
    } catch (loadError) {
      console.warn('[PromptCases] public cases unavailable', loadError);
      setError(t('promptCases.loadFailed') as string);
    } finally {
      setIsLoading(false);
    }
  };

  const loadAdminCases = async () => {
    if (!isPromptCaseAdmin || !isAuthenticated) return;
    const requestId = adminCasesRequestIdRef.current + 1;
    adminCasesRequestIdRef.current = requestId;
    setIsAdminLoading(true);
    setIsAdminLoadingMore(false);
    setError('');
    try {
      const page = await getAdminPromptCases({
        sort: adminSortMode,
        offset: 0,
        limit: ADMIN_PROMPT_CASE_PAGE_SIZE,
        featuredOnly: adminFeaturedFilter === 'featured',
        search: deferredQuery
      });
      if (adminCasesRequestIdRef.current !== requestId) return;
      setAdminCases(page.cases);
      setAdminCasesTotal(page.total);
      setAdminCasesNextOffset(page.nextOffset);
      setStatusText(
        t('promptCases.manageLoaded', { count: page.cases.length })
      );
    } catch (loadError) {
      if (adminCasesRequestIdRef.current !== requestId) return;
      setError(
        loadError instanceof Error
          ? loadError.message
          : (t('promptCases.loadFailed') as string)
      );
    } finally {
      if (adminCasesRequestIdRef.current === requestId) {
        setIsAdminLoading(false);
      }
    }
  };

  const loadMoreAdminCases = async () => {
    if (
      !isPromptCaseAdmin ||
      !isAuthenticated ||
      adminCasesNextOffset === null ||
      isAdminLoading ||
      isAdminLoadingMore
    ) {
      return;
    }
    const requestId = adminCasesRequestIdRef.current;
    setIsAdminLoadingMore(true);
    setError('');
    try {
      const page = await getAdminPromptCases({
        sort: adminSortMode,
        offset: adminCasesNextOffset,
        limit: ADMIN_PROMPT_CASE_PAGE_SIZE,
        featuredOnly: adminFeaturedFilter === 'featured',
        search: deferredQuery
      });
      if (adminCasesRequestIdRef.current !== requestId) return;
      setAdminCases((current) => {
        const seen = new Set(current.map((item) => item.id));
        return [...current, ...page.cases.filter((item) => !seen.has(item.id))];
      });
      setAdminCasesTotal(page.total);
      setAdminCasesNextOffset(page.nextOffset);
      setStatusText(
        t('promptCases.manageLoaded', {
          count: Math.min(page.total, adminCasesNextOffset + page.cases.length)
        })
      );
    } catch (loadError) {
      if (adminCasesRequestIdRef.current !== requestId) return;
      setError(
        loadError instanceof Error
          ? loadError.message
          : (t('promptCases.loadFailed') as string)
      );
    } finally {
      if (adminCasesRequestIdRef.current === requestId) {
        setIsAdminLoadingMore(false);
      }
    }
  };

  const loadAdminDrafts = async () => {
    if (!isPromptCaseAdmin || !isAuthenticated) return;
    setIsDraftLoading(true);
    setError('');
    try {
      const nextDrafts = await getAdminPromptCaseDrafts();
      setAdminDrafts(sortPromptCaseDrafts(nextDrafts));
      setStatusText(
        t('promptCases.draftsLoaded', { count: nextDrafts.length })
      );
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : (t('promptCases.loadFailed') as string)
      );
    } finally {
      setIsDraftLoading(false);
    }
  };

  useEffect(() => {
    if (!isStandaloneAdmin) void loadPublicCases(isAuthenticated);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLocale, activePackageSlug, isAuthenticated, isStandaloneAdmin]);

  useEffect(() => {
    if (isManaging) {
      if (adminTab === 'cases') void loadAdminCases();
      if (adminTab === 'drafts') void loadAdminDrafts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isManaging, adminTab, adminSortMode, adminFeaturedFilter, deferredQuery]);

  useEffect(() => {
    if (forceManageOpen && isPromptCaseAdmin && isAuthenticated) {
      setIsManaging(true);
    }
  }, [forceManageOpen, isAuthenticated, isPromptCaseAdmin]);

  useEffect(() => {
    setAdminTab(getAdminPanelTabFromUrl(location.pathname, location.search));
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!isDraftImportExtracting) {
      setDraftImportExtractProgress('');
      return undefined;
    }

    const startedAt = Date.now();
    const getProgressText = () => {
      const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000);
      if (elapsedSeconds < 8) {
        return td('promptCases.draftImportProgressReadTweet', {
          defaultValue: '正在读取推文正文和媒体...'
        });
      }
      if (elapsedSeconds < 20) {
        return td('promptCases.draftImportProgressClassifyPrompt', {
          defaultValue: '正在判断正文是否已有完整 Prompt，避免重复搜索评论区...'
        });
      }
      if (elapsedSeconds < 42) {
        return td('promptCases.draftImportProgressSearchReplies', {
          defaultValue:
            '正在通过 AISA 翻页搜索作者评论区 Prompt，这一步可能较慢...'
        });
      }
      return td('promptCases.draftImportProgressRetryReplies', {
        defaultValue: '仍在等待评论区搜索结果，必要时会自动切换备用搜索...'
      });
    };

    setDraftImportExtractProgress(getProgressText());
    const timer = window.setInterval(() => {
      setDraftImportExtractProgress(getProgressText());
    }, 1000);

    return () => window.clearInterval(timer);
  }, [isDraftImportExtracting, td]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mediaQuery = window.matchMedia(PROMPT_CASE_MOBILE_QUERY);
    const syncViewport = () =>
      setIsMobilePromptCaseViewport(mediaQuery.matches);

    syncViewport();
    mediaQuery.addEventListener('change', syncViewport);
    return () => mediaQuery.removeEventListener('change', syncViewport);
  }, []);

  useEffect(() => {
    const node = promptCaseGridRef.current;
    if (!node || (isManaging && !isRail)) return undefined;

    const updateColumnCount = () => {
      const width = node.getBoundingClientRect().width;
      const nextCount = getPromptCaseColumnCount(width, { isFull, isRail });
      setPromptCaseColumnCount((current) =>
        current === nextCount ? current : nextCount
      );
    };

    updateColumnCount();
    const observer = new ResizeObserver(updateColumnCount);
    observer.observe(node);
    return () => observer.disconnect();
  }, [isFull, isManaging, isRail]);

  useEffect(() => {
    setCopiedPreviewPrompt(false);
    setCopiedShareUrl(false);
    setActiveImageIndex(0);
    setLightboxOpen(false);
    setActiveRecipeAssetId(null);
  }, [selectedCase?.id]);

  const selectedCaseImages = useMemo(
    () => getPromptCasePreviewImages(selectedCase),
    [selectedCase]
  );
  const selectedCaseRecipeAssets = useMemo(
    () =>
      selectedCase
        ? getPromptCaseVisualRecipeAssets(selectedCase, 8, promptAssetCatalog)
        : [],
    [promptAssetCatalog, selectedCase]
  );
  const activePreviewImage =
    selectedCaseImages[
      Math.min(activeImageIndex, Math.max(0, selectedCaseImages.length - 1))
    ] || '';
  const activePreviewVideo = getPromptCasePrimaryVideoUrl(selectedCase);
  const isActivePreviewVideo =
    Boolean(activePreviewVideo) && isPromptCaseVideo(selectedCase);
  const selectedPromptText = getPromptCasePromptText(
    selectedCase,
    activeLocale
  );
  const canViewSelectedPrompt = canReadPromptCasePrompt(
    selectedCase,
    selectedPromptText,
    isAuthenticated,
    isPromptCaseAdmin
  );
  const isSelectedCaseMemberOnly = Boolean(selectedCase?.memberOnly);
  const isSelectedCasePromptMissingForAdmin = Boolean(
    selectedCase && isPromptCaseAdmin && !selectedPromptText
  );
  const selectedPromptPreview = selectedCase?.promptPreview || '';

  const visibleCases = useMemo(
    () =>
      isManaging
        ? sortPromptCasesByAdminMode(
            adminCases.filter(
              (caseItem) =>
                !caseItem.sourceCaseId &&
                (adminFeaturedFilter === 'all' ||
                  isPromptCaseFeatured(caseItem))
            ),
            adminSortMode
          )
        : sortPromptCasesByDefaultOrder(cases),
    [adminCases, adminFeaturedFilter, adminSortMode, cases, isManaging]
  );
  const displayCases = visibleCases;
  const filteredCases = useMemo(() => {
    const normalized = deferredQuery.trim().toLowerCase();
    const packageFiltered = activePackageSlug
      ? displayCases.filter((item) => item.packageSlug === activePackageSlug)
      : displayCases;
    const categoryFiltered =
      activeCategory === 'all'
        ? packageFiltered
        : packageFiltered.filter((item) =>
            activeCategory === 'featured'
              ? Boolean(item.featured) || item.category === 'featured'
              : item.category === activeCategory
          );
    if (!normalized) return categoryFiltered;
    return categoryFiltered.filter((item) =>
      [
        item.title || '',
        item.category || '',
        ...(item.tags || []),
        item.prompt,
        item.packageSlug || '',
        item.commercialIntent || '',
        item.promptPreview || '',
        item.authorUrl || '',
        item.createdByEmail || ''
      ]
        .join(' ')
        .toLowerCase()
        .includes(normalized)
    );
  }, [activeCategory, activePackageSlug, deferredQuery, displayCases]);
  const mobilePromptCaseBatchSize = isFull
    ? PROMPT_CASE_MOBILE_BATCH_FULL
    : PROMPT_CASE_MOBILE_BATCH;
  useEffect(() => {
    setVisiblePromptCaseCount(mobilePromptCaseBatchSize);
  }, [
    activeCategory,
    activeLocale,
    activePackageSlug,
    deferredQuery,
    isManaging,
    mobilePromptCaseBatchSize
  ]);
  const shouldPagePromptCases =
    isMobilePromptCaseViewport && (!isManaging || isRail);
  const renderedCases = useMemo(
    () =>
      shouldPagePromptCases
        ? filteredCases.slice(0, visiblePromptCaseCount)
        : filteredCases,
    [filteredCases, shouldPagePromptCases, visiblePromptCaseCount]
  );
  const canLoadMorePromptCases = renderedCases.length < filteredCases.length;
  const promptCaseCountLabel =
    shouldPagePromptCases && canLoadMorePromptCases
      ? `${renderedCases.length}/${filteredCases.length}`
      : String(filteredCases.length);
  const promptCaseColumns = useMemo(
    () => splitPromptCasesIntoColumns(renderedCases, promptCaseColumnCount),
    [promptCaseColumnCount, renderedCases]
  );
  const activeRecipeAsset = useMemo(
    () =>
      selectedCaseRecipeAssets.find(
        ({ asset }) => asset.id === activeRecipeAssetId
      ) || null,
    [activeRecipeAssetId, selectedCaseRecipeAssets]
  );
  const selectedRecipeRelatedCases = useMemo(
    () =>
      activeRecipeAssetId
        ? findPromptCasesSharingRecipeAssets(
            visibleCases,
            [activeRecipeAssetId],
            {
              currentCaseId: selectedCase?.id,
              limit: 4
            }
          )
        : [],
    [activeRecipeAssetId, selectedCase?.id, visibleCases]
  );
  const selectedRecipeRelatedCaseIds = useMemo(
    () => new Set(selectedRecipeRelatedCases.map((match) => match.caseItem.id)),
    [selectedRecipeRelatedCases]
  );
  const selectedRecipeFallbackCases = useMemo(
    () =>
      visibleCases
        .filter(
          (caseItem) =>
            caseItem.id !== selectedCase?.id &&
            !selectedRecipeRelatedCaseIds.has(caseItem.id) &&
            !caseItem.sourceCaseId
        )
        .slice(0, 4),
    [selectedCase?.id, selectedRecipeRelatedCaseIds, visibleCases]
  );
  const previewMoreCases = useMemo(
    () =>
      visibleCases
        .filter(
          (caseItem) =>
            caseItem.id !== selectedCase?.id &&
            !selectedRecipeRelatedCaseIds.has(caseItem.id) &&
            !caseItem.sourceCaseId
        )
        .slice(0, 6),
    [selectedCase?.id, selectedRecipeRelatedCaseIds, visibleCases]
  );
  const selectedCaseIndex = useMemo(
    () =>
      selectedCase
        ? filteredCases.findIndex((caseItem) => caseItem.id === selectedCase.id)
        : -1,
    [filteredCases, selectedCase]
  );
  const canNavigateCases = selectedCaseIndex >= 0 && filteredCases.length > 1;
  const adminCanonicalCases = useMemo(
    () => adminCases.filter((caseItem) => !caseItem.sourceCaseId),
    [adminCases]
  );
  const adminFeaturedCaseCount = useMemo(
    () => adminCanonicalCases.filter(isPromptCaseFeatured).length,
    [adminCanonicalCases]
  );
  const adminMetrics = useMemo(() => {
    const source = isManaging
      ? adminCanonicalCases.filter(
          (caseItem) =>
            adminFeaturedFilter === 'all' || isPromptCaseFeatured(caseItem)
        )
      : cases;
    const views = source.reduce(
      (sum, item) => sum + getPromptCaseViews(item),
      0
    );
    const copies = source.reduce(
      (sum, item) => sum + getPromptCaseCopies(item),
      0
    );
    const generates = source.reduce(
      (sum, item) => sum + getPromptCaseGenerates(item),
      0
    );
    return {
      views,
      copies,
      generates,
      generateRate: formatPromptCaseRate(generates, views)
    };
  }, [adminCanonicalCases, adminFeaturedFilter, cases, isManaging]);
  const activeDraftPreviewDraft = useMemo(
    () =>
      activeDraftPreview
        ? adminDrafts.find(
            (draft) => draft.id === activeDraftPreview.draftId
          ) || null
        : null,
    [activeDraftPreview, adminDrafts]
  );
  const activeDraftPreviewImages = activeDraftPreviewDraft?.imageUrls || [];
  const filteredDrafts = useMemo(() => {
    const normalized = deferredQuery.trim().toLowerCase();
    if (!normalized) return adminDrafts;
    return adminDrafts.filter((draft) =>
      [
        draft.title,
        draft.category,
        draft.packageSlug,
        draft.sourceSkill,
        draft.status,
        ...(draft.tags || []),
        draft.prompt,
        draft.promptPreview || '',
        draft.commercialIntent || '',
        draft.createdByEmail || '',
        getDraftSourceUrl(draft)
      ]
        .join(' ')
        .toLowerCase()
        .includes(normalized)
    );
  }, [adminDrafts, deferredQuery]);
  const getDraftStatusLabel = useCallback(
    (status: PromptCaseDraftStatus) =>
      t(`promptCases.draftStatuses.${status}`) as string,
    [t]
  );
  useEffect(() => {
    if (!selectedCase) return;
    const caseSources = isPromptCaseAdmin
      ? [...adminCases, ...cases]
      : [...cases, ...adminCases];
    const freshCase = caseSources.find(
      (caseItem) => caseItem.id === selectedCase.id
    );
    if (freshCase && freshCase !== selectedCase) {
      setSelectedCase(freshCase);
    }
  }, [adminCases, cases, isPromptCaseAdmin, selectedCase]);

  useEffect(() => {
    if (!selectedCase) return;
    if (isRecentGenerationPromptCase(selectedCase)) return;
    trackPromptCaseCta({
      action: 'view',
      caseId: selectedCase.id,
      source:
        shareCaseId === selectedCase.id
          ? 'prompt_share_modal'
          : 'prompt_cases_panel',
      authenticated: isAuthenticated,
      locked: !canViewSelectedPrompt,
      locale: activeLocale
    });
  }, [
    activeLocale,
    canViewSelectedPrompt,
    isAuthenticated,
    selectedCase,
    shareCaseId
  ]);

  useEffect(() => {
    if (!shareCaseId) return;
    const caseSources = isPromptCaseAdmin
      ? [...adminCases, ...cases]
      : [...cases, ...adminCases];
    const existing = caseSources.find(
      (caseItem) => caseItem.id === shareCaseId
    );
    if (existing) {
      setSelectedCase(existing);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError('');
    getPublicPromptCase(shareCaseId, { locale: activeLocale })
      .then((caseItem) => {
        if (cancelled) return;
        if (!caseItem) {
          setError(t('promptCases.shareUnavailable') as string);
          onClearSharedCase?.();
          return;
        }
        setCases((current) => {
          const exists = current.some((item) => item.id === caseItem.id);
          return sortPromptCasesByDefaultOrder(
            exists
              ? current.map((item) =>
                  item.id === caseItem.id ? caseItem : item
                )
              : [caseItem, ...current]
          );
        });
        setSelectedCase(caseItem);
        trackPromptShareView({
          caseId: caseItem.id,
          slug: caseItem.slug,
          source: 'create_prompt_share_route'
        });
      })
      .catch((loadError) => {
        if (cancelled) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : (t('promptCases.loadFailed') as string)
        );
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    activeLocale,
    adminCases,
    cases,
    isPromptCaseAdmin,
    onClearSharedCase,
    shareCaseId,
    t
  ]);

  const handlePromptUnlock = useCallback(() => {
    if (!isAuthenticated) {
      if (selectedCase) {
        trackPromptCaseCta({
          action: 'click',
          caseId: selectedCase.id,
          source:
            shareCaseId === selectedCase.id
              ? 'prompt_share_unlock'
              : 'prompt_case_unlock',
          authenticated: false,
          locked: true,
          locale: activeLocale
        });
      }
      onRequireLogin(
        shareCaseId === selectedCase?.id
          ? 'prompt_share_unlock'
          : 'prompt_case_unlock'
      );
      return;
    }
    if (selectedCase) {
      trackPromptCaseCta({
        action: 'click',
        caseId: selectedCase.id,
        source:
          shareCaseId === selectedCase.id
            ? 'prompt_share_unlock'
            : 'prompt_case_unlock',
        authenticated: true,
        locked: true,
        locale: activeLocale
      });
    }
    trackPricingView(
      selectedCase && shareCaseId === selectedCase.id
        ? 'prompt_share_unlock'
        : 'prompt_case_unlock'
    );
    if (onOpenMembershipUpsell) {
      onOpenMembershipUpsell(
        selectedCase && shareCaseId === selectedCase.id
          ? 'prompt_share_unlock'
          : 'prompt_case_unlock'
      );
      return;
    }
    window.location.assign(pricingHref);
  }, [
    activeLocale,
    isAuthenticated,
    onRequireLogin,
    onOpenMembershipUpsell,
    pricingHref,
    selectedCase,
    shareCaseId
  ]);

  const handleRecreate = useCallback(
    (caseItem: PromptCase, openAssetSlot?: ImagePromptSlot) => {
      const isRecentGeneration = isRecentGenerationPromptCase(caseItem);
      const promptText = getPromptCasePromptText(caseItem, activeLocale);
      const promptLockedForCurrentUser =
        !isPromptCaseAdmin && caseItem.promptLocked === true;
      if (!isRecentGeneration) {
        void trackPromptCaseEvent(caseItem.id, 'generate');
        trackPromptCaseCta({
          action: 'click',
          caseId: caseItem.id,
          source:
            shareCaseId === caseItem.id
              ? 'prompt_share_modal_use'
              : 'prompt_cases_panel_use',
          authenticated: isAuthenticated,
          locked: !promptText || promptLockedForCurrentUser,
          locale: activeLocale
        });
        trackPromptGenerate({
          caseId: caseItem.id,
          source:
            shareCaseId === caseItem.id
              ? 'prompt_share_modal'
              : 'prompt_cases_panel',
          authenticated: isAuthenticated
        });
      }
      if (!isAuthenticated) {
        onRequireLogin(
          shareCaseId === caseItem.id
            ? 'prompt_share_modal_use'
            : 'prompt_cases_panel_use'
        );
        return;
      }
      if (!promptText) {
        setError(
          td('promptCases.adminPromptMissingDesc', {
            defaultValue:
              '这个案例没有返回完整 Prompt，请在编辑弹窗中补齐 Prompt 内容后保存。'
          })
        );
        return;
      }
      if (promptLockedForCurrentUser) {
        handlePromptUnlock();
        return;
      }
      const visualRecipeSelection =
        getPromptCaseVisualRecipeSelection(caseItem);
      onRecreate({
        prompt: promptText,
        ...(visualRecipeSelection ? { visualRecipeSelection } : {}),
        ...(openAssetSlot ? { openAssetSlot } : {}),
        remixSource: {
          id: caseItem.id,
          title: caseItem.title,
          slug: caseItem.slug,
          source: isRecentGeneration
            ? 'recent_generation'
            : shareCaseId === caseItem.id
              ? 'prompt_share_modal'
              : 'prompt_cases_panel'
        },
        ...getPromptCaseCreateSettings(caseItem)
      });
      void completeRewardTaskOnce(
        REWARD_TASK_IDENTIFIERS.savePromptCaseOrPromptAsset
      );
      setSelectedCase(null);
      onClearSharedCase?.();
    },
    [
      isAuthenticated,
      isPromptCaseAdmin,
      handlePromptUnlock,
      activeLocale,
      onClearSharedCase,
      onRecreate,
      onRequireLogin,
      shareCaseId,
      td
    ]
  );

  const closePreview = useCallback(() => {
    const shouldClearSharedCase =
      Boolean(shareCaseId) && selectedCase?.id === shareCaseId;
    setSelectedCase(null);
    if (shouldClearSharedCase) {
      onClearSharedCase?.();
    }
  }, [onClearSharedCase, selectedCase?.id, shareCaseId]);
  const promptCasePreviewRef = useOverlayBehavior<HTMLElement>({
    open: Boolean(selectedCase),
    closeDisabled: lightboxOpen,
    onClose: closePreview
  });

  const goToCase = useCallback(
    (direction: -1 | 1) => {
      if (!canNavigateCases) return;
      const nextIndex =
        (selectedCaseIndex + direction + filteredCases.length) %
        filteredCases.length;
      const nextCase = filteredCases[nextIndex];
      if (nextCase) setSelectedCase(nextCase);
    },
    [canNavigateCases, filteredCases, selectedCaseIndex]
  );

  useEffect(() => {
    if (!selectedCase) return undefined;
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (!canNavigateCases) return;
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        goToCase(-1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        goToCase(1);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [canNavigateCases, goToCase, selectedCase]);

  const handleCardKeyDown = (
    event: KeyboardEvent<HTMLElement>,
    caseItem: PromptCase
  ) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (isManaging) void openAdminCasePreview(caseItem);
      else setSelectedCase(caseItem);
    }
  };

  const handleCopyPreviewPrompt = async () => {
    if (!selectedCase) return;
    if (!selectedPromptText && isPromptCaseAdmin) {
      setError(
        td('promptCases.adminPromptMissingDesc', {
          defaultValue:
            '这个案例没有返回完整 Prompt，请在编辑弹窗中补齐 Prompt 内容后保存。'
        })
      );
      return;
    }
    if (!canViewSelectedPrompt) {
      handlePromptUnlock();
      return;
    }
    try {
      await navigator.clipboard.writeText(selectedPromptText);
      setCopiedPreviewPrompt(true);
      if (!isRecentGenerationPromptCase(selectedCase)) {
        void trackPromptCaseEvent(selectedCase.id, 'copy');
        trackPromptCaseCta({
          action: 'click',
          caseId: selectedCase.id,
          source:
            shareCaseId === selectedCase.id
              ? 'prompt_share_modal_copy'
              : 'prompt_cases_panel_copy',
          authenticated: isAuthenticated,
          locked: false,
          locale: activeLocale
        });
        trackPromptCopy({
          caseId: selectedCase.id,
          source:
            shareCaseId === selectedCase.id
              ? 'prompt_share_modal'
              : 'prompt_cases_panel'
        });
      }
      window.setTimeout(() => setCopiedPreviewPrompt(false), 1400);
    } catch {
      setError(t('errors.clipboardFailed') as string);
    }
  };

  const handleCopyShareUrl = async () => {
    if (!selectedCase || !buildShareUrl) return;
    try {
      await navigator.clipboard.writeText(buildShareUrl(selectedCase));
      void recordClientConversionEvent(shareAccessToken, {
        eventName: 'prompt_share_view',
        entityType: 'prompt_case',
        entityId: selectedCase.id,
        ctaSource: 'prompt_cases_panel_share',
        idempotencyKey: `prompt_share_view:${selectedCase.id}:${Date.now()}`,
        metadata: {
          caseId: selectedCase.id,
          caseSlug: selectedCase.slug,
          refCode: getReferralShareCode()
        }
      });
      setCopiedShareUrl(true);
      setStatusText(t('promptCases.shareCopied') as string);
      window.setTimeout(() => setCopiedShareUrl(false), 1400);
    } catch {
      setError(t('promptCases.shareFailed') as string);
    }
  };

  const handleDownloadActiveImage = () => {
    if (!activePreviewImage) return;
    triggerImageDownload(
      activePreviewImage,
      `prompt-case-${selectedCase?.id || 'image'}-${activeImageIndex + 1}`
    );
  };

  const replaceAdminCase = (caseItem: PromptCase) => {
    setAdminCases((current) => {
      const exists = current.some((item) => item.id === caseItem.id);
      const nextCases = exists
        ? current.map((item) => (item.id === caseItem.id ? caseItem : item))
        : [caseItem, ...current];
      return nextCases;
    });
    if (caseItem.isPublished !== false && !caseItem.deletedAt) {
      setCases((current) => {
        const exists = current.some((item) => item.id === caseItem.id);
        const nextCases = exists
          ? current.map((item) => (item.id === caseItem.id ? caseItem : item))
          : [caseItem, ...current];
        return sortPromptCasesByDefaultOrder(nextCases);
      });
    } else {
      setCases((current) => current.filter((item) => item.id !== caseItem.id));
    }
  };

  const replaceAdminDraft = (draft: PromptCaseDraft) => {
    setAdminDrafts((current) => {
      const exists = current.some((item) => item.id === draft.id);
      const nextDrafts = exists
        ? current.map((item) => (item.id === draft.id ? draft : item))
        : [draft, ...current];
      return sortPromptCaseDrafts(nextDrafts);
    });
  };

  const removeAdminDraft = (draftId: string) => {
    setAdminDrafts((current) => current.filter((item) => item.id !== draftId));
    if (activeDraftPreview?.draftId === draftId) {
      setActiveDraftPreview(null);
    }
    if (editingDraftId === draftId) {
      setEditingDraftId(null);
      setDraftEditor(createEmptyDraftEditorForm());
    }
  };

  const updateEditor = <K extends keyof EditablePromptCase>(
    key: K,
    value: EditablePromptCase[K]
  ) => {
    setEditor((current) => ({ ...current, [key]: value }));
  };

  const updateDraftEditor = <K extends keyof DraftEditorForm>(
    key: K,
    value: DraftEditorForm[K]
  ) => {
    setDraftEditor((current) => ({ ...current, [key]: value }));
  };

  const openCreateCaseModal = () => {
    setEditor({
      ...toEditable(),
      locale: activeLocale,
      model: 'gpt-image-2',
      category:
        activeCategory !== 'all' && activeCategory !== 'featured'
          ? activeCategory
          : 'portrait',
      featured: activeCategory === 'featured'
    });
    setAdminModalMode('create');
    setError('');
  };

  const loadAdminCaseDetail = async (caseItem: PromptCase) => {
    if (caseItem.prompt.trim()) return caseItem;
    setAdminCaseDetailLoadingId(caseItem.id);
    try {
      return await getAdminPromptCase(caseItem.sourceCaseId || caseItem.id);
    } finally {
      setAdminCaseDetailLoadingId((current) =>
        current === caseItem.id ? null : current
      );
    }
  };

  const openAdminCasePreview = async (caseItem: PromptCase) => {
    setError('');
    try {
      setSelectedCase(await loadAdminCaseDetail(caseItem));
    } catch (detailError) {
      setError(
        detailError instanceof Error
          ? detailError.message
          : (t('promptCases.loadFailed') as string)
      );
    }
  };

  const openEditCaseModal = async (caseItem: PromptCase) => {
    setError('');
    try {
      setEditor(toEditable(await loadAdminCaseDetail(caseItem)));
      setAdminModalMode('edit');
    } catch (detailError) {
      setError(
        detailError instanceof Error
          ? detailError.message
          : (t('promptCases.loadFailed') as string)
      );
    }
  };

  const closeAdminCaseModal = () => {
    if (isSaving || isUploading) return;
    setAdminModalMode(null);
    setEditor(toEditable());
  };

  const openEditDraftModal = (draft: PromptCaseDraft) => {
    setEditingDraftId(draft.id);
    setDraftEditor(toDraftEditorForm(draft));
    setError('');
  };

  const closeDraftEditorModal = () => {
    if (isDraftEditorSaving || isDraftEditorUploading) return;
    setEditingDraftId(null);
    setDraftEditor(createEmptyDraftEditorForm());
  };

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (files.length === 0) return;
    if (!isAuthenticated) {
      onRequireLogin('prompt_case_admin_upload');
      return;
    }
    setIsUploading(true);
    setError('');
    try {
      const uploadedUrls: string[] = [];
      for (const file of files) {
        const result = await uploadAdminPromptCaseImageFile(file);
        uploadedUrls.push(result.imageUrl);
      }
      setEditor((current) => ({
        ...current,
        imageUrls: Array.from(new Set([...current.imageUrls, ...uploadedUrls]))
      }));
      setStatusText(
        t('promptCases.uploadedCount', { count: uploadedUrls.length })
      );
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : (t('promptCases.uploadFailed') as string)
      );
    } finally {
      setIsUploading(false);
    }
  };

  const handleDraftEditorUpload = async (
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (files.length === 0) return;
    if (!isAuthenticated) {
      onRequireLogin('prompt_case_draft_upload');
      return;
    }
    setIsDraftEditorUploading(true);
    setError('');
    try {
      const uploadedUrls: string[] = [];
      for (const file of files) {
        const result = await uploadAdminPromptCaseImageFile(file);
        uploadedUrls.push(result.imageUrl);
      }
      setDraftEditor((current) => {
        const imageUrls = Array.from(
          new Set([...current.imageUrls, ...uploadedUrls])
        );
        return {
          ...current,
          imageUrls,
          selectedImageUrl:
            current.selectedImageUrl &&
            imageUrls.includes(current.selectedImageUrl)
              ? current.selectedImageUrl
              : imageUrls[0] || ''
        };
      });
      setStatusText(
        t('promptCases.draftImagesUploaded', { count: uploadedUrls.length })
      );
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : (t('promptCases.uploadFailed') as string)
      );
    } finally {
      setIsDraftEditorUploading(false);
    }
  };

  const generateDraftCandidateImages = async (
    draftId: string
  ): Promise<PromptCaseDraft | null> => {
    const result = await generateAdminPromptCaseDraftImages({
      draftIds: [draftId],
      imageCount: 2
    });
    result.drafts.forEach(replaceAdminDraft);
    const generatedDraft = result.drafts[0] || null;
    if (generatedDraft) {
      if (editingDraftId === generatedDraft.id) {
        setDraftEditor(toDraftEditorForm(generatedDraft));
      }
      if (activeDraftPreview?.draftId === generatedDraft.id) {
        const nextImageUrl =
          generatedDraft.selectedImageUrl || generatedDraft.imageUrls[0] || '';
        setActiveDraftPreview(
          nextImageUrl
            ? {
                draftId: generatedDraft.id,
                url: nextImageUrl,
                mediaType: 'image'
              }
            : null
        );
      }
    }
    if (result.failures.length > 0) {
      setError(
        t('promptCases.draftImageFailures', {
          count: result.failures.length
        }) as string
      );
    } else {
      setStatusText(
        t('promptCases.draftImagesGenerated', {
          count: result.drafts.length
        }) as string
      );
    }
    return generatedDraft;
  };

  const handleDraftEditorSave = async (generateImages = false) => {
    if (!editingDraftId) return;
    const payload = buildDraftEditorPatch(draftEditor);
    if (!payload.title || !payload.prompt) {
      setError(
        td('promptCases.draftEditorRequiredFields', {
          defaultValue: '请至少填写标题和 Prompt。'
        })
      );
      return;
    }
    setIsDraftEditorSaving(true);
    setIsDraftEditorGenerating(generateImages);
    setDraftBusyId(editingDraftId);
    setError('');
    try {
      const saved = await saveAdminPromptCaseDraft(editingDraftId, payload);
      replaceAdminDraft(saved);
      if (generateImages) {
        const generated = await generateDraftCandidateImages(saved.id);
        if (generated) {
          setDraftEditor(toDraftEditorForm(generated));
        }
        setStatusText(t('promptCases.draftImagesGenerated', { count: 1 }));
      } else {
        setEditingDraftId(null);
        setDraftEditor(createEmptyDraftEditorForm());
        setStatusText(t('promptCases.draftSaved') as string);
      }
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : (t('promptCases.draftSaveFailed') as string)
      );
    } finally {
      setDraftBusyId(null);
      setIsDraftEditorSaving(false);
      setIsDraftEditorGenerating(false);
    }
  };

  const openDraftImportModal = () => {
    setDraftImportForm(createEmptyDraftImportForm());
    setIsDraftImportOpen(true);
    setError('');
    setStatusText('');
  };

  const closeDraftImportModal = () => {
    if (
      isDraftImportExtracting ||
      isDraftImportSaving ||
      isDraftImportUploading
    ) {
      return;
    }
    setIsDraftImportOpen(false);
    setDraftImportForm(createEmptyDraftImportForm());
  };

  const updateDraftImportForm = <K extends keyof DraftImportForm>(
    key: K,
    value: DraftImportForm[K]
  ) => {
    setDraftImportForm((current) => ({ ...current, [key]: value }));
  };

  const handleDraftImportImageUpload = async (
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (files.length === 0) return;
    if (!isAuthenticated) {
      onRequireLogin('prompt_case_draft_import_upload');
      return;
    }
    setIsDraftImportUploading(true);
    setError('');
    try {
      const uploadedUrls: string[] = [];
      for (const file of files) {
        const result = await uploadAdminPromptCaseImageFile(file);
        uploadedUrls.push(result.imageUrl);
      }
      setDraftImportForm((current) => {
        const imageUrls = Array.from(
          new Set([...current.imageUrls, ...uploadedUrls])
        );
        return {
          ...current,
          imageUrls,
          selectedImageUrl: current.selectedImageUrl || imageUrls[0] || ''
        };
      });
      setStatusText(
        t('promptCases.draftImportUploaded', {
          count: uploadedUrls.length,
          defaultValue: `已上传 ${uploadedUrls.length} 张导入图片`
        })
      );
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : (t('promptCases.uploadFailed') as string)
      );
    } finally {
      setIsDraftImportUploading(false);
    }
  };

  const handleDraftImportExtractTweet = async () => {
    const tweetUrl = draftImportForm.tweetUrl.trim();
    if (!tweetUrl) {
      setError(
        td('promptCases.draftImportTweetUrlRequired', {
          defaultValue: '请先粘贴 X/Twitter 推文链接。'
        })
      );
      return;
    }
    setIsDraftImportExtracting(true);
    setError('');
    setStatusText(
      td('promptCases.draftImportExtractingTweet', {
        defaultValue: '正在提取推文并识别 Prompt...'
      })
    );
    try {
      const extracted = await extractAdminPromptCaseDraftFromTweet(tweetUrl);
      const extractionWarning = getDraftImportExtractionWarning(extracted);
      setDraftImportForm(toDraftImportForm(extracted, tweetUrl));
      if (extractionWarning && !extracted.prompt?.trim()) {
        setStatusText(
          td('promptCases.draftImportExtractedWithWarning', {
            defaultValue:
              '已提取标题和媒体，但评论区 Prompt 没有稳定识别到，请手动补齐后再保存。'
          })
        );
      } else {
        setStatusText(
          td('promptCases.draftImportExtracted', {
            defaultValue: '已从推文提取案例信息，请确认后保存到草稿箱。'
          })
        );
      }
    } catch (extractError) {
      setError(
        extractError instanceof Error
          ? extractError.message
          : td('promptCases.draftImportExtractFailed', {
              defaultValue: '推文案例提取失败。'
            })
      );
    } finally {
      setIsDraftImportExtracting(false);
    }
  };

  const handleDraftImportSave = async (generateImages = false) => {
    const payload = buildDraftImportPayload(draftImportForm);
    const isVideoDraft = isVideoDraftImportPayload(payload);
    const needsPrompt = generateImages || !isVideoDraft;
    if (
      !payload.title ||
      (needsPrompt && !payload.prompt) ||
      payload.imageUrls.length === 0
    ) {
      setError(
        td('promptCases.draftImportRequiredFields', {
          defaultValue: '请至少填写标题、Prompt，并上传或提取一张案例图片。'
        })
      );
      return;
    }
    setIsDraftImportSaving(true);
    setIsDraftImportGenerating(generateImages);
    setError('');
    try {
      const saved = await createAdminPromptCaseDraftFromImport(payload);
      replaceAdminDraft(saved);
      if (generateImages) {
        await generateDraftCandidateImages(saved.id);
      }
      selectAdminTab('drafts');
      setIsDraftImportOpen(false);
      setDraftImportForm(createEmptyDraftImportForm());
      setStatusText(
        generateImages
          ? (t('promptCases.draftImagesGenerated', { count: 1 }) as string)
          : td('promptCases.draftImported', {
              defaultValue: '案例草稿已导入草稿箱。'
            })
      );
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : td('promptCases.draftImportSaveFailed', {
              defaultValue: '导入草稿保存失败。'
            })
      );
    } finally {
      setIsDraftImportSaving(false);
      setIsDraftImportGenerating(false);
    }
  };

  const handleDraftPatch = async (
    draft: PromptCaseDraft,
    patch: Parameters<typeof saveAdminPromptCaseDraft>[1]
  ): Promise<boolean> => {
    setDraftBusyId(draft.id);
    setError('');
    try {
      const saved = await saveAdminPromptCaseDraft(draft.id, patch);
      replaceAdminDraft(saved);
      setStatusText(t('promptCases.draftSaved') as string);
      return true;
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : (t('promptCases.draftSaveFailed') as string)
      );
      return false;
    } finally {
      setDraftBusyId(null);
    }
  };

  const openDraftPreview = (draft: PromptCaseDraft, url: string) => {
    setActiveDraftPreview({ draftId: draft.id, url, mediaType: 'image' });
    if (draft.selectedImageUrl !== url) {
      void handleDraftPatch(draft, { selectedImageUrl: url });
    }
  };

  const openDraftVideoPreview = (
    draft: PromptCaseDraft,
    videoUrls: string[],
    posterUrl?: string
  ) => {
    const [videoUrl] = videoUrls;
    if (!videoUrl) return;
    setActiveDraftPreview({
      draftId: draft.id,
      url: videoUrl,
      mediaType: 'video',
      posterUrl,
      videoUrls
    });
  };

  const refreshPromptCaseListsAfterPublish = async () => {
    const failures: string[] = [];
    try {
      const page = await getAdminPromptCases({
        sort: adminSortMode,
        offset: 0,
        limit: ADMIN_PROMPT_CASE_PAGE_SIZE,
        featuredOnly: adminFeaturedFilter === 'featured',
        search: deferredQuery
      });
      setAdminCases(page.cases);
      setAdminCasesTotal(page.total);
      setAdminCasesNextOffset(page.nextOffset);
    } catch (refreshError) {
      failures.push(
        refreshError instanceof Error
          ? refreshError.message
          : (t('promptCases.loadFailed') as string)
      );
    }

    try {
      const nextPublicCases = await getPublicPromptCases(120, {
        force: true,
        locale: activeLocale,
        packageSlug: activePackageSlug || undefined
      });
      setCases(sortPromptCasesByDefaultOrder(nextPublicCases));
    } catch (refreshError) {
      failures.push(
        refreshError instanceof Error
          ? refreshError.message
          : (t('promptCases.loadFailed') as string)
      );
    }

    if (failures.length > 0) {
      setStatusText(
        td('promptCases.draftPublishedRefreshFailed', {
          defaultValue: '草稿已发布，但列表刷新失败，请手动刷新。'
        })
      );
    }
  };

  const handleDraftPublish = async (
    draft: PromptCaseDraft
  ): Promise<boolean> => {
    if (draft.imageUrls.length === 0) {
      setError(
        td('promptCases.draftPublishNeedsImage', {
          defaultValue: '请先为草稿添加至少一张图片后再发布。'
        })
      );
      return false;
    }
    if (!draft.prompt.trim()) {
      setError(
        td('promptCases.draftPublishNeedsPrompt', {
          defaultValue: '请先补全草稿提示词后再发布。'
        })
      );
      return false;
    }
    setDraftBusyId(draft.id);
    setError('');
    setDraftPublishMessage(
      td('promptCases.draftPublishing', {
        defaultValue: '正在发布草稿...'
      })
    );
    setStatusText(
      td('promptCases.draftPublishing', {
        defaultValue: '正在发布草稿...'
      })
    );
    try {
      const published = await publishAdminPromptCaseDraft(draft.id);
      setAdminDrafts((current) =>
        current.filter((item) => item.id !== published.deletedDraftId)
      );
      if (activeDraftPreview?.draftId === published.deletedDraftId) {
        setActiveDraftPreview(null);
      }
      if (published.case) replaceAdminCase(published.case);
      setStatusText(t('promptCases.draftPublished') as string);
      setDraftPublishMessage('');
      setDraftPendingPublish(null);
      void refreshPromptCaseListsAfterPublish();
      return true;
    } catch (publishError) {
      const message =
        publishError instanceof Error
          ? publishError.message
          : (t('promptCases.draftPublishFailed') as string);
      setError(message);
      setDraftPublishMessage(message);
      setStatusText(
        td('promptCases.draftPublishFailed', {
          defaultValue: '草稿发布失败。'
        })
      );
      return false;
    } finally {
      setDraftBusyId(null);
    }
  };

  const requestDraftPublish = (draft: PromptCaseDraft) => {
    if (draft.imageUrls.length === 0) {
      setError(
        td('promptCases.draftPublishNeedsImage', {
          defaultValue: '请先为草稿添加至少一张图片后再发布。'
        })
      );
      return;
    }
    if (!draft.prompt.trim()) {
      setError(
        td('promptCases.draftPublishNeedsPrompt', {
          defaultValue: '请先补全草稿提示词后再发布。'
        })
      );
      return;
    }
    setError('');
    setDraftPublishMessage('');
    setDraftPendingPublish(draft);
  };

  const confirmDraftPublish = async () => {
    if (!draftPendingPublish) return;
    const didPublish = await handleDraftPublish(draftPendingPublish);
    if (didPublish) {
      setDraftPendingPublish(null);
    }
  };

  const requestDraftPublishAll = () => {
    if (publishableDrafts.length === 0) return;
    setError('');
    setDraftPublishMessage('');
    setDraftPublishAllProgress({
      completed: 0,
      total: publishableDrafts.length
    });
    setIsDraftPublishAllOpen(true);
  };

  const confirmDraftPublishAll = async () => {
    const draftsToPublish = [...publishableDrafts];
    if (draftsToPublish.length === 0) return;

    setIsDraftPublishAllBusy(true);
    setError('');
    setStatusText(
      td('promptCases.draftsPublishingAll', {
        count: draftsToPublish.length,
        defaultValue: `正在发布 ${draftsToPublish.length} 条草稿...`
      })
    );
    try {
      const result = await publishAllAdminPromptCaseDrafts(draftsToPublish, {
        concurrency: 3,
        onProgress: (completed, total) =>
          setDraftPublishAllProgress({ completed, total })
      });
      const deletedDraftIds = new Set(
        result.published.map((item) => item.deletedDraftId)
      );
      setAdminDrafts((current) =>
        current.filter((draft) => !deletedDraftIds.has(draft.id))
      );
      result.published.forEach((item) => {
        if (item.case) replaceAdminCase(item.case);
      });
      if (
        activeDraftPreview &&
        deletedDraftIds.has(activeDraftPreview.draftId)
      ) {
        setActiveDraftPreview(null);
      }

      const publishedCount = result.published.length;
      const failureCount = result.failures.length;
      if (failureCount > 0) {
        const summary = result.failures
          .slice(0, 3)
          .map((item) => `${item.title || item.draftId}: ${item.error}`)
          .join('；');
        setError(
          td('promptCases.draftsPublishAllFailureSummary', {
            count: failureCount,
            summary,
            defaultValue: `${failureCount} 条草稿发布失败并保留在草稿箱：${summary}`
          })
        );
      }
      setStatusText(
        failureCount > 0 || incompleteDraftCount > 0
          ? td('promptCases.draftsPublishAllPartial', {
              published: publishedCount,
              failed: failureCount,
              incomplete: incompleteDraftCount,
              defaultValue: `已发布 ${publishedCount} 条，${failureCount} 条失败，${incompleteDraftCount} 条信息不完整未发布。`
            })
          : td('promptCases.draftsPublishedAll', {
              count: publishedCount,
              defaultValue: `已发布全部 ${publishedCount} 条草稿。`
            })
      );
      setIsDraftPublishAllOpen(false);
      if (publishedCount > 0) {
        void refreshPromptCaseListsAfterPublish();
      }
    } catch (publishError) {
      const message =
        publishError instanceof Error
          ? publishError.message
          : td('promptCases.draftsPublishAllFailed', {
              defaultValue: '批量发布草稿失败。'
            });
      setError(message);
      setStatusText(message);
    } finally {
      setIsDraftPublishAllBusy(false);
    }
  };

  const requestDraftReject = (draft: PromptCaseDraft) => {
    setDraftPendingReject(draft);
    setDraftRejectNotes(draft.reviewNotes || '');
    setError('');
  };

  const confirmDraftReject = async () => {
    if (!draftPendingReject) return;
    const didReject = await handleDraftPatch(draftPendingReject, {
      status: 'rejected',
      reviewNotes: draftRejectNotes
    });
    if (didReject) {
      setDraftPendingReject(null);
      setDraftRejectNotes('');
    }
  };

  const requestDraftDelete = (draft: PromptCaseDraft) => {
    setDraftPendingDelete(draft);
    setError('');
  };

  const confirmDraftDelete = async () => {
    if (!draftPendingDelete) return;
    const draft = draftPendingDelete;
    setDraftBusyId(draft.id);
    setError('');
    try {
      const deleted = await deleteAdminPromptCaseDraft(draft.id);
      removeAdminDraft(deleted.deletedDraftId);
      setDraftPendingDelete(null);
      setStatusText(t('promptCases.draftDeleted') as string);
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : (t('promptCases.draftDeleteFailed') as string)
      );
    } finally {
      setDraftBusyId(null);
    }
  };

  const requestCaseDelete = (caseItem: PromptCase) => {
    setCasePendingDelete(caseItem);
    setError('');
  };

  const handleSave = async () => {
    const imageUrls = editor.imageUrls.map((url) => url.trim()).filter(Boolean);
    if (imageUrls.length === 0 || !editor.prompt.trim()) {
      setError(t('promptCases.required') as string);
      return;
    }
    const normalizedPromptPreview = derivePromptPreview(editor.prompt);
    const normalizedCommercialIntent =
      editor.commercialIntent.trim() ||
      deriveCommercialIntent({
        ...editor,
        promptPreview: normalizedPromptPreview
      });
    let visualRecipe: Record<string, unknown> | null;
    try {
      visualRecipe = parseVisualRecipe(editor.visualRecipeText);
    } catch (parseError) {
      setError(
        parseError instanceof Error
          ? parseError.message
          : 'visualRecipe 解析失败'
      );
      return;
    }
    setIsSaving(true);
    setError('');
    try {
      const payload = {
        id: editor.id,
        imageUrl: imageUrls[0],
        imageUrls,
        title: editor.title.trim(),
        slug: editor.slug.trim(),
        category: normalizeEditablePromptCaseCategory(editor.category),
        tags: editor.tags,
        model: editor.model.trim() || 'gemini-image',
        locale: editor.locale || 'zh-CN',
        featured: editor.featured,
        memberOnly: editor.memberOnly,
        packageSlug: editor.packageSlug.trim() || undefined,
        commercialIntent: normalizedCommercialIntent || undefined,
        promptPreview: normalizedPromptPreview || undefined,
        visualRecipe,
        prompt: editor.prompt.trim(),
        authorUrl: editor.authorUrl.trim() || null,
        isPublished: editor.isPublished
      };
      const saved = editor.id
        ? await saveAdminPromptCase(payload)
        : await createAdminPromptCase(payload);
      replaceAdminCase(saved);
      if (saved.isPublished !== false && !saved.deletedAt) {
        void loadPublicCases(true);
      }
      void loadAdminCases();
      setEditor(toEditable(saved));
      setAdminModalMode(null);
      setStatusText(t('promptCases.saved') as string);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : (t('promptCases.saveFailed') as string)
      );
    } finally {
      setIsSaving(false);
    }
  };

  const confirmCaseDelete = async () => {
    if (!casePendingDelete) return;
    const caseItem = casePendingDelete;
    setIsSaving(true);
    setError('');
    try {
      await deleteAdminPromptCase(caseItem.id);
      setAdminCases((current) =>
        current.filter((item) => item.id !== caseItem.id)
      );
      setCases((current) => current.filter((item) => item.id !== caseItem.id));
      if (editor.id === caseItem.id) setEditor(toEditable());
      if (selectedCase?.id === caseItem.id) setSelectedCase(null);
      if (editor.id === caseItem.id) setAdminModalMode(null);
      setCasePendingDelete(null);
      setStatusText(t('promptCases.deleted') as string);
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : (t('promptCases.deleteFailed') as string)
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleFeatured = async (caseItem: PromptCase) => {
    const nextFeatured = !caseItem.featured;
    const optimisticCase = { ...caseItem, featured: nextFeatured };
    replaceAdminCase(optimisticCase);
    if (selectedCase?.id === caseItem.id) setSelectedCase(optimisticCase);
    setError('');
    try {
      const saved = await saveAdminPromptCase({
        id: caseItem.id,
        featured: nextFeatured
      });
      replaceAdminCase(saved);
      if (selectedCase?.id === saved.id) setSelectedCase(saved);
      setStatusText(
        nextFeatured
          ? (t('promptCases.featuredEnabled') as string)
          : (t('promptCases.featuredDisabled') as string)
      );
    } catch (saveError) {
      replaceAdminCase(caseItem);
      if (selectedCase?.id === caseItem.id) setSelectedCase(caseItem);
      setError(
        saveError instanceof Error
          ? saveError.message
          : (t('promptCases.saveFailed') as string)
      );
    }
  };

  return (
    <div
      className={`creator-prompt-cases ${
        isFull ? 'creator-prompt-cases-full' : ''
      } ${isRail ? 'creator-prompt-cases-rail' : ''} ${
        isManaging ? 'creator-prompt-cases-managing' : ''
      }`}
    >
      {!isStandaloneAdmin && (
        <div className="creator-prompt-cases-title">
          <div>
            <strong>{t('promptCases.latestTitle')}</strong>
            {isFull && <p>{t('promptCases.librarySubtitle')}</p>}
          </div>
          <small>{promptCaseCountLabel}</small>
        </div>
      )}
      {isFull && !isStandaloneAdmin && (
        <Tabs value={activeCategory} onValueChange={setActiveCategory}>
          <TabsList className="creator-prompt-case-categories">
            {['all', ...PROMPT_CASE_CATEGORIES].map((category) => (
              <TabsTrigger
                key={category}
                value={category}
                className={activeCategory === category ? 'active' : ''}
              >
                {getCategoryLabel(category)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}
      {activePackageSlug && (
        <div className="creator-prompt-case-package-filter">
          <span>
            模板包：
            {td(`promptCases.packages.${activePackageSlug}`, {
              defaultValue: activePackageSlug
            })}
          </span>
          <Link to={`${localePrefix}/image`}>查看全部案例</Link>
        </div>
      )}
      <div className="creator-prompt-cases-toolbar">
        <div className="creator-search">
          <Input
            value={query}
            placeholder={t('promptCases.search') as string}
            aria-label={t('promptCases.search') as string}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <ShadcnButton
          type="button"
          variant="ghost"
          size="icon"
          className="creator-prompt-cases-icon-button"
          aria-label={t('promptCases.refresh') as string}
          title={t('promptCases.refresh') as string}
          onClick={() => void loadPublicCases(true)}
        >
          {isLoading ? (
            <Loader2 className="creator-spin-icon" />
          ) : (
            <RefreshCw />
          )}
        </ShadcnButton>
        {isPromptCaseAdmin && isRail && adminManageHref && (
          <Link
            className="creator-prompt-cases-manage-link"
            to={adminManageHref}
          >
            {t('promptCases.manage')}
          </Link>
        )}
        {isPromptCaseAdmin && !isRail && !forceManageOpen && (
          <ShadcnButton
            type="button"
            variant={isManaging ? 'default' : 'outline'}
            size="sm"
            className={`creator-prompt-cases-manage-button ${
              isManaging ? 'active' : ''
            }`}
            onClick={() => {
              if (!isAuthenticated) {
                onRequireLogin('prompt_case_admin_manage');
                return;
              }
              setIsManaging((value) => {
                const nextValue = !value;
                if (!nextValue) {
                  setStatusText('');
                  void loadPublicCases(true);
                }
                return nextValue;
              });
            }}
          >
            {t('promptCases.manage')}
          </ShadcnButton>
        )}
        {isManaging && canRenderAdminWorkspace && (
          <Tabs
            value={adminTab}
            onValueChange={(value) => selectAdminTab(value as AdminPanelTab)}
          >
            <TabsList className="creator-prompt-case-admin-tabs">
              {(['cases', 'drafts'] as AdminPanelTab[]).map((tab) => (
                <TabsTrigger
                  key={tab}
                  value={tab}
                  className={adminTab === tab ? 'active' : ''}
                >
                  {t(`promptCases.adminTabs.${tab}`)}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}
        {isManaging && canRenderAdminWorkspace && adminTab === 'cases' && (
          <Select
            value={adminSortMode}
            onValueChange={(value) => setAdminSortMode(value as AdminSortMode)}
          >
            <SelectTrigger
              className="creator-prompt-case-sort-select"
              aria-label={t('promptCases.sort.label') as string}
            >
              <SelectValue placeholder={t('promptCases.sort.label')} />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {ADMIN_SORT_MODES.map((mode) => (
                  <SelectItem key={mode} value={mode}>
                    {t(`promptCases.sort.${mode}`)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        )}
      </div>

      {isManaging && canRenderAdminWorkspace && (
        <div className="creator-prompt-case-admin">
          <div className="creator-prompt-case-admin-head">
            <strong>{t('promptCases.adminTitle')}</strong>
            {adminTab === 'cases' && (
              <div className="creator-prompt-case-admin-head-actions">
                <ShadcnButton
                  type="button"
                  size="sm"
                  onClick={openCreateCaseModal}
                >
                  <Plus data-icon="inline-start" />
                  {t('promptCases.newCase')}
                </ShadcnButton>
              </div>
            )}
          </div>
          {adminTab === 'cases' && (
            <>
              <Tabs
                value={adminFeaturedFilter}
                onValueChange={(value) =>
                  setAdminFeaturedFilter(value as AdminFeaturedFilter)
                }
              >
                <TabsList
                  className="creator-prompt-case-admin-filter-tabs"
                  aria-label={t('promptCases.adminFilterLabel') as string}
                >
                  {(['all', 'featured'] as AdminFeaturedFilter[]).map(
                    (filter) => (
                      <TabsTrigger
                        key={filter}
                        value={filter}
                        className={
                          adminFeaturedFilter === filter ? 'active' : ''
                        }
                      >
                        {filter === 'featured'
                          ? t('promptCases.adminFeaturedOnly')
                          : t('promptCases.adminAllCases')}
                        <ShadcnBadge variant="secondary">
                          {filter === 'featured'
                            ? adminFeaturedFilter === 'featured'
                              ? adminCasesTotal
                              : adminFeaturedCaseCount
                            : adminFeaturedFilter === 'all'
                              ? adminCasesTotal
                              : adminCanonicalCases.length}
                        </ShadcnBadge>
                      </TabsTrigger>
                    )
                  )}
                </TabsList>
              </Tabs>
              <div className="creator-prompt-case-admin-metrics">
                <div>
                  <span>{t('promptCases.metrics.views')}</span>
                  <strong>{adminMetrics.views.toLocaleString()}</strong>
                </div>
                <div>
                  <span>{t('promptCases.metrics.copies')}</span>
                  <strong>{adminMetrics.copies.toLocaleString()}</strong>
                </div>
                <div>
                  <span>{t('promptCases.metrics.generates')}</span>
                  <strong>{adminMetrics.generates.toLocaleString()}</strong>
                </div>
                <div>
                  <span>{t('promptCases.metrics.generateRate')}</span>
                  <strong>{adminMetrics.generateRate}</strong>
                </div>
              </div>
              <div className="creator-prompt-case-admin-list">
                {isAdminLoading && filteredCases.length === 0 && (
                  <PromptCaseAdminListSkeleton />
                )}
                {filteredCases.map((caseItem) => (
                  <article
                    key={caseItem.id}
                    className="creator-prompt-case-admin-row"
                  >
                    <button
                      type="button"
                      className="creator-prompt-case-admin-row-cover"
                      aria-label={`${td('promptCases.previewCase', {
                        defaultValue: '预览案例'
                      })}: ${caseItem.title || t('promptCases.previewTitle')}`}
                      aria-busy={adminCaseDetailLoadingId === caseItem.id}
                      disabled={adminCaseDetailLoadingId === caseItem.id}
                      onClick={() => void openAdminCasePreview(caseItem)}
                    >
                      <PromptCaseDraftImage
                        url={
                          normalizePromptCaseImages(caseItem)[0] ||
                          getPromptCaseCardImage(caseItem, 160)
                        }
                        title={caseItem.title || ''}
                      />
                    </button>
                    <div className="creator-prompt-case-admin-row-main">
                      <strong>
                        {caseItem.title || t('promptCases.previewTitle')}
                      </strong>
                      <span>
                        {caseItem.locale || 'zh-CN'}
                        {' · '}
                        {getPromptCaseModelLabel(caseItem.model) ||
                          'gpt-image-2'}
                        {' · '}
                        {getCategoryLabel(caseItem.category || 'featured')}
                        {caseItem.packageSlug
                          ? ` · ${caseItem.packageSlug}`
                          : ''}
                      </span>
                      <small>
                        {caseItem.promptPreview ||
                          caseItem.commercialIntent ||
                          caseItem.prompt}
                      </small>
                    </div>
                    <div className="creator-prompt-case-admin-row-metrics">
                      <span>
                        <small>{t('promptCases.metrics.views')}</small>
                        <strong>
                          {getPromptCaseViews(caseItem).toLocaleString()}
                        </strong>
                      </span>
                      <span>
                        <small>{t('promptCases.metrics.copies')}</small>
                        <strong>
                          {getPromptCaseCopies(caseItem).toLocaleString()}
                        </strong>
                      </span>
                      <span>
                        <small>{t('promptCases.metrics.generates')}</small>
                        <strong>
                          {getPromptCaseGenerates(caseItem).toLocaleString()}
                        </strong>
                      </span>
                    </div>
                    <div className="creator-prompt-case-admin-row-actions">
                      <ShadcnButton
                        type="button"
                        size="icon"
                        variant="outline"
                        className={caseItem.featured ? 'active' : ''}
                        title={
                          caseItem.featured
                            ? (t('promptCases.unsetFeatured') as string)
                            : (t('promptCases.setFeatured') as string)
                        }
                        aria-label={
                          caseItem.featured
                            ? (t('promptCases.unsetFeatured') as string)
                            : (t('promptCases.setFeatured') as string)
                        }
                        aria-pressed={Boolean(caseItem.featured)}
                        onClick={() => void handleToggleFeatured(caseItem)}
                      >
                        <Star data-icon="inline-start" />
                      </ShadcnButton>
                      <ShadcnButton
                        type="button"
                        size="icon"
                        variant="outline"
                        title={t('promptCases.edit') as string}
                        aria-label={t('promptCases.edit') as string}
                        disabled={adminCaseDetailLoadingId === caseItem.id}
                        onClick={() => void openEditCaseModal(caseItem)}
                      >
                        <Pencil data-icon="inline-start" />
                      </ShadcnButton>
                      <ShadcnButton
                        type="button"
                        size="icon"
                        variant="outline"
                        title={t('promptCases.delete') as string}
                        aria-label={t('promptCases.delete') as string}
                        onClick={() => requestCaseDelete(caseItem)}
                      >
                        <Trash2 data-icon="inline-start" />
                      </ShadcnButton>
                    </div>
                  </article>
                ))}
                {!isLoading &&
                  !isAdminLoading &&
                  filteredCases.length === 0 && (
                    <Empty className="creator-library-empty">
                      <EmptyHeader>
                        <EmptyTitle>{t('promptCases.empty')}</EmptyTitle>
                      </EmptyHeader>
                    </Empty>
                  )}
                {adminCasesNextOffset !== null && (
                  <ShadcnButton
                    type="button"
                    variant="outline"
                    className="creator-prompt-case-load-more"
                    onClick={() => void loadMoreAdminCases()}
                    disabled={isAdminLoading || isAdminLoadingMore}
                  >
                    {isAdminLoadingMore
                      ? td('promptCases.loadingMore', {
                          defaultValue: '正在加载更多...'
                        })
                      : td('promptCases.loadMore', {
                          defaultValue: `加载更多（已加载 ${adminCases.length}/${adminCasesTotal}）`
                        })}
                  </ShadcnButton>
                )}
              </div>
            </>
          )}
          {adminTab === 'drafts' && (
            <div className="creator-prompt-case-drafts">
              <div className="creator-prompt-case-draft-actions">
                <ShadcnButton
                  type="button"
                  size="sm"
                  className="creator-library-upload"
                  onClick={openDraftImportModal}
                  disabled={
                    isDraftLoading ||
                    Boolean(draftBusyId) ||
                    isDraftPublishAllBusy
                  }
                >
                  <Plus data-icon="inline-start" />
                  {td('promptCases.importDraft', {
                    defaultValue: '导入案例'
                  })}
                </ShadcnButton>
                <ShadcnButton
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={requestDraftPublishAll}
                  disabled={
                    isDraftLoading ||
                    Boolean(draftBusyId) ||
                    isDraftPublishAllBusy ||
                    publishableDrafts.length === 0
                  }
                  title={
                    publishableDrafts.length > 0
                      ? td('promptCases.publishAllDrafts', {
                          defaultValue: '发布全部草稿'
                        })
                      : td('promptCases.publishAllDraftsUnavailable', {
                          defaultValue: '没有可发布的完整草稿'
                        })
                  }
                >
                  {isDraftPublishAllBusy ? (
                    <Loader2
                      data-icon="inline-start"
                      className="creator-spin-icon"
                    />
                  ) : (
                    <CheckCheck data-icon="inline-start" />
                  )}
                  {td('promptCases.publishAllDraftsWithCount', {
                    count: publishableDrafts.length,
                    defaultValue: `发布全部（${publishableDrafts.length}）`
                  })}
                </ShadcnButton>
                <ShadcnButton
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void loadAdminDrafts()}
                  disabled={
                    isDraftLoading ||
                    Boolean(draftBusyId) ||
                    isDraftPublishAllBusy
                  }
                >
                  <RefreshCw data-icon="inline-start" />
                  {t('promptCases.refreshDrafts')}
                </ShadcnButton>
              </div>
              <div className="creator-prompt-case-admin-list creator-prompt-case-draft-list">
                {isDraftLoading && filteredDrafts.length === 0 && (
                  <PromptCaseAdminListSkeleton />
                )}
                {filteredDrafts.map((draft) => {
                  const isBusy = draftBusyId === draft.id;
                  const canMutateDraft =
                    !isBusy &&
                    !isDraftPublishAllBusy &&
                    draft.status !== 'published';
                  const isPublishDisabled = !canMutateDraft;
                  const publishDraftTitle =
                    draft.imageUrls.length === 0
                      ? td('promptCases.draftPublishNeedsImage', {
                          defaultValue: '请先为草稿添加至少一张图片后再发布。'
                        })
                      : !draft.prompt.trim()
                        ? td('promptCases.draftPublishNeedsPrompt', {
                            defaultValue: '请先补全草稿提示词后再发布。'
                          })
                        : isBusy
                          ? td('promptCases.draftPublishing', {
                              defaultValue: '正在发布草稿...'
                            })
                          : (t('promptCases.publishDraft') as string);
                  const primaryImageUrl =
                    draft.selectedImageUrl &&
                    draft.imageUrls.includes(draft.selectedImageUrl)
                      ? draft.selectedImageUrl
                      : draft.imageUrls[0] || '';
                  const primaryVideoUrls = getPromptCaseDraftVideoUrls(draft);
                  const primaryVideoUrl = primaryVideoUrls[0] || '';
                  return (
                    <article
                      key={draft.id}
                      className="creator-prompt-case-admin-row creator-prompt-case-draft-row"
                    >
                      <button
                        type="button"
                        className="creator-prompt-case-admin-row-cover"
                        aria-label={`${td('promptCases.previewDraft', {
                          defaultValue: '预览草稿'
                        })}: ${draft.title || t('promptCases.previewTitle')}`}
                        onClick={() =>
                          primaryVideoUrl
                            ? openDraftVideoPreview(
                                draft,
                                primaryVideoUrls,
                                primaryImageUrl
                              )
                            : primaryImageUrl
                              ? openDraftPreview(draft, primaryImageUrl)
                              : openEditDraftModal(draft)
                        }
                      >
                        <PromptCaseDraftMediaThumb
                          imageUrl={primaryImageUrl}
                          videoUrl={primaryVideoUrl}
                          title={draft.title || ''}
                        />
                      </button>
                      <div className="creator-prompt-case-admin-row-main">
                        <strong>
                          {draft.title || t('promptCases.previewTitle')}
                        </strong>
                        <span>
                          {getDraftLocale(draft)}
                          {' · '}
                          {getPromptCaseModelLabel(getDraftModel(draft)) ||
                            getDraftModel(draft)}
                          {' · '}
                          {getCategoryLabel(draft.category || 'portrait')}
                          {' · '}
                          {getDraftStatusLabel(draft.status)}
                        </span>
                        <small>
                          {draft.promptPreview ||
                            draft.commercialIntent ||
                            draft.prompt ||
                            getDraftSourceUrl(draft)}
                        </small>
                      </div>
                      <div className="creator-prompt-case-admin-row-metrics">
                        <span>
                          <small>{t('promptCases.formSections.media')}</small>
                          <strong>{draft.imageUrls.length}</strong>
                        </span>
                        <span>
                          <small>{t('promptCases.status')}</small>
                          <strong>{getDraftStatusLabel(draft.status)}</strong>
                        </span>
                        <span>
                          <small>{t('promptCases.memberOnly')}</small>
                          <strong>
                            {draft.memberOnly
                              ? t('promptCases.memberOnlyBadge')
                              : '-'}
                          </strong>
                        </span>
                      </div>
                      <div className="creator-prompt-case-admin-row-actions">
                        <ShadcnButton
                          type="button"
                          size="icon"
                          variant="outline"
                          title={t('promptCases.edit') as string}
                          aria-label={t('promptCases.edit') as string}
                          disabled={isDraftPublishAllBusy}
                          onClick={() => openEditDraftModal(draft)}
                        >
                          <Pencil data-icon="inline-start" />
                        </ShadcnButton>
                        <ShadcnButton
                          type="button"
                          size="icon"
                          variant="outline"
                          title={publishDraftTitle}
                          aria-label={publishDraftTitle}
                          disabled={isPublishDisabled}
                          onClick={() => requestDraftPublish(draft)}
                        >
                          {isBusy ? (
                            <Loader2
                              data-icon="inline-start"
                              className="creator-spin-icon"
                            />
                          ) : (
                            <Check data-icon="inline-start" />
                          )}
                        </ShadcnButton>
                        <ShadcnButton
                          type="button"
                          size="icon"
                          variant="outline"
                          title={t('promptCases.rejectDraft') as string}
                          aria-label={t('promptCases.rejectDraft') as string}
                          disabled={!canMutateDraft}
                          onClick={() => requestDraftReject(draft)}
                        >
                          <X data-icon="inline-start" />
                        </ShadcnButton>
                        <ShadcnButton
                          type="button"
                          size="icon"
                          variant="outline"
                          className="creator-prompt-case-danger-action"
                          title={t('promptCases.deleteDraft') as string}
                          aria-label={t('promptCases.deleteDraft') as string}
                          disabled={isBusy || isDraftPublishAllBusy}
                          onClick={() => requestDraftDelete(draft)}
                        >
                          <Trash2 data-icon="inline-start" />
                        </ShadcnButton>
                      </div>
                    </article>
                  );
                })}
                {!isDraftLoading && filteredDrafts.length === 0 && (
                  <Empty className="creator-library-empty">
                    <EmptyHeader>
                      <EmptyTitle>
                        {adminDrafts.length === 0
                          ? t('promptCases.draftsEmpty')
                          : t('promptCases.empty')}
                      </EmptyTitle>
                      <EmptyDescription>
                        {td('promptCases.draftsEmptyDescription', {
                          defaultValue:
                            '导入公开案例或从外部链接提取素材后，可在这里统一发布。'
                        })}
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {(error || statusText) && (
        <div className="creator-prompt-case-message">
          {error ? <span>{error}</span> : <small>{statusText}</small>}
        </div>
      )}

      {(!isManaging || isRail) && (
        <div
          className="creator-prompt-case-grid"
          ref={promptCaseGridRef}
          style={
            {
              '--creator-prompt-case-active-columns': promptCaseColumns.length
            } as CSSProperties
          }
        >
          {promptCaseColumns.map((column, columnIndex) => (
            <div
              key={`prompt-case-column-${columnIndex}`}
              className="creator-prompt-case-column"
            >
              {column.map(({ caseItem, index }) => {
                const recipeAssets = getPromptCaseVisualRecipeAssets(
                  caseItem,
                  isRail ? 3 : 4,
                  promptAssetCatalog
                );
                return (
                  <article
                    key={caseItem.id}
                    role="button"
                    tabIndex={0}
                    className="creator-prompt-case-card"
                    style={
                      {
                        '--prompt-case-card-aspect-ratio':
                          getPromptCaseCardAspectRatio(caseItem, index)
                      } as CSSProperties
                    }
                    aria-busy={adminCaseDetailLoadingId === caseItem.id}
                    onClick={() =>
                      isManaging
                        ? void openAdminCasePreview(caseItem)
                        : setSelectedCase(caseItem)
                    }
                    onKeyDown={(event) => handleCardKeyDown(event, caseItem)}
                  >
                    <PromptCaseCardImage
                      caseItem={caseItem}
                      index={index}
                      variant={variant}
                    />
                    <span className="creator-prompt-case-card-overlay">
                      <ShadcnButton
                        type="button"
                        size="sm"
                        className="creator-prompt-case-card-overlay-action"
                        title={t('promptCases.usePrompt') as string}
                        aria-label={t('promptCases.usePrompt') as string}
                        onClick={(event) => {
                          event.stopPropagation();
                          handleRecreate(caseItem);
                        }}
                      >
                        <Pencil data-icon="inline-start" />
                        {!isRail && (
                          <span className="creator-prompt-case-card-overlay-label">
                            {t('promptCases.usePrompt')}
                          </span>
                        )}
                      </ShadcnButton>
                    </span>
                    <span className="creator-prompt-case-card-caption">
                      <strong>
                        {caseItem.title || t('promptCases.previewTitle')}
                      </strong>
                      <small>
                        {getCategoryLabel(caseItem.category || 'featured')}
                      </small>
                      {recipeAssets.length > 0 && (
                        <span
                          className="creator-prompt-case-card-recipe"
                          aria-label={
                            activeLocale === 'en-US'
                              ? 'Matched visual recipe'
                              : '匹配到的素材配方'
                          }
                        >
                          {recipeAssets.map(({ slot, asset }) => (
                            <button
                              key={`${slot}:${asset.id}`}
                              type="button"
                              title={asset.title}
                              onClick={(event) => {
                                event.stopPropagation();
                                handleRecreate(caseItem, slot);
                              }}
                            >
                              <em>{asset.title}</em>
                            </button>
                          ))}
                        </span>
                      )}
                      {isManaging && (
                        <span className="creator-prompt-case-card-metrics">
                          <em>
                            {getPromptCaseViews(caseItem).toLocaleString()}
                          </em>
                          <em>
                            {getPromptCaseCopies(caseItem).toLocaleString()}
                          </em>
                          <em>
                            {getPromptCaseGenerates(caseItem).toLocaleString()}
                          </em>
                        </span>
                      )}
                    </span>
                    {isManaging && (
                      <span className="creator-prompt-case-card-actions">
                        <ShadcnButton
                          type="button"
                          size="icon"
                          variant="outline"
                          className={
                            caseItem.featured
                              ? 'creator-prompt-case-featured-toggle active'
                              : 'creator-prompt-case-featured-toggle'
                          }
                          title={
                            caseItem.featured
                              ? (t('promptCases.unsetFeatured') as string)
                              : (t('promptCases.setFeatured') as string)
                          }
                          aria-pressed={Boolean(caseItem.featured)}
                          aria-label={
                            caseItem.featured
                              ? (t('promptCases.unsetFeatured') as string)
                              : (t('promptCases.setFeatured') as string)
                          }
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleToggleFeatured(caseItem);
                          }}
                        >
                          <Star data-icon="inline-start" />
                        </ShadcnButton>
                        <ShadcnButton
                          type="button"
                          size="icon"
                          variant="outline"
                          title={t('promptCases.edit') as string}
                          aria-label={t('promptCases.edit') as string}
                          onClick={(event) => {
                            event.stopPropagation();
                            void openEditCaseModal(caseItem);
                          }}
                        >
                          <Pencil data-icon="inline-start" />
                        </ShadcnButton>
                        <ShadcnButton
                          type="button"
                          size="icon"
                          variant="outline"
                          title={t('promptCases.delete') as string}
                          aria-label={t('promptCases.delete') as string}
                          onClick={(event) => {
                            event.stopPropagation();
                            requestCaseDelete(caseItem);
                          }}
                        >
                          <Trash2 data-icon="inline-start" />
                        </ShadcnButton>
                      </span>
                    )}
                    {caseItem.isPublished === false && (
                      <span className="creator-prompt-case-unpublished">
                        {t('promptCases.unpublished')}
                      </span>
                    )}
                    {isManaging && caseItem.memberOnly && (
                      <span className="creator-prompt-case-member-only">
                        {t('promptCases.memberOnlyBadge')}
                      </span>
                    )}
                  </article>
                );
              })}
            </div>
          ))}

          {!isLoading && !isAdminLoading && filteredCases.length === 0 && (
            <div className="creator-library-empty">
              {t('promptCases.empty')}
            </div>
          )}
        </div>
      )}

      {canLoadMorePromptCases && (
        <ShadcnButton
          type="button"
          size="sm"
          variant="outline"
          className="creator-prompt-case-load-more"
          onClick={() =>
            setVisiblePromptCaseCount((current) =>
              Math.min(
                filteredCases.length,
                current + mobilePromptCaseBatchSize
              )
            )
          }
        >
          {t('history.loadMore')}
        </ShadcnButton>
      )}

      <Dialog
        open={isDraftImportOpen}
        title={td('promptCases.draftImportModalTitle', {
          defaultValue: '导入草稿箱案例'
        })}
        closeLabel={t('preview.close') as string}
        closeDisabled={
          isDraftImportExtracting ||
          isDraftImportSaving ||
          isDraftImportUploading ||
          isDraftImportGenerating
        }
        className="creator-prompt-case-admin-modal creator-prompt-case-draft-import-modal"
        onClose={closeDraftImportModal}
        footer={
          <div className="creator-prompt-case-admin-modal-actions">
            <ShadcnButton
              type="button"
              variant="outline"
              onClick={closeDraftImportModal}
              disabled={
                isDraftImportExtracting ||
                isDraftImportSaving ||
                isDraftImportUploading ||
                isDraftImportGenerating
              }
            >
              {t('common.cancel', { defaultValue: '取消' })}
            </ShadcnButton>
            <ShadcnButton
              type="button"
              variant="outline"
              disabled={
                isDraftImportExtracting ||
                isDraftImportSaving ||
                isDraftImportUploading ||
                isDraftImportGenerating
              }
              onClick={() => void handleDraftImportSave(true)}
            >
              {isDraftImportGenerating ? (
                <Loader2 data-icon="inline-start" />
              ) : (
                <ImagePlus data-icon="inline-start" />
              )}
              {td('promptCases.saveAndGenerateImages', {
                defaultValue: '保存并生成候选图'
              })}
            </ShadcnButton>
            <ShadcnButton
              type="button"
              className="creator-library-upload"
              disabled={
                isDraftImportExtracting ||
                isDraftImportSaving ||
                isDraftImportUploading ||
                isDraftImportGenerating
              }
              onClick={() => void handleDraftImportSave(false)}
            >
              {isDraftImportSaving ? (
                <Loader2 data-icon="inline-start" />
              ) : (
                <Check data-icon="inline-start" />
              )}
              {td('promptCases.saveImportedDraft', {
                defaultValue: '保存到草稿箱'
              })}
            </ShadcnButton>
          </div>
        }
      >
        <div className="creator-prompt-case-admin-modal-body">
          <div className="creator-prompt-case-form creator-prompt-case-form-compact creator-prompt-case-modal-form">
            <section className="creator-prompt-case-form-section creator-prompt-case-draft-import-source">
              <div className="creator-prompt-case-form-section-head">
                <strong>
                  {td('promptCases.draftImportSource', {
                    defaultValue: '推文链接导入'
                  })}
                </strong>
                <span>
                  {td('promptCases.draftImportSourceHint', {
                    defaultValue:
                      '粘贴 X/Twitter 链接后提取，也可以直接手动填写。'
                  })}
                </span>
              </div>
              <label className="wide creator-prompt-case-draft-import-url">
                {td('promptCases.tweetUrl', { defaultValue: '推文链接' })}
                <div>
                  <input
                    value={draftImportForm.tweetUrl}
                    placeholder="https://x.com/user/status/..."
                    onChange={(event) =>
                      updateDraftImportForm('tweetUrl', event.target.value)
                    }
                  />
                  <ShadcnButton
                    type="button"
                    variant="outline"
                    onClick={() => void handleDraftImportExtractTweet()}
                    disabled={
                      isDraftImportExtracting ||
                      isDraftImportSaving ||
                      isDraftImportUploading
                    }
                  >
                    {isDraftImportExtracting ? (
                      <Loader2 data-icon="inline-start" />
                    ) : (
                      <ExternalLink data-icon="inline-start" />
                    )}
                    {td('promptCases.extractTweetCase', {
                      defaultValue: '提取'
                    })}
                  </ShadcnButton>
                </div>
              </label>
              {isDraftImportExtracting && draftImportExtractProgress && (
                <div className="creator-prompt-case-draft-import-progress">
                  <Loader2 size={14} className="creator-spin-icon" />
                  <span>{draftImportExtractProgress}</span>
                </div>
              )}
            </section>

            <section className="creator-prompt-case-form-section creator-prompt-case-form-basics">
              <div className="creator-prompt-case-form-section-head">
                <strong>{t('promptCases.formSections.basics')}</strong>
                <span>
                  {td('promptCases.draftImportBasicsHint', {
                    defaultValue: '这些字段会直接进入新增草稿。'
                  })}
                </span>
              </div>
              <label className="wide">
                {t('promptCases.title')}
                <input
                  value={draftImportForm.title}
                  onChange={(event) =>
                    updateDraftImportForm('title', event.target.value)
                  }
                />
              </label>
              <label>
                {t('promptCases.category')}
                <select
                  value={draftImportForm.category}
                  onChange={(event) =>
                    updateDraftImportForm('category', event.target.value)
                  }
                >
                  {PROMPT_CASE_CONTENT_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {getCategoryLabel(category)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="wide">
                {t('promptCases.tags')}
                <input
                  value={draftImportForm.tagsText}
                  onChange={(event) =>
                    updateDraftImportForm('tagsText', event.target.value)
                  }
                />
              </label>
              <label className="wide creator-prompt-case-url-action-field">
                {t('promptCases.sourceUrl')}
                <div>
                  <input
                    value={getDraftImportSourceUrl(draftImportForm)}
                    onChange={(event) =>
                      setDraftImportForm((current) => ({
                        ...current,
                        generationSettings: {
                          ...current.generationSettings,
                          sourceUrl: event.target.value
                        }
                      }))
                    }
                  />
                  <ShadcnButton
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={!getDraftImportSourceUrl(draftImportForm).trim()}
                    aria-label={td('promptCases.openSourceUrl', {
                      defaultValue: '打开来源地址'
                    })}
                    title={td('promptCases.openSourceUrl', {
                      defaultValue: '打开来源地址'
                    })}
                    onClick={() =>
                      openUrlInNewTab(getDraftImportSourceUrl(draftImportForm))
                    }
                  >
                    <ExternalLink />
                  </ShadcnButton>
                </div>
              </label>
            </section>

            <section className="creator-prompt-case-form-section creator-prompt-case-form-media">
              <div className="creator-prompt-case-form-section-head">
                <strong>{t('promptCases.formSections.media')}</strong>
                <span>{draftImportForm.imageUrls.length}</span>
              </div>
              <label className="wide">
                {t('promptCases.imageUrls')}
                <textarea
                  className="creator-prompt-case-url-list"
                  value={draftImportForm.imageUrls.join('\n')}
                  onChange={(event) => {
                    const imageUrls = event.target.value
                      .split(/\n+/)
                      .map((url) => url.trim())
                      .filter(Boolean);
                    setDraftImportForm((current) => ({
                      ...current,
                      imageUrls,
                      selectedImageUrl:
                        imageUrls.find(
                          (url) => url === current.selectedImageUrl
                        ) ||
                        imageUrls[0] ||
                        ''
                    }));
                  }}
                />
              </label>
              <label className="creator-prompt-case-upload">
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(event) => void handleDraftImportImageUpload(event)}
                />
                {isDraftImportUploading ? (
                  <Loader2 size={14} className="creator-spin-icon" />
                ) : (
                  <ImagePlus size={14} />
                )}
                {t('promptCases.upload')}
              </label>
              <PromptCaseDraftVideoPreview
                videoUrls={getDraftFormVideoUrls(draftImportForm)}
                posterUrl={
                  draftImportForm.selectedImageUrl ||
                  draftImportForm.imageUrls[0]
                }
                title={draftImportForm.title || ''}
              />
              {draftImportForm.imageUrls.length > 0 && (
                <div className="creator-prompt-case-form-images">
                  {draftImportForm.imageUrls.map((url, index) => (
                    <figure key={`${url}-${index}`}>
                      <img
                        src={getOptimizedPromptCaseImageUrl(url, {
                          width: 180,
                          quality: 72
                        })}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        referrerPolicy="no-referrer"
                      />
                      <ShadcnButton
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={t('promptCases.removeImage') as string}
                        onClick={() =>
                          setDraftImportForm((current) => {
                            const imageUrls = current.imageUrls.filter(
                              (_, itemIndex) => itemIndex !== index
                            );
                            return {
                              ...current,
                              imageUrls,
                              selectedImageUrl:
                                imageUrls.find(
                                  (item) => item === current.selectedImageUrl
                                ) ||
                                imageUrls[0] ||
                                ''
                            };
                          })
                        }
                      >
                        <X />
                      </ShadcnButton>
                    </figure>
                  ))}
                </div>
              )}
            </section>

            <section className="creator-prompt-case-form-section creator-prompt-case-form-prompt">
              <div className="creator-prompt-case-form-section-head">
                <strong>{t('promptCases.formSections.prompt')}</strong>
                <span>{t('promptCases.promptPreviewAutoHint')}</span>
              </div>
              <label className="creator-prompt-case-prompt-main wide">
                {t('promptCases.prompt')}
                <textarea
                  value={draftImportForm.prompt}
                  onChange={(event) =>
                    updateDraftImportForm('prompt', event.target.value)
                  }
                />
              </label>
            </section>

            <details className="creator-prompt-case-advanced">
              <summary>{t('promptCases.advancedFields')}</summary>
              <section className="creator-prompt-case-form-section creator-prompt-case-form-basics">
                <label>
                  {t('promptCases.commercialIntent')}
                  <textarea
                    value={draftImportForm.commercialIntent}
                    onChange={(event) =>
                      updateDraftImportForm(
                        'commercialIntent',
                        event.target.value
                      )
                    }
                  />
                </label>
                <label>
                  {t('promptCases.negativePrompt')}
                  <textarea
                    value={draftImportForm.negativePrompt}
                    onChange={(event) =>
                      updateDraftImportForm(
                        'negativePrompt',
                        event.target.value
                      )
                    }
                  />
                </label>
                <label className="wide">
                  {td('promptCases.reviewNotes', {
                    defaultValue: '审核备注'
                  })}
                  <textarea
                    value={draftImportForm.reviewNotes}
                    onChange={(event) =>
                      updateDraftImportForm('reviewNotes', event.target.value)
                    }
                  />
                </label>
                <label className="creator-prompt-case-check">
                  <input
                    type="checkbox"
                    checked={draftImportForm.memberOnly}
                    onChange={(event) =>
                      updateDraftImportForm('memberOnly', event.target.checked)
                    }
                  />
                  {t('promptCases.memberOnly')}
                </label>
              </section>
            </details>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={Boolean(draftPendingPublish)}
        title={td('promptCases.publishDraftConfirmTitle', {
          defaultValue: '确认发布草稿'
        })}
        closeLabel={t('preview.close') as string}
        closeDisabled={Boolean(draftBusyId)}
        className="creator-prompt-case-admin-modal creator-prompt-case-status-modal"
        onClose={() => {
          if (!draftBusyId) {
            setDraftPendingPublish(null);
          }
        }}
        footer={
          <div className="creator-prompt-case-admin-modal-actions">
            <ShadcnButton
              type="button"
              variant="outline"
              onClick={() => setDraftPendingPublish(null)}
              disabled={Boolean(draftBusyId)}
            >
              {t('common.cancel', { defaultValue: '取消' })}
            </ShadcnButton>
            <ShadcnButton
              type="button"
              className="creator-library-upload"
              disabled={Boolean(draftBusyId)}
              onClick={() => void confirmDraftPublish()}
            >
              {draftBusyId ? (
                <Loader2
                  data-icon="inline-start"
                  className="creator-spin-icon"
                />
              ) : (
                <Check data-icon="inline-start" />
              )}
              {td('promptCases.confirmPublishDraft', {
                defaultValue: '确认发布'
              })}
            </ShadcnButton>
          </div>
        }
      >
        {draftPendingPublish && (
          <div className="creator-prompt-case-admin-modal-body">
            <div className="creator-prompt-case-form creator-prompt-case-form-compact">
              <section className="creator-prompt-case-form-section creator-prompt-case-form-basics">
                <div className="creator-prompt-case-form-section-head">
                  <strong>
                    {draftPendingPublish.title || t('promptCases.previewTitle')}
                  </strong>
                  <span>
                    {td('promptCases.publishDraftConfirmDesc', {
                      defaultValue:
                        '发布后该草稿会进入正式案例库，并从草稿箱移除。'
                    })}
                  </span>
                </div>
                <div className="creator-prompt-case-admin-row-metrics">
                  <span>
                    <small>{t('promptCases.formSections.media')}</small>
                    <strong>{draftPendingPublish.imageUrls.length}</strong>
                  </span>
                  <span>
                    <small>{t('promptCases.status')}</small>
                    <strong>
                      {getDraftStatusLabel(draftPendingPublish.status)}
                    </strong>
                  </span>
                  <span>
                    <small>{t('promptCases.memberOnly')}</small>
                    <strong>
                      {draftPendingPublish.memberOnly
                        ? t('promptCases.memberOnlyBadge')
                        : '-'}
                    </strong>
                  </span>
                </div>
                {draftPublishMessage ? (
                  <p
                    className="creator-prompt-case-message"
                    role={error ? 'alert' : 'status'}
                  >
                    {draftPublishMessage}
                  </p>
                ) : null}
              </section>
            </div>
          </div>
        )}
      </Dialog>

      <PromptCaseDraftPublishAllDialog
        open={isDraftPublishAllOpen}
        busy={isDraftPublishAllBusy}
        publishableCount={publishableDrafts.length}
        incompleteCount={incompleteDraftCount}
        totalCount={adminDrafts.length}
        progress={draftPublishAllProgress}
        onClose={() => setIsDraftPublishAllOpen(false)}
        onConfirm={() => void confirmDraftPublishAll()}
      />

      <Dialog
        open={Boolean(draftPendingReject)}
        title={td('promptCases.rejectDraftConfirmTitle', {
          defaultValue: '确认拒绝草稿'
        })}
        closeLabel={t('preview.close') as string}
        closeDisabled={Boolean(draftBusyId)}
        className="creator-prompt-case-admin-modal creator-prompt-case-status-modal"
        onClose={() => {
          if (!draftBusyId) {
            setDraftPendingReject(null);
            setDraftRejectNotes('');
          }
        }}
        footer={
          <div className="creator-prompt-case-admin-modal-actions">
            <ShadcnButton
              type="button"
              variant="outline"
              onClick={() => {
                setDraftPendingReject(null);
                setDraftRejectNotes('');
              }}
              disabled={Boolean(draftBusyId)}
            >
              {t('common.cancel', { defaultValue: '取消' })}
            </ShadcnButton>
            <ShadcnButton
              type="button"
              className="creator-library-upload"
              disabled={Boolean(draftBusyId)}
              onClick={() => void confirmDraftReject()}
            >
              {draftBusyId ? (
                <Loader2
                  data-icon="inline-start"
                  className="creator-spin-icon"
                />
              ) : (
                <X data-icon="inline-start" />
              )}
              {td('promptCases.confirmRejectDraft', {
                defaultValue: '确认拒绝'
              })}
            </ShadcnButton>
          </div>
        }
      >
        {draftPendingReject && (
          <div className="creator-prompt-case-admin-modal-body">
            <div className="creator-prompt-case-form creator-prompt-case-form-compact">
              <section className="creator-prompt-case-form-section creator-prompt-case-form-basics">
                <div className="creator-prompt-case-form-section-head">
                  <strong>
                    {draftPendingReject.title || t('promptCases.previewTitle')}
                  </strong>
                  <span>
                    {td('promptCases.rejectDraftConfirmDesc', {
                      defaultValue:
                        '拒绝后该草稿会保留在草稿箱，状态变为已拒绝。'
                    })}
                  </span>
                </div>
                <label className="wide">
                  {td('promptCases.reviewNotes', {
                    defaultValue: '审核备注'
                  })}
                  <textarea
                    value={draftRejectNotes}
                    onChange={(event) =>
                      setDraftRejectNotes(event.target.value)
                    }
                  />
                </label>
              </section>
            </div>
          </div>
        )}
      </Dialog>

      <Dialog
        open={Boolean(draftPendingDelete)}
        title={td('promptCases.deleteDraftConfirmTitle', {
          defaultValue: '确认删除草稿'
        })}
        closeLabel={t('preview.close') as string}
        closeDisabled={Boolean(draftBusyId)}
        className="creator-prompt-case-admin-modal creator-prompt-case-status-modal"
        onClose={() => {
          if (!draftBusyId) {
            setDraftPendingDelete(null);
          }
        }}
        footer={
          <div className="creator-prompt-case-admin-modal-actions">
            <ShadcnButton
              type="button"
              variant="outline"
              onClick={() => setDraftPendingDelete(null)}
              disabled={Boolean(draftBusyId)}
            >
              {t('common.cancel', { defaultValue: '取消' })}
            </ShadcnButton>
            <ShadcnButton
              type="button"
              className="creator-library-upload"
              disabled={Boolean(draftBusyId)}
              onClick={() => void confirmDraftDelete()}
            >
              {draftBusyId ? (
                <Loader2
                  data-icon="inline-start"
                  className="creator-spin-icon"
                />
              ) : (
                <Trash2 data-icon="inline-start" />
              )}
              {td('promptCases.confirmDeleteDraft', {
                defaultValue: '确认删除'
              })}
            </ShadcnButton>
          </div>
        }
      >
        {draftPendingDelete && (
          <div className="creator-prompt-case-admin-modal-body">
            <div className="creator-prompt-case-form creator-prompt-case-form-compact">
              <section className="creator-prompt-case-form-section creator-prompt-case-form-basics">
                <div className="creator-prompt-case-form-section-head">
                  <strong>
                    {draftPendingDelete.title || t('promptCases.previewTitle')}
                  </strong>
                  <span>{t('promptCases.deleteDraftConfirm')}</span>
                </div>
                <div className="creator-prompt-case-admin-row-metrics">
                  <span>
                    <small>{t('promptCases.formSections.media')}</small>
                    <strong>{draftPendingDelete.imageUrls.length}</strong>
                  </span>
                  <span>
                    <small>{t('promptCases.status')}</small>
                    <strong>
                      {getDraftStatusLabel(draftPendingDelete.status)}
                    </strong>
                  </span>
                  <span>
                    <small>{t('promptCases.memberOnly')}</small>
                    <strong>
                      {draftPendingDelete.memberOnly
                        ? t('promptCases.memberOnlyBadge')
                        : '-'}
                    </strong>
                  </span>
                </div>
              </section>
            </div>
          </div>
        )}
      </Dialog>

      <Dialog
        open={Boolean(editingDraftId)}
        title={td('promptCases.editDraftModalTitle', {
          defaultValue: '编辑草稿案例'
        })}
        closeLabel={t('preview.close') as string}
        closeDisabled={
          isDraftEditorSaving ||
          isDraftEditorUploading ||
          isDraftEditorGenerating
        }
        className="creator-prompt-case-admin-modal creator-prompt-case-draft-editor-modal"
        onClose={closeDraftEditorModal}
        footer={
          editingDraftId ? (
            <div className="creator-prompt-case-admin-modal-actions">
              <ShadcnButton
                type="button"
                variant="outline"
                onClick={closeDraftEditorModal}
                disabled={
                  isDraftEditorSaving ||
                  isDraftEditorUploading ||
                  isDraftEditorGenerating
                }
              >
                {t('common.cancel', { defaultValue: '取消' })}
              </ShadcnButton>
              <ShadcnButton
                type="button"
                variant="outline"
                disabled={
                  isDraftEditorSaving ||
                  isDraftEditorUploading ||
                  isDraftEditorGenerating ||
                  draftEditor.status === 'published'
                }
                onClick={() => void handleDraftEditorSave(true)}
              >
                {isDraftEditorGenerating ? (
                  <Loader2 data-icon="inline-start" />
                ) : (
                  <ImagePlus data-icon="inline-start" />
                )}
                {td('promptCases.saveAndGenerateImages', {
                  defaultValue: '保存并生成候选图'
                })}
              </ShadcnButton>
              <ShadcnButton
                type="button"
                className="creator-library-upload"
                disabled={
                  isDraftEditorSaving ||
                  isDraftEditorUploading ||
                  isDraftEditorGenerating
                }
                onClick={() => void handleDraftEditorSave(false)}
              >
                {isDraftEditorSaving ? (
                  <Loader2 data-icon="inline-start" />
                ) : (
                  <Check data-icon="inline-start" />
                )}
                {t('promptCases.save')}
              </ShadcnButton>
            </div>
          ) : null
        }
      >
        {editingDraftId && (
          <div className="creator-prompt-case-admin-modal-body">
            <div className="creator-prompt-case-form creator-prompt-case-form-compact creator-prompt-case-modal-form">
              <section className="creator-prompt-case-form-section creator-prompt-case-form-basics">
                <div className="creator-prompt-case-form-section-head">
                  <strong>{t('promptCases.formSections.basics')}</strong>
                  <span>{t('promptCases.modalBasicsHint')}</span>
                </div>
                <label className="wide">
                  {t('promptCases.title')}
                  <input
                    value={draftEditor.title}
                    onChange={(event) =>
                      updateDraftEditor('title', event.target.value)
                    }
                  />
                </label>
                <label>
                  {t('promptCases.model')}
                  <select
                    value={draftEditor.model}
                    onChange={(event) =>
                      updateDraftEditor('model', event.target.value)
                    }
                  >
                    {draftEditor.model &&
                      !PROMPT_CASE_MODEL_PRESETS.some(
                        (preset) => preset.value === draftEditor.model
                      ) && (
                        <option value={draftEditor.model}>
                          {draftEditor.model}
                        </option>
                      )}
                    {PROMPT_CASE_MODEL_PRESETS.map((preset) => (
                      <option key={preset.value} value={preset.value}>
                        {preset.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t('promptCases.category')}
                  <select
                    value={draftEditor.category}
                    onChange={(event) =>
                      updateDraftEditor('category', event.target.value)
                    }
                  >
                    {PROMPT_CASE_CONTENT_CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {getCategoryLabel(category)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t('promptCases.locale')}
                  <select
                    value={draftEditor.locale}
                    onChange={(event) =>
                      updateDraftEditor(
                        'locale',
                        event.target.value === 'en-US' ? 'en-US' : 'zh-CN'
                      )
                    }
                  >
                    <option value="zh-CN">zh-CN</option>
                    <option value="en-US">en-US</option>
                  </select>
                </label>
                <label>
                  {t('promptCases.status')}
                  <select
                    value={draftEditor.status}
                    onChange={(event) =>
                      updateDraftEditor(
                        'status',
                        event.target.value as PromptCaseDraftStatus
                      )
                    }
                  >
                    {DRAFT_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {getDraftStatusLabel(status)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t('promptCases.imageSize')}
                  <select
                    value={draftEditor.imageSize}
                    onChange={(event) =>
                      updateDraftEditor('imageSize', event.target.value)
                    }
                  >
                    {PROMPT_CASE_IMAGE_SIZE_PRESETS.map((imageSize) => (
                      <option key={imageSize} value={imageSize}>
                        {imageSize}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t('promptCases.packageSlug')}
                  <input
                    value={draftEditor.packageSlug}
                    onChange={(event) =>
                      updateDraftEditor('packageSlug', event.target.value)
                    }
                  />
                </label>
                <label className="wide">
                  {t('promptCases.tags')}
                  <input
                    value={draftEditor.tagsText}
                    onChange={(event) =>
                      updateDraftEditor('tagsText', event.target.value)
                    }
                  />
                </label>
                <label className="wide creator-prompt-case-url-action-field">
                  {t('promptCases.sourceUrl')}
                  <div>
                    <input
                      value={draftEditor.sourceUrl}
                      onChange={(event) =>
                        updateDraftEditor('sourceUrl', event.target.value)
                      }
                    />
                    <ShadcnButton
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={!draftEditor.sourceUrl.trim()}
                      aria-label={td('promptCases.openSourceUrl', {
                        defaultValue: '打开来源地址'
                      })}
                      title={td('promptCases.openSourceUrl', {
                        defaultValue: '打开来源地址'
                      })}
                      onClick={() => openUrlInNewTab(draftEditor.sourceUrl)}
                    >
                      <ExternalLink />
                    </ShadcnButton>
                  </div>
                </label>
              </section>

              <section className="creator-prompt-case-form-section creator-prompt-case-form-media">
                <div className="creator-prompt-case-form-section-head">
                  <strong>{t('promptCases.formSections.media')}</strong>
                  <span>{draftEditor.imageUrls.length}</span>
                </div>
                <label className="wide">
                  {t('promptCases.imageUrls')}
                  <textarea
                    className="creator-prompt-case-url-list"
                    value={draftEditor.imageUrls.join('\n')}
                    onChange={(event) => {
                      const imageUrls = event.target.value
                        .split(/\n+/)
                        .map((url) => url.trim())
                        .filter(Boolean);
                      setDraftEditor((current) => ({
                        ...current,
                        imageUrls,
                        selectedImageUrl:
                          imageUrls.find(
                            (url) => url === current.selectedImageUrl
                          ) ||
                          imageUrls[0] ||
                          ''
                      }));
                    }}
                  />
                </label>
                <label className="creator-prompt-case-upload">
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(event) => void handleDraftEditorUpload(event)}
                  />
                  {isDraftEditorUploading ? (
                    <Loader2 size={14} className="creator-spin-icon" />
                  ) : (
                    <ImagePlus size={14} />
                  )}
                  {t('promptCases.uploadCandidateImages')}
                </label>
                <PromptCaseDraftVideoPreview
                  videoUrls={getDraftFormVideoUrls(draftEditor)}
                  posterUrl={
                    draftEditor.selectedImageUrl || draftEditor.imageUrls[0]
                  }
                  title={draftEditor.title || ''}
                />
                {draftEditor.imageUrls.length > 0 && (
                  <div className="creator-prompt-case-form-images">
                    {draftEditor.imageUrls.map((url, index) => (
                      <figure key={`${url}-${index}`}>
                        <img
                          src={getOptimizedPromptCaseImageUrl(url, {
                            width: 180,
                            quality: 72
                          })}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          referrerPolicy="no-referrer"
                        />
                        <ShadcnButton
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={t('promptCases.removeImage') as string}
                          onClick={() =>
                            setDraftEditor((current) => {
                              const imageUrls = current.imageUrls.filter(
                                (_, itemIndex) => itemIndex !== index
                              );
                              return {
                                ...current,
                                imageUrls,
                                selectedImageUrl:
                                  imageUrls.find(
                                    (item) => item === current.selectedImageUrl
                                  ) ||
                                  imageUrls[0] ||
                                  ''
                              };
                            })
                          }
                        >
                          <X />
                        </ShadcnButton>
                      </figure>
                    ))}
                  </div>
                )}
              </section>

              <section className="creator-prompt-case-form-section creator-prompt-case-form-prompt">
                <div className="creator-prompt-case-form-section-head">
                  <strong>{t('promptCases.formSections.prompt')}</strong>
                  <span>{t('promptCases.promptPreviewAutoHint')}</span>
                </div>
                <label className="creator-prompt-case-prompt-main wide">
                  {t('promptCases.prompt')}
                  <textarea
                    value={draftEditor.prompt}
                    onChange={(event) =>
                      updateDraftEditor('prompt', event.target.value)
                    }
                  />
                </label>
              </section>

              <details className="creator-prompt-case-advanced">
                <summary>{t('promptCases.advancedFields')}</summary>
                <section className="creator-prompt-case-form-section creator-prompt-case-form-basics">
                  <label>
                    {t('promptCases.commercialIntent')}
                    <textarea
                      value={draftEditor.commercialIntent}
                      onChange={(event) =>
                        updateDraftEditor(
                          'commercialIntent',
                          event.target.value
                        )
                      }
                    />
                  </label>
                  <label>
                    {t('promptCases.negativePrompt')}
                    <textarea
                      value={draftEditor.negativePrompt}
                      onChange={(event) =>
                        updateDraftEditor('negativePrompt', event.target.value)
                      }
                    />
                  </label>
                  <label className="wide">
                    {td('promptCases.reviewNotes', {
                      defaultValue: '审核备注'
                    })}
                    <textarea
                      value={draftEditor.reviewNotes}
                      onChange={(event) =>
                        updateDraftEditor('reviewNotes', event.target.value)
                      }
                    />
                  </label>
                  <label className="creator-prompt-case-check">
                    <input
                      type="checkbox"
                      checked={draftEditor.memberOnly}
                      onChange={(event) =>
                        updateDraftEditor('memberOnly', event.target.checked)
                      }
                    />
                    {t('promptCases.memberOnly')}
                  </label>
                </section>
              </details>
            </div>
          </div>
        )}
      </Dialog>

      <Dialog
        open={Boolean(casePendingDelete)}
        title={td('promptCases.deleteCaseConfirmTitle', {
          defaultValue: '确认删除案例'
        })}
        closeLabel={t('preview.close') as string}
        closeDisabled={isSaving}
        className="creator-prompt-case-admin-modal creator-prompt-case-status-modal"
        onClose={() => {
          if (!isSaving) {
            setCasePendingDelete(null);
          }
        }}
        footer={
          <div className="creator-prompt-case-admin-modal-actions">
            <ShadcnButton
              type="button"
              variant="outline"
              onClick={() => setCasePendingDelete(null)}
              disabled={isSaving}
            >
              {t('common.cancel', { defaultValue: '取消' })}
            </ShadcnButton>
            <ShadcnButton
              type="button"
              className="creator-library-upload"
              disabled={isSaving}
              onClick={() => void confirmCaseDelete()}
            >
              {isSaving ? (
                <Loader2
                  data-icon="inline-start"
                  className="creator-spin-icon"
                />
              ) : (
                <Trash2 data-icon="inline-start" />
              )}
              {td('promptCases.confirmDeleteCase', {
                defaultValue: '确认删除'
              })}
            </ShadcnButton>
          </div>
        }
      >
        {casePendingDelete && (
          <div className="creator-prompt-case-admin-modal-body">
            <div className="creator-prompt-case-form creator-prompt-case-form-compact">
              <section className="creator-prompt-case-form-section creator-prompt-case-form-basics">
                <div className="creator-prompt-case-form-section-head">
                  <strong>
                    {casePendingDelete.title || t('promptCases.previewTitle')}
                  </strong>
                  <span>{t('promptCases.deleteConfirm')}</span>
                </div>
                <div className="creator-prompt-case-admin-row-metrics">
                  <span>
                    <small>{t('promptCases.metrics.views')}</small>
                    <strong>
                      {getPromptCaseViews(casePendingDelete).toLocaleString()}
                    </strong>
                  </span>
                  <span>
                    <small>{t('promptCases.metrics.copies')}</small>
                    <strong>
                      {getPromptCaseCopies(casePendingDelete).toLocaleString()}
                    </strong>
                  </span>
                  <span>
                    <small>{t('promptCases.metrics.generates')}</small>
                    <strong>
                      {getPromptCaseGenerates(
                        casePendingDelete
                      ).toLocaleString()}
                    </strong>
                  </span>
                </div>
              </section>
            </div>
          </div>
        )}
      </Dialog>

      <Dialog
        open={Boolean(adminModalMode)}
        title={
          adminModalMode === 'create'
            ? t('promptCases.createModalTitle')
            : t('promptCases.editModalTitle')
        }
        closeLabel={t('preview.close') as string}
        closeDisabled={isSaving || isUploading}
        className="creator-prompt-case-admin-modal"
        onClose={() => {
          if (!isSaving && !isUploading) {
            closeAdminCaseModal();
          }
        }}
        footer={
          adminModalMode ? (
            <div className="creator-prompt-case-admin-modal-actions">
              <ShadcnButton
                type="button"
                variant="outline"
                onClick={closeAdminCaseModal}
                disabled={isSaving || isUploading}
              >
                {t('common.cancel', { defaultValue: '取消' })}
              </ShadcnButton>
              <ShadcnButton
                type="button"
                className="creator-library-upload"
                disabled={isSaving || isUploading}
                onClick={() => void handleSave()}
              >
                {isSaving ? (
                  <Loader2 data-icon="inline-start" />
                ) : (
                  <Check data-icon="inline-start" />
                )}
                {adminModalMode === 'create'
                  ? t('promptCases.create')
                  : t('promptCases.save')}
              </ShadcnButton>
            </div>
          ) : null
        }
      >
        {adminModalMode && (
          <div className="creator-prompt-case-admin-modal-body">
            <div className="creator-prompt-case-form creator-prompt-case-form-compact creator-prompt-case-modal-form">
              <section className="creator-prompt-case-form-section creator-prompt-case-form-basics">
                <div className="creator-prompt-case-form-section-head">
                  <strong>{t('promptCases.formSections.basics')}</strong>
                  <span>{t('promptCases.modalBasicsHint')}</span>
                </div>
                <label className="wide">
                  {t('promptCases.title')}
                  <input
                    value={editor.title}
                    onChange={(event) =>
                      updateEditor('title', event.target.value)
                    }
                  />
                </label>
                <label>
                  {t('promptCases.model')}
                  <select
                    value={editor.model}
                    onChange={(event) =>
                      updateEditor('model', event.target.value)
                    }
                  >
                    {editor.model &&
                      !PROMPT_CASE_MODEL_PRESETS.some(
                        (preset) => preset.value === editor.model
                      ) && <option value={editor.model}>{editor.model}</option>}
                    {PROMPT_CASE_MODEL_PRESETS.map((preset) => (
                      <option key={preset.value} value={preset.value}>
                        {preset.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t('promptCases.category')}
                  <select
                    value={editor.category}
                    onChange={(event) =>
                      updateEditor('category', event.target.value)
                    }
                  >
                    {PROMPT_CASE_CONTENT_CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {getCategoryLabel(category)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t('promptCases.locale')}
                  <select
                    value={editor.locale}
                    onChange={(event) =>
                      updateEditor('locale', event.target.value)
                    }
                  >
                    <option value="zh-CN">zh-CN</option>
                    <option value="en-US">en-US</option>
                  </select>
                </label>
                <label>
                  {t('promptCases.packageSlug')}
                  <select
                    value={editor.packageSlug}
                    onChange={(event) =>
                      updateEditor('packageSlug', event.target.value)
                    }
                  >
                    <option value="">{t('promptCases.noPackage')}</option>
                    {editor.packageSlug &&
                      !COMMERCIAL_PACKAGE_OPTIONS.includes(
                        editor.packageSlug
                      ) && (
                        <option value={editor.packageSlug}>
                          {editor.packageSlug}
                        </option>
                      )}
                    {COMMERCIAL_PACKAGE_OPTIONS.map((packageSlug) => (
                      <option key={packageSlug} value={packageSlug}>
                        {td(`promptCases.packages.${packageSlug}`, {
                          defaultValue: packageSlug
                        })}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="wide">
                  {t('promptCases.tags')}
                  <input
                    value={editor.tags.join(', ')}
                    onChange={(event) =>
                      updateEditor(
                        'tags',
                        event.target.value
                          .split(/[,，]/)
                          .map((tag) => tag.trim())
                          .filter(Boolean)
                      )
                    }
                  />
                </label>
                <label className="wide creator-prompt-case-url-action-field">
                  {t('promptCases.authorUrl')}
                  <div>
                    <input
                      value={editor.authorUrl}
                      onChange={(event) =>
                        updateEditor('authorUrl', event.target.value)
                      }
                    />
                    <ShadcnButton
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={!editor.authorUrl.trim()}
                      aria-label={td('promptCases.openSourceUrl', {
                        defaultValue: '打开来源地址'
                      })}
                      title={td('promptCases.openSourceUrl', {
                        defaultValue: '打开来源地址'
                      })}
                      onClick={() => openUrlInNewTab(editor.authorUrl)}
                    >
                      <ExternalLink />
                    </ShadcnButton>
                  </div>
                </label>
              </section>

              <section className="creator-prompt-case-form-section creator-prompt-case-form-media">
                <div className="creator-prompt-case-form-section-head">
                  <strong>{t('promptCases.formSections.media')}</strong>
                  <span>{editor.imageUrls.length}</span>
                </div>
                <label className="wide">
                  {t('promptCases.imageUrls')}
                  <textarea
                    className="creator-prompt-case-url-list"
                    value={editor.imageUrls.join('\n')}
                    onChange={(event) =>
                      updateEditor(
                        'imageUrls',
                        event.target.value
                          .split(/\n+/)
                          .map((url) => url.trim())
                          .filter(Boolean)
                      )
                    }
                  />
                </label>
                <label className="creator-prompt-case-upload">
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(event) => void handleUpload(event)}
                  />
                  {isUploading ? (
                    <Loader2 size={14} className="creator-spin-icon" />
                  ) : (
                    <ImagePlus size={14} />
                  )}
                  {t('promptCases.upload')}
                </label>
                {editor.imageUrls.length > 0 && (
                  <div className="creator-prompt-case-form-images">
                    {editor.imageUrls.map((url, index) => (
                      <figure key={`${url}-${index}`}>
                        <img
                          src={getOptimizedPromptCaseImageUrl(url, {
                            width: 180,
                            quality: 72
                          })}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          referrerPolicy="no-referrer"
                        />
                        <ShadcnButton
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={t('promptCases.removeImage') as string}
                          onClick={() =>
                            updateEditor(
                              'imageUrls',
                              editor.imageUrls.filter(
                                (_, itemIndex) => itemIndex !== index
                              )
                            )
                          }
                        >
                          <X />
                        </ShadcnButton>
                      </figure>
                    ))}
                  </div>
                )}
              </section>

              <section className="creator-prompt-case-form-section creator-prompt-case-form-prompt">
                <div className="creator-prompt-case-form-section-head">
                  <strong>{t('promptCases.formSections.prompt')}</strong>
                  <span>{t('promptCases.promptPreviewAutoHint')}</span>
                </div>
                <label className="creator-prompt-case-prompt-main wide">
                  {t('promptCases.prompt')}
                  <textarea
                    value={editor.prompt}
                    onChange={(event) =>
                      updateEditor('prompt', event.target.value)
                    }
                  />
                </label>
              </section>

              <details className="creator-prompt-case-advanced">
                <summary>{t('promptCases.advancedFields')}</summary>
                <section className="creator-prompt-case-form-section creator-prompt-case-form-basics">
                  <label>
                    {t('promptCases.slug')}
                    <input
                      value={editor.slug}
                      onChange={(event) =>
                        updateEditor('slug', event.target.value)
                      }
                    />
                  </label>
                  <label>
                    {t('promptCases.commercialIntent')}
                    <textarea
                      value={editor.commercialIntent}
                      placeholder={deriveCommercialIntent(editor)}
                      onChange={(event) =>
                        updateEditor('commercialIntent', event.target.value)
                      }
                    />
                  </label>
                  <label className="wide">
                    可视化配方 JSON
                    <textarea
                      className="creator-prompt-case-visual-recipe-input"
                      value={editor.visualRecipeText}
                      placeholder={`{\n  "version": 1,\n  "selection": {\n    "character": "character-korean-glam-girl",\n    "expression": "expression-soft-smile",\n    "pose": "pose-casual-sitting"\n  }\n}`}
                      onChange={(event) =>
                        updateEditor('visualRecipeText', event.target.value)
                      }
                    />
                  </label>
                </section>
              </details>

              <section className="creator-prompt-case-form-section creator-prompt-case-form-switches">
                <div className="creator-prompt-case-form-section-head">
                  <strong>{t('promptCases.formSections.settings')}</strong>
                </div>
                <label className="creator-prompt-case-check">
                  <input
                    type="checkbox"
                    checked={editor.isPublished}
                    onChange={(event) =>
                      updateEditor('isPublished', event.target.checked)
                    }
                  />
                  {t('promptCases.published')}
                </label>
                <label className="creator-prompt-case-check">
                  <input
                    type="checkbox"
                    checked={editor.featured}
                    onChange={(event) =>
                      updateEditor('featured', event.target.checked)
                    }
                  />
                  {t('promptCases.featured')}
                </label>
                <label className="creator-prompt-case-check">
                  <input
                    type="checkbox"
                    checked={editor.memberOnly}
                    onChange={(event) =>
                      updateEditor('memberOnly', event.target.checked)
                    }
                  />
                  {t('promptCases.memberOnly')}
                </label>
              </section>
            </div>
          </div>
        )}
      </Dialog>

      {selectedCase && (
        <div
          className="creator-preview-backdrop create-gallery-preview-backdrop"
          role="presentation"
          onMouseDown={closePreview}
        >
          <section
            ref={promptCasePreviewRef}
            className="creator-preview create-gallery-preview-modal"
            role="dialog"
            aria-modal="true"
            aria-label={td('promptCases.previewModalTitle', {
              defaultValue: '案例预览'
            })}
            tabIndex={-1}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="creator-preview-head">
              <span>
                {td('promptCases.previewModalTitle', {
                  defaultValue: '案例预览'
                })}
              </span>
              <div className="creator-preview-head-actions">
                {buildShareUrl &&
                  !isRecentGenerationPromptCase(selectedCase) && (
                    <button
                      type="button"
                      className="creator-preview-share-button"
                      aria-label={t('promptCases.share') as string}
                      title={t('promptCases.share') as string}
                      onClick={handleCopyShareUrl}
                    >
                      {copiedShareUrl ? (
                        <Check size={18} />
                      ) : (
                        <Share2 size={18} />
                      )}
                    </button>
                  )}
                <button
                  type="button"
                  className="creator-preview-close-button"
                  aria-label={t('preview.close') as string}
                  onClick={closePreview}
                >
                  <X size={20} />
                </button>
              </div>
            </div>
            <div className="creator-preview-body">
              <div className="creator-preview-image">
                {isActivePreviewVideo ? (
                  <video
                    className="creator-preview-video"
                    src={activePreviewVideo}
                    poster={activePreviewImage || undefined}
                    autoPlay
                    muted
                    loop
                    playsInline
                    controls
                    preload="auto"
                    aria-label={selectedCase.title || ''}
                  />
                ) : (
                  <button
                    type="button"
                    className="creator-preview-image-zoom create-gallery-preview-image-button"
                    aria-label={t('promptCases.openImageFullscreen') as string}
                    onClick={() => setLightboxOpen(true)}
                  >
                    <img
                      src={getOptimizedPromptCaseImageUrl(activePreviewImage, {
                        width: 1280,
                        quality: 82
                      })}
                      alt=""
                      decoding="async"
                      {...imageFetchPriority('high')}
                      referrerPolicy="no-referrer"
                    />
                    <span>
                      <Maximize2 size={16} />
                    </span>
                  </button>
                )}
                {canNavigateCases && (
                  <>
                    <button
                      type="button"
                      className="creator-preview-nav prev"
                      aria-label={td('promptCases.previousCase', {
                        defaultValue: '上一个作品'
                      })}
                      onClick={() => goToCase(-1)}
                    >
                      <ChevronLeft size={20} />
                    </button>
                    <button
                      type="button"
                      className="creator-preview-nav next"
                      aria-label={td('promptCases.nextCase', {
                        defaultValue: '下一个作品'
                      })}
                      onClick={() => goToCase(1)}
                    >
                      <ChevronRight size={20} />
                    </button>
                  </>
                )}
                {selectedCaseImages.length > 1 && (
                  <div
                    className="creator-preview-image-switcher"
                    aria-label={td('promptCases.imageSwitcher', {
                      defaultValue: '切换案例图片'
                    })}
                  >
                    {selectedCaseImages.map((imageUrl, index) => (
                      <button
                        key={`${imageUrl}-${index}`}
                        type="button"
                        className={index === activeImageIndex ? 'active' : ''}
                        aria-label={td('promptCases.goToImage', {
                          defaultValue: `切换到第 ${index + 1} 张图片`
                        })}
                        onClick={() => setActiveImageIndex(index)}
                      >
                        <img
                          src={getOptimizedPromptCaseImageUrl(imageUrl, {
                            width: 120,
                            quality: 70
                          })}
                          alt=""
                          loading="lazy"
                          decoding="async"
                        />
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="creator-preview-side">
                {selectedCaseRecipeAssets.length > 0 && (
                  <section
                    className="creator-prompt-case-preview-recipe"
                    aria-label={
                      activeLocale === 'en-US'
                        ? 'Matched visual recipe'
                        : '匹配到的素材配方'
                    }
                  >
                    <div>
                      <span>
                        {activeLocale === 'en-US'
                          ? 'Visual recipe'
                          : '素材配方'}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRecreate(selectedCase)}
                      >
                        <Wand2 size={14} />
                        {activeLocale === 'en-US'
                          ? 'Create your version'
                          : '按这套配方创作'}
                      </button>
                    </div>
                    <div className="creator-prompt-case-preview-recipe-grid">
                      {selectedCaseRecipeAssets.map(({ slot, asset }) => (
                        <button
                          key={`${slot}:${asset.id}`}
                          type="button"
                          className={
                            activeRecipeAssetId === asset.id ? 'active' : ''
                          }
                          aria-pressed={activeRecipeAssetId === asset.id}
                          onClick={() => setActiveRecipeAssetId(asset.id)}
                        >
                          <AssetThumb asset={asset} />
                          <span>
                            <small>{slot}</small>
                            <strong>{asset.title}</strong>
                          </span>
                        </button>
                      ))}
                    </div>
                    {activeRecipeAsset && (
                      <div className="creator-prompt-case-related-block">
                        <div className="creator-prompt-case-related-head">
                          <span>
                            {selectedRecipeRelatedCases.length > 0
                              ? activeLocale === 'en-US'
                                ? 'Cases using this element'
                                : '使用同款素材的热门案例'
                              : activeLocale === 'en-US'
                                ? 'Related popular cases'
                                : '相关热门案例'}
                          </span>
                          <small>{activeRecipeAsset.asset.title}</small>
                        </div>
                        {selectedRecipeRelatedCases.length > 0 ||
                        selectedRecipeFallbackCases.length > 0 ? (
                          <div className="creator-prompt-case-related-list">
                            {(selectedRecipeRelatedCases.length > 0
                              ? selectedRecipeRelatedCases.map(
                                  ({ caseItem }) => caseItem
                                )
                              : selectedRecipeFallbackCases
                            ).map((caseItem) => (
                              <Link
                                key={caseItem.id}
                                to={
                                  caseItem.slug
                                    ? `${localePrefix}/prompts/${caseItem.slug}`
                                    : `${localePrefix}/image?caseId=${encodeURIComponent(
                                        caseItem.id
                                      )}`
                                }
                                className="creator-prompt-case-related-card"
                                onClick={closePreview}
                              >
                                <span>
                                  <PromptCaseDraftImage
                                    url={
                                      normalizePromptCaseImages(caseItem)[0] ||
                                      getPromptCaseCardImage(caseItem, 120)
                                    }
                                    title={caseItem.title || ''}
                                  />
                                </span>
                                <strong>
                                  {caseItem.title ||
                                    t('promptCases.previewTitle')}
                                </strong>
                              </Link>
                            ))}
                          </div>
                        ) : (
                          <p className="creator-prompt-case-related-empty">
                            {activeLocale === 'en-US'
                              ? 'No other public cases use this element yet.'
                              : '暂时没有匹配到更多公开案例。'}
                          </p>
                        )}
                      </div>
                    )}
                  </section>
                )}
                <div
                  className={`creator-preview-prompt ${
                    canViewSelectedPrompt ? '' : 'creator-preview-prompt-locked'
                  } ${
                    isSelectedCasePromptMissingForAdmin
                      ? 'creator-preview-prompt-missing'
                      : ''
                  }`}
                >
                  {canViewSelectedPrompt ? (
                    <>
                      <div className="creator-preview-prompt-head">
                        <span>{t('preview.promptLabel')}</span>
                        <button type="button" onClick={handleCopyPreviewPrompt}>
                          {copiedPreviewPrompt ? (
                            <Check size={14} />
                          ) : (
                            <Copy size={14} />
                          )}
                          {copiedPreviewPrompt
                            ? t('preview.copied')
                            : t('preview.copyPrompt')}
                        </button>
                      </div>
                      <pre>{selectedPromptText}</pre>
                    </>
                  ) : (
                    <div className="creator-preview-prompt-lock">
                      {selectedPromptPreview && (
                        <div className="creator-prompt-case-preview-teaser">
                          <small>{t('promptCases.promptPreview')}</small>
                          <p>{selectedPromptPreview}</p>
                        </div>
                      )}
                      <span>
                        <Lock size={16} />
                        {t('preview.promptLabel')}
                      </span>
                      <strong>
                        {isSelectedCasePromptMissingForAdmin
                          ? td('promptCases.adminPromptMissingTitle', {
                              defaultValue: 'Prompt 内容缺失'
                            })
                          : t(
                              isSelectedCaseMemberOnly
                                ? 'promptCases.promptLockedTitle'
                                : 'promptCases.loginLockedTitle'
                            )}
                      </strong>
                      <p>
                        {isSelectedCasePromptMissingForAdmin
                          ? td('promptCases.adminPromptMissingDesc', {
                              defaultValue:
                                '这个案例没有返回完整 Prompt，请在编辑弹窗中补齐 Prompt 内容后保存。'
                            })
                          : t(
                              isSelectedCaseMemberOnly
                                ? 'promptCases.promptLockedDesc'
                                : 'promptCases.loginLockedDesc'
                            )}
                      </p>
                      {isSelectedCaseMemberOnly &&
                        !isSelectedCasePromptMissingForAdmin && (
                          <ul className="prompt-unlock-benefits">
                            {[
                              td('promptCases.unlockBenefitPrompt', {
                                defaultValue: '解锁完整精选案例 Prompt'
                              }),
                              td('promptCases.unlockBenefitRecreate', {
                                defaultValue: '一键带入创作台复现或改写'
                              }),
                              td('promptCases.unlockBenefitPrivate', {
                                defaultValue: '私密生成、历史可追溯'
                              }),
                              td('promptCases.unlockBenefitCredits', {
                                defaultValue: '更多月度积分和失败退款保障'
                              })
                            ].map((benefit) => (
                              <li key={benefit}>
                                <Check size={13} />
                                <span>{benefit}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      {!isSelectedCasePromptMissingForAdmin && (
                        <button type="button" onClick={handlePromptUnlock}>
                          {isAuthenticated && isSelectedCaseMemberOnly
                            ? t('promptCases.upgradeToUnlockPrompt')
                            : t('promptCases.loginToViewPrompt')}
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <dl className="creator-preview-meta">
                  <div className="creator-preview-meta-wide">
                    <dt>{t('promptCases.previewTitle')}</dt>
                    <dd>
                      {selectedCase.title || t('promptCases.previewTitle')}
                    </dd>
                  </div>
                  <div>
                    <dt>{t('promptCases.sourceLabel')}</dt>
                    <dd>{t('promptCases.latestTitle')}</dd>
                  </div>
                  <div>
                    <dt>{t('preview.meta.model')}</dt>
                    <dd>{selectedCase.model || 'gemini-image'}</dd>
                  </div>
                  <div>
                    <dt>{t('promptCases.category')}</dt>
                    <dd>
                      {getCategoryLabel(selectedCase.category || 'featured')}
                    </dd>
                  </div>
                  {selectedCase.packageSlug && (
                    <div>
                      <dt>{t('promptCases.packageSlug')}</dt>
                      <dd>{selectedCase.packageSlug}</dd>
                    </div>
                  )}
                  {selectedCase.commercialIntent && (
                    <div className="creator-preview-meta-wide">
                      <dt>{t('promptCases.commercialIntent')}</dt>
                      <dd>{selectedCase.commercialIntent}</dd>
                    </div>
                  )}
                  <div>
                    <dt>{t('preview.meta.time')}</dt>
                    <dd>
                      {selectedCase.createdAt
                        ? new Date(selectedCase.createdAt).toLocaleString()
                        : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt>{t('promptCases.authorLink')}</dt>
                    <dd>
                      {selectedCase.authorUrl ? (
                        <a
                          href={selectedCase.authorUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="creator-preview-meta-link"
                        >
                          <ExternalLink size={13} />
                          {t('promptCases.authorLink')}
                        </a>
                      ) : (
                        '—'
                      )}
                    </dd>
                  </div>
                  {selectedCase.tags && selectedCase.tags.length > 0 && (
                    <div className="creator-preview-meta-wide">
                      <dt>{t('promptCases.tags')}</dt>
                      <dd>{selectedCase.tags.join(' / ')}</dd>
                    </div>
                  )}
                  {isManaging && (
                    <div className="creator-preview-meta-wide">
                      <dt>{t('promptCases.metrics.title')}</dt>
                      <dd className="creator-prompt-case-preview-metrics">
                        <span>
                          {t('promptCases.metrics.views')}:{' '}
                          {getPromptCaseViews(selectedCase).toLocaleString()}
                        </span>
                        <span>
                          {t('promptCases.metrics.copies')}:{' '}
                          {getPromptCaseCopies(selectedCase).toLocaleString()}
                        </span>
                        <span>
                          {t('promptCases.metrics.generates')}:{' '}
                          {getPromptCaseGenerates(
                            selectedCase
                          ).toLocaleString()}
                        </span>
                        <span>
                          {t('promptCases.metrics.generateRate')}:{' '}
                          {formatPromptCaseRate(
                            getPromptCaseGenerates(selectedCase),
                            getPromptCaseViews(selectedCase)
                          )}
                        </span>
                      </dd>
                    </div>
                  )}
                </dl>
                {previewMoreCases.length > 0 && (
                  <section className="creator-prompt-case-more-block">
                    <div className="creator-prompt-case-related-head">
                      <span>
                        {activeLocale === 'en-US'
                          ? 'More popular cases'
                          : '更多热门案例'}
                      </span>
                      <small>
                        {activeLocale === 'en-US'
                          ? 'Keep exploring'
                          : '继续发现可复用案例'}
                      </small>
                    </div>
                    <div className="creator-prompt-case-related-list creator-prompt-case-more-list">
                      {previewMoreCases.map((caseItem) => (
                        <Link
                          key={caseItem.id}
                          to={
                            caseItem.slug
                              ? `${localePrefix}/prompts/${caseItem.slug}`
                              : `${localePrefix}/image?caseId=${encodeURIComponent(
                                  caseItem.id
                                )}`
                          }
                          className="creator-prompt-case-related-card"
                          onClick={closePreview}
                        >
                          <span>
                            <PromptCaseDraftImage
                              url={
                                normalizePromptCaseImages(caseItem)[0] ||
                                getPromptCaseCardImage(caseItem, 120)
                              }
                              title={caseItem.title || ''}
                            />
                          </span>
                          <strong>
                            {caseItem.title || t('promptCases.previewTitle')}
                          </strong>
                        </Link>
                      ))}
                    </div>
                  </section>
                )}
                <div className="creator-preview-actions">
                  {selectedCase.slug &&
                  !isRecentGenerationPromptCase(selectedCase) ? (
                    <ButtonLink
                      to={`${localePrefix}/prompts/${selectedCase.slug}`}
                      className="creator-preview-detail-link"
                      variant="secondary"
                      size="sm"
                    >
                      {t('promptCases.detailLink')}
                    </ButtonLink>
                  ) : (
                    <span />
                  )}
                  {selectedCase.memberOnly ? (
                    <ButtonLink
                      to={pricingHref}
                      className="creator-preview-detail-link"
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        trackPricingView(
                          shareCaseId === selectedCase.id
                            ? 'prompt_share_modal_cta'
                            : 'prompt_cases_modal_cta'
                        )
                      }
                    >
                      {td('promptCases.viewPricing', {
                        defaultValue: '查看升级套餐'
                      })}
                    </ButtonLink>
                  ) : (
                    <span />
                  )}
                  <Button
                    className="creator-preview-reedit"
                    variant="primary"
                    size="sm"
                    leadingIcon={<Wand2 size={16} />}
                    onClick={() => handleRecreate(selectedCase)}
                  >
                    {t('promptCases.usePrompt')}
                  </Button>
                </div>
              </div>
            </div>
          </section>
        </div>
      )}

      {selectedCase &&
        lightboxOpen &&
        activePreviewImage &&
        !isActivePreviewVideo && (
          <PhotoSwipeViewer
            items={selectedCaseImages.map((imageUrl) => ({ src: imageUrl }))}
            index={activeImageIndex}
            onClose={() => setLightboxOpen(false)}
            onDownload={handleDownloadActiveImage}
            onIndexChange={(nextIndex) => setActiveImageIndex(nextIndex)}
          />
        )}

      {activeDraftPreview?.mediaType === 'video' && (
        <PromptCaseDraftVideoLightbox
          videoUrls={activeDraftPreview.videoUrls || [activeDraftPreview.url]}
          posterUrl={activeDraftPreview.posterUrl}
          title={
            activeDraftPreviewDraft?.title ||
            (td('promptCases.previewDraft', {
              defaultValue: '预览草稿'
            }) as string)
          }
          closeLabel={t('preview.close') as string}
          onClose={() => setActiveDraftPreview(null)}
        />
      )}

      {activeDraftPreview?.mediaType === 'image' && (
        <PhotoSwipeViewer
          items={activeDraftPreviewImages.map((src) => ({
            src,
            alt: t('promptCases.draftImagePreview') as string
          }))}
          index={Math.max(
            0,
            activeDraftPreviewImages.indexOf(activeDraftPreview.url)
          )}
          onClose={() => setActiveDraftPreview(null)}
          onIndexChange={(index) => {
            const nextUrl = activeDraftPreviewImages[index];
            if (!nextUrl) return;
            setActiveDraftPreview((current) =>
              current ? { ...current, url: nextUrl } : current
            );
          }}
          onDownload={(index) =>
            void triggerImageDownload(
              activeDraftPreviewImages[index],
              `prompt-case-draft-${activeDraftPreview.draftId}`
            )
          }
        />
      )}
    </div>
  );
}
