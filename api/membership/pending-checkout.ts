import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';

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
    .select('id,provider,provider_order_id,product_id,metadata,status')
    .eq('user_id', userId)
    .eq('product_type', 'subscription')
    .in('status', ['pending', 'processing'])
    .order('created_at', { ascending: false });
  if (error) throw error;
  const order = orders?.[0];
  if (
    order?.status === 'pending' &&
    order.provider === 'stripe' &&
    order.provider_order_id &&
    stripe
  ) {
    const session = await stripe.checkout.sessions.retrieve(
      order.provider_order_id
    );
    if (session.status === 'expired') {
      const { error: expiryError } = await database
        .from('payment_orders')
        .update({ status: 'expired', updated_at: new Date().toISOString() })
        .eq('id', order.id)
        .eq('status', 'pending');
      if (expiryError) throw expiryError;
      return {
        error: 'Previous checkout expired. Please try again.',
        errorCode: 'CHECKOUT_EXPIRED'
      };
    }
    if (
      session.status === 'open' &&
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
