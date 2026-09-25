import {
  buildUnsubscribeUrl,
  fillEmailPlaceholders,
  getEnvInt,
  getSiteUrl,
  getSupabaseAdmin,
  isMarketingEmailTypeEnabled,
  isAuthorizedCronRequest,
  MarketingEmailPreference,
  QueuedEmail,
  ResendEmailInput,
  sendBatchViaResend
} from './email-worker-utils.js';
import {
  HOMEPAGE_CASE_DIGEST_MARKER_KEY,
  isMissingRelationError,
  readSubscriptionMarkerMetadata
} from './subscription-markers.js';

export const config = {
  runtime: 'edge'
};

function json(status: number, data: unknown): Response {
  return Response.json(data, { status });
}

function getAttemptCount(item: QueuedEmail): number {
  return Number(item.attempt_count ?? item.attempts ?? 0);
}

function addMs(date: Date, ms: number): string {
  return new Date(date.getTime() + ms).toISOString();
}

function isValidEmailAddress(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function getMarketingEmailLeaseMs(): number {
  return (
    getEnvInt('MARKETING_EMAIL_LEASE_SECONDS', 10 * 60, 60, 60 * 60) * 1000
  );
}

export function getMarketingEmailBackoffMs(attemptCount: number): number {
  const baseSeconds = getEnvInt(
    'MARKETING_EMAIL_RETRY_BASE_SECONDS',
    5 * 60,
    30,
    60 * 60
  );
  const maxSeconds = getEnvInt(
    'MARKETING_EMAIL_RETRY_MAX_SECONDS',
    6 * 60 * 60,
    baseSeconds,
    24 * 60 * 60
  );
  const exponent = Math.max(0, Math.min(8, attemptCount - 1));
  return Math.min(maxSeconds, baseSeconds * 2 ** exponent) * 1000;
}

export function isResendDailyQuotaError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('daily_quota_exceeded') ||
    normalized.includes('daily email sending quota')
  );
}

export function resolveMarketingEmailDrainLimit(
  requestUrl: string,
  configuredLimit: number
): number {
  const safeConfiguredLimit = Math.min(10, configuredLimit);
  try {
    const requested = Number(new URL(requestUrl).searchParams.get('limit'));
    if (!Number.isInteger(requested) || requested < 1) {
      return safeConfiguredLimit;
    }
    return Math.min(safeConfiguredLimit, requested);
  } catch {
    return safeConfiguredLimit;
  }
}

function escapeEmailAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function replaceExact(value: string, search: string, replacement: string) {
  return value.split(search).join(replacement);
}

/**
 * Rewrites already-queued legacy pricing links at send time. Marketing rows
 * store rendered HTML, so changing the scheduler alone would leave older
 * queued messages pointing at the retired creator pricing URL.
 */
export function normalizeQueuedPricingCta(
  item: Pick<QueuedEmail, 'cta_url' | 'html' | 'text_body'>
): { html: string; textBody: string } {
  if (!item.cta_url) {
    return { html: item.html, textBody: item.text_body };
  }

  let legacyUrl: URL;
  let siteUrl: URL;
  try {
    legacyUrl = new URL(item.cta_url);
    siteUrl = new URL(getSiteUrl());
  } catch {
    return { html: item.html, textBody: item.text_body };
  }

  if (
    legacyUrl.origin !== siteUrl.origin ||
    !/^\/(?:zh-CN|en-US)\/create\/pricing$/.test(legacyUrl.pathname)
  ) {
    return { html: item.html, textBody: item.text_body };
  }

  legacyUrl.pathname = legacyUrl.pathname.replace(
    '/create/pricing',
    '/pricing'
  );
  legacyUrl.searchParams.delete('returnTo');
  const canonicalUrl = legacyUrl.toString();
  const legacyEscaped = escapeEmailAttribute(item.cta_url);
  const canonicalEscaped = escapeEmailAttribute(canonicalUrl);

  return {
    html: replaceExact(
      replaceExact(item.html, legacyEscaped, canonicalEscaped),
      item.cta_url,
      canonicalUrl
    ),
    textBody: replaceExact(item.text_body, item.cta_url, canonicalUrl)
  };
}

async function getPreference(
  userId: string | null,
  email: string
): Promise<MarketingEmailPreference | null> {
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from('marketing_email_preferences')
    .select('*')
    .is('unsubscribed_at', null)
    .limit(1);

  query = userId ? query.eq('user_id', userId) : query.eq('email', email);
  const { data, error } = await query.maybeSingle();
  if (error) {
    console.warn('[MarketingEmail] preference lookup failed:', error.message);
  } else if (data) {
    return (data as MarketingEmailPreference | null) || null;
  }

  if (userId) return null;

  const { data: leadData, error: leadError } = await supabase
    .from('marketing_email_leads')
    .select('*')
    .eq('email', email)
    .is('unsubscribed_at', null)
    .limit(1)
    .maybeSingle();

  if (leadError) {
    if (!isMissingRelationError(leadError)) {
      console.warn('[MarketingEmail] lead lookup failed:', leadError.message);
      return null;
    }
    return getQueueMarkerPreference(email);
  }

  if (!leadData) return getQueueMarkerPreference(email);
  return {
    user_id: null,
    email: String(leadData.email || ''),
    locale: leadData.locale === 'en-US' ? 'en-US' : 'zh-CN',
    unsubscribe_token: String(leadData.unsubscribe_token || ''),
    welcome_enabled: false,
    case_digest_enabled: Boolean(leadData.case_digest_enabled),
    offer_enabled: Boolean(leadData.offer_enabled),
    unsubscribed_at: leadData.unsubscribed_at || null
  };
}

async function getQueueMarkerPreference(
  email: string
): Promise<MarketingEmailPreference | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('marketing_email_queue')
    .select('recipient_email,metadata')
    .eq('recipient_email', email)
    .eq('email_type', 'case_digest')
    .eq('campaign_key', HOMEPAGE_CASE_DIGEST_MARKER_KEY)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn(
      '[MarketingEmail] subscription marker lookup failed:',
      error.message
    );
    return null;
  }

  const metadata = readSubscriptionMarkerMetadata(data?.metadata);
  if (!metadata || !metadata.caseDigestEnabled || metadata.unsubscribedAt) {
    return null;
  }

  return {
    user_id: null,
    email: String(data?.recipient_email || email),
    locale: metadata.locale,
    unsubscribe_token: metadata.unsubscribeToken,
    welcome_enabled: false,
    case_digest_enabled: true,
    offer_enabled: false,
    unsubscribed_at: null
  };
}

async function claimQueuedEmails(limit: number): Promise<QueuedEmail[]> {
  const supabase = getSupabaseAdmin();
  const maxAttempts = getEnvInt('MARKETING_EMAIL_MAX_ATTEMPTS', 3, 1, 10);
  const now = new Date();
  const nowIso = now.toISOString();
  const { error: exhaustedLeaseError } = await supabase
    .from('marketing_email_queue')
    .update({
      status: 'failed',
      leased_until: null,
      last_error: 'lease_expired_after_max_attempts',
      updated_at: nowIso
    })
    .eq('status', 'sending')
    .or(`leased_until.is.null,leased_until.lt.${nowIso}`)
    .gte('attempt_count', maxAttempts);

  if (exhaustedLeaseError) throw exhaustedLeaseError;

  const { data: dueQueued, error: queuedError } = await supabase
    .from('marketing_email_queue')
    .select('*')
    .eq('status', 'queued')
    .lte('scheduled_at', nowIso)
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${nowIso}`)
    .lt('attempt_count', maxAttempts)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (queuedError) throw queuedError;

  const remaining = Math.max(0, limit - (dueQueued?.length || 0));
  let staleSending: QueuedEmail[] = [];
  if (remaining > 0) {
    const { data: staleData, error: staleError } = await supabase
      .from('marketing_email_queue')
      .select('*')
      .eq('status', 'sending')
      .or(`leased_until.is.null,leased_until.lt.${nowIso}`)
      .lt('attempt_count', maxAttempts)
      .order('created_at', { ascending: true })
      .limit(remaining);
    if (staleError) throw staleError;
    staleSending = (staleData || []) as QueuedEmail[];
  }

  const candidates = [...((dueQueued || []) as QueuedEmail[]), ...staleSending];
  const claimed: QueuedEmail[] = [];
  const leaseUntil = addMs(now, getMarketingEmailLeaseMs());

  for (const item of candidates) {
    const nextAttempt = getAttemptCount(item) + 1;
    const updateQuery = supabase
      .from('marketing_email_queue')
      .update({
        status: 'sending',
        attempts: nextAttempt,
        attempt_count: nextAttempt,
        leased_until: leaseUntil,
        updated_at: nowIso
      })
      .eq('id', item.id)
      .eq('status', item.status);

    const claimQuery =
      item.status === 'sending'
        ? updateQuery.or(`leased_until.is.null,leased_until.lt.${nowIso}`)
        : updateQuery
            .lte('scheduled_at', nowIso)
            .or(`next_attempt_at.is.null,next_attempt_at.lte.${nowIso}`);

    const { data: claimedRow, error: claimError } = await claimQuery
      .select('*')
      .maybeSingle();

    if (claimError) {
      console.warn('[MarketingEmail] claim failed:', claimError.message);
      continue;
    }
    if (claimedRow) claimed.push(claimedRow as QueuedEmail);
  }

  return claimed;
}

async function markEmail(
  id: string,
  values: Record<string, unknown>
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('marketing_email_queue')
    .update({ ...values, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    console.warn('[MarketingEmail] queue update failed:', error.message);
  }
}

type PreparedQueuedEmail = {
  item: QueuedEmail;
  input: ResendEmailInput;
};

type EmailSendResult = {
  id: string;
  status: 'sent' | 'failed';
  error?: string;
};

async function refreshCampaignStatuses(items: QueuedEmail[]): Promise<void> {
  const campaignKeys = Array.from(
    new Set(
      items
        .map((item) => item.campaign_key)
        .filter((key): key is string => Boolean(key))
    )
  );
  if (campaignKeys.length === 0) return;

  const supabase = getSupabaseAdmin();
  for (const campaignKey of campaignKeys) {
    const { error } = await supabase.rpc(
      'refresh_marketing_email_campaign_status',
      { p_campaign_key: campaignKey }
    );
    if (error) throw error;
  }
}

async function prepareQueuedEmail(
  item: QueuedEmail
): Promise<PreparedQueuedEmail | EmailSendResult> {
  if (!isValidEmailAddress(item.recipient_email)) {
    await markEmail(item.id, {
      status: 'failed',
      leased_until: null,
      last_error: 'invalid_recipient_email'
    });
    return {
      id: item.id,
      status: 'failed',
      error: 'invalid_recipient_email'
    };
  }

  const preference = await getPreference(item.user_id, item.recipient_email);
  if (!preference) {
    await markEmail(item.id, {
      status: 'failed',
      leased_until: null,
      last_error: 'recipient_unsubscribed_or_missing'
    });
    return {
      id: item.id,
      status: 'failed',
      error: 'recipient_unsubscribed_or_missing'
    };
  }

  if (!isMarketingEmailTypeEnabled(preference, item.email_type)) {
    await markEmail(item.id, {
      status: 'failed',
      leased_until: null,
      last_error: `${item.email_type}_disabled`
    });
    return {
      id: item.id,
      status: 'failed',
      error: `${item.email_type}_disabled`
    };
  }

  const unsubscribeUrl = buildUnsubscribeUrl(preference.unsubscribe_token);
  const normalized = normalizeQueuedPricingCta(item);
  const filled = fillEmailPlaceholders(
    normalized.html,
    normalized.textBody,
    unsubscribeUrl
  );
  return {
    item,
    input: {
      to: item.recipient_email,
      subject: item.subject,
      html: filled.html,
      text: filled.textBody
    }
  };
}

async function markBatchSendFailure(
  item: QueuedEmail,
  message: string
): Promise<EmailSendResult> {
  const maxAttempts = getEnvInt('MARKETING_EMAIL_MAX_ATTEMPTS', 3, 1, 10);
  const attemptCount = getAttemptCount(item);
  const dailyQuotaExceeded = isResendDailyQuotaError(message);
  const willRetry = dailyQuotaExceeded || attemptCount < maxAttempts;
  const nextAttemptAt = dailyQuotaExceeded
    ? addMs(new Date(), 24 * 60 * 60 * 1000)
    : addMs(new Date(), getMarketingEmailBackoffMs(attemptCount));
  const persistedAttemptCount = dailyQuotaExceeded
    ? Math.max(0, attemptCount - 1)
    : attemptCount;
  await markEmail(item.id, {
    status: willRetry ? 'queued' : 'failed',
    attempts: persistedAttemptCount,
    attempt_count: persistedAttemptCount,
    leased_until: null,
    next_attempt_at: willRetry ? nextAttemptAt : null,
    last_error: message
  });
  return { id: item.id, status: 'failed', error: message };
}

async function markBatchSent(
  prepared: PreparedQueuedEmail[],
  sent: Array<{ id?: string }>
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const sentAt = new Date().toISOString();
  const queueIds = prepared.map(({ item }) => item.id);
  const { data, error } = await supabase
    .from('marketing_email_queue')
    .update({
      status: 'sent',
      delivery_status: 'accepted',
      sent_at: sentAt,
      leased_until: null,
      last_error: null,
      updated_at: sentAt
    })
    .in('id', queueIds)
    .eq('status', 'sending')
    .select('id');

  if (error) throw error;
  if ((data || []).length !== queueIds.length) {
    throw new Error(
      `Expected to persist ${queueIds.length} sent emails, updated ${(data || []).length}`
    );
  }

  await Promise.all(
    prepared.map(async ({ item }, index) => {
      const providerMessageId = sent[index]?.id;
      if (!providerMessageId) return;
      await markEmail(item.id, {
        provider_message_id: providerMessageId
      });
    })
  );
}

export async function buildResendBatchIdempotencyKey(
  queueIds: string[]
): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode([...queueIds].sort().join(':'))
  );
  const hash = Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
  return `marketing-email-batch/${hash}`;
}

async function sendQueuedEmailBatch(
  items: QueuedEmail[]
): Promise<EmailSendResult[]> {
  const preparedResults = await Promise.all(items.map(prepareQueuedEmail));
  const prepared = preparedResults.filter(
    (result): result is PreparedQueuedEmail => 'item' in result
  );
  const results = preparedResults.filter(
    (result): result is EmailSendResult => !('item' in result)
  );
  if (prepared.length === 0) return results;

  const idempotencyKey = await buildResendBatchIdempotencyKey(
    prepared.map(({ item }) => item.id)
  );
  let sent: Array<{ id?: string }>;
  try {
    sent = await sendBatchViaResend(
      prepared.map(({ input }) => input),
      idempotencyKey
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'send_failed';
    const failedResults = await Promise.all(
      prepared.map(({ item }) => markBatchSendFailure(item, message))
    );
    return [...results, ...failedResults];
  }

  try {
    await markBatchSent(prepared, sent);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'sent_state_update_failed';
    console.error('[MarketingEmail] sent state update failed:', message);
    return [
      ...results,
      ...prepared.map(({ item }) => ({
        id: item.id,
        status: 'failed' as const,
        error: `sent_state_update_failed:${message}`
      }))
    ];
  }

  return [
    ...results,
    ...prepared.map(({ item }) => ({
      id: item.id,
      status: 'sent' as const
    }))
  ];
}

export default async function handler(request: Request): Promise<Response> {
  if (!['GET', 'POST'].includes(request.method || '')) {
    return json(405, { error: 'Method not allowed' });
  }

  if (!isAuthorizedCronRequest(request)) {
    return json(401, { error: 'Unauthorized' });
  }

  if (!process.env.RESEND_API_KEY) {
    return json(503, { error: 'RESEND_API_KEY is not configured' });
  }

  try {
    const configuredLimit = getEnvInt('MARKETING_EMAIL_DRAIN_LIMIT', 10, 1, 10);
    const limit = resolveMarketingEmailDrainLimit(request.url, configuredLimit);
    const emails = await claimQueuedEmails(limit);
    const processed = await sendQueuedEmailBatch(emails);
    await refreshCampaignStatuses(emails);

    return json(200, {
      success: true,
      claimed: emails.length,
      processed
    });
  } catch (error) {
    console.error('[MarketingEmail] drain failed:', error);
    return json(500, {
      error: error instanceof Error ? error.message : 'Drain failed'
    });
  }
}
