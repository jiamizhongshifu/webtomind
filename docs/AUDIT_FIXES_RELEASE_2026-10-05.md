# Billing and generation audit fixes: release checklist

This change prepares fixes for the October 5 audit. Local validation is not a
production release. Do not reclaim historical subscription grants as part of
this release.

## Behavior

- Paid access and subscription grants require an unexpired billing period.
  Existing Stripe recurring bills remain manageable even if local period data
  is stale. Expired prepaid/legacy access can purchase again.
- Stripe renewals accept legacy and modern invoice/subscription schemas. Missing
  billing periods fail closed. Subscription updates retrieve current provider
  state before reconciling delayed events.
- Subscription checkouts serialize in Postgres. An open same-plan Stripe session
  is reused; ambiguous provider creation stays reserved for reconciliation.
  A different recurring subscription ID is never overwritten by fulfillment.
- Image queue storage belongs to an account. Unowned legacy caches are discarded.
  Account changes invalidate pending callbacks and stop further batch submits.
- Video provider submission has a durable one-way marker. Persistence failures
  cannot trigger another create. Asset completion retries reuse existing output.
  Permanent polling errors terminate; other waits end after 45 minutes. Refund
  results are retained and shown honestly.
- Video tasks carry an owned session ID. Session reads reconcile server tasks,
  including pending and terminal results, after refresh or closing the page.
- All deployment entry points explicitly execute the release gates. Script
  lifecycle hooks are not relied upon. The default measured image failure ceiling
  is 10%; unknown observations fail closed. A paid-cohort failure rate above 5%
  blocks once there are enough server-snapshotted samples. Historical membership
  at task time remains unknown and cannot certify the paid reliability target.

## Ordered production steps, after authorization

1. Review public changes and the hosted overlay against this exact revision.
   Refresh any conflicting overlay through the documented authenticated workflow;
   never override source hashes. Push the approved branch and obtain current CI.
2. Run `pnpm business:guardrails` and `pnpm release:image-health-gate` with the
   production runtime environment. Their genuine failure is a release blocker.
   Any temporary recovery-release policy exception requires its own explicit
   review, measured input, scope and expiry; this change grants none.
3. Deploy the compatible Worker using `docs/PRODUCTION_RELEASE.md`.
4. Apply, in order, after checking deployed function definitions and duplicates:
   - `20261005090000_bound_subscription_entitlements_to_paid_period.sql`
   - `20261005091000_serialize_subscription_checkouts.sql`
   - `20261005092000_unique_video_generation_task.sql`
   - `20261005093000_snapshot_image_task_entitlement.sql`
   The first migration aborts on predicate drift. The unique video index aborts
   on duplicate task IDs. Review conflicts instead of deleting existing records.
5. On the existing `/api/membership/webhook` Stripe endpoint, preserve its current
   event subscriptions and add `customer.subscription.updated` and
   `invoice.payment_failed`. Preserve the endpoint API version unless a separate
   reviewed version change is intended. Verify live delivery and reconciliation.
6. Reconcile any existing unlinked pending subscription orders against Stripe
   before changing their state. A missing local provider ID is not evidence that
   no payable session exists. Existing reserved unknown orders remain blocked.
7. Verify migration history, function predicates, triggers/indexes, live manifest
   and relevant desktop/mobile behavior. Paid checkout or model smoke requires a
   specific approved account and budget. Separate CI, deployment and live results.

## Acceptance still requiring production evidence

The reliability goal is overall success at least 90% and task-time paid-cohort
success at least 95% across seven complete daily windows with adequate samples,
with matching refund ledger facts. A successful local test or stronger gate does
not establish those outcomes. Provider invoice loss remains unverified without
provider invoice reconciliation. Do not exclude rejected requests from the
failure denominator or increase paid retries to inflate the result.
