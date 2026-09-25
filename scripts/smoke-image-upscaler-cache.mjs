import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';

// Actual WebGPU inference in an isolated browser context. No paid providers.
const base = process.env.UPSCALER_CACHE_BASE_URL || 'http://127.0.0.1:4174';
const output = resolve(
  process.env.UPSCALER_CACHE_OUTPUT_DIR ||
    'output/playwright/upscaler-cache-local'
);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 }
});
const network = [];
const errors = [];
const rounds = [];
context.on('request', (request) => {
  if (request.url().includes('/models/image-tools/'))
    network.push(request.url());
});
await context.addInitScript(() => {
  window.__upscaleProbe = { workers: 0, terminated: 0, messages: [] };
  const OriginalWorker = window.Worker;
  window.Worker = class extends OriginalWorker {
    constructor(...args) {
      super(...args);
      window.__upscaleProbe.workers++;
      this.addEventListener('message', (event) =>
        window.__upscaleProbe.messages.push(event.data)
      );
    }
    terminate() {
      window.__upscaleProbe.terminated++;
      super.terminate();
    }
  };
});
// The local preview doesn't serve R2 model files; forward unchanged real bytes.
if (new URL(base).hostname === '127.0.0.1') {
  await context.route('**/models/image-tools/**', async (route) => {
    if (process.env.UPSCALER_MODEL_ASSET_DIR) {
      const filename = basename(new URL(route.request().url()).pathname);
      const body = await readFile(
        resolve(process.env.UPSCALER_MODEL_ASSET_DIR, filename)
      );
      const expectedPrefix = filename.split('.').at(-2);
      assert(
        createHash('sha256')
          .update(body)
          .digest('hex')
          .startsWith(expectedPrefix),
        'model/runtime fixture digest mismatch'
      );
      await route.fulfill({
        body,
        contentType: filename.endsWith('.wasm')
          ? 'application/wasm'
          : filename.endsWith('.mjs')
            ? 'text/javascript'
            : 'application/octet-stream'
      });
    } else {
      const response = await context.request.get(
        `https://webtomind.com${new URL(route.request().url()).pathname}`,
        { timeout: 120000 }
      );
      await route.fulfill({ response });
    }
  });
}
const page = await context.newPage();
page.on('pageerror', (error) => errors.push(error.message));
const progress = setInterval(() => {
  void page
    .locator('.image-tool-status')
    .innerText()
    .then((text) => console.log(text))
    .catch(() => {});
}, 20000);
progress.unref();
try {
  await page.goto(
    `${base}/zh-CN/tools/image-upscaler?cacheSmoke=${Date.now()}`,
    { waitUntil: 'domcontentloaded' }
  );
  await page.locator('h1').waitFor();
  assert(
    await page.evaluate(() => Boolean(navigator.gpu)),
    'WebGPU unavailable'
  );
  const photo = (
    await readFile('public/create-apps/image-upscaler.webp')
  ).toString('base64');
  const files = await page.evaluate(async (data) => {
    const bytes = Uint8Array.from(atob(data), char => char.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/webp' }));
    return Array.from({ length: 4 }, (_, index) => {
      const c = document.createElement('canvas');
      c.width = 256;
      c.height = 144;
      const x = c.getContext('2d');
      x.drawImage(bitmap, 0, 0, 256, 144);
      x.fillStyle = ['#ffd166', '#ef476f', '#06d6a0', '#118ab2'][index];
      x.fillRect(12, 12, 32, 24);
      return c.toDataURL('image/png').split(',')[1];
    });
  }, photo);
  const probe = () => page.evaluate(() => window.__upscaleProbe);
  async function upload(index) {
    const clear = page.getByRole('button', { name: '清空', exact: true });
    if (await clear.isVisible()) await clear.click();
    await page.locator('input[type=file]').setInputFiles({
      name: `cache-sample-${index}.png`,
      mimeType: 'image/png',
      buffer: Buffer.from(files[index], 'base64')
    });
    await page.locator('.image-upscale-queue-item').waitFor();
  }
  async function run(label, index, cached = false) {
    await upload(index);
    const before = await probe();
    const requestsBefore = network.filter((url) =>
      url.endsWith('.onnx')
    ).length;
    const started = Date.now();
    await page.locator('.image-tool-run-button').click();
    await page.waitForFunction(
      () =>
        document.querySelector(
          '.image-upscale-queue-copy .status.success, .image-upscale-queue-copy .status.error'
        ),
      {},
      { timeout: 240000 }
    );
    assert.equal(
      await page.locator('.image-upscale-queue-copy .status.error').count(),
      0,
      await page.locator('.image-tool-status').innerText()
    );
    const status = await page.locator('.image-tool-status').innerText();
    const after = await probe();
    const messages = after.messages
      .slice(before.messages.length)
      .map((item) => item.message)
      .filter(Boolean);
    const elapsedMs = Date.now() - started;
    const img = await page.locator('.image-tool-comparison img').nth(1).evaluate(image => ({
      width: image.naturalWidth, height: image.naturalHeight
    }));
    // Use the user-facing download path; production CSP disallows fetch(blob:).
    const downloadReady = page.waitForEvent('download');
    await page.getByRole('button', { name: '下载当前', exact: true }).click();
    const download = await downloadReady;
    assert.equal(await download.failure(), null);
    const stream = await download.createReadStream();
    assert(stream, 'result download returned no bytes');
    const digest = createHash('sha256');
    for await (const chunk of stream) digest.update(chunk);
    const hash = digest.digest('hex');
    if (cached) {
      assert(status.includes('复用本地放大结果'), status);
      assert.equal(
        after.workers,
        before.workers,
        'cache hit started a new Worker'
      );
      assert.equal(messages.length, 0, 'cache hit still ran AI inference');
    } else
      assert(
        messages.some((text) => text.includes('正在处理分块')),
        'real inference did not process tiles'
      );
    const record = {
      label,
      cached,
      elapsedMs,
      width: img.width,
      height: img.height,
      hash,
      newWorkers: after.workers - before.workers,
      modelRequests:
        network.filter((url) => url.endsWith('.onnx')).length - requestsBefore,
      messages,
      status
    };
    rounds.push(record);
    console.log(
      JSON.stringify({
        ...record,
        messages: messages.filter((text) => !text.includes('处理分块'))
      })
    );
    return record;
  }
  const cold = await run('cold-real-ai', 0);
  assert.equal(cold.width, 2048);
  const warm = await run('different-image-warm-engine', 1);
  assert.equal(warm.newWorkers, 0);
  assert.equal(warm.modelRequests, 0);
  assert(warm.messages.some((text) => text.includes('已复用 AI 引擎')));
  const duplicate = await run('same-image-cached-result', 0, true);
  assert.equal(duplicate.hash, cold.hash);
  await page.reload({ waitUntil: 'domcontentloaded' });
  const reloaded = await run('reload-cached-result', 0, true);
  assert.equal(reloaded.hash, cold.hash);
  const persisted = await run('reload-different-image-persistent-model', 2);
  assert(
    persisted.messages.some((text) => text.includes('已读取本地模型缓存'))
  );
  assert.equal(
    persisted.modelRequests,
    0,
    'persistent model cache still fetched ONNX'
  );
  await page.getByRole('button', { name: '4K · 4096 px' }).click();
  const fourK = await run('same-image-new-4k-setting', 0);
  assert.equal(fourK.width, 4096);
  assert.equal(fourK.newWorkers, 0);
  await page.getByRole('button', { name: '2K · 2048 px' }).click();
  assert.equal(
    (await run('return-to-2k-cached-result', 0, true)).hash,
    cold.hash
  );

  // A damaged persistent model must be replaced, never passed into ORT.
  await page.evaluate(async () => {
    const cache = await caches.open('webtomind-image-models-v1');
    for (const request of await cache.keys())
      if (request.url.endsWith('.onnx'))
        await cache.put(request, new Response('damaged cache fixture'));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  const repaired = await run('corrupt-model-cache-recovery', 3);
  assert(repaired.modelRequests > 0);
  assert(repaired.messages.some((text) => text.includes('AI 模型已加载')));
  await page.screenshot({
    path: resolve(output, 'desktop-real-ai.png'),
    fullPage: true
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await run('mobile-cached-result', 0, true);
  await page.screenshot({
    path: resolve(output, 'mobile-cached-result.png'),
    fullPage: true
  });
  const cacheKeys = await page.evaluate(async () => {
    const names = await caches.keys();
    return Promise.all(
      names
        .filter((name) => /image-models|upscale-results/.test(name))
        .map(async (name) => ({
          name,
          count: (await (await caches.open(name)).keys()).length
        }))
    );
  });
  assert.equal(errors.length, 0, errors.join('\n'));
  await writeFile(
    resolve(output, 'results.json'),
    JSON.stringify(
      {
        ok: true,
        base,
        actualWebGpu: true,
        sourceSize: [256, 144],
        rounds,
        cacheKeys,
        network,
        errors
      },
      null,
      2
    )
  );
} finally {
  clearInterval(progress);
  await browser.close();
}
