/**
 * POST /api/credits/daily-login-reward
 *
 * Grants a small once-per-UTC-day bonus credit reward when a signed-in user
 * enters the creation workspace. The grant is idempotent per user/day.
 */

import { getCorsHeadersForRequest, getSupabaseAdmin } from '../utils/auth';
import { createClient } from '@supabase/supabase-js';
import {
  DAILY_LOGIN_REWARD_AMOUNT,
  DAILY_LOGIN_REWARD_MONTHLY_CAP
} from '../../src/shared/daily-login-reward.js';

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

async function getUserFromRequest(request: Request) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return null;

  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  });
  const {
    data: { user },
    error
  } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

export default async function handler(request: Request) {
  const corsHeaders = getCorsHeadersForRequest(request);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, corsHeaders, 405);
  }

  const user = await getUserFromRequest(request);
  if (!user) {
    return jsonResponse({ error: '请先登录' }, corsHeaders, 401);
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return jsonResponse(
      { error: 'Database admin not configured' },
      corsHeaders,
      500
    );
  }

  const userId = user.id;

  try {
    const { data, error } = await admin.rpc('claim_daily_login_reward', {
      p_user_id: userId,
      p_reward_amount: DAILY_LOGIN_REWARD_AMOUNT,
      p_monthly_cap: DAILY_LOGIN_REWARD_MONTHLY_CAP
    });

    if (error) {
      throw error;
    }

    return jsonResponse(data, corsHeaders);
  } catch (error) {
    console.error('[Credits] daily login reward failed:', error);
    return jsonResponse(
      { error: 'DAILY_LOGIN_REWARD_FAILED' },
      corsHeaders,
      500
    );
  }
}
