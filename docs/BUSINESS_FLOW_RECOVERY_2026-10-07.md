# Business flow recovery

## Subscription checkout

The serialized checkout recovery now reconciles a Stripe order whose local
session ID is missing. It waits 30 minutes for in-flight creation, reads at most
five pages within a 12-second budget from the order creation time through the present, and
matches both order and user metadata. Partial scans, multiple matches, completed
sessions and processing orders retain their reservation. A unique open session
is linked and reused for the same plan/cycle. Confirmed absence or expiry releases
the pending order through a conditional write; the customer can retry checkout.
No new provider session or charge is created during recovery.

## API first request and pricing

The console preserves `?model=`, supports switching models, and copies a complete
Python request for a gateway-supported, declared endpoint. The example reads its
key from the environment, disables implicit SDK retries and prints provider error
status/request IDs. Unknown models and unverified endpoints get explicit guidance
rather than a fabricated example. Catalog failures can be retried independently
of wallet loading.

Provider prose containing a price/billing claim is replaced with a description
from the same normalized prices used by the gateway and model cards. This changes
presentation, not prices or accounting. It does not certify the supplier's price
configuration or replace paid settlement acceptance. The production video-price
check now imports the shared formula rather than maintaining stale constants.

## Refund recovery

The scheduled worker retries up to ten aged full-failure tasks per media type.
Conditional timestamp claims prevent concurrent retries and rotate deferred rows
so ambiguous historical records cannot starve newer refunds.
It requires an intact prepaid breakdown, checks the original refund ledger, and
reuses the original refund RPC, source and idempotency key (including the dedicated
denoise path). Confirmed existing full refunds only clear the failure flag.
Partial refunds, unknown phases and incomplete evidence remain deferred. Ambiguous
RPC results keep the flag for a later check. No fallback RPC with a new key/source
is introduced. Conditional task updates preserve existing error details.

Cancelled and partial-success tasks retain their existing/manual recovery paths.
Supplier invoice reconciliation remains separate from user-credit refunds.

## Acceptance and release

- Unit coverage includes uncertain provider outcomes, pagination, concurrent order
  updates, missing models, copied endpoint examples and refund replay/failures.
- `scripts/smoke-api-marketplace-ui.mjs` covers desktop/mobile model-to-console
  navigation, selection, copying and invalid models, using API fixtures.
- Read-only production pricing checks and real supplier catalog reads are distinct
  from paid generation, checkout and API settlement acceptance.
- Follow `docs/PRODUCTION_RELEASE.md`. The original image-health threshold and
  paid-cohort evidence requirements remain intact. A failing health gate still
  requires the explicit scoped exception described in
  `docs/AUDIT_FIXES_RELEASE_2026-10-05.md`; this change grants no exception.
