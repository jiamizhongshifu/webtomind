import assert from 'node:assert/strict';
import test from 'node:test';
import { renewalEventRow } from './lib/renewal-reconciliation.mjs';
const sub = {
  user_id: 'user-1',
  plan_id: 'pro',
  stripe_subscription_id: 'sub_owned'
};
const invoice = {
  id: 'in_1',
  livemode: true,
  status: 'paid',
  billing_reason: 'subscription_cycle',
  parent: { subscription_details: { subscription: 'sub_owned' } },
  status_transitions: { paid_at: 1790000000 },
  amount_paid: 2000,
  currency: 'usd'
};
test('backfills one analytics event using webhook idempotency and actual payment date', () => {
  const row = renewalEventRow(invoice, sub);
  assert.equal(row.idempotency_key, 'subscription_renewal_succeeded:in_1');
  assert.equal(row.occurred_at, new Date(1790000000 * 1000).toISOString());
  assert.equal(row.metadata.acquisition_event, false);
  assert.equal(row.metadata.amount_paid, 2000);
  assert.equal(row.user_id, 'user-1');
});
test('excludes other products, unpaid, initial payments, test data and ambiguous timestamps', () => {
  for (const changes of [
    { livemode: false },
    { status: 'open' },
    { billing_reason: 'subscription_create' },
    { parent: { subscription_details: { subscription: 'sub_other_app' } } },
    { status_transitions: {} }
  ]) {
    assert.equal(renewalEventRow({ ...invoice, ...changes }, sub), null);
  }
});
