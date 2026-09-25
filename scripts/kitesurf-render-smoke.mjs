#!/usr/bin/env node

import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { config as loadEnv } from 'dotenv';
import { chromium } from 'playwright';
import { getCloudflareCredential } from './lib/cloudflare-credentials.mjs';
import { getRuntimeProductionEnvPath } from './lib/runtime-production-env.mjs';

const runtimeEnvFile =
  process.env.SMOKE_ENV_FILE || getRuntimeProductionEnvPath();

for (const file of ['.env.local', 'server/.env']) {
  if (existsSync(file)) {
    loadEnv({ path: file, override: false, quiet: true });
  }
}
if (runtimeEnvFile && existsSync(runtimeEnvFile)) {
  loadEnv({ path: runtimeEnvFile, override: true, quiet: true });
}

const baseUrl = (
  process.env.KITESURF_SMOKE_BASE_URL || 'https://webtomind.com'
).replace(/\/+$/, '');
const token = process.env.KITESURF_SMOKE_TOKEN || process.env.CRON_SECRET || '';
const browserRunCredential = getCloudflareCredential('browser-run', {
  required: false
});
const restToken =
  process.env.KITESURF_SMOKE_REST_TOKEN ||
  browserRunCredential.token ||
  '';
const accountId =
  process.env.CLOUDFLARE_ACCOUNT_ID ||
  browserRunCredential.accountId ||
  '';
const requestedPaths = (process.env.KITESURF_SMOKE_PATHS || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const wantScreenshots = process.env.KITESURF_SMOKE_SCREENSHOTS === '1';
const timeoutMs = Number(process.env.KITESURF_SMOKE_TIMEOUT_MS || 180000);
const runBindingPass = process.env.KITESURF_SMOKE_BINDING !== '0';
const outputDir = path.resolve(process.cwd(), 'output/kitesurf-render-smoke');

const ROUTES = [
  {
    path: '/zh-CN/create',
    // The current /zh-CN/create studio page renders .create-v2-hero*; the
    // legacy .create-home-promptbox / h1 selectors no longer exist there.
    selectors: ['title', '.create-v2-hero', '.create-v2-hero-media'],
    markers: ['create-v2-hero', 'create-v2-hero-media']
  },
  {
    path: '/zh-CN/prompts',
    selectors: ['title', 'h1', '.prompt-browser-case-card'],
    markers: ['prompt-browser-case-card']
  },
  {
    path: '/gpt-image-2-prompts',
    selectors: ['title', 'h1', '.prompt-browser-case-card', '.prompt-seo-card'],
    markers: ['prompt-browser-case-card', 'prompt-seo-card']
  },
  {
    path: '/zh-CN/pricing',
    selectors: ['title', 'h1', '.pricing-plan-grid article'],
    markers: ['pricing-plan-grid']
  }
].filter((route) => requestedPaths.length === 0 || requestedPaths.includes(route.path));

if (ROUTES.length === 0) {
  console.error('[kitesurf-smoke] No routes to check (KITESURF_SMOKE_PATHS matched nothing).');
  process.exit(1);
}

async function fetchWithRetry(target, init) {
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        return await fetch(target, { ...init, signal: controller.signal });
      } finally {
        clearTimeout(timer);
      }
    } catch (error) {
      lastError = error;
      if (attempt === 1) {
        console.warn(
          `[kitesurf-smoke] Request attempt ${attempt} failed (${error.message}); retrying once...`
        );
      }
    }
  }
  throw lastError;
}

async function runWorkerBindingPass() {
  if (!token) {
    console.error(
      '[kitesurf-smoke] Missing KITESURF_SMOKE_TOKEN or CRON_SECRET. ' +
        'The value must match the Worker secret used by /__smoke/kitesurf.'
    );
    process.exit(1);
  }

  const endpoint = new URL('/__smoke/kitesurf', baseUrl);
  for (const routePath of requestedPaths) {
    endpoint.searchParams.append('path', routePath);
  }
  if (wantScreenshots) {
    endpoint.searchParams.set('screenshot', '1');
  }

  const startedAt = Date.now();
  let response;
  try {
    response = await fetchWithRetry(endpoint, {
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/json'
      }
    });
  } catch (error) {
    console.error(`[kitesurf-smoke] Network failure reaching ${endpoint}:`);
    console.error(error.message);
    process.exit(1);
  }

  const body = await response.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    console.error(
      `[kitesurf-smoke] Expected JSON from ${endpoint}, got HTTP ${response.status}.`
    );
    process.exit(1);
  }

  console.log(
    `[kitesurf-smoke] binding pass: HTTP ${response.status}, ok=${body.ok === true}, ` +
      `engine=${body.engine}, rateLimited=${body.rateLimited === true}, ${(Date.now() - startedAt)}ms`
  );

  const allTitlesPresent = Array.isArray(body.runs)
    ? body.runs.every(
        (run) =>
          Array.isArray(run.selectors) &&
          run.selectors.length === 1 &&
          run.selectors[0].selector === 'title' &&
          run.selectors[0].matches > 0
      )
    : false;
  const allRunsQuotaDegraded = Array.isArray(body.runs)
    ? body.runs.every(
        (run) =>
          run.error === 'BROWSER_RUN_RATE_LIMITED' ||
          (Array.isArray(run.selectors) &&
            run.selectors.length === 1 &&
            run.selectors[0].selector === 'title' &&
            run.selectors[0].matches > 0)
      )
    : false;
  let pass = response.status === 200 && body.ok === true;
  if (
    !pass &&
    body.rateLimited === true &&
    (allTitlesPresent || allRunsQuotaDegraded)
  ) {
    // Quota exhaustion is an account limit, not a page regression: the route
    // still served the expected static title for every checked page.
    console.warn(
      '[kitesurf-smoke] binding pass degraded by Browser Run quota; titles verified, content checks skipped.'
    );
    pass = true;
  }
  if (body.rateLimited === true) {
    console.error(
      '[kitesurf-smoke] Browser Run hit rate limits (Workers Free plan: ~1 Quick Action per 10s, ' +
        '10 browser minutes/day). Consider upgrading to Workers Paid for unlimited Browser Run.'
    );
  }
  for (const run of Array.isArray(body.runs) ? body.runs : []) {
    const failedChecks = (run.selectors || []).filter((check) => !check.ok);
    if (run.ok) {
      console.log(
        `  PASS ${run.path} (${run.durationMs}ms, ${(run.selectors || []).length} selectors)`
      );
    } else {
      console.error(
        `  FAIL ${run.path} (${run.durationMs}ms): ${run.error || 'selector assertions failed'}`
      );
      for (const check of failedChecks) {
        console.error(`    - ${check.selector}: ${check.matches} matches`);
      }
    }
  }

  if (Array.isArray(body.screenshots) && body.screenshots.length > 0) {
    await fs.mkdir(outputDir, { recursive: true });
    for (const shot of body.screenshots) {
      const fileName = `${String(shot.path).replace(/[^a-zA-Z0-9_-]/g, '_')}.png`;
      const filePath = path.join(outputDir, fileName);
      await fs.writeFile(filePath, Buffer.from(shot.pngBase64, 'base64'));
      console.log(`  screenshot ${filePath} (${shot.bytes} bytes)`);
    }
  }
  return pass;
}

async function runKitesurfPlaygroundPass() {
  const wsEndpoint = 'wss://kitesurf.cloudflare.app/devtools/browser';
  console.log(`[kitesurf-smoke] playground pass: connecting ${wsEndpoint} (no token)`);
  const results = [];
  let browser;
  try {
    browser = await chromium.connectOverCDP(wsEndpoint);
    const context = browser.contexts()[0] || (await browser.newContext());
    const page = context.pages()[0] || (await context.newPage());
    let pageErrors = [];
    page.on('console', (message) => {
      if (message.type() === 'error') pageErrors.push(message.text().slice(0, 200));
    });
    page.on('pageerror', (error) => {
      pageErrors.push(`pageerror: ${String(error).slice(0, 200)}`);
    });
    for (const route of ROUTES) {
      const url = `${baseUrl}${route.path}`;
      const startedAt = Date.now();
      pageErrors = [];
      const entry = {
        path: route.path,
        ok: false,
        checks: [],
        durationMs: 0,
        error: null,
        consoleErrors: []
      };
      try {
        await page.goto(url, { waitUntil: 'load', timeout: 60000 });
        await page.waitForTimeout(15000);
        const sample = async () =>
          page.evaluate(
            (selectors) =>
              selectors.map((selector) => ({
                selector,
                matches: document.querySelectorAll(selector).length
              })),
            route.selectors
          );
        entry.checks = await sample();
        if (!entry.checks.every((check) => check.matches > 0)) {
          // The SPA boot is timing-sensitive under Kitesurf; sample once more
          // after an extra settle window before declaring failure.
          await page.waitForTimeout(8000);
          entry.checks = await sample();
        }
        entry.consoleErrors = [...pageErrors];
        for (const check of entry.checks) check.ok = check.matches > 0;
        entry.ok = entry.checks.every((check) => check.ok);
        if (entry.consoleErrors.length > 0) {
          console.warn(`  console errors on ${route.path}: ${entry.consoleErrors.join(' | ').slice(0, 400)}`);
        }
      } catch (error) {
        entry.error = error instanceof Error ? error.message : String(error);
      } finally {
        entry.durationMs = Date.now() - startedAt;
      }
      results.push(entry);
      console.log(
        `  ${entry.ok ? 'PASS' : 'FAIL'} ${route.path} (${entry.durationMs}ms)${entry.error ? `: ${entry.error}` : ''}`
      );
      if (!entry.ok) {
        for (const check of entry.checks.filter((check) => !check.ok)) {
          console.error(`    - ${check.selector}: ${check.matches} matches`);
        }
      }
    }
  } catch (error) {
    return { ok: false, error: `playground unavailable: ${error.message}` };
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
  return { ok: results.length > 0 && results.every((entry) => entry.ok), results };
}

async function runKitesurfRestPass() {
  if (!restToken || !accountId) {
    console.warn(
      '[kitesurf-smoke] REST pass skipped: configure a Browser Rendering - Edit token via ' +
        '`pnpm cf:credentials:set -- browser-run --stdin` (or KITESURF_SMOKE_REST_TOKEN + CLOUDFLARE_ACCOUNT_ID). ' +
        'See docs/KITESURF_SMOKE.md.'
    );
    return { ok: true, skipped: true };
  }
  // Kitesurf does not support the /scrape action ("Action scrape is not
  // supported by the kitesurf browser"), so use /content (HTML extraction)
  // and assert on markers present in the hydrated DOM.
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/browser-run/content?browser=kitesurf`;
  const results = [];
  let lastRunAt = 0;
  for (const route of ROUTES) {
    try {
      const waitMs = lastRunAt ? Math.max(0, lastRunAt + 12000 - Date.now()) : 0;
      if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
      let response;
      let payload = null;
      let html = '';
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        response = await fetchWithRetry(url, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${restToken}`,
            'content-type': 'application/json'
          },
          body: JSON.stringify({
            url: `${baseUrl}${route.path}`,
            waitForTimeout: 20000
          })
        });
        lastRunAt = Date.now();
        payload = await response.json().catch(() => null);
        html = typeof payload?.result === 'string' ? payload.result : '';
        const hasAllMarkers = route.markers.every((marker) =>
          html.includes(marker)
        );
        if (response.status === 200 && hasAllMarkers) break;
        if (attempt === 1) {
          console.warn(
            `  retrying ${route.path}: got HTTP ${response.status}, ${html.length} html bytes`
          );
          await new Promise((resolve) => setTimeout(resolve, 12000));
          lastRunAt = Date.now();
        }
      }
      const checks = route.markers.map((marker) => ({
        marker,
        found: html.includes(marker),
        htmlBytes: html.length
      }));
      for (const check of checks) check.ok = check.found;
      const ok = response.status === 200 && checks.every((check) => check.ok);
      results.push({ path: route.path, ok, checks });
      console.log(
        `  ${ok ? 'PASS' : 'FAIL'} ${route.path} (HTTP ${response.status}, ${html.length} html bytes)`
      );
      if (!ok) {
        for (const check of checks.filter((check) => !check.ok)) {
          console.error(`    - marker "${check.marker}" not found`);
        }
      }
    } catch (error) {
      results.push({ path: route.path, ok: false, error: error.message });
      console.error(`  FAIL ${route.path}: ${error.message}`);
    }
  }
  return { ok: results.every((entry) => entry.ok), results };
}

const bindingOk = runBindingPass ? await runWorkerBindingPass() : true;
if (!runBindingPass) {
  console.log('[kitesurf-smoke] binding pass skipped (KITESURF_SMOKE_BINDING=0).');
}
const playground = await runKitesurfPlaygroundPass();
if (!playground.ok) {
  console.warn(
    `[kitesurf-smoke] playground pass failed (informational): ${playground.error || 'selector assertions failed'}`
  );
}
const rest = await runKitesurfRestPass();

if (!bindingOk) {
  console.error('[kitesurf-smoke] FAILED: worker binding pass did not pass.');
  process.exit(1);
}
if (rest.skipped !== true && !rest.ok) {
  console.error('[kitesurf-smoke] FAILED: Kitesurf REST pass did not pass.');
  process.exit(1);
}
console.log('[kitesurf-smoke] PASS');
