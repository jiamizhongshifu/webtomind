import fs from 'node:fs/promises';
import path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import handler from '../../api/membership/webhook';

async function fileExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function loadEnvFile(filePath: string) {
  if (!(await fileExists(filePath))) return;
  const text = await fs.readFile(filePath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue
      .replace(/^['"]|['"]$/g, '')
      .replace(/\\n/g, '\n');
  }
}

const RUN_SMOKE = process.env.RUN_PAYMENT_WEBHOOK_SMOKE === '1';
const ROOT = path.resolve(__dirname, '..', '..');
const WEBHOOK_SECRET = 'whsec_codex_local_payment_smoke';

interface SmokeConversionEvent {
  event_name: string;
  event_source?: string | null;
  order_id?: string | null;
  product_id?: string | null;
  cta_source?: string | null;
  occurred_at?: string | null;
  metadata?: Record<string, string | null | undefined> | null;
}

describe.skipIf(!RUN_SMOKE)('membership webhook payment smoke', () => {
  let supabase: SupabaseClient;
  let userId: string | null = null;
  let orderId: string | null = null;
  let marker = '';

  beforeAll(async () => {
    await loadEnvFile(path.join(ROOT, '.env'));
    await loadEnvFile(path.join(ROOT, '.env.local'));

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    }

    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    process.env.STRIPE_SECRET_KEY_TEST =
      process.env.STRIPE_SECRET_KEY_TEST || 'sk_test_codex_local_payment_smoke';
    process.env.STRIPE_WEBHOOK_SECRET_TEST = WEBHOOK_SECRET;

    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    );
  });

  afterAll(async () => {
    if (!supabase || !userId) return;
    await supabase
      .from('conversion_events')
      .delete()
      .or(`user_id.eq.${userId}${orderId ? `,order_id.eq.${orderId}` : ''}`);
    await supabase.from('credit_transactions').delete().eq('user_id', userId);
    await supabase.from('user_subscriptions').delete().eq('user_id', userId);
    await supabase.from('payment_orders').delete().eq('user_id', userId);
    await supabase.from('user_credits').delete().eq('user_id', userId);
    await supabase.auth.admin.deleteUser(userId);
  });

  it('marks a paid Pro checkout order as succeeded and records durable events', async () => {
    marker = `codex_synthetic_payment_smoke_${Date.now()}`;
    const email = `${marker}@example.com`;
    const created = await supabase.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { source: marker }
    });
    expect(created.error).toBeNull();
    userId = created.data.user?.id || null;
    expect(userId).toBeTruthy();
    const smokeUserId = userId!;

    await supabase.from('conversion_events').insert([
      {
        event_name: 'pricing_cta_click',
        event_source: 'web_client',
        user_id: smokeUserId,
        product_type: 'subscription',
        product_id: 'pro',
        cta_source: marker,
        idempotency_key: `${marker}:pricing_cta_click`
      }
    ]);

    const insertedOrder = await supabase
      .from('payment_orders')
      .insert({
        user_id: smokeUserId,
        amount: 2000,
        currency: 'usd',
        status: 'pending',
        provider: 'stripe',
        provider_order_id: `cs_test_${marker}`,
        product_type: 'subscription',
        product_id: 'pro',
        metadata: {
          billingCycle: 'monthly',
          productName: 'pro',
          checkout_attribution: {
            cta_source: marker,
            return_to: '/pricing?codexSyntheticPaymentSmoke=1'
          }
        }
      })
      .select('id')
      .single();
    expect(insertedOrder.error).toBeNull();
    orderId = insertedOrder.data?.id || null;
    expect(orderId).toBeTruthy();
    const smokeOrderId = orderId!;

    await supabase.from('conversion_events').insert([
      {
        event_name: 'checkout_start',
        event_source: 'checkout_api',
        user_id: smokeUserId,
        order_id: smokeOrderId,
        entity_type: 'payment_order',
        entity_id: smokeOrderId,
        product_type: 'subscription',
        product_id: 'pro',
        cta_source: marker,
        idempotency_key: `${marker}:checkout_start`
      }
    ]);

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY_TEST!, {
      apiVersion: '2026-06-24.dahlia'
    });
    const rawBody = JSON.stringify({
      id: `evt_test_${marker}`,
      object: 'event',
      api_version: '2024-11-20.acacia',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: `cs_test_${marker}`,
          object: 'checkout.session',
          amount_total: 2000,
          currency: 'usd',
          client_reference_id: smokeUserId,
          customer: `cus_test_${marker.slice(-16)}`,
          livemode: false,
          metadata: {
            order_id: smokeOrderId,
            user_id: smokeUserId,
            product_type: 'subscription',
            product_id: 'pro',
            checkout_source: marker
          },
          mode: 'subscription',
          payment_status: 'paid',
          status: 'complete',
          subscription: `sub_test_${marker}`
        }
      },
      livemode: false,
      pending_webhooks: 1,
      request: { id: null, idempotency_key: null },
      type: 'checkout.session.completed'
    });
    const signature = stripe.webhooks.generateTestHeaderString({
      payload: rawBody,
      secret: WEBHOOK_SECRET
    });

    const response = await handler(
      new Request('https://webtomind.test/api/membership/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'stripe-signature': signature
        },
        body: rawBody
      })
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });

    const [orderResult, eventsResult, subscriptionResult, creditsResult] =
      await Promise.all([
        supabase
          .from('payment_orders')
          .select('id,status,product_id,amount,currency,provider_order_id')
          .eq('id', smokeOrderId)
          .single(),
        supabase
          .from('conversion_events')
          .select(
            'event_name,event_source,order_id,product_id,cta_source,metadata,occurred_at'
          )
          .or(`user_id.eq.${smokeUserId},order_id.eq.${smokeOrderId}`)
          .order('occurred_at', { ascending: true }),
        supabase
          .from('user_subscriptions')
          .select('user_id,plan_id,status,billing_cycle,stripe_subscription_id')
          .eq('user_id', smokeUserId)
          .single(),
        supabase
          .from('user_credits')
          .select(
            'media_credits,promo_media_credits,bonus_credits,subscription_credits'
          )
          .eq('user_id', smokeUserId)
          .single()
      ]);

    expect(orderResult.error).toBeNull();
    expect(orderResult.data?.status).toBe('succeeded');
    expect(subscriptionResult.error).toBeNull();
    expect(subscriptionResult.data).toMatchObject({
      user_id: smokeUserId,
      plan_id: 'pro',
      status: 'active',
      billing_cycle: 'monthly'
    });
    expect(creditsResult.error).toBeNull();
    expect(Number(creditsResult.data?.media_credits || 0)).toBe(0);
    expect(
      Number(creditsResult.data?.subscription_credits || 0)
    ).toBeGreaterThanOrEqual(2000);

    const events = (eventsResult.data || []) as SmokeConversionEvent[];
    expect(events.map((event) => event.event_name)).toEqual(
      expect.arrayContaining([
        'pricing_cta_click',
        'checkout_start',
        'purchase_webhook_succeeded'
      ])
    );
    const purchaseEvent = events.find(
      (event) => event.event_name === 'purchase_webhook_succeeded'
    );
    expect(purchaseEvent).toMatchObject({
      event_source: 'stripe_webhook',
      order_id: smokeOrderId,
      product_id: 'pro',
      cta_source: marker
    });

    const outDir = path.join(ROOT, 'outputs', 'checkout-smoke');
    await fs.mkdir(outDir, { recursive: true });
    await fs.writeFile(
      path.join(outDir, 'synthetic-payment-webhook-smoke.json'),
      JSON.stringify(
        {
          marker,
          order: orderResult.data,
          subscription: subscriptionResult.data,
          events: events.map((event) => ({
            event_name: event.event_name,
            event_source: event.event_source,
            order_id: event.order_id,
            product_id: event.product_id,
            cta_source: event.cta_source,
            stripe_event_id: event.metadata?.stripe_event_id || null,
            session_status: event.metadata?.session_status || null,
            payment_status: event.metadata?.payment_status || null,
            occurred_at: event.occurred_at
          }))
        },
        null,
        2
      )
    );
  }, 60_000);
});
