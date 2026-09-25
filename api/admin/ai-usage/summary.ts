import type { SupabaseClient } from '@supabase/supabase-js';
import { getCorsHeadersForRequest } from '../../utils/auth';
import {
  assertPromptCaseAdmin,
  getSupabaseAdmin
} from '../prompt-case-auth';
import {
  normalizeAiUsageSummaryRow,
  type AiUsageSummaryRecord,
  type AiUsageSummaryRow
} from '../../utils/ai-provider-usage';

export const config = { runtime: 'edge' };

type AdminAuthResult = Awaited<ReturnType<typeof assertPromptCaseAdmin>>;

type AiUsageSummaryDeps = {
  getCorsHeadersForRequest: typeof getCorsHeadersForRequest;
  assertPromptCaseAdmin: (request: Request) => Promise<AdminAuthResult>;
  getSupabaseAdmin: () => SupabaseClient | null;
  now?: () => Date;
};

type SummaryQuery = {
  from: string;
  to: string;
  provider?: string;
  model?: string;
  source?: string;
  limit: number;
};

type SummaryTotals = Pick<
  AiUsageSummaryRecord,
  | 'eventCount'
  | 'succeededCount'
  | 'failedCount'
  | 'inputTokens'
  | 'outputTokens'
  | 'totalTokens'
  | 'imageCount'
>;

const DEFAULT_DAYS = 30;
const MAX_DAYS = 366;
const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

function jsonResponse(
  body: unknown,
  corsHeaders: Record<string, string>,
  status = 200
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json'
    }
  });
}

function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function addDays(value: Date, days: number): Date {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function isValidDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return formatDate(new Date(`${value}T00:00:00.000Z`)) === value;
}

function getDaySpan(from: string, to: string): number {
  const fromMs = new Date(`${from}T00:00:00.000Z`).getTime();
  const toMs = new Date(`${to}T00:00:00.000Z`).getTime();
  return Math.floor((toMs - fromMs) / 86_400_000) + 1;
}

function normalizeFilter(value: string | null): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, 160);
}

function parseSummaryQuery(request: Request, now: Date): SummaryQuery | { error: string } {
  const url = new URL(request.url);
  const defaultTo = formatDate(now);
  const defaultFrom = formatDate(addDays(now, -(DEFAULT_DAYS - 1)));
  const from = url.searchParams.get('from')?.trim() || defaultFrom;
  const to = url.searchParams.get('to')?.trim() || defaultTo;

  if (!isValidDateOnly(from) || !isValidDateOnly(to)) {
    return { error: 'from and to must use YYYY-MM-DD' };
  }

  const daySpan = getDaySpan(from, to);
  if (daySpan <= 0) {
    return { error: 'from must be on or before to' };
  }
  if (daySpan > MAX_DAYS) {
    return { error: `date range cannot exceed ${MAX_DAYS} days` };
  }

  const parsedLimit = Number(url.searchParams.get('limit') || DEFAULT_LIMIT);
  const limit = Number.isFinite(parsedLimit)
    ? Math.max(1, Math.min(MAX_LIMIT, Math.floor(parsedLimit)))
    : DEFAULT_LIMIT;

  return {
    from,
    to,
    provider: normalizeFilter(url.searchParams.get('provider')),
    model: normalizeFilter(url.searchParams.get('model')),
    source: normalizeFilter(url.searchParams.get('source')),
    limit
  };
}

function isMissingSummaryView(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const record = error as Record<string, unknown>;
  return (
    record.code === 'PGRST205' ||
    String(record.message || '').includes('ai_usage_daily_summary')
  );
}

function buildTotals(items: AiUsageSummaryRecord[]): SummaryTotals {
  return items.reduce<SummaryTotals>(
    (totals, item) => ({
      eventCount: totals.eventCount + item.eventCount,
      succeededCount: totals.succeededCount + item.succeededCount,
      failedCount: totals.failedCount + item.failedCount,
      inputTokens: totals.inputTokens + item.inputTokens,
      outputTokens: totals.outputTokens + item.outputTokens,
      totalTokens: totals.totalTokens + item.totalTokens,
      imageCount: totals.imageCount + item.imageCount
    }),
    {
      eventCount: 0,
      succeededCount: 0,
      failedCount: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      imageCount: 0
    }
  );
}

export function createAiUsageSummaryHandler(deps: AiUsageSummaryDeps) {
  return async function handler(request: Request): Promise<Response> {
    const corsHeaders = deps.getCorsHeadersForRequest(request);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== 'GET') {
      return jsonResponse({ error: 'Method not allowed' }, corsHeaders, 405);
    }

    const admin = await deps.assertPromptCaseAdmin(request);
    if (!admin.ok) {
      return jsonResponse(
        { error: admin.error || 'Prompt case admin access required' },
        corsHeaders,
        admin.status
      );
    }

    const query = parseSummaryQuery(request, deps.now?.() || new Date());
    if ('error' in query) {
      return jsonResponse({ error: query.error }, corsHeaders, 400);
    }

    const supabase = deps.getSupabaseAdmin();
    if (!supabase) {
      return jsonResponse(
        { error: 'Supabase admin is not configured' },
        corsHeaders,
        500
      );
    }

    let dbQuery = supabase
      .from('ai_usage_daily_summary')
      .select('*')
      .gte('usage_date', query.from)
      .lte('usage_date', query.to)
      .order('usage_date', { ascending: false })
      .order('provider', { ascending: true })
      .order('model', { ascending: true })
      .order('source', { ascending: true })
      .limit(query.limit);

    if (query.provider) dbQuery = dbQuery.eq('provider', query.provider);
    if (query.model) dbQuery = dbQuery.eq('model', query.model);
    if (query.source) dbQuery = dbQuery.eq('source', query.source);

    const { data, error } = await dbQuery;
    if (error) {
      if (isMissingSummaryView(error)) {
        return jsonResponse(
          {
            error:
              '请先在 Supabase 执行 supabase/migrations/20260618113000_ai_usage_daily_summary.sql 初始化 AI 用量汇总视图',
            needsSetup: true,
            items: []
          },
          corsHeaders,
          424
        );
      }
      return jsonResponse(
        { error: 'AI_USAGE_SUMMARY_FAILED', message: error.message },
        corsHeaders,
        500
      );
    }

    const items = Array.isArray(data)
      ? data.map((row) => normalizeAiUsageSummaryRow(row as AiUsageSummaryRow))
      : [];

    return jsonResponse(
      {
        success: true,
        filters: query,
        items,
        totals: buildTotals(items)
      },
      corsHeaders
    );
  };
}

export default createAiUsageSummaryHandler({
  getCorsHeadersForRequest,
  assertPromptCaseAdmin,
  getSupabaseAdmin
});
