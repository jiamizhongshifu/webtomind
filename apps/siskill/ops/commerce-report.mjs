const counts = (rows, key) =>
  rows.reduce(
    (result, row) => ({ ...result, [row[key]]: (result[row[key]] || 0) + 1 }),
    {}
  );
export function commerceSummary({
  orders,
  memberships,
  paymentEvents,
  owners,
  start,
  end,
  generatedAt = new Date().toISOString()
}) {
  // Missing identity classification is unknown, not a customer or a zero-value result.
  const classify = (row) => owners.get(row.user_id) || 'unknown';
  const includedOrders = orders.filter((o) => classify(o) === 'customer');
  const includedMemberships = memberships.filter(
    (m) => classify(m) === 'customer'
  );
  const paidEvents = new Set(
    paymentEvents.filter((e) => e.kind === 'paid').map((e) => e.order_id)
  );
  const verifiedPaid = includedOrders.filter(
    (o) => o.status === 'paid' && paidEvents.has(o.id)
  );
  const paidWithoutEvent = includedOrders.filter(
    (o) => o.status === 'paid' && !paidEvents.has(o.id)
  ).length;
  const values = {};
  for (const o of verifiedPaid) {
    if (
      !Number.isSafeInteger(o.amount) ||
      o.amount <= 0 ||
      !['usd', 'cny'].includes(o.currency)
    )
      throw Error('INVALID_ORDER_VALUE');
    values[o.currency] = (values[o.currency] || 0) + o.amount;
  }
  return {
    product: 'siskill',
    generatedAt,
    cohort: {
      startInclusive: start,
      endExclusive: end,
      timeZone: 'UTC',
      basis:
        'orders and memberships created within the window; statuses at report time'
    },
    exclusions: {
      qaOrders: orders.filter((o) => classify(o) === 'qa').length,
      unknownOwnerOrders: orders.filter((o) => classify(o) === 'unknown')
        .length,
      qaMemberships: memberships.filter((o) => classify(o) === 'qa').length,
      unknownOwnerMemberships: memberships.filter(
        (o) => classify(o) === 'unknown'
      ).length
    },
    orders: {
      count: includedOrders.length,
      byStatus: counts(includedOrders, 'status'),
      paidWithRecordedPaymentEvent: verifiedPaid.length,
      paidWithoutRecordedPaymentEvent: paidWithoutEvent,
      retainedPaidOrderValueMinorUnits: values
    },
    memberships: {
      count: includedMemberships.length,
      byLifecycleState: counts(includedMemberships, 'state'),
      activePaidMembers: null
    },
    funnel: {
      visits: null,
      detailViews: null,
      signIns: null,
      checkoutOrders: includedOrders.length,
      paidOrdersWithRecordedEvent: verifiedPaid.length,
      verifiedDownloads: null,
      conversionRate: null
    },
    limitations: [
      'Payment-event records are fulfillment evidence; this report does not reconcile provider settlements, fees, taxes, partial refunds or bank receipts.',
      'Values are current retained order value for the creation cohort, not period revenue or profit. Currencies are never combined.',
      'A membership bound state is not proof of active paid access. Membership invoices and entitlements require separate verification.',
      'No SiSkill visit/sign-in/verified-download telemetry is connected to this report. Missing funnel stages remain null; conversion cannot be calculated.',
      'Only explicitly marked siskill_smoke/siskill_test accounts are classified as QA. Unmarked test activity may remain; unavailable owner lookups are excluded as unknown.'
    ]
  };
}
