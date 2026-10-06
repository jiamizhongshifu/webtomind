import { summarizeEnqueueEntitlements } from './lib/image-generation-observed-metrics.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeImageRefundLedger } from './lib/image-generation-observed-metrics.mjs';

function failedTask(id, refundedCredits = 0) {
  return {
    id,
    status: 'failed',
    refund_failed: false,
    request_payload: { prepaidCredit: { consumed: 60 } },
    result_payload: {
      diagnostics: { billing: { refundedCredits } }
    }
  };
}

test('uses credit transactions as refund truth when task diagnostics are stale', () => {
  const task = failedTask('task-ledger-refund');
  const result = summarizeImageRefundLedger(
    [task],
    [
      {
        amount: 60,
        metadata: { taskId: 'task-ledger-refund' }
      }
    ]
  );

  assert.equal(result.chargedFailures.length, 1);
  assert.equal(result.refundedChargedFailures.length, 1);
  assert.equal(result.diagnosticMismatches.length, 1);
});

test('does not accept a diagnostic refund without matching ledger credits', () => {
  const result = summarizeImageRefundLedger(
    [failedTask('task-missing-ledger', 60)],
    []
  );
  assert.equal(result.refundedChargedFailures.length, 0);
  assert.equal(result.diagnosticMismatches.length, 1);
});

test('supports partial refund rows that add up to the charged amount', () => {
  const result = summarizeImageRefundLedger(
    [failedTask('task-partial-refunds')],
    [
      { amount: 20, metadata: { taskId: 'task-partial-refunds' } },
      { amount: 40, metadata: { taskId: 'task-partial-refunds' } }
    ]
  );
  assert.equal(result.refundedChargedFailures.length, 1);
});

test('does not infer historical paid access from current membership or charged credits', () => {
  const result = summarizeEnqueueEntitlements(
    [
      {
        status: 'failed',
        request_payload: { prepaidCredit: { consumed: 100 } }
      },
      {
        status: 'failed',
        request_payload: { entitlementAtEnqueue: { paidAccess: true } }
      },
      {
        status: 'succeeded',
        request_payload: { entitlementAtEnqueue: { paidAccess: true } }
      },
      {
        status: 'succeeded',
        request_payload: { entitlementAtEnqueue: { paidAccess: false } }
      }
    ],
    2
  );
  assert.deepEqual(result, {
    basis: 'server_snapshot_at_enqueue',
    knownTasks: 3,
    unknownTasks: 1,
    paidTasks: 2,
    paidFailed: 1,
    paidFailureRate: 0.5
  });
});

import { summarizeImageFailureReasons } from './lib/image-generation-observed-metrics.mjs';
test('separates historical provider refusals and configuration errors without rewriting total failure rate', () => {
  const tasks = [
    { status: 'succeeded' },
    { status: 'failed', failure_category: 'provider_policy' },
    {
      status: 'failed',
      failure_category: 'provider_unavailable',
      error_message: '该提示可能违反了我们的内容政策'
    },
    {
      status: 'failed',
      failure_category: 'provider_http',
      error_message: 'Model has not been priced by the administrator'
    },
    { status: 'failed', failure_category: 'pipeline_deadline' },
    {
      status: 'failed',
      failure_category: 'unknown',
      request_payload: { prompt: 'policy test' }
    },
    { status: 'running' }
  ];
  const result = summarizeImageFailureReasons(tasks);
  assert.equal(result.total, 6);
  assert.equal(result.failed, 5);
  assert.equal(result.totalFailureRate, 0.8333);
  assert.equal(result.policyRefusals, 2);
  assert.equal(result.technicalFailures, 2);
  assert.equal(result.otherFailures, 1);
  assert.equal(result.technicalFailureRateAmongNonPolicyTasks, 0.5);
  assert.equal(result.historicalCategoryMismatchCount, 2);
  assert.equal(tasks[2].failure_category, 'provider_unavailable');
});
