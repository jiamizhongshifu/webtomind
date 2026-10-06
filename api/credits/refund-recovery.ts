import type { SupabaseClient } from '@supabase/supabase-js';

const TABLES = {
  image: 'image_generation_tasks',
  video: 'video_generation_tasks'
} as const;
const CREDIT_TYPES = ['daily', 'subscription', 'bonus', 'media', 'promoMedia'];
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

// Retry only terminal full failures with intact prepaid evidence. Cancelled and
// partially successful tasks have different refund phases and stay with their
// existing recovery paths. The original RPC + key make concurrent cron retries
// and a lost RPC response safe; an ambiguous ledger never creates another credit.
export async function recoverFailedGenerationRefunds(
  db: SupabaseClient,
  now: Date
) {
  const summary = { recovered: 0, deferred: 0, errors: [] as string[] };
  for (const kind of ['image', 'video'] as const) {
    const { data: tasks, error } = await db
      .from(TABLES[kind])
      .select('id,user_id,status,updated_at,request_payload,result_payload')
      .eq('status', 'failed')
      .eq('refund_failed', true)
      .lt('updated_at', new Date(now.getTime() - 10 * 60_000).toISOString())
      .order('updated_at', { ascending: true })
      .limit(10);
    if (error) {
      summary.errors.push(`${kind}: task lookup failed`);
      continue;
    }
    for (const task of tasks || []) {
      try {
        const request = record(task.request_payload);
        const prepaid = record(request.prepaidCredit);
        const amount = Number(prepaid.consumed);
        const breakdown = record(prepaid.creditBreakdown);
        const entries = Object.entries(breakdown);
        if (
          !Number.isSafeInteger(amount) ||
          amount <= 0 ||
          !entries.length ||
          entries.some(
            ([key, value]) =>
              !CREDIT_TYPES.includes(key) ||
              !Number.isSafeInteger(value) ||
              Number(value) < 0
          ) ||
          entries.reduce((sum, [, value]) => sum + Number(value), 0) !== amount
        ) {
          summary.deferred++;
          continue;
        }
        const phase = kind === 'image' ? 'generation_failure_refund' : 'refund';
        const key = `${kind}_task:${task.id}:${phase}`;
        const { data: refunds, error: ledgerError } = await db
          .from('credit_transactions')
          .select('amount,metadata')
          .eq('user_id', task.user_id)
          .eq('type', 'refund')
          .eq('metadata->>taskId', task.id)
          .limit(100);
        if (ledgerError) {
          summary.errors.push(`${kind}: refund lookup failed`);
          continue;
        }
        const prior = refunds || [];
        // Includes legacy fallback RPC sources. Do not retry across a different
        // phase (partial/cancel/lease rollback) or over an unrecognized amount.
        if (
          prior.length &&
          (prior.length !== 1 ||
            Number(prior[0].amount) !== amount ||
            record(prior[0].metadata).idempotency_key !== key)
        ) {
          summary.deferred++;
          continue;
        }
        if (!prior.length) {
          const denoise =
            kind === 'image' && request.appOperation === 'gpt-image-2-denoise';
          const { data: result, error: refundError } = await db.rpc(
            denoise
              ? 'refund_gpt_image_2_denoise_credits_v3'
              : 'refund_generation_credit',
            {
              p_user_id: task.user_id,
              p_amount: amount,
              p_credit_type: prepaid.creditType || 'bonus',
              p_source: `${denoise ? 'denoise' : kind}_task:${task.id}:refund`,
              p_metadata: {
                taskId: task.id,
                billingDomain: `${kind}_task`,
                billingPhase: phase,
                idempotency_key: key,
                ...(denoise
                  ? {
                      appSlug: 'gpt-image-2-denoiser',
                      appOperation: 'gpt-image-2-denoise'
                    }
                  : {}),
                creditBreakdown: breakdown,
                recovery: 'failed_task_cron'
              }
            }
          );
          if (
            refundError ||
            record(result).success !== true ||
            Number(record(result).refunded) !== amount
          ) {
            summary.errors.push(`${kind}: refund unconfirmed`);
            continue;
          }
        }
        const payload = record(task.result_payload);
        const { data: updated, error: updateError } = await db
          .from(TABLES[kind])
          .update({
            refund_failed: false,
            updated_at: now.toISOString(),
            result_payload: {
              ...payload,
              refundFailed: false,
              refunded: amount
            }
          })
          .eq('id', task.id)
          .eq('status', 'failed')
          .eq('refund_failed', true)
          .eq('updated_at', task.updated_at)
          .select('id')
          .maybeSingle();
        if (updateError)
          summary.errors.push(`${kind}: refund flag update failed`);
        else if (updated) summary.recovered++;
      } catch {
        summary.errors.push(`${kind}: recovery unavailable`);
      }
    }
  }
  return summary;
}
