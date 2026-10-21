import catalog from './catalog.json';

// Public, independent SiSkill web stream. Never reuse WebToMind's destination.
export const measurementId = 'G-CJQ69SZLVD';
export const consentKey = 'siskill.analytics-consent.v1';
export type Consent = 'granted' | 'denied' | null;
type Params = Record<string, unknown>;
type Gtag = (...args: unknown[]) => void;
declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: Gtag;
  }
}
const origin = 'https://siskill.dev';
const routes = [
  '/overview',
  '/skills',
  '/skills/free',
  '/skills/pricing',
  '/learn/install-skills',
  '/account'
];
const slugs = new Set(catalog.map((s) => s.slug));
const plans = new Set(['pro_monthly', 'pro_yearly']);
let enabled = false;
let loaded = false;
let lastPage = '';
const checkoutIds = new Set<string>();

export function readConsent(): Consent {
  try {
    const value = localStorage.getItem(consentKey);
    return value === 'granted' || value === 'denied' ? value : null;
  } catch {
    return null;
  }
}
export function safePage(input: string) {
  const url = new URL(input, origin);
  const match = url.pathname.match(/^\/(en-US|zh-CN)(\/.*)$/);
  const locale = match?.[1] || 'en-US';
  const path = match?.[2].replace(/\/$/, '') || '/overview';
  const slug = path.startsWith('/skills/') ? path.slice(8) : '';
  const known = routes.includes(path) || slugs.has(slug);
  return {
    page_location: `${origin}/${locale}${known ? path : '/not-found'}`,
    page_title: `SiSkill · ${known ? path : '/not-found'}`,
    locale,
    ...(slugs.has(slug) ? { skill_slug: slug } : {})
  };
}
export function safeReferrer(input: string) {
  try {
    const url = new URL(input);
    return /^https?:$/.test(url.protocol) ? url.origin + '/' : '';
  } catch {
    return '';
  }
}
export function campaign(input: string): Params {
  const params = new URL(input, origin).searchParams;
  const allowed = {
    source: ['webtomind', 'x', 'wechat', 'youtube', 'newsletter'],
    medium: ['referral', 'social', 'email', 'organic'],
    name: ['product-family', 'siskill-launch', 'skill-marketplace']
  };
  const result: Params = {};
  for (const [key, values] of Object.entries(allowed)) {
    const value = params.get(`utm_${key === 'name' ? 'campaign' : key}`);
    if (value && values.includes(value)) result[`campaign_${key}`] = value;
  }
  return result;
}
export function eventParams(name: string, input: Params): Params | null {
  const slug =
    typeof input.slug === 'string' && slugs.has(input.slug) ? input.slug : null;
  if (name === 'login' && ['email', 'google'].includes(String(input.method)))
    return { method: input.method };
  if (name === 'skill_download_verified' && slug) return { skill_slug: slug };
  if (name === 'begin_checkout') {
    const item =
      slug ||
      (typeof input.plan === 'string' && plans.has(input.plan)
        ? input.plan
        : null);
    if (!item || !['stripe', 'alipay'].includes(String(input.provider)))
      return null;
    return {
      payment_provider: input.provider,
      items: [{ item_id: item, item_name: item, quantity: 1 }]
    };
  }
  return null;
}
function gtag(...args: unknown[]) {
  window.gtag?.(...args);
}
function base(): Params {
  let qa = false;
  try {
    qa = sessionStorage.getItem('siskill.analytics.qa') === 'true';
  } catch {
    /* optional */
  }
  return {
    ...safePage(window.location.href),
    page_referrer: safeReferrer(document.referrer),
    product: 'siskill',
    ...(qa ? { debug_mode: true, traffic_type: 'qa' } : {})
  };
}
export function startAnalytics() {
  if (readConsent() !== 'granted' || window.location.hostname !== 'siskill.dev')
    return;
  enabled = true;
  (window as unknown as Record<string, unknown>)[
    `ga-disable-${measurementId}`
  ] = false;
  if (loaded) return;
  loaded = true;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () {
    window.dataLayer!.push(arguments);
  };
  gtag('consent', 'default', {
    analytics_storage: 'granted',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied'
  });
  gtag('set', {
    ...base(),
    ...campaign(window.location.href),
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    ads_data_redaction: true
  });
  gtag('js', new Date());
  gtag('config', measurementId, {
    ...base(),
    send_page_view: false,
    cookie_prefix: 'siskill',
    cookie_domain: 'siskill.dev',
    cookie_expires: 15552000,
    allow_google_signals: false,
    allow_ad_personalization_signals: false
  });
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
  script.referrerPolicy = 'no-referrer';
  document.head.append(script);
}
export function trackPage() {
  if (!enabled || readConsent() !== 'granted') return;
  const page = base();
  gtag('set', page);
  if (lastPage === page.page_location) return;
  lastPage = String(page.page_location);
  gtag('event', 'page_view', { ...page, send_to: measurementId });
  if (page.skill_slug)
    gtag('event', 'view_item', {
      ...page,
      send_to: measurementId,
      items: [{ item_id: page.skill_slug, item_name: page.skill_slug }]
    });
}
export function track(name: string, input: Params = {}, dedupeId?: string) {
  // Never let optional telemetry interrupt authentication, payment or delivery.
  try {
    if (!enabled || readConsent() !== 'granted') return;
    const params = eventParams(name, input);
    if (!params) return;
    if (name === 'begin_checkout' && dedupeId) {
      if (checkoutIds.has(dedupeId)) return;
      checkoutIds.add(dedupeId); // identifiers stay in memory; never sent to Google
    }
    gtag('event', name, {
      ...base(),
      ...params,
      send_to: measurementId,
      transport_type: 'beacon'
    });
  } catch {
    /* optional analytics must fail open for the business flow */
  }
}
export function setConsent(value: Exclude<Consent, null>) {
  try {
    localStorage.setItem(consentKey, value);
  } catch {
    enabled = false;
    (window as unknown as Record<string, unknown>)[
      `ga-disable-${measurementId}`
    ] = true;
    return false;
  }
  if (value === 'denied') {
    enabled = false;
    (window as unknown as Record<string, unknown>)[
      `ga-disable-${measurementId}`
    ] = true;
    for (const cookie of document.cookie.split(';')) {
      const name = cookie.trim().split('=')[0];
      if (!name.startsWith('siskill_ga')) continue;
      for (const domain of [
        '',
        '; domain=siskill.dev',
        '; domain=.siskill.dev'
      ])
        document.cookie = `${name}=; Max-Age=0; path=/${domain}; SameSite=Lax; Secure`;
    }
    if (loaded) window.location.reload(); // unload engagement listeners and queued tags
  } else {
    startAnalytics();
    trackPage();
  }
  return true;
}
