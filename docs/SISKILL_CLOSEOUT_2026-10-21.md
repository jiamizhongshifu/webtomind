# SiSkill release closeout — 2026-10-21

## Product state

SiSkill is live at https://siskill.dev as an independent, bilingual Skill storefront.
WebToMind identity is shared; orders, membership, sessions and download rights are separate.
The user's latest instruction is to **keep sales closed and defer real payment acceptance**.
No activation or real charge is authorized by this closeout.

| Surface | Delivered state |
| --- | --- |
| Home, catalog, details | Ten original fictional workflow demos; English 16:9, no voiceover |
| Card videos | Visible cards automatically play muted and loop; no hover or preview button; offscreen cards pause |
| Free download | OG Image 1.0.4; registered shared account required on GET and HEAD |
| Paid package | Customer Case Study Deck 1.0.2 reviewed, sanitized, uploaded to private R2; SKU inactive |
| Paid checkout | Independent Stripe fulfillment implemented; commerce switch false |
| Pro membership | $9.99 monthly / $79 yearly prepared; both plans inactive; membership switch false |
| Account | Shared password login, own library and orders, membership state and renewal controls |
| Public assets | Demos and posters only; no installation archives, private credentials or source maps |

The preview's ten cards do not mean ten downloadable products. Only the free allowlisted
OG Image is currently available. Case Study Deck is prepared privately; all other catalog
items remain previews until their distribution packages pass review.

## Verification evidence

- Login gating and actual free downloads passed in English desktop and Chinese mobile,
  including logout and return to the original Skill. Old free version routes are retired.
- Membership/commerce release passed 61 related tests, type checks, build and
  [SiSkill CI](https://github.com/jiamizhongshifu/webtomind/actions/runs/39534726283).
- Stripe test API and Test Clock covered paid periods, renewal, cancellation, resume,
  full refund and access expiry. Test subscriptions were cancelled and the clock removed.
- Real Stripe hosted Checkout **test mode** covered decline, unpaid return, paid return,
  duplicate provider events, hash-verified download and refund revocation. Its SQL ledger,
  identity and R2 were fixtures; this does not prove production callback delivery.
- Autoplay passed nine local and nine production browser scenarios: 1440px, 805px and
  390px across home, catalog and OG detail recommendations; all ten catalog videos played
  without hover. [Autoplay CI](https://github.com/jiamizhongshifu/webtomind/actions/runs/39535897130) passed.
- QA accounts and workspace credential copies were removed; signing credentials remain
  in restricted configuration outside Git. Temporary acceptance servers were stopped.

Read the cache-busted `/release-manifest.json` for the exact current deployed commit.
Local private evidence is retained under `output/siskill-free/`,
`output/siskill-membership/` and `output/playwright/siskill-autoplay-release.json`.
Final public endpoint/media verification is recorded under `output/siskill-closeout/`.
Do not substitute the branch tip or a successful push for deployed-version evidence.

## Deliberately unfinished acceptance

1. Real payment, signed production callback, purchaser download, refund and revoked
   download remain deferred by the user. Do not enable sales merely because test mode passed.
2. Signup confirmation mail, password-recovery mail and completed Google sign-in require
   end-to-end acceptance with an authorized receiving account. Redirect configuration and
   OAuth handoff passed; they are not evidence of mail delivery or completed sign-in.
3. One-time Stripe disputes/chargebacks need a verified revocation/reconciliation path
   before sale. Membership checks current provider disputes, but that does not cover
   one-time grants. Alipay is not configured and must stay unavailable until its own
   payment/refund acceptance is complete.
4. WebToMind referral links exist in source but require a separate WebToMind release.
   SiSkill deployment does not publish them. Preserve the existing main product and overlay.
5. Eight other previews still need reviewed packages and execution examples before being
   listed as downloadable. No competitor implementation or unreviewed local Skill may be sold.

## Safe continuation and source integration

The `codex/siskill-launch` branch contains both the independent SiSkill app and earlier
experimental WebToMind catalog/billing changes. Do not merge the entire branch into
`main` as a closeout shortcut. A future integration should select the SiSkill app,
required shared UI/assets, its isolated migrations and workflow into a reviewed change;
exclude superseded WebToMind billing/entitlement changes and experimental migrations.
Run the main product's production-overlay checks before any WebToMind deployment.

Before later activation, resolve the items above, match the reviewed package hash and
server-owned price, verify SiSkill webhook scope and current billing mode, and update
preview/availability copy to match the accepted offer. The current catalog intentionally
does not advertise the prepared paid archive as available. Activate only the accepted SKU
or plans, then the corresponding switch, with recorded user authorization.

For recovery, close new-checkout switches while preserving payment callbacks, historical
records and lawful downloads. Never delete orders/grants, replay an uncertain payment
under a new idempotency key, alter another product's callback, or roll back WebToMind.
SiSkill Worker rollback alone does not remove private package objects or database history.
