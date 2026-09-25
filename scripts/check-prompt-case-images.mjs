#!/usr/bin/env node

import { pathToFileURL } from 'node:url';

const DEFAULT_BASE_URL = 'https://webtomind.com';
const DEFAULT_LIMIT = 5;
const DEFAULT_LOCALE = 'zh-CN';
const DEFAULT_TIMEOUT_MS = 15000;

function readArgValue(name, fallback) {
  const args = process.argv.slice(2);
  const prefix = `${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);

  const index = args.indexOf(name);
  if (index >= 0 && args[index + 1]) return args[index + 1];

  return fallback;
}

function normalizeBaseUrl(value) {
  const raw = String(value || DEFAULT_BASE_URL).trim();
  if (!raw) return DEFAULT_BASE_URL;
  return raw.replace(/\/+$/, '');
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function unique(values) {
  return Array.from(new Set(values));
}

function extractStringUrlValues(value) {
  if (typeof value === 'string') return [value];
  if (!Array.isArray(value)) return [];

  return value
    .flatMap((item) => {
      if (typeof item === 'string') return [item];
      if (!item || typeof item !== 'object') return [];
      return [item.url, item.src, item.imageUrl, item.image_url];
    })
    .filter((item) => typeof item === 'string');
}

function redactedUrl(value) {
  try {
    const url = new URL(value);
    url.search = url.search ? '?<redacted>' : '';
    url.hash = '';
    return url.toString();
  } catch {
    return String(value);
  }
}

function toAbsoluteImageUrl(value, baseUrl) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return '';
  try {
    const url = new URL(raw, baseUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    return url.toString();
  } catch {
    return '';
  }
}

function getPromptCaseImageUrls(caseItem, baseUrl) {
  const values = [
    caseItem?.imageUrl,
    caseItem?.image_url,
    caseItem?.coverImageUrl,
    caseItem?.cover_image_url,
    caseItem?.thumbnailUrl,
    caseItem?.thumbnail_url,
    ...extractStringUrlValues(caseItem?.imageUrls),
    ...extractStringUrlValues(caseItem?.image_urls),
    ...extractStringUrlValues(caseItem?.images),
    ...extractStringUrlValues(caseItem?.assets)
  ];
  return unique(
    values
      .map((value) => toAbsoluteImageUrl(value, baseUrl))
      .filter(Boolean)
  );
}

function getPromptCasesFromPayload(json) {
  const candidates = [
    json,
    json?.cases,
    json?.data,
    json?.data?.cases,
    json?.data?.items,
    json?.items,
    json?.results
  ];
  return candidates.find((value) => Array.isArray(value)) || null;
}

function assert(condition, message, details) {
  if (condition) return;
  const error = new Error(message);
  if (details) error.details = details;
  throw error;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(`${options.method || 'GET'} ${url} timed out`),
    timeoutMs
  );

  try {
    return await fetch(url, {
      redirect: 'follow',
      ...options,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

async function cancelBody(response) {
  try {
    await response.body?.cancel();
  } catch {
    // Best effort. The important part is that callers never read image bodies.
  }
}

function imageProbeResult(response, method) {
  return {
    ok: response.ok || (method === 'GET' && response.status === 206),
    method,
    status: response.status,
    contentType: response.headers.get('content-type') || '',
    contentLength: response.headers.get('content-length') || ''
  };
}

function validateImageProbe(result) {
  if (!result.ok) return false;
  if (!result.contentType) return true;
  return result.contentType.toLowerCase().startsWith('image/');
}

async function probeImageUrl(url, options = {}) {
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const headers = {
    Accept: 'image/avif,image/webp,image/*,*/*;q=0.8'
  };

  let headResult = null;
  try {
    const response = await fetchWithTimeout(
      url,
      {
        method: 'HEAD',
        headers
      },
      timeoutMs
    );
    headResult = imageProbeResult(response, 'HEAD');
    await cancelBody(response);
    if (validateImageProbe(headResult)) return headResult;
  } catch (error) {
    headResult = {
      ok: false,
      method: 'HEAD',
      error: error instanceof Error ? error.message : String(error)
    };
  }

  let getResult = null;
  try {
    const response = await fetchWithTimeout(
      url,
      {
        method: 'GET',
        headers: {
          ...headers,
          Range: 'bytes=0-0'
        }
      },
      timeoutMs
    );
    getResult = imageProbeResult(response, 'GET');
    await cancelBody(response);
    if (validateImageProbe(getResult)) return getResult;
  } catch (error) {
    getResult = {
      ok: false,
      method: 'GET',
      error: error instanceof Error ? error.message : String(error)
    };
  }

  const error = new Error(`${redactedUrl(url)} is not an accessible image`);
  error.details = {
    url: redactedUrl(url),
    head: headResult,
    rangeGet: getResult
  };
  throw error;
}

async function fetchPromptCases(options) {
  const endpoint = new URL('/api/content/prompt-cases', options.baseUrl);
  endpoint.searchParams.set('locale', options.locale);
  endpoint.searchParams.set('limit', String(options.limit));
  endpoint.searchParams.set('requireImage', '1');

  const response = await fetchWithTimeout(
    endpoint.toString(),
    {
      headers: {
        Accept: 'application/json'
      }
    },
    options.timeoutMs
  );
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 500) };
  }

  assert(response.ok, 'Prompt cases API returned a non-OK response', {
    endpoint: endpoint.toString(),
    status: response.status,
    body: json
  });
  const cases = getPromptCasesFromPayload(json);
  assert(Array.isArray(cases), 'Prompt cases API returned invalid JSON', {
    endpoint: endpoint.toString(),
    bodyShape: json && typeof json === 'object' ? Object.keys(json) : typeof json,
    body: json
  });

  return {
    endpoint: endpoint.toString(),
    cases
  };
}

export async function checkPromptCaseImages(input = {}) {
  const baseUrl = normalizeBaseUrl(
    input.baseUrl ||
      process.env.PROMPT_CASE_IMAGE_BASE_URL ||
      process.env.CF_VALIDATE_BASE_URL ||
      process.env.CF_SMOKE_BASE_URL ||
      DEFAULT_BASE_URL
  );
  const limit = parsePositiveInteger(
    input.limit || process.env.PROMPT_CASE_IMAGE_LIMIT,
    DEFAULT_LIMIT
  );
  const locale = String(
    input.locale || process.env.PROMPT_CASE_IMAGE_LOCALE || DEFAULT_LOCALE
  ).trim();
  const timeoutMs = parsePositiveInteger(
    input.timeoutMs || process.env.PROMPT_CASE_IMAGE_TIMEOUT_MS,
    DEFAULT_TIMEOUT_MS
  );

  const { endpoint, cases } = await fetchPromptCases({
    baseUrl,
    limit,
    locale,
    timeoutMs
  });
  const targetCases = cases.slice(0, limit);

  assert(targetCases.length > 0, 'No public prompt cases with images found', {
    endpoint,
    limit,
    locale
  });

  const checkedCases = [];
  for (const caseItem of targetCases) {
    const imageUrls = getPromptCaseImageUrls(caseItem, baseUrl);
    assert(imageUrls.length > 0, 'Prompt case did not include an image URL', {
      id: caseItem?.id || null,
      slug: caseItem?.slug || null,
      title: caseItem?.title || null
    });

    const failures = [];
    let accessibleImage = null;
    for (const imageUrl of imageUrls) {
      try {
        const probe = await probeImageUrl(imageUrl, { timeoutMs });
        accessibleImage = {
          url: redactedUrl(imageUrl),
          ...probe
        };
        break;
      } catch (error) {
        failures.push(error.details || { error: error.message });
      }
    }

    assert(accessibleImage, 'Prompt case has no accessible image URL', {
      id: caseItem?.id || null,
      slug: caseItem?.slug || null,
      title: caseItem?.title || null,
      failures
    });

    checkedCases.push({
      id: caseItem?.id || null,
      slug: caseItem?.slug || null,
      title: caseItem?.title || null,
      imageUrlCount: imageUrls.length,
      accessibleImage
    });
  }

  return {
    baseUrl,
    endpoint,
    locale,
    requestedLimit: limit,
    fetchedCaseCount: cases.length,
    checkedCaseCount: checkedCases.length,
    accessibleImageCount: checkedCases.length,
    cases: checkedCases
  };
}

export function formatPromptCaseImageSummary(summary) {
  const caseLabels = summary.cases
    .map((caseItem) => caseItem.slug || caseItem.id || 'untitled')
    .join(', ');
  return `${summary.accessibleImageCount}/${summary.checkedCaseCount} prompt case image set(s) reachable (${caseLabels})`;
}

function isDirectRun() {
  return (
    Boolean(process.argv[1]) &&
    import.meta.url === pathToFileURL(process.argv[1]).href
  );
}

if (isDirectRun()) {
  try {
    const summary = await checkPromptCaseImages({
      baseUrl: readArgValue(
        '--base-url',
        process.env.PROMPT_CASE_IMAGE_BASE_URL ||
          process.env.CF_VALIDATE_BASE_URL ||
          process.env.CF_SMOKE_BASE_URL
      ),
      limit: readArgValue('--limit', process.env.PROMPT_CASE_IMAGE_LIMIT),
      locale: readArgValue('--locale', process.env.PROMPT_CASE_IMAGE_LOCALE),
      timeoutMs: readArgValue(
        '--timeout-ms',
        process.env.PROMPT_CASE_IMAGE_TIMEOUT_MS
      )
    });
    console.log(JSON.stringify(summary, null, 2));
  } catch (error) {
    console.error(
      JSON.stringify(
        {
          step: 'failed',
          error: error instanceof Error ? error.message : String(error),
          details: error?.details || null
        },
        null,
        2
      )
    );
    process.exit(1);
  }
}
