import assert from 'node:assert/strict';
import test from 'node:test';
import {
  aggregateUtilization,
  isInternalUser,
  keepSubscription,
  monthOf,
  percentile
} from './lib/membership-credit-utilization.mjs';

const plans = [
  { id: 'pro', name: 'pro', monthly_credits: 10000 },
  { id: 'max', name: 'max', monthly_credits: 60000 }
];

const subscriptions = [
  {
    user_id: 'u1',
    plan_id: 'pro',
    status: 'active',
    current_period_start: '2026-06-01T00:00:00Z',
    current_period_end: '2027-06-01T00:00:00Z'
  },
  {
    user_id: 'u2',
    plan_id: 'max',
    status: 'canceled',
    current_period_start: '2026-06-01T00:00:00Z',
    current_period_end: '2026-08-15T00:00:00Z'
  }
];

const transactions = [
  // u1 June: grant 10000, use 5000 -> 50%
  { user_id: 'u1', type: 'subscription_grant', credit_type: 'subscription', amount: 10000, created_at: '2026-06-01T00:00:00Z' },
  { user_id: 'u1', type: 'usage', credit_type: 'subscription', amount: -5000, created_at: '2026-06-15T00:00:00Z' },
  // u1 July: grant 10000, use 12000 (mixed) -> capped at 100%
  { user_id: 'u1', type: 'subscription_grant', credit_type: 'subscription', amount: 10000, created_at: '2026-07-01T00:00:00Z' },
  { user_id: 'u1', type: 'usage', credit_type: 'mixed', amount: -12000, created_at: '2026-07-20T00:00:00Z' },
  // u2 July: grant 60000, use 30000 -> 50%
  { user_id: 'u2', type: 'subscription_grant', credit_type: 'subscription', amount: 60000, created_at: '2026-07-01T00:00:00Z' },
  { user_id: 'u2', type: 'usage', credit_type: 'subscription', amount: -30000, created_at: '2026-07-10T00:00:00Z' },
  // u2 August: grant 60000, no usage -> 0%
  { user_id: 'u2', type: 'subscription_grant', credit_type: 'subscription', amount: 60000, created_at: '2026-08-01T00:00:00Z' },
  // daily usage ignored for utilization
  { user_id: 'u1', type: 'usage', credit_type: 'daily', amount: -999, created_at: '2026-07-21T00:00:00Z' }
];

test('monthOf extracts YYYY-MM', () => {
  assert.equal(monthOf('2026-07-15T00:00:00Z'), '2026-07');
  assert.equal(monthOf(null), '');
});

test('percentile computes quantiles', () => {
  const sorted = [0.1, 0.4, 0.7, 0.9, 1];
  assert.equal(percentile(sorted, 0.25), 0.4);
  assert.equal(percentile(sorted, 0.5), 0.7);
  assert.equal(percentile(sorted, 0.9), 0.9);
  assert.equal(percentile([], 0.5), null);
});

test('keepSubscription keeps canceled accounts only inside their period', () => {
  const now = new Date('2026-08-10T00:00:00Z');
  assert.equal(
    keepSubscription(
      { status: 'canceled', current_period_end: '2026-08-15T00:00:00Z' },
      now
    ),
    true
  );
  assert.equal(
    keepSubscription(
      { status: 'canceled', current_period_end: '2026-08-01T00:00:00Z' },
      now
    ),
    false
  );
  assert.equal(keepSubscription({ status: 'active' }, now), true);
});

test('isInternalUser flags smoke and test accounts', () => {
  assert.equal(isInternalUser({ email: 'cloudflare-ai-smoke-1@example.com' }), true);
  assert.equal(isInternalUser({ email: 'founder@webtomind.com' }), false);
  assert.equal(
    isInternalUser({ user_metadata: { source: 'cloudflare-ai-smoke' } }),
    true
  );
});

test('aggregateUtilization computes rates, distribution and buckets', () => {
  const result = aggregateUtilization({
    transactions,
    subscriptions,
    plans,
    windowStart: '2026-06-01T00:00:00Z',
    userLookup: {}
  });

  assert.equal(result.overall.users, 2);
  assert.equal(result.overall.userMonths, 4);
  assert.equal(result.overall.granted, 140000);
  assert.equal(result.overall.consumed, 47000);
  assert.equal(result.overall.utilization, 47000 / 140000);
  assert.equal(result.distribution.p50, 0.5);
  assert.equal(result.distribution.p100, 1);

  assert.equal(result.byPlan.pro.granted, 20000);
  assert.equal(result.byPlan.pro.utilization, 17000 / 20000);
  assert.equal(result.byPlan.max.granted, 120000);
  assert.equal(result.byPlan.max.utilization, 30000 / 120000);

  const june = result.monthlyTrend.find((row) => row.month === '2026-06');
  assert.equal(june.users, 1);
  assert.equal(june.utilization, 0.5);
  const july = result.monthlyTrend.find((row) => row.month === '2026-07');
  assert.equal(july.users, 2);
  assert.equal(july.utilization, 42000 / 70000);

  const u1June = result.userMonths.find(
    (row) => row.userId === 'u1' && row.month === '2026-06'
  );
  assert.equal(u1June.rate, 0.5);
  const u1July = result.userMonths.find(
    (row) => row.userId === 'u1' && row.month === '2026-07'
  );
  assert.equal(u1July.consumed, 12000);
  assert.equal(u1July.rate, 1); // capped
});

test('aggregateUtilization excludes internal users when requested', () => {
  const userLookup = {
    u1: { email: 'founder@webtomind.com' },
    u2: { email: 'cloudflare-ai-smoke-1@example.com' }
  };
  const result = aggregateUtilization({
    transactions,
    subscriptions,
    plans,
    windowStart: '2026-06-01T00:00:00Z',
    excludeInternal: true,
    userLookup
  });
  assert.equal(result.overall.users, 1);
  assert.equal(result.overall.granted, 20000);
});
