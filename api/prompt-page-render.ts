import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { PROMPT_OG_CTA } from './prompt-og-worker-compat.js';
import { replaceSeoTag } from './seo-render-utils.js';
import {
  getOptimizedPromptCaseImageUrl,
  getPromptCaseResponsiveImageSet
} from '../src/shared/prompt-case-image.js';
import { getPromptSeoPublicCaseBySlug } from '../src/shared/prompt-seo-match.js';
import {
  evaluatePromptCaseSeoQuality,
  isPromptCaseGenerationVerified
} from '../src/shared/prompt-seo-quality.js';

const SITE_URL = 'https://webtomind.com';
const FALLBACK_IMAGE = `${SITE_URL}/icons/icon128.png`;
const PROMPT_DETAIL_IMAGE_SIZES = '(max-width: 900px) 100vw, 56vw';
const PROMPT_DETAIL_IMAGE_WIDTHS = [640, 960, 1280];

type PromptCaseSeo = {
  id: string;
  title: string;
  prompt: string;
  slug: string | null;
  locale: 'zh-CN' | 'en-US';
  sourceCaseId: string | null;
  category: string;
  model: string;
  packageSlug: string | null;
  commercialIntent: string | null;
  promptPreview: string | null;
  memberOnly: boolean;
  tags: string[];
  imageUrls: string[];
  mediaType: 'image' | 'video';
  videoUrls: string[];
  posterUrl: string | null;
  durationSeconds: number | null;
  uploadDate: string | null;
  seoIndexable: boolean;
  generationVerified: boolean;
};

type SeoAlternate = {
  hreflang: string;
  href: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeJsonForHtml(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((tag) => (typeof tag === 'string' ? tag.trim() : ''))
    .filter(Boolean);
}

function normalizeImageUrls(item: Record<string, unknown>): string[] {
  const imageUrls = Array.isArray(item.image_urls)
    ? item.image_urls.filter((url): url is string => typeof url === 'string')
    : [];
  const imageUrl = typeof item.image_url === 'string' ? item.image_url : '';
  return Array.from(new Set([...imageUrls, imageUrl].filter(Boolean)));
}

function normalizeVideoUrls(item: Record<string, unknown>): string[] {
  const videoUrls = Array.isArray(item.video_urls)
    ? item.video_urls.filter((url): url is string => typeof url === 'string')
    : [];
  const videoUrl = typeof item.video_url === 'string' ? item.video_url : '';
  return Array.from(
    new Set([...videoUrls, videoUrl].map((url) => url.trim()).filter(Boolean))
  );
}

function getPromptCaseSocialImageUrl(caseItem: PromptCaseSeo | null): string {
  return (
    caseItem?.imageUrls.find((url) => /^https?:\/\//i.test(url)) ||
    FALLBACK_IMAGE
  );
}

function normalizeStringField(
  item: Record<string, unknown>,
  key: string
): string | null {
  const value = item[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function pickLocalizedStringField(
  item: Record<string, unknown>,
  locale: 'zh-CN' | 'en-US',
  fields: { zh: string; en: string; fallback: string }
): string | null {
  const localized =
    locale === 'en-US'
      ? normalizeStringField(item, fields.en) ||
        normalizeStringField(item, fields.fallback) ||
        normalizeStringField(item, fields.zh)
      : normalizeStringField(item, fields.zh) ||
        normalizeStringField(item, fields.fallback) ||
        normalizeStringField(item, fields.en);
  return localized || null;
}

function inferPromptCaseTitle(prompt: unknown, fallback: string): string {
  if (typeof prompt !== 'string') return fallback;
  const normalized = prompt.replace(/\s+/g, ' ').trim();
  if (!normalized) return fallback;
  return (
    normalized
      .replace(/^\s*\d{1,2}\s*[:：]\s*\d{1,2}\s*[，,、。.\s-]*/u, '')
      .replace(/^生成一?张(?:单张)?\s*/u, '')
      .split(/[，,。.;；\n]/u)[0]
      .trim()
      .slice(0, 28) || fallback
  );
}

export async function loadPromptCase(params: {
  slug?: string;
  id?: string;
  locale: 'zh-CN' | 'en-US';
}): Promise<PromptCaseSeo | null> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return null;

  const supabase = createClient(supabaseUrl, supabaseKey);
  let query = supabase
    .from('prompt_cases')
    .select('*')
    .eq('is_published', true)
    .is('deleted_at', null)
    .limit(1);

  if (params.slug) {
    query = query.eq('slug', params.slug);
  } else if (params.id) {
    query = query.eq('id', params.id);
  } else {
    return null;
  }

  const { data, error } = await query.maybeSingle();

  if (error || !data) {
    if (error) console.warn('[PromptPage] prompt SEO load failed:', error);
    return null;
  }

  return mapPromptCaseSeoRecord(data as Record<string, unknown>, params.locale);
}

function getPromptCaseHref(
  locale: 'zh-CN' | 'en-US',
  item: Pick<PromptCaseSeo, 'id' | 'slug'>
): string {
  return item.slug
    ? `${SITE_URL}/${locale}/prompts/${encodeURIComponent(item.slug)}`
    : `${SITE_URL}/${locale}/create/prompts/share/${encodeURIComponent(item.id)}`;
}

function mapAlternatePromptCase(
  item: Record<string, unknown>
): Pick<PromptCaseSeo, 'id' | 'slug' | 'locale'> | null {
  const id = typeof item.id === 'string' ? item.id : '';
  const locale = item.locale === 'en-US' ? 'en-US' : 'zh-CN';
  if (!id) return null;
  return {
    id,
    slug:
      typeof item.slug === 'string' && item.slug.trim()
        ? item.slug.trim()
        : null,
    locale
  };
}

export async function loadPromptCaseAlternates(
  caseItem: PromptCaseSeo | null,
  requestedLocale: 'zh-CN' | 'en-US'
): Promise<SeoAlternate[]> {
  if (!caseItem) return [];

  const selfAlternate = {
    hreflang: requestedLocale,
    href: getPromptCaseHref(requestedLocale, caseItem)
  };
  const sourceCaseId =
    caseItem.locale === 'zh-CN' ? caseItem.id : caseItem.sourceCaseId;
  if (!sourceCaseId) {
    return [selfAlternate, { hreflang: 'x-default', href: selfAlternate.href }];
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return [selfAlternate, { hreflang: 'x-default', href: selfAlternate.href }];
  }

  const supabase: SupabaseClient = createClient(supabaseUrl, supabaseKey);
  const { data, error } = await supabase
    .from('prompt_cases')
    .select('*')
    .eq('is_published', true)
    .is('deleted_at', null)
    .or(`id.eq.${sourceCaseId},source_case_id.eq.${sourceCaseId}`);

  if (error) {
    console.warn('[PromptPage] alternate prompt SEO load failed:', error);
    return [selfAlternate, { hreflang: 'x-default', href: selfAlternate.href }];
  }

  const localeToHref = new Map<'zh-CN' | 'en-US', string>();
  const alternateRows = (data || []) as Record<string, unknown>[];
  alternateRows.forEach((item) => {
    const alternate = mapAlternatePromptCase(item);
    if (!alternate) return;
    const alternateCase = mapPromptCaseSeoRecord(item, alternate.locale);
    if (!alternateCase?.seoIndexable) return;
    localeToHref.set(
      alternate.locale,
      getPromptCaseHref(alternate.locale, alternate)
    );
  });

  if (!localeToHref.has(requestedLocale)) {
    localeToHref.set(requestedLocale, selfAlternate.href);
  }

  const alternates: SeoAlternate[] = [];
  const zhHref = localeToHref.get('zh-CN');
  const enHref = localeToHref.get('en-US');
  if (zhHref) alternates.push({ hreflang: 'zh-CN', href: zhHref });
  if (enHref) alternates.push({ hreflang: 'en-US', href: enHref });
  alternates.push({
    hreflang: 'x-default',
    href: enHref || zhHref || selfAlternate.href
  });
  return alternates;
}

function replaceTag(
  html: string,
  pattern: RegExp,
  replacement: string
): string {
  return replaceSeoTag(html, pattern, replacement);
}

function getLocalePrefix(locale: 'zh-CN' | 'en-US'): string {
  return `/${locale}`;
}

function getPromptCasePath(
  locale: 'zh-CN' | 'en-US',
  item: Pick<PromptCaseSeo, 'id' | 'slug'>
): string {
  return item.slug
    ? `${getLocalePrefix(locale)}/prompts/${encodeURIComponent(item.slug)}`
    : `${getLocalePrefix(locale)}/create/prompts/share/${encodeURIComponent(item.id)}`;
}

function getPromptLibraryHref(locale: 'zh-CN' | 'en-US'): string {
  return locale === 'en-US' ? '/en-US/prompts' : '/zh-CN/prompts';
}

function getCreateMediaHref(
  locale: 'zh-CN' | 'en-US',
  caseItem: Pick<PromptCaseSeo, 'id' | 'packageSlug' | 'mediaType'>
): string {
  const params = new URLSearchParams();
  params.set('source', 'prompt_detail_ssr');
  params.set('caseId', caseItem.id);
  if (caseItem.packageSlug) params.set('packageSlug', caseItem.packageSlug);
  return `${getLocalePrefix(locale)}/${
    caseItem.mediaType === 'video' ? 'video' : 'image'
  }?${params.toString()}`;
}

function getPromptSeoTopicLinks(
  caseItem: PromptCaseSeo,
  locale: 'zh-CN' | 'en-US'
): Array<{ href: string; label: string }> {
  const localePrefix = getLocalePrefix(locale);
  const isEnglish = locale === 'en-US';
  const links = new Map<string, string>();
  const addLink = (href: string, label: string) => {
    links.set(href, label);
  };
  const combined = [
    caseItem.model,
    caseItem.category,
    caseItem.packageSlug || '',
    caseItem.commercialIntent || '',
    caseItem.promptPreview || '',
    caseItem.prompt,
    ...caseItem.tags
  ]
    .join(' ')
    .toLowerCase();

  addLink(
    getPromptLibraryHref(locale),
    isEnglish ? 'AI image prompt cases' : 'AI 图片 Prompt 案例'
  );

  if (combined.includes('gpt') || combined.includes('image 2')) {
    addLink(
      isEnglish
        ? '/gpt-image-2-prompts'
        : `${localePrefix}/prompts/model/gpt-image-2`,
      'GPT Image 2 prompts'
    );
  }
  if (combined.includes('nano') || combined.includes('banana')) {
    addLink(
      isEnglish
        ? '/nano-banana-prompts'
        : `${localePrefix}/prompts/model/nano-banana`,
      'Nano Banana prompts'
    );
  }
  if (combined.includes('flux')) {
    addLink(
      isEnglish ? '/flux-prompts' : `${localePrefix}/prompts/model/flux`,
      'Flux prompts'
    );
  }
  if (combined.includes('seedream')) {
    addLink(
      isEnglish
        ? '/seedream-prompts'
        : `${localePrefix}/prompts/model/seedream`,
      'Seedream prompts'
    );
  }
  if (combined.includes('mona')) {
    addLink(
      isEnglish
        ? '/mona-lisa-1-prompts'
        : `${localePrefix}/prompts/model/mona-lisa-1`,
      'mona-lisa-1 prompts'
    );
  }
  if (combined.includes('seedance') || caseItem.mediaType === 'video') {
    addLink(
      `${localePrefix}/prompts/model/seedance-2-0`,
      isEnglish ? 'Seedance video prompts' : 'Seedance 视频 Prompt'
    );
    if (locale === 'zh-CN') {
      addLink('/zh-CN/video-prompts', 'AI 视频 Prompt 案例');
    }
  }
  if (combined.includes('sref') || combined.includes('style reference')) {
    addLink(
      isEnglish
        ? '/sref-prompts'
        : `${localePrefix}/prompts/category/sref-prompts`,
      'SREF prompts'
    );
  }
  if (
    combined.includes('portrait') ||
    combined.includes('photo') ||
    combined.includes('写真') ||
    combined.includes('人像')
  ) {
    addLink(
      isEnglish
        ? '/portrait-prompts'
        : `${localePrefix}/prompts/category/ai-portrait`,
      isEnglish ? 'Portrait prompts' : 'AI 写真提示词'
    );
  }
  if (combined.includes('product') || combined.includes('商品')) {
    addLink(
      isEnglish
        ? '/product-photography-prompts'
        : `${localePrefix}/prompts/category/product-images`,
      isEnglish ? 'Product photography prompts' : 'AI 商品图 Prompt'
    );
  }
  if (combined.includes('character') || combined.includes('角色')) {
    addLink(
      isEnglish
        ? '/character-design-prompts'
        : `${localePrefix}/prompts/category/character-consistency`,
      isEnglish ? 'Character design prompts' : '角色一致性 Prompt'
    );
  }

  return Array.from(links, ([href, label]) => ({ href, label })).slice(0, 5);
}

function mapPromptCaseSeoRecord(
  item: Record<string, unknown>,
  preferredLocale?: 'zh-CN' | 'en-US'
): PromptCaseSeo | null {
  const id = typeof item.id === 'string' ? item.id : '';
  if (!id) return null;
  const locale = item.locale === 'en-US' ? 'en-US' : 'zh-CN';
  const displayLocale = preferredLocale || locale;
  const prompt =
    pickLocalizedStringField(item, displayLocale, {
      zh: 'prompt_zh',
      en: 'prompt_en',
      fallback: 'prompt'
    }) || '';
  const fallbackTitle =
    displayLocale === 'en-US' ? 'Visual prompt case' : '视觉 Prompt 案例';
  const imageUrls = normalizeImageUrls(item);
  const videoUrls = normalizeVideoUrls(item);
  const mediaType =
    normalizeStringField(item, 'media_type') === 'video' || videoUrls.length > 0
      ? 'video'
      : 'image';
  const quality = evaluatePromptCaseSeoQuality(item, { allowLegacy: true });
  return {
    id,
    title:
      pickLocalizedStringField(item, displayLocale, {
        zh: 'title_zh',
        en: 'title_en',
        fallback: 'title'
      }) || inferPromptCaseTitle(prompt, fallbackTitle),
    prompt,
    slug: normalizeStringField(item, 'slug'),
    locale,
    sourceCaseId: normalizeStringField(item, 'source_case_id'),
    category: normalizeStringField(item, 'category') || 'featured',
    model: normalizeStringField(item, 'model') || 'gemini-image',
    packageSlug: normalizeStringField(item, 'package_slug'),
    commercialIntent: normalizeStringField(item, 'commercial_intent'),
    promptPreview: pickLocalizedStringField(item, displayLocale, {
      zh: 'prompt_preview_zh',
      en: 'prompt_preview_en',
      fallback: 'prompt_preview'
    }),
    memberOnly: item.members_only === true,
    tags: normalizeTags(item.tags),
    imageUrls,
    mediaType,
    videoUrls,
    posterUrl: imageUrls[0] || null,
    durationSeconds:
      Number(item.video_duration_seconds) > 0
        ? Number(item.video_duration_seconds)
        : null,
    uploadDate:
      normalizeStringField(item, 'video_upload_date') ||
      normalizeStringField(item, 'created_at'),
    seoIndexable: quality.indexable,
    generationVerified: isPromptCaseGenerationVerified(item)
  };
}

function loadStaticPromptCase(
  slug: string,
  locale: 'zh-CN' | 'en-US'
): PromptCaseSeo | null {
  const caseItem = getPromptSeoPublicCaseBySlug({ slug, locale });
  if (!caseItem) return null;
  const prompt =
    caseItem.promptPreview ||
    caseItem.commercialIntent ||
    [caseItem.model, caseItem.category].filter(Boolean).join(' prompt case');
  const imageUrls = caseItem.imageUrl
    ? [new URL(caseItem.imageUrl, SITE_URL).toString()]
    : [];
  return {
    id: `static-seo-${caseItem.locale}-${caseItem.slug}`,
    title: caseItem.title,
    prompt,
    slug: caseItem.slug,
    locale: caseItem.locale,
    sourceCaseId: null,
    category: caseItem.category,
    model: caseItem.model,
    packageSlug: caseItem.packageSlug || null,
    commercialIntent: caseItem.commercialIntent || null,
    promptPreview: caseItem.promptPreview || null,
    memberOnly: false,
    tags: caseItem.tags,
    imageUrls,
    mediaType: 'image',
    videoUrls: [],
    posterUrl: imageUrls[0] || null,
    durationSeconds: null,
    uploadDate: null,
    seoIndexable: imageUrls.length > 0,
    generationVerified: true
  };
}

export async function loadRelatedPromptCases(
  caseItem: PromptCaseSeo | null,
  locale: 'zh-CN' | 'en-US'
): Promise<PromptCaseSeo[]> {
  if (!caseItem) return [];
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return [];

  const supabase: SupabaseClient = createClient(supabaseUrl, supabaseKey);
  const loadRows = async (category?: string) => {
    let query = supabase
      .from('prompt_cases')
      .select('*')
      .eq('is_published', true)
      .eq('locale', locale)
      .is('deleted_at', null)
      .neq('id', caseItem.id)
      .order('featured', { ascending: false })
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false })
      .limit(12);

    if (category) query = query.eq('category', category);
    return query;
  };

  const primary = await loadRows(caseItem.category);
  if (primary.error) {
    console.warn('[PromptPage] related prompt SEO load failed:', primary.error);
    return [];
  }

  const fallback =
    (primary.data || []).length > 0 ? primary : await loadRows(undefined);
  if (fallback.error) {
    console.warn(
      '[PromptPage] related prompt SEO fallback failed:',
      fallback.error
    );
    return [];
  }

  const fallbackRows = (fallback.data || []) as Record<string, unknown>[];
  return fallbackRows
    .map((item) => mapPromptCaseSeoRecord(item))
    .filter(
      (item): item is PromptCaseSeo =>
        item !== null &&
        item.mediaType === caseItem.mediaType &&
        item.seoIndexable
    )
    .slice(0, 4);
}

function truncateDescription(value: string, maxLength = 150): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trim()}…`;
}

function isUsefulEnglishSummary(value: string | null): value is string {
  if (!value) return false;
  const normalized = value.replace(/\s+/g, ' ').trim();
  const latinCount = (normalized.match(/[A-Za-z]/g) || []).length;
  const cjkCount = (normalized.match(/[\u3400-\u9fff]/g) || []).length;
  return latinCount >= 20 && cjkCount <= Math.max(2, normalized.length * 0.05);
}

function getPromptCaseSummary(
  caseItem: PromptCaseSeo,
  locale: 'zh-CN' | 'en-US'
): string {
  const candidates = [caseItem.commercialIntent, caseItem.promptPreview];
  if (locale === 'en-US') {
    const englishSummary = candidates.find(isUsefulEnglishSummary);
    if (englishSummary) return englishSummary;
    const category = caseItem.category.replace(/[-_]+/g, ' ');
    return `Copy and adapt this ${category} prompt for ${caseItem.model}. Adjust the subject, camera, lighting, composition, and output constraints before generating variations.`;
  }
  return (
    candidates.find((value): value is string => Boolean(value?.trim())) ||
    caseItem.prompt ||
    caseItem.title
  );
}

function getPromptCaseDescription(
  caseItem: PromptCaseSeo | null,
  locale: 'zh-CN' | 'en-US'
): string {
  if (!caseItem) {
    return locale === 'en-US'
      ? 'A reusable WebToMind visual prompt case. Browse related prompt examples and generate from them in the image studio.'
      : 'WebToMind 精选可复用视觉 Prompt 案例，可浏览提示词、查看相关案例，并进入图片创作台继续生成。';
  }

  const summary = getPromptCaseSummary(caseItem, locale);
  return truncateDescription(
    locale === 'en-US'
      ? `${caseItem.title} · ${summary}`
      : `${caseItem.title} · ${summary}`
  );
}

function renderCriticalPromptSeoStyle(): string {
  return `<style id="prompt-detail-ssr-style">
    .prompt-detail-ssr{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#171717;background:#fbfaf7;min-height:100vh;padding:32px 20px 56px}
    .prompt-detail-ssr a{color:inherit}
    .prompt-detail-ssr-shell{max-width:1160px;margin:0 auto}
    .prompt-detail-ssr-hero{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(320px,.95fr);gap:28px;align-items:start}
    .prompt-detail-ssr-gallery{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
    .prompt-detail-ssr-gallery figure{margin:0;background:#eee7dd;border:1px solid rgba(35,31,26,.12);border-radius:14px;overflow:hidden;aspect-ratio:4/5}
    .prompt-detail-ssr-gallery figure:first-child{grid-column:span 2;aspect-ratio:16/11}
    .prompt-detail-ssr-gallery img{width:100%;height:100%;display:block;object-fit:cover}
    .prompt-detail-ssr-video{grid-column:span 2;margin:0;background:#111;border:1px solid rgba(35,31,26,.12);border-radius:14px;overflow:hidden;aspect-ratio:16/9}
    .prompt-detail-ssr-video video{display:block;width:100%;height:100%;object-fit:contain;background:#111}
    .prompt-detail-ssr-panel{background:#fff;border:1px solid rgba(35,31,26,.12);border-radius:18px;padding:24px;box-shadow:0 18px 48px rgba(35,31,26,.08)}
    .prompt-detail-ssr-kicker,.prompt-detail-ssr-tags,.prompt-detail-ssr-topics,.prompt-detail-ssr-actions{display:flex;flex-wrap:wrap;gap:8px}
    .prompt-detail-ssr-kicker span,.prompt-detail-ssr-tags span{font-size:12px;line-height:1;border:1px solid rgba(35,31,26,.14);border-radius:999px;padding:8px 10px;background:#f7f3eb;color:#5f5549}
    .prompt-detail-ssr h1{font-size:clamp(32px,5vw,56px);line-height:1.04;letter-spacing:0;margin:18px 0 14px;color:#201b16}
    .prompt-detail-ssr-lede{font-size:17px;line-height:1.7;color:#5a5147;margin:0 0 18px}
    .prompt-detail-ssr-actions{margin-top:22px}
    .prompt-detail-ssr-button{display:inline-flex;align-items:center;justify-content:center;min-height:44px;border-radius:10px;padding:0 16px;font-weight:700;text-decoration:none;background:#1d1a16;color:#fff!important}
    .prompt-detail-ssr-secondary{display:inline-flex;align-items:center;justify-content:center;min-height:44px;border-radius:10px;padding:0 16px;font-weight:700;text-decoration:none;border:1px solid rgba(35,31,26,.18);background:#fff}
    .prompt-detail-ssr-section{margin-top:28px;background:#fff;border:1px solid rgba(35,31,26,.1);border-radius:16px;padding:22px}
    .prompt-detail-ssr-section h2{font-size:22px;line-height:1.2;margin:0 0 14px;color:#201b16}
    .prompt-detail-ssr-section p{margin:0;color:#4f463d;font-size:15px;line-height:1.75}
    .prompt-detail-ssr-prompt{white-space:pre-wrap;overflow-wrap:anywhere;background:#151515;color:#f8f4ea;border-radius:14px;padding:18px;margin:0;font-size:14px;line-height:1.65}
    .prompt-detail-ssr-topics a,.prompt-detail-ssr-related a{border:1px solid rgba(35,31,26,.12);border-radius:10px;padding:10px 12px;text-decoration:none;background:#fbfaf7}
    .prompt-detail-ssr-related{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
    .prompt-detail-ssr-related a{display:block;overflow:hidden}
    .prompt-detail-ssr-related img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:8px;display:block;margin-bottom:8px;background:#eee7dd}
    .prompt-detail-ssr-related span{display:block;font-weight:700;font-size:14px;line-height:1.35}
    @media (max-width: 860px){.prompt-detail-ssr{padding:18px 12px 40px}.prompt-detail-ssr-hero{grid-template-columns:1fr}.prompt-detail-ssr-panel{padding:18px}.prompt-detail-ssr h1{font-size:34px}.prompt-detail-ssr-gallery figure:first-child{grid-column:span 1}.prompt-detail-ssr-gallery{grid-template-columns:1fr}.prompt-detail-ssr-related{grid-template-columns:1fr 1fr}}
  </style>`;
}

function renderPromptSeoBody(
  caseItem: PromptCaseSeo | null,
  locale: 'zh-CN' | 'en-US',
  relatedCases: PromptCaseSeo[] = []
): string {
  if (!caseItem) return '';

  const isEnglish = locale === 'en-US';
  const images = caseItem.imageUrls.slice(0, 4);
  const imageHtml = images
    .map((imageUrl, index) => {
      const optimizedUrl = getOptimizedPromptCaseImageUrl(imageUrl, {
        width: index === 0 ? 960 : 800,
        quality: 78
      });
      const srcSet = getPromptCaseResponsiveImageSet(
        imageUrl,
        PROMPT_DETAIL_IMAGE_WIDTHS
      );
      return `<figure><img src="${escapeHtml(optimizedUrl)}" srcset="${escapeHtml(
        srcSet
      )}" sizes="${PROMPT_DETAIL_IMAGE_SIZES}" alt="${escapeHtml(
        index === 0 ? caseItem.title : `${caseItem.title} ${index + 1}`
      )}" loading="${index === 0 ? 'eager' : 'lazy'}" decoding="async" fetchpriority="${
        index === 0 ? 'high' : 'low'
      }" width="${index === 0 ? '1200' : '800'}" height="${
        index === 0 ? '825' : '1000'
      }" /></figure>`;
    })
    .join('');
  const videoUrl = caseItem.videoUrls[0] || '';
  const mediaHtml =
    caseItem.mediaType === 'video' && videoUrl
      ? `<figure class="prompt-detail-ssr-video"><video controls playsinline preload="metadata"${
          caseItem.posterUrl
            ? ` poster="${escapeHtml(caseItem.posterUrl)}"`
            : ''
        } aria-label="${escapeHtml(caseItem.title)}"><source src="${escapeHtml(
          videoUrl
        )}" type="video/mp4" /></video></figure>${imageHtml}`
      : imageHtml ||
        `<figure><img src="${escapeHtml(FALLBACK_IMAGE)}" alt="" loading="eager" decoding="async" fetchpriority="high" width="1200" height="825" /></figure>`;
  const tags = caseItem.tags
    .map((tag) => `<span>${escapeHtml(tag)}</span>`)
    .join('');
  const topicLinks = getPromptSeoTopicLinks(caseItem, locale)
    .map(
      (item) =>
        `<a href="${escapeHtml(item.href)}">${escapeHtml(item.label)}</a>`
    )
    .join('');
  const relatedHtml = relatedCases
    .slice(0, 4)
    .map((item) => {
      const cover = getOptimizedPromptCaseImageUrl(
        item.imageUrls[0] || FALLBACK_IMAGE,
        { width: 480, quality: 72 }
      );
      return `<a href="${escapeHtml(getPromptCasePath(locale, item))}">
        <img src="${escapeHtml(cover)}" alt="" loading="lazy" decoding="async" width="480" height="360" />
        <span>${escapeHtml(item.title)}</span>
      </a>`;
    })
    .join('');
  const lede = getPromptCaseSummary(caseItem, locale);
  const reuseGuide =
    caseItem.mediaType === 'video'
      ? isEnglish
        ? 'Reuse the subject, action sequence, camera movement, timing, scene continuity, and negative constraints. Change one variable at a time and verify current model availability before generating.'
        : '复用时先保留主体、连续动作、运镜、时间节奏、场景连续性和负面约束，再一次只替换一个变量；生成前应先确认当前视频模型确实可用。'
      : isEnglish
        ? `This case keeps the prompt structure visible for search and reuse: start from the subject, scene, lighting, composition, output intent, and negative constraints, then replace only the parts that match your own product, cover, poster, or character workflow. Open it in WebToMind image creation to continue with model settings, references, gallery history, and Boards project context.`
        : `这个案例会把可复现的 Prompt 结构拆给搜索和创作使用：先确认主体、场景、光线、构图、输出用途和负面约束，再把其中的产品、封面主题、海报场景或角色设定替换成自己的需求。进入 WebToMind 图像创作后，可以继续带入模型参数、参考图、图库历史和 Boards 项目上下文，快速测试同一结构在不同商业画面里的表现。`;
  const canGenerateVideo =
    caseItem.mediaType === 'video' && caseItem.generationVerified;
  const primaryHref =
    caseItem.mediaType === 'video' && !canGenerateVideo
      ? '#public-prompt'
      : getCreateMediaHref(locale, caseItem);
  const primaryLabel =
    caseItem.mediaType === 'video'
      ? canGenerateVideo
        ? isEnglish
          ? 'Create video from this prompt'
          : '用这个 Prompt 生成视频'
        : isEnglish
          ? 'View the public video prompt'
          : '查看公开的视频 Prompt'
      : isEnglish
        ? 'Generate images from this prompt'
        : '用这个 Prompt 生成图片';
  // Unverified video cases keep an honest primary CTA but still carry the
  // handoff into the video workspace, matching the client-side prompt detail
  // page which always allows creating from the case prompt.
  const secondaryVideoHref =
    caseItem.mediaType === 'video' && !canGenerateVideo
      ? getCreateMediaHref(locale, caseItem)
      : '';
  const secondaryVideoLabel = isEnglish
    ? 'Continue in the video workspace'
    : '在视频工作台继续创作';

  return `<main id="prompt-detail-seo" class="prompt-detail-ssr">
    <div class="prompt-detail-ssr-shell">
      <article class="prompt-detail-ssr-hero">
        <div class="prompt-detail-ssr-gallery">${mediaHtml}</div>
        <section class="prompt-detail-ssr-panel">
          <div class="prompt-detail-ssr-kicker">
            <span>${escapeHtml(caseItem.category)}</span>
            <span>${escapeHtml(caseItem.model)}</span>
            ${caseItem.packageSlug ? `<span>${escapeHtml(caseItem.packageSlug)}</span>` : ''}
            ${caseItem.memberOnly ? `<span>${isEnglish ? 'Member case' : '会员案例'}</span>` : ''}
          </div>
          <h1>${escapeHtml(caseItem.title)}</h1>
          <p class="prompt-detail-ssr-lede">${escapeHtml(lede)}</p>
          ${tags ? `<div class="prompt-detail-ssr-tags">${tags}</div>` : ''}
          <div class="prompt-detail-ssr-actions">
            <a class="prompt-detail-ssr-button" href="${escapeHtml(primaryHref)}">${primaryLabel}</a>
            ${secondaryVideoHref ? `<a class="prompt-detail-ssr-secondary" href="${escapeHtml(secondaryVideoHref)}">${escapeHtml(secondaryVideoLabel)}</a>` : ''}
            <a class="prompt-detail-ssr-secondary" href="${escapeHtml(getPromptLibraryHref(locale))}">${isEnglish ? 'Browse prompt cases' : '浏览更多 Prompt 案例'}</a>
          </div>
        </section>
      </article>
      <section id="public-prompt" class="prompt-detail-ssr-section">
        <h2>${isEnglish ? 'Public prompt' : '公开 Prompt'}</h2>
        ${
          caseItem.memberOnly
            ? `<p>${isEnglish ? 'This member-only prompt is not exposed on the public page.' : '该会员案例不会在公开页面暴露完整 Prompt。'}</p>`
            : `<pre class="prompt-detail-ssr-prompt">${escapeHtml(caseItem.prompt)}</pre>`
        }
      </section>
      <section class="prompt-detail-ssr-section">
        <h2>${isEnglish ? 'How to reuse this prompt' : '如何复用这个 Prompt'}</h2>
        <p>${escapeHtml(reuseGuide)}</p>
      </section>
      ${
        topicLinks
          ? `<section class="prompt-detail-ssr-section">
        <h2>${isEnglish ? 'Related prompt guides' : '相关 Prompt 专题'}</h2>
        <div class="prompt-detail-ssr-topics">${topicLinks}</div>
      </section>`
          : ''
      }
      ${
        relatedHtml
          ? `<section class="prompt-detail-ssr-section">
        <h2>${isEnglish ? 'Related prompt cases' : '相关案例'}</h2>
        <div class="prompt-detail-ssr-related">${relatedHtml}</div>
      </section>`
          : ''
      }
    </div>
  </main>`;
}

function renderPromptBootstrap(caseItem: PromptCaseSeo | null): string {
  if (!caseItem) return '';
  return `<script id="webtomind-prompt-bootstrap" type="application/json">${escapeJsonForHtml(
    {
      id: caseItem.id,
      imageUrl: caseItem.imageUrls[0] || '',
      imageUrls: caseItem.imageUrls,
      mediaType: caseItem.mediaType,
      videoUrl: caseItem.videoUrls[0] || '',
      videoUrls: caseItem.videoUrls,
      posterUrl: caseItem.posterUrl || '',
      durationSeconds: caseItem.durationSeconds || undefined,
      uploadDate: caseItem.uploadDate || undefined,
      title: caseItem.title,
      slug: caseItem.slug,
      category: caseItem.category,
      tags: caseItem.tags,
      model: caseItem.model,
      locale: caseItem.locale,
      sourceCaseId: caseItem.sourceCaseId,
      packageSlug: caseItem.packageSlug,
      commercialIntent: caseItem.commercialIntent,
      promptPreview: caseItem.promptPreview,
      memberOnly: caseItem.memberOnly,
      promptLocked: caseItem.memberOnly,
      prompt: caseItem.memberOnly ? '' : caseItem.prompt
    }
  )}</script>`;
}

function renderPromptImagePreload(caseItem: PromptCaseSeo | null): string {
  const imageUrl = caseItem?.imageUrls[0];
  if (!imageUrl) return '';
  const href = getOptimizedPromptCaseImageUrl(imageUrl, {
    width: 960,
    quality: 78
  });
  const srcSet = getPromptCaseResponsiveImageSet(
    imageUrl,
    PROMPT_DETAIL_IMAGE_WIDTHS
  );
  return `<link rel="preload" as="image" href="${escapeHtml(
    href
  )}" imagesrcset="${escapeHtml(srcSet)}" imagesizes="${PROMPT_DETAIL_IMAGE_SIZES}" fetchpriority="high" />`;
}

export function injectPromptSeo(
  html: string,
  caseItem: PromptCaseSeo | null,
  requestedLocale: 'zh-CN' | 'en-US',
  identifier: string,
  identifierType: 'slug' | 'id',
  alternateLinks: SeoAlternate[] = [],
  relatedCases: PromptCaseSeo[] = []
): string {
  const locale = requestedLocale;
  const pageTitle = caseItem
    ? [...caseItem.title].length >= 50
      ? caseItem.title
      : `${caseItem.title} | WebToMind Prompts`
    : locale === 'en-US'
      ? 'Prompt not found | WebToMind'
      : '未找到 Prompt | WebToMind';
  const socialTitle =
    caseItem?.mediaType === 'video'
      ? pageTitle
      : caseItem
        ? PROMPT_OG_CTA
        : pageTitle;
  const description = caseItem
    ? getPromptCaseDescription(caseItem, locale)
    : getPromptCaseDescription(null, locale);
  const canonical =
    caseItem?.slug || identifierType === 'slug'
      ? `${SITE_URL}/${locale}/prompts/${encodeURIComponent(
          caseItem?.slug || identifier
        )}`
      : `${SITE_URL}/${locale}/create/prompts/share/${encodeURIComponent(
          caseItem?.id || identifier
        )}`;
  const ogImage = getPromptCaseSocialImageUrl(caseItem);
  const htmlLang = locale === 'en-US' ? 'en' : 'zh-CN';
  const robots = caseItem?.seoIndexable
    ? caseItem.mediaType === 'video'
      ? 'index,follow,max-video-preview:-1'
      : 'index,follow'
    : caseItem
      ? 'noindex,follow'
      : 'noindex,nofollow';
  const alternates =
    alternateLinks.length > 0
      ? alternateLinks
      : [
          { hreflang: locale, href: canonical },
          { hreflang: 'x-default', href: canonical }
        ];
  const jsonLd = caseItem
    ? caseItem.mediaType === 'video' &&
      caseItem.videoUrls[0] &&
      caseItem.posterUrl &&
      caseItem.uploadDate &&
      caseItem.durationSeconds
      ? {
          '@context': 'https://schema.org',
          '@type': 'VideoObject',
          name: caseItem.title,
          description,
          url: canonical,
          inLanguage: locale,
          keywords: caseItem.tags.join(', '),
          thumbnailUrl: [caseItem.posterUrl],
          uploadDate: caseItem.uploadDate,
          duration: `PT${Math.round(caseItem.durationSeconds)}S`,
          contentUrl: caseItem.videoUrls[0]
        }
      : {
          '@context': 'https://schema.org',
          '@type': 'CreativeWork',
          name: caseItem.title,
          description,
          url: canonical,
          inLanguage: locale,
          keywords: caseItem.tags.join(', '),
          image: caseItem.imageUrls.map((imageUrl) => ({
            '@type': 'ImageObject',
            url: imageUrl
          }))
        }
    : undefined;

  let nextHtml = html.replace(
    /<html\s+lang="[^"]*"/,
    `<html lang="${htmlLang}"`
  );
  nextHtml = replaceTag(
    nextHtml,
    /<title>[\s\S]*?<\/title>/i,
    `<title>${escapeHtml(pageTitle)}</title>`
  );
  nextHtml = replaceTag(
    nextHtml,
    /<meta\s+name="description"[\s\S]*?\/>/i,
    `<meta name="description" content="${escapeHtml(description)}" />`
  );
  nextHtml = replaceTag(
    nextHtml,
    /<meta\s+name="robots"[\s\S]*?\/>/i,
    `<meta name="robots" content="${escapeHtml(robots)}" />`
  );
  nextHtml = replaceTag(
    nextHtml,
    /<link\s+rel="canonical"[\s\S]*?\/>/i,
    `<link rel="canonical" href="${escapeHtml(canonical)}" />`
  );
  nextHtml = replaceTag(
    nextHtml,
    /<meta\s+property="og:title"[\s\S]*?\/>/i,
    `<meta property="og:title" content="${escapeHtml(socialTitle)}" />`
  );
  nextHtml = replaceTag(
    nextHtml,
    /<meta\s+property="og:description"[\s\S]*?\/>/i,
    `<meta property="og:description" content="${escapeHtml(description)}" />`
  );
  nextHtml = replaceTag(
    nextHtml,
    /<meta\s+property="og:url"[\s\S]*?\/>/i,
    `<meta property="og:url" content="${escapeHtml(canonical)}" />`
  );
  nextHtml = replaceTag(
    nextHtml,
    /<meta\s+property="og:image"[\s\S]*?\/>/i,
    `<meta property="og:image" content="${escapeHtml(ogImage)}" />`
  );
  nextHtml = replaceTag(
    nextHtml,
    /<meta\s+name="twitter:title"[\s\S]*?\/>/i,
    `<meta name="twitter:title" content="${escapeHtml(socialTitle)}" />`
  );
  nextHtml = replaceTag(
    nextHtml,
    /<meta\s+name="twitter:description"[\s\S]*?\/>/i,
    `<meta name="twitter:description" content="${escapeHtml(description)}" />`
  );
  nextHtml = replaceTag(
    nextHtml,
    /<meta\s+name="twitter:image"[\s\S]*?\/>/i,
    `<meta name="twitter:image" content="${escapeHtml(ogImage)}" />`
  );
  const twitterCardMeta =
    '<meta name="twitter:card" content="summary_large_image" />';
  if (/<meta\s+name="twitter:card"[\s\S]*?\/>/i.test(nextHtml)) {
    nextHtml = replaceTag(
      nextHtml,
      /<meta\s+name="twitter:card"[\s\S]*?\/>/i,
      twitterCardMeta
    );
  } else {
    nextHtml = nextHtml.replace('</head>', `    ${twitterCardMeta}\n  </head>`);
  }

  const alternateHtml = alternates
    .map(
      (alternate) =>
        `<link rel="alternate" hreflang="${alternate.hreflang}" href="${escapeHtml(alternate.href)}" />`
    )
    .join('\n    ');
  const jsonLdHtml = jsonLd
    ? `<script id="webtomind-seo-jsonld" type="application/ld+json">${escapeJsonForHtml(jsonLd)}</script>`
    : '';
  const criticalStyleHtml = caseItem ? renderCriticalPromptSeoStyle() : '';
  const bootstrapHtml = renderPromptBootstrap(caseItem);
  const imagePreloadHtml = renderPromptImagePreload(caseItem);
  const injectedHead = `${alternateHtml}\n    ${jsonLdHtml}\n    ${imagePreloadHtml}\n    ${bootstrapHtml}\n    ${criticalStyleHtml}`;

  nextHtml = nextHtml.replace('</head>', `    ${injectedHead}\n  </head>`);

  const seoBody = renderPromptSeoBody(caseItem, locale, relatedCases);
  if (seoBody) {
    nextHtml = nextHtml.replace(
      /<div id="root"><\/div>/,
      `<div id="root">${seoBody}</div>`
    );
  }

  return nextHtml;
}

export async function renderPromptPageHtml(params: {
  html: string;
  locale: 'zh-CN' | 'en-US';
  slug?: string;
  id?: string;
  redirectIdToSlug?: boolean;
}): Promise<{ html: string; status: number; redirectPath?: string }> {
  const slug = (params.slug || '').trim();
  const id = (params.id || '').trim();
  if (!slug && !id) return { html: 'Missing prompt slug or id', status: 400 };

  const databaseCase = await loadPromptCase(
    slug ? { slug, locale: params.locale } : { id, locale: params.locale }
  );
  const caseItem =
    databaseCase || (slug ? loadStaticPromptCase(slug, params.locale) : null);
  if (params.redirectIdToSlug && id && caseItem?.slug) {
    return {
      html: '',
      status: 308,
      redirectPath: getPromptCasePath(params.locale, caseItem)
    };
  }
  const alternates = await loadPromptCaseAlternates(caseItem, params.locale);
  // A translated record has its own canonical slug. Keep bilingual fallback
  // when no published/indexable translation exists, but do not index both slugs
  // for the same language when the linked translation is available.
  if (slug && databaseCase && databaseCase.locale !== params.locale) {
    const translated = alternates.find(
      (item) => item.hreflang === params.locale
    );
    if (
      translated &&
      translated.href !== getPromptCaseHref(params.locale, databaseCase)
    ) {
      return {
        html: '',
        status: 308,
        redirectPath: new URL(translated.href).pathname
      };
    }
  }
  const relatedCases = await loadRelatedPromptCases(caseItem, params.locale);
  return {
    html: injectPromptSeo(
      params.html,
      caseItem,
      params.locale,
      slug || id,
      slug ? 'slug' : 'id',
      alternates,
      relatedCases
    ),
    status: caseItem ? 200 : 404
  };
}
