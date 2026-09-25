import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260715022000_enforce_post_purchase_activation_once.sql'
);
const sql = readFileSync(migrationPath, 'utf8');

describe('post-purchase activation invariant migration', () => {
  it('keeps the earliest activation and removes later duplicates', () => {
    expect(sql).toContain('PARTITION BY order_id');
    expect(sql).toContain('ORDER BY occurred_at ASC, created_at ASC, id ASC');
    expect(sql).toContain('ranked.activation_rank > 1');
  });

  it('canonicalizes the idempotency key to the order', () => {
    expect(sql).toContain(
      "'post_purchase_generation_success:' || order_id::text"
    );
  });

  it('requires an order and enforces one activation per order', () => {
    expect(sql).toContain('conversion_events_post_purchase_order_required');
    expect(sql).toContain(
      'idx_conversion_events_post_purchase_activation_order'
    );
    expect(sql).toContain('ON public.conversion_events (order_id)');
    expect(sql).toContain(
      "WHERE event_name = 'post_purchase_generation_success'"
    );
  });
});
