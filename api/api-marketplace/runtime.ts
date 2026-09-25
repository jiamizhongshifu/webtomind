import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@supabase/supabase-js';
import { getCorsHeadersForRequest, getSupabaseAdmin } from '../utils/auth';
import {
  assertPromptCaseAdmin,
  type PromptCaseAdminAuthResult
} from '../admin/prompt-case-auth';
import {
  API_KEY_PREFIX,
  API_MARKETPLACE_STATUS_URL,
  API_MARKETPLACE_ADMIN_EMAIL,
  applyTuziGroupPricing,
  isApiMarketplaceAdminEmail,
  isValidApiKeyName,
  TUZI_DEFAULT_GROUP,
  TUZI_PRICING_ENDPOINT
} from '../../src/shared/api-marketplace';
import type { TuziPricingModel as SharedTuziPricingModel } from '../../src/shared/api-marketplace';

export const API_MARKETPLACE_MARKUP = 1.3;
export const API_MARKETPLACE_DEFAULT_GROUP = TUZI_DEFAULT_GROUP;
export const API_MARKETPLACE_KEY_PREFIX = API_KEY_PREFIX;

/**
 * Temporary launch gate for the marketplace. The existing prompt-case admin
 * auth is intentionally narrowed to one exact email here so adding another
 * prompt admin cannot silently grant API marketplace access.
 */
export async function assertApiMarketplaceAdmin(
  request: Request
): Promise<PromptCaseAdminAuthResult> {
  const result = await assertPromptCaseAdmin(request, [
    API_MARKETPLACE_ADMIN_EMAIL
  ]);
  if (!result.ok) return result;
  if (!isApiMarketplaceAdminEmail(result.email)) {
    return {
      ok: false,
      status: 403,
      error: 'API marketplace admin access required'
    };
  }
  return result;
}

const DEFAULT_TUZI_PRICING_URL = TUZI_PRICING_ENDPOINT;
const DEFAULT_TUZI_UPSTREAM_BASE_URL = 'https://api.sydney-ai.com';

export function getTuziPricingUrl(): string {
  const configuredUrl = (
    process.env.API_MARKETPLACE_TUZI_PRICING_URL || ''
  ).trim();
  const relayBaseUrl = getMarketplaceRelayBaseUrl();

  // Pricing is part of the same provider boundary as model traffic. Once a
  // valid relay is configured, never let a stale direct-provider env var route
  // the catalog around it. In production, an absent/invalid relay returns an
  // empty URL so the catalog fails closed instead of attempting a direct call.
  if (isMarketplaceRelayRequired()) {
    if (!relayBaseUrl || getMarketplaceRelayBaseUrlError()) return '';
    return `${relayBaseUrl.replace(/\/+$/, '')}/pricing`;
  }

  return configuredUrl || DEFAULT_TUZI_PRICING_URL;
}

function isMarketplaceRelayPricingUrl(url: string): boolean {
  try {
    const pricingUrl = new URL(url);
    const relayUrl = new URL(getMarketplaceRelayBaseUrl());
    const relayPath = relayUrl.pathname.replace(/\/$/, '');
    return (
      pricingUrl.origin === relayUrl.origin &&
      pricingUrl.pathname === `${relayPath}/pricing`
    );
  } catch {
    return false;
  }
}

function getTuziPricingRequestHeaders(url: string): Record<string, string> {
  if (!isMarketplaceRelayPricingUrl(url)) return {};
  const relayKey = getMarketplaceRelayApiKey();
  return relayKey ? { Authorization: `Bearer ${relayKey}` } : {};
}

// ---------------------------------------------------------------------------
// Public /v1 endpoint allowlist
//
// The public gateway only ever proxies requests whose exact method+path match
// one of these OpenAI-compatible rules. A valid model in the body is never
// enough to reach an arbitrary upstream path. Models that carry explicit
// catalog endpoints are additionally restricted to those paths.
// ---------------------------------------------------------------------------

export type EndpointRule = { method: string; path: string };

export const OPENAI_COMPATIBLE_ENDPOINT_RULES: readonly EndpointRule[] = [
  { method: 'GET', path: '/models' },
  { method: 'POST', path: '/chat/completions' },
  { method: 'POST', path: '/responses' },
  { method: 'POST', path: '/completions' },
  { method: 'POST', path: '/embeddings' },
  { method: 'POST', path: '/images/generations' },
  { method: 'POST', path: '/images/edits' },
  { method: 'POST', path: '/audio/speech' },
  { method: 'POST', path: '/audio/transcriptions' },
  { method: 'POST', path: '/audio/translations' },
  { method: 'POST', path: '/moderations' }
];

/** Normalizes a catalog path such as `/v1/chat/completions` to `/chat/completions`. */
export function normalizeEndpointPath(value: string): string {
  const trimmed = value.trim();
  const withoutV1 = trimmed.replace(/^\/v1(?=\/|$)/, '');
  return withoutV1.startsWith('/') ? withoutV1 : `/${withoutV1}`;
}

/**
 * Defense-in-depth path safety check. The allowlist requires an exact match to
 * a fixed safe string, so traversal normally fails the match; this helper
 * additionally rejects encoded separators and double slashes before anything
 * is compared or forwarded.
 */
export function isSafeEndpointPath(path: string): boolean {
  if (typeof path !== 'string' || !path.startsWith('/')) return false;
  if (path.includes('\\') || path.includes('\0')) return false;
  const lower = path.toLowerCase();
  if (
    lower.includes('..') ||
    lower.includes('%2e') ||
    lower.includes('%2f') ||
    lower.includes('%00')
  ) {
    return false;
  }
  if (path.includes('//')) return false;
  const segments = path.slice(1).split('/');
  return segments.every(
    (segment) => segment.length > 0 && /^[A-Za-z0-9._-]+$/.test(segment)
  );
}

/**
 * Returns the exact gateway paths a model is allowed to use, based on the
 * catalog's `endpoints` map (e.g. `{ openai: { path: '/v1/chat/completions' } }`).
 * Returns null when the catalog carries no endpoint metadata, meaning the
 * model may use any rule in {@link OPENAI_COMPATIBLE_ENDPOINT_RULES}.
 */
export function getModelAllowedEndpointPaths(
  model: Pick<ApiMarketplaceModel, 'endpointDetails'>
): Set<string> | null {
  const details =
    model.endpointDetails && typeof model.endpointDetails === 'object'
      ? (model.endpointDetails as Record<string, unknown>)
      : {};
  const paths = new Set<string>();
  for (const value of Object.values(details)) {
    if (!value || typeof value !== 'object') continue;
    const path = (value as Record<string, unknown>).path;
    if (typeof path === 'string' && path.trim()) {
      paths.add(normalizeEndpointPath(path));
    }
  }
  return paths.size > 0 ? paths : null;
}

/**
 * The pricing feed also contains provider-specific endpoints (for example
 * video or vendor-native paths). They are useful metadata, but the public
 * gateway deliberately does not proxy them. Do not advertise a model unless
 * at least one of its declared paths can be reached through our public
 * OpenAI-compatible surface.
 */
export function hasCallableMarketplaceEndpoint(
  model: Pick<ApiMarketplaceModel, 'endpointDetails'>
): boolean {
  const allowedPaths = getModelAllowedEndpointPaths(model);
  if (allowedPaths === null) return true;
  return OPENAI_COMPATIBLE_ENDPOINT_RULES.some((rule) =>
    allowedPaths.has(rule.path)
  );
}

/**
 * Single gate for the public gateway: the request must match a global
 * OpenAI-compatible rule, pass path safety checks, and (when the catalog
 * declares endpoints for the model) be one of the model's own endpoints.
 */
export function isEndpointAllowed(
  method: string,
  path: string,
  model?: Pick<ApiMarketplaceModel, 'endpointDetails'> | null
): boolean {
  if (!isSafeEndpointPath(path)) return false;
  const rule = OPENAI_COMPATIBLE_ENDPOINT_RULES.find(
    (item) => item.method === method.toUpperCase() && item.path === path
  );
  if (!rule) return false;
  if (!model) return true;
  const allowedPaths = getModelAllowedEndpointPaths(model);
  return allowedPaths === null || allowedPaths.has(path);
}

// ---------------------------------------------------------------------------
// Relay configuration (fail-closed)
// ---------------------------------------------------------------------------

const PROVIDER_HOSTS = new Set([
  'api.tu-zi.com',
  'apius.tu-zi.com',
  'api.sydney-ai.com',
  'apistatus.sydney-ai.com'
]);

function isLocalHostname(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local')
  );
}

export type MarketplaceRuntimeMode = 'production' | 'development';

/**
 * Production is the default. Only an explicit development marker (local dev /
 * test / `WEBTOMIND_RUNTIME=dev`) permits the legacy direct-upstream fallback;
 * an unset or unknown runtime must never silently bypass the relay.
 */
export function getMarketplaceRuntimeMode(): MarketplaceRuntimeMode {
  const runtime = (process.env.WEBTOMIND_RUNTIME || '').trim().toLowerCase();
  const nodeEnv = (process.env.NODE_ENV || '').trim().toLowerCase();
  if (
    runtime === 'dev' ||
    runtime === 'development' ||
    runtime === 'local' ||
    nodeEnv === 'dev' ||
    nodeEnv === 'development' ||
    nodeEnv === 'local' ||
    nodeEnv === 'test'
  ) {
    return 'development';
  }
  return 'production';
}

function getMarketplaceRelayBaseUrl(): string {
  return (process.env.API_MARKETPLACE_RELAY_BASE_URL || '').trim();
}

function getMarketplaceRelayApiKey(): string | null {
  return (process.env.API_MARKETPLACE_RELAY_API_KEY || '').trim() || null;
}

export function isMarketplaceRelayConfigured(): boolean {
  return Boolean(getMarketplaceRelayBaseUrl() && getMarketplaceRelayApiKey());
}

export function isMarketplaceRelayRequired(): boolean {
  const configured = process.env.API_MARKETPLACE_RELAY_REQUIRED;
  if (configured !== undefined && configured.trim() !== '') {
    const value = configured.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on', 'enabled'].includes(value)) return true;
    if (['0', 'false', 'no', 'off', 'disabled'].includes(value)) return false;
  }
  return getMarketplaceRuntimeMode() === 'production';
}

/**
 * Validates the relay base URL itself (independent of whether the relay is
 * required). Returns an error string or null when the URL is usable.
 */
export function getMarketplaceRelayBaseUrlError(): string | null {
  const baseUrl = getMarketplaceRelayBaseUrl();
  if (!baseUrl) return 'API_MARKETPLACE_RELAY_BASE_URL is not configured';
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    return 'API_MARKETPLACE_RELAY_BASE_URL is not a valid URL';
  }
  if (parsed.username || parsed.password) {
    return 'API_MARKETPLACE_RELAY_BASE_URL must not contain credentials';
  }
  const isLocal = isLocalHostname(parsed.hostname);
  if (parsed.protocol !== 'https:' && !isLocal) {
    return 'API_MARKETPLACE_RELAY_BASE_URL must use https';
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return 'API_MARKETPLACE_RELAY_BASE_URL must use http(s)';
  }
  if (
    PROVIDER_HOSTS.has(parsed.hostname) ||
    parsed.hostname.endsWith('.tu-zi.com') ||
    parsed.hostname.endsWith('.sydney-ai.com')
  ) {
    return 'API_MARKETPLACE_RELAY_BASE_URL must not point directly at the provider';
  }
  const segments = parsed.pathname.split('/').filter(Boolean);
  if (segments[segments.length - 1] !== '_relay') {
    return 'API_MARKETPLACE_RELAY_BASE_URL must end with /_relay';
  }
  return null;
}

/**
 * Full relay readiness check. When the relay is mandatory, any missing or
 * malformed configuration is an error so the gateway can fail closed before
 * it ever resolves an upstream credential.
 */
export function getMarketplaceRelayConfigError(): string | null {
  if (!isMarketplaceRelayRequired()) return null;
  if (!getMarketplaceRelayBaseUrl()) {
    return 'API_MARKETPLACE_RELAY_BASE_URL is not configured';
  }
  if (!getMarketplaceRelayApiKey()) {
    return 'API_MARKETPLACE_RELAY_API_KEY is not configured';
  }
  return getMarketplaceRelayBaseUrlError();
}

function getLegacyTuziUpstreamBaseUrl(): string {
  return (
    process.env.API_MARKETPLACE_UPSTREAM_BASE_URL ||
    DEFAULT_TUZI_UPSTREAM_BASE_URL
  );
}

export type TuziPricingModel = {
  model_name?: unknown;
  description?: unknown;
  tags?: unknown;
  quota_type?: unknown;
  model_ratio?: unknown;
  model_price?: unknown;
  completion_ratio?: unknown;
  cache_ratio?: unknown;
  create_cache_ratio?: unknown;
  enable_groups?: unknown;
  supported_endpoint_types?: unknown;
  endpoints?: unknown;
  [key: string]: unknown;
};

export type TuziPricingPayload = {
  success?: unknown;
  data?: unknown;
  base_group_ratio?: unknown;
  price?: unknown;
  custom_currency_symbol?: unknown;
  quota_per_unit?: unknown;
  group_model_pricing?: unknown;
};

export type ApiMarketplaceModel = {
  id: string;
  name: string;
  /** Upstream release timestamp (ISO). Null when the feed omits it. */
  createdAt: string | null;
  description: string;
  tags: string[];
  group: string;
  pricingMode: 'token' | 'request';
  upstream: {
    modelRatio: number | null;
    completionRatio: number | null;
    modelPrice: number | null;
    cacheRatio: number | null;
    createCacheRatio: number | null;
    quotaType: number | null;
  };
  customer: {
    modelRatio: number | null;
    completionRatio: number | null;
    modelPrice: number | null;
    currency: string;
  };
  provider: string | null;
  groups: string[];
  pricing: {
    inputPerMillion: number | null;
    outputPerMillion: number | null;
    requestPrice: number | null;
    unit: 'tokens_1m' | 'request';
  };
  endpoints: string[];
  endpointDetails: Record<string, unknown>;
  status?: {
    label: string;
    color: string | null;
    errorRate: number | null;
    checkedAt: string | null;
    totalCount: number | null;
    errorCount: number | null;
    avgResponseTimeMs: number | null;
  };
  raw: TuziPricingModel;
};

type CatalogCache = {
  expiresAt: number;
  staleAt: number;
  fetchedAt: string;
  models: ApiMarketplaceModel[];
  currency: string;
  statusMeta: {
    checkIntervalSeconds: number | null;
  } | null;
};

const catalogCacheKey = '__WEBTOMIND_API_MARKETPLACE_CATALOG__';

function getGlobalCache(): { value?: CatalogCache } {
  const target = globalThis as typeof globalThis & {
    [catalogCacheKey]?: { value?: CatalogCache };
  };
  target[catalogCacheKey] ||= {};
  return target[catalogCacheKey]!;
}

function finiteNumber(value: unknown): number | null {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function markup(value: number | null): number | null {
  return value === null
    ? null
    : Number((value * API_MARKETPLACE_MARKUP).toFixed(8));
}

function splitTags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeModel(
  model: TuziPricingModel,
  group: string,
  currency: string
): ApiMarketplaceModel | null {
  const name =
    typeof model.model_name === 'string' ? model.model_name.trim() : '';
  if (!name) return null;
  const modelRatio = finiteNumber(model.model_ratio);
  const completionRatio = finiteNumber(model.completion_ratio);
  const rawModelPrice = finiteNumber(model.model_price);
  const quotaType = finiteNumber(model.quota_type);
  const modelPrice =
    quotaType === 0 && rawModelPrice !== null && rawModelPrice > 0
      ? rawModelPrice
      : null;
  const endpoints = Array.isArray(model.supported_endpoint_types)
    ? model.supported_endpoint_types
        .map((item) => String(item).trim())
        .filter(Boolean)
    : [];
  const endpointDetails =
    model.endpoints && typeof model.endpoints === 'object'
      ? (model.endpoints as Record<string, unknown>)
      : {};
  const groups = Array.isArray(model.enable_groups)
    ? model.enable_groups.map((value) => String(value).trim()).filter(Boolean)
    : [];
  const provider =
    typeof model.icon === 'string' && model.icon.trim()
      ? model.icon.trim().replace(/\.Color$/i, '')
      : null;
  // The ledger uses 500,000 quota points per USD. One million tokens is
  // therefore ratio * 2 in the customer-facing currency.
  const inputPerMillion =
    quotaType === 1 && modelRatio !== null
      ? Number((modelRatio * API_MARKETPLACE_MARKUP * 2).toFixed(6))
      : null;
  const outputPerMillion =
    inputPerMillion !== null && completionRatio !== null
      ? Number((inputPerMillion * completionRatio).toFixed(6))
      : null;

  return {
    id: name,
    name,
    createdAt:
      finiteNumber(model.created_time) !== null
        ? new Date(finiteNumber(model.created_time)! * 1000).toISOString()
        : null,
    description: typeof model.description === 'string' ? model.description : '',
    tags: splitTags(model.tags),
    group,
    pricingMode: quotaType === 0 ? 'request' : 'token',
    upstream: {
      modelRatio,
      completionRatio,
      modelPrice,
      cacheRatio: finiteNumber(model.cache_ratio),
      createCacheRatio: finiteNumber(model.create_cache_ratio),
      quotaType
    },
    customer: {
      modelRatio: markup(modelRatio),
      completionRatio: markup(completionRatio),
      modelPrice: markup(modelPrice),
      currency
    },
    provider,
    groups,
    pricing: {
      inputPerMillion,
      outputPerMillion,
      requestPrice: quotaType === 0 ? markup(modelPrice) : null,
      unit: quotaType === 0 ? 'request' : 'tokens_1m'
    },
    endpoints,
    endpointDetails,
    raw: model
  };
}

async function fetchJsonWithTimeout(
  url: string,
  timeoutMs = 10_000,
  requestHeaders: Record<string, string> = {}
): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json', ...requestHeaders },
      signal: controller.signal
    });
    if (!response.ok)
      throw new Error(`Upstream pricing returned ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

type TuziStatusCheck = {
  model_name?: unknown;
  group?: unknown;
  group_name?: unknown;
  status_label?: unknown;
  status_color?: unknown;
  error_rate?: unknown;
  checked_at?: unknown;
  total_count?: unknown;
  error_count?: unknown;
  avg_response_time?: unknown;
};

function safeStatusColor(value: unknown): string | null {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value.trim())
    ? value.trim()
    : null;
}

type NormalizedStatusCandidate = {
  group: string | null;
  status: NonNullable<ApiMarketplaceModel['status']>;
};

export function normalizeStatusChecks(
  payload: unknown
): Map<string, ApiMarketplaceModel['status']> {
  const checks =
    payload &&
    typeof payload === 'object' &&
    Array.isArray((payload as Record<string, unknown>).latest_checks)
      ? ((payload as Record<string, unknown>).latest_checks as unknown[])
      : [];
  const candidates = new Map<string, NormalizedStatusCandidate[]>();
  for (const value of checks) {
    if (!value || typeof value !== 'object') continue;
    const check = value as TuziStatusCheck;
    const names = Array.isArray(check.model_name)
      ? check.model_name.filter(
          (name): name is string => typeof name === 'string'
        )
      : typeof check.model_name === 'string'
        ? [check.model_name]
        : [];
    if (names.length === 0) continue;
    const errorRate = finiteNumber(check.error_rate);
    const checkedAt = finiteNumber(check.checked_at);
    const totalCount = finiteNumber(check.total_count);
    const errorCount = finiteNumber(check.error_count);
    const avgResponseTimeMs = finiteNumber(check.avg_response_time);
    const status = {
      label:
        typeof check.status_label === 'string' && check.status_label.trim()
          ? check.status_label.trim().slice(0, 40)
          : '未知',
      color: safeStatusColor(check.status_color),
      errorRate,
      checkedAt:
        checkedAt !== null && checkedAt > 0
          ? new Date(checkedAt * 1000).toISOString()
          : null,
      totalCount,
      errorCount,
      avgResponseTimeMs
    };
    const groupValue = check.group ?? check.group_name;
    const group =
      typeof groupValue === 'string' && groupValue.trim()
        ? groupValue.trim()
        : null;
    for (const name of names) {
      const list = candidates.get(name) || [];
      list.push({ group, status });
      candidates.set(name, list);
    }
  }
  const statuses = new Map<string, ApiMarketplaceModel['status']>();
  for (const [name, list] of candidates) {
    // The marketplace only exposes the default group. Prefer that exact
    // status; otherwise fall back to an ungrouped status before using another
    // group. Within a tier, choose the newest check deterministically.
    const preferred =
      list.filter(
        (candidate) => candidate.group === API_MARKETPLACE_DEFAULT_GROUP
      ).length > 0
        ? list.filter(
            (candidate) => candidate.group === API_MARKETPLACE_DEFAULT_GROUP
          )
        : list.filter((candidate) => candidate.group === null).length > 0
          ? list.filter((candidate) => candidate.group === null)
          : list;
    const selected = [...preferred].sort((a, b) => {
      const aTime = a.status.checkedAt ? Date.parse(a.status.checkedAt) : 0;
      const bTime = b.status.checkedAt ? Date.parse(b.status.checkedAt) : 0;
      return bTime - aTime;
    })[0];
    if (selected) statuses.set(name, selected.status);
  }
  return statuses;
}

type MarketplaceStatusFeed = {
  statuses: Map<string, ApiMarketplaceModel['status']>;
  checkIntervalSeconds: number | null;
};

function normalizeStatusCheckInterval(payload: unknown): number | null {
  if (!payload || typeof payload !== 'object') return null;
  const settings = (payload as Record<string, unknown>).monitor_settings;
  if (!settings || typeof settings !== 'object') return null;
  const value = finiteNumber(
    (settings as Record<string, unknown>).check_interval
  );
  return value !== null && value > 0 ? value : null;
}

async function fetchMarketplaceStatuses(): Promise<MarketplaceStatusFeed | null> {
  try {
    const payload = await fetchJsonWithTimeout(
      `${API_MARKETPLACE_STATUS_URL.replace(/\/$/, '')}/api/status`,
      5_000
    );
    return {
      statuses: normalizeStatusChecks(payload),
      checkIntervalSeconds: normalizeStatusCheckInterval(payload)
    };
  } catch (error) {
    console.warn('[ApiMarketplace] Model status unavailable:', error);
    return null;
  }
}

export async function getApiMarketplaceCatalog(options?: {
  forceRefresh?: boolean;
}): Promise<CatalogCache> {
  const cache = getGlobalCache();
  const now = Date.now();
  if (!options?.forceRefresh && cache.value && cache.value.expiresAt > now) {
    return cache.value;
  }

  try {
    const pricingUrl = getTuziPricingUrl();
    const [pricingResult, statusFeed] = await Promise.all([
      fetchJsonWithTimeout(
        pricingUrl,
        10_000,
        getTuziPricingRequestHeaders(pricingUrl)
      ),
      fetchMarketplaceStatuses()
    ]);
    const payload = pricingResult as TuziPricingPayload;
    if (!payload || payload.success !== true || !Array.isArray(payload.data)) {
      throw new Error('Upstream pricing payload is invalid');
    }
    const group = API_MARKETPLACE_DEFAULT_GROUP;
    const currency =
      typeof payload.custom_currency_symbol === 'string'
        ? payload.custom_currency_symbol
        : 'USD';
    const rawModels = payload.data;
    const models = rawModels
      .map((item) => {
        const effectiveModel = applyTuziGroupPricing(
          item as SharedTuziPricingModel,
          group,
          payload.group_model_pricing
        );
        return normalizeModel(effectiveModel, group, currency);
      })
      .filter((item): item is ApiMarketplaceModel => Boolean(item))
      .filter((item) => {
        const groups = Array.isArray(item.raw.enable_groups)
          ? item.raw.enable_groups.map((value) => String(value))
          : [];
        return groups.length === 0 || groups.includes(group);
      })
      // Task-duration pricing is not yet implemented by the wallet ledger;
      // hiding it is safer than presenting a token/request price that cannot
      // be charged correctly.
      .filter(
        (item) => item.upstream.quotaType === 0 || item.upstream.quotaType === 1
      )
      .filter((item) => hasCallableMarketplaceEndpoint(item))
      // Newest releases first so the plaza surfaces the latest models without
      // any client-side sorting. Ties fall back to the stable name order.
      .sort((a, b) => {
        const aTime = a.createdAt ? Date.parse(a.createdAt) : 0;
        const bTime = b.createdAt ? Date.parse(b.createdAt) : 0;
        return bTime - aTime || a.name.localeCompare(b.name);
      });
    const next: CatalogCache = {
      fetchedAt: new Date().toISOString(),
      expiresAt: now + 5 * 60 * 1000,
      staleAt: now + 60 * 60 * 1000,
      statusMeta: statusFeed
        ? { checkIntervalSeconds: statusFeed.checkIntervalSeconds }
        : null,
      models: models.map((model) => ({
        ...model,
        status: statusFeed
          ? statusFeed.statuses.get(model.id) || {
              label: '暂无状态数据',
              color: null,
              errorRate: null,
              checkedAt: null,
              totalCount: null,
              errorCount: null,
              avgResponseTimeMs: null
            }
          : {
              label: '状态服务暂不可用',
              color: null,
              errorRate: null,
              checkedAt: null,
              totalCount: null,
              errorCount: null,
              avgResponseTimeMs: null
            }
      })),
      currency
    };
    cache.value = next;
    return next;
  } catch (error) {
    if (cache.value && cache.value.staleAt > now) return cache.value;
    throw error;
  }
}

export function jsonResponse(
  request: Request,
  payload: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...getCorsHeadersForRequest(request),
      ...extraHeaders
    }
  });
}

export function preflightResponse(request: Request): Response | null {
  if (request.method !== 'OPTIONS') return null;
  return new Response(null, {
    status: 204,
    headers: getCorsHeadersForRequest(request)
  });
}

export async function requireUserContext(request: Request): Promise<{
  userId: string;
  supabase: SupabaseClient;
} | null> {
  const admin = await assertApiMarketplaceAdmin(request);
  const supabase = getSupabaseAdmin();
  if (!admin.ok || !admin.userId || !supabase) return null;
  return { userId: admin.userId, supabase };
}

const marketplaceAuthClientCache: { value?: SupabaseClient } = {};

function getMarketplaceAuthClient(): SupabaseClient | null {
  if (marketplaceAuthClientCache.value) return marketplaceAuthClientCache.value;
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  marketplaceAuthClientCache.value = createClient(url, anonKey, {
    auth: { persistSession: false }
  });
  return marketplaceAuthClientCache.value;
}

/**
 * Full-launch user context: any authenticated Supabase session qualifies.
 * The returned service client must still be used with per-user scoping
 * (keys/wallet/usage handlers all filter by userId). Anonymous or invalid
 * tokens fail closed here.
 */
export async function requireUserContextPublic(
  request: Request
): Promise<{
  userId: string;
  email: string;
  supabase: SupabaseClient;
} | null> {
  const authHeader = request.headers.get('Authorization');
  const token =
    authHeader && authHeader.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : '';
  if (!token) return null;
  const authClient = getMarketplaceAuthClient();
  if (!authClient) return null;
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data.user?.id || !data.user.email) return null;
  const serviceSupabase = getSupabaseAdmin();
  if (!serviceSupabase) return null;
  return {
    userId: data.user.id,
    email: data.user.email,
    supabase: serviceSupabase
  };
}

/**
 * API keys are bearer credentials and do not carry a Supabase session. Check
 * the owning auth user exists and is active before allowing a key to reach
 * the upstream gateway. Full launch: any valid user may own gateway keys; the
 * per-user rate limit, shared wallet reservation and usage ledger constrain
 * abuse independently of identity.
 */
export async function isApiMarketplaceAdminUserId(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error) {
    console.error('[ApiMarketplace] Admin owner lookup failed:', error);
    return false;
  }
  return Boolean(data.user?.id);
}

export function getUpstreamBaseUrl(): string {
  const relayBase = getMarketplaceRelayBaseUrl();
  if (relayBase) {
    // An explicitly configured relay must be valid before it is used. A broken
    // relay URL fails closed in every mode instead of silently falling back to
    // a direct provider endpoint.
    if (getMarketplaceRelayBaseUrlError()) return '';
    return relayBase.replace(/\/+$/, '');
  }
  // Production is fail-closed: no relay means no upstream. Only explicit
  // development mode may use the legacy direct-provider fallback.
  if (isMarketplaceRelayRequired()) return '';
  return getLegacyTuziUpstreamBaseUrl().replace(/\/+$/, '');
}

export function getUpstreamApiKey(): string | null {
  // When a relay base URL is configured, only the relay credential may be
  // used; provider keys are never sent to a non-provider destination.
  if (getMarketplaceRelayBaseUrl()) return getMarketplaceRelayApiKey();
  // Production without a relay has no usable upstream credential.
  if (isMarketplaceRelayRequired()) return null;
  const legacy =
    process.env.API_MARKETPLACE_TUZI_API_KEY ||
    process.env.TUZI_TEXT_API_KEY ||
    process.env.TUZI_API_KEY;
  return legacy?.trim() || null;
}

export function randomApiKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  const encoded = btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
  return `${API_MARKETPLACE_KEY_PREFIX}_${encoded}`;
}

export async function hashApiKey(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value)
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function getBearerToken(request: Request): string | null {
  const header = request.headers.get('Authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export function validateApiKeyName(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return 'API Key 名称不能为空';
  if (!isValidApiKeyName(value)) {
    if (value.trim().length > 64) return 'API Key 名称不能超过 64 个字符';
    return 'API Key 名称不能包含换行或控制字符';
  }
  return null;
}

export function roundCents(value: number): number {
  return Math.max(1, Math.ceil(value));
}

export function estimateCustomerChargeCents(
  model: ApiMarketplaceModel,
  usage: { inputTokens?: number; outputTokens?: number }
): number {
  const inputTokens = Math.max(0, Number(usage.inputTokens || 0));
  const outputTokens = Math.max(0, Number(usage.outputTokens || 0));
  if (model.upstream.modelPrice !== null) {
    return roundCents(model.customer.modelPrice! * 100);
  }
  const inputRate = model.customer.modelRatio || 0;
  const outputRate = inputRate * (model.upstream.completionRatio || 1);
  // NewAPI/Tuzi quota accounting uses 500,000 quota points per USD. The
  // ratio is applied to input tokens and completion_ratio to output tokens.
  const charge =
    ((inputTokens * inputRate + outputTokens * outputRate) / 500_000) * 100;
  return roundCents(charge);
}

export function extractUsage(value: unknown): {
  inputTokens: number;
  outputTokens: number;
} {
  if (!value || typeof value !== 'object')
    return { inputTokens: 0, outputTokens: 0 };
  const usage = (value as Record<string, unknown>).usage;
  if (!usage || typeof usage !== 'object')
    return { inputTokens: 0, outputTokens: 0 };
  const record = usage as Record<string, unknown>;
  const normalizeTokenCount = (value: unknown): number => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) return 0;
    return Math.min(Math.floor(numeric), 2_147_483_647);
  };
  return {
    inputTokens: normalizeTokenCount(
      record.prompt_tokens ?? record.input_tokens ?? record.inputTokens ?? 0
    ),
    outputTokens: normalizeTokenCount(
      record.completion_tokens ??
        record.output_tokens ??
        record.outputTokens ??
        0
    )
  };
}

export function buildOpenAiModelList(models: ApiMarketplaceModel[]) {
  return {
    object: 'list',
    data: models.map((model) => ({
      id: model.id,
      object: 'model',
      created: Math.floor(Date.now() / 1000),
      owned_by: 'webtomind',
      pricing: {
        currency: model.customer.currency,
        mode: model.pricingMode,
        modelRatio: model.customer.modelRatio,
        completionRatio: model.customer.completionRatio,
        modelPrice: model.customer.modelPrice
      }
    }))
  };
}
