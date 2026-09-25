export const SUBSCRIPTION_ACCESS_STATUSES = [
  'active',
  'trialing',
  'past_due',
  'canceled',
  'cancelled'
] as const;

export interface SubscriptionStateLike {
  status?: string | null;
  current_period_end?: string | null;
}

export interface StripeManageableSubscriptionStateLike extends SubscriptionStateLike {
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
}

function isCanceledStatus(status: string | null | undefined): boolean {
  return status === 'canceled' || status === 'cancelled';
}

function hasUnexpiredPeriod(
  currentPeriodEnd: string | null | undefined,
  now: Date
): boolean {
  if (!currentPeriodEnd) return false;
  const end = new Date(currentPeriodEnd).getTime();
  return Number.isFinite(end) && end >= now.getTime();
}

/**
 * A paid subscription that must be managed through Stripe instead of creating
 * a second Checkout subscription. Canceled subscriptions keep their paid
 * access until the current period ends.
 */
export function blocksNewSubscriptionCheckout(
  subscription: SubscriptionStateLike | null | undefined,
  now = new Date()
): boolean {
  if (!subscription) return false;
  if (
    subscription.status === 'active' ||
    subscription.status === 'trialing' ||
    subscription.status === 'past_due'
  ) {
    return true;
  }
  return (
    isCanceledStatus(subscription.status) &&
    hasUnexpiredPeriod(subscription.current_period_end, now)
  );
}

export function findSubscriptionBlockingCheckout<
  T extends SubscriptionStateLike
>(subscriptions: readonly T[] | null | undefined, now = new Date()): T | null {
  return (
    subscriptions?.find((subscription) =>
      blocksNewSubscriptionCheckout(subscription, now)
    ) || null
  );
}

/**
 * Blocks a new paid Checkout only when the current entitlement still belongs
 * to a Stripe-manageable subscription. A canceled, unexpired legacy
 * entitlement without Stripe identifiers keeps access until its original end
 * date, but can be converted to a real subscription through Checkout.
 */
export function blocksNewPaidSubscriptionCheckout(
  subscription: StripeManageableSubscriptionStateLike | null | undefined,
  now = new Date()
): boolean {
  if (!blocksNewSubscriptionCheckout(subscription, now)) return false;
  if (!isCanceledStatus(subscription?.status)) return true;
  return Boolean(
    subscription?.stripe_customer_id || subscription?.stripe_subscription_id
  );
}

export function findSubscriptionBlockingNewPaidCheckout<
  T extends StripeManageableSubscriptionStateLike
>(subscriptions: readonly T[] | null | undefined, now = new Date()): T | null {
  return (
    subscriptions?.find((subscription) =>
      blocksNewPaidSubscriptionCheckout(subscription, now)
    ) || null
  );
}

/**
 * Product access is fail-closed when Stripe reports an unpaid subscription.
 * Past-due users can still open the billing portal, but cannot receive or
 * consume new member entitlements until Stripe restores the subscription.
 */
export function hasPaidSubscriptionAccess(
  subscription: SubscriptionStateLike | null | undefined,
  now = new Date()
): boolean {
  if (!subscription) return false;
  if (subscription.status === 'active' || subscription.status === 'trialing') {
    return true;
  }
  return (
    isCanceledStatus(subscription.status) &&
    hasUnexpiredPeriod(subscription.current_period_end, now)
  );
}

export function findSubscriptionWithPaidAccess<T extends SubscriptionStateLike>(
  subscriptions: readonly T[] | null | undefined,
  now = new Date()
): T | null {
  return (
    subscriptions?.find((subscription) =>
      hasPaidSubscriptionAccess(subscription, now)
    ) || null
  );
}

export function isEligibleForSubscriptionCreditGrant(
  subscription: SubscriptionStateLike | null | undefined
): boolean {
  return (
    subscription?.status === 'active' || subscription?.status === 'trialing'
  );
}
