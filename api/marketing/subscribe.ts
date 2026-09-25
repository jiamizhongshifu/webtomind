import { getSupabaseAdmin } from './email-worker-utils.js';
import {
  createSubscriptionToken,
  HOMEPAGE_CASE_DIGEST_MARKER_KEY,
  isMissingRelationError,
  normalizeMarketingLocale,
  readSubscriptionMarkerMetadata
} from './subscription-markers.js';

export const config = {
  runtime: 'edge'
};

type SubscribeBody = {
  email?: unknown;
  locale?: unknown;
  source?: unknown;
};

type SubscribeStatus = 'subscribed' | 'already_subscribed';

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

function normalizeEmail(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizeSource(value: unknown): string {
  const source = String(value || 'home_hot_cases')
    .trim()
    .replace(/[^\w:-]/g, '_')
    .slice(0, 64);
  return source || 'home_hot_cases';
}

async function upsertLeadSubscription(input: {
  email: string;
  locale: 'zh-CN' | 'en-US';
  source: string;
}): Promise<SubscribeStatus> {
  const supabase = getSupabaseAdmin();
  const { data: existing, error: existingError } = await supabase
    .from('marketing_email_leads')
    .select('email,case_digest_enabled,unsubscribed_at')
    .eq('email', input.email)
    .limit(1)
    .maybeSingle();

  if (existingError) throw existingError;

  if (
    existing?.case_digest_enabled === true &&
    !existing?.unsubscribed_at
  ) {
    return 'already_subscribed';
  }

  const { error } = await supabase.from('marketing_email_leads').upsert(
    {
      email: input.email,
      locale: input.locale,
      case_digest_enabled: true,
      offer_enabled: false,
      unsubscribed_at: null,
      source: input.source,
      updated_at: new Date().toISOString()
    },
    { onConflict: 'email' }
  );

  if (error) throw error;
  return 'subscribed';
}

async function upsertQueueSubscriptionMarker(input: {
  email: string;
  locale: 'zh-CN' | 'en-US';
  source: string;
}): Promise<SubscribeStatus> {
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const { data: existing, error: existingError } = await supabase
    .from('marketing_email_queue')
    .select('id,metadata')
    .eq('recipient_email', input.email)
    .eq('email_type', 'case_digest')
    .eq('campaign_key', HOMEPAGE_CASE_DIGEST_MARKER_KEY)
    .limit(1)
    .maybeSingle();

  if (existingError) throw existingError;

  const existingMetadata = readSubscriptionMarkerMetadata(existing?.metadata);
  if (
    existingMetadata?.caseDigestEnabled === true &&
    !existingMetadata.unsubscribedAt
  ) {
    return 'already_subscribed';
  }

  const unsubscribeToken =
    existingMetadata?.unsubscribeToken || createSubscriptionToken();

  const markerRow = {
    user_id: null,
    recipient_email: input.email,
    email_type: 'case_digest',
    subject: 'WebToMind case digest subscription',
    preview_text: 'Homepage case digest subscription marker',
    html: '<p>Homepage case digest subscription marker.</p>',
    text_body: 'Homepage case digest subscription marker.',
    cta_label: null,
    cta_url: null,
    hero_image_url: null,
    campaign_key: HOMEPAGE_CASE_DIGEST_MARKER_KEY,
    status: 'sent',
    scheduled_at: now,
    sent_at: now,
    attempts: 0,
    attempt_count: 0,
    leased_until: null,
    next_attempt_at: null,
    last_error: null,
    metadata: {
      kind: 'homepage_case_digest_subscription',
      locale: input.locale,
      source: input.source,
      unsubscribeToken,
      caseDigestEnabled: true,
      unsubscribedAt: null,
      updatedAt: now
    }
  };

  const { error } = existing?.id
    ? await supabase
        .from('marketing_email_queue')
        .update(markerRow)
        .eq('id', existing.id)
    : await supabase.from('marketing_email_queue').insert(markerRow);

  if (error) throw error;
  return 'subscribed';
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  const body = (await request.json().catch(() => ({}))) as SubscribeBody;
  const email = normalizeEmail(body.email);
  if (!isValidEmail(email)) {
    return json(400, {
      ok: false,
      code: 'invalid_email',
      error: 'A valid email address is required.'
    });
  }
  const locale = normalizeMarketingLocale(body.locale);
  const source = normalizeSource(body.source);

  try {
    let status: SubscribeStatus;
    try {
      status = await upsertLeadSubscription({ email, locale, source });
    } catch (error) {
      if (!isMissingRelationError(error)) throw error;
      console.warn(
        '[MarketingEmail] marketing_email_leads unavailable; using queue subscription marker:',
        error
      );
      status = await upsertQueueSubscriptionMarker({ email, locale, source });
    }
    return json(200, { ok: true, status });
  } catch (error) {
    console.error('[MarketingEmail] subscribe failed:', error);
    return json(500, {
      ok: false,
      code: 'subscribe_failed',
      error: 'Subscription failed. Please try again later.'
    });
  }
}
