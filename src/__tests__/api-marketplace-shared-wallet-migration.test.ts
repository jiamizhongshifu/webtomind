import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20260827090000_api_marketplace_shared_wallet.sql'
  ),
  'utf8'
);

describe('API marketplace shared-wallet migration contract', () => {
  it('moves legacy key balances into the account wallet once', () => {
    expect(migration).toContain('shared_wallet_key_migration');
    expect(migration).toContain("'shared_wallet_migration'");
    expect(migration).toContain("'shared-wallet-key:' || v_key.id::TEXT");
    expect(migration).toContain('SET balance_cents = 0');
  });

  it('makes reservations and settlements account-wallet operations', () => {
    expect(migration).toContain("'usage_charge'");
    expect(migration).toContain("'usage_refund'");
    expect(migration).toContain(
      'SET balance_cents = balance_cents - p_amount_cents'
    );
    expect(migration).toContain('wallet_balance_cents');
    expect(migration).toContain("'refund_destination', 'wallet'");
    expect(migration).toContain(
      'its balance is never charged'
    );
  });

  it('retires the per-key funding path and keeps the function signature stable', () => {
    expect(migration).toContain(
      'REVOKE EXECUTE ON FUNCTION public.fund_api_key(UUID, UUID, BIGINT, JSONB)'
    );
    expect(migration).toMatch(
      /CREATE OR REPLACE FUNCTION public\.reserve_api_wallet\(\s*p_key_id UUID,\s*p_user_id UUID/s
    );
    expect(migration).not.toContain(
      'UPDATE public.api_keys\n  SET balance_cents = balance_cents -'
    );
  });
});
