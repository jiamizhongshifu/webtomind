/**
 * Shared contracts for the WebToMind API marketplace (Tuzi reseller model).
 *
 * Pricing rules
 *   * Upstream prices come from the isolated provider pricing API and are kept
 *     verbatim in `upstream`. Token billing follows the NewAPI/Tuzi quota
 *     convention: 500,000 quota points per USD, with completion_ratio applied
 *     to output tokens.
 *   * The reseller markup (TUZI_MARKUP_MULTIPLIER = 1.3) is applied only as
 *     `retailRatio` (token-based models, quota_type=1) and
 *     `retailModelPrice` (per-request models, quota_type=0).
 *   * Account wallet money is always integer cents; pricing ratios stay floats
 *     rounded to 6 decimals to avoid floating point noise.
 */

export const API_KEY_PREFIX = 'sk-wtm';

/**
 * Built-in administrator. Additional beta-access emails can be configured via
 * API_MARKETPLACE_ACCESS_EMAILS (comma separated, case-insensitive) so the
 * marketplace can open to a seed cohort without a code deploy. The gateway and
 * all management endpoints accept any email that passes this check.
 */
export const API_MARKETPLACE_ADMIN_EMAIL = 'admin@example.com';

export function getApiMarketplaceAccessEmails(): string[] {
  const extra = String(
    typeof import.meta !== 'undefined' && import.meta.env
      ? (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_API_MARKETPLACE_ACCESS_EMAILS
      : undefined
  ).trim();
  const configured = new Set<string>([API_MARKETPLACE_ADMIN_EMAIL]);
  if (extra) {
    for (const entry of extra.split(',')) {
      const normalized = entry.trim().toLowerCase();
      if (normalized.includes('@')) configured.add(normalized);
    }
  }
  return [...configured];
}

export function isApiMarketplaceAdminEmail(email: unknown): boolean {
  if (typeof email !== 'string') return false;
  return getApiMarketplaceAccessEmails().includes(email.trim().toLowerCase());
}

/** Reseller margin: retail = upstream * 1.3 (30% markup). */
export const TUZI_MARKUP_MULTIPLIER = 1.3;

/** The marketplace is intentionally pinned to Tuzi's 1x default group. */
export const TUZI_DEFAULT_GROUP = 'default';

/** Upstream pricing feed consumed by the model plaza. */
export const TUZI_PRICING_ENDPOINT = 'https://api.sydney-ai.com/api/pricing';

/** Public customer-facing gateway; the provider base URL never belongs in UI docs. */
export const API_MARKETPLACE_BASE_URL = 'https://webtomind.com/v1';

/** Tuzi public model status endpoint. */
export const API_MARKETPLACE_STATUS_URL = 'https://apistatus.tu-zi.com/';

export const MARKETPLACE_PRICE_PRECISION = 6;
export const API_KEY_NAME_MAX_LENGTH = 64;
export const UPSTREAM_MODEL_NAME_MAX_LENGTH = 128;

export type ApiKeyStatus = 'active' | 'disabled' | 'revoked';
export type ApiWalletTransactionType =
  | 'deposit'
  | 'key_fund'
  | 'key_refund'
  | 'manual_adjustment'
  | 'usage_charge'
  | 'usage_refund';
export type ApiUsageLogStatus = 'reserved' | 'succeeded' | 'failed';
export type ApiBillingMode = 'per_request' | 'token_ratio';

// ---------------------------------------------------------------------------
// Upstream Tuzi pricing payload (observed shape of /api/pricing)
// ---------------------------------------------------------------------------

export interface TuziEndpointSpec {
  path: string;
  method: string;
  docs?: string;
  scenario?: string;
}

export interface TuziVendor {
  id: number;
  name: string;
  icon?: string;
}

export interface TuziGroupInfo {
  Description?: string;
  DisplayName?: string;
  GroupRatio?: number;
}

/**
 * One row of the upstream `data` array. `quota_type`:
 * 0 = fixed per-request price (`model_price`), 1 = token-based ratio
 * (`model_ratio`), 2 = task-duration pricing. All fields are preserved
 * verbatim, including provider-specific task pricing metadata.
 */
export interface TuziPricingModel {
  model_name: string;
  description?: string;
  icon?: string;
  tags?: string;
  vendor_id?: number;
  created_time?: number;
  updated_time?: number;
  quota_type: number;
  model_ratio: number;
  model_price: number;
  task_per_second_pricing?: number;
  completion_ratio: number;
  owner_by?: string;
  enable_groups?: string[];
  supported_endpoint_types?: string[];
  endpoints?: Record<string, TuziEndpointSpec>;
  pricing_version?: string;
  [key: string]: unknown;
}

/** Envelope returned by the isolated provider pricing API. */
export interface TuziPricingResponse {
  success: boolean;
  pricing_version?: string;
  data: TuziPricingModel[];
  vendors?: TuziVendor[];
  group_info?: Record<string, TuziGroupInfo>;
  supported_endpoint?: Record<string, TuziEndpointSpec>;
  user_level?: string;
  level_names?: string[];
  all_level_discounts?: Record<string, Record<string, number>>;
  all_level_group_info?: Record<string, Record<string, unknown>>;
  all_level_groups?: Record<string, Record<string, unknown>>;
  auto_groups?: unknown[];
  base_group_ratio?: Record<string, number>;
  group_discount_ratio?: Record<string, number>;
  group_model_pricing?: Record<string, Record<string, Record<string, unknown>>>;
  group_ratio?: Record<string, number>;
  usable_group?: Record<string, unknown>;
}

const TUZI_GROUP_PRICING_FIELD_ALIASES = [
  ['quota_type', 'quota_type'],
  ['model_price', 'model_price'],
  ['model_second_price', 'model_price'],
  ['model_ratio', 'model_ratio'],
  ['model_completion_ratio', 'completion_ratio'],
  ['model_cache_ratio', 'cache_ratio'],
  ['model_create_cache_ratio', 'create_cache_ratio']
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Resolves Tuzi's effective model row for one group.
 *
 * Tuzi keeps common/base values in `data` and stores group-specific billing
 * overrides in `group_model_pricing`. The provider's own UI applies these
 * overrides before deciding whether a model is token- or request-priced, so
 * the reseller must do the same before exposing prices or charging usage.
 */
export function applyTuziGroupPricing(
  model: TuziPricingModel,
  group: string,
  groupModelPricing: unknown
): TuziPricingModel {
  const modelName = model.model_name;
  if (!modelName || !group.trim() || !isRecord(groupModelPricing)) {
    return model;
  }

  const groupPricing = groupModelPricing[group];
  if (!isRecord(groupPricing)) return model;

  const next = { ...model };
  let hasPriceOverride = false;
  let hasRatioOverride = false;
  let hasQuotaTypeOverride = false;

  for (const [sourceField, targetField] of TUZI_GROUP_PRICING_FIELD_ALIASES) {
    const values = groupPricing[sourceField];
    if (!isRecord(values) || !(modelName in values)) continue;
    const value = values[modelName];
    if (value === undefined || value === null) continue;
    (next as Record<string, unknown>)[targetField] = value;
    if (sourceField === 'model_price' || sourceField === 'model_second_price') {
      hasPriceOverride = true;
    }
    if (sourceField === 'model_ratio') hasRatioOverride = true;
    if (sourceField === 'quota_type') hasQuotaTypeOverride = true;
  }

  // Some provider feeds publish only the effective price field. Match Tuzi's
  // fallback semantics so a request-price override cannot remain token-priced
  // merely because the base row used quota_type=1.
  if (!hasQuotaTypeOverride) {
    if (hasPriceOverride && !hasRatioOverride) {
      next.quota_type = 0;
    } else if (hasRatioOverride && !hasPriceOverride) {
      next.quota_type = 1;
    }
  }

  return next;
}

// ---------------------------------------------------------------------------
// Normalized marketplace model
// ---------------------------------------------------------------------------

export interface ApiMarketplaceModel {
  /** DB-safe identifier derived from the model name (for lookups / keys). */
  id: string;
  /** Raw upstream model name to send to the API (never sanitized). */
  modelName: string;
  /** Upstream release timestamp (ISO). Null when the feed omits it. */
  createdAt: string | null;
  /** Effective upstream row after the selected group's pricing overrides. */
  upstream: TuziPricingModel;
  vendor?: { id: number; name: string; icon?: string };
  markupMultiplier: number;
  billingMode: ApiBillingMode;
  /** model_price * markup (quota_type=0). */
  retailModelPrice: number;
  /** model_ratio * markup (quota_type=1). */
  retailRatio: number;
  enableGroups: string[];
  supportedEndpointTypes: string[];
  tags: string[];
  description: string;
}

// ---------------------------------------------------------------------------
// Database row contracts (snake_case mirrors supabase/migrations/
// 20260825090000_api_marketplace.sql)
// ---------------------------------------------------------------------------

export interface ApiWallet {
  user_id: string;
  /** @deprecated API Keys share the account wallet; this legacy field is zero. */
  balance_cents?: number;
  total_deposited_cents: number;
  created_at: string;
  updated_at: string;
}

export interface ApiWalletTransaction {
  id: string;
  user_id: string;
  key_id: string | null;
  type: ApiWalletTransactionType;
  amount_cents: number;
  balance_after_cents: number;
  source: string;
  idempotency_key: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface ApiKey {
  id: string;
  user_id: string;
  name: string;
  key_prefix: string;
  key_hash: string;
  upstream_key_ref: string | null;
  status: ApiKeyStatus;
  balance_cents: number;
  total_spent_cents: number;
  last_used_at: string | null;
  expires_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ApiUsageLog {
  id: string;
  user_id: string;
  key_id: string | null;
  request_id: string;
  status: ApiUsageLogStatus;
  model: string;
  endpoint: string;
  reserved_cents: number;
  actual_customer_cents: number;
  upstream_cost_cents: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  metadata: Record<string, unknown>;
  reserved_at: string;
  settled_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApiCreditPackage {
  id: string;
  name: string;
  price_cents: number;
  credit_cents: number;
  is_active: boolean;
  sort_order: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// SECURITY DEFINER RPC result contracts
// ---------------------------------------------------------------------------

export interface ApiRpcResultBase {
  ok: boolean;
  error?: string;
  idempotent?: boolean;
}

export interface GrantApiWalletCreditResult extends ApiRpcResultBase {
  balance_cents?: number;
  transaction_id?: string;
}

export interface ReserveApiWalletResult extends ApiRpcResultBase {
  usage_id?: string;
  status?: ApiUsageLogStatus;
  reserved_cents?: number;
  wallet_balance_cents?: number;
  key_balance_cents?: number;
  required_cents?: number;
}

export interface SettleApiUsageResult extends ApiRpcResultBase {
  usage_id?: string;
  status?: ApiUsageLogStatus;
  reserved_cents?: number;
  actual_customer_cents?: number;
  upstream_cost_cents?: number;
  wallet_balance_cents?: number;
  key_balance_cents?: number;
  total_spent_cents?: number;
  required_extra_cents?: number;
}

// ---------------------------------------------------------------------------
// Price helpers
// ---------------------------------------------------------------------------

export function roundMarketplacePrice(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** MARKETPLACE_PRICE_PRECISION;
  return Math.round(value * factor) / factor;
}

export function applyTuziMarkup(
  upstreamValue: number,
  multiplier = TUZI_MARKUP_MULTIPLIER
): number {
  return roundMarketplacePrice(upstreamValue * multiplier);
}

// ---------------------------------------------------------------------------
// Safe name helpers
// ---------------------------------------------------------------------------

/** Collapses whitespace/control characters and trims; returns '' when invalid. */
export function normalizeApiKeyName(value: unknown): string {
  if (typeof value !== 'string') return '';
  const collapsed = value
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return collapsed.slice(0, API_KEY_NAME_MAX_LENGTH);
}

export function isValidApiKeyName(value: string): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > API_KEY_NAME_MAX_LENGTH) return false;
  if (trimmed !== value) return false;
  // eslint-disable-next-line no-control-regex
  return !/[\u0000-\u001f\u007f]/.test(value);
}

/** Upstream model names are passed to the API verbatim; only guard structure. */
export function isValidUpstreamModelName(value: string): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > UPSTREAM_MODEL_NAME_MAX_LENGTH) return false;
  if (trimmed !== value) return false;
  // eslint-disable-next-line no-control-regex
  return !/[\u0000-\u001f\u007f]/.test(value);
}

/**
 * DB-safe slug for local identifiers. Whitespace runs become '-', characters
 * outside [A-Za-z0-9._-] are dropped, and the result is capped at 128 chars.
 * Returns '' when nothing safe remains.
 */
export function sanitizeModelName(value: string): string {
  if (typeof value !== 'string') return '';
  const collapsed = value.trim().replace(/\s+/g, '-');
  return collapsed
    .replace(/[^A-Za-z0-9._-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, UPSTREAM_MODEL_NAME_MAX_LENGTH);
}

// ---------------------------------------------------------------------------
// Normalizers
// ---------------------------------------------------------------------------

export function getTuziModelBillingMode(
  quotaType: TuziPricingModel['quota_type']
): ApiBillingMode {
  return quotaType === 0 ? 'per_request' : 'token_ratio';
}

function splitTags(tags: string | undefined): string[] {
  if (!tags) return [];
  return tags
    .split(/[\s,，、;；]+/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function normalizeTuziPricingModel(
  model: TuziPricingModel,
  options: { vendors?: readonly TuziVendor[]; multiplier?: number } = {}
): ApiMarketplaceModel {
  const multiplier = options.multiplier ?? TUZI_MARKUP_MULTIPLIER;
  const vendorId = typeof model.vendor_id === 'number' ? model.vendor_id : undefined;
  const vendor = options.vendors?.find((entry) => entry.id === vendorId);

  return {
    id: sanitizeModelName(model.model_name) || 'unknown-model',
    modelName: model.model_name,
    createdAt:
      typeof model.created_time === 'number' && model.created_time > 0
        ? new Date(model.created_time * 1000).toISOString()
        : null,
    upstream: { ...model },
    vendor: vendor
      ? { id: vendor.id, name: vendor.name, icon: vendor.icon }
      : undefined,
    markupMultiplier: multiplier,
    billingMode: getTuziModelBillingMode(model.quota_type),
    retailModelPrice: applyTuziMarkup(model.model_price ?? 0, multiplier),
    retailRatio: applyTuziMarkup(model.model_ratio ?? 0, multiplier),
    enableGroups: [...(model.enable_groups ?? [])],
    supportedEndpointTypes: [...(model.supported_endpoint_types ?? [])],
    tags: splitTags(model.tags),
    description: model.description ?? ''
  };
}

export function normalizeTuziPricingPayload(
  payload: TuziPricingResponse,
  options: { multiplier?: number; group?: string } = {}
): { version: string | null; models: ApiMarketplaceModel[] } {
  if (!payload || !Array.isArray(payload.data)) {
    return { version: null, models: [] };
  }
  const group = options.group ?? TUZI_DEFAULT_GROUP;
  return {
    version:
      typeof payload.pricing_version === 'string'
        ? payload.pricing_version
        : null,
    models: payload.data.map((model) =>
      normalizeTuziPricingModel(
        applyTuziGroupPricing(model, group, payload.group_model_pricing),
        {
          vendors: payload.vendors,
          multiplier: options.multiplier
        }
      )
    )
  };
}
