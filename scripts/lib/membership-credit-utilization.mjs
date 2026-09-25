/**
 * 会员积分利用率聚合（纯函数，供 CLI 与单测复用）。
 *
 * 口径：按 用户 × 自然月 统计 subscription_grant 赠送量与
 * subscription/mixed 类型 usage 消耗量；rate = min(1, consumed/granted)。
 * 积分按月发放、不滚动，因此按用户月聚合能反映"当月赠送额度的真实消耗"。
 */

const INTERNAL_EMAIL_PATTERN =
  /cloudflare-ai-smoke|codex|smoke|test|internal|@example\.com/i;

export function isInternalUser(user) {
  const email = user?.email || '';
  const source = user?.user_metadata?.source || '';
  return (
    INTERNAL_EMAIL_PATTERN.test(email) ||
    String(source).toLowerCase() === 'cloudflare-ai-smoke'
  );
}

export function monthOf(iso) {
  return (iso || '').slice(0, 7);
}

export function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor(p * (sorted.length - 1)))
  );
  return sorted[index];
}

export function keepSubscription(subscription, now = new Date()) {
  if (!subscription) return false;
  if (subscription.status === 'canceled') {
    const end = (subscription.current_period_end || '').slice(0, 10);
    const today = now.toISOString().slice(0, 10);
    return end >= today;
  }
  return ['active', 'trialing', 'past_due'].includes(subscription.status);
}

export function aggregateUtilization({
  transactions,
  subscriptions,
  plans,
  windowStart,
  excludeInternal = false,
  userLookup = {}
}) {
  const planMap = new Map(
    (plans || []).map((plan) => [plan.id, plan])
  );
  const activeSubByUser = new Map();
  for (const sub of subscriptions || []) {
    if (!keepSubscription(sub)) continue;
    const previous = activeSubByUser.get(sub.user_id);
    if (
      !previous ||
      (sub.current_period_start || '') > (previous.current_period_start || '')
    ) {
      activeSubByUser.set(sub.user_id, sub);
    }
  }

  const grantByUserMonth = new Map();
  const useByUserMonth = new Map();
  for (const tx of transactions || []) {
    const user = activeSubByUser.get(tx.user_id);
    if (!user) continue;
    if (excludeInternal && isInternalUser(userLookup[tx.user_id] || {})) {
      continue;
    }
    const key = `${tx.user_id}|${monthOf(tx.created_at)}`;
    if (tx.type === 'subscription_grant') {
      grantByUserMonth.set(
        key,
        (grantByUserMonth.get(key) || 0) + Math.max(0, Number(tx.amount) || 0)
      );
    } else if (
      tx.type === 'usage' &&
      (tx.credit_type === 'subscription' || tx.credit_type === 'mixed')
    ) {
      useByUserMonth.set(
        key,
        (useByUserMonth.get(key) || 0) + Math.abs(Number(tx.amount) || 0)
      );
    }
  }

  const userMonths = [];
  for (const [key, granted] of grantByUserMonth.entries()) {
    if (granted <= 0) continue;
    const [userId, month] = key.split('|');
    const consumed = useByUserMonth.get(key) || 0;
    const planId = activeSubByUser.get(userId)?.plan_id || 'unknown';
    userMonths.push({
      userId,
      month,
      planId,
      planName: planMap.get(planId)?.name || planId,
      granted,
      consumed,
      rate: Math.min(1, consumed / granted)
    });
  }
  userMonths.sort((a, b) =>
    `${a.month}|${a.userId}`.localeCompare(`${b.month}|${b.userId}`)
  );

  const users = [...new Set(userMonths.map((row) => row.userId))];
  const overall = {
    users: users.length,
    userMonths: userMonths.length,
    granted: userMonths.reduce((sum, row) => sum + row.granted, 0),
    consumed: userMonths.reduce((sum, row) => sum + row.consumed, 0),
    utilization:
      userMonths.reduce((sum, row) => sum + row.granted, 0) > 0
        ? Math.min(
            1,
            userMonths.reduce((sum, row) => sum + row.consumed, 0) /
              userMonths.reduce((sum, row) => sum + row.granted, 0)
          )
        : null
  };

  const rates = userMonths.map((row) => row.rate).sort((a, b) => a - b);
  const distribution = {
    mean:
      rates.length > 0
        ? rates.reduce((sum, rate) => sum + rate, 0) / rates.length
        : null,
    p25: percentile(rates, 0.25),
    p50: percentile(rates, 0.5),
    p75: percentile(rates, 0.75),
    p90: percentile(rates, 0.9),
    p100: percentile(rates, 1)
  };

  const byPlan = {};
  const monthlyTrend = {};
  for (const row of userMonths) {
    byPlan[row.planId] = byPlan[row.planId] || {
      planId: row.planId,
      planName: row.planName,
      users: new Set(),
      granted: 0,
      consumed: 0
    };
    byPlan[row.planId].users.add(row.userId);
    byPlan[row.planId].granted += row.granted;
    byPlan[row.planId].consumed += row.consumed;

    monthlyTrend[row.month] = monthlyTrend[row.month] || {
      month: row.month,
      users: new Set(),
      granted: 0,
      consumed: 0
    };
    monthlyTrend[row.month].users.add(row.userId);
    monthlyTrend[row.month].granted += row.granted;
    monthlyTrend[row.month].consumed += row.consumed;
  }

  const finalizeBucket = (bucket) => ({
    ...bucket,
    users: bucket.users.size,
    utilization:
      bucket.granted > 0
        ? Math.min(1, bucket.consumed / bucket.granted)
        : null
  });

  return {
    windowStart,
    overall,
    distribution,
    byPlan: Object.fromEntries(
      Object.values(byPlan)
        .sort((a, b) => a.planId.localeCompare(b.planId))
        .map((bucket) => [bucket.planId, finalizeBucket(bucket)])
    ),
    monthlyTrend: Object.values(monthlyTrend)
      .sort((a, b) => a.month.localeCompare(b.month))
      .map(finalizeBucket),
    userMonths
  };
}
