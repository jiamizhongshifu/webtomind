#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { applyCloudflareCredential } from './lib/cloudflare-credentials.mjs';

const root = process.cwd();
const wranglerConfig = 'workers/webtomind.wrangler.toml';
const directUrlEnvNames = [
  'HYPERDRIVE_DIRECT_CONNECTION_STRING',
  'SUPABASE_DIRECT_URL',
  'SUPABASE_DB_URL',
  'DATABASE_URL',
  'POSTGRES_URL',
  'POSTGRES_URL_NON_POOLING',
  'DIRECT_URL'
];
const supabaseUrlEnvNames = [
  'SUPABASE_URL',
  'VITE_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_URL'
];
const envFiles = [
  '.env.local',
  'server/.env',
  'secrets/hyperdrive-readonly.env',
  process.env.WEBTOMIND_ENV_FILE
].filter(Boolean);

applyCloudflareCredential('ops');

function loadEnvFiles() {
  for (const file of envFiles) {
    const filePath = path.isAbsolute(file) ? file : path.join(root, file);
    if (!existsSync(filePath)) continue;
    const text = readFileSync(filePath, 'utf8');
    for (const line of text.split(/\r?\n/u)) {
      const match = line.match(
        /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/u
      );
      if (!match) continue;
      if (file.includes('secrets/') || !process.env[match[1]]) {
        process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
      }
    }
  }
}

function runWrangler(args, options = {}) {
  const env = options.env || process.env;
  try {
    return execFileSync('npx', ['wrangler', ...args], {
      cwd: root,
      encoding: 'utf8',
      stdio: options.stdio || ['ignore', 'pipe', 'pipe'],
      env
    });
  } catch (error) {
    const stderr =
      error && typeof error === 'object' && 'stderr' in error
        ? String(error.stderr || '')
        : '';
    const isAuthError =
      stderr.includes('Authentication error') || stderr.includes('not logged in');
    if (env.CLOUDFLARE_API_TOKEN && isAuthError) {
      const oauthEnv = { ...env };
      delete oauthEnv.CLOUDFLARE_API_TOKEN;
      return runWrangler(args, { ...options, env: oauthEnv });
    }
    const message =
      stderr ||
      (error instanceof Error ? error.message : 'Wrangler command failed.');
    throw new Error(redactConnectionStrings(message));
  }
}

function redactConnectionStrings(value) {
  return String(value).replace(
    /\bpostgres(?:ql)?:\/\/[^\s"'`]+/giu,
    'postgresql://[redacted]'
  );
}

function readEnvValueFromFiles(names) {
  for (const file of envFiles) {
    const filePath = path.isAbsolute(file) ? file : path.join(root, file);
    if (!existsSync(filePath)) continue;
    const text = readFileSync(filePath, 'utf8');
    for (const name of names) {
      const match = text.match(
        new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=\\s*(.+)$`, 'm')
      );
      if (!match) continue;
      return match[1].trim().replace(/^['"]|['"]$/g, '');
    }
  }
  return null;
}

function getSupabaseUrl() {
  for (const name of supabaseUrlEnvNames) {
    if (process.env[name]) return process.env[name];
  }
  return readEnvValueFromFiles(supabaseUrlEnvNames);
}

function getConnectionString() {
  for (const name of directUrlEnvNames) {
    if (process.env[name]) {
      return { value: process.env[name], derived: false, source: name };
    }
  }
  const fileConnectionString = readEnvValueFromFiles(directUrlEnvNames);
  if (fileConnectionString) {
    return {
      value: fileConnectionString,
      derived: false,
      source: 'env file'
    };
  }

  const supabaseUrl = getSupabaseUrl();
  const password = process.env.SUPABASE_DB_PASSWORD;
  if (!supabaseUrl || !password) return null;

  if (process.env.ALLOW_POSTGRES_HYPERDRIVE_BOOTSTRAP !== 'true') {
    throw new Error(
      'Refusing to create Hyperdrive from the postgres superuser. Create a least-privilege read-only database role and pass its Direct URL via HYPERDRIVE_DIRECT_CONNECTION_STRING. Set ALLOW_POSTGRES_HYPERDRIVE_BOOTSTRAP=true only for one-time local bootstrap.'
    );
  }

  const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
  return {
    value: `postgresql://postgres:${encodeURIComponent(password)}@db.${projectRef}.supabase.co:5432/postgres?sslmode=verify-full`,
    derived: true,
    source: 'SUPABASE_DB_PASSWORD'
  };
}

function validateHyperdriveOrigin(connectionString) {
  let parsed;
  try {
    parsed = new URL(connectionString);
  } catch {
    throw new Error('Hyperdrive connection string is not a valid URL.');
  }

  const hostname = parsed.hostname.toLowerCase();
  if (
    hostname.includes('.pooler.supabase.com') &&
    process.env.ALLOW_HYPERDRIVE_POOLER_ORIGIN !== 'true'
  ) {
    throw new Error(
      'Refusing to use a Supabase Pooler URL as the Hyperdrive origin. Hyperdrive should point at the Direct Postgres host (db.<project-ref>.supabase.co). Use the Pooler only for local bootstrap scripts, or set ALLOW_HYPERDRIVE_POOLER_ORIGIN=true for a temporary override.'
    );
  }

  if (
    parsed.username === 'postgres' &&
    process.env.ALLOW_POSTGRES_HYPERDRIVE_BOOTSTRAP !== 'true'
  ) {
    throw new Error(
      'Refusing to configure Hyperdrive with the postgres superuser. Create a least-privilege role and pass its Direct URL via HYPERDRIVE_DIRECT_CONNECTION_STRING.'
    );
  }
}

const configPath = path.join(root, wranglerConfig);
if (!existsSync(configPath)) {
  console.error(`Missing Wrangler config: ${wranglerConfig}`);
  process.exit(1);
}

const name = process.env.HYPERDRIVE_NAME || 'webtomind-supabase';

function getConfiguredHyperdriveId() {
  const current = readFileSync(configPath, 'utf8');
  const block = current.match(
    /\[\[hyperdrive\]\][\s\S]*?binding\s*=\s*"HYPERDRIVE"[\s\S]*?id\s*=\s*"([a-f0-9]{32})"/i
  );
  return block?.[1] || null;
}

function parseHyperdriveIdForName(output, configName) {
  const lines = output.split(/\r?\n/u);
  for (const line of lines) {
    if (!line.includes(configName)) continue;
    const match = line.match(/\b[a-f0-9]{32}\b/i);
    if (match) return match[0];
  }
  return null;
}

function parseCreatedHyperdriveId(output) {
  const match = output.match(/\b[a-f0-9]{32}\b/i);
  return match?.[0] || null;
}

function ensureHyperdriveBinding(id) {
  const current = readFileSync(configPath, 'utf8');
  if (/binding\s*=\s*"HYPERDRIVE"/.test(current)) {
    if (current.includes(id)) return;
    throw new Error(
      'Wrangler config already contains a HYPERDRIVE binding with a different id.'
    );
  }

  const snippet = `\n[[hyperdrive]]\nbinding = "HYPERDRIVE"\nid = "${id}"\n`;
  if (current.includes('[[kv_namespaces]]')) {
    const updated = current.replace(
      /(\[\[kv_namespaces\]\][\s\S]*?id\s*=\s*"[^"]+"\n)/,
      `$1${snippet}`
    );
    if (updated !== current) {
      writeFileSync(configPath, updated);
      return;
    }
  }

  writeFileSync(configPath, `${current.trimEnd()}\n${snippet}\n`);
}

loadEnvFiles();

try {
  let hyperdriveId = getConfiguredHyperdriveId();
  try {
    const listOutput = runWrangler([
      'hyperdrive',
      'list',
      '--config',
      wranglerConfig
    ]);
    hyperdriveId = parseHyperdriveIdForName(listOutput, name) || hyperdriveId;
  } catch {
    // Let the create call below surface the actionable auth or API error.
  }

  if (!hyperdriveId) {
    const connectionString = getConnectionString();
    if (!connectionString?.value) {
      throw new Error(
        'Missing Hyperdrive connection string. Set a least-privilege Direct Postgres URL env var such as HYPERDRIVE_DIRECT_CONNECTION_STRING.'
      );
    }
    validateHyperdriveOrigin(connectionString.value);
    console.warn(
      'Creating Hyperdrive passes the database connection string to Wrangler as a process argument. Run this only from a trusted local machine.'
    );
    if (connectionString.derived) {
      console.warn(
        'Using the postgres superuser is allowed only because ALLOW_POSTGRES_HYPERDRIVE_BOOTSTRAP=true is set.'
      );
    }
    const createOutput = runWrangler(
      [
        'hyperdrive',
        'create',
        name,
        '--connection-string',
        connectionString.value,
        '--binding',
        'HYPERDRIVE',
        '--update-config',
        '--config',
        wranglerConfig
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );
    process.stdout.write(createOutput);
    hyperdriveId = parseCreatedHyperdriveId(createOutput);
  } else if (process.env.HYPERDRIVE_UPDATE_EXISTING === 'true') {
    const connectionString = getConnectionString();
    if (!connectionString?.value) {
      throw new Error(
        'HYPERDRIVE_UPDATE_EXISTING=true requires a least-privilege Direct Postgres URL env var such as HYPERDRIVE_DIRECT_CONNECTION_STRING.'
      );
    }
    validateHyperdriveOrigin(connectionString.value);
    console.warn(
      'Updating Hyperdrive passes the database connection string to Wrangler as a process argument. Run this only from a trusted local machine.'
    );
    const updateOutput = runWrangler(
      [
        'hyperdrive',
        'update',
        hyperdriveId,
        '--connection-string',
        connectionString.value,
        '--config',
        wranglerConfig
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );
    process.stdout.write(updateOutput);
  }

  if (!hyperdriveId) {
    throw new Error(
      'Unable to determine Hyperdrive config id from Wrangler output.'
    );
  }

  ensureHyperdriveBinding(hyperdriveId);
  console.log(`Hyperdrive binding ready: HYPERDRIVE (${hyperdriveId})`);
} catch (error) {
  console.error('');
  if (error instanceof Error && error.message) {
    console.error(redactConnectionStrings(error.message));
  }
  console.error(
    'Hyperdrive creation failed. If this is an Authentication error, refresh Cloudflare auth with a token/OAuth session that has Workers write access to Hyperdrive.'
  );
  process.exit(typeof error.status === 'number' ? error.status : 1);
}
