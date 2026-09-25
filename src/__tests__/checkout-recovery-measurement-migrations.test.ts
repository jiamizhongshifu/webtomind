import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('checkout recovery and renewal measurement migrations', () => {
  it('defines unique unpaid-order recovery stages', () => {
    const sql = readFileSync(
      'supabase/migrations/20260806090000_checkout_recovery_candidates.sql',
      'utf8'
    );
    expect(sql).toContain('DISTINCT ON (orders.user_id)');
    expect(sql).toContain("INTERVAL '30 minutes'");
    expect(sql).toContain("INTERVAL '6 hours'");
    expect(sql).toContain("paid.status = 'succeeded'");
  });

  it('counts renewals separately from purchase acquisition', () => {
    const sql = readFileSync(
      'supabase/migrations/20260806091000_subscription_renewal_measurement.sql',
      'utf8'
    );
    expect(sql).toContain("event_name = 'purchase_webhook_succeeded'");
    expect(sql).toContain("event_name = 'subscription_renewal_succeeded'");
    expect(sql).toContain('AS subscription_renewals');
  });
});
