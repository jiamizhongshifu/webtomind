/**
 * Vercel Serverless Function - /api/credits/weaving-quota
 * 免费用户每日 5 次编织配额校验与消耗
 */

import { createClient } from '@supabase/supabase-js';
import { getCorsHeadersForRequest, getSupabaseAdmin } from '../utils/auth';

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

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, corsHeaders, 405);
  }

  const authHeader = request.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse(
      { error: 'Missing Authorization header' },
      corsHeaders,
      401
    );
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return jsonResponse(
      { error: 'Invalid Authorization header' },
      corsHeaders,
      401
    );
  }

  const token = parts[1];
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return jsonResponse({ error: 'Database not configured' }, corsHeaders, 500);
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  });

  try {
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return jsonResponse({ error: 'Invalid token' }, corsHeaders, 401);
    }

    const admin = getSupabaseAdmin();
    if (!admin) {
      return jsonResponse({ error: 'Database admin not configured' }, corsHeaders, 500);
    }

    const { data: result, error: rpcError } = await admin.rpc(
      'consume_weaving_quota',
      {
        p_user_id: user.id
      }
    );

    if (rpcError) {
      return jsonResponse(
        {
          error: 'Failed to consume weaving quota',
          details: rpcError.message
        },
        corsHeaders,
        500
      );
    }

    if (!result?.success && result?.error === 'QUOTA_EXCEEDED') {
      return jsonResponse(
        {
          error: 'QUOTA_EXCEEDED',
          feature: result.feature || 'weaving_generation',
          used: result.used,
          max: result.max
        },
        corsHeaders,
        402
      );
    }

    return jsonResponse(
      {
        success: true,
        isMember: !!result?.is_member,
        used: result?.used,
        max: result?.max
      },
      corsHeaders
    );
  } catch {
    return jsonResponse(
      {
        error: 'Internal server error'
      },
      corsHeaders,
      500
    );
  }
}
