// @vitest-environment node
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
const m = vi.hoisted(() => ({
  client: vi.fn(),
  stripe: vi.fn(),
  create: vi.fn(),
  conversion: vi.fn()
}));
vi.mock('@supabase/supabase-js', () => ({ createClient: m.client }));
vi.mock('stripe', () => ({ default: m.stripe }));
vi.mock('../../api/utils/conversion-events', () => ({
  recordConversionEvent: m.conversion
}));
import checkout from '../../api/membership/checkout';
import productsHandler from '../../api/membership/skill-products';
type Row = Record<string, unknown>;

/** Minimal in-memory PostgREST stand-in for the calls fulfillment makes. */
function createFakeDb(tables: Record<string, Row[]>) {
  const rpc = vi.fn(
    async (
      _name: string,
      _args: Record<string, unknown>
    ): Promise<{ data: unknown; error: { message: string } | null }> => ({
      data: null,
      error: null
    })
  );
  function from(table: string) {
    let op: 'select' | 'update' | 'insert' = 'select';
    let patch: Row = {};
    let inserted: Row[] = [];
    const filters: Array<(row: Row) => boolean> = [];
    const run = () => {
      const rows = (tables[table] ||= []);
      if (op === 'insert') {
        rows.push(
          ...inserted.map((row) => ({ id: crypto.randomUUID(), ...row }))
        );
        return inserted;
      }
      const matched = rows.filter((row) =>
        filters.every((filter) => filter(row))
      );
      if (op === 'update') matched.forEach((row) => Object.assign(row, patch));
      return matched.map((row) => ({ ...row }));
    };
    const builder = {
      select: () => builder,
      order: () => builder,
      limit: () => builder,
      update(value: Row) {
        op = 'update';
        patch = value;
        return builder;
      },
      insert(value: Row | Row[]) {
        op = 'insert';
        inserted = (Array.isArray(value) ? value : [value]).map((row) => ({
          id: crypto.randomUUID(),
          ...row
        }));
        return builder;
      },
      eq(column: string, value: unknown) {
        filters.push((row) => row[column] === value);
        return builder;
      },
      in(column: string, values: unknown[]) {
        filters.push((row) => values.includes(row[column]));
        return builder;
      },
      lt(column: string, value: string) {
        filters.push((row) => String(row[column]) < value);
        return builder;
      },
      async maybeSingle() {
        return { data: run()[0] ?? null, error: null };
      },
      async single() {
        const row = run()[0];
        return {
          data: row ?? null,
          error: row ? null : { message: 'not found' }
        };
      },
      then(
        resolve: (value: unknown) => unknown,
        reject?: (reason: unknown) => unknown
      ) {
        return Promise.resolve({ data: run(), error: null }).then(
          resolve,
          reject
        );
      }
    };
    return builder;
  }
  return { db: { from, rpc } as unknown as SupabaseClient, rpc, tables };
}

const USER = '00000000-0000-4000-8000-000000000123';
const product = {
  id: 'skill_pro_content_v2',
  kind: 'subscription',
  name: 'Skill Pro',
  is_active: true,
  price_usd: 999,
  price_cny: 4900,
  yearly_usd: 7900,
  yearly_cny: 39900,
  contract_version: 'skills-2026-10-v2'
};
function setup(rows: Record<string, Row[]> = {}) {
  const fake = createFakeDb({ skill_products: [{ ...product }], ...rows });
  Object.assign(fake.db, {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: USER, email: 'buyer@example.com' } },
        error: null
      }))
    }
  });
  m.client.mockReturnValue(fake.db);
  return fake;
}
function request(body: Row) {
  return new Request('https://webtomind.com/api/membership/checkout', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer test-only',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  for (const [key, value] of Object.entries({
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_ANON_KEY: 'test-anon',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service',
    STRIPE_MODE: 'test',
    STRIPE_SECRET_KEY_TEST: 'sk_test_fixture',
    STRIPE_CHECKOUT_ENABLED: 'true',
    ZPAY_CHECKOUT_ENABLED: 'true',
    ZPAY_PID: 'test-pid',
    ZPAY_KEY: 'test-key',
    ZPAY_USD_TO_CNY_RATE: '7.2'
  }))
    vi.stubEnv(key, value);
  m.create.mockResolvedValue({
    id: 'cs_content_fixture',
    url: 'https://checkout.stripe.com/c/pay/test_fixture'
  });
  m.stripe.mockImplementation(function () {
    return { checkout: { sessions: { create: m.create } } };
  });
  m.conversion.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());
describe('content commerce checkout API', () => {
  it('creates annual recurring Stripe checkout from the server quote and snapshots the contract', async () => {
    const fake = setup();
    const response = await checkout(
      request({
        type: 'skill_subscription',
        id: product.id,
        billingCycle: 'yearly',
        amount: 1
      })
    );
    expect(response.status).toBe(200);
    const params = m.create.mock.calls[0][0];
    expect(params).toMatchObject({
      mode: 'subscription',
      subscription_data: { metadata: { product_type: 'skill_subscription' } }
    });
    expect(params.line_items[0].price_data).toMatchObject({
      unit_amount: 7900,
      currency: 'usd',
      recurring: { interval: 'year' }
    });
    expect(fake.tables.payment_orders[0]).toMatchObject({
      amount: 7900,
      product_type: 'skill_subscription',
      metadata: {
        skillSnapshot: {
          workspaceCredits: 0,
          contractVersion: 'skills-2026-10-v2'
        }
      }
    });
  });
  it('creates an Alipay prepaid order at the explicit CNY price, not an FX conversion', async () => {
    const fake = setup();
    const response = await checkout(
      request({
        type: 'skill_subscription',
        id: product.id,
        billingCycle: 'yearly',
        paymentProvider: 'alipay'
      })
    );
    expect(response.status).toBe(200);
    expect(fake.tables.payment_orders[0]).toMatchObject({
      amount: 39900,
      currency: 'cny',
      provider: 'zpay'
    });
    const body = await response.json();
    expect(body.fields.money).toBe('399.00');
    expect(m.create).not.toHaveBeenCalled();
  });
  it('sells an installable single item with its immutable version/hash snapshot', async () => {
    const fake = setup({
      skill_products: [
        { ...product, id: 'single', kind: 'single', skill_slug: 'carousel' }
      ],
      skill_catalog: [
        {
          id: 'skill-1',
          slug: 'carousel',
          status: 'published',
          tier: 'premium',
          latest_version_id: 'version-1'
        }
      ],
      skill_catalog_versions: [
        {
          id: 'version-1',
          skill_id: 'skill-1',
          status: 'published',
          version: '1.0.1',
          sha256: 'a'.repeat(64)
        }
      ]
    });
    const response = await checkout(
      request({ type: 'skill_purchase', id: 'single' })
    );
    expect(response.status).toBe(200);
    expect(m.create.mock.calls[0][0].mode).toBe('payment');
    expect(
      m.create.mock.calls[0][0].line_items[0].price_data.recurring
    ).toBeUndefined();
    expect(fake.tables.payment_orders[0]).toMatchObject({
      amount: 999,
      metadata: {
        skillSnapshot: {
          skillId: 'skill-1',
          version: '1.0.1',
          sha256: 'a'.repeat(64)
        }
      }
    });
  });
  it.each(['skill_lifetime', 'subscription'])(
    'keeps new sales of %s legacy contracts closed',
    async (type) => {
      setup();
      const response = await checkout(
        request({
          type,
          id: type === 'subscription' ? 'skill_pro' : 'skill_lifetime'
        })
      );
      expect(response.status).toBe(409);
      expect(m.create).not.toHaveBeenCalled();
    }
  );
  it('does not charge an existing Pro owner again', async () => {
    const fake = setup({
      user_subscriptions: [
        {
          user_id: USER,
          status: 'active',
          current_period_end: '2099-01-01',
          subscription_plans: { skill_tier_access: 'premium' }
        }
      ]
    });
    const response = await checkout(
      request({ type: 'skill_subscription', id: product.id })
    );
    expect(response.status).toBe(409);
    expect((await response.json()).errorCode).toBe(
      'SKILL_ACCESS_ALREADY_INCLUDED'
    );
    expect(fake.tables.payment_orders || []).toHaveLength(0);
  });
  it('fails closed for inactive products and malformed intervals', async () => {
    setup({ skill_products: [{ ...product, is_active: false }] });
    expect(
      (await checkout(request({ type: 'skill_subscription', id: product.id })))
        .status
    ).toBe(404);
    expect(
      (
        await checkout(
          request({
            type: 'skill_subscription',
            id: product.id,
            billingCycle: 'weekly'
          })
        )
      ).status
    ).toBe(400);
    expect(m.create).not.toHaveBeenCalled();
  });
  it('returns public products without private ownership and requires valid auth for account access', async () => {
    const fake = setup();
    const publicResponse = await productsHandler(
      new Request('https://webtomind.com/api/membership/skill-products')
    );
    expect(publicResponse.status).toBe(200);
    expect((await publicResponse.json()).access).toBeNull();
    vi.mocked(fake.db.auth.getUser).mockResolvedValue({
      data: { user: null },
      error: new Error('bad token')
    } as never);
    const denied = await productsHandler(
      new Request('https://webtomind.com/api/membership/skill-products', {
        headers: { Authorization: 'Bearer invalid' }
      })
    );
    expect(denied.status).toBe(401);
  });
});
