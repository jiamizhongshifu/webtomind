import { beforeEach, afterEach, test, expect, vi } from 'vitest';
let analytics, storage, scripts, reload;
beforeEach(async () => {
  vi.resetModules();
  storage = new Map();
  scripts = [];
  reload = vi.fn();
  vi.stubGlobal('localStorage', {
    getItem: (k) => storage.get(k) || null,
    setItem: (k, v) => storage.set(k, v)
  });
  vi.stubGlobal('sessionStorage', { getItem: () => null });
  vi.stubGlobal('window', {
    location: {
      hostname: 'siskill.dev',
      href: 'https://siskill.dev/en-US/skills/og-image?code=PRIVATE#token=SECRET',
      reload
    }
  });
  vi.stubGlobal('document', {
    referrer: 'https://webtomind.com/private?email=PRIVATE',
    cookie: 'siskill_ga=1; unrelated=2',
    createElement: () => ({}),
    head: { append: (s) => scripts.push(s) }
  });
  analytics = await import('./analytics.ts');
});
afterEach(() => vi.unstubAllGlobals());
const events = () =>
  (window.dataLayer || [])
    .map((a) => Array.from(a))
    .filter((a) => a[0] === 'event');
test('no tag, cookies or buffered events before consent; decline can later be changed to allow', () => {
  analytics.startAnalytics();
  analytics.trackPage();
  analytics.track('login', { method: 'email' });
  expect(scripts).toHaveLength(0);
  expect(events()).toHaveLength(0);
  analytics.setConsent('denied');
  analytics.trackPage();
  expect(scripts).toHaveLength(0);
  analytics.setConsent('granted');
  expect(scripts).toHaveLength(1);
  expect(window['ga-disable-' + analytics.measurementId]).toBe(false);
  expect(events().map((e) => e[1])).toEqual(['page_view', 'view_item']);
  expect(JSON.stringify(window.dataLayer)).not.toMatch(/PRIVATE|SECRET|email=/);
});
test('same route and search changes do not double count; navigation away and back does', () => {
  analytics.setConsent('granted');
  analytics.trackPage();
  window.location.href = 'https://siskill.dev/en-US/skills/og-image?q=PRIVATE';
  analytics.trackPage();
  expect(events().filter((e) => e[1] === 'page_view')).toHaveLength(1);
  window.location.href = 'https://siskill.dev/en-US/account?order=PRIVATE';
  analytics.trackPage();
  window.location.href = 'https://siskill.dev/en-US/skills/og-image';
  analytics.trackPage();
  expect(events().filter((e) => e[1] === 'page_view')).toHaveLength(3);
});
test('only allowlisted event fields reach Google; checkout dedupe identifiers stay local', () => {
  analytics.setConsent('granted');
  const input = {
    slug: 'case-study-deck',
    provider: 'stripe',
    email: 'PRIVATE',
    url: 'SECRET',
    amount: 999
  };
  analytics.track('begin_checkout', input, 'ORDER_SECRET');
  analytics.track('begin_checkout', input, 'ORDER_SECRET');
  analytics.track('purchase', input);
  analytics.track('login', { method: 'malicious-private-value' });
  analytics.track('skill_download_verified', { slug: 'PRIVATE' });
  expect(events().filter((e) => e[1] === 'begin_checkout')).toHaveLength(1);
  expect(events().some((e) => e[1] === 'purchase')).toBe(false);
  expect(JSON.stringify(window.dataLayer)).not.toMatch(/PRIVATE|SECRET|999/);
});
test('revoking consent stops later events, disables the tag and unloads listeners', () => {
  analytics.setConsent('granted');
  const count = events().length;
  analytics.setConsent('denied');
  analytics.track('login', { method: 'email' });
  analytics.trackPage();
  expect(events()).toHaveLength(count);
  expect(reload).toHaveBeenCalledTimes(1);
  expect(window['ga-disable-' + analytics.measurementId]).toBe(true);
});
test('storage denial and telemetry failure do not break business actions', () => {
  localStorage.setItem = () => {
    throw Error('blocked');
  };
  expect(analytics.setConsent('granted')).toBe(false);
  expect(scripts).toHaveLength(0);
  storage.set(analytics.consentKey, 'granted');
  analytics.startAnalytics();
  window.gtag = () => {
    throw Error('tag failed');
  };
  expect(() => analytics.track('login', { method: 'email' })).not.toThrow();
});
test('preview hosts cannot pollute production, unknown URLs and attribution are redacted', () => {
  window.location.hostname = 'localhost';
  storage.set(analytics.consentKey, 'granted');
  analytics.startAnalytics();
  expect(scripts).toHaveLength(0);
  expect(
    analytics.safePage('https://siskill.dev/en-US/customer/PRIVATE')
  ).toMatchObject({ page_location: 'https://siskill.dev/en-US/not-found' });
  expect(analytics.safeReferrer('javascript:PRIVATE')).toBe('');
  expect(
    analytics.campaign(
      'https://siskill.dev/?utm_source=webtomind&utm_medium=referral&utm_campaign=product-family&utm_content=PRIVATE'
    )
  ).toEqual({
    campaign_source: 'webtomind',
    campaign_medium: 'referral',
    campaign_name: 'product-family'
  });
  expect(
    analytics.campaign(
      'https://siskill.dev/?utm_source=PRIVATE&utm_campaign=SECRET'
    )
  ).toEqual({});
});
