# SiSkill

SiSkill is an independent product for discovering and buying reusable agent Skills.
Its own domain is https://siskill.dev. WebToMind remains a separate product and can
refer visitors to SiSkill. A shared source repository does not imply shared membership.

## Current release

This app is a public preview: an English-first bilingual landing page, ten original
workflow demonstrations, a searchable catalog, product detail pages and planned pricing.
Cards automatically loop silent 16:9 demos when visible on desktop and mobile, without
hover or a preview button. Offscreen cards and hidden tabs pause until visible again. Open Graph Image 1.0.4 is available free after sign-in, through a
separate reviewed allowlist and private R2 bucket. Paid sales and paid archive distribution remain closed.
The public assets never include installation archives. See `docs/SISKILL_FREE_RELEASE.md`. The account page uses the shared
WebToMind user database with separate SiSkill sessions, orders and grants. Email/password
sign-in is supported; Google/signup/recovery entry points use the verified SiSkill redirect allowlist.
Google authorization handoff is verified; full Google login and email delivery remain separate acceptance items. An independent,
default-closed `/api/siskill/*` commerce handler is now included in the Worker source.
The listed compatibility comes from package metadata, not a claim of testing every agent.

The app builds independently of WebToMind and deploys as the `siskill` Cloudflare Worker.
It has its own `ASSETS` and explicitly provisioned shared Supabase bindings. It does not
load the hosted WebToMind content overlay or automatically inherit its environment.
Merchant configuration is separate even when merchant accounts are reused. Shared UI
components are source reuse; changes here do not deploy the WebToMind Worker.

## Business and shared payments

The approved product boundary is recorded in `docs/SISKILL_PRODUCT_BOUNDARY.md`.
Stripe and the existing Alipay integration may share merchant infrastructure with
WebToMind. SiSkill must have distinct product identifiers, orders and entitlements.
The current WebToMind checkout/webhook must not be called by this preview: they fulfill
WebToMind subscriptions and credits. The one-time purchase backend is implemented with its own tables, signed callbacks and
private-download authorization. The isolated migration has been applied to the approved shared database;
see `docs/SISKILL_COMMERCE_RELEASE.md` for activation requirements. Monthly/yearly membership,
paid-period authorization and cancellation are implemented behind a separate closed flag;
see `docs/SISKILL_MEMBERSHIP_RELEASE.md` for validation and remaining real-sale acceptance.

## Development and verification

Use the repository's Node and pnpm versions.

```sh
pnpm exec vite build --config apps/siskill/vite.config.ts
pnpm exec tsc --noEmit -p apps/siskill/tsconfig.json
pnpm exec vitest run --config apps/siskill/vitest.config.ts
node apps/siskill/verify-public.mjs
pnpm exec wrangler dev --config apps/siskill/wrangler.jsonc --port 8788 --local-upstream localhost:8788
```

Browser acceptance covers desktop and mobile: hero output selection, video playback,
automatic card playback, filtering, search, detail gallery, language switching, navigation,
planned pricing, unknown routes and no horizontal overflow. Media provenance records
original fictional demonstrations; no private template implementation is distributed.

## Release

The `SiSkill` workflow builds and checks the independent app without production secrets.
Release only a clean, pushed commit with that workflow green; generate the manifest from
that same source and deploy with the scoped Cloudflare Workers credential:

```sh
pnpm exec vite build --config apps/siskill/vite.config.ts
node apps/siskill/manifest.mjs
node apps/siskill/verify-public.mjs
node scripts/cloudflare-credentials.mjs exec workers -- pnpm exec wrangler versions upload --config apps/siskill/wrangler.jsonc
# Use the version ID returned above; existing custom domains stay bound.
node scripts/cloudflare-credentials.mjs exec workers -- pnpm exec wrangler versions deploy <version-id>@100 --yes --config apps/siskill/wrangler.jsonc
```

The config binds only `siskill.dev` and `www.siskill.dev`. Custom Domains provision DNS
and TLS. The www hostname redirects to the apex, preserving the route and query string.
Root defaults to English and keeps acquisition parameters. Product metadata, canonical
URLs and sitemap use the SiSkill domain. Unknown pages return 404. `/api/siskill/status` reports readiness; commerce APIs fail
closed until configured and checkout also requires its explicit enable flag.
Verify the live manifest commit, HTTPS, root/locale/www redirects, media range requests,
and desktop/mobile interactions after release. Record the Worker version for rollback;
rollback only this Worker, never the WebToMind deployment.
