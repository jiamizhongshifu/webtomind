import type { VercelRequest, VercelResponse } from './utils/vercel-types';
import sharp, { type Sharp } from 'sharp';
import {
  buildPromptOgCacheKey,
  PROMPT_OG_RESPONSE_CACHE_CONTROL,
  readPromptOgCache,
  writePromptOgCache
} from './prompt-og-cache.js';
import {
  getQueryParam,
  loadPromptCaseOg,
  PROMPT_OG_HEIGHT as HEIGHT,
  PROMPT_OG_IMAGE_VERSION,
  PROMPT_OG_SITE_URL as SITE_URL,
  PROMPT_OG_WIDTH as WIDTH,
  type PromptCaseOg
} from './prompt-og-worker-compat.js';

export { PROMPT_OG_CTA } from './prompt-og-worker-compat.js';

export const config = { runtime: 'nodejs', maxDuration: 10 };

const PROMPT_OG_MAX_SOURCE_BYTES = 8 * 1024 * 1024;
const PROMPT_OG_SOURCE_TIMEOUT_MS = 5_000;
const PROMPT_OG_MAX_REDIRECTS = 2;

export function isAllowedPromptOgImageUrl(imageUrl: string): boolean {
  try {
    const url = new URL(imageUrl);
    if (url.protocol !== 'https:' || url.username || url.password) return false;
    const hostname = url.hostname.toLowerCase();
    return (
      hostname === 'webtomind.com' ||
      hostname.endsWith('.webtomind.com') ||
      hostname.endsWith('.supabase.co') ||
      hostname.endsWith('.r2.dev')
    );
  } catch {
    return false;
  }
}

async function readBoundedImageBody(
  response: Response
): Promise<Buffer | null> {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.toLowerCase().startsWith('image/')) return null;
  const contentLength = Number(response.headers.get('content-length') || 0);
  if (
    Number.isFinite(contentLength) &&
    contentLength > PROMPT_OG_MAX_SOURCE_BYTES
  ) {
    return null;
  }
  if (!response.body) return null;

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > PROMPT_OG_MAX_SOURCE_BYTES) {
      await reader.cancel('Prompt OG source exceeded byte limit');
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks, totalBytes);
}

async function fetchImageBuffer(imageUrl: string): Promise<Buffer | null> {
  if (!isAllowedPromptOgImageUrl(imageUrl)) return null;
  try {
    let currentUrl = imageUrl;
    for (
      let redirectCount = 0;
      redirectCount <= PROMPT_OG_MAX_REDIRECTS;
      redirectCount += 1
    ) {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        PROMPT_OG_SOURCE_TIMEOUT_MS
      );
      const response = await fetch(currentUrl, {
        redirect: 'manual',
        signal: controller.signal
      }).finally(() => clearTimeout(timeout));
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location || redirectCount === PROMPT_OG_MAX_REDIRECTS) return null;
        const nextUrl = new URL(location, currentUrl).toString();
        if (!isAllowedPromptOgImageUrl(nextUrl)) return null;
        currentUrl = nextUrl;
        continue;
      }
      if (!response.ok) return null;
      return readBoundedImageBody(response);
    }
    return null;
  } catch (error) {
    console.warn('[PromptOg] source image fetch failed:', error);
    return null;
  }
}

function createFallbackBackground(): Sharp {
  return sharp({
    create: {
      width: WIDTH,
      height: HEIGHT,
      channels: 4,
      background: '#1f1f1f'
    }
  });
}

export function createOverlaySvg(caseItem: PromptCaseOg): Buffer {
  void caseItem;
  return Buffer.from(`
    <svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    </svg>
  `);
}

function sendPromptOgPng(
  req: VercelRequest,
  res: VercelResponse,
  imageBuffer: Buffer
): void {
  res.setHeader('Content-Length', imageBuffer.byteLength.toString());
  res.status(200).send(req.method === 'HEAD' ? '' : imageBuffer);
}

async function renderPromptOgPng(caseItem: PromptCaseOg): Promise<Buffer> {
  const imageBuffer = await fetchImageBuffer(caseItem.imageUrl);
  const base = imageBuffer
    ? sharp(imageBuffer, {
        failOn: 'error',
        limitInputPixels: 40_000_000
      }).resize(WIDTH, HEIGHT, { fit: 'cover' })
    : createFallbackBackground();

  return base
    .composite([{ input: createOverlaySvg(caseItem), top: 0, left: 0 }])
    .png({ quality: 92 })
    .toBuffer();
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.status(405).send('Method not allowed');
    return;
  }

  const slug = getQueryParam(req.query.slug).trim();
  const id = getQueryParam(req.query.id).trim();
  const localeParam = getQueryParam(req.query.locale);
  const requestedLocale = localeParam === 'en-US' ? 'en-US' : 'zh-CN';

  if (!slug && !id) {
    res.status(400).send('Missing prompt slug or id');
    return;
  }

  try {
    const loadedCaseItem = await loadPromptCaseOg(slug ? { slug } : { id });
    const cacheKey = loadedCaseItem
      ? buildPromptOgCacheKey({
          locale: requestedLocale,
          slug: slug || undefined,
          id: slug ? undefined : id,
          version: PROMPT_OG_IMAGE_VERSION
        })
      : '';

    if (cacheKey) {
      const cached = await readPromptOgCache(cacheKey);
      if (cached) {
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', PROMPT_OG_RESPONSE_CACHE_CONTROL);
        res.setHeader('X-Prompt-Og-Version', PROMPT_OG_IMAGE_VERSION);
        res.setHeader('X-Prompt-Og-Cache', 'HIT');
        res.setHeader('X-Prompt-Og-Cache-Key', cached.key);
        if (cached.publicUrl) {
          res.setHeader('X-Prompt-Og-Cache-Url', cached.publicUrl);
        }
        sendPromptOgPng(req, res, Buffer.from(cached.arrayBuffer));
        return;
      }
    }

    const caseItem =
      loadedCaseItem ||
      ({
        title:
          requestedLocale === 'en-US'
            ? 'Reusable visual prompt'
            : '可复用视觉 Prompt',
        prompt: '',
        imageUrl: `${SITE_URL}/icons/logo-icon.svg`,
        locale: requestedLocale
      } satisfies PromptCaseOg);
    const output = await renderPromptOgPng(caseItem);
    let cacheWriteStatus = cacheKey ? 'SKIPPED' : 'NO_CASE';

    if (cacheKey) {
      try {
        await writePromptOgCache(cacheKey, output);
        cacheWriteStatus = 'STORED';
      } catch (cacheError) {
        cacheWriteStatus = 'FAILED';
        console.warn('[PromptOg] cache write failed:', cacheError);
      }
    }

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', PROMPT_OG_RESPONSE_CACHE_CONTROL);
    res.setHeader('X-Prompt-Og-Version', PROMPT_OG_IMAGE_VERSION);
    res.setHeader('X-Prompt-Og-Cache', cacheKey ? 'MISS' : 'BYPASS');
    if (cacheKey) {
      res.setHeader('X-Prompt-Og-Cache-Key', cacheKey);
    }
    res.setHeader('X-Prompt-Og-Cache-Write', cacheWriteStatus);
    sendPromptOgPng(req, res, output);
  } catch (error) {
    console.error('[PromptOg] render failed:', error);
    res.status(500).send('Prompt OG image render failed');
  }
}
