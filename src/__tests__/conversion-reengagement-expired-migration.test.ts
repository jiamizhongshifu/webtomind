import fs from 'node:fs/promises';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const MIGRATION_PATH = path.resolve(
  process.cwd(),
  'supabase/migrations/20260715011000_include_expired_checkout_in_reengagement.sql'
);

describe('expired checkout reengagement migration contract', () => {
  let sql = '';

  beforeAll(async () => {
    sql = await fs.readFile(MIGRATION_PATH, 'utf8');
  });

  it('keeps expired checkouts eligible without mixing payment failures', () => {
    expect(sql).toContain(
      "WHERE status IN ('pending', 'processing', 'expired')"
    );
    expect(sql).not.toMatch(/status IN \([^)]*'failed'/);
    expect(sql).not.toMatch(/status IN \([^)]*'refunded'/);
    expect(sql).toContain("'checkout_status', ao.checkout_status");
  });

  it('excludes users who purchased after the abandoned checkout', () => {
    expect(sql).toContain('so.last_purchase_at >= ao.checkout_started_at');
    expect(sql).toContain('WHERE so.user_id IS NULL');
  });

  it('keeps the view invoker-secured and service-role-only', () => {
    expect(sql).toContain('SET (security_invoker = true)');
    expect(sql).toContain('FROM anon, authenticated, PUBLIC');
    expect(sql).toContain(
      'GRANT SELECT ON public.conversion_reengagement_segments TO service_role'
    );
  });
});
