#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { getCloudflareCredential } from './lib/cloudflare-credentials.mjs';
import { assessWorkspace, WORKSPACE_MODES } from './lib/workspace-doctor.mjs';

const args = process.argv.slice(2);
const modeArg = args.find((arg) => arg.startsWith('--mode='));
const mode = modeArg?.slice('--mode='.length) || 'development';
const fetchOrigin = args.includes('--fetch');
const json = args.includes('--json');
const verifyCloudflare = args.includes('--verify-cloudflare');

if (!WORKSPACE_MODES.has(mode)) {
  console.error(`FAIL unknown mode ${mode}. Use development, sync, or deploy.`);
  process.exit(2);
}

function git(commandArgs, options = {}) {
  return execFileSync('git', commandArgs, {
    cwd: options.cwd || process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
}

function command(commandName, commandArgs = []) {
  return execFileSync(commandName, commandArgs, {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
}

function parseAheadBehind(value) {
  const [ahead = '0', behind = '0'] = value.trim().split(/\s+/);
  return { aheadMain: Number(ahead), behindMain: Number(behind) };
}

async function verifyWorkersCredential(credential) {
  if (!credential.configured || !credential.accountId) {
    return { ok: false, detail: 'workers credential or account id is missing' };
  }
  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${credential.accountId}/workers/scripts`,
      {
        headers: { Authorization: `Bearer ${credential.token}` },
        signal: AbortSignal.timeout(15_000)
      }
    );
    const body = await response.json().catch(() => ({}));
    return {
      ok: response.ok && body.success !== false,
      detail:
        body.errors?.[0]?.message ||
        `HTTP ${response.status} ${response.ok ? 'permission granted' : 'permission denied'}`
    };
  } catch (error) {
    return {
      ok: false,
      detail: error instanceof Error ? error.message : String(error)
    };
  }
}

try {
  const root = git(['rev-parse', '--show-toplevel']);
  if (fetchOrigin) {
    execFileSync('git', ['fetch', '--prune', 'origin'], {
      cwd: root,
      stdio: json ? 'ignore' : 'inherit'
    });
  }

  const packageJson = JSON.parse(
    readFileSync(path.join(root, 'package.json'), 'utf8')
  );
  const head = git(['rev-parse', 'HEAD'], { cwd: root });
  const originMain = git(['rev-parse', 'refs/remotes/origin/main'], {
    cwd: root
  });
  const divergence = parseAheadBehind(
    git(
      [
        'rev-list',
        '--left-right',
        '--count',
        'HEAD...refs/remotes/origin/main'
      ],
      {
        cwd: root
      }
    )
  );
  const statusText = git(
    ['status', '--porcelain=v1', '--untracked-files=all'],
    { cwd: root }
  );
  const workersCredential = getCloudflareCredential('workers');
  const snapshot = {
    cwd: process.cwd(),
    root,
    status: statusText ? statusText.split('\n') : [],
    branch: git(['branch', '--show-current'], { cwd: root }),
    head,
    originMain,
    originUrl: git(['remote', 'get-url', 'origin'], { cwd: root }),
    nodeVersion: process.version,
    nodeEngine: packageJson.engines?.node || '',
    pnpmVersion: command('pnpm', ['--version']),
    packageManager: packageJson.packageManager || '',
    cloudflareWorkersConfigured: workersCredential.configured,
    ...divergence
  };
  const report = assessWorkspace(snapshot, mode);

  let cloudflareVerification = null;
  if (mode === 'deploy' && verifyCloudflare && report.ok) {
    cloudflareVerification = await verifyWorkersCredential(workersCredential);
    report.ok &&= cloudflareVerification.ok;
  }

  if (json) {
    console.log(JSON.stringify({ ...report, cloudflareVerification }, null, 2));
  } else {
    console.log(`WebToMind workspace doctor (${mode})`);
    console.log(
      `branch=${report.summary.branch} head=${head.slice(0, 12)} origin/main=${originMain.slice(0, 12)}`
    );
    for (const check of report.checks) {
      console.log(
        `${check.ok ? 'PASS' : 'FAIL'} ${check.name} - ${check.detail}`
      );
      if (!check.ok && check.remediation)
        console.log(`  NEXT ${check.remediation}`);
    }
    if (cloudflareVerification) {
      console.log(
        `${cloudflareVerification.ok ? 'PASS' : 'FAIL'} Cloudflare Workers credential API verification - ${cloudflareVerification.detail}`
      );
    }
    console.log(
      report.ok
        ? 'READY workspace checks passed.'
        : 'BLOCKED fix failed checks before continuing.'
    );
  }

  if (!report.ok) process.exitCode = 1;
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (json) console.log(JSON.stringify({ ok: false, error: message }, null, 2));
  else console.error(`FAIL workspace doctor could not complete: ${message}`);
  process.exitCode = 1;
}
