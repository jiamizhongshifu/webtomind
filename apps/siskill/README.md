# SiSkill

SiSkill is an independent product for discovering and buying reusable agent Skills.
Its own domain is https://siskill.dev. WebToMind remains a separate product and can
refer visitors to SiSkill. A shared source repository does not imply shared membership.

## Current release

This app is a public preview: an English-first bilingual landing page, ten original
workflow demonstrations, a searchable catalog, product detail pages and planned pricing.
Cards play silent 16:9 demos on hover; touch and reduced-motion users have an explicit
play control. All packages are marked coming soon. There is no checkout, login,
private archive distribution, customer database or credit balance in this deployment.
The listed compatibility comes from package metadata, not a claim of testing every agent.

The app builds independently of WebToMind and deploys as the `siskill` Cloudflare Worker.
It has only an `ASSETS` binding. It does not load the hosted WebToMind content overlay,
production environment, authentication, analytics or billing credentials. Shared UI
components are source reuse; changes here do not deploy the WebToMind Worker.

## Business and shared payments

The approved product boundary is recorded in `docs/SISKILL_PRODUCT_BOUNDARY.md`.
Stripe and the existing Alipay integration may share merchant infrastructure with
WebToMind. SiSkill must have distinct product identifiers, orders and entitlements.
The current WebToMind checkout/webhook must not be called by this preview: they fulfill
WebToMind subscriptions and credits. Implementation of product-aware settlement is
required before enabling sales; no production billing migration is included here.

## Development and verification

Use the repository's Node and pnpm versions.

```sh
pnpm exec vite build --config apps/siskill/vite.config.ts
pnpm exec tsc --noEmit -p apps/siskill/tsconfig.json
node --test apps/siskill/worker.test.mjs
node apps/siskill/verify-public.mjs
pnpm exec wrangler dev --config apps/siskill/wrangler.jsonc --port 8788 --local-upstream localhost:8788
```

Browser acceptance covers desktop and mobile: hero output selection, video playback,
card hover/tap, filtering, search, detail gallery, language switching, navigation,
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
node scripts/cloudflare-credentials.mjs exec workers -- pnpm exec wrangler deploy --config apps/siskill/wrangler.jsonc
```

The config binds only `siskill.dev` and `www.siskill.dev`. Custom Domains provision DNS
and TLS. The www hostname redirects to the apex, preserving the route and query string.
Root defaults to English and keeps acquisition parameters. Product metadata, canonical
URLs and sitemap use the SiSkill domain. Unknown pages return 404; APIs cannot be used.
Verify the live manifest commit, HTTPS, root/locale/www redirects, media range requests,
and desktop/mobile interactions after release. Record the Worker version for rollback;
rollback only this Worker, never the WebToMind deployment.
