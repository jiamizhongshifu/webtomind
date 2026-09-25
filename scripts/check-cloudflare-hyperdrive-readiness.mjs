#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { applyCloudflareCredential } from './lib/cloudflare-credentials.mjs';

const root = process.cwd();
const wranglerConfig = path.join(root, 'workers/webtomind.wrangler.toml');
const directUrlEnvNames = [
  'HYPERDRIVE_DIRECT_CONNECTION_STRING',
  'SUPABASE_DIRECT_URL',
  'SUPABASE_DB_URL',
  'DATABASE_URL',
  'POSTGRES_URL',
  'POSTGRES_URL_NON_POOLING',
  'DIRECT_URL'
];
const poolerUrlEnvNames = [
  'SUPABASE_SESSION_POOLER_URL',
  'SUPABASE_POOLER_URL',
  'SUPAVISOR_SESSION_POOLER_URL',
  'SUPABASE_ADMIN_DATABASE_URL'
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

function mark(ok) {
  return ok ? 'PASS' : 'FAIL';
}

function readConfig() {
  if (!existsSync(wranglerConfig)) return '';
  return readFileSync(wranglerConfig, 'utf8');
}

function hasDirectConnectionString() {
  return directUrlEnvNames.find((name) => Boolean(process.env[name]));
}

function getDirectConnectionStringSource() {
  const directUrlEnv = hasDirectConnectionString();
  if (directUrlEnv) {
    return {
      name: directUrlEnv,
      value: process.env[directUrlEnv] || '',
      source: 'process.env'
    };
  }
  return readEnvValueFromFiles(directUrlEnvNames);
}

function getConnectionUser(connectionString) {
  try {
    return new URL(connectionString).username;
  } catch {
    return '';
  }
}

function isSupabasePoolerUrl(connectionString) {
  try {
    return new URL(connectionString).hostname
      .toLowerCase()
      .includes('.pooler.supabase.com');
  } catch {
    return false;
  }
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
      return {
        name,
        value: match[1].trim().replace(/^['"]|['"]$/g, ''),
        source: file
      };
    }
  }
  return null;
}

function getSupabaseUrlSource() {
  for (const name of supabaseUrlEnvNames) {
    if (process.env[name]) {
      return { name, value: process.env[name], source: 'process.env' };
    }
  }
  return readEnvValueFromFiles(supabaseUrlEnvNames);
}

function getDirectConnectionAvailability() {
  const directUrl = getDirectConnectionStringSource();
  if (directUrl) {
    if (isSupabasePoolerUrl(directUrl.value)) {
      return {
        ok: false,
        detail: `${directUrl.name} from ${directUrl.source} is a Supabase Pooler URL. Hyperdrive should use the Direct host db.<project-ref>.supabase.co, not Supavisor.`
      };
    }
    const user = getConnectionUser(directUrl.value);
    if (
      user === 'postgres' &&
      process.env.ALLOW_POSTGRES_HYPERDRIVE_BOOTSTRAP !== 'true'
    ) {
      return {
        ok: false,
        detail: `${directUrl.name} from ${directUrl.source} uses the postgres superuser. Use a least-privilege read-only role.`
      };
    }
    return {
      ok: true,
      detail: `${directUrl.name} is available from ${directUrl.source}${user ? ` for database user ${user}` : ''}.`
    };
  }

  const supabaseUrl = getSupabaseUrlSource();
  if (supabaseUrl && process.env.SUPABASE_DB_PASSWORD) {
    if (process.env.ALLOW_POSTGRES_HYPERDRIVE_BOOTSTRAP !== 'true') {
      return {
        ok: false,
        detail:
          'SUPABASE_DB_PASSWORD derives a postgres superuser URL. Use a least-privilege Direct URL for steady state.'
      };
    }
    return {
      ok: true,
      detail: `Can derive Supabase postgres bootstrap URL from ${supabaseUrl.name} and SUPABASE_DB_PASSWORD.`
    };
  }

  return {
    ok: false,
    detail: `Set one of: ${directUrlEnvNames.join(', ')}; or run pnpm cf:hyperdrive:readonly-role with a Supabase Session Pooler URL to generate one.`
  };
}

function getPoolerBootstrapAvailability() {
  for (const name of poolerUrlEnvNames) {
    const value = process.env[name];
    if (!value) continue;
    if (!isSupabasePoolerUrl(value)) {
      return {
        ok: false,
        detail: `${name} is set but does not look like a Supabase Session Pooler URL.`
      };
    }
    return {
      ok: true,
      detail: `${name} is available for local role bootstrap.`
    };
  }

  const fileValue = readEnvValueFromFiles(poolerUrlEnvNames);
  if (fileValue) {
    if (!isSupabasePoolerUrl(fileValue.value)) {
      return {
        ok: false,
        detail: `${fileValue.name} in ${fileValue.source} does not look like a Supabase Session Pooler URL.`
      };
    }
    return {
      ok: true,
      detail: `${fileValue.name} is available in ${fileValue.source}.`
    };
  }

  return {
    ok: false,
    detail:
      'Set SUPABASE_SESSION_POOLER_URL from Supabase Dashboard > Connect > Session Pooler if local Direct Postgres fails on IPv6.'
  };
}

function checkWranglerHyperdriveAccess() {
  function listHyperdriveWithEnv(env, authDetail) {
    execFileSync(
      'npx',
      [
        'wrangler',
        'hyperdrive',
        'list',
        '--config',
        'workers/webtomind.wrangler.toml'
      ],
      {
        cwd: root,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        encoding: 'utf8'
      }
    );
    return authDetail;
  }

  const hasToken = Boolean(process.env.CLOUDFLARE_API_TOKEN);
  const authDetail = hasToken
    ? 'the current token'
    : 'the current Wrangler OAuth session';

  try {
    const usedAuth = listHyperdriveWithEnv(process.env, authDetail);
    return {
      ok: true,
      detail: `Wrangler can list Hyperdrive configs with ${usedAuth}.`
    };
  } catch (error) {
    const stderr =
      error && typeof error === 'object' && 'stderr' in error
        ? String(error.stderr || '')
        : '';
    const isAuthError =
      stderr.includes('Authentication error') || stderr.includes('not logged in');

    if (hasToken && isAuthError) {
      const oauthEnv = { ...process.env };
      delete oauthEnv.CLOUDFLARE_API_TOKEN;
      try {
        const usedAuth = listHyperdriveWithEnv(
          oauthEnv,
          'the current Wrangler OAuth session'
        );
        return {
          ok: true,
          detail: `Wrangler can list Hyperdrive configs with ${usedAuth}; the current token was rejected.`
        };
      } catch {
        return {
          ok: false,
          detail:
            'Cloudflare API rejected the current token for Hyperdrive. Create or switch to a token with Account: Hyperdrive Read/Edit, or complete Wrangler OAuth login.'
        };
      }
    }

    const reason =
      isAuthError
        ? `Cloudflare API rejected ${authDetail} for Hyperdrive. Ensure Account: Hyperdrive Read/Edit is granted.`
        : 'Wrangler Hyperdrive list failed.';
    return { ok: false, detail: reason };
  }
}

loadEnvFiles();

const config = readConfig();
const directConnection = getDirectConnectionAvailability();
const poolerBootstrap = getPoolerBootstrapAvailability();
const hyperdriveAccess = checkWranglerHyperdriveAccess();
const checks = [
  {
    name: 'Wrangler config exists',
    ok: Boolean(config),
    detail: wranglerConfig
  },
  {
    name: 'Worker uses nodejs_compat',
    ok: /compatibility_flags\s*=\s*\[[^\]]*"nodejs_compat"/.test(config),
    detail: 'Required by node-postgres on Workers.'
  },
  {
    name: 'Public KV cache binding exists',
    ok: /binding\s*=\s*"WEBTOMIND_PUBLIC_CACHE"/.test(config),
    detail: 'Phase 1 public content cache binding.'
  },
  {
    name: 'Hyperdrive binding configured',
    ok: /binding\s*=\s*"HYPERDRIVE"/.test(config),
    detail: 'Expected after creating a Cloudflare Hyperdrive config.'
  },
  {
    name: 'Direct Postgres URL available',
    ok: directConnection.ok,
    detail: directConnection.detail
  },
  {
    name: 'Supabase pooler bootstrap URL available',
    ok: directConnection.ok || poolerBootstrap.ok,
    detail: directConnection.ok
      ? 'Not required because a least-privilege Direct URL is already available.'
      : poolerBootstrap.detail
  },
  {
    name: 'Cloudflare auth can access Hyperdrive',
    ok: hyperdriveAccess.ok,
    detail: hyperdriveAccess.detail
  }
];

for (const check of checks) {
  console.log(`${mark(check.ok)} ${check.name} - ${check.detail}`);
}

const failed = checks.filter((check) => !check.ok);
if (failed.length > 0) {
  console.log('');
  console.log(
    'Next: set SUPABASE_SESSION_POOLER_URL to bootstrap a read-only Direct URL, then use a Cloudflare token/OAuth session with Account: Hyperdrive Read/Edit and run pnpm cf:hyperdrive:create.'
  );
  process.exitCode = 1;
}
