# SiSkill product boundary — 2026-10-21

Decision: launch the Skill business as **SiSkill**, independently from WebToMind.
Use `siskill.dev` as its canonical domain and retain the URL throughout browsing.
WebToMind is a referral channel, not a membership entitlement provider for SiSkill.

| Area                  | SiSkill                                                            | Reuse permitted                                                 |
| --------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------- |
| Brand and acquisition | Own name, landing page, SEO, campaigns and funnel                  | Design primitives and WebToMind referral links                  |
| Catalog               | Own Skill IDs, release status, bundles and price catalog           | Sanitized original demos and authored packages                  |
| Customer workflow     | Discover → preview → buy/join → library → install/update           | Identity provider, if membership checks remain product-specific |
| Membership            | Own free/paid catalog access and renewals                          | Merchant account and payment adapter                            |
| Purchases             | Own one-time Skill licenses and purchase history                   | Provider checkout, invoice, refund and webhook transport        |
| Entitlements          | SiSkill access only; no WebToMind credits or membership            | Verified payment event infrastructure                           |
| Operations            | Own deployment, support labels, analytics and conversion reporting | Shared support team and merchant settlement                     |

## Release now

The independent public preview supports home, catalog, detail pages, silent video demos
and planned pricing. Pricing is a proposal: $9.99/month or $79/year, individual Skills
from $4.99. It is not an active offer or a charged subscription. Do not introduce a new
lifetime plan before defining eligible catalog, update rights and sustainable costs.
Downloads and checkout remain closed while packages and fulfillment are prepared.

## Payment integration contract to implement before sales

The existing source uses Stripe and ZPay-backed Alipay (`api/membership/checkout.ts`,
`api/membership/webhook.ts`). Existing `payment_orders.product_type` and product metadata
control fulfillment. Blind reuse would grant WebToMind subscriptions/credits.

The first implemented slice supports **one-time paid Skills** only. Its reviewed
migration is `supabase/migrations/20261021090000_siskill_commerce.sql`; deployment and
activation are separate actions. It creates five prefixed tables without changing or
backfilling legacy WebToMind tables:

- `siskill_releases`: reviewed, immutable archive identity and checksum.
- `siskill_products`: server-owned SKU, prices, release and license-contract version.
- `siskill_orders`: user, provider, immutable quote and purchase status.
- `siskill_grants`: access to the purchased release, revoked after a full refund.
- `siskill_payment_events`: idempotent provider event ledger.

Authenticated users can read only their own orders/grants. Catalog writes and
settlement RPCs are service-only. Browser checkout accepts only SKU, provider and locale;
amount, currency, fulfillment scope and return URL cannot be supplied by the client.
The first order freezes locale too, so retries preserve provider idempotency parameters.

Stripe and Alipay may reuse existing merchant accounts, with **separate SiSkill callback
endpoints and fulfillment**. Verified callbacks match order, scope, provider, amount,
currency and transaction ID. Stripe metadata also matches SKU and authenticated owner.
A full refund revokes the order's grant, including out-of-order refund/payment callbacks.
WebToMind subscriptions, credits and lifetime access are never consulted or granted.
Private downloads require an active SiSkill grant and a published archive with matching
size/checksum metadata. The public site build never contains private archives.

Identity storage is a pending product decision: separate SiSkill user database versus
shared identity with separate product entitlements. The migration can target either
Supabase project's `auth.users`; do not choose or populate production until resolved.
Login, post-payment account/library UI and branded auth email configuration remain to
be connected after that decision. Returning to an account URL is never payment proof.

Monthly/yearly plans, renewal/cancellation, automatic dispute handling and automatic
Alipay refund reconciliation are **not implemented** in this slice. Membership stays
closed. One-time sales also remain closed until the activation criteria in
`docs/SISKILL_COMMERCE_RELEASE.md` are met. Provider test-mode and real payment acceptance
must be recorded separately from unit/database tests.

## WebToMind referral

Use a normal external link labelled “SiSkill — Agent Skills” with
`https://siskill.dev/en-US/overview?utm_source=webtomind&utm_medium=referral&utm_campaign=siskill_launch&utm_content=header`.
Use `zh-CN` for the Chinese entry and `footer`/`creator_result` for other placements.
The SiSkill root redirect preserves tracking parameters. Do not silently replace
WebToMind's current landing page with SiSkill. Source changes in the existing dirty
WebToMind checkout still require their own release review; the SiSkill deployment does
not publish those changes. Outbound clicks are not completed purchases.

## Content release

Only original/licensed packages with provenance, secret/path/account-data redaction,
real agent examples and an approved version may be distributed. Third-party Skill
implementations require their own license/attribution review. Do not sell competitors'
source. Public demos remain English, 16:9, functional, without narration; fictional
sample outputs are identified as demonstrations. No private package archive is included
in this site build.
