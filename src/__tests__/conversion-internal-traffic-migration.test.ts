import fs from 'node:fs/promises';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const MIGRATION_PATH = path.resolve(
  process.cwd(),
  'supabase/migrations/20260723150000_exclude_internal_test_conversion_traffic.sql'
);

describe('conversion internal-traffic migration contract', () => {
  let sql = '';

  beforeAll(async () => {
    sql = await fs.readFile(MIGRATION_PATH, 'utf8');
  });

  it('excludes marked and historical release-smoke traffic', () => {
    expect(sql).toContain("metadata->>'traffic_type'");
    expect(sql).toContain("<> 'internal_test'");
    expect(sql).toContain("'codex_release_smoke'");
  });

  it('preserves one purchase and first generation per order', () => {
    expect(sql).toContain('first_purchase_events AS');
    expect(sql).toContain('first_activation_events AS');
    expect(sql.match(/COUNT\(DISTINCT order_id\) FILTER/g)).toHaveLength(2);
  });

  it('keeps the view invoker-secured and service-role-only', () => {
    expect(sql).toContain('SET (security_invoker = true)');
    expect(sql).toContain('REVOKE ALL ON public.conversion_funnel_daily');
    expect(sql).toContain(
      'GRANT SELECT ON public.conversion_funnel_daily TO service_role'
    );
  });
});
