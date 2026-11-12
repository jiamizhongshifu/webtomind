// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const MIGRATION = readFileSync(
  'supabase/migrations/20261018090000_skill_catalog_subscription.sql',
  'utf8'
);

const userA = '00000000-0000-0000-0000-00000000000a';
const userB = '00000000-0000-0000-0000-00000000000b';
const hash = (char: string) => char.repeat(64);

let db: PGlite;

async function asUser<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  await db.exec(
    `SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub', '${userId}', false);`
  );
  try {
    return await fn();
  } finally {
    await db.exec(
      `RESET ROLE; SELECT set_config('request.jwt.claim.sub', '', false);`
    );
  }
}

async function scalar<T>(sql: string, params: unknown[] = []): Promise<T> {
  const result = await db.query<Record<string, T>>(sql, params);
  return Object.values(result.rows[0] ?? {})[0] as T;
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
    GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
    CREATE TABLE auth.users (id uuid PRIMARY KEY);
    INSERT INTO auth.users VALUES ('${userA}'), ('${userB}');
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
    CREATE TABLE public.subscription_plans (
      id text PRIMARY KEY, name text NOT NULL, display_name jsonb DEFAULT '{}',
      description text, price_monthly integer NOT NULL, price_yearly integer NOT NULL,
      monthly_credits integer NOT NULL, features jsonb DEFAULT '[]', limits jsonb DEFAULT '{}',
      sort_order integer DEFAULT 0, is_active boolean DEFAULT true,
      created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
    );
    INSERT INTO public.subscription_plans (id, name, price_monthly, price_yearly, monthly_credits, limits)
      VALUES ('pro', 'pro', 2000, 16800, 10000, '{"dailyImageGeneration": -1}'),
             ('max', 'max', 10000, 84000, 60000, '{"dailyImageGeneration": -1}'),
             ('free', 'free', 0, 0, 0, '{}');
    CREATE TABLE public.user_subscriptions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES auth.users(id),
      plan_id text NOT NULL REFERENCES public.subscription_plans(id),
      status text NOT NULL, billing_cycle text,
      current_period_start timestamptz NOT NULL, current_period_end timestamptz NOT NULL,
      cancel_at_period_end boolean DEFAULT false,
      stripe_subscription_id text, stripe_customer_id text,
      payment_provider text, external_subscription_id text,
      created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
    );
    CREATE TABLE public.payment_orders (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES auth.users(id),
      amount integer NOT NULL, currency text DEFAULT 'usd',
      status text NOT NULL, provider text DEFAULT 'stripe', provider_order_id text,
      product_type text CHECK (product_type IN ('subscription', 'credit_package')),
      product_id text, metadata jsonb DEFAULT '{}',
      created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
    );
  `);
  await db.exec(MIGRATION);
  await db.exec(
    readFileSync(
      'supabase/migrations/20261020100000_skill_commerce_v2.sql',
      'utf8'
    )
  );
}, 60000);

afterAll(async () => db?.close());

beforeEach(async () => {
  await db.exec(`
    DELETE FROM skill_subscriptions;
    DELETE FROM skill_subscription_refunds;
    DELETE FROM skill_products WHERE kind='single';
    TRUNCATE skill_installs, cli_credentials, cli_device_authorizations,
      skill_entitlements, skill_catalog_examples CASCADE;
    UPDATE skill_catalog SET latest_version_id = NULL;
    ALTER TABLE skill_catalog_versions DISABLE TRIGGER guard_skill_catalog_version_immutability;
    DELETE FROM skill_catalog_versions;
    ALTER TABLE skill_catalog_versions ENABLE TRIGGER guard_skill_catalog_version_immutability;
    DELETE FROM skill_catalog;
    DELETE FROM user_subscriptions;
    DELETE FROM payment_orders;
  `);
});

async function seedSkill(
  slug: string,
  tier: 'free' | 'premium',
  status = 'published'
) {
  const skillId = await scalar<string>(
    `INSERT INTO skill_catalog (slug, name, summary, output_types, scene_tags, tier, status, published_at)
     VALUES ($1, $2, '{"en":"summary"}', '{image}', '{xiaohongshu}', $3, $4, now()) RETURNING id`,
    [
      slug,
      JSON.stringify({ en: `${slug} name`, 'zh-CN': '封面' }),
      tier,
      status
    ]
  );
  const versionId = await scalar<string>(
    `INSERT INTO skill_catalog_versions (skill_id, version, status, r2_object_key, sha256, size_bytes, compatible_agents, published_at)
     VALUES ($1, '1.0.0', 'published', $2, $3, 1024, '{claude-code,codex}', now()) RETURNING id`,
    [skillId, `skills/${slug}/1.0.0.tar.gz`, hash('a')]
  );
  await db.query(
    'UPDATE skill_catalog SET latest_version_id = $1 WHERE id = $2',
    [versionId, skillId]
  );
  return { skillId, versionId };
}

async function contentOrder(kind: 'single' | 'subscription', user = userA) {
  let skillId: string | null = null;
  if (kind === 'single') {
    const seeded = await seedSkill(`paid-${user.slice(-1)}`, 'premium');
    skillId = seeded.skillId;
    await db.query(
      `INSERT INTO skill_products(id,kind,name,skill_slug,price_usd,price_cny)
      VALUES ($1,'single','Paid Skill',$2,999,5900)`,
      [`single-${user}`, `paid-${user.slice(-1)}`]
    );
  }
  const productId =
    kind === 'single' ? `single-${user}` : 'skill_pro_content_v2';
  const order = await scalar<string>(
    `INSERT INTO payment_orders(user_id,amount,status,product_type,product_id,metadata)
    VALUES ($1,999,'processing',$2,$3,$4) RETURNING id`,
    [
      user,
      kind === 'single' ? 'skill_purchase' : 'skill_subscription',
      productId,
      JSON.stringify({
        billingCycle: 'monthly',
        skillSnapshot: {
          productId,
          skillId,
          version: '1.0.0',
          contractVersion: 'skills-2026-10-v2'
        }
      })
    ]
  );
  return { order, skillId };
}
const fulfill = (order: string, external: string | null = null) =>
  db.query(
    `SELECT fulfill_skill_commerce($1,'stripe',$2,'cus_test',now(),now()+interval '1 month')`,
    [order, external]
  );

describe('Skill commerce PostgreSQL lifecycle', () => {
  it('keeps new products inactive and old Pro credits intact', async () => {
    expect(
      await scalar(
        "SELECT is_active FROM skill_products WHERE id='skill_pro_content_v2'"
      )
    ).toBe(false);
    expect(
      await scalar(
        "SELECT monthly_credits FROM subscription_plans WHERE id='pro'"
      )
    ).toBe(10000);
    expect(
      await scalar(
        "SELECT monthly_credits FROM subscription_plans WHERE id='skill_pro'"
      )
    ).toBe(10000);
  });
  it('grants only the purchased Skill, idempotently, without creating a compute subscription', async () => {
    const { order, skillId } = await contentOrder('single');
    await fulfill(order);
    await fulfill(order);
    expect(await scalar('SELECT count(*)::int FROM skill_entitlements')).toBe(
      1
    );
    expect(await scalar('SELECT skill_id FROM skill_entitlements')).toBe(
      skillId
    );
    expect(await scalar('SELECT count(*)::int FROM user_subscriptions')).toBe(
      0
    );
    expect(await scalar('SELECT count(*)::int FROM skill_subscriptions')).toBe(
      0
    );
    expect(
      await scalar('SELECT skill_catalog_user_access($1,$2)', [userA, skillId])
    ).toMatchObject({ allowed: true, source: 'single_purchase' });
  });
  it('prevents concurrent orders for the same purchase, and prevents refund-before-fulfillment reactivation', async () => {
    const { order } = await contentOrder('single');
    await expect(
      db.query(
        `INSERT INTO payment_orders(user_id,amount,status,product_type,product_id,metadata)
      SELECT user_id,amount,'pending',product_type,product_id,metadata FROM payment_orders WHERE id=$1`,
        [order]
      )
    ).rejects.toThrow('SKILL_CHECKOUT_CONFLICT');
    await db.query(`SELECT refund_skill_purchase($1,'refund')`, [order]);
    await expect(fulfill(order)).rejects.toThrow('Invalid content order');
    expect(await scalar('SELECT count(*)::int FROM skill_entitlements')).toBe(
      0
    );
  });
  it('refunds one purchase without revoking a separately acquired subscription', async () => {
    const purchase = await contentOrder('single');
    await fulfill(purchase.order);
    await db.query(`UPDATE payment_orders SET status='succeeded' WHERE id=$1`, [
      purchase.order
    ]);
    const membership = await contentOrder('subscription');
    await fulfill(membership.order, 'sub_content');
    await db.query(`SELECT refund_skill_purchase($1,'refund')`, [
      purchase.order
    ]);
    expect(
      await scalar('SELECT skill_catalog_user_access($1,$2)', [
        userA,
        purchase.skillId
      ])
    ).toMatchObject({ allowed: true, source: 'subscription' });
  });
  it('freezes the prepaid/initial period across fulfillment retries and never changes the compute ledger', async () => {
    const { order } = await contentOrder('subscription');
    await fulfill(order, 'sub_content');
    const first = await scalar<Date>('SELECT ends_at FROM skill_entitlements');
    await db.query(
      `SELECT fulfill_skill_commerce($1,'stripe','sub_content','cus_test',now()+interval '2 days',now()+interval '2 months')`,
      [order]
    );
    expect(await scalar('SELECT ends_at FROM skill_entitlements')).toEqual(
      first
    );
    expect(await scalar('SELECT count(*)::int FROM user_subscriptions')).toBe(
      0
    );
  });
  it('suspends a refunded renewal, ignores stale paid updates, and restores a later separately paid period', async () => {
    const { order } = await contentOrder('subscription');
    await fulfill(order, 'sub_content');
    await db.query(`UPDATE payment_orders SET status='succeeded' WHERE id=$1`, [
      order
    ]);
    const { skillId } = await seedSkill('member-output', 'premium');
    const sync = (
      start: string,
      end: string,
      status = 'active',
      access = true
    ) =>
      db.query(
        `SELECT sync_skill_commerce_subscription('sub_content',$1,$2,$3,false,$4)`,
        [status, start, end, access]
      );
    const start = new Date(Date.now() - 86400000).toISOString();
    const end = new Date(Date.now() + 29 * 86400000).toISOString();
    await sync(start, end);
    await db.query(
      `SELECT refund_skill_subscription_period('sub_content','in_refund',$1,$2,'refund',false)`,
      [start, end]
    );
    await sync(start, end);
    expect(
      await scalar('SELECT skill_catalog_user_access($1,$2)', [userA, skillId])
    ).toMatchObject({ allowed: false });
    const next = new Date(Date.now() + 59 * 86400000).toISOString();
    await sync(end, next);
    expect(await scalar('SELECT status FROM skill_entitlements')).toBe(
      'active'
    );
    // Refunding an older invoice again cannot withdraw the newer paid period.
    await db.query(
      `SELECT refund_skill_subscription_period('sub_content','in_refund',$1,$2,'refund',false)`,
      [start, end]
    );
    expect(await scalar('SELECT status FROM skill_entitlements')).toBe(
      'active'
    );
    await sync(end, next, 'past_due', false);
    expect(await scalar('SELECT status FROM skill_entitlements')).toBe(
      'suspended'
    );
  });
  it('enforces RLS and prohibits buyers from granting themselves access', async () => {
    const { order } = await contentOrder('subscription');
    await fulfill(order, 'sub_content');
    expect(
      await asUser(userB, () =>
        scalar('SELECT count(*)::int FROM skill_subscriptions')
      )
    ).toBe(0);
    expect(
      await asUser(userA, () =>
        scalar('SELECT count(*)::int FROM skill_subscriptions')
      )
    ).toBe(1);
    await expect(
      asUser(userA, () => fulfill(order, 'sub_content'))
    ).rejects.toThrow('permission denied');
    await expect(
      asUser(userA, () => db.query(`UPDATE skill_products SET is_active=true`))
    ).rejects.toThrow('permission denied');
  });
});
