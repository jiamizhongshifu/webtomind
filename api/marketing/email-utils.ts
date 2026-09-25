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

export interface PromptCase {
  id: string;
  title?: string | null;
  slug?: string | null;
  image_url?: string | null;
  image_urls?: string[] | null;
  prompt?: string | null;
  category?: string | null;
  tags?: string[] | null;
  generate_count?: number | null;
  copy_count?: number | null;
  view_count?: number | null;
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
  campaign_key: string | null;
  status: 'queued' | 'sending' | 'sent' | 'failed';
  attempts: number;
  attempt_count?: number | null;
  leased_until?: string | null;
  next_attempt_at?: string | null;
  metadata: Record<string, unknown> | null;
}

export interface EmailContent {
  subject: string;
  previewText: string;
  title: string;
  intro: string;
  bodyHtml: string;
  textBody: string;
  ctaLabel: string;
  ctaUrl: string;
  heroImageUrl?: string | null;
}

type HeaderSource =
  | Headers
  | Record<string, string | string[] | undefined>
  | undefined;

const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;
const MARKETING_ASSET_BUCKET = 'marketing-email-assets';

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

export function beijingDateKey(date = new Date()): string {
  return new Date(date.getTime() + BEIJING_OFFSET_MS)
    .toISOString()
    .slice(0, 10);
}

export function beijingWeekday(date = new Date()): number {
  return new Date(date.getTime() + BEIJING_OFFSET_MS).getUTCDay();
}

export function parseWeekdays(
  value: string | undefined,
  fallback: number[]
): number[] {
  if (!value) return fallback;
  const parsed = value
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isInteger(item) && item >= 0 && item <= 6);
  return parsed.length > 0 ? parsed : fallback;
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

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildUnsubscribeUrl(token: string): string {
  return `${getSiteUrl()}/api/marketing/unsubscribe?token=${encodeURIComponent(token)}`;
}

export function renderEmailLayout(
  content: EmailContent,
  unsubscribeUrl: string
): string {
  const hero = content.heroImageUrl
    ? `<img src="${escapeHtml(content.heroImageUrl)}" alt="" style="display:block;width:100%;max-width:640px;border-radius:18px;margin:0 0 24px;border:1px solid #dbe5ff;" />`
    : '';

  return `<!doctype html>
<html>
  <body style="margin:0;background:#f4f7ff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,'PingFang SC','Microsoft YaHei',sans-serif;color:#111827;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(content.previewText)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f7ff;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;background:#ffffff;border:1px solid #dbe5ff;border-radius:24px;overflow:hidden;box-shadow:0 18px 48px rgba(17,24,39,.10);">
            <tr>
              <td>
                <div style="background:linear-gradient(135deg,#0048ff 0%,#ff3ccf 56%,#d8ff2e 100%);padding:6px;"></div>
                <div style="padding:34px 30px 30px;">
                  <p style="margin:0 0 14px;font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#0048ff;">WebToMind Visual Prompt OS</p>
                  ${hero}
                  <h1 style="font-size:34px;line-height:1.12;margin:0 0 16px;color:#0f172a;">${escapeHtml(content.title)}</h1>
                  <p style="font-size:16px;line-height:1.75;margin:0 0 24px;color:#334155;">${escapeHtml(content.intro)}</p>
                  <div style="font-size:15px;line-height:1.7;color:#334155;">${content.bodyHtml}</div>
                  <p style="margin:28px 0 30px;">
                    <a href="${escapeHtml(content.ctaUrl)}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;font-weight:800;border-radius:999px;padding:14px 22px;box-shadow:6px 6px 0 #d8ff2e;">${escapeHtml(content.ctaLabel)}</a>
                  </p>
                  <p style="margin:0 0 12px;border-top:1px solid #e2e8f0;padding-top:18px;font-size:14px;line-height:1.7;color:#64748b;">我们只会发送 WebToMind 精选案例、热门 Prompt 和产品更新；如果暂时不需要，可以随时退订。</p>
                  <p style="margin:0 0 14px;font-size:14px;line-height:1.7;color:#64748b;">We will only send WebToMind case digests and product updates. You can unsubscribe anytime.</p>
                  <p style="margin:0;font-size:13px;line-height:1.7;color:#64748b;">
                    <a href="${escapeHtml(unsubscribeUrl)}" style="color:#334155;text-decoration:underline;">退订邮件 / Unsubscribe</a>
                  </p>
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
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

export function normalizeImageUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is string => typeof item === 'string' && item.length > 0
  );
}

export function pickPromptCaseImage(item: PromptCase): string | null {
  const urls = normalizeImageUrls(item.image_urls);
  return item.image_url || urls[0] || null;
}

function decodeBase64ToBytes(value: string): Uint8Array {
  const binary = atob(value.replace(/\s/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export async function generateMarketingHeroImage(
  supabase: SupabaseClient,
  campaignKey: string,
  prompt: string
): Promise<string | null> {
  if (process.env.MARKETING_EMAIL_GENERATE_IMAGES === 'false') {
    return null;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return null;
  }

  const model =
    process.env.MARKETING_EMAIL_IMAGE_MODEL ||
    process.env.OPENAI_IMAGE_MODEL ||
    'gpt-image-2';

  try {
    const response = await fetch(
      'https://api.openai.com/v1/images/generations',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          prompt,
          size: process.env.MARKETING_EMAIL_IMAGE_SIZE || '1536x1024',
          quality: process.env.MARKETING_EMAIL_IMAGE_QUALITY || 'auto',
          output_format: 'png',
          n: 1
        })
      }
    );

    const data = (await response.json().catch(() => ({}))) as {
      data?: Array<{ b64_json?: string; url?: string }>;
      error?: { message?: string };
    };

    if (!response.ok) {
      console.warn('[MarketingEmail] GPT Image 2 generation failed:', {
        status: response.status,
        error: data.error?.message
      });
      return null;
    }

    const firstImage = data.data?.[0];
    let bytes: Uint8Array | null = null;
    if (firstImage?.b64_json) {
      bytes = decodeBase64ToBytes(firstImage.b64_json);
    } else if (firstImage?.url) {
      const imageResponse = await fetch(firstImage.url);
      if (imageResponse.ok) {
        bytes = new Uint8Array(await imageResponse.arrayBuffer());
      }
    }

    if (!bytes) return null;

    const path = `${campaignKey.replace(/[^a-z0-9_-]/gi, '-')}/${Date.now()}.png`;
    const { error: uploadError } = await supabase.storage
      .from(MARKETING_ASSET_BUCKET)
      .upload(path, bytes, {
        contentType: 'image/png',
        upsert: true
      });

    if (uploadError) {
      console.warn('[MarketingEmail] hero upload failed:', uploadError.message);
      return null;
    }

    const { data: publicUrl } = supabase.storage
      .from(MARKETING_ASSET_BUCKET)
      .getPublicUrl(path);

    return publicUrl.publicUrl || null;
  } catch (error) {
    console.warn('[MarketingEmail] hero generation skipped:', error);
    return null;
  }
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
