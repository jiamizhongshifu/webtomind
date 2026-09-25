#!/usr/bin/env node
/**
 * 会员积分利用率监控：按 用户 × 月 统计订阅赠送积分与实际消耗，
 * 输出总体/分套餐/月度趋势/分布，用于评估折扣促销对 COGS 的敞口。
 *
 * 用法：
 *   node scripts/membership-credit-utilization.mjs [--days 90] [--out path] [--exclude-internal]
 *
 * 依赖：SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY（runtime-production.env 或 .env.local）。
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { access as fsAccessPromise } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { aggregateUtilization, isInternalUser } from './lib/membership-credit-utilization.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DEFAULT_OUT_DIR = path.join(ROOT, 'outputs', 'membership-credit-utilization');

function parseArgs(argv) {
  const args = { days: 90, outDir: DEFAULT_OUT_DIR, excludeInternal: false, help: false };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === '--days') {
      args.days = Number(next);
      index += 1;
    } else if (arg === '--out') {
      args.outDir = path.resolve(next);
      index += 1;
    } else if (arg === '--exclude-internal') {
      args.excludeInternal = true;
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!Number.isFinite(args.days) || args.days < 1 || args.days > 730) {
    throw new Error('--days must be a number between 1 and 730');
  }
  return args;
}

function usage() {
  return `Usage:
  node scripts/membership-credit-utilization.mjs [options]

Options:
  --days <n>               Lookback window in days. Defaults to 90.
  --out <dir>              Output directory. Defaults to outputs/membership-credit-utilization.
  --exclude-internal       Exclude smoke/internal accounts (email/source patterns).
  --help                   Show this help.

Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in runtime-production.env or .env.local.`;
}

async function fileExists(filePath) {
  try {
    await fsAccessPromise(filePath);
    return true;
  } catch {
    return false;
  }
}

async function loadEnvFile(filePath) {
  if (!(await fileExists(filePath))) return;
  loadEnv({ path: filePath, override: false, quiet: true });
}

async function fetchAllRows(supabase, table, select, filter) {
  const rows = [];
  let page = 1;
  while (true) {
    const query = supabase
      .from(table)
      .select(select)
      .range((page - 1) * 1000, page * 1000 - 1);
    if (filter) query.gte(filter.column, filter.value);
    const { data, error } = await query;
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
    page += 1;
  }
  return rows;
}

async function loadUserLookup(supabase) {
  const lookup = {};
  let page = 1;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers: ${error.message}`);
    for (const user of data?.users || []) {
      lookup[user.id] = {
        id: user.id,
        email: user.email,
        user_metadata: user.user_metadata || {}
      };
    }
    if (!data?.users || data.users.length < 200) break;
    page += 1;
  }
  return lookup;
}

function formatPercent(value) {
  if (value === null || value === undefined) return 'n/a';
  return `${(value * 100).toFixed(1)}%`;
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(usage());
    return;
  }

  await loadEnvFile(path.join(ROOT, '.env'));
  await loadEnvFile(path.join(ROOT, '.env.local'));
  const runtimeEnvFile =
    process.env.WEBTOMIND_RUNTIME_ENV_FILE ||
    path.join(os.homedir(), '.config/webtomind/runtime-production.env');
  if (await fileExists(runtimeEnvFile)) {
    loadEnv({ path: runtimeEnvFile, override: true, quiet: true });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  }
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false }
  });

  const windowStart = new Date(Date.now() - args.days * 86400e3).toISOString();
  const [plans, subscriptions, transactions] = await Promise.all([
    supabase.from('subscription_plans').select('id,name,monthly_credits'),
    fetchAllRows(supabase, 'user_subscriptions', 'user_id,plan_id,status,current_period_start,current_period_end', null),
    fetchAllRows(supabase, 'credit_transactions', 'user_id,type,credit_type,amount,created_at', {
      column: 'created_at',
      value: windowStart
    })
  ]);
  const userLookup = await loadUserLookup(supabase);

  const result = aggregateUtilization({
    transactions: transactions || [],
    subscriptions,
    plans: plans?.data || [],
    windowStart,
    excludeInternal: args.excludeInternal,
    userLookup
  });

  const internalUsers = Object.values(userLookup)
    .filter((user) => isInternalUser(user))
    .map((user) => user.email || user.id);

  const summary = {
    generatedAt: new Date().toISOString(),
    windowDays: args.days,
    excludeInternal: args.excludeInternal,
    overall: result.overall,
    distribution: result.distribution,
    byPlan: result.byPlan,
    monthlyTrend: result.monthlyTrend,
    internalUserCount: internalUsers.length,
    internalUserEmails: internalUsers.slice(0, 20)
  };

  mkdirSync(args.outDir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const outFile = path.join(args.outDir, `${stamp}.json`);
  writeFileSync(outFile, JSON.stringify(summary, null, 2));

  console.log('== Membership credit utilization ==');
  console.log(
    `overall: ${formatPercent(result.overall.utilization)} (users=${result.overall.users}, userMonths=${result.overall.userMonths}, granted=${result.overall.granted}, consumed=${result.overall.consumed})`
  );
  console.log(
    `distribution: mean=${formatPercent(result.distribution.mean)}, p25=${formatPercent(result.distribution.p25)}, p50=${formatPercent(result.distribution.p50)}, p75=${formatPercent(result.distribution.p75)}, p90=${formatPercent(result.distribution.p90)}`
  );
  for (const plan of Object.values(result.byPlan)) {
    console.log(
      `plan ${plan.planId}: utilization=${formatPercent(plan.utilization)}, users=${plan.users}, granted=${plan.granted}, consumed=${plan.consumed}`
    );
  }
  for (const month of result.monthlyTrend) {
    console.log(
      `month ${month.month}: utilization=${formatPercent(month.utilization)}, users=${month.users}, granted=${month.granted}, consumed=${month.consumed}`
    );
  }
  console.log(`wrote ${outFile}`);
}

main().catch((error) => {
  console.error(`FAIL ${error?.message || error}`);
  process.exitCode = 1;
});
