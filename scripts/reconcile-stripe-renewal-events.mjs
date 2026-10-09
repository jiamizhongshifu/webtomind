#!/usr/bin/env node
// Analytics-only reconciliation. Never invokes fulfillment, credit grants or refunds.
import { createHash } from 'node:crypto';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { loadRuntimeEnv, getSupabaseEnv } from './lib/runtime-env.mjs';
import { renewalEventRow } from './lib/renewal-reconciliation.mjs';

async function main() {
  loadRuntimeEnv();
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const expectedDigest = args
    .find((value) => value.startsWith('--expected-digest='))
    ?.split('=')[1];
  if (apply && !expectedDigest)
    throw new Error('--apply requires the reviewed --expected-digest');
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key?.startsWith('sk_live_'))
    throw new Error('A live Stripe key is required');
  const { url, serviceRoleKey } = getSupabaseEnv({
    requireServiceRoleKey: true
  });
  const db = createClient(url, serviceRoleKey, {
    auth: { persistSession: false }
  });
  const stripe = new Stripe(key, { timeout: 15000, maxNetworkRetries: 1 });
  const { data: subscriptions, error } = await db
    .from('user_subscriptions')
    .select('user_id,plan_id,stripe_subscription_id')
    .not('stripe_subscription_id', 'is', null)
    .limit(1000);
  if (error || !subscriptions || subscriptions.length >= 1000)
    throw new Error('Subscription scan unavailable or truncated');
  const rows = [];
  const since = Math.floor(Date.now() / 1000) - 30 * 86400;
  for (const subscription of subscriptions) {
    // Scope the shared Stripe account to subscription IDs already owned by this app.
    let cursor;
    for (let page = 0; page < 10; page++) {
      const invoices = await stripe.invoices.list({
        subscription: subscription.stripe_subscription_id,
        created: { gte: since },
        status: 'paid',
        limit: 100,
        ...(cursor ? { starting_after: cursor } : {})
      });
      for (const invoice of invoices.data) {
        const row = renewalEventRow(invoice, subscription);
        if (row) rows.push(row);
      }
      if (!invoices.has_more) break;
      cursor = invoices.data.at(-1)?.id;
      if (!cursor || page === 9) throw new Error('Invoice scan incomplete');
    }
  }
  rows.sort((a, b) => a.idempotency_key.localeCompare(b.idempotency_key));
  const keys = rows.map((row) => row.idempotency_key);
  const existing = keys.length
    ? await db
        .from('conversion_events')
        .select('idempotency_key')
        .in('idempotency_key', keys)
    : { data: [], error: null };
  if (existing.error) throw new Error('Existing event scan failed');
  const found = new Set(existing.data.map((row) => row.idempotency_key));
  const missing = rows.filter((row) => !found.has(row.idempotency_key));
  const digest = createHash('sha256')
    .update(JSON.stringify(missing))
    .digest('hex');
  if (apply && digest !== expectedDigest)
    throw new Error('Reviewed reconciliation changed; run dry-run again');
  if (apply && missing.length) {
    const result = await db
      .from('conversion_events')
      .upsert(missing, {
        onConflict: 'idempotency_key',
        ignoreDuplicates: true
      });
    if (result.error) throw new Error('Analytics backfill failed');
  }
  console.log(
    JSON.stringify(
      {
        mode: apply ? 'apply' : 'dry-run',
        scannedSubscriptions: subscriptions.length,
        matchedRenewals: rows.length,
        missingEvents: missing.length,
        digest,
        amounts: missing.map((row) => ({
          occurredAt: row.occurred_at,
          amountPaid: row.metadata.amount_paid,
          currency: row.metadata.currency
        })),
        fulfillmentActions: 0
      },
      null,
      2
    )
  );
}
main().catch((error) => {
  console.error('[renewal-reconciliation]', error.message);
  process.exitCode = 1;
});
