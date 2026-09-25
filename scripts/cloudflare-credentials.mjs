#!/usr/bin/env node

import { spawn } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {
  CLOUDFLARE_CREDENTIAL_ROLES,
  cloudflareCredentialEnv,
  getCloudflareCredential,
  getCloudflareCredentialsPath,
  parseEnvText,
  readCloudflareCredentials
} from './lib/cloudflare-credentials.mjs';

const root = process.cwd();
const roles = Object.keys(CLOUDFLARE_CREDENTIAL_ROLES);
const command = process.argv[2] || 'status';
const args = process.argv.slice(3);
if (args[0] === '--') args.shift();
const defaultAccountId = String(
  process.env.WEBTOMIND_CLOUDFLARE_ACCOUNT_ID ||
    process.env.CLOUDFLARE_ACCOUNT_ID ||
    process.env.CF_ACCOUNT_ID ||
    ''
).trim();
const legacyFiles = {
  workers: path.join(process.env.HOME, '.config/webtomind/deploy.env'),
  ops: path.join(root, 'secrets/cloudflare-ops.env')
};

function usage() {
  console.log(`Cloudflare credential manager

Usage:
  pnpm cf:credentials:init
  pnpm cf:credentials:status
  pnpm cf:credentials:doctor [--require <role>]
  pnpm cf:credentials:set -- <role> --stdin
  pnpm cf:credentials:rotate -- <role> --stdin
  pnpm cf:credentials:exec -- <role> -- <command> [args...]

Roles: ${roles.join(', ')}

Credentials are stored only in:
  ${getCloudflareCredentialsPath()}`);
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function serialize(values) {
  return [
    '# WebToMind Cloudflare credentials. Never commit or print this file.',
    '# Use: pnpm cf:credentials:status',
    `WEBTOMIND_CLOUDFLARE_ACCOUNT_ID=${shellQuote(values.WEBTOMIND_CLOUDFLARE_ACCOUNT_ID || defaultAccountId)}`,
    ...roles.map((role) => {
      const name = CLOUDFLARE_CREDENTIAL_ROLES[role];
      return `${name}=${shellQuote(values[name] || '')}`;
    }),
    ''
  ].join('\n');
}

function writeCredentials(values) {
  const filePath = getCloudflareCredentialsPath();
  mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  writeFileSync(temporaryPath, serialize(values), { mode: 0o600 });
  chmodSync(temporaryPath, 0o600);
  renameSync(temporaryPath, filePath);
  chmodSync(filePath, 0o600);
  return filePath;
}

function readLegacyToken(filePath) {
  if (!existsSync(filePath)) return '';
  return String(
    parseEnvText(readFileSync(filePath, 'utf8')).CLOUDFLARE_API_TOKEN || ''
  ).trim();
}

function init() {
  const current = readCloudflareCredentials().values;
  const migrated = {
    ...current,
    WEBTOMIND_CLOUDFLARE_ACCOUNT_ID:
      current.WEBTOMIND_CLOUDFLARE_ACCOUNT_ID || defaultAccountId
  };
  for (const role of ['workers', 'ops']) {
    const name = CLOUDFLARE_CREDENTIAL_ROLES[role];
    migrated[name] = migrated[name] || readLegacyToken(legacyFiles[role]);
  }
  const filePath = writeCredentials(migrated);
  const reread = readCloudflareCredentials({ filePath });
  for (const role of ['workers', 'ops']) {
    const name = CLOUDFLARE_CREDENTIAL_ROLES[role];
    if (migrated[name] && reread.values[name] !== migrated[name]) {
      throw new Error(`Credential migration verification failed for role ${role}.`);
    }
  }
  if (!reread.values.WEBTOMIND_CLOUDFLARE_ACCOUNT_ID) {
    throw new Error(
      'Cloudflare account id is missing. Set WEBTOMIND_CLOUDFLARE_ACCOUNT_ID before initialization.'
    );
  }
  for (const legacyPath of Object.values(legacyFiles)) {
    if (existsSync(legacyPath)) rmSync(legacyPath);
  }
  console.log(`PASS canonical credential store initialized: ${filePath}`);
  console.log('PASS legacy credential files removed after read-back verification.');
  status();
}

function status() {
  const credentials = readCloudflareCredentials();
  console.log(`Credential store: ${credentials.filePath}`);
  if (!credentials.exists) {
    console.log('MISSING run `pnpm cf:credentials:init`.');
    process.exitCode = 1;
    return;
  }
  const mode = statSync(credentials.filePath).mode & 0o777;
  console.log(`${mode === 0o600 ? 'PASS' : 'FAIL'} file mode ${mode.toString(8)} (expected 600)`);
  for (const role of roles) {
    const credential = getCloudflareCredential(role);
    console.log(`${credential.configured ? 'CONFIGURED' : 'MISSING'} ${role}`);
  }
}

async function apiCheck(token, accountId, endpoint) {
  const url =
    endpoint === 'user/tokens/verify'
      ? `https://api.cloudflare.com/client/v4/${endpoint}`
      : `https://api.cloudflare.com/client/v4/accounts/${accountId}/${endpoint}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000)
  });
  const body = await response.json().catch(() => ({}));
  return {
    ok: response.ok && body.success !== false,
    status: response.status,
    detail:
      body.errors?.[0]?.message ||
      (response.ok ? 'permission granted' : 'permission denied')
  };
}

async function doctor() {
  const requiredIndex = args.indexOf('--require');
  const requiredRole = requiredIndex >= 0 ? args[requiredIndex + 1] : '';
  if (requiredRole && !roles.includes(requiredRole)) {
    throw new Error(`Unknown required role: ${requiredRole}.`);
  }
  const endpoints = {
    workers: 'workers/scripts',
    ops: 'hyperdrive/configs',
    'ai-gateway': 'ai-gateway/gateways?per_page=1',
    'ai-gateway-run': 'user/tokens/verify'
  };
  let failed = false;
  for (const role of roles) {
    const credential = getCloudflareCredential(role);
    if (!credential.configured) {
      const required = role === requiredRole;
      console.log(`${required ? 'FAIL' : 'MISSING'} ${role} - not configured`);
      failed ||= required;
      continue;
    }
    if (!credential.accountId) {
      console.log(`FAIL ${role} - account id is missing`);
      failed = true;
      continue;
    }
    const result = await apiCheck(
      credential.token,
      credential.accountId,
      endpoints[role]
    );
    console.log(
      `${result.ok ? 'PASS' : 'FAIL'} ${role} - HTTP ${result.status}, ${result.detail}`
    );
    failed ||= !result.ok;
  }
  if (failed) process.exitCode = 1;
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8').trim();
}

async function setCredential() {
  const role = args[0];
  if (!roles.includes(role)) throw new Error(`Unknown role: ${role || '<missing>'}.`);
  if (!args.includes('--stdin')) {
    throw new Error('Refusing token command-line arguments. Pass the token through stdin with --stdin.');
  }
  const token = await readStdin();
  if (!token) throw new Error('No token received on stdin.');
  const current = readCloudflareCredentials().values;
  current[CLOUDFLARE_CREDENTIAL_ROLES[role]] = token;
  const filePath = writeCredentials(current);
  console.log(`PASS updated role ${role} in ${filePath}.`);
}

async function rotateCredential() {
  const role = args[0];
  if (!roles.includes(role)) throw new Error(`Unknown role: ${role || '<missing>'}.`);
  if (!args.includes('--stdin')) {
    throw new Error('Refusing token command-line arguments. Pass the token through stdin with --stdin.');
  }
  const token = await readStdin();
  if (!token) throw new Error('No token received on stdin.');
  const current = readCloudflareCredentials().values;
  const accountId = String(
    current.WEBTOMIND_CLOUDFLARE_ACCOUNT_ID || defaultAccountId
  ).trim();
  const endpoints = {
    workers: 'workers/scripts',
    ops: 'hyperdrive/configs',
    'ai-gateway': 'ai-gateway/gateways?per_page=1',
    'ai-gateway-run': 'user/tokens/verify'
  };
  const candidate = await apiCheck(token, accountId, endpoints[role]);
  if (!candidate.ok) {
    throw new Error(
      `replacement token for ${role} failed validation: HTTP ${candidate.status}, ${candidate.detail}. Existing credential was not changed.`
    );
  }
  current[CLOUDFLARE_CREDENTIAL_ROLES[role]] = token;
  const filePath = writeCredentials(current);
  const stored = getCloudflareCredential(role);
  const verified = await apiCheck(stored.token, stored.accountId, endpoints[role]);
  if (!verified.ok) {
    throw new Error(`stored replacement token for ${role} failed read-back validation.`);
  }
  console.log(`PASS rotated and verified role ${role} in ${filePath}.`);
  console.log('ACTION revoke the previous token in Cloudflare now that its replacement is verified.');
}

async function execute() {
  const role = args[0];
  const separator = args.indexOf('--');
  if (!roles.includes(role) || separator < 0 || !args[separator + 1]) {
    throw new Error('Usage: exec <role> -- <command> [args...]');
  }
  const child = spawn(args[separator + 1], args.slice(separator + 2), {
    cwd: root,
    env: cloudflareCredentialEnv(role),
    stdio: 'inherit'
  });
  child.on('error', (error) => {
    console.error(`FAIL unable to start ${args[separator + 1]}: ${error.message}`);
    process.exitCode = 1;
  });
  child.on('exit', (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else process.exitCode = code ?? 1;
  });
}

try {
  if (command === 'init') init();
  else if (command === 'status') status();
  else if (command === 'doctor') await doctor();
  else if (command === 'set') await setCredential();
  else if (command === 'rotate') await rotateCredential();
  else if (command === 'exec') await execute();
  else if (command === '--help' || command === 'help') usage();
  else throw new Error(`Unknown command: ${command}.`);
} catch (error) {
  console.error(`FAIL ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
