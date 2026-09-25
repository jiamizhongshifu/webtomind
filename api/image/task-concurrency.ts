import type { SupabaseClient } from '@supabase/supabase-js';
import {
  SUBSCRIPTION_ACCESS_STATUSES,
  findSubscriptionWithPaidAccess
} from '../membership/subscription-policy';

const DEFAULT_CONCURRENCY_BY_PLAN: Record<string, number> = {
  free: 1,
  starter: 1,
  pro: 3,
  plus: 3,
  creator: 3,
  premium: 3,
  subscriber: 3,
  max: 4,
  team: 4,
  business: 4,
  enterprise: 5
};

function normalizeConcurrency(value: unknown, fallback = 1): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(6, Math.floor(parsed)));
}

function parsePlanConcurrencyConfig(): Record<string, number> {
  const configured = process.env.IMAGE_TASK_CONCURRENCY_BY_PLAN;
  const defaultValue = normalizeConcurrency(
    process.env.IMAGE_TASK_USER_CONCURRENCY,
    1
  );
  const base: Record<string, number> = {
    ...DEFAULT_CONCURRENCY_BY_PLAN,
    default: defaultValue
  };

  if (!configured) return base;

  try {
    const parsed = JSON.parse(configured) as Record<string, unknown>;
    Object.entries(parsed).forEach(([plan, value]) => {
      base[plan.toLowerCase()] = normalizeConcurrency(value, defaultValue);
    });
    return base;
  } catch {
    configured.split(',').forEach((entry) => {
      const [rawPlan, rawValue] = entry.split('=');
      const plan = rawPlan?.trim().toLowerCase();
      if (!plan) return;
      base[plan] = normalizeConcurrency(rawValue, defaultValue);
    });
    return base;
  }
}

function extractPlanName(subscription: Record<string, unknown>): string {
  const joinedPlan = subscription.subscription_plans;
  if (Array.isArray(joinedPlan)) {
    const firstPlan = joinedPlan[0] as Record<string, unknown> | undefined;
    if (typeof firstPlan?.name === 'string') return firstPlan.name;
  }
  if (
    joinedPlan &&
    typeof joinedPlan === 'object' &&
    typeof (joinedPlan as Record<string, unknown>).name === 'string'
  ) {
    return (joinedPlan as Record<string, string>).name;
  }
  if (typeof subscription.plan_name === 'string') {
    return subscription.plan_name;
  }
  if (typeof subscription.plan_id === 'string') {
    return subscription.plan_id;
  }
  return 'free';
}

function normalizePlanName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '-');
}

function resolvePlanConcurrency(
  planName: string,
  concurrencyByPlan: Record<string, number>,
  fallback: number
): number {
  const normalized = normalizePlanName(planName);
  if (concurrencyByPlan[normalized]) return concurrencyByPlan[normalized];

  if (normalized.includes('enterprise')) {
    return concurrencyByPlan.enterprise || fallback;
  }
  if (normalized.includes('business')) {
    return concurrencyByPlan.business || fallback;
  }
  if (normalized.includes('team')) {
    return concurrencyByPlan.team || fallback;
  }
  if (normalized.includes('max')) {
    return concurrencyByPlan.max || fallback;
  }
  if (
    normalized.includes('pro') ||
    normalized.includes('plus') ||
    normalized.includes('creator') ||
    normalized.includes('premium')
  ) {
    return concurrencyByPlan.pro || concurrencyByPlan.subscriber || fallback;
  }

  if (normalized === 'free' || normalized.includes('free')) {
    return concurrencyByPlan.free || fallback;
  }

  return concurrencyByPlan.subscriber || concurrencyByPlan.pro || fallback;
}

export async function getUserImageConcurrency(
  sb: SupabaseClient,
  userId: string
): Promise<number> {
  const concurrencyByPlan = parsePlanConcurrencyConfig();
  const fallback = concurrencyByPlan.default || 1;

  const { data: subscriptionCandidates, error } = await sb
    .from('user_subscriptions')
    .select(
      'status,current_period_end,plan_id,plan_name,subscription_plans(name)'
    )
    .eq('user_id', userId)
    .in('status', [...SUBSCRIPTION_ACCESS_STATUSES])
    .order('created_at', { ascending: false });

  if (error) {
    if (error.code !== 'PGRST116') {
      console.warn('[ImageTask] subscription concurrency lookup failed:', {
        userId,
        message: error.message
      });
    }
    return fallback;
  }

  const subscription = findSubscriptionWithPaidAccess(subscriptionCandidates);
  if (!subscription) {
    return concurrencyByPlan.free || fallback;
  }

  const planName = extractPlanName(subscription as Record<string, unknown>);
  return resolvePlanConcurrency(planName, concurrencyByPlan, fallback);
}
