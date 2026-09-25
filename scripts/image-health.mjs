import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

const cwd = process.cwd();
const envPath =
  process.env.IMAGE_HEALTH_ENV_FILE ||
  path.join(cwd, '.vercel', '.env.production.local');

if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath, override: false, quiet: true });
}

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    'Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.'
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);
const windows = [1, 2, 6, 24];

function categorizeTask(task) {
  if (task.failure_category) return task.failure_category;
  const details = task.result_payload?.errorDetails || null;
  if (details?.category) return details.category;
  const message = String(task.error_message || '');
  if (/IMAGE_PIPELINE_DEADLINE|生成超时|deadline/i.test(message)) {
    return 'pipeline_deadline';
  }
  if (/safety|sexual|policy|安全系统|拦截/i.test(message)) {
    return 'provider_policy';
  }
  if (/groups not available|unavailable|50[0234]|52[0-7]/i.test(message)) {
    return 'provider_unavailable';
  }
  if (/timeout|timed out/i.test(message)) return 'provider_timeout';
  if (/积分|credit|quota/i.test(message)) return 'credit';
  return message ? 'unknown' : 'none';
}

function percentile(sortedValues, p) {
  if (sortedValues.length === 0) return null;
  return sortedValues[
    Math.min(sortedValues.length - 1, Math.floor(sortedValues.length * p))
  ];
}

function summarizeDurations(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  return {
    min: sorted[0],
    p50: percentile(sorted, 0.5),
    p90: percentile(sorted, 0.9),
    max: sorted[sorted.length - 1],
    count: sorted.length
  };
}

function secondsBetween(start, end) {
  if (!start || !end) return null;
  return Math.round(
    (new Date(end).getTime() - new Date(start).getTime()) / 1000
  );
}

async function summarizeWindow(hours) {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const { data: tasks, error } = await supabase
    .from('image_generation_tasks')
    .select(
      'status,error_message,result_payload,created_at,updated_at,completed_at,started_at,total_duration_ms,provider_latency_ms,queue_wait_ms,failure_category,failure_code,attempt_count,refund_failed'
    )
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(1000);

  if (error) {
    return { hours, ok: false, error: error.message };
  }

  const summary = {
    hours,
    ok: true,
    tasksTotal: tasks.length,
    byStatus: {},
    byFailureCategory: {},
    refundFailed: 0,
    attempts: {},
    successRate: null,
    durationsSeconds: {
      succeeded: [],
      failed: []
    },
    queueWaitSeconds: [],
    providerLatencySeconds: []
  };

  for (const task of tasks) {
    summary.byStatus[task.status] = (summary.byStatus[task.status] || 0) + 1;
    summary.attempts[String(task.attempt_count || 0)] =
      (summary.attempts[String(task.attempt_count || 0)] || 0) + 1;
    if (task.refund_failed) summary.refundFailed += 1;
    if (task.status === 'failed') {
      const category = categorizeTask(task);
      summary.byFailureCategory[category] =
        (summary.byFailureCategory[category] || 0) + 1;
    }

    const durationSeconds =
      Number.isFinite(task.total_duration_ms) && task.total_duration_ms > 0
        ? Math.round(task.total_duration_ms / 1000)
        : secondsBetween(task.created_at, task.completed_at || task.updated_at);
    if (durationSeconds != null && task.status in summary.durationsSeconds) {
      summary.durationsSeconds[task.status].push(durationSeconds);
    }
    if (Number.isFinite(task.queue_wait_ms)) {
      summary.queueWaitSeconds.push(Math.round(task.queue_wait_ms / 1000));
    }
    if (Number.isFinite(task.provider_latency_ms)) {
      summary.providerLatencySeconds.push(
        Math.round(task.provider_latency_ms / 1000)
      );
    }
  }

  const completed =
    (summary.byStatus.succeeded || 0) + (summary.byStatus.failed || 0);
  summary.successRate = completed
    ? Number((((summary.byStatus.succeeded || 0) / completed) * 100).toFixed(1))
    : null;
  summary.durationsSeconds = {
    succeeded: summarizeDurations(summary.durationsSeconds.succeeded),
    failed: summarizeDurations(summary.durationsSeconds.failed)
  };
  summary.queueWaitSeconds = summarizeDurations(summary.queueWaitSeconds);
  summary.providerLatencySeconds = summarizeDurations(
    summary.providerLatencySeconds
  );
  return summary;
}

async function summarizeAttempts() {
  const since = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('image_generation_attempts')
    .select(
      'provider,model,channel,status,error_category,duration_ms,started_at'
    )
    .gte('started_at', since)
    .order('started_at', { ascending: false })
    .limit(1000);

  if (error) return { ok: false, error: error.message };

  const byProviderModel = {};
  const byErrorCategory = {};
  const durationsByKey = {};
  for (const attempt of data) {
    const key = [
      attempt.provider,
      attempt.model,
      attempt.channel || 'default'
    ].join('/');
    byProviderModel[key] ||= { total: 0, succeeded: 0, failed: 0 };
    byProviderModel[key].total += 1;
    byProviderModel[key][attempt.status] =
      (byProviderModel[key][attempt.status] || 0) + 1;
    if (attempt.error_category) {
      byErrorCategory[attempt.error_category] =
        (byErrorCategory[attempt.error_category] || 0) + 1;
    }
    if (Number.isFinite(attempt.duration_ms)) {
      durationsByKey[key] ||= [];
      durationsByKey[key].push(Math.round(attempt.duration_ms / 1000));
    }
  }

  for (const key of Object.keys(byProviderModel)) {
    const completed =
      (byProviderModel[key].succeeded || 0) +
      (byProviderModel[key].failed || 0);
    byProviderModel[key].successRate = completed
      ? Number(
          (((byProviderModel[key].succeeded || 0) / completed) * 100).toFixed(1)
        )
      : null;
    byProviderModel[key].durationSeconds = summarizeDurations(
      durationsByKey[key] || []
    );
  }

  return {
    ok: true,
    hours: 6,
    attemptsTotal: data.length,
    byProviderModel,
    byErrorCategory
  };
}

const report = {
  generatedAt: new Date().toISOString(),
  windows: [],
  attemptsLast6h: null
};

for (const hours of windows) {
  report.windows.push(await summarizeWindow(hours));
}
report.attemptsLast6h = await summarizeAttempts();

console.log(JSON.stringify(report, null, 2));
