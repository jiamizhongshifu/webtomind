import { createClient } from '@supabase/supabase-js';
import { getCorsHeadersForRequest } from '../utils/auth';

export const config = {
  runtime: 'edge'
};

function jsonResponse(
  data: unknown,
  corsHeaders: Record<string, string>,
  status = 200
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders
    }
  });
}

export default async function handler(request: Request) {
  const corsHeaders = getCorsHeadersForRequest(request);

  if (request.method === 'OPTIONS')
    return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== 'POST' && request.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed' }, corsHeaders, 405);
  }

  // Secrets in query strings leak into access logs and browser history.
  const authHeader = request.headers.get('authorization') || '';
  const bearerSecret = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : '';
  const headerSecret = request.headers.get('x-cron-secret') || '';
  const secret = bearerSecret || headerSecret;
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return jsonResponse({ error: 'Unauthorized' }, corsHeaders, 401);
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return jsonResponse({ error: 'Database not configured' }, corsHeaders, 500);
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const pageSize = 500;
  let offset = 0;
  let attempted = 0;
  let succeeded = 0;
  let failed = 0;
  const seenUserIds = new Set<string>();

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data: subs, error } = await supabase
      .from('user_subscriptions')
      .select('user_id, status, current_period_end')
      .in('status', ['active', 'trialing'])
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) {
      console.error('[Cron] Fetch subscriptions error:', error);
      return jsonResponse(
        { error: 'Failed to fetch subscriptions' },
        corsHeaders,
        500
      );
    }

    if (!subs || subs.length === 0) {
      break;
    }

    for (const sub of subs) {
      if (seenUserIds.has(sub.user_id)) {
        continue;
      }
      seenUserIds.add(sub.user_id);
      attempted += 1;

      const { error: grantError } = await supabase.rpc(
        'grant_subscription_credits_if_due',
        {
          p_user_id: sub.user_id
        }
      );

      if (grantError) {
        failed += 1;
        console.error('[Cron] Grant error:', {
          userId: sub.user_id,
          error: grantError
        });
      } else {
        succeeded += 1;
      }
    }

    if (subs.length < pageSize) {
      break;
    }

    offset += pageSize;
  }

  const result = { success: failed === 0, attempted, succeeded, failed };
  return jsonResponse(result, corsHeaders, failed > 0 ? 500 : 200);
}
