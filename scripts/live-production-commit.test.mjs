import assert from 'node:assert/strict';
import test from 'node:test';
import { assessLiveProductionCommit } from './lib/live-production-commit.mjs';

const sha = (character) => character.repeat(40);
const base = { candidate: sha('a'), live: sha('b') };

test('allows a forward deploy where live is an ancestor of the candidate', () => {
  const result = assessLiveProductionCommit({
    ...base,
    relation: 'live-before-candidate'
  });
  assert.equal(result.ok, true);
  assert.equal(result.errors.length, 0);
});

test('allows an idempotent redeploy of the exact live commit', () => {
  const result = assessLiveProductionCommit({
    ...base,
    candidate: sha('b'),
    live: sha('b'),
    relation: 'same'
  });
  assert.equal(result.ok, true);
});

test('rejects a candidate that is an ancestor of live production', () => {
  const result = assessLiveProductionCommit({
    ...base,
    relation: 'candidate-before-live'
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /silently revert live behavior/);
});

test('rejects divergent production and candidate histories', () => {
  const result = assessLiveProductionCommit({
    ...base,
    relation: 'diverged'
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /have diverged/);
});

test('warns but does not block when the live commit cannot be verified', () => {
  const result = assessLiveProductionCommit({
    ...base,
    live: '',
    relation: 'unknown'
  });
  assert.equal(result.ok, true);
  assert.match(result.warn, /could not be verified/);
});
