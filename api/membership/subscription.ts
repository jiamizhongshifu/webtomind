/**
 * Vercel Serverless Function - /api/membership/subscription
 * 获取用户订阅状态
 */

import { createClient } from '@supabase/supabase-js';
import { getCorsHeadersForRequest } from '../utils/auth';
import {
  FREE_DAILY_CREDITS,
  FREE_DAILY_IMAGE_GENERATION_LIMIT,
  isFreePlanName,
  normalizePlanLimits
} from '../../src/shared/credit-policy';
import {
  SUBSCRIPTION_ACCESS_STATUSES,
  findSubscriptionWithPaidAccess
} from './subscription-policy';

export const config = {
  runtime: 'edge'
};

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

  if (!supabaseUrl || !supabaseKey) {
    return jsonResponse({ error: 'Database not configured' }, 500);
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  });

  try {
    // 验证 token 并获取用户
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return jsonResponse({ error: 'Invalid token' }, 401);
    }

    const userId = user.id;

    // 获取用户当前订阅（包含套餐详情）
    const { data: subscriptionCandidates, error: subError } = await supabase
      .from('user_subscriptions')
      .select(
        `
        *,
        subscription_plans (
          id,
          name,
          display_name,
          price_monthly,
          price_yearly,
          monthly_credits,
          features,
          limits
        )
      `
      )
      .eq('user_id', userId)
      .in('status', [...SUBSCRIPTION_ACCESS_STATUSES])
      .order('created_at', { ascending: false });

    if (subError) {
      console.error('[Subscription] Fetch error:', subError);
      return jsonResponse({ error: 'Failed to fetch subscription' }, 500);
    }

    const subscription = findSubscriptionWithPaidAccess(subscriptionCandidates);
    const isMember = Boolean(subscription);

    // 没有订阅记录，返回免费套餐状态
    if (!isMember) {
      return jsonResponse({
        subscription: null,
        plan: {
          id: 'free',
          name: 'free',
          displayName: { 'zh-CN': '免费版', 'en-US': 'Free' },
          monthlyCredits: FREE_DAILY_CREDITS,
          features: {
            aiModels: ['gemini-flash'],
            imageGeneration: true
          },
          limits: {
            maxMaterials: 100,
            dailyCredits: FREE_DAILY_CREDITS,
            dailyImageGeneration: FREE_DAILY_IMAGE_GENERATION_LIMIT
          }
        },
        isFree: true
      });
    }

    // 格式化响应
    const plan = subscription.subscription_plans;
    const response = {
      subscription: {
        id: subscription.id,
        status: subscription.status,
        billingCycle: subscription.billing_cycle,
        currentPeriodStart: subscription.current_period_start,
        currentPeriodEnd: subscription.current_period_end,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        paymentProvider: subscription.payment_provider,
        externalSubscriptionId: subscription.external_subscription_id,
        stripeSubscriptionId: subscription.stripe_subscription_id,
        createdAt: subscription.created_at
      },
      plan: plan
        ? {
            id: plan.id,
            name: plan.name,
            displayName: plan.display_name,
            priceMonthly: plan.price_monthly,
            priceYearly: plan.price_yearly,
            monthlyCredits: isFreePlanName(plan.name)
              ? FREE_DAILY_CREDITS
              : plan.monthly_credits,
            features: plan.features,
            limits: normalizePlanLimits(plan.limits, plan.name)
          }
        : null,
      isFree: false
    };

    return jsonResponse(response);
  } catch (error: unknown) {
    console.error('[Subscription] Error:', error);
    // 安全修复：不暴露内部错误详情
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
}
