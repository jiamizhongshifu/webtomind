export type MarketingLocale = 'zh-CN' | 'en-US';

export const HOMEPAGE_CASE_DIGEST_MARKER_KEY =
  'homepage_case_digest_subscription';

export type SubscriptionMarkerMetadata = {
  kind: typeof HOMEPAGE_CASE_DIGEST_MARKER_KEY;
  locale: MarketingLocale;
  source: string;
  unsubscribeToken: string;
  caseDigestEnabled: boolean;
  unsubscribedAt: string | null;
  updatedAt: string;
};

export function isMissingRelationError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const record = error as {
    code?: unknown;
    message?: unknown;
    details?: unknown;
  };
  const message = [record.message, record.details]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase();
  return (
    record.code === 'PGRST205' ||
    record.code === '42P01' ||
    message.includes('marketing_email_leads') ||
    message.includes('could not find the table') ||
    message.includes('schema cache') ||
    message.includes('does not exist')
  );
}

export function normalizeMarketingLocale(value: unknown): MarketingLocale {
  return value === 'en-US' ? 'en-US' : 'zh-CN';
}

export function createSubscriptionToken(): string {
  const random = crypto.getRandomValues(new Uint8Array(18));
  return Array.from(random, (byte) => byte.toString(16).padStart(2, '0')).join(
    ''
  );
}

export function readSubscriptionMarkerMetadata(
  value: unknown
): SubscriptionMarkerMetadata | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (record.kind !== HOMEPAGE_CASE_DIGEST_MARKER_KEY) return null;
  const unsubscribeToken =
    typeof record.unsubscribeToken === 'string'
      ? record.unsubscribeToken
      : '';
  if (!unsubscribeToken) return null;
  return {
    kind: HOMEPAGE_CASE_DIGEST_MARKER_KEY,
    locale: normalizeMarketingLocale(record.locale),
    source:
      typeof record.source === 'string' && record.source
        ? record.source
        : 'home_hot_cases',
    unsubscribeToken,
    caseDigestEnabled: record.caseDigestEnabled !== false,
    unsubscribedAt:
      typeof record.unsubscribedAt === 'string'
        ? record.unsubscribedAt
        : null,
    updatedAt:
      typeof record.updatedAt === 'string' ? record.updatedAt : ''
  };
}
