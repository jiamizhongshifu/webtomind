// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';

const migration = (name: string) =>
  readFileSync(`supabase/migrations/${name}.sql`, 'utf8');
function definition(source: string, name: string) {
  const start = source.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  const tail = source.slice(start);
  const tag = tail.match(/AS (\$[a-z_]*\$)/i)![1];
  const end = tail.indexOf(
    ';',
    tail.indexOf(tag, tail.indexOf(tag) + tag.length) + tag.length
  );
  return tail.slice(0, end + 1);
}
let db: PGlite;
const userId = '00000000-0000-0000-0000-000000000001';
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE user_subscriptions (id uuid DEFAULT gen_random_uuid(), user_id uuid, plan_id text, status text, current_period_start timestamptz, current_period_end timestamptz);
    CREATE TABLE subscription_plans (id text, monthly_credits int);
    INSERT INTO subscription_plans VALUES ('pro', 1000);
    CREATE TABLE user_credits (user_id uuid PRIMARY KEY, daily_credits int DEFAULT 0, daily_credits_max int DEFAULT 0, last_daily_refresh date, daily_image_gen_used int DEFAULT 0, daily_image_gen_max int DEFAULT 1, subscription_credits int DEFAULT 0, subscription_credits_max int DEFAULT 0, subscription_credits_period_start timestamptz, subscription_credits_period_end timestamptz, total_earned int DEFAULT 0, bonus_credits int DEFAULT 0, referral_credits int DEFAULT 0, media_credits int DEFAULT 0, promo_media_credits int DEFAULT 0, updated_at timestamptz DEFAULT now());
    CREATE TABLE credit_transactions (user_id uuid, type text, credit_type text, amount int, balance_after int, source text, metadata jsonb, created_at timestamptz DEFAULT now());
  `);
  for (const [file, name] of [
    [
      '20260604061541_non_rollover_subscription_credits',
      'grant_subscription_credits_if_due'
    ],
    [
      '20260630172000_allow_legacy_credits_for_media_generation',
      'consume_credits'
    ],
    ['20260701112000_weaving_quota_idempotency_refund', 'consume_weaving_quota']
  ])
    await db.exec(definition(migration(file), name));
  await db.exec(migration('20260721090000_fail_closed_past_due_entitlements'));
  await db.exec(
    definition(
      migration('20260804200000_fix_free_credit_signup_policy'),
      'reconcile_free_credit_policy'
    )
  );
  await db.exec(
    'BEGIN;' +
      migration(
        '20261005090000_bound_subscription_entitlements_to_paid_period'
      ) +
      'COMMIT;'
  );
  await db.exec(`ALTER TABLE user_subscriptions ADD COLUMN stripe_subscription_id text, ADD COLUMN stripe_customer_id text;
    CREATE TABLE payment_orders (id uuid DEFAULT gen_random_uuid(), user_id uuid, product_type text, status text);`);
  await db.exec(
    'BEGIN;' +
      migration('20261005091000_serialize_subscription_checkouts') +
      'COMMIT;'
  );
  await db.exec(
    'CREATE TABLE image_generation_tasks (user_id uuid, request_payload jsonb);'
  );
  await db.exec(
    'BEGIN;' +
      migration('20261005093000_snapshot_image_task_entitlement') +
      'COMMIT;'
  );
}, 60000);
afterAll(async () => db?.close());

async function reset() {
  await db.exec(
    'TRUNCATE user_subscriptions, user_credits, credit_transactions, payment_orders, image_generation_tasks'
  );
}
async function subscription(
  status: string,
  end: string,
  start = "now() - interval '1 day'"
) {
  await db.query(
    `INSERT INTO user_subscriptions (user_id, plan_id, status, current_period_start, current_period_end) VALUES ($1, 'pro', $2, ${start}, ${end})`,
    [userId, status]
  );
}
async function grant() {
  return (
    await db.query<{ result: { granted: boolean } }>(
      'SELECT grant_subscription_credits_if_due($1) AS result',
      [userId]
    )
  ).rows[0].result;
}
describe('paid-period SQL boundary', () => {
  it.each(['active', 'trialing', 'canceled', 'past_due'])(
    'does not grant expired %s subscriptions',
    async (status) => {
      await reset();
      await subscription(status, "now() - interval '1 second'");
      expect((await grant()).granted).toBe(false);
      expect(
        (await db.query('SELECT * FROM credit_transactions')).rows
      ).toHaveLength(0);
    }
  );
  it('grants once to a valid older subscription despite an expired newer record', async () => {
    await reset();
    await subscription(
      'active',
      "now() + interval '1 day'",
      "now() - interval '2 days'"
    );
    await subscription('active', "now() - interval '1 second'");
    expect((await grant()).granted).toBe(true);
    expect((await grant()).granted).toBe(false);
    expect(
      (await db.query('SELECT amount FROM credit_transactions')).rows
    ).toEqual([{ amount: 1000 }]);
  });
  it('fails at the exact end instant without changing historical balances', async () => {
    await reset();
    await db.exec('BEGIN');
    await subscription('active', 'now()');
    await db.query(
      'INSERT INTO user_credits (user_id, subscription_credits) VALUES ($1, 17)',
      [userId]
    );
    expect((await grant()).granted).toBe(false);
    expect(
      (await db.query('SELECT subscription_credits FROM user_credits')).rows
    ).toEqual([{ subscription_credits: 17 }]);
    await db.exec('COMMIT');
  });
  it('blocks a second pending checkout while allowing the reserved order to complete', async () => {
    await reset();
    const insert = () =>
      db.query(
        "INSERT INTO payment_orders (user_id,product_type,status) VALUES ($1,'subscription','pending')",
        [userId]
      );
    await insert();
    await expect(insert()).rejects.toThrow('SUBSCRIPTION_CHECKOUT_IN_PROGRESS');
    await db.exec(
      "UPDATE payment_orders SET status='processing'; UPDATE payment_orders SET status='succeeded'"
    );
    await insert();
    expect((await db.query('SELECT * FROM payment_orders')).rows).toHaveLength(
      2
    );
  });
  it('also rejects a new checkout when a recurring bill appeared after the HTTP precheck', async () => {
    await reset();
    await subscription('active', "now() - interval '1 day'");
    await db.exec(
      "UPDATE user_subscriptions SET stripe_subscription_id='sub_live'"
    );
    await expect(
      db.query(
        "INSERT INTO payment_orders (user_id,product_type,status) VALUES ($1,'subscription','pending')",
        [userId]
      )
    ).rejects.toThrow('SUBSCRIPTION_CHECKOUT_IN_PROGRESS');
  });
  it('snapshots paid access at task creation and overwrites caller claims', async () => {
    await reset();
    await db.query(
      `INSERT INTO image_generation_tasks VALUES ($1, '{"entitlementAtEnqueue":{"paidAccess":true}}')`,
      [userId]
    );
    await subscription('active', "now() + interval '1 day'");
    await db.query(`INSERT INTO image_generation_tasks VALUES ($1, '{}')`, [
      userId
    ]);
    expect(
      (
        await db.query(
          "SELECT request_payload->'entitlementAtEnqueue'->'paidAccess' AS paid FROM image_generation_tasks"
        )
      ).rows
    ).toEqual([{ paid: false }, { paid: true }]);
  });
});
