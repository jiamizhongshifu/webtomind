#!/usr/bin/env node

import { spawn } from 'node:child_process';
import process from 'node:process';

if (process.argv.includes('--help')) {
  console.log(`Starts the complete WebToMind app on a local Cloudflare Worker.

This is the functional local environment: real Supabase login, image APIs,
Moodboards and Sessions run through the same Worker as production.

Environment:
  WEBTOMIND_DEV_PORT  Local port (default: 4173)

Use "pnpm dev:web" only for unauthenticated UI work. Use "pnpm preview:auth"
only for visual audits; its fake session cannot call protected APIs.`);
  process.exit(0);
}

const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const port = process.env.WEBTOMIND_DEV_PORT?.trim() || '4173';
const children = [
  spawn(pnpmCommand, ['cf:dev:real-api', '--port', port], {
    stdio: 'inherit',
    env: process.env
  })
];
let stopping = false;

function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
  process.exitCode = exitCode;
}

for (const child of children) {
  child.once('error', (error) => {
    console.error('[dev:full] Failed to start a service:', error);
    stop(1);
  });
  child.once('exit', (code, signal) => {
    if (stopping) return;
    if (signal === 'SIGTERM' || signal === 'SIGINT') {
      stop(0);
      return;
    }
    console.error(
      `[dev:full] A service stopped unexpectedly (exit=${code ?? 'unknown'}).`
    );
    stop(code || 1);
  });
}

process.once('SIGINT', () => stop(0));
process.once('SIGTERM', () => stop(0));
