import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import {
  buildZpayCheckoutFields,
  buildZpayOutTradeNo,
  parseCnyMoneyToCents,
  parseUniqueZpayParameters,
  verifyZpayParameters
} from '../../../api/utils/zpay';
import {
  CommerceError,
  PRODUCT_SCOPE,
  SITE_ORIGIN,
  checkoutInput,
  paymentMetadata,
  verifyMetadata,
  returnUrls,
  assertCheckoutUrl,
  type Order
} from './policy';

export interface CommerceEnv {
  SISKILL_COMMERCE_ENABLED?: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SUPABASE_ANON_KEY?: string;
  SISKILL_AUTH_REDIRECTS_READY?: string;
  SISKILL_STRIPE_SECRET_KEY?: string;
  SISKILL_STRIPE_WEBHOOK_SECRET?: string;
  SISKILL_ZPAY_PID?: string;
  SISKILL_ZPAY_KEY?: string;
  SISKILL_PACKAGES?: {
    head(key: string): Promise<{
      size: number;
      customMetadata?: Record<string, string>;
    } | null>;
    get(key: string): Promise<{
      body: ReadableStream;
      size: number;
      customMetadata?: Record<string, string>;
    } | null>;
  };
}
export interface Dependencies {
  db: SupabaseClient;
  stripe?: Stripe;
}
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    }
  });
function fail(error: { message: string } | null) {
  if (error) throw new CommerceError('COMMERCE_UNAVAILABLE', 503);
}
async function orderById(db: SupabaseClient, id: string) {
  if (!/^[a-f0-9-]{36}$/.test(id))
    throw new CommerceError('ORDER_NOT_FOUND', 404);
  const { data, error } = await db
    .from('siskill_orders')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  fail(error);
  if (!data) throw new CommerceError('ORDER_NOT_FOUND', 404);
  return data as Order;
}
async function userId(request: Request, db: SupabaseClient) {
  const token = request.headers
    .get('Authorization')
    ?.match(/^Bearer (\S+)$/i)?.[1];
  if (!token) throw new CommerceError('AUTH_REQUIRED', 401);
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user || data.user.is_anonymous)
    throw new CommerceError('AUTH_REQUIRED', 401);
  return data.user.id;
}
async function apply(
  db: SupabaseClient,
  order: Order,
  event: string,
  kind: string,
  payment: string | null,
  amount: number,
  currency: string,
  checkout: string | null = null
) {
  const { data, error } = await db.rpc('siskill_apply_payment', {
    p_order: order.id,
    p_provider: order.provider,
    p_event: event,
    p_kind: kind,
    p_payment: payment,
    p_amount: amount,
    p_currency: currency,
    p_checkout: checkout
  });
  fail(error);
  return data;
}
export async function createCheckout(
  request: Request,
  env: CommerceEnv,
  { db, stripe }: Dependencies
) {
  if (env.SISKILL_COMMERCE_ENABLED !== 'true')
    throw new CommerceError('CHECKOUT_NOT_OPEN', 503);
  const owner = await userId(request, db);
  const text = await request.text();
  if (text.length > 4096) throw new CommerceError('INVALID_CHECKOUT', 413);
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch {
    throw new CommerceError('INVALID_CHECKOUT');
  }
  const { sku, provider, locale } = checkoutInput(input);
  if (provider === 'stripe' && (!stripe || !env.SISKILL_STRIPE_WEBHOOK_SECRET))
    throw new CommerceError('PROVIDER_UNAVAILABLE', 503);
  if (provider === 'zpay' && (!env.SISKILL_ZPAY_KEY || !env.SISKILL_ZPAY_PID))
    throw new CommerceError('PROVIDER_UNAVAILABLE', 503);
  const { data, error } = await db.rpc('siskill_create_order', {
    p_user: owner,
    p_sku: sku,
    p_provider: provider,
    p_locale: locale
  });
  if (error) {
    const code = [
      'PRODUCT_UNAVAILABLE',
      'RELEASE_UNAVAILABLE',
      'ALREADY_OWNED',
      'PENDING_OTHER_PROVIDER'
    ].find((v) => error.message.includes(v));
    throw new CommerceError(code || 'COMMERCE_UNAVAILABLE', code ? 409 : 503);
  }
  const order = data as Order;
  if (order.user_id !== owner || order.product_scope !== PRODUCT_SCOPE)
    throw new CommerceError('ORDER_OWNER_MISMATCH', 409);
  if (!env.SISKILL_PACKAGES)
    throw new CommerceError('DOWNLOAD_UNAVAILABLE', 503);
  const release = await db
    .from('siskill_releases')
    .select('object_key,status')
    .eq('id', order.release_id)
    .eq('status', 'published')
    .maybeSingle();
  fail(release.error);
  if (
    !release.data ||
    !/^siskill\/[a-z0-9/_.-]+$/.test(release.data.object_key) ||
    release.data.object_key.includes('..')
  )
    throw new CommerceError('RELEASE_UNAVAILABLE', 503);
  const archive = await env.SISKILL_PACKAGES.head(release.data.object_key);
  if (
    !archive ||
    archive.size !== order.snapshot.bytes ||
    archive.customMetadata?.sha256 !== order.snapshot.sha256
  )
    throw new CommerceError('DOWNLOAD_UNAVAILABLE', 503);
  const urls = returnUrls(order.id, order.snapshot.locale);
  if (provider === 'stripe') {
    if (order.checkout_id) {
      const session = await stripe!.checkout.sessions.retrieve(
        order.checkout_id
      );
      verifyMetadata(order, session.metadata);
      if (session.status !== 'open' || !session.url)
        throw new CommerceError('CHECKOUT_RECONCILIATION_REQUIRED', 409);
      return json({
        orderId: order.id,
        provider: 'stripe',
        url: assertCheckoutUrl(session.url)
      });
    }
    // Never retry a potentially charged operation under a different idempotency key.
    // Stripe retains idempotency for at least 24h; older unbound orders require reconciliation before their fixed one-hour expiry.
    const created = (data as Order & { created_at: string }).created_at;
    if (
      !Number.isFinite(Date.parse(created)) ||
      Date.now() - Date.parse(created) > 55 * 60 * 1000
    )
      throw new CommerceError('CHECKOUT_RECONCILIATION_REQUIRED', 409);
    const metadata = paymentMetadata(order);
    const session = await stripe!.checkout.sessions.create(
      {
        mode: 'payment',
        client_reference_id: owner,
        metadata,
        payment_intent_data: { metadata },
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: order.currency,
              unit_amount: order.amount,
              product_data: { name: `SiSkill · ${order.snapshot.name}` }
            }
          }
        ],
        success_url: urls.success,
        cancel_url: urls.cancel,
        expires_at: Math.floor(Date.parse(created) / 1000) + 3600
      },
      { idempotencyKey: `siskill:checkout:${order.id}` }
    );
    if (!session.url) throw new CommerceError('PROVIDER_UNAVAILABLE', 502);
    const url = assertCheckoutUrl(session.url);
    const bound = await db.rpc('siskill_bind_checkout', {
      p_order: order.id,
      p_checkout_id: session.id,
      p_url: url
    });
    fail(bound.error);
    return json({ orderId: order.id, provider: 'stripe', url });
  }
  const fields = buildZpayCheckoutFields({
    config: {
      pid: env.SISKILL_ZPAY_PID!,
      key: env.SISKILL_ZPAY_KEY!,
      usdToCnyRate: 7,
      submitUrl: 'https://zpayz.cn/submit.php'
    },
    orderId: order.id,
    productName: `SiSkill · ${order.snapshot.name}`,
    cnyCents: order.amount,
    notifyUrl: `${SITE_ORIGIN}/api/siskill/zpay-notify`,
    returnUrl: urls.success
  });
  const bound = await db.rpc('siskill_bind_checkout', {
    p_order: order.id,
    p_checkout_id: fields.out_trade_no,
    p_url: null
  });
  fail(bound.error);
  return json({
    orderId: order.id,
    provider: 'alipay',
    url: 'https://zpayz.cn/submit.php',
    method: 'POST',
    fields
  });
}

export async function processStripeEvent(
  event: Stripe.Event,
  { db }: Dependencies
) {
  if (
    [
      'checkout.session.completed',
      'checkout.session.async_payment_succeeded',
      'checkout.session.expired'
    ].includes(event.type)
  ) {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.metadata?.product_scope !== PRODUCT_SCOPE) return;
    const order = await orderById(db, session.metadata.order_id);
    verifyMetadata(order, session.metadata);
    if (
      order.provider !== 'stripe' ||
      session.mode !== 'payment' ||
      session.client_reference_id !== order.user_id ||
      session.amount_total !== order.amount ||
      session.currency !== order.currency
    )
      throw new CommerceError('PAYMENT_MISMATCH', 409);
    // A signed callback can recover a successful provider creation whose response
    // was lost before checkout binding. Verify the immutable contract first.
    if (!order.checkout_id && order.status === 'pending') {
      const bound = await db.rpc('siskill_bind_checkout', {
        p_order: order.id,
        p_checkout_id: session.id,
        p_url: null
      });
      fail(bound.error);
      order.checkout_id = session.id;
    }
    if (session.id !== order.checkout_id)
      throw new CommerceError('PAYMENT_MISMATCH', 409);
    if (event.type === 'checkout.session.expired') {
      if (session.status !== 'expired')
        throw new CommerceError('PAYMENT_MISMATCH', 409);
      await apply(
        db,
        order,
        event.id,
        'expired',
        null,
        session.amount_total ?? -1,
        session.currency || '',
        session.id
      );
      return;
    }
    if (session.payment_status !== 'paid') return;
    const payment =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id;
    if (!payment) throw new CommerceError('MISSING_PAYMENT_ID', 409);
    await apply(
      db,
      order,
      event.id,
      'paid',
      payment,
      session.amount_total ?? -1,
      session.currency || '',
      session.id
    );
  } else if (event.type === 'charge.refunded') {
    const charge = event.data.object as Stripe.Charge;
    if (charge.metadata?.product_scope !== PRODUCT_SCOPE) return;
    // Partial refunds do not silently revoke the entire purchased license.
    if (!charge.refunded || charge.amount_refunded !== charge.amount) return;
    const order = await orderById(db, charge.metadata.order_id);
    verifyMetadata(order, charge.metadata);
    if (order.provider !== 'stripe')
      throw new CommerceError('PAYMENT_MISMATCH', 409);
    const payment =
      typeof charge.payment_intent === 'string'
        ? charge.payment_intent
        : charge.payment_intent?.id;
    if (!payment) throw new CommerceError('MISSING_PAYMENT_ID', 409);
    await apply(
      db,
      order,
      event.id,
      'refunded',
      payment,
      charge.amount,
      charge.currency
    );
  }
}
async function stripeWebhook(
  request: Request,
  env: CommerceEnv,
  deps: Dependencies
) {
  if (!deps.stripe || !env.SISKILL_STRIPE_WEBHOOK_SECRET)
    throw new CommerceError('WEBHOOK_UNAVAILABLE', 503);
  const signature = request.headers.get('stripe-signature');
  if (!signature) throw new CommerceError('INVALID_SIGNATURE', 400);
  let event: Stripe.Event;
  try {
    event = await deps.stripe.webhooks.constructEventAsync(
      await request.text(),
      signature,
      env.SISKILL_STRIPE_WEBHOOK_SECRET,
      undefined,
      Stripe.createSubtleCryptoProvider()
    );
  } catch {
    throw new CommerceError('INVALID_SIGNATURE', 400);
  }
  const mode = env.SISKILL_STRIPE_SECRET_KEY?.match(/^(?:sk|rk)_(live|test)_/);
  if (!mode) throw new CommerceError('WEBHOOK_UNAVAILABLE', 503);
  if (event.livemode !== (mode[1] === 'live'))
    throw new CommerceError('PAYMENT_MODE_MISMATCH', 400);
  await processStripeEvent(event, deps);
  return json({ received: true });
}
async function zpayNotify(
  request: Request,
  env: CommerceEnv,
  { db }: Dependencies
) {
  if (!env.SISKILL_ZPAY_KEY || !env.SISKILL_ZPAY_PID)
    throw new CommerceError('WEBHOOK_UNAVAILABLE', 503);
  const params = parseUniqueZpayParameters(new URL(request.url).searchParams);
  if (
    !params ||
    params.sign_type !== 'MD5' ||
    !verifyZpayParameters(params, env.SISKILL_ZPAY_KEY) ||
    params.pid !== env.SISKILL_ZPAY_PID ||
    params.type !== 'alipay' ||
    params.trade_status !== 'TRADE_SUCCESS'
  )
    throw new CommerceError('INVALID_SIGNATURE', 400);
  const order = await orderById(db, params.param || '');
  if (
    order.provider !== 'zpay' ||
    order.product_scope !== PRODUCT_SCOPE ||
    params.out_trade_no !== buildZpayOutTradeNo(order.id) ||
    params.out_trade_no !== order.checkout_id ||
    !params.trade_no ||
    params.trade_no.length > 128
  )
    throw new CommerceError('PAYMENT_MISMATCH', 409);
  const amount = parseCnyMoneyToCents(params.money || '');
  if (amount === null) throw new CommerceError('PAYMENT_MISMATCH', 409);
  await apply(
    db,
    order,
    `zpay:paid:${params.trade_no}`,
    'paid',
    params.trade_no,
    amount,
    'cny'
  );
  return new Response('success', {
    headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' }
  });
}
export async function handleCommerce(
  request: Request,
  env: CommerceEnv,
  injected?: Dependencies
): Promise<Response> {
  const path = new URL(request.url).pathname;
  try {
    if (path === '/api/siskill/auth-config') {
      if (request.method !== 'GET')
        return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
      const key = env.SUPABASE_ANON_KEY || '';
      let publicKey = /^sb_publishable_[a-zA-Z0-9_-]+$/.test(key);
      if (!publicKey) {
        try {
          publicKey =
            JSON.parse(
              atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))
            ).role === 'anon';
        } catch {
          /* fail closed */
        }
      }
      if (
        !publicKey ||
        !/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(env.SUPABASE_URL || '')
      )
        throw new CommerceError('AUTH_NOT_CONFIGURED', 503);
      return json({
        url: env.SUPABASE_URL,
        anonKey: key,
        redirectsReady: env.SISKILL_AUTH_REDIRECTS_READY === 'true'
      });
    }
    const ready = Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
    const checkoutOpen =
      ready &&
      env.SISKILL_COMMERCE_ENABLED === 'true' &&
      Boolean(env.SISKILL_PACKAGES) &&
      Boolean(
        (env.SISKILL_STRIPE_SECRET_KEY && env.SISKILL_STRIPE_WEBHOOK_SECRET) ||
        (env.SISKILL_ZPAY_KEY && env.SISKILL_ZPAY_PID)
      );
    if (path === '/api/siskill/status') {
      if (request.method !== 'GET')
        return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
      return json({
        product: 'siskill',
        checkoutOpen: checkoutOpen,
        membershipOpen: false
      });
    }
    if (!ready && !injected)
      throw new CommerceError('COMMERCE_NOT_CONFIGURED', 503);
    const deps = injected || {
      db: createClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
        auth: { persistSession: false, autoRefreshToken: false }
      }),
      stripe: env.SISKILL_STRIPE_SECRET_KEY
        ? new Stripe(env.SISKILL_STRIPE_SECRET_KEY, {
            apiVersion: '2026-06-24.dahlia',
            httpClient: Stripe.createFetchHttpClient()
          })
        : undefined
    };
    if (path === '/api/siskill/stripe-webhook' && request.method === 'POST')
      return await stripeWebhook(request, env, deps);
    if (path === '/api/siskill/zpay-notify' && request.method === 'GET')
      return await zpayNotify(request, env, deps);
    const origin = request.headers.get('Origin');
    if (origin && origin !== SITE_ORIGIN)
      throw new CommerceError('ORIGIN_NOT_ALLOWED', 403);
    if (path === '/api/siskill/checkout' && request.method === 'POST')
      return await createCheckout(request, env, deps);
    if (path === '/api/siskill/products' && request.method === 'GET') {
      const { data, error } = await deps.db
        .from('siskill_products')
        .select(
          'sku,name,usd_cents,cny_cents,contract_version,siskill_releases!inner(slug,version,status)'
        )
        .eq('active', true)
        .eq('siskill_releases.status', 'published');
      fail(error);
      return json({
        products: data || [],
        checkoutOpen
      });
    }
    if (path === '/api/siskill/me' && request.method === 'GET') {
      const owner = await userId(request, deps.db);
      const [orders, grants] = await Promise.all([
        deps.db
          .from('siskill_orders')
          .select('id,sku,status,amount,currency,provider,created_at,snapshot')
          .eq('user_id', owner)
          .order('created_at', { ascending: false })
          .limit(100),
        deps.db
          .from('siskill_grants')
          .select('order_id,release_id,status,siskill_releases(slug,version)')
          .eq('user_id', owner)
          .eq('status', 'active')
      ]);
      fail(orders.error);
      fail(grants.error);
      return json({
        product: 'siskill',
        orders: orders.data,
        grants: grants.data
      });
    }
    const match = path.match(/^\/api\/siskill\/downloads\/([a-f0-9-]{36})$/);
    if (match && request.method === 'GET') {
      const owner = await userId(request, deps.db);
      const { data, error } = await deps.db
        .from('siskill_grants')
        .select(
          'release_id,siskill_releases!inner(slug,version,object_key,sha256,bytes,status)'
        )
        .eq('user_id', owner)
        .eq('release_id', match[1])
        .eq('status', 'active')
        .eq('siskill_releases.status', 'published')
        .limit(1)
        .maybeSingle();
      fail(error);
      if (!data) throw new CommerceError('DOWNLOAD_NOT_OWNED', 403);
      const release = data.siskill_releases as unknown as {
        slug: string;
        version: string;
        object_key: string;
        sha256: string;
        bytes: number;
      };
      if (
        !/^siskill\/[a-z0-9/_.-]+$/.test(release.object_key) ||
        release.object_key.includes('..') ||
        !env.SISKILL_PACKAGES
      )
        throw new CommerceError('DOWNLOAD_UNAVAILABLE', 503);
      const object = await env.SISKILL_PACKAGES.get(release.object_key);
      if (
        !object ||
        object.size !== release.bytes ||
        object.customMetadata?.sha256 !== release.sha256
      )
        throw new CommerceError('DOWNLOAD_UNAVAILABLE', 503);
      return new Response(object.body, {
        headers: {
          'Content-Type': 'application/gzip',
          'Content-Length': String(object.size),
          'Content-Disposition': `attachment; filename="${encodeURIComponent(release.slug + '-' + release.version)}.tar.gz"`,
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
          'X-Content-SHA256': release.sha256
        }
      });
    }
    return json({ error: 'NOT_FOUND' }, 404);
  } catch (e) {
    if (e instanceof CommerceError) return json({ error: e.code }, e.status);
    // Do not expose provider errors, keys, database messages, customer data or signed URLs.
    return json({ error: 'COMMERCE_UNAVAILABLE' }, 503);
  }
}
