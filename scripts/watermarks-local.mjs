#!/usr/bin/env node

import crypto from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const localEnvPath = path.join(root, '.env.local');
const serviceDir = path.join(root, 'infra', 'watermarks-remover');
const serviceEnvPath = path.join(serviceDir, '.env');
const composePath = path.join(serviceDir, 'compose.yaml');
const serviceUrl = 'http://127.0.0.1:8765';

function readFileOrEmpty(filePath) {
  return existsSync(filePath) ? readFileSync(filePath, 'utf8') : '';
}

function readEnvValue(contents, key) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = contents.match(new RegExp(`^${escapedKey}=(.*)$`, 'm'));
  return match?.[1]?.trim() || '';
}

function upsertEnvValue(contents, key, value) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${escapedKey}=.*$`, 'm');
  if (pattern.test(contents)) return contents.replace(pattern, line);
  const suffix = contents.endsWith('\n') || contents.length === 0 ? '' : '\n';
  return `${contents}${suffix}${line}\n`;
}

function ensureLocalConfiguration() {
  const existingLocalEnv = readFileOrEmpty(localEnvPath);
  const existingKey = readEnvValue(
    existingLocalEnv,
    'WATERMARKS_SERVICE_API_KEY'
  );
  const apiKey =
    existingKey || `local-${crypto.randomBytes(32).toString('hex')}`;

  let nextLocalEnv = existingLocalEnv;
  nextLocalEnv = upsertEnvValue(
    nextLocalEnv,
    'WATERMARKS_SERVICE_URL',
    serviceUrl
  );
  nextLocalEnv = upsertEnvValue(
    nextLocalEnv,
    'WATERMARKS_SERVICE_API_KEY',
    apiKey
  );
  writeFileSync(localEnvPath, nextLocalEnv, { mode: 0o600 });

  mkdirSync(serviceDir, { recursive: true });
  const existingServiceEnv = readFileOrEmpty(serviceEnvPath);
  const nextServiceEnv = upsertEnvValue(
    existingServiceEnv,
    'WATERMARKS_SERVICE_API_KEY',
    apiKey
  );
  writeFileSync(serviceEnvPath, nextServiceEnv, { mode: 0o600 });

  return { apiKey };
}

function runCompose(args) {
  const result = spawnSync(
    'docker',
    ['compose', '--env-file', serviceEnvPath, '-f', composePath, ...args],
    { cwd: root, stdio: 'inherit' }
  );
  if (result.error?.code === 'ENOENT') {
    console.error(
      'Docker is not installed or the Docker daemon is not running. Config was generated successfully.'
    );
    process.exitCode = 1;
  } else if (typeof result.status === 'number' && result.status !== 0) {
    process.exitCode = result.status;
  }
}

const command = process.argv[2] || 'setup';
if (command === 'setup') {
  ensureLocalConfiguration();
  console.log('Generated local watermarks-remover configuration.');
  console.log(`WATERMARKS_SERVICE_URL=${serviceUrl}`);
  console.log('WATERMARKS_SERVICE_API_KEY=<generated and stored locally>');
} else if (command === 'up') {
  ensureLocalConfiguration();
  runCompose(['up', '-d']);
} else if (command === 'down') {
  runCompose(['down']);
} else if (command === 'status') {
  runCompose(['ps']);
} else {
  console.error('Usage: pnpm watermarks:(setup|up|down|status)');
  process.exitCode = 1;
}
