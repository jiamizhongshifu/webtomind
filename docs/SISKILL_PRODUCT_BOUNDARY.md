# SiSkill product boundary — 2026-10-21

Decision: launch the Skill business as **SiSkill**, independently from WebToMind.
Use `siskill.dev` as its canonical domain and retain the URL throughout browsing.
WebToMind is a referral channel, not a membership entitlement provider for SiSkill.

| Area | SiSkill | Reuse permitted |
| --- | --- | --- |
| Brand and acquisition | Own name, landing page, SEO, campaigns and funnel | Design primitives and WebToMind referral links |
| Catalog | Own Skill IDs, release status, bundles and price catalog | Sanitized original demos and authored packages |
| Customer workflow | Discover → preview → buy/join → library → install/update | Identity provider, if membership checks remain product-specific |
| Membership | Own free/paid catalog access and renewals | Merchant account and payment adapter |
| Purchases | Own one-time Skill licenses and purchase history | Provider checkout, invoice, refund and webhook transport |
| Entitlements | SiSkill access only; no WebToMind credits or membership | Verified payment event infrastructure |
| Operations | Own deployment, support labels, analytics and conversion reporting | Shared support team and merchant settlement |

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

1. Add a server-controlled `product_scope` with `webtomind` and `siskill`. Backfill
   existing orders/subscriptions to WebToMind. Missing scope on legacy events must
   remain WebToMind; never infer SiSkill from the request host or a client field.
2. Create SiSkill SKUs and provider price IDs independently. Accept only catalogued
   `(product_scope, product_id, price_id, currency, billing_cycle)` combinations.
   A client cannot choose fulfillment scope, amounts or arbitrary price IDs.
3. Persist scope on internal orders before checkout. Include `order_id` and
   `product_scope` in provider metadata; bind customer and authenticated user to
   the order. Reuse customer IDs only through an explicit identity mapping.
4. Shared webhook transport verifies provider signatures and retrieves the stored
   order. Check scope, amount, currency, merchant, customer and product before an
   idempotent transaction. Route SiSkill orders only to SiSkill fulfillment; renewal,
   cancellation, refund and chargeback use the same stored product ownership.
5. SiSkill entitlements are keyed by `(product_scope, user_id, sku/skill_id)`;
   subscriptions, order history and download authorization must filter by scope.
   Existing WebToMind Pro/Lifetime/credit checks must never authorize SiSkill downloads.
6. Allowlist SiSkill success/cancel/account URLs on the server. Do not accept arbitrary
   return URLs. Across domains use an explicit OAuth/token exchange if SSO is desired;
   do not depend on sharing `.webtomind.com` cookies with `siskill.dev`.
7. Keep checkout/receipt product names clear: SiSkill purchase, existing legal merchant.
   Configure provider branding where supported; do not misrepresent the merchant.
8. Verify one-time purchase, subscription renewal/cancellation, webhook retries,
   cross-product denial, refund revocation and return URLs in test mode. Migrate and
   deploy only reviewed scope changes; real payment acceptance is a separate recorded
   check, not implied by a build, mock or test-mode purchase.

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
