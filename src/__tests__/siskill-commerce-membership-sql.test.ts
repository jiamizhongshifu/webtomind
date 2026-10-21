import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, it, expect } from 'vitest';
let db: PGlite;
const a = '00000000-0000-0000-0000-00000000000a',
  b = '00000000-0000-0000-0000-00000000000b';
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);INSERT INTO auth.users VALUES('${a}'),('${b}');CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;GRANT USAGE ON SCHEMA auth,public TO authenticated,service_role;`
  );
  await db.exec(
    readFileSync(
      'supabase/migrations/20261021090000_siskill_commerce.sql',
      'utf8'
    )
  );
  await db.exec(
    readFileSync(
      'supabase/migrations/20261021110000_siskill_memberships.sql',
      'utf8'
    )
  );
}, 60000);
afterAll(async () => db?.close());
it('seeds inactive plans and keeps settlement service-only', async () => {
  expect(
    (await db.query('select * from siskill_plans where active')).rows
  ).toHaveLength(0);
  expect(
    (
      await db.query(
        "select has_function_privilege('authenticated','siskill_reserve_membership(uuid,text,text)','execute') as allowed"
      )
    ).rows
  ).toEqual([{ allowed: false }]);
  await expect(
    db.query("select siskill_reserve_membership($1,'pro_monthly','en-US')", [a])
  ).rejects.toThrow('PLAN_UNAVAILABLE');
});
it('freezes quote, serializes checkout, isolates users and prevents ended contracts reviving', async () => {
  await db.exec(
    "update siskill_plans set stripe_price_id='price_'||id, active=true"
  );
  const reserve = async () =>
    (
      await db.query<any>(
        "select (siskill_reserve_membership($1,'pro_monthly','en-US')).*",
        [a]
      )
    ).rows[0];
  const m = await reserve();
  expect(m.snapshot.amount).toBe(999);
  expect((await reserve()).id).toBe(m.id);
  await db.exec("update siskill_plans set amount=1200 where id='pro_monthly'");
  expect((await reserve()).snapshot.amount).toBe(999);
  await expect(
    db.query("update siskill_memberships set snapshot='{}' where id=$1", [m.id])
  ).rejects.toThrow('IMMUTABLE_MEMBERSHIP_CONTRACT');
  await db.query(
    "select siskill_bind_membership($1,'cs_qa','sub_qa','cus_qa')",
    [m.id]
  );
  await expect(reserve()).rejects.toThrow('MEMBERSHIP_EXISTS');
  await db.exec(
    `SET ROLE authenticated;SELECT set_config('request.jwt.claim.sub','${b}',false)`
  );
  expect(
    (await db.query('select * from siskill_memberships')).rows
  ).toHaveLength(0);
  await db.exec('RESET ROLE');
  await db.query(
    "select siskill_bind_membership($1,'cs_qa','sub_qa','cus_qa',true)",
    [m.id]
  );
  await db.query(
    "select siskill_bind_membership($1,'cs_qa','sub_qa','cus_qa',false)",
    [m.id]
  );
  expect(
    (
      await db.query<any>('select state from siskill_memberships where id=$1', [
        m.id
      ])
    ).rows[0].state
  ).toBe('ended');
  const next = await reserve();
  expect(next.id).not.toBe(m.id);
  expect(next.snapshot.amount).toBe(1200);
});
