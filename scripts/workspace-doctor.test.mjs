import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assessWorkspace,
  expectedPnpmVersion,
  satisfiesNodeEngine
} from './lib/workspace-doctor.mjs';

const base = {
  cwd: '/repo',
  root: '/repo',
  status: [],
  branch: 'codex/example',
  head: 'a'.repeat(40),
  originMain: 'a'.repeat(40),
  originUrl: 'git@github.com:example/repo.git',
  nodeVersion: 'v22.14.0',
  nodeEngine: '^20.19.0 || >=22.12.0',
  pnpmVersion: '8.15.0',
  packageManager: 'pnpm@8.15.0',
  cloudflareWorkersConfigured: true,
  aheadMain: 0,
  behindMain: 0
};

test('runtime version helpers follow package constraints', () => {
  assert.equal(satisfiesNodeEngine('v20.19.0', base.nodeEngine), true);
  assert.equal(satisfiesNodeEngine('v21.0.0', base.nodeEngine), false);
  assert.equal(satisfiesNodeEngine('v22.12.0', base.nodeEngine), true);
  assert.equal(expectedPnpmVersion('pnpm@8.15.0'), '8.15.0');
});

test('development mode blocks dirty or stale worktrees', () => {
  const report = assessWorkspace(
    { ...base, status: [' M src/example.ts'], behindMain: 2 },
    'development'
  );
  assert.equal(report.ok, false);
  assert.equal(
    report.checks.find((check) => check.name === 'Working tree is clean').ok,
    false
  );
  assert.equal(
    report.checks.find((check) => check.name === 'Development base is current')
      .ok,
    false
  );
});

test('development mode requires an isolated task branch', () => {
  const report = assessWorkspace({ ...base, branch: 'main' }, 'development');
  assert.equal(report.ok, false);
  assert.equal(
    report.checks.find(
      (check) => check.name === 'Development branch is isolated'
    ).ok,
    false
  );
});

test('sync mode requires clean main at origin/main', () => {
  const report = assessWorkspace({ ...base, branch: 'main' }, 'sync');
  assert.equal(report.ok, true);

  const taskBranch = assessWorkspace(base, 'sync');
  assert.equal(taskBranch.ok, false);
});

test('deploy mode accepts detached origin/main with workers credential', () => {
  const report = assessWorkspace({ ...base, branch: '' }, 'deploy');
  assert.equal(report.ok, true);

  const missingCredential = assessWorkspace(
    { ...base, branch: '', cloudflareWorkersConfigured: false },
    'deploy'
  );
  assert.equal(missingCredential.ok, false);
});
