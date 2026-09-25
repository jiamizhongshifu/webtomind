#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const DEFAULT_OUT_DIR = path.join(ROOT, 'outputs', 'conversion');

const DURABLE_CONVERSION_EVENT_NAMES = [
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
  'post_purchase_generation_success',
  'prompt_share_view'
];

const SEO_CONVERSION_EVENT_NAMES = [
  'prompt_detail_view',
  'prompt_preview_view',
  'prompt_detail_use',
  'prompt_preview_use'
];

const REPORT_CONVERSION_EVENT_NAMES = [
  ...DURABLE_CONVERSION_EVENT_NAMES,
  ...SEO_CONVERSION_EVENT_NAMES
];

const INTERNAL_TEST_CTA_SOURCES = new Set([
  'internal_test',
  'codex_release_smoke'
]);

function isInternalConversionEvent(row) {
  return (
    row?.metadata?.traffic_type === 'internal_test' ||
    INTERNAL_TEST_CTA_SOURCES.has(row?.cta_source || '')
  );
}

function parseArgs(argv) {
  const args = {
    days: 30,
    limit: 500,
    outDir: DEFAULT_OUT_DIR,
    dryRun: false,
    help: false
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === '--') {
      continue;
    } else if (arg === '--days') {
      args.days = Number(next);
      index += 1;
    } else if (arg === '--limit') {
      args.limit = Number(next);
      index += 1;
    } else if (arg === '--out-dir') {
      args.outDir = path.resolve(next);
      index += 1;
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isFinite(args.days) || args.days < 1 || args.days > 180) {
    throw new Error('--days must be a number between 1 and 180');
  }
  if (!Number.isFinite(args.limit) || args.limit < 1 || args.limit > 2000) {
    throw new Error('--limit must be a number between 1 and 2000');
  }

  return args;
}

function usage() {
  return `Usage:
  node scripts/supabase-conversion-report.mjs [options]

Options:
  --days <n>       Lookback window. Defaults to 30.
  --limit <n>      Row limit for source tables. Defaults to 500.
  --out-dir <dir>  Output directory. Defaults to outputs/conversion.
  --dry-run        Print markdown only; do not write files.

Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local or env.`;
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function loadEnvFile(filePath) {
  if (!(await fileExists(filePath))) return;
  const text = await fs.readFile(filePath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue
      .replace(/^['"]|['"]$/g, '')
      .replace(/\\n/g, '\n');
  }
}

async function loadLocalEnv() {
  await loadEnvFile(path.join(ROOT, '.env'));
  await loadEnvFile(path.join(ROOT, '.env.local'));
}

function createSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  }
  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false }
  });
}

function toNumber(value) {
  const num = Number(value || 0);
  return Number.isFinite(num) ? num : 0;
}

function safeRate(numerator, denominator) {
  if (denominator <= 0) return null;
  return Number((numerator / denominator).toFixed(4));
}

function fmt(value, digits = 0) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '-';
  }
  return Number(value).toLocaleString('en-US', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits
  });
}

function pct(value, digits = 1) {
  if (
    value === null ||
    value === undefined ||
    !Number.isFinite(Number(value))
  ) {
    return '-';
  }
  return `${(Number(value) * 100).toFixed(digits)}%`;
}

function mdTable(headers, rows) {
  if (!rows.length) return '_无数据_';
  const invalidRow = rows.find((row) => row.length !== headers.length);
  if (invalidRow) {
    throw new Error(
      `Markdown table row has ${invalidRow.length} cells; expected ${headers.length}`
    );
  }
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.join(' | ')} |`)
  ].join('\n');
}

function getRecommendedAction(item) {
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

function buildSourceFunnelSummary(rows) {
  const summary = new Map();

  rows.forEach((row) => {
    const ctaSource = row.cta_source || 'unknown';
    const current = summary.get(ctaSource) || {
      ctaSource,
      pricingViews: 0,
      checkoutStarts: 0,
      purchases: 0,
      purchaseWebhookFailures: 0,
      postPurchaseReturns: 0,
      postPurchaseGenerations: 0,
      knownUsers: 0,
      firstSeenDate: null,
      lastSeenDate: null
    };

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

function buildEventNameSummary(rows) {
  return rows.reduce((acc, row) => {
    const eventName = row.event_name || 'unknown';
    const ctaSource = row.cta_source || 'unknown';
    acc[eventName] ||= { events: 0, sources: {} };
    acc[eventName].events += 1;
    acc[eventName].sources[ctaSource] =
      (acc[eventName].sources[ctaSource] || 0) + 1;
    return acc;
  }, {});
}

function countSampledEvents(rows, eventName) {
  return rows.filter((row) => row.event_name === eventName).length;
}

function failureCategory(metadata) {
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

function buildDurableSourceFunnel(rows) {
  const summary = new Map();
  for (const row of rows) {
    if (!DURABLE_CONVERSION_EVENT_NAMES.includes(row.event_name || ''))
      continue;
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

function buildSeoConversionFunnel(rows) {
  const summary = new Map();
  for (const row of rows) {
    const metadata =
      row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};
    const seoAttribution =
      metadata.seo_attribution && typeof metadata.seo_attribution === 'object'
        ? metadata.seo_attribution
        : null;
    const attribution = seoAttribution || metadata;
    const rawCanonicalPath =
      attribution.canonical_path ||
      attribution.canonicalPath ||
      attribution.path;
    let canonicalPath;
    if (typeof rawCanonicalPath === 'string') {
      try {
        canonicalPath = new URL(rawCanonicalPath, 'https://webtomind.com')
          .pathname;
      } catch {
        canonicalPath = rawCanonicalPath.split(/[?#]/, 1)[0] || undefined;
      }
    }
    const caseId =
      attribution.case_id || attribution.caseId || row.entity_id || '';
    const caseSlug =
      attribution.case_slug ||
      attribution.caseSlug ||
      attribution.slug ||
      undefined;
    const cluster = attribution.cluster || undefined;
    const contentId = attribution.content_id || attribution.contentId || undefined;
    const cta = attribution.cta || undefined;
    const rawSource = attribution.source || row.cta_source || 'unknown';
    const source = [
      'prompt_case_recipe',
      'prompt_detail_recipe_use',
      'prompt_detail_recipe_replace'
    ].includes(String(rawSource))
      ? 'prompt_case_recipe'
      : String(rawSource).replace(/_(?:view|use)$/, '');
    if (
      typeof canonicalPath !== 'string' ||
      !canonicalPath.startsWith('/') ||
      !caseId
    ) {
      continue;
    }
    const isLandingView = [
      'prompt_detail_view',
      'prompt_preview_view'
    ].includes(row.event_name);
    const isPromptUse = ['prompt_detail_use', 'prompt_preview_use'].includes(
      row.event_name
    );
    const isGenerationSuccess =
      row.event_name === 'generation_task_succeeded' && seoAttribution;
    const isFirstGenerationSuccess =
      row.event_name === 'first_generation_succeeded' && seoAttribution;
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
      sessionIds: new Set()
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
    .sort(
      (a, b) =>
        b.firstGenerationSucceeded * 20 +
        b.generationSucceeded * 10 +
        b.promptUses * 3 +
        b.landingViews -
        (a.firstGenerationSucceeded * 20 +
          a.generationSucceeded * 10 +
          a.promptUses * 3 +
          a.landingViews)
    );
}

/**
 * 分享 → 注册 → 首图成功 漏斗（session 级近似）。
 * prompt_share_view 为客户端上报（分享链接复制/生成），
 * identity_linked 与 first_generation_succeeded 按 session_id join；
 * 跨会话注册会低估，采样窗口内结果仅为方向性参考。
 */
function buildShareFunnel(rows) {
  const shareSessions = new Set();
  const signupSessions = new Set();
  const firstGenSessions = new Set();
  for (const row of rows) {
    if (!row?.session_id) continue;
    if (row.event_name === 'prompt_share_view') {
      shareSessions.add(row.session_id);
    } else if (row.event_name === 'identity_linked') {
      signupSessions.add(row.session_id);
    } else if (row.event_name === 'first_generation_succeeded') {
      firstGenSessions.add(row.session_id);
    }
  }
  const shareToSignup = [...shareSessions].filter((sessionId) =>
    signupSessions.has(sessionId)
  ).length;
  const shareToFirstGen = [...shareSessions].filter(
    (sessionId) =>
      signupSessions.has(sessionId) && firstGenSessions.has(sessionId)
  ).length;
  return {
    shareSessions: shareSessions.size,
    shareToSignup,
    shareToFirstGen,
    shareToSignupRate: safeRate(shareToSignup, shareSessions.size),
    shareToFirstGenRate: safeRate(shareToFirstGen, shareSessions.size),
    sampled: rows.length > 0
  };
}

function buildConversionHealthSummary(events, orders, exactEventCounts = {}) {
  const eventCount = (name) =>
    exactEventCounts[name] ?? countSampledEvents(events, name);
  const generationSucceeded = eventCount('generation_task_succeeded');
  const generationFailed = eventCount('generation_task_failed');
  const firstGenerationSucceeded = eventCount('first_generation_succeeded');
  const failureCategories = events
    .filter((row) => row.event_name === 'generation_task_failed')
    .reduce((acc, row) => {
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
      .map((row) => row.order_id)
  );
  const activationEventsExceedPurchases =
    postPurchaseGenerationEvents > purchaseEvents;
  const warnings = activationEventsExceedPurchases
    ? [
        `Post-purchase first generations (${postPurchaseGenerationEvents}) exceed purchase events (${purchaseEvents}); the order invariant is violated.`
      ]
    : [];

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
          .map((row) => row.user_id)
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

function getTopDropoffs(sourceSummary) {
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

function summarizeOrders(rows) {
  return rows.reduce((acc, row) => {
    const key = `${row.status || 'unknown'}:${row.product_type || 'unknown'}:${row.product_id || 'unknown'}`;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

/**
 * 按订单 first-touch acquisition 快照汇总（metadata.checkout_attribution.acquisition）。
 * 用于回答「哪一笔购买来自哪个来源/ref 码」，unknown 占比应持续下降。
 */
function buildAcquisitionBreakdown(orders) {
  const summary = new Map();
  for (const order of orders || []) {
    const metadata =
      order?.metadata && typeof order.metadata === 'object'
        ? order.metadata
        : {};
    const attribution =
      metadata.checkout_attribution &&
      typeof metadata.checkout_attribution === 'object'
        ? metadata.checkout_attribution
        : {};
    const acquisition =
      attribution.acquisition &&
      typeof attribution.acquisition === 'object'
        ? attribution.acquisition
        : metadata.acquisition;
    const utm =
      acquisition?.utm && typeof acquisition.utm === 'object'
        ? acquisition.utm
        : {};
    const refCode =
      typeof acquisition?.refCode === 'string' && acquisition.refCode.trim()
        ? acquisition.refCode.trim().slice(0, 40)
        : '';
    const clickId =
      typeof acquisition?.clickId === 'string' && acquisition.clickId.trim()
        ? 'click_id'
        : '';
    const utmSource =
      typeof utm.utm_source === 'string' && utm.utm_source.trim()
        ? `utm:${utm.utm_source.trim().slice(0, 40)}`
        : typeof utm.utm_medium === 'string' && utm.utm_medium.trim()
          ? `utm_medium:${utm.utm_medium.trim().slice(0, 40)}`
          : '';
    const externalReferrer =
      typeof acquisition?.externalReferrer === 'string' &&
      acquisition.externalReferrer.trim()
        ? 'external_referrer'
        : '';
    const key =
      refCode || clickId || utmSource || externalReferrer || 'unknown';
    const current = summary.get(key) || { orders: 0, purchased: 0 };
    current.orders += 1;
    if (order.status === 'succeeded') current.purchased += 1;
    summary.set(key, current);
  }
  return Array.from(summary.entries())
    .map(([acquisitionKey, item]) => ({ acquisitionKey, ...item }))
    .sort((a, b) => b.orders - a.orders);
}

function mergePaymentOrderRows(...groups) {
  const indexById = new Map();
  const merged = [];
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

function buildPurchaseOrderReconciliation(events, orders, exactEventCount) {
  const purchaseEvents = events.filter(
    (row) => row.event_name === 'purchase_webhook_succeeded'
  );
  const orderIds = [
    ...new Set(purchaseEvents.map((row) => row.order_id).filter(Boolean))
  ];
  const ordersById = new Map(
    orders.filter((order) => order.id).map((order) => [order.id, order])
  );
  const missingOrderIds = orderIds.filter(
    (orderId) => !ordersById.has(orderId)
  );
  const nonSucceededOrderIds = orderIds.filter((orderId) => {
    const order = ordersById.get(orderId);
    return order && order.status !== 'succeeded';
  });
  const warnings = [
    exactEventCount > purchaseEvents.length
      ? `purchaseOrderEvents is truncated (${purchaseEvents.length}/${exactEventCount}); purchase-order reconciliation is incomplete.`
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
  ].filter(Boolean);

  return {
    purchaseEvents: exactEventCount,
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

function summarizeSegments(rows) {
  return rows.reduce((acc, row) => {
    const key = row.segment_key || 'unknown';
    acc[key] ||= { users: 0 };
    acc[key].users += row.user_id ? 1 : 0;
    return acc;
  }, {});
}

async function safeQuery(label, query) {
  try {
    const { data, error, count } = await query;
    return {
      data: data || [],
      count: count ?? null,
      error: error?.message || null
    };
  } catch (error) {
    return {
      data: [],
      count: null,
      error: error instanceof Error ? error.message : `${label} query failed`
    };
  }
}

async function buildReport({ days, limit }) {
  const supabase = createSupabaseClient();
  const cutoff = new Date(
    Date.now() - days * 24 * 60 * 60 * 1000
  ).toISOString();
  const cutoffDate = cutoff.slice(0, 10);
  const durableEventLimit = Math.max(limit, 2000);

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
        .gte('event_date', cutoffDate)
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
        .in('event_name', REPORT_CONVERSION_EVENT_NAMES)
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
          'id,status,product_type,product_id,amount,currency,created_at,updated_at,metadata',
          { count: 'exact' }
        )
        .gte('created_at', cutoff)
        .order('created_at', { ascending: false })
        .limit(limit)
    ),
    exactEventCountsPromise
  ]);

  const purchaseOrderEventRows = purchaseOrderEvents.data.filter(
    (row) => !isInternalConversionEvent(row)
  );
  const purchaseOrderIds = [
    ...new Set(
      purchaseOrderEventRows.map((row) => row.order_id).filter(Boolean)
    )
  ];
  const purchaseOrders = purchaseOrderIds.length
    ? await safeQuery(
        'purchaseOrders',
        supabase
          .from('payment_orders')
          .select(
            'id,status,product_type,product_id,amount,currency,created_at,updated_at,metadata'
          )
          .in('id', purchaseOrderIds)
      )
    : { data: [], count: 0, error: null };

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
    dailyFunnel.data.filter(
      (row) => !INTERNAL_TEST_CTA_SOURCES.has(row.cta_source || '')
    )
  );
  const exactEventCounts = Object.fromEntries(
    exactEventCountResults
      .filter((result) => !result.error && result.count !== null)
      .map((result) => [result.eventName, result.count])
  );
  const exactEventCountErrors = Object.fromEntries(
    exactEventCountResults
      .filter((result) => result.error)
      .map((result) => [result.eventName, result.error])
  );
  const sampledEvents = recentEvents.data.filter(
    (row) => !isInternalConversionEvent(row)
  );
  const sampledDurableEvents = durableEvents.data.filter(
    (row) => !isInternalConversionEvent(row)
  );
  const reconciledOrders = mergePaymentOrderRows(
    recentOrders.data,
    purchaseOrders.data
  );
  const purchaseOrderReconciliation = buildPurchaseOrderReconciliation(
    purchaseOrderEventRows,
    purchaseOrders.data,
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
  const sampledOrderRows = recentOrders.data.length;
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
      ].filter(Boolean)
    )
  );

  return {
    generatedAt: new Date().toISOString(),
    windowDays: days,
    success:
      Object.values(errors).every((error) => !error) &&
      Object.keys(exactEventCountErrors).length === 0,
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
    acquisitionBreakdown: buildAcquisitionBreakdown(reconciledOrders),
    shareFunnel: buildShareFunnel(sampledDurableEvents),
    seoConversionFunnel: buildSeoConversionFunnel(sampledDurableEvents),
    durableSourceFunnel: buildDurableSourceFunnel(sampledDurableEvents),
    counts: {
      dailyFunnelRows: dailyFunnel.data.length,
      recentEvents: recentEvents.count ?? recentEvents.data.length,
      recentOrders: recentOrders.count ?? recentOrders.data.length,
      purchaseLinkedOrders: purchaseOrders.data.length,
      reengagementSegments: segmentRows.data.length
    },
    sourceFunnelSummary,
    topDropoffs: getTopDropoffs(sourceFunnelSummary),
    eventNameSummary: buildEventNameSummary(sampledEvents),
    orderStatusSummary: summarizeOrders(reconciledOrders),
    reengagementSegmentSummary: summarizeSegments(segmentRows.data)
  };
}

function buildMarkdown(report) {
  const hasDurableEvents = report.counts.recentEvents > 0;
  const hasOrders = report.counts.recentOrders > 0;
  const allOrdersPending =
    hasOrders &&
    Object.keys(report.orderStatusSummary).every((key) =>
      key.startsWith('pending:')
    );

  return `# WebToMind Supabase 转化报告

生成时间：${report.generatedAt}
统计窗口：最近 ${report.windowDays} 天

## 简短结论

- Durable conversion events：${fmt(report.counts.recentEvents)}
- Payment orders created within window：${fmt(report.counts.recentOrders)}
- Purchase-linked payment orders：${fmt(report.counts.purchaseLinkedOrders)}（按窗口内 purchase event 的 order_id 回查）
- Conversion funnel daily rows：${fmt(report.counts.dailyFunnelRows)}
- Re-engagement segments：${fmt(report.counts.reengagementSegments)}
- Generation task success / failure：${fmt(report.conversionHealth.generation.succeeded)} / ${fmt(report.conversionHealth.generation.failed)}，成功率 ${pct(report.conversionHealth.generation.successRate)}；首次成功 ${fmt(report.conversionHealth.generation.firstSucceeded)}。
- Checkout expired：事件 ${fmt(report.conversionHealth.checkout.expiredEvents)}，订单 ${fmt(report.conversionHealth.checkout.expiredOrders)}。
- Checkout 初始化失败：事件 ${fmt(report.conversionHealth.checkout.sessionCreateFailedEvents)}，失败订单 ${fmt(report.conversionHealth.checkout.failedOrders)}。
- 报告质量：${report.reportQuality.complete ? '完整' : '有告警'}。${report.reportQuality.warnings.length ? report.reportQuality.warnings.join('；') : '未发现截断或口径异常。'}
- 当前状态：${
    !hasDurableEvents && hasOrders
      ? 'payment_orders 有数据但 conversion_events 为 0，优先排查 conversion event 写入/部署。'
      : allOrdersPending
        ? '订单全部停留 pending；先用 Stripe session 状态区分真实待支付与已过期，不直接归因 webhook。'
        : '继续按来源漏斗和订单状态排查。'
  }

## Source Funnel

${mdTable(
  [
    'CTA source',
    'Pricing',
    'Checkout',
    'Purchase',
    'Post-purchase first generation',
    'Pricing -> Checkout',
    'Checkout -> Purchase',
    'Action'
  ],
  report.sourceFunnelSummary
    .slice(0, 20)
    .map((row) => [
      row.ctaSource,
      fmt(row.pricingViews),
      fmt(row.checkoutStarts),
      fmt(row.purchases),
      fmt(row.postPurchaseGenerations),
      pct(row.pricingToCheckoutRate),
      pct(row.checkoutToPurchaseRate),
      row.recommendedAction
    ])
)}

> “购买后首次生成”按订单唯一计数；它表示付款后是否完成第一次成功生图，不表示会员权益是否到账。如果该值大于 Purchase，说明数据库不变量或事件写入链路被破坏。

## Exact durable event counts

${mdTable(
  ['Event', 'Count'],
  REPORT_CONVERSION_EVENT_NAMES.map((eventName) => [
    eventName,
    Object.hasOwn(report.exactEventCounts, eventName)
      ? fmt(report.exactEventCounts[eventName])
      : 'query failed; sampled fallback'
  ])
)}

## SEO Landing -> Prompt Use -> First Value（样本）

${mdTable(
  [
    'Canonical',
    'Case',
    'Source',
    'Content',
    'CTA',
    'Sessions',
    'Views',
    'Uses',
    'Task success',
    'First success',
    'View -> Use',
    'Use -> Success',
    'Use -> First success'
  ],
  report.seoConversionFunnel
    .slice(0, 50)
    .map((row) => [
      row.canonicalPath,
      row.caseSlug || row.caseId,
      row.source,
      row.contentId || '-',
      row.cta || '-',
      fmt(row.sessions),
      fmt(row.landingViews),
      fmt(row.promptUses),
      fmt(row.generationSucceeded),
      fmt(row.firstGenerationSucceeded),
      pct(row.viewToUseRate),
      pct(row.useToSuccessRate),
      pct(row.useToFirstSuccessRate)
    ])
)}

> SEO 归因只保存随机 session、canonical path、case、内容 ID 和 CTA source，不保存 query string 或完整 referrer。Task success 和 First success 均来自服务端任务终态。

## Durable Event Funnel（样本按来源）

${mdTable(
  [
    'CTA source',
    'Pricing',
    'Checkout',
    'Init fail',
    'Purchase',
    'Expired',
    'Generation success',
    'Generation failure',
    'First success'
  ],
  report.durableSourceFunnel.map((row) => [
    row.ctaSource,
    fmt(row.pricingViews),
    fmt(row.checkoutStarts),
    fmt(row.checkoutSessionCreateFailures),
    fmt(row.purchases),
    fmt(row.checkoutExpired),
    fmt(row.generationSucceeded),
    fmt(row.generationFailed),
    fmt(row.firstGenerationSucceeded)
  ])
)}

${report.reportQuality.totalDurableEventRows > report.reportQuality.sampledDurableEventRows ? `> 来源漏斗基于最近 ${fmt(report.reportQuality.sampledDurableEventRows)} / ${fmt(report.reportQuality.totalDurableEventRows)} 条 durable event 样本；顶部 exactEventCounts 仍为精确计数。` : '> Durable source funnel 覆盖当前窗口全部受跟踪事件。'}

## Generation Health

${mdTable(
  ['Metric', 'Value'],
  [
    ['Task succeeded', fmt(report.conversionHealth.generation.succeeded)],
    ['Task failed', fmt(report.conversionHealth.generation.failed)],
    ['Task success rate', pct(report.conversionHealth.generation.successRate)],
    [
      'First generation succeeded',
      fmt(report.conversionHealth.generation.firstSucceeded)
    ],
    [
      'First-success users in sample',
      fmt(report.conversionHealth.generation.firstSucceededUsers)
    ],
    [
      'Checkout session creation failures',
      fmt(report.conversionHealth.checkout.sessionCreateFailedEvents)
    ],
    [
      'Expired checkout events',
      fmt(report.conversionHealth.checkout.expiredEvents)
    ],
    ['Expired orders', fmt(report.conversionHealth.checkout.expiredOrders)],
    ['Failed orders', fmt(report.conversionHealth.checkout.failedOrders)],
    [
      'Purchase events',
      fmt(report.conversionHealth.activationIntegrity.purchaseEvents)
    ],
    [
      'Post-purchase first generations',
      fmt(report.conversionHealth.activationIntegrity.activatedOrders)
    ],
    [
      'Post-purchase first generations in sample',
      fmt(report.conversionHealth.activationIntegrity.activatedOrdersInSample)
    ]
  ]
)}

### Generation failure categories

${mdTable(
  ['Category', 'Count'],
  Object.entries(report.conversionHealth.generation.failureCategories)
    .sort((a, b) => b[1] - a[1])
    .map(([category, count]) => [category, fmt(count)])
)}

${report.conversionHealth.generation.failureCategoriesAreSampled ? '> 失败类别来自截断样本，不能与精确失败总数直接相加比较。' : ''}

## Top Dropoffs

${mdTable(
  [
    'CTA source',
    'Stage',
    'Dropoff',
    'Pricing',
    'Checkout',
    'Purchase',
    'Action'
  ],
  report.topDropoffs.map((row) => [
    row.ctaSource,
    row.stage,
    fmt(row.dropoff),
    fmt(row.pricingViews),
    fmt(row.checkoutStarts),
    fmt(row.purchases),
    row.recommendedAction
  ])
)}

## Order Status

${mdTable(
  ['Status / product', 'Count'],
  Object.entries(report.orderStatusSummary)
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => [key, fmt(count)])
)}

## Checkout Acquisition（first-touch 快照）

${mdTable(
  ['Acquisition', 'Orders', 'Purchased'],
  report.acquisitionBreakdown.map((row) => [
    row.acquisitionKey,
    fmt(row.orders),
    fmt(row.purchased)
  ])
)}

## Share → Signup → First Generation（session 级近似）

> prompt_share_view 为客户端上报事件；identity_linked / first_generation_succeeded
> 按 session_id join。跨会话注册会被低估，仅作方向性参考。

${mdTable(
  ['指标', '值'],
  [
    ['分享会话', fmt(report.shareFunnel.shareSessions)],
    ['分享 → 注册（同 session）', fmt(report.shareFunnel.shareToSignup)],
    ['分享 → 注册 → 首图成功', fmt(report.shareFunnel.shareToFirstGen)],
    [
      '分享 → 注册率',
      report.shareFunnel.shareToSignupRate === null
        ? '-'
        : pct(report.shareFunnel.shareToSignupRate)
    ],
    [
      '分享 → 注册 → 首图率',
      report.shareFunnel.shareToFirstGenRate === null
        ? '-'
        : pct(report.shareFunnel.shareToFirstGenRate)
    ]
  ]
)}

## Event Name Summary

${mdTable(
  ['Event', 'Count', 'Top sources'],
  Object.entries(report.eventNameSummary)
    .sort((a, b) => b[1].events - a[1].events)
    .map(([eventName, item]) => [
      eventName,
      fmt(item.events),
      Object.entries(item.sources)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([source, count]) => `${source}:${count}`)
        .join(', ')
    ])
)}

## Re-engagement Segments

${mdTable(
  ['Segment', 'Users'],
  Object.entries(report.reengagementSegmentSummary)
    .sort((a, b) => b[1].users - a[1].users)
    .map(([segment, item]) => [segment, fmt(item.users)])
)}

## Next SOP

1. 如果 payment_orders 有 pending 但 purchase 为 0，先查 Stripe session 是 open、expired 还是 complete；只有 complete 未更新订单时才排查 webhook。
2. 如果 conversion_events 为 0，先确认线上已部署 service-role conversion writer，再用一次真实 pricing CTA 做 smoke。
3. 如果 generation_task_failed 增长，先按 failure category 排查 provider、policy、timeout，不用前端 generation_success 代替服务端终态。
4. GA 只看匿名入口和页面行为；Supabase 负责登录后 checkout/order/purchase 真实性。

${
  Object.values(report.errors).some(Boolean)
    ? `> 查询错误：${JSON.stringify(report.errors)}`
    : ''
}
`;
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(usage());
    return;
  }

  await loadLocalEnv();
  const report = await buildReport(args);
  const markdown = buildMarkdown(report);

  if (args.dryRun) {
    console.log(markdown);
    return;
  }

  const date = new Date().toISOString().slice(0, 10);
  const runDir = path.join(args.outDir, date);
  await fs.mkdir(runDir, { recursive: true });
  await fs.writeFile(
    path.join(runDir, 'supabase-conversion-report.json'),
    JSON.stringify(report, null, 2)
  );
  await fs.writeFile(
    path.join(runDir, 'supabase-conversion-report.md'),
    markdown
  );
  console.log(markdown);
  console.log(
    `\nSaved: ${path.relative(ROOT, path.join(runDir, 'supabase-conversion-report.md'))}`
  );
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);

if (isMain) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

export {
  buildAcquisitionBreakdown,
  DURABLE_CONVERSION_EVENT_NAMES,
  buildConversionHealthSummary,
  buildDurableSourceFunnel,
  buildMarkdown,
  mdTable,
  buildSourceFunnelSummary
};
