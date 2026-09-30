# Self-service subscription cancellation

Signed-in customers can open **Manage subscription** on Pricing or Account
Settings, review the billing-period end, and confirm **Cancel subscription**.
Stripe subscriptions stop renewing at the end of the current billing period.
The action does not cancel access immediately, refund charges, or forgive
existing unpaid invoices. Prepaid ZPay plans are labeled as non-renewing.

## Runtime contract

- `GET /api/membership/cancellation` reads the authenticated user's records and
  current Stripe state; it returns no-store billing summaries.
- `POST /api/membership/cancellation` accepts the internal `subscriptionId` and
  the `currentPeriodEnd` shown during confirmation. Subscription and customer
  identifiers used with Stripe come only from the owned database row.
- Supabase verifies the bearer token. Queries filter by authenticated `user_id`;
  Stripe customer and available `metadata.user_id` must agree with ownership.
- A changed billing period requires a fresh confirmation. Already scheduled or
  canceled subscriptions return their current result without another Stripe write.
- The Stripe mutation only sets `cancel_at_period_end: true`. Concurrent requests
  converge on that same state. Each operation has a fresh idempotency key for
  transport retries so a cancellation after portal reactivation cannot replay an
  old cached success.
- Local synchronization never modifies credits or grants access. Stripe success
  remains success if database synchronization is delayed (`syncPending: true`).
  Existing `customer.subscription.updated` and `customer.subscription.deleted`
  webhooks remain required and reconcile the subscription lifecycle.

The endpoint uses the existing Stripe SDK/API version and secret selection.
No database migration, new secret, or billing portal configuration is required.

## Verification

Run with Node 24.14.0 and pnpm 8.15.0:

```sh
pnpm exec vitest run src/__tests__/membership-*.test.ts src/__tests__/worker-seo-routes.test.ts src/services/__tests__/payment-api.test.ts src/workspace/components/__tests__/Pricing*.test.ts* src/workspace/components/__tests__/SubscriptionManagement.test.tsx --maxWorkers=2
pnpm type-check:all
pnpm build
```

Builds require Supabase frontend configuration. For local compilation only,
non-production placeholder values can be used; they are not a deployable runtime.
Use `pnpm preview:auth` only on loopback for UI verification, intercept billing
requests with fixtures, and never use the bypass build in production.

Before release, verify desktop/mobile confirmation, retaining a subscription,
loading failure/retry, cancellation failure/retry, duplicate-click prevention,
and the successful end-date display in both supported languages. Run a sandbox
integration against Stripe and signed webhooks when isolated test credentials
are available. Never use a real customer subscription as a test fixture.

Release through `docs/PRODUCTION_RELEASE.md`: review the public branch, pass CI,
validate the hosted overlay, and deploy Worker + Assets only with release
authorization. Verify the production manifest and authenticated billing UI after
release; exercise a real cancellation only using an explicitly authorized test
subscription.
