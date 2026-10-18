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
      VALUES ('pro', 'pro', 2000, 16800, 10000, '{"dailyImageGeneration": -1}');
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
