import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260804200000_fix_free_credit_signup_policy.sql'
);
const sql = readFileSync(migrationPath, 'utf8');

describe('free credit signup policy migration', () => {
  it('aligns column defaults and the auth trigger with the 100-credit policy', () => {
    expect(sql).toContain('ALTER COLUMN daily_credits SET DEFAULT 100');
    expect(sql).toContain('ALTER COLUMN daily_credits_max SET DEFAULT 100');
    expect(sql).toContain('ALTER COLUMN daily_image_gen_max SET DEFAULT 1');
    expect(sql).toContain('VALUES (NEW.id, 100, 100, 0, 0, 0, 1)');
    expect(sql).not.toContain('VALUES (NEW.id, 300, 300');
  });

  it('keeps reconciliation atomic, free-only, and visible as a non-usage event', () => {
    expect(sql).toContain('FOR UPDATE');
    expect(sql).toContain(
      'CREATE OR REPLACE FUNCTION public.reconcile_free_credit_policy'
    );
    expect(sql).toContain("'free_daily_quota_policy'");
    expect(sql).toContain("'admin_adjustment'");
    expect(sql).toContain("'previous_daily_credits'");
    expect(sql).toContain("'next_daily_credits'");
    expect(sql).toContain(
      "s.status IN ('active', 'trialing', 'past_due', 'canceled')"
    );
    expect(sql).toContain("s.status <> 'canceled'");
  });

  it('limits the reconciliation RPC to the service role', () => {
    expect(sql).toContain(
      'REVOKE ALL ON FUNCTION public.reconcile_free_credit_policy(UUID) FROM PUBLIC'
    );
    expect(sql).toContain(
      'REVOKE EXECUTE ON FUNCTION public.reconcile_free_credit_policy(UUID) FROM anon, authenticated'
    );
    expect(sql).toContain(
      'GRANT EXECUTE ON FUNCTION public.reconcile_free_credit_policy(UUID) TO service_role'
    );
  });
});
