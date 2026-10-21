export const origin = 'https://siskill.dev';
export const sitemapUrl = origin + '/sitemap.xml';
export function sitemapUrls(xml, expected) {
  const urls = [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)].map(
    (m) => m[1]
  );
  if (!urls.length || new Set(urls).size !== urls.length)
    throw Error('INVALID_SITEMAP');
  for (const value of urls) {
    const u = new URL(value);
    if (
      u.origin !== origin ||
      u.search ||
      u.hash ||
      !/^\/(en-US|zh-CN)\//.test(u.pathname) ||
      u.pathname.endsWith('/account')
    )
      throw Error('OUT_OF_SCOPE_SITEMAP_URL');
  }
  if (
    expected &&
    (expected.length !== urls.length ||
      expected.some((url) => !urls.includes(url)))
  )
    throw Error('SITEMAP_RELEASE_MISMATCH');
  return urls;
}
function attributes(tag) {
  return Object.fromEntries(
    [...tag.matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/g)].map((m) => [
      m[1].toLowerCase(),
      m[2]
    ])
  );
}
export function pageSignals(html, url, status) {
  const links = [...html.matchAll(/<link\b[^>]*>/gi)].map((m) =>
    attributes(m[0])
  );
  const metas = [...html.matchAll(/<meta\b[^>]*>/gi)].map((m) =>
    attributes(m[0])
  );
  const canonical = links.filter((l) => l.rel === 'canonical');
  const robots = metas
    .filter((m) => m.name === 'robots')
    .map((m) => m.content || '')
    .join(',');
  const alternates = links.filter((l) => l.rel === 'alternate' && l.hreflang);
  const json = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter((m) => attributes(m[1]).type === 'application/ld+json')
    .flatMap((m) => {
      const v = JSON.parse(m[2]);
      return Array.isArray(v) ? v : [v];
    });
  const errors = [];
  if (status !== 200) errors.push('HTTP_NOT_200');
  if (canonical.length !== 1 || canonical[0].href !== url)
    errors.push('CANONICAL_MISMATCH');
  if (!robots.includes('index') || robots.includes('noindex'))
    errors.push('NOT_INDEXABLE');
  const path = new URL(url).pathname.replace(/^\/(en-US|zh-CN)/, '');
  for (const locale of ['en-US', 'zh-CN', 'x-default'])
    if (
      !alternates.some(
        (a) =>
          a.hreflang === locale &&
          a.href ===
            `${origin}/${locale === 'x-default' ? 'en-US' : locale}${path}`
      )
    )
      errors.push('LANGUAGE_ALTERNATE_MISMATCH');
  if (!/<h1\b/.test(html) || !/<main\b/.test(html))
    errors.push('PUBLIC_CONTENT_MISSING');
  if (!json.some((v) => v['@type'] === 'BreadcrumbList'))
    errors.push('BREADCRUMB_MISSING');
  return {
    url,
    status,
    canonical: canonical[0]?.href || null,
    robots,
    structuredData: json.map((v) => v['@type']),
    errors: [...new Set(errors)]
  };
}
export function chooseProperty(sites, requested) {
  const allowed = ['sc-domain:siskill.dev', 'https://siskill.dev/'];
  if (requested && !allowed.includes(requested))
    throw Error('OUT_OF_SCOPE_PROPERTY');
  const target = (requested ? [requested] : allowed)
    .map((id) =>
      sites.find(
        (s) => s.siteUrl === id && s.permissionLevel !== 'siteUnverifiedUser'
      )
    )
    .find(Boolean);
  if (!target) throw Error('SISKILL_PROPERTY_NOT_ACCESSIBLE');
  return target;
}
export async function searchConsoleStatus(
  auth,
  { site, submit = false, inspect = false } = {}
) {
  const { data } = await auth.request({
    url: 'https://www.googleapis.com/webmasters/v3/sites',
    timeout: 15000
  });
  const property = chooseProperty(data.siteEntry || [], site);
  const base = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property.siteUrl)}/sitemaps`;
  const before = await auth.request({ url: base, timeout: 15000 });
  const existing = (before.data.sitemap || []).find(
    (s) => s.path === sitemapUrl
  );
  let submission = 'not_requested';
  if (submit) {
    if (!['siteOwner', 'siteFullUser'].includes(property.permissionLevel))
      throw Error('SITEMAP_SUBMIT_PERMISSION_REQUIRED');
    if (existing) submission = 'already_submitted';
    else {
      try {
        await auth.request({
          url: `${base}/${encodeURIComponent(sitemapUrl)}`,
          method: 'PUT',
          timeout: 15000
        });
        submission = 'submitted';
      } catch {
        throw Object.assign(Error('SITEMAP_SUBMISSION_UNKNOWN'), {
          submission: 'unknown'
        });
      }
    }
  }
  let after = before;
  if (submit && !existing)
    try {
      after = await auth.request({ url: base, timeout: 15000 });
    } catch {
      throw Object.assign(Error('SITEMAP_SUBMITTED_READBACK_FAILED'), {
        submission
      });
    }
  const sitemap = (after.data.sitemap || []).find((s) => s.path === sitemapUrl);
  const inspections = [];
  if (inspect)
    for (const path of [
      '/en-US/overview',
      '/en-US/skills/creator-content-workflow',
      '/en-US/learn/install-skills'
    ]) {
      let data;
      try {
        ({ data } = await auth.request({
          url: 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect',
          method: 'POST',
          data: {
            inspectionUrl: origin + path,
            siteUrl: property.siteUrl,
            languageCode: 'en-US'
          },
          timeout: 20000
        }));
      } catch {
        throw Object.assign(Error('URL_INSPECTION_FAILED'), { submission });
      }
      const r = data.inspectionResult?.indexStatusResult || {};
      inspections.push({
        url: origin + path,
        verdict: r.verdict || null,
        coverageState: r.coverageState || null,
        indexingState: r.indexingState || null,
        lastCrawlTime: r.lastCrawlTime || null,
        googleCanonical: r.googleCanonical || null
      });
    }
  return {
    property,
    submission,
    sitemap: sitemap
      ? {
          path: sitemap.path,
          lastSubmitted: sitemap.lastSubmitted || null,
          lastDownloaded: sitemap.lastDownloaded || null,
          isPending: sitemap.isPending ?? null,
          errors: sitemap.errors ?? null,
          warnings: sitemap.warnings ?? null
        }
      : null,
    inspections,
    limitation:
      'Sitemap submission does not prove indexing. URL Inspection reports the indexed version, not a live test or an indexing request.'
  };
}
