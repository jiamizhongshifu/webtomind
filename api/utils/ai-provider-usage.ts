import { getSupabaseAdmin } from './auth';

export type AiProviderUsageStatus = 'succeeded' | 'failed';
export type AiProviderTokenUsageSource = 'provider' | 'estimated' | 'none';

export interface AiProviderUsageInput {
  userId?: string | null;
  provider: string;
  model: string;
  endpoint: string;
  source: string;
  status: AiProviderUsageStatus;
  requestId?: string | null;
  fallbackOf?: string | null;
  fallbackUsed?: boolean;
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
  tokenUsageSource?: AiProviderTokenUsageSource;
  promptChars?: number | null;
  responseChars?: number | null;
  imageCount?: number | null;
  latencyMs?: number | null;
  errorMessage?: string | null;
  metadata?: Record<string, unknown>;
  startedAt?: Date;
  completedAt?: Date;
}

export interface AiProviderUsageTiming {
  startedAt: Date;
  mark: () => number;
}

export interface AiUsageSummaryRecord {
  usageDate: string;
  provider: string;
  model: string;
  source: string;
  eventCount: number;
  succeededCount: number;
  failedCount: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  imageCount: number;
  avgLatencyMs: number | null;
  p95LatencyMs: number | null;
}

export type AiUsageSummaryRow = {
  usage_date?: unknown;
  provider?: unknown;
  model?: unknown;
  source?: unknown;
  event_count?: unknown;
  succeeded_count?: unknown;
  failed_count?: unknown;
  input_tokens?: unknown;
  output_tokens?: unknown;
  total_tokens?: unknown;
  image_count?: unknown;
  avg_latency_ms?: unknown;
  p95_latency_ms?: unknown;
};

function clampString(value: string | null | undefined, maxLength: number): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

function normalizeNumber(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.max(0, Math.round(value));
}

function normalizeUnknownNumber(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
}

function normalizeUnknownNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : null;
}

function normalizeUnknownString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

export function createAiProviderUsageTiming(): AiProviderUsageTiming {
  const startedAt = new Date();
  const started = Date.now();
  return {
    startedAt,
    mark: () => Math.max(0, Date.now() - started)
  };
}

export function estimateTokensFromText(value: string | null | undefined): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return Math.max(1, Math.ceil(trimmed.length / 4));
}

export function estimateTokensFromCharCount(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return Math.max(1, Math.ceil(value / 4));
}

export function extractOpenAICompatibleUsage(data: unknown): {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
} {
  const usage = data && typeof data === 'object' ? (data as { usage?: Record<string, unknown> }).usage : null;
  if (!usage) {
    return { inputTokens: null, outputTokens: null, totalTokens: null };
  }
  return {
    inputTokens: normalizeNumber(
      typeof usage.prompt_tokens === 'number' ? usage.prompt_tokens : null
    ),
    outputTokens: normalizeNumber(
      typeof usage.completion_tokens === 'number' ? usage.completion_tokens : null
    ),
    totalTokens: normalizeNumber(
      typeof usage.total_tokens === 'number' ? usage.total_tokens : null
    )
  };
}

export function extractGeminiUsage(data: unknown): {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
} {
  const usage =
    data && typeof data === 'object'
      ? (data as { usageMetadata?: Record<string, unknown> }).usageMetadata
      : null;
  if (!usage) {
    return { inputTokens: null, outputTokens: null, totalTokens: null };
  }
  return {
    inputTokens: normalizeNumber(
      typeof usage.promptTokenCount === 'number' ? usage.promptTokenCount : null
    ),
    outputTokens: normalizeNumber(
      typeof usage.candidatesTokenCount === 'number'
        ? usage.candidatesTokenCount
        : null
    ),
    totalTokens: normalizeNumber(
      typeof usage.totalTokenCount === 'number' ? usage.totalTokenCount : null
    )
  };
}

export function resolveTokenUsageSource(input: {
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
  estimated?: boolean;
}): AiProviderTokenUsageSource {
  if (input.inputTokens || input.outputTokens || input.totalTokens) {
    return input.estimated ? 'estimated' : 'provider';
  }
  return 'none';
}

export function normalizeAiUsageSummaryRow(
  row: AiUsageSummaryRow
): AiUsageSummaryRecord {
  return {
    usageDate: normalizeUnknownString(row.usage_date, ''),
    provider: normalizeUnknownString(row.provider, 'unknown'),
    model: normalizeUnknownString(row.model, 'unknown'),
    source: normalizeUnknownString(row.source, 'unknown'),
    eventCount: normalizeUnknownNumber(row.event_count),
    succeededCount: normalizeUnknownNumber(row.succeeded_count),
    failedCount: normalizeUnknownNumber(row.failed_count),
    inputTokens: normalizeUnknownNumber(row.input_tokens),
    outputTokens: normalizeUnknownNumber(row.output_tokens),
    totalTokens: normalizeUnknownNumber(row.total_tokens),
    imageCount: normalizeUnknownNumber(row.image_count),
    avgLatencyMs: normalizeUnknownNullableNumber(row.avg_latency_ms),
    p95LatencyMs: normalizeUnknownNullableNumber(row.p95_latency_ms)
  };
}

export async function recordAiProviderUsage(input: AiProviderUsageInput): Promise<void> {
  try {
    const sb = getSupabaseAdmin();
    if (!sb) return;

    const inputTokens = normalizeNumber(input.inputTokens);
    const outputTokens = normalizeNumber(input.outputTokens);
    const totalTokens =
      normalizeNumber(input.totalTokens) ??
      (inputTokens !== null || outputTokens !== null
        ? (inputTokens || 0) + (outputTokens || 0)
        : null);

    const { error } = await sb.from('ai_provider_usage').insert({
      user_id: input.userId || null,
      provider: clampString(input.provider, 48) || 'unknown',
      model: clampString(input.model, 120) || '',
      endpoint: clampString(input.endpoint, 160) || '',
      source: clampString(input.source, 120) || '',
      status: input.status,
      request_id: clampString(input.requestId, 160),
      fallback_of: clampString(input.fallbackOf, 80),
      fallback_used: Boolean(input.fallbackUsed),
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: totalTokens,
      token_usage_source:
        input.tokenUsageSource ||
        resolveTokenUsageSource({ inputTokens, outputTokens, totalTokens }),
      prompt_chars: normalizeNumber(input.promptChars),
      response_chars: normalizeNumber(input.responseChars),
      image_count: normalizeNumber(input.imageCount) || 0,
      latency_ms: normalizeNumber(input.latencyMs),
      error_message: clampString(input.errorMessage, 1000),
      metadata: input.metadata || {},
      started_at: (input.startedAt || new Date()).toISOString(),
      completed_at: (input.completedAt || new Date()).toISOString()
    });

    if (error) {
      console.warn('[AIProviderUsage] insert failed:', error.message);
    }
  } catch (error) {
    console.warn(
      '[AIProviderUsage] record failed:',
      error instanceof Error ? error.message : error
    );
  }
}
