#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { verifyHostedOverlay } from './lib/hosted-overlay.mjs';
import { assessProductionDeploySource } from './lib/cloudflare-deploy-source.mjs';

function git(args) {
  return execFileSync('git', args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
}

function fail(message) {
  throw new Error(`Cloudflare deploy source check failed: ${message}`);
}

try {
  git(['fetch', '--quiet', 'origin', 'main']);
  let status = git(['status', '--porcelain=v1', '--untracked-files=all']);
  if (process.env.WEBTOMIND_HOSTED_OVERLAY_CONFIG) {
    const config = JSON.parse(process.env.WEBTOMIND_HOSTED_OVERLAY_CONFIG);
    verifyHostedOverlay(process.cwd(), config.sha256);
    status = ''; // Only authenticated overlay changes passed the verification above.
  }
  const branch = git(['branch', '--show-current']);
  const commit = git(['rev-parse', 'HEAD']);
  const mainCommit = git(['rev-parse', 'refs/remotes/origin/main']);
  let upstreamCommit = '';
  let upstreamName = '';
  if (branch) {
    try {
      upstreamCommit = git(['rev-parse', '@{upstream}']);
      upstreamName = git([
        'rev-parse',
        '--abbrev-ref',
        '--symbolic-full-name',
        '@{upstream}'
      ]);
    } catch {
      upstreamCommit = '';
      upstreamName = '';
    }
  }

  const assessment = assessProductionDeploySource({
    status: status ? status.split('\n') : [],
    branch,
    commit,
    mainCommit,
    upstreamCommit,
    upstreamName
  });
  if (!assessment.ok) fail(assessment.errors.join(' '));

  console.log(
    `PASS Cloudflare production source is exact: ${branch || 'detached'}@${commit.slice(0, 12)} matches origin/main; working tree is clean or contains only the verified hosted overlay.`
  );
} catch (error) {
  console.error(
    `FAIL ${error instanceof Error ? error.message : String(error)}`
  );
  process.exitCode = 1;
}
