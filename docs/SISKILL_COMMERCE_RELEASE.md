# SiSkill one-time commerce — activation record

## Current preparation (2026-10-21)

Membership and first-package continuation: see [membership release](SISKILL_MEMBERSHIP_RELEASE.md).

This is a default-closed backend, not an announcement that purchasing is available.
The public app offers a reviewed free OG Image download outside commerce (see
`docs/SISKILL_FREE_RELEASE.md`); paid products remain in preview. One reviewed paid package, inactive SKU, inactive monthly/yearly plans and independent
Stripe configuration are prepared. No real customer purchase or grant has been created. Shared email/password sign-in
and an independent account/library UI are included. The verified redirect allowlist
enables Google/signup/recovery entry points; completed Google sign-in and real email
delivery are not covered by the authorization handoff check.

| Endpoint                                | Purpose                                                   | Gate                                                                                  |
| --------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `GET /api/siskill/auth-config`          | Shared public Supabase config; never service key          | Public key role validation                                                            |
| `GET /api/siskill/status`               | Checkout configuration readiness; separate membership readiness | Public, no-store                                                                      |
| `GET /api/siskill/products`             | Active, published catalog and server prices               | Configured database                                                                   |
| `POST /api/siskill/checkout`            | One-time Stripe or Alipay checkout                        | Enable flag, valid bearer user, reviewed SKU, intact private package, provider config |
| `POST /api/siskill/stripe-webhook`      | Payment, expiry and full refund                           | Raw-body Stripe signature, mode and stored purchase contract                          |
| `GET /api/siskill/zpay-notify`          | Alipay settlement                                         | Unique parameters, MD5 signature, merchant and stored purchase contract               |
| `GET /api/siskill/me`                   | Own orders and latest published purchased Skills                  | Valid bearer user                                                                     |
| `GET /api/siskill/downloads/:releaseId` | Private purchased archive stream                          | Own active grant, published release, actual archive byte length and SHA-256 match                  |

The readiness endpoint reports configuration only; it does not prove provider health,
existence of a sellable catalog, login completion or successful payment acceptance.

## Database migration

`supabase/migrations/20261021090000_siskill_commerce.sql` adds five `siskill_*` tables,
three service-only RPCs, two immutability trigger functions and two own-row read policies.
It does not alter legacy `payment_orders`, subscriptions, credits or auth user records.
All product rows default inactive. No products or grants are inserted.

The user selected shared WebToMind identity. This exact migration was applied to
project `slixamjkvpoijrnbwzxi` via the Supabase migration API on 2026-10-21, using name
`siskill_isolated_one_time_commerce` (hosted version `20261021011654`). Hosted verification confirmed all five tables have
RLS enabled, authenticated users cannot execute settlement RPCs, service role can, and
active SKU/order/grant counts are zero. Existing customer records were not queried.

Do not run the repository's complete experimental Skill migration history against
production. The local PGlite tests exercise this exact SQL with roles, transactions and
RLS. Hosted checks confirm schema/permissions, not real payment acceptance.

## Private runtime configuration

Keep `SISKILL_COMMERCE_ENABLED=false` during preparation. Supply the following only as
Worker secrets/bindings, never as `VITE_*` variables or public catalog metadata:

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`: approved shared project.
- `SUPABASE_ANON_KEY`: public auth key; `/auth-config` rejects a service-role key.
- `SISKILL_AUTH_REDIRECTS_READY=true`: saved and verified on 2026-10-21:
  `https://siskill.dev/en-US/account` and `https://siskill.dev/zh-CN/account` in
  the existing auth redirect allowlist. Preserve all WebToMind entries and Site URL.
- `SISKILL_STRIPE_SECRET_KEY`, `SISKILL_STRIPE_WEBHOOK_SECRET`: matching test or live
  mode; the webhook secret belongs to SiSkill's endpoint, not WebToMind's endpoint.
- `SISKILL_ZPAY_PID`, `SISKILL_ZPAY_KEY`: the approved existing merchant account.
- `SISKILL_PACKAGES`: private R2 binding, public access disabled. Keys start `siskill/`.
  Upload reviewed bytes to immutable, versioned keys with verified `sha256` custom
  metadata and actual byte length. Download verification hashes the actual bytes; custom metadata is optional.

Register Stripe endpoint events: `checkout.session.completed`,
`checkout.session.async_payment_succeeded`, `checkout.session.expired`, `charge.refunded`.
Use the installed Stripe SDK API version and compatible event payloads. Raw-body
verification uses the SDK's Fetch and Web Crypto providers in the Worker.
Provider implementation reference: https://github.com/stripe/stripe-node/blob/master/src/Webhooks.ts

The provider accounts may be shared; the SiSkill Worker and endpoint secrets remain
separate. WebToMind's deployed credentials, callback URLs and fulfillment are unchanged.

## Requirements before enabling the first sale

1. Shared account model is confirmed and the account/library UI is implemented.
   Both redirect URLs are saved and the Google authorization handoff is verified.
   Complete real Google sign-in, signup email and password recovery acceptance.
   Verify post-checkout status. Do not make the success query
   string or a cancelled browser tab authorize a download.
2. Review the exact first package and license contract: original/licensed source,
   attribution, personal paths/credentials/customer data removed, reproducible agent
   example and actual install/output test. Record archive hash, size and version.
   The current preview catalog's `review` status does not satisfy this requirement.
3. Define one-time rights accurately. A single-Skill purchase now includes subsequent published versions of the same Skill,
   while Pro access remains a separate paid-period entitlement.
4. Add the inactive server SKU with separately approved USD/CNY prices and immutable
   contract version. Do not derive payment amounts from browser or display-price text.
5. Complete provider test-mode acceptance: successful and failed payment, pending return,
   retries, recovery after lost checkout response, expiration, full refund, cross-product
   denial, authenticated private download and no public archive URL. Record separately
   from mocks. Stripe disputes/chargebacks require an operational handling and revocation
   procedure before live sales; automatic handling is not included yet. Alipay refunds
   likewise require verified merchant reconciliation and order-specific revocation.
6. Deploy a clean commit after SiSkill CI passes; bind only approved private config.
   Validate desktop/mobile account and purchase flows and the Worker runtime. Enable
   only reviewed SKUs, then the sales flag. Real payment acceptance requires its own
   recorded transaction/consent; never infer it from test-mode success.

Monthly/yearly membership lifecycle is implemented and test-mode verified. Hosted Checkout
and real payment acceptance remain; see the membership release record.

## Recovery and operations

Disable `SISKILL_COMMERCE_ENABLED` to stop new checkout while keeping existing signed
webhooks and authorized downloads functioning. Do not delete orders/grants or drop
transaction tables as rollback. Investigate pending provider state before retrying;
never invent another idempotency key for an uncertain payment. An unbound Stripe order
older than 55 minutes requires reconciliation. A bound expired session must be marked
expired by the verified provider event before a replacement checkout is created.

A full-refund event revokes only its order. A refund received before the payment event
creates a refunded tombstone; late payment cannot restore access. Partial refunds do
not automatically revoke the whole license. Package withdrawal blocks distribution;
it is an operational exception to resolve with affected purchasers, not a refund.

Rollback the SiSkill Worker version only. Preserve database records and keep a compatible
webhook handler if any real order has ever been created. Never roll back WebToMind as
part of a SiSkill release.

## WebToMind referral change

The source header and footer link to the matching SiSkill locale with
`utm_source=webtomind`, `utm_medium=referral`, `utm_campaign=siskill_launch`, and
placement-specific `utm_content`. Both use an external anchor in a new tab. The footer
provides a mobile entry. These changes require the separate WebToMind release process
and overlay review; deploying SiSkill does not publish WebToMind UI changes.
