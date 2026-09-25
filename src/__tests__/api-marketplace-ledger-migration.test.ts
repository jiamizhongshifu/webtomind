import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20260825090000_api_marketplace.sql'
  ),
  'utf8'
);
const hardenedMigration = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20260826160000_api_marketplace_ledger_hardening.sql'
  ),
  'utf8'
);

describe('API marketplace ledger migration contract', () => {
  it('closes underfunded settlements instead of leaving reservations open', () => {
    expect(migration).toContain(
      "'settlement_adjustment', 'capped_to_reservation'"
    );
    expect(migration).toContain(
      'actual_customer_cents = v_usage.reserved_cents'
    );
    expect(migration).toContain(
      "'requested_customer_cents', p_actual_customer_cents"
    );
    expect(migration).not.toContain('Leave the reservation\n    -- open');
  });

  it('contains a service-role stale reservation refund path', () => {
    expect(migration).toMatch(
      /CREATE OR REPLACE FUNCTION public\.expire_stale_api_usage\(/
    );
    expect(migration).toContain("WHERE status = 'reserved'");
    expect(migration).toContain("'stale_reservation_refund'");
    expect(migration).toContain(
      'GRANT EXECUTE ON FUNCTION public.expire_stale_api_usage(INTEGER)'
    );
  });

  it('returns unused key balance during permanent revocation', () => {
    expect(migration).toMatch(
      /CREATE OR REPLACE FUNCTION public\.revoke_api_key\(/
    );
    expect(migration).toContain('type,\n      amount_cents');
    expect(migration).toContain("'key_refund'");
    expect(migration).toContain('source,\n      idempotency_key');
    expect(migration).toContain("status = 'revoked'");
    expect(migration).toContain(
      'GRANT EXECUTE ON FUNCTION public.revoke_api_key(UUID, UUID, JSONB)'
    );
  });

  it('keeps wallet and key lock order consistent and refunds revoked-key reservations', () => {
    expect(hardenedMigration).toContain(
      "hashtext('api_key_money')"
    );
    expect(hardenedMigration).toContain(
      "source, idempotency_key, metadata\n      ) VALUES (\n        v_usage.user_id, v_usage.key_id, 'key_refund'"
    );
    expect(hardenedMigration).toContain(
      "'reason', 'revoked_key_settlement'"
    );
    expect(hardenedMigration).toContain(
      "'refund_destination', CASE"
    );
    expect(hardenedMigration).toContain(
      "WHEN v_key_status = 'revoked' THEN 'wallet'"
    );
  });

  it('persists failed settlements for bounded cron retries', () => {
    expect(hardenedMigration).toContain(
      'CREATE TABLE IF NOT EXISTS public.api_usage_settlement_queue'
    );
    expect(hardenedMigration).toContain(
      'CREATE OR REPLACE FUNCTION public.queue_api_usage_settlement('
    );
    expect(hardenedMigration).toContain(
      'CREATE OR REPLACE FUNCTION public.process_api_usage_settlement_queue('
    );
    expect(hardenedMigration).toContain(
      "WHEN v_job.attempts + 1 >= 12 THEN 'dead' ELSE 'pending'"
    );
  });
});
describe('API marketplace payment snapshot contract', () => {
  it('stores the purchased API credit amount in the payment order', () => {
    const checkout = readFileSync(
      resolve(process.cwd(), 'api/membership/checkout.ts'),
      'utf8'
    );
    expect(checkout).toContain('apiCreditCents');
    expect(checkout).toContain('getApiCreditPaymentAmount');
    expect(checkout).toContain(
      'catalogAmountCnyCents: fullAmountCnyCents || 0'
    );
    expect(checkout).toContain('apiCreditCents: fullAmountUsdCents');
  });

  it('uses the immutable snapshot before reading the mutable catalog', () => {
    const webhook = readFileSync(
      resolve(process.cwd(), 'api/membership/webhook.ts'),
      'utf8'
    );
    expect(webhook).toContain('paymentOrder.metadata?.apiCreditCents');
    expect(webhook).toContain('New orders carry the exact catalog amount');
    expect(webhook).toContain('p_amount_cents: creditCents');
  });
});
