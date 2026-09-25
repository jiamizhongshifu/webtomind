#!/usr/bin/env node

import { existsSync } from 'node:fs';
import process from 'node:process';
import { config as loadEnv } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { getRuntimeProductionEnvPath } from './lib/runtime-production-env.mjs';

const runtimeEnvFile = process.env.SMOKE_ENV_FILE || getRuntimeProductionEnvPath();
const confirmDelete = process.argv.includes('--confirm-delete');
const maxAgeHours = Number(process.env.CF_SMOKE_CLEANUP_MAX_AGE_HOURS || 1);
const perPage = 100;

for (const path of ['.env.local', 'server/.env']) {
  if (existsSync(path)) {
    loadEnv({ path, override: false, quiet: true });
  }
}

if (runtimeEnvFile && existsSync(runtimeEnvFile)) {
  loadEnv({ path: runtimeEnvFile, override: true, quiet: true });
}

function usableEnvValue(value) {
  if (!value) return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.includes('your-project.supabase.co')) return '';
  if (
    trimmed.includes('your_') ||
    trimmed.includes('your-') ||
    trimmed.includes('<')
  ) {
    return '';
  }
  return trimmed;
}

const supabaseUrl =
  usableEnvValue(process.env.SUPABASE_URL) ||
  usableEnvValue(process.env.VITE_SUPABASE_URL);
const supabaseServiceRoleKey = usableEnvValue(
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function createAdminClient() {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error(
      'Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Set SMOKE_ENV_FILE if production secrets live outside .env.local.'
    );
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

function isSmokeUser(user) {
  const email = user.email || '';
  const source = user.user_metadata?.source || user.raw_user_meta_data?.source;
  return (
    email.startsWith('cloudflare-ai-smoke-') ||
    source === 'cloudflare-ai-smoke'
  );
}

function isOlderThanCutoff(user, cutoffTime) {
  const createdTime = Date.parse(user.created_at || '');
  if (!Number.isFinite(createdTime)) return true;
  return createdTime <= cutoffTime;
}

function toResult(user, status, extra = {}) {
  return {
    userId: user.id,
    email: user.email || null,
    createdAt: user.created_at || null,
    status,
    ...extra
  };
}

async function listSmokeUsers(admin) {
  const cutoffTime = Date.now() - Math.max(0, maxAgeHours) * 60 * 60 * 1000;
  const users = [];
  let page = 1;

  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage
    });
    if (error) throw new Error(`Failed to list users: ${error.message}`);

    const batch = data?.users || [];
    users.push(
      ...batch.filter(
        (user) => isSmokeUser(user) && isOlderThanCutoff(user, cutoffTime)
      )
    );

    if (batch.length < perPage) break;
    page += 1;
  }

  return users;
}

async function main() {
  const admin = createAdminClient();
  const users = await listSmokeUsers(admin);
  const results = [];

  for (const user of users) {
    if (!confirmDelete) {
      results.push(toResult(user, 'dry-run'));
      continue;
    }

    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) {
      results.push(toResult(user, 'failed', { error: error.message }));
      continue;
    }
    results.push(toResult(user, 'deleted'));
  }

  console.log(
    JSON.stringify(
      {
        dryRun: !confirmDelete,
        maxAgeHours,
        matched: users.length,
        deleted: results.filter((result) => result.status === 'deleted')
          .length,
        failed: results.filter((result) => result.status === 'failed').length,
        results
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      error: error instanceof Error ? error.message : String(error)
    })
  );
  process.exit(1);
});
