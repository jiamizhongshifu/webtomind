import { getApiBaseUrl } from '@/utils/env';
import { createLogger } from '@/utils/logger';
import { getAnalyticsSessionId } from './analytics';
import { isProductionAnalyticsHost } from './analytics-host';
import { getAnalyticsTrafficContext } from './analytics-test-context';
import { rememberSeoConversionAttribution } from './seo-conversion-attribution';

const log = createLogger('ClientConversionEvents');

export type ClientConversionEventName =
  | 'pricing_view'
  | 'pricing_item_view'
  | 'pricing_promo_view'
  | 'pricing_cta_click'
  | 'pricing_mode_change'
  | 'pricing_bulk_packages_expand'
  | 'identity_linked'
  | 'checkout_session_create_failed'
  | 'post_purchase_return'
  | 'prompt_detail_view'
  | 'prompt_detail_unlock_click'
  | 'prompt_detail_copy'
  | 'prompt_detail_use'
  | 'prompt_preview_view'
  | 'prompt_preview_copy'
  | 'prompt_preview_use'
  | 'prompt_share_view';

export type ClientConversionEventPayload = {
  eventName: ClientConversionEventName;
  entityType?: string | null;
  entityId?: string | null;
  orderId?: string | null;
  productType?: string | null;
  productId?: string | null;
  ctaSource?: string;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
};

export async function recordClientConversionEvent(
  accessToken: string | null | undefined,
  body: ClientConversionEventPayload
): Promise<void> {
  const sessionId = getAnalyticsSessionId();
  const isAnonymous = !accessToken;
  if (
    isAnonymous &&
    (typeof window === 'undefined' ||
      !isProductionAnalyticsHost(window.location.hostname))
  ) {
    return;
  }

  if (
    body.eventName === 'prompt_detail_use' ||
    body.eventName === 'prompt_preview_use'
  ) {
    rememberSeoConversionAttribution({
      canonicalPath:
        typeof body.metadata?.canonicalPath === 'string'
          ? body.metadata.canonicalPath
          : typeof body.metadata?.path === 'string'
            ? body.metadata.path
            : window.location.pathname,
      caseId:
        typeof body.metadata?.caseId === 'string'
          ? body.metadata.caseId
          : body.entityId || '',
      caseSlug:
        typeof body.metadata?.caseSlug === 'string'
          ? body.metadata.caseSlug
          : typeof body.metadata?.slug === 'string'
            ? body.metadata.slug
            : undefined,
      source: body.ctaSource || body.eventName,
      cluster:
        typeof body.metadata?.cluster === 'string'
          ? body.metadata.cluster
          : undefined,
      contentId:
        typeof body.metadata?.contentId === 'string'
          ? body.metadata.contentId
          : body.entityId || undefined,
      mediaType:
        body.metadata?.mediaType === 'video' ? 'video' : 'image',
      model:
        typeof body.metadata?.model === 'string'
          ? body.metadata.model
          : undefined,
      cta: body.ctaSource || body.eventName
    });
  }

  try {
    const response = await fetch(
      `${getApiBaseUrl()}/api/analytics/conversion-event`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
        },
        keepalive: true,
        body: JSON.stringify({
          ...body,
          anonymousId:
            isAnonymous || body.eventName === 'identity_linked'
              ? sessionId
              : undefined,
          sessionId,
          metadata: {
            ...(body.metadata || {}),
            ...getAnalyticsTrafficContext()
          }
        })
      }
    );
    if (!response.ok) {
      log.warn('Conversion event rejected:', response.status, body.eventName);
    }
  } catch (error) {
    log.warn('Conversion event failed:', error);
  }
}
