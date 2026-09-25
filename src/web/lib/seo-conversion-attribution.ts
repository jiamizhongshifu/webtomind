import { getAnalyticsSessionId } from './analytics';

const SEO_CONVERSION_ATTRIBUTION_STORAGE_KEY =
  'webtomind:seo-conversion-attribution:v1';
const SEO_CONVERSION_ATTRIBUTION_TTL_MS = 24 * 60 * 60 * 1000;
const SEO_CONTENT_CTA_ATTRIBUTION_STORAGE_KEY =
  'webtomind:seo-content-cta-attribution:v1';
const FIRST_TOUCH_ACQUISITION_STORAGE_KEY =
  'webtomind:first-touch-acquisition:v1';

const UTM_QUERY_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content'
] as const;

const CLICK_ID_QUERY_KEYS = [
  'gclid',
  'dclid',
  'gbraid',
  'wbraid',
  'msclkid',
  'fbclid'
] as const;

// 与 analytics.ts 的 TRUSTED_WORKFLOW_REFERRER_HOSTS 保持一致：这些回流
// 是登录/支付工作流的一部分，不应视为外部获客来源。
const TRUSTED_WORKFLOW_REFERRER_HOSTS = new Set([
  'accounts.google.com',
  'checkout.stripe.com'
]);

const MAX_ACQUISITION_FIELD_LENGTH = 200;

const SEO_PROMPT_USE_SOURCES = new Set([
  'prompt_detail_use',
  'prompt_preview_use',
  'prompt_case_recipe'
]);

const SEO_PROMPT_USE_SOURCE_ALIASES: Record<string, string> = {
  prompt_preview_cta: 'prompt_preview_use',
  prompt_detail_recipe_use: 'prompt_case_recipe',
  prompt_detail_recipe_replace: 'prompt_case_recipe'
};

export interface SeoConversionAttribution {
  sessionId: string;
  canonicalPath: string;
  caseId: string;
  caseSlug?: string;
  source: string;
  cluster?: string;
  contentId?: string;
  mediaType?: 'image' | 'video';
  model?: string;
  cta?: string;
  acquisition?: AcquisitionSnapshot;
  capturedAt: string;
}

export interface AcquisitionSnapshot {
  utm?: Record<string, string>;
  clickId?: string;
  externalReferrer?: string;
  refCode?: string;
}

interface SeoContentCtaAttribution {
  canonicalPath: string;
  contentId: string;
  source: string;
  ctaKind: string;
  capturedAt: string;
}

function cleanText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : undefined;
}

function cleanReferrer(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  try {
    // 只保留 origin + pathname，丢弃 query/hash，避免敏感参数入库。
    const url = new URL(trimmed, 'https://webtomind.com');
    const hostname = url.hostname.toLowerCase();
    if (
      TRUSTED_WORKFLOW_REFERRER_HOSTS.has(hostname) ||
      hostname === 'webtomind.com' ||
      hostname.endsWith('.webtomind.com')
    ) {
      return undefined;
    }
    return `${url.origin}${url.pathname}`.slice(0, MAX_ACQUISITION_FIELD_LENGTH);
  } catch {
    return undefined;
  }
}

function normalizeAcquisition(
  value: unknown
): AcquisitionSnapshot | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const utmRaw = record.utm;
  const utm: Record<string, string> = {};
  if (utmRaw && typeof utmRaw === 'object' && !Array.isArray(utmRaw)) {
    for (const [key, rawValue] of Object.entries(utmRaw as Record<string, unknown>)) {
      const cleaned = cleanText(rawValue, MAX_ACQUISITION_FIELD_LENGTH);
      if (cleaned && UTM_QUERY_KEYS.includes(key as (typeof UTM_QUERY_KEYS)[number])) {
        utm[key] = cleaned;
      }
    }
  }
  const clickId = cleanText(record.clickId, MAX_ACQUISITION_FIELD_LENGTH);
  const refCode = cleanText(record.refCode, MAX_ACQUISITION_FIELD_LENGTH);
  const externalReferrer = cleanReferrer(record.externalReferrer);
  if (
    Object.keys(utm).length === 0 &&
    !clickId &&
    !refCode &&
    !externalReferrer
  ) {
    return undefined;
  }
  return {
    ...(Object.keys(utm).length > 0 ? { utm } : {}),
    ...(clickId ? { clickId } : {}),
    ...(externalReferrer ? { externalReferrer } : {}),
    ...(refCode ? { refCode } : {})
  };
}

function readFirstTouchAcquisition(): AcquisitionSnapshot | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const raw = window.sessionStorage.getItem(FIRST_TOUCH_ACQUISITION_STORAGE_KEY);
    if (!raw) return undefined;
    return normalizeAcquisition(JSON.parse(raw));
  } catch {
    return undefined;
  }
}

/**
 * 捕获会话首触获客快照。必须在首次落地时调用（main.tsx 模块加载时），
 * 之后 SPA 内跳转不会覆盖。只保存白名单字段，不保存原始 query/referrer。
 */
export function captureFirstTouchAcquisition(): AcquisitionSnapshot | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const existing = window.sessionStorage.getItem(
      FIRST_TOUCH_ACQUISITION_STORAGE_KEY
    );
    if (existing) {
      return normalizeAcquisition(JSON.parse(existing));
    }
    const searchParams = new URLSearchParams(window.location.search);
    const utm: Record<string, string> = {};
    for (const key of UTM_QUERY_KEYS) {
      const value = cleanText(searchParams.get(key), MAX_ACQUISITION_FIELD_LENGTH);
      if (value) utm[key] = value;
    }
    let clickId: string | undefined;
    for (const key of CLICK_ID_QUERY_KEYS) {
      const value = cleanText(searchParams.get(key), MAX_ACQUISITION_FIELD_LENGTH);
      if (value) {
        clickId = value;
        break;
      }
    }
    const refCode = cleanText(searchParams.get('ref'), MAX_ACQUISITION_FIELD_LENGTH);
    const externalReferrer = cleanReferrer(window.document.referrer);
    const acquisition = normalizeAcquisition({
      utm,
      clickId,
      externalReferrer,
      refCode
    });
    if (acquisition) {
      window.sessionStorage.setItem(
        FIRST_TOUCH_ACQUISITION_STORAGE_KEY,
        JSON.stringify(acquisition)
      );
    }
    return acquisition;
  } catch {
    return undefined;
  }
}

function cleanCanonicalPath(value: unknown): string | undefined {
  const text = cleanText(value, 500);
  if (!text) return undefined;
  try {
    const url = new URL(text, 'https://webtomind.com');
    return url.pathname.startsWith('/')
      ? url.pathname.slice(0, 500)
      : undefined;
  } catch {
    return undefined;
  }
}

function normalizeSeoContentCtaAttribution(
  value: unknown
): SeoContentCtaAttribution | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const canonicalPath = cleanCanonicalPath(record.canonicalPath);
  const contentId = cleanText(record.contentId, 160);
  const source = cleanText(record.source, 240);
  const ctaKind = cleanText(record.ctaKind, 80);
  const capturedAt = cleanText(record.capturedAt, 40);
  const capturedAtMs = capturedAt ? Date.parse(capturedAt) : Number.NaN;
  if (
    !canonicalPath?.match(/^\/(?:zh-CN|en-US)\/blog\/[a-z0-9-]+$/) ||
    !contentId?.match(/^[a-z0-9-]+$/) ||
    !ctaKind?.match(/^[a-z_]+$/) ||
    source !== `seo_blog_${contentId}_${ctaKind}` ||
    !Number.isFinite(capturedAtMs) ||
    Date.now() - capturedAtMs > SEO_CONVERSION_ATTRIBUTION_TTL_MS ||
    capturedAtMs > Date.now() + 60_000
  ) {
    return undefined;
  }
  return {
    canonicalPath,
    contentId,
    source,
    ctaKind,
    capturedAt: new Date(capturedAtMs).toISOString()
  };
}

function readSeoContentCtaAttribution():
  | SeoContentCtaAttribution
  | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const raw = window.sessionStorage.getItem(
      SEO_CONTENT_CTA_ATTRIBUTION_STORAGE_KEY
    );
    if (!raw) return undefined;
    const attribution = normalizeSeoContentCtaAttribution(JSON.parse(raw));
    if (!attribution) {
      window.sessionStorage.removeItem(
        SEO_CONTENT_CTA_ATTRIBUTION_STORAGE_KEY
      );
    }
    return attribution;
  } catch {
    return undefined;
  }
}

export function captureSeoContentCtaAttribution():
  | SeoContentCtaAttribution
  | undefined {
  if (typeof window === 'undefined') return undefined;
  const params = new URLSearchParams(window.location.search);
  const attribution = normalizeSeoContentCtaAttribution({
    canonicalPath: params.get('seo_content_path'),
    contentId: params.get('seo_content_id'),
    source: params.get('cta_source') || params.get('source'),
    ctaKind: params.get('seo_cta_kind'),
    capturedAt: new Date().toISOString()
  });
  if (!attribution) return readSeoContentCtaAttribution();
  try {
    window.sessionStorage.setItem(
      SEO_CONTENT_CTA_ATTRIBUTION_STORAGE_KEY,
      JSON.stringify(attribution)
    );
  } catch {
    // Content attribution is best-effort and must never block navigation.
  }
  return attribution;
}

function normalizeSeoPromptUseSource(value: unknown): string | undefined {
  const source = cleanText(value, 120);
  if (!source) return undefined;
  const normalizedSource = SEO_PROMPT_USE_SOURCE_ALIASES[source] ?? source;
  return SEO_PROMPT_USE_SOURCES.has(normalizedSource)
    ? normalizedSource
    : undefined;
}

function normalizeAttribution(
  value: unknown
): SeoConversionAttribution | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const sessionId = cleanText(record.sessionId, 160);
  const canonicalPath = cleanCanonicalPath(record.canonicalPath);
  const caseId = cleanText(record.caseId, 160);
  const caseSlug = cleanText(record.caseSlug, 160);
  const source = normalizeSeoPromptUseSource(record.source);
  const cluster = cleanText(record.cluster, 160);
  const contentId = cleanText(record.contentId, 160);
  const mediaType =
    record.mediaType === 'video'
      ? 'video'
      : record.mediaType === 'image'
        ? 'image'
        : undefined;
  const model = cleanText(record.model, 160);
  const cta = cleanText(record.cta, 160);
  const capturedAt = cleanText(record.capturedAt, 40);
  const capturedAtMs = capturedAt ? Date.parse(capturedAt) : Number.NaN;
  if (
    !sessionId ||
    !canonicalPath ||
    !caseId ||
    !source ||
    !Number.isFinite(capturedAtMs) ||
    Date.now() - capturedAtMs > SEO_CONVERSION_ATTRIBUTION_TTL_MS ||
    capturedAtMs > Date.now() + 60_000
  ) {
    return undefined;
  }
  const acquisition = readFirstTouchAcquisition();
  return {
    sessionId,
    canonicalPath,
    caseId,
    ...(caseSlug ? { caseSlug } : {}),
    source,
    ...(cluster ? { cluster } : {}),
    ...(contentId ? { contentId } : {}),
    ...(mediaType ? { mediaType } : {}),
    ...(model ? { model } : {}),
    ...(cta ? { cta } : {}),
    ...(acquisition ? { acquisition } : {}),
    capturedAt: new Date(capturedAtMs).toISOString()
  };
}

export function rememberSeoConversionAttribution(input: {
  canonicalPath: string;
  caseId: string;
  caseSlug?: string;
  source: string;
  cluster?: string;
  contentId?: string;
  mediaType?: 'image' | 'video';
  model?: string;
  cta?: string;
}): SeoConversionAttribution | undefined {
  if (typeof window === 'undefined') return undefined;
  // 兜底：如果 main.tsx 未能在落地时捕获（例如直接进入 prompt use 流程），
  // 在写入快照前补一次捕获；sessionStorage 已存在时不会覆盖。
  captureFirstTouchAcquisition();
  const contentAttribution = captureSeoContentCtaAttribution();
  const attribution = normalizeAttribution({
    ...input,
    ...(contentAttribution
      ? {
          canonicalPath: contentAttribution.canonicalPath,
          cluster: input.cluster || 'seo_blog',
          contentId: input.contentId || contentAttribution.contentId,
          cta: input.cta || contentAttribution.source
        }
      : {}),
    sessionId: getAnalyticsSessionId(),
    capturedAt: new Date().toISOString()
  });
  if (!attribution) return undefined;
  try {
    window.sessionStorage.setItem(
      SEO_CONVERSION_ATTRIBUTION_STORAGE_KEY,
      JSON.stringify(attribution)
    );
  } catch {
    // Attribution remains best-effort and must never block prompt use.
  }
  return attribution;
}

export function readSeoConversionAttribution(
  options: {
    source?: string;
    caseId?: string;
  } = {}
): SeoConversionAttribution | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const raw = window.sessionStorage.getItem(
      SEO_CONVERSION_ATTRIBUTION_STORAGE_KEY
    );
    if (!raw) return undefined;
    const attribution = normalizeAttribution(JSON.parse(raw));
    if (!attribution) {
      window.sessionStorage.removeItem(SEO_CONVERSION_ATTRIBUTION_STORAGE_KEY);
      return undefined;
    }
    if (
      options.source &&
      attribution.source !== normalizeSeoPromptUseSource(options.source)
    ) {
      return undefined;
    }
    if (options.caseId && attribution.caseId !== options.caseId) {
      return undefined;
    }
    return attribution;
  } catch {
    return undefined;
  }
}

export function isSeoPromptUseSource(source: string | undefined): boolean {
  return Boolean(normalizeSeoPromptUseSource(source));
}
