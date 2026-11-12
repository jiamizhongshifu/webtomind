// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, beforeEach, afterAll, expect, it } from 'vitest';

const migration = readFileSync('supabase/migrations/20261101113000_require_paid_image_membership.sql', 'utf8');
const user = '00000000-0000-0000-0000-000000000001';
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE subscription_plans (id text, price_monthly int, price_yearly int);
    INSERT INTO subscription_plans VALUES ('pro',2000,16800),('free',0,0),('trial',0,0);
    CREATE TABLE user_subscriptions (user_id uuid,plan_id text,status text,current_period_start timestamptz,current_period_end timestamptz);
    CREATE TABLE image_generation_tasks (user_id uuid,request_payload jsonb);
    CREATE TABLE billing_calls (action text);
    CREATE FUNCTION consume_credits(p_user_id uuid,p_action text,p_metadata jsonb DEFAULT '{}') RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
      INSERT INTO billing_calls VALUES (p_action);
      RETURN jsonb_build_object('success',true,'idempotent',p_metadata->'idempotency_key' IS NOT NULL);
    END;
    $$;
  `);
  await db.exec('BEGIN;' + migration + 'COMMIT;');
  await db.exec(`CREATE TRIGGER snapshot_image_task_entitlement BEFORE INSERT ON image_generation_tasks FOR EACH ROW EXECUTE FUNCTION snapshot_image_task_entitlement();`);
}, 60000);
beforeEach(async () => { await db.exec('TRUNCATE user_subscriptions,image_generation_tasks,billing_calls'); });
afterAll(async () => { await db?.close(); });
async function add(status: string, plan = 'pro', start = '-1 day', end = '1 day') {
  await db.query(`INSERT INTO user_subscriptions VALUES ($1,$2,$3,now()+$4::interval,now()+$5::interval)`, [user,plan,status,start,end]);
}
async function consume(action = 'image_generation') {
  return (await db.query<{r: {success:boolean;error?:string}}>(`SELECT consume_credits($1,$2,'{"idempotency_key":"old-charge"}') r`, [user,action])).rows[0].r;
}
async function blocked() {
  expect(await consume()).toEqual(expect.objectContaining({success:false,error:'PAID_MEMBERSHIP_REQUIRED'}));
  expect((await db.query('SELECT * FROM billing_calls')).rows).toHaveLength(0);
  await expect(db.query(`INSERT INTO image_generation_tasks VALUES ($1,'{"creditWaiver":{"reason":"retry"},"entitlementAtEnqueue":{"paidAccess":true}}')`,[user])).rejects.toThrow('PAID_MEMBERSHIP_REQUIRED');
}
it('blocks a free user before billing or idempotent replay and forged task snapshots', async () => { await blocked(); });
it.each(['trialing','past_due','unpaid','incomplete','expired'])('blocks %s even with a future paid-plan period', async status => { await add(status); await blocked(); });
it.each(['active','canceled'])('blocks expired %s', async status => { await add(status,'pro','-2 days','-1 second'); await blocked(); });
it('blocks a subscription that has not started', async () => { await add('active','pro','1 day','2 days'); await blocked(); });
it.each(['free','trial'])('blocks zero-priced %s plans', async plan => { await add('active',plan); await blocked(); });
it.each(['active','canceled'])('preserves access and billing for unexpired %s paid members', async status => {
  await add(status);
  expect((await consume()).success).toBe(true);
  await db.query(`INSERT INTO image_generation_tasks VALUES ($1,'{"entitlementAtEnqueue":{"paidAccess":false}}')`,[user]);
  expect((await db.query("SELECT request_payload->'entitlementAtEnqueue'->'paidAccess' paid FROM image_generation_tasks")).rows).toEqual([{paid:true}]);
});
it('does not change non-image spending for free users', async () => { expect((await consume('ai_chat_basic')).success).toBe(true); });
it('can be reapplied without duplicating the guard', async () => { await db.exec('BEGIN;' + migration + 'COMMIT;'); await blocked(); });
