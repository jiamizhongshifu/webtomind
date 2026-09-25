import { beforeEach, describe, expect, it, vi } from 'vitest';

const testState = vi.hoisted(() => ({
  rpc: vi.fn()
}));

vi.mock('../../api/marketing/email-worker-utils.js', () => ({
  getSupabaseAdmin: () => ({ rpc: testState.rpc })
}));

import handler from '../../api/marketing/resend-webhook';

const signingSecret = `whsec_${btoa('webtomind-resend-test-secret')}`;

async function signedRequest(payload: Record<string, unknown>) {
  const body = JSON.stringify(payload);
  const svixId = 'msg_test_webhook';
  const svixTimestamp = String(Math.floor(Date.now() / 1000));
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode('webtomind-resend-test-secret'),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${svixId}.${svixTimestamp}.${body}`)
  );
  const encodedSignature = btoa(
    String.fromCharCode(...new Uint8Array(signature))
  );

  return new Request('https://webtomind.test/api/marketing/resend-webhook', {
    method: 'POST',
    headers: {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': `v1,${encodedSignature}`
    },
    body
  });
}

describe('/api/marketing/resend-webhook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RESEND_WEBHOOK_SECRET = signingSecret;
    testState.rpc.mockResolvedValue({ data: true, error: null });
  });

  it('fails closed when the signing secret is missing', async () => {
    delete process.env.RESEND_WEBHOOK_SECRET;

    const response = await handler(
      new Request('https://webtomind.test/api/marketing/resend-webhook', {
        method: 'POST',
        body: '{}'
      })
    );

    expect(response.status).toBe(503);
    expect(testState.rpc).not.toHaveBeenCalled();
  });

  it('rejects unsigned payloads before writing an event', async () => {
    const response = await handler(
      new Request('https://webtomind.test/api/marketing/resend-webhook', {
        method: 'POST',
        body: '{}'
      })
    );

    expect(response.status).toBe(400);
    expect(testState.rpc).not.toHaveBeenCalled();
  });

  it('suppresses the supplied recipient on a verified permanent bounce', async () => {
    const request = await signedRequest({
      type: 'email.bounced',
      created_at: '2026-08-05T06:30:00.000Z',
      data: {
        email_id: 'resend-message-without-queue-row',
        to: ['Recipient@Example.com'],
        subject: 'A delivery that raced persistence',
        bounce: { type: 'Permanent' }
      }
    });

    const response = await handler(request);

    expect(response.status).toBe(200);
    expect(testState.rpc).toHaveBeenCalledWith(
      'record_marketing_email_provider_event',
      expect.objectContaining({
        p_provider_message_id: 'resend-message-without-queue-row',
        p_recipient_email: 'Recipient@Example.com',
        p_should_suppress: true
      })
    );
  });
});
