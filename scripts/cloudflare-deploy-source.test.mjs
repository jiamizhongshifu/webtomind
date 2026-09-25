import assert from 'node:assert/strict';
import test from 'node:test';
import { assessProductionDeploySource } from './lib/cloudflare-deploy-source.mjs';

const sha = (character) => character.repeat(40);
const base = {
  status: [],
  branch: 'main',
  commit: sha('a'),
  mainCommit: sha('a'),
  upstreamCommit: sha('a'),
  upstreamName: 'origin/main'
};

test('accepts a clean main that exactly matches origin/main', () => {
  assert.deepEqual(assessProductionDeploySource(base), {
    ok: true,
    errors: []
  });
});

test('accepts a detached release checkout at the exact origin/main commit', () => {
  const result = assessProductionDeploySource({
    ...base,
    branch: '',
    upstreamCommit: '',
    upstreamName: ''
  });
  assert.equal(result.ok, true);
});

test('rejects a feature branch even when it points at origin/main', () => {
  const result = assessProductionDeploySource({
    ...base,
    branch: 'codex/example',
    upstreamName: 'origin/codex/example'
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /cannot deploy production/);
});

test('rejects a feature branch descendant of origin/main', () => {
  const result = assessProductionDeploySource({
    ...base,
    branch: 'codex/unmerged-release',
    commit: sha('b'),
    upstreamCommit: sha('b'),
    upstreamName: 'origin/codex/unmerged-release'
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /does not exactly match origin\/main/);
});

test('rejects stale main and dirty production sources', () => {
  const result = assessProductionDeploySource({
    ...base,
    status: [' M src/example.ts'],
    commit: sha('c'),
    upstreamCommit: sha('c')
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /working tree is dirty/);
  assert.match(result.errors.join('\n'), /does not exactly match origin\/main/);
});

test('rejects main tracking a non-production upstream', () => {
  const result = assessProductionDeploySource({
    ...base,
    upstreamName: 'origin/release'
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /main must track origin\/main/);
});
