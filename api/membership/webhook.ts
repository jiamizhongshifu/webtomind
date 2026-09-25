import { createClient, SupabaseClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { getCorsHeadersForRequest } from '../utils/auth';
import { recordConversionEvent } from '../utils/conversion-events';
import {
  FREE_DAILY_CREDITS,
  FREE_DAILY_IMAGE_GENERATION_LIMIT
} from '../../src/shared/credit-policy';
import {
  getStripeSecretKey,
  getStripeWebhookSecret
} from '../utils/stripe-env';
import {
  SUBSCRIPTION_ACCESS_STATUSES,
  findSubscriptionBlockingCheckout,
  hasPaidSubscriptionAccess,
  isEligibleForSubscriptionCreditGrant
} from './subscription-policy';
import { REFERRAL_SUBSCRIPTION_REWARD_CREDITS } from '../../src/shared/referral-rewards';

export const config = {
  runtime: 'edge'
};

function createStripeClient(secretKey: string): Stripe {
  return new Stripe(secretKey, {
    apiVersion: '2026-06-24.dahlia'
  });
}

interface PaymentOrder {
  id: string;
  user_id: string;
  amount: number | null;
  currency: string | null;
  status?: string | null;
  product_type: string | null;
  product_id: string | null;
  provider_order_id?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface VerifiedCheckoutPayment {
  id: string;
  amount_total: number | null;
  currency: string | null;
  client_reference_id: string | null;
  customer?: string | { id?: string } | null;
  subscription?: string | { id?: string } | null;
  metadata?: Record<string, string> | null;
  payment_status: string;
  status: string | null;
  provider?: 'stripe' | 'zpay';
}

async function getRawBody(request: Request): Promise<string> {
  return request.text();
}

function assertPaidCheckoutSession(
  order: PaymentOrder,
  payment: VerifiedCheckoutPayment
) {
  if (payment.status !== 'complete' || payment.payment_status !== 'paid') {
    throw new Error(
      `Checkout session is not paid: status=${payment.status}, payment_status=${payment.payment_status}`
    );
  }

  if (
    payment.client_reference_id &&
    payment.client_reference_id !== order.user_id
  ) {
    throw new Error('Checkout session user does not match payment order');
  }

  if (
    payment.metadata?.product_type &&
    payment.metadata.product_type !== order.product_type
  ) {
    throw new Error(
      'Checkout session product type does not match payment order'
    );
  }

  if (
    payment.metadata?.product_id &&
    payment.metadata.product_id !== order.product_id
  ) {
    throw new Error('Checkout session product id does not match payment order');
  }

  if (
    typeof payment.amount_total === 'number' &&
    typeof order.amount === 'number' &&
    payment.amount_total !== order.amount
  ) {
    throw new Error('Checkout session amount does not match payment order');
  }

  if (
    payment.currency &&
    order.currency &&
    payment.currency.toLowerCase() !== order.currency.toLowerCase()
  ) {
    throw new Error('Checkout session currency does not match payment order');
  }

  if (
    order.product_type === 'subscription' &&
    (payment.provider || 'stripe') === 'stripe' &&
    !payment.subscription
  ) {
    throw new Error('Paid subscription checkout has no Stripe subscription id');
  }
}

function getSubscriptionCreditGrantPeriod(
  subscriptionStart: Date,
  subscriptionEnd: Date
) {
  const monthStart = new Date(
    Date.UTC(
      subscriptionStart.getUTCFullYear(),
      subscriptionStart.getUTCMonth(),
      1
    )
  );
  const nextMonthStart = new Date(
    Date.UTC(
      subscriptionStart.getUTCFullYear(),
      subscriptionStart.getUTCMonth() + 1,
      1
    )
  );

  return {
    start:
      subscriptionStart.getTime() > monthStart.getTime()
        ? subscriptionStart
        : monthStart,
    end:
      subscriptionEnd.getTime() < nextMonthStart.getTime()
        ? subscriptionEnd
        : nextMonthStart
  };
}

function getStripeCustomerId(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null
): string | null {
  if (!customer) return null;
  return typeof customer === 'string' ? customer : customer.id || null;
}

function getStripeSubscriptionDate(
  subscription: Stripe.Subscription,
  field: 'current_period_start' | 'current_period_end'
): string {
  const timestamp =
    (subscription as unknown as Record<string, number | undefined>)[field] ||
    Math.floor(Date.now() / 1000);
  return new Date(timestamp * 1000).toISOString();
}

function normalizeStripeSubscriptionStatus(
  status: Stripe.Subscription.Status
): 'active' | 'canceled' | 'past_due' | 'incomplete' | 'trialing' {
  if (status === 'active') return 'active';
  if (status === 'trialing') return 'trialing';
  if (status === 'canceled') return 'canceled';
  if (status === 'incomplete' || status === 'incomplete_expired') {
    return 'incomplete';
  }
  return 'past_due';
}

function getDailyImageGenerationLimit(limits: unknown): number {
  if (!limits || typeof limits !== 'object' || Array.isArray(limits)) return -1;
  const raw = (limits as Record<string, unknown>).dailyImageGeneration;
  const parsed = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(parsed) ? Math.floor(parsed) : -1;
}

interface PaidSubscriptionValues {
  user_id: string;
  plan_id: string;
  status: 'active';
  billing_cycle: string;
  current_period_start: string;
  current_period_end: string;
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
  payment_provider?: 'stripe' | 'zpay';
  external_subscription_id?: string | null;
  updated_at: string;
}

export async function reconcilePaidSubscription(
  supabase: SupabaseClient,
  values: PaidSubscriptionValues
): Promise<void> {
  const { data: subscriptionCandidates, error: lookupError } = await supabase
    .from('user_subscriptions')
    .select('id,status,current_period_end')
    .eq('user_id', values.user_id)
    .in('status', [...SUBSCRIPTION_ACCESS_STATUSES])
    .order('created_at', { ascending: false });

  if (lookupError) throw lookupError;

  const existing = findSubscriptionBlockingCheckout(subscriptionCandidates);
  if (existing) {
    const { error: updateError } = await supabase
      .from('user_subscriptions')
      .update(values)
      .eq('id', existing.id);
    if (updateError) throw updateError;
    return;
  }

  const { error: insertError } = await supabase
    .from('user_subscriptions')
    .insert(values);
  if (insertError) throw insertError;
}

function getOrderCheckoutAttribution(
  order: PaymentOrder
): Record<string, unknown> {
  const metadata = order.metadata || {};
  const attribution = metadata.checkout_attribution;
  return attribution && typeof attribution === 'object'
    ? (attribution as Record<string, unknown>)
    : {};
}

function getOrderCtaSource(order: PaymentOrder): string | null {
  const attribution = getOrderCheckoutAttribution(order);
  return typeof attribution.cta_source === 'string'
    ? attribution.cta_source
    : null;
}

async function recordPaymentWebhookEvent(params: {
  supabase: SupabaseClient;
  eventName:
    | 'purchase_webhook_succeeded'
    | 'purchase_webhook_failed'
    | 'checkout_session_expired';
  eventId?: string;
  order: PaymentOrder;
  payment: VerifiedCheckoutPayment;
  errorMessage?: string;
}) {
  const { supabase, eventName, eventId, order, payment, errorMessage } = params;
  const checkoutAttribution = getOrderCheckoutAttribution(order);
  const provider = payment.provider || 'stripe';

  await recordConversionEvent(supabase, {
    eventName,
    eventSource: `${provider}_webhook`,
    userId: order.user_id,
    entityType: 'payment_order',
    entityId: order.id,
    orderId: order.id,
    productType: order.product_type,
    productId: order.product_id,
    ctaSource: getOrderCtaSource(order),
    idempotencyKey: `${eventName}:${order.id}`,
    metadata: {
      payment_provider: provider,
      provider_event_id: eventId,
      provider_payment_id: payment.id,
      provider_customer_id:
        typeof payment.customer === 'string' ? payment.customer : null,
      provider_subscription_id:
        typeof payment.subscription === 'string' ? payment.subscription : null,
      ...(provider === 'stripe'
        ? {
            stripe_event_id: eventId,
            checkout_session_id: payment.id,
            stripe_customer_id:
              typeof payment.customer === 'string' ? payment.customer : null,
            stripe_subscription_id:
              typeof payment.subscription === 'string'
                ? payment.subscription
                : null
          }
        : {}),
      payment_status: payment.payment_status,
      session_status: payment.status,
      amount_total: payment.amount_total,
      currency: payment.currency,
      checkout_attribution: checkoutAttribution,
      error_message: errorMessage
    }
  });
}

async function expireOrder(
  supabase: SupabaseClient,
  orderId: string,
  session: Stripe.Checkout.Session,
  eventId?: string
) {
  const { data: updatedOrder, error: updateError } = await supabase
    .from('payment_orders')
    .update({
      status: 'expired',
      provider_order_id: session.id,
      updated_at: new Date().toISOString()
    })
    .eq('id', orderId)
    .eq('status', 'pending')
    .select('*')
    .maybeSingle();

  if (updateError) {
    throw updateError;
  }

  let order = updatedOrder as PaymentOrder | null;
  if (!order) {
    const { data: existingOrder, error: lookupError } = await supabase
      .from('payment_orders')
      .select('*')
      .eq('id', orderId)
      .maybeSingle();

    if (lookupError) {
      throw lookupError;
    }
    if (!existingOrder) {
      console.warn(`[Webhook] Expired checkout order ${orderId} was not found`);
      return;
    }
    if (existingOrder.status !== 'expired') {
      console.log(
        `[Webhook] Ignoring checkout expiration for order ${orderId} with terminal status ${existingOrder.status}`
      );
      return;
    }
    order = existingOrder as PaymentOrder;
  }

  await recordPaymentWebhookEvent({
    supabase,
    eventName: 'checkout_session_expired',
    eventId,
    order,
    payment: session
  });
}

export async function syncStripeSubscription(
  supabase: SupabaseClient,
  subscription: Stripe.Subscription
) {
  const normalizedStatus = normalizeStripeSubscriptionStatus(
    subscription.status
  );
  const currentPeriodStart = getStripeSubscriptionDate(
    subscription,
    'current_period_start'
  );
  const currentPeriodEnd = getStripeSubscriptionDate(
    subscription,
    'current_period_end'
  );
  const customerId = getStripeCustomerId(subscription.customer);
  const { data: storedSubscription, error } = await supabase
    .from('user_subscriptions')
    .update({
      status: normalizedStatus,
      cancel_at_period_end: subscription.cancel_at_period_end,
      current_period_start: currentPeriodStart,
      current_period_end: currentPeriodEnd,
      ...(customerId ? { stripe_customer_id: customerId } : {}),
      updated_at: new Date().toISOString()
    })
    .eq('stripe_subscription_id', subscription.id)
    .select('user_id,plan_id')
    .maybeSingle();

  if (error) throw error;

  if (!storedSubscription?.user_id) {
    return null;
  }

  const keepsPaidAccess = hasPaidSubscriptionAccess({
    status: normalizedStatus,
    current_period_end: currentPeriodEnd
  });

  if (!keepsPaidAccess) {
    const { error: revokeError } = await supabase
      .from('user_credits')
      .update({
        subscription_credits: 0,
        subscription_credits_max: 0,
        daily_credits: FREE_DAILY_CREDITS,
        daily_credits_max: FREE_DAILY_CREDITS,
        daily_image_gen_used: 0,
        daily_image_gen_max: FREE_DAILY_IMAGE_GENERATION_LIMIT,
        last_daily_refresh: new Date().toISOString().split('T')[0],
        updated_at: new Date().toISOString()
      })
      .eq('user_id', storedSubscription.user_id);

    if (revokeError) throw revokeError;
  } else {
    const { data: plan, error: planError } = await supabase
      .from('subscription_plans')
      .select('limits')
      .eq('id', storedSubscription.plan_id)
      .maybeSingle();
    if (planError) throw planError;
    if (!plan) throw new Error('Active subscription plan not found');

    const { error: restoreError } = await supabase
      .from('user_credits')
      .update({
        daily_credits: 0,
        daily_credits_max: 0,
        daily_image_gen_used: 0,
        daily_image_gen_max: getDailyImageGenerationLimit(plan?.limits),
        last_daily_refresh: new Date().toISOString().split('T')[0],
        updated_at: new Date().toISOString()
      })
      .eq('user_id', storedSubscription.user_id);
    if (restoreError) throw restoreError;
  }

  return {
    userId: storedSubscription.user_id,
    planId: storedSubscription.plan_id,
    status: normalizedStatus,
    currentPeriodEnd
  };
}

export async function recordStripeSubscriptionRenewalEvent(params: {
  supabase: SupabaseClient;
  invoice: Stripe.Invoice;
  eventId: string;
  userId: string;
  planId: string;
  subscriptionId: string;
}) {
  const { supabase, invoice, eventId, userId, planId, subscriptionId } = params;
  await recordConversionEvent(supabase, {
    eventName: 'subscription_renewal_succeeded',
    eventSource: 'stripe_webhook',
    userId,
    entityType: 'stripe_invoice',
    entityId: invoice.id,
    productType: 'subscription',
    productId: planId,
    ctaSource: 'subscription_renewal',
    idempotencyKey: `subscription_renewal_succeeded:${invoice.id}`,
    metadata: {
      stripe_event_id: eventId,
      stripe_invoice_id: invoice.id,
      stripe_subscription_id: subscriptionId,
      billing_reason: invoice.billing_reason,
      amount_paid: invoice.amount_paid,
      currency: invoice.currency,
      acquisition_event: false
    }
  });
}

export class PaymentOrderInProgressError extends Error {
  constructor(orderId: string) {
    super(`Payment order ${orderId} is being fulfilled by another delivery`);
    this.name = 'PaymentOrderInProgressError';
  }
}

/**
 * 鏍稿績灞ヨ閫昏緫锛氬彂鏀剧Н鍒嗘垨婵€娲讳細鍛?
 * 浣跨敤鍘熷瓙鏇存柊闃叉绔炴€佹潯浠跺鑷撮噸澶嶅饱琛?
 */
export async function fulfillOrder(
  supabase: SupabaseClient,
  orderId: string,
  payment: VerifiedCheckoutPayment,
  eventId?: string
) {
  const staleProcessingCutoff = new Date(
    Date.now() - 10 * 60 * 1000
  ).toISOString();
  const { error: staleRecoveryError } = await supabase
    .from('payment_orders')
    .update({ status: 'failed', updated_at: new Date().toISOString() })
    .eq('id', orderId)
    .eq('status', 'processing')
    .lt('updated_at', staleProcessingCutoff);
  if (staleRecoveryError) {
    console.error('[Webhook] Failed to recover stale payment order:', {
      orderId,
      message: staleRecoveryError.message
    });
    throw staleRecoveryError;
  }

  // 1. 鍘熷瓙鏇存柊璁㈠崟鐘舵€侊紝闃叉绔炴€佹潯浠?
  // 鍏佽浠?pending/failed 杩涘叆 processing锛岄伩鍏嶄竴娆″け璐ュ悗鏃犳硶鑷姩鎭㈠
  const { data: order, error: orderError } = await supabase
    .from('payment_orders')
    .update({ status: 'processing', updated_at: new Date().toISOString() })
    .eq('id', orderId)
    .in('status', ['pending', 'failed'])
    .select('*')
    .maybeSingle();

  if (orderError) {
    console.error('[Webhook] Failed to lock payment order:', {
      orderId,
      message: orderError.message
    });
    throw orderError;
  }

  // 濡傛灉娌℃湁鏇存柊鍒拌褰曪紝璇存槑璁㈠崟宸插鐞嗘垨涓嶅瓨鍦?
  if (!order) {
    console.log(
      `[Webhook] Order ${orderId} already processed, locked, or not found, skipping`
    );
    const { data: existingOrder } = await supabase
      .from('payment_orders')
      .select('*')
      .eq('id', orderId)
      .maybeSingle();
    if (existingOrder?.status === 'succeeded') {
      await recordPaymentWebhookEvent({
        supabase,
        eventName: 'purchase_webhook_succeeded',
        eventId,
        order: existingOrder as PaymentOrder,
        payment
      });
    }
    // Another delivery (e.g. the ZPAY notify and the browser return arriving
    // together) holds the order. Acknowledging now would stop provider
    // retries even if that attempt then fails and leaves a paid order
    // unfulfilled, so make the provider deliver again later.
    if (existingOrder?.status === 'processing') {
      throw new PaymentOrderInProgressError(orderId);
    }
    return;
  }

  try {
    const paymentOrder = order as PaymentOrder;
    assertPaidCheckoutSession(paymentOrder, payment);

    const userId = paymentOrder.user_id;

    // 2. 灞ヨ閫昏緫
    if (paymentOrder.product_type === 'subscription') {
      const planId = paymentOrder.product_id;
      if (!planId) throw new Error('Subscription payment order has no plan id');
      const billingCycle =
        paymentOrder.metadata?.billingCycle === 'yearly' ? 'yearly' : 'monthly';

      const { data: plan } = await supabase
        .from('subscription_plans')
        .select('*')
        .eq('id', planId)
        .single();

      if (!plan) throw new Error('Plan details not found');

      const subscriptionStart = new Date();
      const expiresAt = new Date(subscriptionStart);
      if (billingCycle === 'yearly') {
        expiresAt.setFullYear(expiresAt.getFullYear() + 1);
      } else {
        expiresAt.setMonth(expiresAt.getMonth() + 1);
      }
      const creditGrantPeriod = getSubscriptionCreditGrantPeriod(
        subscriptionStart,
        expiresAt
      );

      await reconcilePaidSubscription(supabase, {
        user_id: userId,
        plan_id: planId,
        status: 'active',
        billing_cycle: billingCycle,
        current_period_start: subscriptionStart.toISOString(),
        current_period_end: expiresAt.toISOString(),
        stripe_subscription_id:
          (payment.provider || 'stripe') === 'stripe' &&
          typeof payment.subscription === 'string'
            ? payment.subscription
            : null,
        stripe_customer_id:
          (payment.provider || 'stripe') === 'stripe' &&
          typeof payment.customer === 'string'
            ? payment.customer
            : null,
        payment_provider: payment.provider || 'stripe',
        external_subscription_id:
          (payment.provider || 'stripe') === 'zpay' ? payment.id : null,
        updated_at: new Date().toISOString()
      });

      // 鏇存柊鐢ㄦ埛鐨勫浘鐗囩敓鎴愰檺鍒讹紙Pro/Max 鏃犻檺鍒讹級
      const newImageGenMax = plan.limits?.dailyImageGeneration ?? -1;
      const today = new Date().toISOString().split('T')[0];
      const { error: creditLimitError } = await supabase
        .from('user_credits')
        .update({
          daily_credits: 0,
          daily_credits_max: 0,
          last_daily_refresh: today,
          daily_image_gen_max: newImageGenMax,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId);
      if (creditLimitError) throw creditLimitError;

      if (plan.monthly_credits > 0) {
        const { error: creditGrantError } = await supabase.rpc(
          'add_subscription_credits',
          {
            p_user_id: userId,
            p_amount: plan.monthly_credits,
            p_source: 'subscription_reward',
            p_metadata: {
              plan_id: planId,
              order_id: orderId,
              checkout_session_id: payment.id,
              payment_provider: payment.provider || 'stripe',
              grant_period_start: creditGrantPeriod.start.toISOString(),
              grant_period_end: creditGrantPeriod.end.toISOString(),
              idempotency_key: `order:${orderId}`
            }
          }
        );
        if (creditGrantError) throw creditGrantError;
      }

      const { error: referralSubscriptionRewardError } = await supabase.rpc(
        'grant_referral_subscription_reward',
        {
          p_referee_id: userId,
          p_order_id: orderId,
          p_amount: REFERRAL_SUBSCRIPTION_REWARD_CREDITS
        }
      );
      if (referralSubscriptionRewardError) {
        throw referralSubscriptionRewardError;
      }
    } else if (paymentOrder.product_type === 'credit_package') {
      const packageId = paymentOrder.product_id;
      const { data: pkg } = await supabase
        .from('credit_packages')
        .select('*')
        .eq('id', packageId)
        .single();

      if (!pkg) throw new Error('Package details not found');

      const { error: creditGrantError } = await supabase.rpc(
        'add_bonus_credits',
        {
          p_user_id: userId,
          p_amount: pkg.credits,
          p_source: 'package_purchase',
          p_metadata: {
            package_id: packageId,
            order_id: orderId,
            checkout_session_id: payment.id,
            payment_provider: payment.provider || 'stripe',
            idempotency_key: `order:${orderId}`
          }
        }
      );
      if (creditGrantError) throw creditGrantError;
    } else if (paymentOrder.product_type === 'api_credit_package') {
      const packageId = paymentOrder.product_id;
      const snapshot = Number(paymentOrder.metadata?.apiCreditCents);
      const hasValidSnapshot = Number.isSafeInteger(snapshot) && snapshot > 0;
      let creditCents = hasValidSnapshot ? snapshot : 0;

      // New orders carry the exact catalog amount in their immutable payment
      // order metadata. Keep the catalog lookup only for legacy orders that
      // were created before the snapshot field existed.
      if (!hasValidSnapshot) {
        const { data: pkg } = await supabase
          .from('api_credit_packages')
          .select('id,credit_cents')
          .eq('id', packageId)
          .single();
        if (!pkg) throw new Error('API credit package details not found');
        creditCents = Number(pkg.credit_cents);
      }
      if (!Number.isSafeInteger(creditCents) || creditCents <= 0) {
        throw new Error('API credit package amount is invalid');
      }

      const { data: walletGrant, error: walletGrantError } = await supabase.rpc(
        'grant_api_wallet_credit',
        {
          p_user_id: userId,
          p_amount_cents: creditCents,
          p_source: 'api_credit_package',
          p_metadata: {
            package_id: packageId,
            order_id: orderId,
            checkout_session_id: payment.id,
            payment_provider: payment.provider || 'stripe',
            idempotency_key: `order:${orderId}`
          }
        }
      );
      if (
        walletGrantError ||
        (walletGrant &&
          typeof walletGrant === 'object' &&
          (walletGrant as { ok?: unknown }).ok === false)
      ) {
        throw walletGrantError || new Error('API wallet credit grant failed');
      }
    }

    // 3. 鏇存柊璁㈠崟鐘舵€?
    const { data: succeededOrder, error: orderSuccessError } = await supabase
      .from('payment_orders')
      .update({
        status: 'succeeded',
        updated_at: new Date().toISOString(),
        provider_order_id:
          (payment.provider || 'stripe') === 'zpay'
            ? paymentOrder.provider_order_id
            : payment.id,
        metadata: {
          ...(paymentOrder.metadata || {}),
          provider_payment_id: payment.id,
          provider_event_id: eventId
        }
      })
      .eq('id', orderId)
      .eq('status', 'processing')
      .select('id')
      .maybeSingle();
    if (orderSuccessError) throw orderSuccessError;
    if (!succeededOrder) {
      throw new Error(
        `Payment order ${orderId} could not transition from processing to succeeded`
      );
    }
    await recordPaymentWebhookEvent({
      supabase,
      eventName: 'purchase_webhook_succeeded',
      eventId,
      order: paymentOrder,
      payment
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const { error: failureUpdateError } = await supabase
      .from('payment_orders')
      .update({
        status: 'failed',
        updated_at: new Date().toISOString(),
        metadata: {
          ...(order.metadata || {}),
          last_webhook_error: message,
          last_webhook_error_at: new Date().toISOString()
        }
      })
      .eq('id', orderId)
      .eq('status', 'processing');
    if (failureUpdateError) {
      console.error('[Webhook] Failed to mark payment order as failed:', {
        orderId,
        message: failureUpdateError.message
      });
    }
    await recordPaymentWebhookEvent({
      supabase,
      eventName: 'purchase_webhook_failed',
      eventId,
      order: order as PaymentOrder,
      payment,
      errorMessage: message
    });
    throw error;
  }
}

export default async function handler(request: Request) {
  const corsHeaders = getCorsHeadersForRequest(request);

  function jsonResponse(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
      status,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }

  if (request.method === 'OPTIONS')
    return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== 'POST')
    return jsonResponse({ error: 'Method not allowed' }, 405);

  const signature = request.headers.get('stripe-signature');
  if (!signature)
    return jsonResponse({ error: 'Missing stripe-signature' }, 400);

  const webhookSecret = getStripeWebhookSecret();
  if (!webhookSecret)
    return jsonResponse({ error: 'Webhook secret not configured' }, 500);
  const stripeSecretKey = getStripeSecretKey();
  if (!stripeSecretKey)
    return jsonResponse({ error: 'Stripe secret key not configured' }, 500);
  const stripe = createStripeClient(stripeSecretKey);

  const supabase = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );

  const rawBody = await getRawBody(request);
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      webhookSecret
    );
  } catch (error: unknown) {
    console.warn('[Webhook] Stripe signature verification failed:', error);
    return jsonResponse({ error: 'Invalid stripe-signature' }, 400);
  }

  try {
    console.log(`[Webhook] Processing Stripe event: ${event.type}`);

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const orderId = session.metadata?.order_id;
      if (orderId) {
        await fulfillOrder(supabase, orderId, session, event.id);
      }
    } else if (event.type === 'checkout.session.expired') {
      const session = event.data.object as Stripe.Checkout.Session;
      const orderId = session.metadata?.order_id;
      if (orderId) {
        await expireOrder(supabase, orderId, session, event.id);
      }
    } else if (event.type === 'invoice.payment_succeeded') {
      const invoice = event.data.object as Stripe.Invoice;
      if (invoice.billing_reason !== 'subscription_cycle') {
        return jsonResponse({ success: true });
      }

      const subscriptionId =
        (invoice as { subscription?: string | null }).subscription ?? null;
      if (!subscriptionId) {
        return jsonResponse({ success: true });
      }

      const liveSubscription =
        await stripe.subscriptions.retrieve(subscriptionId);
      const synchronized = await syncStripeSubscription(
        supabase,
        liveSubscription
      );

      if (!synchronized) {
        return jsonResponse({ success: true });
      }

      await recordStripeSubscriptionRenewalEvent({
        supabase,
        invoice,
        eventId: event.id,
        userId: synchronized.userId,
        planId: synchronized.planId,
        subscriptionId
      });

      if (!isEligibleForSubscriptionCreditGrant(synchronized)) {
        return jsonResponse({ success: true });
      }

      const { error: grantError } = await supabase.rpc(
        'grant_subscription_credits_if_due',
        {
          p_user_id: synchronized.userId
        }
      );

      if (grantError) {
        throw grantError;
      }
    } else if (event.type === 'customer.subscription.updated') {
      const sub = event.data.object as Stripe.Subscription;
      await syncStripeSubscription(supabase, sub);
    } else if (event.type === 'customer.subscription.deleted') {
      const sub = event.data.object as Stripe.Subscription;
      await syncStripeSubscription(supabase, sub);
    }

    return jsonResponse({ success: true });
  } catch (error: unknown) {
    console.error('[Webhook] Stripe Error:', error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      500
    );
  }
}
