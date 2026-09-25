#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import pg from 'pg';
import {
  getSupabaseEnv,
  loadRuntimeEnv,
  usableEnvValue
} from './lib/runtime-env.mjs';

const { Client } = pg;
const ROOT = process.cwd();
const MIGRATION_PATH = path.join(
  ROOT,
  'supabase/migrations/20260712124500_prompt_asset_viewpoint_slot.sql'
);
const MANIFEST_PATH = path.join(
  ROOT,
  'src/web/assets/prompt-library/manifest.generated.json'
);
const DRY_RUN = process.argv.includes('--dry-run');

loadRuntimeEnv({ extraFiles: ['.vercel/.env.production.local'] });

function redactSecrets(value) {
  return String(value).replace(
    /\bpostgres(?:ql)?:\/\/[^\s"'`]+/giu,
    'postgresql://[redacted]'
  );
}

function getDatabaseUrl() {
  return usableEnvValue(
    process.env.SUPABASE_ADMIN_DATABASE_URL ||
      process.env.DATABASE_URL ||
      process.env.POSTGRES_URL
  );
}

async function applyMigration(databaseUrl) {
  const sql = await readFile(MIGRATION_PATH, 'utf8');
  const client = new Client({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 10_000,
    query_timeout: 30_000,
    application_name: 'webtomind_prompt_asset_release'
  });

  await client.connect();
  try {
    await client.query('begin');
    await client.query("select pg_advisory_xact_lock(hashtext('webtomind_prompt_asset_release'))");
    await client.query(sql);
    await client.query('commit');
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

function syncAssets() {
  const result = spawnSync(
    process.execPath,
    ['scripts/sync-prompt-assets.mjs'],
    { cwd: ROOT, env: process.env, stdio: 'inherit' }
  );
  if (result.status !== 0) {
    throw new Error(`Prompt asset sync failed with exit code ${result.status}`);
  }
}

async function verifyViewpointAssets() {
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
  const expectedCount = manifest.assets.filter(
    (asset) => asset.slot === 'viewpoint'
  ).length;
  const { url, serviceRoleKey } = getSupabaseEnv({ requireServiceRoleKey: true });
  const response = await fetch(
    `${url}/rest/v1/prompt_assets?slot=eq.viewpoint&is_published=eq.true&select=id`,
    {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`
      }
    }
  );
  if (!response.ok) {
    throw new Error(`Viewpoint verification failed with HTTP ${response.status}`);
  }
  const rows = await response.json();
  if (!Array.isArray(rows) || rows.length !== expectedCount) {
    throw new Error(
      `Expected ${expectedCount} published viewpoint assets from manifest, received ${rows?.length ?? 'invalid response'}`
    );
  }
  console.log(`[prompt-assets-release] verified viewpoint=${expectedCount}`);
}

async function main() {
  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) {
    throw new Error(
      'Missing SUPABASE_ADMIN_DATABASE_URL, DATABASE_URL or POSTGRES_URL. Set a Supabase Session Pooler/admin Postgres URL locally; never paste it into chat.'
    );
  }

  if (DRY_RUN) {
    await readFile(MIGRATION_PATH, 'utf8');
    const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
    const expectedCount = manifest.assets.filter(
      (asset) => asset.slot === 'viewpoint'
    ).length;
    getSupabaseEnv({ requireServiceRoleKey: true });
    console.log(
      `[prompt-assets-release] dry-run ready: migration -> sync -> verify viewpoint=${expectedCount}`
    );
    return;
  }

  await applyMigration(databaseUrl);
  console.log('[prompt-assets-release] migration applied');
  syncAssets();
  await verifyViewpointAssets();
}

main().catch((error) => {
  console.error(
    `[prompt-assets-release] ${redactSecrets(error instanceof Error ? error.message : error)}`
  );
  process.exit(1);
});
