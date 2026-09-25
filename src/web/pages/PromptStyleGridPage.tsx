import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent
} from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Copy,
  Download,
  ExternalLink,
  ImagePlus,
  LayoutGrid,
  PlusCircle,
  RefreshCcw,
  RotateCcw,
  Search,
  Settings,
  Sparkles,
  Trash2,
  Upload
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  PROMPT_STYLE_GRID_CANONICAL_PATH,
  PROMPT_STYLE_GRID_SEO
} from '@/shared/prompt-style-grid-seo';
import {
  buildPromptStyleGridParam,
  buildPromptStyleGridSharePath,
  getPromptStyleGridAssetPrompt,
  getPromptStyleGridAssetSubtitle,
  getPromptStyleGridAssetTitle,
  getPromptStyleGridAssetsForSlot,
  getPromptStyleGridTemplate,
  normalizePromptStyleGridAssetIds,
  parsePromptStyleGridItems,
  parsePromptStyleGridSearchParams,
  promptStyleGridSlots,
  promptStyleGridTemplates,
  type PromptStyleGridTemplate,
  type PromptStyleGridTemplateSlug
} from '../data/prompt-style-grid';
import {
  getAssetById,
  type ImagePromptAsset,
  type PromptLocale
} from '../data/image-prompt-core';
import { imagePromptAssetCatalog } from '../data/image-prompt-asset-catalog';
import { imageSizeOptions, modelOptions } from '../data/image-creator-options';
import { getPublicPromptCases, type PromptCase } from '@/services/agent-api';
import { trackEvent } from '../lib/analytics';
import { applySeo } from '../lib/seo';
import { withReferralParam } from '../lib/referral-share';
import { recordClientConversionEvent } from '../lib/client-conversion-events';
import { Card } from '../../shared/ui';
import '../styles/prompt-style-grid.css';

const CTA_SOURCE = 'seo_ai_image_style_grid';
const RELATED_CASE_LIMIT = 6;
const DEFAULT_ASSIST_MODEL = 'gpt-image-2';
const THEME_CARD_UPLOAD_DB_NAME = 'webtomind-theme-card-uploads';
const THEME_CARD_UPLOAD_STORE_NAME = 'uploads';
const THEME_CARD_UPLOAD_DB_VERSION = 1;
const RECENT_THEME_CARD_TEMPLATES_KEY =
  'webtomind:theme-card-recent-templates:v1';
const THEME_CARD_PLAZA_PATH = '/ai-image-style-grid';
const ZH_THEME_CARD_PLAZA_PATH = '/zh-CN/ai-image-style-grid';
const EN_THEME_CARD_PLAZA_PATH = '/en-US/ai-image-style-grid';

type ThemeCardTool = 'add' | 'templates' | 'upload' | 'settings';
type ThemeCardTemplateTab = 'featured' | 'community' | 'forYou';
type ThemeCardUploadTab = 'local' | 'myUploads';

type ThemeCardGridItem = {
  id: string;
  title: string;
  subtitle: string;
  imageUrl?: string;
  emoji?: string;
  source: 'official' | 'case' | 'upload' | 'placeholder';
  assetId?: string;
};

type ThemeCardGridConfig = {
  rows: number;
  columns: number;
  labels: string[];
};

type PersistedThemeCardUpload = {
  id: string;
  title: string;
  subtitle: string;
  imageUrl: string;
  createdAt: number;
};

const THEME_CARD_GRID_CONFIGS: Record<
  PromptStyleGridTemplateSlug,
  ThemeCardGridConfig
> = {
  taste: {
    rows: 3,
    columns: 3,
    labels: [
      'Favorite Style',
      'Best Lighting',
      'Dream Background',
      'Signature Composition',
      'Favorite Subject',
      'Layout I Reuse',
      'Lens Feel',
      'Detail I Love',
      'Wildcard'
    ]
  },
  portrait: {
    rows: 3,
    columns: 3,
    labels: [
      'Favorite Portrait',
      'Best Lighting',
      'Face Mood',
      'Pose',
      'Background',
      'Lens',
      'Color',
      'Reference',
      'Wildcard'
    ]
  },
  product: {
    rows: 3,
    columns: 3,
    labels: [
      'Hero Shot',
      'Best Texture',
      'Packaging',
      'Lighting',
      'Background',
      'Scale Detail',
      'Ecommerce Angle',
      'Campaign Visual',
      'Wildcard'
    ]
  },
  character: {
    rows: 3,
    columns: 3,
    labels: [
      'Main Character',
      'Side Profile',
      'Outfit',
      'World',
      'Pose',
      'Prop',
      'Expression',
      'Color Key',
      'Wildcard'
    ]
  },
  'gpt-image-2': {
    rows: 3,
    columns: 3,
    labels: [
      'Best Prompt',
      'Readable Text',
      'Product Visual',
      'Portrait',
      'Layout',
      'Reference Use',
      'Before/After',
      'Campaign',
      'Wildcard'
    ]
  },
  'nano-banana': {
    rows: 3,
    columns: 3,
    labels: [
      'Fast Idea',
      'Reference',
      'Lifestyle',
      'Portrait',
      'Product',
      'Social Post',
      'Iteration',
      'Color Mood',
      'Wildcard'
    ]
  },
  seedream: {
    rows: 3,
    columns: 3,
    labels: [
      'Scene',
      'Lighting',
      'Texture',
      'Architecture',
      'Portrait',
      'Landscape',
      'Commercial',
      'Mood',
      'Wildcard'
    ]
  },
  midjourney: {
    rows: 3,
    columns: 3,
    labels: [
      'Cinematic Mood',
      'Poster Shot',
      'World',
      'Character',
      'Lighting',
      'Color Grade',
      'Lens',
      'Detail',
      'Wildcard'
    ]
  },
  'social-cover': {
    rows: 3,
    columns: 3,
    labels: [
      'Hero Cover',
      'Title Space',
      'Creator Face',
      'Product',
      'Hook Visual',
      'Background',
      'Sticker',
      'Color',
      'Wildcard'
    ]
  },
  'anime-avatar': {
    rows: 3,
    columns: 3,
    labels: [
      'Avatar',
      'Expression',
      'Hair',
      'Outfit',
      'Lighting',
      'Background',
      'Color',
      'Detail',
      'Wildcard'
    ]
  },
  sticker: {
    rows: 3,
    columns: 4,
    labels: [
      'Happy',
      'Thinking',
      'Surprised',
      'Angry',
      'Thanks',
      'OK',
      'Working',
      'Celebrate',
      'Sad',
      'Love',
      'Sleepy',
      'Wildcard'
    ]
  },
  'cinematic-poster': {
    rows: 3,
    columns: 3,
    labels: [
      'Main Poster',
      'Lead Character',
      'Antagonist',
      'World',
      'Conflict',
      'Title Space',
      'Color Grade',
      'Key Prop',
      'Wildcard'
    ]
  }
};

function getAbsoluteUrl(path: string): string {
  if (typeof window === 'undefined') return `https://webtomind.com${path}`;
  return new URL(path, window.location.origin).toString();
}

function getThemeCardLocale(
  pathname: string,
  _language?: string
): PromptLocale {
  if (pathname.startsWith('/zh-CN')) return 'zh-CN';
  if (pathname.startsWith('/en-US')) return 'en-US';
  return 'en-US';
}

function getThemeCardBasePath(locale: PromptLocale): string {
  return locale === 'zh-CN' ? ZH_THEME_CARD_PLAZA_PATH : THEME_CARD_PLAZA_PATH;
}

function isThemeCardPlazaPath(pathname: string): boolean {
  return (
    pathname === THEME_CARD_PLAZA_PATH ||
    pathname === ZH_THEME_CARD_PLAZA_PATH ||
    pathname === EN_THEME_CARD_PLAZA_PATH
  );
}

function localizeThemeCardPath(path: string, locale: PromptLocale): string {
  if (locale !== 'zh-CN') return path;
  return path.replace(THEME_CARD_PLAZA_PATH, ZH_THEME_CARD_PLAZA_PATH);
}

function interpolateThemeCardText(
  value: string,
  options?: Record<string, unknown>
): string {
  if (!options) return value;
  return value.replace(/\{\{(\w+)\}\}/g, (_, key: string) =>
    String(options[key] ?? '')
  );
}

function getCaseCover(caseItem: PromptCase): string {
  return (
    (Array.isArray(caseItem.imageUrls) ? caseItem.imageUrls[0] : '') ||
    caseItem.imageUrl ||
    ''
  );
}

function getTemplateCreateHref(
  template: PromptStyleGridTemplate,
  assetIds: string[],
  model: string,
  imageSize: string,
  locale: PromptLocale
): string {
  const params = new URLSearchParams();
  params.set('source', CTA_SOURCE);
  params.set('styleGrid', buildPromptStyleGridParam(template.slug, assetIds));
  params.set('model', model);
  if (imageSize) {
    params.set('imageSize', imageSize);
    const aspectRatio = imageSizeOptions.find(
      (option) => option.value === imageSize
    )?.aspectRatio;
    if (aspectRatio) params.set('aspectRatio', aspectRatio);
  }
  const createPrefix = locale === 'zh-CN' ? '/zh-CN' : '/en-US';
  return `${createPrefix}/image?${params.toString()}`;
}

function getSelectedAssets(assetIds: string[]): ImagePromptAsset[] {
  return assetIds
    .map((id) => getAssetById(id, imagePromptAssetCatalog))
    .filter((asset): asset is ImagePromptAsset => Boolean(asset));
}

function getThemeCardGridConfig(
  template: PromptStyleGridTemplate
): ThemeCardGridConfig {
  return THEME_CARD_GRID_CONFIGS[template.slug];
}

function resizeGridItems(
  items: Array<ThemeCardGridItem | null>,
  size: number
): Array<ThemeCardGridItem | null> {
  return Array.from({ length: size }, (_, index) => items[index] || null);
}

function resizeGridLabels(
  labels: string[],
  defaults: string[],
  size: number
): string[] {
  return Array.from(
    { length: size },
    (_, index) => labels[index] || defaults[index] || `Slot ${index + 1}`
  );
}

function getGridLabel(
  config: ThemeCardGridConfig,
  index: number,
  fallback: string
): string {
  return config.labels[index] || fallback;
}

function getDefaultGridLabels(
  template: PromptStyleGridTemplate,
  locale: PromptLocale,
  i18n: ReturnType<typeof useTranslation>['i18n']
): string[] {
  const translated = i18n.getResource(
    locale,
    'themeCard',
    `gridLabels.${template.slug}`
  );
  const base = getThemeCardGridConfig(template).labels;
  return Array.isArray(translated)
    ? translated.map((label) => String(label))
    : base;
}

function assetToGridItem(
  asset: ImagePromptAsset,
  locale: PromptLocale
): ThemeCardGridItem {
  return {
    id: `asset:${asset.id}`,
    title: getPromptStyleGridAssetTitle(asset, locale),
    subtitle: getPromptStyleGridAssetSubtitle(asset, locale),
    imageUrl: asset.thumbnailUrl,
    emoji: asset.thumbnailEmoji,
    source: 'official',
    assetId: asset.id
  };
}

function caseToGridItem(
  caseItem: PromptCase,
  fallbackSubtitle: string
): ThemeCardGridItem {
  return {
    id: `case:${caseItem.slug || caseItem.id}`,
    title: caseItem.title || caseItem.slug || caseItem.id,
    subtitle: caseItem.category || caseItem.model || fallbackSubtitle,
    imageUrl: getCaseCover(caseItem),
    source: 'case'
  };
}

function getRelatedCasePlaceholders(
  fallbackSubtitle: string
): ThemeCardGridItem[] {
  return Array.from({ length: RELATED_CASE_LIMIT }, (_, index) => ({
    id: `case-placeholder:${index}`,
    title: fallbackSubtitle,
    subtitle: fallbackSubtitle,
    source: 'placeholder'
  }));
}

function assetIdsToGridItems(
  assetIds: string[],
  locale: PromptLocale
): Array<ThemeCardGridItem | null> {
  return getSelectedAssets(assetIds).map((asset) =>
    assetToGridItem(asset, locale)
  );
}

function parseExplicitThemeCardAssetIds(search: string): string[] {
  const params = new URLSearchParams(search);
  return parsePromptStyleGridItems(params.get('items')).filter((id) =>
    Boolean(getAssetById(id, imagePromptAssetCatalog))
  );
}

function getCommunityThemeCardTemplates(): PromptStyleGridTemplate[] {
  const communitySlugs: PromptStyleGridTemplateSlug[] = [
    'anime-avatar',
    'sticker',
    'social-cover',
    'cinematic-poster',
    'character',
    'midjourney'
  ];
  return communitySlugs
    .map((slug) => getPromptStyleGridTemplate(slug))
    .filter(Boolean);
}

function readRecentTemplateSlugs(): PromptStyleGridTemplateSlug[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(RECENT_THEME_CARD_TEMPLATES_KEY) || '[]'
    );
    if (!Array.isArray(parsed)) return [];
    const valid = new Set(promptStyleGridTemplates.map((item) => item.slug));
    return parsed.filter((slug): slug is PromptStyleGridTemplateSlug =>
      valid.has(slug)
    );
  } catch {
    return [];
  }
}

function writeRecentTemplateSlug(slug: PromptStyleGridTemplateSlug): void {
  if (typeof window === 'undefined') return;
  const next = [
    slug,
    ...readRecentTemplateSlugs().filter((item) => item !== slug)
  ].slice(0, 8);
  try {
    window.localStorage.setItem(
      RECENT_THEME_CARD_TEMPLATES_KEY,
      JSON.stringify(next)
    );
  } catch {
    // Local storage is optional for recommendations.
  }
}

function getRecommendedThemeCardTemplates(
  template: PromptStyleGridTemplate
): PromptStyleGridTemplate[] {
  const recent = readRecentTemplateSlugs()
    .map((slug) => getPromptStyleGridTemplate(slug))
    .filter((item) => item.slug !== template.slug);
  const sameCategory = promptStyleGridTemplates.filter(
    (item) => item.slug !== template.slug && item.category === template.category
  );
  const fallbackSlugs: PromptStyleGridTemplateSlug[] = [
    'taste',
    'portrait',
    'product',
    'character',
    'gpt-image-2',
    'nano-banana'
  ];
  const fallback = fallbackSlugs
    .map((slug) => getPromptStyleGridTemplate(slug))
    .filter((item) => item.slug !== template.slug);
  const seen = new Set<PromptStyleGridTemplateSlug>();
  return [...recent, ...sameCategory, ...fallback].filter((item) => {
    if (seen.has(item.slug)) return false;
    seen.add(item.slug);
    return true;
  });
}

function openThemeCardUploadDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable'));
      return;
    }
    const request = indexedDB.open(
      THEME_CARD_UPLOAD_DB_NAME,
      THEME_CARD_UPLOAD_DB_VERSION
    );
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(THEME_CARD_UPLOAD_STORE_NAME)) {
        db.createObjectStore(THEME_CARD_UPLOAD_STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error || new Error('Failed to open IndexedDB'));
  });
}

async function readPersistedThemeCardUploads(): Promise<
  PersistedThemeCardUpload[]
> {
  const db = await openThemeCardUploadDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(
      THEME_CARD_UPLOAD_STORE_NAME,
      'readonly'
    );
    const store = transaction.objectStore(THEME_CARD_UPLOAD_STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => {
      const rows = (request.result as PersistedThemeCardUpload[]).sort(
        (a, b) => b.createdAt - a.createdAt
      );
      db.close();
      resolve(rows);
    };
    request.onerror = () => {
      db.close();
      reject(request.error || new Error('Failed to read uploads'));
    };
  });
}

async function putPersistedThemeCardUpload(
  upload: PersistedThemeCardUpload
): Promise<void> {
  const db = await openThemeCardUploadDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(
      THEME_CARD_UPLOAD_STORE_NAME,
      'readwrite'
    );
    transaction.objectStore(THEME_CARD_UPLOAD_STORE_NAME).put(upload);
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error || new Error('Failed to save upload'));
    };
  });
}

async function deletePersistedThemeCardUpload(id: string): Promise<void> {
  const db = await openThemeCardUploadDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(
      THEME_CARD_UPLOAD_STORE_NAME,
      'readwrite'
    );
    transaction.objectStore(THEME_CARD_UPLOAD_STORE_NAME).delete(id);
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error || new Error('Failed to delete upload'));
    };
  });
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Read failed'));
    reader.readAsDataURL(file);
  });
}

function persistedUploadToGridItem(
  upload: PersistedThemeCardUpload
): ThemeCardGridItem {
  return {
    id: `upload:${upload.id}`,
    title: upload.title,
    subtitle: upload.subtitle,
    imageUrl: upload.imageUrl,
    source: 'upload'
  };
}

function buildThemeCardPromptDraft(
  template: PromptStyleGridTemplate,
  cellItems: Array<ThemeCardGridItem | null>,
  labels: string[],
  locale: PromptLocale,
  templateTitle: string
): string {
  const lines = cellItems
    .map((item, index) => {
      const label = labels[index] || `Slot ${index + 1}`;
      if (!item) {
        return locale === 'zh-CN'
          ? `- ${label}: 生成适合这个格子的主题卡片占位图。`
          : `- ${label}: Generate a fitting placeholder image for this theme card slot.`;
      }
      if (item.assetId) {
        const asset = getAssetById(item.assetId, imagePromptAssetCatalog);
        if (asset) {
          return `- ${label}: ${getPromptStyleGridAssetPrompt(asset, locale)}`;
        }
      }
      return `- ${label}: ${item.title}. ${item.subtitle}`;
    })
    .filter(Boolean);

  if (locale === 'zh-CN') {
    return [
      `使用 WebToMind 主题卡片生成图片。卡片：${templateTitle}。`,
      `当前模板：${template.slug}。`,
      '',
      '视觉方向：',
      ...lines,
      '',
      '优先生成当前选中格的可用占位图，保持主体明确、构图干净、风格一致，避免水印、乱码文字、低质量细节和手部畸变。'
    ].join('\n');
  }

  return [
    `Create an image from this WebToMind Theme Card. Card: ${templateTitle}.`,
    `Current template: ${template.slug}.`,
    '',
    'Visual direction:',
    ...lines,
    '',
    'Prioritize a usable placeholder image for the selected grid slot. Keep the subject readable, the composition clean, and the style coherent. Avoid watermarks, garbled text, low-quality details and distorted hands.'
  ].join('\n');
}

function getInitialThemeCardState(
  pathname: string,
  search: string,
  templateSlug?: string
): {
  template: PromptStyleGridTemplate;
  assetIds: string[];
  isPlaza: boolean;
} {
  const params = new URLSearchParams(search);
  const hasLegacyTemplate = params.has('template');
  const hasItems = params.has('items');
  const queryState = parsePromptStyleGridSearchParams(
    search,
    imagePromptAssetCatalog
  );
  const template = templateSlug
    ? getPromptStyleGridTemplate(templateSlug)
    : queryState.template;
  const assetIds = hasItems
    ? parseExplicitThemeCardAssetIds(search)
    : normalizePromptStyleGridAssetIds(
        template.slug,
        hasLegacyTemplate ? queryState.assetIds : template.defaultAssetIds,
        imagePromptAssetCatalog
      );

  return {
    template,
    assetIds,
    isPlaza:
      isThemeCardPlazaPath(pathname) && !templateSlug && !hasLegacyTemplate
  };
}

function randomAssetIdForSlot(slotIndex: number): string {
  const slot = promptStyleGridSlots[slotIndex];
  const candidates = getPromptStyleGridAssetsForSlot(
    slot,
    imagePromptAssetCatalog
  );
  if (candidates.length === 0) return '';
  return candidates[Math.floor(Math.random() * candidates.length)].id;
}

export function PromptStyleGridPage() {
  const location = useLocation();
  const { templateSlug } = useParams<{ templateSlug?: string }>();
  const { isAuthenticated, getAccessToken } = useAuth();
  const { t, i18n } = useTranslation('themeCard');
  const locale = getThemeCardLocale(location.pathname, i18n.language);
  const themeCardBasePath = getThemeCardBasePath(locale);
  const tr = useCallback(
    (key: string, options?: Record<string, unknown>) => {
      const pluralKey =
        typeof options?.count === 'number' && options.count !== 1
          ? `${key}_plural`
          : key;
      const raw =
        i18n.getResource(locale, 'themeCard', pluralKey) ??
        i18n.getResource(locale, 'themeCard', key);
      if (typeof raw === 'string') {
        return interpolateThemeCardText(raw, options);
      }
      return t(key as never, options as never) as unknown as string;
    },
    [i18n, locale, t]
  );
  const getTemplateTitle = useCallback(
    (item: PromptStyleGridTemplate) =>
      tr(`templates.${item.slug}.title`, { defaultValue: item.title }),
    [tr]
  );
  const getTemplateCategory = useCallback(
    (item: PromptStyleGridTemplate) =>
      tr(`templates.${item.slug}.category`, { defaultValue: item.category }),
    [tr]
  );
  const getTemplateDescription = useCallback(
    (item: PromptStyleGridTemplate) =>
      tr(`templates.${item.slug}.description`, {
        defaultValue: item.description
      }),
    [tr]
  );
  const getGridLabels = useCallback(
    (item: PromptStyleGridTemplate) => getDefaultGridLabels(item, locale, i18n),
    [i18n, locale]
  );
  const cardRef = useRef<HTMLElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const initialState = useMemo(
    () =>
      getInitialThemeCardState(
        location.pathname,
        location.search,
        templateSlug
      ),
    // Only the first render should hydrate from URL. Later state owns the URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  const [isPlazaView] = useState(initialState.isPlaza);
  const [template, setTemplate] = useState(initialState.template);
  const [cardTitle, setCardTitle] = useState(() =>
    getTemplateTitle(initialState.template)
  );
  const initialGridConfig = useMemo(
    () => getThemeCardGridConfig(initialState.template),
    [initialState.template]
  );
  const initialGridLabels = useMemo(
    () =>
      resizeGridLabels(
        getGridLabels(initialState.template),
        getGridLabels(initialState.template),
        initialGridConfig.rows * initialGridConfig.columns
      ),
    [getGridLabels, initialGridConfig, initialState.template]
  );
  const [activeTool, setActiveTool] = useState<ThemeCardTool>('add');
  const [templateTab, setTemplateTab] =
    useState<ThemeCardTemplateTab>('featured');
  const [uploadTab, setUploadTab] = useState<ThemeCardUploadTab>('local');
  const [activeCellIndex, setActiveCellIndex] = useState<number | null>(null);
  const [editingLabelIndex, setEditingLabelIndex] = useState<number | null>(
    null
  );
  const [gridRows, setGridRows] = useState(initialGridConfig.rows);
  const [gridColumns, setGridColumns] = useState(initialGridConfig.columns);
  const [cellLabels, setCellLabels] = useState<string[]>(initialGridLabels);
  const [cellItems, setCellItems] = useState<Array<ThemeCardGridItem | null>>(
    () => {
      const params = new URLSearchParams(location.search);
      if (!params.has('items')) {
        return resizeGridItems(
          [],
          initialGridConfig.rows * initialGridConfig.columns
        );
      }
      return resizeGridItems(
        assetIdsToGridItems(initialState.assetIds, locale),
        initialGridConfig.rows * initialGridConfig.columns
      );
    }
  );
  const [itemSearch, setItemSearch] = useState('');
  const [templateSearch, setTemplateSearch] = useState('');
  const [showLabels, setShowLabels] = useState(true);
  const [uploadedItems, setUploadedItems] = useState<ThemeCardGridItem[]>([]);
  const [relatedCasesLoading, setRelatedCasesLoading] = useState(true);
  const [uploadPersistenceAvailable, setUploadPersistenceAvailable] =
    useState(true);
  const [replaceUploadId, setReplaceUploadId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [downloadState, setDownloadState] = useState<
    'idle' | 'working' | 'error'
  >('idle');
  const [selectedModel, setSelectedModel] = useState(DEFAULT_ASSIST_MODEL);
  const [selectedImageSize, setSelectedImageSize] = useState(
    initialState.template.recommendedImageSize
  );
  const [cardFooterText, setCardFooterText] = useState(() =>
    tr('stage.defaultFooterText')
  );
  const [promptDraft, setPromptDraft] = useState('');
  const [isPromptDirty, setIsPromptDirty] = useState(false);
  const [relatedCases, setRelatedCases] = useState<PromptCase[]>([]);

  const selectedCount = useMemo(
    () => cellItems.filter(Boolean).length,
    [cellItems]
  );
  const filledAssetIds = useMemo(
    () =>
      cellItems
        .map((item) => item?.assetId)
        .filter((id): id is string => Boolean(id)),
    [cellItems]
  );
  const effectiveAssetIds = useMemo(() => filledAssetIds, [filledAssetIds]);
  const gridConfig = useMemo(
    () => ({
      rows: gridRows,
      columns: gridColumns,
      labels: resizeGridLabels(
        cellLabels,
        getGridLabels(template),
        gridRows * gridColumns
      )
    }),
    [cellLabels, getGridLabels, gridColumns, gridRows, template]
  );
  const officialItems = useMemo(() => {
    const seen = new Set<string>();
    return promptStyleGridSlots
      .flatMap((slot) =>
        getPromptStyleGridAssetsForSlot(slot, imagePromptAssetCatalog)
      )
      .filter((asset) => {
        if (seen.has(asset.id)) return false;
        seen.add(asset.id);
        return true;
      })
      .map((asset) => assetToGridItem(asset, locale));
  }, [locale]);
  const caseItems = useMemo(() => {
    const fallbackSubtitle = tr('stage.promptCase');
    if (relatedCasesLoading && itemSearch.trim().length === 0) {
      return getRelatedCasePlaceholders(fallbackSubtitle);
    }
    return relatedCases.map((caseItem) =>
      caseToGridItem(caseItem, fallbackSubtitle)
    );
  }, [itemSearch, relatedCases, relatedCasesLoading, tr]);
  const addableItems = useMemo(() => {
    const query = itemSearch.trim().toLowerCase();
    const items = [...caseItems, ...uploadedItems, ...officialItems];
    if (!query) return items;
    return items.filter((item) =>
      `${item.title} ${item.subtitle}`.toLowerCase().includes(query)
    );
  }, [caseItems, itemSearch, officialItems, uploadedItems]);
  const filteredTemplates = useMemo(() => {
    const query = templateSearch.trim().toLowerCase();
    const baseTemplates =
      templateTab === 'community'
        ? getCommunityThemeCardTemplates()
        : templateTab === 'forYou'
          ? getRecommendedThemeCardTemplates(template)
          : promptStyleGridTemplates;
    if (!query) return baseTemplates;
    return baseTemplates.filter((item) =>
      `${getTemplateTitle(item)} ${getTemplateCategory(item)} ${getTemplateDescription(item)}`
        .toLowerCase()
        .includes(query)
    );
  }, [
    getTemplateCategory,
    getTemplateDescription,
    getTemplateTitle,
    template,
    templateSearch,
    templateTab
  ]);
  const sharePath = useMemo(
    () =>
      filledAssetIds.length > 0
        ? localizeThemeCardPath(
            buildPromptStyleGridSharePath(template.slug, effectiveAssetIds),
            locale
          )
        : `${themeCardBasePath}/${template.slug}`,
    [
      effectiveAssetIds,
      filledAssetIds.length,
      locale,
      template.slug,
      themeCardBasePath
    ]
  );
  const shareUrl = useMemo(
    () => withReferralParam(getAbsoluteUrl(sharePath)),
    [sharePath]
  );
  const promptStarter = useMemo(
    () =>
      buildThemeCardPromptDraft(
        template,
        cellItems,
        gridConfig.labels,
        locale,
        cardTitle.trim() || getTemplateTitle(template)
      ),
    [
      cardTitle,
      cellItems,
      getTemplateTitle,
      gridConfig.labels,
      locale,
      template
    ]
  );
  const selectedCellLabel =
    activeCellIndex === null
      ? ''
      : getGridLabel(
          gridConfig,
          activeCellIndex,
          tr('grid.slotFallback', { number: activeCellIndex + 1 })
        );
  const visibleSeoKeywords = useMemo(
    () =>
      Array.from(
        new Set([
          ...PROMPT_STYLE_GRID_SEO.keywords,
          ...promptStyleGridTemplates.flatMap((item) => item.seoKeywords)
        ])
      ),
    []
  );
  const createHref = useMemo(
    () =>
      getTemplateCreateHref(
        template,
        effectiveAssetIds,
        selectedModel,
        selectedImageSize,
        locale
      ),
    [effectiveAssetIds, locale, selectedImageSize, selectedModel, template]
  );
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    promptStyleGridTemplates.forEach((item) => {
      const category = getTemplateCategory(item);
      counts.set(category, (counts.get(category) || 0) + 1);
    });
    return Array.from(counts, ([category, count]) => ({ category, count }));
  }, [getTemplateCategory]);

  const getTargetCellIndex = useCallback(() => {
    if (activeCellIndex !== null) return activeCellIndex;
    const firstEmpty = cellItems.findIndex((item) => !item);
    return firstEmpty >= 0 ? firstEmpty : 0;
  }, [activeCellIndex, cellItems]);

  useEffect(() => {
    return applySeo({
      title: isPlazaView
        ? tr('plaza.seoTitle')
        : `${getTemplateTitle(template)} | WebToMind`,
      description: isPlazaView
        ? tr('plaza.seoDescription')
        : getTemplateDescription(template),
      canonical: `https://webtomind.com${
        isPlazaView
          ? PROMPT_STYLE_GRID_CANONICAL_PATH
          : `${PROMPT_STYLE_GRID_CANONICAL_PATH}/${template.slug}`
      }`,
      htmlLang: locale === 'zh-CN' ? 'zh-CN' : 'en'
    });
  }, [
    getTemplateDescription,
    getTemplateTitle,
    isPlazaView,
    locale,
    template,
    tr
  ]);

  useEffect(() => {
    trackEvent('style_grid_view', {
      template_slug: template.slug,
      selected_count: selectedCount,
      cta_source: CTA_SOURCE,
      prompt_page_type: 'style_grid',
      authenticated: isAuthenticated,
      locale
    });
    // Track the first view once; template changes are tracked separately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!isPlazaView) window.history.replaceState(null, '', sharePath);
  }, [isPlazaView, sharePath]);

  useEffect(() => {
    setCellItems((current) => resizeGridItems(current, gridRows * gridColumns));
    setCellLabels((current) =>
      resizeGridLabels(current, getGridLabels(template), gridRows * gridColumns)
    );
    setActiveCellIndex((current) =>
      current === null
        ? null
        : Math.min(current, Math.max(0, gridRows * gridColumns - 1))
    );
  }, [getGridLabels, gridColumns, gridRows, template]);

  useEffect(() => {
    if (isPromptDirty) return;
    setPromptDraft(promptStarter);
  }, [isPromptDirty, promptStarter]);

  useEffect(() => {
    let cancelled = false;
    readPersistedThemeCardUploads()
      .then((uploads) => {
        if (!cancelled) {
          setUploadPersistenceAvailable(true);
          setUploadedItems(uploads.map(persistedUploadToGridItem));
        }
      })
      .catch(() => {
        if (!cancelled) setUploadPersistenceAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      uploadedItems.forEach((item) => {
        if (item.imageUrl?.startsWith('blob:')) {
          URL.revokeObjectURL(item.imageUrl);
        }
      });
    };
  }, [uploadedItems]);

  useEffect(() => {
    let cancelled = false;
    setRelatedCasesLoading(true);
    getPublicPromptCases(RELATED_CASE_LIMIT, {
      ...template.caseFilter,
      locale,
      requireImage: true
    })
      .then((cases) => {
        if (!cancelled) setRelatedCases(cases.slice(0, RELATED_CASE_LIMIT));
      })
      .catch(() => {
        if (!cancelled) setRelatedCases([]);
      })
      .finally(() => {
        if (!cancelled) setRelatedCasesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [locale, template]);

  const selectTemplate = useCallback(
    (nextTemplate: PromptStyleGridTemplate) => {
      setTemplate(nextTemplate);
      const nextGridConfig = getThemeCardGridConfig(nextTemplate);
      const nextGridLabels = getDefaultGridLabels(nextTemplate, locale, i18n);
      setCellItems(
        resizeGridItems([], nextGridConfig.rows * nextGridConfig.columns)
      );
      setCellLabels(
        resizeGridLabels(
          nextGridLabels,
          nextGridLabels,
          nextGridConfig.rows * nextGridConfig.columns
        )
      );
      setGridRows(nextGridConfig.rows);
      setGridColumns(nextGridConfig.columns);
      setCardTitle(getTemplateTitle(nextTemplate));
      setActiveCellIndex(null);
      setEditingLabelIndex(null);
      setActiveTool('add');
      setSelectedModel(DEFAULT_ASSIST_MODEL);
      setSelectedImageSize(nextTemplate.recommendedImageSize);
      setIsPromptDirty(false);
      writeRecentTemplateSlug(nextTemplate.slug);
      trackEvent('style_grid_template_select', {
        template_slug: nextTemplate.slug,
        selected_count: 0,
        cta_source: CTA_SOURCE,
        prompt_page_type: 'style_grid',
        authenticated: isAuthenticated,
        locale
      });
    },
    [getTemplateTitle, i18n, isAuthenticated, locale]
  );

  const addItemToActiveCell = useCallback(
    (item: ThemeCardGridItem) => {
      const cellCount = gridRows * gridColumns;
      const targetIndex = getTargetCellIndex();
      setCellItems((current) => {
        const next = resizeGridItems(current, cellCount);
        next[targetIndex] = item;
        return next;
      });
      setActiveCellIndex(targetIndex);
      setIsPromptDirty(false);
    },
    [getTargetCellIndex, gridColumns, gridRows]
  );

  const clearCell = useCallback((index: number) => {
    if (index < 0) return;
    setCellItems((current) => {
      const next = [...current];
      next[index] = null;
      return next;
    });
    setActiveCellIndex(index);
    setIsPromptDirty(false);
  }, []);

  const randomize = useCallback(() => {
    const cellCount = gridRows * gridColumns;
    const randomized = Array.from({ length: cellCount }, (_, index) => {
      const assetId = randomAssetIdForSlot(index % promptStyleGridSlots.length);
      const asset = getAssetById(assetId, imagePromptAssetCatalog);
      return asset ? assetToGridItem(asset, locale) : null;
    });
    setCellItems(randomized);
    setActiveCellIndex(0);
    setIsPromptDirty(false);
    trackEvent('style_grid_randomize', {
      template_slug: template.slug,
      selected_count: randomized.filter(Boolean).length,
      cta_source: CTA_SOURCE,
      prompt_page_type: 'style_grid',
      authenticated: isAuthenticated,
      locale
    });
  }, [gridColumns, gridRows, isAuthenticated, locale, template.slug]);

  const reset = useCallback(() => {
    setCellItems(resizeGridItems([], gridRows * gridColumns));
    setActiveCellIndex(null);
    setEditingLabelIndex(null);
    setIsPromptDirty(false);
  }, [gridColumns, gridRows]);

  const resetGridSettings = useCallback(() => {
    const nextGridConfig = getThemeCardGridConfig(template);
    setGridRows(nextGridConfig.rows);
    setGridColumns(nextGridConfig.columns);
    setShowLabels(true);
    setCellItems(
      resizeGridItems([], nextGridConfig.rows * nextGridConfig.columns)
    );
    setCellLabels(
      resizeGridLabels(
        getGridLabels(template),
        getGridLabels(template),
        nextGridConfig.rows * nextGridConfig.columns
      )
    );
    setActiveCellIndex(null);
    setEditingLabelIndex(null);
    setIsPromptDirty(false);
  }, [getGridLabels, template]);

  const saveUploadItems = useCallback(async (items: ThemeCardGridItem[]) => {
    try {
      await Promise.all(
        items.map((item) =>
          putPersistedThemeCardUpload({
            id: item.id.replace(/^upload:/, ''),
            title: item.title,
            subtitle: item.subtitle,
            imageUrl: item.imageUrl || '',
            createdAt: Date.now()
          })
        )
      );
      setUploadPersistenceAvailable(true);
    } catch {
      setUploadPersistenceAvailable(false);
    }
  }, []);

  const handleUpload = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files || []);
      if (files.length === 0) return;
      const timestamp = Date.now();
      const nextItems = await Promise.all(
        files.map(async (file, index) => ({
          id: `upload:${timestamp}:${index}:${file.name}`,
          title: file.name.replace(/\.[^.]+$/, '') || tr('stage.uploadedImage'),
          subtitle: tr('stage.localUpload'),
          imageUrl: await readFileAsDataUrl(file),
          source: 'upload' as const
        }))
      );
      if (replaceUploadId) {
        const [replacement] = nextItems;
        const nextReplacement = {
          ...replacement,
          id: replaceUploadId
        };
        setUploadedItems((current) =>
          current.map((item) =>
            item.id === replaceUploadId ? nextReplacement : item
          )
        );
        setCellItems((current) =>
          current.map((item) =>
            item?.id === replaceUploadId ? nextReplacement : item
          )
        );
        await saveUploadItems([nextReplacement]);
        setReplaceUploadId(null);
      } else {
        setUploadedItems((current) => [...nextItems, ...current]);
        await saveUploadItems(nextItems);
        addItemToActiveCell(nextItems[0]);
      }
      setUploadTab('myUploads');
      event.target.value = '';
    },
    [addItemToActiveCell, replaceUploadId, saveUploadItems, tr]
  );

  const triggerUpload = useCallback((nextReplaceUploadId?: string) => {
    setReplaceUploadId(nextReplaceUploadId || null);
    uploadInputRef.current?.click();
  }, []);

  const deleteUploadItem = useCallback((id: string) => {
    setUploadedItems((current) => current.filter((item) => item.id !== id));
    setCellItems((current) =>
      current.map((item) => (item?.id === id ? null : item))
    );
    deletePersistedThemeCardUpload(id.replace(/^upload:/, '')).catch(() => {
      setUploadPersistenceAvailable(false);
    });
  }, []);

  const copyShareLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
      void recordClientConversionEvent(getAccessToken(), {
        eventName: 'prompt_share_view',
        entityType: 'style_grid',
        entityId: template.slug,
        ctaSource: 'style_grid_share',
        idempotencyKey: `prompt_share_view:${template.slug}:${Date.now()}`,
        metadata: {
          templateSlug: template.slug,
          selectedCount
        }
      });
      trackEvent('style_grid_share_link_copy', {
        template_slug: template.slug,
        selected_count: selectedCount,
        cta_source: CTA_SOURCE,
        prompt_page_type: 'style_grid',
        authenticated: isAuthenticated,
        locale
      });
    } catch {
      setCopied(false);
    }
  }, [
    getAccessToken,
    isAuthenticated,
    locale,
    selectedCount,
    shareUrl,
    template.slug
  ]);

  const copyPromptStarter = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(promptDraft);
      trackEvent('style_grid_prompt_copy', {
        template_slug: template.slug,
        selected_count: selectedCount,
        cta_source: CTA_SOURCE,
        prompt_page_type: 'style_grid',
        prompt_model: selectedModel,
        authenticated: isAuthenticated,
        locale
      });
    } catch {
      // Clipboard availability varies in embedded browsers.
    }
  }, [
    isAuthenticated,
    promptDraft,
    locale,
    selectedCount,
    selectedModel,
    template.slug
  ]);

  const downloadPng = useCallback(async () => {
    const cardElement = cardRef.current;
    if (!cardElement) return;
    setDownloadState('working');
    cardElement.classList.add('theme-card-card-exporting');
    try {
      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(cardElement, {
        backgroundColor: '#f8f3ec',
        scale: 2,
        useCORS: true
      });
      const link = document.createElement('a');
      link.download = `webtomind-${template.slug}-theme-card.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      setDownloadState('idle');
      trackEvent('style_grid_download', {
        template_slug: template.slug,
        selected_count: selectedCount,
        cta_source: CTA_SOURCE,
        prompt_page_type: 'style_grid',
        authenticated: isAuthenticated,
        locale
      });
    } catch {
      setDownloadState('error');
    } finally {
      cardElement.classList.remove('theme-card-card-exporting');
    }
  }, [isAuthenticated, locale, selectedCount, template.slug]);

  const trackCreateClick = useCallback(() => {
    trackEvent('style_grid_create_click', {
      template_slug: template.slug,
      selected_count: selectedCount,
      cta_source: CTA_SOURCE,
      prompt_page_type: 'style_grid',
      prompt_model: selectedModel,
      authenticated: isAuthenticated,
      locale
    });
  }, [isAuthenticated, locale, selectedCount, selectedModel, template.slug]);

  const updateCellLabel = useCallback(
    (index: number, value: string) => {
      const fallback =
        getGridLabels(template)[index] ||
        tr('grid.slotFallback', { number: index + 1 });
      setCellLabels((current) => {
        const next = resizeGridLabels(
          current,
          getGridLabels(template),
          gridRows * gridColumns
        );
        next[index] = value.trim() || fallback;
        return next;
      });
    },
    [getGridLabels, gridColumns, gridRows, template, tr]
  );

  const handleCellLabelKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>, index: number) => {
      if (event.key === 'Enter') {
        event.currentTarget.blur();
        setEditingLabelIndex(null);
      }
      if (event.key === 'Escape') {
        updateCellLabel(
          index,
          getGridLabels(template)[index] ||
            tr('grid.slotFallback', { number: index + 1 })
        );
        setEditingLabelIndex(null);
      }
    },
    [getGridLabels, template, tr, updateCellLabel]
  );

  if (isPlazaView) {
    return (
      <main className="style-grid-page theme-card-plaza-page">
        <section
          className="theme-card-plaza-hero"
          aria-labelledby="theme-card-plaza-title"
        >
          <div>
            <span>{tr('plaza.kicker')}</span>
            <h1 id="theme-card-plaza-title">{tr('plaza.title')}</h1>
            <p>{tr('plaza.subtitle')}</p>
          </div>
          <Link to={`${themeCardBasePath}/${promptStyleGridTemplates[0].slug}`}>
            {tr('plaza.create')}
          </Link>
        </section>

        <section className="theme-card-plaza-section">
          <div className="theme-card-plaza-heading">
            <h2>{tr('plaza.browseByType')}</h2>
          </div>
          <div className="theme-card-category-grid">
            {categoryCounts.map((item) => (
              <a
                key={item.category}
                href={`${themeCardBasePath}?type=${encodeURIComponent(
                  item.category
                )}`}
              >
                <span>{item.category}</span>
                <small>{tr('plaza.cardCount', { count: item.count })}</small>
              </a>
            ))}
          </div>
        </section>

        <section className="theme-card-plaza-section" id="featured-theme-cards">
          <div className="theme-card-plaza-heading">
            <h2>{tr('plaza.featuredTitle')}</h2>
            <p>{tr('plaza.featuredDesc')}</p>
          </div>
          <div className="theme-card-featured-grid">
            {promptStyleGridTemplates.slice(0, 8).map((item) => (
              <Link key={item.slug} to={`${themeCardBasePath}/${item.slug}`}>
                <img
                  src={item.thumbnailUrl}
                  alt={`${getTemplateTitle(item)}风格卡片预览`}
                  loading="lazy"
                />
                <strong>{getTemplateTitle(item)}</strong>
                <span>{getTemplateCategory(item)}</span>
              </Link>
            ))}
          </div>
        </section>

        <section className="theme-card-plaza-section">
          <div className="theme-card-plaza-heading">
            <h2>{tr('plaza.trendingTitle')}</h2>
            <p>{tr('plaza.trendingDesc')}</p>
          </div>
          <div className="theme-card-trending-list">
            {promptStyleGridTemplates.map((item, index) => (
              <Link key={item.slug} to={`${themeCardBasePath}/${item.slug}`}>
                <img
                  src={item.thumbnailUrl}
                  alt={`${getTemplateTitle(item)}风格卡片预览`}
                  loading="lazy"
                />
                <div>
                  <strong>{getTemplateTitle(item)}</strong>
                  <span>{getTemplateCategory(item)}</span>
                  <p>{getTemplateDescription(item)}</p>
                </div>
                <small>{Math.round((12 - index) * 8.7)}k</small>
              </Link>
            ))}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="theme-card-editor-page">
      <section
        className="theme-card-editor-shell"
        aria-labelledby="style-grid-title"
      >
        <aside
          className="theme-card-toolbox"
          aria-label={tr('stage.toolsAria')}
        >
          <nav
            className="theme-card-toolrail"
            aria-label={tr('stage.sectionsAria')}
          >
            {[
              { id: 'add' as const, label: tr('tools.add'), icon: PlusCircle },
              {
                id: 'templates' as const,
                label: tr('tools.templates'),
                icon: LayoutGrid
              },
              {
                id: 'upload' as const,
                label: tr('tools.upload'),
                icon: Upload
              },
              {
                id: 'settings' as const,
                label: tr('tools.settings'),
                icon: Settings
              }
            ].map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={activeTool === item.id ? 'active' : ''}
                  onClick={() => setActiveTool(item.id)}
                >
                  <Icon size={20} aria-hidden="true" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="theme-card-toolpanel">
            {activeTool === 'add' ? (
              <section aria-labelledby="theme-card-add-title">
                <div className="theme-card-panel-head">
                  <div>
                    <h2 id="theme-card-add-title">{tr('tools.add')}</h2>
                    <p>{tr('panel.addDesc')}</p>
                  </div>
                  <span>
                    {activeCellIndex === null
                      ? tr('panel.selectSlotFirst')
                      : tr('panel.slotProgress', {
                          current: activeCellIndex + 1,
                          total: gridRows * gridColumns
                        })}
                  </span>
                </div>
                <label className="theme-card-search">
                  <Search size={16} aria-hidden="true" />
                  <input
                    value={itemSearch}
                    onChange={(event) => setItemSearch(event.target.value)}
                    placeholder={tr('panel.searchItems')}
                  />
                </label>
                <div className="theme-card-item-list">
                  {addableItems.slice(0, 80).map((item) => {
                    const isPlaceholder = item.source === 'placeholder';
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={
                          isPlaceholder ? 'theme-card-item-placeholder' : ''
                        }
                        disabled={isPlaceholder}
                        aria-hidden={isPlaceholder ? 'true' : undefined}
                        onClick={
                          isPlaceholder
                            ? undefined
                            : () => addItemToActiveCell(item)
                        }
                      >
                        <span className="theme-card-item-thumb">
                          {item.imageUrl ? (
                            <img
                              src={item.imageUrl}
                              alt={`${item.title}参考图`}
                              loading="lazy"
                            />
                          ) : (
                            <span>{item.emoji || '✦'}</span>
                          )}
                        </span>
                        <span>
                          <strong>{item.title}</strong>
                          <small>{item.subtitle}</small>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ) : null}

            {activeTool === 'templates' ? (
              <section aria-labelledby="theme-card-template-title">
                <div className="theme-card-panel-head">
                  <div>
                    <h2 id="theme-card-template-title">
                      {tr('tools.templates')}
                    </h2>
                    <p>{tr('panel.templateDesc')}</p>
                  </div>
                </div>
                <label className="theme-card-search">
                  <Search size={16} aria-hidden="true" />
                  <input
                    value={templateSearch}
                    onChange={(event) => setTemplateSearch(event.target.value)}
                    placeholder={tr('panel.searchTemplates')}
                  />
                </label>
                <div
                  className="theme-card-template-tabs"
                  role="tablist"
                  aria-label={tr('panel.templateTabsAria')}
                >
                  {[
                    { id: 'featured' as const, label: tr('panel.featured') },
                    { id: 'community' as const, label: tr('panel.community') },
                    { id: 'forYou' as const, label: tr('panel.forYou') }
                  ].map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      role="tab"
                      aria-selected={templateTab === item.id}
                      className={templateTab === item.id ? 'active' : ''}
                      onClick={() => setTemplateTab(item.id)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                <div className="theme-card-template-list">
                  {filteredTemplates.map((item) => (
                    <button
                      key={item.slug}
                      type="button"
                      className={item.slug === template.slug ? 'active' : ''}
                      onClick={() => selectTemplate(item)}
                    >
                      <strong>{getTemplateTitle(item)}</strong>
                      <img
                        src={item.thumbnailUrl}
                        alt={`${getTemplateTitle(item)}模板预览`}
                        loading="lazy"
                      />
                      <span>{getTemplateCategory(item)}</span>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

            {activeTool === 'upload' ? (
              <section aria-labelledby="theme-card-upload-title">
                <div
                  className="theme-card-upload-tabs"
                  role="tablist"
                  aria-label={tr('panel.uploadTabsAria')}
                >
                  {[
                    { id: 'local' as const, label: tr('panel.local') },
                    { id: 'myUploads' as const, label: tr('panel.myUploads') }
                  ].map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      role="tab"
                      aria-selected={uploadTab === item.id}
                      className={uploadTab === item.id ? 'active' : ''}
                      onClick={() => setUploadTab(item.id)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                <input
                  ref={uploadInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="theme-card-file-input"
                  onChange={handleUpload}
                />
                {uploadTab === 'local' ? (
                  <>
                    <button
                      type="button"
                      className="theme-card-upload-button"
                      onClick={() => triggerUpload()}
                    >
                      <ImagePlus size={20} aria-hidden="true" />
                      {tr('panel.uploadFromDevice')}
                    </button>
                    <p id="theme-card-upload-title">{tr('panel.uploadHint')}</p>
                    {!uploadPersistenceAvailable ? (
                      <p className="theme-card-upload-warning">
                        {tr('panel.uploadMemoryOnly')}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <div className="theme-card-upload-manager">
                    <button
                      type="button"
                      className="theme-card-upload-button"
                      onClick={() => triggerUpload()}
                    >
                      <ImagePlus size={20} aria-hidden="true" />
                      {tr('panel.continueUpload')}
                    </button>
                    {uploadedItems.length > 0 ? (
                      <div className="theme-card-upload-list">
                        {uploadedItems.map((item) => (
                          <article
                            key={item.id}
                            className="theme-card-upload-row"
                          >
                            <button
                              type="button"
                              className="theme-card-upload-preview"
                              onClick={() => addItemToActiveCell(item)}
                            >
                              <span className="theme-card-item-thumb">
                                {item.imageUrl ? (
                                  <img
                                    src={item.imageUrl}
                                    alt={`${item.title}上传预览`}
                                    loading="lazy"
                                  />
                                ) : null}
                              </span>
                              <span>
                                <strong>{item.title}</strong>
                                <small>{item.subtitle}</small>
                              </span>
                            </button>
                            <div className="theme-card-upload-actions">
                              <button
                                type="button"
                                onClick={() => addItemToActiveCell(item)}
                              >
                                {tr('panel.useUpload')}
                              </button>
                              <button
                                type="button"
                                onClick={() => triggerUpload(item.id)}
                              >
                                {tr('panel.replaceUpload')}
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteUploadItem(item.id)}
                              >
                                {tr('panel.deleteUpload')}
                              </button>
                            </div>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <p id="theme-card-upload-title">
                        {tr('panel.emptyUploads')}
                      </p>
                    )}
                  </div>
                )}
              </section>
            ) : null}

            {activeTool === 'settings' ? (
              <section
                className="theme-card-settings-panel"
                aria-labelledby="theme-card-settings-title"
              >
                <h2 id="theme-card-settings-title">{tr('tools.settings')}</h2>
                <label>
                  <span>{tr('panel.rows')}</span>
                  <input
                    type="number"
                    min={1}
                    max={6}
                    value={gridRows}
                    onChange={(event) =>
                      setGridRows(
                        Math.min(6, Math.max(1, Number(event.target.value)))
                      )
                    }
                  />
                </label>
                <label>
                  <span>{tr('panel.columns')}</span>
                  <input
                    type="number"
                    min={1}
                    max={6}
                    value={gridColumns}
                    onChange={(event) =>
                      setGridColumns(
                        Math.min(6, Math.max(1, Number(event.target.value)))
                      )
                    }
                  />
                </label>
                <label className="theme-card-toggle-row">
                  <span>{tr('panel.showLabels')}</span>
                  <input
                    type="checkbox"
                    checked={showLabels}
                    onChange={(event) => setShowLabels(event.target.checked)}
                  />
                </label>
                <button type="button" onClick={resetGridSettings}>
                  <Trash2 size={18} aria-hidden="true" />
                  {tr('panel.resetGrid')}
                </button>
              </section>
            ) : null}
          </div>
        </aside>

        <section
          className="theme-card-stage"
          aria-label={tr('stage.canvasAria')}
        >
          <div className="theme-card-stage-top">
            <Link to={themeCardBasePath}>{tr('stage.back')}</Link>
            <label className="theme-card-stage-title-control">
              <span>{tr('stage.titleLabel')}</span>
              <input
                value={cardTitle}
                aria-label={tr('stage.titleAria')}
                placeholder={tr('stage.titlePlaceholder')}
                onChange={(event) => setCardTitle(event.target.value)}
              />
            </label>
            <div className="theme-card-stage-actions">
              <button type="button" onClick={copyShareLink}>
                <Copy size={16} aria-hidden="true" />
                {copied ? tr('stage.copied') : tr('stage.shareLink')}
              </button>
              <button
                type="button"
                onClick={downloadPng}
                disabled={downloadState === 'working'}
              >
                <Download size={16} aria-hidden="true" />
                {downloadState === 'working'
                  ? tr('stage.preparing')
                  : tr('stage.download')}
              </button>
              <Link to={createHref} onClick={trackCreateClick}>
                <Sparkles size={16} aria-hidden="true" />
                {tr('stage.generate')}
                <ExternalLink size={14} aria-hidden="true" />
              </Link>
            </div>
          </div>

          {downloadState === 'error' ? (
            <p className="style-grid-error">{tr('stage.downloadError')}</p>
          ) : null}

          <h1 id="style-grid-title" className="theme-card-sr-title">
            {cardTitle.trim() || getTemplateTitle(template)}
          </h1>
          <Card className="theme-card-card" ref={cardRef}>
            <div
              className="theme-card-fill-grid"
              style={{
                gridTemplateColumns: `repeat(${gridConfig.columns}, minmax(0, 1fr))`
              }}
            >
              {Array.from({ length: gridRows * gridColumns }).map(
                (_, index) => {
                  const item = cellItems[index];
                  const label = getGridLabel(
                    gridConfig,
                    index,
                    tr('grid.slotFallback', { number: index + 1 })
                  );
                  const isActive = activeCellIndex === index;
                  return (
                    <div
                      key={`${template.slug}-${index}`}
                      className={`theme-card-cell${isActive ? ' active' : ''}`}
                    >
                      <button
                        type="button"
                        className="theme-card-cell-select"
                        onClick={() => {
                          setActiveCellIndex(index);
                          setEditingLabelIndex(null);
                          setActiveTool('add');
                        }}
                        aria-pressed={isActive}
                        aria-label={tr('stage.selectLabel', { label })}
                      >
                        <span className="theme-card-cell-media">
                          {item?.imageUrl ? (
                            <span
                              className="theme-card-cell-image"
                              style={{
                                backgroundImage: `url(${JSON.stringify(
                                  item.imageUrl
                                )})`
                              }}
                              aria-hidden="true"
                            />
                          ) : item?.emoji ? (
                            <span className="theme-card-cell-placeholder">
                              {item.emoji}
                            </span>
                          ) : (
                            <span className="theme-card-cell-placeholder">
                              {tr('stage.clickToAdd')}
                            </span>
                          )}
                          {item ? (
                            <span className="theme-card-cell-caption">
                              {item.title}
                            </span>
                          ) : null}
                        </span>
                      </button>
                      {showLabels ? (
                        <span className="theme-card-cell-label">
                          {editingLabelIndex === index ? (
                            <input
                              value={label}
                              aria-label={tr('stage.editLabelAria', {
                                label
                              })}
                              onChange={(event) =>
                                updateCellLabel(index, event.target.value)
                              }
                              onBlur={() => setEditingLabelIndex(null)}
                              onKeyDown={(event) =>
                                handleCellLabelKeyDown(event, index)
                              }
                              autoFocus
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setActiveCellIndex(index);
                                setEditingLabelIndex(index);
                              }}
                            >
                              {label}
                            </button>
                          )}
                        </span>
                      ) : null}
                    </div>
                  );
                }
              )}
            </div>
            <label className="theme-card-footer-note">
              <span>{tr('stage.footerTextLabel')}</span>
              <textarea
                value={cardFooterText}
                rows={2}
                aria-label={tr('stage.footerTextAria')}
                onChange={(event) => setCardFooterText(event.target.value)}
                placeholder={tr('stage.footerTextPlaceholder')}
              />
            </label>
          </Card>

          <div className="theme-card-stage-footer">
            <button type="button" onClick={randomize}>
              <RefreshCcw size={16} aria-hidden="true" />
              {tr('stage.fillExamples')}
            </button>
            <button type="button" onClick={reset}>
              <RotateCcw size={16} aria-hidden="true" />
              {tr('stage.clear')}
            </button>
            <button
              type="button"
              onClick={() => {
                if (activeCellIndex !== null) clearCell(activeCellIndex);
              }}
              disabled={activeCellIndex === null}
            >
              <Trash2 size={16} aria-hidden="true" />
              {tr('stage.clearSelected')}
            </button>
            <button type="button" onClick={copyPromptStarter}>
              <Copy size={16} aria-hidden="true" />
              {tr('stage.copyPrompt')}
            </button>
          </div>

          {activeCellIndex !== null ? (
            <section
              className="theme-card-assist-panel"
              aria-labelledby="style-grid-generation-title"
            >
              <div className="theme-card-assist-head">
                <div>
                  <span>{tr('stage.assistKicker')}</span>
                  <h2 id="style-grid-generation-title">
                    {tr('stage.assistTitle')}
                  </h2>
                </div>
                <p>
                  {tr('stage.assistDesc', {
                    label: selectedCellLabel
                  })}
                </p>
              </div>
              <div className="style-grid-generation-controls">
                <label>
                  <span>{tr('stage.model')}</span>
                  <select
                    value={selectedModel}
                    onChange={(event) => setSelectedModel(event.target.value)}
                  >
                    {modelOptions.map((model) => (
                      <option key={model.value} value={model.value}>
                        {model.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>{tr('stage.imageSize')}</span>
                  <select
                    value={selectedImageSize}
                    onChange={(event) =>
                      setSelectedImageSize(event.target.value)
                    }
                  >
                    {imageSizeOptions
                      .filter((option) => option.value !== 'auto')
                      .map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.value} · {option.aspectRatio}
                        </option>
                      ))}
                  </select>
                </label>
              </div>
              <label className="theme-card-assist-prompt">
                <span>{tr('stage.promptLabel')}</span>
                <textarea
                  value={promptDraft}
                  onChange={(event) => {
                    setPromptDraft(event.target.value);
                    setIsPromptDirty(true);
                  }}
                  aria-label={tr('stage.promptAria')}
                />
              </label>
              <div className="theme-card-assist-actions">
                <button
                  type="button"
                  onClick={() => {
                    setPromptDraft(promptStarter);
                    setIsPromptDirty(false);
                  }}
                >
                  <RotateCcw size={16} aria-hidden="true" />
                  {tr('stage.restorePrompt')}
                </button>
                <Link to={createHref} onClick={trackCreateClick}>
                  <Sparkles size={16} aria-hidden="true" />
                  {tr('stage.generateInCreate')}
                </Link>
              </div>
            </section>
          ) : (
            <section className="theme-card-assist-empty">
              <strong>{tr('stage.assistEmptyTitle')}</strong>
              <p>{tr('stage.assistEmptyDesc')}</p>
            </section>
          )}

          <section className="theme-card-editor-seo">
            <h2>{tr('stage.seoTitle')}</h2>
            <div className="style-grid-keywords" aria-label="SEO keywords">
              {visibleSeoKeywords.slice(0, 14).map((keyword) => (
                <Link
                  key={keyword}
                  to={`${PROMPT_STYLE_GRID_CANONICAL_PATH}/${template.slug}`}
                >
                  {keyword}
                </Link>
              ))}
            </div>
          </section>
        </section>
      </section>
    </main>
  );
}
