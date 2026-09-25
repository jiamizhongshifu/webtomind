import { getSupabaseAdmin } from './email-worker-utils.js';

export const config = {
  runtime: 'edge'
};

export const RESEND_EMAIL_EVENTS = [
  'email.sent',
  'email.delivered',
  'email.delivery_delayed',
  'email.opened',
  'email.clicked',
  'email.bounced',
  'email.complained',
  'email.failed'
] as const;

type ResendEmailEvent = (typeof RESEND_EMAIL_EVENTS)[number];

type ResendWebhookPayload = {
  type?: string;
  created_at?: string;
  data?: {
    email_id?: string;
    created_at?: string;
    subject?: string;
    to?: string[];
    bounce?: {
      type?: string;
      subType?: string;
    };
    failed?: {
      reason?: string;
    };
  };
};

function json(status: number, data: unknown): Response {
  return Response.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store' }
  });
}

function decodeBase64(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    '='
  );
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function constantTimeEqual(left: string, right: string): boolean {
  const maxLength = Math.max(left.length, right.length);
  let mismatch = left.length ^ right.length;
  for (let index = 0; index < maxLength; index += 1) {
    mismatch |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return mismatch === 0;
}

export async function verifyResendWebhookSignature(input: {
  payload: string;
  svixId: string;
  svixTimestamp: string;
  svixSignature: string;
  secret: string;
  nowMs?: number;
}): Promise<boolean> {
  const timestamp = Number(input.svixTimestamp);
  if (!input.svixId || !Number.isFinite(timestamp)) return false;
  const nowSeconds = Math.floor((input.nowMs ?? Date.now()) / 1000);
  if (Math.abs(nowSeconds - timestamp) > 5 * 60) return false;

  const encodedSecret = input.secret.startsWith('whsec_')
    ? input.secret.slice('whsec_'.length)
    : input.secret;
  let secretBytes: Uint8Array;
  try {
    secretBytes = decodeBase64(encodedSecret);
  } catch {
    return false;
  }

  const secretBuffer = new Uint8Array(Array.from(secretBytes)).buffer;
  const key = await crypto.subtle.importKey(
    'raw',
    secretBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signedPayload = `${input.svixId}.${input.svixTimestamp}.${input.payload}`;
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(signedPayload)
  );
  const expected = btoa(String.fromCharCode(...new Uint8Array(signature)));
  return input.svixSignature
    .split(/\s+/)
    .map((part) => part.split(',', 2))
    .some(
      ([version, candidate]) =>
        version === 'v1' &&
        Boolean(candidate) &&
        constantTimeEqual(candidate, expected)
    );
}

function eventDetail(payload: ResendWebhookPayload): Record<string, unknown> {
  const bounce = payload.data?.bounce;
  const failed = payload.data?.failed;
  return {
    bounceType: bounce?.type || null,
    bounceSubType: bounce?.subType || null,
    failedReason: failed?.reason || null
  };
}

function shouldSuppressRecipient(payload: ResendWebhookPayload): boolean {
  if (payload.type === 'email.complained') return true;
  if (payload.type !== 'email.bounced') return false;
  return payload.data?.bounce?.type?.toLowerCase() === 'permanent';
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  try {
    const secret = process.env.RESEND_WEBHOOK_SECRET || '';
    if (!secret) {
      return json(503, { error: 'Resend webhook is not provisioned' });
    }

    const rawBody = await request.text();
    const svixId = request.headers.get('svix-id') || '';
    const svixTimestamp = request.headers.get('svix-timestamp') || '';
    const svixSignature = request.headers.get('svix-signature') || '';
    const verified = await verifyResendWebhookSignature({
      payload: rawBody,
      svixId,
      svixTimestamp,
      svixSignature,
      secret
    });
    if (!verified) {
      return json(400, { error: 'Invalid webhook signature' });
    }

    const payload = JSON.parse(rawBody) as ResendWebhookPayload;
    if (!RESEND_EMAIL_EVENTS.includes(payload.type as ResendEmailEvent)) {
      return json(200, { received: true, ignored: true });
    }

    const occurredAt = new Date(
      payload.created_at || payload.data?.created_at || Date.now()
    );
    if (!payload.data?.email_id || Number.isNaN(occurredAt.getTime())) {
      return json(400, { error: 'Invalid webhook payload' });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.rpc(
      'record_marketing_email_provider_event',
      {
        p_svix_id: svixId,
        p_event_type: payload.type,
        p_provider_message_id: payload.data.email_id,
        p_recipient_email: payload.data.to?.[0] || null,
        p_subject: payload.data.subject || null,
        p_occurred_at: occurredAt.toISOString(),
        p_should_suppress: shouldSuppressRecipient(payload),
        p_event_detail: eventDetail(payload)
      }
    );
    if (error) throw error;

    return json(200, {
      received: true,
      duplicate: data === false
    });
  } catch (error) {
    console.error('[MarketingEmail] Resend webhook failed:', {
      errorName: error instanceof Error ? error.name : 'UnknownError'
    });
    return json(500, { error: 'Webhook processing failed' });
  }
}
