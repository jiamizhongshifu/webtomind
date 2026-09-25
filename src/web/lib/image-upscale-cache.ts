import type { ImageUpscaleResult } from './image-upscale';
import {
  imageCacheDigest,
  withImageCacheLock
} from '@/shared/image-model-cache';

export const UPSCALE_RESULT_CACHE = 'webtomind-upscale-results-v1';
const MAX_BYTES = 128 * 1024 * 1024;
const MAX_ITEMS = 8;
const MAX_AGE = 7 * 24 * 60 * 60 * 1000;

export async function upscaleCacheKey(
  file: Blob,
  settings: string
): Promise<string | null> {
  try {
    if (typeof caches === 'undefined') return null;
    const digest = await crypto.subtle.digest(
      'SHA-256',
      await file.arrayBuffer()
    );
    const hash = Array.from(new Uint8Array(digest), (value) =>
      value.toString(16).padStart(2, '0')
    ).join('');
    // Bump the algorithm revision whenever inference, compositing or encoding changes.
    return new URL(
      `/__image-upscale-cache__/source-tiles-v1/${hash}?settings=${encodeURIComponent(settings)}`,
      location.origin
    ).href;
  } catch {
    return null;
  }
}

export async function readUpscaleCache(
  key: string
): Promise<ImageUpscaleResult | null> {
  try {
    const cache = await caches.open(UPSCALE_RESULT_CACHE);
    const response = await cache.match(key);
    if (!response) return null;
    const created = Number(response.headers.get('X-Created-At'));
    if (!created || Date.now() - created > MAX_AGE) {
      await cache.delete(key);
      return null;
    }
    const meta = JSON.parse(
      decodeURIComponent(response.headers.get('X-Image-Result') || 'null')
    );
    const blob = await response.blob();
    if (
      !meta ||
      !blob.size ||
      blob.size !== Number(response.headers.get('Content-Length')) ||
      !meta.width ||
      !meta.height ||
      blob.type !== meta.outputFormat ||
      (await imageCacheDigest(new Uint8Array(await blob.arrayBuffer()))) !==
        response.headers.get('X-Image-SHA256')
    ) {
      await cache.delete(key);
      return null;
    }
    return {
      ...meta,
      blob,
      cacheHit: true,
      message: '已复用本地放大结果，无需重新计算。'
    };
  } catch {
    return null;
  }
}

export async function writeUpscaleCache(
  key: string,
  result: ImageUpscaleResult
): Promise<void> {
  if (!result.blob.size || result.blob.size > MAX_BYTES) return;
  try {
    await withImageCacheLock(UPSCALE_RESULT_CACHE, async () => {
      const cache = await caches.open(UPSCALE_RESULT_CACHE);
      await cache.delete(key);
      const entries = [];
      for (const request of await cache.keys()) {
        const response = await cache.match(request);
        const created = Number(response?.headers.get('X-Created-At'));
        if (!created || Date.now() - created > MAX_AGE) {
          await cache.delete(request);
          continue;
        }
        entries.push({
          request,
          bytes: Number(response?.headers.get('Content-Length')) || MAX_BYTES,
          created
        });
      }
      entries.sort((a, b) => a.created - b.created);
      let used = entries.reduce((sum, entry) => sum + entry.bytes, 0);
      while (
        entries.length >= MAX_ITEMS ||
        used + result.blob.size > MAX_BYTES
      ) {
        const oldest = entries.shift();
        if (!oldest) break;
        await cache.delete(oldest.request);
        used -= oldest.bytes;
      }
      const { blob, ...meta } = result;
      await cache.put(
        key,
        new Response(blob, {
          headers: {
            'Content-Type': result.outputFormat,
            'Content-Length': String(blob.size),
            'X-Created-At': String(Date.now()),
            'X-Image-SHA256': await imageCacheDigest(
              new Uint8Array(await blob.arrayBuffer())
            ),
            'X-Image-Result': encodeURIComponent(
              JSON.stringify({ ...meta, message: '' })
            )
          }
        })
      );
    });
  } catch {
    /* Storage failure must not turn a completed AI result into an error. */
  }
}
