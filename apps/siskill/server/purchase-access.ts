import type Stripe from 'stripe';
import { CommerceError, verifyMetadata, type Order } from './policy';

const id = (value: string | { id: string } | null) =>
  typeof value === 'string' ? value : value?.id;

/** Recheck the provider before serving paid bytes, even if a callback is delayed. */
export async function purchaseAccess(
  order: Order,
  stripe: Stripe | undefined,
  key?: string
) {
  if (order.product_scope !== 'siskill' || order.status !== 'paid')
    return false;
  if (order.provider !== 'stripe') return false; // No unverified Alipay launch.
  const mode = key?.match(/^(?:sk|rk)_(live|test)_/);
  if (!stripe || !mode)
    throw new CommerceError('PAYMENT_VERIFICATION_UNAVAILABLE', 503);
  if (!order.provider_payment_id) return false;
  const payment = await stripe.paymentIntents.retrieve(
    order.provider_payment_id
  );
  verifyMetadata(order, payment.metadata);
  const live = mode[1] === 'live';
  if (
    payment.status !== 'succeeded' ||
    payment.livemode !== live ||
    payment.amount !== order.amount ||
    payment.amount_received !== order.amount ||
    payment.currency !== order.currency ||
    !id(payment.latest_charge)
  )
    return false;
  const charge = await stripe.charges.retrieve(id(payment.latest_charge)!);
  verifyMetadata(order, charge.metadata);
  if (
    !charge.paid ||
    !charge.captured ||
    charge.status !== 'succeeded' ||
    charge.livemode !== live ||
    id(charge.payment_intent) !== payment.id ||
    charge.amount !== order.amount ||
    charge.amount_captured !== order.amount ||
    charge.currency !== order.currency ||
    charge.refunded ||
    charge.amount_refunded >= charge.amount
  )
    return false;
  if (charge.disputed) {
    const disputes = await stripe.disputes.list({
      charge: charge.id,
      limit: 100
    });
    if (
      !disputes.data.length ||
      disputes.has_more ||
      disputes.data.some(
        (d) =>
          id(d.charge) !== charge.id ||
          d.livemode !== live ||
          !['won', 'warning_closed'].includes(d.status)
      )
    )
      return false;
  }
  return true;
}
