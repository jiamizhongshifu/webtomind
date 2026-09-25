import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent
} from 'react';
import {
  Link,
  Navigate,
  useLocation,
  useNavigate,
  useParams
} from 'react-router-dom';
import { PromptLibrarySearch } from './prompt-library/PromptLibrarySearch';
import {
  PROMPT_SEO_ALIASES,
  PROMPT_SEO_PAGES,
  getPromptSeoPage,
  type LocalizedText,
  type PromptSeoAlias,
  type PromptSeoAliasTarget,
  type PromptSeoPage,
  type PromptSeoPageType
} from '@/shared/prompt-seo-content';
import {
  getPromptSeoPublicCases,
  promptSeoCaseMatches
} from '@/shared/prompt-seo-match';
import {
  getPublicPromptCase,
  getPublicPromptCases,
  getPublicPromptCasesResult,
  trackPromptCaseEvent,
  type PromptCase,
  type PromptCaseCountMap
} from '@/services/agent-api';
import {
  getPromptCaseCreateSettings,
  getPromptCasePrimaryVideoUrl,
  getOptimizedPromptCaseImageUrl,
  getPromptCaseResponsiveImageSet,
  isFeaturedPromptCase,
  isPromptCaseVideo,
  sortPromptCasesByDisplayPriority
} from '@/utils/prompt-case';
import { useAuth } from '../contexts/AuthContext';
import {
  trackPromptCaseCta,
  trackPromptPreviewCopy,
  trackPromptPreviewUse,
  trackPromptPreviewView
} from '../lib/analytics';
import {
  recordClientConversionEvent,
  type ClientConversionEventPayload
} from '../lib/client-conversion-events';
import { usePromptLibraryCases } from './prompt-library/usePromptLibraryCases';
import { usePromptLibraryQuery } from './prompt-library/usePromptLibraryQuery';
import {
  PromptLibraryNavigation,
  PromptLibrarySortTabs,
  type PromptLibraryModelNavItem,
  type PromptLibrarySortNavItem,
  type PromptLibraryTagNavItem
} from './prompt-library/PromptLibraryNavigation';
import {
  PromptLibraryMasonry,
  type PromptCaseLoadState,
  type PromptLibraryMasonryItem
} from './prompt-library/PromptLibraryMasonry';
import { shouldAutoLoadPromptCases } from './prompt-library/promptLibraryAutoload';
import { readPromptLibraryBootstrap } from './prompt-library/promptLibraryBootstrap';
import {
  getPromptCaseCardAspectRatio,
  getPromptCaseCover,
  getPromptCaseFullPromptForLocale,
  getPromptCasePreviewText
} from './prompt-library/promptLibraryDisplay';
import { PromptLibrarySeoContent } from './prompt-library/PromptLibrarySeoContent';
import {
  cssAspectRatioToHeightWeight,
  getResponsiveMasonryColumnCount,
  splitMasonryColumns
} from '../lib/masonry';
import { applySeo } from '../lib/seo';
import { useMarketingLocale } from '../lib/marketing-locale';
import { PromptLibraryShellNav } from './prompt-library/PromptLibraryShellNav';
import {
  buildPromptTextForVisualRecipe,
  getLocalPublicImagePromptAssets,
  inferVisualRecipeSelectionFromPromptText,
  loadPublicImagePromptAssetSlotLibrary,
  mergeHydratedPromptAssetSlot,
  mergeVisualRecipeSelections,
  resolveVisualRecipeAssets,
  type ResolvedVisualRecipeAsset
} from '../components/image-create/assetLibraryResolver';
import { normalizeVisualRecipeSelection } from '../data/visual-recipe-selection';
import { hasVideoPromptHubPublishingThreshold } from '@/shared/prompt-seo-quality';
import {
  findPromptCasesSharingRecipeAssets,
  getVisualRecipeSelectedAssetIds
} from '../components/image-create/promptCaseRecipeExposure';
import {
  imagePromptSlots,
  type ImagePromptAsset,
  type ImagePromptSelection,
  type ImagePromptSlot
} from '../data/image-prompt-core';
import { usePromptCaseFavorites } from '../lib/prompt-case-favorites';
import { normalizePromptLibrarySearch } from '../lib/prompt-library-query';
import { getReferralShareCode, withReferralParam } from '../lib/referral-share';
import { useOverlayBehavior } from '@/shared/ui';
import './prompt-library/prompt-library-apple.css';

const PromptCasePreviewDialog = lazy(() =>
  import('./prompt-library/PromptCasePreviewDialog').then((module) => ({
    default: module.PromptCasePreviewDialog
  }))
);

const PROMPT_BROWSER_INITIAL_CASE_FETCH_LIMIT = 160;
const PROMPT_BROWSER_EXPANDED_CASE_FETCH_LIMIT = 900;
const PROMPT_BROWSER_ROOT_INITIAL_LIMIT = 36;
const PROMPT_BROWSER_FOCUSED_INITIAL_LIMIT = 24;
const PROMPT_BROWSER_INITIAL_VISIBLE_LIMIT = 48;
const PROMPT_BROWSER_CASE_PAGE_SIZE = 24;
const PROMPT_BROWSER_AUTO_LOAD_MARGIN_PX = 960;
const PROMPT_BROWSER_FAVORITE_FETCH_CONCURRENCY = 4;
const PROMPT_BROWSER_CASE_IMAGE_SIZES =
  '(max-width: 520px) calc((100vw - 40px) / 2), (max-width: 820px) calc((100vw - 60px) / 2), (max-width: 1120px) calc((100vw - 260px) / 2), 260px';
const PROMPT_BROWSER_PRELOAD_IMAGE_WIDTHS = [320, 480, 640];
const EMPTY_PROMPT_CASES: PromptCase[] = [];
type PromptBrowserStats = {
  navigationTotal: number | null;
  modelCounts: PromptCaseCountMap;
  categoryCounts: PromptCaseCountMap;
};

function getPromptBrowserScrollContainer(node: HTMLElement | null) {
  let parent = node?.parentElement || null;
  while (
    parent &&
    parent !== document.body &&
    parent !== document.documentElement
  ) {
    const overflowY = window.getComputedStyle(parent).overflowY;
    if (
      /(auto|scroll|overlay)/.test(overflowY) &&
      parent.scrollHeight > parent.clientHeight
    ) {
      return parent;
    }
    parent = parent.parentElement;
  }
  return null;
}

function getPromptBrowserSentinelTop(
  sentinel: HTMLElement,
  scrollContainer: HTMLElement | null
) {
  const sentinelRect = sentinel.getBoundingClientRect();
  if (!scrollContainer) return sentinelRect.top;
  return sentinelRect.top - scrollContainer.getBoundingClientRect().top;
}

function getPromptBrowserViewportHeight(scrollContainer: HTMLElement | null) {
  return (
    scrollContainer?.clientHeight ||
    window.innerHeight ||
    document.documentElement.clientHeight ||
    0
  );
}

function getPromptBrowserScrollOffset(
  scrollContainer: HTMLElement | null
): number {
  return Math.max(
    0,
    scrollContainer?.scrollTop || 0,
    window.scrollY || 0,
    document.documentElement.scrollTop || 0
  );
}

const PROMPT_MODEL_COUNT_ALIASES: Record<string, string[]> = {
  'gpt-image-2': ['gpt-image-2'],
  'nano-banana': ['nano-banana'],
  flux: ['flux'],
  'midjourney-alternative': [
    'midjourney-alternative',
    'midjourney',
    'midjourney-v7',
    'midjourney-niji-v7'
  ],
  seedream: [
    'seedream',
    'seedream-5-lite',
    'seedream-5.0-lite',
    'seedream-5-0-lite'
  ],
  'seedance-2-0': ['seedance-2-0', 'seedance']
};
const STYLE_GRID_CTA_PATHS = new Set([
  '/en-US/prompts',
  '/gpt-image-2-prompts',
  '/nano-banana-prompts',
  '/portrait-prompts',
  '/product-photography-prompts'
]);

function text(value: LocalizedText, isZh: boolean): string {
  return isZh ? value.zh : value.en;
}

function getPromptSeoPath(page: PromptSeoPage): string {
  return `/prompts/${page.type}/${page.slug}`;
}

function getKeywords(page: PromptSeoPage, isZh: boolean): string[] {
  return isZh ? page.keywords.zh : page.keywords.en;
}

function getAliasKeywords(alias: PromptSeoAlias, isZh: boolean): string[] {
  if (!alias.keywords) return [];
  return isZh ? alias.keywords.zh : alias.keywords.en;
}

function getRoutePage(
  routeType: string | undefined,
  slug: string | undefined
): PromptSeoPage | undefined {
  if (!routeType || !slug) return undefined;
  if (
    routeType !== 'category' &&
    routeType !== 'model' &&
    routeType !== 'package'
  ) {
    return undefined;
  }
  return getPromptSeoPage(routeType as PromptSeoPageType, slug);
}

function stripLocale(pathname: string): string {
  return pathname.replace(/^\/(?:zh-CN|en-US)(?=\/|$)/, '') || '/';
}

function getRouteAlias(pathname: string): PromptSeoAlias | undefined {
  const pathWithoutLocale = stripLocale(pathname).replace(/\/$/, '') || '/';
  return PROMPT_SEO_ALIASES.find((alias) => alias.path === pathWithoutLocale);
}

function useRouteType(pathname: string): PromptSeoPageType | undefined {
  if (pathname.includes('/prompts/package/')) return 'package';
  if (pathname.includes('/prompts/model/')) return 'model';
  if (pathname.includes('/prompts/category/')) return 'category';
  return undefined;
}

function getPromptSeoAliasPath(page: PromptSeoPage): string | undefined {
  return PROMPT_SEO_ALIASES.find(
    (alias) =>
      alias.target?.type === page.type && alias.target.slug === page.slug
  )?.canonicalPath;
}

function getPromptSeoDisplayPath(page: PromptSeoPage): string {
  return getPromptSeoAliasPath(page) || getPromptSeoPath(page);
}

function promptCaseMatchesPage(
  caseItem: PromptCase,
  page: PromptSeoAliasTarget | PromptSeoPage | undefined
): boolean {
  if (!page) return true;
  return promptSeoCaseMatches(caseItem, page.type, page.slug);
}

function getPromptCaseImages(caseItem?: PromptCase | null): string[] {
  const urls = [
    ...(Array.isArray(caseItem?.imageUrls) ? caseItem.imageUrls : []),
    caseItem?.imageUrl || ''
  ]
    .map((url) => url.trim())
    .filter(Boolean);
  return Array.from(new Set(urls));
}

function mergePromptCaseLocaleDetail(
  base: PromptCase,
  detailedCase: PromptCase,
  detailLocale: 'zh-CN' | 'en-US'
): PromptCase {
  if (detailLocale === 'en-US') {
    const promptEn =
      detailedCase.promptEn ||
      (detailedCase.locale === 'en-US' ? detailedCase.prompt : '') ||
      '';
    const promptPreviewEn =
      detailedCase.promptPreviewEn ||
      (detailedCase.locale === 'en-US' ? detailedCase.promptPreview : '') ||
      '';
    const titleEn =
      detailedCase.titleEn ||
      (detailedCase.locale === 'en-US' ? detailedCase.title : '') ||
      '';
    return {
      ...base,
      titleEn: titleEn || base.titleEn,
      promptEn: promptEn || base.promptEn,
      promptPreviewEn: promptPreviewEn || base.promptPreviewEn,
      promptLocked:
        Boolean(base.promptLocked) && Boolean(detailedCase.promptLocked)
    };
  }

  const promptZh =
    detailedCase.promptZh ||
    (detailedCase.locale !== 'en-US' ? detailedCase.prompt : '') ||
    '';
  const promptPreviewZh =
    detailedCase.promptPreviewZh ||
    (detailedCase.locale !== 'en-US' ? detailedCase.promptPreview : '') ||
    '';
  const titleZh =
    detailedCase.titleZh ||
    (detailedCase.locale !== 'en-US' ? detailedCase.title : '') ||
    '';
  return {
    ...base,
    titleZh: titleZh || base.titleZh,
    promptZh: promptZh || base.promptZh,
    promptPreviewZh: promptPreviewZh || base.promptPreviewZh,
    prompt:
      base.locale === detailLocale && detailedCase.prompt
        ? detailedCase.prompt
        : base.prompt,
    promptLocked:
      Boolean(base.promptLocked) && Boolean(detailedCase.promptLocked)
  };
}

function hasPromptCaseLocalePrompt(
  caseItem: PromptCase,
  promptLocale: 'zh-CN' | 'en-US'
): boolean {
  return Boolean(getPromptCaseFullPromptForLocale(caseItem, promptLocale));
}

function getVisualRecipeSlotLabel(
  slot: ImagePromptSlot,
  locale: 'zh-CN' | 'en-US'
): string {
  const slotConfig = imagePromptSlots.find((item) => item.id === slot);
  if (locale === 'zh-CN') return slotConfig?.label || slot;
  return slot
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (value) => value.toUpperCase());
}

function getPromptCaseRecipeAssetIdsForSeo(caseItem: PromptCase): string[] {
  const configuredSelection = normalizeVisualRecipeSelection(
    (caseItem as PromptCase & { visualRecipe?: unknown }).visualRecipe
  );
  const inferredSelection = inferVisualRecipeSelectionFromPromptText(
    buildPromptTextForVisualRecipe(caseItem)
  );
  return getVisualRecipeSelectedAssetIds(
    mergeVisualRecipeSelections(configuredSelection, inferredSelection)
  );
}

function promptCaseMatchesSearch(
  caseItem: PromptCase,
  query: string,
  locale: 'zh-CN' | 'en-US'
): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;

  const localizedTitle =
    locale === 'en-US'
      ? caseItem.titleEn || caseItem.title
      : caseItem.titleZh || caseItem.title;
  const searchable = [
    localizedTitle,
    caseItem.title,
    caseItem.titleZh,
    caseItem.titleEn,
    caseItem.category,
    caseItem.model,
    caseItem.packageSlug,
    caseItem.commercialIntent,
    caseItem.promptPreview,
    caseItem.promptPreviewZh,
    caseItem.promptPreviewEn,
    caseItem.prompt,
    caseItem.promptZh,
    caseItem.promptEn,
    ...(caseItem.tags || [])
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return searchable.includes(normalizedQuery);
}

function getPromptCaseCreatedTime(caseItem: PromptCase): number {
  const value = caseItem.createdAt ? Date.parse(caseItem.createdAt) : 0;
  return Number.isFinite(value) ? value : 0;
}

function isManualPinnedPromptCase(caseItem: PromptCase): boolean {
  const sortOrder = Number(caseItem.sortOrder);
  return (
    isFeaturedPromptCase(caseItem) &&
    Number.isFinite(sortOrder) &&
    sortOrder === 0 &&
    !caseItem.sourceDraftId &&
    !caseItem.sourceCaseId
  );
}

function sortPromptCasesForBrowser(items: PromptCase[]): PromptCase[] {
  const defaultOrder = sortPromptCasesByDisplayPriority(items);
  const defaultOrderIndex = new Map(
    defaultOrder.map((caseItem, index) => [caseItem.id, index])
  );
  return [...defaultOrder].sort((a, b) => {
    const pinnedDiff =
      Number(isManualPinnedPromptCase(b)) - Number(isManualPinnedPromptCase(a));
    if (pinnedDiff !== 0) return pinnedDiff;

    if (isManualPinnedPromptCase(a) && isManualPinnedPromptCase(b)) {
      const createdDiff =
        getPromptCaseCreatedTime(b) - getPromptCaseCreatedTime(a);
      if (createdDiff !== 0) return createdDiff;
    }

    return (
      (defaultOrderIndex.get(a.id) ?? 0) - (defaultOrderIndex.get(b.id) ?? 0)
    );
  });
}

function getPromptCasePath(
  caseItem: PromptCase,
  locale: 'zh-CN' | 'en-US'
): string {
  return getPromptCaseDetailPath(caseItem, locale);
}

function getPromptCaseDetailPath(
  caseItem: PromptCase,
  locale: 'zh-CN' | 'en-US'
): string {
  const caseLocale =
    caseItem.locale === 'zh-CN' || caseItem.locale === 'en-US'
      ? caseItem.locale
      : locale;
  const localePrefix = `/${caseLocale}`;

  if (caseItem.slug) {
    return `${localePrefix}/prompts/${encodeURIComponent(caseItem.slug)}`;
  }

  return `${localePrefix}/create/prompts/share/${encodeURIComponent(
    caseItem.id
  )}`;
}

export function getPromptCaseCreatePath(
  caseItem: PromptCase,
  currentSearch = ''
): string {
  const params = new URLSearchParams(currentSearch);
  const currentSource = params.get('source');
  if (
    currentSource &&
    currentSource !== 'prompt_preview_cta' &&
    !params.has('refSource')
  ) {
    params.set('refSource', currentSource);
  }
  params.set('source', 'prompt_preview_cta');
  const createSettings = getPromptCaseCreateSettings(caseItem);

  if (caseItem.id) params.set('caseId', caseItem.id);
  if (caseItem.slug) params.set('caseSlug', caseItem.slug);
  if (caseItem.packageSlug) params.set('packageSlug', caseItem.packageSlug);
  if (caseItem.model) params.set('modelName', caseItem.model);
  if (createSettings.model) params.set('model', createSettings.model);
  if (createSettings.imageSize) {
    params.set('imageSize', createSettings.imageSize);
  }
  if (createSettings.quality) params.set('quality', createSettings.quality);
  if (createSettings.aspectRatio) {
    params.set('aspectRatio', createSettings.aspectRatio);
  }

  const createMediaType = isPromptCaseVideo(caseItem) ? 'video' : 'image';
  return `/${createMediaType}?${params.toString()}`;
}

async function copyPromptCasePrompt(
  caseItem: PromptCase,
  promptLocale: 'zh-CN' | 'en-US'
): Promise<boolean> {
  const value = getPromptCaseFullPromptForLocale(caseItem, promptLocale);
  if (!value || !navigator.clipboard) return false;
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch (error) {
    console.warn('[PromptSeo] prompt copy failed:', error);
    return false;
  }
}

async function mapPromptCaseFavoriteIds<T>(
  ids: string[],
  mapper: (id: string) => Promise<T>
): Promise<T[]> {
  const results = new Array<T>(ids.length);
  let nextIndex = 0;
  const workerCount = Math.min(
    PROMPT_BROWSER_FAVORITE_FETCH_CONCURRENCY,
    ids.length
  );

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < ids.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        results[currentIndex] = await mapper(ids[currentIndex]);
      }
    })
  );

  return results;
}

function getPromptCaseRequestOptions(
  page: PromptSeoAliasTarget | PromptSeoPage | undefined,
  locale: 'zh-CN' | 'en-US'
): Parameters<typeof getPublicPromptCases>[1] {
  if (!page) return { locale, requireImage: true };
  if (page.type === 'package') {
    return { locale, packageSlug: page.slug, requireImage: true };
  }
  if (page.type === 'model') {
    return { locale, model: page.slug, requireImage: true };
  }
  if (page.type === 'category') {
    return { locale, category: page.slug, requireImage: true };
  }
  return { locale, requireImage: true };
}

function mergePromptCaseRequestOptions(
  page: PromptSeoAliasTarget | PromptSeoPage | undefined,
  scopedTarget: PromptSeoAliasTarget | undefined,
  locale: 'zh-CN' | 'en-US'
): Parameters<typeof getPublicPromptCases>[1] {
  const options = {
    ...getPromptCaseRequestOptions(page, locale)
  };
  if (!scopedTarget) return options;

  if (scopedTarget.type === 'package') {
    options.packageSlug = scopedTarget.slug;
  } else if (scopedTarget.type === 'model') {
    options.model = scopedTarget.slug;
  } else if (scopedTarget.type === 'category') {
    options.category = scopedTarget.slug;
  }
  return options;
}

function isSrefSeoPage(
  page: PromptSeoAliasTarget | PromptSeoPage | undefined
): boolean {
  return page?.type === 'category' && page.slug === 'sref-prompts';
}

function hasRichAliasContent(
  alias: PromptSeoAlias | undefined
): alias is PromptSeoAlias {
  return Boolean(
    alias &&
    (alias.workflow?.length ||
      alias.examples?.length ||
      alias.sections?.length ||
      alias.faq?.length)
  );
}

type RelatedSeoLink = {
  href: string;
  label: string;
};

type PromptGlobalNavLink = {
  href: string;
  label: string;
  description?: string;
};

type PromptGlobalNavGroup = {
  title: string;
  links: PromptGlobalNavLink[];
};

type PromptPreviewAttribution = {
  caseId: string;
  caseSlug?: string;
  model?: string;
  packageSlug?: string;
  source: string;
  path: string;
  locale: 'zh-CN' | 'en-US';
  pageType?: PromptSeoPageType;
  pageSlug?: string;
};

function normalizePromptNavPath(value: string): string {
  const pathname = value.split('?')[0];
  return stripLocale(pathname).replace(/\/$/, '') || '/';
}

function getPromptNavTarget(href: string): PromptSeoAliasTarget | undefined {
  const queryString = href.split('?')[1]?.split('#')[0] || '';
  const searchParams = new URLSearchParams(queryString);
  const scopedCategory =
    searchParams.get('label')?.trim() || searchParams.get('category')?.trim();
  if (scopedCategory) {
    return { type: 'category', slug: scopedCategory };
  }
  const scopedPackage = searchParams.get('package')?.trim();
  if (scopedPackage) {
    return { type: 'package', slug: scopedPackage };
  }

  const normalizedPath = normalizePromptNavPath(href);
  const routeMatch = normalizedPath.match(
    /^\/prompts\/(category|model|package)\/([^/?#]+)$/
  );
  if (routeMatch) {
    return {
      type: routeMatch[1] as PromptSeoPageType,
      slug: decodeURIComponent(routeMatch[2])
    };
  }

  return PROMPT_SEO_ALIASES.find(
    (alias) =>
      alias.target &&
      (normalizePromptNavPath(alias.path) === normalizedPath ||
        normalizePromptNavPath(alias.canonicalPath) === normalizedPath)
  )?.target;
}

function countPromptCasesForTarget(
  cases: PromptCase[],
  target: PromptSeoAliasTarget,
  modelSlug = ''
): number {
  return cases.filter((caseItem) => {
    if (modelSlug && !promptSeoCaseMatches(caseItem, 'model', modelSlug)) {
      return false;
    }
    return promptCaseMatchesScopedTarget(caseItem, target);
  }).length;
}

function compactPromptCaseToken(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
}

function promptLibraryFacetsToCountMap(
  facets: Array<{ slug: string; count: number }>
): PromptCaseCountMap {
  return facets.reduce<PromptCaseCountMap>((counts, item) => {
    counts[item.slug] = item.count;
    return counts;
  }, {});
}

function promptCaseMatchesScopedTarget(
  caseItem: PromptCase,
  target: PromptSeoAliasTarget
): boolean {
  if (target.type === 'package') {
    const compactSlug = compactPromptCaseToken(target.slug);
    const packageSlug = compactPromptCaseToken(caseItem.packageSlug);
    const legacyPackageSlug = compactPromptCaseToken(
      (caseItem as { package_slug?: unknown }).package_slug
    );
    return packageSlug === compactSlug || legacyPackageSlug === compactSlug;
  }

  if (target.type !== 'category') {
    return promptSeoCaseMatches(caseItem, target.type, target.slug);
  }

  return promptSeoCaseMatches(caseItem, 'category', target.slug);
}

function getPromptPageHref(
  locale: 'zh-CN' | 'en-US',
  type: PromptSeoPageType,
  slug: string
): string {
  const page = getPromptSeoPage(type, slug);
  if (locale === 'en-US' && page) {
    return getPromptSeoDisplayPath(page);
  }
  return `/${locale}/prompts/${type}/${slug}`;
}

function withPromptCaseSort(
  href: string,
  sort: 'featured' | 'latest' | 'hot'
): string {
  return withPromptQueryParams(href, { sort });
}

function withPromptCaseFilter(href: string, filter: 'featured'): string {
  return withPromptQueryParams(href, { filter });
}

function withPromptScopedTarget(
  href: string,
  target: PromptSeoAliasTarget,
  options: { useLabel?: boolean } = {}
): string {
  if (target.type !== 'category' && target.type !== 'package') return href;
  const key =
    target.type === 'package'
      ? 'package'
      : options.useLabel
        ? 'label'
        : 'category';
  return withPromptQueryParams(href, { [key]: target.slug });
}

function withPromptQueryParams(
  href: string,
  params: Record<string, string | undefined>
): string {
  const [path, rawQuery = ''] = href.split('?');
  const searchParams = new URLSearchParams(rawQuery);
  Object.entries(params).forEach(([key, value]) => {
    const normalizedValue = value?.trim();
    if (normalizedValue) {
      searchParams.set(key, normalizedValue);
    } else {
      searchParams.delete(key);
    }
  });
  const query = searchParams.toString();
  return query ? `${path}?${query}` : path;
}

function getPromptGlobalNavGroups(
  locale: 'zh-CN' | 'en-US',
  isZh: boolean
): PromptGlobalNavGroup[] {
  const rootHref = locale === 'en-US' ? '/en-US/prompts' : '/zh-CN/prompts';
  const pageHref = (type: PromptSeoPageType, slug: string) =>
    getPromptPageHref(locale, type, slug);
  const scopedCategoryHref = (slug: string) =>
    `${rootHref}?category=${encodeURIComponent(slug)}`;

  if (isZh) {
    return [
      {
        title: '工作台',
        links: [
          { href: '/create', label: '创意工作台', description: '回到主入口' },
          { href: '/image', label: '图像生成' },
          { href: '/boards', label: '工作台 Boards' },
          { href: '/apps', label: '应用' }
        ]
      },
      {
        title: 'Prompt 专题',
        links: [
          { href: rootHref, label: '全部案例' },
          {
            href: pageHref('package', 'xiaohongshu-cover'),
            label: '小红书封面'
          },
          {
            href: pageHref('package', 'ecommerce-product-photo'),
            label: '电商主图'
          },
          {
            href: pageHref('package', 'wechat-cover-poster'),
            label: '公众号封面'
          },
          {
            href: pageHref('package', 'portrait-character-consistency'),
            label: '角色一致性'
          },
          {
            href: pageHref('package', 'storefront-marketing-kit'),
            label: '门店物料'
          }
        ]
      },
      {
        title: '模型',
        links: [
          { href: pageHref('model', 'gpt-image-2'), label: 'GPT Image 2' },
          { href: pageHref('model', 'nano-banana'), label: 'Nano Banana' },
          { href: pageHref('model', 'flux'), label: 'Flux' },
          {
            href: pageHref('model', 'midjourney-alternative'),
            label: 'Midjourney'
          },
          { href: pageHref('model', 'seedream'), label: 'Seedream' }
        ]
      },
      {
        title: '场景',
        links: [
          {
            href: scopedCategoryHref('portrait-photography'),
            label: '人像摄影'
          },
          { href: scopedCategoryHref('product-commercial'), label: '商品广告' },
          { href: scopedCategoryHref('poster-key-visual'), label: '海报 KV' },
          {
            href: scopedCategoryHref('social-cover-thumbnail'),
            label: '封面缩略图'
          },
          { href: scopedCategoryHref('character-design'), label: '角色设定' },
          { href: scopedCategoryHref('ui-infographic'), label: 'UI 信息图' },
          {
            href: scopedCategoryHref('interior-architecture'),
            label: '建筑空间'
          },
          {
            href: scopedCategoryHref('style-remix-reference'),
            label: '风格改写'
          },
          { href: scopedCategoryHref('video-motion'), label: '视频分镜' }
        ]
      }
    ];
  }

  return [
    {
      title: 'Workspace',
      links: [
        {
          href: '/create',
          label: 'Creative Studio',
          description: 'Main entry'
        },
        { href: '/image', label: 'Image generation' },
        { href: '/boards', label: 'Boards' },
        { href: '/apps', label: 'Apps' }
      ]
    },
    {
      title: 'Prompt Topics',
      links: [
        { href: rootHref, label: 'All prompts' },
        {
          href: pageHref('package', 'xiaohongshu-cover'),
          label: 'Social covers'
        },
        {
          href: pageHref('package', 'ecommerce-product-photo'),
          label: 'Product photos'
        },
        {
          href: pageHref('package', 'wechat-cover-poster'),
          label: 'Article covers'
        },
        {
          href: pageHref('package', 'portrait-character-consistency'),
          label: 'Character consistency'
        },
        {
          href: pageHref('package', 'storefront-marketing-kit'),
          label: 'Storefront kit'
        }
      ]
    },
    {
      title: 'Models',
      links: [
        { href: pageHref('model', 'gpt-image-2'), label: 'GPT Image 2' },
        { href: pageHref('model', 'nano-banana'), label: 'Nano Banana' },
        { href: pageHref('model', 'flux'), label: 'Flux' },
        {
          href: pageHref('model', 'midjourney-alternative'),
          label: 'Midjourney'
        },
        { href: pageHref('model', 'seedream'), label: 'Seedream' }
      ]
    },
    {
      title: 'Use Cases',
      links: [
        {
          href: scopedCategoryHref('portrait-photography'),
          label: 'Portrait photography'
        },
        {
          href: scopedCategoryHref('product-commercial'),
          label: 'Product ads'
        },
        {
          href: scopedCategoryHref('poster-key-visual'),
          label: 'Posters and KV'
        },
        {
          href: scopedCategoryHref('social-cover-thumbnail'),
          label: 'Covers and thumbnails'
        },
        {
          href: scopedCategoryHref('character-design'),
          label: 'Character design'
        },
        {
          href: scopedCategoryHref('ui-infographic'),
          label: 'UI and infographics'
        },
        {
          href: scopedCategoryHref('interior-architecture'),
          label: 'Spaces and interiors'
        },
        {
          href: scopedCategoryHref('style-remix-reference'),
          label: 'Style remix'
        },
        { href: scopedCategoryHref('video-motion'), label: 'Video motion' }
      ]
    }
  ];
}

function getRelatedSeoLinks(
  locale: 'zh-CN' | 'en-US',
  isZh: boolean,
  routeAlias: PromptSeoAlias | undefined,
  page: PromptSeoPage | undefined
): RelatedSeoLink[] {
  const isEnglish = locale === 'en-US';
  const link = (
    enPath: string,
    zhPath: string,
    enLabel: string,
    zhLabel: string
  ) => ({
    href: isEnglish ? enPath : zhPath,
    label: isZh ? zhLabel : enLabel
  });
  const hubLinks = [
    link(
      '/ai-image-prompt-generator',
      '/zh-CN/prompts',
      'AI Image Prompt Generator',
      'Prompt 生成器'
    ),
    link(
      '/gpt-image-2-prompts',
      '/zh-CN/prompts/model/gpt-image-2',
      'GPT Image 2 prompts',
      'GPT Image 2'
    ),
    link(
      '/nano-banana-prompts',
      '/zh-CN/prompts/model/nano-banana',
      'Nano Banana prompts',
      'Nano Banana'
    ),
    link(
      '/product-photography-prompts',
      '/zh-CN/prompts/category/product-images',
      'Product photography prompts',
      '商品摄影'
    ),
    link(
      '/portrait-prompts',
      '/zh-CN/prompts/category/ai-portrait',
      'AI portrait prompts',
      'AI 写真'
    ),
    link(
      '/character-design-prompts',
      '/zh-CN/prompts/category/character-consistency',
      'Character design prompts',
      '角色设计'
    )
  ];

  if (routeAlias?.canonicalPath === '/en-US/prompts') {
    return hubLinks;
  }

  if (routeAlias?.canonicalPath === '/ai-image-prompt-generator') {
    return [
      link(
        '/en-US/prompts',
        '/zh-CN/prompts',
        'AI Image Prompts',
        'Prompt 案例库'
      ),
      link(
        '/en-US/blog/image-to-prompt-generator-workflow',
        '/zh-CN/blog/image-to-prompt-generator-workflow',
        'Image to prompt tutorial',
        '图片转 Prompt 教程'
      ),
      link(
        '/en-US/blog/ai-tool-credit-budget',
        '/zh-CN/blog/ai-tool-credit-budget',
        'AI tool credit budget',
        'AI 工具积分预算'
      ),
      link(
        '/image-to-prompt-generator',
        '/zh-CN/prompts',
        'Image to prompt',
        '图片转 Prompt'
      ),
      link(
        '/reference-image-to-prompt-generator',
        '/zh-CN/prompts',
        'Reference image to prompt',
        '参考图转 Prompt'
      ),
      link(
        '/product-photography-prompts',
        '/zh-CN/prompts/category/product-images',
        'Product photography prompts',
        '商品摄影'
      ),
      link(
        '/portrait-prompts',
        '/zh-CN/prompts/category/ai-portrait',
        'AI portrait prompts',
        'AI 写真'
      )
    ];
  }

  if (page?.type === 'model' && page.slug === 'gpt-image-2') {
    return [
      link(
        '/en-US/prompts',
        '/zh-CN/prompts',
        'AI Image Prompts',
        'Prompt 案例库'
      ),
      link(
        '/portrait-prompts',
        '/zh-CN/prompts/category/ai-portrait',
        'AI portrait prompts',
        'AI 写真'
      ),
      link(
        '/sref-prompts',
        '/zh-CN/prompts/category/sref-prompts',
        'SREF prompts',
        'SREF 风格参考'
      ),
      link(
        '/product-photography-prompts',
        '/zh-CN/prompts/category/product-images',
        'Product photography prompts',
        '商品摄影'
      ),
      link(
        '/ai-image-prompt-generator',
        '/ai-image-prompt-generator',
        'AI Image Prompt Generator',
        'Prompt 生成器'
      )
    ];
  }

  if (page) {
    const directLinks = (page.relatedLinks || []).map((item) => ({
      href: `/${locale}${item.path}`,
      label: text(item.title, isZh)
    }));
    return [
      ...directLinks,
      link(
        '/en-US/prompts',
        '/zh-CN/prompts',
        'AI Image Prompts',
        'Prompt 案例库'
      ),
      link(
        '/ai-image-prompt-generator',
        '/zh-CN/prompts',
        'AI Image Prompt Generator',
        'Prompt 生成器'
      )
    ];
  }

  return [];
}

async function getFallbackPromptCases(
  page: PromptSeoAliasTarget | PromptSeoPage | undefined,
  locale: 'zh-CN' | 'en-US'
): Promise<PromptCase[]> {
  if (page) {
    if (isSrefSeoPage(page) && locale === 'zh-CN') return [];

    const localeCases = await getPublicPromptCases(
      PROMPT_BROWSER_INITIAL_CASE_FETCH_LIMIT,
      getPromptCaseRequestOptions(page, locale)
    );
    const matchedLocaleCases = localeCases.filter((caseItem) =>
      promptCaseMatchesPage(caseItem, page)
    );
    if (matchedLocaleCases.length > 0) {
      return matchedLocaleCases;
    }

    const staticLocaleCases = getStaticPromptSeoCases(page, locale);
    if (staticLocaleCases.length > 0 || locale === 'zh-CN') {
      return staticLocaleCases;
    }

    const zhCases = await getPublicPromptCases(
      PROMPT_BROWSER_INITIAL_CASE_FETCH_LIMIT,
      {
        locale: 'zh-CN',
        requireImage: true
      }
    );
    const matchedZhCases = zhCases.filter((caseItem) =>
      promptCaseMatchesPage(caseItem, page)
    );
    if (matchedZhCases.length > 0) return matchedZhCases;

    return getStaticPromptSeoCases(page, 'zh-CN');
  }

  const localeCases = await getPublicPromptCases(
    PROMPT_BROWSER_INITIAL_CASE_FETCH_LIMIT,
    { locale }
  );
  if (localeCases.length > 0 || locale === 'zh-CN') return localeCases;

  return getPublicPromptCases(PROMPT_BROWSER_INITIAL_CASE_FETCH_LIMIT, {
    locale: 'zh-CN',
    requireImage: true
  });
}

function getStaticPromptSeoCases(
  page: PromptSeoAliasTarget | PromptSeoPage,
  locale: 'zh-CN' | 'en-US'
): PromptCase[] {
  return getPromptSeoPublicCases({
    kind: page.type,
    slug: page.slug,
    locale,
    limit: PROMPT_BROWSER_FOCUSED_INITIAL_LIMIT
  })
    .filter((caseItem) => Boolean(caseItem.imageUrl))
    .map((caseItem, index) => ({
      id: `static-seo-${caseItem.locale}-${caseItem.slug}`,
      imageUrl: caseItem.imageUrl || '',
      imageUrls: caseItem.imageUrl ? [caseItem.imageUrl] : [],
      title: caseItem.title,
      slug: caseItem.slug,
      category: caseItem.category,
      tags: caseItem.tags,
      model: caseItem.model,
      locale: caseItem.locale,
      packageSlug: caseItem.packageSlug,
      commercialIntent: caseItem.commercialIntent,
      promptPreview: caseItem.promptPreview,
      prompt:
        caseItem.promptPreview ||
        caseItem.commercialIntent ||
        [caseItem.model, caseItem.category].filter(Boolean).join(' '),
      featured: true,
      memberOnly: false,
      promptLocked: false,
      viewCount: 0,
      copyCount: 0,
      generateCount: 0,
      sortOrder: index,
      isPublished: true,
      createdAt: '2026-06-25T00:00:00.000Z',
      updatedAt: '2026-06-25T00:00:00.000Z'
    }));
}

export function getPromptBrowserMasonryColumnOptions(width: number) {
  return {
    minColumnWidth:
      width >= 2200 ? 210 : width >= 1040 ? 180 : width >= 760 ? 160 : 156,
    gap: width <= 520 ? 10 : width <= 820 ? 12 : 18,
    minColumns: width <= 360 ? 1 : 2,
    maxColumns: width >= 2200 ? 9 : width >= 1600 ? 8 : 6
  };
}

function getInitialPromptBrowserColumnCount(): number {
  if (typeof window === 'undefined') return 5;
  const viewportWidth = window.innerWidth || 0;
  if (viewportWidth <= 0) return 5;
  const estimatedContentWidth =
    viewportWidth <= 760
      ? Math.min(viewportWidth - 32, 1120)
      : viewportWidth <= 1120
        ? Math.min(viewportWidth - 32, viewportWidth - 244 - 32)
        : Math.min(2280, viewportWidth - 220 - 64);
  const width = Math.max(0, estimatedContentWidth);
  return getResponsiveMasonryColumnCount(
    width,
    getPromptBrowserMasonryColumnOptions(width)
  );
}

interface PromptSeoLandingPageProps {
  workspaceMode?: boolean;
}

export function PromptSeoLandingPage({
  workspaceMode = false
}: PromptSeoLandingPageProps = {}) {
  const marketingLocale = useMarketingLocale();
  const location = useLocation();
  const navigate = useNavigate();
  const { getAccessToken, isAuthenticated, user } = useAuth();
  const isVideoPromptHub = location.pathname === '/zh-CN/video-prompts';
  const routeAlias = getRouteAlias(location.pathname);
  const locale =
    routeAlias && !location.pathname.startsWith('/zh-CN')
      ? 'en-US'
      : marketingLocale.locale;
  const isZh = locale === 'zh-CN';
  const routeType = useRouteType(location.pathname);
  const { slug } = useParams();
  const aliasPage = routeAlias?.target
    ? getPromptSeoPage(routeAlias.target.type, routeAlias.target.slug)
    : undefined;
  const currentPage = aliasPage || getRoutePage(routeType, slug);
  const promptCaseTarget = currentPage || routeAlias?.caseTarget;
  const richAlias = currentPage ? undefined : routeAlias;
  const richSeoContent =
    currentPage || (hasRichAliasContent(richAlias) ? richAlias : undefined);
  const hasRichSeoContent = Boolean(currentPage || richSeoContent);
  const currentPath = `${location.pathname}${location.search}${location.hash}`;
  const promptCaseSearchParams = useMemo(
    () => new URLSearchParams(location.search),
    [location.search]
  );
  useEffect(() => {
    const normalizedSearch = normalizePromptLibrarySearch(location.search);
    if (normalizedSearch === location.search) return;
    navigate(`${location.pathname}${normalizedSearch}${location.hash}`, {
      replace: true,
      state: location.state
    });
  }, [
    location.hash,
    location.pathname,
    location.search,
    location.state,
    navigate
  ]);
  const promptLibraryLegacyEnabled =
    promptCaseSearchParams.get('promptLibraryLegacy') === '1' ||
    promptCaseSearchParams.get('promptLibraryV2') === '0';
  const promptLibraryV2Enabled = !promptLibraryLegacyEnabled;
  const activePromptSearchQuery = promptCaseSearchParams.get('q')?.trim() || '';
  const isFavoritesPromptView =
    promptCaseSearchParams.get('view')?.trim() === 'favorites';
  const activePromptSort = promptCaseSearchParams.get('sort')?.trim() || '';
  const activePromptFilter =
    promptCaseSearchParams.get('filter') === 'featured'
      ? 'featured'
      : activePromptSort === 'featured' ||
          activePromptSort === 'latest' ||
          activePromptSort === 'hot'
        ? activePromptSort
        : 'all';
  const activePromptCategorySlug =
    promptCaseSearchParams.get('label')?.trim() ||
    promptCaseSearchParams.get('category')?.trim() ||
    (isVideoPromptHub ? 'video-motion' : '');
  const activePromptPackageSlug =
    promptCaseSearchParams.get('package')?.trim() || '';
  const activePromptScopedTarget = useMemo<
    PromptSeoAliasTarget | undefined
  >(() => {
    if (activePromptCategorySlug) {
      return { type: 'category', slug: activePromptCategorySlug };
    }
    if (activePromptPackageSlug) {
      return { type: 'package', slug: activePromptPackageSlug };
    }
    return undefined;
  }, [activePromptCategorySlug, activePromptPackageSlug]);
  const [promptCases, setPromptCases] = useState<PromptCase[]>([]);
  const [promptCaseStats, setPromptCaseStats] = useState<PromptBrowserStats>({
    navigationTotal: null,
    modelCounts: {},
    categoryCounts: {}
  });
  const [navigationPromptCases, setNavigationPromptCases] = useState<
    PromptCase[]
  >([]);
  const [navigationPromptCaseLoadState, setNavigationPromptCaseLoadState] =
    useState<PromptCaseLoadState>('loading');
  const [promptCaseLoadState, setPromptCaseLoadState] =
    useState<PromptCaseLoadState>('loading');
  const [promptCaseVisibleLimit, setPromptCaseVisibleLimit] = useState(() =>
    promptLibraryV2Enabled
      ? PROMPT_BROWSER_INITIAL_VISIBLE_LIMIT
      : promptCaseTarget
        ? PROMPT_BROWSER_FOCUSED_INITIAL_LIMIT
        : PROMPT_BROWSER_ROOT_INITIAL_LIMIT
  );
  const [previewCase, setPreviewCase] = useState<PromptCase | null>(null);
  const [previewActiveRecipeAssetId, setPreviewActiveRecipeAssetId] = useState<
    string | null
  >(null);
  const [previewImageIndex, setPreviewImageIndex] = useState(0);
  const [previewLightboxOpen, setPreviewLightboxOpen] = useState(false);
  const [copyToastText, setCopyToastText] = useState('');
  const [copiedShareUrl, setCopiedShareUrl] = useState(false);
  const [publicRecipeAssets, setPublicRecipeAssets] = useState<
    ImagePromptAsset[]
  >(getLocalPublicImagePromptAssets);
  const { favoriteIds, isFavorited, toggleFavorite } = usePromptCaseFavorites();
  const copyToastTimerRef = useRef<number | null>(null);
  const shareCopyTimerRef = useRef<number | null>(null);
  const promptPreviewViewKeyRef = useRef('');
  const promptPreviewLocaleAttemptsRef = useRef(new Set<string>());
  const promptPreviewLocaleFailuresRef = useRef(new Set<string>());
  const closingPromptPreviewRef = useRef(false);
  const promptBrowserMasonryRef = useRef<HTMLElement | null>(null);
  const promptCaseLoadMoreRef = useRef<HTMLDivElement | null>(null);
  const promptBrowserUserScrolledRef = useRef(false);
  const promptCaseRemoteLoadMorePendingRef = useRef(false);
  const [promptBrowserColumnCount, setPromptBrowserColumnCount] = useState(
    getInitialPromptBrowserColumnCount
  );
  const [promptCaseAspectRatios, setPromptCaseAspectRatios] = useState<
    Record<string, string>
  >({});
  const [favoritePromptCases, setFavoritePromptCases] = useState<PromptCase[]>(
    []
  );
  const [favoritePromptCaseLoadState, setFavoritePromptCaseLoadState] =
    useState<PromptCaseLoadState>('ready');
  const promptLibraryModelSlug =
    promptCaseTarget?.type === 'model'
      ? promptCaseTarget.slug
      : workspaceMode
        ? promptCaseSearchParams.get('model')?.trim() || ''
        : '';
  const promptLibraryLabelSlug = isVideoPromptHub
    ? 'video-motion'
    : promptCaseTarget?.type === 'category'
      ? promptCaseTarget.slug
      : '';
  const promptLibraryQuery = usePromptLibraryQuery({
    locale,
    modelSlug: promptLibraryModelSlug,
    labelSlug: promptLibraryLabelSlug,
    mediaType: isVideoPromptHub ? 'video' : undefined,
    seoOnly: isVideoPromptHub,
    defaultLimit: isVideoPromptHub ? 100 : undefined
  });
  const promptLibraryBootstrap = useMemo(
    () => readPromptLibraryBootstrap(document, promptLibraryQuery),
    [promptLibraryQuery]
  );
  const promptLibraryCasesState = usePromptLibraryCases(promptLibraryQuery, {
    requireImage: true,
    enabled: promptLibraryV2Enabled,
    initialData: promptLibraryBootstrap
  });
  const promptLibraryCases =
    promptLibraryCasesState.data?.items || EMPTY_PROMPT_CASES;
  const isVideoPromptHubIndexable =
    isVideoPromptHub &&
    hasVideoPromptHubPublishingThreshold(promptLibraryCases);
  const promptLibraryStats = useMemo<PromptBrowserStats>(
    () =>
      promptLibraryCasesState.data
        ? {
            navigationTotal: promptLibraryCasesState.data.total,
            modelCounts: promptLibraryFacetsToCountMap(
              promptLibraryCasesState.data.facets.models
            ),
            categoryCounts: promptLibraryFacetsToCountMap(
              promptLibraryCasesState.data.facets.labels
            )
          }
        : {
            navigationTotal: null,
            modelCounts: {},
            categoryCounts: {}
          },
    [promptLibraryCasesState.data]
  );
  const activePromptCases = promptLibraryV2Enabled
    ? promptLibraryCases
    : promptCases;
  const activePromptCaseStats = promptLibraryV2Enabled
    ? promptLibraryStats
    : promptCaseStats;
  const activePromptCaseLoadState = promptLibraryV2Enabled
    ? promptLibraryCasesState.loadState
    : promptCaseLoadState;
  const promptCasePreviewId =
    promptCaseSearchParams.get('caseId') || promptCaseSearchParams.get('case');
  const promptCasePreviewSlug =
    promptCaseSearchParams.get('caseSlug') ||
    (!promptCasePreviewId ? promptCaseSearchParams.get('case') : '');
  const promptCasePreviewQueryKey =
    promptCasePreviewId || promptCasePreviewSlug
      ? `${promptCasePreviewId || ''}:${promptCasePreviewSlug || ''}`
      : '';
  const hasPromptCasePreviewQuery = Boolean(
    promptCasePreviewId || promptCasePreviewSlug
  );
  const previewCaseImages = useMemo(
    () => getPromptCaseImages(previewCase),
    [previewCase]
  );
  const activePreviewImageIndex = Math.min(
    previewImageIndex,
    Math.max(0, previewCaseImages.length - 1)
  );
  const activePreviewImage =
    previewCaseImages[activePreviewImageIndex] ||
    (previewCase ? getPromptCaseCover(previewCase) : '');
  const activePreviewVideo = getPromptCasePrimaryVideoUrl(previewCase);
  const isActivePreviewVideo =
    Boolean(activePreviewVideo) && isPromptCaseVideo(previewCase);
  const previewVisualRecipeSelection =
    useMemo<ImagePromptSelection | null>(() => {
      if (!previewCase) return null;
      const configuredSelection = normalizeVisualRecipeSelection(
        (previewCase as PromptCase & { visualRecipe?: unknown }).visualRecipe
      );
      const inferredSelection = inferVisualRecipeSelectionFromPromptText(
        buildPromptTextForVisualRecipe(previewCase)
      );
      return mergeVisualRecipeSelections(
        configuredSelection,
        inferredSelection
      );
    }, [previewCase]);
  const previewVisualRecipeCards = useMemo<ResolvedVisualRecipeAsset[]>(
    () =>
      previewVisualRecipeSelection
        ? resolveVisualRecipeAssets(
            previewVisualRecipeSelection,
            publicRecipeAssets
          )
        : [],
    [previewVisualRecipeSelection, publicRecipeAssets]
  );
  const previewVisualRecipeSlots = useMemo(
    () =>
      previewVisualRecipeSelection
        ? imagePromptSlots
            .filter((slot) => {
              const selectedValue = previewVisualRecipeSelection[slot.id];
              return Array.isArray(selectedValue)
                ? selectedValue.length > 0
                : Boolean(selectedValue);
            })
            .map((slot) => slot.id)
        : [],
    [previewVisualRecipeSelection]
  );
  const pageItems = PROMPT_SEO_PAGES.filter((item) =>
    currentPage ? item.type === currentPage.type : true
  );
  const title = routeAlias
    ? text(routeAlias.title, isZh)
    : currentPage
      ? text(currentPage.title, isZh)
      : isVideoPromptHub
        ? 'AI 视频 Prompt 案例与分镜模板'
        : isZh
          ? 'AI 图片 Prompt 案例库'
          : 'Free AI Image Prompts Library';
  const subtitle = routeAlias
    ? text(routeAlias.description, isZh)
    : currentPage
      ? text(currentPage.description, isZh)
      : isVideoPromptHub
        ? '按模型、动作、运镜和商业场景浏览经过审核的视频 Prompt，并查看真实视频结果。'
        : isZh
          ? '按模型和场景筛选可复用案例，复制 Prompt 后直接进入创作。'
          : 'Filter reusable prompt cases by model and use case, then copy or generate.';
  const promptCaseTargetKey = promptCaseTarget
    ? `${promptCaseTarget.type}:${promptCaseTarget.slug}`
    : 'all';
  const promptCaseScopedTargetKey = activePromptScopedTarget
    ? `${activePromptScopedTarget.type}:${activePromptScopedTarget.slug}`
    : 'all';
  const promptCaseInitialVisibleLimit = promptLibraryV2Enabled
    ? PROMPT_BROWSER_INITIAL_VISIBLE_LIMIT
    : promptCaseTarget
      ? PROMPT_BROWSER_FOCUSED_INITIAL_LIMIT
      : PROMPT_BROWSER_ROOT_INITIAL_LIMIT;
  const sortedPromptCases = useMemo(() => {
    if (isFavoritesPromptView) {
      const coveredFavoriteCases = favoritePromptCases.filter((caseItem) =>
        Boolean(getPromptCaseCover(caseItem))
      );
      return activePromptSearchQuery
        ? coveredFavoriteCases.filter((caseItem) =>
            promptCaseMatchesSearch(caseItem, activePromptSearchQuery, locale)
          )
        : coveredFavoriteCases;
    }

    if (promptLibraryV2Enabled) {
      return activePromptCases.filter((caseItem) =>
        Boolean(getPromptCaseCover(caseItem))
      );
    }

    const matchedCases = activePromptCases.filter((caseItem) => {
      if (!promptCaseMatchesPage(caseItem, promptCaseTarget)) return false;
      if (!activePromptScopedTarget) return true;
      return promptCaseMatchesScopedTarget(caseItem, activePromptScopedTarget);
    });
    const filteredCases =
      activePromptFilter === 'featured'
        ? matchedCases.filter(isFeaturedPromptCase)
        : matchedCases;
    const searchedCases = activePromptSearchQuery
      ? filteredCases.filter((caseItem) =>
          promptCaseMatchesSearch(caseItem, activePromptSearchQuery, locale)
        )
      : filteredCases;
    return sortPromptCasesForBrowser(
      searchedCases.filter((caseItem) => Boolean(getPromptCaseCover(caseItem)))
    );
  }, [
    isFavoritesPromptView,
    favoritePromptCases,
    activePromptSearchQuery,
    locale,
    promptLibraryV2Enabled,
    activePromptCases,
    promptCaseTarget,
    activePromptScopedTarget,
    activePromptFilter
  ]);
  const visiblePromptCases = useMemo(
    () => sortedPromptCases.slice(0, promptCaseVisibleLimit),
    [sortedPromptCases, promptCaseVisibleLimit]
  );
  const visiblePromptCaseColumns = useMemo(() => {
    const masonryItems: PromptLibraryMasonryItem[] = visiblePromptCases.map(
      (caseItem, index) => ({ caseItem, index })
    );
    return splitMasonryColumns(
      masonryItems,
      promptBrowserColumnCount,
      ({ caseItem, index }) =>
        cssAspectRatioToHeightWeight(
          promptCaseAspectRatios[caseItem.id] ||
            getPromptCaseCardAspectRatio(caseItem, index)
        )
    );
  }, [visiblePromptCases, promptBrowserColumnCount, promptCaseAspectRatios]);
  const priorityPromptCasePreloadImages = useMemo(() => {
    const preloadItems = visiblePromptCaseColumns
      .flatMap((column) => (column[0] ? [column[0].caseItem] : []))
      .map((caseItem) => {
        const cover = getPromptCaseCover(caseItem);
        if (!cover) return null;
        return {
          href: getOptimizedPromptCaseImageUrl(cover, {
            width: 520,
            quality: 72
          }),
          srcSet: getPromptCaseResponsiveImageSet(
            cover,
            PROMPT_BROWSER_PRELOAD_IMAGE_WIDTHS
          )
        };
      })
      .filter(Boolean) as Array<{ href: string; srcSet: string }>;
    const seen = new Set<string>();
    return preloadItems.filter((item) => {
      if (seen.has(item.href)) return false;
      seen.add(item.href);
      return true;
    });
  }, [visiblePromptCaseColumns]);
  const handlePromptCaseAspectRatioChange = useCallback(
    (caseId: string, aspectRatio: string) => {
      setPromptCaseAspectRatios((current) =>
        current[caseId] === aspectRatio
          ? current
          : {
              ...current,
              [caseId]: aspectRatio
            }
      );
    },
    []
  );
  const hasHiddenPromptCases =
    visiblePromptCases.length < sortedPromptCases.length;
  const hasMorePromptCases = promptLibraryV2Enabled
    ? isFavoritesPromptView
      ? false
      : hasHiddenPromptCases || promptLibraryCasesState.hasMore
    : hasHiddenPromptCases;
  const promptCaseDisplayTotal = isFavoritesPromptView
    ? favoritePromptCases.length
    : promptLibraryV2Enabled && promptLibraryCasesState.data
      ? promptLibraryCasesState.data.total
      : sortedPromptCases.length;
  const effectivePromptCaseLoadState = isFavoritesPromptView
    ? favoritePromptCaseLoadState
    : activePromptCaseLoadState;
  const previewActiveRecipeAsset = useMemo(
    () =>
      previewVisualRecipeCards.find(
        ({ asset }) => asset.id === previewActiveRecipeAssetId
      ) || null,
    [previewActiveRecipeAssetId, previewVisualRecipeCards]
  );
  const previewRelatedRecipeCases = previewActiveRecipeAssetId
    ? findPromptCasesSharingRecipeAssets(
        sortedPromptCases,
        [previewActiveRecipeAssetId],
        {
          currentCaseId: previewCase?.id,
          limit: 4,
          getCaseAssetIds: getPromptCaseRecipeAssetIdsForSeo
        }
      )
    : [];
  const previewRelatedRecipeCaseIds = new Set(
    previewRelatedRecipeCases.map((match) => match.caseItem.id)
  );
  const previewRecipeFallbackCases = sortedPromptCases
    .filter(
      (caseItem) =>
        caseItem.id !== previewCase?.id &&
        !caseItem.sourceCaseId &&
        !previewRelatedRecipeCaseIds.has(caseItem.id)
    )
    .slice(0, 4);
  const previewMorePromptCases = sortedPromptCases
    .filter(
      (caseItem) =>
        caseItem.id !== previewCase?.id &&
        !previewRelatedRecipeCaseIds.has(caseItem.id) &&
        !caseItem.sourceCaseId
    )
    .slice(0, 6);
  function loadMorePromptCases() {
    if (!hasMorePromptCases) return;
    if (promptLibraryCasesState.isRefreshing) return;
    if (promptLibraryV2Enabled) {
      if (hasHiddenPromptCases) {
        setPromptCaseVisibleLimit((current) =>
          Math.min(
            current + PROMPT_BROWSER_CASE_PAGE_SIZE,
            sortedPromptCases.length
          )
        );
        return;
      }
      if (
        promptLibraryCasesState.isLoadingMore ||
        promptCaseRemoteLoadMorePendingRef.current
      ) {
        return;
      }
      promptCaseRemoteLoadMorePendingRef.current = true;
      promptLibraryCasesState.loadMore();
      return;
    }

    setPromptCaseVisibleLimit((current) =>
      Math.min(
        current + PROMPT_BROWSER_CASE_PAGE_SIZE,
        sortedPromptCases.length
      )
    );
  }
  const loadMorePromptCasesRef = useRef(loadMorePromptCases);
  useEffect(() => {
    loadMorePromptCasesRef.current = loadMorePromptCases;
  });
  useEffect(() => {
    if (!promptLibraryCasesState.isLoadingMore) {
      promptCaseRemoteLoadMorePendingRef.current = false;
    }
  }, [promptLibraryCasesState.isLoadingMore]);
  useEffect(() => {
    let cancelled = false;
    promptBrowserUserScrolledRef.current = false;
    queueMicrotask(() => {
      if (!cancelled) setPromptCaseVisibleLimit(promptCaseInitialVisibleLimit);
    });
    return () => {
      cancelled = true;
    };
  }, [
    activePromptFilter,
    activePromptSearchQuery,
    promptCaseInitialVisibleLimit,
    promptCaseScopedTargetKey,
    promptCaseTargetKey
  ]);
  useEffect(() => {
    const node = promptBrowserMasonryRef.current;
    if (!node) return undefined;

    const updateColumnCount = () => {
      const width = node.getBoundingClientRect().width;
      setPromptBrowserColumnCount((current) => {
        const next = getResponsiveMasonryColumnCount(
          width,
          getPromptBrowserMasonryColumnOptions(width)
        );
        return current === next ? current : next;
      });
    };

    updateColumnCount();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateColumnCount);
      return () => window.removeEventListener('resize', updateColumnCount);
    }

    const observer = new ResizeObserver(updateColumnCount);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (priorityPromptCasePreloadImages.length === 0) return undefined;

    const links = priorityPromptCasePreloadImages.map((item) => {
      const link = document.createElement('link');
      link.rel = 'preload';
      link.as = 'image';
      link.href = item.href;
      link.setAttribute('imagesrcset', item.srcSet);
      link.setAttribute('imagesizes', PROMPT_BROWSER_CASE_IMAGE_SIZES);
      link.setAttribute('fetchpriority', 'high');
      link.setAttribute('data-prompt-browser-preload', '1');
      document.head.appendChild(link);
      return link;
    });

    return () => {
      links.forEach((link) => link.remove());
    };
  }, [priorityPromptCasePreloadImages]);
  useEffect(() => {
    if (!hasMorePromptCases) return undefined;

    let frameId = 0;
    const node = promptCaseLoadMoreRef.current;
    if (!node) return undefined;

    const scrollContainer = getPromptBrowserScrollContainer(node);
    const shouldLoadMoreFromScroll = () => {
      const sentinel = promptCaseLoadMoreRef.current;
      if (!sentinel) return;
      const viewportHeight = getPromptBrowserViewportHeight(scrollContainer);
      const sentinelTop = getPromptBrowserSentinelTop(
        sentinel,
        scrollContainer
      );
      if (
        shouldAutoLoadPromptCases({
          hasUserScrolled: promptBrowserUserScrolledRef.current,
          scrollOffset: getPromptBrowserScrollOffset(scrollContainer),
          sentinelTop,
          viewportHeight,
          margin: PROMPT_BROWSER_AUTO_LOAD_MARGIN_PX
        })
      ) {
        loadMorePromptCasesRef.current();
      }
    };
    const scheduleScrollCheck = () => {
      if (
        !promptBrowserUserScrolledRef.current &&
        getPromptBrowserScrollOffset(scrollContainer) <= 0
      ) {
        return;
      }
      if (frameId) return;
      frameId = window.requestAnimationFrame(() => {
        frameId = 0;
        shouldLoadMoreFromScroll();
      });
    };
    const handleScroll = () => {
      promptBrowserUserScrolledRef.current = true;
      scheduleScrollCheck();
    };

    const scrollTarget: HTMLElement | Window = scrollContainer || window;
    scrollTarget.addEventListener('scroll', handleScroll, {
      passive: true
    });
    window.addEventListener('resize', scheduleScrollCheck);
    const observer =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver(
            (entries) => {
              if (
                !promptBrowserUserScrolledRef.current &&
                getPromptBrowserScrollOffset(scrollContainer) <= 0
              ) {
                return;
              }
              if (!entries.some((entry) => entry.isIntersecting)) return;
              scheduleScrollCheck();
            },
            {
              root: scrollContainer,
              rootMargin: `${PROMPT_BROWSER_AUTO_LOAD_MARGIN_PX}px 0px`
            }
          );
    observer?.observe(node);
    scheduleScrollCheck();
    return () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
      scrollTarget.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', scheduleScrollCheck);
      observer?.disconnect();
    };
  }, [
    hasMorePromptCases,
    promptLibraryCasesState.isRefreshing,
    promptLibraryCasesState.isLoadingMore,
    sortedPromptCases.length,
    visiblePromptCases.length
  ]);
  const previewCaseIndex = previewCase
    ? visiblePromptCases.findIndex((caseItem) => caseItem.id === previewCase.id)
    : -1;
  const canNavigatePreviewCases =
    previewCaseIndex >= 0 && visiblePromptCases.length > 1;
  const canNavigatePreviewImages = previewCaseImages.length > 1;
  const promptGlobalNavGroups = useMemo(
    () => getPromptGlobalNavGroups(locale, isZh),
    [isZh, locale]
  );
  const activePromptNavPath = normalizePromptNavPath(
    routeAlias
      ? routeAlias.canonicalPath
      : currentPage
        ? getPromptSeoPath(currentPage)
        : '/prompts'
  );
  const shouldShowStyleGridCta =
    locale === 'en-US' &&
    STYLE_GRID_CTA_PATHS.has(
      routeAlias?.canonicalPath || stripLocale(location.pathname)
    );
  const rootPromptHref = workspaceMode
    ? `/${locale}/prompts`
    : locale === 'en-US'
      ? '/en-US/prompts'
      : '/zh-CN/prompts';
  const showPromptAdmin =
    user?.email?.trim().toLowerCase() === 'admin@example.com';
  const promptCaseAdminHref = `/${locale}/prompts/admin`;
  const shouldRedirectPromptCaseAdmin =
    promptCaseSearchParams.get('managePromptCases') === '1';
  const promptCasesForNavigation =
    promptCaseTarget?.type === 'package' && navigationPromptCases.length > 0
      ? navigationPromptCases
      : activePromptCases;
  const isUsingGlobalPromptCasesForNavigation =
    promptCaseTarget?.type === 'package' && navigationPromptCases.length > 0;
  const isPromptCaseNavigationLoading =
    promptCaseTarget?.type === 'package' &&
    navigationPromptCaseLoadState === 'loading' &&
    navigationPromptCases.length === 0;
  const countCasesByPage = (type: PromptSeoPageType, slug: string): number =>
    countPromptCasesForTarget(promptCasesForNavigation, { type, slug });
  const getPromptModelCount = (slug: string): number => {
    const aliases = PROMPT_MODEL_COUNT_ALIASES[slug] || [slug];
    const canonicalCount = activePromptCaseStats.modelCounts[slug];
    const rpcCount = Number.isFinite(canonicalCount)
      ? Number(canonicalCount)
      : aliases.reduce((sum, alias) => {
          const count = activePromptCaseStats.modelCounts[alias];
          return sum + (Number.isFinite(count) ? count : 0);
        }, 0);
    if (!isUsingGlobalPromptCasesForNavigation && rpcCount > 0) {
      return rpcCount;
    }
    return countCasesByPage('model', slug);
  };
  const hasPromptCategoryStats =
    !isUsingGlobalPromptCasesForNavigation &&
    Object.values(activePromptCaseStats.categoryCounts).some(
      (count) => Number(count) > 0
    );
  const getPromptCategoryCount = (
    target: PromptSeoAliasTarget,
    modelSlug = ''
  ): number => {
    if (target.type === 'category') {
      const count = activePromptCaseStats.categoryCounts[target.slug];
      if (Number.isFinite(count)) return count;
    }
    if (!modelSlug && target.type === 'package') {
      const count = activePromptCaseStats.categoryCounts[target.slug];
      if (Number.isFinite(count)) return count;
    }
    return countPromptCasesForTarget(
      promptCasesForNavigation,
      target,
      modelSlug
    );
  };
  const promptNavigationTotal =
    !isUsingGlobalPromptCasesForNavigation &&
    activePromptCaseStats.navigationTotal !== null &&
    activePromptCaseStats.navigationTotal > 0
      ? activePromptCaseStats.navigationTotal
      : promptCasesForNavigation.length;
  const promptModelFacetTotal = Object.values(
    activePromptCaseStats.modelCounts
  ).reduce((sum, count) => {
    const value = Number(count);
    return Number.isFinite(value) && value > 0 ? sum + value : sum;
  }, 0);
  const promptAllModelsTotal =
    promptLibraryV2Enabled && promptModelFacetTotal > 0
      ? promptModelFacetTotal
      : promptNavigationTotal;
  const isPromptCaseLoading = activePromptCaseLoadState === 'loading';
  const promptModelNavItems = [
    { slug: 'gpt-image-2', label: 'GPT Image 2' },
    { slug: 'nano-banana', label: 'Nano Banana' },
    { slug: 'flux', label: 'Flux' },
    {
      slug: 'midjourney-alternative',
      label: 'Midjourney'
    },
    { slug: 'seedream', label: 'Seedream' },
    { slug: 'seedance-2-0', label: 'Seedance 2.0' }
  ];
  const activeModelSlug = promptLibraryModelSlug;
  const allPromptCasesHref = activeModelSlug
    ? workspaceMode
      ? withPromptQueryParams(rootPromptHref, { model: activeModelSlug })
      : getPromptPageHref(locale, 'model', activeModelSlug)
    : rootPromptHref;
  const allPromptModelsHref =
    promptLibraryV2Enabled && activePromptScopedTarget
      ? withPromptScopedTarget(rootPromptHref, activePromptScopedTarget, {
          useLabel: true
        })
      : rootPromptHref;
  const scopedAllPromptModelsHref = promptLibraryV2Enabled
    ? withPromptQueryParams(allPromptModelsHref, {
        q: activePromptSearchQuery || undefined,
        sort:
          activePromptFilter === 'latest' || activePromptFilter === 'hot'
            ? activePromptFilter
            : undefined
      })
    : allPromptModelsHref;
  const promptModelItems: PromptLibraryModelNavItem[] = [
    {
      key: 'all',
      label: 'ALL',
      count:
        isPromptCaseNavigationLoading || isPromptCaseLoading
          ? null
          : promptAllModelsTotal,
      href: scopedAllPromptModelsHref,
      active: !activeModelSlug && !isFavoritesPromptView
    },
    ...promptModelNavItems.map((item) => ({
      key: `model:${item.slug}`,
      label: item.label,
      count:
        isPromptCaseNavigationLoading || isPromptCaseLoading
          ? null
          : getPromptModelCount(item.slug),
      href: workspaceMode
        ? withPromptQueryParams(rootPromptHref, { model: item.slug })
        : getPromptPageHref(locale, 'model', item.slug),
      active: activeModelSlug === item.slug && !isFavoritesPromptView
    }))
  ];
  const promptSubnavGroups = new Set(isZh ? ['场景'] : ['Use Cases']);
  const promptSubnavLinks = promptGlobalNavGroups
    .filter((group) => promptSubnavGroups.has(group.title))
    .flatMap((group) => group.links)
    .filter(
      (item) =>
        item.href.includes('?') ||
        normalizePromptNavPath(item.href) !==
          normalizePromptNavPath(rootPromptHref)
    )
    .filter((item) => {
      if (
        isPromptCaseNavigationLoading ||
        promptCasesForNavigation.length === 0
      ) {
        return true;
      }
      const target = getPromptNavTarget(item.href);
      if (!target) return true;
      const isActive = target
        ? activePromptFilter === 'all' &&
          activePromptScopedTarget?.type === target.type &&
          activePromptScopedTarget.slug === target.slug
        : activePromptFilter === 'all' &&
          normalizePromptNavPath(item.href) === activePromptNavPath;
      return (
        isActive ||
        (hasPromptCategoryStats
          ? getPromptCategoryCount(target, activeModelSlug) > 0
          : countPromptCasesForTarget(
              promptCasesForNavigation,
              target,
              activeModelSlug
            ) > 0)
      );
    })
    .map((item) => {
      const target = getPromptNavTarget(item.href);
      if (!target) return { ...item, target };
      if (!activeModelSlug && !promptLibraryV2Enabled) {
        return { ...item, target };
      }
      return {
        ...item,
        target,
        href: withPromptScopedTarget(allPromptCasesHref, target, {
          useLabel: promptLibraryV2Enabled
        })
      };
    });
  const promptSortNavItems = promptLibraryV2Enabled
    ? [
        {
          key: 'featured' as const,
          label: isZh ? '精选' : 'Featured',
          href: withPromptCaseSort(allPromptCasesHref, 'featured')
        },
        {
          key: 'latest' as const,
          label: isZh ? '最新' : 'Latest',
          href: withPromptCaseSort(allPromptCasesHref, 'latest')
        },
        {
          key: 'hot' as const,
          label: isZh ? '最热' : 'Hot',
          href: withPromptCaseSort(allPromptCasesHref, 'hot')
        }
      ]
    : [
        {
          key: 'featured' as const,
          label: isZh ? '精选' : 'Featured',
          href: withPromptCaseFilter(allPromptCasesHref, 'featured')
        }
      ];
  const promptCaseStatusState =
    isFavoritesPromptView &&
    effectivePromptCaseLoadState === 'ready' &&
    sortedPromptCases.length === 0
      ? 'favorites-empty'
      : effectivePromptCaseLoadState === 'error'
        ? 'error'
        : effectivePromptCaseLoadState === 'ready' &&
            activePromptCases.length === 0
          ? 'empty'
          : effectivePromptCaseLoadState === 'ready' &&
              sortedPromptCases.length === 0
            ? 'no-result'
            : null;
  const isAllPromptCasesActive =
    activePromptFilter === 'all' &&
    !isFavoritesPromptView &&
    !activePromptScopedTarget &&
    normalizePromptNavPath(allPromptCasesHref) === activePromptNavPath;
  const isPromptSortActive = (sort: 'featured' | 'latest' | 'hot') =>
    activePromptFilter === sort &&
    !isFavoritesPromptView &&
    !activePromptScopedTarget &&
    normalizePromptNavPath(allPromptCasesHref) === activePromptNavPath;
  const activePromptSortTab =
    activePromptFilter === 'featured' || activePromptFilter === 'hot'
      ? activePromptFilter
      : 'latest';
  const promptSortTabs: PromptLibrarySortNavItem[] = promptSortNavItems.map(
    (item) => ({
      ...item,
      active: promptLibraryV2Enabled
        ? item.key === activePromptSortTab &&
          !isFavoritesPromptView &&
          !activePromptScopedTarget
        : isPromptSortActive(item.key)
    })
  );
  const promptTagItems: PromptLibraryTagNavItem[] = [
    {
      key: 'all',
      label: 'ALL',
      href: allPromptCasesHref,
      active: isAllPromptCasesActive
    },
    ...promptSubnavLinks.map((item) => {
      const target = item.target || getPromptNavTarget(item.href);
      const isActive = target
        ? activePromptFilter === 'all' &&
          activePromptScopedTarget?.type === target.type &&
          activePromptScopedTarget.slug === target.slug
        : activePromptFilter === 'all' &&
          normalizePromptNavPath(item.href) === activePromptNavPath;
      return {
        key: `tag:${item.href}:${item.label}`,
        label: item.label,
        href: item.href,
        active: isActive
      };
    })
  ];
  const relatedSeoLinks = getRelatedSeoLinks(
    locale,
    isZh,
    routeAlias,
    currentPage
  );
  const usesSourcePromptCases =
    locale === 'en-US' &&
    visiblePromptCases.some((caseItem) => caseItem.locale !== 'en-US');
  const richBadge = currentPage
    ? text(currentPage.badge, isZh)
    : richAlias?.badge
      ? text(richAlias.badge, isZh)
      : isZh
        ? 'Prompt 专题'
        : 'Prompt guide';
  const richIntent = currentPage
    ? text(currentPage.intent, isZh)
    : richAlias?.intent
      ? text(richAlias.intent, isZh)
      : subtitle;
  const richKeywords = currentPage
    ? getKeywords(currentPage, isZh)
    : richAlias
      ? getAliasKeywords(richAlias, isZh)
      : [];
  const richWorkflow = useMemo(
    () => currentPage?.workflow || richAlias?.workflow || [],
    [currentPage, richAlias]
  );
  const richExamples = useMemo(
    () => currentPage?.examples || richAlias?.examples || [],
    [currentPage, richAlias]
  );
  const richSections = useMemo(
    () => currentPage?.sections || richAlias?.sections || [],
    [currentPage, richAlias]
  );
  const richFaq = useMemo(
    () => currentPage?.faq || richAlias?.faq || [],
    [currentPage, richAlias]
  );
  const getPromptPreviewAttribution = useCallback(
    (caseItem: PromptCase, source: string): PromptPreviewAttribution => ({
      caseId: caseItem.id,
      caseSlug: caseItem.slug || undefined,
      model: caseItem.model || undefined,
      packageSlug: caseItem.packageSlug || undefined,
      source,
      path: currentPath,
      locale,
      pageType:
        currentPage?.type ||
        routeAlias?.target?.type ||
        routeAlias?.caseTarget?.type,
      pageSlug:
        currentPage?.slug ||
        routeAlias?.target?.slug ||
        routeAlias?.caseTarget?.slug
    }),
    [
      currentPage?.slug,
      currentPage?.type,
      currentPath,
      locale,
      routeAlias?.caseTarget?.slug,
      routeAlias?.caseTarget?.type,
      routeAlias?.target?.slug,
      routeAlias?.target?.type
    ]
  );
  const recordPromptPreviewConversion = useCallback(
    (
      eventName: ClientConversionEventPayload['eventName'],
      caseItem: PromptCase,
      params: {
        ctaSource: string;
        idempotencyKey: string;
        metadata?: Record<string, unknown>;
      }
    ) => {
      const accessToken = getAccessToken();

      const attribution = getPromptPreviewAttribution(
        caseItem,
        params.ctaSource
      );
      void recordClientConversionEvent(accessToken, {
        eventName,
        entityType: 'prompt_case',
        entityId: attribution.caseId,
        ctaSource: params.ctaSource,
        idempotencyKey: params.idempotencyKey,
        metadata: {
          caseId: attribution.caseId,
          caseSlug: attribution.caseSlug,
          model: attribution.model,
          contentId: attribution.caseId,
          mediaType: caseItem.mediaType === 'video' ? 'video' : 'image',
          cluster:
            attribution.pageType && attribution.pageSlug
              ? `${attribution.pageType}:${attribution.pageSlug}`
              : isVideoPromptHub
                ? 'hub:video-prompts'
                : 'hub:prompts',
          package: attribution.packageSlug,
          source: attribution.source,
          path: attribution.path,
          canonicalPath: location.pathname,
          locale: attribution.locale,
          pageType: attribution.pageType,
          pageSlug: attribution.pageSlug,
          authenticated: isAuthenticated,
          ...params.metadata
        }
      });
    },
    [
      getAccessToken,
      getPromptPreviewAttribution,
      isAuthenticated,
      isVideoPromptHub,
      location.pathname
    ]
  );
  const handlePromptCaseSearchSubmit = useCallback(
    (nextQuery: string) => {
      const nextParams = new URLSearchParams(location.search);
      if (nextQuery) {
        nextParams.set('q', nextQuery);
      } else {
        nextParams.delete('q');
      }
      const nextSearch = nextParams.toString();
      navigate(
        `${location.pathname}${nextSearch ? `?${nextSearch}` : ''}${location.hash}`
      );
    },
    [location.hash, location.pathname, location.search, navigate]
  );
  const handlePromptCaseCardClick = (
    event: MouseEvent<HTMLElement>,
    caseItem: PromptCase
  ) => {
    if (
      event.defaultPrevented ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.button !== 0
    ) {
      return;
    }

    event.preventDefault();
    setPreviewCase(caseItem);
    setPreviewActiveRecipeAssetId(null);
    setPreviewImageIndex(0);
    setPreviewLightboxOpen(false);
  };

  function closePreviewCase() {
    closingPromptPreviewRef.current = true;
    setPreviewCase(null);
    setPreviewActiveRecipeAssetId(null);
    setPreviewImageIndex(0);
    setPreviewLightboxOpen(false);
    setCopiedShareUrl(false);
    if (
      promptCaseSearchParams.has('caseId') ||
      promptCaseSearchParams.has('caseSlug') ||
      promptCaseSearchParams.has('case')
    ) {
      const nextParams = new URLSearchParams(location.search);
      nextParams.delete('caseId');
      nextParams.delete('caseSlug');
      nextParams.delete('case');
      const nextSearch = nextParams.toString();
      navigate(
        `${location.pathname}${nextSearch ? `?${nextSearch}` : ''}${
          location.hash
        }`,
        { replace: true }
      );
    }
  }

  const replacePreviewQueryCase = useCallback(
    (caseItem: PromptCase) => {
      if (
        !promptCaseSearchParams.has('caseId') &&
        !promptCaseSearchParams.has('caseSlug') &&
        !promptCaseSearchParams.has('case')
      ) {
        return;
      }
      const nextParams = new URLSearchParams(location.search);
      nextParams.delete('case');
      if (caseItem.id) {
        nextParams.set('caseId', caseItem.id);
      } else {
        nextParams.delete('caseId');
      }
      if (caseItem.slug) {
        nextParams.set('caseSlug', caseItem.slug);
      } else {
        nextParams.delete('caseSlug');
      }
      const nextSearch = nextParams.toString();
      navigate(
        `${location.pathname}${nextSearch ? `?${nextSearch}` : ''}${
          location.hash
        }`,
        { replace: true }
      );
    },
    [
      location.hash,
      location.pathname,
      location.search,
      navigate,
      promptCaseSearchParams
    ]
  );

  function goToPreviewCase(direction: -1 | 1) {
    if (!canNavigatePreviewCases) return;
    const nextIndex =
      (previewCaseIndex + direction + visiblePromptCases.length) %
      visiblePromptCases.length;
    const nextCase = visiblePromptCases[nextIndex];
    if (!nextCase) return;
    setPreviewCase(nextCase);
    setPreviewActiveRecipeAssetId(null);
    setPreviewImageIndex(0);
    setPreviewLightboxOpen(false);
    setCopiedShareUrl(false);
    replacePreviewQueryCase(nextCase);
  }

  function goToPreviewImage(direction: -1 | 1) {
    if (previewCaseImages.length < 2) return;
    setPreviewImageIndex((current) => {
      const next = current + direction;
      if (next < 0) return previewCaseImages.length - 1;
      if (next >= previewCaseImages.length) return 0;
      return next;
    });
  }
  const goToPreviewCaseRef = useRef(goToPreviewCase);
  const goToPreviewImageRef = useRef(goToPreviewImage);
  useEffect(() => {
    goToPreviewCaseRef.current = goToPreviewCase;
    goToPreviewImageRef.current = goToPreviewImage;
  });

  const previewDialogRef = useOverlayBehavior<HTMLElement>({
    open: Boolean(previewCase),
    closeDisabled: previewLightboxOpen,
    onClose: closePreviewCase
  });

  const showCopyToast = (message: string) => {
    setCopyToastText(message);
    if (copyToastTimerRef.current) {
      window.clearTimeout(copyToastTimerRef.current);
    }
    copyToastTimerRef.current = window.setTimeout(() => {
      setCopyToastText('');
      copyToastTimerRef.current = null;
    }, 1800);
  };

  const handleCopyPreviewPrompt = async (
    caseItem: PromptCase,
    promptLocale: 'zh-CN' | 'en-US'
  ) => {
    let copySource = caseItem;
    if (!hasPromptCaseLocalePrompt(copySource, promptLocale)) {
      const detailedCase = await getPublicPromptCase(copySource.id, {
        by: 'id',
        force: true,
        locale: promptLocale
      }).catch((error) => {
        console.warn('[PromptSeo] full prompt unavailable for copy:', {
          caseId: copySource.id,
          error
        });
        return null;
      });
      if (detailedCase) {
        copySource = mergePromptCaseLocaleDetail(
          copySource,
          detailedCase,
          promptLocale
        );
        setPreviewCase((current) =>
          current?.id === copySource.id
            ? mergePromptCaseLocaleDetail(current, detailedCase, promptLocale)
            : current
        );
        setPromptCases((current) =>
          current.some((item) => item.id === copySource.id)
            ? current.map((item) =>
                item.id === copySource.id
                  ? mergePromptCaseLocaleDetail(
                      item,
                      detailedCase,
                      promptLocale
                    )
                  : item
              )
            : [copySource, ...current]
        );
      }
    }

    const copied = await copyPromptCasePrompt(copySource, promptLocale);
    const failureReason = copied
      ? undefined
      : 'clipboard_unavailable_or_denied';
    const attribution = getPromptPreviewAttribution(
      caseItem,
      'prompt_preview_copy'
    );
    if (copied) {
      void trackPromptCaseEvent(caseItem.id, 'copy');
    }
    trackPromptPreviewCopy({
      ...attribution,
      copySuccess: copied,
      failureReason
    });
    trackPromptCaseCta({
      action: 'click',
      caseId: caseItem.id,
      source: 'prompt_preview_copy',
      authenticated: isAuthenticated,
      locked: !getPromptCasePreviewText(caseItem),
      locale
    });
    recordPromptPreviewConversion('prompt_preview_copy', caseItem, {
      ctaSource: 'prompt_preview_copy',
      idempotencyKey: `prompt_preview_copy:${caseItem.id}:${Date.now()}`,
      metadata: {
        copySuccess: copied,
        failureReason
      }
    });
    if (copied) {
      showCopyToast(isZh ? '已复制 Prompt' : 'Prompt copied');
    } else {
      showCopyToast(isZh ? '复制失败，请手动复制' : 'Copy failed');
    }
  };

  const handleCopyPreviewShareUrl = async (caseItem: PromptCase) => {
    const shareUrl = withReferralParam(
      `${window.location.origin}${getPromptCasePath(caseItem, locale)}`
    );
    void recordClientConversionEvent(getAccessToken(), {
      eventName: 'prompt_share_view',
      entityType: 'prompt_case',
      entityId: caseItem.id,
      ctaSource: 'prompt_preview_share',
      idempotencyKey: `prompt_share_view:${caseItem.id}:${Date.now()}`,
      metadata: {
        caseId: caseItem.id,
        caseSlug: caseItem.slug,
        refCode: getReferralShareCode()
      }
    });

    if (!navigator.clipboard?.writeText) {
      window.prompt(
        isZh ? '复制这个案例分享链接' : 'Copy this case share link',
        shareUrl
      );
      return;
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedShareUrl(true);
      if (shareCopyTimerRef.current) {
        window.clearTimeout(shareCopyTimerRef.current);
      }
      shareCopyTimerRef.current = window.setTimeout(() => {
        setCopiedShareUrl(false);
        shareCopyTimerRef.current = null;
      }, 1400);
    } catch (error) {
      console.warn('[PromptSeo] share URL copy failed:', error);
      window.prompt(
        isZh ? '复制这个案例分享链接' : 'Copy this case share link',
        shareUrl
      );
    }
  };

  const handleUsePreviewPrompt = (caseItem: PromptCase) => {
    const attribution = getPromptPreviewAttribution(
      caseItem,
      'prompt_preview_use'
    );
    void trackPromptCaseEvent(caseItem.id, 'generate');
    trackPromptPreviewUse(attribution);
    trackPromptCaseCta({
      action: 'click',
      caseId: caseItem.id,
      source: 'prompt_preview_use',
      authenticated: isAuthenticated,
      locked: !getPromptCasePreviewText(caseItem),
      locale
    });
    recordPromptPreviewConversion('prompt_preview_use', caseItem, {
      ctaSource: 'prompt_preview_use',
      idempotencyKey: `prompt_preview_use:${caseItem.id}:${Date.now()}`,
      metadata: {
        target: 'create'
      }
    });
  };

  useEffect(() => {
    return () => {
      if (copyToastTimerRef.current) {
        window.clearTimeout(copyToastTimerRef.current);
      }
      if (shareCopyTimerRef.current) {
        window.clearTimeout(shareCopyTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (previewVisualRecipeSlots.length === 0) {
      setPublicRecipeAssets(getLocalPublicImagePromptAssets());
      return undefined;
    }

    let isCancelled = false;
    Promise.all(
      previewVisualRecipeSlots.map((slot) =>
        loadPublicImagePromptAssetSlotLibrary(slot)
      )
    ).then((libraries) => {
      if (isCancelled) return;
      const hydratedAssets = libraries.reduce(
        (assets, library, index) =>
          mergeHydratedPromptAssetSlot(
            assets,
            previewVisualRecipeSlots[index],
            library.assets
          ),
        getLocalPublicImagePromptAssets()
      );
      setPublicRecipeAssets(hydratedAssets);
    });
    return () => {
      isCancelled = true;
    };
  }, [previewVisualRecipeSlots]);

  useEffect(() => {
    if (hasPromptCasePreviewQuery) {
      const existingCanonical = document
        .querySelector('link[rel="canonical"]')
        ?.getAttribute('href');
      const isPromptCaseCanonical = Boolean(
        existingCanonical &&
        !/\/(?:zh-CN|en-US)\/prompts\/?$/i.test(existingCanonical) &&
        (/\/(?:zh-CN|en-US)\/prompts\//i.test(existingCanonical) ||
          /\/(?:zh-CN|en-US)\/create\/prompts\/share\//i.test(
            existingCanonical
          ))
      );
      if (isPromptCaseCanonical) {
        return;
      }
    }

    if (hasPromptCasePreviewQuery && previewCase) {
      const promptCaseCanonical = `${window.location.origin}${getPromptCasePath(
        previewCase,
        locale
      )}`;
      const promptCaseCover = getPromptCaseCover(previewCase);
      return applySeo({
        title: `${previewCase.title || title} | WebToMind Prompts`,
        description:
          getPromptCasePreviewText(previewCase) ||
          previewCase.commercialIntent ||
          subtitle,
        canonical: promptCaseCanonical,
        alternates: [
          {
            hreflang: previewCase.locale === 'en-US' ? 'en-US' : 'zh-CN',
            href: promptCaseCanonical
          }
        ],
        ogType: 'article',
        ogImage: promptCaseCover
          ? getOptimizedPromptCaseImageUrl(promptCaseCover, {
              width: 1200,
              quality: 82
            })
          : undefined,
        jsonLd: {
          '@context': 'https://schema.org',
          '@type': 'CreativeWork',
          name: previewCase.title || title,
          description:
            getPromptCasePreviewText(previewCase) ||
            previewCase.commercialIntent ||
            subtitle,
          url: promptCaseCanonical,
          inLanguage: previewCase.locale === 'en-US' ? 'en-US' : 'zh-CN'
        }
      });
    }

    const promptPath = isVideoPromptHub
      ? '/zh-CN/video-prompts'
      : routeAlias
        ? routeAlias.canonicalPath
        : currentPage
          ? getPromptSeoPath(currentPage)
          : '/prompts';
    const canonical = isVideoPromptHub
      ? `${window.location.origin}${promptPath}`
      : routeAlias
        ? `${window.location.origin}${promptPath}`
        : `${window.location.origin}/${locale}${promptPath}`;
    const zhHref = `${window.location.origin}/zh-CN${
      currentPage ? getPromptSeoPath(currentPage) : '/prompts'
    }`;
    const enHref = routeAlias
      ? `${window.location.origin}${promptPath}`
      : `${window.location.origin}/en-US${promptPath}`;
    const seoTitle = `${title} | WebToMind`;
    const promptCaseJsonLdItems = visiblePromptCases
      .slice(0, 24)
      .map((caseItem, index) => {
        const caseUrl = `${window.location.origin}${getPromptCasePath(
          caseItem,
          locale
        )}`;
        const cover = getPromptCaseCover(caseItem);
        const description =
          getPromptCasePreviewText(caseItem) ||
          caseItem.commercialIntent ||
          subtitle;

        return {
          '@type': 'ListItem',
          position: index + 1,
          item: {
            '@type': 'CreativeWork',
            name: caseItem.title || 'AI image prompt example',
            description,
            url: caseUrl,
            ...(cover
              ? {
                  image: getOptimizedPromptCaseImageUrl(cover, {
                    width: 1200,
                    quality: 82
                  })
                }
              : {})
          }
        };
      });
    const jsonLdSourceItems = isVideoPromptHub
      ? []
      : promptCaseJsonLdItems.length > 0
        ? []
        : richExamples.length > 0
          ? richExamples
          : currentPage
            ? currentPage.examples
            : pageItems;
    const fallbackJsonLdItems = jsonLdSourceItems.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: 'slug' in item ? text(item.title, isZh) : text(item, isZh)
    }));
    const jsonLdItemList =
      promptCaseJsonLdItems.length > 0
        ? promptCaseJsonLdItems
        : fallbackJsonLdItems;

    return applySeo({
      title: seoTitle,
      description: subtitle,
      canonical,
      robots: isVideoPromptHub
        ? isVideoPromptHubIndexable
          ? 'index,follow,max-video-preview:-1'
          : 'noindex,follow'
        : undefined,
      alternates: isVideoPromptHub
        ? []
        : [
            { hreflang: 'zh-CN', href: zhHref },
            { hreflang: 'en-US', href: enHref },
            { hreflang: 'x-default', href: enHref }
          ],
      jsonLd: [
        {
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          name: title,
          description: subtitle,
          url: canonical,
          inLanguage: locale
        },
        {
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          itemListElement: jsonLdItemList
        }
      ]
    });
  }, [
    currentPage,
    hasPromptCasePreviewQuery,
    isVideoPromptHub,
    isVideoPromptHubIndexable,
    isZh,
    locale,
    pageItems,
    previewCase,
    richExamples,
    routeAlias,
    subtitle,
    title,
    visiblePromptCases,
    workspaceMode
  ]);

  useEffect(() => {
    let cancelled = false;
    const scheduleStateUpdate = (callback: () => void) => {
      queueMicrotask(() => {
        if (!cancelled) callback();
      });
    };

    if (promptLibraryV2Enabled) {
      scheduleStateUpdate(() => {
        setNavigationPromptCases([]);
        setNavigationPromptCaseLoadState('ready');
      });
      return () => {
        cancelled = true;
      };
    }

    if (promptCaseTarget?.type !== 'package') {
      scheduleStateUpdate(() => {
        setNavigationPromptCases([]);
        setNavigationPromptCaseLoadState('ready');
      });
      return () => {
        cancelled = true;
      };
    }

    scheduleStateUpdate(() => setNavigationPromptCaseLoadState('loading'));
    getPublicPromptCases(PROMPT_BROWSER_INITIAL_CASE_FETCH_LIMIT, {
      locale,
      requireImage: true
    })
      .then((cases) => {
        if (cancelled) return;
        setNavigationPromptCases(cases);
        setNavigationPromptCaseLoadState('ready');
      })
      .catch((error) => {
        if (cancelled) return;
        console.warn('[PromptSeo] navigation prompt cases unavailable:', error);
        setNavigationPromptCases([]);
        setNavigationPromptCaseLoadState('error');
      });

    return () => {
      cancelled = true;
    };
  }, [locale, promptCaseTarget, promptLibraryV2Enabled]);

  useEffect(() => {
    let cancelled = false;
    const scheduleStateUpdate = (callback: () => void) => {
      queueMicrotask(() => {
        if (!cancelled) callback();
      });
    };

    if (!isFavoritesPromptView) {
      scheduleStateUpdate(() => {
        setFavoritePromptCases([]);
        setFavoritePromptCaseLoadState('ready');
      });
      return () => {
        cancelled = true;
      };
    }

    if (favoriteIds.length === 0) {
      scheduleStateUpdate(() => {
        setFavoritePromptCases([]);
        setFavoritePromptCaseLoadState('ready');
      });
      return () => {
        cancelled = true;
      };
    }

    scheduleStateUpdate(() => setFavoritePromptCaseLoadState('loading'));
    mapPromptCaseFavoriteIds(favoriteIds, (caseId) =>
      getPublicPromptCase(caseId, { locale, by: 'id' }).catch((error) => {
        console.warn('[PromptSeo] favorite prompt case unavailable:', {
          caseId,
          error
        });
        return null;
      })
    )
      .then((cases) => {
        if (cancelled) return;
        const favoriteCases = cases.filter(Boolean) as PromptCase[];
        setFavoritePromptCases(favoriteCases);
        setFavoritePromptCaseLoadState('ready');
      })
      .catch((error) => {
        if (cancelled) return;
        console.warn('[PromptSeo] favorite prompt cases unavailable:', error);
        setFavoritePromptCases([]);
        setFavoritePromptCaseLoadState('error');
      });

    return () => {
      cancelled = true;
    };
  }, [favoriteIds, isFavoritesPromptView, locale]);

  useEffect(() => {
    if (promptLibraryV2Enabled) return;

    let cancelled = false;
    const scheduleStateUpdate = (callback: () => void) => {
      queueMicrotask(() => {
        if (!cancelled) callback();
      });
    };
    const requestLimit = activePromptSearchQuery
      ? PROMPT_BROWSER_EXPANDED_CASE_FETCH_LIMIT
      : PROMPT_BROWSER_INITIAL_CASE_FETCH_LIMIT;
    const requestOptions = {
      ...mergePromptCaseRequestOptions(
        promptCaseTarget,
        activePromptScopedTarget,
        locale
      ),
      search: activePromptSearchQuery || undefined,
      force: Boolean(activePromptSearchQuery)
    };
    scheduleStateUpdate(() => setPromptCaseLoadState('loading'));
    getPublicPromptCasesResult(requestLimit, requestOptions)
      .then(async (result) => {
        if (cancelled) return;
        const cases = result.cases;
        setPromptCaseStats({
          navigationTotal: result.navigationTotal,
          modelCounts: result.modelCounts,
          categoryCounts: result.categoryCounts
        });
        if (!activePromptSearchQuery && promptCaseTarget && cases.length < 4) {
          if (isSrefSeoPage(currentPage) && locale === 'zh-CN') {
            setPromptCases(cases);
            setPromptCaseLoadState('ready');
            return;
          }
          const fallbackCases = await getFallbackPromptCases(
            promptCaseTarget,
            locale
          );
          if (!cancelled) {
            setPromptCases(fallbackCases);
            setPromptCaseLoadState('ready');
          }
          return;
        }
        setPromptCases(cases);
        setPromptCaseLoadState('ready');
      })
      .catch(async (error) => {
        if (cancelled) return;
        console.warn('[PromptSeo] focused prompt cases unavailable:', error);
        try {
          const fallbackCases = await getFallbackPromptCases(
            promptCaseTarget,
            locale
          );
          if (!cancelled) {
            setPromptCases(fallbackCases);
            setPromptCaseStats({
              navigationTotal: null,
              modelCounts: {},
              categoryCounts: {}
            });
            setPromptCaseLoadState('ready');
          }
        } catch (fallbackError) {
          if (!cancelled) {
            console.warn(
              '[PromptSeo] prompt cases unavailable:',
              fallbackError
            );
            setPromptCases([]);
            setPromptCaseStats({
              navigationTotal: null,
              modelCounts: {},
              categoryCounts: {}
            });
            setPromptCaseLoadState('error');
          }
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    activePromptSearchQuery,
    activePromptScopedTarget,
    currentPage,
    locale,
    promptCaseScopedTargetKey,
    promptCaseTarget,
    promptCaseTargetKey,
    promptLibraryV2Enabled
  ]);

  useEffect(() => {
    if (!promptCasePreviewQueryKey) {
      closingPromptPreviewRef.current = false;
      return undefined;
    }
    if (closingPromptPreviewRef.current) {
      return undefined;
    }
    if (
      previewCase &&
      ((promptCasePreviewId && previewCase.id === promptCasePreviewId) ||
        (promptCasePreviewSlug && previewCase.slug === promptCasePreviewSlug))
    ) {
      return undefined;
    }

    const localCase = activePromptCases.find(
      (caseItem) =>
        (promptCasePreviewId && caseItem.id === promptCasePreviewId) ||
        (promptCasePreviewSlug && caseItem.slug === promptCasePreviewSlug)
    );
    const openCase = (caseItem: PromptCase) => {
      setPreviewCase(caseItem);
      setPreviewActiveRecipeAssetId(null);
      setPreviewImageIndex(0);
      setPreviewLightboxOpen(false);
      setCopiedShareUrl(false);
      const sortedIndex = sortedPromptCases.findIndex(
        (item) => item.id === caseItem.id
      );
      if (sortedIndex >= 0) {
        setPromptCaseVisibleLimit((current) =>
          Math.max(current, sortedIndex + 1)
        );
      }
    };

    if (localCase) {
      openCase(localCase);
      return undefined;
    }

    const lookup = promptCasePreviewId || promptCasePreviewSlug;
    if (!lookup) return undefined;
    let cancelled = false;
    getPublicPromptCase(lookup, {
      by: promptCasePreviewId ? 'id' : 'slug',
      force: true,
      locale
    })
      .then((caseItem) => {
        if (cancelled || !caseItem) return;
        setPromptCases((current) =>
          current.some((item) => item.id === caseItem.id)
            ? current
            : [caseItem, ...current]
        );
        openCase(caseItem);
      })
      .catch((error) => {
        if (!cancelled) {
          console.warn('[PromptSeo] prompt case preview unavailable:', error);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    activePromptCases,
    locale,
    previewCase,
    promptCasePreviewId,
    promptCasePreviewQueryKey,
    promptCasePreviewSlug,
    sortedPromptCases
  ]);

  useEffect(() => {
    if (previewCase) return;
    promptPreviewLocaleFailuresRef.current.forEach((attemptKey) => {
      promptPreviewLocaleAttemptsRef.current.delete(attemptKey);
    });
    promptPreviewLocaleFailuresRef.current.clear();
  }, [previewCase]);

  useEffect(() => {
    if (!previewCase?.id) return undefined;
    if (previewCase.id.startsWith('static-seo-')) return undefined;
    const promptLocales: Array<'zh-CN' | 'en-US'> = Array.from(
      new Set([locale, 'en-US'] as Array<'zh-CN' | 'en-US'>)
    ).filter(
      (promptLocale) =>
        !hasPromptCaseLocalePrompt(previewCase, promptLocale) &&
        !promptPreviewLocaleAttemptsRef.current.has(
          `${previewCase.id}:${promptLocale}`
        )
    );
    if (promptLocales.length === 0) return undefined;

    promptLocales.forEach((promptLocale) => {
      promptPreviewLocaleAttemptsRef.current.add(
        `${previewCase.id}:${promptLocale}`
      );
    });

    let cancelled = false;
    Promise.all(
      promptLocales.map((promptLocale) =>
        getPublicPromptCase(previewCase.id, {
          by: 'id',
          force: true,
          locale: promptLocale
        })
          .then((detailedCase) => {
            if (
              !detailedCase ||
              !hasPromptCaseLocalePrompt(detailedCase, promptLocale)
            ) {
              promptPreviewLocaleFailuresRef.current.add(
                `${previewCase.id}:${promptLocale}`
              );
            }
            return { detailedCase, promptLocale };
          })
          .catch((error) => {
            promptPreviewLocaleFailuresRef.current.add(
              `${previewCase.id}:${promptLocale}`
            );
            console.warn('[PromptSeo] full preview prompt unavailable:', {
              caseId: previewCase.id,
              promptLocale,
              error
            });
            return null;
          })
      )
    ).then((results) => {
      if (cancelled) return;
      const availableDetails = results.filter(
        (
          result
        ): result is {
          detailedCase: PromptCase;
          promptLocale: 'zh-CN' | 'en-US';
        } => Boolean(result?.detailedCase)
      );
      if (availableDetails.length === 0) return;

      setPreviewCase((current) => {
        if (!current || current.id !== previewCase.id) return current;
        return availableDetails.reduce(
          (merged, { detailedCase, promptLocale }) =>
            mergePromptCaseLocaleDetail(merged, detailedCase, promptLocale),
          current
        );
      });
      setPromptCases((current) =>
        current.map((item) =>
          item.id === previewCase.id
            ? availableDetails.reduce(
                (merged, { detailedCase, promptLocale }) =>
                  mergePromptCaseLocaleDetail(
                    merged,
                    detailedCase,
                    promptLocale
                  ),
                item
              )
            : item
        )
      );
    });

    return () => {
      cancelled = true;
    };
  }, [locale, previewCase]);

  useEffect(() => {
    if (!previewCase) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') {
        if (!canNavigatePreviewImages && !canNavigatePreviewCases) return;
        event.preventDefault();
        if (canNavigatePreviewImages) {
          goToPreviewImageRef.current(-1);
        } else {
          goToPreviewCaseRef.current(-1);
        }
      } else if (event.key === 'ArrowRight') {
        if (!canNavigatePreviewImages && !canNavigatePreviewCases) return;
        event.preventDefault();
        if (canNavigatePreviewImages) {
          goToPreviewImageRef.current(1);
        } else {
          goToPreviewCaseRef.current(1);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [canNavigatePreviewCases, canNavigatePreviewImages, previewCase]);

  useEffect(() => {
    if (!previewCase) {
      promptPreviewViewKeyRef.current = '';
      return;
    }

    const viewKey = `${previewCase.id}:${currentPath}`;
    if (promptPreviewViewKeyRef.current === viewKey) return;
    promptPreviewViewKeyRef.current = viewKey;

    const attribution = getPromptPreviewAttribution(
      previewCase,
      'prompt_preview_view'
    );
    void trackPromptCaseEvent(previewCase.id, 'view');
    trackPromptPreviewView(attribution);
    trackPromptCaseCta({
      action: 'view',
      caseId: previewCase.id,
      source: 'prompt_preview_view',
      authenticated: isAuthenticated,
      locked: !getPromptCasePreviewText(previewCase),
      locale
    });
    recordPromptPreviewConversion('prompt_preview_view', previewCase, {
      ctaSource: 'prompt_preview_view',
      idempotencyKey: `prompt_preview_view:${previewCase.id}:${Date.now()}`,
      metadata: {
        referrer: document.referrer || undefined
      }
    });
  }, [
    getPromptPreviewAttribution,
    currentPath,
    isAuthenticated,
    locale,
    previewCase,
    recordPromptPreviewConversion
  ]);

  if ((routeType || slug || routeAlias?.target) && !currentPage) {
    return <Navigate to={`/${locale}/prompts`} replace />;
  }

  if (shouldRedirectPromptCaseAdmin) {
    return <Navigate to={promptCaseAdminHref} replace />;
  }

  return (
    <div
      className={`prompt-browser-page${workspaceMode ? ' is-create-workspace' : ''}`}
    >
      {!workspaceMode && (
        <PromptLibraryShellNav
          locale={locale}
          isZh={isZh}
          showPromptAdmin={showPromptAdmin}
        />
      )}
      {workspaceMode ? (
        <div className="prompt-browser-main">
          {renderPromptLibraryContent()}
        </div>
      ) : (
        <main className="prompt-browser-main">
          {renderPromptLibraryContent()}
        </main>
      )}

      {previewCase ? (
        <Suspense fallback={null}>
          <PromptCasePreviewDialog
            previewCase={previewCase}
            locale={locale}
            isZh={isZh}
            locationSearch={location.search}
            dialogRef={previewDialogRef}
            activePreviewImage={activePreviewImage}
            activePreviewVideo={activePreviewVideo}
            isActivePreviewVideo={isActivePreviewVideo}
            previewCaseImages={previewCaseImages}
            activePreviewImageIndex={activePreviewImageIndex}
            canNavigatePreviewImages={canNavigatePreviewImages}
            canNavigatePreviewCases={canNavigatePreviewCases}
            previewLightboxOpen={previewLightboxOpen}
            copyToastText={copyToastText}
            copiedShareUrl={copiedShareUrl}
            previewVisualRecipeSelection={previewVisualRecipeSelection}
            previewVisualRecipeCards={previewVisualRecipeCards}
            previewActiveRecipeAssetId={previewActiveRecipeAssetId}
            previewActiveRecipeAsset={previewActiveRecipeAsset}
            previewRelatedRecipeCases={previewRelatedRecipeCases}
            previewRecipeFallbackCases={previewRecipeFallbackCases}
            previewMorePromptCases={previewMorePromptCases}
            isFavorited={isFavorited}
            toggleFavorite={toggleFavorite}
            closePreviewCase={closePreviewCase}
            setPreviewImageIndex={setPreviewImageIndex}
            setPreviewLightboxOpen={setPreviewLightboxOpen}
            setPreviewActiveRecipeAssetId={setPreviewActiveRecipeAssetId}
            goToPreviewImage={goToPreviewImage}
            goToPreviewCase={goToPreviewCase}
            handleCopyPreviewPrompt={handleCopyPreviewPrompt}
            handleCopyPreviewShareUrl={handleCopyPreviewShareUrl}
            handleUsePreviewPrompt={handleUsePreviewPrompt}
            getPromptCaseDetailPath={getPromptCaseDetailPath}
            getPromptCaseCreatePath={getPromptCaseCreatePath}
            getVisualRecipeSlotLabel={getVisualRecipeSlotLabel}
          />
        </Suspense>
      ) : null}
    </div>
  );

  function renderPromptLibraryContent() {
    return (
      <>
        <header className="prompt-browser-header">
          <div className="prompt-browser-header-copy">
            <p className="prompt-browser-kicker">
              {isZh ? 'PROMPT LIBRARY' : 'PROMPT LIBRARY'}
            </p>
            <div className="prompt-browser-title-row">
              <h1>{title}</h1>
            </div>
            <p>{subtitle}</p>
          </div>
          <div className="prompt-browser-header-actions">
            <PromptLibrarySortTabs
              isZh={isZh}
              items={promptSortTabs}
              className="prompt-browser-sort-tabs-mobile"
              ariaLabel={
                isZh ? 'Prompt 排序（搜索区）' : 'Prompt sort near search'
              }
            />
            {currentPage?.type === 'model' &&
              currentPage.slug === 'gpt-image-2' && (
                <Link
                  className="prompt-browser-model-cta"
                  to="/image?source=seo_gpt_image_2_landing"
                >
                  <span>
                    {isZh
                      ? '用 GPT Image 2 开始创作'
                      : 'Create with GPT Image 2'}
                  </span>
                  <small>
                    {isZh
                      ? '打开工作台，继续调整提示词与参考图'
                      : 'Open the workspace with prompts and references'}
                  </small>
                </Link>
              )}
            {(currentPage?.type === 'model' &&
              currentPage.slug !== 'gpt-image-2') ||
            routeAlias ? (
              <Link
                className="prompt-browser-model-cta"
                to="/image?source=seo_prompt_landing"
              >
                <span>
                  {isZh ? '打开创作工作台' : 'Open the creation workspace'}
                </span>
                <small>
                  {isZh
                    ? '继续调整提示词、参考图与生成参数'
                    : 'Keep refining prompts, references and generation settings'}
                </small>
              </Link>
            ) : null}
            {isVideoPromptHub ? (
              <Link
                className="prompt-browser-model-cta"
                to="/zh-CN/video?source=video_hub_landing"
              >
                <span>{isZh ? '打开视频创作' : 'Open video creation'}</span>
                <small>
                  {isZh
                    ? '携带案例 Prompt、模型与时长进入视频工作台'
                    : 'Carry the case prompt, model and duration into the video workspace'}
                </small>
              </Link>
            ) : null}
            <PromptLibrarySearch
              key={activePromptSearchQuery}
              query={activePromptSearchQuery}
              isZh={isZh}
              onSearch={handlePromptCaseSearchSubmit}
            />
          </div>
        </header>

        <>
          <PromptLibraryNavigation
            isZh={isZh}
            modelItems={promptModelItems}
            tagItems={promptTagItems}
            sortItems={promptSortTabs}
          />

          {usesSourcePromptCases && (
            <p className="prompt-browser-source-note">
              Showing translated/source examples while English prompt cases are
              being reviewed.
            </p>
          )}

          {promptLibraryV2Enabled &&
          !isFavoritesPromptView &&
          promptLibraryCasesState.data &&
          promptLibraryCasesState.error ? (
            <div className="prompt-browser-refresh-error" role="status">
              <span>
                {isZh
                  ? '后台刷新失败，当前展示缓存内容。'
                  : 'Background refresh failed. Showing cached content.'}
              </span>
              <button type="button" onClick={promptLibraryCasesState.retry}>
                {isZh ? '重试' : 'Retry'}
              </button>
            </div>
          ) : null}

          <PromptLibraryMasonry
            ref={promptBrowserMasonryRef}
            isZh={isZh}
            locale={locale}
            columns={visiblePromptCaseColumns}
            activeColumnCount={promptBrowserColumnCount}
            loadState={effectivePromptCaseLoadState}
            statusState={promptCaseStatusState}
            allCasesHref={allPromptCasesHref}
            getCaseHref={getPromptCasePath}
            getCreateHref={(caseItem) =>
              getPromptCaseCreatePath(caseItem, location.search)
            }
            aspectRatios={promptCaseAspectRatios}
            onAspectRatioChange={handlePromptCaseAspectRatioChange}
            isFavorited={isFavorited}
            onOpenCase={handlePromptCaseCardClick}
            onUseCase={handleUsePreviewPrompt}
            onToggleFavorite={toggleFavorite}
            hasMore={hasMorePromptCases}
            isLoadingMore={
              !isFavoritesPromptView &&
              promptLibraryV2Enabled &&
              promptLibraryCasesState.isLoadingMore
            }
            isRefreshing={
              !isFavoritesPromptView &&
              promptLibraryV2Enabled &&
              promptLibraryCasesState.isRefreshing
            }
            onLoadMore={loadMorePromptCases}
            onRetry={
              !isFavoritesPromptView && promptLibraryV2Enabled
                ? promptLibraryCasesState.retry
                : undefined
            }
            loadMoreRef={promptCaseLoadMoreRef}
            visibleCount={visiblePromptCases.length}
            totalCount={promptCaseDisplayTotal}
            hasAnyCases={sortedPromptCases.length > 0}
          />

          <PromptLibrarySeoContent
            isZh={isZh}
            showSrefReferences={isSrefSeoPage(currentPage)}
            hasRichSeoContent={hasRichSeoContent}
            richBadge={richBadge}
            richIntent={richIntent}
            richKeywords={richKeywords}
            shouldShowStyleGridCta={shouldShowStyleGridCta}
            relatedSeoLinks={relatedSeoLinks}
            richWorkflow={richWorkflow}
            richExamples={richExamples}
            richSections={richSections}
            richFaq={richFaq}
          />
        </>
      </>
    );
  }
}
