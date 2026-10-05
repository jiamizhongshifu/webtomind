import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEPLOY_CHECKS, deployAfterChecks } from './lib/deploy-preflight.mjs';

for (const failedCheck of DEPLOY_CHECKS) {
  test(`never deploys after ${failedCheck.join(' ')} fails`, () => {
    let deployed = false;
    assert.throws(() =>
      deployAfterChecks(
        (args) => {
          if (args === failedCheck) throw new Error('check rejected');
        },
        () => {
          deployed = true;
        }
      )
    );
    assert.equal(deployed, false);
  });
}
test('runs the complete gate before deploying once', () => {
  const calls = [];
  deployAfterChecks(
    (args) => calls.push(args),
    () => calls.push('deploy')
  );
  assert.deepEqual(calls, [...DEPLOY_CHECKS, 'deploy']);
});
