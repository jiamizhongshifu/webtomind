#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';
import {
  getSupabaseEnv,
  loadRuntimeEnv,
  usableEnvValue
} from './lib/runtime-env.mjs';

function readArg(name, fallback) {
  const prefix = `${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(name);
  if (index !== -1 && process.argv[index + 1]) return process.argv[index + 1];
  return fallback;
}

function runPsql(databaseUrl, sql) {
  try {
    const stdout = execFileSync('psql', [databaseUrl, '-v', 'ON_ERROR_STOP=1', '-Atc', sql], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    }).trim();
    return { ok: true, stdout };
  } catch (error) {
    return {
      ok: false,
      error: error.stderr ? String(error.stderr).trim() : error.message
    };
  }
}

async function checkRestTables(supabase, tables) {
  const results = [];
  for (const table of tables) {
    const { error, count } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true })
      .limit(1);
    results.push({
      table,
      ok: !error,
      count: Number.isFinite(count) ? count : null,
      error: error?.message || null
    });
  }
  return results;
}

const check = readArg('--check', 'marketing-email');
const envFile = readArg('--env-file', process.env.DB_PREFLIGHT_ENV_FILE || '');
const restOnly = process.argv.includes('--rest-only');
loadRuntimeEnv({
  extraFiles: envFile ? [envFile] : ['.vercel/.env.production.local']
});

const checks = {
  'marketing-email': {
    tables: [
      'marketing_email_preferences',
      'marketing_email_campaigns',
      'marketing_email_queue'
    ],
    ddlSql:
      "select to_regclass('public.marketing_email_preferences'), to_regclass('public.marketing_email_campaigns'), to_regclass('public.marketing_email_queue');"
  }
};

if (!checks[check]) {
  throw new Error(`Unknown --check value: ${check}`);
}

const report = {
  generatedAt: new Date().toISOString(),
  check,
  rest: { ok: false, tables: [] },
  ddl: { ok: false, skipped: restOnly, reason: null },
  blockers: []
};

const { url, serviceRoleKey } = getSupabaseEnv({
  requireServiceRoleKey: true
});
const supabase = createClient(url, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

report.rest.tables = await checkRestTables(supabase, checks[check].tables);
report.rest.ok = report.rest.tables.every((item) => item.ok);

if (!report.rest.ok) {
  report.blockers.push({
    class: 'rest',
    detail: 'Supabase REST/service-role table check failed.'
  });
}

if (!restOnly) {
  const databaseUrl = usableEnvValue(process.env.DATABASE_URL || process.env.POSTGRES_URL);
  if (!databaseUrl) {
    report.ddl.reason = 'Missing DATABASE_URL or POSTGRES_URL; service-role key is not DDL access.';
    report.blockers.push({
      class: 'ddl_credentials',
      detail: report.ddl.reason
    });
  } else {
    const psql = runPsql(databaseUrl, checks[check].ddlSql);
    report.ddl = {
      ok: psql.ok,
      skipped: false,
      reason: psql.ok ? null : psql.error,
      result: psql.ok ? psql.stdout : null
    };
    if (!psql.ok) {
      report.blockers.push({
        class: 'ddl_connection',
        detail: 'Postgres DDL/read-only connectivity check failed.'
      });
    }
  }
}

console.log(JSON.stringify(report, null, 2));

if (report.blockers.length > 0) {
  process.exit(1);
}
