#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import process from 'node:process';
import pg from 'pg';
import { applyCloudflareCredential } from './lib/cloudflare-credentials.mjs';

const { Client } = pg;
const root = process.cwd();
const envFiles = [
  '.env.local',
  'server/.env',
  'secrets/hyperdrive-readonly.env',
  process.env.WEBTOMIND_ENV_FILE
].filter(Boolean);

applyCloudflareCredential('ops');
const adminDatabaseUrlEnvNames = [
  'SUPABASE_SESSION_POOLER_URL',
  'SUPABASE_POOLER_URL',
  'SUPAVISOR_SESSION_POOLER_URL',
  'SUPABASE_ADMIN_DATABASE_URL',
  'DATABASE_URL',
  'POSTGRES_URL'
];
const supabaseUrlEnvNames = [
  'SUPABASE_URL',
  'VITE_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_URL'
];
const defaultOutputFile = '/tmp/webtomind-hyperdrive-readonly.env';

function loadEnvFiles() {
  for (const file of envFiles) {
    const filePath = path.isAbsolute(file) ? file : path.join(root, file);
    if (!existsSync(filePath)) continue;
    const text = readFileSync(filePath, 'utf8');
    for (const line of text.split(/\r?\n/u)) {
      const match = line.match(
        /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/u
      );
      if (!match || process.env[match[1]]) continue;
      process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
    }
  }
}

function getEnv(names) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return { name, value };
  }
  return null;
}

function normalizePgConnectionString(connectionString) {
  const url = new URL(connectionString);
  if (url.hostname.toLowerCase().includes('.pooler.supabase.com')) {
    if (!url.searchParams.has('sslmode')) {
      url.searchParams.set('sslmode', 'require');
    }
    if (!url.searchParams.has('uselibpqcompat')) {
      url.searchParams.set('uselibpqcompat', 'true');
    }
  }
  return url.toString();
}

function quoteIdent(identifier) {
  if (!/^[a-z_][a-z0-9_]{0,62}$/u.test(identifier)) {
    throw new Error(
      'HYPERDRIVE_READONLY_ROLE must be a lowercase Postgres identifier up to 63 chars.'
    );
  }
  return `"${identifier.replaceAll('"', '""')}"`;
}

function quoteLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function generatePassword() {
  return randomBytes(30).toString('base64url');
}

function getProjectRef() {
  const supabaseUrl = getEnv(supabaseUrlEnvNames);
  if (supabaseUrl) {
    return new URL(supabaseUrl.value).hostname.split('.')[0];
  }

  const explicitProjectRef = process.env.SUPABASE_PROJECT_REF?.trim();
  if (explicitProjectRef) return explicitProjectRef;

  throw new Error(
    'Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_PROJECT_REF; cannot derive the Direct Postgres host.'
  );
}

function buildReadonlyDirectUrl({ projectRef, role, password }) {
  const url = new URL(`postgresql://db.${projectRef}.supabase.co/postgres`);
  url.username = role;
  url.password = password;
  url.port = '5432';
  url.searchParams.set('sslmode', 'verify-full');
  return url.toString();
}

async function main() {
  loadEnvFiles();

  const adminDatabaseUrl = getEnv(adminDatabaseUrlEnvNames);
  if (!adminDatabaseUrl) {
    throw new Error(
      `Missing admin Postgres URL. Set Supabase Dashboard's Session Pooler URL in one of: ${adminDatabaseUrlEnvNames.join(', ')}.`
    );
  }

  const parsedAdminUrl = new URL(adminDatabaseUrl.value);
  if (
    parsedAdminUrl.hostname.toLowerCase().startsWith('db.') &&
    process.env.ALLOW_DIRECT_BOOTSTRAP !== 'true'
  ) {
    console.warn(
      'Admin URL is a Direct Postgres host. Supabase Direct hosts are IPv6-only on many projects; prefer SUPABASE_SESSION_POOLER_URL for local bootstrap.'
    );
  }

  const role =
    process.env.HYPERDRIVE_READONLY_ROLE || 'webtomind_hyperdrive_readonly';
  const password =
    process.env.HYPERDRIVE_READONLY_PASSWORD?.trim() || generatePassword();
  const roleIdent = quoteIdent(role);
  const roleLiteral = quoteLiteral(role);
  const passwordLiteral = quoteLiteral(password);
  const projectRef = getProjectRef();
  const outputFile =
    process.env.HYPERDRIVE_READONLY_OUTPUT_FILE || defaultOutputFile;
  const normalizedConnectionString = normalizePgConnectionString(
    adminDatabaseUrl.value
  );

  const client = new Client({
    connectionString: normalizedConnectionString,
    connectionTimeoutMillis: 10_000,
    query_timeout: 15_000,
    application_name: 'webtomind_hyperdrive_readonly_bootstrap'
  });

  await client.connect();
  try {
    await client.query('begin');
    await client.query(`
      do $$
      begin
        if not exists (select 1 from pg_roles where rolname = ${roleLiteral}) then
          create role ${roleIdent} login password ${passwordLiteral};
        else
          alter role ${roleIdent} login password ${passwordLiteral};
        end if;
      end
      $$;
    `);
    await client.query(`grant connect on database postgres to ${roleIdent};`);
    await client.query('grant usage on schema public to ' + roleIdent + ';');
    await client.query(
      'grant select on public.prompt_cases to ' + roleIdent + ';'
    );
    await client.query(
      `alter role ${roleIdent} set statement_timeout = ${quoteLiteral('10s')};`
    );
    await client.query(
      `alter role ${roleIdent} set idle_in_transaction_session_timeout = ${quoteLiteral(
        '10s'
      )};`
    );
    await client.query(
      `alter role ${roleIdent} set default_transaction_read_only = on;`
    );
    await client.query('commit');
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  } finally {
    await client.end();
  }

  const directUrl = buildReadonlyDirectUrl({ projectRef, role, password });
  writeFileSync(
    outputFile,
    [
      '# Source this file locally before updating Cloudflare Hyperdrive.',
      '# It contains a least-privilege read-only Direct Postgres URL.',
      `HYPERDRIVE_DIRECT_CONNECTION_STRING=${quoteLiteral(directUrl)}`,
      ''
    ].join('\n')
  );
  chmodSync(outputFile, 0o600);

  console.log(`Readonly role ready: ${role}`);
  console.log(`Direct Hyperdrive URL written to ${outputFile}`);
  console.log(
    'Next: run HYPERDRIVE_UPDATE_EXISTING=true pnpm cf:hyperdrive:create with Wrangler OAuth or a Cloudflare token that has Account: Hyperdrive Read/Edit.'
  );
}

main().catch((error) => {
  console.error('');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
