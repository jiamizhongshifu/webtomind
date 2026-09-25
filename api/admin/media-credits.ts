import type { SupabaseClient } from '@supabase/supabase-js';
import { getCorsHeadersForRequest } from '../utils/auth';
import { assertPromptCaseAdmin, getSupabaseAdmin } from './prompt-case-auth';

export const config = { runtime: 'edge' };

type AdminAuthResult = Awaited<ReturnType<typeof assertPromptCaseAdmin>>;

type MediaCreditsDeps = {
  getCorsHeadersForRequest: typeof getCorsHeadersForRequest;
  assertPromptCaseAdmin: (request: Request) => Promise<AdminAuthResult>;
  getSupabaseAdmin: () => SupabaseClient | null;
  now?: () => Date;
};

type MediaCreditQuery = {
  from: string;
  to: string;
  userId?: string;
  source?: string;
  limit: number;
};

type MediaCreditAdjustmentBody = {
  userId?: unknown;
  amount?: unknown;
  creditType?: unknown;
  reason?: unknown;
  idempotencyKey?: unknown;
};

const DEFAULT_DAYS = 30;
const MAX_DAYS = 366;
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
const MAX_ADMIN_ADJUSTMENT = 1_000_000;

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
  return (
    Math.floor(
      (new Date(`${to}T00:00:00.000Z`).getTime() -
        new Date(`${from}T00:00:00.000Z`).getTime()) /
        86_400_000
    ) + 1
  );
}

function cleanString(
  value: string | null,
  maxLength = 160
): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLength);
}

function parseQuery(
  request: Request,
  now: Date
): MediaCreditQuery | { error: string } {
  const url = new URL(request.url);
  const defaultTo = formatDate(now);
  const defaultFrom = formatDate(addDays(now, -(DEFAULT_DAYS - 1)));
  const from = url.searchParams.get('from')?.trim() || defaultFrom;
  const to = url.searchParams.get('to')?.trim() || defaultTo;

  if (!isValidDateOnly(from) || !isValidDateOnly(to)) {
    return { error: 'from and to must use YYYY-MM-DD' };
  }
  const daySpan = getDaySpan(from, to);
  if (daySpan <= 0) return { error: 'from must be on or before to' };
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
    limit,
    userId: cleanString(url.searchParams.get('userId'), 80),
    source: cleanString(url.searchParams.get('source'))
  };
}

function toNumber(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.trunc(parsed);
}

function normalizeAdjustmentBody(
  body: MediaCreditAdjustmentBody,
  admin: AdminAuthResult
):
  | {
      userId: string;
      delta: number;
      creditType: 'media' | 'promo_media';
      source: string;
      metadata: Record<string, unknown>;
    }
  | { error: string } {
  const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
  if (!userId) return { error: 'userId is required' };

  const amount = toNumber(body.amount);
  if (!amount) return { error: 'amount must be a non-zero integer' };
  if (Math.abs(amount) > MAX_ADMIN_ADJUSTMENT) {
    return { error: `amount cannot exceed ${MAX_ADMIN_ADJUSTMENT}` };
  }

  const creditType =
    body.creditType === 'promo_media' ? 'promo_media' : 'media';
  const reason =
    typeof body.reason === 'string' && body.reason.trim()
      ? body.reason.trim().slice(0, 500)
      : 'admin media credit adjustment';
  const idempotencyKey =
    typeof body.idempotencyKey === 'string' && body.idempotencyKey.trim()
      ? body.idempotencyKey.trim().slice(0, 200)
      : `admin:${admin.userId || admin.email || 'unknown'}:${userId}:${creditType}:${amount}:${reason}`;

  return {
    userId,
    delta: amount,
    creditType,
    source:
      creditType === 'promo_media'
        ? 'admin_promo_media_adjustment'
        : 'admin_media_adjustment',
    metadata: {
      reason,
      adjustedBy: admin.userId || null,
      adjustedByEmail: admin.email || null,
      idempotency_key: idempotencyKey
    }
  };
}

function isMissingMediaSummaryView(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const record = error as Record<string, unknown>;
  return (
    record.code === 'PGRST205' ||
    String(record.message || '').includes('media_credit_daily_summary')
  );
}

export function createMediaCreditsAdminHandler(deps: MediaCreditsDeps) {
  return async function handler(request: Request): Promise<Response> {
    const corsHeaders = deps.getCorsHeadersForRequest(request);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }
    if (request.method !== 'GET' && request.method !== 'POST') {
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

    const supabase = deps.getSupabaseAdmin();
    if (!supabase) {
      return jsonResponse(
        { error: 'Supabase admin is not configured' },
        corsHeaders,
        500
      );
    }

    if (request.method === 'POST') {
      const body = (await request
        .json()
        .catch(() => ({}))) as MediaCreditAdjustmentBody;
      const adjustment = normalizeAdjustmentBody(body, admin);
      if ('error' in adjustment) {
        return jsonResponse({ error: adjustment.error }, corsHeaders, 400);
      }

      const { data, error } = await supabase.rpc('admin_adjust_media_credits', {
        p_user_id: adjustment.userId,
        p_delta: adjustment.delta,
        p_credit_type: adjustment.creditType,
        p_source: adjustment.source,
        p_metadata: adjustment.metadata
      });

      if (error) {
        return jsonResponse(
          { error: 'MEDIA_CREDIT_ADJUSTMENT_FAILED', message: error.message },
          corsHeaders,
          500
        );
      }

      const result = data as { success?: boolean; error?: string } | null;
      if (result?.success === false) {
        return jsonResponse(result, corsHeaders, 409);
      }

      return jsonResponse({ success: true, result }, corsHeaders);
    }

    const query = parseQuery(request, deps.now?.() || new Date());
    if ('error' in query) {
      return jsonResponse({ error: query.error }, corsHeaders, 400);
    }

    let walletsQuery = supabase
      .from('user_credits')
      .select(
        'user_id,daily_credits,subscription_credits,bonus_credits,referral_credits,media_credits,promo_media_credits,total_earned,total_consumed,daily_image_gen_used,daily_image_gen_max,updated_at',
        { count: 'exact' }
      )
      .order('updated_at', { ascending: false })
      .limit(query.limit);
    if (query.userId) walletsQuery = walletsQuery.eq('user_id', query.userId);

    let summaryQuery = supabase
      .from('media_credit_daily_summary')
      .select('*')
      .gte('summary_date', query.from)
      .lte('summary_date', query.to)
      .order('summary_date', { ascending: false })
      .order('source', { ascending: true })
      .limit(query.limit);
    if (query.source) summaryQuery = summaryQuery.eq('source', query.source);

    let txQuery = supabase
      .from('credit_transactions')
      .select(
        'id,user_id,type,credit_type,amount,balance_after,source,description,metadata,created_at'
      )
      .in('credit_type', ['media', 'promo_media', 'mixed'])
      .gte('created_at', `${query.from}T00:00:00.000Z`)
      .lte('created_at', `${query.to}T23:59:59.999Z`)
      .order('created_at', { ascending: false })
      .limit(query.limit);
    if (query.userId) txQuery = txQuery.eq('user_id', query.userId);
    if (query.source) txQuery = txQuery.eq('source', query.source);

    const [walletsResult, summaryResult, transactionsResult] =
      await Promise.all([walletsQuery, summaryQuery, txQuery]);

    if (walletsResult.error) {
      return jsonResponse(
        {
          error: 'MEDIA_CREDIT_WALLETS_FAILED',
          message: walletsResult.error.message
        },
        corsHeaders,
        500
      );
    }
    if (summaryResult.error) {
      if (isMissingMediaSummaryView(summaryResult.error)) {
        return jsonResponse(
          {
            error:
              '请先执行 supabase/migrations/20260630114500_media_credit_operational_closure.sql 初始化媒体积分运营视图',
            needsSetup: true,
            wallets: walletsResult.data || [],
            summary: [],
            transactions: []
          },
          corsHeaders,
          424
        );
      }
      return jsonResponse(
        {
          error: 'MEDIA_CREDIT_SUMMARY_FAILED',
          message: summaryResult.error.message
        },
        corsHeaders,
        500
      );
    }
    if (transactionsResult.error) {
      return jsonResponse(
        {
          error: 'MEDIA_CREDIT_TRANSACTIONS_FAILED',
          message: transactionsResult.error.message
        },
        corsHeaders,
        500
      );
    }

    const summary = summaryResult.data || [];
    const totals = summary.reduce(
      (acc: Record<string, number>, row: Record<string, unknown>) => {
        acc.mediaDelta += Number(row.media_delta || 0);
        acc.promoMediaDelta += Number(row.promo_media_delta || 0);
        acc.granted += Number(row.granted || 0);
        acc.refunded += Number(row.refunded || 0);
        acc.consumed += Number(row.consumed || 0);
        acc.transactionCount += Number(row.transaction_count || 0);
        return acc;
      },
      {
        mediaDelta: 0,
        promoMediaDelta: 0,
        granted: 0,
        refunded: 0,
        consumed: 0,
        transactionCount: 0
      }
    );

    return jsonResponse(
      {
        success: true,
        filters: query,
        totals,
        wallets: walletsResult.data || [],
        walletCount: walletsResult.count || 0,
        summary,
        transactions: transactionsResult.data || []
      },
      corsHeaders
    );
  };
}

export default createMediaCreditsAdminHandler({
  getCorsHeadersForRequest,
  assertPromptCaseAdmin,
  getSupabaseAdmin
});
