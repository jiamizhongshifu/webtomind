// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
let db: PGlite;
const a = '00000000-0000-0000-0000-00000000000a',
  b = '00000000-0000-0000-0000-00000000000b';
async function scalar(sql: string, params: unknown[] = []) {
  const r = await db.query<Record<string, unknown>>(sql, params);
  return Object.values(r.rows[0] || {})[0];
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon NOLOGIN;CREATE ROLE authenticated NOLOGIN;CREATE ROLE service_role NOLOGIN BYPASSRLS;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);INSERT INTO auth.users VALUES('${a}'),('${b}');CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;GRANT USAGE ON SCHEMA auth,public TO anon,authenticated,service_role;GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
CREATE TABLE payment_orders(id text PRIMARY KEY,status text);INSERT INTO payment_orders VALUES('legacy-order','paid');
CREATE TABLE user_subscriptions(user_id uuid,plan_id text);INSERT INTO user_subscriptions VALUES('${a}','webtomind-pro');
CREATE TABLE user_credits(user_id uuid,credits integer);INSERT INTO user_credits VALUES('${a}',1000);`);
  await db.exec(
    readFileSync(
      'supabase/migrations/20261021090000_siskill_commerce.sql',
      'utf8'
    )
  );
}, 60000);
afterAll(async () => db?.close());
beforeEach(async () => {
  await db.exec(
    'TRUNCATE siskill_payment_events,siskill_grants,siskill_orders,siskill_products,siskill_releases CASCADE;'
  );
  const release = await scalar(
    `INSERT INTO siskill_releases(slug,version,object_key,sha256,bytes,status,reviewed_at) VALUES('carousel','1.0.0','siskill/carousel/1.0.0.tar.gz',$1,1000,'published',now()) RETURNING id`,
    ['a'.repeat(64)]
  );
  await db.query(
    `INSERT INTO siskill_products(sku,name,release_id,usd_cents,cny_cents,contract_version,active) VALUES('siskill_carousel','Carousel',$1,999,5900,'siskill-v1',true)`,
    [release]
  );
});
async function order(user = a, provider = 'stripe') {
  const r = await db.query<{ id: string }>(
    `SELECT (siskill_create_order($1,'siskill_carousel',$2)).*`,
    [user, provider]
  );
  return r.rows[0].id;
}
async function bind(id: string, session = 'cs_test') {
  await db.query('SELECT siskill_bind_checkout($1,$2,$3)', [
    id,
    session,
    'https://checkout.stripe.com/test'
  ]);
}
const pay = (
  id: string,
  event = 'evt_paid',
  payment = 'pi_test',
  kind = 'paid',
  amount = 999,
  session = 'cs_test'
) =>
  scalar("SELECT siskill_apply_payment($1,'stripe',$2,$3,$4,$5,'usd',$6)", [
    id,
    event,
    kind,
    payment,
    amount,
    session
  ]);
describe('SiSkill database isolation and payment lifecycle', () => {
  it('never grants access from existing WebToMind Pro; snapshots catalog price and version', async () => {
    const id = await order();
    const r = await db.query<{ amount: number; snapshot: { sha256: string } }>(
      'SELECT amount,snapshot FROM siskill_orders WHERE id=$1',
      [id]
    );
    expect(r.rows[0].amount).toBe(999);
    expect(r.rows[0].snapshot.sha256).toBe('a'.repeat(64));
    expect(await scalar('SELECT count(*) FROM siskill_grants')).toBe(0);
    expect(await scalar('SELECT credits FROM user_credits')).toBe(1000);
    expect(await scalar('SELECT status FROM payment_orders')).toBe('paid');
  });
  it('reuses pending order and blocks provider switching', async () => {
    const id = await order();
    expect(await order()).toBe(id);
    await expect(order(a, 'zpay')).rejects.toThrow('PENDING_OTHER_PROVIDER');
  });
  it('freezes checkout locale across retries and validates its server allowlist', async () => {
    await db.query(
      "SELECT siskill_create_order($1,'siskill_carousel','stripe','zh-CN')",
      [a]
    );
    const id = await order();
    expect(
      await scalar(
        "SELECT snapshot->>'locale' FROM siskill_orders WHERE id=$1",
        [id]
      )
    ).toBe('zh-CN');
    await expect(
      db.query(
        "SELECT siskill_create_order($1,'siskill_carousel','stripe','https://evil.example')",
        [a]
      )
    ).rejects.toThrow('INVALID_LOCALE');
  });
  it('does not sell disabled products or unreviewed/withdrawn archives', async () => {
    await db.exec('UPDATE siskill_products SET active=false');
    await expect(order()).rejects.toThrow('PRODUCT_UNAVAILABLE');
    await db.exec(
      "UPDATE siskill_products SET active=true;UPDATE siskill_releases SET status='withdrawn'"
    );
    await expect(order()).rejects.toThrow('RELEASE_UNAVAILABLE');
  });
  it('rejects amount and session substitution without recording event or grant', async () => {
    const id = await order();
    await bind(id);
    await expect(pay(id, 'evt_bad', 'pi_test', 'paid', 1)).rejects.toThrow(
      'PAYMENT_MISMATCH'
    );
    await expect(
      pay(id, 'evt_bad', 'pi_test', 'paid', 999, 'cs_other')
    ).rejects.toThrow('CHECKOUT_MISMATCH');
    expect(await scalar('SELECT count(*) FROM siskill_payment_events')).toBe(0);
    expect(await scalar('SELECT count(*) FROM siskill_grants')).toBe(0);
  });
  it('settles atomically and idempotently; rejects a second purchase of an owned Skill', async () => {
    const id = await order();
    await bind(id);
    expect(await pay(id)).toBe('paid');
    expect(await pay(id)).toBe('paid');
    expect(await scalar('SELECT count(*) FROM siskill_grants')).toBe(1);
    expect(await scalar('SELECT count(*) FROM siskill_payment_events')).toBe(1);
    await expect(order()).rejects.toThrow('ALREADY_OWNED');
  });
  it('rejects cross-order event and payment replay', async () => {
    const first = await order();
    await bind(first);
    await pay(first);
    const second = await order(b);
    await bind(second, 'cs_second');
    await expect(
      pay(second, 'evt_paid', 'pi_other', 'paid', 999, 'cs_second')
    ).rejects.toThrow('EVENT_REPLAY_CONFLICT');
    await expect(
      pay(second, 'evt_second', 'pi_test', 'paid', 999, 'cs_second')
    ).rejects.toThrow();
    expect(
      await scalar('SELECT status FROM siskill_orders WHERE id=$1', [second])
    ).toBe('pending');
  });
  it('full refund revokes only this order and delayed paid events cannot restore it', async () => {
    const id = await order();
    await bind(id);
    await pay(id);
    expect(await pay(id, 'evt_refund', 'pi_test', 'refunded')).toBe('refunded');
    expect(await pay(id, 'evt_late')).toBe('refunded');
    expect(
      await scalar('SELECT status FROM siskill_grants WHERE order_id=$1', [id])
    ).toBe('revoked');
    expect(await scalar('SELECT credits FROM user_credits')).toBe(1000);
  });
  it('refund before paid creates a tombstone; later paid cannot grant access', async () => {
    const id = await order();
    await bind(id);
    await pay(id, 'evt_refund', 'pi_test', 'refunded');
    expect(await pay(id)).toBe('refunded');
    expect(await scalar('SELECT count(*) FROM siskill_grants')).toBe(0);
  });
  it('provider-confirmed expiry never expires a paid order; late paid expiry is fulfilled', async () => {
    const id = await order();
    await bind(id);
    await pay(id, 'evt_expired', '', 'expired');
    expect(await pay(id)).toBe('paid');
    await pay(id, 'evt_expired2', '', 'expired');
    expect(
      await scalar('SELECT status FROM siskill_orders WHERE id=$1', [id])
    ).toBe('paid');
  });
  it('freezes the acquired contract and reviewed archive bytes', async () => {
    const id = await order();
    await expect(
      db.query('UPDATE siskill_orders SET amount=1 WHERE id=$1', [id])
    ).rejects.toThrow('ORDER_CONTRACT_IMMUTABLE');
    await expect(
      db.exec("UPDATE siskill_releases SET object_key='siskill/other.tar.gz'")
    ).rejects.toThrow('RELEASE_IMMUTABLE');
  });
  it('authenticated users see only their own orders and cannot self-grant or call settlement', async () => {
    const id = await order();
    await bind(id);
    await pay(id);
    await db.exec(
      `SET ROLE authenticated;SELECT set_config('request.jwt.claim.sub','${b}',false);`
    );
    try {
      expect(await scalar('SELECT count(*) FROM siskill_orders')).toBe(0);
      expect(await scalar('SELECT count(*) FROM siskill_grants')).toBe(0);
      await expect(
        db.query(
          "SELECT siskill_apply_payment($1,'stripe','fake','paid','pi_fake',999,'usd','cs_test')",
          [id]
        )
      ).rejects.toThrow('permission denied');
      await expect(
        db.exec("UPDATE siskill_orders SET status='paid'")
      ).rejects.toThrow('permission denied');
    } finally {
      await db.exec('RESET ROLE');
    }
  });
});
