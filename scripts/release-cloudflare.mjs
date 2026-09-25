#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import process from 'node:process';

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
// CI 已完成 build/deploy/validate/smoke 时使用：本地只做门禁确认 + 线上 smoke，
// 不再重复执行整条发布链（由 scripts/confirm-ci-deployed.mjs 校验 CI release job 成功）。
const ciDeployed = args.has('--ci-deployed');
const skipTypeCheck = args.has('--skip-type-check');
const skipDeploy = args.has('--skip-deploy');
const skipValidate = args.has('--skip-validate');
const skipSmoke = args.has('--skip-smoke');
const bypasses = [
  ['--skip-type-check', skipTypeCheck],
  ['--skip-deploy', skipDeploy],
  ['--skip-validate', skipValidate],
  ['--skip-smoke', skipSmoke]
].filter(([, enabled]) => enabled);

if (
  !dryRun &&
  bypasses.length > 0 &&
  process.env.BREAK_GLASS_PRODUCTION_RELEASE !== '1'
) {
  throw new Error(
    `Production release checks cannot be skipped: ${bypasses.map(([name]) => name).join(', ')}. Use BREAK_GLASS_PRODUCTION_RELEASE=1 only for an audited emergency.`
  );
}

function run(label, command, commandArgs, options = {}) {
  console.log(`\n==> ${label}`);
  console.log([command, ...commandArgs].join(' '));
  if (dryRun || options.skip) {
    console.log(options.skip ? 'skipped' : 'dry-run');
    return;
  }
  execFileSync(command, commandArgs, {
    stdio: 'inherit',
    env: process.env
  });
}

function capture(command, commandArgs) {
  return execFileSync(command, commandArgs, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
}

function currentCommit() {
  try {
    return capture('git', ['rev-parse', '--short=12', 'HEAD']);
  } catch {
    return 'unknown';
  }
}

function currentBranch() {
  try {
    return capture('git', ['branch', '--show-current']);
  } catch {
    return 'unknown';
  }
}

const commit = currentCommit();
const branch = currentBranch();

console.log(
  JSON.stringify(
    {
      release: 'cloudflare',
      branch,
      commit,
      dryRun,
      completionGate: [
        'strict secret scan',
        'type-check',
        'exact origin/main source',
        'successful GitHub CI for exact commit',
        'production image reliability + refund ledger gate',
        'production-parity build:web + release manifest',
        'release contract artifact check',
        'cf:deploy:routes:raw',
        'cf:validate:prod',
        'cache-busted manifest and asset hash smoke',
        ciDeployed
          ? 'CI release job confirmed + live smoke (fast mode)'
          : 'full local release chain'
      ]
    },
    null,
    2
  )
);

run('exact origin/main production source preflight', 'node', [
  'scripts/check-cloudflare-deploy-source.mjs'
]);
run('strict Git index secret scan', 'pnpm', [
  'security:tracked-secrets:strict'
]);
run('type-check', 'pnpm', ['type-check'], {
  skip: skipTypeCheck || ciDeployed
});
if (ciDeployed) {
  run('confirm CI deployed this exact commit', 'node', [
    'scripts/confirm-ci-deployed.mjs'
  ]);
} else {
  run('verify production image reliability', 'node', [
    'scripts/with-runtime-production-env.mjs',
    '--',
    'node',
    'scripts/image-generation-health-gate.mjs',
    '--days',
    '7'
  ]);
  run('build production-parity web assets', 'pnpm', ['build:web:prod-parity']);
  run('verify release contract artifacts', 'pnpm', ['release:contracts:build']);
  run('deploy Cloudflare production routes + assets', 'pnpm', ['cf:deploy:routes:raw'], {
    skip: skipDeploy
  });
  run('validate production', 'pnpm', ['cf:validate:prod:retry'], {
    skip: skipValidate
  });
}

if (!skipSmoke) {
  const baseUrl = process.env.CF_RELEASE_SMOKE_URL || 'https://webtomind.com';
  const url = new URL('/create', baseUrl);
  url.searchParams.set('deployCheck', commit);
  run('cache-busted live smoke', 'node', [
    ciDeployed
      ? 'scripts/check-ci-deployed-live.mjs'
      : 'scripts/check-cloudflare-live-asset.mjs',
    String(url)
  ]);
}

console.log(
  JSON.stringify(
    {
      done: true,
      branch,
      commit,
      userVisibleCheck: `https://webtomind.com/create?deployCheck=${commit}`
    },
    null,
    2
  )
);
