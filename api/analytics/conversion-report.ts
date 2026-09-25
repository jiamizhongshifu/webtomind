import { createClient } from '@supabase/supabase-js';
import { isAuthorizedCronRequest } from '../marketing/email-worker-utils.js';

export const config = {
  runtime: 'edge'
};

function json(status: number, data: unknown): Response {
  return Response.json(data, { status });
}

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

function getIntParam(
  request: Request,
  name: string,
  fallback: number,
  min: number,
  max: number
): number {
  const url = new URL(request.url || '', 'https://webtomind.com');
  const value = Number(url.searchParams.get(name));
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function getDateCutoff(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function toNumber(value: unknown): number {
  const nextValue = Number(value || 0);
  return Number.isFinite(nextValue) ? nextValue : 0;
}

function safeRate(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Number((numerator / denominator).toFixed(4));
}

export const DURABLE_CONVERSION_EVENT_NAMES = [
  'pricing_view',
  'identity_linked',
  'checkout_start',
  'checkout_session_create_failed',
  'purchase_webhook_succeeded',
  'subscription_renewal_succeeded',
  'purchase_webhook_failed',
  'checkout_session_expired',
  'generation_task_succeeded',
  'generation_task_failed',
  'first_generation_succeeded',
  'post_purchase_generation_success'
] as const;

export const SEO_CONVERSION_EVENT_NAMES = [
  'prompt_detail_view',
  'prompt_preview_view',
  'prompt_detail_use',
  'prompt_preview_use'
] as const;

const REPORT_CONVERSION_EVENT_NAMES = [
  ...DURABLE_CONVERSION_EVENT_NAMES,
  ...SEO_CONVERSION_EVENT_NAMES
] as const;

type DailyFunnelRow = {
  event_date?: string;
  cta_source?: string | null;
  pricing_views?: number | string | null;
  checkout_starts?: number | string | null;
  purchases?: number | string | null;
  purchase_webhook_failures?: number | string | null;
  post_purchase_returns?: number | string | null;
  post_purchase_generations?: number | string | null;
  known_users?: number | string | null;
};

type SourceFunnelSummary = {
  ctaSource: string;
  pricingViews: number;
  checkoutStarts: number;
  purchases: number;
  purchaseWebhookFailures: number;
  postPurchaseReturns: number;
  postPurchaseGenerations: number;
  knownUsers: number;
  pricingToCheckoutRate: number | null;
  checkoutToPurchaseRate: number | null;
  purchaseToActivationRate: number | null;
  firstSeenDate: string | null;
  lastSeenDate: string | null;
  recommendedAction: string;
  warnings: string[];
};

export type ConversionEventRow = {
  event_name?: string | null;
  cta_source?: string | null;
  user_id?: string | null;
  anonymous_id?: string | null;
  session_id?: string | null;
  entity_id?: string | null;
  order_id?: string | null;
  metadata?: Record<string, unknown> | null;
};

const INTERNAL_TEST_CTA_SOURCES = new Set([
  'internal_test',
  'codex_release_smoke'
]);

export function isInternalConversionEvent(
  row: Pick<ConversionEventRow, 'cta_source' | 'metadata'>
): boolean {
  return (
    row.metadata?.traffic_type === 'internal_test' ||
    INTERNAL_TEST_CTA_SOURCES.has(row.cta_source || '')
  );
}

export type PaymentOrderRow = {
  id?: string | null;
  status?: string | null;
  product_type?: string | null;
  product_id?: string | null;
};

export function mergePaymentOrderRows(
  ...groups: PaymentOrderRow[][]
): PaymentOrderRow[] {
  const indexById = new Map<string, number>();
  const merged: PaymentOrderRow[] = [];

  groups.flat().forEach((order) => {
    if (order.id) {
      const existingIndex = indexById.get(order.id);
      if (existingIndex !== undefined) {
        merged[existingIndex] = order;
        return;
      }
      indexById.set(order.id, merged.length);
    }
    merged.push(order);
  });

  return merged;
}

export function buildPurchaseOrderReconciliation(
  events: ConversionEventRow[],
  orders: PaymentOrderRow[],
  exactPurchaseEventCount = events.length
) {
  const purchaseEvents = events.filter(
    (row) => row.event_name === 'purchase_webhook_succeeded'
  );
  const orderIds = Array.from(
    new Set(
      purchaseEvents
        .map((row) => row.order_id)
        .filter((orderId): orderId is string => Boolean(orderId))
    )
  );
  const ordersById = new Map(
    orders
      .filter((order): order is PaymentOrderRow & { id: string } =>
        Boolean(order.id)
      )
      .map((order) => [order.id, order])
  );
  const missingOrderIds = orderIds.filter(
    (orderId) => !ordersById.has(orderId)
  );
  const nonSucceededOrderIds = orderIds.filter((orderId) => {
    const order = ordersById.get(orderId);
    return order && order.status !== 'succeeded';
  });
  const warnings = [
    exactPurchaseEventCount > purchaseEvents.length
      ? `purchaseOrderEvents is truncated (${purchaseEvents.length}/${exactPurchaseEventCount}); purchase-order reconciliation is incomplete.`
      : null,
    purchaseEvents.some((event) => !event.order_id)
      ? 'At least one purchase_webhook_succeeded event has no order_id.'
      : null,
    missingOrderIds.length
      ? `Purchase events reference ${missingOrderIds.length} payment order(s) that could not be loaded.`
      : null,
    nonSucceededOrderIds.length
      ? `Purchase events reference ${nonSucceededOrderIds.length} payment order(s) whose status is not succeeded.`
      : null
  ].filter((warning): warning is string => Boolean(warning));

  return {
    purchaseEvents: exactPurchaseEventCount,
    sampledPurchaseEvents: purchaseEvents.length,
    uniqueOrderIds: orderIds.length,
    matchedOrders: orderIds.length - missingOrderIds.length,
    succeededOrders: orderIds.filter(
      (orderId) => ordersById.get(orderId)?.status === 'succeeded'
    ).length,
    missingOrderIds,
    nonSucceededOrderIds,
    warnings
  };
}

type DurableSourceFunnel = {
  ctaSource: string;
  pricingViews: number;
  checkoutStarts: number;
  checkoutSessionCreateFailures: number;
  purchases: number;
  checkoutExpired: number;
  generationSucceeded: number;
  generationFailed: number;
  firstGenerationSucceeded: number;
};

function getRecommendedAction(
  item: Omit<SourceFunnelSummary, 'recommendedAction' | 'warnings'>
): string {
  if (item.postPurchaseGenerations > item.purchases) {
    return 'Activation-order invariant violated; audit the database constraint and event writer.';
  }
  if (item.pricingViews >= 10 && item.checkoutStarts === 0) {
    return 'Review landing-to-pricing intent, pricing CTA copy, and plan comprehension.';
  }
  if (item.checkoutStarts >= 3 && item.purchases === 0) {
    return 'Review checkout friction, payment failure states, and offer clarity.';
  }
  if (item.purchases > 0 && item.postPurchaseGenerations === 0) {
    return 'Review post-purchase activation and first generation guidance.';
  }
  if (item.pricingViews > 0 && (item.pricingToCheckoutRate || 0) < 0.03) {
    return 'Improve source-specific pricing context and CTA match.';
  }
  return 'Monitor weekly and compare against other CTA sources.';
}

function buildSourceFunnelSummary(
  rows: DailyFunnelRow[]
): SourceFunnelSummary[] {
  const summary = new Map<
    string,
    Omit<SourceFunnelSummary, 'recommendedAction' | 'warnings'>
  >();

  rows.forEach((row) => {
    const ctaSource = row.cta_source || 'unknown';
    const current =
      summary.get(ctaSource) ||
      ({
        ctaSource,
        pricingViews: 0,
        checkoutStarts: 0,
        purchases: 0,
        purchaseWebhookFailures: 0,
        postPurchaseReturns: 0,
        postPurchaseGenerations: 0,
        knownUsers: 0,
        pricingToCheckoutRate: null,
        checkoutToPurchaseRate: null,
        purchaseToActivationRate: null,
        firstSeenDate: null,
        lastSeenDate: null
      } satisfies Omit<SourceFunnelSummary, 'recommendedAction' | 'warnings'>);

    current.pricingViews += toNumber(row.pricing_views);
    current.checkoutStarts += toNumber(row.checkout_starts);
    current.purchases += toNumber(row.purchases);
    current.purchaseWebhookFailures += toNumber(row.purchase_webhook_failures);
    current.postPurchaseReturns += toNumber(row.post_purchase_returns);
    current.postPurchaseGenerations += toNumber(row.post_purchase_generations);
    current.knownUsers += toNumber(row.known_users);

    const eventDate = row.event_date || null;
    if (eventDate) {
      current.firstSeenDate =
        !current.firstSeenDate || eventDate < current.firstSeenDate
          ? eventDate
          : current.firstSeenDate;
      current.lastSeenDate =
        !current.lastSeenDate || eventDate > current.lastSeenDate
          ? eventDate
          : current.lastSeenDate;
    }

    summary.set(ctaSource, current);
  });

  return Array.from(summary.values())
    .map((item) => {
      const withRates = {
        ...item,
        pricingToCheckoutRate: safeRate(item.checkoutStarts, item.pricingViews),
        checkoutToPurchaseRate: safeRate(item.purchases, item.checkoutStarts),
        purchaseToActivationRate: safeRate(
          item.postPurchaseGenerations,
          item.purchases
        )
      };
      return {
        ...withRates,
        recommendedAction: getRecommendedAction(withRates),
        warnings:
          item.postPurchaseGenerations > item.purchases
            ? [
                `Post-purchase first generations (${item.postPurchaseGenerations}) exceed purchases (${item.purchases}); the order invariant is violated.`
              ]
            : []
      };
    })
    .sort((a, b) => {
      const bVolume = b.pricingViews + b.checkoutStarts * 5 + b.purchases * 20;
      const aVolume = a.pricingViews + a.checkoutStarts * 5 + a.purchases * 20;
      return bVolume - aVolume;
    });
}

function countSampledEvents(rows: ConversionEventRow[], eventName: string) {
  return rows.filter((row) => row.event_name === eventName).length;
}

function failureCategory(metadata: Record<string, unknown> | null | undefined) {
  if (!metadata || typeof metadata !== 'object') return 'unknown';
  const candidates = [
    metadata.failure_category,
    metadata.error_category,
    metadata.error_code,
    metadata.provider_status,
    metadata.reason
  ];
  const value = candidates.find(
    (candidate) => typeof candidate === 'string' && candidate.trim()
  );
  return typeof value === 'string' ? value.trim().slice(0, 120) : 'unknown';
}

export function buildDurableSourceFunnel(
  rows: ConversionEventRow[]
): DurableSourceFunnel[] {
  const summary = new Map<string, DurableSourceFunnel>();
  for (const row of rows) {
    if (
      !DURABLE_CONVERSION_EVENT_NAMES.includes(
        (row.event_name ||
          '') as (typeof DURABLE_CONVERSION_EVENT_NAMES)[number]
      )
    ) {
      continue;
    }
    const ctaSource = row.cta_source || 'unknown';
    const current = summary.get(ctaSource) || {
      ctaSource,
      pricingViews: 0,
      checkoutStarts: 0,
      checkoutSessionCreateFailures: 0,
      purchases: 0,
      checkoutExpired: 0,
      generationSucceeded: 0,
      generationFailed: 0,
      firstGenerationSucceeded: 0
    };
    if (row.event_name === 'pricing_view') current.pricingViews += 1;
    if (row.event_name === 'checkout_start') current.checkoutStarts += 1;
    if (row.event_name === 'checkout_session_create_failed') {
      current.checkoutSessionCreateFailures += 1;
    }
    if (row.event_name === 'purchase_webhook_succeeded') current.purchases += 1;
    if (row.event_name === 'checkout_session_expired')
      current.checkoutExpired += 1;
    if (row.event_name === 'generation_task_succeeded')
      current.generationSucceeded += 1;
    if (row.event_name === 'generation_task_failed')
      current.generationFailed += 1;
    if (row.event_name === 'first_generation_succeeded') {
      current.firstGenerationSucceeded += 1;
    }
    summary.set(ctaSource, current);
  }
  return Array.from(summary.values()).sort((a, b) => {
    const bVolume = b.pricingViews + b.checkoutStarts + b.generationSucceeded;
    const aVolume = a.pricingViews + a.checkoutStarts + a.generationSucceeded;
    return bVolume - aVolume;
  });
}

function metadataRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function metadataText(
  record: Record<string, unknown> | undefined,
  ...keys: string[]
): string | undefined {
  const value = keys
    .map((key) => record?.[key])
    .find((candidate) => typeof candidate === 'string' && candidate.trim());
  return typeof value === 'string' ? value.trim() : undefined;
}

function reportCanonicalPath(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    return new URL(value, 'https://webtomind.com').pathname;
  } catch {
    return value.split(/[?#]/, 1)[0] || undefined;
  }
}

function reportSeoSource(value: string): string {
  if (
    value === 'prompt_case_recipe' ||
    value === 'prompt_detail_recipe_use' ||
    value === 'prompt_detail_recipe_replace'
  ) {
    return 'prompt_case_recipe';
  }
  return value.replace(/_(?:view|use)$/, '');
}

export function buildSeoConversionFunnel(rows: ConversionEventRow[]) {
  const summary = new Map<
    string,
    {
      canonicalPath: string;
      caseId: string;
      caseSlug?: string;
      source: string;
      cluster?: string;
      contentId?: string;
      cta?: string;
      landingViews: number;
      promptUses: number;
      generationSucceeded: number;
      firstGenerationSucceeded: number;
      sessionIds: Set<string>;
    }
  >();

  for (const row of rows) {
    const metadata = metadataRecord(row.metadata);
    const seoAttribution = metadataRecord(metadata?.seo_attribution);
    const attribution = seoAttribution || metadata;
    const canonicalPath = reportCanonicalPath(
      metadataText(attribution, 'canonical_path', 'canonicalPath', 'path')
    );
    const caseId =
      metadataText(attribution, 'case_id', 'caseId') || row.entity_id || '';
    const caseSlug = metadataText(attribution, 'case_slug', 'caseSlug', 'slug');
    const cluster = metadataText(attribution, 'cluster');
    const contentId = metadataText(attribution, 'content_id', 'contentId');
    const cta = metadataText(attribution, 'cta');
    const rawSource =
      metadataText(attribution, 'source') || row.cta_source || 'unknown';
    const source = reportSeoSource(rawSource);
    if (!canonicalPath?.startsWith('/') || !caseId) continue;

    const isLandingView =
      row.event_name === 'prompt_detail_view' ||
      row.event_name === 'prompt_preview_view';
    const isPromptUse =
      row.event_name === 'prompt_detail_use' ||
      row.event_name === 'prompt_preview_use';
    const isGenerationSuccess =
      row.event_name === 'generation_task_succeeded' && Boolean(seoAttribution);
    const isFirstGenerationSuccess =
      row.event_name === 'first_generation_succeeded' &&
      Boolean(seoAttribution);
    if (
      !isLandingView &&
      !isPromptUse &&
      !isGenerationSuccess &&
      !isFirstGenerationSuccess
    ) {
      continue;
    }

    const key = `${canonicalPath}\u0000${caseId}\u0000${source}\u0000${contentId || ''}\u0000${cta || ''}`;
    const current = summary.get(key) || {
      canonicalPath,
      caseId,
      ...(caseSlug ? { caseSlug } : {}),
      source,
      ...(cluster ? { cluster } : {}),
      ...(contentId ? { contentId } : {}),
      ...(cta ? { cta } : {}),
      landingViews: 0,
      promptUses: 0,
      generationSucceeded: 0,
      firstGenerationSucceeded: 0,
      sessionIds: new Set<string>()
    };
    if (isLandingView) current.landingViews += 1;
    if (isPromptUse) current.promptUses += 1;
    if (isGenerationSuccess) current.generationSucceeded += 1;
    if (isFirstGenerationSuccess) current.firstGenerationSucceeded += 1;
    if (row.session_id) current.sessionIds.add(row.session_id);
    summary.set(key, current);
  }

  return Array.from(summary.values())
    .map(({ sessionIds, ...item }) => ({
      ...item,
      sessions: sessionIds.size,
      viewToUseRate: safeRate(item.promptUses, item.landingViews),
      useToSuccessRate: safeRate(item.generationSucceeded, item.promptUses),
      useToFirstSuccessRate: safeRate(
        item.firstGenerationSucceeded,
        item.promptUses
      )
    }))
    .sort((a, b) => {
      const bValue =
        b.firstGenerationSucceeded * 20 +
        b.generationSucceeded * 10 +
        b.promptUses * 3 +
        b.landingViews;
      const aValue =
        a.firstGenerationSucceeded * 20 +
        a.generationSucceeded * 10 +
        a.promptUses * 3 +
        a.landingViews;
      return bValue - aValue;
    });
}

export function buildConversionHealthSummary(
  events: ConversionEventRow[],
  orders: PaymentOrderRow[],
  exactEventCounts: Record<string, number> = {}
) {
  const eventCount = (name: string) =>
    exactEventCounts[name] ?? countSampledEvents(events, name);
  const generationSucceeded = eventCount('generation_task_succeeded');
  const generationFailed = eventCount('generation_task_failed');
  const firstGenerationSucceeded = eventCount('first_generation_succeeded');
  const failureCategories = events
    .filter((row) => row.event_name === 'generation_task_failed')
    .reduce<Record<string, number>>((acc, row) => {
      const category = failureCategory(row.metadata);
      acc[category] = (acc[category] || 0) + 1;
      return acc;
    }, {});
  const purchaseEvents = eventCount('purchase_webhook_succeeded');
  const postPurchaseGenerationEvents = eventCount(
    'post_purchase_generation_success'
  );
  const activatedOrderIds = new Set(
    events
      .filter(
        (row) =>
          row.event_name === 'post_purchase_generation_success' && row.order_id
      )
      .map((row) => row.order_id as string)
  );
  const activationEventsExceedPurchases =
    postPurchaseGenerationEvents > purchaseEvents;
  const warnings: string[] = [];
  if (activationEventsExceedPurchases) {
    warnings.push(
      `Post-purchase first generations (${postPurchaseGenerationEvents}) exceed purchase events (${purchaseEvents}); the order invariant is violated.`
    );
  }

  return {
    generation: {
      succeeded: generationSucceeded,
      failed: generationFailed,
      successRate: safeRate(
        generationSucceeded,
        generationSucceeded + generationFailed
      ),
      firstSucceeded: firstGenerationSucceeded,
      firstSucceededUsers: new Set(
        events
          .filter(
            (row) =>
              row.event_name === 'first_generation_succeeded' && row.user_id
          )
          .map((row) => row.user_id as string)
      ).size,
      failureCategories,
      failureCategoriesAreSampled:
        eventCount('generation_task_failed') >
        countSampledEvents(events, 'generation_task_failed')
    },
    checkout: {
      sessionCreateFailedEvents: eventCount('checkout_session_create_failed'),
      expiredEvents: eventCount('checkout_session_expired'),
      expiredOrders: orders.filter((order) => order.status === 'expired')
        .length,
      pendingOrders: orders.filter((order) => order.status === 'pending')
        .length,
      failedOrders: orders.filter((order) => order.status === 'failed').length,
      succeededOrders: orders.filter((order) => order.status === 'succeeded')
        .length
    },
    activationIntegrity: {
      purchaseEvents,
      subscriptionRenewalEvents: eventCount('subscription_renewal_succeeded'),
      postPurchaseGenerationEvents,
      activatedOrders: postPurchaseGenerationEvents,
      activatedOrdersInSample: activatedOrderIds.size,
      activationEventsExceedPurchases
    },
    warnings
  };
}

function buildEventNameSummary(rows: ConversionEventRow[]) {
  return rows.reduce<
    Record<string, { events: number; sources: Record<string, number> }>
  >((acc, row) => {
    const eventName = row.event_name || 'unknown';
    const ctaSource = row.cta_source || 'unknown';
    acc[eventName] ||= { events: 0, sources: {} };
    acc[eventName].events += 1;
    acc[eventName].sources[ctaSource] =
      (acc[eventName].sources[ctaSource] || 0) + 1;
    return acc;
  }, {});
}

function getTopDropoffs(sourceSummary: SourceFunnelSummary[]) {
  return sourceSummary
    .map((item) => {
      const pricingDropoff =
        item.pricingViews > 0 ? item.pricingViews - item.checkoutStarts : 0;
      const checkoutDropoff =
        item.checkoutStarts > 0 ? item.checkoutStarts - item.purchases : 0;
      const activationDropoff =
        item.purchases > 0 ? item.purchases - item.postPurchaseGenerations : 0;
      const maxDropoff = Math.max(
        pricingDropoff,
        checkoutDropoff,
        activationDropoff
      );
      const stage =
        maxDropoff === activationDropoff && activationDropoff > 0
          ? 'purchase_to_activation'
          : maxDropoff === checkoutDropoff && checkoutDropoff > 0
            ? 'checkout_to_purchase'
            : 'pricing_to_checkout';
      return {
        ctaSource: item.ctaSource,
        stage,
        dropoff: maxDropoff,
        pricingViews: item.pricingViews,
        checkoutStarts: item.checkoutStarts,
        purchases: item.purchases,
        postPurchaseGenerations: item.postPurchaseGenerations,
        recommendedAction: item.recommendedAction
      };
    })
    .filter((item) => item.dropoff > 0)
    .sort((a, b) => b.dropoff - a.dropoff)
    .slice(0, 10);
}

async function safeQuery<T>(
  label: string,
  query: PromiseLike<{
    data: T | null;
    error: { message: string } | null;
    count?: number | null;
  }>
): Promise<{ data: T | null; count: number | null; error: string | null }> {
  try {
    const { data, error, count } = await query;
    return { data, count: count ?? null, error: error?.message || null };
  } catch (error) {
    return {
      data: null,
      count: null,
      error: error instanceof Error ? error.message : `${label} query failed`
    };
  }
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'GET') {
    return json(405, { error: 'Method not allowed' });
  }

  if (!isAuthorizedCronRequest(request)) {
    return json(401, { error: 'Unauthorized' });
  }

  try {
    const supabase = getSupabaseAdmin();
    const days = getIntParam(request, 'days', 30, 1, 180);
    const limit = getIntParam(request, 'limit', 200, 1, 1000);
    const durableEventLimit = Math.max(limit, 1000);
    const cutoff = getDateCutoff(days);

    const exactEventCountsPromise = Promise.all(
      REPORT_CONVERSION_EVENT_NAMES.map(async (eventName) => {
        const result = await safeQuery(
          `eventCount:${eventName}`,
          supabase
            .from('conversion_events')
            .select('id', { count: 'exact', head: true })
            .eq('event_name', eventName)
            .or(
              'metadata->>traffic_type.is.null,metadata->>traffic_type.neq.internal_test'
            )
            .or(
              'cta_source.is.null,and(cta_source.neq.internal_test,cta_source.neq.codex_release_smoke)'
            )
            .gte('occurred_at', cutoff)
        );
        return {
          eventName,
          count: result.count,
          error: result.error
        };
      })
    );

    const [
      dailyFunnel,
      segmentRows,
      recentEvents,
      durableEvents,
      purchaseOrderEvents,
      recentOrders,
      exactEventCountResults
    ] = await Promise.all([
      safeQuery(
        'dailyFunnel',
        supabase
          .from('conversion_funnel_daily')
          .select('*')
          .gte('event_date', cutoff.slice(0, 10))
          .order('event_date', { ascending: false })
          .order('cta_source', { ascending: true })
          .limit(limit)
      ),
      safeQuery(
        'segments',
        supabase
          .from('conversion_reengagement_segments')
          .select('segment_key,user_id,last_signal_at,metadata')
          .order('last_signal_at', { ascending: false })
          .limit(limit)
      ),
      safeQuery(
        'recentEvents',
        supabase
          .from('conversion_events')
          .select(
            'event_name,event_source,user_id,anonymous_id,session_id,entity_id,order_id,product_type,product_id,cta_source,occurred_at,metadata',
            { count: 'exact' }
          )
          .or(
            'metadata->>traffic_type.is.null,metadata->>traffic_type.neq.internal_test'
          )
          .or(
            'cta_source.is.null,and(cta_source.neq.internal_test,cta_source.neq.codex_release_smoke)'
          )
          .gte('occurred_at', cutoff)
          .order('occurred_at', { ascending: false })
          .limit(limit)
      ),
      safeQuery(
        'durableEvents',
        supabase
          .from('conversion_events')
          .select(
            'event_name,event_source,user_id,anonymous_id,session_id,entity_id,order_id,product_type,product_id,cta_source,occurred_at,metadata',
            { count: 'exact' }
          )
          .in('event_name', [...REPORT_CONVERSION_EVENT_NAMES])
          .or(
            'metadata->>traffic_type.is.null,metadata->>traffic_type.neq.internal_test'
          )
          .or(
            'cta_source.is.null,and(cta_source.neq.internal_test,cta_source.neq.codex_release_smoke)'
          )
          .gte('occurred_at', cutoff)
          .order('occurred_at', { ascending: false })
          .limit(durableEventLimit)
      ),
      safeQuery(
        'purchaseOrderEvents',
        supabase
          .from('conversion_events')
          .select('event_name,order_id,cta_source,metadata', { count: 'exact' })
          .eq('event_name', 'purchase_webhook_succeeded')
          .or(
            'metadata->>traffic_type.is.null,metadata->>traffic_type.neq.internal_test'
          )
          .or(
            'cta_source.is.null,and(cta_source.neq.internal_test,cta_source.neq.codex_release_smoke)'
          )
          .gte('occurred_at', cutoff)
          .order('occurred_at', { ascending: false })
          .limit(durableEventLimit)
      ),
      safeQuery(
        'recentOrders',
        supabase
          .from('payment_orders')
          .select(
            'id,user_id,status,product_type,product_id,amount,currency,provider_order_id,created_at,updated_at,metadata',
            { count: 'exact' }
          )
          .gte('created_at', cutoff)
          .order('created_at', { ascending: false })
          .limit(limit)
      ),
      exactEventCountsPromise
    ]);

    const purchaseOrderEventRows = (
      (purchaseOrderEvents.data || []) as ConversionEventRow[]
    ).filter((row) => !isInternalConversionEvent(row));
    const purchaseOrderIds = Array.from(
      new Set(
        purchaseOrderEventRows
          .map((row) => row.order_id)
          .filter((orderId): orderId is string => Boolean(orderId))
      )
    );
    const purchaseOrders = purchaseOrderIds.length
      ? await safeQuery(
          'purchaseOrders',
          supabase
            .from('payment_orders')
            .select(
              'id,user_id,status,product_type,product_id,amount,currency,provider_order_id,created_at,updated_at,metadata'
            )
            .in('id', purchaseOrderIds)
        )
      : { data: [], count: 0, error: null };

    const segments = (
      (segmentRows.data || []) as Array<{
        segment_key?: string;
        user_id?: string;
      }>
    ).reduce<Record<string, { users: number }>>((acc, item) => {
      const key = item.segment_key || 'unknown';
      acc[key] ||= { users: 0 };
      acc[key].users += item.user_id ? 1 : 0;
      return acc;
    }, {});

    const errors = {
      dailyFunnel: dailyFunnel.error,
      segments: segmentRows.error,
      recentEvents: recentEvents.error,
      durableEvents: durableEvents.error,
      purchaseOrderEvents: purchaseOrderEvents.error,
      purchaseOrders: purchaseOrders.error,
      recentOrders: recentOrders.error
    };
    const sourceFunnelSummary = buildSourceFunnelSummary(
      ((dailyFunnel.data || []) as DailyFunnelRow[]).filter(
        (row) => !INTERNAL_TEST_CTA_SOURCES.has(row.cta_source || '')
      )
    );
    const eventNameSummary = buildEventNameSummary(
      ((recentEvents.data || []) as ConversionEventRow[]).filter(
        (row) => !isInternalConversionEvent(row)
      )
    );
    const exactEventCounts = Object.fromEntries(
      exactEventCountResults
        .filter((result) => !result.error && result.count !== null)
        .map((result) => [result.eventName, result.count as number])
    );
    const exactEventCountErrors = Object.fromEntries(
      exactEventCountResults
        .filter((result) => result.error)
        .map((result) => [result.eventName, result.error])
    );
    const sampledEvents = (
      (recentEvents.data || []) as ConversionEventRow[]
    ).filter((row) => !isInternalConversionEvent(row));
    const sampledDurableEvents = (
      (durableEvents.data || []) as ConversionEventRow[]
    ).filter((row) => !isInternalConversionEvent(row));
    const sampledOrders = (recentOrders.data || []) as PaymentOrderRow[];
    const purchaseLinkedOrders = (purchaseOrders.data ||
      []) as PaymentOrderRow[];
    const reconciledOrders = mergePaymentOrderRows(
      sampledOrders,
      purchaseLinkedOrders
    );
    const purchaseOrderReconciliation = buildPurchaseOrderReconciliation(
      purchaseOrderEventRows,
      purchaseLinkedOrders,
      exactEventCounts.purchase_webhook_succeeded ??
        purchaseOrderEvents.count ??
        purchaseOrderEventRows.length
    );
    const conversionHealth = buildConversionHealthSummary(
      sampledDurableEvents,
      reconciledOrders,
      exactEventCounts
    );
    const sampledEventRows = sampledEvents.length;
    const totalEventRows = recentEvents.count ?? sampledEventRows;
    const sampledDurableEventRows = sampledDurableEvents.length;
    const totalDurableEventRows = Object.values(exactEventCounts).reduce(
      (sum, count) => sum + count,
      0
    );
    const sampledOrderRows = sampledOrders.length;
    const totalOrderRows = recentOrders.count ?? sampledOrderRows;
    const reportQualityWarnings = Array.from(
      new Set(
        [
          totalEventRows > sampledEventRows
            ? `recentEvents is truncated (${sampledEventRows}/${totalEventRows}); eventNameSummary is sampled.`
            : null,
          totalDurableEventRows > sampledDurableEventRows
            ? `durableEvents is truncated (${sampledDurableEventRows}/${totalDurableEventRows}); durable source and failure-category breakdowns are sampled.`
            : null,
          totalOrderRows > sampledOrderRows
            ? `recentOrders is truncated (${sampledOrderRows}/${totalOrderRows}); order status breakdown is sampled.`
            : null,
          Object.keys(exactEventCountErrors).length
            ? `Exact event counts failed for: ${Object.keys(exactEventCountErrors).join(', ')}; affected metrics fall back to sampled rows.`
            : null,
          ...purchaseOrderReconciliation.warnings,
          ...conversionHealth.warnings,
          ...sourceFunnelSummary.flatMap((item) => item.warnings)
        ].filter((item): item is string => Boolean(item))
      )
    );

    return json(200, {
      success:
        Object.values(errors).every((error) => !error) &&
        Object.keys(exactEventCountErrors).length === 0,
      generatedAt: new Date().toISOString(),
      windowDays: days,
      errors: {
        ...errors,
        exactEventCounts:
          Object.keys(exactEventCountErrors).length > 0
            ? exactEventCountErrors
            : null
      },
      reportQuality: {
        complete: reportQualityWarnings.length === 0,
        sampledEventRows,
        totalEventRows,
        sampledDurableEventRows,
        totalDurableEventRows,
        sampledOrderRows,
        totalOrderRows,
        warnings: reportQualityWarnings
      },
      exactEventCounts,
      exactEventCountErrors,
      conversionHealth,
      purchaseOrderReconciliation,
      seoConversionFunnel: buildSeoConversionFunnel(sampledDurableEvents),
      durableSourceFunnel: buildDurableSourceFunnel(sampledDurableEvents),
      sourceFunnelSummary,
      topDropoffs: getTopDropoffs(sourceFunnelSummary),
      eventNameSummary,
      dailyFunnel: dailyFunnel.data || [],
      reengagementSegmentSummary: segments,
      reengagementSegments: segmentRows.data || [],
      recentEvents: sampledEvents,
      recentOrders: recentOrders.data || [],
      purchaseLinkedOrders
    });
  } catch (error) {
    console.error('[ConversionReport] failed:', error);
    return json(500, {
      error: error instanceof Error ? error.message : 'Report failed'
    });
  }
}
