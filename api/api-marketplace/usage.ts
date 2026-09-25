import {
  jsonResponse,
  preflightResponse,
  requireUserContextPublic
} from './runtime';

export const config = { runtime: 'edge' };

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 50;

type UsageRecord = {
  id: string;
  key_id: string | null;
  request_id: string;
  status: string;
  model: string;
  endpoint: string;
  reserved_cents: number;
  actual_customer_cents: number;
  upstream_cost_cents: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  settled_at: string | null;
  created_at: string;
};

function parseLimit(value: string | null): number {
  if (!value) return DEFAULT_LIMIT;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(parsed, MAX_LIMIT);
}

export default async function handler(request: Request) {
  const preflight = preflightResponse(request);
  if (preflight) return preflight;
  if (request.method !== 'GET') {
    return jsonResponse(request, { error: 'Method not allowed' }, 405);
  }

  const context = await requireUserContextPublic(request);
  if (!context) return jsonResponse(request, { error: 'Unauthorized' }, 401);

  const url = new URL(request.url);
  const keyId = url.searchParams.get('keyId')?.trim() || null;
  const limit = parseLimit(url.searchParams.get('limit'));

  // Ownership check: a keyId that does not belong to the current user is
  // treated as not-found instead of leaking any usage rows.
  if (keyId) {
    const { data: ownedKey, error: keyError } = await context.supabase
      .from('api_keys')
      .select('id')
      .eq('id', keyId)
      .eq('user_id', context.userId)
      .maybeSingle();
    if (keyError) {
      console.error('[ApiMarketplace] Usage key ownership check failed:', keyError);
      return jsonResponse(request, { error: 'API 使用记录暂时不可用' }, 503);
    }
    if (!ownedKey) {
      return jsonResponse(request, { error: 'API Key not found' }, 404);
    }
  }

  let recordsQuery = context.supabase
    .from('api_usage_logs')
    .select(
      'id,key_id,request_id,status,model,endpoint,reserved_cents,actual_customer_cents,upstream_cost_cents,input_tokens,output_tokens,total_tokens,settled_at,created_at'
    )
    .eq('user_id', context.userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (keyId) recordsQuery = recordsQuery.eq('key_id', keyId);

  const { data: records, error: recordsError } = await recordsQuery;
  if (recordsError) {
    console.error('[ApiMarketplace] Usage list failed:', recordsError);
    return jsonResponse(request, { error: 'API 使用记录暂时不可用' }, 503);
  }

  const { data: totalData, error: totalError } = await context.supabase.rpc('get_api_usage_total', {
    p_user_id: context.userId,
    p_key_id: keyId
  });
  if (totalError) {
    console.error('[ApiMarketplace] Usage total failed:', totalError);
    return jsonResponse(request, { error: 'API 使用记录暂时不可用' }, 503);
  }
  const totalSpentCents = Number(totalData) || 0;

  // User-facing shape: platform charge is the only money value surfaced.
  // upstream_cost_cents / metadata / provider info stay server-side so the
  // reseller margin and upstream relationship are never exposed to customers.
  const usage = ((records as UsageRecord[] | null) || []).map((record) => ({
    id: record.id,
    key_id: record.key_id,
    request_id: record.request_id,
    status: record.status,
    model: record.model,
    endpoint: record.endpoint,
    reserved_cents: record.reserved_cents,
    actual_customer_cents: record.actual_customer_cents,
    input_tokens: record.input_tokens,
    output_tokens: record.output_tokens,
    total_tokens: record.total_tokens,
    settled_at: record.settled_at,
    created_at: record.created_at
  }));

  return jsonResponse(request, {
    usage,
    totalSpentCents,
    limit,
    keyId
  });
}
