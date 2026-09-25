// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { IMAGE_TOOL_MODELS } from './image-tool-models';
import { IMAGE_MODEL_CACHE, loadImageModel } from './image-model-cache';
import {
  readUpscaleCache,
  upscaleCacheKey,
  UPSCALE_RESULT_CACHE,
  writeUpscaleCache
} from '../web/lib/image-upscale-cache';
import type { ImageUpscaleResult } from '../web/lib/image-upscale';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

class MemoryCache {
  entries = new Map<string, Response>();
  key(request: string | Request) {
    return typeof request === 'string' ? request : request.url;
  }
  async match(request: string | Request) {
    return this.entries.get(this.key(request))?.clone();
  }
  async put(request: string | Request, response: Response) {
    this.entries.set(this.key(request), response.clone());
  }
  async delete(request: string | Request) {
    return this.entries.delete(this.key(request));
  }
  async keys() {
    return [...this.entries.keys()].map((url) => new Request(url));
  }
}
const model = IMAGE_TOOL_MODELS['real-esrgan-x4plus'];
const originalDigest = model.sha256;
const bytes = new TextEncoder().encode('verified model fixture');
const stores = new Map<string, MemoryCache>();
let fetchMock: ReturnType<typeof vi.fn>;
const result: ImageUpscaleResult = {
  blob: new Blob(['valid image fixture'], { type: 'image/png' }),
  width: 2048,
  height: 1152,
  target: 2048,
  outputFormat: 'image/png',
  engine: 'Real-ESRGAN · WebGPU',
  message: '完成'
};

beforeEach(() => {
  stores.clear();
  model.sha256 = createHash('sha256').update(bytes).digest('hex');
  vi.stubGlobal('location', { origin: 'https://test.example' });
  vi.stubGlobal('caches', {
    open: vi.fn(async (name: string) => {
      if (!stores.has(name)) stores.set(name, new MemoryCache());
      return stores.get(name)!;
    })
  });
  fetchMock = vi.fn(async (_url: string, options: RequestInit) =>
    options.cache === 'only-if-cached'
      ? new Response(null, { status: 504 })
      : new Response(bytes, {
          headers: { 'Content-Length': String(bytes.length) }
        })
  );
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  model.sha256 = originalDigest;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('persistent image model cache', () => {
  it('loads cold once and reads verified bytes without any fetch on the next call', async () => {
    const progress = vi.fn();
    expect(await loadImageModel(model.route, progress)).toEqual(bytes);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    fetchMock.mockClear();
    expect(await loadImageModel(model.route, progress)).toEqual(bytes);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(progress).toHaveBeenLastCalledWith(100, '已读取本地模型缓存');
    expect(
      progress.mock.calls.some(([, message]) => message.includes('下载'))
    ).toBe(false);
  });
  it('promotes HTTP cache hits and never labels them as network downloads', async () => {
    fetchMock.mockResolvedValue(new Response(bytes));
    const progress = vi.fn();
    await loadImageModel(model.route, progress);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(progress).toHaveBeenLastCalledWith(100, '已读取浏览器模型缓存');
    expect(stores.get(IMAGE_MODEL_CACHE)?.entries.size).toBe(1);
  });
  it('repairs corrupt cached bytes using a fresh fetch', async () => {
    await loadImageModel(model.route, vi.fn());
    await stores
      .get(IMAGE_MODEL_CACHE)!
      .put(model.route, new Response('corrupt'));
    fetchMock.mockClear();
    expect(await loadImageModel(model.route, vi.fn())).toEqual(bytes);
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(model.route, {
      cache: 'reload'
    });
  });
  it('never stores truncated or digest-mismatched downloads', async () => {
    fetchMock.mockImplementation(
      async () => new Response(bytes, { headers: { 'Content-Length': '999' } })
    );
    await expect(loadImageModel(model.route, vi.fn())).rejects.toThrow(
      '不完整'
    );
    expect(stores.get(IMAGE_MODEL_CACHE)!.entries.size).toBe(0);
    fetchMock.mockImplementation(async () => new Response('incorrect model'));
    await expect(loadImageModel(model.route, vi.fn())).rejects.toThrow(
      '校验失败'
    );
    expect(stores.get(IMAGE_MODEL_CACHE)!.entries.size).toBe(0);
  });
  it('continues inference preparation if cache access or writing is denied', async () => {
    vi.spyOn(caches, 'open').mockRejectedValueOnce(new Error('SecurityError'));
    expect(await loadImageModel(model.route, vi.fn())).toEqual(bytes);
    await caches.open(IMAGE_MODEL_CACHE);
    vi.spyOn(stores.get(IMAGE_MODEL_CACHE)!, 'put').mockRejectedValue(
      new Error('QuotaExceededError')
    );
    expect(await loadImageModel(model.route, vi.fn())).toEqual(bytes);
  });
});

describe('bounded image result cache', () => {
  it('uses content and all output settings, not filenames, and persists Chinese metadata', async () => {
    const settings = JSON.stringify({
      model: model.route,
      target: 2048,
      format: 'image/png'
    });
    const key = (await upscaleCacheKey(
      new File(['same bytes'], 'first.png'),
      settings
    ))!;
    expect(
      await upscaleCacheKey(new File(['same bytes'], 'renamed.png'), settings)
    ).toBe(key);
    expect(await upscaleCacheKey(new Blob(['different']), settings)).not.toBe(
      key
    );
    expect(
      await upscaleCacheKey(new Blob(['same bytes']), settings + '-4k')
    ).not.toBe(key);
    await writeUpscaleCache(key, result);
    const cached = await readUpscaleCache(key);
    expect(cached).toMatchObject({
      engine: result.engine,
      width: 2048,
      message: '已复用本地放大结果，无需重新计算。'
    });
    expect(await cached!.blob.text()).toBe(await result.blob.text());
  });
  it('evicts old entries, limits byte use, and expires cached results', async () => {
    const key = (index: number) => `https://test.example/result/${index}`;
    for (let i = 0; i < 10; i++) await writeUpscaleCache(key(i), result);
    const cache = stores.get(UPSCALE_RESULT_CACHE)!;
    expect(cache.entries.size).toBe(8);
    expect(await readUpscaleCache(key(0))).toBeNull();
    // Metadata reports real stored sizes in production; avoid allocating 128 MB in a unit test.
    for (const [url, response] of cache.entries) {
      const headers = new Headers(response.headers);
      headers.set('Content-Length', String(32 * 1024 * 1024));
      cache.entries.set(url, new Response('fixture', { headers }));
    }
    await writeUpscaleCache(key(10), result);
    expect(cache.entries.size).toBe(4);
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 8 * 24 * 60 * 60 * 1000);
    expect(await readUpscaleCache(key(10))).toBeNull();
  });
  it('treats failed writes and malformed entries as optional cache misses', async () => {
    const key = 'https://test.example/result';
    await caches.open(UPSCALE_RESULT_CACHE);
    const cache = stores.get(UPSCALE_RESULT_CACHE)!;
    await cache.put(key, new Response('broken'));
    expect(await readUpscaleCache(key)).toBeNull();
    vi.spyOn(cache, 'put').mockRejectedValue(new Error('QuotaExceededError'));
    await expect(writeUpscaleCache(key, result)).resolves.toBeUndefined();
  });
});

it('service worker activation preserves model, result, and unrelated caches', async () => {
  const listeners: Record<
    string,
    (event: { waitUntil: (promise: Promise<unknown>) => void }) => void
  > = {};
  const removed: string[] = [];
  const source = readFileSync('public/sw.js', 'utf8').replace(
    /__SW_CACHE_VERSION__/g,
    'test-new'
  );
  runInNewContext(source, {
    self: {
      addEventListener: (name: string, fn: (typeof listeners)[string]) => {
        listeners[name] = fn;
      },
      clients: { claim: vi.fn() }
    },
    caches: {
      keys: async () => [
        'webtomind-pwa-old',
        'webtomind-pwa-test-new',
        IMAGE_MODEL_CACHE,
        UPSCALE_RESULT_CACHE,
        'other-app'
      ],
      delete: async (name: string) => {
        removed.push(name);
      }
    }
  });
  let done = Promise.resolve<unknown>(null);
  listeners.activate({
    waitUntil: (promise) => {
      done = promise;
    }
  });
  await done;
  expect(removed).toEqual(['webtomind-pwa-old']);
});
