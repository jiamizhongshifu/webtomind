/* WebToMind service worker: network-first navigations with runtime asset cache
 * for the hashed build files, so the pindou pattern maker stays installable
 * and usable offline after a visit. */
// 构建时会把 __SW_CACHE_VERSION__ 替换为「版本号-提交号」，
// 每次部署都会生成新缓存名，旧缓存由 activate 清理，避免刷新命中过期资源。
const MODEL_CACHE_NAME = 'webtomind-image-models-v1';
const CACHE_NAME = 'webtomind-pwa-__SW_CACHE_VERSION__';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith('webtomind-pwa-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  const isModelRuntime = url.pathname.startsWith('/models/image-tools/') && /\.(wasm|mjs)$/.test(url.pathname);
  const assetCacheName = isModelRuntime ? MODEL_CACHE_NAME : CACHE_NAME;
  const isImmutableAsset =
    url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/');
  const isNavigation = event.request.mode === 'navigate';

  if (isImmutableAsset || isModelRuntime) {
    event.respondWith(
      (async () => {
        const assetCache = await caches.open(assetCacheName).catch(() => null);
        const cached = await assetCache?.match(event.request).catch(() => undefined);
        if (cached) return cached;
        const response = await fetch(event.request);
        if (response.ok && assetCache) {
          event.waitUntil(assetCache.put(event.request, response.clone()).catch(() => {}));
        }
        return response;
      })()
    );
    return;
  }

  if (isNavigation) {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(event.request);
          if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put('/index.html', response.clone());
          }
          return response;
        } catch {
          const cached = await caches.match('/index.html');
          if (cached) return cached;
          return new Response(
            '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>WebToMind 离线</title><body style="font-family:sans-serif;padding:24px"><h1>暂时离线</h1><p>联网后重新打开即可继续使用拼豆图案生成器。</p></body></html>',
            { headers: { 'Content-Type': 'text/html;charset=utf-8' } }
          );
        }
      })()
    );
  }
});
