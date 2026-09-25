/**
 * Vercel Serverless Function - /api/credits/balance
 * 获取用户积分余额
 */

import { createClient } from '@supabase/supabase-js';
import { getCorsHeadersForRequest } from '../utils/auth';
import {
  FREE_DAILY_CREDITS,
  FREE_DAILY_IMAGE_GENERATION_LIMIT
} from '../../src/shared/credit-policy';
import {
  SUBSCRIPTION_ACCESS_STATUSES,
  findSubscriptionWithPaidAccess
} from '../membership/subscription-policy';

export const config = {
  runtime: 'edge'
};

// 获取今天的日期字符串 (UTC)
function getTodayUTC(): string {
  return new Date().toISOString().split('T')[0];
}

export default async function handler(request: Request) {
  const corsHeaders = getCorsHeadersForRequest(request);

  // JSON 响应辅助函数
  function jsonResponse(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
      status,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }

  // 处理 CORS 预检请求
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  // 获取 Authorization header
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse({ error: 'Missing Authorization header' }, 401);
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return jsonResponse({ error: 'Invalid Authorization header' }, 401);
  }

  const token = parts[1];

  // 初始化 Supabase
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey || !supabaseServiceKey) {
    return jsonResponse({ error: 'Database not configured' }, 500);
  }

  const supabaseAuth = createClient(supabaseUrl, supabaseKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  });
  // Credit reconciliation is a server-side ledger operation. Keep user
  // authentication on the caller JWT, then scope privileged reads/writes to
  // the verified user id instead of weakening user_credits RLS.
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // 验证 token 并获取用户
    const {
      data: { user },
      error: authError
    } = await supabaseAuth.auth.getUser(token);
    if (authError || !user) {
      return jsonResponse({ error: 'Invalid token' }, 401);
    }

    const userId = user.id;
    const today = getTodayUTC();

    // 获取订阅信息（包含取消但仍在有效期内的记录）
    const { data: subscriptionCandidates, error: subscriptionError } =
      await supabaseAdmin
        .from('user_subscriptions')
        .select('*, subscription_plans(*)')
        .eq('user_id', userId)
        .in('status', [...SUBSCRIPTION_ACCESS_STATUSES])
        .order('created_at', { ascending: false });
    if (subscriptionError) {
      console.error('[Credits] Subscription fetch error:', subscriptionError);
      return jsonResponse(
        { error: 'Failed to verify subscription status' },
        503
      );
    }
    const subscription = findSubscriptionWithPaidAccess(subscriptionCandidates);
    const isMember = Boolean(subscription);

    // 获取用户积分信息
    // 获取或创建用户积分记录（使用 upsert 防止竞态条件）
    const { data: initialCredits, error: creditsError } = await supabaseAdmin
      .from('user_credits')
      .select('*')
      .eq('user_id', userId)
      .single();
    let credits = initialCredits;

    // 如果没有记录，使用 upsert 创建默认记录（原子操作，防止并发创建重复记录）
    if (creditsError && creditsError.code === 'PGRST116') {
      const { data: newCredits, error: upsertError } = await supabaseAdmin
        .from('user_credits')
        .upsert(
          {
            user_id: userId,
            daily_credits: FREE_DAILY_CREDITS,
            daily_credits_max: FREE_DAILY_CREDITS,
            last_daily_refresh: today,
            bonus_credits: 0,
            media_credits: 0,
            promo_media_credits: 0,
            total_earned: 0,
            total_consumed: 0,
            last_checkin_date: null,
            consecutive_checkin_days: 0,
            daily_image_gen_used: 0,
            daily_image_gen_max: FREE_DAILY_IMAGE_GENERATION_LIMIT
          },
          { onConflict: 'user_id' }
        )
        .select()
        .single();

      if (upsertError) {
        console.error('[Credits] Upsert error:', upsertError);
        return jsonResponse({ error: 'Failed to create credits record' }, 500);
      }
      credits = newCredits;
    } else if (creditsError) {
      console.error('[Credits] Fetch error:', creditsError);
      return jsonResponse({ error: 'Failed to fetch credits' }, 500);
    }

    // 检查是否需要刷新每日积分
    if (isMember) {
      const { error: grantError } = await supabaseAdmin.rpc(
        'grant_subscription_credits_if_due',
        { p_user_id: userId }
      );
      if (grantError) {
        console.error('[Credits] Subscription grant error:', grantError);
        return jsonResponse({ error: 'Failed to refresh member credits' }, 503);
      }
      const { data: refreshedCredits, error: refreshError } =
        await supabaseAdmin
          .from('user_credits')
          .select('*')
          .eq('user_id', userId)
          .single();
      if (refreshError) {
        console.error('[Credits] Member credit refresh error:', refreshError);
        return jsonResponse({ error: 'Failed to refresh member credits' }, 503);
      }
      if (refreshedCredits) {
        credits = refreshedCredits;
      }
    }

    // Daily credits refresh: free users only
    if (isMember) {
      if (credits.daily_credits !== 0 || credits.daily_credits_max !== 0) {
        const { data: updatedCredits, error: updateError } = await supabaseAdmin
          .from('user_credits')
          .update({
            daily_credits: 0,
            daily_credits_max: 0,
            last_daily_refresh: today,
            updated_at: new Date().toISOString()
          })
          .eq('user_id', userId)
          .select()
          .single();
        if (updateError || !updatedCredits) {
          console.error(
            '[Credits] Member daily credit reset error:',
            updateError
          );
          return jsonResponse(
            { error: 'Failed to reconcile member credits' },
            503
          );
        }
        credits = updatedCredits;
      }
    } else {
      const { data: reconciledCredits, error: reconcileError } =
        await supabaseAdmin.rpc('reconcile_free_credit_policy', {
          p_user_id: userId
        });
      if (reconcileError || !reconciledCredits) {
        console.error('[Credits] Free quota reconcile error:', reconcileError);
        return jsonResponse({ error: 'Failed to reconcile free credits' }, 503);
      }
      credits = reconciledCredits;

      if (credits.last_daily_refresh !== today) {
        const { data: updatedCredits, error: updateError } = await supabaseAdmin
          .from('user_credits')
          .update({
            daily_credits: credits.daily_credits_max,
            last_daily_refresh: today,
            daily_image_gen_used: 0,
            updated_at: new Date().toISOString()
          })
          .eq('user_id', userId)
          .select()
          .single();

        if (updateError) {
          console.error('[Credits] Refresh error:', updateError);
          return jsonResponse(
            { error: 'Failed to refresh daily credits' },
            503
          );
        } else {
          credits = updatedCredits;
        }
      }
    }

    const response = {
      credits: {
        daily: credits.daily_credits,
        dailyMax: credits.daily_credits_max,
        subscription: isMember ? credits.subscription_credits || 0 : 0,
        subscriptionMax: isMember ? credits.subscription_credits_max || 0 : 0,
        subscriptionPeriodStart:
          credits.subscription_credits_period_start || null,
        subscriptionPeriodEnd: credits.subscription_credits_period_end || null,
        bonus: credits.bonus_credits,
        referral: credits.referral_credits || 0,
        media: credits.media_credits || 0,
        promoMedia: credits.promo_media_credits || 0,
        total:
          credits.daily_credits +
          (isMember ? credits.subscription_credits || 0 : 0) +
          credits.bonus_credits +
          (credits.referral_credits || 0) +
          (credits.media_credits || 0) +
          (credits.promo_media_credits || 0),
        lastDailyRefresh: credits.last_daily_refresh
      },
      checkin: {
        lastDate: credits.last_checkin_date || null,
        consecutiveDays: credits.consecutive_checkin_days || 0,
        canCheckin: credits.last_checkin_date !== today
      },
      quota: {
        dailyImageGen: {
          used: credits.daily_image_gen_used,
          max: credits.daily_image_gen_max
        }
      },
      subscription: subscription
        ? {
            planName: subscription.subscription_plans?.name || 'free',
            status: subscription.status,
            currentPeriodEnd: subscription.current_period_end
          }
        : null
    };

    return jsonResponse(response);
  } catch (error: unknown) {
    console.error('[Credits] Error:', error);
    // 安全修复：不暴露内部错误详情
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
}
