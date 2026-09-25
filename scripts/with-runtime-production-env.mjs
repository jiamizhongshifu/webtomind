#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import process from 'node:process';
import { config as loadEnv } from 'dotenv';
import { getRuntimeProductionEnvPath } from './lib/runtime-production-env.mjs';
import { assertCreateWorkspaceProductionRollout } from './lib/create-workspace-rollout.mjs';
import { assertWatermarksRuntimeEnv } from './lib/watermarks-runtime.mjs';

const args = process.argv.slice(2);
const requireWatermarks = args[0] === '--require-watermarks';
if (requireWatermarks) args.shift();
if (args[0] === '--') args.shift();
if (!args[0])
  throw new Error('Usage: with-runtime-production-env -- <command> [args...]');

const envFile = getRuntimeProductionEnvPath();
if (existsSync(envFile)) {
  const loaded = loadEnv({ path: envFile, override: false, quiet: true });
  if (loaded.error) throw loaded.error;
  console.log(`PASS loaded production runtime environment from ${envFile}.`);
} else {
  console.log(
    `INFO runtime environment file ${envFile} is absent; using the existing process environment.`
  );
}

assertCreateWorkspaceProductionRollout(process.env.VITE_CREATE_WORKSPACE_FLAGS);
console.log('PASS production create workspace rollout flags are complete.');
if (requireWatermarks) {
  const { url } = assertWatermarksRuntimeEnv(process.env, { production: true });
  console.log(`PASS AI marks production runtime is configured: ${url}`);
}

const child = spawn(args[0], args.slice(1), {
  cwd: process.cwd(),
  env: process.env,
  stdio: 'inherit'
});
child.on('error', (error) => {
  console.error(`FAIL unable to start ${args[0]}: ${error.message}`);
  process.exitCode = 1;
});
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
