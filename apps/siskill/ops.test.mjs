import { test, expect } from 'vitest';
import { commerceSummary } from './ops/commerce-report.mjs';
import {
  chooseProperty,
  searchConsoleStatus,
  sitemapUrls,
  pageSignals,
  sitemapUrl
} from './ops/search-console.mjs';
test('commerce excludes explicit QA and unknown owners, preserves separate currencies and omits private identifiers', () => {
  const rows = [
    {
      id: 'one-private',
      user_id: 'owner-private',
      status: 'paid',
      currency: 'usd',
      amount: 999
    },
    { id: 'two', user_id: 'qa', status: 'paid', currency: 'usd', amount: 5000 },
    {
      id: 'three',
      user_id: 'unavailable',
      status: 'paid',
      currency: 'usd',
      amount: 100
    },
    {
      id: 'four',
      user_id: 'owner-private',
      status: 'paid',
      currency: 'cny',
      amount: 6900
    },
    {
      id: 'five',
      user_id: 'owner-private',
      status: 'paid',
      currency: 'usd',
      amount: 999
    },
    {
      id: 'six',
      user_id: 'owner-private',
      status: 'refunded',
      currency: 'usd',
      amount: 999
    }
  ];
  const r = commerceSummary({
    orders: rows,
    memberships: [{ user_id: 'owner-private', state: 'bound' }],
    paymentEvents: rows
      .filter((o) => o.id !== 'five')
      .map((o) => ({ order_id: o.id, kind: 'paid' })),
    owners: new Map([
      ['owner-private', 'customer'],
      ['qa', 'qa']
    ]),
    start: '2026-10-01',
    end: '2026-11-01'
  });
  expect(r.orders.count).toBe(4);
  expect(r.exclusions.qaOrders).toBe(1);
  expect(r.exclusions.unknownOwnerOrders).toBe(1);
  expect(r.orders.retainedPaidOrderValueMinorUnits).toEqual({
    usd: 999,
    cny: 6900
  });
  expect(r.orders.paidWithoutRecordedPaymentEvent).toBe(1);
  expect(r.memberships.activePaidMembers).toBeNull();
  expect(r.funnel.conversionRate).toBeNull();
  expect(JSON.stringify(r)).not.toContain('owner-private');
  expect(JSON.stringify(r)).not.toContain('one-private');
});
test('empty commerce does not invent visitors or turn unavailable telemetry into zero', () => {
  const r = commerceSummary({
    orders: [],
    memberships: [],
    paymentEvents: [],
    owners: new Map(),
    start: 'a',
    end: 'b'
  });
  expect(r.orders.count).toBe(0);
  expect(r.funnel.visits).toBeNull();
  expect(r.funnel.verifiedDownloads).toBeNull();
});
test('search operations only use a verified SiSkill property', () => {
  expect(() =>
    chooseProperty([
      { siteUrl: 'sc-domain:webtomind.com', permissionLevel: 'siteOwner' }
    ])
  ).toThrow('SISKILL_PROPERTY_NOT_ACCESSIBLE');
  expect(() => chooseProperty([], 'sc-domain:other.dev')).toThrow(
    'OUT_OF_SCOPE_PROPERTY'
  );
  expect(() =>
    chooseProperty([
      {
        siteUrl: 'sc-domain:siskill.dev',
        permissionLevel: 'siteUnverifiedUser'
      }
    ])
  ).toThrow();
});
function fake(existing = false, permission = 'siteOwner', failPut = false) {
  const calls = [];
  let submitted = existing;
  return {
    calls,
    request: async (r) => {
      calls.push(r);
      if (r.url.endsWith('/sites'))
        return {
          data: {
            siteEntry: [
              { siteUrl: 'sc-domain:siskill.dev', permissionLevel: permission }
            ]
          }
        };
      if (r.method === 'PUT') {
        if (failPut) throw Error('network');
        submitted = true;
        return { data: {} };
      }
      return {
        data: {
          sitemap: submitted ? [{ path: sitemapUrl, isPending: true }] : []
        }
      };
    }
  };
}
test('read-only checks never submit; existing submission is not duplicated', async () => {
  for (const [existing, submit] of [
    [false, false],
    [true, true]
  ]) {
    const auth = fake(existing);
    const r = await searchConsoleStatus(auth, { submit });
    expect(auth.calls.some((c) => c.method === 'PUT')).toBe(false);
    expect(r.submission).toBe(existing ? 'already_submitted' : 'not_requested');
  }
});
test('explicit submit is scoped and read back, pending is not indexed', async () => {
  const auth = fake();
  const r = await searchConsoleStatus(auth, { submit: true });
  const put = auth.calls.find((c) => c.method === 'PUT');
  expect(put.url).toContain(encodeURIComponent('sc-domain:siskill.dev'));
  expect(put.url).toContain(encodeURIComponent(sitemapUrl));
  expect(put.data).toBeUndefined();
  expect(r.submission).toBe('submitted');
  expect(r.sitemap.isPending).toBe(true);
  expect(r.inspections).toEqual([]);
});
test('restricted users cannot submit and uncertain writes are not retried or reported as absent', async () => {
  const restricted = fake(false, 'siteRestrictedUser');
  await expect(
    searchConsoleStatus(restricted, { submit: true })
  ).rejects.toThrow('SITEMAP_SUBMIT_PERMISSION_REQUIRED');
  expect(restricted.calls.some((c) => c.method === 'PUT')).toBe(false);
  const auth = fake(false, 'siteOwner', true);
  await expect(
    searchConsoleStatus(auth, { submit: true })
  ).rejects.toMatchObject({ submission: 'unknown' });
  expect(auth.calls.filter((c) => c.method === 'PUT')).toHaveLength(1);
});
test('sitemap rejects foreign URLs, private pages, duplicates and release mismatch', () => {
  for (const u of [
    'https://other.dev/en-US/skills',
    'https://siskill.dev/en-US/account',
    'https://siskill.dev/en-US/skills?q=private'
  ])
    expect(() => sitemapUrls(`<loc>${u}</loc>`)).toThrow();
  expect(() =>
    sitemapUrls('<loc>https://siskill.dev/en-US/skills</loc>', [
      'https://siskill.dev/en-US/overview'
    ])
  ).toThrow('SITEMAP_RELEASE_MISMATCH');
});
test('public SEO verifier detects duplicate canonical, noindex and missing content', () => {
  const r = pageSignals(
    '<link rel="canonical" href="https://other.dev"><meta name="robots" content="noindex,follow">',
    'https://siskill.dev/en-US/skills',
    200
  );
  expect(r.errors).toContain('CANONICAL_MISMATCH');
  expect(r.errors).toContain('NOT_INDEXABLE');
  expect(r.errors).toContain('PUBLIC_CONTENT_MISSING');
});
