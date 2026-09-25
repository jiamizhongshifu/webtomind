import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildAcquisitionBreakdown,
  buildConversionHealthSummary,
  buildDurableSourceFunnel,
  buildSourceFunnelSummary,
  mdTable
} from './supabase-conversion-report.mjs';

const EVENTS = [
  { event_name: 'pricing_view', cta_source: 'prompt_case' },
  { event_name: 'checkout_start', cta_source: 'prompt_case' },
  {
    event_name: 'generation_task_failed',
    cta_source: 'prompt_case',
    metadata: { failure_category: 'provider_timeout' }
  },
  {
    event_name: 'generation_task_failed',
    cta_source: 'prompt_case',
    metadata: { error_code: 'policy_rejected' }
  },
  {
    event_name: 'first_generation_succeeded',
    cta_source: 'prompt_case',
    user_id: 'user-1'
  },
  {
    event_name: 'post_purchase_generation_success',
    cta_source: 'prompt_case',
    order_id: 'order-1'
  },
  {
    event_name: 'post_purchase_generation_success',
    cta_source: 'prompt_case',
    order_id: 'order-1'
  }
];

test('summarizes generation, checkout expiry and activation-integrity warnings', () => {
  const summary = buildConversionHealthSummary(
    EVENTS,
    [
      { status: 'expired' },
      { status: 'pending' },
      { status: 'succeeded' }
    ],
    {
      generation_task_succeeded: 6,
      generation_task_failed: 2,
      first_generation_succeeded: 1,
      checkout_session_create_failed: 2,
      checkout_session_expired: 3,
      purchase_webhook_succeeded: 1,
      post_purchase_generation_success: 2
    }
  );

  assert.equal(summary.generation.succeeded, 6);
  assert.equal(summary.generation.failed, 2);
  assert.equal(summary.generation.successRate, 0.75);
  assert.equal(summary.generation.firstSucceededUsers, 1);
  assert.deepEqual(summary.generation.failureCategories, {
    provider_timeout: 1,
    policy_rejected: 1
  });
  assert.equal(summary.checkout.sessionCreateFailedEvents, 2);
  assert.equal(summary.checkout.expiredEvents, 3);
  assert.equal(summary.checkout.expiredOrders, 1);
  assert.equal(summary.checkout.failedOrders, 0);
  assert.equal(summary.activationIntegrity.activatedOrders, 2);
  assert.equal(summary.activationIntegrity.activatedOrdersInSample, 1);
  assert.equal(summary.activationIntegrity.activationEventsExceedPurchases, true);
  assert.match(summary.warnings.join(' '), /invariant is violated/);
});

test('builds a sampled durable source funnel with generation and expiry stages', () => {
  const rows = buildDurableSourceFunnel([
    ...EVENTS,
    {
      event_name: 'checkout_session_create_failed',
      cta_source: 'prompt_case'
    },
    { event_name: 'checkout_session_expired', cta_source: 'prompt_case' },
    { event_name: 'generation_task_succeeded', cta_source: 'prompt_case' },
    { event_name: 'unrelated_event', cta_source: 'prompt_case' }
  ]);

  assert.deepEqual(rows, [
    {
      ctaSource: 'prompt_case',
      pricingViews: 1,
      checkoutStarts: 1,
      checkoutSessionCreateFailures: 1,
      purchases: 0,
      checkoutExpired: 1,
      generationSucceeded: 1,
      generationFailed: 2,
      firstGenerationSucceeded: 1
    }
  ]);
});

test('warns when the daily view violates the activation-order invariant', () => {
  const rows = buildSourceFunnelSummary([
    {
      event_date: '2026-07-14',
      cta_source: 'pricing_page',
      pricing_views: 5,
      checkout_starts: 2,
      purchases: 1,
      post_purchase_generations: 4
    }
  ]);

  assert.equal(rows[0].warnings.length, 1);
  assert.match(rows[0].recommendedAction, /invariant violated/);
});

test('buildAcquisitionBreakdown groups orders by first-touch source', () => {
  const order = (id, status, acquisition) => ({
    id,
    status,
    product_type: 'subscription',
    product_id: 'pro',
    metadata: acquisition ? { checkout_attribution: { acquisition } } : {}
  });
  const rows = buildAcquisitionBreakdown([
    order('o1', 'succeeded', {
      refCode: 'PH20',
      utm: { utm_source: 'x' }
    }),
    order('o2', 'pending', { refCode: 'PH20' }),
    order('o3', 'succeeded', { externalReferrer: 'https://x.com/user' }),
    order('o4', 'succeeded', {})
  ]);
  const byKey = Object.fromEntries(rows.map((row) => [row.acquisitionKey, row]));
  assert.equal(byKey.PH20.orders, 2);
  assert.equal(byKey.PH20.purchased, 1);
  assert.equal(byKey.external_referrer.orders, 1);
  assert.equal(byKey.external_referrer.purchased, 1);
  assert.equal(byKey.unknown.orders, 1);
});

test('buildAcquisitionBreakdown prefers refCode over utm and click id', () => {
  const rows = buildAcquisitionBreakdown([
    {
      id: 'o1',
      status: 'succeeded',
      metadata: {
        checkout_attribution: {
          acquisition: {
            refCode: 'PH20',
            clickId: 'gclid-abc',
            utm: { utm_source: 'google' }
          }
        }
      }
    }
  ]);
  assert.equal(rows[0].acquisitionKey, 'PH20');
});

test('buildAcquisitionBreakdown returns an empty list for empty input', () => {
  assert.deepEqual(buildAcquisitionBreakdown([]), []);
  assert.deepEqual(buildAcquisitionBreakdown(null), []);
});

test('rejects malformed markdown table rows', () => {
  assert.match(mdTable(['A', 'B'], [['a', 'b']]), /\| A \| B \|/);
  assert.throws(
    () => mdTable(['A', 'B'], [['a']]),
    /expected 2/
  );
});
