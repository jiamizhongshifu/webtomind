#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { loadRuntimeEnv } from './lib/runtime-env.mjs';
import { googleReportClient } from './lib/google-report.mjs';
import {
  origin,
  sitemapUrl,
  sitemapUrls,
  pageSignals,
  searchConsoleStatus
} from '../apps/siskill/ops/search-console.mjs';
const { values } = parseArgs({
  options: {
    'env-file': { type: 'string' },
    'public-only': { type: 'boolean' },
    submit: { type: 'boolean' },
    inspect: { type: 'boolean' },
    site: { type: 'string' },
    output: { type: 'string' },
    help: { type: 'boolean' }
  }
});
if (values.help) {
  console.log(
    'SiSkill search checks: --public-only (no Google auth); --env-file PATH; --site sc-domain:siskill.dev; --submit (one sitemap, only when absent); --inspect (3 indexed URLs); --output PATH. No site ownership, API activation or analytics changes are made.'
  );
  process.exit(0);
}
if (values['public-only'] && (values.submit || values.inspect))
  throw Error('PUBLIC_ONLY_CONFLICT');
const report = {
  product: 'siskill',
  generatedAt: new Date().toISOString(),
  public: null,
  searchConsole: null,
  errors: []
};
let client;
try {
  const catalog = JSON.parse(
    await readFile(
      new URL('../apps/siskill/catalog.json', import.meta.url),
      'utf8'
    )
  );
  const paths = [
    '/overview',
    '/skills',
    '/skills/free',
    '/skills/pricing',
    '/learn/install-skills',
    ...catalog
      .filter((s) => s.availability === 'available')
      .map((s) => '/skills/' + s.slug)
  ];
  const expected = ['en-US', 'zh-CN'].flatMap((l) =>
    paths.map((p) => `${origin}/${l}${p}`)
  );
  const fetchPublic = (url) =>
    fetch(url, { signal: AbortSignal.timeout(15000), redirect: 'error' });
  const map = await fetchPublic(sitemapUrl);
  if (!map.ok) throw Error('SITEMAP_UNAVAILABLE');
  const urls = sitemapUrls(await map.text(), expected),
    pages = [];
  for (let i = 0; i < urls.length; i += 3) {
    const results = await Promise.allSettled(
      urls.slice(i, i + 3).map(async (url) => {
        const r = await fetchPublic(url);
        return pageSignals(await r.text(), url, r.status);
      })
    );
    for (const [j, r] of results.entries())
      pages.push(
        r.status === 'fulfilled'
          ? r.value
          : { url: urls[i + j], errors: ['PUBLIC_FETCH_FAILED'] }
      );
  }
  const robots = await fetchPublic(origin + '/robots.txt');
  const robotsText = await robots.text();
  const robotAdvertised =
    robots.ok && robotsText.includes('Sitemap: ' + sitemapUrl);
  report.public = {
    sitemapUrl,
    urls: urls.length,
    robotAdvertised,
    pages,
    pass: robotAdvertised && pages.every((p) => !p.errors.length)
  };
  if (!report.public.pass) throw Error('PUBLIC_SEARCH_CHECK_FAILED');
  if (!values['public-only']) {
    loadRuntimeEnv({
      extraFiles: values['env-file'] ? [values['env-file']] : []
    });
    client = googleReportClient(
      values.submit ? 'webmasters' : 'webmasters.readonly',
      'GSC'
    );
    report.searchConsole = await searchConsoleStatus(
      await client.auth.getClient(),
      { site: values.site, submit: values.submit, inspect: values.inspect }
    );
  }
} catch (e) {
  if (e.submission)
    report.searchConsole = {
      submission: e.submission,
      verificationComplete: false
    };
  const reason = e.response?.data?.error?.errors?.[0]?.reason;
  report.errors.push(
    reason === 'accessNotConfigured'
      ? 'SEARCH_CONSOLE_API_DISABLED'
      : e.response?.status === 403
        ? 'GOOGLE_ACCESS_DENIED'
        : e.response?.status === 401
          ? 'GOOGLE_AUTH_REQUIRED'
          : /^[A-Z_]+$/.test(e.message)
            ? e.message
            : 'SEARCH_CHECK_FAILED'
  );
  process.exitCode = 1;
} finally {
  if (client) await client.close();
}
const file = resolve(
  values.output ||
    `output/siskill-ops/${new Date().toISOString().slice(0, 10)}/search.json`
);
await mkdir(dirname(file), { recursive: true, mode: 0o700 });
await writeFile(file, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
console.log(
  JSON.stringify({
    report: file,
    publicPass: report.public?.pass ?? false,
    publicUrls: report.public?.urls ?? 0,
    googleChecked: Boolean(report.searchConsole),
    submission: report.searchConsole?.submission || 'not_performed',
    errors: report.errors
  })
);
