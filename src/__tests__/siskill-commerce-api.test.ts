// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import Stripe from 'stripe';
import {
  handleCommerce,
  processStripeEvent,
  type CommerceEnv,
  type Dependencies
} from '../../apps/siskill/server/handler';
import { checkoutInput, returnUrls } from '../../apps/siskill/server/policy';
import { buildZpayCheckoutFields } from '../../api/utils/zpay';
const id = 'a0000000-0000-4000-8000-000000000001',
  user = '00000000-0000-0000-0000-00000000000a';
function fixture() {
  const order = {
    id,
    user_id: user,
    sku: 'siskill_carousel',
    release_id: id,
    product_scope: 'siskill',
    provider: 'stripe',
    status: 'pending',
    amount: 999,
    currency: 'usd',
    checkout_id: null as string | null,
    checkout_url: null,
    provider_payment_id: null,
    created_at: new Date().toISOString(),
    snapshot: {
      locale: 'en-US',
      name: 'Carousel',
      slug: 'carousel',
      version: '1.0.0',
      sha256: 'a'.repeat(64),
      bytes: 1000,
      contract_version: 'siskill-v1'
    }
  };
  const row = { data: order as unknown, error: null };
  class Query {
    select = vi.fn(() => this);
    eq = vi.fn(() => this);
    limit = vi.fn(() => this);
    order = vi.fn(() => this);
    maybeSingle = vi.fn(async () => row);
  }
  const query = new Query();
  const releaseQuery = {
    ...query,
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(async () => ({
      data: {
        object_key: 'siskill/carousel/1.0.0.tar.gz',
        status: 'published'
      },
      error: null
    }))
  };
  releaseQuery.select.mockReturnValue(releaseQuery);
  releaseQuery.eq.mockReturnValue(releaseQuery);
  const db = {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: user } },
        error: null
      }))
    },
    rpc: vi.fn(async (name: string) => ({
      data: name === 'siskill_create_order' ? order : 'paid',
      error: null
    })),
    from: vi.fn((table: string) =>
      table === 'siskill_releases' ? releaseQuery : query
    )
  };
  const stripe = {
    checkout: {
      sessions: {
        create: vi.fn(async () => ({
          id: 'cs_test',
          url: 'https://checkout.stripe.com/c/pay/test'
        })),
        retrieve: vi.fn()
      }
    }
  };
  const env: CommerceEnv = {
    SISKILL_COMMERCE_ENABLED: 'true',
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-only',
    SISKILL_STRIPE_WEBHOOK_SECRET: 'whsec_local',
    SISKILL_ZPAY_PID: 'merchant',
    SISKILL_ZPAY_KEY: 'local-signing-key',
    SISKILL_PACKAGES: {
      head: vi.fn(async () => ({
        size: 1000,
        customMetadata: { sha256: 'a'.repeat(64) }
      })),
      get: vi.fn(async () => ({
        size: 1000,
        customMetadata: { sha256: 'a'.repeat(64) },
        body: new ReadableStream({
          start(c) {
            c.enqueue(new Uint8Array(1000));
            c.close();
          }
        })
      }))
    }
  };
  const deps = { db, stripe } as unknown as Dependencies;
  const request = (body: unknown, headers: Record<string, string> = {}) =>
    new Request('https://siskill.dev/api/siskill/checkout', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer user-token',
        'Content-Type': 'application/json',
        Origin: 'https://siskill.dev',
        ...headers
      },
      body: JSON.stringify(body)
    });
  return { order, db, stripe, env, deps, request, row, query, releaseQuery };
}
describe('SiSkill checkout and provider boundary', () => {
  it('fails closed before production credentials/configuration exist', async () => {
    const r = await handleCommerce(
      new Request('https://siskill.dev/api/siskill/status'),
      {}
    );
    expect(await r.json()).toEqual({
      product: 'siskill',
      checkoutOpen: false,
      membershipOpen: false
    });
    expect(
      (
        await handleCommerce(
          new Request('https://siskill.dev/api/siskill/me'),
          {}
        )
      ).status
    ).toBe(503);
  });
  it.each([
    'amount',
    'currency',
    'product_scope',
    'user_id',
    'successUrl',
    'price_id'
  ])('rejects client-controlled %s', (field) => {
    expect(() =>
      checkoutInput({
        sku: 'siskill_carousel',
        provider: 'stripe',
        [field]: 'attacker'
      })
    ).toThrow('UNSUPPORTED_CHECKOUT_FIELD');
  });
  it('pins post-payment return to SiSkill and never treats query flags as paid proof', () => {
    expect(returnUrls(id, 'https://evil.example')).toEqual({
      success: `https://siskill.dev/en-US/account?order=${id}`,
      cancel: `https://siskill.dev/en-US/account?order=${id}&cancelled=1`
    });
  });
  it('rejects foreign origins and unauthenticated requests without touching order storage', async () => {
    const f = fixture();
    expect(
      (
        await handleCommerce(
          f.request(
            { sku: f.order.sku, provider: 'stripe' },
            { Origin: 'https://webtomind.com' }
          ),
          f.env,
          f.deps
        )
      ).status
    ).toBe(403);
    const r = f.request({ sku: f.order.sku, provider: 'stripe' });
    r.headers.delete('Authorization');
    expect((await handleCommerce(r, f.env, f.deps)).status).toBe(401);
    expect(f.db.rpc).not.toHaveBeenCalled();
  });
  it('uses server quote and stable idempotency metadata for network retries', async () => {
    const f = fixture();
    const body = { sku: f.order.sku, provider: 'stripe', locale: 'en-US' };
    expect((await handleCommerce(f.request(body), f.env, f.deps)).status).toBe(
      200
    );
    expect(
      (
        await handleCommerce(
          f.request({ ...body, locale: 'zh-CN' }),
          f.env,
          f.deps
        )
      ).status
    ).toBe(200);
    const calls = f.stripe.checkout.sessions.create.mock.calls as unknown as [
      Stripe.Checkout.SessionCreateParams,
      Stripe.RequestOptions
    ][];
    expect(calls[0]).toEqual(calls[1]);
    expect(calls[0][0].line_items![0].price_data!.unit_amount).toBe(999);
    expect(calls[0][0].metadata!.product_scope).toBe('siskill');
    expect(calls[0][1].idempotencyKey).toBe(`siskill:checkout:${id}`);
    expect(f.db.from.mock.calls.every(([t]) => t.startsWith('siskill_'))).toBe(
      true
    );
  });
  it('never creates checkout when archive is missing or hash differs', async () => {
    const f = fixture();
    vi.mocked(f.env.SISKILL_PACKAGES!.head).mockResolvedValue({
      size: 1000,
      customMetadata: { sha256: 'b'.repeat(64) }
    });
    expect(
      (
        await handleCommerce(
          f.request({ sku: f.order.sku, provider: 'stripe' }),
          f.env,
          f.deps
        )
      ).status
    ).toBe(503);
    expect(f.stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });
  it('does not leak provider credentials/errors on uncertain session creation', async () => {
    const f = fixture();
    f.stripe.checkout.sessions.create.mockRejectedValue(
      Error('secret provider customer details')
    );
    const r = await handleCommerce(
      f.request({ sku: f.order.sku, provider: 'stripe' }),
      f.env,
      f.deps
    );
    expect(r.status).toBe(503);
    expect(await r.text()).not.toContain('secret provider');
    expect(
      f.db.rpc.mock.calls.filter(([n]) => n === 'siskill_bind_checkout')
    ).toHaveLength(0);
  });
  it('gates sales without disabling already-paid webhook fulfillment', async () => {
    const f = fixture();
    f.env.SISKILL_COMMERCE_ENABLED = 'false';
    expect(
      (
        await handleCommerce(
          f.request({ sku: f.order.sku, provider: 'stripe' }),
          f.env,
          f.deps
        )
      ).status
    ).toBe(503);
    f.order.checkout_id = 'cs_test';
    await processStripeEvent(
      {
        id: 'evt_1',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test',
            mode: 'payment',
            client_reference_id: user,
            payment_status: 'paid',
            payment_intent: 'pi_1',
            amount_total: 999,
            currency: 'usd',
            metadata: {
              product_scope: 'siskill',
              order_id: id,
              sku: f.order.sku
            }
          }
        }
      } as unknown as Stripe.Event,
      f.deps
    );
    expect(f.db.rpc).toHaveBeenCalledWith(
      'siskill_apply_payment',
      expect.objectContaining({ p_payment: 'pi_1', p_amount: 999 })
    );
  });
  it('recovers a lost checkout response only from a verified matching callback contract', async () => {
    const f = fixture();
    const event = {
      id: 'evt_recovered',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_recovered',
          mode: 'payment',
          client_reference_id: user,
          payment_status: 'paid',
          payment_intent: 'pi_recovered',
          amount_total: 999,
          currency: 'usd',
          metadata: { product_scope: 'siskill', order_id: id, sku: f.order.sku }
        }
      }
    } as unknown as Stripe.Event;
    await processStripeEvent(event, f.deps);
    expect(f.db.rpc).toHaveBeenCalledWith('siskill_bind_checkout', {
      p_order: id,
      p_checkout_id: 'cs_recovered',
      p_url: null
    });
    expect(f.db.rpc).toHaveBeenCalledWith(
      'siskill_apply_payment',
      expect.objectContaining({ p_checkout: 'cs_recovered' })
    );
    const bad = fixture();
    (event.data.object as Stripe.Checkout.Session).amount_total = 1;
    await expect(processStripeEvent(event, bad.deps)).rejects.toThrow(
      'PAYMENT_MISMATCH'
    );
    expect(bad.db.rpc).not.toHaveBeenCalled();
  });
  it('ignores WebToMind events rather than interpreting them as SiSkill purchases', async () => {
    const f = fixture();
    await processStripeEvent(
      {
        type: 'checkout.session.completed',
        data: {
          object: { metadata: { product_scope: 'webtomind', order_id: id } }
        }
      } as unknown as Stripe.Event,
      f.deps
    );
    expect(f.db.from).not.toHaveBeenCalled();
    expect(f.db.rpc).not.toHaveBeenCalled();
  });
  it('verifies a real local Stripe signature before processing a webhook', async () => {
    const f = fixture();
    f.env.SISKILL_STRIPE_SECRET_KEY = 'sk_test_local_only';
    const stripe = new Stripe('sk_test_local_only');
    const payload = JSON.stringify({
      id: 'evt_1',
      type: 'checkout.session.completed',
      livemode: false,
      data: { object: { metadata: { product_scope: 'webtomind' } } }
    });
    const signature = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: 'whsec_local'
    });
    const request = new Request(
      'https://siskill.dev/api/siskill/stripe-webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': signature },
        body: payload
      }
    );
    expect(
      (await handleCommerce(request, f.env, { ...f.deps, stripe })).status
    ).toBe(200);
    const bad = new Request(request.url, {
      method: 'POST',
      headers: { 'stripe-signature': signature },
      body: payload + ' '
    });
    expect(
      (await handleCommerce(bad, f.env, { ...f.deps, stripe })).status
    ).toBe(400);
  });
  it('accepts restricted live Stripe keys but rejects test/live event crossover', async () => {
    const f = fixture();
    f.env.SISKILL_STRIPE_SECRET_KEY = 'rk_live_local_fixture';
    const stripe = new Stripe('rk_live_local_fixture');
    for (const livemode of [true, false]) {
      const payload = JSON.stringify({
        id: 'evt_mode',
        type: 'checkout.session.completed',
        livemode,
        data: { object: { metadata: { product_scope: 'webtomind' } } }
      });
      const signature = stripe.webhooks.generateTestHeaderString({
        payload,
        secret: 'whsec_local'
      });
      const request = new Request(
        'https://siskill.dev/api/siskill/stripe-webhook',
        {
          method: 'POST',
          headers: { 'stripe-signature': signature },
          body: payload
        }
      );
      expect(
        (await handleCommerce(request, f.env, { ...f.deps, stripe })).status
      ).toBe(livemode ? 200 : 400);
    }
  });
  it('reuses Alipay signing but binds callback and return to SiSkill', async () => {
    const f = fixture();
    Object.assign(f.order, { provider: 'zpay', amount: 5900, currency: 'cny' });
    f.order.snapshot.locale = 'zh-CN';
    const r = await handleCommerce(
      f.request({ sku: f.order.sku, provider: 'alipay', locale: 'zh-CN' }),
      f.env,
      f.deps
    );
    const body = await r.json();
    expect(body.fields.notify_url).toBe(
      'https://siskill.dev/api/siskill/zpay-notify'
    );
    expect(body.fields.money).toBe('59.00');
    expect(body.fields.return_url).toContain('/zh-CN/account?order=');
    expect(body.fields.sign).toMatch(/^[a-f0-9]{32}$/);
  });
  it('rejects ZPay duplicate parameters before fulfillment', async () => {
    const f = fixture();
    const fields = buildZpayCheckoutFields({
      config: {
        pid: 'merchant',
        key: 'local-signing-key',
        usdToCnyRate: 7,
        submitUrl: 'https://zpayz.cn/submit.php'
      },
      orderId: id,
      productName: 'SiSkill',
      cnyCents: 5900,
      notifyUrl: 'https://siskill.dev/api/siskill/zpay-notify',
      returnUrl: 'https://siskill.dev/en-US/account'
    });
    const url = new URL('https://siskill.dev/api/siskill/zpay-notify');
    url.search = new URLSearchParams(fields).toString() + '&money=1.00';
    expect((await handleCommerce(new Request(url), f.env, f.deps)).status).toBe(
      400
    );
    expect(f.db.rpc).not.toHaveBeenCalled();
  });
  it('denies downloads without a SiSkill grant even when identity is valid', async () => {
    const f = fixture();
    f.row.data = null;
    const r = await handleCommerce(
      new Request(`https://siskill.dev/api/siskill/downloads/${id}`, {
        headers: { Authorization: 'Bearer user-token' }
      }),
      f.env,
      f.deps
    );
    expect(r.status).toBe(403);
    expect(f.db.from).toHaveBeenCalledWith('siskill_grants');
    expect(f.env.SISKILL_PACKAGES!.get).not.toHaveBeenCalled();
  });
  it('streams only owned, published, checksum-matched releases without disclosing storage keys', async () => {
    const f = fixture();
    f.row.data = {
      release_id: id,
      siskill_releases: {
        slug: 'carousel',
        version: '1.0.0',
        object_key: 'siskill/carousel/1.0.0.tar.gz',
        sha256: 'a'.repeat(64),
        bytes: 1000,
        status: 'published'
      }
    };
    const r = await handleCommerce(
      new Request(`https://siskill.dev/api/siskill/downloads/${id}`, {
        headers: { Authorization: 'Bearer user-token' }
      }),
      f.env,
      f.deps
    );
    expect(r.status).toBe(200);
    expect(r.headers.get('Cache-Control')).toBe('private, no-store');
    expect(r.headers.get('Content-Disposition')).toContain(
      'carousel-1.0.0.tar.gz'
    );
    expect((await r.arrayBuffer()).byteLength).toBe(1000);
    expect(f.query.eq).toHaveBeenCalledWith('user_id', user);
  });
});
