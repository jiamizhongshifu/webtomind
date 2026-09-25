import fs from 'node:fs/promises';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const MIGRATION_PATH = path.resolve(
  process.cwd(),
  'supabase/migrations/20260714233403_expire_payment_orders_and_fix_conversion_funnel.sql'
);

describe('payment funnel migration contract', () => {
  let sql = '';

  beforeAll(async () => {
    sql = await fs.readFile(MIGRATION_PATH, 'utf8');
  });

  it('adds expired without dropping existing payment order states', () => {
    for (const status of [
      'pending',
      'processing',
      'succeeded',
      'failed',
      'expired',
      'refunded'
    ]) {
      expect(sql).toContain(`'${status}'::text`);
    }
  });

  it('counts one purchase and first activation per order', () => {
    expect(sql).toContain('first_purchase_events AS');
    expect(sql).toContain('first_activation_events AS');
    expect(sql).toContain('SELECT DISTINCT ON (order_id)');
    expect(sql).toContain('SELECT DISTINCT ON (activation.order_id)');
    expect(sql).toContain('INNER JOIN first_purchase_events purchase');
    expect(sql).toContain('AND activation.occurred_at >= purchase.occurred_at');
    expect(sql).toContain("event_name = 'purchase_webhook_succeeded'");
    expect(sql).toContain("event_name = 'post_purchase_generation_success'");
    expect(sql.match(/COUNT\(DISTINCT order_id\) FILTER/g)).toHaveLength(2);
  });

  it('keeps conversion views invoker-secured and service-role-only', () => {
    expect(sql.match(/SET \(security_invoker = true\)/g)).toHaveLength(2);
    expect(sql).toContain(
      'GRANT SELECT ON public.conversion_funnel_daily TO service_role'
    );
    expect(sql).toContain(
      'GRANT SELECT ON public.conversion_reengagement_segments TO service_role'
    );
    expect(sql).toContain('FROM anon, authenticated, PUBLIC');
  });
});
