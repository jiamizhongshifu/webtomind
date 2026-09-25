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
