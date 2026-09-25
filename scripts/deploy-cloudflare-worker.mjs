#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process';
import process from 'node:process';
import { readLocalReleaseManifest } from './lib/release-integrity.mjs';

execFileSync(process.execPath, ['scripts/check-cloudflare-deploy-source.mjs'], {
  cwd: process.cwd(),
  env: process.env,
  stdio: 'inherit'
});
execFileSync(process.execPath, ['scripts/check-github-release-ci.mjs'], {
  cwd: process.cwd(),
  env: process.env,
  stdio: 'inherit'
});
execFileSync(process.execPath, ['scripts/check-release-contracts.mjs', '--build'], {
  cwd: process.cwd(),
  env: process.env,
  stdio: 'inherit'
});
execFileSync(
  process.execPath,
  ['scripts/check-release-contracts.mjs', '--continuity', 'https://webtomind.com'],
  {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit'
  }
);
const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: process.cwd(),
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe']
}).trim();
const manifest = readLocalReleaseManifest(process.cwd());
const args = [
  'scripts/cloudflare-credentials.mjs',
  'exec',
  'workers',
  '--',
  'npx',
  'wrangler',
  'deploy',
  '--config',
  'workers/webtomind.wrangler.toml',
  '--message',
  `git:${commit} contracts:${manifest.contractHash.slice(0, 12)}`,
  ...process.argv.slice(2)
];
const result = spawnSync(process.execPath, args, {
  cwd: process.cwd(),
  env: process.env,
  stdio: 'inherit'
});

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
