import assert from 'node:assert/strict';
import test from 'node:test';
import {
  evaluateImageGenerationHealth,
  getImageGenerationHealthPolicy
} from './lib/image-generation-health-policy.mjs';

function healthyReport(overrides = {}) {
  return {
    ok: true,
    status: 'observed',
    failureRate: 0.1,
    chargedFailures: 3,
    refundedChargedFailures: 3,
    failureRefundCompliance: 1,
    attempts: { byRoute: [] },
    enqueueEntitlements: { paidFailureRate: 0 },
    ...overrides
  };
}

test('blocks catastrophic failure rates', () => {
  const result = evaluateImageGenerationHealth(
    healthyReport({ failureRate: 0.61 })
  );
  assert.equal(result.ok, false);
  assert.equal(
    result.blockers[0].class,
    'image_failure_rate_above_release_ceiling'
  );
});

test('warns between the reliability target and transitional ceiling', () => {
  const result = evaluateImageGenerationHealth(
    healthyReport({ failureRate: 0.4 }),
    { maxFailureRate: 0.6 }
  );
  assert.equal(result.ok, true);
  assert.equal(result.warnings[0].class, 'image_failure_rate_above_target');
});

test('requires every charged failure to have a refund ledger fact', () => {
  const result = evaluateImageGenerationHealth(
    healthyReport({
      refundedChargedFailures: 2,
      failureRefundCompliance: 2 / 3
    })
  );
  assert.equal(result.ok, false);
  assert.equal(result.blockers[0].class, 'image_refund_ledger_incomplete');
});

test('reports low-success routes as warnings without blocking the repair release', () => {
  const result = evaluateImageGenerationHealth(
    healthyReport({
      attempts: {
        byRoute: [
          {
            key: 'openai|gpt-image-2|openai-compatible',
            total: 20,
            succeeded: 0,
            successRate: 0
          }
        ]
      }
    })
  );
  assert.equal(result.ok, true);
  assert.equal(result.warnings[0].class, 'image_provider_route_below_target');
});

test('does not invent a failed route when success rate is unavailable', () => {
  const result = evaluateImageGenerationHealth(
    healthyReport({
      attempts: {
        byRoute: [
          {
            key: 'unknown|unknown|unknown',
            total: 20,
            succeeded: 0,
            successRate: null
          }
        ]
      }
    })
  );
  assert.equal(result.ok, true);
  assert.deepEqual(result.warnings, []);
});

test('normalizes configurable health policy bounds', () => {
  assert.deepEqual(
    getImageGenerationHealthPolicy({
      IMAGE_HEALTH_MAX_FAILURE_RATE: '0.7',
      IMAGE_HEALTH_TARGET_FAILURE_RATE: '0.25',
      IMAGE_HEALTH_ROUTE_WARNING_MIN_ATTEMPTS: '15',
      IMAGE_HEALTH_ROUTE_WARNING_MIN_SUCCESS_RATE: '0.6'
    }),
    {
      maxFailureRate: 0.7,
      targetFailureRate: 0.25,
      routeWarningMinAttempts: 15,
      routeWarningMinSuccessRate: 0.6
    }
  );
});

test('blocks the observed 32.9 percent failures against the 90 percent success target', () => {
  assert.equal(
    evaluateImageGenerationHealth(healthyReport({ failureRate: 27 / 82 })).ok,
    false
  );
});
test('does not certify unavailable observations', () => {
  assert.equal(
    evaluateImageGenerationHealth(healthyReport({ failureRate: null })).ok,
    false
  );
});

test('uses task-time paid cohort to enforce the 95 percent paid success target', () => {
  const result = evaluateImageGenerationHealth(
    healthyReport({ enqueueEntitlements: { paidFailureRate: 0.1 } })
  );
  assert.equal(result.ok, false);
  assert.equal(
    result.blockers[0].class,
    'paid_image_failure_rate_above_target'
  );
});
test('labels missing paid snapshots as unverified instead of inventing success', () => {
  const result = evaluateImageGenerationHealth(
    healthyReport({ enqueueEntitlements: { paidFailureRate: null } })
  );
  assert.equal(result.warnings[0].class, 'paid_image_reliability_unverified');
});
