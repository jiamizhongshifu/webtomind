#!/usr/bin/env node

// Measures LCP (with element + timing breakdown) on desktop for a URL list.
// Usage: node scripts/measure-lcp.mjs --url <url> [--url ...] [--cold]

import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

function parseArgs(argv) {
  const urls = [];
  let cold = false;
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === '--url') urls.push(argv[++i]);
    else if (argv[i] === '--cold') cold = true;
  }
  return { urls, cold };
}

const { urls, cold } = parseArgs(process.argv);
if (urls.length === 0) {
  console.error('Pass --url values');
  process.exit(1);
}

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage']
});
const context = await browser.newContext({
  viewport:
    process.env.CWV_MOBILE === '1'
      ? { width: 390, height: 844 }
      : { width: Number(process.env.CWV_WIDTH) || 1440, height: 900 },
  deviceScaleFactor: 1,
  userAgent:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36'
});
// Functional preview of the production build against public live data. This
// mode is NOT a network-performance comparison: local assets bypass the CDN.
if (process.env.CWV_LOCAL_BUILD === '1') {
  const { build } = createRequire(import.meta.resolve('vite'))('esbuild');
  const compiled = await build({
    entryPoints: ['api/seo-page-render.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false
  });
  const { injectPromptLibraryBootstrap } = await import(
    `data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].contents).toString('base64')}`
  );
  await context.route('https://webtomind.com/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (
      request.isNavigationRequest() &&
      request.resourceType() === 'document'
    ) {
      const query = new URLSearchParams({
        library: '1',
        limit: '48',
        sort: 'latest',
        v: 'prompt-library-v2',
        locale: url.pathname.startsWith('/en-US') ? 'en-US' : 'zh-CN',
        requireImage: '1'
      });
      const response = await fetch(
        `https://webtomind.com/api/content/prompt-cases?${query}`
      );
      const bootstrap = await response.json();
      const local = await fs.readFile('server/public/index.html', 'utf8');
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: injectPromptLibraryBootstrap(
          local,
          { promptLibraryBootstrap: bootstrap },
          true
        )
      });
    } else if (/^\/assets\/[a-zA-Z0-9._-]+$/.test(url.pathname)) {
      const type = url.pathname.endsWith('.js')
        ? 'application/javascript'
        : url.pathname.endsWith('.css')
          ? 'text/css'
          : undefined;
      await route.fulfill({
        path: path.join(process.cwd(), 'server/public', url.pathname),
        contentType: type
      });
    } else await route.continue();
  });
}
if (!cold) {
  await context.newPage();
  // warm cache by touching the site once
  const warm = await context.newPage();
  await warm.goto('https://webtomind.com/zh-CN/create/prompts', {
    waitUntil: 'domcontentloaded',
    timeout: 30000
  });
  await warm.close();
}

const results = [];
for (const url of urls) {
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', {
    rate: Number(process.env.CWV_CPU_RATE) || 1
  });
  await page.addInitScript(() => {
    window.__longTasks = [];
    window.__events = [];
    window.__lcp = null;
    window.__lcpCandidates = [];
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        window.__lcp = entry;
        window.__lcpCandidates.push({
          time: entry.startTime,
          size: entry.size,
          url: entry.url || '',
          tag: entry.element?.tagName || '',
          currentSrc: entry.element?.currentSrc || ''
        });
      }
    }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((list) =>
      window.__longTasks.push(
        ...list
          .getEntries()
          .map((e) => ({ start: e.startTime, duration: e.duration }))
      )
    ).observe({ type: 'longtask', buffered: true });
    new PerformanceObserver((list) =>
      window.__events.push(
        ...list
          .getEntries()
          .filter((e) => e.interactionId)
          .map((e) => ({
            name: e.name,
            duration: e.duration,
            interactionId: e.interactionId
          }))
      )
    ).observe({ type: 'event', buffered: true, durationThreshold: 16 });
  });
  const timings = {};
  // Record attempted AdSense requests, not just completed Resource Timings.
  // GTM may be remotely configured, so removing the source tag is not proof
  // that no other integration loads the advertising runtime.
  const adsenseRequests = new Set();
  page.on('request', (request) => {
    const resourceUrl = new URL(request.url());
    if (resourceUrl.hostname === 'pagead2.googlesyndication.com')
      adsenseRequests.add(resourceUrl.origin + resourceUrl.pathname);
  });
  const failures = [];
  page.on('requestfailed', (request) => {
    const url = new URL(request.url());
    failures.push({
      url: url.origin + url.pathname,
      error: request.failure()?.errorText
    });
  });
  try {
    const navigationResponse = await page.goto(url, {
      waitUntil: 'commit',
      timeout: 60000
    });
    timings.bootstrap =
      navigationResponse?.headers()['x-webtomind-prompt-bootstrap'] || null;
    await page.waitForTimeout(1500);
    await page.evaluate(() => {
      window.__cls = 0;
      window.__clsEntries = [];
      let sessionStart = 0;
      let lastShift = 0;
      let sessionValue = 0;
      const clsObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.hadRecentInput) continue;
          if (
            entry.startTime - lastShift > 1000 ||
            entry.startTime - sessionStart > 5000
          ) {
            sessionStart = entry.startTime;
            sessionValue = 0;
          }
          sessionValue += entry.value;
          lastShift = entry.startTime;
          window.__cls = Math.max(window.__cls, sessionValue);
          const sources = (entry.sources || []).map((s) => {
            const node = s.node || {};
            return {
              tag: node.tagName || '',
              id: node.id || '',
              cls: (node.className || '').toString().slice(0, 60),
              text: (node.innerText || '').slice(0, 24)
            };
          });
          window.__clsEntries.push({ value: entry.value, sources });
        }
      });
      clsObserver.observe({ type: 'layout-shift', buffered: true });
      window.__clsObserver = clsObserver;
    });
    const ttfb = await page.evaluate(
      () => performance.getEntriesByType('navigation')[0]?.responseStart || null
    );
    await page.waitForTimeout(9000);
    const lcp = await page.evaluate(() => {
      const entry = window.__lcp;
      if (!entry) return null;
      const el = entry.element
        ? {
            tag: entry.element.tagName,
            id: entry.element.id || '',
            cls: (entry.element.className || '').toString().slice(0, 80),
            src:
              entry.element.currentSrc || entry.url || entry.element.src || '',
            text: (entry.element.innerText || '').slice(0, 40)
          }
        : null;
      const url = entry.url || el?.src || '';
      const resource = url
        ? performance.getEntriesByName(url, 'resource').at(-1)
        : null;
      return {
        value: entry.startTime,
        size: entry.size,
        element: el,
        url,
        resource: resource
          ? {
              start: resource.startTime,
              end: resource.responseEnd,
              duration: resource.duration,
              initiator: resource.initiatorType
            }
          : null,
        candidates: window.__lcpCandidates
      };
    });
    const resources = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0];
      const transfers = performance.getEntriesByType('resource').map((r) => ({
        name: r.name || '',
        start: Math.round(r.startTime),
        duration: Math.round(r.duration),
        size: r.transferSize || 0,
        initiator: r.initiatorType
      }));
      transfers.sort((a, b) => b.start - a.start);
      return {
        domContentLoaded: Math.round(nav.domContentLoadedEventEnd || 0),
        load: Math.round(nav.loadEventEnd || 0),
        critical: transfers.filter((r) =>
          /PromptSeoLandingPage|content\/prompt-cases|render\/image/.test(
            r.name
          )
        ),
        jsBytes: transfers
          .filter((r) => r.name.includes('.js'))
          .reduce((sum, r) => sum + r.size, 0),
        cssBytes: transfers
          .filter((r) => r.name.includes('.css'))
          .reduce((sum, r) => sum + r.size, 0),
        imgBytes: transfers
          .filter(
            (r) =>
              ['img', 'css'].includes(r.initiator) &&
              /webp|png|jpg|jpeg/.test(r.name)
          )
          .reduce((sum, r) => sum + r.size, 0),
        slowest: transfers.sort((a, b) => b.duration - a.duration).slice(0, 4)
      };
    });
    const cls = await page.evaluate(() => ({
      score: Math.round(window.__cls * 1000) / 1000,
      entries: (window.__clsEntries || []).slice(0, 6)
    }));
    timings.lcp = lcp?.value ? Math.round(lcp.value) : null;
    timings.lcpDetail = lcp;
    timings.visibleImages = await page
      .locator('.prompt-browser-case-image-wrap img')
      .evaluateAll((images) =>
        images
          .filter((img) => {
            const rect = img.getBoundingClientRect();
            return rect.top < innerHeight && rect.bottom > 0;
          })
          .map((img) => ({
            currentSrc: img.currentSrc,
            complete: img.complete,
            naturalWidth: img.naturalWidth,
            loading: img.loading,
            fetchPriority: img.fetchPriority,
            top: Math.round(img.getBoundingClientRect().top),
            width: Math.round(img.getBoundingClientRect().width)
          }))
      );
    timings.lcpElement = lcp?.element
      ? `${lcp.element.tag}${lcp.element.id ? '#' + lcp.element.id : ''}${lcp.element.cls ? '.' + lcp.element.cls.split(' ')[0] : ''}${lcp.element.src ? ' src=' + lcp.element.src.slice(-50) : ''}`
      : null;
    timings.ttfb = ttfb ? Math.round(ttfb) : null;
    timings.dcl = resources.domContentLoaded;
    timings.load = resources.load;
    timings.jsBytes = resources.jsBytes;
    timings.cssBytes = resources.cssBytes;
    timings.imgBytes = resources.imgBytes;
    timings.slowest = resources.slowest;
    timings.critical = resources.critical;
    timings.cls = cls.score;
    timings.clsEntries = cls.entries;
    timings.failures = failures;
    timings.longTasks = await page.evaluate(() => window.__longTasks);
    const search = page.locator('#prompt-browser-search');
    if (await search.count()) {
      await page.evaluate(() => {
        window.__seoMutations = 0;
        new MutationObserver((records) => {
          window.__seoMutations += records.filter((r) =>
            [...r.addedNodes, ...r.removedNodes].some(
              (n) => n.nodeName === 'SCRIPT'
            )
          ).length;
        }).observe(document.head, { childList: true });
      });
      await search.pressSequentially('portrait photography', { delay: 50 });
      await page.waitForTimeout(500);
      timings.search = await page.evaluate(() => ({
        events: window.__events,
        seoMutations: window.__seoMutations
      }));
      await search.fill('');
    }
    timings.layout = await page.evaluate(() => ({
      width: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      cards: document.querySelectorAll('.prompt-browser-case-image-wrap').length
    }));
    timings.adsenseRequests = [...adsenseRequests];
    if (process.env.CWV_OUTPUT) {
      await fs.mkdir(path.dirname(process.env.CWV_OUTPUT), { recursive: true });
      await page.screenshot({
        path: process.env.CWV_OUTPUT.replace(/\.json$/, '.png')
      });
    }
    if (process.env.CWV_CHECK_UI === '1') {
      if (!timings.layout.cards)
        throw new Error('Library cards did not render');
      if (timings.layout.scrollWidth > timings.layout.width)
        throw new Error('Horizontal overflow');
      await page.locator('.prompt-browser-case-card').first().click();
      const dialog = page.getByRole('dialog').first();
      await dialog.waitFor({ state: 'visible', timeout: 15000 });
      await page.waitForTimeout(350); // Let the existing entrance scale animation settle.
      const close = page.getByRole('button', {
        name: /^(Close preview|关闭预览)$/
      });
      const box = await close.boundingBox();
      timings.preview = { closeWidth: box?.width, closeHeight: box?.height };
      // Spring transforms can leave a <0.05px fractional tail at rest.
      if (!box || box.width < 43.95 || box.height < 43.95)
        throw new Error('Preview close target smaller than 44px');
      if (process.env.CWV_OUTPUT)
        await page.screenshot({
          path: process.env.CWV_OUTPUT.replace(/\.json$/, '-preview.png')
        });
      await page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'hidden' });
    }
    results.push({ url, ...timings });
  } catch (error) {
    results.push({ url, ...timings, error: error.message.slice(0, 120) });
  } finally {
    await page.close().catch(() => undefined);
  }
}

console.log(JSON.stringify(results, null, 1));
if (process.env.CWV_OUTPUT) {
  await fs.mkdir(path.dirname(process.env.CWV_OUTPUT), { recursive: true });
  await fs.writeFile(process.env.CWV_OUTPUT, JSON.stringify(results, null, 2));
}
await browser.close();
