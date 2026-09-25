type GtagCommand = 'config' | 'consent' | 'event' | 'js' | 'set';

type GtagFunction = (
  command: GtagCommand,
  target: string | Date,
  params?: Record<string, unknown>
) => void;

declare global {
  interface Window {
    gtag?: GtagFunction;
    dataLayer?: unknown[];
  }
}

export const GA_MEASUREMENT_ID = 'G-BHFWNPLMSW';

type PendingAnalyticsCall = {
  command: GtagCommand;
  target: string | Date;
  params?: Record<string, unknown>;
};

const ATTRIBUTION_PARAM_RENAMES: Record<string, string> = {
  source: 'cta_source',
  medium: 'cta_medium',
  campaign: 'cta_campaign',
  term: 'cta_term',
  content: 'cta_content'
};

const ANALYTICS_ACQUISITION_QUERY_KEYS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'gclid',
  'dclid',
  'gbraid',
  'wbraid',
  'msclkid',
  'fbclid',
  'ref'
]);

const TRUSTED_WORKFLOW_REFERRER_HOSTS = new Set([
  'accounts.google.com',
  'checkout.stripe.com'
]);

const pendingAnalyticsCalls: PendingAnalyticsCall[] = [];
const trackedEventKeys = new Set<string>();
const trackedPurchaseIds = new Set<string>();
const TERMINAL_EVENT_STORAGE_KEY =
  'webtomind:analytics-generation-terminal-events:v1';
const MAX_STORED_TERMINAL_EVENT_KEYS = 100;
const IMAGE_GENERATION_TERMINAL_EVENTS = new Set([
  'generation_success',
  'generation_failed',
  'generation_cancelled'
]);
// `null` means the route-level consent gate has not resolved yet. Calls made
// during the first React render must wait for that decision instead of being
// dropped permanently. `false` is reserved for an explicit deny/private-route
// decision and clears anything that was queued while unresolved.
let analyticsCollectionEnabled: boolean | null = null;
let analyticsConsentState: AnalyticsConsentState = 'granted';
let flushTimer: number | null = null;
let flushAttempts = 0;
const MAX_FLUSH_ATTEMPTS = 40;
const FLUSH_RETRY_DELAY_MS = 250;

// GTM 容器接管 dataLayer.push（非原生）后，对象事件才会被 GTM 处理。
// 应用在 GTM 架构下不再注入 gtag.js / 预定义 window.gtag，事件统一走
// dataLayer 对象事件（{event: name, ...params}），由「GA4 事件」tag 转发。
function isGtmDataLayerReady(): boolean {
  if (typeof window === 'undefined' || !window.dataLayer) return false;
  const push = window.dataLayer.push;
  if (typeof push !== 'function') return false;
  if (/\[native code\]/.test(Function.prototype.toString.call(push))) {
    // 原生 Array.push = GTM 尚未接管 dataLayer
    return false;
  }
  // GTM 接管 dataLayer.push 后，还需等容器完全加载（gtm.load 事件）。
  // gtm.dom 出现时「GA4 事件」tag 尚未就绪，事件会被引擎接收但静默
  // 丢失（实测 pricing_view 丢、gtm.load 后手动事件正常转发）。
  return (window.dataLayer as unknown[]).some((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return false;
    }
    return (entry as { event?: unknown }).event === 'gtm.load';
  });
}

function canTrack(): boolean {
  return analyticsCollectionEnabled === true && isGtmDataLayerReady();
}

function readTrackedTerminalEventKeys(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(
      window.sessionStorage.getItem(TERMINAL_EVENT_STORAGE_KEY) || '[]'
    );
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === 'string')
      : [];
  } catch {
    return [];
  }
}

function rememberTerminalEvent(key: string): boolean {
  if (trackedEventKeys.has(key)) return false;

  const storedKeys = readTrackedTerminalEventKeys();
  if (storedKeys.includes(key)) {
    trackedEventKeys.add(key);
    return false;
  }

  trackedEventKeys.add(key);
  if (typeof window !== 'undefined') {
    try {
      window.sessionStorage.setItem(
        TERMINAL_EVENT_STORAGE_KEY,
        JSON.stringify(
          [...storedKeys, key].slice(-MAX_STORED_TERMINAL_EVENT_KEYS)
        )
      );
    } catch {
      // In-memory deduplication still protects the active page session.
    }
  }
  return true;
}

export type AnalyticsConsentState = 'granted' | 'denied';

/**
 * 将应用 consent gate 的决策同步给 gtag.js。直接加载 gtag.js（无 GTM）时
 * consent mode 默认 denied，自定义事件（pricing_view 等）会被拦截；
 * 必须在启用采集时显式 update 为 granted。
 */
export function updateAnalyticsConsent(consent: AnalyticsConsentState) {
  analyticsConsentState = consent;
  if (typeof window === 'undefined') return;
  const storage = consent === 'granted' ? 'granted' : 'denied';
  const payload = { ad_storage: storage, analytics_storage: storage };
  if (typeof window.gtag === 'function') {
    window.gtag('consent', 'update', payload);
    return;
  }
  // gtag.js 只回放 dataLayer 中的 Arguments 对象（应用 gtag shim 同款格式），
  // 数组形式（GTM 约定）在直连 gtag.js 时会被忽略，必须 push arguments。
  if (!window.dataLayer) window.dataLayer = [];
  const queue = window.dataLayer;
  const consentCommand = function (_command: string, _action: string, _params: object) {
    // eslint-disable-next-line prefer-rest-params -- gtag.js 回放需要 Arguments 对象
    queue.push(arguments as unknown as unknown[]);
  };
  consentCommand('consent', 'update', payload);
}

export function setAnalyticsCollectionEnabled(enabled: boolean) {
  analyticsCollectionEnabled = enabled;
  if (enabled) {
    flushAnalyticsQueue();
    return;
  }
  if (typeof window !== 'undefined' && flushTimer) {
    window.clearTimeout(flushTimer);
  }
  pendingAnalyticsCalls.length = 0;
  flushTimer = null;
  flushAttempts = 0;
}

export function loadGoogleAnalytics(options: { flushPending?: boolean } = {}) {
  if (!analyticsCollectionEnabled || typeof document === 'undefined') return;
  if (!window.dataLayer) window.dataLayer = [];
  if (options.flushPending !== false) {
    flushAnalyticsQueue();
  }
}

export function shouldIgnoreTrustedWorkflowReferrer(referrer: string): boolean {
  if (!referrer) return false;
  try {
    return TRUSTED_WORKFLOW_REFERRER_HOSTS.has(new URL(referrer).hostname);
  } catch {
    return false;
  }
}

export function normalizeEventParams(
  params: Record<string, unknown>
): Record<string, unknown> {
  const normalized = { ...params };

  Object.entries(ATTRIBUTION_PARAM_RENAMES).forEach(([reserved, renamed]) => {
    if (!Object.prototype.hasOwnProperty.call(normalized, reserved)) return;
    normalized[renamed] ??= normalized[reserved];
    delete normalized[reserved];
  });

  return normalized;
}

export function normalizeAnalyticsPageLocation(value: string): string {
  try {
    const url = new URL(value, 'https://webtomind.com');
    const normalized = new URL(url.pathname, url.origin);
    for (const [key, rawValue] of url.searchParams.entries()) {
      if (
        !ANALYTICS_ACQUISITION_QUERY_KEYS.has(key) ||
        normalized.searchParams.has(key)
      ) {
        continue;
      }
      const valueBeforeMalformedSeparator = rawValue.split(
        /\?(?=[A-Za-z0-9_-]+=)/,
        1
      )[0];
      if (valueBeforeMalformedSeparator) {
        normalized.searchParams.set(key, valueBeforeMalformedSeparator);
      }
    }
    return normalized.toString();
  } catch {
    return value.split('#', 1)[0];
  }
}

function scheduleFlush() {
  if (typeof window === 'undefined' || flushTimer) return;
  if (flushAttempts >= MAX_FLUSH_ATTEMPTS) return;
  flushTimer = window.setTimeout(() => {
    flushTimer = null;
    flushAttempts += 1;
    flushAnalyticsQueue();
  }, FLUSH_RETRY_DELAY_MS);
}

function pushAnalyticsCall(call: PendingAnalyticsCall): void {
  if (!window.dataLayer) return;
  if (call.command === 'event') {
    window.dataLayer.push({
      event: String(call.target),
      ...(call.params ?? {})
    });
    return;
  }
  if (call.command === 'consent') {
    // 保持 Arguments 形式：若 GTM 容器启用 consent mode 可识别；
    // 未启用时无害。
    const consentCommand = function (
      _command: string,
      _action: string,
      _params: object
    ) {
      // eslint-disable-next-line prefer-rest-params -- GTM 兼容队列格式
      window.dataLayer?.push(arguments as unknown as unknown[]);
    };
    consentCommand(String(call.target), 'update', call.params ?? {});
    return;
  }
  // js / config 命令由 GTM 的 Google 代码负责，忽略
}

export function flushAnalyticsQueue() {
  if (!canTrack()) {
    if (pendingAnalyticsCalls.length > 0) scheduleFlush();
    return;
  }

  flushAttempts = 0;
  while (pendingAnalyticsCalls.length > 0) {
    const call = pendingAnalyticsCalls.shift();
    if (!call) continue;
    pushAnalyticsCall(call);
  }
  // GTM 就绪后同步一次 consent（幂等，覆盖加载前入队未生效的情况）
  updateAnalyticsConsent(analyticsConsentState);
}

function sendAnalyticsCall(
  command: GtagCommand,
  target: string | Date,
  params?: Record<string, unknown>
) {
  if (analyticsCollectionEnabled === false) return;
  if (canTrack()) {
    pushAnalyticsCall({ command, target, params });
    flushAnalyticsQueue();
    return;
  }

  pendingAnalyticsCalls.push({ command, target, params });
  scheduleFlush();
}

export function resetAnalyticsQueueForTest() {
  if (typeof window !== 'undefined' && flushTimer) {
    window.clearTimeout(flushTimer);
  }
  pendingAnalyticsCalls.length = 0;
  flushTimer = null;
  flushAttempts = 0;
  analyticsCollectionEnabled = false;
  trackedEventKeys.clear();
  trackedPurchaseIds.clear();
  if (typeof window !== 'undefined') {
    try {
      window.sessionStorage.removeItem(TERMINAL_EVENT_STORAGE_KEY);
    } catch {
      // Ignore unavailable test storage.
    }
  }
}

export function getAnalyticsSessionId(): string {
  if (typeof window === 'undefined') return 'server';
  const storageKey = 'webtomind:analytics-session:v1';
  try {
    const existing = window.sessionStorage.getItem(storageKey);
    if (existing) return existing;
    const created =
      typeof crypto?.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.sessionStorage.setItem(storageKey, created);
    return created;
  } catch {
    return `ephemeral-${Date.now()}`;
  }
}

export function trackPageView(input: {
  path: string;
  title?: string;
  location?: string;
}) {
  sendAnalyticsCall('event', 'page_view', {
    send_to: GA_MEASUREMENT_ID,
    page_path: input.path,
    page_location: normalizeAnalyticsPageLocation(
      input.location || window.location.href
    ),
    page_title: input.title || document.title,
    ...getAnalyticsTrafficContext()
  });
}

export function initializeAnalyticsPageView(input: {
  path: string;
  title?: string;
  location?: string;
}) {
  analyticsCollectionEnabled = true;
  loadGoogleAnalytics({ flushPending: false });
  // The landing page must be the first GA event in a new session. Other
  // components can queue events during their first render, so send page_view
  // before trackPageView flushes that pending queue.
  trackPageView(input);
}

export function trackEvent(name: string, params: Record<string, unknown> = {}) {
  sendAnalyticsCall('event', name, {
    event_category: 'webtomind',
    ...normalizeEventParams(params),
    ...getAnalyticsTrafficContext()
  });
}

export function trackLoginStart(method: 'email' | 'google' | 'microsoft') {
  trackEvent('login_start', { method });
}

export function getAuthRedirectContext(redirectTarget?: string | null): string {
  if (!redirectTarget) return 'none';
  if (/\/create\/prompts\/share\//.test(redirectTarget)) {
    return 'prompt_share';
  }
  if (/\/prompts(?:\/|$)/.test(redirectTarget)) {
    return 'prompt_detail_or_library';
  }
  if (/\/create(?:\/|$)/.test(redirectTarget)) {
    return 'image_create';
  }
  if (/\/pricing(?:\/|$)/.test(redirectTarget)) {
    return 'pricing';
  }
  if (/\/boards(?:\/|$)/.test(redirectTarget)) {
    return 'workspace';
  }
  return 'other';
}

export function trackSignupStart(method: 'email' | 'google') {
  trackEvent('sign_up_start', { method });
}

export function trackPromptShareView(params: {
  caseId: string;
  slug?: string;
  source?: string;
}) {
  trackEvent('prompt_share_view', {
    prompt_case_id: params.caseId,
    prompt_case_slug: params.slug,
    source: params.source
  });
}

export function trackPromptCopy(params: { caseId?: string; source: string }) {
  trackEvent('prompt_copy', {
    prompt_case_id: params.caseId,
    source: params.source
  });
}

export function trackPromptGenerate(params: {
  caseId?: string;
  source: string;
  authenticated: boolean;
}) {
  trackEvent('prompt_generate_click', {
    prompt_case_id: params.caseId,
    source: params.source,
    authenticated: params.authenticated
  });
}

type PromptPreviewEventParams = {
  caseId?: string;
  caseSlug?: string;
  model?: string;
  packageSlug?: string;
  source: string;
  path: string;
  locale: string;
  pageType?: string;
  pageSlug?: string;
};

function getPromptPreviewEventParams(
  params: PromptPreviewEventParams
): Record<string, unknown> {
  return {
    prompt_case_id: params.caseId,
    prompt_case_slug: params.caseSlug,
    prompt_model: params.model,
    prompt_package: params.packageSlug,
    cta_source: params.source,
    path: params.path,
    locale: params.locale,
    prompt_page_type: params.pageType,
    prompt_page_slug: params.pageSlug
  };
}

export function trackPromptPreviewView(params: PromptPreviewEventParams) {
  trackEvent('prompt_preview_view', getPromptPreviewEventParams(params));
}

export function trackPromptPreviewCopy(
  params: PromptPreviewEventParams & {
    copySuccess: boolean;
    failureReason?: string;
  }
) {
  trackEvent('prompt_preview_copy', {
    ...getPromptPreviewEventParams(params),
    copy_success: params.copySuccess,
    failure_reason: params.failureReason
  });
}

export function trackPromptPreviewUse(params: PromptPreviewEventParams) {
  trackEvent('prompt_preview_use', getPromptPreviewEventParams(params));
}

export function trackPromptCaseCta(params: {
  action: 'view' | 'click';
  caseId?: string;
  source: string;
  authenticated?: boolean;
  locked?: boolean;
  locale?: string;
}) {
  trackEvent(
    params.action === 'view' ? 'prompt_case_cta_view' : 'prompt_case_cta_click',
    {
      prompt_case_id: params.caseId,
      cta_source: params.source,
      authenticated: params.authenticated,
      locked: params.locked,
      locale: params.locale
    }
  );
}

export function trackPricingView(
  source: string,
  params: Record<string, unknown> = {},
  dedupeKey?: string
) {
  if (dedupeKey) {
    const key = `pricing_view:${dedupeKey}`;
    if (trackedEventKeys.has(key)) return;
    trackedEventKeys.add(key);
  }
  trackEvent('pricing_view', { source, ...params });
}

export function trackCheckoutStart(params: {
  planId: string;
  billingCycle: 'monthly' | 'yearly';
  paymentProvider?: 'stripe' | 'alipay';
  checkoutType?: 'subscription' | 'credit_package';
  value?: number;
  currency?: string;
  ctaSource?: string;
  productName?: string;
  recommendedPlanName?: string;
  pricingIntent?: string;
  authenticated?: boolean;
}) {
  const currency = params.currency || 'USD';
  const itemName = params.productName || params.planId;
  trackEvent('checkout_start', {
    plan_id: params.planId,
    billing_cycle: params.billingCycle,
    payment_provider: params.paymentProvider,
    checkout_type: params.checkoutType,
    value: params.value,
    currency,
    cta_source: params.ctaSource,
    recommended_plan_name: params.recommendedPlanName,
    pricing_intent: params.pricingIntent,
    authenticated: params.authenticated
  });
  trackEvent('begin_checkout', {
    currency,
    value: params.value,
    checkout_type: params.checkoutType,
    product_id: params.planId,
    billing_cycle: params.billingCycle,
    payment_provider: params.paymentProvider,
    cta_source: params.ctaSource,
    recommended_plan_name: params.recommendedPlanName,
    pricing_intent: params.pricingIntent,
    authenticated: params.authenticated,
    items: [
      {
        item_id: params.planId,
        item_name: itemName,
        item_category: params.checkoutType || 'membership',
        price: params.value,
        quantity: 1
      }
    ]
  });
}

export function setAnalyticsUserId(userId: string | null) {
  sendAnalyticsCall('config', GA_MEASUREMENT_ID, {
    send_page_view: false,
    user_id: userId
  });
}

export function trackPurchase(params: {
  transactionId: string;
  value?: number;
  currency?: string;
  checkoutType?: 'subscription' | 'credit_package';
  productId?: string;
  productName?: string;
  billingCycle?: 'monthly' | 'yearly';
  ctaSource?: string;
  recommendedPlanName?: string;
  pricingIntent?: string;
}) {
  if (trackedPurchaseIds.has(params.transactionId)) return;
  trackedPurchaseIds.add(params.transactionId);
  const currency = params.currency || 'USD';
  const itemId = params.productId || params.checkoutType || 'webtomind';
  const itemName = params.productName || params.productId || itemId;

  trackEvent('purchase', {
    transaction_id: params.transactionId,
    value: params.value,
    currency,
    checkout_type: params.checkoutType,
    product_id: params.productId,
    billing_cycle: params.billingCycle,
    cta_source: params.ctaSource,
    recommended_plan_name: params.recommendedPlanName,
    pricing_intent: params.pricingIntent,
    items: [
      {
        item_id: itemId,
        item_name: itemName,
        item_category: params.checkoutType || 'membership',
        price: params.value,
        quantity: 1
      }
    ]
  });
}

export function trackImageGenerationEvent(
  name:
    | 'create_entry_view'
    | 'activation_context_ready'
    | 'first_generate_cta_view'
    | 'first_result_next_action'
    | 'generate_click'
    | 'generation_queued'
    | 'generation_success'
    | 'generation_failed'
    | 'generation_cancelled'
    | 'post_generation_upsell_view'
    | 'post_generation_upsell_click'
    | 'post_generation_upsell_dismiss'
    | 'low_balance_upsell_view'
    | 'low_balance_upsell_click'
    | 'cost_panel_view'
    | 'credit_blocked'
    | 'retry_click'
    | 'failure_feedback_submit'
    | 'recipe_apply'
    | 'recipe_run'
    | 'recipe_save',
  params: Record<string, unknown> = {}
) {
  if (IMAGE_GENERATION_TERMINAL_EVENTS.has(name)) {
    const taskId =
      typeof params.task_id === 'string' ? params.task_id.trim() : '';
    if (
      taskId &&
      !rememberTerminalEvent(`image_generation_terminal:${name}:${taskId}`)
    ) {
      return;
    }
  }
  trackEvent(name, params);
}
import { getAnalyticsTrafficContext } from './analytics-test-context';
