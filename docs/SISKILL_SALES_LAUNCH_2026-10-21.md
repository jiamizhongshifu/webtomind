# SiSkill sales launch — 2026-10-21

The user explicitly authorized opening formal sales, superseding the earlier decision
to keep checkout closed. This release enables only reviewed SiSkill offers. WebToMind
identity and the existing Stripe merchant are shared; orders, memberships, fulfillment,
domains and Worker deployments remain separate.

## Offers and disclosure

| Offer | USD price | Scope |
| --- | --- | --- |
| Customer Case Study Deck 1.0.2 | $9.99 once | This Skill and subsequent published versions during service operation |
| SiSkill Pro monthly | $9.99/month | Published studio Pro Skills during the paid period; automatic renewal |
| SiSkill Pro yearly | $79/year | Same scope; annual automatic renewal |

Pro currently contains **one** published paid Skill: Customer Case Study Deck. Both
pricing and the pre-checkout account screen disclose this. Eight other demonstrations
are still previews and cannot be purchased or downloaded. Open Graph Image 1.0.4 remains
free after sign-in. Model fees, third-party services and WebToMind benefits are excluded.
No lifetime plan, marketplace seller payouts or unconfigured Alipay checkout is enabled.

The paid archive is reviewed, versioned and stored in private R2. Its public manifest
contains only the release identity, SHA-256, byte length, license version and SKU; it
contains neither the archive nor its private object key. Paid bytes require authenticated
server authorization. The source catalog review status remains historical provenance;
the separate distribution review identifies the exact approved release.

## Payment and access controls

Amounts, currency and release/license snapshots come from server-owned records. Checkout
is hosted by Stripe. A success URL is not payment proof. Signed callbacks settle only
SiSkill-scoped orders. Membership downloads require a current paid subscription period,
and cancellation stops future renewal without discarding the already paid period.

Every one-time paid download now rechecks the provider PaymentIntent and Charge against
the exact order metadata, amount, currency and live/test mode. Full refunds deny access
even before local callback processing; partial refunds retain the license. An open/lost
dispute pauses downloads; a won or warning-closed dispute permits them again when the
remaining payment checks pass. Missing/truncated dispute evidence or provider failure
cannot grant access. The library uses the same check. A local active grant alone is not
proof that a download remains authorized. No dispute SQL ledger is claimed.

For support/refunds, use the existing merchant dashboard after verifying the SiSkill
order ID, product scope, amount and original payment. Apply any authorized refund to that
payment, preserve order/grant/event records, and verify the signed callback and download
denial. Do not edit an order to simulate payment, delete financial records, or refund a
WebToMind order as part of SiSkill handling. Support is linked before checkout.

## Verification boundaries

Local checks cover type safety, Worker routes and the 69 commerce/lifecycle tests.
Actual Stripe test-mode verification additionally covers provider-backed successful
payment, partial refund retention and full refund denial through the shipping access
checker. Earlier test-mode lifecycle evidence covers checkout, fulfillment, download,
renewal/cancellation and refund handling; its local identity/R2 fixtures are explicitly
separate from production shared-login and private-R2 readback evidence.

Stripe explicitly prohibits live-mode testing with real payment details:
https://docs.stripe.com/testing. No small real-card self-payment or self-refund is part
of this launch. Live acceptance opens the actual hosted Checkout offers without payment
submission, then expires those scoped unpaid sessions and verifies Stripe-origin signed
expiry callbacks. This proves live checkout configuration and callback transport; it
does **not** prove a successful real-money payment or a real purchaser's download.
The first genuine customer payment remains a separate operational acceptance item.

Shared email/password login and local sign-out are exercised in desktop/mobile browser
acceptance. Full Google login and actual signup/recovery email delivery are still
separate outstanding checks. Do not report them as covered by password login.

## Release and recovery

Run the independent SiSkill CI for the exact clean pushed commit, build that source and
generate its manifest. Activate only `siskill_case_study_deck`, `pro_monthly` and
`pro_yearly`, then deploy only the SiSkill Worker with both enable flags true. Verify
the live manifest, public offer endpoints and desktop/mobile purchase flows. Preserve
private operational evidence under `output/siskill-launch/`; never commit credentials,
QA sessions or customer records. CI, deploy and live acceptance must be recorded
separately in that release report.

For rollback, disable new checkout while preserving signed webhooks, existing grants,
membership access checks and financial records. Only roll back the SiSkill Worker.
Never roll back or change WebToMind production as part of this launch.
