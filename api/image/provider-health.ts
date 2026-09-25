import type { SupabaseClient } from '@supabase/supabase-js';

export type ImageProviderHealthState =
  | 'healthy'
  | 'degraded'
  | 'circuit_open'
  | 'insufficient_data';

export interface ImageProviderHealthRecord {
  provider: string;
  model: string;
  channel: string | null;
  totalAttempts: number;
  succeededAttempts: number;
  failedAttempts: number;
  runningAttempts: number;
  successRate: number;
  avgDurationMs: number | null;
  p95DurationMs: number | null;
  authErrorCount: number;
  rateLimitCount: number;
  timeoutCount: number;
  unavailableCount: number;
  policyCount: number;
  lastFailureAt: string | null;
  lastSuccessAt: string | null;
  healthScore: number;
  healthState: ImageProviderHealthState;
  circuitBreakerUntil: string | null;
}

export interface ImageProviderHealthQueryOptions {
  windowMinutes?: number;
  minAttempts?: number;
  now?: Date;
}

export interface ImageProviderRoutingDecision {
  blocked: boolean;
  deprioritized: boolean;
  reason?:
    | 'auth_circuit'
    | 'rate_limit'
    | 'timeout'
    | 'unavailable'
    | 'low_score';
  score: number;
  circuitBreakerUntil?: string | null;
}

const DEFAULT_WINDOW_MINUTES = 24 * 60;
const DEFAULT_MIN_ATTEMPTS = 3;

export const IMAGE_PROVIDER_HEALTH_THRESHOLDS = {
  authCircuitErrorCount: 2,
  authCircuitMinutes: 30,
  rateLimitDegradeCount: 3,
  timeoutDegradeCount: 2,
  timeoutDegradeRate: 0.3,
  unavailableDegradeCount: 3,
  unavailableCircuitCount: 4,
  unavailableModelCircuitCount: 3,
  slowP95Ms: 180_000,
  degradedScoreBelow: 60
} as const;

type RawImageProviderHealthRow = {
  provider?: unknown;
  model?: unknown;
  channel?: unknown;
  total_attempts?: unknown;
  succeeded_attempts?: unknown;
  failed_attempts?: unknown;
  running_attempts?: unknown;
  success_rate?: unknown;
  avg_duration_ms?: unknown;
  p95_duration_ms?: unknown;
  auth_error_count?: unknown;
  rate_limit_count?: unknown;
  timeout_count?: unknown;
  unavailable_count?: unknown;
  policy_count?: unknown;
  last_failure_at?: unknown;
  last_success_at?: unknown;
  health_score?: unknown;
  health_state?: unknown;
  circuit_breaker_until?: unknown;
};

function toNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = toNumber(value, Number.NaN);
  return Number.isFinite(parsed) ? parsed : null;
}

function toNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function normalizeHealthState(value: unknown): ImageProviderHealthState {
  if (
    value === 'healthy' ||
    value === 'degraded' ||
    value === 'circuit_open' ||
    value === 'insufficient_data'
  ) {
    return value;
  }
  return 'insufficient_data';
}

function normalizeHealthRow(
  row: RawImageProviderHealthRow
): ImageProviderHealthRecord {
  return {
    provider: typeof row.provider === 'string' ? row.provider : '',
    model: typeof row.model === 'string' ? row.model : '',
    channel: toNullableString(row.channel),
    totalAttempts: toNumber(row.total_attempts),
    succeededAttempts: toNumber(row.succeeded_attempts),
    failedAttempts: toNumber(row.failed_attempts),
    runningAttempts: toNumber(row.running_attempts),
    successRate: toNumber(row.success_rate),
    avgDurationMs: toNullableNumber(row.avg_duration_ms),
    p95DurationMs: toNullableNumber(row.p95_duration_ms),
    authErrorCount: toNumber(row.auth_error_count),
    rateLimitCount: toNumber(row.rate_limit_count),
    timeoutCount: toNumber(row.timeout_count),
    unavailableCount: toNumber(row.unavailable_count),
    policyCount: toNumber(row.policy_count),
    lastFailureAt: toNullableString(row.last_failure_at),
    lastSuccessAt: toNullableString(row.last_success_at),
    healthScore: toNumber(row.health_score, 100),
    healthState: normalizeHealthState(row.health_state),
    circuitBreakerUntil: toNullableString(row.circuit_breaker_until)
  };
}

function minutesToPostgresInterval(minutes: number): string {
  const normalized = Number.isFinite(minutes)
    ? Math.max(1, Math.min(24 * 60, Math.floor(minutes)))
    : DEFAULT_WINDOW_MINUTES;
  return `${normalized} minutes`;
}

export function getImageProviderHealthKey({
  provider,
  model,
  channel
}: {
  provider: string;
  model: string;
  channel?: string | null;
}): string {
  return `${provider}::${model}::${channel || ''}`;
}

export async function fetchImageProviderHealth(
  sb: SupabaseClient,
  options: ImageProviderHealthQueryOptions = {}
): Promise<ImageProviderHealthRecord[]> {
  const { data, error } = await sb.rpc('get_image_provider_health', {
    p_window: minutesToPostgresInterval(
      options.windowMinutes ?? DEFAULT_WINDOW_MINUTES
    ),
    p_min_attempts: Math.max(
      1,
      Math.floor(options.minAttempts ?? DEFAULT_MIN_ATTEMPTS)
    ),
    ...(options.now ? { p_now: options.now.toISOString() } : {})
  });

  if (error) {
    throw new Error(error.message);
  }

  return Array.isArray(data)
    ? data.map((row) => normalizeHealthRow(row as RawImageProviderHealthRow))
    : [];
}

export async function safeFetchImageProviderHealth(
  sb: SupabaseClient,
  options: ImageProviderHealthQueryOptions = {}
): Promise<ImageProviderHealthRecord[]> {
  try {
    return await fetchImageProviderHealth(sb, options);
  } catch (error) {
    console.warn('[ImageProviderHealth] health lookup failed:', {
      message: error instanceof Error ? error.message : String(error)
    });
    return [];
  }
}

export function buildImageProviderHealthLookup(
  records: ImageProviderHealthRecord[]
): Map<string, ImageProviderHealthRecord> {
  return new Map(
    records.map((record) => [getImageProviderHealthKey(record), record])
  );
}

export function getImageProviderRoutingDecision(
  record?: ImageProviderHealthRecord | null
): ImageProviderRoutingDecision {
  if (!record || record.healthState === 'insufficient_data') {
    return {
      blocked: false,
      deprioritized: false,
      score: record?.healthScore ?? 100
    };
  }

  if (record.healthState === 'circuit_open') {
    return {
      blocked: true,
      deprioritized: true,
      reason: 'auth_circuit',
      score: record.healthScore,
      circuitBreakerUntil: record.circuitBreakerUntil
    };
  }

  if (
    record.unavailableCount >=
    IMAGE_PROVIDER_HEALTH_THRESHOLDS.unavailableCircuitCount
  ) {
    return {
      blocked: true,
      deprioritized: true,
      reason: 'unavailable',
      score: record.healthScore
    };
  }

  if (
    record.rateLimitCount >=
    IMAGE_PROVIDER_HEALTH_THRESHOLDS.rateLimitDegradeCount
  ) {
    return {
      blocked: false,
      deprioritized: true,
      reason: 'rate_limit',
      score: record.healthScore
    };
  }

  if (
    record.timeoutCount >=
      IMAGE_PROVIDER_HEALTH_THRESHOLDS.timeoutDegradeCount &&
    record.timeoutCount / Math.max(1, record.totalAttempts) >=
      IMAGE_PROVIDER_HEALTH_THRESHOLDS.timeoutDegradeRate
  ) {
    return {
      blocked: false,
      deprioritized: true,
      reason: 'timeout',
      score: record.healthScore
    };
  }

  if (
    record.unavailableCount >=
    IMAGE_PROVIDER_HEALTH_THRESHOLDS.unavailableDegradeCount
  ) {
    return {
      blocked: false,
      deprioritized: true,
      reason: 'unavailable',
      score: record.healthScore
    };
  }

  if (
    record.healthScore < IMAGE_PROVIDER_HEALTH_THRESHOLDS.degradedScoreBelow
  ) {
    return {
      blocked: false,
      deprioritized: true,
      reason: 'low_score',
      score: record.healthScore
    };
  }

  return {
    blocked: false,
    deprioritized: record.healthState === 'degraded',
    score: record.healthScore
  };
}

/**
 * 模型级 unavailable 熔断：聚合某 provider+model 在健康表里全部 channel 的
 * unavailable 次数。低频死模型（如 seedream-5-0-lite / wan-image-2.7-pro）
 * 单个 channel 在 24h 窗口内达不到 per-channel 阈值，但跨 channel 累计可以，
 * 避免「确定不可用」的模型被反复尝试。
 */
export function isModelUnavailableBlocked(
  route: { provider: string; model: string },
  healthLookup?: Map<string, ImageProviderHealthRecord> | null,
  threshold = IMAGE_PROVIDER_HEALTH_THRESHOLDS.unavailableModelCircuitCount
): boolean {
  if (!healthLookup || healthLookup.size === 0) return false;
  let unavailableTotal = 0;
  for (const record of healthLookup.values()) {
    if (record.provider !== route.provider || record.model !== route.model) {
      continue;
    }
    unavailableTotal += record.unavailableCount;
  }
  return unavailableTotal >= threshold;
}

export function shouldSkipImageProviderFallbackRoute(
  record?: ImageProviderHealthRecord | null
): boolean {
  if (!record || record.healthState === 'insufficient_data') return false;

  if (
    record.totalAttempts >= DEFAULT_MIN_ATTEMPTS &&
    record.succeededAttempts === 0 &&
    record.failedAttempts >= DEFAULT_MIN_ATTEMPTS
  ) {
    return true;
  }

  const decision = getImageProviderRoutingDecision(record);
  if (decision.blocked) return true;

  return (
    record.healthState === 'degraded' &&
    record.healthScore <= 0 &&
    record.totalAttempts >= DEFAULT_MIN_ATTEMPTS
  );
}
