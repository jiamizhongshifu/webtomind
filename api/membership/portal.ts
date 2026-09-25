import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { getCorsHeadersForRequest } from '../utils/auth';
import { getStripeSecretKey } from '../utils/stripe-env';
import {
  SUBSCRIPTION_ACCESS_STATUSES,
  findSubscriptionBlockingCheckout
} from './subscription-policy';

export const config = {
  runtime: 'edge'
};

function createStripeClient(secretKey: string): Stripe {
  return new Stripe(secretKey, {
    apiVersion: '2026-06-24.dahlia'
  });
}

const ALLOWED_REDIRECT_DOMAINS = [
  'webtomind.com',
  'www.webtomind.com',
  'localhost:3000',
  'localhost:5173'
];

function jsonResponse(
  data: unknown,
  corsHeaders: Record<string, string>,
  status = 200
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders
    }
  });
}

function getBearerToken(request: Request): string | null {
  const authHeader = request.headers.get('Authorization') || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function isValidRedirectUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ALLOWED_REDIRECT_DOMAINS.some((domain) => {
      const domainHost = domain.split(':')[0];
      if (domainHost === 'localhost') return parsed.host === domain;
      return (
        parsed.host === domainHost || parsed.host.endsWith(`.${domainHost}`)
      );
    });
  } catch {
    return false;
  }
}

function getReturnUrl(request: Request, requestedUrl?: string): string {
  const defaultUrl = `${process.env.APP_URL || new URL(request.url).origin}/pricing?portal=return`;
  return requestedUrl && isValidRedirectUrl(requestedUrl)
    ? requestedUrl
    : defaultUrl;
}

function getStripeCustomerId(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null
): string | null {
  if (!customer) return null;
  return typeof customer === 'string' ? customer : customer.id || null;
}

export default async function handler(request: Request) {
  const corsHeaders = getCorsHeadersForRequest(request);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, corsHeaders, 405);
  }

  const stripeSecretKey = getStripeSecretKey();
  if (!stripeSecretKey) {
    return jsonResponse(
      { error: 'Payment service not configured' },
      corsHeaders,
      500
    );
  }
  const stripe = createStripeClient(stripeSecretKey);

  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return jsonResponse({ error: 'Database not configured' }, corsHeaders, 500);
  }

  const token = getBearerToken(request);
  if (!token) {
    return jsonResponse(
      { error: 'Missing Authorization header' },
      corsHeaders,
      401
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    returnUrl?: string;
  };

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });
  const {
    data: { user },
    error: authError
  } = await authClient.auth.getUser(token);
  if (authError || !user) {
    return jsonResponse({ error: 'Invalid token' }, corsHeaders, 401);
  }

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: subscriptionCandidates, error: subscriptionError } = await admin
    .from('user_subscriptions')
    .select(
      'id,status,current_period_end,stripe_customer_id,stripe_subscription_id,payment_provider'
    )
    .eq('user_id', user.id)
    .in('status', [...SUBSCRIPTION_ACCESS_STATUSES])
    .order('created_at', { ascending: false });

  if (subscriptionError) {
    console.error('[MembershipPortal] subscription lookup failed:', {
      userId: user.id,
      message: subscriptionError.message
    });
    return jsonResponse(
      { error: 'Failed to load subscription' },
      corsHeaders,
      500
    );
  }

  const subscription = findSubscriptionBlockingCheckout(subscriptionCandidates);
  if (!subscription) {
    return jsonResponse(
      { error: 'No paid subscription found' },
      corsHeaders,
      404
    );
  }
  if (subscription.payment_provider === 'zpay') {
    return jsonResponse(
      { error: 'Prepaid Alipay plans do not use the Stripe billing portal' },
      corsHeaders,
      400
    );
  }

  let customerId =
    typeof subscription.stripe_customer_id === 'string'
      ? subscription.stripe_customer_id
      : null;

  if (!customerId && subscription.stripe_subscription_id) {
    const stripeSubscription = await stripe.subscriptions.retrieve(
      subscription.stripe_subscription_id
    );
    customerId = getStripeCustomerId(stripeSubscription.customer);
    if (customerId) {
      await admin
        .from('user_subscriptions')
        .update({
          stripe_customer_id: customerId,
          updated_at: new Date().toISOString()
        })
        .eq('id', subscription.id);
    }
  }

  if (!customerId) {
    return jsonResponse(
      { error: 'Subscription customer is not available' },
      corsHeaders,
      400
    );
  }

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: getReturnUrl(request, body.returnUrl)
  });

  return jsonResponse({ url: portalSession.url }, corsHeaders);
}
