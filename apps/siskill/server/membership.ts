import Stripe from 'stripe';
import { verifiedArchive } from './archive';
import type { Dependencies, CommerceEnv } from './handler';
import { CommerceError, SITE_ORIGIN, assertCheckoutUrl } from './policy';

type Contract = {
  id: string;
  user_id: string;
  plan_id: string;
  checkout_id: string | null;
  subscription_id: string | null;
  customer_id: string | null;
  state: string;
  created_at: string;
  snapshot: {
    stripe_price_id: string;
    amount: number;
    currency: string;
    interval: 'month' | 'year';
    livemode: boolean;
    contract_version: string;
    locale: string;
    name: string;
  };
};
const id = (v: string | { id: string } | null | undefined) =>
  typeof v === 'string' ? v : v?.id;
const check = (condition: unknown) => {
  if (!condition) throw new CommerceError('MEMBERSHIP_MISMATCH', 409);
};
const result = (v: unknown) =>
  new Response(JSON.stringify(v), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
const dbCheck = (error: unknown) => {
  if (error) throw new CommerceError('MEMBERSHIP_UNAVAILABLE', 503);
};
export const membershipMetadata = (m: Contract) => ({
  product_scope: 'siskill',
  purchase_kind: 'membership',
  membership_id: m.id,
  user_id: m.user_id,
  plan_id: m.plan_id,
  contract_version: m.snapshot.contract_version
});
export function verifyMemberContract(m: Contract, s: Stripe.Subscription) {
  const md = membershipMetadata(m),
    item = s.items.data[0],
    p = m.snapshot;
  check(
    Object.entries(md).every(([k, v]) => s.metadata[k] === v) &&
      s.livemode === p.livemode &&
      (!m.subscription_id || m.subscription_id === s.id) &&
      (!m.customer_id || m.customer_id === id(s.customer))
  );
  check(
    s.items.data.length === 1 &&
      !s.items.has_more &&
      item.quantity === 1 &&
      item.price.id === p.stripe_price_id &&
      item.price.unit_amount === p.amount &&
      item.price.currency === p.currency &&
      item.price.recurring?.interval === p.interval &&
      item.price.recurring.interval_count === 1
  );
  return item;
}
async function find(db: Dependencies['db'], owner: string) {
  const r = await db
    .from('siskill_memberships')
    .select('*')
    .eq('user_id', owner)
    .neq('state', 'ended')
    .maybeSingle();
  dbCheck(r.error);
  return r.data as Contract | null;
}
async function bind(
  db: Dependencies['db'],
  m: Contract,
  checkout: string,
  subscription: string | null,
  customer: string | null,
  end = false
) {
  const r = await db.rpc('siskill_bind_membership', {
    p_id: m.id,
    p_checkout: checkout,
    p_subscription: subscription,
    p_customer: customer,
    p_end: end
  });
  dbCheck(r.error);
}
// Every access decision uses current Stripe state, including actual charge/refund state.
// Cached UI state and event ordering can never grant a download.
export async function verifyPaidPeriod(
  m: Contract,
  s: Stripe.Subscription,
  stripe: Stripe,
  now = Date.now() / 1000
) {
  const item = verifyMemberContract(m, s);
  const empty = {
    active: false,
    billingStatus: s.status as string,
    status: s.status as string,
    periodEnd: item.current_period_end,
    cancelAtPeriodEnd: s.cancel_at_period_end
  };
  if (
    s.status !== 'active' ||
    s.pause_collection ||
    item.current_period_start > now ||
    item.current_period_end <= now ||
    !id(s.latest_invoice)
  )
    return empty;
  const invoice = await stripe.invoices.retrieve(id(s.latest_invoice)!);
  const line = invoice.lines.data[0];
  if (
    invoice.status !== 'paid' ||
    invoice.livemode !== m.snapshot.livemode ||
    id(invoice.customer) !== id(s.customer) ||
    id(invoice.parent?.subscription_details?.subscription) !== s.id ||
    invoice.amount_paid !== m.snapshot.amount ||
    invoice.currency !== m.snapshot.currency ||
    invoice.amount_remaining !== 0 ||
    invoice.lines.has_more ||
    invoice.lines.data.length !== 1 ||
    !line ||
    id(line.pricing?.price_details?.price) !== m.snapshot.stripe_price_id ||
    line.period.start !== item.current_period_start ||
    line.period.end !== item.current_period_end
  )
    return { ...empty, status: 'payment_unverified' };
  const payments = await stripe.invoicePayments.list({
    invoice: invoice.id,
    status: 'paid',
    limit: 2
  });
  if (payments.has_more || payments.data.length !== 1)
    return { ...empty, status: 'payment_unverified' };
  const payment = payments.data[0];
  if (
    payment.amount_paid !== m.snapshot.amount ||
    payment.currency !== m.snapshot.currency ||
    payment.payment.type !== 'payment_intent' ||
    !id(payment.payment.payment_intent)
  )
    return { ...empty, status: 'payment_unverified' };
  const pi = await stripe.paymentIntents.retrieve(
    id(payment.payment.payment_intent)!
  );
  if (
    pi.status !== 'succeeded' ||
    pi.amount_received !== m.snapshot.amount ||
    !id(pi.latest_charge)
  )
    return { ...empty, status: 'payment_unverified' };
  const charge = await stripe.charges.retrieve(id(pi.latest_charge)!);
  if (
    charge.livemode !== m.snapshot.livemode ||
    id(charge.customer) !== id(s.customer) ||
    !charge.paid ||
    charge.disputed ||
    charge.amount !== m.snapshot.amount ||
    charge.currency !== m.snapshot.currency ||
    charge.refunded ||
    charge.amount_refunded >= charge.amount
  )
    return { ...empty, status: charge.disputed ? 'disputed' : 'refunded' };
  return { ...empty, active: true };
}
async function reconcile(m: Contract, deps: Dependencies) {
  if (!deps.stripe) throw new CommerceError('PROVIDER_UNAVAILABLE', 503);
  if (!m.checkout_id) return m;
  const session = await deps.stripe.checkout.sessions.retrieve(m.checkout_id);
  check(
    session.mode === 'subscription' &&
      session.livemode === m.snapshot.livemode &&
      session.client_reference_id === m.user_id &&
      Object.entries(membershipMetadata(m)).every(
        ([k, v]) => session.metadata?.[k] === v
      )
  );
  if (session.status === 'expired') {
    await bind(deps.db, m, session.id, null, null, true);
    return { ...m, state: 'ended' };
  }
  const subId = id(session.subscription),
    customer = id(session.customer);
  if (subId && customer) {
    const subscription = await deps.stripe.subscriptions.retrieve(subId);
    verifyMemberContract(m, subscription);
    check(id(subscription.customer) === customer);
    const ended = ['canceled', 'incomplete_expired'].includes(
      subscription.status
    );
    await bind(deps.db, m, session.id, subId, customer, ended);
    return {
      ...m,
      subscription_id: subId,
      customer_id: customer,
      state: ended ? 'ended' : 'bound'
    };
  }
  return m;
}
export async function memberStatus(owner: string, deps: Dependencies) {
  let m = await find(deps.db, owner);
  if (!m) return { active: false, status: 'none', membership: null };
  m = await reconcile(m, deps);
  const membership = {
    id: m.id,
    plan: m.plan_id,
    amount: m.snapshot.amount,
    currency: m.snapshot.currency
  };
  if (m.state === 'ended' || !m.subscription_id)
    return { active: false, status: m.state, membership };
  const subscription = await deps.stripe!.subscriptions.retrieve(
    m.subscription_id
  );
  return {
    ...(await verifyPaidPeriod(m, subscription, deps.stripe!)),
    membership
  };
}
export async function membershipCheckout(
  owner: string,
  input: unknown,
  env: CommerceEnv,
  deps: Dependencies
) {
  if (
    env.SISKILL_MEMBERSHIP_ENABLED !== 'true' ||
    !deps.stripe ||
    !env.SISKILL_STRIPE_WEBHOOK_SECRET ||
    !env.SISKILL_PACKAGES
  )
    throw new CommerceError('MEMBERSHIP_NOT_OPEN', 503);
  const v = input as Record<string, unknown>;
  if (
    !v ||
    Object.keys(v).some((k) => !['plan', 'locale'].includes(k)) ||
    !['pro_monthly', 'pro_yearly'].includes(String(v.plan)) ||
    !['en-US', 'zh-CN'].includes(String(v.locale))
  )
    throw new CommerceError('INVALID_MEMBERSHIP');
  const catalog = await deps.db
    .from('siskill_releases')
    .select('object_key,bytes,sha256')
    .eq('status', 'published')
    .eq('member_eligible', true);
  dbCheck(catalog.error);
  if (!catalog.data?.length)
    throw new CommerceError('MEMBERSHIP_CATALOG_EMPTY', 503);
  for (const release of catalog.data) await verifiedArchive(env, release);
  const old = await find(deps.db, owner);
  if (old) await reconcile(old, deps);
  const r = await deps.db.rpc('siskill_reserve_membership', {
    p_user: owner,
    p_plan: v.plan,
    p_locale: v.locale
  });
  if (r.error)
    throw new CommerceError(
      r.error.message.includes('MEMBERSHIP_EXISTS')
        ? 'MEMBERSHIP_EXISTS'
        : 'PLAN_UNAVAILABLE',
      409
    );
  const m = r.data as Contract;
  check(m.user_id === owner && m.state === 'pending');
  if (m.checkout_id) {
    const session = await deps.stripe.checkout.sessions.retrieve(m.checkout_id);
    if (session.status !== 'open' || !session.url)
      throw new CommerceError('CHECKOUT_RECONCILIATION_REQUIRED', 409);
    return result({ url: assertCheckoutUrl(session.url) });
  }
  if (Date.now() - Date.parse(m.created_at) > 55 * 60_000)
    throw new CommerceError('CHECKOUT_RECONCILIATION_REQUIRED', 409);
  const price = await deps.stripe.prices.retrieve(m.snapshot.stripe_price_id, {
    expand: ['product']
  });
  check(
    price.active &&
      price.livemode === m.snapshot.livemode &&
      price.unit_amount === m.snapshot.amount &&
      price.currency === m.snapshot.currency &&
      price.recurring?.interval === m.snapshot.interval &&
      price.recurring.interval_count === 1 &&
      typeof price.product !== 'string' &&
      !('deleted' in price.product) &&
      price.product.metadata.product_scope === 'siskill'
  );
  const md = membershipMetadata(m),
    base = `${SITE_ORIGIN}/${m.snapshot.locale}/account`;
  const session = await deps.stripe.checkout.sessions.create(
    {
      mode: 'subscription',
      payment_method_types: ['card'],
      client_reference_id: owner,
      metadata: md,
      subscription_data: { metadata: md },
      line_items: [{ price: price.id, quantity: 1 }],
      success_url: base + '?membership=return',
      cancel_url: base + '?membership=cancelled',
      expires_at: Math.floor(Date.parse(m.created_at) / 1000) + 3600
    },
    { idempotencyKey: `siskill:membership:${m.id}` }
  );
  if (!session.url) throw new CommerceError('PROVIDER_UNAVAILABLE', 502);
  await bind(deps.db, m, session.id, null, null);
  return result({ url: assertCheckoutUrl(session.url) });
}
export async function changeRenewal(
  owner: string,
  input: unknown,
  deps: Dependencies
) {
  const v = input as Record<string, unknown>;
  if (
    !v ||
    Object.keys(v).some((k) => !['cancelAtPeriodEnd'].includes(k)) ||
    typeof v.cancelAtPeriodEnd !== 'boolean'
  )
    throw new CommerceError('INVALID_MEMBERSHIP');
  let m = await find(deps.db, owner);
  if (!m) throw new CommerceError('MEMBERSHIP_NOT_FOUND', 404);
  m = await reconcile(m, deps);
  if (m.state !== 'bound' || !m.subscription_id)
    throw new CommerceError('MEMBERSHIP_NOT_ACTIVE', 409);
  const sub = await deps.stripe!.subscriptions.retrieve(m.subscription_id);
  verifyMemberContract(m, sub);
  if (!['active', 'past_due'].includes(sub.status))
    throw new CommerceError('MEMBERSHIP_NOT_ACTIVE', 409);
  // Setting a desired boolean is retry-safe; it never charges, prorates or changes a plan.
  await deps.stripe!.subscriptions.update(sub.id, {
    cancel_at_period_end: v.cancelAtPeriodEnd
  });
  return result(await memberStatus(owner, deps));
}
export async function processMemberEvent(
  event: Stripe.Event,
  deps: Dependencies
) {
  if (!event.type.startsWith('checkout.session.')) return false;
  const session = event.data.object as Stripe.Checkout.Session;
  if (
    session.metadata?.product_scope !== 'siskill' ||
    session.metadata?.purchase_kind !== 'membership'
  )
    return false;
  const r = await deps.db
    .from('siskill_memberships')
    .select('*')
    .eq('id', session.metadata.membership_id)
    .maybeSingle();
  dbCheck(r.error);
  const m = r.data as Contract;
  check(
    m &&
      Object.entries(membershipMetadata(m)).every(
        ([k, v]) => session.metadata?.[k] === v
      ) &&
      session.mode === 'subscription' &&
      session.client_reference_id === m.user_id &&
      session.livemode === m.snapshot.livemode
  );
  // Recover a lost create response only after checking the exact frozen contract.
  if (!m.checkout_id) {
    await bind(deps.db, m, session.id, null, null);
    m.checkout_id = session.id;
  }
  check(m.checkout_id === session.id);
  await reconcile(m, deps);
  return true;
}
