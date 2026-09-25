const DEFAULT_ORIGIN = 'https://webtomind.com';
const DEFAULT_CONCURRENCY = 12;

function parseNumberFlag(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  const value = Number(process.argv[index + 1]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function parseStringFlag(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1]
    ? process.argv[index + 1]
    : fallback;
}

function decodeXml(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function findCanonical(html) {
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = match[0];
    if (!/\brel\s*=\s*["']canonical["']/i.test(tag)) continue;
    return tag.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1] || '';
  }
  return '';
}

function canonicalIdentity(value, origin) {
  if (!value) return '';
  const url = new URL(value, origin);
  return `${url.origin}${url.pathname}`;
}

function hasNoindex(html) {
  return Array.from(html.matchAll(/<meta\b[^>]*>/gi)).some((match) => {
    const tag = match[0];
    return (
      /\bname\s*=\s*["']robots["']/i.test(tag) &&
      /\bcontent\s*=\s*["'][^"']*noindex/i.test(tag)
    );
  });
}

function hasValidJsonLd(html) {
  for (const match of html.matchAll(
    /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  )) {
    try {
      JSON.parse(match[1]);
    } catch {
      return false;
    }
  }
  return true;
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      'user-agent':
        'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
    }
  });
  return { response, text: await response.text() };
}

const origin = parseStringFlag('--origin', DEFAULT_ORIGIN).replace(/\/$/, '');
const concurrency = parseNumberFlag('--concurrency', DEFAULT_CONCURRENCY);
const limit = parseNumberFlag('--limit', Number.POSITIVE_INFINITY);
const auditToken = Date.now().toString(36);
const sitemap = await fetchText(
  `${origin}/sitemap.xml?seo_audit=${auditToken}`
);
if (!sitemap.response.ok) {
  throw new Error(`Sitemap request failed: HTTP ${sitemap.response.status}`);
}

const urls = Array.from(sitemap.text.matchAll(/<loc>([^<]+)<\/loc>/g))
  .map((match) => decodeXml(match[1]))
  .slice(0, limit);
let cursor = 0;
let passed = 0;
const errors = [];

async function auditWorker() {
  while (cursor < urls.length) {
    const url = urls[cursor++];
    try {
      const target = new URL(url);
      target.searchParams.set('seo_audit', auditToken);
      const { response, text: html } = await fetchText(target.toString());
      const h1Count = (html.match(/<h1\b/gi) || []).length;
      const canonical = findCanonical(html);
      const expectedCanonical = canonicalIdentity(url, origin);
      const actualCanonical = canonicalIdentity(canonical, origin);
      const noindex = hasNoindex(html);
      const jsonLdValid = hasValidJsonLd(html);
      const hasPromptPlaceholder =
        /待人工(?:整理为可复用 Prompt Case|补全 Prompt 并整理为可复用 Prompt Case)/i.test(
          html
        );
      if (
        response.status === 200 &&
        h1Count === 1 &&
        actualCanonical === expectedCanonical &&
        !noindex &&
        jsonLdValid &&
        !hasPromptPlaceholder
      ) {
        passed += 1;
      } else {
        errors.push({
          url,
          status: response.status,
          h1Count,
          canonical: actualCanonical || null,
          expectedCanonical,
          noindex,
          jsonLdValid,
          hasPromptPlaceholder
        });
      }
    } catch (error) {
      errors.push({
        url,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
}

await Promise.all(
  Array.from({ length: Math.min(concurrency, urls.length) }, () =>
    auditWorker()
  )
);

console.log(
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      origin,
      sitemapUrls: urls.length,
      passed,
      failed: errors.length,
      errors: errors.slice(0, 100)
    },
    null,
    2
  )
);

if (errors.length > 0) process.exitCode = 1;
