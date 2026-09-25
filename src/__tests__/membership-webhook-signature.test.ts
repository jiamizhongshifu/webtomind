import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import handler from '../../api/membership/webhook';

const ORIGINAL_ENV = { ...process.env };

describe('membership webhook signature validation', () => {
  beforeEach(() => {
    process.env = {
      ...ORIGINAL_ENV,
      STRIPE_SECRET_KEY: 'sk_test_codex_signature_validation',
      STRIPE_WEBHOOK_SECRET: 'whsec_codex_valid_signature_secret',
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'codex-service-role-key'
    };
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('returns 400 for invalid Stripe signatures instead of reporting a server error', async () => {
    const response = await handler(
      new Request('https://webtomind.test/api/membership/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'stripe-signature': 't=1800000000,v1=invalid-signature'
        },
        body: JSON.stringify({ id: 'evt_invalid_signature' })
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Invalid stripe-signature'
    });
  });
});
