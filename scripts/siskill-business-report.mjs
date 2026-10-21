#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { loadRuntimeEnv, getSupabaseEnv } from './lib/runtime-env.mjs';
import { commerceSummary } from '../apps/siskill/ops/commerce-report.mjs';
const { values } = parseArgs({
  options: {
    'env-file': { type: 'string' },
    start: { type: 'string' },
    end: { type: 'string' },
    output: { type: 'string' },
    help: { type: 'boolean' }
  }
});
if (values.help) {
  console.log(
    'Read-only SiSkill cohort report. --env-file PATH --start ISO --end ISO --output PATH. Defaults to the last 30 days, UTC. Output contains aggregates only.'
  );
  process.exit(0);
}
const end = values.end || new Date().toISOString();
const start =
  values.start || new Date(Date.parse(end) - 30 * 86400000).toISOString();
if (
  !Number.isFinite(Date.parse(start)) ||
  !Number.isFinite(Date.parse(end)) ||
  Date.parse(start) >= Date.parse(end)
)
  throw Error('INVALID_REPORT_WINDOW');
loadRuntimeEnv({ extraFiles: values['env-file'] ? [values['env-file']] : [] });
const env = getSupabaseEnv({ requireServiceRoleKey: true });
const db = createClient(env.url, env.serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    fetch: (url, init) =>
      fetch(url, { ...init, signal: AbortSignal.timeout(20000) })
  }
});
async function all(table, select, window = true) {
  const rows = [];
  for (let offset = 0; offset < 10000; offset += 500) {
    let q = db
      .from(table)
      .select(select)
      .order('created_at')
      .range(offset, offset + 499);
    if (window)
      q = q
        .gte('created_at', new Date(start).toISOString())
        .lt('created_at', new Date(end).toISOString());
    const { data, error } = await q;
    if (error) throw Error(`REPORT_QUERY_FAILED:${table}:${error.code}`);
    rows.push(...data);
    if (data.length < 500) return rows;
  }
  throw Error(`REPORT_LIMIT_REACHED:${table}:narrow_the_window`);
}
try {
  const [orders, memberships] = await Promise.all([
    all('siskill_orders', 'id,user_id,status,amount,currency,created_at'),
    all('siskill_memberships', 'user_id,state,created_at')
  ]);
  const owners = new Map();
  for (const id of new Set([...orders, ...memberships].map((r) => r.user_id))) {
    const { data, error } = await db.auth.admin.getUserById(id);
    const m = data?.user?.user_metadata || {},
      a = data?.user?.app_metadata || {};
    owners.set(
      id,
      error || !data.user
        ? 'unknown'
        : m.siskill_smoke === true ||
            m.siskill_test === true ||
            a.siskill_smoke === true ||
            a.siskill_test === true
          ? 'qa'
          : 'customer'
    );
  }
  const paymentEvents = [];
  for (let i = 0; i < orders.length; i += 100) {
    const ids = orders.slice(i, i + 100).map((o) => o.id);
    const { data, error } = await db
      .from('siskill_payment_events')
      .select('order_id,kind')
      .eq('kind', 'paid')
      .in('order_id', ids);
    if (error) throw Error('REPORT_PAYMENT_EVENTS_UNAVAILABLE');
    if (data.length >= 1000) throw Error('REPORT_PAYMENT_EVENTS_TRUNCATED');
    paymentEvents.push(...data);
  }
  const report = commerceSummary({
    orders,
    memberships,
    paymentEvents,
    owners,
    start: new Date(start).toISOString(),
    end: new Date(end).toISOString()
  });
  const file = resolve(
    values.output ||
      `output/siskill-ops/${new Date().toISOString().slice(0, 10)}/commerce.json`
  );
  await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  await writeFile(file, JSON.stringify(report, null, 2) + '\n', {
    mode: 0o600
  });
  console.log(
    JSON.stringify({
      report: file,
      customerCohortOrders: report.orders.count,
      excludedQaOrders: report.exclusions.qaOrders,
      unknownOwnerOrders: report.exclusions.unknownOwnerOrders,
      paidWithRecordedEvent: report.orders.paidWithRecordedPaymentEvent,
      conversionRate: null
    })
  );
} catch (e) {
  console.error(
    e.message?.startsWith('REPORT_') ? e.message : 'SISKILL_REPORT_FAILED'
  );
  process.exitCode = 1;
}
