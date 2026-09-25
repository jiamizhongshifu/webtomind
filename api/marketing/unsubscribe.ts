import { createClient } from '@supabase/supabase-js';
import {
  HOMEPAGE_CASE_DIGEST_MARKER_KEY,
  isMissingRelationError,
  readSubscriptionMarkerMetadata
} from './subscription-markers.js';

export const config = {
  runtime: 'edge'
};

function getSiteUrl(): string {
  return (
    process.env.PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.VITE_PUBLIC_SITE_URL ||
    'https://webtomind.com'
  ).replace(/\/+$/, '');
}

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderPage(title: string, message: string): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
  </head>
  <body style="margin:0;background:#f6f4ef;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#17110d;">
    <main style="max-width:640px;margin:80px auto;padding:32px;background:#fffaf0;border:1px solid #e9dfcf;border-radius:16px;">
      <h1 style="margin:0 0 16px;font-size:28px;">${escapeHtml(title)}</h1>
      <p style="font-size:16px;line-height:1.7;color:#3b332b;">${escapeHtml(message)}</p>
      <p><a href="${getSiteUrl()}" style="color:#17110d;font-weight:700;">Back to WebToMind</a></p>
    </main>
  </body>
</html>`;
}

function htmlResponse(status: number, body: string): Response {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'POST') {
    return htmlResponse(
      405,
      renderPage(
        'Method not allowed',
        'This endpoint only accepts unsubscribe requests.'
      )
    );
  }

  const url = new URL(request.url);
  const token = url.searchParams.get('token')?.trim();
  if (!token) {
    return htmlResponse(
      400,
      renderPage('Invalid link', 'The unsubscribe token is missing.')
    );
  }

  try {
    const supabase = getSupabaseAdmin();
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('marketing_email_preferences')
      .update({
        welcome_enabled: false,
        case_digest_enabled: false,
        offer_enabled: false,
        unsubscribed_at: now
      })
      .eq('unsubscribe_token', token);

    if (error) throw error;

    const { error: leadError } = await supabase
      .from('marketing_email_leads')
      .update({
        case_digest_enabled: false,
        offer_enabled: false,
        unsubscribed_at: now
      })
      .eq('unsubscribe_token', token);

    if (leadError && !isMissingRelationError(leadError)) throw leadError;

    await unsubscribeQueueMarker(supabase, token, now);

    return htmlResponse(
      200,
      renderPage(
        'Unsubscribed',
        'You have been unsubscribed from WebToMind marketing emails.'
      )
    );
  } catch (error) {
    console.error('[MarketingEmail] unsubscribe failed:', error);
    return htmlResponse(
      500,
      renderPage(
        'Unsubscribe failed',
        'Please contact support if you keep seeing this error.'
      )
    );
  }
}

async function unsubscribeQueueMarker(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  token: string,
  unsubscribedAt: string
): Promise<void> {
  const { data, error } = await supabase
    .from('marketing_email_queue')
    .select('id,metadata')
    .eq('email_type', 'case_digest')
    .eq('campaign_key', HOMEPAGE_CASE_DIGEST_MARKER_KEY)
    .limit(1000);

  if (error) {
    console.warn(
      '[MarketingEmail] subscription marker unsubscribe lookup failed:',
      error.message
    );
    return;
  }

  const match = (data || []).find((item) => {
    const metadata = readSubscriptionMarkerMetadata(item.metadata);
    return metadata?.unsubscribeToken === token;
  });
  if (!match) return;

  const metadata = readSubscriptionMarkerMetadata(match.metadata);
  if (!metadata) return;

  const { error: updateError } = await supabase
    .from('marketing_email_queue')
    .update({
      metadata: {
        ...metadata,
        caseDigestEnabled: false,
        unsubscribedAt,
        updatedAt: unsubscribedAt
      }
    })
    .eq('id', match.id);

  if (updateError) {
    console.warn(
      '[MarketingEmail] subscription marker unsubscribe update failed:',
      updateError.message
    );
  }
}
