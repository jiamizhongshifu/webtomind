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
