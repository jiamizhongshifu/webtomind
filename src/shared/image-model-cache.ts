import { IMAGE_TOOL_MODELS } from './image-tool-models';

export const IMAGE_MODEL_CACHE = 'webtomind-image-models-v1';

export async function withImageCacheLock<T>(
  name: string,
  run: () => Promise<T>,
  signal?: AbortSignal
): Promise<T> {
  if (typeof navigator === 'undefined' || !navigator.locks) return run();
  let entered = false;
  try {
    return await navigator.locks.request(name, signal ? { signal } : {}, () => {
      entered = true;
      return run();
    });
  } catch (error) {
    if (entered || signal?.aborted) throw error;
    return run();
  }
}

export async function imageCacheDigest(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    bytes as Uint8Array<ArrayBuffer>
  );
  return Array.from(new Uint8Array(digest), (value) =>
    value.toString(16).padStart(2, '0')
  ).join('');
}

/** Only complete, digest-verified model bytes enter the persistent cache. */
export async function loadImageModel(
  url: string,
  onProgress: (percent: number, message: string) => void
): Promise<Uint8Array> {
  const model = Object.values(IMAGE_TOOL_MODELS).find(
    (asset) => asset.route === url
  );
  if (!model) throw new Error('未识别的 AI 模型版本');
  const waiting = setInterval(() => onProgress(0, '等待本地模型准备，完成后自动继续'), 15_000);
  return withImageCacheLock(`image-model:${url}`, async () => {
    clearInterval(waiting);
    let cache: Cache | undefined;
    let corrupted = false;
    try {
      cache = await caches.open(IMAGE_MODEL_CACHE);
      const cached = await cache.match(url);
      if (cached) {
        onProgress(0, '正在读取本地模型缓存');
        const bytes = new Uint8Array(await cached.arrayBuffer());
        if ((await imageCacheDigest(bytes)) === model.sha256) {
          onProgress(100, '已读取本地模型缓存');
          return bytes;
        }
        corrupted = true;
        await cache.delete(url);
      }
    } catch {
      // Private mode, quota or unavailable storage must not prevent inference.
      cache = undefined;
    }

    let response: Response | undefined;
    if (!corrupted) {
      try {
        const local = await fetch(url, {
          cache: 'only-if-cached',
          mode: 'same-origin'
        });
        if (local.ok) response = local;
      } catch {
        /* HTTP cache miss; use normal loading below. */
      }
    }
    const fromHttpCache = Boolean(response);
    response ??= await fetch(url, {
      cache: corrupted ? 'reload' : 'force-cache'
    });
    if (!response.ok || !response.body)
      throw new Error(`模型加载失败（HTTP ${response.status}）`);
    const total = Number(response.headers.get('content-length')) || 0;
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    let previous = -1;
    let readResult = await reader.read();
    while (!readResult.done) {
      const { value } = readResult;
      chunks.push(value);
      size += value.byteLength;
      const percent = total
        ? Math.min(100, Math.round((size / total) * 100))
        : 0;
      if (percent !== previous) {
        previous = percent;
        onProgress(
          percent,
          fromHttpCache
            ? '正在读取浏览器模型缓存'
            : `正在加载 AI 模型${total ? ` ${percent}%` : ''}`
        );
      }
      readResult = await reader.read();
    }
    if (total && total !== size) throw new Error('AI 模型加载不完整，请重试');
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    if ((await imageCacheDigest(bytes)) !== model.sha256)
      throw new Error('AI 模型校验失败，请重试');
    try {
      await cache?.put(
        url,
        new Response(bytes, {
          headers: {
            'Content-Type': 'application/octet-stream',
            'Content-Length': String(size)
          }
        })
      );
    } catch {
      /* Cache writes are optional, including when the disk is full. */
    }
    onProgress(100, fromHttpCache ? '已读取浏览器模型缓存' : 'AI 模型已加载');
    return bytes;
  }).finally(() => clearInterval(waiting));
}
