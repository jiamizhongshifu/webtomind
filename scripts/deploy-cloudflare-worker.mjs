#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process';
import process from 'node:process';
import { readLocalReleaseManifest } from './lib/release-integrity.mjs';

import { deployAfterChecks } from './lib/deploy-preflight.mjs';

deployAfterChecks(
  (args) => {
    execFileSync(process.execPath, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: 'inherit'
    });
  },
  () => {
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
  }
);
