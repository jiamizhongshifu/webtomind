import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  getPromptSeoCategorySlugs,
  getPromptSeoModelAliases,
  getPromptSeoModelSlugs,
  hasPromptSeoCategoryMatcher,
  hasPromptSeoModelMatcher,
  promptSeoCaseMatches
} from '../../src/shared/prompt-seo-match.js';
import {
  PROMPT_LIBRARY_LABELS,
  PROMPT_LIBRARY_MODELS,
  PROMPT_LIBRARY_SORTS,
  canonicalizePromptLibraryLabel,
  canonicalizePromptLibraryModel,
  getPromptLibraryFacetLabel,
  getPromptLibraryLabelSlugs,
  getPromptLibraryModelSlug,
  normalizePromptLibrarySort,
  type PromptLibraryFacet,
  type PromptLibraryQuery,
  type PromptLibrarySort
} from '../../src/shared/prompt-library.js';
import { getCorsHeadersForRequest } from '../utils/auth';
import {
  isSupabaseSignedStorageUrl,
  refreshSupabaseSignedStorageUrls
} from '../utils/signed-storage-url';
import { pickPromptCaseDisplayTitle } from '../utils/prompt-case-display';
import {
  SUBSCRIPTION_ACCESS_STATUSES,
  findSubscriptionWithPaidAccess
} from '../membership/subscription-policy';
import { isPromptCaseSeoIndexable } from '../../src/shared/prompt-seo-quality.js';

export const config = { runtime: 'edge' };

function jsonResponse(
  data: unknown,
  corsHeaders: Record<string, string>,
  status = 200,
  extraHeaders: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
      ...extraHeaders
    }
  });
}

function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((tag) => (typeof tag === 'string' ? tag.trim() : ''))
    .filter(Boolean);
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
}

function normalizeJsonObject(
  value: unknown
): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function getBearerToken(request: Request): string | null {
  const authHeader = request.headers.get('Authorization') || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export type PromptCasePromptAccess = {
  isAuthenticated: boolean;
  isMember: boolean;
};

export function canViewPromptCasePromptForAccess(
  memberOnly: boolean,
  access: PromptCasePromptAccess
): boolean {
  return memberOnly ? access.isMember : access.isAuthenticated;
}

async function getPromptCasePromptAccess(params: {
  request: Request;
  supabaseUrl: string;
  supabaseKey: string;
}): Promise<PromptCasePromptAccess> {
  const token = getBearerToken(params.request);
  if (!token) return { isAuthenticated: false, isMember: false };

  try {
    const supabase = createClient(params.supabaseUrl, params.supabaseKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    });
    const {
      data: { user },
      error
    } = await supabase.auth.getUser(token);
    if (error || !user) return { isAuthenticated: false, isMember: false };

    const access: PromptCasePromptAccess = {
      isAuthenticated: true,
      isMember: false
    };

    const { data: subscriptionCandidates, error: subscriptionError } =
      await supabase
        .from('user_subscriptions')
        .select('status,current_period_end')
        .eq('user_id', user.id)
        .in('status', [...SUBSCRIPTION_ACCESS_STATUSES])
        .order('created_at', { ascending: false });

    if (subscriptionError) return access;

    return {
      ...access,
      isMember: Boolean(findSubscriptionWithPaidAccess(subscriptionCandidates))
    };
  } catch {
    return { isAuthenticated: false, isMember: false };
  }
}

function readTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function pickLocalizedText(
  item: Record<string, unknown>,
  locale: string | undefined,
  fields: { zh: string; en: string; fallback: string }
): string {
  const zh = readTrimmedString(item[fields.zh]);
  const en = readTrimmedString(item[fields.en]);
  const fallback = readTrimmedString(item[fields.fallback]);
  if (locale === 'en-US') return en || fallback || zh;
  return zh || fallback || en;
}

function pickSinglePromptCaseRows(
  rows: Record<string, unknown>[],
  params: {
    caseId?: string;
    slug?: string;
    locale?: string;
  }
): Record<string, unknown>[] {
  if (!rows.length) return rows;
  if (params.locale === 'en-US' && params.caseId) {
    const englishMirror = rows.find(
      (row) =>
        readTrimmedString(row.source_case_id) === params.caseId &&
        (readTrimmedString(row.locale) === 'en-US' ||
          Boolean(readTrimmedString(row.prompt_en)) ||
          Boolean(readTrimmedString(row.title_en)))
    );
    if (englishMirror) return [englishMirror];
  }
  if (params.caseId) {
    const exact = rows.find(
      (row) => readTrimmedString(row.id) === params.caseId
    );
    if (exact) return [exact];
  }
  if (params.slug) {
    const exact = rows.find(
      (row) => readTrimmedString(row.slug) === params.slug
    );
    if (exact) return [exact];
  }
  return [rows[0]];
}

async function mapPromptCase(
  item: Record<string, unknown>,
  options: {
    access: PromptCasePromptAccess;
    exposePublicPrompt?: boolean;
    supabase: SupabaseClient;
    locale?: string;
    storageUrlMap?: Map<string, string>;
  }
) {
  const imageUrls = Array.isArray(item.image_urls)
    ? item.image_urls.filter((url): url is string => typeof url === 'string')
    : [];
  const imageUrl = typeof item.image_url === 'string' ? item.image_url : '';
  const normalizedImageUrls = Array.from(
    new Set([...imageUrls, imageUrl].map((url) => url.trim()).filter(Boolean))
  );
  const refreshedImageUrls = options.storageUrlMap
    ? normalizedImageUrls.map((url) => options.storageUrlMap?.get(url) ?? url)
    : await refreshSupabaseSignedStorageUrls(
        options.supabase,
        normalizedImageUrls
      );
  const availableImageUrls = refreshedImageUrls.filter(Boolean);
  const coverImageUrl = availableImageUrls[0] || '';
  const videoUrls = normalizeStringArray(item.video_urls);
  const videoUrl = typeof item.video_url === 'string' ? item.video_url : '';
  const normalizedVideoUrls = Array.from(
    new Set([...videoUrls, videoUrl].map((url) => url.trim()).filter(Boolean))
  );
  const refreshedVideoUrls = options.storageUrlMap
    ? normalizedVideoUrls.map((url) => options.storageUrlMap?.get(url) ?? url)
    : await refreshSupabaseSignedStorageUrls(
        options.supabase,
        normalizedVideoUrls
      );
  const availableVideoUrls = refreshedVideoUrls.filter(Boolean);
  const mediaType =
    typeof item.media_type === 'string' && item.media_type.trim()
      ? item.media_type.trim()
      : availableVideoUrls.length > 0
        ? 'video'
        : 'image';
  const memberOnly = item.members_only === true;
  const canViewPrompt =
    canViewPromptCasePromptForAccess(memberOnly, options.access) ||
    (options.exposePublicPrompt === true && !memberOnly);
  const titleZh = readTrimmedString(item.title_zh);
  const titleEn = readTrimmedString(item.title_en);
  const promptPreviewZh = readTrimmedString(item.prompt_preview_zh);
  const promptPreviewEn = readTrimmedString(item.prompt_preview_en);
  const promptZh = readTrimmedString(item.prompt_zh);
  const promptEn = readTrimmedString(item.prompt_en);
  const localizedPromptPreview = pickLocalizedText(item, options.locale, {
    zh: 'prompt_preview_zh',
    en: 'prompt_preview_en',
    fallback: 'prompt_preview'
  });
  const localizedPrompt = pickLocalizedText(item, options.locale, {
    zh: 'prompt_zh',
    en: 'prompt_en',
    fallback: 'prompt'
  });
  return {
    id: item.id,
    imageUrl: coverImageUrl,
    imageUrls: availableImageUrls,
    mediaType,
    videoUrl: availableVideoUrls[0] || '',
    videoUrls: availableVideoUrls,
    posterUrl: coverImageUrl || undefined,
    durationSeconds:
      Number(item.video_duration_seconds) > 0
        ? Number(item.video_duration_seconds)
        : undefined,
    uploadDate:
      readTrimmedString(item.video_upload_date) ||
      readTrimmedString(item.created_at) ||
      undefined,
    title: pickPromptCaseDisplayTitle(
      item,
      options.locale === 'en-US' ? 'en-US' : 'zh-CN',
      localizedPromptPreview || localizedPrompt
    ),
    titleZh: titleZh || undefined,
    titleEn: titleEn || undefined,
    slug:
      typeof item.slug === 'string' && item.slug.trim()
        ? item.slug.trim()
        : undefined,
    category:
      typeof item.category === 'string' && item.category.trim()
        ? item.category.trim()
        : 'featured',
    tags: normalizeTags(item.tags),
    model:
      typeof item.model === 'string' && item.model.trim()
        ? item.model.trim()
        : 'gemini-image',
    locale:
      typeof item.locale === 'string' && item.locale.trim()
        ? item.locale.trim()
        : 'zh-CN',
    sourceCaseId:
      typeof item.source_case_id === 'string' && item.source_case_id.trim()
        ? item.source_case_id.trim()
        : undefined,
    featured: Boolean(item.featured),
    memberOnly,
    packageSlug:
      typeof item.package_slug === 'string' && item.package_slug.trim()
        ? item.package_slug.trim()
        : undefined,
    commercialIntent:
      typeof item.commercial_intent === 'string' &&
      item.commercial_intent.trim()
        ? item.commercial_intent.trim()
        : undefined,
    promptPreview: localizedPromptPreview || undefined,
    promptPreviewZh: promptPreviewZh || undefined,
    promptPreviewEn: promptPreviewEn || undefined,
    visualRecipe: normalizeJsonObject(item.visual_recipe),
    sourceDraftId:
      typeof item.source_draft_id === 'string' && item.source_draft_id.trim()
        ? item.source_draft_id.trim()
        : undefined,
    viewCount: Number(item.view_count || 0),
    copyCount: Number(item.copy_count || 0),
    generateCount: Number(item.generate_count || 0),
    prompt: canViewPrompt ? localizedPrompt : '',
    promptZh: canViewPrompt ? promptZh || undefined : undefined,
    promptEn: canViewPrompt ? promptEn || undefined : undefined,
    promptLocked: !canViewPrompt,
    authorUrl: item.author_url || undefined,
    sortOrder: item.sort_order,
    isPublished: item.is_published,
    createdByEmail: item.created_by_email || undefined,
    createdAt: item.created_at,
    updatedAt: item.updated_at
  };
}

type PromptCaseResponse = Awaited<ReturnType<typeof mapPromptCase>>;

function collectPromptCaseStorageUrls(
  rows: Record<string, unknown>[]
): string[] {
  const urls = new Set<string>();
  rows.forEach((item) => {
    const values = [
      item.image_url,
      item.video_url,
      ...(Array.isArray(item.image_urls) ? item.image_urls : []),
      ...(Array.isArray(item.video_urls) ? item.video_urls : [])
    ];
    values.forEach((value) => {
      if (typeof value !== 'string') return;
      const trimmed = value.trim();
      if (trimmed) urls.add(trimmed);
    });
  });
  return Array.from(urls);
}

async function buildPromptCaseStorageUrlMap(
  supabase: SupabaseClient,
  rows: Record<string, unknown>[]
): Promise<Map<string, string>> {
  const urls = collectPromptCaseStorageUrls(rows);
  if (urls.length === 0) return new Map();

  const refreshedUrls = await refreshSupabaseSignedStorageUrls(supabase, urls);
  return new Map(urls.map((url, index) => [url, refreshedUrls[index] || '']));
}

export function promptCaseHasDisplayImage(input: {
  imageUrl?: string;
  imageUrls?: string[];
}): boolean {
  return Boolean(input.imageUrl?.trim() || input.imageUrls?.length);
}

function isFeaturedPromptCase(caseItem: PromptCaseResponse): boolean {
  return (
    Boolean(caseItem.featured) ||
    String(caseItem.category || '')
      .trim()
      .toLowerCase() === 'featured'
  );
}

function normalizePromptCaseSearchText(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map(normalizePromptCaseSearchText).join(' ');
  }
  if (typeof value === 'string') return value.trim().toLowerCase();
  if (value === null || value === undefined) return '';
  return String(value).trim().toLowerCase();
}

function getPromptCaseCreatedTime(caseItem: PromptCaseResponse): number {
  const value = caseItem.createdAt ? Date.parse(String(caseItem.createdAt)) : 0;
  return Number.isFinite(value) ? value : 0;
}

function getPromptCaseRawCreatedTime(item: Record<string, unknown>): number {
  const value = Date.parse(readTrimmedString(item.created_at));
  return Number.isFinite(value) ? value : 0;
}

function getPromptCaseSortOrder(caseItem: PromptCaseResponse): number {
  const value = Number(caseItem.sortOrder);
  return Number.isFinite(value) ? value : 0;
}

function getPromptCaseRawSortOrder(item: Record<string, unknown>): number {
  const value = Number(item.sort_order);
  return Number.isFinite(value) ? value : 0;
}

function isFeaturedPromptCaseRaw(item: Record<string, unknown>): boolean {
  return (
    item.featured === true ||
    readTrimmedString(item.category).toLowerCase() === 'featured'
  );
}

function sortPromptCasesByDisplayPriority(
  items: PromptCaseResponse[]
): PromptCaseResponse[] {
  return [...items].sort((a, b) => {
    const featuredDiff =
      Number(isFeaturedPromptCase(b)) - Number(isFeaturedPromptCase(a));
    if (featuredDiff !== 0) return featuredDiff;

    const explicitFeaturedDiff =
      Number(Boolean(b.featured)) - Number(Boolean(a.featured));
    if (explicitFeaturedDiff !== 0) return explicitFeaturedDiff;

    const sortOrderDiff = getPromptCaseSortOrder(a) - getPromptCaseSortOrder(b);
    if (sortOrderDiff !== 0) return sortOrderDiff;

    const createdDiff =
      getPromptCaseCreatedTime(b) - getPromptCaseCreatedTime(a);
    if (createdDiff !== 0) return createdDiff;

    return String(a.id || '').localeCompare(String(b.id || ''));
  });
}

function sortPromptCaseRowsByDisplayPriority(
  rows: Record<string, unknown>[]
): Record<string, unknown>[] {
  return [...rows].sort((a, b) => {
    const featuredDiff =
      Number(isFeaturedPromptCaseRaw(b)) - Number(isFeaturedPromptCaseRaw(a));
    if (featuredDiff !== 0) return featuredDiff;

    const explicitFeaturedDiff =
      Number(b.featured === true) - Number(a.featured === true);
    if (explicitFeaturedDiff !== 0) return explicitFeaturedDiff;

    const sortOrderDiff =
      getPromptCaseRawSortOrder(a) - getPromptCaseRawSortOrder(b);
    if (sortOrderDiff !== 0) return sortOrderDiff;

    const createdDiff =
      getPromptCaseRawCreatedTime(b) - getPromptCaseRawCreatedTime(a);
    if (createdDiff !== 0) return createdDiff;

    return readTrimmedString(a.id).localeCompare(readTrimmedString(b.id));
  });
}

function buildPromptCaseExactCounts(
  rows: Record<string, unknown>[],
  kind: 'model' | 'category'
): Record<string, number> {
  const counts: Record<string, number> = {};
  rows.forEach((item) => {
    incrementCount(
      counts,
      kind === 'model' ? item.model : item.category,
      kind === 'model' ? 'unknown' : 'featured'
    );
  });
  return counts;
}

function buildSeoPromptCaseStats(params: {
  navigationRows: Record<string, unknown>[];
  filteredRows: Record<string, unknown>[];
  model?: string;
  category?: string;
}): PromptCaseStats {
  const modelCounts = buildPromptCaseExactCounts(
    params.navigationRows,
    'model'
  );
  const categoryCounts = buildPromptCaseExactCounts(
    params.filteredRows,
    'category'
  );

  if (params.model) {
    modelCounts[params.model] = params.filteredRows.length;
  }
  if (params.category) {
    categoryCounts[params.category] = params.filteredRows.length;
  }

  return {
    total: params.filteredRows.length,
    navigationTotal: params.navigationRows.length,
    modelCounts,
    categoryCounts
  };
}

function isMissingPromptCasesTable(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const record = error as Record<string, unknown>;
  return (
    record.code === 'PGRST205' ||
    String(record.message || '').includes('prompt_cases')
  );
}

type PromptCaseSearchRpcPayload = {
  cases?: unknown;
  total?: unknown;
  navigationTotal?: unknown;
  modelCounts?: unknown;
  categoryCounts?: unknown;
};

type PromptLibrarySearchRpcPayload = {
  items?: unknown;
  total?: unknown;
  pageInfo?: unknown;
  facets?: unknown;
  queryEcho?: unknown;
  version?: unknown;
  source?: unknown;
};

type PromptCaseStats = {
  total: number;
  navigationTotal: number;
  modelCounts: Record<string, number>;
  categoryCounts: Record<string, number>;
};

type PromptCaseStatsRowsCache = {
  rows: Record<string, unknown>[];
  expiresAt: number;
};

const DEFAULT_PROMPT_CASE_STATS_CACHE_TTL_MS = 60_000;
let promptCaseStatsRowsCache: PromptCaseStatsRowsCache | null = null;

function getPromptCaseStatsCacheTtlMs(): number {
  const rawTtl = Number(
    process.env.PROMPT_CASE_STATS_CACHE_TTL_MS ||
      process.env.PROMPT_CASE_STATS_TTL_MS ||
      DEFAULT_PROMPT_CASE_STATS_CACHE_TTL_MS
  );
  if (!Number.isFinite(rawTtl)) return DEFAULT_PROMPT_CASE_STATS_CACHE_TTL_MS;
  return Math.min(Math.max(Math.round(rawTtl), 5_000), 300_000);
}

function getCachedPromptCaseStatsRows(): Record<string, unknown>[] | null {
  if (process.env.PROMPT_CASE_STATS_CACHE_DISABLED === 'true') return null;
  const cache = promptCaseStatsRowsCache;
  if (!cache || cache.expiresAt <= Date.now()) return null;
  return cache.rows;
}

function setCachedPromptCaseStatsRows(rows: Record<string, unknown>[]): void {
  if (process.env.PROMPT_CASE_STATS_CACHE_DISABLED === 'true') return;
  promptCaseStatsRowsCache = {
    rows,
    expiresAt: Date.now() + getPromptCaseStatsCacheTtlMs()
  };
}

function normalizeCountMap(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([key, count]) => [key, Number(count)])
      .filter(([, count]) => Number.isFinite(count))
  );
}

function normalizeRpcPayload(data: unknown): PromptCaseSearchRpcPayload | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  return data as PromptCaseSearchRpcPayload;
}

function normalizePromptLibraryRpcPayload(
  data: unknown
): PromptLibrarySearchRpcPayload | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const payload = data as PromptLibrarySearchRpcPayload;
  if (!Array.isArray(payload.items)) return null;
  return payload;
}

type PromptCaseSearchParams = {
  limit: number;
  locale?: string;
  category?: string;
  model?: string;
  tag?: string;
  packageSlug?: string;
  searchQuery?: string;
  featuredOnly?: boolean;
  requireImage?: boolean;
};

async function searchPromptCasesPublic(
  supabase: SupabaseClient,
  params: PromptCaseSearchParams
): Promise<PromptCaseSearchRpcPayload | null> {
  const { data, error } = await supabase.rpc('search_prompt_cases_public', {
    p_limit: params.limit,
    p_locale: params.locale || null,
    p_category: params.category || null,
    p_model: params.model || null,
    p_tag: params.tag || null,
    p_package_slug: params.packageSlug || null,
    p_search: params.searchQuery || null,
    p_featured_only: Boolean(params.featuredOnly),
    p_require_image: Boolean(params.requireImage)
  });
  if (error) {
    console.warn('[API] /content/prompt-cases RPC fallback:', error);
    return null;
  }
  return normalizeRpcPayload(data);
}

async function searchPromptLibraryPublic(
  supabase: SupabaseClient,
  params: PromptLibraryQuery & { requireImage?: boolean }
): Promise<PromptLibrarySearchRpcPayload | null> {
  if (process.env.PROMPT_LIBRARY_RPC_DISABLED === 'true') return null;

  const { data, error } = await supabase.rpc('search_prompt_library_public', {
    p_limit: params.limit,
    p_locale: params.locale || null,
    p_model: params.model || null,
    p_label: params.label || null,
    p_sort: params.sort || 'featured',
    p_cursor: params.cursor || null,
    p_search: params.q || null,
    p_require_image: params.requireImage !== false
  });
  if (error) {
    console.warn('[API] /content/prompt-cases library RPC fallback:', error);
    return null;
  }
  return normalizePromptLibraryRpcPayload(data);
}

function incrementCount(
  counts: Record<string, number>,
  key: unknown,
  fallback: string
): void {
  const normalized = typeof key === 'string' ? key.trim() : '';
  const finalKey = normalized || fallback;
  counts[finalKey] = (counts[finalKey] || 0) + 1;
}

function normalizeCountKey(key: unknown, fallback: string): string {
  const normalized = typeof key === 'string' ? key.trim() : '';
  return normalized || fallback;
}

const PROMPT_MODEL_COUNT_ROLLUPS: Record<string, string[]> = {
  'gpt-image-2': ['gpt-image-2', 'gpt image 2', 'gpt image2'],
  'nano-banana': ['nano-banana', 'nano banana', 'nanobanana'],
  flux: ['flux', 'flux ai'],
  seedream: [
    'seedream',
    'seedream-5-lite',
    'seedream-5.0-lite',
    'seedream-5-0-lite'
  ],
  'seedance-2-0': ['seedance-2-0', 'seedance 2.0', 'seedance'],
  'midjourney-alternative': [
    'midjourney-alternative',
    'midjourney',
    'midjourney-v7',
    'midjourney-niji-v7',
    'mj'
  ]
};

function setMaxCount(
  counts: Record<string, number>,
  key: string,
  count: number
): void {
  if (!Number.isFinite(count) || count <= 0) return;
  counts[key] = Math.max(counts[key] || 0, count);
}

function compactPromptModelCountText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/gu, '');
}

function promptCaseMatchesModelCountSlug(
  item: Record<string, unknown>,
  slug: string
): boolean {
  const aliases = [slug, ...getPromptSeoModelAliases(slug)]
    .map(compactPromptModelCountText)
    .filter(Boolean);
  if (aliases.length === 0) return false;

  const model = compactPromptModelCountText(item.model);
  if (model && aliases.includes(model)) return true;

  const tagMatches = normalizeTags(item.tags).some((tag) => {
    const compactTag = compactPromptModelCountText(tag);
    return aliases.includes(compactTag);
  });
  if (tagMatches) return true;

  const searchableText = [
    item.title,
    item.title_zh,
    item.titleZh,
    item.title_en,
    item.titleEn,
    item.category,
    item.package_slug,
    item.packageSlug,
    item.commercial_intent,
    item.commercial_intent_zh,
    item.commercialIntentZh,
    item.commercial_intent_en,
    item.commercialIntentEn,
    item.commercialIntent,
    item.prompt_preview,
    item.prompt_preview_zh,
    item.promptPreviewZh,
    item.prompt_preview_en,
    item.promptPreviewEn,
    item.promptPreview
  ]
    .map(compactPromptModelCountText)
    .filter(Boolean)
    .join(' ');

  return (
    aliases.some((alias) => searchableText.includes(alias)) ||
    promptSeoCaseMatches(item, 'model', slug)
  );
}

function buildPromptCaseModelNavigationCounts(
  baseCounts: unknown,
  rows: Record<string, unknown>[] = []
): Record<string, number> {
  const counts = normalizeCountMap(baseCounts);

  Object.entries(PROMPT_MODEL_COUNT_ROLLUPS).forEach(([slug, aliases]) => {
    const sum = aliases.reduce((total, alias) => {
      const count = Number(counts[alias]);
      return total + (Number.isFinite(count) ? count : 0);
    }, 0);
    setMaxCount(counts, slug, sum);
  });

  if (rows.length > 0) {
    const seoCounts: Record<string, number> = {};
    const modelSlugs = getPromptSeoModelSlugs();
    rows.forEach((item) => {
      modelSlugs.forEach((slug) => {
        if (promptCaseMatchesModelCountSlug(item, slug)) {
          incrementCount(seoCounts, slug, 'unknown');
        }
      });
    });
    Object.entries(seoCounts).forEach(([slug, count]) => {
      setMaxCount(counts, slug, count);
    });
  }

  return counts;
}

function promptCaseRawHasDisplayImage(item: Record<string, unknown>): boolean {
  const imageUrl = readTrimmedString(item.image_url);
  const imageUrls = Array.isArray(item.image_urls)
    ? item.image_urls.filter((url) => typeof url === 'string' && url.trim())
    : [];
  return Boolean(imageUrl || imageUrls.length);
}

function promptCaseRawMatchesLocale(
  item: Record<string, unknown>,
  locale: string | undefined
): boolean {
  if (!locale) return true;
  if (readTrimmedString(item.locale) === locale) return true;
  if (locale === 'zh-CN') {
    return Boolean(
      readTrimmedString(item.title_zh) ||
      readTrimmedString(item.prompt_zh) ||
      readTrimmedString(item.prompt_preview_zh)
    );
  }
  if (locale === 'en-US') {
    return Boolean(
      readTrimmedString(item.title_en) ||
      readTrimmedString(item.prompt_en) ||
      readTrimmedString(item.prompt_preview_en)
    );
  }
  return false;
}

function promptCaseRawMatchesPackage(
  item: Record<string, unknown>,
  packageSlug: string | undefined
): boolean {
  if (!packageSlug) return true;
  const normalized = packageSlug.trim().toLowerCase();
  return readTrimmedString(item.package_slug).toLowerCase() === normalized;
}

function promptCaseRawMatchesTag(
  item: Record<string, unknown>,
  tag: string | undefined
): boolean {
  if (!tag) return true;
  if (tag.trim().toLowerCase() === 'sref') {
    return promptSeoCaseMatches(item, 'category', 'sref-prompts');
  }
  const normalized = tag.trim().toLowerCase();
  return normalizeTags(item.tags).some(
    (value) => value.toLowerCase() === normalized
  );
}

function promptCaseRawMatchesSearch(
  item: Record<string, unknown>,
  searchQuery: string
): boolean {
  const query = searchQuery.trim().toLowerCase();
  if (!query) return true;
  const searchableText = [
    item.title,
    item.title_zh,
    item.title_en,
    item.slug,
    item.category,
    item.model,
    item.package_slug,
    item.commercial_intent,
    item.prompt_preview,
    item.prompt_preview_zh,
    item.prompt_preview_en,
    item.prompt,
    item.prompt_zh,
    item.prompt_en,
    item.tags
  ]
    .map(normalizePromptCaseSearchText)
    .filter(Boolean)
    .join(' ');
  return searchableText.includes(query);
}

function promptCaseRawMatchesFeatured(
  item: Record<string, unknown>,
  featuredOnly: boolean
): boolean {
  if (!featuredOnly) return true;
  return (
    item.featured === true ||
    readTrimmedString(item.category).toLowerCase() === 'featured'
  );
}

function promptCaseRawMatchesCategory(
  item: Record<string, unknown>,
  category: string | undefined
): boolean {
  if (!category) return true;
  return promptSeoCaseMatches(item, 'category', category);
}

function promptCaseRawMatchesModel(
  item: Record<string, unknown>,
  model: string | undefined
): boolean {
  if (!model) return true;
  return promptSeoCaseMatches(item, 'model', model);
}

function readPromptLibraryNumber(
  item: Record<string, unknown>,
  keys: string[]
): number {
  for (const key of keys) {
    const value = Number(item[key]);
    if (Number.isFinite(value)) return value;
  }
  return 0;
}

function getPromptLibraryCreatedTime(item: Record<string, unknown>): number {
  const value = Date.parse(
    readTrimmedString(item.published_at) ||
      readTrimmedString(item.created_at) ||
      readTrimmedString(item.createdAt)
  );
  return Number.isFinite(value) ? value : 0;
}

function getPromptLibraryFeaturedRank(item: Record<string, unknown>): number {
  const value = readPromptLibraryNumber(item, [
    'featured_rank',
    'sort_order',
    'sortOrder'
  ]);
  return Number.isFinite(value) ? value : 0;
}

function getPromptLibraryHotScore(item: Record<string, unknown>): number {
  const persisted = readPromptLibraryNumber(item, ['hot_score', 'hotScore']);
  if (persisted > 0) return persisted;
  const views = readPromptLibraryNumber(item, ['view_count', 'viewCount']);
  const copies = readPromptLibraryNumber(item, ['copy_count', 'copyCount']);
  const generates = readPromptLibraryNumber(item, [
    'generate_count',
    'generateCount'
  ]);
  const favorites = readPromptLibraryNumber(item, [
    'favorite_count',
    'favoriteCount'
  ]);
  return (
    Math.log1p(views) * 0.35 +
    Math.log1p(copies) * 0.25 +
    Math.log1p(generates) * 0.25 +
    Math.log1p(favorites) * 0.15 +
    Number(isFeaturedPromptCaseRaw(item)) * 0.75
  );
}

function sortPromptLibraryRows(
  rows: Record<string, unknown>[],
  sort: PromptLibrarySort
): Record<string, unknown>[] {
  return [...rows].sort((a, b) => {
    if (sort === 'latest') {
      const createdDiff =
        getPromptLibraryCreatedTime(b) - getPromptLibraryCreatedTime(a);
      if (createdDiff !== 0) return createdDiff;
      return readTrimmedString(b.id).localeCompare(readTrimmedString(a.id));
    }

    if (sort === 'hot') {
      const hotDiff = getPromptLibraryHotScore(b) - getPromptLibraryHotScore(a);
      if (hotDiff !== 0) return hotDiff;
      const createdDiff =
        getPromptLibraryCreatedTime(b) - getPromptLibraryCreatedTime(a);
      if (createdDiff !== 0) return createdDiff;
      return readTrimmedString(b.id).localeCompare(readTrimmedString(a.id));
    }

    const featuredDiff =
      Number(isFeaturedPromptCaseRaw(b)) - Number(isFeaturedPromptCaseRaw(a));
    if (featuredDiff !== 0) return featuredDiff;
    const rankDiff =
      getPromptLibraryFeaturedRank(a) - getPromptLibraryFeaturedRank(b);
    if (rankDiff !== 0) return rankDiff;
    const createdDiff =
      getPromptLibraryCreatedTime(b) - getPromptLibraryCreatedTime(a);
    if (createdDiff !== 0) return createdDiff;
    return readTrimmedString(a.id).localeCompare(readTrimmedString(b.id));
  });
}

function comparePromptLibraryRows(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
  sort: PromptLibrarySort
): number {
  if (sort === 'latest') {
    const createdDiff =
      getPromptLibraryCreatedTime(b) - getPromptLibraryCreatedTime(a);
    if (createdDiff !== 0) return createdDiff;
    return readTrimmedString(b.id).localeCompare(readTrimmedString(a.id));
  }

  if (sort === 'hot') {
    const hotDiff = getPromptLibraryHotScore(b) - getPromptLibraryHotScore(a);
    if (hotDiff !== 0) return hotDiff;
    const createdDiff =
      getPromptLibraryCreatedTime(b) - getPromptLibraryCreatedTime(a);
    if (createdDiff !== 0) return createdDiff;
    return readTrimmedString(b.id).localeCompare(readTrimmedString(a.id));
  }

  const featuredDiff =
    Number(isFeaturedPromptCaseRaw(b)) - Number(isFeaturedPromptCaseRaw(a));
  if (featuredDiff !== 0) return featuredDiff;
  const rankDiff =
    getPromptLibraryFeaturedRank(a) - getPromptLibraryFeaturedRank(b);
  if (rankDiff !== 0) return rankDiff;
  const createdDiff =
    getPromptLibraryCreatedTime(b) - getPromptLibraryCreatedTime(a);
  if (createdDiff !== 0) return createdDiff;
  return readTrimmedString(a.id).localeCompare(readTrimmedString(b.id));
}

function buildPromptLibraryCursor(
  row: Record<string, unknown> | undefined,
  sort: PromptLibrarySort
): string | null {
  if (!row) return null;
  const createdTime = getPromptLibraryCreatedTime(row);
  return [
    'cursor:v1',
    sort,
    isFeaturedPromptCaseRaw(row) ? '1' : '0',
    String(getPromptLibraryFeaturedRank(row)),
    String(getPromptLibraryHotScore(row)),
    String(createdTime > 0 ? createdTime : 0),
    encodeURIComponent(readTrimmedString(row.id))
  ].join(':');
}

function parsePromptLibraryCursor(
  cursor: string | null,
  sort: PromptLibrarySort
): { offset: number } | { row: Record<string, unknown> } {
  if (!cursor) return { offset: 0 };
  const match = cursor.trim().match(/^offset:(\d+)$/);
  if (match) {
    const offset = Number(match[1]);
    return { offset: Number.isFinite(offset) && offset > 0 ? offset : 0 };
  }

  if (!cursor.startsWith('cursor:v1:')) return { offset: 0 };
  try {
    const parts = cursor.split(':');
    if (parts.length < 8 || parts[2] !== sort) return { offset: 0 };
    const publishedMs = Number(parts[6]);
    const id = decodeURIComponent(parts.slice(7).join(':'));
    if (!id) return { offset: 0 };
    return {
      row: {
        id,
        featured: parts[3] === '1',
        featured_rank: Number(parts[4]) || 0,
        hot_score: Number(parts[5]) || 0,
        published_at:
          Number.isFinite(publishedMs) && publishedMs > 0
            ? new Date(publishedMs).toISOString()
            : ''
      }
    };
  } catch {
    return { offset: 0 };
  }
}

function buildPromptLibraryFacets(params: {
  rowsForModelFacets: Record<string, unknown>[];
  rowsForLabelFacets: Record<string, unknown>[];
  locale: string;
  activeModel?: string;
  activeLabel?: string;
  activeSort: PromptLibrarySort;
}): {
  models: PromptLibraryFacet[];
  labels: PromptLibraryFacet[];
  sorts: Array<{ slug: PromptLibrarySort; label: string; active: boolean }>;
} {
  const modelCounts: Record<string, number> = {};
  params.rowsForModelFacets.forEach((item) => {
    incrementCount(modelCounts, getPromptLibraryModelSlug(item), 'unknown');
  });

  const labelCounts: Record<string, number> = {};
  params.rowsForLabelFacets.forEach((item) => {
    getPromptLibraryLabelSlugs(item).forEach((slug) =>
      incrementCount(labelCounts, slug, 'unknown')
    );
  });

  return {
    models: PROMPT_LIBRARY_MODELS.map((definition) => ({
      slug: definition.slug,
      label: getPromptLibraryFacetLabel(definition, params.locale),
      count: modelCounts[definition.slug] || 0,
      active: params.activeModel === definition.slug
    })),
    labels: PROMPT_LIBRARY_LABELS.map((definition) => ({
      slug: definition.slug,
      label: getPromptLibraryFacetLabel(definition, params.locale),
      count: labelCounts[definition.slug] || 0,
      active: params.activeLabel === definition.slug
    })),
    sorts: PROMPT_LIBRARY_SORTS.map((definition) => ({
      slug: definition.slug,
      label: getPromptLibraryFacetLabel(definition, params.locale),
      active: params.activeSort === definition.slug
    }))
  };
}

async function buildPromptLibraryResponse(params: {
  supabase: SupabaseClient;
  promptAccess: PromptCasePromptAccess;
  corsHeaders: Record<string, string>;
  limit: number;
  locale: string;
  model?: string;
  label?: string;
  sort: PromptLibrarySort;
  searchQuery: string;
  cursor: string | null;
  requireImage: boolean;
  mediaType?: 'image' | 'video';
  seoOnly: boolean;
  debug: boolean;
}): Promise<Response> {
  const startedAt = Date.now();
  const model = canonicalizePromptLibraryModel(params.model);
  const label = canonicalizePromptLibraryLabel(params.label);
  const queryEcho: PromptLibraryQuery = {
    locale: params.locale || 'zh-CN',
    model: model || undefined,
    label: label || undefined,
    mediaType: params.mediaType,
    seoOnly: params.seoOnly,
    sort: params.sort,
    q: params.searchQuery || undefined,
    cursor: params.cursor || undefined,
    limit: params.limit
  };
  // Always prefer the public search RPC (fresh Supabase reads). When
  // mediaType/seoOnly are requested, the RPC result is enriched with the SEO
  // columns below and filtered, instead of relying on the 20k-row stats
  // snapshot which can serve stale rows through Hyperdrive query caching.
  const rpcPayload = await searchPromptLibraryPublic(params.supabase, {
    ...queryEcho,
    requireImage: params.requireImage
  });

  if (rpcPayload && Array.isArray(rpcPayload.items)) {
    let responseRows = rpcPayload.items as Record<string, unknown>[];
    if (params.seoOnly || params.mediaType) {
      const ids = responseRows
        .map((item) => readTrimmedString(item.id))
        .filter(Boolean);
      if (ids.length > 0) {
        const { data: seoRows, error: seoRowsError } = await params.supabase
          .from('prompt_cases')
          .select(
            'id,seo_status,seo_reviewed_at,seo_evidence,media_type,video_duration_seconds,video_upload_date,video_url,video_urls,image_url,image_urls,is_published,deleted_at,members_only,slug,title,title_zh,title_en,prompt,prompt_zh,prompt_en,prompt_preview,prompt_preview_zh,prompt_preview_en,commercial_intent,model,created_at'
          )
          .in('id', ids);
        if (seoRowsError) {
          console.warn(
            '[API] /content/prompt-cases SEO metadata unavailable:',
            seoRowsError
          );
          responseRows = params.seoOnly ? [] : responseRows;
        } else {
          const seoById = new Map(
            ((seoRows || []) as Record<string, unknown>[]).map((item) => [
              readTrimmedString(item.id),
              item
            ])
          );
          responseRows = responseRows
            .map((item) => ({
              ...item,
              ...(seoById.get(readTrimmedString(item.id)) || {})
            }))
            .filter((item) =>
              params.mediaType
                ? readTrimmedString(item.media_type) === params.mediaType
                : true
            )
            .filter((item) =>
              params.seoOnly
                ? isPromptCaseSeoIndexable(item, { allowLegacy: false })
                : true
            );
        }
      } else {
        responseRows = [];
      }
    }
    const storageUrlMap = await buildPromptCaseStorageUrlMap(
      params.supabase,
      responseRows
    );
    const items = await Promise.all(
      responseRows.map((item) =>
        mapPromptCase(item, {
          access: params.promptAccess,
          supabase: params.supabase,
          locale: params.locale,
          storageUrlMap
        })
      )
    );
    const hasSignedImageUrls = items.some((item) =>
      [item.imageUrl, ...item.imageUrls].some((url) =>
        isSupabaseSignedStorageUrl(url)
      )
    );

    return jsonResponse(
      {
        items,
        // seoOnly/mediaType responses are filtered to the current RPC page,
        // so total reflects the returned page size, not the full match count.
        total:
          params.seoOnly || params.mediaType
            ? items.length
            : Number(rpcPayload.total) || items.length,
        pageInfo:
          rpcPayload.pageInfo &&
          typeof rpcPayload.pageInfo === 'object' &&
          !Array.isArray(rpcPayload.pageInfo)
            ? rpcPayload.pageInfo
            : { nextCursor: null, hasMore: false },
        facets:
          rpcPayload.facets &&
          typeof rpcPayload.facets === 'object' &&
          !Array.isArray(rpcPayload.facets)
            ? rpcPayload.facets
            : buildPromptLibraryFacets({
                rowsForModelFacets: [],
                rowsForLabelFacets: [],
                locale: params.locale,
                activeModel: model || undefined,
                activeLabel: label || undefined,
                activeSort: params.sort
              }),
        queryEcho:
          rpcPayload.queryEcho &&
          typeof rpcPayload.queryEcho === 'object' &&
          !Array.isArray(rpcPayload.queryEcho)
            ? {
                ...queryEcho,
                ...(rpcPayload.queryEcho as Record<string, unknown>)
              }
            : queryEcho,
        version: 'prompt-library-v2',
        source: 'rpc',
        ...(params.debug
          ? {
              debug: {
                timingMs: Date.now() - startedAt,
                rowCount: responseRows.length,
                queryHash: [
                  queryEcho.locale,
                  queryEcho.model || 'all-models',
                  queryEcho.label || 'all-labels',
                  queryEcho.sort,
                  queryEcho.q || 'all-search',
                  queryEcho.cursor || 'first',
                  queryEcho.limit
                ].join(':'),
                facetVersion: 'prompt-library-v2-rpc'
              }
            }
          : {})
      },
      params.corsHeaders,
      200,
      params.promptAccess.isAuthenticated
        ? {
            'Cache-Control': 'no-store',
            Vary: 'Authorization'
          }
        : hasSignedImageUrls
          ? {
              'Cache-Control': 'no-store',
              Vary: 'Authorization'
            }
          : {
              'Cache-Control':
                'public, max-age=300, stale-while-revalidate=1800',
              Vary: 'Authorization'
            }
    );
  }

  const rows = await loadPromptCaseStatsRows(params.supabase);
  if (rpcPayload === null && rows.length === 0) {
    // Both the library RPC and the stats fallback produced no rows. This is an
    // upstream (Supabase) failure, not a legitimately empty library — do not
    // return a cacheable 200-empty response that blanks the prompt library.
    console.error(
      '[API] /content/prompt-cases library RPC and stats fallback both unavailable'
    );
    return jsonResponse(
      {
        error: '案例库暂时不可用，请稍后重试。',
        items: [],
        total: 0,
        pageInfo: { nextCursor: null, hasMore: false }
      },
      params.corsHeaders,
      502,
      { 'Cache-Control': 'no-store', Vary: 'Authorization' }
    );
  }
  const baseRows = rows.filter((item) => {
    if (!promptCaseRawMatchesLocale(item, params.locale || undefined)) {
      return false;
    }
    if (!promptCaseRawMatchesSearch(item, params.searchQuery)) return false;
    if (params.requireImage && !promptCaseRawHasDisplayImage(item))
      return false;
    if (
      params.mediaType &&
      readTrimmedString(item.media_type) !== params.mediaType
    ) {
      return false;
    }
    if (
      params.seoOnly &&
      !isPromptCaseSeoIndexable(item, { allowLegacy: false })
    ) {
      return false;
    }
    return true;
  });
  const rowsForModelFacets = baseRows.filter((item) => {
    if (!label) return true;
    return getPromptLibraryLabelSlugs(item).includes(label);
  });
  const rowsForLabelFacets = baseRows.filter((item) => {
    if (!model) return true;
    return getPromptLibraryModelSlug(item) === model;
  });
  const filteredRows = baseRows.filter((item) => {
    if (model && getPromptLibraryModelSlug(item) !== model) return false;
    if (label && !getPromptLibraryLabelSlugs(item).includes(label)) {
      return false;
    }
    return true;
  });
  const sortedRows = sortPromptLibraryRows(filteredRows, params.sort);
  const parsedCursor = parsePromptLibraryCursor(params.cursor, params.sort);
  const cursorRows =
    'row' in parsedCursor
      ? sortedRows.filter(
          (row) =>
            comparePromptLibraryRows(row, parsedCursor.row, params.sort) > 0
        )
      : sortedRows.slice(parsedCursor.offset);
  const pageRows = cursorRows.slice(0, params.limit);
  const hasMore = pageRows.length < cursorRows.length;
  const storageUrlMap = await buildPromptCaseStorageUrlMap(
    params.supabase,
    pageRows
  );
  const items = await Promise.all(
    pageRows.map((item) =>
      mapPromptCase(item, {
        access: params.promptAccess,
        supabase: params.supabase,
        locale: params.locale,
        storageUrlMap
      })
    )
  );
  const hasSignedImageUrls = items.some((item) =>
    [item.imageUrl, ...item.imageUrls].some((url) =>
      isSupabaseSignedStorageUrl(url)
    )
  );

  return jsonResponse(
    {
      items,
      total: filteredRows.length,
      pageInfo: {
        nextCursor: hasMore
          ? buildPromptLibraryCursor(pageRows[pageRows.length - 1], params.sort)
          : null,
        hasMore
      },
      facets: buildPromptLibraryFacets({
        rowsForModelFacets,
        rowsForLabelFacets,
        locale: params.locale,
        activeModel: model || undefined,
        activeLabel: label || undefined,
        activeSort: params.sort
      }),
      queryEcho,
      version: 'prompt-library-v2',
      source: 'fallback',
      ...(params.debug
        ? {
            debug: {
              timingMs: Date.now() - startedAt,
              baseRowCount: baseRows.length,
              filteredRowCount: filteredRows.length,
              queryHash: [
                queryEcho.locale,
                queryEcho.model || 'all-models',
                queryEcho.label || 'all-labels',
                queryEcho.sort,
                queryEcho.q || 'all-search',
                queryEcho.cursor || 'first',
                queryEcho.limit
              ].join(':'),
              facetVersion: 'prompt-library-v2-canonical-labels'
            }
          }
        : {})
    },
    params.corsHeaders,
    200,
    params.promptAccess.isAuthenticated
      ? {
          'Cache-Control': 'no-store',
          Vary: 'Authorization'
        }
      : hasSignedImageUrls
        ? {
            'Cache-Control': 'no-store',
            Vary: 'Authorization'
          }
        : {
            'Cache-Control': 'public, max-age=300, stale-while-revalidate=1800',
            Vary: 'Authorization'
          }
  );
}

export function buildPromptCaseStats(
  rows: Record<string, unknown>[],
  options: {
    category?: string;
    model?: string;
    tag?: string;
    packageSlug?: string;
    locale?: string;
    searchQuery?: string;
    requireImage?: boolean;
    featuredOnly?: boolean;
  }
): PromptCaseStats {
  const navigationRows = rows.filter((item) => {
    if (!promptCaseRawMatchesLocale(item, options.locale)) return false;
    if (options.requireImage && !promptCaseRawHasDisplayImage(item)) {
      return false;
    }
    if (!promptCaseRawMatchesFeatured(item, Boolean(options.featuredOnly))) {
      return false;
    }
    if (!promptCaseRawMatchesPackage(item, options.packageSlug)) return false;
    if (!promptCaseRawMatchesTag(item, options.tag)) return false;
    if (!promptCaseRawMatchesSearch(item, options.searchQuery || '')) {
      return false;
    }
    if (!promptCaseRawMatchesCategory(item, options.category)) return false;
    return true;
  });
  const filteredRows = navigationRows.filter((item) =>
    promptCaseRawMatchesModel(item, options.model)
  );
  const modelCounts: Record<string, number> = {};
  const categoryCounts: Record<string, number> = {};
  const modelSlugs = getPromptSeoModelSlugs();
  const categorySlugs = getPromptSeoCategorySlugs();

  navigationRows.forEach((item) => {
    const keys = new Set<string>([normalizeCountKey(item.model, 'unknown')]);
    modelSlugs.forEach((slug) => {
      if (promptSeoCaseMatches(item, 'model', slug)) {
        keys.add(normalizeCountKey(slug, 'unknown'));
      }
    });
    keys.forEach((key) => incrementCount(modelCounts, key, 'unknown'));
  });

  filteredRows.forEach((item) => {
    const keys = new Set<string>([
      normalizeCountKey(item.category, 'featured')
    ]);
    categorySlugs.forEach((slug) => {
      if (promptSeoCaseMatches(item, 'category', slug)) {
        keys.add(normalizeCountKey(slug, 'featured'));
      }
    });
    keys.forEach((key) => incrementCount(categoryCounts, key, 'featured'));
  });

  return {
    total: filteredRows.length,
    navigationTotal: navigationRows.length,
    modelCounts,
    categoryCounts
  };
}

async function loadPromptCaseStatsRows(
  supabase: SupabaseClient
): Promise<Record<string, unknown>[]> {
  const cachedRows = getCachedPromptCaseStatsRows();
  if (cachedRows) return cachedRows;

  const hyperdriveRows = await loadPromptCaseStatsRowsFromHyperdrive();
  if (hyperdriveRows) {
    setCachedPromptCaseStatsRows(hyperdriveRows);
    return hyperdriveRows;
  }

  const rows: Record<string, unknown>[] = [];
  const pageSize = 1000;
  const maxStatsRows = 20000;
  let completed = false;

  for (let offset = 0; offset < maxStatsRows; offset += pageSize) {
    const { data, error } = await supabase
      .from('prompt_cases')
      .select('*')
      .eq('is_published', true)
      .is('deleted_at', null)
      .is('source_case_id', null)
      .order('featured', { ascending: false })
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (error) {
      console.warn('[API] /content/prompt-cases stats unavailable:', error);
      return rows;
    }

    const pageRows = (data || []) as Record<string, unknown>[];
    rows.push(...pageRows);
    if (pageRows.length < pageSize) {
      completed = true;
      break;
    }
  }

  if (rows.length >= maxStatsRows) {
    console.warn(
      `[API] /content/prompt-cases stats capped at ${maxStatsRows} rows`
    );
  }

  if (completed || rows.length >= maxStatsRows) {
    setCachedPromptCaseStatsRows(rows);
  }

  return rows;
}

async function loadPromptCaseStatsRowsFromHyperdrive(): Promise<
  Record<string, unknown>[] | null
> {
  if (process.env.WEBTOMIND_RUNTIME !== 'cloudflare-worker') return null;
  if (process.env.HYPERDRIVE_PUBLIC_STATS_ENABLED !== 'true') return null;
  const connectionString = process.env.HYPERDRIVE_CONNECTION_STRING;
  if (!connectionString) return null;

  let client: import('pg').Client | null = null;
  try {
    const { Client } = await import('pg');
    client = new Client({
      connectionString,
      connectionTimeoutMillis: 5_000,
      query_timeout: 10_000
    });
    await client.connect();
    const result = await client.query<Record<string, unknown>>(`
      SELECT *
      FROM public.prompt_cases
      WHERE is_published = true
        AND deleted_at IS NULL
        AND source_case_id IS NULL
      ORDER BY featured DESC, sort_order ASC, created_at DESC
      LIMIT 20000
    `);
    if (result.rows.length >= 20000) {
      console.warn(
        '[API] /content/prompt-cases Hyperdrive stats capped at 20000 rows'
      );
    }
    return result.rows;
  } catch (error) {
    console.warn(
      '[API] /content/prompt-cases Hyperdrive stats fallback:',
      error
    );
    return null;
  } finally {
    if (client) {
      await client.end().catch(() => undefined);
    }
  }
}

export default async function handler(request: Request) {
  const corsHeaders = getCorsHeadersForRequest(request);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== 'GET') {
    return jsonResponse(
      { error: 'Method not allowed', cases: [] },
      corsHeaders,
      405
    );
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return jsonResponse(
      { error: 'Supabase is not configured', cases: [] },
      corsHeaders,
      503
    );
  }

  const url = new URL(request.url);
  const caseId = url.searchParams.get('id')?.trim();
  const slug = url.searchParams.get('slug')?.trim();
  const category = url.searchParams.get('category')?.trim();
  const model = url.searchParams.get('model')?.trim();
  const label =
    url.searchParams.get('label')?.trim() ||
    url.searchParams.get('category')?.trim();
  const sort = normalizePromptLibrarySort(url.searchParams.get('sort'));
  const cursor = url.searchParams.get('cursor')?.trim() || null;
  const tag = url.searchParams.get('tag')?.trim();
  const packageSlug = url.searchParams.get('packageSlug')?.trim();
  const locale = url.searchParams.get('locale')?.trim();
  const isPromptLibraryRequest = ['1', 'true', 'yes'].includes(
    (url.searchParams.get('library') || '').trim().toLowerCase()
  );
  const shouldExposePublicPrompt =
    ['1', 'true', 'yes'].includes(
      (url.searchParams.get('includePrompt') || '').trim().toLowerCase()
    ) && Boolean(caseId || slug);
  const wantsPromptLibraryDebug = ['1', 'true', 'yes'].includes(
    (url.searchParams.get('debug') || '').trim().toLowerCase()
  );
  const searchQuery =
    url.searchParams.get('q')?.trim() ||
    url.searchParams.get('search')?.trim() ||
    '';
  const featuredOnly = ['1', 'true', 'yes'].includes(
    (url.searchParams.get('featured') || '').trim().toLowerCase()
  );
  const requireImage =
    !caseId &&
    !slug &&
    ['1', 'true', 'yes'].includes(
      (url.searchParams.get('requireImage') || '').trim().toLowerCase()
    );
  const requestedMediaType = url.searchParams.get('mediaType')?.trim();
  const mediaType =
    requestedMediaType === 'image' || requestedMediaType === 'video'
      ? requestedMediaType
      : undefined;
  const seoOnly = ['1', 'true', 'yes'].includes(
    (url.searchParams.get('seoOnly') || '').trim().toLowerCase()
  );
  const usesSeoModelFilter = hasPromptSeoModelMatcher(model);
  const usesSeoCategoryFilter = hasPromptSeoCategoryMatcher(category);
  const limit = Math.min(
    parseInt(url.searchParams.get('limit') || '100', 10) || 100,
    1000
  );
  const supabase = createClient(supabaseUrl, supabaseKey);
  const isSingleCaseLookup = Boolean(caseId || slug);
  const promptAccess = isSingleCaseLookup
    ? await getPromptCasePromptAccess({
        request,
        supabaseUrl,
        supabaseKey
      })
    : { isAuthenticated: false, isMember: false };

  if (isPromptLibraryRequest && !isSingleCaseLookup) {
    return buildPromptLibraryResponse({
      supabase,
      promptAccess,
      corsHeaders,
      limit,
      locale: locale || 'zh-CN',
      model: model || undefined,
      label: label || undefined,
      sort,
      searchQuery,
      cursor,
      requireImage,
      mediaType,
      seoOnly,
      debug: wantsPromptLibraryDebug
    });
  }

  const canUseDatabaseSearch =
    !caseId &&
    !slug &&
    (!model || !usesSeoModelFilter) &&
    (!category || !usesSeoCategoryFilter);
  if (canUseDatabaseSearch) {
    const payload = await searchPromptCasesPublic(supabase, {
      limit,
      locale: locale || undefined,
      category: category || undefined,
      model: model || undefined,
      tag: tag || undefined,
      packageSlug: packageSlug || undefined,
      searchQuery,
      featuredOnly,
      requireImage
    });
    if (!payload || !Array.isArray(payload.cases)) {
      // The underlying Supabase read failed (e.g. PostgREST outage). Do not
      // report a successful-but-empty list: that blanks the UI and poisons the
      // CDN cache for max-age=300. Surface a temporary 502 instead so clients
      // can show an error/retry state and recover as soon as the source is back.
      console.error(
        '[API] /content/prompt-cases search RPC failed or returned an unexpected payload'
      );
      return jsonResponse(
        {
          error: '案例库暂时不可用，请稍后重试。',
          cases: [],
          total: 0,
          navigationTotal: 0,
          modelCounts: {},
          categoryCounts: {}
        },
        corsHeaders,
        502,
        { 'Cache-Control': 'no-store', Vary: 'Authorization' }
      );
    }
    if (payload && Array.isArray(payload.cases)) {
      const responseRows = payload.cases as Record<string, unknown>[];
      const storageUrlMap = new Map<string, string>();
      const mappedCases = await Promise.all(
        responseRows.map((item) =>
          mapPromptCase(item, {
            access: promptAccess,
            supabase,
            locale,
            storageUrlMap
          })
        )
      );
      const cases = sortPromptCasesByDisplayPriority(mappedCases);
      const statsRows: Record<string, unknown>[] = [];
      const stats = buildPromptCaseStats(statsRows, {
        category: category || undefined,
        model: model || undefined,
        tag: tag || undefined,
        packageSlug: packageSlug || undefined,
        locale: locale || undefined,
        searchQuery,
        requireImage,
        featuredOnly
      });
      const hasSignedImageUrls = cases.some((item) =>
        [item.imageUrl, ...item.imageUrls].some((url) =>
          isSupabaseSignedStorageUrl(url)
        )
      );

      return jsonResponse(
        {
          cases,
          total:
            statsRows.length > 0
              ? stats.total
              : Number(payload.total) || cases.length,
          navigationTotal:
            statsRows.length > 0
              ? stats.navigationTotal
              : Number(payload.navigationTotal) ||
                Number(payload.total) ||
                cases.length,
          modelCounts:
            statsRows.length > 0
              ? buildPromptCaseModelNavigationCounts(
                  stats.modelCounts,
                  statsRows
                )
              : buildPromptCaseModelNavigationCounts(
                  payload.modelCounts,
                  responseRows
                ),
          categoryCounts:
            statsRows.length > 0
              ? stats.categoryCounts
              : normalizeCountMap(payload.categoryCounts)
        },
        corsHeaders,
        200,
        promptAccess.isAuthenticated
          ? {
              'Cache-Control': 'no-store',
              Vary: 'Authorization'
            }
          : hasSignedImageUrls
            ? {
                'Cache-Control': 'no-store',
                Vary: 'Authorization'
              }
            : {
                'Cache-Control':
                  'public, max-age=300, stale-while-revalidate=1800',
                Vary: 'Authorization'
              }
      );
    }
  }

  if (!caseId && !slug && (usesSeoModelFilter || usesSeoCategoryFilter)) {
    const broadSearchPayload = await searchPromptCasesPublic(supabase, {
      limit: 1000,
      locale: locale || undefined,
      tag: tag || undefined,
      packageSlug: packageSlug || undefined,
      searchQuery,
      featuredOnly,
      requireImage
    });
    const rawRows = Array.isArray(broadSearchPayload?.cases)
      ? (broadSearchPayload.cases as Record<string, unknown>[])
      : [];
    const baseRows = rawRows.filter((raw) => {
      if (!promptCaseRawMatchesLocale(raw, locale || undefined)) return false;
      if (!promptCaseRawMatchesPackage(raw, packageSlug || undefined)) {
        return false;
      }
      if (!promptCaseRawMatchesTag(raw, tag || undefined)) return false;
      if (!promptCaseRawMatchesSearch(raw, searchQuery)) return false;
      if (requireImage && !promptCaseRawHasDisplayImage(raw)) return false;
      return promptCaseRawMatchesFeatured(raw, featuredOnly);
    });
    const navigationRows = baseRows.filter((raw) => {
      if (usesSeoCategoryFilter && category) {
        return promptSeoCaseMatches(raw, 'category', category);
      }
      if (category) {
        return readTrimmedString(raw.category) === category;
      }
      return true;
    });
    const filteredRows = navigationRows.filter((raw) => {
      if (usesSeoModelFilter && model) {
        return promptSeoCaseMatches(raw, 'model', model);
      }
      if (model) {
        return readTrimmedString(raw.model) === model;
      }
      return true;
    });
    const responseRows = sortPromptCaseRowsByDisplayPriority(
      filteredRows
    ).slice(0, limit);
    const storageUrlMap = new Map<string, string>();
    const cases = sortPromptCasesByDisplayPriority(
      await Promise.all(
        responseRows.map((item) =>
          mapPromptCase(item, {
            access: promptAccess,
            supabase,
            locale,
            storageUrlMap
          })
        )
      )
    );
    const stats = buildSeoPromptCaseStats({
      navigationRows,
      filteredRows,
      model: model || undefined,
      category: category || undefined
    });
    const globalModelCounts = buildPromptCaseModelNavigationCounts(
      broadSearchPayload?.modelCounts,
      baseRows
    );
    const hasSignedImageUrls = cases.some((item) =>
      [item.imageUrl, ...item.imageUrls].some((url) =>
        isSupabaseSignedStorageUrl(url)
      )
    );

    return jsonResponse(
      {
        cases,
        total: stats.total,
        navigationTotal:
          Number(broadSearchPayload?.navigationTotal) ||
          Number(broadSearchPayload?.total) ||
          stats.navigationTotal,
        modelCounts: globalModelCounts,
        categoryCounts: {
          ...normalizeCountMap(broadSearchPayload?.categoryCounts),
          ...stats.categoryCounts
        }
      },
      corsHeaders,
      200,
      promptAccess.isAuthenticated
        ? {
            'Cache-Control': 'no-store',
            Vary: 'Authorization'
          }
        : hasSignedImageUrls
          ? {
              'Cache-Control': 'no-store',
              Vary: 'Authorization'
            }
          : {
              'Cache-Control':
                'public, max-age=300, stale-while-revalidate=1800',
              Vary: 'Authorization'
            }
    );
  }

  let query = supabase
    .from('prompt_cases')
    .select('*')
    .eq('is_published', true)
    .is('deleted_at', null);

  if (!isSingleCaseLookup) {
    query = query.is('source_case_id', null);
  }

  if (category && !usesSeoCategoryFilter) {
    query = query.eq('category', category);
  }

  if (model && !usesSeoModelFilter) {
    query = query.eq('model', model);
  }

  if (packageSlug) {
    query = query.eq('package_slug', packageSlug);
  }

  if (locale === 'zh-CN') {
    query = query.or(
      'locale.eq.zh-CN,title_zh.not.is.null,prompt_zh.not.is.null,prompt_preview_zh.not.is.null'
    );
  } else if (locale === 'en-US') {
    query = query.or(
      'locale.eq.en-US,title_en.not.is.null,prompt_en.not.is.null,prompt_preview_en.not.is.null'
    );
  }

  const { data, error } = caseId
    ? await (locale === 'en-US'
        ? query.or(`id.eq.${caseId},source_case_id.eq.${caseId}`).limit(5)
        : query.eq('id', caseId).limit(1))
    : slug
      ? await query.eq('slug', slug).not('slug', 'is', null).limit(1)
      : { data: await loadPromptCaseStatsRows(supabase), error: null };

  if (error) {
    if (isMissingPromptCasesTable(error)) {
      console.warn('[API] /content/prompt-cases table missing:', error);
      return jsonResponse(
        {
          cases: [],
          needsSetup: true,
          message: 'Prompt cases table is not initialized'
        },
        corsHeaders,
        200,
        {
          'Cache-Control': 'no-store'
        }
      );
    }
    console.error('[API] /content/prompt-cases error:', error);
    return jsonResponse(
      { error: 'Failed to load prompt cases', cases: [] },
      corsHeaders,
      500
    );
  }

  let rawRows = isSingleCaseLookup
    ? pickSinglePromptCaseRows((data || []) as Record<string, unknown>[], {
        caseId,
        slug,
        locale
      })
    : ((data || []) as Record<string, unknown>[]);
  let broadSearchPayload: PromptCaseSearchRpcPayload | null = null;
  if (
    !caseId &&
    !slug &&
    rawRows.length === 0 &&
    (usesSeoModelFilter || usesSeoCategoryFilter)
  ) {
    broadSearchPayload = await searchPromptCasesPublic(supabase, {
      limit: 1000,
      locale: locale || undefined,
      tag: tag || undefined,
      packageSlug: packageSlug || undefined,
      searchQuery,
      featuredOnly,
      requireImage
    });
    if (broadSearchPayload && Array.isArray(broadSearchPayload.cases)) {
      rawRows = broadSearchPayload.cases as Record<string, unknown>[];
    }
  }
  const stats = buildPromptCaseStats(rawRows, {
    category: category || undefined,
    model: model || undefined,
    tag: tag || undefined,
    packageSlug: packageSlug || undefined,
    locale: locale || undefined,
    searchQuery,
    requireImage,
    featuredOnly
  });
  const filteredRows = rawRows
    .filter((raw) => {
      if (!promptCaseRawMatchesLocale(raw, locale || undefined)) return false;
      if (!promptCaseRawMatchesPackage(raw, packageSlug || undefined)) {
        return false;
      }
      if (usesSeoModelFilter && model) {
        return promptSeoCaseMatches(raw, 'model', model);
      }
      if (model) {
        return readTrimmedString(raw.model) === model;
      }
      return true;
    })
    .filter((raw) => {
      if (usesSeoCategoryFilter && category) {
        return promptSeoCaseMatches(raw, 'category', category);
      }
      if (category) {
        return readTrimmedString(raw.category) === category;
      }
      return true;
    })
    .filter((raw) => {
      if (!tag) return true;
      if (tag.toLowerCase() === 'sref') {
        return promptSeoCaseMatches(raw, 'category', 'sref-prompts');
      }
      const normalizedTag = tag.toLowerCase();
      return normalizeTags(raw.tags).some(
        (value) => value.toLowerCase() === normalizedTag
      );
    })
    .filter((raw) => promptCaseRawMatchesSearch(raw, searchQuery))
    .filter((raw) => {
      if (!requireImage) return true;
      return promptCaseRawHasDisplayImage(raw);
    })
    .filter((raw) => promptCaseRawMatchesFeatured(raw, featuredOnly));

  const responseRows = sortPromptCaseRowsByDisplayPriority(filteredRows).slice(
    0,
    limit
  );
  const storageUrlMap = isSingleCaseLookup
    ? await buildPromptCaseStorageUrlMap(supabase, responseRows)
    : new Map<string, string>();
  const cases = sortPromptCasesByDisplayPriority(
    await Promise.all(
      responseRows.map((item) =>
        mapPromptCase(item, {
          access: promptAccess,
          exposePublicPrompt: shouldExposePublicPrompt,
          supabase,
          locale,
          storageUrlMap
        })
      )
    )
  );
  const hasSignedImageUrls = cases.some((item) =>
    [item.imageUrl, ...item.imageUrls].some((url) =>
      isSupabaseSignedStorageUrl(url)
    )
  );

  return jsonResponse(
    {
      cases,
      total:
        rawRows.length > 0
          ? stats.total
          : Number(broadSearchPayload?.total) || stats.total,
      navigationTotal:
        rawRows.length > 0
          ? stats.navigationTotal
          : Number(broadSearchPayload?.navigationTotal) ||
            Number(broadSearchPayload?.total) ||
            stats.navigationTotal,
      modelCounts:
        Object.keys(stats.modelCounts).length > 0
          ? buildPromptCaseModelNavigationCounts(stats.modelCounts, rawRows)
          : buildPromptCaseModelNavigationCounts(
              broadSearchPayload?.modelCounts,
              rawRows
            ),
      categoryCounts:
        Object.keys(stats.categoryCounts).length > 0
          ? stats.categoryCounts
          : normalizeCountMap(broadSearchPayload?.categoryCounts)
    },
    corsHeaders,
    200,
    promptAccess.isAuthenticated
      ? {
          'Cache-Control': 'no-store',
          Vary: 'Authorization'
        }
      : hasSignedImageUrls
        ? {
            'Cache-Control': 'no-store',
            Vary: 'Authorization'
          }
        : {
            'Cache-Control': 'public, max-age=300, stale-while-revalidate=1800',
            Vary: 'Authorization'
          }
  );
}
