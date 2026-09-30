import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { getCorsHeadersForRequest } from '../utils/auth';
import { getStripeSecretKey } from '../utils/stripe-env';
import { SUBSCRIPTION_ACCESS_STATUSES } from './subscription-policy';
import type { CancellationSubscription } from '../../src/shared/subscription-cancellation';

export const config = { runtime: 'edge' };

interface StoredSubscription {
  id: string;
  plan_id: string;
  status: string;
  current_period_end: string | null;
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
  payment_provider: string | null;
}

class BillingError extends Error {
  constructor(
    readonly code: string,
    readonly status: number
  ) {
    super(code);
  }
}

function periodEnd(subscription: Stripe.Subscription): string | null {
  const legacy = (subscription as unknown as { current_period_end?: number })
    .current_period_end;
  const ends = subscription.items.data
    .map((item) => item.current_period_end)
    .filter(Number.isFinite);
  const end = legacy || (ends.length ? Math.max(...ends) : null);
  return end ? new Date(end * 1000).toISOString() : null;
}

function assertOwner(
  subscription: Stripe.Subscription,
  row: StoredSubscription,
  userId: string
) {
  const customerId =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer.id;
  // Never trust identifiers from the browser. Require the stored customer or
  // legacy subscription metadata, and reject any contradictory ownership data.
  if (
    (row.stripe_customer_id && row.stripe_customer_id !== customerId) ||
    (subscription.metadata.user_id &&
      subscription.metadata.user_id !== userId) ||
    (!row.stripe_customer_id && subscription.metadata.user_id !== userId)
  ) {
    throw new BillingError('SUBSCRIPTION_OWNERSHIP_MISMATCH', 403);
  }
}

function present(
  row: StoredSubscription,
  subscription?: Stripe.Subscription
): CancellationSubscription {
  const end = subscription ? periodEnd(subscription) : row.current_period_end;
  const status = subscription?.status || row.status;
  const scheduled = Boolean(
    subscription?.cancel_at_period_end || subscription?.cancel_at
  );
  return {
    id: row.id,
    planName: row.plan_id,
    status,
    currentPeriodEnd: subscription?.cancel_at
      ? new Date(subscription.cancel_at * 1000).toISOString()
      : end,
    cancelAtPeriodEnd:
      scheduled || status === 'canceled' || status === 'cancelled',
    canCancel: Boolean(
      subscription &&
      ['active', 'trialing', 'past_due', 'unpaid', 'paused'].includes(status) &&
      !scheduled &&
      end
    ),
    prepaid: !subscription
  };
}

export default async function handler(request: Request): Promise<Response> {
  const cors = getCorsHeadersForRequest(request);
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: {
        ...cors,
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store'
      }
    });
  if (request.method === 'OPTIONS')
    return new Response(null, { status: 204, headers: cors });
  if (!['GET', 'POST'].includes(request.method))
    return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
  const token = request.headers
    .get('Authorization')
    ?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) return json({ error: 'AUTH_REQUIRED' }, 401);
  try {
    const {
      SUPABASE_URL: url,
      SUPABASE_ANON_KEY: anon,
      SUPABASE_SERVICE_ROLE_KEY: service
    } = process.env;
    if (!url || !anon || !service)
      throw new BillingError('BILLING_UNAVAILABLE', 503);
    const auth = createClient(url, anon, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    });
    const {
      data: { user },
      error: authError
    } = await auth.auth.getUser(token);
    if (authError || !user) throw new BillingError('AUTH_REQUIRED', 401);
    const admin = createClient(url, service);
    let body: { subscriptionId?: unknown; currentPeriodEnd?: unknown } = {};
    if (request.method === 'POST') {
      try {
        body = await request.json();
      } catch {
        throw new BillingError('INVALID_REQUEST', 400);
      }
      if (
        !body ||
        typeof body.subscriptionId !== 'string' ||
        typeof body.currentPeriodEnd !== 'string'
      ) {
        throw new BillingError('INVALID_REQUEST', 400);
      }
    }
    let query = admin
      .from('user_subscriptions')
      .select(
        'id,plan_id,status,current_period_end,stripe_subscription_id,stripe_customer_id,payment_provider'
      )
      .eq('user_id', user.id);
    query =
      request.method === 'POST'
        ? query.eq('id', body.subscriptionId as string)
        : query.in('status', [
            ...SUBSCRIPTION_ACCESS_STATUSES,
            'unpaid',
            'paused'
          ]);
    const { data, error } = await query.order('created_at', {
      ascending: false
    });
    if (error) throw new BillingError('BILLING_UNAVAILABLE', 503);
    const rows = (data || []) as StoredSubscription[];
    let stripe: Stripe | undefined;
    const getStripe = () => {
      const key = getStripeSecretKey();
      if (!key) throw new BillingError('BILLING_UNAVAILABLE', 503);
      return (stripe ||= new Stripe(key, {
        apiVersion: '2026-06-24.dahlia',
        maxNetworkRetries: 2,
        timeout: 15000
      }));
    };
    const read = async (row: StoredSubscription) => {
      if (row.payment_provider === 'zpay' || !row.stripe_subscription_id)
        return undefined;
      const subscription = await getStripe().subscriptions.retrieve(
        row.stripe_subscription_id
      );
      assertOwner(subscription, row, user.id);
      return subscription;
    };
    if (request.method === 'GET') {
      const subscriptions = await Promise.all(
        rows.map(async (row) => present(row, await read(row)))
      );
      return json({ subscriptions });
    }
    const row = rows[0];
    if (!row) throw new BillingError('SUBSCRIPTION_NOT_FOUND', 404);
    let subscription = await read(row);
    if (!subscription) throw new BillingError('NOT_RECURRING', 409);
    let summary = present(row, subscription);
    if (!summary.cancelAtPeriodEnd) {
      if (!summary.canCancel) throw new BillingError('CANNOT_CANCEL', 409);
      if (summary.currentPeriodEnd !== body.currentPeriodEnd)
        throw new BillingError('BILLING_PERIOD_CHANGED', 409);
      subscription = await getStripe().subscriptions.update(
        subscription.id,
        { cancel_at_period_end: true },
        {
          // Scope transport retries to this operation. Reusing a period-wide
          // key would replay an old success after the user reactivates in the
          // billing portal. Concurrent calls are safe: both set the same flag.
          idempotencyKey: `cancel-at-period-end:${row.id}:${crypto.randomUUID()}`
        }
      );
      summary = present(row, subscription);
      if (!summary.cancelAtPeriodEnd)
        throw new BillingError('CANCELLATION_UNCONFIRMED', 502);
    }
    // Stripe is authoritative. Keep access/status/credits unchanged; the
    // existing subscription.updated/deleted webhooks reconcile lifecycle.
    let syncPending = false;
    try {
      const { error: syncError } = await admin
        .from('user_subscriptions')
        .update({
          cancel_at_period_end: true,
          current_period_end: summary.currentPeriodEnd,
          updated_at: new Date().toISOString()
        })
        .eq('id', row.id)
        .eq('user_id', user.id)
        .eq('stripe_subscription_id', subscription.id);
      syncPending = Boolean(syncError);
    } catch {
      syncPending = true;
    }
    return json({ subscription: summary, syncPending });
  } catch (error) {
    if (error instanceof BillingError)
      return json({ error: error.code }, error.status);
    // A timeout can occur after Stripe accepted the update. Retrying reads
    // current state first; setting the same cancellation flag is idempotent.
    console.error('[MembershipCancellation] request failed');
    return json({ error: 'BILLING_UNAVAILABLE' }, 503);
  }
}
