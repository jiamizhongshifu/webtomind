# Gateway result delivery and settlement

Retired on 2026-10-09: public API gateway and management endpoints now return
`410 API_MARKETPLACE_RETIRED`, and API recharge checkout is blocked. The
behavior below documents the retained legacy settlement implementation used
for historical diagnostics. Existing payment callbacks and settlement recovery
remain active to finish historical orders; this is not an available API product.

The gateway returns successful upstream output even when internal settlement is
unavailable. Ordinary JSON/text and aggregated chat completions retain their
successful response schema and status. Billing failures do not replace output
with a retryable HTTP 503. Failed upstream responses remain sanitized errors
with their original status, including when their refund is pending.

Response headers (also exposed to browser clients):

| Header | Meaning |
| --- | --- |
| `X-WebToMind-Request-Id` | Existing ledger request/idempotency identifier. |
| `X-WebToMind-Billing-Status: settled` | The ledger explicitly acknowledged settlement. |
| `X-WebToMind-Billing-Status: pending` | Buffered responses: the retry queue acknowledged the observed usage. SSE: a snapshot at stream start, before final usage/settlement is available. |
| `X-WebToMind-Billing-Status: unconfirmed` | Neither inline settlement nor queue persistence could be acknowledged. The successful result is still returned; accounting needs reconciliation. |
| `X-WebToMind-Cost-Cents` | Present only for a confirmed settlement with a valid actual amount returned by the ledger, including its existing reservation cap. Never an estimate marked as final. |

Clients should retain the successful result and correlate usage records by the
request ID. A pending/unconfirmed bill is not authorization to perform another
upstream operation for free. Reusing an Idempotency-Key still returns HTTP 409
both while reserved and after completion; no response replay or free upstream
retry is introduced. The authenticated usage UI/API remains the existing source
of final billing records. SSE frames are forwarded unchanged; billing does not
inject proprietary events into the provider protocol.

Settlement retries use the same request ID and amounts. Each RPC acknowledgement
is limited to 2 seconds, with at most three inline attempts and three queue
attempts. Thrown transport errors and empty/malformed acknowledgement payloads
are retried. Lost acknowledgements are safe against the existing SQL idempotency
rules, including a committed settlement subsequently queued for recovery. The
settlement RPC already updates key last-use metadata transactionally; a redundant
key update no longer blocks result delivery.

On downstream cancellation, the stream parses usage before attempting each
write and continues reading the upstream independently. It drains for at most
15 seconds, then retains the pre-existing best-observed-usage/reservation
fallback if usage is unavailable. `usage_source` (`provider` / `missing`) and
`stream_outcome` (`complete` / `disconnected` / `interrupted`) are recorded in
existing metadata; no new table or pricing rule is introduced. An upstream read
failure errors the downstream stream instead of presenting a clean EOF. The
stream closes before billing retries; its accounting promise is registered with
`context.waitUntil`.

## Runtime and recovery boundaries

Production `/v1/*` routing in `workers/webtomind.ts` passes the Worker execution
context. This fix enables `enable_request_signal` in the existing Wrangler
configuration because [incoming request cancellation requires that flag](https://developers.cloudflare.com/workers/configuration/compatibility-flags/#enable-requestsignal-for-incoming-requests).
The other explicit incoming-signal consumer is discovery image description,
which already forwards that signal for cancellation. No passthrough flag is added.
Upstream fetch uses its own AbortController; the existing 30-second header timeout
is cleared after headers. Observed client cancellation starts bounded stream
draining, not immediate upstream cancellation. The 15-second drain plus
six 2-second RPC attempts and 150ms total retry delay fits nominally within the
30-second post-disconnect window, excluding scheduling overhead.
[Cloudflare documents that window](https://developers.cloudflare.com/workers/runtime-apis/context/).
This is bounded best-effort work, not a guarantee against worker termination,
event-loop delay, or process exit. Socket cancellation may be observed late; a
short stream can finish before the runtime reports it. `complete` means the
gateway reached upstream EOF, not a client receipt acknowledgement. Other
adapters must provide equivalent lifetime support; local tests do not constitute
production live acceptance.

A confirmed queue entry uses the existing ten-minute cron and existing SQL
settlement idempotency. Pending/processing entries survive stale-reservation
expiry. Existing dead-letter behavior (alert, then possible stale refund) is
unchanged. If every database write fails or the process exits before an entry is
persisted, the gateway cannot promise durable accounting; `unconfirmed` and a
usage-only error log expose that incident. No request or response content is
written to logs or stored by this fix.

Disconnected clients cannot retrieve a lost result under the current API. A
stronger guarantee would require separately approved response persistence,
authorized retrieval, retention/deletion rules, durable execution and possibly a
production migration. Changing missing-usage, dead-letter or stale-refund
charging rules also requires a separate billing decision. None are included here.

## Local validation

`src/__tests__/api-marketplace-gateway-settlement.test.ts` drives the actual gateway
with mocked upstream/Supabase transport and executes existing migrations in
in-process PGlite. It checks ordinary and aggregated output, late stream usage,
body cancellation and request abort, RPC and queue failures, lost acknowledgements,
repeated recovery, replay rejection, the final wallet balance, reservation caps,
missing usage, stream truncation and bounded drain/settlement timeouts. No real
provider, credentials, customer database or billable calls are used.

`scripts/test-api-marketplace-gateway-runtime.mjs` bundles the actual gateway
into local workerd with mocked upstream/database modules, blocks outbound
requests and uses the checked-in compatibility date/flags. It destroys a real
localhost HTTP response socket before late usage frames arrive, then verifies
that upstream draining, all three inline settlement attempts, queue persistence
and `waitUntil` completion still occur. Direct loopback access avoids an extra
Miniflare proxy in the cancellation path.

Run the related suites with Node from `.node-version` and the repository pnpm:

```sh
pnpm exec vitest run src/__tests__/api-marketplace*.test.ts src/__tests__/api-marketplace*.test.tsx --maxWorkers=2
node scripts/test-api-marketplace-gateway-runtime.mjs
pnpm type-check:all
pnpm lint
VITE_SUPABASE_URL=https://supabase.invalid VITE_SUPABASE_ANON_KEY=local-mock-build-only pnpm build
```

The placeholder build is a compilation check only. CI, production migration,
deployment and live acceptance are separate and were not requested here.
