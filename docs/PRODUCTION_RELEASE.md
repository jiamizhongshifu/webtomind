# Development and production releases

`jiamizhongshifu/webtomind` is the primary development repository. Open pull
requests and push future application changes here. Its CI uses standard
GitHub-hosted runners. The previous private repository is retained as history;
its Actions workflows are disabled after the production cutover is verified.

## Hosted deployment

The `CI` workflow tests the public source first. On this repository's `main`,
the production release job then builds and deploys the exact checked commit.
Set `WEBTOMIND_AUTO_DEPLOY=true` to enable deployment on pushes. Forks and pull
requests run checks without production secrets.

Configure the `production` environment to allow only the `main` branch.
Its secrets are `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`WEBTOMIND_CLOUDFLARE_ACCOUNT_ID`, `WEBTOMIND_CLOUDFLARE_WORKERS_API_TOKEN`,
`WEBTOMIND_RUNTIME_ENV_B64`, and `WEBTOMIND_HOSTED_OVERLAY_CONFIG`.
Self-hosted installations use their own configuration and do not need the
WebToMind hosted content overlay or its deployment credentials.

The hosted overlay preserves licensed content, site-specific assets and
configuration omitted from the public distribution. It is an AES-256-GCM
encrypted, immutable R2 object, pinned by SHA-256 in the environment secret.
The object is authenticated before any file is written. It cannot replace
workflows or deployment scripts. No private source checkout is needed by CI.

Each replaced file records the expected public source hash. If a public change
touches one of those files, deployment stops before overwriting it. Review and
refresh the hosted overlay against that public revision; never bypass this
check. Additions also require their destination to be absent. The release
source gate rejects any changes outside the verified overlay and checks every
overlaid file again before deployment. The public release manifest records
both the public Git commit and `hostedOverlaySha256`.

## Verification and recovery

A successful release requires the check job, production type checks, build,
production endpoint checks and release-integrity smoke to pass. Verify the
cache-busted production manifest and relevant browser behavior after changing
runtime behavior. Do not equate a successful push with a successful deployment.

The private deployment workflow is retained but disabled as a recovery route.
Re-enabling it requires deliberately choosing the source revision and avoiding
concurrent releases. Do not routinely run both repository pipelines.

GitHub runner minutes for these standard public workflows are free; other
GitHub products, storage above included allowances and external cloud/model
services retain their own billing.
