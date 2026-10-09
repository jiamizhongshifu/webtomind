import assert from 'node:assert/strict';
import test from 'node:test';
import { assessReleaseCiRuns } from './lib/github-release-ci.mjs';

const commit = 'a'.repeat(40);

test('accepts a successful CI run for the exact release commit', () => {
  const result = assessReleaseCiRuns(commit, [
    {
      headSha: commit,
      status: 'completed',
      conclusion: 'success',
      url: 'https://example.test/run/1'
    }
  ]);
  assert.equal(result.ok, true);
});

test('rejects a successful run from a different commit', () => {
  const result = assessReleaseCiRuns(commit, [
    {
      headSha: 'b'.repeat(40),
      status: 'completed',
      conclusion: 'success'
    }
  ]);
  assert.equal(result.ok, false);
  assert.match(result.reason, /no CI run exists/);
});

test('rejects pending and failed runs', () => {
  const result = assessReleaseCiRuns(commit, [
    { headSha: commit, status: 'in_progress', conclusion: '' },
    { headSha: commit, status: 'completed', conclusion: 'failure' }
  ]);
  assert.equal(result.ok, false);
  assert.match(result.reason, /has not passed/);
});

test('accepts the exact-commit check job independently of a failed release', () => {
  assert.equal(
    assessReleaseCiRuns(commit, [
      {
        headSha: commit,
        status: 'completed',
        conclusion: 'failure',
        jobs: [
          { name: 'check', status: 'completed', conclusion: 'success' },
          { name: 'release', status: 'completed', conclusion: 'failure' }
        ]
      }
    ]).ok,
    true
  );
});
test('does not accept skipped, pending, failed, wrong-name or wrong-commit quality jobs', () => {
  for (const job of [
    { name: 'check', status: 'completed', conclusion: 'skipped' },
    { name: 'check', status: 'in_progress', conclusion: null },
    { name: 'check', status: 'completed', conclusion: 'failure' },
    { name: 'release', status: 'completed', conclusion: 'success' }
  ])
    assert.equal(
      assessReleaseCiRuns(commit, [
        { headSha: commit, conclusion: 'failure', jobs: [job] }
      ]).ok,
      false
    );
  assert.equal(
    assessReleaseCiRuns(commit, [
      {
        headSha: 'b'.repeat(40),
        jobs: [{ name: 'check', status: 'completed', conclusion: 'success' }]
      }
    ]).ok,
    false
  );
});
