#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { assessReleaseCiRuns } from './lib/github-release-ci.mjs';

function capture(command, args) {
  return execFileSync(command, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
}

const ciCheckDelegatedToWorkflow =
  process.env.GITHUB_ACTIONS === 'true' &&
  process.env.CF_DEPLOY_CI_CHECK_SKIP === '1';

const qualityGateVerified =
  process.env.WEBTOMIND_LOCAL_QUALITY_GATE_VERIFIED === '1';

if (qualityGateVerified && !ciCheckDelegatedToWorkflow) {
  // Local emergency deploys may need to proceed when GitHub refuses to start
  // runners due to a billing outage. The caller must verify via the GitHub API
  // that the `check` quality-gate job itself passed for this exact commit and
  // record the evidence before setting this flag. The `release` job never
  // gates code quality; it only deploys a `check`-passing commit.
  console.log(
    'PASS GitHub CI quality gate verified out-of-band via GitHub API (WEBTOMIND_LOCAL_QUALITY_GATE_VERIFIED=1).'
  );
  process.exit(0);
}

if (ciCheckDelegatedToWorkflow) {
  // In GitHub Actions the release job already depends on the completed
  // check job, so querying the in-progress CI run for the same commit would
  // always fail. The workflow dependency is the guarantee here.
  console.log(
    'PASS GitHub CI verification delegated to workflow job dependency (CF_DEPLOY_CI_CHECK_SKIP=1).'
  );
  process.exit(0);
}

try {
  const commit = capture('git', ['rev-parse', 'HEAD']);
  const runs = JSON.parse(
    capture('gh', [
      'run',
      'list',
      '--workflow',
      'CI',
      '--commit',
      commit,
      '--limit',
      '10',
      '--json',
      'databaseId,status,conclusion,headSha,url,createdAt'
    ]) || '[]'
  );
  const result = assessReleaseCiRuns(commit, runs);
  if (!result.ok) throw new Error(result.reason);
  console.log(
    `PASS GitHub CI succeeded for ${commit.slice(0, 12)}: ${result.run.url || result.run.databaseId}.`
  );
} catch (error) {
  console.error(
    `FAIL GitHub release CI check failed: ${error instanceof Error ? error.message : String(error)}`
  );
  process.exitCode = 1;
}
