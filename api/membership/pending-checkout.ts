import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';

const ORPHAN_RECONCILIATION_DELAY_MS = 30 * 60 * 1000;
const MAX_RECONCILIATION_PAGES = 5;

// Read-only reconciliation. An incomplete provider scan never releases an order.
export async function findOrphanCheckoutSession(
  stripe: Stripe,
  order: { id: string; created_at: string; user_id: string },
  now = Date.now()
): Promise<{ complete: boolean; session: Stripe.Checkout.Session | null }> {
  const createdAt = Date.parse(order.created_at);
  if (
    !Number.isFinite(createdAt) ||
    now - createdAt < ORPHAN_RECONCILIATION_DELAY_MS
  ) {
    return { complete: false, session: null };
  }
  let cursor: string | undefined;
  const matches: Stripe.Checkout.Session[] = [];
  for (let page = 0; page < MAX_RECONCILIATION_PAGES; page++) {
    const sessions = await stripe.checkout.sessions.list({
      // Include clock skew and scan through the present, not just the first
      // minutes after creation. A lost response may still have created a session.
      created: { gte: Math.floor(createdAt / 1000) - 60 },
      limit: 100,
      ...(cursor ? { starting_after: cursor } : {})
    });
    for (const session of sessions.data) {
      if (session.metadata?.order_id !== order.id) continue;
      if (
        session.metadata?.user_id !== order.user_id ||
        session.mode !== 'subscription'
      ) {
        return { complete: false, session: null };
      }
      matches.push(session);
    }
    if (!sessions.has_more) {
      return { complete: matches.length <= 1, session: matches[0] || null };
    }
    cursor = sessions.data.at(-1)?.id;
    if (!cursor) break;
  }
  return { complete: false, session: null };
}

// Called only after the database has serialized competing subscription orders.
export async function resolvePendingSubscriptionCheckout(
  database: SupabaseClient,
  stripe: Stripe | null,
  userId: string,
  productId: string,
  billingCycle: string
): Promise<Record<string, unknown>> {
  const { data: orders, error } = await database
    .from('payment_orders')
    .select(
      'id,user_id,created_at,provider,provider_order_id,product_id,metadata,status'
    )
    .eq('user_id', userId)
    .eq('product_type', 'subscription')
    .in('status', ['pending', 'processing'])
    .order('created_at', { ascending: false });
  if (error) throw error;
  const order = orders?.[0];
  if (order?.status === 'pending' && order.provider === 'stripe' && stripe) {
    let session: Stripe.Checkout.Session | null = null;
    let absenceConfirmed = false;
    if (order.provider_order_id) {
      session = await stripe.checkout.sessions.retrieve(
        order.provider_order_id
      );
    } else {
      const recovered = await findOrphanCheckoutSession(stripe, order);
      if (recovered.complete) {
        session = recovered.session;
        absenceConfirmed = !session;
        if (session) {
          const { data: linked, error: linkError } = await database
            .from('payment_orders')
            .update({
              provider_order_id: session.id,
              updated_at: new Date().toISOString()
            })
            .eq('id', order.id)
            .eq('status', 'pending')
            .is('provider_order_id', null)
            .select('id')
            .maybeSingle();
          if (linkError) throw linkError;
          // A webhook or competing request has changed the order. Do not return
          // a payable URL based on our now stale snapshot.
          if (!linked) session = null;
        }
      }
    }
    if (absenceConfirmed || session?.status === 'expired') {
      let expiry = database
        .from('payment_orders')
        .update({ status: 'expired', updated_at: new Date().toISOString() })
        .eq('id', order.id)
        .eq('status', 'pending');
      expiry = absenceConfirmed
        ? expiry.is('provider_order_id', null)
        : expiry.eq('provider_order_id', session!.id);
      const { data: expired, error: expiryError } = await expiry
        .select('id')
        .maybeSingle();
      if (expiryError) throw expiryError;
      if (expired)
        return {
          error: 'Previous checkout expired. Please try again.',
          errorCode: 'CHECKOUT_EXPIRED'
        };
    }
    if (
      session?.status === 'open' &&
      session.url &&
      order.product_id === productId &&
      order.metadata?.billingCycle === billingCycle
    ) {
      return {
        id: order.id,
        sessionId: session.id,
        url: session.url,
        paymentProvider: 'stripe',
        reused: true
      };
    }
  }
  return {
    error:
      'A subscription checkout is already awaiting payment confirmation. Please finish that checkout before starting another.',
    errorCode: 'SUBSCRIPTION_CHECKOUT_IN_PROGRESS',
    ...(order ? { orderId: order.id } : {})
  };
}

export function isDefiniteCheckoutRejection(error: unknown): boolean {
  const type =
    error && typeof error === 'object' && 'type' in error ? error.type : '';
  return [
    'StripeInvalidRequestError',
    'StripeAuthenticationError',
    'StripePermissionError',
    'StripeCardError'
  ].includes(String(type));
}
