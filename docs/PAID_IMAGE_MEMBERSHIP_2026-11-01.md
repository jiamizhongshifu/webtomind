# Paid membership requirement for image generation

The production database now rejects new image-generation charges and task
inserts unless the user has an active or canceled paid subscription whose
period has started and has not ended. Canceling renewal does not end access
before the already-paid period ends. Trialing, past-due, free, future and
expired subscriptions do not qualify. Existing balances and refunds remain
unchanged; other credit-consuming actions retain their existing behavior.

Migration: `supabase/migrations/20261101113000_require_paid_image_membership.sql`.
Applied using the authenticated Supabase migration tool on 2026-11-01.
The gate precedes the charge idempotency lookup. The existing task-insert
trigger also rejects retry/waiver tasks for ineligible users.

## Verification

- Node 24.14.0 / pnpm 8.15.0: 15 PGlite policy tests passed.
- Production HTTP acceptance at 2026-11-01 11:22:10 UTC: a temporary free
  account received HTTP 402 / `PAID_MEMBERSHIP_REQUIRED` on both synchronous
  and asynchronous `/api/image/generate` requests. Wallet unchanged; no
  tasks or ledger entries created. The temporary account was removed.
- Production transaction, rolled back: free task insertion rejected;
  an eligible paid member's image credit charge accepted. This did not
  generate an image or retain any billing changes.
- Existing production subscriptions were checked for current-period access.
- This is a database-only policy release. No frontend/Worker deployment or
  CI run was performed, and no browser UI change is claimed.

## Known presentation limitation

The current Worker maps this new error to its generic insufficient-credit
message. The response includes `PAID_MEMBERSHIP_REQUIRED` and the correct
membership explanation in `details.message`. The database still blocks
nonmembers regardless of their credit balance. A later presentation change
should map the new code to the membership message and undergo normal web
release and desktop/mobile verification.

Registration-abuse findings contain customer information and are intentionally
kept out of this public repository.
