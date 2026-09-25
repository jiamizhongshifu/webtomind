import { createClient, SupabaseClient } from '@supabase/supabase-js';

export type MarketingEmailType = 'welcome' | 'case_digest' | 'limited_offer';
export type Locale = 'zh-CN' | 'en-US';

export interface MarketingEmailPreference {
  user_id: string | null;
  email: string;
  locale: Locale;
  unsubscribe_token: string;
  welcome_enabled: boolean;
  case_digest_enabled: boolean;
  offer_enabled: boolean;
  unsubscribed_at: string | null;
}

export interface QueuedEmail {
  id: string;
  user_id: string | null;
  recipient_email: string;
  email_type: MarketingEmailType;
  subject: string;
  preview_text: string | null;
  html: string;
  text_body: string;
  cta_url?: string | null;
  campaign_key: string | null;
  status: 'queued' | 'sending' | 'sent' | 'failed';
  attempts: number;
  attempt_count?: number | null;
  leased_until?: string | null;
  next_attempt_at?: string | null;
  metadata: Record<string, unknown> | null;
}

export type ResendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

type HeaderSource =
  | Headers
  | Record<string, string | string[] | undefined>
  | undefined;

export function getSiteUrl(): string {
  return (
    process.env.PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.VITE_PUBLIC_SITE_URL ||
    'https://webtomind.com'
  ).replace(/\/+$/, '');
}

export function getSupabaseAdmin(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

function getHeader(headers: HeaderSource, name: string): string {
  if (!headers) return '';
  if (headers instanceof Headers) return headers.get(name) || '';
  const value = headers[name] || headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] || '' : value || '';
}

export function isAuthorizedCronRequest(request: {
  headers: HeaderSource;
  url?: string;
}): boolean {
  const secret = process.env.CRON_SECRET;
  const authHeader = getHeader(request.headers, 'authorization');
  const headerSecret = getHeader(request.headers, 'x-cron-secret');
  const bearerSecret = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : '';
  const urlSecret = request.url
    ? new URL(request.url, getSiteUrl()).searchParams.get('secret') || ''
    : '';

  if (secret) {
    return (
      bearerSecret === secret || headerSecret === secret || urlSecret === secret
    );
  }

  const userAgent = getHeader(request.headers, 'user-agent');
  if (process.env.VERCEL === '1' && /vercel-cron/i.test(userAgent)) {
    return true;
  }

  return !secret && process.env.NODE_ENV !== 'production';
}

export function getEnvInt(
  name: string,
  fallback: number,
  min: number,
  max: number
): number {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

export function isMarketingEmailTypeEnabled(
  preference: MarketingEmailPreference,
  type: MarketingEmailType
): boolean {
  if (preference.unsubscribed_at) return false;

  switch (type) {
    case 'welcome':
      return preference.welcome_enabled;
    case 'case_digest':
      return preference.case_digest_enabled;
    case 'limited_offer':
      return preference.offer_enabled;
    default:
      return false;
  }
}

export function buildUnsubscribeUrl(token: string): string {
  return `${getSiteUrl()}/api/marketing/unsubscribe?token=${encodeURIComponent(token)}`;
}

export function fillEmailPlaceholders(
  html: string,
  textBody: string,
  unsubscribeUrl: string
): { html: string; textBody: string } {
  return {
    html: html.replace(/\{\{unsubscribe_url\}\}/g, unsubscribeUrl),
    textBody: `${textBody}\n\nUnsubscribe: ${unsubscribeUrl}`
  };
}

export async function sendViaResend(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<{ id?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from =
    process.env.MARKETING_EMAIL_FROM || 'WebToMind <hello@webtomind.com>';
  if (!apiKey) {
    throw new Error('RESEND_API_KEY is not configured');
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text
    })
  });

  const data = (await response.json().catch(() => ({}))) as {
    id?: string;
    message?: string;
    error?: string;
  };

  if (!response.ok) {
    throw new Error(
      data.message || data.error || `Resend failed: ${response.status}`
    );
  }

  return { id: data.id };
}

export async function sendBatchViaResend(
  inputs: ResendEmailInput[],
  idempotencyKey: string
): Promise<Array<{ id?: string }>> {
  const apiKey = process.env.RESEND_API_KEY;
  const from =
    process.env.MARKETING_EMAIL_FROM || 'WebToMind <hello@webtomind.com>';
  if (!apiKey) {
    throw new Error('RESEND_API_KEY is not configured');
  }
  if (inputs.length < 1 || inputs.length > 100) {
    throw new Error('Resend batch must contain between 1 and 100 emails');
  }

  const response = await fetch('https://api.resend.com/emails/batch', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey
    },
    body: JSON.stringify(
      inputs.map((input) => ({
        from,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text
      }))
    )
  });

  const payload = (await response.json().catch(() => ({}))) as {
    data?: Array<{ id?: string }>;
    message?: string;
    error?: string | { message?: string };
  };
  if (!response.ok) {
    const nestedError =
      typeof payload.error === 'object' ? payload.error.message : payload.error;
    throw new Error(
      payload.message ||
        nestedError ||
        `Resend batch failed: ${response.status}`
    );
  }
  if (!Array.isArray(payload.data) || payload.data.length !== inputs.length) {
    throw new Error('Resend batch returned an unexpected result count');
  }
  return payload.data;
}
