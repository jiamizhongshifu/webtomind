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

async function insertOrder(userId: string, productType = 'subscription') {
  return scalar<string>(
    `INSERT INTO payment_orders (user_id, amount, currency, status, product_type, product_id)
     VALUES ($1, 999, 'usd', 'processing', $2, 'skill_pro') RETURNING id`,
    [userId, productType]
  );
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
}, 60000);

afterAll(async () => db?.close());

beforeEach(async () => {
  await db.exec(`
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

async function seedSkill(slug: string, tier: 'free' | 'premium', status = 'published') {
  const skillId = await scalar<string>(
    `INSERT INTO skill_catalog (slug, name, summary, output_types, scene_tags, tier, status, published_at)
     VALUES ($1, $2, '{"en":"summary"}', '{image}', '{xiaohongshu}', $3, $4, now()) RETURNING id`,
    [slug, JSON.stringify({ en: `${slug} name`, 'zh-CN': '封面' }), tier, status]
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

describe('skill catalog migration', () => {
  it('re-applies idempotently and seeds inactive Skill plans', async () => {
    await db.exec(MIGRATION);
    const plans = await db.query<{
      id: string;
      is_active: boolean;
      billing_kind: string;
      price_cny_one_time: number | null;
    }>(
      `SELECT id, is_active, billing_kind, price_cny_one_time FROM subscription_plans
       WHERE id LIKE 'skill_%' ORDER BY id`
    );
    expect(plans.rows).toEqual([
      { id: 'skill_lifetime', is_active: false, billing_kind: 'one_time', price_cny_one_time: 89900 },
      { id: 'skill_pro', is_active: false, billing_kind: 'recurring', price_cny_one_time: null }
    ]);
    await expect(insertOrder(userA, 'skill_lifetime')).resolves.toBeTruthy();
    await expect(insertOrder(userA, 'unknown_product')).rejects.toThrow();
  });

  it('aligns Skill Pro with Pro and gives existing paid plans premium Skills', async () => {
    const rows = await db.query<{
      id: string;
      skill_tier_access: string;
      monthly_credits: number;
      limits: unknown;
    }>(
      `SELECT id, skill_tier_access, monthly_credits, limits FROM subscription_plans
       WHERE id IN ('free', 'pro', 'max', 'skill_pro') ORDER BY id`
    );
    const byId = Object.fromEntries(rows.rows.map((row) => [row.id, row]));
    expect(byId.skill_pro.monthly_credits).toBe(byId.pro.monthly_credits);
    expect(byId.skill_pro.limits).toEqual(byId.pro.limits);
    expect(byId.pro.skill_tier_access).toBe('premium');
    expect(byId.max.skill_tier_access).toBe('premium');
    expect(byId.free.skill_tier_access).toBe('free');
  });

  it('backfills only currently paid subscriptions, traced to their orders, idempotently', async () => {
    const { skillId } = await seedSkill('launch-deck', 'premium');
    const day = 86_400_000;
    const future = new Date(Date.now() + 20 * day).toISOString();
    const start = new Date(Date.now() - 10 * day).toISOString();
    const past = new Date(Date.now() - day).toISOString();
    const order = (userId: string, provider: string, productId: string, paymentId: string, status = 'succeeded') =>
      scalar<string>(
        `INSERT INTO payment_orders (user_id, amount, status, provider, product_type, product_id, metadata, created_at)
         VALUES ($1, 2000, $2, $3, 'subscription', $4, jsonb_build_object('provider_payment_id', $5::text), now() - interval '10 days')
         RETURNING id`,
        [userId, status, provider, productId, paymentId]
      );
    const subscription = (userId: string, planId: string, status: string, end: string, provider: string, stripeId: string | null, externalId: string | null) =>
      db.query(
        `INSERT INTO user_subscriptions (user_id, plan_id, status, current_period_start, current_period_end, payment_provider, stripe_subscription_id, external_subscription_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [userId, planId, status, start, end, provider, stripeId, externalId]
      );
    const userC = '00000000-0000-0000-0000-00000000000c';
    const userD = '00000000-0000-0000-0000-00000000000d';
    await db.query(`INSERT INTO auth.users VALUES ($1), ($2) ON CONFLICT DO NOTHING`, [userC, userD]);

    // Stripe Pro, active: older Max order and newer Pro order -> Pro order wins.
    await order(userA, 'stripe', 'max', 'cs_old');
    const proOrder = await order(userA, 'stripe', 'pro', 'cs_pro');
    await subscription(userA, 'pro', 'active', future, 'stripe', 'sub_a', null);
    // ZPAY Max, canceled with time left: matched by trade number.
    await order(userB, 'zpay', 'max', 'trade_other');
    const zpayOrder = await order(userB, 'zpay', 'max', 'trade_b');
    await subscription(userB, 'max', 'canceled', future, 'zpay', null, 'trade_b');
    // Not eligible: past_due, expired, free plan.
    await order(userC, 'stripe', 'pro', 'cs_c');
    await subscription(userC, 'pro', 'past_due', future, 'stripe', 'sub_c', null);
    await subscription(userC, 'max', 'active', past, 'stripe', 'sub_c2', null);
    await subscription(userC, 'free', 'active', future, 'stripe', null, null);
    // Eligible but no traceable order -> reported, not granted.
    await subscription(userD, 'pro', 'active', future, 'stripe', 'sub_d', null);

    const dryRun = await scalar<Record<string, unknown>>('SELECT backfill_subscription_skill_entitlements(false)');
    expect(dryRun).toMatchObject({ applied: false, eligible: 3, would_grant: 2, already_current: 0 });
    expect(dryRun.unmatched).toEqual([
      expect.objectContaining({ user_id: userD, plan_id: 'pro' })
    ]);
    expect(await scalar<number>('SELECT count(*)::int FROM skill_entitlements')).toBe(0);

    const applied = await scalar<Record<string, unknown>>('SELECT backfill_subscription_skill_entitlements(true)');
    expect(applied).toMatchObject({ applied: true, granted: 2 });
    const grants = await db.query<{
      user_id: string;
      payment_order_id: string;
      external_subscription_id: string;
      ends_at: Date;
      metadata: Record<string, unknown>;
    }>('SELECT user_id, payment_order_id, external_subscription_id, ends_at, metadata FROM skill_entitlements ORDER BY user_id');
    expect(grants.rows.map((row) => [row.user_id, row.payment_order_id, row.external_subscription_id])).toEqual([
      [userA, proOrder, 'sub_a'],
      [userB, zpayOrder, 'trade_b']
    ]);
    expect(new Date(grants.rows[0].ends_at).toISOString()).toBe(future);
    expect(grants.rows[0].metadata).toMatchObject({ backfill: true, match_method: 'latest_stripe_subscription_order' });

    const again = await scalar<Record<string, unknown>>('SELECT backfill_subscription_skill_entitlements(true)');
    expect(again).toMatchObject({ granted: 0, already_current: 2 });
    expect(await scalar<number>('SELECT count(*)::int FROM skill_entitlements')).toBe(2);
    expect(await scalar('SELECT skill_catalog_user_access($1, $2)', [userA, skillId])).toEqual({
      allowed: true,
      source: 'subscription'
    });

    // A refunded order is never restored; a lapsed-then-renewed grant is reactivated.
    await db.query(`SELECT revoke_skill_entitlements_for_order($1, 'refund')`, [zpayOrder]);
    await db.query(`SELECT sync_subscription_skill_entitlements('sub_a', false, now())`);
    const healed = await scalar<Record<string, unknown>>('SELECT backfill_subscription_skill_entitlements(true)');
    expect(healed).toMatchObject({ granted: 1, revoked_skipped: 1 });
    expect(await scalar('SELECT skill_catalog_user_access($1, $2)', [userB, skillId])).toEqual({
      allowed: false,
      reason: 'entitlement_required'
    });
    expect(await scalar('SELECT skill_catalog_user_access($1, $2)', [userA, skillId])).toEqual({
      allowed: true,
      source: 'subscription'
    });

    const scoped = await scalar<Record<string, unknown>>('SELECT backfill_subscription_skill_entitlements(false, $1)', [userD]);
    expect(scoped).toMatchObject({ eligible: 1, would_grant: 0 });
  });

  it('keeps published versions immutable except for yanking', async () => {
    const { versionId } = await seedSkill('cover', 'free');
    await expect(
      db.query('UPDATE skill_catalog_versions SET sha256 = $1 WHERE id = $2', [hash('b'), versionId])
    ).rejects.toThrow(/SKILL_VERSION_IMMUTABLE/);
    await expect(
      db.query('DELETE FROM skill_catalog_versions WHERE id = $1', [versionId])
    ).rejects.toThrow(/SKILL_VERSION_IMMUTABLE/);
    await db.query(`UPDATE skill_catalog_versions SET status = 'yanked' WHERE id = $1`, [versionId]);
    await expect(
      db.query(`UPDATE skill_catalog_versions SET status = 'published' WHERE id = $1`, [versionId])
    ).rejects.toThrow(/SKILL_VERSION_IMMUTABLE/);
  });

  it('searches published Skills with filters, escaping and trending order', async () => {
    const free = await seedSkill('xhs-cover', 'free');
    const premium = await seedSkill('launch-deck', 'premium');
    await seedSkill('draft-skill', 'free', 'draft');
    await db.query(
      `INSERT INTO skill_installs (user_id, skill_id, version_id) VALUES ($1, $2, $3), ($1, $2, $3)`,
      [userA, premium.skillId, premium.versionId]
    );
    const all = await db.query<{ slug: string; installs_7d: number; total_count: number }>(
      `SELECT slug, installs_7d, total_count FROM search_skill_catalog(p_sort => 'trending')`
    );
    expect(all.rows.map((row) => row.slug)).toEqual(['launch-deck', 'xhs-cover']);
    expect(Number(all.rows[0].installs_7d)).toBe(2);
    expect(Number(all.rows[0].total_count)).toBe(2);
    expect(await scalar<number>(`SELECT install_count FROM skill_catalog WHERE id = $1`, [premium.skillId])).toBe(2);

    const zh = await db.query(`SELECT slug FROM search_skill_catalog(p_query => '封面', p_tier => 'free')`);
    expect(zh.rows).toEqual([{ slug: 'xhs-cover' }]);
    const wildcard = await db.query(`SELECT slug FROM search_skill_catalog(p_query => '%')`);
    expect(wildcard.rows).toEqual([]);
    expect(free.skillId).toBeTruthy();
  });

  it('enforces RLS: public catalog, hidden object keys, owner-only entitlements', async () => {
    const { skillId } = await seedSkill('xhs-cover', 'premium');
    await seedSkill('hidden', 'free', 'draft');
    const orderA = await insertOrder(userA);
    await db.query(
      `SELECT grant_skill_entitlement($1, $2, 'subscription', NULL, now(), now() + interval '1 month')`,
      [userA, orderA]
    );

    await db.exec('SET ROLE anon');
    const publicSlugs = await db.query(`SELECT slug FROM skill_catalog ORDER BY slug`);
    await expect(db.query('SELECT r2_object_key FROM skill_catalog_versions')).rejects.toThrow(/permission denied/);
    const versions = await db.query('SELECT sha256 FROM skill_catalog_versions');
    await expect(db.query('SELECT * FROM cli_device_authorizations')).rejects.toThrow(/permission denied/);
    await expect(
      db.query(`SELECT skill_catalog_user_access($1, $2)`, [userA, skillId])
    ).rejects.toThrow(/permission denied/);
    await db.exec('RESET ROLE');
    expect(publicSlugs.rows).toEqual([{ slug: 'xhs-cover' }]);
    expect(versions.rows).toHaveLength(1);

    const ownRows = await asUser(userA, () => db.query('SELECT user_id FROM skill_entitlements'));
    const otherRows = await asUser(userB, () => db.query('SELECT user_id FROM skill_entitlements'));
    expect(ownRows.rows).toHaveLength(1);
    expect(otherRows.rows).toHaveLength(0);
    await expect(
      asUser(userA, () =>
        db.query(
          `INSERT INTO skill_entitlements (user_id, source, payment_order_id, ends_at)
           VALUES ($1, 'subscription', $2, now() + interval '1 year')`,
          [userA, orderA]
        )
      )
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(userA, () => db.query('SELECT token_hash FROM cli_credentials'))
    ).rejects.toThrow(/permission denied/);
  });

  it('grants idempotently per order, syncs subscriptions and keeps refunds terminal', async () => {
    const { skillId } = await seedSkill('launch-deck', 'premium');
    const access = () =>
      scalar<{ allowed: boolean; source?: string; reason?: string }>(
        'SELECT skill_catalog_user_access($1, $2)',
        [userA, skillId]
      );
    expect(await access()).toEqual({ allowed: false, reason: 'entitlement_required' });

    const order = await insertOrder(userA);
    const grant = (endsAt: string) =>
      db.query(
        `SELECT grant_skill_entitlement($1, $2, 'subscription', NULL, now(), $3::timestamptz, 'sub_1')`,
        [userA, order, endsAt]
      );
    await grant(new Date(Date.now() + 86400000).toISOString());
    await grant(new Date(Date.now() + 86400000).toISOString()); // webhook replay
    expect(await scalar<number>('SELECT count(*)::int FROM skill_entitlements')).toBe(1);
    expect(await access()).toEqual({ allowed: true, source: 'subscription' });

    await expect(
      db.query(`SELECT grant_skill_entitlement($1, $2, 'subscription', NULL, now(), now() + interval '1 day')`, [userB, order])
    ).rejects.toThrow(/ORDER_USER_MISMATCH/);

    await db.query(`SELECT sync_subscription_skill_entitlements('sub_1', false, now())`);
    expect(await access()).toEqual({ allowed: false, reason: 'entitlement_required' });
    await db.query(`SELECT sync_subscription_skill_entitlements('sub_1', true, now() + interval '30 days')`);
    expect(await access()).toEqual({ allowed: true, source: 'subscription' });

    await db.query(`SELECT revoke_skill_entitlements_for_order($1, 'refund')`, [order]);
    await db.query(`SELECT sync_subscription_skill_entitlements('sub_1', true, now() + interval '60 days')`);
    await grant(new Date(Date.now() + 86400000 * 90).toISOString());
    expect(await access()).toEqual({ allowed: false, reason: 'entitlement_required' });
  });

  it('runs the device flow: pending, slow_down, approve, one-shot issue, expiry', async () => {
    await db.query(
      `INSERT INTO cli_device_authorizations (device_code_hash, user_code, expires_at, interval_seconds)
       VALUES ($1, 'BCDF-GHJK', now() + interval '10 minutes', 5)`,
      [hash('1')]
    );
    const poll = (deviceHash: string, tokenHash = hash('9')) =>
      scalar<{ status: string; interval?: number; user_id?: string }>(
        `SELECT poll_cli_device_authorization($1, $2, 'wtm_cli_abcd')`,
        [deviceHash, tokenHash]
      );
    expect((await poll(hash('1'))).status).toBe('authorization_pending');
    expect(await poll(hash('1'))).toEqual({ status: 'slow_down', interval: 10 });
    expect(await scalar('SELECT decide_cli_device_authorization($1, $2, true)', ['bcdf-ghjk', userA])).toBe('approved');
    const issued = await poll(hash('1'));
    expect(issued).toMatchObject({ status: 'issued', user_id: userA });
    expect((await poll(hash('1'), hash('8'))).status).toBe('invalid_grant');
    const auth = await scalar<{ status: string; user_id: string }>(
      'SELECT authenticate_cli_credential($1)',
      [hash('9')]
    );
    expect(auth).toMatchObject({ status: 'active', user_id: userA });
    await db.query('UPDATE cli_credentials SET revoked_at = now()');
    expect(await scalar('SELECT authenticate_cli_credential($1)', [hash('9')])).toEqual({ status: 'revoked' });

    await db.query(
      `INSERT INTO cli_device_authorizations (device_code_hash, user_code, expires_at)
       VALUES ($1, 'LMNP-QRST', now() - interval '1 second')`,
      [hash('2')]
    );
    expect((await poll(hash('2'))).status).toBe('expired_token');
    expect(await scalar('SELECT decide_cli_device_authorization($1, $2, true)', ['LMNP-QRST', userA])).toBe('not_found');
    expect((await poll(hash('3'))).status).toBe('invalid_grant');
  });
});
