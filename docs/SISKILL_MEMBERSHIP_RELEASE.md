# SiSkill membership and first paid package — 2026-10-21

> Historical pre-launch record. The subsequent user authorization to open sales supersedes the closed-sale decision and live self-test gate below. See [sales launch](SISKILL_SALES_LAUNCH_2026-10-21.md) for the current release scope and verification boundaries.

## Released behavior and business boundary

All free and paid downloads require a registered, authenticated account. The shared
WebToMind identity is used only for login. SiSkill contracts, orders, private packages
and entitlements remain independent. One-time ownership includes later published
versions of the same Skill, consistent with the existing package license.

Pro is prepared at $9.99/month or $79/year. Both renew automatically through Stripe;
users can cancel renewal or resume it in their SiSkill account. Cancel-at-period-end
keeps access through the paid period. Cancellation itself is not a refund. Membership
unlocks only published releases explicitly marked `member_eligible`; third-party Skills,
model/Agent costs and WebToMind credits/membership are excluded. Lawfully acquired
versions remain usable locally after the membership ends.

The first reviewed paid package is Customer Case Study Deck 1.0.2 (19 files, 987237
bytes, SHA-256 `5517c48a18ef37a725e9ffde7379d3cb9a14a1bbd0aa69913a809a4212c3a06a`).
The isolated distribution uses fictional editorial-team examples, original CSS and
system fonts. It retains WebToMind authorship and `skills-2026-10-v2`. No third-party
Skill implementation or private assets are bundled. Strict validation and privacy scan
passed; all eight slides were inspected; both Agent project layouts produced the
reviewed output. This is package execution acceptance, not independent Agent discovery.
Its inactive SKU is prepared at $9.99 / CNY 69; Alipay is not configured for this release.

## State and authorization

Migration `20261021110000_siskill_memberships.sql` adds two prefixed tables and a
membership-eligibility column on SiSkill releases. It was applied to the approved shared
project on 2026-10-21. Both tables have RLS; authenticated users can read only their own
contracts and cannot reserve/bind/settle memberships directly. Existing WebToMind tables
and callbacks are unchanged. Both plans and the first SKU are **inactive**. Both checkout
switches remain **false**. There are no real SiSkill orders or memberships.

- `/api/siskill/plans`: configured active plan list and checkout readiness.
- `/api/siskill/membership`: own membership status and eligible published library.
- `/api/siskill/membership/checkout`: reserves an immutable server-priced contract,
  prevents duplicate open subscriptions and creates an idempotent Stripe Checkout.
- `/api/siskill/membership/renewal`: sets cancel-at-period-end on the authenticated
  owner's exact subscription; accepts no user-supplied provider/customer/subscription ID.

Each membership access check retrieves current Stripe subscription, invoice, invoice
payment, PaymentIntent and charge. It verifies owner, product, price, interval, mode,
paid amount and exact current period. Incomplete, trialing, paused, past-due, unpaid,
expired, fully refunded or disputed periods do not unlock downloads. Provider failure
fails closed. Partial refunds do not revoke the entire period. This favors current
payment evidence over cached grants; it adds provider latency to membership downloads.
There is no local invoice-history ledger yet; Stripe remains the billing source of truth.

Checkout callbacks recover the exact reserved contract after a lost create response.
Current provider reads make invoice/subscription webhook arrival order irrelevant to
access. Old/refunded invoices cannot authorize a new period. An ended contract cannot be
revived by a late callback. Unbound checkouts older than 55 minutes require reconciliation;
never create a new idempotency key to retry an uncertain payment.

The shared live merchant already uses three webhook versions. SiSkill registers its own
endpoint with the existing `2025-12-15.clover` webhook schema. After signature and live/test
verification, SiSkill checkout/charge objects are re-fetched using the pinned SDK API
`2026-06-24.dahlia`. Other products' callback versions are unchanged.

Private R2 bucket `siskill-paid-packages` has r2.dev disabled and no custom domain.
The Worker validates archive bytes against the reviewed SHA-256 on checkout and download;
custom object metadata is not treated as proof. The first archive is below 1 MB; the
in-memory verification limit is 32 MB. Browser downloads verify the hash again.

## Validation boundaries

Local SQL/API tests cover isolation, frozen prices, duplicate checkouts, RLS, immutable
contracts, cancelled-contract tombstones, ownership, corrupt archives and webhook schema
normalization. Desktop/mobile browser checks cover shared login, empty membership and
simulated active/cancel/resume/refunded UI states; these UI fixtures are not provider tests.

Actual **Stripe test API** checks passed: first invoice payment, cancel-at-period-end,
resume, full refund revocation, a test-clock renewal into the next period, and access
ending at the scheduled cancellation. The test key belongs to the separate configured
sandbox account; production merchant access was independently verified. Test subscriptions
were cancelled, and the test clock was removed. No live charge was made.

Actual Stripe hosted Checkout test-mode acceptance also passed: insufficient-funds decline,
unpaid return denial, successful test-card payment, provider-event fulfillment into the
local SQL ledger, duplicate-event idempotency, exact private archive download and full-refund
revocation. Identity and R2 were local fixtures in this harness; shared-login and real R2
readback were verified separately. This does not prove live webhook delivery.

## Final acceptance before sales

Keep the flags and server SKUs closed until signed production callback delivery and a real purchaser's download have been accepted.
Hosted Checkout was completed in test mode. Real money/card
submission requires the user's explicit participation/authorization. Signup email and
completed Google sign-in are separate outstanding account acceptance items. Do not label
API mocks, test-mode payment or a prepared live price as a live sale.

Activation uses the existing live merchant, independent webhook secret, published private
release and active SiSkill prices/SKU. Leave WebToMind configuration unchanged. Disable
new checkout flags for recovery while preserving callbacks, existing grants and records.

References: [Stripe subscriptions](https://docs.stripe.com/payments/checkout/build-subscriptions),
[Cloudflare R2 binding](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/).
Local private evidence and immutable archives: `output/siskill-membership/`.
