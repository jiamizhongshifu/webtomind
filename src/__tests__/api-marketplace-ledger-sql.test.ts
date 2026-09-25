// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Executes the real API marketplace ledger migrations in an in-process
// Postgres so settlement/expiry interactions are tested as SQL, not as text.
const MIGRATIONS = [
  '20260825090000_api_marketplace.sql',
  '20260826160000_api_marketplace_ledger_hardening.sql',
  '20260826173000_api_credit_usd_integer_catalog.sql',
  '20260827090000_api_marketplace_shared_wallet.sql',
  '20260827200001_api_marketplace_gateway_rate_limit.sql',
  '20260925090000_api_marketplace_stale_expiry_skips_queued_settlement.sql'
];

// Minimal stand-ins for the Supabase platform objects the migrations touch.
const SUPABASE_STUBS = `
  CREATE ROLE anon;
  CREATE ROLE authenticated;
  CREATE ROLE service_role;
  CREATE SCHEMA auth;
  CREATE TABLE auth.users (id UUID PRIMARY KEY, email TEXT);
  CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql AS $$ SELECT NULL::UUID $$;
  CREATE FUNCTION auth.role() RETURNS TEXT LANGUAGE sql AS $$ SELECT 'service_role'::TEXT $$;
`;

let db: PGlite;
let userCounter = 0;

async function createFundedAccount(
  walletCents: number
): Promise<{ userId: string; keyId: string }> {
  userCounter += 1;
  const suffix = userCounter.toString(16).padStart(12, '0');
  const userId = `00000000-0000-0000-0000-${suffix}`;
  const keyId = `10000000-0000-0000-0000-${suffix}`;
  await db.query('INSERT INTO auth.users (id, email) VALUES ($1, $2)', [
    userId,
    `user-${suffix}@test`
  ]);
  await db.query(
    `INSERT INTO public.api_keys (id, user_id, name, key_prefix, key_hash)
     VALUES ($1, $2, 'test', $3, repeat($4, 64))`,
    [keyId, userId, `sk-wtm_${suffix}`, suffix.slice(-1)]
  );
  await db.query(
    `SELECT public.grant_api_wallet_credit($1, $2, 'test', jsonb_build_object('idempotency_key', $3::TEXT))`,
    [userId, walletCents, `seed-${suffix}`]
  );
  return { userId, keyId };
}

async function walletBalance(userId: string): Promise<number> {
  const result = await db.query<{ balance_cents: unknown }>(
    'SELECT balance_cents FROM public.api_wallets WHERE user_id = $1',
    [userId]
  );
  return Number(result.rows[0]?.balance_cents);
}

async function usageRow(
  requestId: string
): Promise<{ status: string; actualCustomerCents: number }> {
  const result = await db.query<{ status: string; actual_customer_cents: unknown }>(
    'SELECT status, actual_customer_cents FROM public.api_usage_logs WHERE request_id = $1',
    [requestId]
  );
  const row = result.rows[0];
  return {
    status: row.status,
    actualCustomerCents: Number(row.actual_customer_cents)
  };
}

async function ageReservation(requestId: string, minutes: number): Promise<void> {
  await db.query(
    `UPDATE public.api_usage_logs
     SET reserved_at = now() - make_interval(mins => $2)
     WHERE request_id = $1`,
    [requestId, minutes]
  );
}

// Mirrors the */10 cron in workers/webtomind.ts: expiry runs before the queue.
async function runRecoveryCron(): Promise<void> {
  await db.query('SELECT public.expire_stale_api_usage(1800)');
  await db.query('SELECT public.process_api_usage_settlement_queue(50)');
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STUBS);
  const migrationsDir = join(process.cwd(), 'supabase/migrations');
  for (const name of MIGRATIONS) {
    await db.exec(readFileSync(join(migrationsDir, name), 'utf8'));
  }
}, 60_000);

afterAll(async () => {
  await db?.close();
});

describe('API marketplace ledger recovery', () => {
  it('bills queued usage instead of refunding it as a stale reservation', async () => {
    const { userId, keyId } = await createFundedAccount(1000);
    await db.query(
      `SELECT public.reserve_api_wallet($1, $2, 'req-queued', 100, '{}'::jsonb)`,
      [keyId, userId]
    );
    // The upstream call completed but the inline settlement failed.
    await db.query(
      `SELECT public.queue_api_usage_settlement('req-queued', 60, 46, '{}'::jsonb)`
    );
    await ageReservation('req-queued', 40);
    await db.query(
      `UPDATE public.api_usage_settlement_queue
       SET next_attempt_at = now() + interval '5 minutes'
       WHERE request_id = 'req-queued'`
    );

    // First cron pass: the retry is still in backoff.
    await runRecoveryCron();
    expect(await usageRow('req-queued')).toMatchObject({ status: 'reserved' });
    expect(await walletBalance(userId)).toBe(900);

    // Backoff elapsed: the queued usage settles against the reservation.
    await db.query(
      `UPDATE public.api_usage_settlement_queue
       SET next_attempt_at = now() - interval '1 second'
       WHERE request_id = 'req-queued'`
    );
    await runRecoveryCron();
    expect(await usageRow('req-queued')).toMatchObject({
      status: 'succeeded',
      actualCustomerCents: 60
    });
    expect(await walletBalance(userId)).toBe(940);
  });

  it('still refunds an abandoned reservation with nothing queued', async () => {
    const { userId, keyId } = await createFundedAccount(1000);
    await db.query(
      `SELECT public.reserve_api_wallet($1, $2, 'req-abandoned', 100, '{}'::jsonb)`,
      [keyId, userId]
    );
    await ageReservation('req-abandoned', 40);

    await runRecoveryCron();

    expect(await usageRow('req-abandoned')).toMatchObject({
      status: 'failed',
      actualCustomerCents: 0
    });
    expect(await walletBalance(userId)).toBe(1000);
  });

  it('refunds a reservation whose queued settlement is dead-lettered', async () => {
    const { userId, keyId } = await createFundedAccount(1000);
    await db.query(
      `SELECT public.reserve_api_wallet($1, $2, 'req-dead', 100, '{}'::jsonb)`,
      [keyId, userId]
    );
    await db.query(
      `SELECT public.queue_api_usage_settlement('req-dead', 60, 46, '{}'::jsonb)`
    );
    await db.query(
      `UPDATE public.api_usage_settlement_queue SET status = 'dead'
       WHERE request_id = 'req-dead'`
    );
    await ageReservation('req-dead', 40);

    await runRecoveryCron();

    expect(await usageRow('req-dead')).toMatchObject({ status: 'failed' });
    expect(await walletBalance(userId)).toBe(1000);
  });
});
