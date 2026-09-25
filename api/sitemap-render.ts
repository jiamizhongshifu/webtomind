/// <reference lib="dom" />

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SEO_BLOG_POSTS, SEO_USE_CASES } from './seo-content.js';
import {
  PROMPT_SEO_ALIASES,
  PROMPT_SEO_PAGES
} from '../src/shared/prompt-seo-content.js';
import {
  PROMPT_STYLE_GRID_CANONICAL_PATH,
  PROMPT_STYLE_GRID_DETAIL_PATHS
} from '../src/shared/prompt-style-grid-seo.js';
import { createAppContentItems } from '../src/shared/create-apps.js';
import { getSeoAlternatePaths } from '../src/shared/seo-route-paths.js';
import {
  evaluatePromptCaseSeoQuality,
  type PromptCaseSeoMedia
} from '../src/shared/prompt-seo-quality.js';

const SITE_URL = 'https://webtomind.com';
// 案例库是主要长尾资产：全量公开可索引案例进 sitemap，让 Google 直接发现，
// 不再依赖客户端渲染的分页库。质量门槛由 isPromptCaseEligibleForSitemap 保证，
// noindex/review/draft 案例不会混入。
const PROMPT_CASE_SITEMAP_LIMIT_PER_LOCALE = 5000;
const PROMPT_CASE_VIDEO_SITEMAP_LIMIT_PER_LOCALE = 100;
const PROMPT_CASE_SITEMAP_COLUMNS = [
  'id',
  'slug',
  'locale',
  'source_case_id',
  'updated_at',
  'created_at',
  'featured',
  'image_url',
  'image_urls',
  'package_slug',
  'commercial_intent',
  'category',
  'prompt',
  'prompt_zh',
  'prompt_en',
  'prompt_preview',
  'prompt_preview_zh',
  'prompt_preview_en',
  'title',
  'title_zh',
  'title_en',
  'model',
  'media_type',
  'video_url',
  'video_urls',
  'video_duration_seconds',
  'video_upload_date',
  'members_only',
  'seo_status',
  'seo_reviewed_at',
  'seo_evidence',
  'deleted_at',
  'is_published'
].join(',');
// Older deployments may lack the newer SEO columns; the fallback list keeps
// the sitemap alive without them.
const PROMPT_CASE_SITEMAP_FALLBACK_COLUMNS = [
  'id',
  'slug',
  'locale',
  'updated_at',
  'created_at',
  'featured',
  'image_url',
  'image_urls',
  'package_slug',
  'commercial_intent',
  'category',
  'prompt',
  'prompt_preview',
  'title',
  'model',
  'media_type',
  'video_url',
  'video_urls',
  'members_only',
  'deleted_at',
  'is_published'
].join(',');
// Paths that must not be submitted for indexing: client-side redirects or
// canonical duplicates that Google flags instead of indexing.
const REDIRECTED_STATIC_PATHS = new Set([
  '/ai-image-prompts',
  '/ai-image-generator',
  '/reference-image-to-prompt-generator'
]);

type StaticSitemapItem = {
  path: string;
  changefreq: string;
  priority: string;
  lastmod?: string;
};

const STATIC_URLS: StaticSitemapItem[] = [
  { path: '/zh-CN/overview', changefreq: 'daily', priority: '0.9' },
  { path: '/en-US/overview', changefreq: 'daily', priority: '0.9' },
  { path: '/zh-CN/apps', changefreq: 'weekly', priority: '0.82' },
  { path: '/en-US/apps', changefreq: 'weekly', priority: '0.82' },
  { path: '/zh-CN/prompts', changefreq: 'daily', priority: '0.9' },
  { path: '/en-US/prompts', changefreq: 'daily', priority: '0.9' },
  { path: '/zh-CN/video-prompts', changefreq: 'daily', priority: '0.86' },
  {
    path: PROMPT_STYLE_GRID_CANONICAL_PATH,
    changefreq: 'weekly',
    priority: '0.86'
  },
  {
    path: '/ai-image-prompt-generator',
    changefreq: 'weekly',
    priority: '0.88'
  },
  { path: '/zh-CN/blog', changefreq: 'weekly', priority: '0.8' },
  { path: '/en-US/blog', changefreq: 'weekly', priority: '0.8' },
  { path: '/zh-CN/updates', changefreq: 'daily', priority: '0.85' },
  { path: '/en-US/updates', changefreq: 'daily', priority: '0.85' },
  { path: '/zh-CN/pricing', changefreq: 'weekly', priority: '0.78' },
  { path: '/en-US/pricing', changefreq: 'weekly', priority: '0.78' },
  {
    path: '/zh-CN/tools/comfyui-workflow-checker',
    changefreq: 'weekly',
    priority: '0.72'
  },
  {
    path: '/en-US/tools/comfyui-workflow-checker',
    changefreq: 'weekly',
    priority: '0.72'
  },
  {
    path: '/zh-CN/tools/pindou-pattern-maker',
    changefreq: 'weekly',
    priority: '0.74'
  },
  {
    path: '/en-US/tools/pindou-pattern-maker',
    changefreq: 'weekly',
    priority: '0.74'
  },
  ...createAppContentItems
    .filter((item) => item.slug !== 'pindou-pattern-maker')
    .flatMap((item) => [
      {
        path: `/zh-CN${item.href}`,
        changefreq: 'weekly',
        priority: item.featured ? '0.82' : '0.76'
      },
      {
        path: `/en-US${item.href}`,
        changefreq: 'weekly',
        priority: item.featured ? '0.82' : '0.76'
      }
    ]),
  { path: '/zh-CN/privacy', changefreq: 'monthly', priority: '0.4' },
  { path: '/en-US/privacy', changefreq: 'monthly', priority: '0.4' },
  { path: '/zh-CN/terms', changefreq: 'monthly', priority: '0.4' },
  { path: '/en-US/terms', changefreq: 'monthly', priority: '0.4' }
];

const CONTENT_URLS: StaticSitemapItem[] = [
  ...Array.from(new Set(PROMPT_SEO_ALIASES.map((alias) => alias.canonicalPath)))
    .filter((path) => !REDIRECTED_STATIC_PATHS.has(path))
    .map((path) => ({
      path,
      changefreq: 'weekly',
      priority: '0.82'
    })),
  ...PROMPT_STYLE_GRID_DETAIL_PATHS.map((path) => ({
    path,
    changefreq: 'weekly',
    priority: '0.78'
  })),
  ...PROMPT_SEO_PAGES.flatMap((item) => [
    {
      path: `/zh-CN/prompts/${item.type}/${item.slug}`,
      changefreq: 'weekly',
      priority: '0.74'
    },
    {
      path: `/en-US/prompts/${item.type}/${item.slug}`,
      changefreq: 'weekly',
      priority: '0.74'
    }
  ]),
  ...SEO_USE_CASES.flatMap((item) => [
    {
      path: `/zh-CN/blog/${item.slug}`,
      changefreq: 'weekly',
      priority: '0.72'
    },
    {
      path: `/en-US/blog/${item.slug}`,
      changefreq: 'weekly',
      priority: '0.72'
    }
  ]),
  ...SEO_BLOG_POSTS.flatMap((item) => [
    {
      path: `/zh-CN/blog/${item.slug}`,
      changefreq: 'weekly',
      priority: '0.7',
      lastmod: item.date
    },
    {
      path: `/en-US/blog/${item.slug}`,
      changefreq: 'weekly',
      priority: '0.7',
      lastmod: item.date
    }
  ])
];

export function getStaticSitemapPathsForTest(): string[] {
  return [...STATIC_URLS, ...CONTENT_URLS].map((item) => item.path);
}

type SitemapUrl = {
  loc: string;
  changefreq: string;
  priority: string;
  lastmod?: string;
  alternates?: Array<{ hreflang: string; href: string }>;
  video?: {
    title: string;
    description: string;
    thumbnailUrl: string;
    contentUrl: string;
    durationSeconds: number;
    uploadDate: string;
  };
  videoIntent?: string;
};

export type PromptSitemapRow = {
  id?: string | null;
  slug?: string | null;
  locale?: string | null;
  source_case_id?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
  featured?: boolean | null;
  image_url?: string | null;
  image_urls?: string[] | null;
  package_slug?: string | null;
  commercial_intent?: string | null;
  prompt?: string | null;
  prompt_zh?: string | null;
  prompt_en?: string | null;
  prompt_preview?: string | null;
  prompt_preview_zh?: string | null;
  prompt_preview_en?: string | null;
  title?: string | null;
  title_zh?: string | null;
  title_en?: string | null;
  model?: string | null;
  category?: string | null;
  media_type?: string | null;
  video_url?: string | null;
  video_urls?: string[] | null;
  video_duration_seconds?: number | null;
  video_upload_date?: string | null;
  members_only?: boolean | null;
  seo_status?: string | null;
  seo_reviewed_at?: string | null;
  seo_evidence?: Record<string, unknown> | null;
  deleted_at?: string | null;
  is_published?: boolean | null;
};

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function renderSitemap(urls: SitemapUrl[]): string {
  const items = urls
    .map((url) => {
      const alternates = (url.alternates || [])
        .map(
          (alternate) =>
            `\n    <xhtml:link rel="alternate" hreflang="${escapeXml(alternate.hreflang)}" href="${escapeXml(alternate.href)}" />`
        )
        .join('');
      const lastmod = url.lastmod
        ? `\n    <lastmod>${escapeXml(url.lastmod)}</lastmod>`
        : '';
      const video = url.video
        ? `
    <video:video>
      <video:thumbnail_loc>${escapeXml(url.video.thumbnailUrl)}</video:thumbnail_loc>
      <video:title>${escapeXml(url.video.title)}</video:title>
      <video:description>${escapeXml(url.video.description)}</video:description>
      <video:content_loc>${escapeXml(url.video.contentUrl)}</video:content_loc>
      <video:duration>${Math.round(url.video.durationSeconds)}</video:duration>
      <video:publication_date>${escapeXml(url.video.uploadDate)}</video:publication_date>
    </video:video>`
        : '';
      return `  <url>
    <loc>${escapeXml(url.loc)}</loc>${alternates}${lastmod}${video}
    <changefreq>${url.changefreq}</changefreq>
    <priority>${url.priority}</priority>
  </url>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">
${items}
</urlset>`;
}

function localizedAlternates(path: string): SitemapUrl['alternates'] {
  const match = path.match(/^\/(zh-CN|en-US)(\/.+)$/);
  if (!match) return undefined;
  const [, , pathWithoutLocale] = match;
  return getSeoAlternatePaths(pathWithoutLocale).map((alternate) => ({
    hreflang: alternate.hreflang,
    href: `${SITE_URL}${alternate.path}`
  }));
}

function getPromptCaseUrl(item: {
  id?: string | null;
  slug?: string | null;
  locale: string;
}): string {
  const locale = item.locale === 'en-US' ? 'en-US' : 'zh-CN';
  const slug = typeof item.slug === 'string' ? item.slug.trim() : '';
  if (slug) {
    return `${SITE_URL}/${locale}/prompts/${encodeURIComponent(slug)}`;
  }
  const id = typeof item.id === 'string' ? item.id.trim() : '';
  return `${SITE_URL}/${locale}/create/prompts/share/${encodeURIComponent(id)}`;
}

export function getPromptCaseSitemapUrlForTest(item: {
  id?: string | null;
  slug?: string | null;
  locale: string;
}): string {
  return getPromptCaseUrl(item);
}

function hasText(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasPromptCaseDisplayImage(item: PromptSitemapRow): boolean {
  return (
    hasText(item.image_url) ||
    (Array.isArray(item.image_urls) && item.image_urls.some(hasText))
  );
}

function hasPromptCaseUrlTarget(item: {
  id?: unknown;
  slug?: unknown;
}): boolean {
  return hasText(item.slug) || hasText(item.id);
}

export function isPromptCaseEligibleForSitemap(
  item: PromptSitemapRow
): boolean {
  if (typeof item.seo_status === 'string') {
    return evaluatePromptCaseSeoQuality(
      item as unknown as Record<string, unknown>,
      { allowLegacy: false }
    ).indexable;
  }
  return (
    hasPromptCaseUrlTarget(item) &&
    hasPromptCaseDisplayImage(item) &&
    (item.featured === true ||
      hasText(item.package_slug) ||
      hasText(item.commercial_intent))
  );
}

function hasPromptCaseVideoMedia(item: PromptSitemapRow): boolean {
  return (
    item.media_type === 'video' &&
    (hasText(item.video_url) ||
      (Array.isArray(item.video_urls) && item.video_urls.some(hasText))) &&
    Number(item.video_duration_seconds) > 0 &&
    hasText(item.video_upload_date)
  );
}

function getPromptCaseVideoSitemap(
  item: PromptSitemapRow
): SitemapUrl['video'] {
  const quality = evaluatePromptCaseSeoQuality(
    item as unknown as Record<string, unknown>,
    { allowLegacy: typeof item.seo_status !== 'string' }
  );
  const media = quality.media as PromptCaseSeoMedia | undefined;
  if (!quality.indexable || media?.mediaType !== 'video') return undefined;
  const title =
    item.title_zh?.trim() ||
    item.title?.trim() ||
    item.title_en?.trim() ||
    'WebToMind AI video prompt case';
  const description =
    item.commercial_intent?.trim() ||
    item.prompt_preview_zh?.trim() ||
    item.prompt_preview?.trim() ||
    item.prompt_preview_en?.trim() ||
    title;
  return {
    title,
    description,
    thumbnailUrl: media.posterUrl,
    contentUrl: media.videoUrl,
    durationSeconds: media.durationSeconds,
    uploadDate: media.uploadDate
  };
}

export function selectPromptCaseRowsForSitemap(
  rows: PromptSitemapRow[]
): PromptSitemapRow[] {
  const perLocaleCount = new Map<'zh-CN' | 'en-US', number>();
  const perLocaleVideoCount = new Map<'zh-CN' | 'en-US', number>();
  const selected: PromptSitemapRow[] = [];
  for (const item of rows) {
    if (!isPromptCaseEligibleForSitemap(item)) continue;
    const locale = item.locale === 'en-US' ? 'en-US' : 'zh-CN';
    if (hasPromptCaseVideoMedia(item)) {
      const videoCount = perLocaleVideoCount.get(locale) || 0;
      if (videoCount >= PROMPT_CASE_VIDEO_SITEMAP_LIMIT_PER_LOCALE) continue;
      perLocaleVideoCount.set(locale, videoCount + 1);
      selected.push(item);
      continue;
    }
    const currentCount = perLocaleCount.get(locale) || 0;
    if (currentCount >= PROMPT_CASE_SITEMAP_LIMIT_PER_LOCALE) continue;
    perLocaleCount.set(locale, currentCount + 1);
    selected.push(item);
  }
  return selected;
}

async function loadPromptUrls(): Promise<SitemapUrl[]> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return [];

  const supabase = createClient(supabaseUrl, supabaseKey);
  const [primaryResult, videoResult] = await Promise.all([
    loadPromptCaseSitemapRows(supabase, PROMPT_CASE_SITEMAP_COLUMNS),
    loadPromptCaseSitemapRows(supabase, PROMPT_CASE_SITEMAP_COLUMNS, 'video')
  ]);
  let rows = mergePromptCaseRows(primaryResult.rows, videoResult.rows);
  let error = primaryResult.error || videoResult.error;

  if (error) {
    const [primaryFallback, videoFallback] = await Promise.all([
      loadPromptCaseSitemapRows(supabase, PROMPT_CASE_SITEMAP_FALLBACK_COLUMNS),
      loadPromptCaseSitemapRows(
        supabase,
        PROMPT_CASE_SITEMAP_FALLBACK_COLUMNS,
        'video'
      )
    ]);
    rows = mergePromptCaseRows(primaryFallback.rows, videoFallback.rows);
    error = primaryFallback.error || videoFallback.error;
  }

  if (error) {
    console.warn('[Sitemap] prompt case sitemap load failed:', error);
    throw new Error('Prompt sitemap data unavailable');
  }

  const translationGroups = new Map<string, Array<Record<string, unknown>>>();
  rows.forEach((item) => {
    const record = item as Record<string, unknown>;
    const id = typeof record.id === 'string' ? record.id : '';
    const sourceCaseId =
      typeof record.source_case_id === 'string' ? record.source_case_id : '';
    const locale = record.locale === 'en-US' ? 'en-US' : 'zh-CN';
    const key = locale === 'zh-CN' ? id : sourceCaseId;
    if (!key) return;
    translationGroups.set(key, [...(translationGroups.get(key) || []), record]);
  });

  const selectedRows = new Set(selectPromptCaseRowsForSitemap(rows));
  return rows.reduce<SitemapUrl[]>((urls, item) => {
    if (!selectedRows.has(item)) return urls;
    const locale = item.locale === 'en-US' ? 'en-US' : 'zh-CN';
    const id = typeof item.id === 'string' ? item.id : '';
    const sourceCaseId =
      typeof item.source_case_id === 'string' ? item.source_case_id : '';
    const translationKey = locale === 'zh-CN' ? id : sourceCaseId;
    const group = translationKey
      ? translationGroups.get(translationKey) || []
      : [];
    const zhCase = group.find((caseItem) => caseItem.locale !== 'en-US');
    const enCase = group.find((caseItem) => caseItem.locale === 'en-US');
    const alternates =
      zhCase &&
      enCase &&
      selectedRows.has(zhCase as PromptSitemapRow) &&
      selectedRows.has(enCase as PromptSitemapRow) &&
      hasPromptCaseUrlTarget(zhCase) &&
      hasPromptCaseUrlTarget(enCase)
        ? [
            {
              hreflang: 'zh-CN',
              href: getPromptCaseUrl({
                slug: typeof zhCase.slug === 'string' ? zhCase.slug : '',
                id: typeof zhCase.id === 'string' ? zhCase.id : '',
                locale: 'zh-CN'
              })
            },
            {
              hreflang: 'en-US',
              href: getPromptCaseUrl({
                slug: typeof enCase.slug === 'string' ? enCase.slug : '',
                id: typeof enCase.id === 'string' ? enCase.id : '',
                locale: 'en-US'
              })
            },
            {
              hreflang: 'x-default',
              href: getPromptCaseUrl({
                slug: typeof enCase.slug === 'string' ? enCase.slug : '',
                id: typeof enCase.id === 'string' ? enCase.id : '',
                locale: 'en-US'
              })
            }
          ]
        : undefined;
    const updatedAt =
      typeof item.updated_at === 'string' && item.updated_at
        ? item.updated_at
        : typeof item.created_at === 'string'
          ? item.created_at
          : undefined;

    urls.push({
      loc: getPromptCaseUrl({ id: item.id, slug: item.slug, locale }),
      lastmod: updatedAt ? new Date(updatedAt).toISOString() : undefined,
      changefreq: 'weekly',
      priority: '0.72',
      alternates,
      video: getPromptCaseVideoSitemap(item),
      videoIntent:
        item.category?.trim() ||
        item.package_slug?.trim() ||
        item.commercial_intent?.trim()
    });
    return urls;
  }, []);
}

export async function loadPromptCaseSitemapRows(
  supabase: SupabaseClient,
  columns: string,
  mediaType?: 'video'
): Promise<{
  rows: PromptSitemapRow[];
  error: { message: string } | null;
}> {
  const limit = mediaType ? 500 : 5000;
  const pageSize = 500;
  // PostgREST caps each response independently of .limit(5000). Page below
  // that cap, with a unique tie-breaker so adjacent pages cannot drift on ties.
  const fetchPage = async (from: number, to: number, first = false) => {
    let query = supabase
      .from('prompt_cases')
      .select(columns, first ? { count: 'exact' } : undefined)
      .eq('is_published', true)
      .is('deleted_at', null);
    if (mediaType) query = query.eq('media_type', mediaType);
    return query
      .order('featured', { ascending: false })
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })
      .range(from, to);
  };
  const first = await fetchPage(0, pageSize - 1, true);
  if (first.error) return { rows: [], error: first.error };
  if (first.count === null || first.count === undefined) {
    return { rows: [], error: { message: 'Prompt sitemap count unavailable' } };
  }
  const total = Math.min(first.count, limit);
  const ranges = [];
  for (let from = pageSize; from < total; from += pageSize) {
    ranges.push([from, Math.min(from + pageSize, total) - 1]);
  }
  const pages = await Promise.all(
    ranges.map(([from, to]) => fetchPage(from, to))
  );
  const failed = pages.find((page) => page.error);
  if (failed?.error) return { rows: [], error: failed.error };
  const rows = [first, ...pages].flatMap(
    (page) => page.data || []
  ) as PromptSitemapRow[];
  if (rows.length !== total) {
    return {
      rows: [],
      error: { message: 'Prompt sitemap pagination incomplete' }
    };
  }
  if (rows.length >= limit) {
    console.warn(
      `[Sitemap] prompt case row query hit its ${limit} row cap${
        mediaType ? ` (media_type=${mediaType})` : ''
      }; long-tail cases may be missing from the sitemap.`
    );
  }
  return {
    rows,
    error: null
  };
}

function mergePromptCaseRows(
  ...groups: PromptSitemapRow[][]
): PromptSitemapRow[] {
  const seen = new Set<string>();
  const merged: PromptSitemapRow[] = [];
  for (const group of groups) {
    for (const row of group) {
      const id = typeof row.id === 'string' ? row.id.trim() : '';
      if (id && seen.has(id)) continue;
      if (id) seen.add(id);
      merged.push(row);
    }
  }
  return merged;
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  fallback: T
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function renderSitemapResponse(
  request: Request
): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405 });
  }

  const promptUrls = await withTimeout<SitemapUrl[] | null>(
    loadPromptUrls().catch(() => null),
    20000,
    null
  );
  if (!promptUrls) {
    return new Response('Sitemap temporarily unavailable', {
      status: 503,
      headers: { 'Cache-Control': 'no-store', 'Retry-After': '300' }
    });
  }
  const eligibleVideoUrls = promptUrls.filter((item) => Boolean(item.video));
  const eligibleVideoIntents = new Set(
    eligibleVideoUrls.map((item) => item.videoIntent).filter(Boolean)
  );
  const includeVideoHub =
    eligibleVideoUrls.length >= 8 && eligibleVideoIntents.size >= 3;
  const staticUrls = STATIC_URLS.filter(
    (item) => item.path !== '/zh-CN/video-prompts' || includeVideoHub
  ).map((item) => ({
    loc: `${SITE_URL}${item.path}`,
    changefreq: item.changefreq,
    priority: item.priority,
    alternates: localizedAlternates(item.path)
  }));
  const contentUrls = CONTENT_URLS.map((item) => ({
    loc: `${SITE_URL}${item.path}`,
    changefreq: item.changefreq,
    priority: item.priority,
    lastmod: item.lastmod,
    alternates: localizedAlternates(item.path)
  }));
  const uniqueUrls = Array.from(
    new Map(
      [...staticUrls, ...contentUrls, ...promptUrls].map((item) => [
        item.loc,
        item
      ])
    ).values()
  );

  const headers = {
    'Content-Type': 'application/xml; charset=utf-8',
    'Cache-Control': 'public, max-age=300, s-maxage=300'
  };
  if (request.method === 'HEAD') {
    return new Response(null, { status: 200, headers });
  }
  return new Response(renderSitemap(uniqueUrls), { status: 200, headers });
}

export default renderSitemapResponse;
