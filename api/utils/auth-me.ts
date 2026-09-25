import { createClient } from '@supabase/supabase-js';
import {
  FREE_DAILY_CREDITS,
  FREE_DAILY_IMAGE_GENERATION_LIMIT
} from '../../src/shared/credit-policy';
import {
  SUBSCRIPTION_ACCESS_STATUSES,
  findSubscriptionWithPaidAccess
} from '../membership/subscription-policy';

type AuthMeResult = {
  status: number;
  body: Record<string, unknown>;
};

function parseBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null;
  return parts[1] || null;
}

export async function getAuthMeResult(
  authHeader: string | null
): Promise<AuthMeResult> {
  const token = parseBearerToken(authHeader);
  if (!token) {
    return {
      status: 401,
      body: { error: 'Missing or invalid Authorization header' }
    };
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return { status: 500, body: { error: 'Database not configured' } };
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  });

  const supabaseAdmin = supabaseServiceKey
    ? createClient(supabaseUrl, supabaseServiceKey)
    : supabase;

  try {
    const {
      data: { user },
      error
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      return { status: 401, body: { error: 'Invalid token' } };
    }

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('username, avatar_url, member_number, created_at, referral_code')
      .eq('id', user.id)
      .single();

    const daysJoined = profile?.created_at
      ? Math.floor(
          (Date.now() - new Date(profile.created_at).getTime()) /
            (1000 * 60 * 60 * 24)
        )
      : 0;

    const memberNumberFormatted = profile?.member_number
      ? String(profile.member_number).padStart(4, '0')
      : null;

    const today = new Date().toISOString().split('T')[0];

    const { data: subscriptionCandidates, error: subscriptionError } =
      await supabaseAdmin
        .from('user_subscriptions')
        .select('*, subscription_plans(name, display_name)')
        .eq('user_id', user.id)
        .in('status', [...SUBSCRIPTION_ACCESS_STATUSES])
        .order('created_at', { ascending: false });
    if (subscriptionError) {
      console.error('[AuthMe] Subscription fetch error:', subscriptionError);
      return {
        status: 503,
        body: { error: 'Failed to verify subscription status' }
      };
    }
    const subscriptionData = findSubscriptionWithPaidAccess(
      subscriptionCandidates
    );
    const isMember = Boolean(subscriptionData);

    if (isMember) {
      const { error: grantError } = await supabaseAdmin.rpc(
        'grant_subscription_credits_if_due',
        { p_user_id: user.id }
      );
      if (grantError) {
        console.error('[AuthMe] Subscription grant error:', grantError);
        return {
          status: 503,
          body: { error: 'Failed to refresh member credits' }
        };
      }
    }

    let credits: Record<string, unknown> | null = null;
    const { data: creditsData, error: creditsError } = await supabaseAdmin
      .from('user_credits')
      .select(
        'daily_credits, daily_credits_max, subscription_credits, subscription_credits_max, subscription_credits_period_start, subscription_credits_period_end, bonus_credits, referral_credits, media_credits, promo_media_credits, last_daily_refresh, last_checkin_date, consecutive_checkin_days, daily_image_gen_used, daily_image_gen_max'
      )
      .eq('user_id', user.id)
      .single();
    if (creditsError && creditsError.code !== 'PGRST116') {
      console.error('[AuthMe] Credits fetch error:', creditsError);
      return { status: 500, body: { error: 'Failed to fetch credits' } };
    }

    if (creditsData) {
      let dailyCredits = creditsData.daily_credits;
      let dailyImageGenUsed = creditsData.daily_image_gen_used;
      let dailyImageGenMax = creditsData.daily_image_gen_max;

      if (isMember) {
        dailyCredits = 0;
      } else if (creditsData.last_daily_refresh !== today) {
        dailyCredits = FREE_DAILY_CREDITS;
        dailyImageGenUsed = 0;
        dailyImageGenMax = FREE_DAILY_IMAGE_GENERATION_LIMIT;
      } else {
        dailyCredits = Math.min(
          Number(creditsData.daily_credits || 0),
          FREE_DAILY_CREDITS
        );
        dailyImageGenMax = FREE_DAILY_IMAGE_GENERATION_LIMIT;
      }

      const dailyMax = isMember ? 0 : FREE_DAILY_CREDITS;
      const subscriptionCredits = isMember
        ? creditsData.subscription_credits || 0
        : 0;
      const subscriptionMax = isMember
        ? creditsData.subscription_credits_max || 0
        : 0;
      const mediaCredits = Number(creditsData.media_credits || 0);
      const promoMediaCredits = Number(creditsData.promo_media_credits || 0);

      credits = {
        daily: dailyCredits,
        dailyMax,
        subscription: subscriptionCredits,
        subscriptionMax,
        subscriptionPeriodStart:
          creditsData.subscription_credits_period_start || null,
        subscriptionPeriodEnd:
          creditsData.subscription_credits_period_end || null,
        bonus: creditsData.bonus_credits,
        referral: creditsData.referral_credits || 0,
        media: mediaCredits,
        promoMedia: promoMediaCredits,
        total:
          dailyCredits +
          subscriptionCredits +
          creditsData.bonus_credits +
          (creditsData.referral_credits || 0) +
          mediaCredits +
          promoMediaCredits,
        canCheckin: creditsData.last_checkin_date !== today,
        consecutiveCheckinDays: creditsData.consecutive_checkin_days,
        dailyImageGen: {
          used: dailyImageGenUsed,
          max: dailyImageGenMax
        }
      };
    }

    let subscription: Record<string, unknown> | null = null;
    if (subscriptionData) {
      subscription = {
        planName: subscriptionData.subscription_plans?.name || 'free',
        planDisplayName: subscriptionData.subscription_plans?.display_name,
        status: subscriptionData.status,
        billingCycle: subscriptionData.billing_cycle,
        currentPeriodEnd: subscriptionData.current_period_end,
        cancelAtPeriodEnd: subscriptionData.cancel_at_period_end
      };
    }

    return {
      status: 200,
      body: {
        user: {
          id: user.id,
          email: user.email,
          username: profile?.username,
          avatar_url:
            profile?.avatar_url ||
            user.user_metadata?.picture ||
            user.user_metadata?.avatar_url,
          member_number: profile?.member_number,
          member_number_formatted: memberNumberFormatted,
          referral_code: profile?.referral_code,
          days_joined: daysJoined
        },
        credits,
        subscription
      }
    };
  } catch {
    return { status: 500, body: { error: 'Internal server error' } };
  }
}
