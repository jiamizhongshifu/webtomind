import fs from 'node:fs/promises';
import path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { chromium, type Browser, type Page } from 'playwright';
import Stripe from 'stripe';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import checkoutHandler from '../../api/membership/checkout';
import webhookHandler from '../../api/membership/webhook';

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

interface SmokeConversionEvent {
  event_name: string;
  event_source?: string | null;
  order_id?: string | null;
  product_id?: string | null;
  cta_source?: string | null;
  occurred_at?: string | null;
  metadata?: Record<string, string | null | undefined> | null;
}

async function fillIfPresent(page: Page, selector: string, value: string) {
  const locator = page.locator(selector);
  if ((await locator.count()) === 0) return false;
  await locator.first().fill(value);
  return true;
}

async function completeStripeCheckout(url: string) {
  const browser: Browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page
      .waitForLoadState('networkidle', { timeout: 30_000 })
      .catch(() => {});

    await page
      .locator('input[name="cardNumber"], [autocomplete="cc-number"]')
      .first()
      .fill('4242424242424242', { timeout: 45_000 });
    await fillIfPresent(
      page,
      'input[name="cardExpiry"], [autocomplete="cc-exp"]',
      '1234'
    );
    await fillIfPresent(
      page,
      'input[name="cardCvc"], [autocomplete="cc-csc"]',
      '123'
    );
    await fillIfPresent(
      page,
      'input[name="billingName"], [autocomplete="cc-name"]',
      'WebToMind Smoke'
    );
    await fillIfPresent(
      page,
      'input[name="billingPostalCode"], [autocomplete="postal-code"]',
      '10001'
    );
    await fillIfPresent(
      page,
      'input[type="tel"], input[name="phoneNumber"]',
      '2015550123'
    );

    const submit = page.locator('button[type="submit"]');
    await submit.first().click({ timeout: 30_000 });
    try {
      await page.waitForURL(
        /codexCheckoutSmoke=success|payment=success|webtomind\.com/,
        {
          timeout: 120_000
        }
      );
    } catch (error) {
      const outDir = path.join(ROOT, 'outputs', 'checkout-smoke');
      await fs.mkdir(outDir, { recursive: true });
      await page.screenshot({
        path: path.join(outDir, 'stripe-testmode-checkout-failure.png'),
        fullPage: true
      });
      const visibleText = await page
        .locator('body')
        .innerText({ timeout: 5_000 })
        .catch(() => '');
      await fs.writeFile(
        path.join(outDir, 'stripe-testmode-checkout-failure.json'),
        JSON.stringify(
          {
            url: page.url(),
            title: await page.title().catch(() => ''),
            text: visibleText.slice(0, 4000)
          },
          null,
          2
        )
      );
      throw error;
    }
    return page.url();
  } finally {
    await browser.close();
  }
}

const RUN_SMOKE = process.env.RUN_PAYMENT_CHECKOUT_TESTMODE_SMOKE === '1';
const ROOT = path.resolve(__dirname, '..', '..');

describe.skipIf(!RUN_SMOKE)(
  'membership checkout Stripe test-mode smoke',
  () => {
    let supabase: SupabaseClient;
    let stripe: Stripe;
    let userId: string | null = null;
    let orderId: string | null = null;
    let subscriptionId: string | null = null;
    let marker = '';

    beforeAll(async () => {
      await loadEnvFile(path.join(ROOT, '.env'));
      await loadEnvFile(path.join(ROOT, '.env.local'));

      if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
      }
      if (
        !process.env.SUPABASE_ANON_KEY &&
        !process.env.VITE_SUPABASE_ANON_KEY
      ) {
        throw new Error('Missing SUPABASE_ANON_KEY or VITE_SUPABASE_ANON_KEY');
      }
      if (!process.env.STRIPE_SECRET_KEY_TEST) {
        throw new Error('Missing STRIPE_SECRET_KEY_TEST');
      }
      if (!process.env.STRIPE_WEBHOOK_SECRET_TEST) {
        throw new Error('Missing STRIPE_WEBHOOK_SECRET_TEST');
      }

      process.env.STRIPE_MODE = 'test';
      delete process.env.STRIPE_SECRET_KEY;
      delete process.env.STRIPE_WEBHOOK_SECRET;
      process.env.SUPABASE_ANON_KEY =
        process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
      process.env.APP_URL = 'https://webtomind.com';

      supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        { auth: { persistSession: false } }
      );
      stripe = new Stripe(process.env.STRIPE_SECRET_KEY_TEST, {
        apiVersion: '2026-06-24.dahlia'
      });
    });

    afterAll(async () => {
      if (subscriptionId) {
        await stripe.subscriptions
          .cancel(subscriptionId)
          .catch(() => undefined);
      }
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

    it('creates a test checkout session, completes card payment, and fulfills through webhook', async () => {
      marker = `codex_testmode_checkout_${Date.now()}`;
      const email = `${marker}@example.com`;
      const password = `Smoke-${marker}`;
      const created = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { source: marker }
      });
      expect(created.error).toBeNull();
      userId = created.data.user?.id || null;
      expect(userId).toBeTruthy();
      const smokeUserId = userId!;

      const anon = createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_ANON_KEY!,
        { auth: { persistSession: false } }
      );
      const signedIn = await anon.auth.signInWithPassword({ email, password });
      expect(signedIn.error).toBeNull();
      const token = signedIn.data.session?.access_token;
      expect(token).toBeTruthy();

      const pricingResponse = await fetch(
        'https://webtomind.test/api/analytics/conversion-event',
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` }
        }
      ).catch(() => null);
      expect(pricingResponse).toBeNull();

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

      const checkoutResponse = await checkoutHandler(
        new Request('https://webtomind.test/api/membership/checkout', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            type: 'subscription',
            id: 'pro',
            billingCycle: 'monthly',
            ctaSource: marker,
            successUrl:
              'https://webtomind.com/pricing?codexCheckoutSmoke=success',
            cancelUrl:
              'https://webtomind.com/pricing?codexCheckoutSmoke=cancel',
            pageLocation: `https://webtomind.com/pricing?source=${marker}`,
            pageReferrer: 'codex-testmode-smoke',
            utm: {
              utm_source: 'codex',
              utm_medium: 'smoke',
              utm_campaign: 'stripe_testmode_checkout'
            }
          })
        })
      );
      expect(checkoutResponse.status).toBe(200);
      const checkout = (await checkoutResponse.json()) as {
        id: string;
        sessionId: string;
        url: string;
      };
      expect(checkout.sessionId).toMatch(/^cs_test_/);
      expect(checkout.url).toContain('checkout.stripe.com');
      orderId = checkout.id;

      const finalUrl = await completeStripeCheckout(checkout.url);
      expect(finalUrl).toContain('codexCheckoutSmoke=success');

      const session = await stripe.checkout.sessions.retrieve(
        checkout.sessionId
      );
      expect(session.status).toBe('complete');
      expect(session.payment_status).toBe('paid');
      subscriptionId =
        typeof session.subscription === 'string' ? session.subscription : null;
      expect(subscriptionId).toBeTruthy();

      const rawBody = JSON.stringify({
        id: `evt_test_${marker}`,
        object: 'event',
        api_version: '2024-11-20.acacia',
        created: Math.floor(Date.now() / 1000),
        data: { object: session },
        livemode: false,
        pending_webhooks: 1,
        request: { id: null, idempotency_key: null },
        type: 'checkout.session.completed'
      });
      const signature = stripe.webhooks.generateTestHeaderString({
        payload: rawBody,
        secret: process.env.STRIPE_WEBHOOK_SECRET_TEST!
      });
      const webhookResponse = await webhookHandler(
        new Request('https://webtomind.test/api/membership/webhook', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'stripe-signature': signature
          },
          body: rawBody
        })
      );
      expect(webhookResponse.status).toBe(200);

      const [orderResult, eventsResult, creditsResult] = await Promise.all([
        supabase
          .from('payment_orders')
          .select('id,status,product_id,amount,currency,provider_order_id')
          .eq('id', orderId)
          .single(),
        supabase
          .from('conversion_events')
          .select(
            'event_name,event_source,order_id,product_id,cta_source,metadata,occurred_at'
          )
          .or(`user_id.eq.${smokeUserId},order_id.eq.${orderId}`)
          .order('occurred_at', { ascending: true }),
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

      const outDir = path.join(ROOT, 'outputs', 'checkout-smoke');
      await fs.mkdir(outDir, { recursive: true });
      await fs.writeFile(
        path.join(outDir, 'stripe-testmode-checkout-smoke.json'),
        JSON.stringify(
          {
            marker,
            order: orderResult.data,
            stripe: {
              sessionId: checkout.sessionId,
              sessionStatus: session.status,
              paymentStatus: session.payment_status,
              subscriptionId
            },
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
    }, 180_000);
  }
);
