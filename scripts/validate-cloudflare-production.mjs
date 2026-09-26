#!/usr/bin/env node

import { Resolver } from 'node:dns/promises';
import { execFile as execFileCallback } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import {
  checkPromptCaseImages,
  formatPromptCaseImageSummary
} from './check-prompt-case-images.mjs';

for (const key of [
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'ALL_PROXY',
  'http_proxy',
  'https_proxy',
  'all_proxy'
]) {
  delete process.env[key];
}

const baseUrl = process.env.CF_VALIDATE_BASE_URL || 'https://webtomind.com';
const seoOnly = process.argv.includes('--seo-only');
const includeMutationSmoke =
  process.argv.includes('--include-mutations') ||
  process.env.CF_VALIDATE_INCLUDE_MUTATIONS === 'true';
const canonicalHost = new URL(baseUrl).hostname;
const forceResolve = process.env.CF_VALIDATE_FORCE_RESOLVE === 'true';
const expectedEntryScript = getExpectedEntryScript();
const resolver = new Resolver();
resolver.setServers(['1.1.1.1', '8.8.8.8']);
const execFile = promisify(execFileCallback);
let cachedCloudflareAddress;

const checks = [];

function addCheck(name, run) {
  checks.push({ name, run });
}

function fail(message, details) {
  const error = new Error(message);
  if (details) error.details = details;
  throw error;
}

function assert(condition, message, details) {
  if (!condition) fail(message, details);
}

function getExpectedEntryScript() {
  const indexPath = path.join(process.cwd(), 'server/public/index.html');
  if (!existsSync(indexPath)) return null;
  const html = readFileSync(indexPath, 'utf8');
  return (
    getScriptSources(html).find((src) =>
      /\/assets\/index\.[^/]+\.js$/.test(src)
    ) || null
  );
}

export function validateImageModelsPayload(data) {
  const models = Array.isArray(data?.models) ? data.models : [];
  const modelIds = models
    .map((model) => (typeof model?.id === 'string' ? model.id.trim() : ''))
    .filter(Boolean);
  const invalidModelCount = models.length - modelIds.length;
  const hasCuratedGptImage25 = modelIds.includes('gpt-image-2.5');
  const retiredGptImageModels = modelIds.filter(
    (id) => id === 'gpt-image-2' || id.includes('codex-gpt-image-2')
  );
  const forbiddenGpt5Models = modelIds.filter((id) => id.startsWith('gpt-5'));
  const valid =
    Array.isArray(data?.models) &&
    models.length > 0 &&
    invalidModelCount === 0 &&
    hasCuratedGptImage25 &&
    retiredGptImageModels.length === 0 &&
    forbiddenGpt5Models.length === 0;

  return {
    valid,
    modelCount: models.length,
    modelIds,
    invalidModelCount,
    hasCuratedGptImage25,
    retiredGptImageModels,
    forbiddenGpt5Models
  };
}

function header(response, name) {
  return response.headers.get(name);
}

function assertObservabilityHeaders(response, label) {
  const requestId = header(response, 'x-webtomind-request-id');
  const runtime = header(response, 'x-webtomind-runtime');
  const originRuntime = header(response, 'x-webtomind-origin-runtime');
  const route = header(response, 'x-webtomind-route');
  const serverTiming = header(response, 'server-timing');

  assert(Boolean(requestId), `${label} is missing x-webtomind-request-id`);
  assert(
    runtime === 'cloudflare-worker',
    `${label} has unexpected x-webtomind-runtime`,
    {
      runtime
    }
  );
  assert(
    originRuntime === 'cloudflare-worker',
    `${label} has unexpected x-webtomind-origin-runtime`,
    { originRuntime }
  );
  assert(Boolean(route), `${label} is missing x-webtomind-route`);
  assert(
    /(?:^|,\s*)app;dur=\d+/.test(serverTiming || ''),
    `${label} is missing app Server-Timing`,
    { serverTiming }
  );
}

async function getCloudflareAddress() {
  if (!cachedCloudflareAddress) {
    const addresses = await resolver.resolve4(canonicalHost);
    cachedCloudflareAddress = addresses[0];
  }
  return cachedCloudflareAddress;
}

function parseHeaders(raw) {
  const normalized = raw.replace(/\r\n/g, '\n');
  const blocks = normalized.split(/\n\n/);
  let headerIndex = -1;
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    if (blocks[index].startsWith('HTTP/')) {
      headerIndex = index;
      break;
    }
  }
  if (headerIndex === -1)
    fail('curl response did not include HTTP headers', {
      raw: normalized.slice(0, 500)
    });

  const headerLines = blocks[headerIndex].split('\n').filter(Boolean);
  const statusMatch = headerLines[0].match(/^HTTP\/\S+\s+(\d+)/);
  if (!statusMatch)
    fail('curl response had an invalid status line', {
      statusLine: headerLines[0]
    });

  const headers = new Map();
  for (const line of headerLines.slice(1)) {
    const separator = line.indexOf(':');
    if (separator === -1) continue;
    headers.set(
      line.slice(0, separator).trim().toLowerCase(),
      line.slice(separator + 1).trim()
    );
  }

  return {
    status: Number(statusMatch[1]),
    headers: {
      get(name) {
        return headers.get(name.toLowerCase()) || null;
      }
    },
    body: blocks.slice(headerIndex + 1).join('\n\n')
  };
}

async function curlResponse(url, init = {}) {
  const target = new URL(url);
  const env = { ...process.env };
  for (const key of [
    'HTTP_PROXY',
    'HTTPS_PROXY',
    'ALL_PROXY',
    'http_proxy',
    'https_proxy',
    'all_proxy'
  ]) {
    delete env[key];
  }

  const args = ['-sS', '--connect-timeout', '12', '--max-time', '30'];

  if (forceResolve) {
    const cloudflareAddress = await getCloudflareAddress();
    args.push('--resolve', `${target.hostname}:443:${cloudflareAddress}`);
  }

  if (init.method === 'HEAD') {
    for (const [name, value] of Object.entries(init.headers || {})) {
      args.push('-H', `${name}: ${value}`);
    }
    args.push('-I', url);
  } else {
    if (init.method) {
      args.push('-X', init.method);
    }
    for (const [name, value] of Object.entries(init.headers || {})) {
      args.push('-H', `${name}: ${value}`);
    }
    if (init.body !== undefined) {
      args.push(
        '-H',
        'content-type: application/json',
        '--data-binary',
        init.body
      );
    }
    args.push('-D', '-', '-o', '-', url);
  }

  const { stdout } = await execFile('curl', args, {
    env,
    maxBuffer: 2 * 1024 * 1024
  });
  return parseHeaders(stdout);
}

async function expectHead(path, expectedStatus = 200) {
  const response = await curlResponse(`${baseUrl}${path}`, { method: 'HEAD' });
  assert(
    response.status === expectedStatus,
    `${path} returned ${response.status}`,
    {
      expectedStatus,
      actualStatus: response.status
    }
  );
  assert(
    header(response, 'server') === 'cloudflare',
    `${path} is not served through Cloudflare`,
    {
      server: header(response, 'server')
    }
  );
  assertObservabilityHeaders(response, path);
  assert(!header(response, 'x-robots-tag'), `${path} includes x-robots-tag`, {
    xRobotsTag: header(response, 'x-robots-tag')
  });
  return response;
}

function getScriptSources(html) {
  return [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)]
    .map((match) => match[1])
    .filter((src) => src.startsWith('/'));
}

function getCanonicalHref(html) {
  const linkTags = html.match(/<link\b[^>]*>/gi) || [];
  for (const tag of linkTags) {
    if (!/\brel=["']canonical["']/i.test(tag)) continue;
    const href = tag.match(/\bhref=["']([^"']+)["']/i);
    if (href?.[1]) return href[1];
  }
  return null;
}

function decodeHtmlEntities(value) {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCodePoint(Number.parseInt(code, 16))
    );
}

function textFromHtml(value) {
  return decodeHtmlEntities(
    value
      .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

function getTagText(html, tagName) {
  const match = html.match(
    new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i')
  );
  return match?.[1] ? textFromHtml(match[1]) : '';
}

function getMetaContent(html, name) {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const nameMatch = tag.match(/\b(?:name|property)=["']([^"']+)["']/i);
    if (nameMatch?.[1]?.toLowerCase() !== name.toLowerCase()) continue;
    const content = tag.match(/\bcontent=["']([^"']*)["']/i);
    if (content) return decodeHtmlEntities(content[1]).trim();
  }
  return '';
}

function getBodyText(html) {
  const body = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] || html;
  return textFromHtml(body);
}

function countJsonLd(html) {
  return (
    html.match(/<script\b[^>]*\btype=["']application\/ld\+json["'][^>]*>/gi) ||
    []
  ).length;
}

function hasAnyKeyword(text, keywords) {
  const normalized = text.toLowerCase();
  return keywords.some((keyword) => normalized.includes(keyword.toLowerCase()));
}

async function expectPromptSeoVisibleHtml({
  path,
  expectedCanonical,
  minJsonLd = 2,
  minBodyTextLength = 260,
  requiredBodyKeywordGroups = [],
  validateSocialImage = false
}) {
  const response = await curlResponse(`${baseUrl}${path}`);
  assert(response.status === 200, `${path} returned ${response.status}`, {
    status: response.status
  });
  assert(
    header(response, 'server') === 'cloudflare',
    `${path} is not served through Cloudflare`,
    {
      server: header(response, 'server')
    }
  );
  assertObservabilityHeaders(response, path);
  assert(!header(response, 'x-robots-tag'), `${path} includes x-robots-tag`, {
    xRobotsTag: header(response, 'x-robots-tag')
  });

  const title = getTagText(response.body, 'title');
  const description = getMetaContent(response.body, 'description');
  const canonical = getCanonicalHref(response.body);
  const h1 = getTagText(response.body, 'h1');
  const bodyText = getBodyText(response.body);
  const jsonLdCount = countJsonLd(response.body);

  assert(title.length >= 8, `${path} is missing a useful <title>`, { title });
  assert(
    description.length >= 30,
    `${path} is missing a useful meta description`,
    {
      description
    }
  );
  assert(canonical === expectedCanonical, `${path} canonical mismatch`, {
    canonical,
    expectedCanonical
  });
  assert(jsonLdCount >= minJsonLd, `${path} has too few JSON-LD blocks`, {
    jsonLdCount,
    minJsonLd
  });
  assert(
    h1.length >= 4 || bodyText.length >= minBodyTextLength,
    `${path} first HTML is missing a non-empty H1 or meaningful body copy`,
    { h1, bodyTextLength: bodyText.length, minBodyTextLength }
  );
  assert(
    bodyText.length >= minBodyTextLength,
    `${path} first HTML body is too thin`,
    {
      bodyTextLength: bodyText.length,
      minBodyTextLength,
      h1
    }
  );

  for (const keywords of requiredBodyKeywordGroups) {
    assert(
      hasAnyKeyword(bodyText, keywords),
      `${path} first HTML body is missing expected SEO copy`,
      {
        keywords,
        bodyTextPreview: bodyText.slice(0, 500)
      }
    );
  }

  let socialImageSummary = '';
  if (validateSocialImage) {
    const socialImage =
      getMetaContent(response.body, 'twitter:image') ||
      getMetaContent(response.body, 'og:image');
    assert(Boolean(socialImage), `${path} is missing a social card image`);
    assert(
      !socialImage.includes('/api/prompt-og'),
      `${path} social card image still points at the Worker SVG fallback`,
      { socialImage }
    );
    const imageUrl = new URL(socialImage, baseUrl).toString();
    const imageResponse = await curlResponse(imageUrl, { method: 'HEAD' });
    const contentType = header(imageResponse, 'content-type') || '';
    const contentLength = Number(header(imageResponse, 'content-length') || 0);
    assert(
      imageResponse.status >= 200 && imageResponse.status < 300,
      `${path} social card image is not fetchable`,
      { socialImage: imageUrl, status: imageResponse.status }
    );
    assert(
      /^image\/(?:png|jpe?g|webp|gif)\b/i.test(contentType),
      `${path} social card image has an unsupported content type`,
      { socialImage: imageUrl, contentType }
    );
    assert(
      contentLength === 0 || contentLength <= 5 * 1024 * 1024,
      `${path} social card image is too large for X cards`,
      { socialImage: imageUrl, contentLength }
    );
    socialImageSummary = ` socialImage=${contentType}${contentLength ? ` ${contentLength}b` : ''}`;
  }

  return `title="${title}" h1="${h1 || 'none'}" body=${bodyText.length} jsonLd=${jsonLdCount}${socialImageSummary}`;
}

async function expectCanonical(path, expectedCanonical) {
  const response = await curlResponse(`${baseUrl}${path}`);
  assert(response.status === 200, `${path} returned ${response.status}`, {
    status: response.status
  });
  assert(
    header(response, 'server') === 'cloudflare',
    `${path} is not served through Cloudflare`,
    {
      server: header(response, 'server')
    }
  );
  assertObservabilityHeaders(response, path);
  assert(!header(response, 'x-robots-tag'), `${path} includes x-robots-tag`, {
    xRobotsTag: header(response, 'x-robots-tag')
  });
  const canonical = getCanonicalHref(response.body);
  assert(canonical === expectedCanonical, `${path} canonical mismatch`, {
    canonical,
    expectedCanonical
  });
  return canonical;
}

async function expectNonIndexableMissingSeoPath(path) {
  const response = await curlResponse(`${baseUrl}${path}`);
  assert(
    response.status === 404 ||
      header(response, 'x-robots-tag')?.includes('noindex'),
    `${path} is an indexable soft 404`,
    {
      status: response.status,
      xRobotsTag: header(response, 'x-robots-tag')
    }
  );
  const canonical = getCanonicalHref(response.body);
  assert(
    canonical !== `${baseUrl}/`,
    `${path} canonical falls back to homepage`,
    {
      canonical
    }
  );
  return `${response.status} ${header(response, 'x-robots-tag') || 'html noindex checked'}`;
}

async function expectHtmlScripts(path) {
  const cacheBustedUrl = new URL(`${baseUrl}${path}`);
  cacheBustedUrl.searchParams.set(
    '__cf_validate',
    process.env.GITHUB_SHA || Date.now().toString()
  );
  const response = await curlResponse(cacheBustedUrl.toString());
  assert(response.status === 200, `${path} returned ${response.status}`, {
    status: response.status
  });
  assert(
    header(response, 'server') === 'cloudflare',
    `${path} is not served through Cloudflare`,
    {
      server: header(response, 'server')
    }
  );
  assertObservabilityHeaders(response, path);

  const scripts = getScriptSources(response.body);
  assert(scripts.length > 0, `${path} did not include any local script tags`);
  if (expectedEntryScript) {
    assert(
      scripts.includes(expectedEntryScript),
      `${path} is serving stale app shell assets`,
      {
        expectedEntryScript,
        scripts
      }
    );
  }

  for (const src of scripts) {
    const assetResponse = await curlResponse(`${baseUrl}${src}`, {
      method: 'HEAD'
    });
    assert(
      assetResponse.status === 200,
      `${path} script ${src} returned ${assetResponse.status}`,
      {
        src,
        status: assetResponse.status
      }
    );
    assert(
      header(assetResponse, 'server') === 'cloudflare',
      `${path} script ${src} is not served through Cloudflare`,
      {
        src,
        server: header(assetResponse, 'server')
      }
    );
    assertObservabilityHeaders(assetResponse, `${path} script ${src}`);
  }

  return scripts.join(', ');
}

async function getPromptCaseValidationSlug() {
  const path = '/api/content/prompt-cases?locale=zh-CN&limit=20';
  const response = await curlResponse(`${baseUrl}${path}`);
  assert(response.status === 200, `${path} returned ${response.status}`, {
    status: response.status
  });
  assert(
    header(response, 'server') === 'cloudflare',
    `${path} is not served through Cloudflare`,
    {
      server: header(response, 'server')
    }
  );
  assertObservabilityHeaders(response, path);
  const data = JSON.parse(response.body);
  const slug = data.cases?.find(
    (item) => typeof item?.slug === 'string' && item.slug.length > 0
  )?.slug;
  assert(
    typeof slug === 'string' && slug.length > 0,
    `${path} did not include any prompt case with a slug`,
    data
  );
  return slug;
}

addCheck('registrar NS points at Cloudflare', async () => {
  const ns = (await resolver.resolveNs(canonicalHost))
    .map((value) => value.toLowerCase())
    .sort();
  assert(
    ns.includes('fonzie.ns.cloudflare.com') &&
      ns.includes('veda.ns.cloudflare.com'),
    'Unexpected NS records',
    {
      ns
    }
  );
  return ns.join(', ');
});

addCheck('apex resolves to Cloudflare proxy IPs', async () => {
  const addresses = await resolver.resolve4(canonicalHost);
  assert(addresses.length > 0, 'No A records returned for apex');
  assert(
    !addresses.includes('216.150.1.1'),
    'Apex still exposes Vercel origin IP',
    { addresses }
  );
  return addresses.join(', ');
});

for (const [name, expected] of [
  ['imap', 'imap.qiye.aliyun.com'],
  ['mail', 'qiye.aliyun.com'],
  ['pop3', 'pop.qiye.aliyun.com'],
  ['smtp', 'smtp.qiye.aliyun.com']
]) {
  addCheck(`${name} mail CNAME remains DNS-only`, async () => {
    const cname = (await resolver.resolveCname(`${name}.${canonicalHost}`)).map(
      (value) => value.replace(/\.$/, '').toLowerCase()
    );
    assert(cname.includes(expected), `${name} CNAME changed unexpectedly`, {
      cname,
      expected
    });
    return cname.join(', ');
  });
}

addCheck('/healthz returns Worker runtime', async () => {
  await expectHead('/healthz');
  const response = await curlResponse(`${baseUrl}/healthz`);
  const data = JSON.parse(response.body);
  assert(
    data.runtime === 'cloudflare-worker',
    'Unexpected health runtime',
    data
  );
  return JSON.stringify(data);
});

addCheck(
  '/release-manifest.json exposes a traceable production build',
  async () => {
    const url = new URL('/release-manifest.json', baseUrl);
    url.searchParams.set('productionValidation', Date.now().toString(36));
    const response = await curlResponse(String(url));
    assert(
      response.status === 200,
      `/release-manifest.json returned ${response.status}`
    );
    const data = JSON.parse(response.body);
    assert(data.schemaVersion === 1, 'Release manifest schema mismatch', data);
    assert(
      /^[0-9a-f]{40}$/.test(data.commit || ''),
      'Release manifest has no full Git commit',
      { commit: data.commit }
    );
    assert(
      data.commit === data.originMain,
      'Production was not built from the exact origin/main commit',
      { commit: data.commit, originMain: data.originMain }
    );
    assert(
      Array.isArray(data.activeContracts) && data.activeContracts.length > 0,
      'Release manifest has no active product contracts',
      { activeContracts: data.activeContracts }
    );
    assert(
      typeof data.entryAsset === 'string' &&
        data.assetSha256?.[data.entryAsset],
      'Release manifest does not hash its entry asset',
      { entryAsset: data.entryAsset }
    );
    return `git ${data.commit.slice(0, 12)} · ${data.activeContracts.length} contracts`;
  }
);

addCheck('/ redirects to the prompt library', async () => {
  const response = await curlResponse(`${baseUrl}/`, { method: 'HEAD' });
  assert(response.status === 308, `/ returned ${response.status}`, {
    status: response.status
  });
  assert(
    header(response, 'server') === 'cloudflare',
    '/ is not served through Cloudflare',
    {
      server: header(response, 'server')
    }
  );
  assertObservabilityHeaders(response, '/');
  assert(
    header(response, 'location') === `${baseUrl}/en-US/prompts`,
    'Unexpected / redirect location (English is the default)',
    {
      location: header(response, 'location')
    }
  );
  assert(
    header(response, 'x-webtomind-route') === 'redirect:/',
    'Unexpected / Worker route',
    {
      route: header(response, 'x-webtomind-route')
    }
  );
  return header(response, 'location');
});

addCheck('/ redirects zh browsers to the Chinese prompt library', async () => {
  const response = await curlResponse(`${baseUrl}/`, {
    method: 'HEAD',
    headers: { 'Accept-Language': 'zh-CN,zh;q=0.9' }
  });
  assert(response.status === 308, `/ returned ${response.status}`, {
    status: response.status
  });
  assert(
    header(response, 'location') === `${baseUrl}/zh-CN/prompts`,
    'Unexpected / redirect location for zh Accept-Language',
    {
      location: header(response, 'location')
    }
  );
  return header(response, 'location');
});

addCheck(
  '/ redirects explicit zh language cookie to the Chinese prompt library',
  async () => {
    const response = await curlResponse(`${baseUrl}/`, {
      method: 'HEAD',
      headers: { Cookie: 'webtomind-language=zh-CN' }
    });
    assert(response.status === 308, `/ returned ${response.status}`, {
      status: response.status
    });
    assert(
      header(response, 'location') === `${baseUrl}/zh-CN/prompts`,
      'Unexpected / redirect location for zh language cookie',
      {
        location: header(response, 'location')
      }
    );
    return header(response, 'location');
  }
);

addCheck(
  '/zh-CN/prompts serves the prompt library as an SEO page',
  async () => {
    const response = await curlResponse(
      `${baseUrl}/zh-CN/prompts?sort=latest&utm_source=legacy`,
      { method: 'GET' }
    );
    assert(
      response.status === 200,
      `/zh-CN/prompts returned ${response.status}`
    );
    assert(
      header(response, 'server') === 'cloudflare',
      '/zh-CN/prompts is not served through Cloudflare',
      { server: header(response, 'server') }
    );
    assertObservabilityHeaders(response, '/zh-CN/prompts');
    return `${response.status} ${response.body.length} bytes`;
  }
);

for (const path of [
  '/zh-CN/blog',
  '/gpt-image-2-prompts',
  '/free-gpt-image-2-prompts',
  '/nano-banana-prompts-gallery',
  '/poster-design-prompts',
  '/referral/creator-invite-collaboration-v1.webp',
  '/robots.txt',
  '/sitemap.xml',
  '/BingSiteAuth.xml',
  '/llms.txt'
]) {
  addCheck(`${path} is served through Cloudflare`, async () => {
    const response = await expectHead(path);
    if (path === '/sitemap.xml') {
      assert(
        header(response, 'x-webtomind-sitemap-runtime') === 'cloudflare-worker',
        '/sitemap.xml is not served by the Worker-native sitemap renderer',
        {
          runtime: header(response, 'x-webtomind-sitemap-runtime')
        }
      );
    }
    return `${response.status} ${header(response, 'content-type') || ''}`.trim();
  });
}

for (const path of ['/zh-CN/prompts', '/create']) {
  addCheck(`${path} local scripts are loadable`, async () =>
    expectHtmlScripts(path)
  );
}

addCheck('/zh-CN/recharge CSP allows the validated ZPay checkout form', async () => {
  const response = await curlResponse(`${baseUrl}/zh-CN/recharge`, { method: 'HEAD' });
  assert(response.status === 200, `/zh-CN/recharge returned ${response.status}`);
  const formAction = (header(response, 'content-security-policy') || '')
    .split(';').map((directive) => directive.trim())
    .find((directive) => directive.startsWith('form-action '));
  assert(formAction === "form-action 'self' https://zpayz.cn https://api.z-pay.cn",
    'Checkout form policy must allow only self and the ZPay submission/cashier origins', { formAction });
  return formAction;
});

addCheck('/zh-CN/prompts CSP allows Google Identity styles', async () => {
  const response = await curlResponse(`${baseUrl}/zh-CN/prompts`, {
    method: 'HEAD'
  });
  assert(response.status === 200, `/zh-CN/prompts returned ${response.status}`);
  const csp = header(response, 'content-security-policy') || '';
  const styleDirective = csp
    .split(';')
    .map((directive) => directive.trim())
    .find((directive) => directive.startsWith('style-src '));
  assert(
    styleDirective?.split(/\s+/).includes('https://accounts.google.com'),
    'Google Identity stylesheet origin is missing from style-src',
    { styleDirective }
  );
  return styleDirective;
});

for (const [path, canonical] of [
  ['/free-gpt-image-2-prompts', `${baseUrl}/gpt-image-2-prompts`],
  ['/nano-banana-prompts-gallery', `${baseUrl}/nano-banana-prompts`],
  ['/poster-design-prompts', `${baseUrl}/marketing-creative-prompts`],
  ['/zh-CN/apps', `${baseUrl}/zh-CN/apps`],
  ['/zh-CN/tools/image-upscaler', `${baseUrl}/zh-CN/tools/image-upscaler`],
  ['/en-US/tools/image-compressor', `${baseUrl}/en-US/tools/image-compressor`]
]) {
  addCheck(`${path} returns SSR canonical`, async () =>
    expectCanonical(path, canonical)
  );
}

for (const path of [
  '/zh-CN/blog/creator-workflow-30-min',
  '/en-US/blog/creator-workflow-30-min',
  '/zh-CN/blog/video-to-script-storyboard',
  '/zh-CN/blog/wechat-publish-readiness-check',
  '/zh-CN/blog/single-draft-multi-channel-repurpose'
]) {
  addCheck(`${path} restores its indexable canonical`, async () =>
    expectCanonical(path, `${baseUrl}${path}`)
  );
}

addCheck(
  'ComfyUI duplicate entry redirects to its declared canonical',
  async () => {
    const response = await curlResponse(
      `${baseUrl}/tools/comfyui-workflow-checker?utm_source=gsc`,
      { headers: { 'accept-language': 'en-US' } }
    );
    assert(
      response.status === 308,
      `ComfyUI alias returned ${response.status}`
    );
    assert(
      header(response, 'location') ===
        `${baseUrl}/zh-CN/tools/comfyui-workflow-checker?utm_source=gsc`,
      'ComfyUI alias must preserve query and use the declared Chinese canonical'
    );
    return '308 to the localized canonical';
  }
);

addCheck('legacy GSC prompt URLs redirect to verified canonicals', async () => {
  for (const [path, expectedLocation] of [
    [
      '/en-US/prompts/botanical-medic-character-design-prompt?utm_source=gsc&caseId=obsolete',
      `${baseUrl}/en-US/prompts/zh-botanical-medic-character-design-prompt?utm_source=gsc`
    ],
    [
      '/en-US/prompts?caseId=73c403e4-9031-4b7b-bf02-a533b22ae3f6&caseSlug=en-white-vase-reference-image-to-prompt-workflow',
      `${baseUrl}/en-US/prompts/zh-reference-image-to-prompt-vase-workflow-example`
    ]
  ]) {
    const response = await curlResponse(`${baseUrl}${path}`, {
      method: 'HEAD'
    });
    assert(response.status === 308, `${path} returned ${response.status}`);
    assert(
      header(response, 'location') === expectedLocation,
      `${path} redirect mismatch`,
      { location: header(response, 'location'), expectedLocation }
    );
  }
  return '2 legacy GSC prompt URL shapes redirected';
});

addCheck(
  'sitemap includes eligible GSC cases beyond the database response cap',
  async () => {
    const response = await curlResponse(
      `${baseUrl}/sitemap.xml?pagination_check=${Date.now()}`
    );
    assert(response.status === 200, `Sitemap returned ${response.status}`);
    for (const path of [
      '/zh-CN/prompts/gpt-image-2-east-asian-woman-luxury-car-deer-lifestyle',
      '/zh-CN/prompts/gpt-image-2-live-action-movie-pitch-13955',
      '/en-US/prompts/en-gpt-image-2-ultra-wide-continuous-background-facade-prompt'
    ]) {
      assert(
        response.body.includes(`<loc>${baseUrl}${path}</loc>`),
        `Sitemap is missing ${path}`
      );
    }
    return '3 previously truncated GSC cases present';
  }
);

addCheck(
  'translated prompt alias redirects to its linked canonical slug',
  async () => {
    const response = await curlResponse(
      `${baseUrl}/en-US/prompts/zh-gpt-image-2-ecommerce-hero-image-prompt?utm_source=gsc`
    );
    assert(
      response.status === 308,
      `Translated alias returned ${response.status}`
    );
    assert(
      header(response, 'location') ===
        `${baseUrl}/en-US/prompts/gpt-image-2-ecommerce-hero-image-prompt?utm_source=gsc`,
      'Translated alias has the wrong canonical target'
    );
    return '308 to the published English translation';
  }
);

addCheck('retired thin SEO article returns noindex 410', async () => {
  const path = '/zh-CN/blog/ai-workflow-sop';
  const response = await curlResponse(`${baseUrl}${path}`, { method: 'HEAD' });
  assert(response.status === 410, `${path} returned ${response.status}`);
  assert(
    /noindex/i.test(header(response, 'x-robots-tag') || ''),
    `${path} is missing X-Robots-Tag noindex`
  );
  return '410 noindex';
});

addCheck(
  'legacy /create/* creator URLs redirect to top-level pages',
  async () => {
    for (const [path, target] of [
      ['/zh-CN/create/image', '/zh-CN/image'],
      ['/zh-CN/create/video', '/zh-CN/video'],
      ['/zh-CN/create/gallery', '/zh-CN/gallery'],
      ['/zh-CN/create/characters', '/zh-CN/characters'],
      ['/zh-CN/create/apps', '/zh-CN/apps'],
      ['/zh-CN/create/moodboards/board-123', '/zh-CN/moodboards/board-123'],
      ['/create/image?sessionId=s1', '/image?sessionId=s1'],
      ['/en-US/create/prompts', '/en-US/prompts']
    ]) {
      const response = await curlResponse(`${baseUrl}${path}`, {
        method: 'HEAD'
      });
      assert(response.status === 308, `${path} returned ${response.status}`, {
        status: response.status
      });
      const location = new URL(header(response, 'location') || '').pathname;
      const expectedLocation = new URL(`${baseUrl}${target}`).pathname;
      assert(location === expectedLocation, `${path} redirect mismatch`, {
        location,
        expectedLocation
      });
    }
    return '8 old create routes redirected';
  }
);

addCheck('top-level creator pages render noindex app shells', async () => {
  for (const path of [
    '/zh-CN/image',
    '/zh-CN/video',
    '/zh-CN/gallery',
    '/zh-CN/moodboards',
    '/zh-CN/moodboards/new',
    '/zh-CN/characters'
  ]) {
    const response = await curlResponse(`${baseUrl}${path}`, {
      method: 'GET'
    });
    assert(response.status === 200, `${path} returned ${response.status}`, {
      status: response.status
    });
    assert(
      header(response, 'x-webtomind-seo-renderer') ===
        'cloudflare-noindex-shell',
      `${path} is not rendered as a noindex app shell`,
      { renderer: header(response, 'x-webtomind-seo-renderer') }
    );
    assert(
      /name="robots" content="noindex/.test(response.body),
      `${path} HTML is missing the noindex robots meta`,
      { sample: response.body.slice(0, 200) }
    );
  }
  return '6 top-level creator pages served as noindex shells';
});

addCheck(
  'legacy create app route redirects and preserves acquisition params',
  async () => {
    const response = await curlResponse(
      `${baseUrl}/zh-CN/create/apps/object-remover/use?utm_source=release&source=apps&runnerStep=3`,
      { method: 'HEAD' }
    );
    assert(
      response.status === 301,
      `legacy route returned ${response.status}`,
      {
        status: response.status
      }
    );
    assert(
      header(response, 'location') ===
        `${baseUrl}/zh-CN/tools/watermark-remover?utm_source=release&source=apps`,
      'legacy route redirect mismatch',
      { location: header(response, 'location') }
    );
    return header(response, 'location');
  }
);

addCheck('ONNX Runtime assets support immutable Range delivery', async () => {
  const wasmPath =
    '/models/image-tools/ort-wasm-simd-threaded.jsep.1.27.0.78feeeb3d08f6bce.wasm';
  const modulePath =
    '/models/image-tools/ort-wasm-simd-threaded.jsep.1.27.0.3ee381d20a80f51a.mjs';
  const response = await curlResponse(`${baseUrl}${wasmPath}`, {
    headers: { Range: 'bytes=0-31' }
  });
  assert(response.status === 206, `Runtime Range returned ${response.status}`, {
    status: response.status
  });
  assert(
    header(response, 'content-type') === 'application/wasm',
    'Runtime WASM MIME mismatch',
    { contentType: header(response, 'content-type') }
  );
  assert(
    header(response, 'cache-control')?.includes('immutable'),
    'Runtime cache is not immutable',
    { cacheControl: header(response, 'cache-control') }
  );
  assert(
    header(response, 'x-model-sha256') ===
      '78feeeb3d08f6bcee94d938ed322f69073bb8076b5f9d34697a574ffba8deb48',
    'Runtime digest header mismatch',
    { digest: header(response, 'x-model-sha256') }
  );
  const moduleResponse = await curlResponse(`${baseUrl}${modulePath}`, {
    method: 'HEAD'
  });
  assert(
    moduleResponse.status === 200 &&
      header(moduleResponse, 'content-type')?.startsWith('text/javascript'),
    'Runtime module is not loadable as JavaScript',
    {
      status: moduleResponse.status,
      contentType: header(moduleResponse, 'content-type')
    }
  );
  return `206 ${header(response, 'content-range')} · module ${moduleResponse.status}`;
});

for (const page of [
  {
    path: '/zh-CN/prompts',
    minJsonLd: 2,
    minBodyTextLength: 500,
    requiredBodyKeywordGroups: [
      ['Prompt', 'prompt', '提示词'],
      ['案例', 'case'],
      ['GPT Image 2', 'Nano Banana', '商品图'],
      ['生成', '浏览', 'Browse', 'Generate']
    ]
  },
  {
    path: '/zh-CN/prompts/model/gpt-image-2',
    minJsonLd: 3,
    minBodyTextLength: 420,
    requiredBodyKeywordGroups: [
      ['GPT Image 2'],
      ['Prompt', 'prompt', '提示词'],
      ['案例', 'case'],
      ['生成', '复用', 'Generate']
    ]
  },
  {
    path: '/zh-CN/prompts/category/product-images',
    minJsonLd: 3,
    minBodyTextLength: 420,
    requiredBodyKeywordGroups: [
      ['商品图', 'product'],
      ['Prompt', 'prompt', '提示词'],
      ['案例', 'case'],
      ['生成', '复用', 'Generate']
    ]
  }
]) {
  addCheck(`${page.path} first HTML exposes prompt SEO content`, async () =>
    expectPromptSeoVisibleHtml({
      path: page.path,
      expectedCanonical: `${baseUrl}${page.path}`,
      minJsonLd: page.minJsonLd,
      minBodyTextLength: page.minBodyTextLength,
      requiredBodyKeywordGroups: page.requiredBodyKeywordGroups
    })
  );
}

addCheck(
  '/zh-CN/prompts/:slug first HTML exposes prompt detail SEO content',
  async () => {
    const slug = await getPromptCaseValidationSlug();
    const path = `/zh-CN/prompts/${encodeURIComponent(slug)}`;
    return expectPromptSeoVisibleHtml({
      path,
      expectedCanonical: `${baseUrl}${path}`,
      minJsonLd: 1,
      minBodyTextLength: 500,
      validateSocialImage: true,
      requiredBodyKeywordGroups: [
        ['Prompt', 'prompt', '提示词'],
        ['案例', 'case'],
        ['生成', '复用', 'Generate'],
        ['公开 Prompt', 'Public prompt', slug]
      ]
    });
  }
);

for (const path of [
  '/en-US/prompts/gpt-image-2-commercial-headshot-prompt',
  '/en-US/prompts/gpt-image-2-editorial-portrait-example-prompt',
  '/en-US/prompts/gta-6-cover-girls-neon-duo-prompt',
  '/zh-CN/prompts/zh-gpt-image-2-commercial-headshot-prompt',
  '/zh-CN/prompts/zh-gpt-image-2-editorial-portrait-example-prompt',
  '/en-US/prompts/gta-6-cover-girls-ensemble-prompt',
  '/en-US/prompts/gta-6-cover-girls-sunset-protagonist-prompt',
  '/zh-CN/prompts/zh-gta-6-cover-girls-neon-duo-prompt'
]) {
  addCheck(
    `${path} renders its trusted static prompt detail fallback`,
    async () =>
      expectPromptSeoVisibleHtml({
        path,
        expectedCanonical: `${baseUrl}${path}`,
        minJsonLd: 1,
        minBodyTextLength: 300,
        requiredBodyKeywordGroups: [
          ['Prompt', 'prompt', '提示词'],
          ['生成', '复用', 'Generate', 'generate']
        ]
      })
  );
}

for (const path of [
  '/zh-CN/blog/__missing-seo-validation-post__',
  '/en-US/blog/__missing-seo-validation-blog__',
  '/zh-CN/prompts/model/__missing-seo-validation-model__',
  '/en-US/prompts/__missing-seo-validation-prompt__'
]) {
  addCheck(`${path} is not an indexable soft 404`, async () =>
    expectNonIndexableMissingSeoPath(path)
  );
}

addCheck('www redirects to canonical apex', async () => {
  const response = await curlResponse(`https://www.${canonicalHost}/`, {
    method: 'HEAD'
  });
  assert(response.status === 308, `www returned ${response.status}`, {
    status: response.status
  });
  assert(
    header(response, 'server') === 'cloudflare',
    'www is not served through Cloudflare',
    {
      server: header(response, 'server')
    }
  );
  assert(
    header(response, 'location') === `${baseUrl}/`,
    'Unexpected www redirect location',
    {
      location: header(response, 'location')
    }
  );
  return header(response, 'location');
});

addCheck('/ai-image-prompts redirects to the prompt library', async () => {
  const response = await curlResponse(`${baseUrl}/ai-image-prompts`, {
    method: 'HEAD'
  });
  assert(
    response.status === 308,
    `/ai-image-prompts returned ${response.status}`,
    {
      status: response.status
    }
  );
  assert(
    header(response, 'location') === `${baseUrl}/en-US/prompts`,
    'Unexpected /ai-image-prompts redirect location',
    {
      location: header(response, 'location')
    }
  );
  return header(response, 'location');
});

addCheck('HTTP redirects to canonical HTTPS apex', async () => {
  const response = await curlResponse(
    `http://${canonicalHost}/gpt-image-2-prompts`,
    {
      method: 'HEAD'
    }
  );
  assert(
    response.status === 301 || response.status === 308,
    `HTTP returned ${response.status}`,
    {
      status: response.status
    }
  );
  assert(
    header(response, 'location') === `${baseUrl}/gpt-image-2-prompts`,
    'Unexpected HTTP redirect location',
    {
      location: header(response, 'location')
    }
  );
  return header(response, 'location');
});

for (const [path, validate] of [
  ['/api/health', (data) => data.status === 'ok'],
  [
    '/api/image/models',
    (data) => {
      const validation = validateImageModelsPayload(data);
      if (!validation.valid) {
        fail('/api/image/models JSON model gate failed', validation);
      }
      return true;
    }
  ],
  [
    '/api/video/models',
    (data) => Array.isArray(data.models) && data.models.length > 0
  ],
  [
    '/api/content/blog?locale=zh-CN&limit=1',
    (data) => Array.isArray(data.posts)
  ],
  [
    '/api/content/prompt-cases?locale=zh-CN&limit=1',
    (data) => Array.isArray(data.cases)
  ],
  [
    '/api/credits/packages',
    (data) => Array.isArray(data.packages) && data.packages.length > 0
  ],
  [
    '/api/membership/plans',
    (data) =>
      Array.isArray(data.plans) &&
      data.plans.length > 0 &&
      data.plans.every((plan) =>
        plan.name === 'free'
          ? plan.checkoutEnabled === true
          : typeof plan.checkoutEnabled === 'boolean'
      )
  ]
]) {
  addCheck(`${path} returns valid JSON`, async () => {
    const response = await curlResponse(`${baseUrl}${path}`);
    assert(response.status === 200, `${path} returned ${response.status}`);
    assert(
      header(response, 'server') === 'cloudflare',
      `${path} is not served through Cloudflare`,
      {
        server: header(response, 'server')
      }
    );
    assertObservabilityHeaders(response, path);
    if (path.startsWith('/api/image/task')) {
      assert(
        header(response, 'x-webtomind-image-task-runtime') ===
          'cloudflare-worker',
        `${path} is not served by the Worker-native task status handler`,
        {
          runtime: header(response, 'x-webtomind-image-task-runtime')
        }
      );
    }
    const data = JSON.parse(response.body);
    assert(validate(data), `${path} JSON shape is invalid`, data);
    return '200 JSON';
  });
}

addCheck('/api/content/prompt-cases exposes reachable image URLs', async () => {
  const summary = await checkPromptCaseImages({
    baseUrl,
    limit: process.env.CF_VALIDATE_PROMPT_CASE_IMAGE_LIMIT,
    locale: process.env.CF_VALIDATE_PROMPT_CASE_IMAGE_LOCALE,
    timeoutMs: process.env.CF_VALIDATE_PROMPT_CASE_IMAGE_TIMEOUT_MS
  });
  return formatPromptCaseImageSummary(summary);
});

addCheck(
  '/api/workspace/projects rejects unauthenticated requests',
  async () => {
    const response = await curlResponse(`${baseUrl}/api/workspace/projects`, {
      method: 'HEAD'
    });
    assert(
      response.status === 401,
      `/api/workspace/projects returned ${response.status}`,
      {
        status: response.status
      }
    );
    assert(
      header(response, 'access-control-allow-origin') === baseUrl,
      'Unexpected CORS allow origin',
      {
        origin: header(response, 'access-control-allow-origin')
      }
    );
    return '401 unauthenticated';
  }
);

for (const path of [
  '/api/video/history',
  '/api/video/status?id=validation-task-id'
]) {
  addCheck(`${path} rejects unauthenticated requests`, async () => {
    const response = await curlResponse(`${baseUrl}${path}`);
    assert(response.status === 401, `${path} returned ${response.status}`, {
      status: response.status
    });
    assert(
      header(response, 'server') === 'cloudflare',
      `${path} is not served through Cloudflare`,
      {
        server: header(response, 'server')
      }
    );
    assertObservabilityHeaders(response, path);
    const data = JSON.parse(response.body);
    assert(
      data.error === 'Unauthorized',
      `${path} returned an unexpected body`,
      data
    );
    return '401 unauthenticated';
  });
}

addCheck(
  '/api/workspace/source-search rejects unauthenticated requests',
  async () => {
    const response = await curlResponse(
      `${baseUrl}/api/workspace/source-search`,
      {
        method: 'POST',
        body: '{"query":"validation"}'
      }
    );
    assert(
      response.status === 401,
      `/api/workspace/source-search returned ${response.status}`,
      {
        status: response.status
      }
    );
    assert(
      header(response, 'server') === 'cloudflare',
      '/api/workspace/source-search is not served through Cloudflare',
      {
        server: header(response, 'server')
      }
    );
    const data = JSON.parse(response.body);
    assert(
      data.error === '请先登录',
      '/api/workspace/source-search returned an unexpected body',
      data
    );
    return '401 unauthenticated';
  }
);

for (const [path, body] of [
  ['/api/image/generate', '{"prompt":"validation"}'],
  ['/api/image/task?taskId=00000000-0000-4000-8000-000000000000', undefined],
  ['/api/image/prompt-optimize', '{"prompt":"validation"}'],
  [
    '/api/workspace/cards/weave',
    JSON.stringify({
      projectId: '00000000-0000-4000-8000-000000000000',
      cardIds: [
        '00000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000002'
      ]
    })
  ],
  [
    '/api/workspace/studio-ai',
    JSON.stringify({ action: 'humanizer', selectionText: 'validation text' })
  ],
  [
    '/api/workspace/studio-readiness',
    JSON.stringify({
      title: 'Validation',
      content: { type: 'doc', content: [] }
    })
  ],
  [
    '/api/workspace/source-extract',
    JSON.stringify({
      urls: ['https://example.com'],
      projectId: '00000000-0000-4000-8000-000000000000'
    })
  ],
  [
    '/api/workspace/studio-chart-image',
    JSON.stringify({ instruction: 'validation chart' })
  ]
]) {
  addCheck(`${path} rejects unauthenticated requests`, async () => {
    const response = await curlResponse(
      `${baseUrl}${path}`,
      body === undefined
        ? undefined
        : {
            method: 'POST',
            body
          }
    );
    assert(response.status === 401, `${path} returned ${response.status}`, {
      status: response.status
    });
    assert(
      header(response, 'server') === 'cloudflare',
      `${path} is not served through Cloudflare`,
      {
        server: header(response, 'server')
      }
    );
    assertObservabilityHeaders(response, path);
    if (path === '/api/image/generate') {
      assert(
        header(response, 'x-webtomind-origin-runtime') === 'cloudflare-worker',
        '/api/image/generate did not expose Worker origin runtime',
        { originRuntime: header(response, 'x-webtomind-origin-runtime') }
      );
    }
    const data = JSON.parse(response.body);
    assert(
      data.error === '请先登录',
      `${path} returned an unexpected body`,
      data
    );
    return '401 unauthenticated';
  });
}

addCheck(
  '/api/image/task cancel action is handled by the Worker before legacy fallback',
  async () => {
    const response = await curlResponse(`${baseUrl}/api/image/task`, {
      method: 'POST',
      body: JSON.stringify({
        id: '00000000-0000-4000-8000-000000000000',
        action: 'cancel'
      })
    });
    assert(
      response.status === 401,
      `/api/image/task cancel returned ${response.status}`,
      {
        status: response.status
      }
    );
    assert(
      header(response, 'server') === 'cloudflare',
      '/api/image/task cancel is not served through Cloudflare',
      {
        server: header(response, 'server')
      }
    );
    assert(
      header(response, 'x-webtomind-image-task-action-runtime') ===
        'cloudflare-worker',
      '/api/image/task cancel did not use the Worker-native action handler',
      {
        runtime: header(response, 'x-webtomind-image-task-action-runtime')
      }
    );
    const data = JSON.parse(response.body);
    assert(
      data.error === '请先登录',
      '/api/image/task cancel returned an unexpected body',
      data
    );
    return '401 worker action';
  }
);

addCheck(
  '/api/ai/gemini/thinking rejects unauthenticated requests',
  async () => {
    const response = await curlResponse(`${baseUrl}/api/ai/gemini/thinking`, {
      method: 'POST',
      body: JSON.stringify({ prompt: 'validation' })
    });
    assert(
      response.status === 401,
      `/api/ai/gemini/thinking returned ${response.status}`,
      {
        status: response.status
      }
    );
    assert(
      header(response, 'server') === 'cloudflare',
      '/api/ai/gemini/thinking is not served through Cloudflare',
      {
        server: header(response, 'server')
      }
    );
    const data = JSON.parse(response.body);
    assert(
      data.error === 'Unauthorized',
      '/api/ai/gemini/thinking returned an unexpected body',
      data
    );
    return '401 unauthenticated';
  }
);

addCheck(
  '/api/agent/batch-image-execute rejects unauthenticated requests',
  async () => {
    const response = await curlResponse(
      `${baseUrl}/api/agent/batch-image-execute`,
      {
        method: 'POST',
        body: JSON.stringify({ tasks: [] })
      }
    );
    assert(
      response.status === 401,
      `/api/agent/batch-image-execute returned ${response.status}`,
      {
        status: response.status
      }
    );
    assert(
      header(response, 'server') === 'cloudflare',
      '/api/agent/batch-image-execute is not served through Cloudflare',
      {
        server: header(response, 'server')
      }
    );
    const data = JSON.parse(response.body);
    assert(
      data.error === 'Unauthorized',
      '/api/agent/batch-image-execute returned an unexpected body',
      data
    );
    return '401 unauthenticated';
  }
);

addCheck(
  '/api/agent/smart-chat rejects unauthenticated requests on Cloudflare',
  async () => {
    const response = await curlResponse(`${baseUrl}/api/agent/smart-chat`, {
      method: 'POST',
      body: JSON.stringify({ message: 'validation' })
    });
    assert(
      response.status === 401,
      `/api/agent/smart-chat returned ${response.status}`,
      {
        status: response.status
      }
    );
    assert(
      header(response, 'server') === 'cloudflare',
      '/api/agent/smart-chat is not served through Cloudflare',
      {
        server: header(response, 'server')
      }
    );
    const data = JSON.parse(response.body);
    assert(
      data.error === 'Unauthorized',
      '/api/agent/smart-chat returned an unexpected body',
      data
    );
    return '401 unauthenticated';
  }
);

addCheck(
  '/api/workspace/summary-confirm rejects unauthenticated requests',
  async () => {
    const response = await curlResponse(
      `${baseUrl}/api/workspace/summary-confirm`,
      {
        method: 'POST',
        body: JSON.stringify({
          action: 'create',
          projectId: '00000000-0000-4000-8000-000000000000',
          data: { title: 'Validation', content: 'Validation' }
        })
      }
    );
    assert(
      response.status === 401,
      `/api/workspace/summary-confirm returned ${response.status}`,
      {
        status: response.status
      }
    );
    assert(
      header(response, 'server') === 'cloudflare',
      '/api/workspace/summary-confirm is not served through Cloudflare',
      {
        server: header(response, 'server')
      }
    );
    const data = JSON.parse(response.body);
    assert(
      data.error === '请先登录',
      '/api/workspace/summary-confirm returned an unexpected body',
      data
    );
    return '401 unauthenticated';
  }
);

for (const path of [
  '/api/workspace/studio-documents?project_id=00000000-0000-4000-8000-000000000000',
  '/api/workspace/studio-documents/00000000-0000-4000-8000-000000000000'
]) {
  addCheck(`${path} rejects unauthenticated requests`, async () => {
    const response = await curlResponse(`${baseUrl}${path}`);
    assert(response.status === 401, `${path} returned ${response.status}`, {
      status: response.status
    });
    assert(
      header(response, 'server') === 'cloudflare',
      `${path} is not served through Cloudflare`,
      {
        server: header(response, 'server')
      }
    );
    const data = JSON.parse(response.body);
    assert(
      data.error === '请先登录',
      `${path} returned an unexpected body`,
      data
    );
    return '401 unauthenticated';
  });
}

for (const path of [
  '/api/workspace/skills',
  '/api/workspace/skills/00000000-0000-4000-8000-000000000000',
  '/api/workspace/skills/references?skill_id=00000000-0000-4000-8000-000000000000',
  '/api/workspace/skills/references/validation.md?skill_id=00000000-0000-4000-8000-000000000000',
  '/api/workspace/skills/scripts?skill_id=00000000-0000-4000-8000-000000000000',
  '/api/workspace/skills/scripts/validation.py?skill_id=00000000-0000-4000-8000-000000000000'
]) {
  addCheck(`${path} rejects unauthenticated requests`, async () => {
    const response = await curlResponse(`${baseUrl}${path}`);
    assert(response.status === 401, `${path} returned ${response.status}`, {
      status: response.status
    });
    assert(
      header(response, 'server') === 'cloudflare',
      `${path} is not served through Cloudflare`,
      {
        server: header(response, 'server')
      }
    );
    const data = JSON.parse(response.body);
    assert(
      data.error === '请先登录',
      `${path} returned an unexpected body`,
      data
    );
    return '401 unauthenticated';
  });
}

addCheck('/api/workspace/skills/templates returns templates JSON', async () => {
  const response = await curlResponse(
    `${baseUrl}/api/workspace/skills/templates`
  );
  assert(
    response.status === 200,
    `/api/workspace/skills/templates returned ${response.status}`,
    {
      status: response.status
    }
  );
  assert(
    header(response, 'server') === 'cloudflare',
    '/api/workspace/skills/templates is not served through Cloudflare',
    {
      server: header(response, 'server')
    }
  );
  const data = JSON.parse(response.body);
  assert(
    Array.isArray(data.templates),
    '/api/workspace/skills/templates returned an unexpected body',
    data
  );
  return '200 JSON';
});

addCheck(
  '/api/prompt-assets/user rejects unauthenticated requests',
  async () => {
    const response = await curlResponse(`${baseUrl}/api/prompt-assets/user`);
    assert(
      response.status === 401,
      `/api/prompt-assets/user returned ${response.status}`,
      {
        status: response.status
      }
    );
    assert(
      header(response, 'server') === 'cloudflare',
      '/api/prompt-assets/user is not served through Cloudflare',
      {
        server: header(response, 'server')
      }
    );
    const data = JSON.parse(response.body);
    assert(
      data.error === '请先登录',
      '/api/prompt-assets/user returned an unexpected body',
      data
    );
    return '401 unauthenticated';
  }
);

for (const [path, body] of [
  ['/api/prompt-assets/user/import-prompt', { prompt: 'validation' }],
  [
    '/api/prompt-assets/user/upload',
    { imageBase64: '', mimeType: 'image/png' }
  ],
  [
    '/api/prompt-assets/user/thumbnail',
    {
      assetId: '00000000-0000-4000-8000-000000000000',
      generationId: '00000000-0000-4000-8000-000000000000'
    }
  ]
]) {
  addCheck(
    `${path} rejects unauthenticated requests on Cloudflare`,
    async () => {
      const response = await curlResponse(`${baseUrl}${path}`, {
        method: 'POST',
        body: JSON.stringify(body)
      });
      assert(response.status === 401, `${path} returned ${response.status}`, {
        status: response.status
      });
      assert(
        header(response, 'server') === 'cloudflare',
        `${path} is not served through Cloudflare`,
        {
          server: header(response, 'server')
        }
      );
      const data = JSON.parse(response.body);
      assert(
        data.error === '请先登录',
        `${path} returned an unexpected body`,
        data
      );
      return '401 unauthenticated';
    }
  );
}

addCheck(
  '/api/analytics/conversion-event rejects unauthenticated requests',
  async () => {
    const response = await curlResponse(
      `${baseUrl}/api/analytics/conversion-event`,
      {
        method: 'POST',
        body: '{}'
      }
    );
    assert(
      response.status === 401,
      `/api/analytics/conversion-event returned ${response.status}`,
      {
        status: response.status
      }
    );
    assert(
      header(response, 'server') === 'cloudflare',
      '/api/analytics/conversion-event is not served through Cloudflare',
      {
        server: header(response, 'server')
      }
    );
    const data = JSON.parse(response.body);
    assert(
      data.error === 'Unauthorized',
      '/api/analytics/conversion-event returned an unexpected body',
      data
    );
    return '401 unauthenticated';
  }
);

addCheck(
  '/api/analytics/conversion-report rejects unauthorized cron requests on Cloudflare',
  async () => {
    const response = await curlResponse(
      `${baseUrl}/api/analytics/conversion-report`
    );
    assert(
      response.status === 401,
      `/api/analytics/conversion-report returned ${response.status}`,
      {
        status: response.status
      }
    );
    assert(
      header(response, 'server') === 'cloudflare',
      '/api/analytics/conversion-report is not served through Cloudflare',
      {
        server: header(response, 'server')
      }
    );
    const data = JSON.parse(response.body);
    assert(
      data.error === 'Unauthorized',
      '/api/analytics/conversion-report returned an unexpected body',
      data
    );
    return '401 unauthorized cron';
  }
);

addCheck('/api/debug/agent is protected on Cloudflare', async () => {
  const response = await curlResponse(`${baseUrl}/api/debug/agent`);
  assert(
    [401, 403].includes(response.status),
    `/api/debug/agent returned ${response.status}`,
    {
      status: response.status
    }
  );
  assert(
    header(response, 'server') === 'cloudflare',
    '/api/debug/agent is not served through Cloudflare',
    {
      server: header(response, 'server')
    }
  );
  const data = JSON.parse(response.body);
  assert(
    data.error === 'Unauthorized' ||
      data.error === 'Debug endpoint disabled in production',
    '/api/debug/agent returned an unexpected body',
    data
  );
  return `${response.status} protected`;
});

addCheck(
  '/api/marketing/unsubscribe validates bad requests on Cloudflare',
  async () => {
    const response = await curlResponse(`${baseUrl}/api/marketing/unsubscribe`);
    assert(
      response.status === 400,
      `/api/marketing/unsubscribe returned ${response.status}`,
      {
        status: response.status
      }
    );
    assert(
      header(response, 'server') === 'cloudflare',
      '/api/marketing/unsubscribe is not served through Cloudflare',
      {
        server: header(response, 'server')
      }
    );
    assert(
      /The unsubscribe token is missing/.test(response.body),
      '/api/marketing/unsubscribe returned an unexpected body'
    );
    return '400 bad request';
  }
);

if (includeMutationSmoke) {
  addCheck(
    '/api/marketing/subscribe accepts homepage case digest subscriptions on Cloudflare',
    async () => {
      const response = await curlResponse(
        `${baseUrl}/api/marketing/subscribe`,
        {
          method: 'POST',
          body: JSON.stringify({
            email: 'codex-production-smoke@example.com',
            locale: 'zh-CN',
            source: 'production_validate'
          })
        }
      );
      assert(
        response.status === 200,
        `/api/marketing/subscribe returned ${response.status}`,
        {
          status: response.status,
          body: response.body.slice(0, 300)
        }
      );
      assert(
        header(response, 'server') === 'cloudflare',
        '/api/marketing/subscribe is not served through Cloudflare',
        {
          server: header(response, 'server')
        }
      );
      assert(
        header(response, 'cache-control') === 'no-store',
        '/api/marketing/subscribe returned cacheable response headers',
        {
          cacheControl: header(response, 'cache-control')
        }
      );
      const data = JSON.parse(response.body);
      assert(
        data.ok === true,
        '/api/marketing/subscribe returned an unexpected body',
        data
      );
      return '200 subscribed smoke lead';
    }
  );
}

addCheck(
  '/api/marketing/email-drain rejects unauthorized cron requests on Cloudflare',
  async () => {
    const response = await curlResponse(
      `${baseUrl}/api/marketing/email-drain`,
      {
        method: 'POST',
        body: '{}'
      }
    );
    assert(
      response.status === 401,
      `/api/marketing/email-drain returned ${response.status}`,
      {
        status: response.status
      }
    );
    assert(
      header(response, 'server') === 'cloudflare',
      '/api/marketing/email-drain is not served through Cloudflare',
      {
        server: header(response, 'server')
      }
    );
    const data = JSON.parse(response.body);
    assert(
      data.error === 'Unauthorized',
      '/api/marketing/email-drain returned an unexpected body',
      data
    );
    return '401 unauthorized cron';
  }
);

for (const [path, method, body, validate] of [
  [
    '/api/image/characters',
    'GET',
    undefined,
    (data) => data.error === '请先登录' && Array.isArray(data.characters)
  ],
  [
    '/api/image/references',
    'GET',
    undefined,
    (data) => data.error === '请先登录' && Array.isArray(data.references)
  ],
  [
    '/api/image/references/from-generation',
    'POST',
    '{}',
    (data) => data.error === '请先登录'
  ],
  [
    '/api/image/references/upload',
    'POST',
    '{}',
    (data) => data.error === '请先登录'
  ],
  [
    '/api/video/references/upload',
    'POST',
    '{}',
    (data) => data.error === '请先登录'
  ],
  [
    '/api/image/consistency/check',
    'POST',
    '{}',
    (data) => data.error === '请先登录'
  ]
]) {
  addCheck(`${path} rejects unauthenticated requests`, async () => {
    const response = await curlResponse(`${baseUrl}${path}`, { method, body });
    assert(response.status === 401, `${path} returned ${response.status}`, {
      status: response.status
    });
    assert(
      header(response, 'server') === 'cloudflare',
      `${path} is not served through Cloudflare`,
      {
        server: header(response, 'server')
      }
    );
    const data = JSON.parse(response.body);
    assert(validate(data), `${path} returned an unexpected body`, data);
    return '401 unauthenticated';
  });
}

addCheck('/api/content/prompt-cases/event validates bad requests', async () => {
  const response = await curlResponse(
    `${baseUrl}/api/content/prompt-cases/event`,
    {
      method: 'POST',
      body: '{}'
    }
  );
  assert(
    response.status === 400,
    `/api/content/prompt-cases/event returned ${response.status}`,
    {
      status: response.status
    }
  );
  assert(
    header(response, 'server') === 'cloudflare',
    '/api/content/prompt-cases/event is not served through Cloudflare',
    {
      server: header(response, 'server')
    }
  );
  const data = JSON.parse(response.body);
  assert(
    data.error === 'id and event are required',
    '/api/content/prompt-cases/event returned an unexpected body',
    data
  );
  return '400 bad request';
});

for (const [path, method, body] of [
  ['/api/admin/prompt-cases', 'GET', undefined],
  ['/api/admin/prompt-cases/upload', 'POST', '{}'],
  ['/api/admin/prompt-case-drafts', 'GET', undefined],
  ['/api/admin/prompt-case-drafts/generate', 'POST', '{}'],
  ['/api/admin/prompt-case-drafts/generate-images', 'POST', '{}'],
  ['/api/admin/prompt-case-drafts/import', 'POST', '{}'],
  ['/api/admin/prompt-case-drafts/validation-draft-id', 'PATCH', '{}'],
  ['/api/admin/prompt-case-drafts/validation-draft-id', 'DELETE', undefined],
  ['/api/admin/prompt-case-drafts/validation-draft-id/publish', 'POST', '{}'],
  ['/api/admin/ai-usage/summary', 'GET', undefined],
  ['/api/admin/media-credits', 'GET', undefined],
  ['/api/admin/media-credits', 'POST', '{}'],
  ['/api/admin/prompt-assets', 'GET', undefined]
]) {
  addCheck(
    `${path} is routed and rejects unauthenticated requests`,
    async () => {
      const response = await curlResponse(`${baseUrl}${path}`, {
        method,
        body
      });
      assert(response.status === 401, `${path} returned ${response.status}`, {
        status: response.status
      });
      assert(
        header(response, 'server') === 'cloudflare',
        `${path} is not served through Cloudflare`,
        {
          server: header(response, 'server')
        }
      );
      const data = JSON.parse(response.body);
      assert(
        data.error === 'Missing Authorization header',
        `${path} returned an unexpected body`,
        data
      );
      return '401 unauthenticated';
    }
  );
}

for (const path of [
  '/api/membership/grant-monthly',
  '/api/membership/referral',
  '/api/membership/tasks'
]) {
  addCheck(`${path} rejects unauthenticated requests`, async () => {
    const response = await curlResponse(`${baseUrl}${path}`);
    assert(response.status === 401, `${path} returned ${response.status}`, {
      status: response.status
    });
    assert(
      header(response, 'server') === 'cloudflare',
      `${path} is not served through Cloudflare`,
      {
        server: header(response, 'server')
      }
    );
    const data = JSON.parse(response.body);
    assert(
      data.error === 'Unauthorized',
      `${path} returned an unexpected body`,
      data
    );
    return '401 unauthenticated';
  });
}

addCheck(
  '/api/membership/subscription rejects unauthenticated requests',
  async () => {
    const response = await curlResponse(
      `${baseUrl}/api/membership/subscription`
    );
    assert(
      response.status === 401,
      `/api/membership/subscription returned ${response.status}`,
      {
        status: response.status
      }
    );
    assert(
      header(response, 'server') === 'cloudflare',
      '/api/membership/subscription is not served through Cloudflare',
      {
        server: header(response, 'server')
      }
    );
    const data = JSON.parse(response.body);
    assert(
      data.error === 'Missing Authorization header',
      '/api/membership/subscription returned an unexpected body',
      data
    );
    return '401 unauthenticated';
  }
);

addCheck(
  '/api/membership/order-status rejects unauthenticated requests',
  async () => {
    const response = await curlResponse(
      `${baseUrl}/api/membership/order-status?orderId=00000000-0000-4000-8000-000000000000`
    );
    assert(
      response.status === 401,
      `/api/membership/order-status returned ${response.status}`,
      { status: response.status }
    );
    assert(
      header(response, 'server') === 'cloudflare',
      '/api/membership/order-status is not served through Cloudflare',
      { server: header(response, 'server') }
    );
    const data = JSON.parse(response.body);
    assert(
      data.error === 'Missing Authorization header',
      '/api/membership/order-status returned an unexpected body',
      data
    );
    return '401 unauthenticated';
  }
);

for (const [path, body] of [
  ['/api/membership/checkout', '{"type":"subscription","id":"pro"}'],
  ['/api/membership/portal', '{}']
]) {
  addCheck(`${path} rejects unauthenticated requests`, async () => {
    const response = await curlResponse(`${baseUrl}${path}`, {
      method: 'POST',
      body
    });
    assert(response.status === 401, `${path} returned ${response.status}`, {
      status: response.status
    });
    assert(
      header(response, 'server') === 'cloudflare',
      `${path} is not served through Cloudflare`,
      {
        server: header(response, 'server')
      }
    );
    const data = JSON.parse(response.body);
    assert(
      data.error === 'Missing Authorization header',
      `${path} returned an unexpected body`,
      data
    );
    return '401 unauthenticated';
  });
}

addCheck(
  '/api/membership/webhook validates missing Stripe signature',
  async () => {
    const response = await curlResponse(`${baseUrl}/api/membership/webhook`, {
      method: 'POST',
      body: '{}'
    });
    assert(
      response.status === 400,
      `/api/membership/webhook returned ${response.status}`,
      {
        status: response.status
      }
    );
    assert(
      header(response, 'server') === 'cloudflare',
      '/api/membership/webhook is not served through Cloudflare',
      {
        server: header(response, 'server')
      }
    );
    const data = JSON.parse(response.body);
    assert(
      data.error === 'Missing stripe-signature',
      '/api/membership/webhook returned an unexpected body',
      data
    );
    return '400 bad request';
  }
);

addCheck(
  '/api/marketing/email-scheduler?mode=validate&type=case_digest rejects unauthenticated requests',
  async () => {
    const path =
      '/api/marketing/email-scheduler?mode=validate&type=case_digest';
    const response = await curlResponse(`${baseUrl}${path}`, {
      method: 'POST',
      body: '{}'
    });
    assert(response.status === 401, `${path} returned ${response.status}`, {
      status: response.status
    });
    assert(
      header(response, 'server') === 'cloudflare',
      `${path} is not served through Cloudflare`,
      { server: header(response, 'server') }
    );
    assertObservabilityHeaders(response, path);
    const data = JSON.parse(response.body);
    assert(
      data.error === 'Unauthorized',
      `${path} returned an unexpected body`,
      data
    );
    return '401 unauthenticated';
  }
);

addCheck('/api/marketing/resend-webhook rejects unsigned events', async () => {
  const response = await curlResponse(
    `${baseUrl}/api/marketing/resend-webhook`,
    {
      method: 'POST',
      body: '{"type":"webhook.test"}'
    }
  );
  assert(
    response.status === 400,
    `/api/marketing/resend-webhook returned ${response.status}`,
    { status: response.status }
  );
  assert(
    header(response, 'server') === 'cloudflare',
    '/api/marketing/resend-webhook is not served through Cloudflare',
    { server: header(response, 'server') }
  );
  assertObservabilityHeaders(response, '/api/marketing/resend-webhook');
  const data = JSON.parse(response.body);
  assert(
    data.error === 'Invalid webhook signature',
    '/api/marketing/resend-webhook returned an unexpected body',
    data
  );
  return '400 invalid signature';
});

export async function runCloudflareProductionValidation() {
  const startedAt = new Date();
  let failed = 0;
  const selectedChecks = seoOnly
    ? checks.filter(({ name }) =>
        /(?:seo|canonical|sitemap|robots|soft 404|first html|local scripts|served through cloudflare|redirect)/i.test(
          name
        )
      )
    : checks;

  console.log(`# Cloudflare production validation`);
  console.log(`Base URL: ${baseUrl}`);
  console.log(`Started: ${startedAt.toISOString()}`);
  console.log('');

  for (const check of selectedChecks) {
    try {
      const result = await check.run();
      console.log(`PASS ${check.name}${result ? ` - ${result}` : ''}`);
    } catch (error) {
      failed += 1;
      console.error(`FAIL ${check.name} - ${error.message}`);
      if (error.details) {
        console.error(JSON.stringify(error.details, null, 2));
      }
    }
  }

  console.log('');
  console.log(`Finished: ${new Date().toISOString()}`);

  if (failed > 0) {
    console.error(`${failed} validation check(s) failed.`);
    return failed;
  }

  console.log(`All ${selectedChecks.length} validation checks passed.`);
  return 0;
}

function isDirectRun() {
  return (
    Boolean(process.argv[1]) &&
    import.meta.url === pathToFileURL(process.argv[1]).href
  );
}

if (isDirectRun()) {
  const failed = await runCloudflareProductionValidation();
  if (failed > 0) process.exit(1);
}
