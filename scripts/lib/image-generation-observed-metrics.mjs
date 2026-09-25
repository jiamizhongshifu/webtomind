import { createClient } from '@supabase/supabase-js';
import { getSupabaseEnv, loadRuntimeEnv } from './runtime-env.mjs';

function asRecord(value) {
  return value && typeof value === 'object' ? value : {};
}

function asNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function safeRate(numerator, denominator) {
  if (!denominator) return null;
  return Number((numerator / denominator).toFixed(4));
}

function getRefundedCredits(task) {
  const diagnostics = asRecord(asRecord(task.result_payload).diagnostics);
  const billing = asRecord(diagnostics.billing);
  return asNumber(billing.refundedCredits);
}

function getPrepaidCredits(task) {
  return asNumber(
    asRecord(asRecord(task.request_payload).prepaidCredit).consumed
  );
}

function getRefundTaskId(transaction) {
  const metadata = asRecord(transaction.metadata);
  const taskId = metadata.taskId || metadata.task_id;
  return typeof taskId === 'string' ? taskId : '';
}

export function summarizeImageRefundLedger(tasks, refundTransactions) {
  const refundCreditsByTaskId = new Map();
  for (const transaction of refundTransactions) {
    const taskId = getRefundTaskId(transaction);
    if (!taskId) continue;
    refundCreditsByTaskId.set(
      taskId,
      (refundCreditsByTaskId.get(taskId) || 0) + asNumber(transaction.amount)
    );
  }

  const chargedFailures = tasks.filter(
    (task) => task.status === 'failed' && getPrepaidCredits(task) > 0
  );
  const refundedChargedFailures = chargedFailures.filter(
    (task) =>
      (refundCreditsByTaskId.get(task.id) || 0) >= getPrepaidCredits(task)
  );
  const diagnosticMismatches = chargedFailures.filter((task) => {
    const ledgerRefunded =
      (refundCreditsByTaskId.get(task.id) || 0) >= getPrepaidCredits(task);
    const diagnosticRefunded =
      !task.refund_failed && getRefundedCredits(task) > 0;
    return ledgerRefunded !== diagnosticRefunded;
  });

  return {
    chargedFailures,
    refundedChargedFailures,
    diagnosticMismatches,
    refundCreditsByTaskId
  };
}

async function loadRefundTransactions(supabase, taskIds) {
  const transactions = [];
  for (let offset = 0; offset < taskIds.length; offset += 200) {
    const { data, error } = await supabase
      .from('credit_transactions')
      .select('amount,metadata')
      .eq('type', 'refund')
      .in('metadata->>taskId', taskIds.slice(offset, offset + 200));
    if (error) throw new Error(error.message);
    transactions.push(...(data || []));
  }
  return transactions;
}

function percentile(values, ratio) {
  const sorted = values
    .map(asNumber)
    .filter((value) => value > 0)
    .sort((left, right) => left - right);
  if (sorted.length === 0) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))];
}

function buildOutcomeGroups(rows, keyForRow, durationField) {
  const groups = new Map();
  for (const row of rows) {
    const key = keyForRow(row);
    const current = groups.get(key) || {
      key,
      total: 0,
      succeeded: 0,
      failed: 0,
      durations: []
    };
    current.total += 1;
    if (row.status === 'succeeded') current.succeeded += 1;
    if (row.status === 'failed') current.failed += 1;
    const duration = asNumber(row[durationField]);
    if (duration > 0) current.durations.push(duration);
    groups.set(key, current);
  }
  return [...groups.values()]
    .map((group) => ({
      key: group.key,
      total: group.total,
      succeeded: group.succeeded,
      failed: group.failed,
      successRate:
        group.succeeded + group.failed > 0
          ? group.succeeded / (group.succeeded + group.failed)
          : null,
      latencyP50Ms: percentile(group.durations, 0.5),
      latencyP95Ms: percentile(group.durations, 0.95)
    }))
    .sort((left, right) => right.total - left.total);
}

export async function loadObservedImageGenerationMetrics(options = {}) {
  const days = Math.max(1, Math.min(90, Math.floor(options.days || 30)));
  const minimumSample = Math.max(
    1,
    Math.min(1000, Math.floor(options.minimumSample || 10))
  );
  loadRuntimeEnv({
    extraFiles: ['.vercel/.env.production.local']
  });

  try {
    const { url, serviceRoleKey } = getSupabaseEnv({
      requireServiceRoleKey: true
    });
    const supabase = createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    const cutoff = new Date(
      Date.now() - days * 24 * 60 * 60 * 1000
    ).toISOString();
    const [taskResult, attemptResult] = await Promise.all([
      supabase
        .from('image_generation_tasks')
        .select(
          'id,user_id,status,attempt_count,refund_failed,failure_category,request_payload,result_payload,created_at,total_duration_ms,provider_latency_ms,queue_wait_ms'
        )
        .gte('created_at', cutoff)
        .in('status', ['succeeded', 'failed'])
        .order('created_at', { ascending: false })
        .limit(10_000),
      supabase
        .from('image_generation_attempts')
        .select(
          'provider,model,channel,status,error_category,duration_ms,task_id,attempt_index,metadata,started_at',
          { count: 'exact' }
        )
        .gte('started_at', cutoff)
        .in('status', ['succeeded', 'failed'])
        .order('started_at', { ascending: false })
        .limit(10_000)
    ]);
    if (taskResult.error) throw new Error(taskResult.error.message);
    if (attemptResult.error) throw new Error(attemptResult.error.message);

    const tasks = taskResult.data || [];
    const attempts = attemptResult.data || [];
    const userIds = [
      ...new Set(tasks.map((task) => task.user_id).filter(Boolean))
    ];
    const paidUserIds = new Set();
    for (let offset = 0; offset < userIds.length; offset += 200) {
      const { data: subscriptions, error: subscriptionError } = await supabase
        .from('user_subscriptions')
        .select('user_id,status,current_period_end')
        .in('user_id', userIds.slice(offset, offset + 200))
        .in('status', ['active', 'trialing']);
      if (subscriptionError) throw new Error(subscriptionError.message);
      for (const subscription of subscriptions || []) {
        if (
          !subscription.current_period_end ||
          new Date(subscription.current_period_end).getTime() > Date.now()
        ) {
          paidUserIds.add(subscription.user_id);
        }
      }
    }
    const succeeded = tasks.filter((task) => task.status === 'succeeded');
    const failed = tasks.filter((task) => task.status === 'failed');
    const retried = tasks.filter((task) => asNumber(task.attempt_count) > 1);
    const chargedFailureTaskIds = failed
      .filter((task) => getPrepaidCredits(task) > 0)
      .map((task) => task.id)
      .filter(Boolean);
    const refundTransactions = await loadRefundTransactions(
      supabase,
      chargedFailureTaskIds
    );
    const { chargedFailures, refundedChargedFailures, diagnosticMismatches } =
      summarizeImageRefundLedger(tasks, refundTransactions);
    const failureCategories = failed.reduce((summary, task) => {
      const category = task.failure_category || 'unknown';
      summary[category] = (summary[category] || 0) + 1;
      return summary;
    }, {});
    const sampleSize = tasks.length;
    const sufficientSample = sampleSize >= minimumSample;

    return {
      ok: sufficientSample,
      status: sufficientSample ? 'observed' : 'insufficient_sample',
      generatedAt: new Date().toISOString(),
      windowDays: days,
      cutoff,
      minimumSample,
      sampleSize,
      succeeded: succeeded.length,
      failed: failed.length,
      failureRate: sufficientSample ? failed.length / sampleSize : null,
      retriedTasks: retried.length,
      retryRate: sufficientSample ? retried.length / sampleSize : null,
      chargedFailures: chargedFailures.length,
      refundedChargedFailures: refundedChargedFailures.length,
      refundRate: sufficientSample
        ? refundedChargedFailures.length / sampleSize
        : null,
      failureRefundCompliance:
        sufficientSample && chargedFailures.length > 0
          ? refundedChargedFailures.length / chargedFailures.length
          : null,
      refundFactsSource: 'credit_transactions',
      refundDiagnosticMismatchCount: diagnosticMismatches.length,
      refundFailures: failed.filter((task) => task.refund_failed).length,
      providerBilledLossUsd: null,
      providerBilledLossStatus: 'provider_invoice_not_integrated',
      failureCategories,
      byPlanAccess: buildOutcomeGroups(
        tasks,
        (task) =>
          paidUserIds.has(task.user_id)
            ? 'current_paid_access'
            : 'current_free_or_inactive',
        'total_duration_ms'
      ),
      planAccessBasis: 'current_subscription_at_report_time',
      byRequestProfile: buildOutcomeGroups(
        tasks,
        (task) => {
          const request = asRecord(task.request_payload);
          return [
            request.model || 'unknown-model',
            request.imageSize || 'unknown-size',
            `count-${asNumber(request.imageCount) || 1}`,
            request.referenceMode || 'none'
          ].join('|');
        },
        'total_duration_ms'
      ),
      attempts: {
        totalRows: attemptResult.count ?? attempts.length,
        sampledRows: attempts.length,
        sampled: (attemptResult.count ?? attempts.length) > attempts.length,
        total: attempts.length,
        firstAttempts: attempts.filter(
          (attempt) => asNumber(attempt.attempt_index) <= 1
        ).length,
        firstAttemptSucceeded: attempts.filter(
          (attempt) =>
            asNumber(attempt.attempt_index) <= 1 &&
            attempt.status === 'succeeded'
        ).length,
        firstAttemptSuccessRate: safeRate(
          attempts.filter(
            (attempt) =>
              asNumber(attempt.attempt_index) <= 1 &&
              attempt.status === 'succeeded'
          ).length,
          attempts.filter(
            (attempt) => asNumber(attempt.attempt_index) <= 1
          ).length
        ),
        retryOrFallbackAttempts: attempts.filter(
          (attempt) => asNumber(attempt.attempt_index) > 1
        ).length,
        byRoute: buildOutcomeGroups(
          attempts,
          (attempt) =>
            `${attempt.provider || 'unknown'}|${attempt.model || 'unknown'}|${
              attempt.channel || 'default'
            }`,
          'duration_ms'
        ),
        failureCategories: attempts
          .filter((attempt) => attempt.status === 'failed')
          .reduce((summary, attempt) => {
            const category = attempt.error_category || 'unknown';
            summary[category] = (summary[category] || 0) + 1;
            return summary;
          }, {})
      }
    };
  } catch (error) {
    return {
      ok: false,
      status: 'unavailable',
      generatedAt: new Date().toISOString(),
      windowDays: days,
      minimumSample,
      sampleSize: 0,
      failureRate: null,
      retryRate: null,
      refundRate: null,
      providerBilledLossUsd: null,
      providerBilledLossStatus: 'provider_invoice_not_integrated',
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
